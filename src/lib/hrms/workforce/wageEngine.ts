// Wage access (earned wage access preview). Pure functions: no React, no storage, no network.
//
// The maths, kept deliberately simple so anyone can check it by hand:
//   1. Net pay for the month = this month's payslip at full attendance, without loans or one-time items.
//   2. Earned to date = net pay x paid days so far / days in the month. Days so far count today as a full day, and
//      unpaid days (loss of pay) recorded in the month's attendance are taken out.
//   3. Take off the loan and advance recoveries already due in this month's payroll (not wage access advances).
//   4. The person can draw at most the policy share of that, rounded down to ROUND_TO, minus what they already drew.
// Approvals re-run this at the moment of approval, so a request can never be approved for more than is available.

import type { Employee, HrmsDb, ISODate, Loan, Month } from '../types';
import { computePayslip } from '../engine';
import { addMonths, daysInMonth, fmtMonth, fullName, inr, tenure } from '../format';
import type { WagePolicy, WageRequest } from './types';

export const ROUND_TO = 100;
export const DEFAULT_POLICY: WagePolicy = {
  maxSharePct: 50, monthlyRequestLimit: 2, fee: 0, minTenureMonths: 3, eligibleTypes: ['permanent', 'fixed_term'], minAmount: 500,
};
export const TYPE_LABEL: Record<Employee['employmentType'], string> = {
  permanent: 'Permanent', fixed_term: 'Fixed-term', contract: 'Contract', intern: 'Intern', daily_wage: 'Daily wage',
};
export const ALL_TYPES: Employee['employmentType'][] = ['permanent', 'fixed_term', 'contract', 'intern', 'daily_wage'];

const floorTo = (n: number, step = ROUND_TO) => Math.max(0, Math.floor(n / step) * step);

/** Statuses that use up one of the person's requests for the month. */
export const COUNTS_AS_USED: WageRequest['status'][] = ['pending', 'approved', 'settled'];

export interface WageStanding {
  employeeId: string;
  month: Month;
  eligible: boolean;
  reasons: string[];            // why not eligible, in plain words
  net: number;                  // monthly net at full attendance
  daysElapsed: number;
  daysInMonth: number;
  unpaidDays: number;
  paidDays: number;
  earned: number;               // earned to date
  recoveriesDue: number;        // loans and advances recovered from this month's pay (not wage access)
  afterRecoveries: number;
  cap: number;                  // policy share of afterRecoveries, rounded down
  drawn: number;                // already approved this month
  available: number;
  requestsUsed: number;
  requestLimit: number;
  fee: number;
}

/** Net pay at full attendance for a month: the payslip engine run without loans, adjustments or overtime. */
export function monthlyNet(db: HrmsDb, e: Employee, month: Month): number | null {
  const structure = db.structures.find((s) => s.id === e.structureId);
  const location = db.locations.find((l) => l.id === e.locationId);
  if (!structure || !location || !e.annualCtc) return null;
  return computePayslip({ employee: e, structure, location, adjustments: [], loans: [], shiftHours: 8, month, runId: 'wage-access-preview' }).net;
}

const wageLoanIds = (requests: WageRequest[]): Set<string> => new Set(requests.map((r) => r.loanId).filter(Boolean) as string[]);

/** Rupees of ordinary loans and advances that this month's payroll will recover from the person. */
export function recoveriesDue(loans: Loan[], employeeId: string, month: Month, skip: Set<string> = new Set()): number {
  return loans
    .filter((l) => l.employeeId === employeeId && l.startMonth <= month && l.recovered < l.principal && !skip.has(l.id))
    .reduce((s, l) => s + Math.min(l.emi, l.principal - l.recovered), 0);
}

export function wageStanding(db: HrmsDb, policy: WagePolicy, requests: WageRequest[], employeeId: string, today: ISODate): WageStanding | null {
  const e = db.employees.find((x) => x.id === employeeId);
  if (!e) return null;
  const month = today.slice(0, 7);
  const dim = daysInMonth(month);
  const elapsed = Math.min(dim, Number(today.slice(8, 10)));
  const att = db.attendance.find((a) => a.employeeId === e.id && a.month === month);
  const unpaid = Math.min(elapsed, att?.lopDays ?? 0);
  const paid = elapsed - unpaid;
  const net = monthlyNet(db, e, month);
  const earned = net == null ? 0 : Math.round((net * paid) / dim);
  const due = recoveriesDue(db.loans, e.id, month, wageLoanIds(requests));
  const after = Math.max(0, earned - due);
  const cap = floorTo((after * policy.maxSharePct) / 100);
  const mine = requests.filter((r) => r.employeeId === e.id && r.month === month);
  const drawn = mine.filter((r) => r.status === 'approved').reduce((s, r) => s + r.amount, 0);
  const used = mine.filter((r) => COUNTS_AS_USED.includes(r.status)).length;

  const reasons: string[] = [];
  if (e.status === 'on_notice') reasons.push('On notice. Wage access is for people who are staying.');
  else if (e.status !== 'active') reasons.push('Not an active employee yet.');
  if (!policy.eligibleTypes.includes(e.employmentType)) reasons.push(`${TYPE_LABEL[e.employmentType]} employees are not in the eligible group.`);
  const t = tenure(e.joinDate, today).totalMonths;
  if (t < policy.minTenureMonths) reasons.push(`Joined ${t} ${t === 1 ? 'month' : 'months'} ago. The policy asks for ${policy.minTenureMonths}.`);
  if (net == null) reasons.push('No salary structure on file, so earnings cannot be worked out.');
  if (!e.bank) reasons.push('No bank account on file to pay into.');
  if (used >= policy.monthlyRequestLimit) reasons.push(`Already used ${used} of ${policy.monthlyRequestLimit} requests for ${fmtMonth(month)}.`);
  const eligible = reasons.length === 0;

  return {
    employeeId: e.id, month, eligible, reasons, net: net ?? 0, daysElapsed: elapsed, daysInMonth: dim, unpaidDays: unpaid, paidDays: paid,
    earned, recoveriesDue: due, afterRecoveries: after, cap, drawn, available: eligible ? Math.max(0, cap - drawn) : 0,
    requestsUsed: used, requestLimit: policy.monthlyRequestLimit, fee: policy.fee,
  };
}

/** Problems with a request for `amount`. Empty means it can go ahead. Used for the form, the inbox and the approval itself. */
export function validateAmount(s: WageStanding, policy: WagePolicy, amount: number): string[] {
  const errs: string[] = [];
  if (!s.eligible) errs.push(...s.reasons);
  if (!Number.isFinite(amount) || amount <= 0) errs.push('Enter an amount.');
  else {
    if (amount < policy.minAmount) errs.push(`The smallest request is ${inr(policy.minAmount)}.`);
    if (amount % ROUND_TO !== 0) errs.push(`Use multiples of ${inr(ROUND_TO)}.`);
    if (amount > s.available) errs.push(s.available > 0 ? `${inr(amount)} is more than the ${inr(s.available)} available now.` : 'Nothing is available to draw right now.');
  }
  return errs;
}

/** The payroll month that recovers a new advance: this month, unless this month's run is already frozen for the entity. */
export function recoveryMonth(db: HrmsDb, employeeId: string, today: ISODate): Month {
  const month = today.slice(0, 7);
  const e = db.employees.find((x) => x.id === employeeId);
  const closed = db.payRuns.some((r) => r.month === month && r.entityId === e?.entityId && r.type === 'regular' && (r.status === 'frozen' || r.status === 'paid'));
  return closed ? addMonths(month, 1) : month;
}

/** The slider's bounds and steps, or null when nothing can be requested. */
export function sliderRange(s: WageStanding, policy: WagePolicy): { min: number; max: number; step: number } | null {
  if (!s.eligible || s.available < policy.minAmount) return null;
  return { min: policy.minAmount, max: s.available, step: ROUND_TO };
}

export interface WageSummary {
  pending: number;
  approvedThisMonth: number;       // rupees approved this month
  outstanding: number;             // rupees still to be recovered from payroll
  eligible: number;                // people who could request today
  eligibleTotal: number;
  availableTotal: number;
  requestsThisMonth: number;
}

export function wageSummary(db: HrmsDb, policy: WagePolicy, requests: WageRequest[], today: ISODate): WageSummary {
  const month = today.slice(0, 7);
  const people = db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice');
  const standings = people.map((e) => wageStanding(db, policy, requests, e.id, today)!).filter(Boolean);
  const outstanding = requests.filter((r) => r.status === 'approved' && r.loanId).reduce((s, r) => {
    const loan = db.loans.find((l) => l.id === r.loanId);
    return s + (loan ? Math.max(0, loan.principal - loan.recovered) : 0);
  }, 0);
  return {
    pending: requests.filter((r) => r.status === 'pending').length,
    approvedThisMonth: requests.filter((r) => r.month === month && r.status === 'approved').reduce((s, r) => s + r.amount, 0),
    outstanding,
    eligible: standings.filter((s) => s.eligible).length,
    eligibleTotal: standings.length,
    availableTotal: standings.reduce((s, x) => s + x.available, 0),
    requestsThisMonth: requests.filter((r) => r.month === month && COUNTS_AS_USED.includes(r.status)).length,
  };
}

export const requestLabel = (db: HrmsDb, r: WageRequest): string => {
  const e = db.employees.find((x) => x.id === r.employeeId);
  return `${e ? fullName(e) : r.employeeId}, ${inr(r.amount)}`;
};

/** Problems with a policy before it is saved, keyed by field. Empty means it is fine. */
export function validatePolicy(p: WagePolicy): Partial<Record<keyof WagePolicy, string>> {
  const e: Partial<Record<keyof WagePolicy, string>> = {};
  if (!Number.isFinite(p.maxSharePct) || p.maxSharePct < 1 || p.maxSharePct > 100) e.maxSharePct = 'Enter a share from 1 to 100.';
  if (!Number.isInteger(p.monthlyRequestLimit) || p.monthlyRequestLimit < 1 || p.monthlyRequestLimit > 10) e.monthlyRequestLimit = 'Enter a whole number from 1 to 10.';
  if (!Number.isFinite(p.fee) || p.fee < 0 || p.fee > 1000) e.fee = 'Enter a fee from 0 to 1,000 rupees.';
  if (!Number.isInteger(p.minTenureMonths) || p.minTenureMonths < 0 || p.minTenureMonths > 60) e.minTenureMonths = 'Enter whole months from 0 to 60.';
  if (!p.eligibleTypes.length) e.eligibleTypes = 'Pick at least one group.';
  if (!Number.isFinite(p.minAmount) || p.minAmount < ROUND_TO || p.minAmount % ROUND_TO !== 0) e.minAmount = `Enter a multiple of ${ROUND_TO}, at least ${ROUND_TO}.`;
  return e;
}
