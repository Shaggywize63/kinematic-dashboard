// Diff-sync, the pure half: compare the server-backed collections (people and organisation, and the simple payroll records:
// salary structures, attendance, adjustments, loans, settlements, the overtime rule) before and after a local change and say
// which API calls make the server match. No I/O here, so the rules (which fields, which order, what is never sent) can be tested alone.
//
// Not diffed as plain fields: employee `history` (the server writes it; it is reconciled from the response) and
// `documents` (they have their own endpoints, so they are compared row by row).
// Not diffed at all: pay runs and settlement status. Those change through commands (live/payrollCommands.ts).

import type { Adjustment, AttendanceSummary, Department, Designation, Employee, FnfCase, HrmsDb, LegalEntity, Loan, Location, SalaryStructure } from '../types';
import { fmtMonth, fullName } from '../format';
import {
  departmentCreateBody, departmentPatch, designationCreateBody, designationPatch, documentCreateBody, documentPatch, employeeCreateBody, employeePatch,
  entityCreateBody, entityPatch, locationCreateBody, locationPatch, same, type Row,
} from './wire';
import {
  adjustmentCreateBody, adjustmentPatch, attendanceBody, attendanceKey, fnfCreateBody, fnfPatch, loanCreateBody, loanPatch, settingsBody,
  structureCreateBody, structurePatch,
} from './payrollWire';

/** People and organisation: saved on the server since phase 1. */
export type PeopleCollections = Pick<HrmsDb, 'entities' | 'locations' | 'departments' | 'designations' | 'employees'>;
/**
 * Payroll: also on the server. `payRuns` is in the list because the server owns it, but it is never diffed: a pay run changes
 * only through its commands (compute, freeze ...), whose answers replace the local run.
 */
export type PayrollCollections = Pick<HrmsDb, 'structures' | 'attendance' | 'adjustments' | 'loans' | 'payRuns' | 'fnfCases' | 'overtimeRules'>;
export type ServerCollections = PeopleCollections & PayrollCollections;
export type Collection = keyof ServerCollections;
export type Verb = 'create' | 'update' | 'delete';

export type SyncKind = 'entity' | 'location' | 'department' | 'designation' | 'employee' | 'document' | 'structure' | 'attendance' | 'adjustment' | 'loan' | 'fnf' | 'settings';
/** The kinds that are payroll records: they need the payroll data to have loaded, and they can change what a run computes. */
export const PAYROLL_KINDS: ReadonlySet<SyncKind> = new Set<SyncKind>(['structure', 'attendance', 'adjustment', 'loan', 'fnf', 'settings']);
/** Changes to these can make a computed run stale (an employee's pay, a structure, attendance, an adjustment, a loan, the overtime rule). */
export const RUN_INPUT_KINDS: ReadonlySet<SyncKind> = new Set<SyncKind>(['structure', 'attendance', 'adjustment', 'loan', 'settings', 'employee']);

export interface SyncOp {
  /** Which collection the row lives in; documents live inside an employee. */
  collection: Collection;
  kind: SyncKind;
  verb: Verb;
  /** The row's id. For attendance, which has none, `employeeId:month`. */
  rowId: string;
  /** Documents: the employee that holds them. Attendance: the employee the row is about. */
  employeeId?: string;
  /** Attendance only. */
  month?: string;
  body?: Row;
  /** Dashboard-side names of the fields an update touches (rollback restores exactly these). */
  keys: string[];
  /** The row (or document) as it was before the change: what rollback puts back. */
  prev?: unknown;
  prevIndex?: number;
  /** Employee updates and document ops: change-log rows this change added locally, removed again if the call fails. */
  addedHistory: string[];
  /** For the toast: `Legal entity "Meridian"`. */
  label: string;
}

const byId = <T extends { id: string }>(list: T[]): Map<string, T> => new Map(list.map((x) => [x.id, x]));

const LABEL = {
  entity: (e: LegalEntity) => `legal entity "${e.name}"`,
  location: (l: Location) => `location "${l.name}"`,
  department: (d: Department) => `department "${d.name}"`,
  designation: (d: Designation) => `designation "${d.name}"`,
  employee: (e: Employee) => (e.firstName || e.lastName ? fullName(e) : 'the employee'),
  structure: (s: SalaryStructure) => `salary structure "${s.name}"`,
};

function simple<T extends { id: string }>(
  collection: Collection, kind: SyncKind, prev: T[], next: T[], label: (x: T) => string,
  createBody: (x: T) => Row, patch: (a: T, b: T) => { body: Row; keys: string[] },
): { creates: SyncOp[]; updates: SyncOp[]; deletes: SyncOp[] } {
  const before = byId(prev);
  const after = byId(next);
  const creates: SyncOp[] = [];
  const updates: SyncOp[] = [];
  const deletes: SyncOp[] = [];
  for (const row of next) {
    const old = before.get(row.id);
    if (!old) { creates.push({ collection, kind, verb: 'create', rowId: row.id, body: createBody(row), keys: [], addedHistory: [], label: label(row) }); continue; }
    const { body, keys } = patch(old, row);
    if (keys.length) updates.push({ collection, kind, verb: 'update', rowId: row.id, body, keys, prev: old, addedHistory: [], label: label(row) });
  }
  prev.forEach((row, i) => {
    if (!after.has(row.id)) deletes.push({ collection, kind, verb: 'delete', rowId: row.id, keys: [], prev: row, prevIndex: i, addedHistory: [], label: label(row) });
  });
  return { creates, updates, deletes };
}

function documentOps(prev: Employee, next: Employee): SyncOp[] {
  const ops: SyncOp[] = [];
  const before = byId(prev.documents);
  const after = byId(next.documents);
  const added = historyAdded(prev, next);
  const base = { collection: 'employees' as const, kind: 'document' as const, employeeId: next.id, addedHistory: added };
  const who = LABEL.employee(next);
  for (const d of next.documents) {
    const old = before.get(d.id);
    if (!old) ops.push({ ...base, verb: 'create', rowId: d.id, body: documentCreateBody(d), keys: [], label: `document "${d.name}" of ${who}` });
    else {
      const { body, keys } = documentPatch(old, d);
      if (keys.length) ops.push({ ...base, verb: 'update', rowId: d.id, body, keys, prev: old, label: `document "${d.name}" of ${who}` });
    }
  }
  prev.documents.forEach((d, i) => {
    if (!after.has(d.id)) ops.push({ ...base, verb: 'delete', rowId: d.id, keys: [], prev: d, prevIndex: i, label: `document "${d.name}" of ${who}` });
  });
  return ops;
}

/** Ids of change-log rows that exist in `next` and not in `prev`: written locally by this change, replaced by the server's own rows later. */
function historyAdded(prev: Employee, next: Employee): string[] {
  const had = new Set(prev.history.map((h) => h.id));
  return next.history.filter((h) => !had.has(h.id)).map((h) => h.id);
}

function attendanceOps(prev: AttendanceSummary[], next: AttendanceSummary[], names: Map<string, string>): SyncOp[] {
  const before = new Map(prev.map((a) => [attendanceKey(a), a]));
  const ops: SyncOp[] = [];
  for (const a of next) {
    const old = before.get(attendanceKey(a));
    const label = `attendance of ${names.get(a.employeeId) ?? 'the employee'} for ${fmtMonth(a.month)}`;
    const base = { collection: 'attendance' as const, kind: 'attendance' as const, rowId: attendanceKey(a), employeeId: a.employeeId, month: a.month, addedHistory: [] as string[], label };
    if (!old) { ops.push({ ...base, verb: 'create', body: attendanceBody(a).body, keys: [] }); continue; }
    const { body, keys } = attendanceBody(a, old);
    if (keys.length) ops.push({ ...base, verb: 'update', body, keys, prev: old });
  }
  // There is no call that removes an attendance row, and no screen that removes one, so a row missing from `next` is left alone.
  return ops;
}

/** The overtime rule is the one payroll setting. It is saved as a whole with PUT /settings/payroll. */
function settingsOps(prev: HrmsDb['overtimeRules'], next: HrmsDb['overtimeRules']): SyncOp[] {
  const a = prev[0];
  const b = next[0];
  if (!b || same(a, b)) return [];
  return [{ collection: 'overtimeRules', kind: 'settings', verb: 'update', rowId: b.id, body: settingsBody(b), keys: ['rule'], prev: a, addedHistory: [], label: 'the overtime rule' }];
}

/**
 * The API calls that turn `prev` into `next`, in an order the server accepts: legal entities first, then the lists that
 * point at them, then salary structures (people may point at them), then people (with their documents), then the payroll
 * rows that point at people, then the removals in the opposite order (payroll rows and people before the lists they use,
 * structures after the people who left them).
 * Document calls for an employee created in the same change are left out: the create body already carries them.
 * Payroll collections missing from `prev` or `next` count as empty.
 */
export function diffServer(prev: PeopleCollections & Partial<PayrollCollections>, next: PeopleCollections & Partial<PayrollCollections>): SyncOp[] {
  const ent = simple('entities', 'entity', prev.entities, next.entities, LABEL.entity, entityCreateBody, entityPatch);
  const loc = simple('locations', 'location', prev.locations, next.locations, LABEL.location, locationCreateBody, locationPatch);
  const dep = simple('departments', 'department', prev.departments, next.departments, LABEL.department, departmentCreateBody, departmentPatch);
  const des = simple('designations', 'designation', prev.designations, next.designations, LABEL.designation, designationCreateBody, designationPatch);

  const names = new Map(next.employees.concat(prev.employees).map((e) => [e.id, LABEL.employee(e)]));
  const nameOf = (id: string) => names.get(id) ?? 'the employee';
  const str = simple<SalaryStructure>('structures', 'structure', prev.structures ?? [], next.structures ?? [], LABEL.structure, structureCreateBody, structurePatch);
  const adj = simple<Adjustment>('adjustments', 'adjustment', prev.adjustments ?? [], next.adjustments ?? [], (a) => `adjustment for ${nameOf(a.employeeId)}`, adjustmentCreateBody, adjustmentPatch);
  const loan = simple<Loan>('loans', 'loan', prev.loans ?? [], next.loans ?? [], (l) => `${l.kind} for ${nameOf(l.employeeId)}`, loanCreateBody, loanPatch);
  const fnf = simple<FnfCase>('fnfCases', 'fnf', prev.fnfCases ?? [], next.fnfCases ?? [], (c) => `settlement of ${nameOf(c.employeeId)}`, fnfCreateBody, fnfPatch);
  const att = attendanceOps(prev.attendance ?? [], next.attendance ?? [], names);
  const settings = settingsOps(prev.overtimeRules ?? [], next.overtimeRules ?? []);

  const emp: SyncOp[] = [];
  const empDeletes: SyncOp[] = [];
  const before = byId(prev.employees);
  const after = byId(next.employees);
  for (const e of next.employees) {
    const old = before.get(e.id);
    if (!old) {
      emp.push({ collection: 'employees', kind: 'employee', verb: 'create', rowId: e.id, body: employeeCreateBody(e), keys: [], addedHistory: [], label: LABEL.employee(e) });
      continue;
    }
    const { body, keys } = employeePatch(old, e);
    if (keys.length) emp.push({ collection: 'employees', kind: 'employee', verb: 'update', rowId: e.id, body, keys, prev: old, addedHistory: historyAdded(old, e), label: LABEL.employee(e) });
    emp.push(...documentOps(old, e));
  }
  prev.employees.forEach((e, i) => {
    if (!after.has(e.id)) empDeletes.push({ collection: 'employees', kind: 'employee', verb: 'delete', rowId: e.id, keys: [], prev: e, prevIndex: i, addedHistory: [], label: LABEL.employee(e) });
  });

  return [
    ...ent.creates, ...ent.updates,
    ...des.creates, ...des.updates, ...loc.creates, ...loc.updates, ...dep.creates, ...dep.updates,
    ...str.creates, ...str.updates,
    ...emp,
    ...att, ...adj.creates, ...adj.updates, ...loan.creates, ...loan.updates, ...fnf.creates, ...fnf.updates, ...settings,
    ...fnf.deletes, ...loan.deletes, ...adj.deletes,
    ...empDeletes,
    ...loc.deletes, ...dep.deletes, ...des.deletes,
    ...str.deletes,
    ...ent.deletes,
  ];
}

export const VERB_TEXT: Record<Verb, string> = { create: 'add', update: 'save', delete: 'remove' };
