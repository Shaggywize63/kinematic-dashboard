'use client';
// Live data source for HRMS phase 1 (legal entities, locations, departments, designations, employees with their documents
// and change log). Sample mode never touches this file's network code: db.ts only calls into it when the source is 'live'.
//
// How a change travels: mutate(fn) applies fn to a copy of the live database (optimistic), diffs the five server-backed
// collections against the state before, and queues one API call per created / updated / deleted row. The calls run one at a
// time, in the order the server needs. A response reconciles the local row (the server's employee code, masked PAN and bank,
// change log). When a call fails, that change and the ones after it in the same batch are undone row by row and an error
// toast names the reason. Everything that is not on the server yet (structures, shifts, payroll ...) is plain local state,
// kept in its own storage key so it survives a reload.
//
// Personal data from the server is held in memory only. It is never written to browser storage.

import { toast } from 'sonner';
import { useSyncExternalStore } from 'react';
import type { Employee, HrmsDb } from '../types';
import { SEED_VERSION, makeSeed } from '../seed';
import { HrmsApiError, hrmsApi } from './client';
import { diffServer, VERB_TEXT, type ServerCollections, type SyncOp } from './diff';
import {
  documentFromWire, employeeFromWire, entityFromWire, departmentFromWire, designationFromWire, locationFromWire, type ImportOutcome, type Row, type ServerData,
} from './wire';

export type Source = 'sample' | 'live';
export type Phase = 'idle' | 'loading' | 'ready' | 'not_ready' | 'error';

export interface LiveStatus {
  source: Source;
  phase: Phase;
  /** A refresh is running while the page stays on screen. */
  refreshing: boolean;
  /** Changes are still on their way to the server. */
  syncing: boolean;
  /** Why the phase is `error` or `not_ready`. */
  message: string;
}

export const SOURCE_KEY = 'kinematic_hrms_source';
export const LOCAL_KEY = 'kinematic_hrms_live_local_v1';
/** Shown as the employee code until the server has assigned the real one. */
export const PENDING_CODE = '…';

// ───────────────────────────── status and subscriptions ─────────────────────────────
let status: LiveStatus = { source: 'sample', phase: 'idle', refreshing: false, syncing: false, message: '' };
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
const SERVER_KEYS = ['entities', 'locations', 'departments', 'designations', 'employees'] as const;
/** Defaults that are reference data (taken from the sample seed once). */
const REFERENCE_KEYS = ['structures', 'shifts', 'overtimeRules', 'leaveTypes', 'holidayLists', 'letterTemplates', 'retention'] as const;
/** Transactional data that is not on the server yet: starts empty, kept in this browser only. */
const TRANSACTIONAL_KEYS = [
  'roster', 'leaveBalances', 'attendance', 'adjustments', 'loans', 'payRuns', 'fnfCases', 'onboarding', 'exits', 'letters', 'compliance', 'consents', 'accessLog',
] as const;
const LOCAL_KEYS = [...REFERENCE_KEYS, ...TRANSACTIONAL_KEYS] as const;
type LocalParts = Pick<HrmsDb, (typeof LOCAL_KEYS)[number]>;

const pickLocal = (db: HrmsDb): LocalParts => Object.fromEntries(LOCAL_KEYS.map((k) => [k, db[k]])) as unknown as LocalParts;
const pickServer = (db: ServerData | HrmsDb): ServerCollections =>
  Object.fromEntries(SERVER_KEYS.map((k) => [k, db[k]])) as unknown as ServerCollections;

function freshLocal(): LocalParts {
  const seed = makeSeed();
  const empty = Object.fromEntries(TRANSACTIONAL_KEYS.map((k) => [k, []]));
  return { ...Object.fromEntries(REFERENCE_KEYS.map((k) => [k, seed[k]])), ...empty } as unknown as LocalParts;
}

function readLocal(): LocalParts {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as { seedVersion?: number; local?: Partial<LocalParts> };
      if (parsed?.seedVersion === SEED_VERSION && parsed.local) {
        const base = freshLocal();
        // A key missing from an older copy falls back to the default rather than breaking a page.
        return { ...base, ...parsed.local } as LocalParts;
      }
    }
  } catch { /* corrupt or blocked: start from the defaults */ }
  return freshLocal();
}

function persistLocal(db: HrmsDb): void {
  try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ seedVersion: SEED_VERSION, local: pickLocal(db) })); } catch { /* full or blocked: memory still works */ }
}

/** The company name has no home on the server yet: use the first legal entity's name so live mode never shows the sample company. */
const companyOf = (entities: HrmsDb['entities']): HrmsDb['company'] => ({ name: entities[0]?.name ?? 'Your company', currency: 'INR', fyStartMonth: 4 });

function build(server: ServerCollections, local: LocalParts): HrmsDb {
  return { version: SEED_VERSION, company: companyOf(server.entities), ...server, ...local } as HrmsDb;
}

const EMPTY_SERVER: ServerCollections = { entities: [], locations: [], departments: [], designations: [], employees: [] };
let liveDb: HrmsDb | null = null;

/** The live database. Before the first load it is empty (the layout shows a loading state instead of the pages). */
export function getLiveDb(): HrmsDb {
  if (!liveDb) liveDb = build(EMPTY_SERVER, readLocal());
  return liveDb;
}

function commit(next: HrmsDb): void {
  liveDb = next;
  persistLocal(next);
  emit();
}

/** Change the live database without diffing it: used for server answers (reconcile) and rollbacks. */
function patchLive(fn: (db: HrmsDb) => void): void {
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

async function execute(op: SyncOp): Promise<Row> {
  const body = op.body ?? {};
  if (op.kind === 'document') {
    const emp = op.employeeId!;
    if (op.verb === 'create') return hrmsApi.addDocument(emp, body);
    if (op.verb === 'update') return hrmsApi.updateDocument(emp, op.rowId, body);
    return hrmsApi.removeDocument(emp, op.rowId);
  }
  if (op.verb === 'create') return hrmsApi.create(op.collection, body);
  if (op.verb === 'update') return hrmsApi.update(op.collection, op.rowId, body);
  return hrmsApi.remove(op.collection, op.rowId);
}

const FROM_WIRE = {
  entity: entityFromWire, location: locationFromWire, department: departmentFromWire, designation: designationFromWire,
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
    const list = db[op.collection] as Array<{ id: string }>;
    const i = list.findIndex((x) => x.id === op.rowId);
    if (i >= 0 && alone) list[i] = FROM_WIRE[op.kind](data);
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

async function runBatch(ops: SyncOp[]): Promise<boolean> {
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
    if (!inflight.size) setStatus({ syncing: false });
  });
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
/** Apply a change optimistically and queue the API calls that make the server match. Returns false when the change was refused. */
export function liveMutate(fn: (db: HrmsDb) => void): boolean {
  const prev = getLiveDb();
  const next = structuredClone(prev);
  fn(next);
  const ops = diffServer(prev, next);
  if (ops.length && status.phase !== 'ready') {
    toast.error('The HRMS data has not loaded from the server, so this change was not made.');
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

/** Fetch everything from /bootstrap. From `ready` this is a quiet refresh (the page stays); otherwise the layout shows the loading state. */
export async function hydrate(): Promise<void> {
  const seq = ++hydrateSeq;
  const refreshing = status.phase === 'ready';
  setStatus(refreshing ? { refreshing: true } : { phase: 'loading', message: '', refreshing: false });
  try {
    // Read only when no change is on its way: an answer from before a write would put the old rows back. A change made while
    // the read was running sends us round again (a few times at most; after that the next refresh catches up).
    let data = await settle().then(() => hrmsApi.bootstrap());
    for (let again = 0; again < 3 && inflight.size && seq === hydrateSeq; again++) data = await settle().then(() => hrmsApi.bootstrap());
    if (seq !== hydrateSeq) return;
    commit(build(pickServer(data), pickLocal(getLiveDb())));
    setStatus({ phase: 'ready', refreshing: false, message: '' });
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
    setStatus({ source: 'live', phase: 'loading', message: '', refreshing: false });
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

