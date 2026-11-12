'use client';
// Changes made by the Lifecycle screens (joiners, exits, issued letters) on the preview store.
// Everything goes through mutate()/upsert(), so when the API lands this file swaps with actions.ts.

import { getDb, mutate, newId } from './db';
import { addEmployee, issueLetter, updateEmployee, upsert } from './actions';
import { PREVIEW_TODAY, makeSeed } from './seed';
import { addDays, fullName } from './format';
import { LWF_RULES } from './rules';
import { isLive, whenSynced } from './live/store';
import type {
  ChecklistTask, ClearanceItem, Employee, EmploymentType, ExitCase, Gender, HrmsDb, Id, ISODate, IssuedLetter, LetterTemplate, LetterType, OnboardingCase,
} from './types';
import { uid } from './types';

// ───────────────────────────── shared constants ─────────────────────────────
export const ONBOARDING_STAGES = ['offer', 'documents', 'registration', 'assets', 'induction', 'done'] as const;
export const EXIT_STAGES = ['notice', 'clearance', 'settlement', 'closed'] as const;
export const TASK_OWNERS = ['HR', 'IT', 'Manager', 'Employee', 'Finance', 'Admin'] as const;
export const STAGE_LABEL: Record<OnboardingCase['stage'] | ExitCase['stage'], string> = {
  offer: 'Offer', documents: 'Documents', registration: 'Registration', assets: 'Assets', induction: 'Induction', done: 'Done',
  notice: 'Notice', clearance: 'Clearance', settlement: 'Settlement', closed: 'Closed',
};
export const EXIT_REASONS: { value: ExitCase['reason']; label: string }[] = [
  { value: 'resignation', label: 'Resignation' },
  { value: 'termination', label: 'Termination' },
  { value: 'end_of_contract', label: 'End of contract' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'absconding', label: 'Absconding' },
];
export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'permanent', label: 'Permanent' }, { value: 'fixed_term', label: 'Fixed term' }, { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' }, { value: 'daily_wage', label: 'Daily wage' },
];

// ───────────────────────────── onboarding ─────────────────────────────
export interface JoinerInput {
  firstName: string; lastName: string; gender: Gender; dob: ISODate; email: string; mobile: string;
  locationId: Id; departmentId: Id; designationId: Id; employmentType: EmploymentType; joinDate: ISODate;
  probationMonths: number; noticeDays: number; annualCtc?: number; contractEndDate?: ISODate;
}

/** The standard joining checklist. Due dates are set relative to the join date but never earlier than today. */
export function standardOnboardingTasks(joinDate: ISODate): ChecklistTask[] {
  const due = (daysBefore: number): ISODate => {
    const d = addDays(joinDate, -daysBefore);
    if (d >= PREVIEW_TODAY) return d;
    return joinDate < PREVIEW_TODAY ? joinDate : PREVIEW_TODAY;
  };
  const t = (label: string, owner: string, daysBefore: number): ChecklistTask => ({ id: uid('t'), label, owner, done: false, dueOn: due(daysBefore) });
  return [
    t('Offer accepted and e-signed', 'HR', 7),
    t('Documents uploaded (PAN, Aadhaar, bank proof)', 'Employee', 5),
    t('Previous employer UAN and relieving letter', 'Employee', 5),
    t('Generate UAN or link existing', 'HR', 0),
    t('ESIC registration (if applicable)', 'HR', 0),
    t('Bank account verification', 'Finance', 0),
    t('Laptop and access', 'IT', 1),
    t('Induction schedule', 'Manager', 0),
  ];
}

/**
 * Creates the draft employee (status onboarding, minimal fields) and its onboarding case.
 * On live data the employee is created on the server first; the onboarding case is written only once that create has
 * reached the server, so a refused employee leaves no joining case pointing at nobody (both ends roll back together).
 */
export function startOnboarding(input: JoinerInput): { employee: Employee; onboarding: OnboardingCase } {
  const db = getDb();
  const loc = db.locations.find((l) => l.id === input.locationId);
  const des = db.designations.find((d) => d.id === input.designationId);
  if (!loc || !des) throw new Error('Pick a location and a designation.');
  const employee = addEmployee({
    firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email.trim(), mobile: input.mobile.replace(/[\s-]/g, '').replace(/^\+?91/, ''),
    gender: input.gender, dob: input.dob,
    address: { city: loc.city, state: loc.state },
    entityId: loc.entityId, locationId: loc.id, departmentId: input.departmentId, designationId: input.designationId,
    employmentType: input.employmentType, status: 'onboarding', joinDate: input.joinDate,
    probationMonths: input.probationMonths, noticeDays: input.noticeDays,
    contractEndDate: input.contractEndDate, shiftId: db.shifts[0]?.id,
    uanStatus: 'none', pfMember: input.employmentType !== 'intern', pfOnActualWage: false,
    ptApplicable: true, lwfApplicable: LWF_RULES.some((r) => r.state === loc.state),
    taxRegime: 'new', declaration: { sec80C: 0, sec80D: 0, nps80CCD1B: 0, homeLoanInterest: 0, rentPaidAnnual: 0, other: 0, status: 'not_submitted' },
    payMode: 'bank', annualCtc: input.annualCtc || undefined,
  });
  const onboarding: OnboardingCase = {
    id: newId('onb'), employeeId: employee.id, name: fullName(employee), role: des.name, joinDate: input.joinDate,
    stage: 'offer', tasks: standardOnboardingTasks(input.joinDate),
  };
  if (isLive()) whenSynced((ok) => { if (ok) upsert('onboarding', onboarding); });
  else upsert('onboarding', onboarding);
  return { employee, onboarding };
}

function withCase(caseId: Id, fn: (c: OnboardingCase, db: HrmsDb) => void): void {
  mutate((db) => { const c = db.onboarding.find((x) => x.id === caseId); if (c) fn(c, db); });
}
export const setTaskDone = (caseId: Id, taskId: Id, done: boolean): void =>
  withCase(caseId, (c) => { const t = c.tasks.find((x) => x.id === taskId); if (t) t.done = done; });
export const addTask = (caseId: Id, task: { label: string; owner: string; dueOn?: ISODate }): void =>
  withCase(caseId, (c) => { c.tasks.push({ id: uid('t'), label: task.label.trim(), owner: task.owner, done: false, dueOn: task.dueOn || undefined }); });
export const removeTask = (caseId: Id, taskId: Id): void =>
  withCase(caseId, (c) => { c.tasks = c.tasks.filter((x) => x.id !== taskId); });
export const setOnboardingStage = (caseId: Id, stage: OnboardingCase['stage']): void =>
  withCase(caseId, (c) => { c.stage = stage; });

/**
 * The linked employee becomes active (change-logged by updateEmployee) and the case moves to Done. On live data the case
 * is moved to Done only once the employee's "active" change has reached the server, so a refused flip does not leave a case
 * marked Done next to a person still in onboarding.
 */
export function markJoined(caseId: Id): void {
  const c = getDb().onboarding.find((x) => x.id === caseId);
  if (!c) return;
  const emp = c.employeeId ? getDb().employees.find((e) => e.id === c.employeeId) : undefined;
  const flipping = !!emp && emp.status === 'onboarding';
  if (flipping) updateEmployee(emp!.id, { status: 'active' });
  if (isLive() && flipping) whenSynced((ok) => { if (ok) setOnboardingStage(caseId, 'done'); });
  else setOnboardingStage(caseId, 'done');
}

// ───────────────────────────── exits ─────────────────────────────
export interface ExitInput { employeeId: Id; reason: ExitCase['reason']; resignationDate: ISODate; noticeWaived: boolean; lastWorkingDate: ISODate }

function defaultClearance(db: HrmsDb, e: Employee): ClearanceItem[] {
  const manager = e.reportingToId ? db.employees.find((x) => x.id === e.reportingToId) : undefined;
  const headOf = (deptName: string, fallback: string): string => {
    const dep = db.departments.find((d) => d.name === deptName);
    const p = dep ? db.employees.find((x) => x.departmentId === dep.id && x.status === 'active' && x.id !== e.id) : undefined;
    return p ? fullName(p) : fallback;
  };
  const item = (department: string, owner: string): ClearanceItem => ({ id: uid('clr'), department, owner, done: false });
  return [
    item('Reporting manager', manager ? fullName(manager) : 'Reporting manager'),
    item('IT', 'IT desk'),
    item('Finance', headOf('Finance', 'Finance team')),
    item('HR', headOf('People', 'HR team')),
  ];
}

/** Opens an exit case and puts the employee on notice with the agreed last working date. */
export function startExit(input: ExitInput): ExitCase {
  const db = getDb();
  const emp = db.employees.find((e) => e.id === input.employeeId);
  if (!emp) throw new Error('Employee not found.');
  const c: ExitCase = {
    id: newId('exit'), employeeId: emp.id, reason: input.reason, resignationDate: input.resignationDate, lastWorkingDate: input.lastWorkingDate,
    noticeWaived: input.noticeWaived, stage: 'notice', clearance: defaultClearance(db, emp), assets: [], interviewDone: false,
  };
  upsert('exits', c);
  // On live data put the employee on notice only once the exit case has reached the server, so a refused case does not
  // leave an employee marked on-notice with no exit behind it.
  if (isLive()) whenSynced((ok) => { if (ok) updateEmployee(emp.id, { status: 'on_notice', lastWorkingDate: input.lastWorkingDate }); });
  else updateEmployee(emp.id, { status: 'on_notice', lastWorkingDate: input.lastWorkingDate });
  return c;
}

function withExit(id: Id, fn: (c: ExitCase, db: HrmsDb) => void): void {
  mutate((db) => { const c = db.exits.find((x) => x.id === id); if (c) fn(c, db); });
}
export const setExitStage = (id: Id, stage: ExitCase['stage']): void => withExit(id, (c) => { c.stage = stage; });
export const setClearanceDone = (id: Id, itemId: Id, done: boolean): void =>
  withExit(id, (c) => { const i = c.clearance.find((x) => x.id === itemId); if (i) i.done = done; });
export const patchClearance = (id: Id, itemId: Id, patch: Partial<Pick<ClearanceItem, 'owner' | 'remarks'>>): void =>
  withExit(id, (c) => { const i = c.clearance.find((x) => x.id === itemId); if (i) Object.assign(i, patch); });
export const addClearance = (id: Id, department: string, owner: string): void =>
  withExit(id, (c) => { c.clearance.push({ id: uid('clr'), department: department.trim(), owner: owner.trim() || 'Unassigned', done: false }); });
export const removeClearance = (id: Id, itemId: Id): void =>
  withExit(id, (c) => { c.clearance = c.clearance.filter((x) => x.id !== itemId); });
export const addAsset = (id: Id, name: string): void =>
  withExit(id, (c) => { c.assets.push({ id: uid('ast'), name: name.trim(), returned: false }); });
export const setAssetReturned = (id: Id, assetId: Id, returned: boolean): void =>
  withExit(id, (c) => { const a = c.assets.find((x) => x.id === assetId); if (a) a.returned = returned; });
export const removeAsset = (id: Id, assetId: Id): void =>
  withExit(id, (c) => { c.assets = c.assets.filter((x) => x.id !== assetId); });
export const setInterviewDone = (id: Id, done: boolean): void => withExit(id, (c) => { c.interviewDone = done; });
export const setNoticeWaived = (id: Id, waived: boolean): void => withExit(id, (c) => { c.noticeWaived = waived; });

export function setExitLastWorkingDate(id: Id, date: ISODate): void {
  const c = getDb().exits.find((x) => x.id === id);
  if (!c) return;
  withExit(id, (x) => { x.lastWorkingDate = date; });
  const emp = getDb().employees.find((e) => e.id === c.employeeId);
  if (emp && emp.status === 'on_notice') updateEmployee(emp.id, { lastWorkingDate: date });
}

/** The full and final case that belongs to an exit: the most recent one for the employee. */
export function fnfFor(db: HrmsDb, employeeId: Id) {
  return db.fnfCases.filter((f) => f.employeeId === employeeId).sort((a, b) => (a.lastWorkingDate < b.lastWorkingDate ? 1 : -1))[0];
}

export interface ExitCheck { id: 'clearance' | 'fnf'; ok: boolean; text: string }
/** What must be true before an exit can be closed, with a plain sentence for each. */
export function exitChecks(db: HrmsDb, c: ExitCase): ExitCheck[] {
  const pending = c.clearance.filter((i) => !i.done);
  const clearance: ExitCheck = pending.length === 0
    ? { id: 'clearance', ok: true, text: c.clearance.length ? `All ${c.clearance.length} clearances are done.` : 'There are no clearance items.' }
    : { id: 'clearance', ok: false, text: `${pending.length} of ${c.clearance.length} clearances still pending: ${pending.map((i) => i.department).join(', ')}.` };
  const f = fnfFor(db, c.employeeId);
  const fnf: ExitCheck = !f
    ? { id: 'fnf', ok: false, text: 'No full and final case exists yet. Create and pay it on the payroll page.' }
    : f.status === 'paid'
      ? { id: 'fnf', ok: true, text: 'The full and final case is paid.' }
      : { id: 'fnf', ok: false, text: `The full and final case is ${f.status}, and it must be paid before the exit can close.` };
  return [clearance, fnf];
}

export type CloseResult = { ok: true } | { ok: false; blockers: string[] };
/**
 * Closes the exit and marks the employee exited, re-checking the rules here so the UI cannot bypass them.
 * On live data the server enforces the same blockers (it reads the F&F case and the clearance): the stage is moved to
 * `closed` optimistically, and if the server refuses the change rolls back and the sync machinery shows the server's plain
 * reason. The employee is marked exited only once the close is confirmed. `{ ok: true }` in live mode is the optimistic
 * answer: the caller should defer its own success message with `whenSynced`.
 */
export function closeExit(id: Id): CloseResult {
  const db = getDb();
  const c = db.exits.find((x) => x.id === id);
  if (!c) return { ok: false, blockers: ['The exit case no longer exists.'] };
  const blockers = exitChecks(db, c).filter((k) => !k.ok).map((k) => k.text);
  if (blockers.length) return { ok: false, blockers };
  if (isLive()) {
    setExitStage(id, 'closed');
    whenSynced((ok) => { if (ok) updateEmployee(c.employeeId, { status: 'exited', lastWorkingDate: c.lastWorkingDate }); });
    return { ok: true };
  }
  setExitStage(id, 'closed');
  updateEmployee(c.employeeId, { status: 'exited', lastWorkingDate: c.lastWorkingDate });
  return { ok: true };
}
/** Undo for a closed exit: back to the settlement stage, employee back on notice. */
export function reopenExit(id: Id): void {
  const c = getDb().exits.find((x) => x.id === id);
  if (!c || c.stage !== 'closed') return;
  setExitStage(id, 'settlement');
  updateEmployee(c.employeeId, { status: 'on_notice', lastWorkingDate: c.lastWorkingDate });
}

// ───────────────────────────── letters ─────────────────────────────
/**
 * Issues a letter through issueLetter(), then corrects its date. issueLetter() stamps the real clock, while the
 * preview runs on PREVIEW_TODAY, so register dates would otherwise disagree with every other date on screen.
 */
export function issueLetterNow(l: { employeeId: Id; templateId: Id; type: LetterType; body: string }): IssuedLetter {
  const item = issueLetter(l);
  mutate((db) => { const x = db.letters.find((y) => y.id === item.id); if (x) x.issuedOn = PREVIEW_TODAY; });
  return { ...item, issuedOn: PREVIEW_TODAY };
}
export function markLetterSigned(id: Id): void {
  mutate((db) => { const x = db.letters.find((y) => y.id === id); if (x) x.signed = true; });
}

export type TemplateSetResult = { ok: true } | { ok: false; error: string };
/**
 * The standard letter templates the sample company ships with, as new rows with fresh ids. A new organisation (live mode)
 * starts with none; this is an editable start, mirroring payroll's "Add the standard structures" and time's "Add the
 * standard set". A type already present is left alone. New ids are UUIDs in live mode (via newId).
 */
export function addStandardLetterTemplates(): TemplateSetResult {
  const db = getDb();
  const have = new Set(db.letterTemplates.map((t) => t.type));
  const toAdd: LetterTemplate[] = makeSeed().letterTemplates.filter((t) => !have.has(t.type)).map((t) => ({ ...t, id: newId('lt') }));
  if (!toAdd.length) return { ok: false, error: 'The standard letter templates are already there.' };
  mutate((d) => { for (const t of toAdd) d.letterTemplates.push(t); });
  return { ok: true };
}
