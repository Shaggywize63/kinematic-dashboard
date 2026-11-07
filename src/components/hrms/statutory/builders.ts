// Pure builders shared by the Statutory page and the Reports pages: statements, registers, Form 130, calendar logic.
// No React here. Every number comes from the sample data or from lib/hrms/engine.ts, so a report and the matching
// statutory download can never disagree.

import type {
  ComplianceTask, Employee, HrmsDb, ISODate, LegalEntity, Month, PayRun, Payslip, PayslipLine,
} from '../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import {
  addMonths, diffDays, financialYear, fmtDate, fmtMonth, fmtMonthLong, fullName,
} from '../../../lib/hrms/format';
import { CALENDAR_RULES, isMetroCity, monthEnd, type CalendarRule } from '../../../lib/hrms/rules';
import {
  annualTax, buildBreakup, buildEcr, computePayslip, employeesForRun,
} from '../../../lib/hrms/engine';

export const PREVIEW_MONTH: Month = PREVIEW_TODAY.slice(0, 7);
export const monthName = (m: Month): string => fmtMonthLong(m).split(' ')[0]!;
const pad2 = (n: number) => String(n).padStart(2, '0');

export type Cell = string | number;

export const lineAmount = (ls: PayslipLine[], code: string): number => ls.find((l) => l.code === code)?.amount ?? 0;

/** CSV text with the same quoting as downloadRows (used where a CSV goes into a zip instead of a direct download). */
export function toCsv(header: string[], rows: (Cell | null | undefined)[][]): string {
  const esc = (v: unknown) => { const s = v == null ? '' : String(v).replace(/"/g, '""'); return /[",\n]/.test(s) ? `"${s}"` : s; };
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

// ───────────────────────────────── calendar ─────────────────────────────────
export type DerivedStatus = 'overdue' | 'due_soon' | 'upcoming' | 'filed';
export const DUE_SOON_DAYS = 7;

/** The status from the due date against the preview's today. The stored status is not trusted; filed stays filed. */
export function derivedStatus(t: ComplianceTask, today: ISODate = PREVIEW_TODAY): DerivedStatus {
  if (t.status === 'filed' || t.filedOn) return 'filed';
  const d = diffDays(today, t.dueOn);
  if (d < 0) return 'overdue';
  if (d <= DUE_SOON_DAYS) return 'due_soon';
  return 'upcoming';
}

export interface Suggestion {
  key: string;
  rule: CalendarRule;
  entity: LegalEntity;
  state?: string;
  name: string;
  dueOn: ISODate;
  exists: boolean;
}

/** Dues for next month, generated from CALENDAR_RULES for each entity that has the matching registration. */
export function suggestedDues(db: HrmsDb, today: ISODate = PREVIEW_TODAY): { month: Month; items: Suggestion[] } {
  const dueMonth = addMonths(today.slice(0, 7), 1);
  const period = addMonths(dueMonth, -1); // the pay month the payment relates to
  const items: Suggestion[] = [];
  for (const entity of db.entities) {
    for (const rule of CALENDAR_RULES) {
      const dueOn = `${dueMonth}-${pad2(rule.dayOfMonth)}`;
      const base = { rule, entity, dueOn };
      const has = (type: string) => entity.registrations.filter((r) => r.type === type);
      const push = (name: string, state?: string) => {
        const exists = db.compliance.some((c) => c.law === rule.law && c.entityId === entity.id && c.dueOn === dueOn && (c.state ?? '') === (state ?? ''));
        items.push({ ...base, key: `${entity.id}:${rule.law}:${state ?? ''}`, name, state, exists });
      };
      if (rule.law === 'TDS' && entity.tan) push(`TDS deposit for ${monthName(period)}`);
      else if (rule.law === 'PF' && has('pf').length) push(`PF contribution and ECR for ${monthName(period)}`);
      else if (rule.law === 'ESI' && has('esi').length) push(`ESI contribution for ${monthName(period)}`);
      else if (rule.law === 'PT') for (const reg of has('pt')) push(`Professional tax, ${reg.state}, ${monthName(period)}`, reg.state);
    }
  }
  return { month: dueMonth, items };
}

// ───────────────────────────────── pay runs ─────────────────────────────────
export const closedRuns = (db: HrmsDb): PayRun[] =>
  db.payRuns.filter((r) => (r.status === 'frozen' || r.status === 'paid') && r.payslips.length > 0)
    .sort((a, b) => b.month.localeCompare(a.month) || a.entityId.localeCompare(b.entityId));

export const entityName = (db: HrmsDb, id: string): string => db.entities.find((e) => e.id === id)?.name ?? id;
export const deptName = (db: HrmsDb, id: string): string => db.departments.find((d) => d.id === id)?.name ?? '—';
export const locationName = (db: HrmsDb, id: string): string => db.locations.find((l) => l.id === id)?.name ?? '—';
export const employeeOf = (db: HrmsDb, id: string): Employee | undefined => db.employees.find((e) => e.id === id);

/** Latest month that has a computed, frozen or paid run (the default for payroll reports). */
export function latestRunMonth(db: HrmsDb): Month {
  const ms = db.payRuns.filter((r) => r.payslips.length > 0 && r.status !== 'draft').map((r) => r.month).sort();
  return ms[ms.length - 1] ?? addMonths(PREVIEW_MONTH, -1);
}
export function runsFor(db: HrmsDb, month: Month, entityId = 'all', statuses: PayRun['status'][] = ['computed', 'frozen', 'paid']): PayRun[] {
  return db.payRuns.filter((r) => r.month === month && (entityId === 'all' || r.entityId === entityId) && statuses.includes(r.status) && r.payslips.length > 0);
}

// ───────────────────────────── statements from a run ─────────────────────────
export interface EsiRow { id: string; code: string; name: string; esic: string; days: number; gross: number; esiWage: number; employee: number; employer: number; total: number }
export function esiRows(db: HrmsDb, run: PayRun): EsiRow[] {
  const out: EsiRow[] = [];
  for (const s of run.payslips) {
    const e = employeeOf(db, s.employeeId);
    if (!e) continue;
    const employee = lineAmount(s.deductions, 'ESI');
    const employer = lineAmount(s.employer, 'ESI_ER');
    if (!employee && !employer) continue;
    out.push({ id: s.id, code: e.code, name: fullName(e), esic: e.esicIp ?? '', days: s.paidDays, gross: s.gross, esiWage: s.wages.esiWage, employee, employer, total: employee + employer });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

export interface PtRow { id: string; state: string; code: string; name: string; gender: string; gross: number; pt: number }
export function ptRows(db: HrmsDb, run: PayRun): PtRow[] {
  const out: PtRow[] = [];
  for (const s of run.payslips) {
    const e = employeeOf(db, s.employeeId);
    const pt = lineAmount(s.deductions, 'PT');
    if (!e || !pt) continue;
    const state = db.locations.find((l) => l.id === e.locationId)?.state ?? '—';
    out.push({ id: s.id, state, code: e.code, name: fullName(e), gender: e.gender, gross: s.gross, pt });
  }
  return out.sort((a, b) => a.state.localeCompare(b.state) || a.code.localeCompare(b.code));
}

export interface TdsRow { id: string; code: string; name: string; pan: string; regime: string; gross: number; taxable: number; tds: number }
export function tdsRows(db: HrmsDb, run: PayRun): TdsRow[] {
  const out: TdsRow[] = [];
  for (const s of run.payslips) {
    const e = employeeOf(db, s.employeeId);
    if (!e) continue;
    const taxable = s.earnings.filter((l) => l.taxable).reduce((t, l) => t + l.amount, 0);
    out.push({ id: s.id, code: e.code, name: fullName(e), pan: e.pan ?? '', regime: e.taxRegime, gross: s.gross, taxable, tds: lineAmount(s.deductions, 'TDS') });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

export interface PfRow { id: string; code: string; uan: string; name: string; pfWage: number; employee: number; eps: number; epf: number; edli: number; admin: number; ecr: string }
export function pfRows(db: HrmsDb, run: PayRun): PfRow[] {
  const blocked = new Map(buildEcr(db, run).blocked.map((b) => [b.employeeId, b.reason]));
  const out: PfRow[] = [];
  for (const s of run.payslips) {
    const e = employeeOf(db, s.employeeId);
    if (!e || !e.pfMember) continue;
    out.push({
      id: s.id, code: e.code, uan: e.uan ?? '', name: fullName(e), pfWage: s.wages.pfWage,
      employee: lineAmount(s.deductions, 'PF'), eps: lineAmount(s.employer, 'EPS_ER'), epf: lineAmount(s.employer, 'EPF_ER'),
      edli: lineAmount(s.employer, 'EDLI'), admin: lineAmount(s.employer, 'PF_ADM'), ecr: blocked.get(e.id) ?? 'In ECR',
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

export const sumBy = <R,>(rows: R[], f: (r: R) => number): number => rows.reduce((t, r) => t + f(r), 0);

// ───────────────────────────────── tax helpers ───────────────────────────────
/** A clean month of pay for an employee under today's rules: no adjustments, loans or loss of pay. */
export function regularPayslip(db: HrmsDb, e: Employee, month: Month = PREVIEW_MONTH): Payslip | null {
  const structure = db.structures.find((s) => s.id === e.structureId);
  const location = db.locations.find((l) => l.id === e.locationId);
  if (!structure || !e.annualCtc || !location) return null;
  const shift = db.shifts.find((s) => s.id === e.shiftId);
  return computePayslip({
    employee: e, structure, location, attendance: undefined, adjustments: [], loans: [], overtimeRule: db.overtimeRules[0],
    shiftHours: shift?.fullDayHours ?? 8, month, runId: 'preview',
  });
}

/** The same inputs the payroll engine feeds annualTax, rebuilt from a payslip. */
export function taxFor(db: HrmsDb, e: Employee, slip: Payslip, regime: Employee['taxRegime'], annualGross: number) {
  const location = db.locations.find((l) => l.id === e.locationId);
  const structure = db.structures.find((s) => s.id === e.structureId);
  const asOn = monthEnd(slip.month);
  const breakup = structure && e.annualCtc
    ? buildBreakup(structure, e.annualCtc, { asOn, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides })
    : null;
  const metro = e.employmentType === 'daily_wage' ? false : !!location && (location.metro || isMetroCity(location.city, asOn));
  return annualTax({
    regime, annualGross, basicAnnual: (breakup?.basic ?? 0) * 12, hraAnnual: lineAmount(slip.earnings, 'HRA') * 12, metro,
    employeePfAnnual: lineAmount(slip.deductions, 'PF') * 12, ptAnnual: lineAmount(slip.deductions, 'PT') * 12, declaration: e.declaration,
  });
}

// ─────────────────────────────────── Form 130 ────────────────────────────────
export interface Form130Month {
  month: Month; hasRun: boolean; gross: number; taxable: number; tds: number;
  deposit?: { status: DerivedStatus; reference?: string; filedOn?: ISODate };
}
export interface Form130Doc {
  fyLabel: string; start: Month; end: Month;
  employee: Employee; entity?: LegalEntity; locationState?: string;
  months: Form130Month[];
  earnings: { code: string; name: string; amount: number }[];
  totals: { gross: number; tds: number; pf: number; pt: number; net: number };
  regime: Employee['taxRegime'];
  basis: { regularMonthly: number; regularAnnual: number; oneTime: number; annualGross: number; latestMonth: Month };
  tax: ReturnType<typeof annualTax>;
  balance: number; // tax on the annual basis minus TDS deducted so far (negative = more than the annual tax)
  monthsWithRun: number;
}

const ONE_TIME = ['ARREAR', 'BONUS', 'INCENTIVE', 'OT'];

/** Financial years that have at least one frozen or paid run, newest first. */
export function form130Years(db: HrmsDb): { start: Month; label: string }[] {
  const seen = new Map<Month, string>();
  for (const r of closedRuns(db)) { const fy = financialYear(r.month); seen.set(fy.start, fy.label); }
  return [...seen.entries()].map(([start, label]) => ({ start, label })).sort((a, b) => b.start.localeCompare(a.start));
}

/** Employees who have a payslip in a frozen or paid run of that financial year. */
export function form130Employees(db: HrmsDb, fyStart: Month): Employee[] {
  const fy = financialYear(fyStart);
  const ids = new Set<string>();
  for (const r of closedRuns(db)) if (r.month >= fy.start && r.month <= fy.end) r.payslips.forEach((s) => ids.add(s.employeeId));
  return db.employees.filter((e) => ids.has(e.id)).sort((a, b) => a.code.localeCompare(b.code));
}

export function buildForm130(db: HrmsDb, employeeId: string, fyStart: Month): Form130Doc | null {
  const employee = employeeOf(db, employeeId);
  if (!employee) return null;
  const fy = financialYear(fyStart);
  const entity = db.entities.find((x) => x.id === employee.entityId);
  const locationState = db.locations.find((l) => l.id === employee.locationId)?.state;

  const slips: Payslip[] = [];
  for (const r of closedRuns(db)) {
    if (r.month < fy.start || r.month > fy.end) continue;
    for (const s of r.payslips) if (s.employeeId === employeeId) slips.push(s);
  }
  slips.sort((a, b) => a.month.localeCompare(b.month));
  if (!slips.length) return null;

  // Months of the year up to the preview's month, so months without a run are visible instead of silently missing.
  const months: Form130Month[] = [];
  for (let m = fy.start; m <= fy.end && m <= PREVIEW_MONTH; m = addMonths(m, 1)) {
    const here = slips.filter((s) => s.month === m);
    const task = db.compliance.find((c) => c.law === 'TDS' && c.entityId === employee.entityId && c.name === `TDS deposit for ${monthName(m)}`);
    months.push({
      month: m, hasRun: here.length > 0,
      gross: sumBy(here, (s) => s.gross),
      taxable: sumBy(here, (s) => s.earnings.filter((l) => l.taxable).reduce((t, l) => t + l.amount, 0)),
      tds: sumBy(here, (s) => lineAmount(s.deductions, 'TDS')),
      deposit: here.length && task ? { status: derivedStatus(task), reference: task.reference, filedOn: task.filedOn } : undefined,
    });
  }

  const earningsMap = new Map<string, { code: string; name: string; amount: number }>();
  for (const s of slips) for (const l of s.earnings) {
    const cur = earningsMap.get(l.code);
    if (cur) cur.amount += l.amount; else earningsMap.set(l.code, { code: l.code, name: l.name.replace(/\s*\(.*\)$/, ''), amount: l.amount });
  }

  const latest = slips[slips.length - 1]!;
  const regularMonthly = latest.wages.taxableMonthly;
  const oneTime = sumBy(slips, (s) => s.earnings.filter((l) => l.taxable && ONE_TIME.includes(l.code)).reduce((t, l) => t + l.amount, 0));
  const annualGross = regularMonthly * 12 + oneTime;
  const tax = taxFor(db, employee, latest, employee.taxRegime, annualGross);
  const totals = {
    gross: sumBy(slips, (s) => s.gross),
    tds: sumBy(slips, (s) => lineAmount(s.deductions, 'TDS')),
    pf: sumBy(slips, (s) => lineAmount(s.deductions, 'PF')),
    pt: sumBy(slips, (s) => lineAmount(s.deductions, 'PT')),
    net: sumBy(slips, (s) => s.net),
  };
  return {
    fyLabel: fy.label, start: fy.start, end: fy.end, employee, entity, locationState, months,
    earnings: [...earningsMap.values()], totals, regime: employee.taxRegime,
    basis: { regularMonthly, regularAnnual: regularMonthly * 12, oneTime, annualGross, latestMonth: latest.month },
    tax, balance: tax.total - totals.tds, monthsWithRun: months.filter((m) => m.hasRun).length,
  };
}

// ───────────────────────────────── registers ─────────────────────────────────
export interface RegisterScope { entityId: string; from: Month; to: Month }
export interface RegisterOut { header: string[]; rows: Cell[][] }
export type RegisterKey = 'muster' | 'wage' | 'overtime' | 'leave';

const inScope = (db: HrmsDb, e: Employee | undefined, scope: RegisterScope): e is Employee =>
  !!e && (scope.entityId === 'all' || e.entityId === scope.entityId);
const monthsIn = (from: Month, to: Month): Month[] => { const out: Month[] = []; for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m); return out; };

export function musterRoll(db: HrmsDb, scope: RegisterScope): RegisterOut {
  const header = ['Month', 'Entity', 'Employee code', 'Name', 'Department', 'Days in month', 'Present', 'Paid leave', 'Weekly off', 'Holidays', 'Loss of pay', 'Paid days', 'Month locked'];
  const rows: Cell[][] = [];
  const atts = db.attendance.filter((a) => a.month >= scope.from && a.month <= scope.to)
    .sort((a, b) => a.month.localeCompare(b.month) || (employeeOf(db, a.employeeId)?.code ?? '').localeCompare(employeeOf(db, b.employeeId)?.code ?? ''));
  for (const a of atts) {
    const e = employeeOf(db, a.employeeId);
    if (!inScope(db, e, scope)) continue;
    rows.push([a.month, entityName(db, e.entityId), e.code, fullName(e), deptName(db, e.departmentId), a.daysInMonth, a.presentDays, a.paidLeaveDays, a.weeklyOffs, a.holidays, a.lopDays, a.daysInMonth - a.lopDays, a.locked ? 'Yes' : 'No']);
  }
  return { header, rows };
}

export function wageRegister(db: HrmsDb, scope: RegisterScope): RegisterOut {
  const runs = closedRuns(db).filter((r) => r.month >= scope.from && r.month <= scope.to && (scope.entityId === 'all' || r.entityId === scope.entityId))
    .sort((a, b) => a.month.localeCompare(b.month) || a.entityId.localeCompare(b.entityId));
  const earnCodes: { code: string; name: string }[] = [];
  for (const r of runs) for (const s of r.payslips) for (const l of s.earnings) {
    if (!earnCodes.some((c) => c.code === l.code)) earnCodes.push({ code: l.code, name: l.name.replace(/\s*\(.*\)$/, '') });
  }
  const dedCodes = ['PF', 'ESI', 'PT', 'LWF', 'TDS', 'LOAN', 'DED'];
  const header = ['Month', 'Entity', 'Employee code', 'Name', 'Days in month', 'Paid days', 'Loss of pay', ...earnCodes.map((c) => c.name), 'Gross', ...dedCodes.map((c) => ({ PF: 'PF', ESI: 'ESI', PT: 'Professional tax', LWF: 'LWF', TDS: 'TDS', LOAN: 'Loan / advance', DED: 'Other deductions' }[c] as string)), 'Total deductions', 'Reimbursements', 'Net pay'];
  const rows: Cell[][] = [];
  for (const r of runs) for (const s of [...r.payslips].sort((a, b) => (employeeOf(db, a.employeeId)?.code ?? '').localeCompare(employeeOf(db, b.employeeId)?.code ?? ''))) {
    const e = employeeOf(db, s.employeeId);
    if (!e) continue;
    rows.push([
      r.month, entityName(db, r.entityId), e.code, fullName(e), s.daysInMonth, s.paidDays, s.lopDays,
      ...earnCodes.map((c) => s.earnings.filter((l) => l.code === c.code).reduce((t, l) => t + l.amount, 0)), s.gross,
      ...dedCodes.map((c) => s.deductions.filter((l) => l.code === c).reduce((t, l) => t + l.amount, 0)), s.totalDeductions,
      sumBy(s.reimbursements, (l) => l.amount), s.net,
    ]);
  }
  return { header, rows };
}

const quarterOf = (m: Month): string => `${m.slice(0, 4)}-Q${Math.ceil(Number(m.slice(5, 7)) / 3)}`;

export function overtimeRegister(db: HrmsDb, scope: RegisterScope): RegisterOut {
  const rule = db.overtimeRules[0];
  const header = ['Month', 'Entity', 'Employee code', 'Name', 'Shift', 'Overtime hours', 'Rate (times ordinary)', 'Overtime pay', 'Hours so far this quarter', 'Quarterly cap (hours)', 'Over the cap'];
  const rows: Cell[][] = [];
  const atts = db.attendance.filter((a) => a.month >= scope.from && a.month <= scope.to && a.overtimeHours > 0)
    .sort((a, b) => a.month.localeCompare(b.month) || (employeeOf(db, a.employeeId)?.code ?? '').localeCompare(employeeOf(db, b.employeeId)?.code ?? ''));
  for (const a of atts) {
    const e = employeeOf(db, a.employeeId);
    if (!inScope(db, e, scope)) continue;
    const run = closedRuns(db).find((r) => r.month === a.month && r.entityId === e.entityId);
    const pay = run?.payslips.find((s) => s.employeeId === e.id)?.earnings.find((l) => l.code === 'OT')?.amount;
    const qtd = sumBy(db.attendance.filter((x) => x.employeeId === e.id && quarterOf(x.month) === quarterOf(a.month) && x.month <= a.month), (x) => x.overtimeHours);
    const cap = rule?.quarterlyCapHours ?? 0;
    rows.push([a.month, entityName(db, e.entityId), e.code, fullName(e), db.shifts.find((s) => s.id === e.shiftId)?.name ?? '—', a.overtimeHours, rule?.rateMultiplier ?? '', pay ?? 'Run not frozen', qtd, cap, cap && qtd > cap ? 'Yes' : 'No']);
  }
  return { header, rows };
}

export function leaveRegister(db: HrmsDb, scope: RegisterScope): RegisterOut {
  const header = ['As on', 'Entity', 'Employee code', 'Name', 'Leave type', 'Opening', 'Accrued', 'Taken', 'Encashed', 'Lapsed', 'Balance'];
  const rows: Cell[][] = [];
  const emps = db.employees.filter((e) => inScope(db, e, scope)).sort((a, b) => a.code.localeCompare(b.code));
  for (const e of emps) for (const b of db.leaveBalances.filter((x) => x.employeeId === e.id)) {
    const lt = db.leaveTypes.find((t) => t.id === b.leaveTypeId);
    rows.push([PREVIEW_TODAY, entityName(db, e.entityId), e.code, fullName(e), lt?.name ?? b.leaveTypeId, b.opening, b.accrued, b.taken, b.encashed, b.lapsed, b.opening + b.accrued - b.taken - b.encashed - b.lapsed]);
  }
  return { header, rows };
}

export const REGISTERS: { key: RegisterKey; title: string; file: string; blurb: string; build: (db: HrmsDb, s: RegisterScope) => RegisterOut }[] = [
  { key: 'muster', title: 'Muster roll', file: 'muster-roll', blurb: 'Attendance of every employee for each month: present, leave, weekly offs, holidays and loss of pay. Built from the monthly attendance summaries.', build: musterRoll },
  { key: 'wage', title: 'Wage register', file: 'wage-register', blurb: 'Gross wages by component, deductions and net pay for each employee, taken from frozen or paid pay runs only.', build: wageRegister },
  { key: 'overtime', title: 'Overtime register', file: 'overtime-register', blurb: 'Overtime hours and pay, with the hours so far in the calendar quarter against the cap in the overtime rule.', build: overtimeRegister },
  { key: 'leave', title: 'Leave register', file: 'leave-register', blurb: 'Opening, accrued, taken, encashed and lapsed leave with the balance, as on the preview date.', build: leaveRegister },
];

export interface RegisterStatus {
  key: RegisterKey; title: string; rows: number; range: string; exists: boolean; missing: string[];
}

/** What the inspection pack would contain for a scope, and what is missing from it. */
export function inspectionStatus(db: HrmsDb, scope: RegisterScope): RegisterStatus[] {
  const entities = db.entities.filter((e) => scope.entityId === 'all' || e.id === scope.entityId);
  const attMonths = [...new Set(db.attendance.filter((a) => a.month >= scope.from && a.month <= scope.to && inScope(db, employeeOf(db, a.employeeId), scope)).map((a) => a.month))].sort();
  const range = (ms: string[]) => (ms.length ? (ms[0] === ms[ms.length - 1] ? monthLabel(ms[0]!) : `${monthLabel(ms[0]!)} to ${monthLabel(ms[ms.length - 1]!)}`) : 'No data in range');
  const monthLabel = fmtMonth;

  const missingMuster: string[] = [];
  for (const m of attMonths) {
    const open = db.attendance.filter((a) => a.month === m && !a.locked && inScope(db, employeeOf(db, a.employeeId), scope)).length;
    if (open) missingMuster.push(`${fmtMonth(m)} is still open: ${open} attendance ${open === 1 ? 'summary is' : 'summaries are'} not locked.`);
    for (const ent of entities) {
      const expected = employeesForRun(db, m, ent.id);
      const have = new Set(db.attendance.filter((a) => a.month === m).map((a) => a.employeeId));
      const gap = expected.filter((e) => !have.has(e.id)).length;
      if (gap) missingMuster.push(`${fmtMonth(m)}, ${ent.name}: ${gap} ${gap === 1 ? 'employee has' : 'employees have'} no attendance summary.`);
    }
  }

  const runs = closedRuns(db).filter((r) => r.month >= scope.from && r.month <= scope.to && (scope.entityId === 'all' || r.entityId === scope.entityId));
  const wageMonths = [...new Set(runs.map((r) => r.month))].sort();
  const missingWage: string[] = [];
  for (const m of attMonths) for (const ent of entities) {
    if (!employeesForRun(db, m, ent.id).length) continue;
    if (!runs.some((r) => r.month === m && r.entityId === ent.id)) {
      const any = db.payRuns.find((r) => r.month === m && r.entityId === ent.id);
      missingWage.push(`${fmtMonth(m)}, ${ent.name}: ${any ? `the run is ${any.status}, not frozen` : 'no pay run yet'}.`);
    }
  }

  const ot = overtimeRegister(db, scope);
  const otMonths = [...new Set(ot.rows.map((r) => String(r[0])))].sort();
  const missingOt: string[] = [];
  const unpriced = ot.rows.filter((r) => r[7] === 'Run not frozen').length;
  if (unpriced) missingOt.push(`${unpriced} overtime ${unpriced === 1 ? 'row has' : 'rows have'} no pay because the run is not frozen.`);
  const over = ot.rows.filter((r) => r[10] === 'Yes').length;
  if (over) missingOt.push(`${over} ${over === 1 ? 'row is' : 'rows are'} over the quarterly cap.`);
  if (!db.overtimeRules.length) missingOt.push('No overtime rule is set up.');

  const leave = leaveRegister(db, scope);
  const missingLeave: string[] = [];
  const noBal = db.employees.filter((e) => inScope(db, e, scope) && (e.status === 'active' || e.status === 'on_notice') && !db.leaveBalances.some((b) => b.employeeId === e.id)).length;
  if (noBal) missingLeave.push(`${noBal} active ${noBal === 1 ? 'employee has' : 'employees have'} no leave balance rows.`);
  missingLeave.push('Balances are as on the preview date. Year-end snapshots are not stored.');

  return [
    { key: 'muster', title: 'Muster roll', rows: musterRoll(db, scope).rows.length, range: range(attMonths), exists: attMonths.length > 0, missing: missingMuster },
    { key: 'wage', title: 'Wage register', rows: wageRegister(db, scope).rows.length, range: range(wageMonths), exists: wageMonths.length > 0, missing: missingWage },
    { key: 'overtime', title: 'Overtime register', rows: ot.rows.length, range: range(otMonths), exists: otMonths.length > 0, missing: missingOt },
    { key: 'leave', title: 'Leave register', rows: leave.rows.length, range: leave.rows.length ? `As on ${fmtDate(PREVIEW_TODAY)}` : 'No data in range', exists: leave.rows.length > 0, missing: missingLeave },
  ];
}

export { monthsIn };
