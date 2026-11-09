// Compliance autopilot. Pure functions: for each task in the compliance calendar, how ready it is, what is blocking it, and the
// working file that can honestly be built from the data.
//
// Rules this file keeps:
//   - Readiness is worked out from live data (employees, registrations, pay runs). Nothing is a stored flag.
//   - Some things only a person can confirm (for example "the contractor list is up to date"). Those are manual checks, ticked by hand
//     and saved in the control store. They count towards readiness only when ticked.
//   - A file is built only where an engine helper exists (the ECR) or where the data is a plain list from payslips. Anything else is a
//     checklist, not a pretend file. Working sheets say they are not the portal's upload format.
//   - Late-filing text never quotes a rate.

import type { ComplianceTask, Employee, HrmsDb, Id, ISODate, LegalEntity, Month, PayRun, Payslip } from '../types';
import { buildBreakup, buildEcr } from '../engine';
import { LABOUR_CODES, PF, lwfFor, monthEnd, valueOn } from '../rules';
import { addDays, addMonths, diffDays, fmtDate, fmtMonth, fullName, inr, tenure } from '../format';
import { PREVIEW_TODAY } from '../seed';
import { cleanCopy, hasEsi, slipsForMonth } from './simulate';

export type TaskKind = 'pf' | 'esi' | 'pt' | 'lwf' | 'tds_deposit' | 'tds_return' | 'shops' | 'clra' | 'posh' | 'gratuity' | 'bonus' | 'generic';
export type TaskStatus = 'filed' | 'overdue' | 'due_soon' | 'upcoming';
export const DUE_SOON_DAYS = 7;

export const KIND_LABEL: Record<TaskKind, string> = {
  pf: 'PF', esi: 'ESI', pt: 'Professional tax', lwf: 'Labour welfare fund', tds_deposit: 'TDS deposit', tds_return: 'TDS return',
  shops: 'Shops and Establishments', clra: 'Contract labour licence', posh: 'POSH', gratuity: 'Gratuity', bonus: 'Bonus', generic: 'Other',
};

export function taskKind(t: Pick<ComplianceTask, 'law' | 'name'>): TaskKind {
  // A task made from the Rule radar is a review task, not a filing: it gets the general checklist whatever its law.
  if (/^rule radar:/i.test(t.name)) return 'generic';
  switch (t.law) {
    case 'PF': return 'pf';
    case 'ESI': return 'esi';
    case 'PT': return 'pt';
    case 'LWF': return 'lwf';
    case 'TDS': return /return|138|24q|26q/i.test(t.name) ? 'tds_return' : /deposit|challan/i.test(t.name) ? 'tds_deposit' : 'generic';
    case 'Shops': return 'shops';
    case 'CLRA': return 'clra';
    case 'POSH': return 'posh';
    case 'Gratuity': return 'gratuity';
    case 'Bonus': return 'bonus';
    default: return 'generic';
  }
}

export function taskStatus(t: ComplianceTask, today: ISODate = PREVIEW_TODAY): TaskStatus {
  if (t.status === 'filed' || t.filedOn) return 'filed';
  const d = diffDays(today, t.dueOn);
  if (d < 0) return 'overdue';
  return d <= DUE_SOON_DAYS ? 'due_soon' : 'upcoming';
}

export function dueLabel(t: ComplianceTask, today: ISODate = PREVIEW_TODAY): string {
  if (t.filedOn) {
    const late = diffDays(t.dueOn, t.filedOn);
    return late > 0 ? `Filed ${late} ${late === 1 ? 'day' : 'days'} late` : 'Filed on time';
  }
  const d = diffDays(today, t.dueOn);
  if (d < 0) return `${-d} ${d === -1 ? 'day' : 'days'} late`;
  if (d === 0) return 'Due today';
  return `Due in ${d} ${d === 1 ? 'day' : 'days'}`;
}

/** The pay month a monthly filing is about: the month before the due date. LWF is about the month it falls due in. */
export function wageMonthFor(t: ComplianceTask): Month | null {
  const kind = taskKind(t);
  if (kind === 'pf' || kind === 'esi' || kind === 'pt' || kind === 'tds_deposit') return addMonths(t.dueOn.slice(0, 7), -1);
  if (kind === 'lwf') return t.dueOn.slice(0, 7);
  return null;
}

// ───────────────────────────── readiness ─────────────────────────────
export interface CheckPerson { employeeId: Id; note: string; href: string }
export interface Check {
  id: string;
  label: string;
  kind: 'data' | 'manual';
  severity: 'blocker' | 'warning';
  passed: boolean;
  detail?: string;
  people: CheckPerson[];
  link?: { href: string; label: string };
}
export interface Readiness {
  task: ComplianceTask;
  kind: TaskKind;
  status: TaskStatus;
  dueLabel: string;
  wageMonth: Month | null;
  run?: PayRun;
  checks: Check[];
  passed: number;
  total: number;
  pct: number;
  blockers: Check[];
  facts: { label: string; value: string }[];
  /** Things worth knowing that are not pass or fail. */
  notes: string[];
}

export const empHref = (id: Id) => `/dashboard/hrms/employees/${id}?tab=statutory`;
const ORG_HREF = '/dashboard/hrms/organization';
export const manualKey = (taskId: Id, checkId: string) => `${taskId}|${checkId}`;

export function runFor(db: HrmsDb, entityId: Id, month: Month): PayRun | undefined {
  return db.payRuns.filter((r) => r.entityId === entityId && r.month === month && r.type === 'regular' && r.payslips.length > 0)
    .sort((a, b) => (b.frozenAt ?? b.createdAt).localeCompare(a.frozenAt ?? a.createdAt))[0];
}

const peopleOf = (emps: Employee[], note: (e: Employee) => string): CheckPerson[] => emps.map((e) => ({ employeeId: e.id, note: note(e), href: empHref(e.id) }));
const names = (emps: Employee[], max = 3): string => `${emps.slice(0, max).map(fullName).join(', ')}${emps.length > max ? ` and ${emps.length - max} more` : ''}`;

interface Ctx { db: HrmsDb; task: ComplianceTask; entity?: LegalEntity; month: Month | null; run?: PayRun; manual: Record<string, boolean>; today: ISODate }

function manualCheck(c: Ctx, id: string, label: string, severity: 'blocker' | 'warning' = 'warning'): Check {
  return { id, label, kind: 'manual', severity, passed: !!c.manual[manualKey(c.task.id, id)], people: [] };
}
function runCheck(c: Ctx): Check {
  const ok = !!c.run && (c.run.status === 'frozen' || c.run.status === 'paid');
  return {
    id: 'run', label: `Pay run for ${c.month ? fmtMonth(c.month) : 'the month'} is frozen or paid`, kind: 'data', severity: 'blocker', passed: ok, people: [],
    detail: ok ? `${c.run!.payslips.length} payslips, ${c.run!.status}` : c.run ? `The run is only ${c.run.status}. Freeze it so the figures stop changing.` : 'There is no pay run for this month yet.',
    link: ok ? undefined : { href: '/dashboard/hrms/payroll', label: 'Open payroll' },
  };
}
function regCheck(c: Ctx, type: string, label: string, state?: string): Check {
  const has = !!c.entity?.registrations.some((r) => r.type === type && (!state || r.state === state));
  return { id: `reg_${type}`, label, kind: 'data', severity: 'blocker', passed: has, people: [], detail: has ? undefined : `${c.entity?.name ?? 'The entity'} has none on file${state ? ` for ${state}` : ''}.`, link: has ? undefined : { href: ORG_HREF, label: 'Add it in Organization' } };
}
function popOf(c: Ctx): Employee[] {
  const ids = new Set(c.run?.payslips.map((s) => s.employeeId) ?? []);
  return c.db.employees.filter((e) => ids.has(e.id));
}

function pfChecks(c: Ctx): Check[] {
  const pop = popOf(c);
  const members = pop.filter((e) => e.pfMember);
  const missing = members.filter((e) => !e.uan);
  const inactive = members.filter((e) => e.uan && (e.uanStatus === 'none' || e.uanStatus === 'generated'));
  const unseeded = members.filter((e) => e.uan && e.uanStatus === 'activated');
  const noBank = pop.filter((e) => e.payMode === 'bank' && !e.bank);
  const mismatch: CheckPerson[] = [];
  for (const s of c.run?.payslips ?? []) {
    const e = c.db.employees.find((x) => x.id === s.employeeId);
    const st = c.db.structures.find((x) => x.id === e?.structureId);
    if (!e || !e.pfMember || !st || !e.annualCtc) continue;
    const b = buildBreakup(st, e.annualCtc, { asOn: monthEnd(s.month), pfMember: true, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides });
    const paid = b.wageTest.codeWages * (s.daysInMonth ? s.paidDays / s.daysInMonth : 1);
    const expected = Math.round(e.pfOnActualWage ? paid : Math.min(paid, valueOn(PF.ceiling, monthEnd(s.month))));
    if (Math.abs(expected - s.wages.pfWage) > 1) mismatch.push({ employeeId: e.id, note: `Run has ${inr(s.wages.pfWage)}, the salary master gives ${inr(expected)}`, href: empHref(e.id) });
  }
  const mk = (id: string, label: string, severity: Check['severity'], bad: Employee[], note: (e: Employee) => string): Check => ({
    id, label, kind: 'data', severity, passed: bad.length === 0, people: peopleOf(bad, note),
  });
  return [
    runCheck(c),
    regCheck(c, 'pf', 'PF establishment code is on file'),
    mk('uan_missing', 'Every PF member has a UAN', 'blocker', missing, () => 'No UAN. The ECR row is left out.'),
    mk('uan_active', 'Every UAN is activated', 'blocker', inactive, () => 'UAN made but not activated.'),
    mk('uan_seeded', 'Every UAN is Aadhaar-seeded', 'blocker', unseeded, () => 'UAN activated but not Aadhaar-seeded. The ECR row is left out.'),
    mk('bank', 'Everyone paid by bank has an account on file', 'warning', noBank, () => 'No bank account on file.'),
    { id: 'pf_wage', label: 'PF wages in the run match the salary master', kind: 'data', severity: 'warning', passed: mismatch.length === 0, people: mismatch, detail: mismatch.length ? `${mismatch.length} differ` : undefined },
  ];
}

function esiChecks(c: Ctx): Check[] {
  const covered = (c.run?.payslips ?? []).filter(hasEsi);
  const noIp = covered.map((s) => c.db.employees.find((e) => e.id === s.employeeId)!).filter((e) => e && !e.esicIp);
  return [
    runCheck(c),
    regCheck(c, 'esi', 'ESI employer code is on file'),
    { id: 'ip', label: 'Everyone covered has an ESIC number', kind: 'data', severity: 'blocker', passed: noIp.length === 0, people: peopleOf(noIp, () => 'Covered by ESI but no ESIC number.') },
  ];
}

function ptChecks(c: Ctx): Check[] {
  const state = c.task.state;
  const inState = popOf(c).filter((e) => c.db.locations.find((l) => l.id === e.locationId)?.state === state);
  const off = inState.filter((e) => !e.ptApplicable && (c.run?.payslips.find((s) => s.employeeId === e.id)?.gross ?? 0) > 0);
  return [
    runCheck(c),
    regCheck(c, 'pt', `Professional tax registration for ${state ?? 'the state'}`, state),
    { id: 'ptflag', label: 'Professional tax is switched on for everyone in the state', kind: 'data', severity: 'warning', passed: off.length === 0, people: peopleOf(off, () => 'Professional tax is switched off for this person.'), detail: off.length ? undefined : `${inState.length} ${inState.length === 1 ? 'person' : 'people'} in ${state}.` },
  ];
}

function lwfChecks(c: Ctx): Check[] {
  const state = c.task.state;
  const month = c.month ?? c.task.dueOn.slice(0, 7);
  const rule = state ? lwfFor(state, month) : { employee: 0, employer: 0 };
  const inState = c.db.employees.filter((e) => (e.status === 'active' || e.status === 'on_notice') && e.entityId === c.task.entityId && c.db.locations.find((l) => l.id === e.locationId)?.state === state);
  const off = inState.filter((e) => !e.lwfApplicable);
  return [
    regCheck(c, 'lwf', `Labour welfare fund registration for ${state ?? 'the state'}`, state),
    { id: 'lwf_month', label: `${fmtMonth(month)} is a contribution month for ${state ?? 'the state'}`, kind: 'data', severity: 'warning', passed: rule.employee + rule.employer > 0, people: [], detail: rule.employee + rule.employer > 0 ? undefined : 'The sample table has no contribution this month.' },
    { id: 'lwf_flag', label: 'The fund is switched on for everyone in the state', kind: 'data', severity: 'warning', passed: off.length === 0, people: peopleOf(off, () => 'Labour welfare fund is switched off for this person.') },
  ];
}

function tdsDepositChecks(c: Ctx): Check[] {
  const pop = popOf(c);
  const withTds = (c.run?.payslips ?? []).filter((s) => (s.deductions.find((d) => d.code === 'TDS')?.amount ?? 0) > 0).map((s) => c.db.employees.find((e) => e.id === s.employeeId)!).filter(Boolean);
  const noPan = withTds.filter((e) => !e.pan);
  const pending = pop.filter((e) => e.taxRegime === 'old' && e.declaration.status !== 'verified');
  return [
    runCheck(c),
    { id: 'tan', label: 'The entity has a TAN', kind: 'data', severity: 'blocker', passed: !!c.entity?.tan, people: [], detail: c.entity?.tan ? undefined : 'No TAN on file.', link: c.entity?.tan ? undefined : { href: ORG_HREF, label: 'Add it in Organization' } },
    { id: 'pan', label: 'Everyone with TDS has a PAN', kind: 'data', severity: 'warning', passed: noPan.length === 0, people: peopleOf(noPan, () => 'No PAN. TDS goes at the higher rate.') },
    { id: 'decl', label: 'Old-regime tax declarations are verified', kind: 'data', severity: 'warning', passed: pending.length === 0, people: peopleOf(pending, (e) => `Declaration is ${e.declaration.status.replace('_', ' ')}.`) },
  ];
}

function tdsReturnChecks(c: Ctx): Check[] {
  const noPan = c.db.employees.filter((e) => e.entityId === c.task.entityId && (e.status === 'active' || e.status === 'on_notice') && !e.pan);
  return [
    { id: 'tan', label: 'The entity has a TAN', kind: 'data', severity: 'blocker', passed: !!c.entity?.tan, people: [], detail: c.entity?.tan ? undefined : 'No TAN on file.', link: c.entity?.tan ? undefined : { href: ORG_HREF, label: 'Add it in Organization' } },
    { id: 'pan', label: 'Every person on payroll has a PAN', kind: 'data', severity: 'warning', passed: noPan.length === 0, people: peopleOf(noPan, () => 'No PAN on file.') },
    manualCheck(c, 'challans', 'Challan details match the deposits for the quarter', 'blocker'),
    manualCheck(c, 'deductees', 'Deductee totals match payroll'),
  ];
}

function registrationChecks(c: Ctx, type: 'shops' | 'clra', label: string): Check[] {
  const regs = (c.entity?.registrations ?? []).filter((r) => r.type === type && (!c.task.state || r.state === c.task.state));
  const reg = regs[0];
  const expired = !!reg?.validTo && reg.validTo < c.today;
  const left = reg?.validTo ? diffDays(c.today, reg.validTo) : null;
  return [
    regCheck(c, type, label, c.task.state),
    {
      id: 'valid', label: `The ${type === 'clra' ? 'licence' : 'registration'} has not expired`, kind: 'data', severity: 'blocker', passed: !!reg && !expired, people: [],
      detail: !reg ? 'Nothing on file to check.' : expired ? `Expired on ${fmtDate(reg.validTo)}, ${-left!} days ago.` : reg.validTo ? `Valid until ${fmtDate(reg.validTo)}.` : 'No end date on file.',
      link: reg && expired ? { href: ORG_HREF, label: 'Update in Organization' } : undefined,
    },
    {
      id: 'runway', label: 'More than 60 days of validity left', kind: 'data', severity: 'warning', passed: !!reg && (left == null || left > 60), people: [],
      detail: reg?.validTo ? (left! >= 0 ? `${left} days left (${fmtDate(reg.validTo)}).` : 'Already expired.') : undefined,
    },
    manualCheck(c, 'fee', type === 'clra' ? 'Renewal application and fee are ready' : 'Renewal fee and form are ready'),
    manualCheck(c, 'copy', 'The current certificate is scanned and saved'),
  ];
}

function poshChecks(c: Ctx): Check[] {
  return [
    manualCheck(c, 'ic', 'The Internal Committee is in place and its names are current', 'blocker'),
    manualCheck(c, 'report', 'The annual report is drafted, with the number of cases (including none)', 'blocker'),
    manualCheck(c, 'awareness', 'Awareness sessions held this year are recorded'),
  ];
}

function gratuityChecks(c: Ctx): Check[] {
  const soon = c.db.employees.filter((e) => e.status === 'active' && (e.employmentType === 'permanent' || e.employmentType === 'fixed_term') && (() => {
    const need = e.employmentType === 'fixed_term' ? LABOUR_CODES.gratuity.fixedTermYears : LABOUR_CODES.gratuity.permanentYears;
    const t = tenure(e.joinDate, addDays(c.today, 90));
    return t.totalMonths >= need * 12 && tenure(e.joinDate, c.today).totalMonths < need * 12;
  })());
  return [
    { id: 'soon', label: 'People who become eligible in the next 90 days are known', kind: 'data', severity: 'warning', passed: true, people: peopleOf(soon, (e) => `Eligible soon (joined ${fmtDate(e.joinDate)}).`), detail: soon.length ? names(soon) : 'Nobody crosses the service limit in the next 90 days.' },
    manualCheck(c, 'cover', 'The gratuity provision or insurance cover has been reviewed', 'blocker'),
    manualCheck(c, 'nominations', 'Nomination forms are on file for eligible staff'),
  ];
}

export function bonusEligible(db: HrmsDb): { employee: Employee; wages: number }[] {
  return db.employees.filter((e) => e.status === 'active' && e.annualCtc && e.structureId).map((e) => {
    const st = db.structures.find((s) => s.id === e.structureId)!;
    const b = buildBreakup(st, e.annualCtc!, { asOn: PREVIEW_TODAY, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides });
    return { employee: e, wages: b.wageTest.codeWages };
  }).filter((r) => r.wages <= LABOUR_CODES.bonus.eligibilityCeiling);
}

function bonusChecks(c: Ctx): Check[] {
  const eligible = bonusEligible(c.db);
  const noBonus = eligible.filter((r) => !c.db.adjustments.some((a) => a.employeeId === r.employee.id && a.kind === 'bonus')).map((r) => r.employee);
  return [
    { id: 'entered', label: 'A bonus is entered for everyone who is eligible', kind: 'data', severity: 'warning', passed: noBonus.length === 0, people: peopleOf(noBonus, () => 'Eligible but no bonus is entered.'), detail: noBonus.length ? `${noBonus.length} of ${eligible.length} eligible people have none.` : `${eligible.length} eligible.` },
    manualCheck(c, 'percent', 'The bonus percentage has been decided and approved', 'blocker'),
    manualCheck(c, 'register', 'The bonus register is up to date'),
  ];
}

function genericChecks(c: Ctx): Check[] {
  return [
    manualCheck(c, 'read', 'The source notification has been read', 'blocker'),
    manualCheck(c, 'who', 'The people affected have been identified'),
    manualCheck(c, 'config', 'Payroll configuration is updated if needed'),
    manualCheck(c, 'tell', 'The people affected have been told'),
  ];
}

function factsFor(c: Ctx, kind: TaskKind): Readiness['facts'] {
  const slips = c.run?.payslips ?? [];
  const sum = (f: (s: Payslip) => number) => slips.reduce((t, s) => t + f(s), 0);
  const code = (ls: { code: string; amount: number }[], k: string) => ls.find((l) => l.code === k)?.amount ?? 0;
  if (kind === 'pf' && c.run) {
    const ecr = buildEcr(c.db, c.run);
    return [{ label: 'PF members in the run', value: String(slips.filter((s) => c.db.employees.find((e) => e.id === s.employeeId)?.pfMember).length) }, { label: 'ECR rows ready', value: String(ecr.rows) }];
  }
  if (kind === 'esi' && c.run) return [{ label: 'People covered', value: String(slips.filter(hasEsi).length) }, { label: 'To pay', value: inr(sum((s) => code(s.deductions, 'ESI') + code(s.employer, 'ESI_ER'))) }];
  if (kind === 'tds_deposit' && c.run) return [{ label: 'TDS to deposit', value: inr(sum((s) => code(s.deductions, 'TDS'))) }];
  if (kind === 'pt' && c.run) {
    const st = c.task.state;
    const mine = slips.filter((s) => c.db.locations.find((l) => l.id === c.db.employees.find((e) => e.id === s.employeeId)?.locationId)?.state === st);
    return [{ label: 'People in the state', value: String(mine.length) }, { label: 'To pay', value: inr(mine.reduce((t, s) => t + code(s.deductions, 'PT'), 0)) }];
  }
  return [];
}

function notesFor(c: Ctx, kind: TaskKind): string[] {
  if (kind === 'esi' && c.run && !c.run.payslips.some(hasEsi)) return ['Nobody in this entity is under the ESI ceiling this month. Ask your advisor whether a nil filing is needed.'];
  return [];
}

export function readinessFor(db: HrmsDb, task: ComplianceTask, manual: Record<string, boolean> = {}, today: ISODate = PREVIEW_TODAY): Readiness {
  const kind = taskKind(task);
  const month = wageMonthFor(task);
  const entity = db.entities.find((e) => e.id === task.entityId);
  const run = month && kind !== 'lwf' ? runFor(db, task.entityId, month) : undefined;
  const c: Ctx = { db, task, entity, month, run, manual, today };
  const checks = ({
    pf: pfChecks, esi: esiChecks, pt: ptChecks, lwf: lwfChecks, tds_deposit: tdsDepositChecks, tds_return: tdsReturnChecks,
    shops: (x: Ctx) => registrationChecks(x, 'shops', `Shops and Establishments registration${x.task.state ? ` for ${x.task.state}` : ''}`),
    clra: (x: Ctx) => registrationChecks(x, 'clra', 'Contract labour licence on file'),
    posh: poshChecks, gratuity: gratuityChecks, bonus: bonusChecks, generic: genericChecks,
  } satisfies Record<TaskKind, (x: Ctx) => Check[]>)[kind](c);
  const passed = checks.filter((k) => k.passed).length;
  return {
    task, kind, status: taskStatus(task, today), dueLabel: dueLabel(task, today), wageMonth: month, run, checks, passed, total: checks.length,
    pct: checks.length ? Math.round((passed / checks.length) * 100) : 100, blockers: checks.filter((k) => !k.passed && k.severity === 'blocker'), facts: factsFor(c, kind), notes: notesFor(c, kind),
  };
}

// ───────────────────────────── summary and calendar ─────────────────────────────
export interface AutopilotSummary { filed: number; onTime: number; onTimePct: number | null; overdue: number; dueThisWeek: number; open: number; avgReadiness: number | null }

export function autopilotSummary(db: HrmsDb, manual: Record<string, boolean> = {}, today: ISODate = PREVIEW_TODAY): AutopilotSummary {
  const filed = db.compliance.filter((t) => taskStatus(t, today) === 'filed');
  const onTime = filed.filter((t) => !t.filedOn || t.filedOn <= t.dueOn).length;
  const open = db.compliance.filter((t) => taskStatus(t, today) !== 'filed');
  const ready = open.map((t) => readinessFor(db, t, manual, today).pct);
  return {
    filed: filed.length, onTime, onTimePct: filed.length ? Math.round((onTime / filed.length) * 100) : null,
    overdue: open.filter((t) => taskStatus(t, today) === 'overdue').length,
    dueThisWeek: open.filter((t) => { const d = diffDays(today, t.dueOn); return d >= 0 && d <= DUE_SOON_DAYS; }).length,
    open: open.length, avgReadiness: ready.length ? Math.round(ready.reduce((t, x) => t + x, 0) / ready.length) : null,
  };
}

export interface CalendarDay { date: ISODate; tasks: ComplianceTask[]; inRange: boolean }
/** A grid of whole weeks (Monday first) that covers `days` days from today. Days outside the range are marked. */
export function calendarWeeks(db: HrmsDb, today: ISODate = PREVIEW_TODAY, days = 60): CalendarDay[][] {
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(today, -dow);
  const end = addDays(today, days - 1);
  const weeks: CalendarDay[][] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const date = addDays(d, i);
      return { date, tasks: db.compliance.filter((t) => t.dueOn === date && !t.filedOn), inRange: date >= today && date <= end };
    }));
  }
  return weeks;
}

// ───────────────────────────── late-filing text ─────────────────────────────
/** Plain statements about what being late can lead to. No rates: those change and belong to the advisor. */
export const LATE_NOTE: Record<TaskKind, string> = {
  pf: 'Late PF payment can attract interest and damages under the PF scheme. Ask your advisor for the current rates.',
  esi: 'Late ESI payment can attract interest. Ask your advisor for the current rate.',
  pt: 'Late professional tax can attract interest and a penalty set by the state. Ask your advisor.',
  lwf: 'A late labour welfare fund payment can attract a penalty set by the state. Ask your advisor.',
  tds_deposit: 'A late TDS deposit can attract interest. Ask your advisor for the current rate.',
  tds_return: 'A late TDS return can attract a fee per day, and the deductor can be penalised. Ask your advisor for the current amounts.',
  shops: 'Running on a lapsed registration can attract a penalty set by the state. Renew before it ends.',
  clra: 'Engaging contract labour without a valid licence can be an offence. Ask your advisor before using contractors again.',
  posh: 'Missing the annual report can attract a penalty. Ask your advisor.',
  gratuity: 'Late gratuity payment can attract interest. Ask your advisor.',
  bonus: 'A late bonus can attract interest. Ask your advisor.',
  generic: 'Ask your advisor what being late would cost for this item.',
};

export const ATTACHMENT_CHOICES: Record<TaskKind, string[]> = (() => {
  const base = ['Working file or sheet from Autopilot', 'Challan or payment receipt', 'Acknowledgement from the portal'];
  const renewal = ['Renewal application', 'Renewed certificate or licence copy', 'Fee receipt'];
  return {
    pf: ['ECR text file', 'Challan or payment receipt', 'Acknowledgement from the portal'], esi: base, pt: base, lwf: base, tds_deposit: base, tds_return: ['Return file', 'Challan statement', 'Acknowledgement from the portal'],
    shops: renewal, clra: renewal, posh: ['Annual report', 'Acknowledgement of submission'], gratuity: base, bonus: base, generic: ['Notes or minutes', 'Updated configuration screenshot'],
  } as Record<TaskKind, string[]>;
})();

// ───────────────────────────── prepare ─────────────────────────────
export interface Artefact {
  kind: 'ecr' | 'sheet' | 'list';
  title: string;
  filename?: string;
  /** ECR text. */
  text?: string;
  header?: string[];
  rows?: (string | number)[][];
  summary: { label: string; value: string }[];
  issues: { employeeId: Id; reason: string; excluded: boolean }[];
  note: string;
  /** For a checklist: what to bring or do. */
  items?: string[];
}

const NOT_PORTAL = 'This is a working sheet from your payroll data. It is not the portal\'s upload format: copy the figures into the portal or its template.';

export function prepareArtefact(db: HrmsDb, task: ComplianceTask, manual: Record<string, boolean> = {}, today: ISODate = PREVIEW_TODAY): Artefact {
  const r = readinessFor(db, task, manual, today);
  const entity = db.entities.find((e) => e.id === task.entityId);
  const month = r.wageMonth;
  const slug = `${(entity?.name ?? 'entity').split(' ')[0]!.toLowerCase()}-${month ?? task.dueOn.slice(0, 7)}`;
  const slips = r.run?.payslips ?? [];
  const emp = (id: Id) => db.employees.find((e) => e.id === id)!;
  const code = (ls: { code: string; amount: number }[], k: string) => ls.find((l) => l.code === k)?.amount ?? 0;
  const noRun = (): Artefact => ({
    kind: 'list', title: `${KIND_LABEL[r.kind]}: nothing to build yet`, summary: [], issues: [],
    note: `There is no pay run for ${month ? fmtMonth(month) : 'this month'}, so there is no data to build the file from.`, items: [`Run and freeze payroll for ${month ? fmtMonth(month) : 'the month'} first.`],
  });

  if (r.kind === 'pf') {
    if (!r.run) return noRun();
    const ecr = buildEcr(db, r.run);
    const members = slips.filter((s) => emp(s.employeeId)?.pfMember);
    const total = (f: (s: Payslip) => number) => members.reduce((t, s) => t + f(s), 0);
    const employee = total((s) => code(s.deductions, 'PF'));
    const employerEpf = total((s) => code(s.employer, 'EPF_ER'));
    const employerEps = total((s) => code(s.employer, 'EPS_ER'));
    const edli = total((s) => code(s.employer, 'EDLI'));
    const admin = total((s) => code(s.employer, 'PF_ADM'));
    return {
      kind: 'ecr', title: `ECR for ${fmtMonth(r.run.month)}`, filename: `ECR-${slug}.txt`, text: ecr.text,
      summary: [
        { label: 'Rows in the file', value: `${ecr.rows} of ${members.length} members` },
        { label: 'Employee share', value: inr(employee) }, { label: 'Employer EPF share', value: inr(employerEpf) }, { label: 'Employer EPS share', value: inr(employerEps) },
        { label: 'EDLI', value: inr(edli) }, { label: 'Admin charges', value: inr(admin) }, { label: 'Total to deposit', value: inr(employee + employerEpf + employerEps + edli + admin) },
      ],
      issues: ecr.blocked.map((b) => ({ employeeId: b.employeeId, reason: `${b.reason}. Left out of the file.`, excluded: true })),
      note: 'Built with the same ECR helper the Statutory page uses (separator #~#). Check it against the format the EPFO portal accepts today before you upload.',
    };
  }

  if (r.kind === 'esi') {
    if (!r.run) return noRun();
    const cov = slips.filter(hasEsi);
    const rows = cov.filter((s) => emp(s.employeeId)?.esicIp).map((s) => [emp(s.employeeId)!.esicIp!, emp(s.employeeId)!.code, fullName(emp(s.employeeId)!), s.paidDays, s.wages.esiWage, code(s.deductions, 'ESI'), code(s.employer, 'ESI_ER')]);
    return {
      kind: 'sheet', title: `ESI contribution sheet, ${fmtMonth(r.run.month)}`, filename: `esi-sheet-${slug}.csv`,
      header: ['IP number', 'Employee code', 'Name', 'Days paid', 'ESI wages', 'Employee contribution', 'Employer contribution'], rows,
      summary: [{ label: 'People', value: String(rows.length) }, { label: 'Employee share', value: inr(rows.reduce((t, x) => t + Number(x[5]), 0)) }, { label: 'Employer share', value: inr(rows.reduce((t, x) => t + Number(x[6]), 0)) }],
      issues: cov.filter((s) => !emp(s.employeeId)?.esicIp).map((s) => ({ employeeId: s.employeeId, reason: 'No ESIC number. Left out of the sheet.', excluded: true })),
      note: NOT_PORTAL,
    };
  }

  if (r.kind === 'pt') {
    if (!r.run) return noRun();
    const mine = slips.filter((s) => db.locations.find((l) => l.id === emp(s.employeeId)?.locationId)?.state === task.state && code(s.deductions, 'PT') > 0);
    const rows = mine.map((s) => [emp(s.employeeId)!.code, fullName(emp(s.employeeId)!), s.gross, code(s.deductions, 'PT')]);
    return {
      kind: 'sheet', title: `Professional tax sheet, ${task.state ?? ''} ${fmtMonth(r.run.month)}`, filename: `pt-sheet-${slug}.csv`, header: ['Employee code', 'Name', 'Gross pay', 'Professional tax'], rows,
      summary: [{ label: 'People paying', value: String(rows.length) }, { label: 'Total', value: inr(rows.reduce((t, x) => t + Number(x[3]), 0)) }], issues: [],
      note: `${NOT_PORTAL} Each state has its own challan and return.`,
    };
  }

  if (r.kind === 'lwf') {
    const month = task.dueOn.slice(0, 7);
    const mine = slipsForMonth(cleanCopy(db), month).filter((s) => db.employees.find((e) => e.id === s.employeeId)?.entityId === task.entityId && db.locations.find((l) => l.id === emp(s.employeeId)?.locationId)?.state === task.state && code(s.deductions, 'LWF') > 0);
    const rows = mine.map((s) => [emp(s.employeeId)!.code, fullName(emp(s.employeeId)!), code(s.deductions, 'LWF'), code(s.employer, 'LWF_ER')]);
    return {
      kind: 'sheet', title: `Labour welfare fund sheet, ${task.state ?? ''} ${fmtMonth(month)}`, filename: `lwf-sheet-${slug}.csv`, header: ['Employee code', 'Name', 'Employee share', 'Employer share'], rows,
      summary: [{ label: 'People', value: String(rows.length) }, { label: 'Employee share', value: inr(rows.reduce((t, x) => t + Number(x[2]), 0)) }, { label: 'Employer share', value: inr(rows.reduce((t, x) => t + Number(x[3]), 0)) }], issues: [],
      note: `Projected from current salary data, because the ${fmtMonth(month)} run does not exist yet. ${NOT_PORTAL}`,
    };
  }

  if (r.kind === 'tds_deposit') {
    if (!r.run) return noRun();
    const mine = slips.filter((s) => code(s.deductions, 'TDS') > 0);
    const rows = mine.map((s) => [emp(s.employeeId)!.code, fullName(emp(s.employeeId)!), emp(s.employeeId)!.pan ?? '', emp(s.employeeId)!.taxRegime, s.wages.taxableMonthly, code(s.deductions, 'TDS')]);
    return {
      kind: 'sheet', title: `TDS working sheet, ${fmtMonth(r.run.month)}`, filename: `tds-sheet-${slug}.csv`, header: ['Employee code', 'Name', 'PAN', 'Regime', 'Taxable pay this month', 'TDS'], rows,
      summary: [{ label: 'People with TDS', value: String(rows.length) }, { label: 'TDS to deposit', value: inr(rows.reduce((t, x) => t + Number(x[5]), 0)) }],
      issues: mine.filter((s) => !emp(s.employeeId)?.pan).map((s) => ({ employeeId: s.employeeId, reason: 'No PAN. TDS goes at the higher rate.', excluded: false })),
      note: `${NOT_PORTAL} The challan itself is made on the tax portal or in the bank.`,
    };
  }

  if (r.kind === 'bonus') {
    const rows = bonusEligible(db).map((x) => [x.employee.code, fullName(x.employee), Math.round(x.wages), db.adjustments.some((a) => a.employeeId === x.employee.id && a.kind === 'bonus') ? 'Yes' : 'No']);
    return {
      kind: 'sheet', title: 'Bonus eligibility list', filename: 'bonus-eligibility.csv', header: ['Employee code', 'Name', 'Monthly wages', 'Bonus entered'], rows,
      summary: [{ label: 'Eligible people', value: String(rows.length) }, { label: 'Ceiling', value: inr(LABOUR_CODES.bonus.eligibilityCeiling) }], issues: [],
      note: 'A list of who is under the eligibility ceiling. It does not work out the bonus: the percentage is a decision for you and your advisor.',
    };
  }

  return {
    kind: 'list', title: `${KIND_LABEL[r.kind]}: checklist`, summary: [], issues: [],
    note: 'This filing is done on a government portal or by hand, and the preview holds no data that could build it honestly. So there is no file, only the checklist.',
    items: r.checks.map((k) => k.label),
  };
}
