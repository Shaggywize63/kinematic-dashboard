// Payroll on the server: the one place where the dashboard's payroll shapes meet the HRMS payroll API's.
// Same convention as wire.ts: top-level keys are snake_case with null for "nothing"; nested objects (salary components,
// payslips and their lines, audit rows, the overtime rule, the checks) pass through in the dashboard's own camelCase shape.
// Money and hours are JSON numbers (a numeric string is accepted too, as PostgREST can send one).
//
// Pure: no I/O, no React. The mapping is written to be forgiving about what a field is called (a payslip id may come as
// `employeeId` or `employee_id`) and strict about what the screens receive (always the dashboard's types).

import type {
  Adjustment, AttendanceSummary, CalcType, EmploymentType, FnfCase, Loan, OvertimeRule, PayRun, PayRunStatus, Payslip, PayslipLine, SalaryComponent, SalaryStructure,
} from '../types';
import type { FnfResult, PreRunCheck } from '../engine';
import { arr, blankToNull, bodyFor, bool, isObj, num, str, type Row, type Spec } from './wire';

// ───────────────────────────── salary structures ─────────────────────────────
const KINDS: SalaryComponent['kind'][] = ['earning', 'deduction', 'employer', 'reimbursement'];

function componentFromWire(c: Row): SalaryComponent {
  const calc = isObj(c.calc) ? c.calc : {};
  return {
    id: String(c.id ?? ''), code: String(c.code ?? ''), name: String(c.name ?? ''),
    kind: KINDS.includes(c.kind as SalaryComponent['kind']) ? (c.kind as SalaryComponent['kind']) : 'earning',
    calc: { type: (str(calc.type) ?? 'fixed') as CalcType, value: num(calc.value) ?? 0 },
    isWage: bool(c.isWage), taxable: bool(c.taxable), pfApplicable: bool(c.pfApplicable), esiApplicable: bool(c.esiApplicable), prorate: bool(c.prorate),
    showInPayslip: bool(c.showInPayslip, true),
  };
}

export function structureFromWire(r: Row): SalaryStructure {
  return {
    id: String(r.id), name: String(r.name ?? ''), description: str(r.description), effectiveFrom: str(r.effective_from) ?? '',
    components: arr(r.components).map(componentFromWire),
  };
}

const STRUCTURE_SPECS: Spec[] = [
  { local: 'name', wire: 'name', nullable: false },
  { local: 'description', wire: 'description', nullable: true, out: blankToNull },
  { local: 'effectiveFrom', wire: 'effective_from', nullable: false },
  { local: 'components', wire: 'components', nullable: false },
];
export const structureCreateBody = (s: SalaryStructure): Row => ({ id: s.id, ...bodyFor(STRUCTURE_SPECS, s as unknown as Row).body });
export const structurePatch = (prev: SalaryStructure, next: SalaryStructure) => bodyFor(STRUCTURE_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── attendance (one row per employee and month) ─────────────────────────────
export function attendanceFromWire(r: Row): AttendanceSummary {
  return {
    employeeId: String(r.employee_id ?? ''), month: String(r.month ?? ''), daysInMonth: num(r.days_in_month) ?? 0, presentDays: num(r.present_days) ?? 0,
    paidLeaveDays: num(r.paid_leave_days) ?? 0, weeklyOffs: num(r.weekly_offs) ?? 0, holidays: num(r.holidays) ?? 0, lopDays: num(r.lop_days) ?? 0,
    overtimeHours: num(r.overtime_hours) ?? 0, locked: bool(r.locked),
  };
}
const ATTENDANCE_SPECS: Spec[] = [
  { local: 'daysInMonth', wire: 'days_in_month', nullable: false },
  { local: 'presentDays', wire: 'present_days', nullable: false },
  { local: 'paidLeaveDays', wire: 'paid_leave_days', nullable: false },
  { local: 'weeklyOffs', wire: 'weekly_offs', nullable: false },
  { local: 'holidays', wire: 'holidays', nullable: false },
  { local: 'lopDays', wire: 'lop_days', nullable: false },
  { local: 'overtimeHours', wire: 'overtime_hours', nullable: false },
  { local: 'locked', wire: 'locked', nullable: false },
];
/** The key of an attendance row: the server has one per employee and month, and the dashboard's row carries no id of its own. */
export const attendanceKey = (a: { employeeId: string; month: string }): string => `${a.employeeId}:${a.month}`;
/** Body for PUT /attendance/:employeeId/:month (the employee and month are in the path). Without `prev`, every field. */
export const attendanceBody = (next: AttendanceSummary, prev?: AttendanceSummary) => bodyFor(ATTENDANCE_SPECS, next as unknown as Row, prev as unknown as Row | undefined);

// ───────────────────────────── adjustments ─────────────────────────────
export function adjustmentFromWire(r: Row): Adjustment {
  return {
    id: String(r.id), employeeId: String(r.employee_id ?? ''), month: String(r.month ?? ''), kind: (str(r.kind) ?? 'bonus') as Adjustment['kind'],
    amount: num(r.amount) ?? 0, taxable: bool(r.taxable), note: str(r.note),
  };
}
const ADJUSTMENT_SPECS: Spec[] = [
  { local: 'employeeId', wire: 'employee_id', nullable: false },
  { local: 'month', wire: 'month', nullable: false },
  { local: 'kind', wire: 'kind', nullable: false },
  { local: 'amount', wire: 'amount', nullable: false },
  { local: 'taxable', wire: 'taxable', nullable: false },
  { local: 'note', wire: 'note', nullable: true, out: blankToNull },
];
export const adjustmentCreateBody = (a: Adjustment): Row => ({ id: a.id, ...bodyFor(ADJUSTMENT_SPECS, a as unknown as Row).body });
export const adjustmentPatch = (prev: Adjustment, next: Adjustment) => bodyFor(ADJUSTMENT_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── loans and advances ─────────────────────────────
export function loanFromWire(r: Row): Loan {
  return {
    id: String(r.id), employeeId: String(r.employee_id ?? ''), kind: r.kind === 'advance' ? 'advance' : 'loan', principal: num(r.principal) ?? 0, emi: num(r.emi) ?? 0,
    startMonth: String(r.start_month ?? ''), recovered: num(r.recovered) ?? 0, note: str(r.note),
  };
}
// `recovered` is never sent: only a freeze or an unfreeze on the server moves it.
const LOAN_SPECS: Spec[] = [
  { local: 'employeeId', wire: 'employee_id', nullable: false },
  { local: 'kind', wire: 'kind', nullable: false },
  { local: 'principal', wire: 'principal', nullable: false },
  { local: 'emi', wire: 'emi', nullable: false },
  { local: 'startMonth', wire: 'start_month', nullable: false },
  { local: 'note', wire: 'note', nullable: true, out: blankToNull },
];
export const loanCreateBody = (l: Loan): Row => ({ id: l.id, ...bodyFor(LOAN_SPECS, l as unknown as Row).body });
export const loanPatch = (prev: Loan, next: Loan) => bodyFor(LOAN_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── full and final ─────────────────────────────
export function fnfFromWire(r: Row): FnfCase {
  const status = r.status === 'approved' || r.status === 'paid' ? r.status : 'draft';
  return {
    id: String(r.id), employeeId: String(r.employee_id ?? ''), lastWorkingDate: str(r.last_working_date) ?? '', resignationDate: str(r.resignation_date),
    noticeDaysServed: num(r.notice_days_served) ?? 0, leaveEncashDays: num(r.leave_encash_days) ?? 0, otherRecoveries: num(r.other_recoveries) ?? 0,
    otherPayments: num(r.other_payments) ?? 0, status, dueBy: str(r.due_by) ?? '',
  };
}
// The status is never sent in a body: approve and mark-paid are commands.
const FNF_SPECS: Spec[] = [
  { local: 'employeeId', wire: 'employee_id', nullable: false },
  { local: 'lastWorkingDate', wire: 'last_working_date', nullable: false },
  { local: 'resignationDate', wire: 'resignation_date', nullable: true, out: blankToNull },
  { local: 'noticeDaysServed', wire: 'notice_days_served', nullable: false },
  { local: 'leaveEncashDays', wire: 'leave_encash_days', nullable: false },
  { local: 'otherRecoveries', wire: 'other_recoveries', nullable: false },
  { local: 'otherPayments', wire: 'other_payments', nullable: false },
  { local: 'dueBy', wire: 'due_by', nullable: false },
];
export const fnfCreateBody = (c: FnfCase): Row => ({ id: c.id, ...bodyFor(FNF_SPECS, c as unknown as Row).body });
export const fnfPatch = (prev: FnfCase, next: FnfCase) => bodyFor(FNF_SPECS, next as unknown as Row, prev as unknown as Row);

export function fnfResultFromWire(d: Row): FnfResult {
  const g = isObj(d.gratuity) ? d.gratuity : {};
  return {
    lines: arr(d.lines).map((l) => ({
      label: String(l.label ?? ''), amount: num(l.amount) ?? 0, kind: l.kind === 'recovery' ? 'recovery' as const : 'payment' as const, ...(str(l.note) ? { note: str(l.note) } : {}),
    })),
    payable: num(d.payable) ?? 0, recoverable: num(d.recoverable) ?? 0, net: num(d.net) ?? 0, tds: num(d.tds) ?? 0,
    gratuity: { eligible: bool(g.eligible), years: num(g.years) ?? 0, amount: num(g.amount) ?? 0, reason: String(g.reason ?? '') },
    dueBy: str(d.dueBy) ?? str(d.due_by) ?? '',
  };
}

// ───────────────────────────── the overtime rule (payroll settings) ─────────────────────────────
export function overtimeFromWire(v: unknown): OvertimeRule | undefined {
  if (!isObj(v)) return undefined;
  const divisor = v.rateDivisor === 'calendar' ? 'calendar' : num(v.rateDivisor) === 30 ? 30 : 26;
  return {
    id: String(v.id ?? 'ot_std'), name: String(v.name ?? 'Standard overtime'), rateMultiplier: num(v.rateMultiplier) ?? 2, quarterlyCapHours: num(v.quarterlyCapHours) ?? 144,
    requiresConsent: bool(v.requiresConsent, true), minMinutes: num(v.minMinutes) ?? 30, rateDivisor: divisor, womenNightConsent: bool(v.womenNightConsent, true),
    appliesTo: Array.isArray(v.appliesTo) ? (v.appliesTo.map(String) as EmploymentType[]) : [],
  };
}
/** Body for PUT /settings/payroll. */
export const settingsBody = (rule: OvertimeRule): Row => ({ overtime_rule: JSON.parse(JSON.stringify(rule)) as Row });

// ───────────────────────────── pay runs and payslips ─────────────────────────────
const line = (l: Row): PayslipLine => {
  const out: PayslipLine = { code: String(l.code ?? ''), name: String(l.name ?? ''), amount: num(l.amount) ?? 0 };
  if (typeof l.taxable === 'boolean') out.taxable = l.taxable;
  return out;
};

export function payslipFromWire(p: Row): Payslip {
  const w = isObj(p.wages) ? p.wages : {};
  return {
    id: String(p.id), runId: String(p.runId ?? p.run_id ?? ''), employeeId: String(p.employeeId ?? p.employee_id ?? ''), month: String(p.month ?? ''),
    daysInMonth: num(p.daysInMonth) ?? 0, paidDays: num(p.paidDays) ?? 0, lopDays: num(p.lopDays) ?? 0, overtimeHours: num(p.overtimeHours) ?? 0,
    earnings: arr(p.earnings).map(line), deductions: arr(p.deductions).map(line), employer: arr(p.employer).map(line), reimbursements: arr(p.reimbursements).map(line),
    gross: num(p.gross) ?? 0, totalDeductions: num(p.totalDeductions) ?? 0, net: num(p.net) ?? 0, employerCost: num(p.employerCost) ?? 0,
    wages: { codeWages: num(w.codeWages) ?? 0, pfWage: num(w.pfWage) ?? 0, esiWage: num(w.esiWage) ?? 0, ptBase: num(w.ptBase) ?? 0, taxableMonthly: num(w.taxableMonthly) ?? 0 },
    warnings: Array.isArray(p.warnings) ? p.warnings.map(String) : [],
  };
}

const STATUSES: PayRunStatus[] = ['draft', 'computed', 'frozen', 'paid'];

function numberMap(v: unknown): Record<string, number> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v)) { const n = num(x); if (n !== undefined) out[k] = n; }
  return Object.keys(out).length ? out : undefined;
}

export function runFromWire(r: Row): PayRun {
  const locked = Array.isArray(r.attendance_locked_for) ? r.attendance_locked_for.map(String) : [];
  return {
    id: String(r.id), month: String(r.month ?? ''), entityId: String(r.entity_id ?? ''), type: r.type === 'offcycle' ? 'offcycle' : 'regular',
    status: STATUSES.includes(r.status as PayRunStatus) ? (r.status as PayRunStatus) : 'draft',
    lawVersion: str(r.law_version) ?? '', createdAt: str(r.created_at) ?? '', computedAt: str(r.computed_at), frozenAt: str(r.frozen_at), frozenBy: str(r.frozen_by), paidAt: str(r.paid_at),
    payslips: arr(r.payslips).map(payslipFromWire),
    audit: arr(r.audit).map((a) => ({ at: String(a.at ?? ''), by: String(a.by ?? ''), action: String(a.action ?? '') })),
    loanRecoveries: numberMap(r.loan_recoveries),
    attendanceLockedFor: locked.length ? locked : undefined,
    stale: r.stale === true,
  };
}

/** One row of GET /runs (no payslips): enough to refresh the stale flag of a run already held. */
export interface RunFlag { id: string; status: PayRunStatus; stale: boolean }
export const runFlagFromWire = (r: Row): RunFlag => ({
  id: String(r.id), status: STATUSES.includes(r.status as PayRunStatus) ? (r.status as PayRunStatus) : 'draft', stale: r.stale === true,
});

// ───────────────────────────── the bootstrap ─────────────────────────────
export interface PayrollData {
  structures: SalaryStructure[]; attendance: AttendanceSummary[]; adjustments: Adjustment[]; loans: Loan[]; payRuns: PayRun[]; fnfCases: FnfCase[];
  /** The server's overtime rule (payroll settings). Absent when the server sent none. */
  overtimeRule?: OvertimeRule;
}

export function payrollFromWire(data: Row): PayrollData {
  const settings = isObj(data.settings) ? data.settings : {};
  const payroll = isObj(settings.payroll) ? settings.payroll : {};
  return {
    structures: arr(data.structures).map(structureFromWire),
    attendance: arr(data.attendance).map(attendanceFromWire),
    adjustments: arr(data.adjustments).map(adjustmentFromWire),
    loans: arr(data.loans).map(loanFromWire),
    payRuns: arr(data.runs).map(runFromWire),
    fnfCases: arr(data.fnf_cases).map(fnfFromWire),
    overtimeRule: overtimeFromWire(payroll.overtime_rule),
  };
}

// ───────────────────────────── checks, ECR, bank file ─────────────────────────────
const SEVERITIES: PreRunCheck['severity'][] = ['blocker', 'warning', 'info'];

export function checksFromWire(data: Row): PreRunCheck[] {
  return arr(data.checks).map((c) => {
    const title = String(c.title ?? '');
    const employeeId = str(c.employeeId) ?? str(c.employee_id);
    const check: PreRunCheck = {
      id: str(c.id) ?? `${title}:${employeeId ?? 'all'}`,
      severity: SEVERITIES.includes(c.severity as PreRunCheck['severity']) ? (c.severity as PreRunCheck['severity']) : 'info',
      title, detail: String(c.detail ?? ''),
    };
    if (employeeId) check.employeeId = employeeId;
    const fix = str(c.fixHref) ?? str(c.fix_href);
    if (fix) check.fixHref = fix;
    return check;
  });
}

export interface EcrData { text: string; rows: number; blocked: { employeeId: string; reason: string }[] }
export function ecrFromWire(d: Row): EcrData {
  const text = typeof d.text === 'string' ? d.text : '';
  return {
    text, rows: num(d.rows) ?? text.split('\n').filter((l) => l.trim() !== '').length,
    blocked: arr(d.blocked).map((b) => ({ employeeId: String(b.employeeId ?? b.employee_id ?? ''), reason: String(b.reason ?? '') })),
  };
}

export const BANK_HEADER = ['Employee code', 'Name', 'Account number', 'IFSC', 'Bank', 'Amount', 'Narration'];
export interface BankFileData {
  header: string[]; rows: string[][];
  skipped: { employeeId?: string; code?: string; name?: string; reason: string }[];
}
/**
 * The server's bank file. The header may arrive as a list or as one comma-separated line, and a skipped person may be named
 * by `employee_id` or `employeeId`: both are accepted. Account numbers are in `rows` in full and nowhere else.
 */
export function bankFileFromWire(d: Row): BankFileData {
  const h = d.header;
  const header = Array.isArray(h) ? h.map(String) : typeof h === 'string' && h.trim() ? h.split(',').map((x) => x.trim()) : BANK_HEADER;
  const rows = Array.isArray(d.rows)
    ? d.rows.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? '' : String(c))) : isObj(r) ? Object.values(r).map((c) => (c == null ? '' : String(c))) : []))
    : [];
  return {
    header, rows,
    skipped: arr(d.skipped).map((s) => ({ employeeId: str(s.employeeId) ?? str(s.employee_id), code: str(s.code), name: str(s.name), reason: String(s.reason ?? '') })),
  };
}
