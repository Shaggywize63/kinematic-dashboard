'use client';
// Live data source for HRMS: phase 1 (legal entities, locations, departments, designations, employees with their documents
// and change log) and phase 2 (payroll: salary structures, attendance, adjustments, loans, pay runs with payslips, full and
// final settlements, the overtime rule). Sample mode never touches this file's network code: db.ts only calls into it when
// the source is 'live'.
//
// How a change travels: mutate(fn) applies fn to a copy of the live database (optimistic), diffs the server-backed
// collections against the state before, and queues one API call per created / updated / deleted row. The calls run one at a
// time, in the order the server needs. A response reconciles the local row (the server's employee code, masked PAN and bank,
// change log). When a call fails, that change and the ones after it in the same batch are undone row by row and an error
// toast names the reason. Pay runs are different: they change only through commands (live/payrollCommands.ts) whose answer
// replaces the run held here. Everything that is not on the server yet (shifts, leave, letters ...) is plain local state,
// kept in its own storage key so it survives a reload.
//
// Personal data and pay from the server are held in memory only. They are never written to browser storage.

import { toast } from 'sonner';
import { useSyncExternalStore } from 'react';
import type { Employee, HrmsDb } from '../types';
import { SEED_VERSION, makeSeed } from '../seed';
import { HrmsApiError, hrmsApi } from './client';
import {
  diffServer, LIFECYCLE_KINDS, LIFECYCLE_RECORD_KINDS, PAYROLL_KINDS, PRIVACY_KINDS, PRIVACY_RECORD_KINDS, RUN_INPUT_KINDS, TIME_KINDS, TIME_RECORD_KINDS, VERB_TEXT,
  type LifecycleCollections, type PayrollCollections, type PeopleCollections, type PrivacyCollections, type SyncOp, type TimeCollections,
} from './diff';
import {
  documentFromWire, employeeFromWire, entityFromWire, departmentFromWire, designationFromWire, locationFromWire, str, UUID_RE, type ImportOutcome, type Row, type ServerData,
} from './wire';
import {
  adjustmentFromWire, attendanceFromWire, fnfFromWire, loanFromWire, overtimeFromWire, structureFromWire, type PayrollData,
} from './payrollWire';
import {
  holidayListFromWire, leaveBalanceFromWire, leaveTypeFromWire, rosterFromWire, shiftFromWire, type TimeData,
} from './timeWire';
import {
  exitFromWire, issuedLetterFromWire, letterTemplateFromWire, onboardingFromWire, type LifecycleData,
} from './lifecycleWire';
import {
  complianceFromWire, consentFromWire, retentionFromWire, type PrivacyData,
} from './privacyWire';
import type { AccessLogEntry } from '../types';

export type Source = 'sample' | 'live';
export type Phase = 'idle' | 'loading' | 'ready' | 'not_ready' | 'error';

/** Payroll loads next to the people data but can fail on its own (its tables may not be set up yet): people pages keep working. */
export type PayrollPhase = 'idle' | 'ok' | 'not_ready' | 'error';
/** Time and leave loads next to the people data and can fail on its own too (its tables may not be set up yet). */
export type TimePhase = 'idle' | 'ok' | 'not_ready' | 'error';
/** Lifecycle and letters loads next to the people data and can fail on its own too (its tables may not be set up yet). */
export type LifecyclePhase = 'idle' | 'ok' | 'not_ready' | 'error';
/** Privacy and DPDP loads next to the people data and can fail on its own too (its tables may not be set up yet). */
export type PrivacyPhase = 'idle' | 'ok' | 'not_ready' | 'error';

export interface LiveStatus {
  source: Source;
  phase: Phase;
  /** A refresh is running while the page stays on screen. */
  refreshing: boolean;
  /** Changes are still on their way to the server. */
  syncing: boolean;
  /** Why the phase is `error` or `not_ready`. */
  message: string;
  payrollPhase: PayrollPhase;
  /** Why the payroll phase is `error` or `not_ready`. */
  payrollMessage: string;
  timePhase: TimePhase;
  /** Why the time phase is `error` or `not_ready`. */
  timeMessage: string;
  lifecyclePhase: LifecyclePhase;
  /** Why the lifecycle phase is `error` or `not_ready`. */
  lifecycleMessage: string;
  privacyPhase: PrivacyPhase;
  /** Why the privacy phase is `error` or `not_ready`. */
  privacyMessage: string;
  /** Goes up whenever saved changes could alter what a run's checks or compute see, and after every load: the server checks are asked again. */
  inputsVersion: number;
}

export const SOURCE_KEY = 'kinematic_hrms_source';
export const LOCAL_KEY = 'kinematic_hrms_live_local_v1';
/** Shown as the employee code until the server has assigned the real one. */
export const PENDING_CODE = '…';

// ───────────────────────────── status and subscriptions ─────────────────────────────
let status: LiveStatus = { source: 'sample', phase: 'idle', refreshing: false, syncing: false, message: '', payrollPhase: 'idle', payrollMessage: '', timePhase: 'idle', timeMessage: '', lifecyclePhase: 'idle', lifecycleMessage: '', privacyPhase: 'idle', privacyMessage: '', inputsVersion: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function setStatus(patch: Partial<LiveStatus>): void {
  status = { ...status, ...patch };
  emit();
}

export const getStatus = (): LiveStatus => status;
export const isLive = (): boolean => status.source === 'live';
export const isLiveReady = (): boolean => status.source === 'live' && status.phase === 'ready';
export function subscribeLive(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(subscribeLive, getStatus, getStatus);
}

// ───────────────────────────── ids ─────────────────────────────
export function randomUuid(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c) c.getRandomValues(b); else b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256); });
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ───────────────────────────── the live database ─────────────────────────────
const PEOPLE_KEYS = ['entities', 'locations', 'departments', 'designations', 'employees'] as const;
/** On the server since phase 2. Held in memory only: never written to browser storage. */
const PAYROLL_KEYS = ['structures', 'attendance', 'adjustments', 'loans', 'payRuns', 'fnfCases', 'overtimeRules'] as const;
/** On the server since phase 3. Held in memory only: never written to browser storage. */
const TIME_KEYS = ['shifts', 'roster', 'leaveTypes', 'holidayLists', 'leaveBalances'] as const;
/** On the server since phase 4 (lifecycle and letters). Held in memory only: never written to browser storage. */
const LIFECYCLE_KEYS = ['onboarding', 'exits', 'letterTemplates', 'letters'] as const;
/** On the server since phase 5 (privacy and DPDP). Held in memory only: never written to browser storage. */
const PRIVACY_KEYS = ['compliance', 'consents', 'retention'] as const;
/** Transactional data that is not on the server yet: starts empty, kept in this browser only. The access log is read from the
 * server endpoint in live mode (AccessTab) and this local copy stays empty, so no sensitive access data reaches storage. */
const TRANSACTIONAL_KEYS = ['accessLog'] as const;
const LOCAL_KEYS = [...TRANSACTIONAL_KEYS] as const;
type LocalParts = Pick<HrmsDb, (typeof LOCAL_KEYS)[number]>;

const pickLocal = (db: HrmsDb): LocalParts => Object.fromEntries(LOCAL_KEYS.map((k) => [k, db[k]])) as unknown as LocalParts;
const pickPeople = (db: ServerData | HrmsDb): PeopleCollections =>
  Object.fromEntries(PEOPLE_KEYS.map((k) => [k, db[k]])) as unknown as PeopleCollections;
const pickPayroll = (db: HrmsDb): PayrollCollections =>
  Object.fromEntries(PAYROLL_KEYS.map((k) => [k, db[k]])) as unknown as PayrollCollections;
const pickTime = (db: HrmsDb): TimeCollections =>
  Object.fromEntries(TIME_KEYS.map((k) => [k, db[k]])) as unknown as TimeCollections;
const pickLifecycle = (db: HrmsDb): LifecycleCollections =>
  Object.fromEntries(LIFECYCLE_KEYS.map((k) => [k, db[k]])) as unknown as LifecycleCollections;
const pickPrivacy = (db: HrmsDb): PrivacyCollections =>
  Object.fromEntries(PRIVACY_KEYS.map((k) => [k, db[k]])) as unknown as PrivacyCollections;

function freshLocal(): LocalParts {
  return Object.fromEntries(TRANSACTIONAL_KEYS.map((k) => [k, []])) as unknown as LocalParts;
}

/** No payroll yet: nothing recorded, and the sample overtime rule so a page that reads "the rule" always finds one until the server's arrives. */
function emptyPayroll(): PayrollCollections {
  return { structures: [], attendance: [], adjustments: [], loans: [], payRuns: [], fnfCases: [], overtimeRules: makeSeed().overtimeRules };
}

/** No time and leave yet: a brand-new org starts with no shifts, roster, leave types, holiday lists or balances (the empty state offers "Add the standard set"). */
function emptyTime(): TimeCollections {
  return { shifts: [], roster: [], leaveTypes: [], holidayLists: [], leaveBalances: [] };
}

/** No lifecycle or letters yet: a brand-new org starts with no onboarding cases, exits, templates or issued letters (the empty state offers "Add the standard letter templates"). */
function emptyLifecycle(): LifecycleCollections {
  return { onboarding: [], exits: [], letterTemplates: [], letters: [] };
}

/** No privacy records yet: a brand-new org starts with no compliance tasks, consents or retention rules (the empty states offer "Add the standard compliance calendar" / "Add the standard retention rules"). */
function emptyPrivacy(): PrivacyCollections {
  return { compliance: [], consents: [], retention: [] };
}

function readLocal(): LocalParts {
  const base = freshLocal();
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as { seedVersion?: number; local?: Record<string, unknown> };
      if (parsed?.seedVersion === SEED_VERSION && parsed.local) {
        // Only the keys that are still kept here are read back, so a key missing from an older copy falls back to the default
        // and payroll an earlier build saved in this browser can never override what the server says.
        const out = { ...base } as Record<string, unknown>;
        for (const k of LOCAL_KEYS) if (Array.isArray(parsed.local[k])) out[k] = parsed.local[k];
        // That earlier copy held pay run data. Rewrite the stored copy without it.
        if (Object.keys(parsed.local).some((k) => !(LOCAL_KEYS as readonly string[]).includes(k))) persistLocalParts(out as unknown as LocalParts);
        return out as unknown as LocalParts;
      }
    }
  } catch { /* corrupt or blocked: start from the defaults */ }
  return base;
}

function persistLocalParts(parts: LocalParts): void {
  try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ seedVersion: SEED_VERSION, local: parts })); } catch { /* full or blocked: memory still works */ }
}
function persistLocal(db: HrmsDb): void { persistLocalParts(pickLocal(db)); }

/** The company name has no home on the server yet: use the first legal entity's name so live mode never shows the sample company. */
const companyOf = (entities: HrmsDb['entities']): HrmsDb['company'] => ({ name: entities[0]?.name ?? 'Your company', currency: 'INR', fyStartMonth: 4 });

function build(people: PeopleCollections, payroll: PayrollCollections, time: TimeCollections, lifecycle: LifecycleCollections, privacy: PrivacyCollections, local: LocalParts): HrmsDb {
  return { version: SEED_VERSION, company: companyOf(people.entities), ...local, ...time, ...lifecycle, ...privacy, ...people, ...payroll } as HrmsDb;
}

const EMPTY_PEOPLE: PeopleCollections = { entities: [], locations: [], departments: [], designations: [], employees: [] };
let liveDb: HrmsDb | null = null;

/** The live database. Before the first load it is empty (the layout shows a loading state instead of the pages). */
export function getLiveDb(): HrmsDb {
  if (!liveDb) liveDb = build(EMPTY_PEOPLE, emptyPayroll(), emptyTime(), emptyLifecycle(), emptyPrivacy(), readLocal());
  return liveDb;
}

function commit(next: HrmsDb): void {
  liveDb = next;
  persistLocal(next);
  emit();
}

/** Change the live database without diffing it: used for server answers (reconcile) and rollbacks. */
export function patchLive(fn: (db: HrmsDb) => void): void {
  const next = structuredClone(getLiveDb());
  fn(next);
  commit(next);
}

// ───────────────────────────── the write queue ─────────────────────────────
let tail: Promise<unknown> = Promise.resolve();
const inflight = new Set<Promise<boolean>>();
/** How many queued calls still target a row. A server answer replaces the whole local row only when no later call is waiting on it. */
const rowPending = new Map<string, number>();
const rowKey = (op: SyncOp): string => (op.kind === 'document' ? `employees:${op.employeeId}` : `${op.collection}:${op.rowId}`);
const hold = (op: SyncOp) => rowPending.set(rowKey(op), (rowPending.get(rowKey(op)) ?? 0) + 1);
const release = (op: SyncOp) => {
  const n = (rowPending.get(rowKey(op)) ?? 1) - 1;
  if (n <= 0) rowPending.delete(rowKey(op)); else rowPending.set(rowKey(op), n);
};

const asError = (e: unknown): HrmsApiError => (e instanceof HrmsApiError ? e : new HrmsApiError(e instanceof Error && e.message ? e.message : 'Request failed', 0));

/** The payroll resource each simple payroll record is saved under. */
const PAYROLL_RESOURCE = { structure: 'structures', adjustment: 'adjustments', loan: 'loans', fnf: 'fnf' } as const;
/** The time resource each simple time-and-leave record is saved under. */
const TIME_RESOURCE = { shift: 'shifts', leaveType: 'leave-types', holidayList: 'holiday-lists' } as const;
/** The lifecycle resource each simple lifecycle-and-letters record is saved under. */
const LIFECYCLE_RESOURCE = { onboarding: 'onboarding', exit: 'exits', letterTemplate: 'letter-templates', letter: 'letters' } as const;
/** The privacy resource each simple privacy-and-DPDP record is saved under. */
const PRIVACY_RESOURCE = { compliance: 'compliance', consent: 'consents', retention: 'retention' } as const;

async function execute(op: SyncOp): Promise<Row> {
  const body = op.body ?? {};
  if (op.kind === 'document') {
    const emp = op.employeeId!;
    if (op.verb === 'create') return hrmsApi.addDocument(emp, body);
    if (op.verb === 'update') return hrmsApi.updateDocument(emp, op.rowId, body);
    return hrmsApi.removeDocument(emp, op.rowId);
  }
  if (op.kind === 'attendance') return hrmsApi.payroll.putAttendance(op.employeeId!, op.month!, body);
  if (op.kind === 'settings') return hrmsApi.payroll.putSettings(body);
  if (op.kind === 'structure' || op.kind === 'adjustment' || op.kind === 'loan' || op.kind === 'fnf') {
    const kind = PAYROLL_RESOURCE[op.kind];
    if (op.verb === 'create') return hrmsApi.payroll.create(kind, body);
    if (op.verb === 'update') return hrmsApi.payroll.update(kind, op.rowId, body);
    return hrmsApi.payroll.remove(kind, op.rowId);
  }
  if (op.kind === 'shift' || op.kind === 'leaveType' || op.kind === 'holidayList') {
    const kind = TIME_RESOURCE[op.kind];
    if (op.verb === 'create') return hrmsApi.time.create(kind, body);
    if (op.verb === 'update') return hrmsApi.time.update(kind, op.rowId, body);
    return hrmsApi.time.remove(kind, op.rowId);
  }
  if (op.kind === 'roster') return hrmsApi.time.putRoster(op.employeeId!, op.weekStart!, body);
  if (op.kind === 'leaveBalance') return hrmsApi.time.putBalance(op.employeeId!, op.leaveTypeId!, body);
  if (op.kind === 'onboarding' || op.kind === 'exit' || op.kind === 'letterTemplate' || op.kind === 'letter') {
    const kind = LIFECYCLE_RESOURCE[op.kind];
    if (op.verb === 'create') return hrmsApi.lifecycle.create(kind, body);
    if (op.verb === 'update') return hrmsApi.lifecycle.update(kind, op.rowId, body);
    return hrmsApi.lifecycle.remove(kind, op.rowId);
  }
  if (op.kind === 'compliance' || op.kind === 'consent' || op.kind === 'retention') {
    const kind = PRIVACY_RESOURCE[op.kind];
    if (op.verb === 'create') return hrmsApi.privacy.create(kind, body);
    if (op.verb === 'update') return hrmsApi.privacy.update(kind, op.rowId, body);
    return hrmsApi.privacy.remove(kind, op.rowId);
  }
  const collection = op.collection as 'entities' | 'locations' | 'departments' | 'designations' | 'employees';
  if (op.verb === 'create') return hrmsApi.create(collection, body);
  if (op.verb === 'update') return hrmsApi.update(collection, op.rowId, body);
  return hrmsApi.remove(collection, op.rowId);
}

const FROM_WIRE = {
  entity: entityFromWire, location: locationFromWire, department: departmentFromWire, designation: designationFromWire,
  structure: structureFromWire, adjustment: adjustmentFromWire, loan: loanFromWire, fnf: fnfFromWire,
  shift: shiftFromWire, leaveType: leaveTypeFromWire, holidayList: holidayListFromWire,
  onboarding: onboardingFromWire, exit: exitFromWire, letterTemplate: letterTemplateFromWire, letter: issuedLetterFromWire,
  compliance: complianceFromWire, consent: consentFromWire, retention: retentionFromWire,
} as const;

/** Put the server's version of a row into local state, without triggering another sync. */
function reconcile(op: SyncOp, data: Row): void {
  if (op.verb === 'delete' || !data) return;
  const alone = (rowPending.get(rowKey(op)) ?? 0) <= 1;
  patchLive((db) => {
    if (op.kind === 'document') {
      const e = db.employees.find((x) => x.id === op.employeeId);
      const i = e ? e.documents.findIndex((d) => d.id === op.rowId) : -1;
      if (e && i >= 0 && alone) e.documents[i] = documentFromWire(data);
      return;
    }
    if (op.kind === 'employee') {
      const i = db.employees.findIndex((x) => x.id === op.rowId);
      if (i < 0) return;
      const fresh = employeeFromWire(data);
      // Another change to this person is still waiting: take only what only the server knows (the code and the change log).
      db.employees[i] = alone ? fresh : { ...db.employees[i]!, code: fresh.code, history: fresh.history };
      return;
    }
    if (op.kind === 'attendance') {
      // The server's row has no id of its own that the dashboard keeps; it is found by employee and month. A malformed answer is ignored.
      if (!str(data.employee_id) || !alone) return;
      const i = db.attendance.findIndex((a) => a.employeeId === op.employeeId && a.month === op.month);
      if (i >= 0) db.attendance[i] = attendanceFromWire(data);
      return;
    }
    if (op.kind === 'settings') {
      const rule = overtimeFromWire(data.overtime_rule) ?? overtimeFromWire((data.payroll as Row | undefined)?.overtime_rule) ?? overtimeFromWire((data.value as Row | undefined)?.overtime_rule);
      if (rule && alone) db.overtimeRules = [rule];
      return;
    }
    if (op.kind === 'roster') {
      // The server's roster row is found by employee and week; the dashboard's row keeps no id. A malformed answer is ignored.
      if (!str(data.employee_id) || !alone) return;
      const i = db.roster.findIndex((r) => r.employeeId === op.employeeId && r.weekStart === op.weekStart);
      if (i >= 0) db.roster[i] = rosterFromWire(data);
      return;
    }
    if (op.kind === 'leaveBalance') {
      // Found by employee and leave type; the dashboard's balance keeps no id of its own.
      if (!str(data.employee_id) || !alone) return;
      const i = db.leaveBalances.findIndex((b) => b.employeeId === op.employeeId && b.leaveTypeId === op.leaveTypeId);
      if (i >= 0) db.leaveBalances[i] = leaveBalanceFromWire(data);
      return;
    }
    // Payroll, time, lifecycle and privacy records are replaced by the server's row only when it really is one (an answer without an id is left alone).
    if ((PAYROLL_KINDS.has(op.kind) || TIME_RECORD_KINDS.has(op.kind) || LIFECYCLE_RECORD_KINDS.has(op.kind) || PRIVACY_RECORD_KINDS.has(op.kind)) && !str(data.id)) return;
    const list = db[op.collection] as Array<{ id: string }>;
    const i = list.findIndex((x) => x.id === op.rowId);
    if (i >= 0 && alone) list[i] = FROM_WIRE[op.kind as keyof typeof FROM_WIRE](data);
  });
}

function setKey(row: object, key: string, value: unknown): void {
  const r = row as Record<string, unknown>;
  if (value === undefined) delete r[key]; else r[key] = structuredClone(value);
}

function undo(db: HrmsDb, op: SyncOp): void {
  const dropHistory = (e: Employee | undefined) => { if (e && op.addedHistory.length) e.history = e.history.filter((h) => !op.addedHistory.includes(h.id)); };
  if (op.kind === 'document') {
    const e = db.employees.find((x) => x.id === op.employeeId);
    if (!e) return;
    const i = e.documents.findIndex((d) => d.id === op.rowId);
    if (op.verb === 'create') { if (i >= 0) e.documents.splice(i, 1); }
    else if (op.verb === 'update') { if (i >= 0) for (const k of op.keys) setKey(e.documents[i]!, k, (op.prev as Row)[k]); }
    else if (i < 0) e.documents.splice(Math.min(op.prevIndex ?? e.documents.length, e.documents.length), 0, structuredClone(op.prev) as Employee['documents'][number]);
    dropHistory(e);
    return;
  }
  if (op.kind === 'attendance') {
    const at = db.attendance.findIndex((a) => a.employeeId === op.employeeId && a.month === op.month);
    if (op.verb === 'create') { if (at >= 0) db.attendance.splice(at, 1); }
    else if (at >= 0) for (const k of op.keys) setKey(db.attendance[at]!, k, (op.prev as Row)[k]);
    return;
  }
  if (op.kind === 'settings') {
    db.overtimeRules = op.prev ? [structuredClone(op.prev) as HrmsDb['overtimeRules'][number]] : [];
    return;
  }
  if (op.kind === 'roster') {
    const i = db.roster.findIndex((r) => r.employeeId === op.employeeId && r.weekStart === op.weekStart);
    if (op.verb === 'create') { if (i >= 0) db.roster.splice(i, 1); }
    else if (i >= 0) for (const k of op.keys) setKey(db.roster[i]!, k, (op.prev as Row)[k]);
    return;
  }
  if (op.kind === 'leaveBalance') {
    const i = db.leaveBalances.findIndex((b) => b.employeeId === op.employeeId && b.leaveTypeId === op.leaveTypeId);
    if (op.verb === 'create') { if (i >= 0) db.leaveBalances.splice(i, 1); }
    else if (i >= 0) for (const k of op.keys) setKey(db.leaveBalances[i]!, k, (op.prev as Row)[k]);
    return;
  }
  const list = db[op.collection] as Array<{ id: string }>;
  const i = list.findIndex((x) => x.id === op.rowId);
  if (op.verb === 'create') {
    if (i >= 0) list.splice(i, 1);
    // The person never existed on the server: a joining case made for them in the same action would point at nobody.
    if (op.kind === 'employee') db.onboarding = db.onboarding.filter((c) => c.employeeId !== op.rowId);
  } else if (op.verb === 'update') {
    if (i < 0) return;
    for (const k of op.keys) setKey(list[i]!, k, (op.prev as Row)[k]);
    if (op.kind === 'employee') dropHistory(list[i] as Employee);
  } else if (i < 0) {
    list.splice(Math.min(op.prevIndex ?? list.length, list.length), 0, structuredClone(op.prev) as { id: string });
  }
}

function rollback(ops: SyncOp[]): void {
  patchLive((db) => { for (const op of [...ops].reverse()) undo(db, op); });
}

/** Set when a batch has touched something a run is computed from; acted on once the queue is empty. */
let inputsDirty = false;

async function runBatch(ops: SyncOp[]): Promise<boolean> {
  if (ops.some((o) => RUN_INPUT_KINDS.has(o.kind))) inputsDirty = true;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    try {
      const data = await execute(op);
      reconcile(op, data);
      release(op);
    } catch (e) {
      const err = asError(e);
      const rest = ops.slice(i);
      rollback(rest);
      rest.forEach(release);
      toast.error(`Could not ${VERB_TEXT[op.verb]} ${op.label}: ${err.message}`);
      return false;
    }
  }
  return true;
}

function enqueue(ops: SyncOp[]): void {
  ops.forEach(hold);
  const done = tail.then(() => runBatch(ops));
  tail = done;
  inflight.add(done);
  setStatus({ syncing: true });
  void done.then(() => {
    inflight.delete(done);
    if (inflight.size) return;
    if (inputsDirty) {
      // The inputs of a computed run may have moved: ask the server again whether it is stale, and let the checks reload.
      inputsDirty = false;
      setStatus({ syncing: false, inputsVersion: status.inputsVersion + 1 });
      void refreshRunFlags();
    } else setStatus({ syncing: false });
  });
}

/** Bumped by every command that replaces a run, so a flag refresh that started before it is not applied over the newer answer. */
let runEpoch = 0;
export const noteRunChanged = (): void => { runEpoch++; };

/** The server decides whether a computed run is stale. After inputs change, fetch the runs' flags (no payslips) and copy them onto the runs held here. */
async function refreshRunFlags(): Promise<void> {
  if (!isLiveReady() || status.payrollPhase !== 'ok') return;
  if (!getLiveDb().payRuns.some((r) => r.status === 'computed')) return;
  const epoch = runEpoch;
  try {
    const flags = await hrmsApi.payroll.runFlags();
    if (epoch !== runEpoch || inflight.size) return;
    patchLive((db) => {
      for (const f of flags) {
        const run = db.payRuns.find((r) => r.id === f.id);
        if (run && run.status === f.status) run.stale = f.stale;
      }
    });
  } catch { /* the flag stays as it was; the next compute or refresh corrects it */ }
}

/** Resolves once every change made so far has reached the server (or failed and been undone). */
export async function settle(): Promise<boolean> {
  let ok = true;
  while (inflight.size) ok = (await Promise.all([...inflight])).every(Boolean) && ok;
  return ok;
}

/**
 * Run `cb` when the changes made so far are on the server: `ok` is false if any of them failed (and was undone).
 * In sample mode, or when nothing is waiting, it runs at once, synchronously.
 */
export function whenSynced(cb: (ok: boolean) => void): void {
  if (!isLive() || !inflight.size) { cb(true); return; }
  void Promise.all([...inflight]).then((r) => cb(r.every(Boolean)));
}

// ───────────────────────────── mutate ─────────────────────────────
/** Records the server takes a client-made id for. A new one that does not have a UUID (an older helper such as addComplianceTask
 * made it with `uid`) gets one before it is diffed. None of the privacy collections are referenced by another row, so a fresh id is safe. */
const NEW_ID_KEYS = ['structures', 'adjustments', 'loans', 'fnfCases', 'compliance', 'consents', 'retention'] as const;
function giveNewRowsUuids(prev: HrmsDb, next: HrmsDb): void {
  for (const key of NEW_ID_KEYS) {
    const had = new Set((prev[key] as Array<{ id: string }>).map((r) => r.id));
    for (const row of next[key] as Array<{ id: string }>) {
      if (had.has(row.id) || UUID_RE.test(row.id)) continue;
      const old = row.id;
      row.id = randomUuid();
      if (key === 'structures') for (const e of next.employees) if (e.structureId === old) e.structureId = row.id;
    }
  }
}

/** Apply a change optimistically and queue the API calls that make the server match. Returns false when the change was refused. */
export function liveMutate(fn: (db: HrmsDb) => void): boolean {
  const prev = getLiveDb();
  const next = structuredClone(prev);
  fn(next);
  giveNewRowsUuids(prev, next);
  const ops = diffServer(prev, next);
  if (ops.length && status.phase !== 'ready') {
    toast.error('The HRMS data has not loaded from the server, so this change was not made.');
    return false;
  }
  if (ops.some((o) => PAYROLL_KINDS.has(o.kind)) && status.payrollPhase !== 'ok') {
    toast.error(`Payroll has not loaded from the server, so this change was not made.${status.payrollMessage ? ` ${status.payrollMessage}.` : ''}`);
    return false;
  }
  if (ops.some((o) => TIME_KINDS.has(o.kind)) && status.timePhase !== 'ok') {
    toast.error(`Time and leave has not loaded from the server, so this change was not made.${status.timeMessage ? ` ${status.timeMessage}.` : ''}`);
    return false;
  }
  if (ops.some((o) => LIFECYCLE_KINDS.has(o.kind)) && status.lifecyclePhase !== 'ok') {
    toast.error(`Lifecycle has not loaded from the server, so this change was not made.${status.lifecycleMessage ? ` ${status.lifecycleMessage}.` : ''}`);
    return false;
  }
  if (ops.some((o) => PRIVACY_KINDS.has(o.kind)) && status.privacyPhase !== 'ok') {
    toast.error(`Privacy has not loaded from the server, so this change was not made.${status.privacyMessage ? ` ${status.privacyMessage}.` : ''}`);
    return false;
  }
  const had = new Set(prev.employees.map((e) => e.id));
  for (const e of next.employees) if (!had.has(e.id)) e.code = PENDING_CODE;
  next.company = companyOf(next.entities);
  commit(next);
  if (ops.length) enqueue(ops);
  return true;
}

// ───────────────────────────── load, refresh, switch ─────────────────────────────
let hydrateSeq = 0;

/**
 * People and payroll are read together. People failing fails the load (as in phase 1). Payroll failing on its own does not: it
 * is reported as the payroll phase, so the people pages keep working while the payroll pages say what is wrong.
 */
async function loadAll(): Promise<{
  people: ServerData;
  payroll: PayrollData | null; payrollError: HrmsApiError | null;
  time: TimeData | null; timeError: HrmsApiError | null;
  lifecycle: LifecycleData | null; lifecycleError: HrmsApiError | null;
  privacy: PrivacyData | null; privacyError: HrmsApiError | null;
}> {
  const [people, payroll, time, lifecycle, privacy] = await Promise.allSettled([hrmsApi.bootstrap(), hrmsApi.payroll.bootstrap(), hrmsApi.time.bootstrap(), hrmsApi.lifecycle.bootstrap(), hrmsApi.privacy.bootstrap()]);
  if (people.status === 'rejected') throw people.reason;
  return {
    people: people.value,
    payroll: payroll.status === 'fulfilled' ? payroll.value : null,
    payrollError: payroll.status === 'fulfilled' ? null : asError(payroll.reason),
    time: time.status === 'fulfilled' ? time.value : null,
    timeError: time.status === 'fulfilled' ? null : asError(time.reason),
    lifecycle: lifecycle.status === 'fulfilled' ? lifecycle.value : null,
    lifecycleError: lifecycle.status === 'fulfilled' ? null : asError(lifecycle.reason),
    privacy: privacy.status === 'fulfilled' ? privacy.value : null,
    privacyError: privacy.status === 'fulfilled' ? null : asError(privacy.reason),
  };
}

/** Fetch everything from /bootstrap and /payroll/bootstrap. From `ready` this is a quiet refresh (the page stays); otherwise the layout shows the loading state. */
export async function hydrate(): Promise<void> {
  const seq = ++hydrateSeq;
  const refreshing = status.phase === 'ready';
  setStatus(refreshing ? { refreshing: true } : { phase: 'loading', message: '', refreshing: false });
  try {
    // Read only when no change is on its way: an answer from before a write would put the old rows back. A change made while
    // the read was running sends us round again (a few times at most; after that the next refresh catches up).
    let got = await settle().then(loadAll);
    for (let again = 0; again < 3 && inflight.size && seq === hydrateSeq; again++) got = await settle().then(loadAll);
    if (seq !== hydrateSeq) return;
    const held = getLiveDb();
    // A payroll read that failed on a quiet refresh keeps the payroll already held; on a first load there is none to keep.
    const keepHeld = !got.payroll && refreshing && status.payrollPhase === 'ok';
    const payroll: PayrollCollections = got.payroll
      ? {
        structures: got.payroll.structures, attendance: got.payroll.attendance, adjustments: got.payroll.adjustments, loans: got.payroll.loans,
        payRuns: got.payroll.payRuns, fnfCases: got.payroll.fnfCases, overtimeRules: got.payroll.overtimeRule ? [got.payroll.overtimeRule] : held.overtimeRules,
      }
      : keepHeld ? pickPayroll(held) : emptyPayroll();
    // The same rule for time and leave: a read that failed on a quiet refresh keeps what is held; a first load has none to keep.
    const keepTime = !got.time && refreshing && status.timePhase === 'ok';
    const time: TimeCollections = got.time
      ? { shifts: got.time.shifts, roster: got.time.roster, leaveTypes: got.time.leaveTypes, holidayLists: got.time.holidayLists, leaveBalances: got.time.leaveBalances }
      : keepTime ? pickTime(held) : emptyTime();
    // And for lifecycle and letters: a read that failed on a quiet refresh keeps what is held; a first load has none to keep.
    const keepLifecycle = !got.lifecycle && refreshing && status.lifecyclePhase === 'ok';
    const lifecycle: LifecycleCollections = got.lifecycle
      ? { onboarding: got.lifecycle.onboarding, exits: got.lifecycle.exits, letterTemplates: got.lifecycle.letterTemplates, letters: got.lifecycle.letters }
      : keepLifecycle ? pickLifecycle(held) : emptyLifecycle();
    // And for privacy and DPDP: a read that failed on a quiet refresh keeps what is held; a first load has none to keep.
    const keepPrivacy = !got.privacy && refreshing && status.privacyPhase === 'ok';
    const privacy: PrivacyCollections = got.privacy
      ? { compliance: got.privacy.compliance, consents: got.privacy.consents, retention: got.privacy.retention }
      : keepPrivacy ? pickPrivacy(held) : emptyPrivacy();
    commit(build(pickPeople(got.people), payroll, time, lifecycle, privacy, pickLocal(held)));
    noteRunChanged();
    const failed = got.payrollError;
    if (failed && keepHeld) toast.error(`Could not refresh payroll: ${failed.message}`);
    const timeFailed = got.timeError;
    if (timeFailed && keepTime) toast.error(`Could not refresh time and leave: ${timeFailed.message}`);
    const lifecycleFailed = got.lifecycleError;
    if (lifecycleFailed && keepLifecycle) toast.error(`Could not refresh lifecycle: ${lifecycleFailed.message}`);
    const privacyFailed = got.privacyError;
    if (privacyFailed && keepPrivacy) toast.error(`Could not refresh privacy: ${privacyFailed.message}`);
    setStatus({
      phase: 'ready', refreshing: false, message: '', inputsVersion: status.inputsVersion + 1,
      ...(keepHeld ? {} : { payrollPhase: failed ? (failed.notReady ? 'not_ready' : 'error') : 'ok', payrollMessage: failed?.message ?? '' }),
      ...(keepTime ? {} : { timePhase: timeFailed ? (timeFailed.notReady ? 'not_ready' : 'error') : 'ok', timeMessage: timeFailed?.message ?? '' }),
      ...(keepLifecycle ? {} : { lifecyclePhase: lifecycleFailed ? (lifecycleFailed.notReady ? 'not_ready' : 'error') : 'ok', lifecycleMessage: lifecycleFailed?.message ?? '' }),
      ...(keepPrivacy ? {} : { privacyPhase: privacyFailed ? (privacyFailed.notReady ? 'not_ready' : 'error') : 'ok', privacyMessage: privacyFailed?.message ?? '' }),
    });
  } catch (e) {
    if (seq !== hydrateSeq) return;
    const err = asError(e);
    if (refreshing) {
      setStatus({ refreshing: false });
      toast.error(`Could not refresh: ${err.message}`);
      return;
    }
    setStatus({ phase: err.notReady ? 'not_ready' : 'error', refreshing: false, message: err.message });
  }
}

function applySource(next: Source): void {
  if (next === 'live') {
    getLiveDb();
    setStatus({ source: 'live', phase: 'loading', message: '', refreshing: false, payrollPhase: 'idle', payrollMessage: '', timePhase: 'idle', timeMessage: '', lifecyclePhase: 'idle', lifecycleMessage: '', privacyPhase: 'idle', privacyMessage: '' });
    void hydrate();
  } else {
    hydrateSeq++;
    setStatus({ source: 'sample', phase: 'idle', message: '', refreshing: false });
  }
}

export function readStoredSource(): Source {
  try { return window.localStorage.getItem(SOURCE_KEY) === 'live' ? 'live' : 'sample'; } catch { return 'sample'; }
}

/** Switch the data source and remember the choice. Switching to live always loads from the server. */
export function setSource(next: Source): void {
  try { window.localStorage.setItem(SOURCE_KEY, next); } catch { /* the choice just does not survive a reload */ }
  applySource(next);
}

let initialised = false;
/** Called once by the HRMS layout after it has mounted (never during render): applies the remembered choice. */
export function initSource(): void {
  if (initialised) return;
  initialised = true;
  if (readStoredSource() === 'live') applySource('live');
}

// ───────────────────────────── reads the pages ask for ─────────────────────────────
export type RevealField = 'pan' | 'bank' | 'aadhaar';

/** One reason-gated read of a PAN, bank account or Aadhaar. The server records who asked, when and why; the value is returned to the caller only. */
export async function revealSensitive(employeeId: string, field: RevealField, reason: string): Promise<unknown> {
  await settle();
  const res = await hrmsApi.reveal(employeeId, field, reason);
  return res?.value;
}

/** The server access log (newest first). In live mode the Privacy page's Access tab reads this instead of the browser copy;
 * reveals (above) write to it. Sensitive, so it is never put into the live db or any browser storage: the caller holds it in component state only. */
export async function fetchAccessLog(employeeId?: string): Promise<AccessLogEntry[]> {
  const rows = await hrmsApi.accessLog(employeeId);
  return [...rows].sort((a, b) => b.at.localeCompare(a.at));
}

/** Send employee rows to the server's import endpoint and add the people it created to the local list. Per-row problems come back in `errors`. */
export async function importEmployeeRows(rows: Row[]): Promise<ImportOutcome> {
  await settle();
  const outcome = await hrmsApi.importEmployees(rows);
  if (outcome.employees.length) {
    patchLive((db) => {
      const have = new Set(db.employees.map((e) => e.id));
      for (const e of outcome.employees) if (!have.has(e.id)) db.employees.push(e);
    });
  }
  return outcome;
}

