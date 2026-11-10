'use client';
// Employee-area actions built on the shared store. They exist because updateEmployee() in actions.ts
//  - only writes a change-log row for a fixed list of fields (date of birth, address, declaration, ... are skipped),
//  - would write the Aadhaar last four into the change log in the clear,
//  - has no helpers for documents or per-component pay overrides.
// Everything here still goes through mutate() / updateEmployee(), so the later swap to API calls stays in db.ts + actions.ts.

import { getDb, mutate, newId } from './db';
import { ACTOR, updateEmployee } from './actions';
import type { ChangeLogEntry, Employee, EmployeeDocument, Id } from './types';
import { uid } from './types';
import { PREVIEW_TODAY } from './seed';
import { sameValue } from '../../components/hrms/employees/logic';

// Fields updateEmployee() already logs (keep in step with FIELD_LABELS in actions.ts).
const LOGGED_BY_SHARED = new Set<string>([
  'firstName', 'lastName', 'email', 'mobile', 'departmentId', 'designationId', 'locationId', 'entityId', 'reportingToId', 'employmentType', 'status',
  'annualCtc', 'structureId', 'pan', 'uan', 'uanStatus', 'esicIp', 'taxRegime', 'shiftId', 'lastWorkingDate', 'confirmationDate', 'pfMember', 'payMode', 'bank',
]);
// Fields we log ourselves, with a label.
const EXTRA_LABELS: Record<string, string> = {
  dob: 'Date of birth', gender: 'Gender', fatherName: "Father's name", maritalStatus: 'Marital status', bloodGroup: 'Blood group', address: 'Address',
  emergencyContact: 'Emergency contact', joinDate: 'Join date', probationMonths: 'Probation (months)', noticeDays: 'Notice period (days)',
  costCentre: 'Cost centre', contractEndDate: 'Contract end date', pfOnActualWage: 'PF on actual wage', ptApplicable: 'Professional tax applies',
  lwfApplicable: 'Labour welfare fund applies', declaration: 'Tax declaration (Form 124)',
};

const show = (v: unknown): string | undefined => {
  if (v == null || v === '') return undefined;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return 'Updated';
  return String(v);
};
const entry = (field: string, from?: string, to?: string): ChangeLogEntry => ({ id: uid('h'), at: new Date().toISOString(), by: ACTOR, field, from, to });

/**
 * Save a patch on an employee: applies it through updateEmployee() (which logs the common fields), adds log rows for the
 * fields it skips, and records an Aadhaar change without ever writing the digits to the log. Unchanged fields are dropped
 * first, so saving an untouched form writes nothing. Returns how many fields really changed.
 */
export function saveEmployee(id: Id, patch: Partial<Employee>): number {
  const cur = getDb().employees.find((x) => x.id === id);
  if (!cur) return 0;
  const changed: Record<string, unknown> = {};
  (Object.keys(patch) as Array<keyof Employee>).forEach((k) => {
    if (!sameValue(cur[k], patch[k])) changed[k] = patch[k];
  });
  const keys = Object.keys(changed);
  if (!keys.length) return 0;

  const { aadhaarLast4, aadhaarVerified, ...rest } = changed as Partial<Employee>;
  if (Object.keys(rest).length) updateEmployee(id, rest);

  const extra: ChangeLogEntry[] = [];
  for (const k of Object.keys(rest)) {
    if (LOGGED_BY_SHARED.has(k) || !EXTRA_LABELS[k]) continue;
    extra.push(entry(EXTRA_LABELS[k]!, show(cur[k as keyof Employee]), show((rest as Record<string, unknown>)[k])));
  }
  const aadhaarChanged = aadhaarLast4 !== undefined || aadhaarVerified !== undefined;
  if (aadhaarChanged) extra.push(entry('Aadhaar', cur.aadhaarLast4 ? 'On file' : undefined, 'Updated (last four digits only)'));

  if (extra.length || aadhaarChanged) {
    mutate((db) => {
      const e = db.employees.find((x) => x.id === id);
      if (!e) return;
      if (aadhaarLast4 !== undefined) e.aadhaarLast4 = aadhaarLast4;
      if (aadhaarVerified !== undefined) e.aadhaarVerified = aadhaarVerified;
      e.history = [...extra, ...e.history];
    });
  }
  return keys.length;
}

// ───────────── documents ─────────────
export function addDocument(empId: Id, doc: Omit<EmployeeDocument, 'id'>): EmployeeDocument {
  const item: EmployeeDocument = { ...doc, id: newId('doc') };
  mutate((db) => {
    const e = db.employees.find((x) => x.id === empId);
    if (!e) return;
    e.documents.push(item);
    e.history = [entry(`Document: ${item.name}`, undefined, `Added (${item.status})`), ...e.history];
  });
  return item;
}

export function patchDocument(empId: Id, docId: Id, patch: Partial<Omit<EmployeeDocument, 'id'>>): void {
  mutate((db) => {
    const e = db.employees.find((x) => x.id === empId);
    const d = e?.documents.find((x) => x.id === docId);
    if (!e || !d) return;
    const before = d.status;
    Object.assign(d, patch);
    if (patch.status && patch.status !== before) e.history = [entry(`Document: ${d.name}`, before, d.status), ...e.history];
    else if (patch.fileName) e.history = [entry(`Document: ${d.name}`, undefined, `File ${patch.fileName}`), ...e.history];
  });
}

export function removeDocument(empId: Id, docId: Id): void {
  mutate((db) => {
    const e = db.employees.find((x) => x.id === empId);
    const i = e ? e.documents.findIndex((x) => x.id === docId) : -1;
    if (!e || i < 0) return;
    const [gone] = e.documents.splice(i, 1);
    e.history = [entry(`Document: ${gone!.name}`, gone!.status, 'Removed'), ...e.history];
  });
}

/** Upload in the preview keeps the file name and the date only; the bytes are not stored anywhere. */
export function recordUpload(empId: Id, docId: Id, fileName: string): void {
  patchDocument(empId, docId, { fileName, uploadedOn: PREVIEW_TODAY, status: 'uploaded' });
}

// ───────────── salary ─────────────
export interface SalarySave { structureId?: Id; annualCtc?: number; overrides: Record<string, number> }

/**
 * Save structure, CTC and per-component overrides together. Overrides belonging to a component the (new) structure does
 * not have are dropped, and each added, changed or removed override gets its own change-log row so the revision history
 * on the salary tab reads like a payroll register.
 */
export function saveSalary(id: Id, input: SalarySave): void {
  const db = getDb();
  const cur = db.employees.find((x) => x.id === id);
  if (!cur) return;
  const structure = db.structures.find((s) => s.id === input.structureId);
  const valid = new Set(structure?.components.map((c) => c.id) ?? []);
  const next: Record<string, number> = {};
  Object.entries(input.overrides).forEach(([k, v]) => { if (valid.has(k) && Number.isFinite(v)) next[k] = v; });
  const prev = cur.structureOverrides ?? {};

  saveEmployee(id, { structureId: input.structureId, annualCtc: input.annualCtc });

  const names = new Map<string, string>();
  db.structures.forEach((s) => s.components.forEach((c) => { if (!names.has(c.id)) names.set(c.id, c.name); }));
  const rows: ChangeLogEntry[] = [];
  const all = new Set([...Object.keys(prev), ...Object.keys(next)]);
  all.forEach((k) => {
    if (prev[k] === next[k]) return;
    rows.push(entry(`Override: ${names.get(k) ?? k}`, prev[k] != null ? String(prev[k]) : undefined, next[k] != null ? String(next[k]) : 'Removed'));
  });
  if (rows.length || Object.keys(prev).length !== Object.keys(next).length) {
    mutate((d) => {
      const e = d.employees.find((x) => x.id === id);
      if (!e) return;
      e.structureOverrides = Object.keys(next).length ? next : undefined;
      e.history = [...rows, ...e.history];
    });
  }
}
