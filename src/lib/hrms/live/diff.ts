// Diff-sync, the pure half: compare the five server-backed collections before and after a local change and say which API
// calls make the server match. No I/O here, so the rules (which fields, which order, what is never sent) can be tested alone.
//
// Not diffed as plain fields: employee `history` (the server writes it; it is reconciled from the response) and
// `documents` (they have their own endpoints, so they are compared row by row).

import type { Department, Designation, Employee, HrmsDb, LegalEntity, Location } from '../types';
import { fullName } from '../format';
import {
  departmentCreateBody, departmentPatch, designationCreateBody, designationPatch, documentCreateBody, documentPatch, employeeCreateBody, employeePatch,
  entityCreateBody, entityPatch, locationCreateBody, locationPatch, type Row,
} from './wire';

export type ServerCollections = Pick<HrmsDb, 'entities' | 'locations' | 'departments' | 'designations' | 'employees'>;
export type Collection = keyof ServerCollections;
export type Verb = 'create' | 'update' | 'delete';

export interface SyncOp {
  /** Which collection the row lives in; documents live inside an employee. */
  collection: Collection;
  kind: 'entity' | 'location' | 'department' | 'designation' | 'employee' | 'document';
  verb: Verb;
  rowId: string;
  /** Documents only: the employee that holds them. */
  employeeId?: string;
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
};

function simple<T extends { id: string }>(
  collection: Collection, kind: SyncOp['kind'], prev: T[], next: T[], label: (x: T) => string,
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

/**
 * The API calls that turn `prev` into `next`, in an order the server accepts: legal entities first, then the lists that
 * point at them, then people (with their documents), then the removals in the opposite order (people before the lists they use).
 * Document calls for an employee created in the same change are left out: the create body already carries them.
 */
export function diffServer(prev: ServerCollections, next: ServerCollections): SyncOp[] {
  const ent = simple('entities', 'entity', prev.entities, next.entities, LABEL.entity, entityCreateBody, entityPatch);
  const loc = simple('locations', 'location', prev.locations, next.locations, LABEL.location, locationCreateBody, locationPatch);
  const dep = simple('departments', 'department', prev.departments, next.departments, LABEL.department, departmentCreateBody, departmentPatch);
  const des = simple('designations', 'designation', prev.designations, next.designations, LABEL.designation, designationCreateBody, designationPatch);

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
    ...emp,
    ...empDeletes,
    ...loc.deletes, ...dep.deletes, ...des.deletes,
    ...ent.deletes,
  ];
}

export const VERB_TEXT: Record<Verb, string> = { create: 'add', update: 'save', delete: 'remove' };
