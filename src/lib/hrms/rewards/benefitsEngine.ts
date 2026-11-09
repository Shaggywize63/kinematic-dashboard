// Benefits: pure logic. Enrolment rules, premium split, claims ageing, the payroll deduction preview.
// No React, no storage. Every rate and term in the seed is a sample; the engine only does arithmetic on what it is given.

import type { Employee, HrmsDb, Id, ISODate, Month } from '../types';
import { buildBreakup } from '../engine';
import { diffDays, fullName } from '../format';
import type { BenefitsWindow, Claim, ClaimStatus, Dependant, DependantRules, Enrolment, Plan, PlanTier, Relation } from './types';

export const RELATION_LABEL: Record<Relation, string> = { spouse: 'Spouse', child: 'Child', parent: 'Parent' };

export const planOf = (plans: Plan[], kind: Plan['kind']): Plan | undefined => plans.find((p) => p.kind === kind);
export const tierOf = (plan: Plan | undefined, id: string | undefined): PlanTier | undefined => (plan && id ? plan.tiers.find((t) => t.id === id) : undefined);

// ───────────────────────────── people and window ─────────────────────────────
/** Whole years between a date of birth and a date. */
export function ageOn(dob: ISODate, on: ISODate): number {
  const [by, bm, bd] = dob.split('-').map(Number) as [number, number, number];
  const [y, m, d] = on.split('-').map(Number) as [number, number, number];
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return Math.max(0, age);
}

/** Who can enrol: working today and still here when cover starts. Joiners enrol after they join; leavers are not covered. */
export function enrolmentEligibility(e: Employee, coverStart: ISODate): { eligible: boolean; reason?: string } {
  if (e.status === 'onboarding') return { eligible: false, reason: 'Has not joined yet; enrols in the first week after joining.' };
  if (e.status === 'exited') return { eligible: false, reason: 'Has left the company.' };
  if (e.status === 'on_notice' || (e.lastWorkingDate && e.lastWorkingDate < coverStart)) return { eligible: false, reason: 'Leaves before the cover starts.' };
  return { eligible: true };
}

export type WindowState = 'open' | 'closed' | 'not_open';
export function windowStatus(w: BenefitsWindow, today: ISODate): { state: WindowState; daysLeft: number; closesOn: ISODate } {
  const state: WindowState = today < w.opensOn ? 'not_open' : today > w.closesOn ? 'closed' : 'open';
  return { state, daysLeft: state === 'open' ? diffDays(today, w.closesOn) : 0, closesOn: w.closesOn };
}

// ───────────────────────────── dependants ─────────────────────────────
/** Plain-language problems with a dependants list under a plan's rules. Ages are taken on the cover start date. */
export function validateDependants(rules: DependantRules, deps: Dependant[], coverStart: ISODate): string[] {
  const errs: string[] = [];
  const count = (r: Relation) => deps.filter((d) => d.relation === r).length;
  if (count('spouse') > rules.maxSpouse) errs.push(`This plan covers ${rules.maxSpouse} spouse at most.`);
  if (count('child') > rules.maxChildren) errs.push(`This plan covers ${rules.maxChildren} children at most.`);
  if (count('parent') > rules.maxParents) errs.push(`This plan covers ${rules.maxParents} parents at most.`);
  for (const d of deps) {
    const who = d.name.trim() || RELATION_LABEL[d.relation];
    if (!d.name.trim()) errs.push(`Add a name for the ${RELATION_LABEL[d.relation].toLowerCase()}.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dob) || Number.isNaN(new Date(`${d.dob}T00:00:00Z`).getTime())) { errs.push(`${who}: enter a valid date of birth.`); continue; }
    if (d.dob > coverStart) { errs.push(`${who}: the date of birth is after the cover starts.`); continue; }
    const age = ageOn(d.dob, coverStart);
    if (d.relation === 'child' && age > rules.childMaxAge) errs.push(`${who} will be ${age} when cover starts. Children are covered up to ${rules.childMaxAge}.`);
    if (d.relation === 'parent' && age > rules.parentMaxAge) errs.push(`${who} will be ${age} when cover starts. Parents are covered up to ${rules.parentMaxAge}.`);
    if (d.relation === 'parent' && age < 40) errs.push(`${who}: check the date of birth. A parent aged ${age} looks wrong.`);
  }
  return errs;
}

// ───────────────────────────── premiums ─────────────────────────────
export interface QuoteLine { key: string; label: string; annual: number; employerPct: number; employeeAnnual: number; employerAnnual: number }
export interface Quote {
  lines: QuoteLine[];
  employeeMonthly: number;        // comes off take-home
  employerMonthly: number;        // extra cost to the company
  totalMonthly: number;
  /** Part of employeeMonthly that is a salary restructure (NPS) rather than a premium; shown separately in the preview. */
  byPlan: Record<Plan['kind'], { employee: number; employer: number }>;
}

const r0 = (n: number) => Math.round(n);

/**
 * Cost of one person's choices. The company share is a percentage of each premium line, so the split is exact per line and
 * rounded once at the end. NPS moves a percent of basic into the pension account (CTC does not change), so it is an
 * employee-side amount only. The flexible allowance is funded by the company at the full amount allocated.
 */
export function quoteEnrolment(plans: Plan[], en: Pick<Enrolment, 'status' | 'healthTier' | 'dependants' | 'mealTier' | 'npsTier' | 'flex'> | undefined, basicMonthly: number, opts: { autoCovered?: boolean } = {}): Quote {
  const lines: QuoteLine[] = [];
  const byPlan: Quote['byPlan'] = { health: { employee: 0, employer: 0 }, accident: { employee: 0, employer: 0 }, meal: { employee: 0, employer: 0 }, nps: { employee: 0, employer: 0 }, flex: { employee: 0, employer: 0 } };
  const push = (kind: Plan['kind'], key: string, label: string, annual: number, employerPct: number) => {
    const employerAnnual = (annual * employerPct) / 100;
    lines.push({ key, label, annual, employerPct, employeeAnnual: annual - employerAnnual, employerAnnual });
    byPlan[kind].employee += (annual - employerAnnual) / 12;
    byPlan[kind].employer += employerAnnual / 12;
  };

  const accident = planOf(plans, 'accident');
  if (accident && opts.autoCovered !== false) {
    const t = accident.tiers[0];
    if (t?.annualPremium?.self) push('accident', 'accident', `${accident.name}`, t.annualPremium.self, accident.employerSharePct.self ?? 100);
  }
  if (en && en.status === 'enrolled') {
    const health = planOf(plans, 'health');
    const ht = tierOf(health, en.healthTier);
    if (health && ht?.annualPremium) {
      push('health', 'health-self', `Health, employee (${ht.label})`, ht.annualPremium.self ?? 0, health.employerSharePct.self ?? 100);
      for (const d of en.dependants) {
        push('health', `health-${d.id}`, `Health, ${RELATION_LABEL[d.relation].toLowerCase()} ${d.name.trim() || ''}`.trim(), ht.annualPremium[d.relation] ?? 0, health.employerSharePct[d.relation] ?? 0);
      }
    }
    const meal = planOf(plans, 'meal');
    const mt = tierOf(meal, en.mealTier);
    if (meal && mt?.monthlyAmount) push('meal', 'meal', `Meal coupons (${mt.label})`, mt.monthlyAmount * 12, meal.employerSharePct.self ?? 0);
    const nps = planOf(plans, 'nps');
    const nt = tierOf(nps, en.npsTier);
    if (nps && nt?.pctOfBasic) push('nps', 'nps', `NPS, ${nt.pctOfBasic}% of basic`, basicMonthly * (nt.pctOfBasic / 100) * 12, nps.employerSharePct.self ?? 0);
    const flexTotal = Object.values(en.flex ?? {}).reduce((s, v) => s + v, 0);
    if (flexTotal > 0) push('flex', 'flex', 'Flexible allowance', flexTotal * 12, 100);
  }
  const employeeMonthly = r0(lines.reduce((s, l) => s + l.employeeAnnual, 0) / 12);
  const employerMonthly = r0(lines.reduce((s, l) => s + l.employerAnnual, 0) / 12);
  for (const k of Object.keys(byPlan) as Plan['kind'][]) { byPlan[k].employee = r0(byPlan[k].employee); byPlan[k].employer = r0(byPlan[k].employer); }
  return { lines, employeeMonthly, employerMonthly, totalMonthly: employeeMonthly + employerMonthly, byPlan };
}

/** Monthly basic for NPS, from the core salary engine, or 0 when the person has no structure or CTC. */
export function basicMonthlyOf(db: HrmsDb, e: Employee, asOn: ISODate): number {
  const s = db.structures.find((x) => x.id === e.structureId);
  if (!s || !e.annualCtc) return 0;
  return buildBreakup(s, e.annualCtc, { asOn, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides }).basic;
}

/** Problems with a flexible allowance allocation: whole 250s, none negative, total within the monthly budget. */
export function validateFlex(plan: Plan, alloc: Record<string, number>): string[] {
  const errs: string[] = [];
  const total = Object.values(alloc).reduce((s, v) => s + v, 0);
  if (Object.values(alloc).some((v) => v < 0 || !Number.isFinite(v))) errs.push('Amounts cannot be negative.');
  if (Object.values(alloc).some((v) => v % 250 !== 0)) errs.push('Use multiples of 250.');
  if (plan.flexMonthly != null && total > plan.flexMonthly) errs.push(`You have allocated ${total} but the monthly budget is ${plan.flexMonthly}.`);
  return errs;
}

// ───────────────────────────── progress ─────────────────────────────
export interface ProgressRow { id: Id; name: string; eligible: number; enrolled: number; waived: number; pending: number; pct: number }
export function enrolmentProgress(db: HrmsDb, enrolments: Enrolment[], coverStart: ISODate): { rows: ProgressRow[]; total: ProgressRow; pendingIds: Id[] } {
  const rows: ProgressRow[] = db.departments.map((d) => ({ id: d.id, name: d.name, eligible: 0, enrolled: 0, waived: 0, pending: 0, pct: 0 }));
  const pendingIds: Id[] = [];
  for (const e of db.employees) {
    if (!enrolmentEligibility(e, coverStart).eligible) continue;
    const row = rows.find((r) => r.id === e.departmentId);
    if (!row) continue;
    row.eligible += 1;
    const en = enrolments.find((x) => x.employeeId === e.id);
    if (en?.status === 'enrolled') row.enrolled += 1;
    else if (en?.status === 'waived') row.waived += 1;
    else { row.pending += 1; pendingIds.push(e.id); }
  }
  for (const r of rows) r.pct = r.eligible ? Math.round(((r.enrolled + r.waived) / r.eligible) * 100) : 0;
  const total: ProgressRow = rows.reduce((t, r) => ({ ...t, eligible: t.eligible + r.eligible, enrolled: t.enrolled + r.enrolled, waived: t.waived + r.waived, pending: t.pending + r.pending }), { id: 'all', name: 'Everyone', eligible: 0, enrolled: 0, waived: 0, pending: 0, pct: 0 });
  total.pct = total.eligible ? Math.round(((total.enrolled + total.waived) / total.eligible) * 100) : 0;
  return { rows: rows.filter((r) => r.eligible > 0), total, pendingIds };
}

// ───────────────────────────── claims ─────────────────────────────
/** Sample turnaround times in days from filing to a closed claim. Real TATs come from the insurer's agreement. */
export const CLAIM_TAT: Record<Claim['kind'], number> = { cashless: 3, reimbursement: 15 };
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = { submitted: 'Submitted', in_review: 'In review', query: 'Query raised', approved: 'Approved', settled: 'Settled', rejected: 'Rejected' };
export const CLAIM_NEXT: Record<ClaimStatus, ClaimStatus[]> = {
  submitted: ['in_review', 'rejected'],
  in_review: ['query', 'approved', 'rejected'],
  query: ['in_review', 'rejected'],
  approved: ['settled'],
  settled: [],
  rejected: ['in_review'],   // reopened after the employee's reply
};
export const CLAIM_REJECTION_REASONS = [
  'Documents incomplete after two reminders',
  'Treatment not covered under the plan terms',
  'Condition existed before cover and was not disclosed',
  'Claimed above the sum insured available',
  'Claim filed after the allowed filing period',
  'Other (explain in the note)',
] as const;
export const isClosedClaim = (s: ClaimStatus): boolean => s === 'settled' || s === 'rejected';

export type SlaState = 'on_track' | 'at_risk' | 'breached' | 'met' | 'missed';
export interface Sla { tat: number; age: number; state: SlaState; daysLeft: number }
/** Age is counted from filing to closing (or to today while open). At risk means 70% of the allowed days are used. */
export function claimSla(c: Pick<Claim, 'kind' | 'filedOn' | 'closedOn' | 'status'>, today: ISODate): Sla {
  const tat = CLAIM_TAT[c.kind];
  const closed = isClosedClaim(c.status);
  const age = Math.max(0, diffDays(c.filedOn, closed && c.closedOn ? c.closedOn : today));
  let state: SlaState;
  if (closed) state = age <= tat ? 'met' : 'missed';
  else state = age > tat ? 'breached' : age >= Math.ceil(tat * 0.7) ? 'at_risk' : 'on_track';
  return { tat, age, state, daysLeft: tat - age };
}

export interface ClaimsStatement { sumInsured: number; paid: number; inProcess: number; availableNow: number; availableIfAllPaid: number; claims: Claim[] }
/** Family floater: one sum insured shared by the employee and dependants. Rejected claims use none of it. */
export function claimsStatement(claims: Claim[], employeeId: Id, sumInsured: number): ClaimsStatement {
  const mine = claims.filter((c) => c.employeeId === employeeId);
  const paid = mine.filter((c) => c.status === 'settled' || c.status === 'approved').reduce((s, c) => s + (c.approved ?? 0), 0);
  const inProcess = mine.filter((c) => c.status === 'submitted' || c.status === 'in_review' || c.status === 'query').reduce((s, c) => s + c.claimed, 0);
  return { sumInsured, paid, inProcess, availableNow: Math.max(0, sumInsured - paid), availableIfAllPaid: Math.max(0, sumInsured - paid - inProcess), claims: mine };
}

// ───────────────────────────── payroll preview ─────────────────────────────
export interface DeductionRow { id: Id; employeeId: Id; name: string; code: string; health: number; meal: number; nps: number; total: number; employer: number; note: string }
/** Per-employee monthly amounts that would feed payroll. Premium shares for health, coupons and NPS come off take-home. */
export function deductionPreview(db: HrmsDb, plans: Plan[], enrolments: Enrolment[], asOn: ISODate, coverStart: ISODate): DeductionRow[] {
  const rows: DeductionRow[] = [];
  for (const e of db.employees) {
    if (!enrolmentEligibility(e, coverStart).eligible) continue;
    const en = enrolments.find((x) => x.employeeId === e.id);
    const q = quoteEnrolment(plans, en, basicMonthlyOf(db, e, asOn));
    const total = q.byPlan.health.employee + q.byPlan.meal.employee + q.byPlan.nps.employee;
    rows.push({
      id: e.id, employeeId: e.id, name: fullName(e), code: e.code,
      health: q.byPlan.health.employee, meal: q.byPlan.meal.employee, nps: q.byPlan.nps.employee, total, employer: q.employerMonthly,
      note: [q.byPlan.health.employee && `Health ${q.byPlan.health.employee}`, q.byPlan.meal.employee && `Meal coupons ${q.byPlan.meal.employee}`, q.byPlan.nps.employee && `NPS ${q.byPlan.nps.employee}`].filter(Boolean).join(', '),
    });
  }
  return rows.sort((a, b) => a.code.localeCompare(b.code));
}

export const benefitsTag = (month: Month): string => `[benefits ${month}]`;

// ───────────────────────────── renewals ─────────────────────────────
export interface RenewalItem { id: string; on: ISODate; label: string; kind: 'renewal' | 'window' | 'cover'; days: number }
export function renewalCalendar(plans: Plan[], window: BenefitsWindow, today: ISODate): RenewalItem[] {
  const items: RenewalItem[] = plans.map((p) => ({ id: `renew-${p.id}`, on: p.renewsOn, label: `${p.name} renews`, kind: 'renewal' as const, days: diffDays(today, p.renewsOn) }));
  items.push({ id: 'window-close', on: window.closesOn, label: 'Enrolment window closes', kind: 'window', days: diffDays(today, window.closesOn) });
  const start = plans.find((p) => p.kind === 'health')?.coverStart;
  if (start) items.push({ id: 'cover-start', on: start, label: 'New cover year starts', kind: 'cover', days: diffDays(today, start) });
  return items.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
}
