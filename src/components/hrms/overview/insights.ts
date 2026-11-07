// Derivations for the HR overview. No React and no storage: every figure is computed from the HrmsDb that is
// passed in and from PREVIEW_TODAY, so what is on screen can be checked against the data
// (e2e/hrms-overview.spec.ts recomputes the headline numbers independently).

import type { ComplianceTask, Employee, HrmsDb, ISODate, LegalEntity, Month, PayRun, Registration } from '../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { addMonths, diffDays, fmtDate, fmtMonth, fullName } from '../../../lib/hrms/format';
import { addWorkingDays, employeesForRun, runTotals } from '../../../lib/hrms/engine';
import { LABOUR_CODES } from '../../../lib/hrms/rules';
import { checkAccount, checkIfsc, checkPan, checkUan } from '../../../lib/hrms/validators';

export const TODAY: ISODate = PREVIEW_TODAY;
export const THIS_MONTH: Month = PREVIEW_TODAY.slice(0, 7);
/** From this day of the month an unstarted payroll is a warning rather than a heads-up. */
const PAYROLL_WARN_DAY = 25;

export function relDays(n: number): string {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Adds whole months to an ISO date, clamping to the end of a shorter month. */
export function addMonthsToDate(d: ISODate, months: number): ISODate {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
}

/** On the books today: working, or serving notice. */
export const isLive = (e: Employee): boolean => e.status === 'active' || e.status === 'on_notice';

/** People employed on a date, from join and last working dates. Onboarding records never count. */
export function headcountOn(emps: Employee[], on: ISODate): number {
  return emps.filter((e) => {
    if (e.status === 'onboarding' || !e.joinDate || e.joinDate > on) return false;
    if (e.lastWorkingDate) return e.lastWorkingDate >= on;
    return e.status !== 'exited';
  }).length;
}

// ───────────────────────────── statutory data gaps ─────────────────────────────
export interface Gap { key: 'pan' | 'uan' | 'uan_seed' | 'bank'; label: string; effect: string; severity: 'red' | 'warn' }

/** What is missing from an employee's statutory file. The same list feeds the stat and the attention items. */
export function statutoryGaps(e: Employee): Gap[] {
  const gaps: Gap[] = [];
  if (!e.pan) gaps.push({ key: 'pan', label: 'PAN missing', effect: 'TDS goes at the higher rate until a PAN is on file.', severity: 'warn' });
  else if (!checkPan(e.pan).ok) gaps.push({ key: 'pan', label: 'PAN looks invalid', effect: 'The PAN does not match the ABCDE1234F format.', severity: 'warn' });
  if (e.pfMember) {
    if (!e.uan) gaps.push({ key: 'uan', label: 'UAN missing', effect: 'No ECR row can be filed for PF without a UAN.', severity: 'warn' });
    else if (!checkUan(e.uan).ok) gaps.push({ key: 'uan', label: 'UAN looks invalid', effect: 'A UAN is 12 digits.', severity: 'warn' });
    else if (e.uanStatus !== 'aadhaar_seeded') gaps.push({ key: 'uan_seed', label: 'UAN not Aadhaar-seeded', effect: 'The ECR row is blocked until the UAN is seeded.', severity: 'warn' });
  }
  if (e.payMode === 'bank') {
    if (!e.bank) gaps.push({ key: 'bank', label: 'bank account missing', effect: 'Salary cannot be paid by bank transfer.', severity: 'red' });
    else if (!checkAccount(e.bank.accountNumber).ok || !checkIfsc(e.bank.ifsc).ok) gaps.push({ key: 'bank', label: 'bank details invalid', effect: 'The account number or IFSC will be rejected by the bank file.', severity: 'red' });
  }
  return gaps;
}

// ───────────────────────────── compliance ─────────────────────────────
export type DueState = 'filed' | 'overdue' | 'due_soon' | 'upcoming';
export const DUE_SOON_DAYS = 7;
/** Computed from the due date against today, not read from the stored status (which only records "filed"). */
export function dueState(t: ComplianceTask, today: ISODate = TODAY): DueState {
  if (t.status === 'filed') return 'filed';
  const d = diffDays(today, t.dueOn);
  return d < 0 ? 'overdue' : d <= DUE_SOON_DAYS ? 'due_soon' : 'upcoming';
}
export function nextDues(db: HrmsDb, limit = 5): { task: ComplianceTask; state: DueState; days: number }[] {
  return db.compliance.filter((t) => t.status !== 'filed')
    .map((task) => ({ task, state: dueState(task), days: diffDays(TODAY, task.dueOn) }))
    .sort((a, b) => (a.task.dueOn === b.task.dueOn ? a.task.name.localeCompare(b.task.name) : a.task.dueOn < b.task.dueOn ? -1 : 1))
    .slice(0, limit);
}

// ───────────────────────────── payroll ─────────────────────────────
const regularRuns = (db: HrmsDb) => db.payRuns.filter((r) => r.type === 'regular');

/** The latest month that has a computed run, with the employer cost summed over its entities. */
export function latestPayroll(db: HrmsDb): { month: Month; cost: number; net: number; payslips: number; runs: number } | null {
  const done = regularRuns(db).filter((r) => r.payslips.length > 0);
  if (!done.length) return null;
  const month = done.map((r) => r.month).sort().pop()!;
  const runs = done.filter((r) => r.month === month);
  const totals = runs.map(runTotals);
  return { month, cost: totals.reduce((s, t) => s + t.employerCost, 0), net: totals.reduce((s, t) => s + t.net, 0), payslips: totals.reduce((s, t) => s + t.headcount, 0), runs: runs.length };
}

export type PayrollState = 'not_started' | PayRun['status'];
export interface EntityPayroll {
  entity: LegalEntity; month: Month; state: PayrollState; run?: PayRun; employees: number; net?: number; payslips?: number;
  action: { label: string; kind: 'start' | 'open' };
}
const NEXT_ACTION: Record<PayrollState, EntityPayroll['action']> = {
  not_started: { label: 'Start run', kind: 'start' },
  draft: { label: 'Compute payroll', kind: 'open' },
  computed: { label: 'Review and freeze', kind: 'open' },
  frozen: { label: 'Mark as paid', kind: 'open' },
  paid: { label: 'View run', kind: 'open' },
};
export const PAYROLL_LABEL: Record<PayrollState, string> = { not_started: 'Not started', draft: 'Draft', computed: 'Computed', frozen: 'Frozen', paid: 'Paid' };

/** The current month's regular run for each legal entity that has people to pay. */
export function entityPayroll(db: HrmsDb, month: Month = THIS_MONTH): EntityPayroll[] {
  return db.entities.map((entity) => {
    const employees = employeesForRun(db, month, entity.id).length;
    const run = regularRuns(db).find((r) => r.month === month && r.entityId === entity.id);
    const state: PayrollState = run ? run.status : 'not_started';
    const t = run && run.payslips.length ? runTotals(run) : undefined;
    return { entity, month, state, run, employees, net: t?.net, payslips: t?.headcount, action: NEXT_ACTION[state] };
  }).filter((p) => p.employees > 0 || p.run);
}

export interface TrendPoint { month: Month; label: string; total: number; byEntity: Record<string, number>; hasRun: boolean }
/** Employer cost per month for the six months up to and including the current one, split by legal entity. */
export function payrollTrend(db: HrmsDb, months = 6): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = addMonths(THIS_MONTH, -i);
    const byEntity: Record<string, number> = {};
    let hasRun = false;
    for (const r of regularRuns(db).filter((x) => x.month === month && x.payslips.length > 0)) {
      byEntity[r.entityId] = (byEntity[r.entityId] ?? 0) + runTotals(r).employerCost;
      hasRun = true;
    }
    out.push({ month, label: fmtMonth(month).slice(0, 3), total: Object.values(byEntity).reduce((s, n) => s + n, 0), byEntity, hasRun });
  }
  return out;
}

// ───────────────────────────── headline numbers ─────────────────────────────
export interface OverviewStats {
  headcount: number; active: number; onNotice: number;
  joiners: { count: number; yetToJoin: number };
  leavers: { count: number; alreadyLeft: number };
  attrition: { pct: number | null; leavers: number; avgHeadcount: number };
  payroll: ReturnType<typeof latestPayroll>;
  dues: { open: number; overdue: number; dueSoon: number };
  gaps: { employees: number; items: number };
}

export function overviewStats(db: HrmsDb): OverviewStats {
  const emps = db.employees;
  const live = emps.filter(isLive);
  const joinersList = emps.filter((e) => e.joinDate.slice(0, 7) === THIS_MONTH);
  const leaversList = emps.filter((e) => e.lastWorkingDate?.slice(0, 7) === THIS_MONTH);

  // Trailing 12 months: leavers over the average of the opening and closing headcount.
  const from: ISODate = `${Number(TODAY.slice(0, 4)) - 1}${TODAY.slice(4)}`; // the same day, a year earlier
  const left12 = emps.filter((e) => e.status === 'exited' && e.lastWorkingDate && e.lastWorkingDate > from);
  const avg = (headcountOn(emps, from) + headcountOn(emps, TODAY)) / 2;

  const unfiled = db.compliance.filter((t) => t.status !== 'filed');
  const gapEmps = live.filter((e) => statutoryGaps(e).length > 0);

  return {
    headcount: live.length,
    active: emps.filter((e) => e.status === 'active').length,
    onNotice: emps.filter((e) => e.status === 'on_notice').length,
    joiners: { count: joinersList.length, yetToJoin: joinersList.filter((e) => e.joinDate > TODAY).length },
    leavers: { count: leaversList.length, alreadyLeft: leaversList.filter((e) => (e.lastWorkingDate ?? '') <= TODAY).length },
    attrition: { pct: avg > 0 ? (left12.length / avg) * 100 : null, leavers: left12.length, avgHeadcount: avg },
    payroll: latestPayroll(db),
    dues: {
      open: unfiled.filter((t) => diffDays(TODAY, t.dueOn) <= 30).length,
      overdue: unfiled.filter((t) => dueState(t) === 'overdue').length,
      dueSoon: unfiled.filter((t) => dueState(t) === 'due_soon').length,
    },
    gaps: { employees: gapEmps.length, items: gapEmps.reduce((s, e) => s + statutoryGaps(e).length, 0) },
  };
}

// ───────────────────────────── needs attention ─────────────────────────────
export type Severity = 'red' | 'warn' | 'info';
export interface AttentionItem { id: string; severity: Severity; area: string; title: string; detail: string; href: string }
const SEV_ORDER: Record<Severity, number> = { red: 0, warn: 1, info: 2 };

const REG_LABEL: Record<Registration['type'], string> = {
  pf: 'PF code', esi: 'ESIC code', pt: 'Professional tax registration', lwf: 'Labour welfare fund registration', shops: 'Shops and Establishments registration',
  clra: 'CLRA licence', tan: 'TAN', gst: 'GST registration',
};
export const REGISTRATION_WARN_DAYS = 60;
export const LOOKAHEAD_DAYS = 30;

export function attentionItems(db: HrmsDb): AttentionItem[] {
  const items: AttentionItem[] = [];
  const entityName = (id: string) => db.entities.find((e) => e.id === id)?.name ?? 'Unknown entity';
  const live = db.employees.filter(isLive);

  // 1. Statutory file gaps, one item per person.
  for (const e of live) {
    const gaps = statutoryGaps(e);
    if (!gaps.length) continue;
    items.push({
      id: `stat:${e.id}`, severity: gaps.some((g) => g.severity === 'red') ? 'red' : 'warn', area: 'Statutory data',
      title: `${fullName(e)}: ${gaps.map((g) => g.label).join(', ')}`,
      detail: gaps.map((g) => g.effect).join(' '),
      href: `/dashboard/hrms/employees/${e.id}?tab=statutory`,
    });
  }

  // 2. Registrations that have lapsed or are about to.
  for (const ent of db.entities) {
    for (const r of ent.registrations) {
      if (!r.validTo) continue;
      const d = diffDays(TODAY, r.validTo);
      if (d > REGISTRATION_WARN_DAYS) continue;
      const what = `${REG_LABEL[r.type]}${r.state ? ` (${r.state})` : ''}`;
      items.push({
        id: `reg:${ent.id}:${r.id}`, severity: d < 0 ? 'red' : 'warn', area: 'Registrations',
        title: `${ent.name}: ${what} ${d < 0 ? 'expired' : 'expires'} ${fmtDate(r.validTo)}`,
        detail: d < 0 ? `Lapsed ${plural(-d, 'day')} ago. Renew it and update the validity date.` : `Expires ${relDays(d)}. Start the renewal.`,
        href: '/dashboard/hrms/organization',
      });
    }
  }

  // 3. Compliance dues that are overdue or close.
  for (const t of db.compliance) {
    const s = dueState(t);
    if (s !== 'overdue' && s !== 'due_soon') continue;
    const d = diffDays(TODAY, t.dueOn);
    items.push({
      id: `cmp:${t.id}`, severity: s === 'overdue' ? 'red' : 'warn', area: 'Compliance',
      title: t.name,
      detail: `${entityName(t.entityId)}. ${s === 'overdue' ? `Overdue by ${plural(-d, 'day')}` : `Due ${relDays(d)}`} (${fmtDate(t.dueOn)}).`,
      href: '/dashboard/hrms/statutory',
    });
  }

  // 4. Payroll for this month, and earlier months left open.
  for (const p of entityPayroll(db)) {
    const late = Number(TODAY.slice(8, 10)) >= PAYROLL_WARN_DAY;
    if (p.state === 'not_started') {
      items.push({ id: `pay:${p.entity.id}:${p.month}`, severity: late ? 'warn' : 'info', area: 'Payroll', title: `${fmtMonth(p.month)} payroll not started for ${p.entity.name}`, detail: `${plural(p.employees, 'person', 'people')} to pay. Start the run, then compute and freeze it.`, href: '/dashboard/hrms/payroll' });
    } else if (p.state !== 'paid') {
      items.push({ id: `pay:${p.entity.id}:${p.month}`, severity: late ? 'warn' : 'info', area: 'Payroll', title: `${fmtMonth(p.month)} payroll for ${p.entity.name} is ${p.state}, not closed`, detail: `Next step: ${p.action.label.toLowerCase()}.`, href: '/dashboard/hrms/payroll' });
    }
  }
  for (const r of regularRuns(db).filter((x) => x.month < THIS_MONTH && x.status !== 'paid')) {
    items.push({ id: `payold:${r.id}`, severity: 'warn', area: 'Payroll', title: `${fmtMonth(r.month)} payroll for ${entityName(r.entityId)} is still ${r.status}`, detail: 'An earlier month should be closed before the next run.', href: '/dashboard/hrms/payroll' });
  }

  // 5. Exits: pending clearance, and settlements that are late.
  for (const x of db.exits) {
    if (x.stage === 'closed') continue;
    const e = db.employees.find((y) => y.id === x.employeeId);
    if (!e) continue;
    const pending = x.clearance.filter((c) => !c.done);
    const d = diffDays(TODAY, x.lastWorkingDate);
    if ((x.stage === 'notice' || x.stage === 'clearance') && pending.length > 0) {
      items.push({
        id: `exit:${x.id}`, severity: d < 0 ? 'red' : d <= 14 ? 'warn' : 'info', area: 'Exits',
        title: `${fullName(e)}: ${pending.length} of ${x.clearance.length} clearances pending`,
        detail: `Last working day ${fmtDate(x.lastWorkingDate)} (${relDays(d)}). Waiting on ${pending.map((c) => c.department).join(', ')}.`,
        href: '/dashboard/hrms/lifecycle?tab=exits',
      });
    }
    const due = addWorkingDays(x.lastWorkingDate, LABOUR_CODES.settlementWorkingDays);
    const f = db.fnfCases.filter((c) => c.employeeId === x.employeeId).sort((a, b) => (a.lastWorkingDate < b.lastWorkingDate ? 1 : -1))[0];
    if (due < TODAY && f?.status !== 'paid') {
      items.push({ id: `fnf:${x.id}`, severity: 'red', area: 'Exits', title: `${fullName(e)}: full and final settlement overdue`, detail: `It was due ${fmtDate(due)}, ${plural(diffDays(due, TODAY), 'day')} ago (two working days after the last working day).`, href: '/dashboard/hrms/lifecycle?tab=exits' });
    }
  }

  // 6. Probation and fixed-term contracts that end soon.
  for (const e of live) {
    if (e.status === 'active') {
      const end = e.confirmationDate ?? addMonthsToDate(e.joinDate, e.probationMonths);
      if (end && end >= TODAY && diffDays(TODAY, end) <= LOOKAHEAD_DAYS) {
        const d = diffDays(TODAY, end);
        items.push({ id: `prob:${e.id}`, severity: d <= 14 ? 'warn' : 'info', area: 'Probation', title: `${fullName(e)}: probation ends ${fmtDate(end)}`, detail: `${relDays(d)}. Confirm, extend or end the probation.`, href: `/dashboard/hrms/employees/${e.id}?tab=employment` });
      }
    }
    if ((e.employmentType === 'fixed_term' || e.employmentType === 'contract') && e.contractEndDate) {
      const d = diffDays(TODAY, e.contractEndDate);
      if (d <= LOOKAHEAD_DAYS) {
        const kind = e.employmentType === 'fixed_term' ? 'Fixed-term contract' : 'Contract';
        items.push({
          id: `contract:${e.id}`, severity: d < 0 ? 'red' : 'warn', area: 'Contracts',
          title: `${fullName(e)}: ${kind.toLowerCase()} ${d < 0 ? 'ended' : 'ends'} ${fmtDate(e.contractEndDate)}`,
          detail: d < 0 ? `Ended ${plural(-d, 'day')} ago and the employee is still on the rolls.` : `${relDays(d)}. Renew it or start an exit.`,
          href: `/dashboard/hrms/employees/${e.id}?tab=employment`,
        });
      }
    }
  }

  // 7. Joiners close to their date with open tasks.
  for (const c of db.onboarding) {
    if (c.stage === 'done') continue;
    const open = c.tasks.filter((t) => !t.done).length;
    const d = diffDays(TODAY, c.joinDate);
    if (open > 0 && d <= 14) {
      items.push({
        id: `onb:${c.id}`, severity: d < 0 ? 'red' : d <= 7 ? 'warn' : 'info', area: 'Onboarding',
        title: `${c.name}: ${open} of ${c.tasks.length} joining tasks open`,
        detail: d < 0 ? `The join date ${fmtDate(c.joinDate)} has passed and the case is not marked joined.` : `Joins ${fmtDate(c.joinDate)} (${relDays(d)}).`,
        href: '/dashboard/hrms/lifecycle?tab=onboarding',
      });
    }
  }

  return items.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.area.localeCompare(b.area) || a.title.localeCompare(b.title));
}

// ───────────────────────────── distributions and events ─────────────────────────────
export function headcountBy(db: HrmsDb, by: 'department' | 'location'): { id: string; label: string; count: number }[] {
  const live = db.employees.filter(isLive);
  const rows = by === 'department'
    ? db.departments.map((d) => ({ id: d.id, label: d.name, count: live.filter((e) => e.departmentId === d.id).length }))
    : db.locations.map((l) => ({ id: l.id, label: l.name, count: live.filter((e) => e.locationId === l.id).length }));
  return rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The next time a month/day falls on or after `from` (29 Feb counts as 28 Feb in a common year). */
export function nextOccurrence(iso: ISODate, from: ISODate): ISODate {
  const m = iso.slice(5, 7);
  const d = iso.slice(8, 10);
  const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const on = (y: number) => (m === '02' && d === '29' && !leap(y) ? `${y}-02-28` : `${y}-${m}-${d}`);
  const y = Number(from.slice(0, 4));
  const c = on(y);
  return c >= from ? c : on(y + 1);
}

export interface PeopleEvent { id: string; kind: 'birthday' | 'anniversary'; date: ISODate; days: number; name: string; employeeId: string; years?: number }
/** Birthdays and work anniversaries of current employees in the next `window` days, soonest first. */
export function peopleEvents(db: HrmsDb, window = 30): PeopleEvent[] {
  const out: PeopleEvent[] = [];
  for (const e of db.employees.filter(isLive)) {
    const b = nextOccurrence(e.dob, TODAY);
    if (diffDays(TODAY, b) <= window) out.push({ id: `b:${e.id}`, kind: 'birthday', date: b, days: diffDays(TODAY, b), name: fullName(e), employeeId: e.id });
    const a = nextOccurrence(e.joinDate, TODAY);
    const years = Number(a.slice(0, 4)) - Number(e.joinDate.slice(0, 4));
    if (years >= 1 && diffDays(TODAY, a) <= window) out.push({ id: `a:${e.id}`, kind: 'anniversary', date: a, days: diffDays(TODAY, a), name: fullName(e), employeeId: e.id, years });
  }
  return out.sort((x, y) => x.days - y.days || x.name.localeCompare(y.name));
}
