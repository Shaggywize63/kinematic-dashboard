'use client';
// Payroll-screen actions that actions.ts does not offer. They sit on the same store (`mutate`) and keep the same
// shapes, so they swap to API calls together with the rest of actions.ts.
//
// Why freeze/unfreeze are re-done here instead of calling actions.freezeRun / unfreezeRun (both are shared files I
// must not edit; the problems are listed in the final report):
//   - freezeRun locks the month's attendance for EVERY entity, not only the entity being frozen.
//   - freezeRun puts a payslip's whole loan EMI on the first open loan, and unfreezeRun never gives it back, so a
//     freeze, unfreeze, freeze cycle recovers the EMI twice and the next compute then shows a smaller EMI.
// freezeRunSafe / unfreezeRunSafe keep the same status flow and audit lines and remember what they changed.

import { mutate, getDb } from './db';
import { ACTOR, remove, upsert } from './actions';
import { uid } from './types';
import type {
  Adjustment, AttendanceSummary, FnfCase, Id, Month, PayRun, SalaryComponent, SalaryStructure, TaxDeclaration, TaxRegime,
} from './types';
import { daysInMonth, fmtMonth } from './format';
import { ESI, PF } from './rules';
import { adjustmentInfo, adjustmentLock, isLocked, runIsStale, validateStructure } from '../../components/hrms/payroll/logic';

export type ActionResult = { ok: true } | { ok: false; error: string };
const OK: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

/** Extra bookkeeping stored on a run by freezeRunSafe so unfreezeRunSafe can undo exactly what the freeze did. */
interface RunExtras { loanRecoveries?: Record<Id, number>; attendanceLockedFor?: Id[] }

export function logRunAudit(runId: Id, action: string): void {
  mutate((db) => {
    const run = db.payRuns.find((r) => r.id === runId);
    if (run) run.audit.push({ at: new Date().toISOString(), by: ACTOR, action });
  });
}

// ───────────── attendance inputs ─────────────
export function setAttendance(employeeId: Id, month: Month, patch: Partial<Pick<AttendanceSummary, 'lopDays' | 'overtimeHours'>>): ActionResult {
  let result: ActionResult = OK;
  const days = daysInMonth(month);
  if (patch.lopDays != null && (!(patch.lopDays >= 0) || patch.lopDays > days || Math.round(patch.lopDays * 2) !== patch.lopDays * 2)) return fail(`Loss of pay is 0 to ${days} days, in steps of half a day.`);
  if (patch.overtimeHours != null && (!(patch.overtimeHours >= 0) || patch.overtimeHours > 200)) return fail('Overtime is 0 to 200 hours a month.');
  mutate((db) => {
    const emp = db.employees.find((e) => e.id === employeeId);
    if (!emp) { result = fail('Employee not found'); return; }
    const closed = db.payRuns.find((r) => r.month === month && r.entityId === emp.entityId && isLocked(r));
    if (closed) { result = fail(`The ${fmtMonth(month)} run is ${closed.status}. Its inputs are locked.`); return; }
    let a = db.attendance.find((x) => x.employeeId === employeeId && x.month === month);
    if (a?.locked) { result = fail('This month\'s attendance is locked. Unlock it in Attendance first.'); return; }
    if (!a) {
      a = { employeeId, month, daysInMonth: days, presentDays: days, paidLeaveDays: 0, weeklyOffs: 0, holidays: 0, lopDays: 0, overtimeHours: 0, locked: false };
      db.attendance.push(a);
    }
    if (patch.lopDays != null) a.lopDays = patch.lopDays;
    if (patch.overtimeHours != null) a.overtimeHours = patch.overtimeHours;
  });
  return result;
}

// ───────────── adjustments ─────────────
export function saveAdjustment(a: Omit<Adjustment, 'id'> & { id?: Id }): ActionResult {
  const db = getDb();
  const target = adjustmentLock(db, a);
  if (target) return fail(`The ${fmtMonth(target.month)} run is ${target.status}. Adjustments for it are closed.`);
  if (a.id) {
    const orig = db.adjustments.find((x) => x.id === a.id);
    const origLock = orig ? adjustmentLock(db, orig) : undefined;
    if (origLock) return fail(`This adjustment belongs to the ${fmtMonth(origLock.month)} run, which is ${origLock.status}.`);
  }
  const info = adjustmentInfo(a.kind);
  upsert('adjustments', { ...a, amount: Math.round(a.amount), taxable: info.effect === 'earning' ? a.taxable : false, id: a.id ?? uid('adj') });
  return OK;
}
export function deleteAdjustment(id: Id): ActionResult {
  const db = getDb();
  const orig = db.adjustments.find((x) => x.id === id);
  if (!orig) return fail('Adjustment not found');
  const lock = adjustmentLock(db, orig);
  if (lock) return fail(`The ${fmtMonth(lock.month)} run is ${lock.status}. This adjustment cannot be deleted.`);
  remove('adjustments', id);
  return OK;
}

// ───────────── salary structures ─────────────
const comp = (code: string, name: string, kind: SalaryComponent['kind'], type: SalaryComponent['calc']['type'], value: number, o: Partial<SalaryComponent> = {}): SalaryComponent => ({
  id: uid('c'), code, name, kind, calc: { type, value }, isWage: false, taxable: kind === 'earning', pfApplicable: false, esiApplicable: kind === 'earning', prorate: kind === 'earning', showInPayslip: true, ...o,
});

/** A new structure, blank (basic plus a balancing allowance plus employer PF) or copied from an existing one with fresh component ids. */
export function createStructure(name: string, copyFromId?: Id, effectiveFrom = '2026-11-01'): SalaryStructure {
  const db = getDb();
  const src = copyFromId ? db.structures.find((s) => s.id === copyFromId) : undefined;
  const components: SalaryComponent[] = src
    ? src.components.map((c) => ({ ...c, id: uid('c'), calc: { ...c.calc } }))
    : [
      comp('BASIC', 'Basic', 'earning', 'pct_ctc', 50, { isWage: true, pfApplicable: true }),
      comp('SPECIAL', 'Special Allowance', 'earning', 'balance', 0),
      comp('PF_ER', 'Employer PF', 'employer', 'pf_employer', PF.employerRate, { taxable: false, esiApplicable: false, prorate: false }),
      comp('ESI_ER', 'Employer ESI', 'employer', 'esi_employer', ESI.employerRate, { taxable: false, esiApplicable: false, prorate: false }),
    ];
  const s: SalaryStructure = { id: uid('str'), name: name.trim(), description: src ? `Copy of ${src.name}` : '', effectiveFrom, components };
  upsert('structures', s);
  return s;
}
export function saveStructure(s: SalaryStructure): ActionResult {
  const v = validateStructure(s);
  if (v.errors.length) return fail(v.errors[0]!);
  upsert('structures', { ...s, name: s.name.trim() });
  return OK;
}
export function deleteStructure(id: Id): ActionResult {
  const db = getDb();
  const used = db.employees.filter((e) => e.structureId === id).length;
  if (used) return fail(`${used} employee${used === 1 ? ' is' : 's are'} on this structure. Move them to another structure first.`);
  remove('structures', id);
  return OK;
}

// ───────────── loans ─────────────
export function deleteLoan(id: Id): ActionResult {
  const l = getDb().loans.find((x) => x.id === id);
  if (!l) return fail('Loan not found');
  if (l.recovered > 0) return fail('Part of this loan has been recovered through payroll, so it cannot be deleted.');
  remove('loans', id);
  return OK;
}

// ───────────── full and final ─────────────
export function approveFnf(id: Id): ActionResult {
  let result: ActionResult = OK;
  mutate((db) => {
    const c = db.fnfCases.find((x) => x.id === id);
    if (!c) { result = fail('Case not found'); return; }
    if (c.status !== 'draft') { result = fail('Only a draft settlement can be approved.'); return; }
    c.status = 'approved';
  });
  return result;
}
export function markFnfPaid(id: Id): ActionResult {
  let result: ActionResult = OK;
  mutate((db) => {
    const c = db.fnfCases.find((x) => x.id === id);
    if (!c) { result = fail('Case not found'); return; }
    if (c.status !== 'approved') { result = fail('Approve the settlement before marking it paid.'); return; }
    c.status = 'paid';
  });
  return result;
}
export function deleteFnf(id: Id): ActionResult {
  const c = getDb().fnfCases.find((x) => x.id === id) as FnfCase | undefined;
  if (!c) return fail('Case not found');
  if (c.status !== 'draft') return fail('Only a draft settlement can be deleted.');
  remove('fnfCases', id);
  return OK;
}

// ───────────── freeze / unfreeze ─────────────
export function freezeRunSafe(runId: Id): ActionResult {
  let result: ActionResult = OK;
  mutate((db) => {
    const run = db.payRuns.find((r) => r.id === runId) as (PayRun & RunExtras) | undefined;
    if (!run) { result = fail('Run not found'); return; }
    if (run.status !== 'computed') { result = fail('Only a computed run can be frozen.'); return; }
    if (runIsStale(db, run)) { result = fail('Inputs changed after the last compute. Compute again before freezing, so the payslips match the inputs.'); return; }
    const now = new Date().toISOString();
    run.status = 'frozen';
    run.frozenAt = now;
    run.frozenBy = ACTOR;
    // Lock attendance only for the people in this run.
    const ids = run.payslips.map((s) => s.employeeId);
    run.attendanceLockedFor = [];
    for (const a of db.attendance) {
      if (a.month === run.month && ids.includes(a.employeeId) && !a.locked) { a.locked = true; run.attendanceLockedFor.push(a.employeeId); }
    }
    // Recover each loan the same way the engine deducted it, and remember the amounts.
    run.loanRecoveries = {};
    for (const s of run.payslips) {
      const open = db.loans.filter((l) => l.employeeId === s.employeeId && l.startMonth <= run.month && l.recovered < l.principal);
      for (const l of open) {
        const emi = Math.min(l.emi, l.principal - l.recovered);
        if (emi <= 0) continue;
        l.recovered += emi;
        run.loanRecoveries[l.id] = (run.loanRecoveries[l.id] ?? 0) + emi;
      }
    }
    run.audit.push({ at: now, by: ACTOR, action: 'Frozen. Payslips are locked.' });
  });
  return result;
}

export function unfreezeRunSafe(runId: Id, reason: string): ActionResult {
  const why = reason.trim();
  if (why.length < 5) return fail('Give a reason of at least a few words. It goes into the audit trail.');
  let result: ActionResult = OK;
  mutate((db) => {
    const run = db.payRuns.find((r) => r.id === runId) as (PayRun & RunExtras) | undefined;
    if (!run) { result = fail('Run not found'); return; }
    if (run.status !== 'frozen') { result = fail('Only a frozen run can be unfrozen. A paid run is closed.'); return; }
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
    run.audit.push({ at: new Date().toISOString(), by: ACTOR, action: `Unfrozen: ${why}` });
  });
  return result;
}

// ───────────── tax declaration ─────────────
export function saveDeclaration(employeeId: Id, declaration: TaxDeclaration, regime: TaxRegime): void {
  mutate((db) => {
    const e = db.employees.find((x) => x.id === employeeId);
    if (!e) return;
    const before = JSON.stringify(e.declaration);
    e.declaration = declaration;
    if (e.taxRegime !== regime) {
      e.history = [{ id: uid('h'), at: new Date().toISOString(), by: ACTOR, field: 'Tax regime', from: e.taxRegime, to: regime }, ...e.history];
      e.taxRegime = regime;
    }
    if (before !== JSON.stringify(declaration)) {
      e.history = [{ id: uid('h'), at: new Date().toISOString(), by: ACTOR, field: 'Tax declaration', to: declaration.status.replace(/_/g, ' ') }, ...e.history];
    }
  });
}
