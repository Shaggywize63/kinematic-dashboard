// Pure helpers for the payroll, payslip and My HR screens. No React and no storage, so the Playwright spec can
// import this file directly and check the numbers without a browser. Every figure is derived from the engine
// (src/lib/hrms/engine.ts) or from the stored data; nothing here is a hard-coded rate.

import type {
  AdjustmentKind, CalcType, ComponentKind, Employee, FnfCase, HrmsDb, Id, ISODate, LeaveBalance, LeaveType, Loan, Month,
  PayRun, Payslip, SalaryComponent, SalaryStructure,
} from '../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { addMonths, diffDays, financialYear, fmtMonth, fullName, inr } from '../../../lib/hrms/format';
import { annualTax, buildBreakup, computePayRunPayslips, employeesForRun, type Breakup } from '../../../lib/hrms/engine';
import { checkPan } from '../../../lib/hrms/validators';
import {
  ESI, LABOUR_CODES, LWF_RULES, PF, PT_RULES, TDS, isMetroCity, monthEnd, professionalTax, rowOn, type Confidence,
} from '../../../lib/hrms/rules';

export const PREVIEW_MONTH: Month = PREVIEW_TODAY.slice(0, 7);

export const isLocked = (r: Pick<PayRun, 'status'>): boolean => r.status === 'frozen' || r.status === 'paid';
export const maskUan = (u?: string): string => (u ? `${'•'.repeat(Math.max(0, u.length - 4))}${u.slice(-4)}` : '—');

// ───────────────────────────────── adjustments ─────────────────────────────────
export interface AdjustmentKindInfo { value: AdjustmentKind; label: string; effect: 'earning' | 'reimbursement' | 'deduction'; taxable: boolean }
export const ADJUSTMENT_KINDS: AdjustmentKindInfo[] = [
  { value: 'arrear', label: 'Arrears', effect: 'earning', taxable: true },
  { value: 'bonus', label: 'Bonus', effect: 'earning', taxable: true },
  { value: 'incentive', label: 'Incentive', effect: 'earning', taxable: true },
  { value: 'reimbursement', label: 'Reimbursement', effect: 'reimbursement', taxable: false },
  { value: 'one_time_deduction', label: 'One-time deduction', effect: 'deduction', taxable: false },
  { value: 'loan_emi', label: 'Loan EMI (manual)', effect: 'deduction', taxable: false },
  { value: 'advance_recovery', label: 'Advance recovery (manual)', effect: 'deduction', taxable: false },
];
export const adjustmentInfo = (k: AdjustmentKind): AdjustmentKindInfo => ADJUSTMENT_KINDS.find((x) => x.value === k) ?? ADJUSTMENT_KINDS[0]!;
export const MAX_ADJUSTMENT = 10_000_000; // sanity cap: one crore

/** The frozen or paid run that covers this employee's entity in that month, if any. Adjustments are locked once it exists. */
export function adjustmentLock(db: HrmsDb, a: { employeeId: Id; month: Month }): PayRun | undefined {
  const emp = db.employees.find((e) => e.id === a.employeeId);
  if (!emp) return undefined;
  return db.payRuns.find((r) => r.month === a.month && r.entityId === emp.entityId && isLocked(r));
}

export interface AdjustmentDraft { employeeId: string; month: string; kind: AdjustmentKind; amount: string; taxable: boolean; note: string }
export function validateAdjustment(db: HrmsDb, d: AdjustmentDraft, editingId?: Id, originalLockedBy?: PayRun): Record<string, string> {
  const err: Record<string, string> = {};
  if (!d.employeeId || !db.employees.some((e) => e.id === d.employeeId)) err.employeeId = 'Choose an employee';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.month)) err.month = 'Choose a month';
  const amt = Number(d.amount);
  if (d.amount.trim() === '' || Number.isNaN(amt)) err.amount = 'Enter an amount';
  else if (amt <= 0) err.amount = 'Amount must be more than zero';
  else if (amt > MAX_ADJUSTMENT) err.amount = 'That is more than ₹1 crore; check the amount';
  else if (Math.abs(amt - Math.round(amt)) > 1e-9) err.amount = 'Whole rupees only';
  if (d.note.length > 80) err.note = 'Keep the note under 80 characters';
  const emp = db.employees.find((e) => e.id === d.employeeId);
  if (emp && !err.month && !employeesForRun(db, d.month, emp.entityId).some((e) => e.id === emp.id)) {
    err.employeeId = `${fullName(emp)} is not on the ${fmtMonth(d.month)} payroll, so this would never be paid. Choose a month they are employed.`;
  }
  if (!err.employeeId && !err.month) {
    const lock = adjustmentLock(db, d);
    if (lock) err.month = `The ${fmtMonth(lock.month)} run is ${lock.status}. Adjustments for it are closed; use the next open month.`;
    else if (editingId && originalLockedBy) err.month = 'This adjustment sits in a closed run and cannot be changed.';
  }
  return err;
}

// ───────────────────────────────── payslip lookup ─────────────────────────────────
export function findPayslip(db: HrmsDb, id: string): { run: PayRun; slip: Payslip } | null {
  for (const run of db.payRuns) {
    const slip = run.payslips.find((s) => s.id === id);
    if (slip) return { run, slip };
  }
  return null;
}
/** Payslips an employee can see: only from runs that have been frozen (or paid). A draft computation is not released. */
export function releasedPayslips(db: HrmsDb, employeeId: Id): { run: PayRun; slip: Payslip }[] {
  return db.payRuns.filter(isLocked)
    .flatMap((run) => run.payslips.filter((s) => s.employeeId === employeeId).map((slip) => ({ run, slip })))
    .sort((a, b) => b.slip.month.localeCompare(a.slip.month) || a.run.createdAt.localeCompare(b.run.createdAt));
}

export function ytdFor(db: HrmsDb, employeeId: Id, month: Month = PREVIEW_MONTH) {
  const fy = financialYear(month);
  const rows = releasedPayslips(db, employeeId).filter((x) => x.slip.month >= fy.start && x.slip.month <= month);
  const code = (lines: { code: string; amount: number }[], c: string) => lines.find((l) => l.code === c)?.amount ?? 0;
  return {
    label: fy.label,
    months: rows.length,
    from: rows.length ? rows[rows.length - 1]!.slip.month : null,
    to: rows.length ? rows[0]!.slip.month : null,
    gross: rows.reduce((s, x) => s + x.slip.gross, 0),
    net: rows.reduce((s, x) => s + x.slip.net, 0),
    tds: rows.reduce((s, x) => s + code(x.slip.deductions, 'TDS'), 0),
    pf: rows.reduce((s, x) => s + code(x.slip.deductions, 'PF'), 0),
  };
}

/** How many blockers the person has already agreed to proceed past, read back from the run's audit trail. */
export function acknowledgedBlockers(run: PayRun): number {
  for (let i = run.audit.length - 1; i >= 0; i--) {
    const m = /^Continued past (\d+) blocker/.exec(run.audit[i]!.action);
    if (m) return Number(m[1]);
  }
  return 0;
}

// ───────────────────────────── run: staleness and comparison ─────────────────────────────
const slipSignature = (slips: Payslip[]): string =>
  slips.map((p) => `${p.employeeId}:${p.gross}:${p.totalDeductions}:${p.net}:${p.employerCost}`).sort().join('|');

/** True when recomputing now would give different payslips than the ones stored on the run (inputs changed after Compute). */
export function runIsStale(db: HrmsDb, run: PayRun): boolean {
  if (run.status !== 'computed') return false;
  return slipSignature(computePayRunPayslips(db, run.month, run.entityId, run.id)) !== slipSignature(run.payslips);
}

export function previousRun(db: HrmsDb, run: PayRun): PayRun | undefined {
  return db.payRuns
    .filter((r) => r.id !== run.id && r.entityId === run.entityId && r.type === run.type && r.month < run.month && r.payslips.length > 0)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
}

export const CHANGE_THRESHOLD_PCT = 10;
export interface PayslipChange { employeeId: Id; prev?: Payslip; delta: number; pct: number | null; flagged: boolean; reasons: string[] }

const ONE_TIME_EARNING = ['OT', 'ARREAR', 'BONUS', 'INCENTIVE'];
/** Monthly fixed pay at full attendance, so a salary change is visible even when loss of pay moved the payslip. */
function fixedMonthly(s: Payslip): number {
  const earned = s.earnings.filter((l) => !ONE_TIME_EARNING.includes(l.code)).reduce((t, l) => t + l.amount, 0);
  return s.paidDays > 0 ? earned / (s.paidDays / s.daysInMonth) : earned;
}
const oneTimeTotal = (s: Payslip): number =>
  s.earnings.filter((l) => ['ARREAR', 'BONUS', 'INCENTIVE'].includes(l.code)).reduce((t, l) => t + l.amount, 0) + s.reimbursements.filter((l) => l.code === 'REIMB').reduce((t, l) => t + l.amount, 0);
const dedCode = (s: Payslip, c: string): number => s.deductions.filter((l) => l.code === c).reduce((t, l) => t + l.amount, 0);

export function explainChange(db: HrmsDb, prev: Payslip, cur: Payslip): string[] {
  const reasons: string[] = [];
  const pf = fixedMonthly(prev); const cf = fixedMonthly(cur);
  if (Math.abs(cf - pf) > Math.max(2, pf * 0.005)) reasons.push(`Salary structure or CTC change (fixed pay ${inr(pf)} to ${inr(cf)} a month)`);
  if (cur.lopDays !== prev.lopDays) reasons.push(`Loss of pay ${prev.lopDays} to ${cur.lopDays} days`);
  if (cur.overtimeHours !== prev.overtimeHours) reasons.push(`Overtime ${prev.overtimeHours}h to ${cur.overtimeHours}h`);
  const adj = db.adjustments.filter((a) => a.employeeId === cur.employeeId && a.month === cur.month);
  if (adj.length) reasons.push(`Adjustment this month: ${adj.map((a) => `${adjustmentInfo(a.kind).label} ${inr(a.amount)}`).join(', ')}`);
  // Last month's one-time pay does not carry over, which is often the real cause of a drop even when something else was added this month.
  if (oneTimeTotal(prev) > oneTimeTotal(cur)) {
    reasons.push(`One-time pay in ${fmtMonth(prev.month)} (${inr(oneTimeTotal(prev))}) did not repeat${oneTimeTotal(cur) ? `; this month's one-time pay is ${inr(oneTimeTotal(cur))}` : ''}`);
  }
  for (const c of ['TDS', 'PT', 'LWF', 'LOAN', 'DED']) {
    if (dedCode(prev, c) !== dedCode(cur, c)) reasons.push(`${c === 'DED' ? 'Other deductions' : c} ${inr(dedCode(prev, c))} to ${inr(dedCode(cur, c))}`);
  }
  if (!reasons.length) reasons.push('No single cause found. Open the payslip and compare the lines.');
  return reasons;
}

/** Month-over-month comparison of net pay against the latest earlier run of the same entity. */
export function comparePayslips(db: HrmsDb, run: PayRun): { prevRun?: PayRun; changes: Map<Id, PayslipChange> } {
  const prevRun = previousRun(db, run);
  const changes = new Map<Id, PayslipChange>();
  if (!prevRun) return { prevRun, changes };
  for (const cur of run.payslips) {
    const prev = prevRun.payslips.find((p) => p.employeeId === cur.employeeId);
    if (!prev) {
      changes.set(cur.employeeId, { employeeId: cur.employeeId, delta: cur.net, pct: null, flagged: true, reasons: [`Not in the ${fmtMonth(prevRun.month)} run (new joiner or first run)`] });
      continue;
    }
    const delta = cur.net - prev.net;
    const pct = prev.net ? (delta / prev.net) * 100 : null;
    const flagged = pct == null ? cur.net !== 0 : Math.abs(pct) > CHANGE_THRESHOLD_PCT;
    changes.set(cur.employeeId, { employeeId: cur.employeeId, prev, delta, pct, flagged, reasons: flagged ? explainChange(db, prev, cur) : [] });
  }
  return { prevRun, changes };
}

// ─────────────────────────────── statutory parameters in use ───────────────────────────────
export interface LawRow { label: string; value: string; confidence: Confidence; source?: string }
export function lawBasis(db: HrmsDb, month: Month, entityId?: Id): LawRow[] {
  const asOn = monthEnd(month);
  const pf = rowOn(PF.ceiling, asOn);
  const esi = rowOn(ESI.ceiling, asOn);
  const rows: LawRow[] = [
    { label: 'PF wage ceiling', value: inr(pf.value), confidence: pf.confidence, source: pf.source },
    { label: 'PF contribution', value: `${PF.employeeRate}% employee, ${PF.employerRate}% employer`, confidence: 'verified', source: 'Stable for years (see rules.ts)' },
    { label: 'EPS, EDLI and admin', value: `${PF.epsRate}%, ${PF.edliRate}%, ${PF.adminRate}% of the capped wage`, confidence: 'reported', source: 'Tagged by this screen: rules.ts carries no tag for these rates' },
    { label: 'ESI wage ceiling', value: inr(esi.value), confidence: esi.confidence, source: esi.source },
    { label: 'ESI rates', value: `${ESI.employeeRate}% employee, ${ESI.employerRate}% employer`, confidence: esi.confidence, source: esi.source },
    { label: '50% wage rule', value: `Wages at least ${LABOUR_CODES.minWagePercent}% of remuneration`, confidence: 'reported', source: `Labour Codes in force from ${LABOUR_CODES.inForceFrom} (as reported)` },
    { label: 'TDS, new regime', value: `Standard deduction ${inr(TDS.newRegime.standardDeduction)}, rebate up to ${inr(TDS.newRegime.rebateLimit)}`, confidence: TDS.newRegime.confidence },
    { label: 'TDS, old regime', value: `Standard deduction ${inr(TDS.oldRegime.standardDeduction)}, rebate up to ${inr(TDS.oldRegime.rebateLimit)}`, confidence: TDS.oldRegime.confidence },
  ];
  const states = new Set(db.locations.filter((l) => !entityId || l.entityId === entityId).map((l) => l.state));
  for (const st of states) {
    const pt = PT_RULES.find((r) => r.state === st);
    rows.push(pt ? { label: `Professional tax, ${st}`, value: pt.note ?? 'State slab table', confidence: pt.confidence } : { label: `Professional tax, ${st}`, value: 'No PT modelled for this state', confidence: 'indicative' });
    const lw = LWF_RULES.find((r) => r.state === st);
    if (lw) rows.push({ label: `Labour welfare fund, ${st}`, value: `${inr(lw.employee)} employee, ${inr(lw.employer)} employer, in month(s) ${lw.months.join(', ')}`, confidence: lw.confidence });
  }
  return rows;
}

// ─────────────────────────────────── salary structures ───────────────────────────────────
export const COMPONENT_KINDS: { value: ComponentKind; label: string }[] = [
  { value: 'earning', label: 'Earning' }, { value: 'employer', label: 'Employer contribution' },
  { value: 'reimbursement', label: 'Reimbursement' }, { value: 'deduction', label: 'Deduction' },
];
export const CALC_TYPES_BY_KIND: Record<ComponentKind, CalcType[]> = {
  earning: ['fixed', 'pct_basic', 'pct_ctc', 'balance'],
  employer: ['pf_employer', 'esi_employer', 'gratuity_provision', 'fixed', 'pct_basic', 'pct_ctc'],
  reimbursement: ['fixed'],
  deduction: ['fixed'],
};
export const CALC_LABEL: Record<CalcType, string> = {
  fixed: 'Fixed monthly amount', pct_basic: 'Percent of basic', pct_ctc: 'Percent of monthly CTC', balance: 'Balancing amount (CTC minus the rest)',
  pf_employer: 'Employer PF (from the PF rules)', esi_employer: 'Employer ESI (from the ESI rules)', gratuity_provision: 'Gratuity provision (percent of basic)',
};
export const calcShort = (c: SalaryComponent['calc']): string => {
  switch (c.type) {
    case 'fixed': return inr(c.value);
    case 'pct_basic': return `${c.value}% of basic`;
    case 'pct_ctc': return `${c.value}% of CTC`;
    case 'balance': return 'Balance';
    case 'pf_employer': return `${PF.employerRate}% of PF wage`;
    case 'esi_employer': return `${ESI.employerRate}% of ESI wage`;
    case 'gratuity_provision': return `${c.value}% of basic`;
  }
};

export interface ComponentDraft {
  code: string; name: string; kind: ComponentKind; calcType: CalcType; value: string;
  isWage: boolean; taxable: boolean; pfApplicable: boolean; esiApplicable: boolean; prorate: boolean; showInPayslip: boolean;
}
export const MAX_FIXED_COMPONENT = 1_000_000;

export function draftFromComponent(c: SalaryComponent): ComponentDraft {
  return { code: c.code, name: c.name, kind: c.kind, calcType: c.calc.type, value: String(c.calc.value), isWage: c.isWage, taxable: c.taxable, pfApplicable: c.pfApplicable, esiApplicable: c.esiApplicable, prorate: c.prorate, showInPayslip: c.showInPayslip };
}
export function componentFromDraft(d: ComponentDraft, id: string): SalaryComponent {
  const value = d.calcType === 'balance' ? 0 : d.calcType === 'pf_employer' ? PF.employerRate : d.calcType === 'esi_employer' ? ESI.employerRate : Number(d.value);
  return {
    id, code: d.code.trim().toUpperCase(), name: d.name.trim(), kind: d.kind, calc: { type: d.calcType, value },
    isWage: d.kind === 'earning' ? d.isWage : false, taxable: d.taxable, pfApplicable: d.pfApplicable, esiApplicable: d.esiApplicable, prorate: d.prorate, showInPayslip: d.showInPayslip,
  };
}
/** Sensible flag defaults when the kind changes, mirroring how the seed structures are set up. */
export function flagDefaults(kind: ComponentKind): Pick<ComponentDraft, 'taxable' | 'esiApplicable' | 'prorate' | 'isWage' | 'pfApplicable'> {
  return kind === 'earning'
    ? { taxable: true, esiApplicable: true, prorate: true, isWage: false, pfApplicable: false }
    : { taxable: false, esiApplicable: false, prorate: false, isWage: false, pfApplicable: false };
}

export function validateComponent(d: ComponentDraft, siblings: SalaryComponent[]): Record<string, string> {
  const err: Record<string, string> = {};
  const code = d.code.trim().toUpperCase();
  if (!code) err.code = 'Enter a code';
  else if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(code)) err.code = 'Use 2 to 20 capital letters, digits or underscores, starting with a letter';
  else if (siblings.some((s) => s.code === code)) err.code = 'Another component already uses this code';
  if (!d.name.trim()) err.name = 'Enter a name';
  else if (d.name.trim().length > 50) err.name = 'Keep the name under 50 characters';
  if (!CALC_TYPES_BY_KIND[d.kind].includes(d.calcType)) err.calcType = 'This calculation is not available for this kind';
  const v = Number(d.value);
  const needsValue = !['balance', 'pf_employer', 'esi_employer'].includes(d.calcType);
  if (needsValue) {
    if (d.value.trim() === '' || Number.isNaN(v)) err.value = 'Enter a value';
    else if (v < 0) err.value = 'Cannot be negative';
    else if (d.calcType === 'fixed' && v > MAX_FIXED_COMPONENT) err.value = 'More than ₹10,00,000 a month; check the amount';
    else if (d.calcType === 'pct_ctc' && (v <= 0 || v > 100)) err.value = 'Percent of CTC must be above 0 and at most 100';
    else if (d.calcType === 'pct_basic' && (v <= 0 || v > 200)) err.value = 'Percent of basic must be above 0 and at most 200';
    else if (d.calcType === 'gratuity_provision' && (v <= 0 || v > 10)) err.value = 'Gratuity provision is above 0 and at most 10 percent of basic';
  }
  if (code === 'BASIC' && d.kind !== 'earning') err.kind = 'BASIC must be an earning';
  if (code === 'BASIC' && !d.isWage) err.isWage = 'BASIC must count as a wage';
  if (code === 'BASIC' && d.calcType === 'balance') err.calcType = 'BASIC cannot be the balancing component';
  if (d.calcType === 'balance' && d.kind !== 'earning') err.calcType = 'Only an earning can be the balancing component';
  return err;
}

export function validateStructure(s: SalaryStructure): { errors: string[]; warnings: string[] } {
  const errors: string[] = []; const warnings: string[] = [];
  if (!s.name.trim()) errors.push('Give the structure a name.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.effectiveFrom)) errors.push('Choose an effective-from date.');
  const comps = s.components;
  if (!comps.length) errors.push('Add at least one component.');
  const basic = comps.find((c) => c.code === 'BASIC');
  if (!basic) errors.push('A component with the code BASIC is required.');
  else {
    if (basic.kind !== 'earning') errors.push('BASIC must be an earning.');
    if (!basic.isWage) errors.push('BASIC must be flagged as a wage.');
    if (basic.calc.type === 'balance') errors.push('BASIC cannot be the balancing component.');
  }
  const balances = comps.filter((c) => c.calc.type === 'balance');
  if (balances.length > 1) errors.push(`Only one balancing component is allowed (found ${balances.map((c) => c.code).join(', ')}).`);
  if (comps.filter((c) => c.calc.type === 'esi_employer').length > 1) errors.push('Only one employer ESI component is allowed.');
  const dup = comps.filter((c, i) => comps.findIndex((x) => x.code === c.code) !== i).map((c) => c.code);
  if (dup.length) errors.push(`Component codes must be unique (repeated: ${Array.from(new Set(dup)).join(', ')}).`);
  const pctCtc = comps.filter((c) => c.kind !== 'deduction' && c.calc.type === 'pct_ctc').reduce((t, c) => t + c.calc.value, 0);
  if (pctCtc > 100) errors.push(`Components that take a percent of CTC add up to ${pctCtc}%, which is more than 100%.`);
  for (const c of comps) {
    const e = validateComponent(draftFromComponent(c), comps.filter((x) => x !== c));
    for (const m of Object.values(e)) errors.push(`${c.code || 'Component'}: ${m}`);
  }
  if (!balances.length) warnings.push('There is no balancing component, so the breakup only reaches the CTC if the components add up exactly.');
  if (comps.some((c) => c.kind === 'deduction')) warnings.push('Deduction components are not applied by the preview payroll engine. Statutory deductions come from the rules, and loans from the Loans tab.');
  if (!comps.some((c) => c.calc.type === 'pf_employer')) warnings.push('No employer PF component: the employer PF will not be counted in the CTC.');
  return { errors: Array.from(new Set(errors)), warnings };
}

export interface WageEffect { pfWageWithout: number; pfWageWith: number; pfWageDelta: number; employerPfDelta: number }
/** What the 50% add-back does to the PF wage and the employer PF share, from the engine's own wage test. */
export function wageEffect(b: Breakup, asOn: ISODate, pfMember: boolean, pfOnActual: boolean): WageEffect {
  const ceiling = rowOn(PF.ceiling, asOn).value;
  const without = pfMember ? (pfOnActual ? b.wageTest.wages : Math.min(b.wageTest.wages, ceiling)) : 0;
  const delta = b.pfWage - without;
  return { pfWageWithout: without, pfWageWith: b.pfWage, pfWageDelta: delta, employerPfDelta: Math.round((delta * PF.employerRate) / 100) };
}
/** Sum of everything the CTC has to cover, for the reconciliation line. */
export const breakupTotal = (b: Breakup): number => b.lines.reduce((s, l) => s + l.monthly, 0);

export function employeeBreakup(db: HrmsDb, e: Employee, structure: SalaryStructure, month: Month): Breakup | null {
  if (!e.annualCtc) return null;
  return buildBreakup(structure, e.annualCtc, { asOn: monthEnd(month), pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides });
}

// ─────────────────────────────────────── loans ───────────────────────────────────────
export interface EmiRow { n: number; month: Month; opening: number; emi: number; closing: number; next: boolean }
/** The EMIs still to come, starting at `fromMonth`. Interest-free: the preview engine does not model interest or perquisite tax. */
export function remainingSchedule(principal: number, emi: number, recovered: number, fromMonth: Month, recoveredCount = 0): EmiRow[] {
  const rows: EmiRow[] = [];
  if (!(emi > 0) || !(principal > recovered)) return rows;
  let left = principal - recovered;
  let m = fromMonth;
  for (let n = recoveredCount + 1; left > 0 && rows.length < 120; n++) {
    const pay = Math.min(emi, left);
    rows.push({ n, month: m, opening: left, emi: pay, closing: left - pay, next: rows.length === 0 });
    left -= pay;
    m = addMonths(m, 1);
  }
  return rows;
}
/** First month still to be recovered: the month after the entity's latest frozen or paid run, or the loan's start. */
export function nextDeductionMonth(db: HrmsDb, loan: Loan): Month {
  const emp = db.employees.find((e) => e.id === loan.employeeId);
  const closed = db.payRuns.filter((r) => isLocked(r) && (!emp || r.entityId === emp.entityId)).map((r) => r.month).sort();
  const last = closed[closed.length - 1];
  return last && addMonths(last, 1) > loan.startMonth ? addMonths(last, 1) : loan.startMonth;
}
export const loanOutstanding = (l: Loan): number => Math.max(0, l.principal - l.recovered);

export interface LoanDraft { employeeId: string; kind: Loan['kind']; principal: string; emi: string; startMonth: string; note: string }
export function validateLoan(db: HrmsDb, d: LoanDraft): { errors: Record<string, string>; warnings: string[] } {
  const errors: Record<string, string> = {}; const warnings: string[] = [];
  const e = db.employees.find((x) => x.id === d.employeeId);
  if (!e) errors.employeeId = 'Choose an employee';
  const p = Number(d.principal); const m = Number(d.emi);
  if (d.principal.trim() === '' || Number.isNaN(p) || p <= 0) errors.principal = 'Enter the amount lent';
  else if (p > 5_000_000) errors.principal = 'More than ₹50 lakh; check the amount';
  if (d.emi.trim() === '' || Number.isNaN(m) || m <= 0) errors.emi = 'Enter the monthly EMI';
  else if (!errors.principal && m > p) errors.emi = 'The EMI cannot be more than the amount lent';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.startMonth)) errors.startMonth = 'Choose the first month of recovery';
  if (d.note.length > 80) errors.note = 'Keep the note under 80 characters';
  if (!errors.principal && !errors.emi && Math.ceil(p / m) > 60) warnings.push(`This takes ${Math.ceil(p / m)} months to recover, which is more than five years.`);
  if (e && !errors.emi && e.annualCtc) {
    const structure = db.structures.find((s) => s.id === e.structureId);
    const b = structure ? employeeBreakup(db, e, structure, PREVIEW_MONTH) : null;
    if (b && m > b.monthlyGross * 0.5) warnings.push(`The EMI is more than half of this employee's monthly gross (${inr(b.monthlyGross)}). Deductions above 50% of wages are restricted by wage law; confirm the limit.`);
  }
  if (e && db.loans.some((l) => l.employeeId === e.id && l.recovered < l.principal)) warnings.push('This employee already has a loan or advance being recovered. The preview freeze applies recoveries per loan in the order they were added.');
  return { errors, warnings };
}

// ─────────────────────────────── full and final ───────────────────────────────
export function leaveBalanceDays(lb: Pick<LeaveBalance, 'opening' | 'accrued' | 'taken' | 'encashed' | 'lapsed'>): number {
  return lb.opening + lb.accrued - lb.taken - lb.encashed - lb.lapsed;
}
export function elBalance(db: HrmsDb, employeeId: Id): { type?: LeaveType; days: number } {
  const type = db.leaveTypes.find((t) => t.code === 'EL');
  const lb = db.leaveBalances.find((b) => b.employeeId === employeeId && b.leaveTypeId === type?.id);
  return { type, days: lb ? leaveBalanceDays(lb) : 0 };
}
/** Employees who can have a settlement case: on notice or exited, and without a case already. */
export function fnfCandidates(db: HrmsDb): Employee[] {
  return db.employees.filter((e) => (e.status === 'on_notice' || e.status === 'exited') && !db.fnfCases.some((c) => c.employeeId === e.id));
}
export interface FnfDraft {
  employeeId: string; lastWorkingDate: string; resignationDate: string; noticeDaysServed: string; leaveEncashDays: string; otherRecoveries: string; otherPayments: string;
}
export function defaultFnfDraft(db: HrmsDb, e: Employee): FnfDraft {
  const exit = db.exits.find((x) => x.employeeId === e.id);
  const lwd = e.lastWorkingDate ?? exit?.lastWorkingDate ?? '';
  const resignation = exit?.resignationDate ?? '';
  const served = lwd && resignation ? Math.max(0, Math.min(e.noticeDays, diffDays(resignation, lwd))) : e.noticeDays;
  const el = elBalance(db, e.id);
  const encash = el.type?.encashment.onExit ? Math.min(el.days, el.type.encashment.maxDays) : 0;
  return { employeeId: e.id, lastWorkingDate: lwd, resignationDate: resignation, noticeDaysServed: String(served), leaveEncashDays: String(Math.max(0, encash)), otherRecoveries: '0', otherPayments: '0' };
}
export function validateFnf(db: HrmsDb, d: FnfDraft): Record<string, string> {
  const err: Record<string, string> = {};
  const e = db.employees.find((x) => x.id === d.employeeId);
  if (!e) err.employeeId = 'Choose an employee';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.lastWorkingDate)) err.lastWorkingDate = 'Enter the last working day';
  else if (e && e.joinDate > d.lastWorkingDate) err.lastWorkingDate = 'The last working day is before the joining date';
  if (d.resignationDate && !/^\d{4}-\d{2}-\d{2}$/.test(d.resignationDate)) err.resignationDate = 'Enter a valid date';
  else if (d.resignationDate && d.lastWorkingDate && d.resignationDate > d.lastWorkingDate) err.resignationDate = 'Resignation is after the last working day';
  const num = (v: string, key: string, label: string, max: number) => {
    const n = Number(v);
    if (v.trim() === '' || Number.isNaN(n)) err[key] = `Enter ${label}`;
    else if (n < 0) err[key] = 'Cannot be negative';
    else if (n > max) err[key] = `That is more than ${max}; check it`;
  };
  num(d.noticeDaysServed, 'noticeDaysServed', 'the notice days served', 365);
  num(d.leaveEncashDays, 'leaveEncashDays', 'the leave days to encash', 365);
  num(d.otherRecoveries, 'otherRecoveries', 'the other recoveries (0 if none)', MAX_ADJUSTMENT);
  num(d.otherPayments, 'otherPayments', 'the other payments (0 if none)', MAX_ADJUSTMENT);
  if (!err.leaveEncashDays && e) {
    const el = elBalance(db, e.id);
    if (Number(d.leaveEncashDays) > el.days) err.leaveEncashDays = `Only ${el.days} days of earned leave are available`;
    else if (el.type && Number(d.leaveEncashDays) > el.type.encashment.maxDays) err.leaveEncashDays = `Policy allows at most ${el.type.encashment.maxDays} days`;
  }
  return err;
}
export const fnfIsOverdue = (c: Pick<FnfCase, 'status' | 'dueBy'>): boolean => c.status !== 'paid' && c.dueBy < PREVIEW_TODAY;

// ───────────────────────────────────── My HR ─────────────────────────────────────
export function taxComparison(db: HrmsDb, e: Employee, declaration = e.declaration, month: Month = PREVIEW_MONTH) {
  const structure = db.structures.find((s) => s.id === e.structureId);
  const location = db.locations.find((l) => l.id === e.locationId);
  if (!structure || !location || !e.annualCtc) return null;
  const asOn = monthEnd(month);
  const b = buildBreakup(structure, e.annualCtc, { asOn, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides });
  const annualGross = b.lines.filter((l) => l.kind === 'earning' && l.taxable).reduce((s, l) => s + l.monthly, 0) * 12;
  const hra = b.lines.find((l) => l.code === 'HRA')?.monthly ?? 0;
  const metro = e.employmentType === 'daily_wage' ? false : location.metro || isMetroCity(location.city, asOn);
  const employeePfMonthly = Math.round((b.pfWage * PF.employeeRate) / 100);
  const pt = e.ptApplicable ? professionalTax(location.state, b.monthlyGross, e.gender, month) : 0;
  const base = { annualGross, basicAnnual: b.basic * 12, hraAnnual: hra * 12, metro, employeePfAnnual: employeePfMonthly * 12, ptAnnual: pt * 12, declaration };
  const newR = annualTax({ ...base, regime: 'new' });
  const oldR = annualTax({ ...base, regime: 'old' });
  const better: 'new' | 'old' = newR.total <= oldR.total ? 'new' : 'old';
  const current = e.taxRegime === 'old' ? oldR : newR;
  const best = better === 'new' ? newR : oldR;
  return { annualGross, newR, oldR, better, saving: current.total - best.total, monthlyNew: Math.round(newR.total / 12), monthlyOld: Math.round(oldR.total / 12) };
}

export interface DeclarationDraft { sec80C: string; sec80D: string; nps80CCD1B: string; homeLoanInterest: string; rentPaidAnnual: string; landlordPan: string; other: string }
export const RENT_PAN_THRESHOLD = 100_000; // annual rent above this needs the landlord's PAN (long-standing Form 12BB/124 rule)
export function validateDeclaration(d: DeclarationDraft): Record<string, string> {
  const err: Record<string, string> = {};
  const money = (key: keyof DeclarationDraft, label: string) => {
    const v = d[key]; const n = Number(v);
    if (v.trim() === '') return;
    if (Number.isNaN(n)) err[key] = `${label} must be a number`;
    else if (n < 0) err[key] = 'Cannot be negative';
    else if (n > 100_000_000) err[key] = 'That looks too large; check it';
  };
  money('sec80C', 'Section 80C'); money('sec80D', 'Health insurance'); money('nps80CCD1B', 'NPS'); money('homeLoanInterest', 'Home loan interest');
  money('rentPaidAnnual', 'Rent'); money('other', 'Other deductions');
  if (Number(d.rentPaidAnnual) > RENT_PAN_THRESHOLD) {
    const c = checkPan(d.landlordPan);
    if (!c.ok) err.landlordPan = `Rent above ${inr(RENT_PAN_THRESHOLD)} a year needs the landlord's PAN. ${c.message}`;
  }
  return err;
}

/** Days a leave request uses: Sundays and fixed holidays are skipped for types that exclude weekly offs. */
export function leaveDays(db: HrmsDb, e: Employee, type: LeaveType, from: ISODate, to: ISODate, halfDay: boolean): number {
  if (!from || !to || from > to) return 0;
  if (halfDay && from === to) return 0.5;
  const holidays = new Set((db.holidayLists.find((h) => h.id === db.locations.find((l) => l.id === e.locationId)?.holidayListId)?.holidays ?? []).filter((h) => !h.optional).map((h) => h.date));
  let n = 0;
  for (let d = from; d <= to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
    const sunday = new Date(`${d}T00:00:00Z`).getUTCDay() === 0;
    if (!type.includeWeeklyOffs && (sunday || holidays.has(d))) continue;
    n += 1;
    if (n > 400) break;
  }
  return n;
}
