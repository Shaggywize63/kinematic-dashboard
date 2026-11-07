'use client';
// Every change the HRMS pages make goes through here, so the later swap to API calls touches one file.

import { mutate, getDb } from './db';
import type {
  Employee, HrmsDb, PayRun, Month, ChangeLogEntry, Id, AccessLogEntry, Adjustment, Loan, FnfCase, IssuedLetter, ComplianceTask,
} from './types';
import { uid } from './types';
import { computePayRunPayslips } from './engine';
import { LAW_VERSION } from './rules';
import { fullName } from './format';
import { PREVIEW_TODAY } from './seed';

export const ACTOR = 'You (HR admin)'; // the preview has no real identity; the backend will stamp the signed-in user

type Collection = {
  [K in keyof HrmsDb]: HrmsDb[K] extends Array<{ id: Id }> ? K : never;
}[keyof HrmsDb];

/** Insert or replace an item (matched by id) in any collection that holds `{ id }` items. */
export function upsert<K extends Collection>(key: K, item: HrmsDb[K] extends Array<infer T> ? T : never): void {
  mutate((db) => {
    const list = db[key] as unknown as Array<{ id: Id }>;
    const i = list.findIndex((x) => x.id === (item as { id: Id }).id);
    if (i >= 0) list[i] = item as { id: Id }; else list.push(item as { id: Id });
  });
}
export function remove<K extends Collection>(key: K, id: Id): void {
  mutate((db) => {
    const list = db[key] as unknown as Array<{ id: Id }>;
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list.splice(i, 1);
  });
}

// ───────────── employees ─────────────
const FIELD_LABELS: Partial<Record<keyof Employee, string>> = {
  firstName: 'First name', lastName: 'Last name', email: 'Email', mobile: 'Mobile', departmentId: 'Department', designationId: 'Designation',
  locationId: 'Location', entityId: 'Legal entity', reportingToId: 'Reports to', employmentType: 'Employment type', status: 'Status', annualCtc: 'Annual CTC',
  structureId: 'Salary structure', pan: 'PAN', uan: 'UAN', uanStatus: 'UAN status', esicIp: 'ESIC number', taxRegime: 'Tax regime', shiftId: 'Shift', lastWorkingDate: 'Last working date',
  confirmationDate: 'Confirmation date', pfMember: 'PF member', payMode: 'Pay mode', bank: 'Bank account', aadhaarLast4: 'Aadhaar',
};

export function nextEmployeeCode(db: HrmsDb): string {
  const max = db.employees.reduce((m, e) => Math.max(m, Number(e.code.replace(/\D/g, '')) || 0), 1000);
  return `MER-${String(max + 1).padStart(4, '0')}`;
}

export function addEmployee(input: Omit<Employee, 'id' | 'code' | 'history' | 'documents'> & Partial<Pick<Employee, 'documents'>>): Employee {
  let created!: Employee;
  mutate((db) => {
    created = {
      ...input, id: uid('emp'), code: nextEmployeeCode(db),
      documents: input.documents ?? [
        { id: uid('doc'), type: 'appointment_letter', name: 'Appointment letter', uploadedOn: input.joinDate, status: 'pending', mandatory: true },
        { id: uid('doc'), type: 'pan_card', name: 'PAN card', uploadedOn: input.joinDate, status: 'pending', mandatory: true },
        { id: uid('doc'), type: 'aadhaar', name: 'Aadhaar (masked copy)', uploadedOn: input.joinDate, status: 'pending', mandatory: true },
        { id: uid('doc'), type: 'bank_proof', name: 'Cancelled cheque', uploadedOn: input.joinDate, status: 'pending', mandatory: true },
      ],
      history: [{ id: uid('h'), at: new Date().toISOString(), by: ACTOR, field: 'Employee', to: 'Created' }],
    };
    db.employees.push(created);
  });
  return created;
}

/** Update an employee and write a change-log row for each field that really changed (auditors expect this). */
export function updateEmployee(id: Id, patch: Partial<Employee>): void {
  mutate((db) => {
    const e = db.employees.find((x) => x.id === id);
    if (!e) return;
    const log: ChangeLogEntry[] = [];
    (Object.keys(patch) as Array<keyof Employee>).forEach((k) => {
      const before = e[k];
      const after = patch[k];
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      const label = FIELD_LABELS[k];
      if (label) {
        const show = (v: unknown) => (v == null || v === '' ? undefined : typeof v === 'object' ? 'Updated' : String(v));
        log.push({ id: uid('h'), at: new Date().toISOString(), by: ACTOR, field: label, from: show(before), to: show(after) });
      }
      (e as unknown as Record<string, unknown>)[k] = after;
    });
    e.history = [...log, ...e.history];
  });
}

// ───────────── payroll ─────────────
export function createPayRun(month: Month, entityId: Id, type: PayRun['type'] = 'regular'): PayRun {
  let run!: PayRun;
  mutate((db) => {
    const existing = db.payRuns.find((r) => r.month === month && r.entityId === entityId && r.type === type);
    if (existing) { run = existing; return; }
    run = { id: uid('run'), month, entityId, type, status: 'draft', lawVersion: LAW_VERSION, createdAt: new Date().toISOString(), payslips: [], audit: [{ at: new Date().toISOString(), by: ACTOR, action: 'Created' }] };
    db.payRuns.push(run);
  });
  return run;
}

export function computeRun(runId: Id): void {
  mutate((db) => {
    const run = db.payRuns.find((r) => r.id === runId);
    if (!run || run.status === 'frozen' || run.status === 'paid') return;
    run.payslips = computePayRunPayslips(db, run.month, run.entityId, run.id);
    run.status = 'computed';
    run.computedAt = new Date().toISOString();
    run.lawVersion = LAW_VERSION;
    run.audit.push({ at: run.computedAt, by: ACTOR, action: `Computed ${run.payslips.length} payslips` });
  });
}
export function freezeRun(runId: Id): void {
  mutate((db) => {
    const run = db.payRuns.find((r) => r.id === runId);
    if (!run || run.status !== 'computed') return;
    run.status = 'frozen';
    run.frozenAt = new Date().toISOString();
    run.frozenBy = ACTOR;
    run.audit.push({ at: run.frozenAt, by: ACTOR, action: 'Frozen. Payslips are locked.' });
    // Lock attendance only for the people in this run (not every entity's), and remember who, so an unfreeze can undo it.
    const ids = run.payslips.map((s) => s.employeeId);
    run.attendanceLockedFor = [];
    for (const a of db.attendance) {
      if (a.month === run.month && ids.includes(a.employeeId) && !a.locked) { a.locked = true; run.attendanceLockedFor.push(a.employeeId); }
    }
    // Recover each open loan the way the engine deducted it (its own EMI, capped at the balance) and remember the amounts.
    run.loanRecoveries = {};
    for (const s of run.payslips) {
      for (const l of db.loans.filter((x) => x.employeeId === s.employeeId && x.startMonth <= run.month && x.recovered < x.principal)) {
        const emi = Math.min(l.emi, l.principal - l.recovered);
        if (emi <= 0) continue;
        l.recovered += emi;
        run.loanRecoveries[l.id] = (run.loanRecoveries[l.id] ?? 0) + emi;
      }
    }
  });
}
export function unfreezeRun(runId: Id, reason: string): void {
  mutate((db) => {
    const run = db.payRuns.find((r) => r.id === runId);
    if (!run || run.status !== 'frozen') return;
    // Undo exactly what the freeze did, so freeze, unfreeze, freeze does not recover an EMI twice.
    for (const [loanId, amt] of Object.entries(run.loanRecoveries ?? {})) {
      const l = db.loans.find((x) => x.id === loanId);
      if (l) l.recovered = Math.max(0, l.recovered - amt);
    }
    for (const empId of run.attendanceLockedFor ?? []) {
      const a = db.attendance.find((x) => x.employeeId === empId && x.month === run.month);
      if (a) a.locked = false;
    }
    run.loanRecoveries = undefined;
    run.attendanceLockedFor = undefined;
    run.status = 'computed';
    run.frozenAt = undefined;
    run.frozenBy = undefined;
    run.audit.push({ at: new Date().toISOString(), by: ACTOR, action: `Unfrozen: ${reason}` });
  });
}
export function markRunPaid(runId: Id): void {
  mutate((db) => {
    const run = db.payRuns.find((r) => r.id === runId);
    if (!run || run.status !== 'frozen') return;
    run.status = 'paid';
    run.paidAt = new Date().toISOString();
    run.audit.push({ at: run.paidAt, by: ACTOR, action: 'Marked paid' });
  });
}

export const addAdjustment = (a: Omit<Adjustment, 'id'>) => upsert('adjustments', { ...a, id: uid('adj') });
export const addLoan = (l: Omit<Loan, 'id' | 'recovered'>) => upsert('loans', { ...l, id: uid('loan'), recovered: 0 });
export const saveFnf = (c: Omit<FnfCase, 'id'> & { id?: Id }) => upsert('fnfCases', { ...c, id: c.id ?? uid('fnf') } as FnfCase);

// ───────────── letters, access log, compliance ─────────────
export function issueLetter(l: Omit<IssuedLetter, 'id' | 'issuedOn' | 'signed'>): IssuedLetter {
  const item: IssuedLetter = { ...l, id: uid('let'), issuedOn: PREVIEW_TODAY, signed: false };
  upsert('letters', item);
  return item;
}
export function logAccess(employeeId: Id, field: string, reason: string): void {
  const e: AccessLogEntry = { id: uid('al'), at: new Date().toISOString(), byUser: ACTOR, employeeId, field, reason };
  upsert('accessLog', e);
}
export function markFiled(id: Id, reference?: string): void {
  mutate((db) => {
    const t = db.compliance.find((x) => x.id === id) as ComplianceTask | undefined;
    if (!t) return;
    t.status = 'filed';
    t.filedOn = PREVIEW_TODAY;
    t.reference = reference || `CHL-${uid('').slice(-5).toUpperCase()}`;
  });
}

export const employeeName = (id: Id | undefined): string => {
  const e = getDb().employees.find((x) => x.id === id);
  return e ? fullName(e) : '—';
};
