// Pure logic for Recruitment and Workforce planning. No React, no storage, no clock: "today" is always passed in.
// The screens only show what these functions return, and e2e/hrmsx-hiring.spec.ts checks them without a browser.

import type { Employee, ExitCase, SalaryStructure } from '../types';
import { buildBreakup, type Breakup } from '../engine';
import { addMonths, diffDays } from '../format';
import { monthEnd, monthStart } from '../rules';
import type {
  Candidate, Id, HiringPlan, ISODate, Month, Offer, Opening, RejectCode, Scenario, Scorecard, Stage, Source,
} from './types';
import { FUNNEL_STAGES, REJECT_REASONS, SOURCES, STAGES } from './types';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The financial year the plan covers (April 2026 to March 2027). */
export const FY_START: Month = '2026-04';
export const FY_END: Month = '2027-03';

// ═════════════════════════════ recruitment: openings ═════════════════════════════
export const seatsLeft = (o: Opening): number => Math.max(0, o.headcount - o.filled);
export const isLive = (o: Opening): boolean => o.status === 'open' || o.status === 'on_hold';
export const bandMid = (o: Pick<Opening, 'bandMin' | 'bandMax'>): number => Math.round((o.bandMin + o.bandMax) / 2);

/** Days since the opening went live (or was created, if it has not). A filled opening stops ageing on the day it filled. */
export function openingAge(o: Opening, today: ISODate): number {
  const from = o.openedOn ?? o.createdOn;
  const to = o.status === 'filled' && o.closedOn ? o.closedOn : today;
  return Math.max(0, diffDays(from, to));
}

export interface OpeningCheck { errors: string[] }
export function validateOpening(o: Pick<Opening, 'title' | 'departmentId' | 'locationId' | 'designationId' | 'headcount' | 'bandMin' | 'bandMax' | 'hiringManagerId' | 'filled'>): OpeningCheck {
  const errors: string[] = [];
  if (!o.title.trim()) errors.push('Give the opening a title.');
  if (!o.departmentId) errors.push('Choose a department.');
  if (!o.locationId) errors.push('Choose a location.');
  if (!o.designationId) errors.push('Choose a designation.');
  if (!o.hiringManagerId) errors.push('Choose a hiring manager.');
  if (!Number.isInteger(o.headcount) || o.headcount < 1 || o.headcount > 50) errors.push('Headcount is a whole number from 1 to 50.');
  else if (o.headcount < o.filled) errors.push(`${o.filled} seat${o.filled === 1 ? ' is' : 's are'} already filled, so headcount cannot go below that.`);
  if (!(o.bandMin > 0) || !(o.bandMax > 0)) errors.push('Enter the pay band as annual CTC in rupees.');
  else if (o.bandMax < o.bandMin) errors.push('The top of the band must not be below the bottom.');
  else if (o.bandMax > 100_000_000) errors.push('That band is above ₹10 crore, check the amount.');
  return { errors };
}

// ═════════════════════════════ headcount maths (shared with planning) ═════════════════════════════
export interface Filter { departmentId?: Id; locationId?: Id }
const matches = (e: { departmentId: Id; locationId: Id }, f: Filter): boolean =>
  (!f.departmentId || e.departmentId === f.departmentId) && (!f.locationId || e.locationId === f.locationId);

/** Was this person on the payroll of the company on that date? Joiners still in `onboarding` count only when asked for. */
export function isEmployedOn(e: Employee, date: ISODate, includeOnboarding = false): boolean {
  if (e.joinDate > date) return false;
  if (e.status === 'onboarding' && !includeOnboarding) return false;
  if (e.lastWorkingDate) return e.lastWorkingDate >= date;
  return e.status !== 'exited';
}
export function headcountOn(employees: Employee[], date: ISODate, f: Filter = {}, includeOnboarding = false): number {
  return employees.filter((e) => matches(e, f) && isEmployedOn(e, date, includeOnboarding)).length;
}

// ═════════════════════════════ approved headcount: the rule ═════════════════════════════
export interface RoomInput { plan: HiringPlan; employees: Employee[]; openings: Opening[]; fyEnd: Month }
export interface RoomCheck {
  ok: boolean; hasLine: boolean;
  approved: number;        // headcount the plan approves for this department and location at the end of the year
  committed: number;       // people already there, or joining, on that date (leavers with a last working date are taken out)
  otherUnfilled: number;   // seats on other open or on-hold openings in the same place
  room: number;            // approved - committed - otherUnfilled
  need: number;            // seats still to fill on this opening
  message: string;
}

export function planAt(plan: HiringPlan, f: Filter, month: Month): number {
  return plan.lines.filter((l) => matches(l, f)).reduce((s, l) => s + (l.months[month] ?? 0), 0);
}

/**
 * An opening cannot go live for more seats than the workforce plan approves. Approved headcount is what the plan says the
 * department should have at the location by the end of the financial year. People already on the books (or joining, or
 * leaving on a known date) and the seats other live openings hold are taken off that number; what is left is the room.
 */
export function headcountRoom(o: Opening, input: RoomInput, names: { department: string; location: string; fyEndLabel: string }): RoomCheck {
  const f: Filter = { departmentId: o.departmentId, locationId: o.locationId };
  const hasLine = input.plan.lines.some((l) => matches(l, f));
  const approved = planAt(input.plan, f, input.fyEnd);
  const committed = headcountOn(input.employees, monthEnd(input.fyEnd), f, true);
  const otherUnfilled = input.openings
    .filter((x) => x.id !== o.id && isLive(x) && matches(x, f))
    .reduce((s, x) => s + seatsLeft(x), 0);
  const room = approved - committed - otherUnfilled;
  const need = seatsLeft(o);
  const ok = hasLine && need <= Math.max(0, room);
  const where = `${names.department} at ${names.location}`;
  const s = (n: number) => `${n} seat${n === 1 ? '' : 's'}`;
  let message: string;
  if (!hasLine) {
    message = `The plan has no line for ${where}, so no headcount is approved there yet. Add a plan line on the Workforce planning page first.`;
  } else {
    const base = `The plan approves ${approved} for ${where} by ${names.fyEndLabel}. ${committed} ${committed === 1 ? 'is' : 'are'} already there or joining and other open positions hold ${otherUnfilled}, which leaves ${s(Math.max(0, room))}. This opening needs ${need}.`;
    message = ok ? base : `${base} Raise the plan on the Workforce planning page, or reduce the headcount.`;
  }
  return { ok, hasLine, approved, committed, otherUnfilled, room, need, message };
}

// ═════════════════════════════ recruitment: candidates ═════════════════════════════
export interface MoveCheck { ok: boolean; reason?: string; needsReason?: boolean }

/** Which stage moves are allowed, with the plain reason when one is not. The store re-checks this, so the UI cannot bypass it. */
export function canMove(c: Candidate, to: Stage): MoveCheck {
  if (c.convertedEmployeeId) return { ok: false, reason: 'This person is already an employee, so the stage is final.' };
  if (to === c.stage) return { ok: false, reason: 'Already at this stage.' };
  if (c.offer?.status === 'extended' && to !== 'hired') return { ok: false, reason: 'An offer is out. Record whether the candidate accepted or declined it first.' };
  if (c.stage === 'rejected' && to !== 'applied') return { ok: false, reason: 'A rejected candidate can only be reopened to Applied.' };
  if (to === 'hired' && c.offer?.status !== 'accepted') return { ok: false, reason: 'Mark the offer accepted first. Hired means an accepted offer.' };
  if (to === 'rejected') return { ok: true, needsReason: true };
  return { ok: true };
}

export function nextStage(s: Stage): Stage | null {
  const i = FUNNEL_STAGES.indexOf(s as (typeof FUNNEL_STAGES)[number]);
  return i >= 0 && i < FUNNEL_STAGES.length - 1 ? FUNNEL_STAGES[i + 1]! : null;
}
export function prevStage(s: Stage): Stage | null {
  const i = FUNNEL_STAGES.indexOf(s as (typeof FUNNEL_STAGES)[number]);
  return i > 0 ? FUNNEL_STAGES[i - 1]! : null;
}

/** Days the candidate has been at the current stage. */
export function daysInStage(c: Candidate, today: ISODate): number {
  const last = c.history[c.history.length - 1];
  return Math.max(0, diffDays(last?.on ?? c.appliedOn, today));
}

// ── scorecards: numbers for people to read, never a verdict ──
export function scorecardAverage(sc: Scorecard): number | null {
  const r = sc.ratings.filter((x) => x.rating >= 1 && x.rating <= 5);
  return r.length ? r1(r.reduce((s, x) => s + x.rating, 0) / r.length) : null;
}
export function candidateAverage(c: Candidate): { average: number | null; rounds: number } {
  const avgs = c.scorecards.map(scorecardAverage).filter((x): x is number => x != null);
  return { average: avgs.length ? r1(avgs.reduce((s, x) => s + x, 0) / avgs.length) : null, rounds: c.scorecards.length };
}
/** Rows = competencies, columns = rounds, so rounds can be read side by side. A competency not asked in a round is null. */
export function scorecardMatrix(scs: Scorecard[]): { competencies: string[]; cells: (number | null)[][]; averages: (number | null)[] } {
  const competencies: string[] = [];
  for (const s of scs) for (const r of s.ratings) if (!competencies.includes(r.competency)) competencies.push(r.competency);
  const cells = competencies.map((c) => scs.map((s) => s.ratings.find((r) => r.competency === c)?.rating ?? null));
  return { competencies, cells, averages: scs.map(scorecardAverage) };
}
export function validateScorecard(sc: Pick<Scorecard, 'round' | 'interviewerId' | 'ratings'>): string[] {
  const e: string[] = [];
  if (!sc.round) e.push('Choose the round.');
  if (!sc.interviewerId) e.push('Choose the interviewer.');
  if (sc.ratings.length === 0) e.push('Rate at least one competency.');
  if (sc.ratings.some((r) => !Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5)) e.push('Every rating is a whole number from 1 to 5.');
  return e;
}

// ── offers ──
export interface OfferView { breakup: Breakup | null; wageOk: boolean | null; warnings: string[] }
/** The monthly breakup with the core payroll engine, so an offer is checked against the same 50% wages rule as a payslip. */
export function offerBreakup(structure: SalaryStructure | undefined, ctc: number, joiningDate: ISODate): OfferView {
  if (!structure || !(ctc > 0)) return { breakup: null, wageOk: null, warnings: [] };
  const breakup = buildBreakup(structure, ctc, { asOn: joiningDate, pfMember: true });
  return { breakup, wageOk: breakup.wageTest.passes, warnings: breakup.warnings };
}
export function validateOffer(o: Pick<Offer, 'ctc' | 'joiningDate' | 'structureId'>, opening: Opening | undefined, today: ISODate): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!(o.ctc > 0)) errors.push('Enter the annual CTC in rupees.');
  else if (o.ctc > 100_000_000) errors.push('That CTC is above ₹10 crore, check the amount.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.joiningDate)) errors.push('Choose a joining date.');
  else if (o.joiningDate < today) errors.push('The joining date cannot be in the past.');
  if (!o.structureId) errors.push('Choose a salary structure.');
  if (opening && o.ctc > 0 && o.ctc > opening.bandMax) warnings.push('This CTC is above the top of the opening\'s band. Get the band exception approved by a person before you extend it.');
  if (opening && o.ctc > 0 && o.ctc < opening.bandMin) warnings.push('This CTC is below the bottom of the opening\'s band.');
  return { errors, warnings };
}

// ═════════════════════════════ recruitment: insights ═════════════════════════════
export interface Insights {
  timeToHire: { count: number; average: number | null; median: number | null; items: { candidateId: Id; days: number }[] };
  funnel: { stage: Stage; reached: number; pctOfApplied: number; stepConversion: number | null }[];
  rejections: { code: RejectCode; label: string; count: number }[];
  sources: { source: Source; applicants: number; interviewed: number; offered: number; hired: number; hireRate: number | null }[];
  offers: { extended: number; accepted: number; declined: number; waiting: number; acceptRate: number | null };
  age: { label: string; seats: number; openings: number }[];
}

/** The furthest funnel stage a candidate got to (rejected people keep the stage they had reached). */
export function furthestStage(c: Candidate): number {
  let best = 0;
  const consider = (s: Stage) => { const i = FUNNEL_STAGES.indexOf(s as (typeof FUNNEL_STAGES)[number]); if (i > best) best = i; };
  for (const h of c.history) consider(h.to);
  consider(c.stage);
  return best;
}
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : r1((s[m - 1]! + s[m]!) / 2);
};

export function hiringInsights(candidates: Candidate[], openings: Opening[], today: ISODate): Insights {
  // time to hire: applied → the move to Hired
  const items = candidates.flatMap((c) => {
    const h = c.history.find((x) => x.to === 'hired');
    return h ? [{ candidateId: c.id, days: Math.max(0, diffDays(c.appliedOn, h.on)) }] : [];
  });
  const days = items.map((i) => i.days);

  const n = candidates.length;
  const reachedAt = FUNNEL_STAGES.map((_, idx) => candidates.filter((c) => furthestStage(c) >= idx).length);
  const funnel = FUNNEL_STAGES.map((stage, idx) => ({
    stage, reached: reachedAt[idx]!,
    pctOfApplied: n ? r1((reachedAt[idx]! / n) * 100) : 0,
    stepConversion: idx === 0 ? null : reachedAt[idx - 1]! ? r1((reachedAt[idx]! / reachedAt[idx - 1]!) * 100) : null,
  }));

  const rejections = REJECT_REASONS.map((r) => ({ code: r.code, label: r.label, count: candidates.filter((c) => c.stage === 'rejected' && c.rejectReason === r.code).length })).filter((r) => r.count > 0);

  const sources = SOURCES.map((source) => {
    const cs = candidates.filter((c) => c.source === source);
    const hired = cs.filter((c) => furthestStage(c) >= 4).length;
    return {
      source, applicants: cs.length,
      interviewed: cs.filter((c) => furthestStage(c) >= 2).length,
      offered: cs.filter((c) => furthestStage(c) >= 3).length,
      hired, hireRate: cs.length ? r1((hired / cs.length) * 100) : null,
    };
  });

  const offered = candidates.filter((c) => c.offer && c.offer.status !== 'draft');
  const accepted = offered.filter((c) => c.offer!.status === 'accepted').length;
  const declined = offered.filter((c) => c.offer!.status === 'declined').length;
  const offers = {
    extended: offered.length, accepted, declined, waiting: offered.filter((c) => c.offer!.status === 'extended').length,
    acceptRate: accepted + declined ? r1((accepted / (accepted + declined)) * 100) : null,
  };

  const live = openings.filter((o) => isLive(o) && seatsLeft(o) > 0);
  const buckets = [
    { label: '0 to 30 days', min: 0, max: 30 }, { label: '31 to 60 days', min: 31, max: 60 },
    { label: '61 to 90 days', min: 61, max: 90 }, { label: 'Over 90 days', min: 91, max: Infinity },
  ];
  const age = buckets.map((b) => {
    const os = live.filter((o) => { const a = openingAge(o, today); return a >= b.min && a <= b.max; });
    return { label: b.label, openings: os.length, seats: os.reduce((s, o) => s + seatsLeft(o), 0) };
  });

  return {
    timeToHire: { count: days.length, average: days.length ? r1(days.reduce((s, x) => s + x, 0) / days.length) : null, median: median(days), items },
    funnel, rejections, sources, offers, age,
  };
}

/** Candidates ever seen in the pipeline for an opening, newest stage first within the board. Used for counts on the openings table. */
export function pipelineCounts(candidates: Candidate[], openingId: Id): Record<Stage, number> {
  const out = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  for (const c of candidates) if (c.openingId === openingId) out[c.stage] += 1;
  return out;
}

// ═════════════════════════════ workforce planning ═════════════════════════════
export function fiscalMonths(start: Month = '2026-04'): Month[] {
  return Array.from({ length: 12 }, (_, i) => addMonths(start, i));
}
export const monthIsPast = (m: Month, today: ISODate): boolean => monthStart(m) <= today;
/** The date a month's headcount is read on: month end, but never later than today. */
export const asOf = (m: Month, today: ISODate): ISODate => (monthEnd(m) < today ? monthEnd(m) : today);

export interface PlanInput { plan: HiringPlan; employees: Employee[]; openings: Opening[]; today: ISODate }
export interface MonthPoint { month: Month; plan: number; actual: number | null; committed: number; gap: number; basis: 'actual' | 'committed' }

/** Plan, actual and committed headcount for each month. Actual stops at today; committed adds joiners and takes out known leavers. */
export function monthlySeries(input: PlanInput, f: Filter, months: Month[]): MonthPoint[] {
  return months.map((m) => {
    const plan = planAt(input.plan, f, m);
    const past = monthIsPast(m, input.today);
    const actual = past ? headcountOn(input.employees, asOf(m, input.today), f) : null;
    const committed = headcountOn(input.employees, monthEnd(m), f, true);
    const basis = actual != null ? 'actual' : 'committed';
    return { month: m, plan, actual, committed, gap: (actual ?? committed) - plan, basis };
  });
}
export function openSeats(openings: Opening[], f: Filter): number {
  return openings.filter((o) => isLive(o) && matches(o, f)).reduce((s, o) => s + seatsLeft(o), 0);
}

export interface GroupRow { key: Id; plan: number; actual: number; committed: number; gap: number; openSeats: number }
/** One row per department (or location) for a single month. Groups come from the plan lines and from the people. */
export function groupRows(input: PlanInput, by: 'department' | 'location', month: Month, keys: Id[]): GroupRow[] {
  const field = by === 'department' ? 'departmentId' : 'locationId';
  return keys.map((key) => {
    const f: Filter = { [field]: key };
    const p = monthlySeries(input, f, [month])[0]!;
    return { key, plan: p.plan, actual: p.actual ?? p.committed, committed: p.committed, gap: p.gap, openSeats: openSeats(input.openings, f) };
  }).filter((r) => r.plan > 0 || r.actual > 0 || r.committed > 0 || r.openSeats > 0);
}

// ── budget ──
const annual = (e: Employee, avg: Record<Id, number>): number => e.annualCtc ?? avg[e.departmentId] ?? 0;

export interface BudgetFigures {
  plannedFy: number;
  actualToDate: number; monthsElapsed: number;
  runRate: number;                  // annual CTC of everyone on the payroll today
  missingCtc: number;               // people employed today with no CTC on file (counted as zero in the actual)
  openCostAnnual: number; openCostFy: number; openSeats: number;
  projectedNoHire: number; projectedWithHire: number; varianceVsPlan: number;
  monthly: { month: Month; planned: number; cost: number; kind: 'actual' | 'committed' | 'open' }[];
}

export function budgetFigures(input: PlanInput, openStartMonth: Month, months: Month[], f: Filter = {}): BudgetFigures {
  const { plan, employees, openings, today } = input;
  const live = openings.filter((o) => isLive(o) && seatsLeft(o) > 0 && matches(o, f));
  const current = months.filter((m) => monthIsPast(m, today));
  const lastCurrent = current[current.length - 1] ?? months[0]!;

  const plannedMonth = (m: Month): number => plan.lines.filter((l) => matches(l, f)).reduce((s, l) => s + ((l.months[m] ?? 0) * (plan.avgCtc[l.departmentId] ?? 0)) / 12, 0);
  const costMonth = (m: Month, committed: boolean): number => {
    const date = committed ? monthEnd(m) : asOf(m, today);
    return employees.filter((e) => matches(e, f) && isEmployedOn(e, date, committed)).reduce((s, e) => s + (committed ? annual(e, plan.avgCtc) : e.annualCtc ?? 0) / 12, 0);
  };
  const startIdx = Math.max(months.indexOf(openStartMonth), months.indexOf(lastCurrent) + 1);
  const openMonthly = live.reduce((s, o) => s + (seatsLeft(o) * bandMid(o)) / 12, 0);

  const monthly = months.map((m, i) => {
    const isCur = monthIsPast(m, today);
    const base = costMonth(m, !isCur);
    const open = !isCur && startIdx >= 0 && i >= startIdx ? openMonthly : 0;
    return { month: m, planned: plannedMonth(m), cost: base + open, kind: (isCur ? 'actual' : open > 0 ? 'open' : 'committed') as 'actual' | 'committed' | 'open' };
  });
  const plannedFy = monthly.reduce((s, x) => s + x.planned, 0);
  const actualToDate = months.filter((m) => monthIsPast(m, today)).reduce((s, m) => s + costMonth(m, false), 0);
  const futureCommitted = months.filter((m) => !monthIsPast(m, today)).reduce((s, m) => s + costMonth(m, true), 0);
  const openMonths = startIdx >= 0 ? Math.max(0, months.length - startIdx) : 0;
  const openCostFy = openMonthly * openMonths;
  const todayEmployed = employees.filter((e) => matches(e, f) && isEmployedOn(e, today));
  const projectedNoHire = actualToDate + futureCommitted;
  return {
    plannedFy, actualToDate, monthsElapsed: current.length,
    runRate: todayEmployed.reduce((s, e) => s + (e.annualCtc ?? 0), 0),
    missingCtc: todayEmployed.filter((e) => !e.annualCtc).length,
    openCostAnnual: live.reduce((s, o) => s + seatsLeft(o) * bandMid(o), 0), openCostFy, openSeats: live.reduce((s, o) => s + seatsLeft(o), 0),
    projectedNoHire, projectedWithHire: projectedNoHire + openCostFy, varianceVsPlan: projectedNoHire + openCostFy - plannedFy,
    monthly,
  };
}

// ── attrition ──
export interface ExitRecord { employeeId: Id; lastWorkingDate: ISODate; departmentId: Id; kind: 'left' | 'serving' }
/** Everyone with a last working date: employees marked exited or on notice, plus exit cases not yet reflected on the employee. */
export function exitRecords(employees: Employee[], exits: ExitCase[], today: ISODate): ExitRecord[] {
  const out = new Map<Id, ExitRecord>();
  for (const e of employees) {
    if ((e.status === 'exited' || e.status === 'on_notice') && e.lastWorkingDate) {
      out.set(e.id, { employeeId: e.id, lastWorkingDate: e.lastWorkingDate, departmentId: e.departmentId, kind: e.lastWorkingDate <= today ? 'left' : 'serving' });
    }
  }
  for (const x of exits) {
    if (out.has(x.employeeId)) continue;
    const e = employees.find((y) => y.id === x.employeeId);
    if (e) out.set(e.id, { employeeId: e.id, lastWorkingDate: x.lastWorkingDate, departmentId: e.departmentId, kind: x.lastWorkingDate <= today ? 'left' : 'serving' });
  }
  return [...out.values()].sort((a, b) => (a.lastWorkingDate < b.lastWorkingDate ? -1 : 1));
}
const oneYearBefore = (d: ISODate): ISODate => {
  const [y, m, day] = d.split('-').map(Number);
  return `${y! - 1}-${String(m).padStart(2, '0')}-${String(m === 2 && day === 29 ? 28 : day).padStart(2, '0')}`;
};
export interface AttritionPoint { month: Month; left: number; serving: number; exits12: number; openingHc: number; closingHc: number; averageHc: number; rate: number | null }
/**
 * Rolling 12 months: people who left in the 12 months up to the end of the month (or today), divided by the average of the
 * headcount a year earlier and the headcount at the end, times 100. People still serving notice are counted separately.
 */
export function attritionSeries(employees: Employee[], records: ExitRecord[], months: Month[], today: ISODate, f: Filter = {}): AttritionPoint[] {
  const inScope = (r: ExitRecord): boolean => {
    const e = employees.find((x) => x.id === r.employeeId);
    return !!e && matches(e, f);
  };
  const scoped = records.filter(inScope);
  return months.map((m) => {
    const end = asOf(m, today);
    const past = monthIsPast(m, today);
    const start = oneYearBefore(end);
    const left = scoped.filter((r) => r.lastWorkingDate.slice(0, 7) === m && r.kind === 'left').length;
    const serving = scoped.filter((r) => r.lastWorkingDate.slice(0, 7) === m && r.kind === 'serving').length;
    if (!past) return { month: m, left, serving, exits12: 0, openingHc: 0, closingHc: 0, averageHc: 0, rate: null };
    const exits12 = scoped.filter((r) => r.kind === 'left' && r.lastWorkingDate > start && r.lastWorkingDate <= end).length;
    const openingHc = headcountOn(employees, start, f);
    const closingHc = headcountOn(employees, end, f);
    const averageHc = (openingHc + closingHc) / 2;
    return { month: m, left, serving, exits12, openingHc, closingHc, averageHc, rate: averageHc ? r1((exits12 / averageHc) * 100) : null };
  });
}

// ── scenarios ──
export interface ScenarioRow { month: Month; headcount: number; hires: number; exits: number; cost: number }
export interface ScenarioResult { rows: ScenarioRow[]; startHeadcount: number; endHeadcount: number; costToEnd: number; fyTotal: number }
/**
 * Month by month from the headcount at the end of `startMonth`: add the hires, take out attrition (annual % divided by 12, applied
 * to the headcount at the start of the month), and cost the month-end headcount at the average CTC divided by 12.
 */
export function projectScenario(s: Pick<Scenario, 'hiresPerMonth' | 'attritionPct' | 'avgCtc'>, startHeadcount: number, startMonth: Month, endMonth: Month, spentToDate: number): ScenarioResult {
  const rows: ScenarioRow[] = [];
  let hc = startHeadcount;
  for (let m = addMonths(startMonth, 1); m <= endMonth; m = addMonths(m, 1)) {
    const exits = (hc * s.attritionPct) / 100 / 12;
    const hires = s.hiresPerMonth;
    hc = Math.max(0, hc + hires - exits);
    rows.push({ month: m, headcount: r1(hc), hires, exits: r1(exits), cost: Math.round((hc * s.avgCtc) / 12) });
  }
  const costToEnd = rows.reduce((t, r) => t + r.cost, 0);
  return { rows, startHeadcount, endHeadcount: rows[rows.length - 1]?.headcount ?? startHeadcount, costToEnd, fyTotal: Math.round(spentToDate + costToEnd) };
}

export function validateScenario(s: Pick<Scenario, 'name' | 'hiresPerMonth' | 'attritionPct' | 'avgCtc'>): string[] {
  const e: string[] = [];
  if (!s.name.trim()) e.push('Give the scenario a name.');
  if (!Number.isFinite(s.hiresPerMonth) || s.hiresPerMonth < 0 || s.hiresPerMonth > 20) e.push('Hires per month: a number from 0 to 20.');
  if (!Number.isFinite(s.attritionPct) || s.attritionPct < 0 || s.attritionPct > 100) e.push('Attrition: a percentage from 0 to 100.');
  if (!Number.isFinite(s.avgCtc) || s.avgCtc < 100_000 || s.avgCtc > 20_000_000) e.push('Average CTC: between ₹1 lakh and ₹2 crore a year.');
  return e;
}

