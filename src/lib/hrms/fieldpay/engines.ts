// Pure logic behind the incentive, travel, territory and team-health screens. No React, no storage: every function
// takes the field evidence (and whatever people decided) as arguments, so the tests can feed it anything.
// The numbers that go to payroll are computed here the same way `pushFieldPayToPayroll` computes them, so a page can
// show "what will be handed over" before anyone presses the button.

import { addDays, daysInMonth, fmtDate, fmtMonthLong, inr } from '../format';
import type { Adjustment, Id, ISODate, Month } from '../types';
import { computeIncentives, computeTravelAllowance, datesBetween, REGULARISATION_POLICY, territoryOverlaps } from '../field/engines';
import { haversineKm, toMin, weekdayOf } from '../field/evidence';
import type { FieldEvidence, IncentivePlan, IncentiveResult, Outlet, Visit } from '../field/types';
import type {
  CoverageResult, EffectiveTravel, OutletActivity, OutletMove, OverlapView, PayrollPreview, PushedSummary, PreviewRow, Streak, Team,
  TeamSummary, WeekSignals, WhatIf,
} from './types';

export type TravelOverrides = Record<string, { km: number; by: string; at: string; note: string }>;

export const MIN_TEAM_SIZE = 5;                  // wellbeing numbers are never shown for a group smaller than this
export const LONG_DAY_MIN = 10 * 60;             // a day longer than this many minutes counts as a long day
export const EVENING_FROM = '19:00';
export const MAX_DAYS_IN_A_ROW = 6;              // more than this many working days in a row is flagged
export const FAR_OUTLET_ID = 'out_far_blr';      // the one planted far-away dealer; it is not part of any beat plan
export const OVERLAP_METRES = 500;
export const FIELD_TAG = (month: Month): string => `[field ${month}]`;

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const round1 = (n: number): number => Math.round(n * 10) / 10;

// ═════════════════════════════ incentives ═════════════════════════════

/**
 * The payout the plan gives for a hypothetical amount booked, using the same marginal-band maths as
 * `computeIncentives`. `collectedShare` is the share of the booked value that is collected enough to pay now
 * (the plan holds a deal until it is paid up); 1 means everything is.
 */
export function payoutForBooked(plan: IncentivePlan, target: number, booked: number, collectedShare = 1): WhatIf {
  const bandRows = plan.bands.map((b) => {
    const lo = (b.from / 100) * target;
    const hi = b.to == null ? Infinity : (b.to / 100) * target;
    const revenueInBand = target ? Math.max(0, Math.min(booked, hi) - lo) : 0;
    return { ...b, revenueInBand, amount: revenueInBand * b.rate };
  });
  const accrued = sum(bandRows.map((r) => r.amount));
  const share = Math.max(0, Math.min(1, collectedShare));
  const attainmentPct = target ? (booked / target) * 100 : 0;
  const edge = plan.bands.filter((b) => b.from > attainmentPct && target > 0).sort((a, b) => a.from - b.from)[0];
  return {
    target, booked, attainmentPct, bandRows, accrued,
    effectiveRate: booked ? accrued / booked : 0,
    payableNow: accrued * share, held: accrued * (1 - share),
    nextEdge: edge ? { pct: edge.from, rate: edge.rate, moreBooked: Math.max(0, (edge.from / 100) * target - booked) } : undefined,
  };
}

/** Share of a person's booked value that sits on deals the plan already pays (collected enough). */
export function collectedShareOf(res: IncentiveResult): number {
  if (!res.achieved) return 1;
  return sum(res.lines.filter((l) => l.status === 'paid_now').map((l) => l.value)) / res.achieved;
}

/** What the rep reads in their own app, in the first person. Plain sentences, no jargon. */
export function repStatement(res: IncentiveResult, plan: IncentivePlan, opts: { heldReason?: string } = {}): string[] {
  const out: string[] = [];
  const month = fmtMonthLong(res.month);
  out.push(`You booked ${inr(res.achieved)} in ${month}, which is ${Math.round(res.attainmentPct)}% of your target of ${inr(res.target)}.`);

  const paying = res.bandRows.filter((b) => b.rate > 0 && b.revenueInBand > 0);
  const firstPaying = plan.bands.filter((b) => b.rate > 0).sort((a, b) => a.from - b.from)[0];
  if (!paying.length) {
    const need = firstPaying ? Math.max(0, (firstPaying.from / 100) * res.target - res.achieved) : 0;
    out.push(`The plan starts paying at ${firstPaying?.from ?? 0}% of target, so ${month} pays no incentive.${need ? ` ${inr(need)} more booked would have reached that line.` : ''}`);
  } else {
    for (const b of paying) {
      const label = b.to == null ? `above ${b.from}%` : `between ${b.from}% and ${b.to}%`;
      out.push(`${inr(b.revenueInBand)} of your sales came ${label} of target. That part pays ${(b.rate * 100).toFixed(1).replace(/\.0$/, '')}%, which is ${inr(b.amount)}.`);
    }
    out.push(`Together that is ${inr(sum(paying.map((b) => b.amount)))} for the month.`);
  }

  const held = res.lines.filter((l) => l.status === 'held_collection');
  if (held.length) {
    out.push(`${inr(res.heldTotal)} of it is held back because the customer has not yet paid ${plan.minCollectionPct}% of the invoice (${Array.from(new Set(held.map((l) => l.customer))).join(', ')}). It is not lost. It is paid once the invoice is ${plan.minCollectionPct}% collected.`);
  }
  for (const c of res.clawbacks) {
    out.push(c.allowed
      ? `${c.customer} was cancelled after you were paid for it, so ${inr(c.amount)} is taken back. ${c.why}`
      : `${c.customer} was cancelled too, but nothing is taken back. ${c.why}`);
  }
  if (opts.heldReason) {
    out.push(`HR has put your payout on hold: "${opts.heldReason}". A hold is not a decision against you. If you disagree, reply to HR and a person will decide.`);
  } else if (res.net > 0) {
    out.push(`You will be paid ${inr(res.net)} with the pay run${held.length ? ', and the held part later' : ''}.`);
  } else {
    out.push('There is nothing to pay for this month.');
  }
  out.push('These are your own figures. They are not a ranking and are not compared with anyone else.');
  return out;
}

// ═════════════════════════════ travel ═════════════════════════════

/** The statement for a month with the km HR decided in disputes applied, and the month total exactly as it is pushed. */
export function effectiveTravel(ev: FieldEvidence, employeeId: Id, month: Month, overrides: TravelOverrides): EffectiveTravel {
  const t = computeTravelAllowance(ev, employeeId, month);
  const rate = t.vehicle === 'public' ? 0 : ev.travel.ratePerKm[t.vehicle];
  const days = t.days.map((d) => {
    const o = overrides[`${employeeId}|${d.date}`];
    const extraKm = o ? Math.max(0, o.km - d.payableKm) : 0;
    return {
      date: d.date, trailKm: d.trailKm, odometerKm: d.odometerKm, gapMin: d.gapMin,
      effectiveKm: round1(d.payableKm + extraKm),
      decidedKm: o?.km, decidedBy: o?.by, decidedNote: o?.note,
      extraKm: round1(extraKm), amount: d.amount + Math.round(extraKm * rate),
      disputeCandidate: d.disputeCandidate, proposedKm: d.proposedKm, note: d.note,
    };
  });
  const extraKmRaw = sum(t.days.map((d) => { const o = overrides[`${employeeId}|${d.date}`]; return o ? Math.max(0, o.km - d.payableKm) : 0; }));
  const extraAmount = Math.round(extraKmRaw * rate);
  return {
    employeeId, month, vehicle: t.vehicle, rate, days,
    gpsKm: t.payableKm, extraKm: round1(extraKmRaw), effectiveKm: round1(t.payableKm + extraKmRaw),
    gpsAmount: t.amount, extraAmount, amount: t.amount + extraAmount,
  };
}

/** The day a page should open on: the first dispute candidate, else the longest day of the month. */
export function defaultTravelDay(t: EffectiveTravel): ISODate | undefined {
  const cand = t.days.find((d) => d.disputeCandidate);
  if (cand) return cand.date;
  return [...t.days].sort((a, b) => b.trailKm - a.trailKm || a.date.localeCompare(b.date))[0]?.date;
}

/** Longest stretch of the day's trail with no fix, as the two clock times around it. */
export function gapWindow(points: { t: string }[], minGapMin = 30): { from: string; to: string; minutes: number } | undefined {
  let best: { from: string; to: string; minutes: number } | undefined;
  for (let i = 1; i < points.length; i++) {
    const m = toMin(points[i]!.t) - toMin(points[i - 1]!.t);
    if (m >= minGapMin && (!best || m > best.minutes)) best = { from: points[i - 1]!.t, to: points[i]!.t, minutes: m };
  }
  return best;
}

// ═════════════════════════════ what goes to payroll ═════════════════════════════

/**
 * What `pushFieldPayToPayroll` hands over for the month: per person the net incentive (nothing while HR holds it)
 * and the travel allowance with decided dispute km. `onPayroll` limits it to people who exist in the core database.
 */
export function payrollPreview(
  ev: FieldEvidence, month: Month, holds: Record<Id, string>, overrides: TravelOverrides, onPayroll?: Set<Id>,
): PayrollPreview {
  const rows: PreviewRow[] = [];
  for (const rep of ev.reps) {
    if (onPayroll && !onPayroll.has(rep.employeeId)) continue;
    const i = computeIncentives(ev, rep.employeeId, month);
    const heldReason = holds[rep.employeeId];
    const net = Math.max(0, i.net);
    const t = effectiveTravel(ev, rep.employeeId, month, overrides);
    rows.push({
      employeeId: rep.employeeId, incentive: heldReason ? 0 : net, withheld: heldReason ? net : 0,
      travel: t.amount, extraKm: t.extraKm, held: !!heldReason, heldReason, clawback: i.clawbackTotal,
    });
  }
  return {
    month, rows,
    incentives: sum(rows.map((r) => r.incentive)), travel: sum(rows.map((r) => r.travel)),
    people: rows.filter((r) => r.incentive > 0 || r.travel > 0).length,
    heldPeople: rows.filter((r) => r.held).length,
  };
}

/** What is already in the core database from an earlier push (rows tagged `[field YYYY-MM]`). */
export function pushedSummary(adjustments: Adjustment[], month: Month): PushedSummary {
  const tag = FIELD_TAG(month);
  const rows = adjustments.filter((a) => (a.note ?? '').startsWith(tag));
  return {
    rows: rows.length,
    incentives: sum(rows.filter((a) => a.kind === 'incentive').map((a) => a.amount)),
    travel: sum(rows.filter((a) => a.kind === 'reimbursement').map((a) => a.amount)),
    people: new Set(rows.map((a) => a.employeeId)).size,
  };
}

// ═════════════════════════════ territory and beats ═════════════════════════════

export const plannedOutlets = (ev: FieldEvidence): Outlet[] => ev.outlets.filter((o) => o.id !== FAR_OUTLET_ID);

/** The evidence with outlet reassignments applied (a new object only when there is something to apply). */
export function applyMoves(ev: FieldEvidence, moves: Record<Id, OutletMove>): FieldEvidence {
  if (!Object.keys(moves).length) return ev;
  return { ...ev, outlets: ev.outlets.map((o) => (moves[o.id] ? { ...o, repId: moves[o.id]!.toRepId } : o)) };
}

/** Weekday (1 Monday .. 6 Saturday) of the beat an outlet was planned on. */
export function outletWeekdays(ev: FieldEvidence): Map<Id, number> {
  const byBeat = new Map(ev.beats.map((b) => [b.id, b.weekday as number]));
  return new Map(ev.outlets.map((o) => [o.id, byBeat.get(o.beatId) ?? 0]));
}

/** Verified and total visits per outlet in the month, and the last verified visit anywhere in the evidence window. */
export function outletActivity(ev: FieldEvidence, month: Month): Map<Id, OutletActivity> {
  const m = new Map<Id, OutletActivity>();
  for (const v of ev.visits) {
    const a = m.get(v.outletId) ?? { verified: 0, total: 0 };
    if (v.date.startsWith(month)) { a.total++; if (v.verified) a.verified++; }
    if (v.verified && (!a.lastVerified || v.date > a.lastVerified)) a.lastVerified = v.date;
    m.set(v.outletId, a);
  }
  return m;
}

/**
 * Share of a person's planned outlets that got a verified visit in the month. A verified visit counts for the
 * outlet whoever made it, so handing an outlet to someone else does not erase the visit it already had.
 * With no reassignments this equals `beatCoverage` from the field engines.
 */
export function coverageFor(ev: FieldEvidence, employeeId: Id, month: Month, activity = outletActivity(ev, month)): CoverageResult {
  const planned = plannedOutlets(ev).filter((o) => o.repId === employeeId);
  const missed = planned.filter((o) => !(activity.get(o.id)?.verified));
  return { planned: planned.length, visited: planned.length - missed.length, pct: planned.length ? Math.round(((planned.length - missed.length) / planned.length) * 100) : 0, missedIds: missed.map((o) => o.id) };
}

/** Coverage of a territory's outlets (whoever owns them now). */
export function territoryCoverage(ev: FieldEvidence, territoryId: Id, month: Month, activity = outletActivity(ev, month)): CoverageResult {
  const planned = plannedOutlets(ev).filter((o) => o.territoryId === territoryId);
  const missed = planned.filter((o) => !(activity.get(o.id)?.verified));
  return { planned: planned.length, visited: planned.length - missed.length, pct: planned.length ? Math.round(((planned.length - missed.length) / planned.length) * 100) : 0, missedIds: missed.map((o) => o.id) };
}

const TIER_ORDER = { A: 0, B: 1, C: 2 } as const;
/** Planned outlets with no verified visit in the month, tier A first. */
export function dormantOutlets(ev: FieldEvidence, month: Month, activity = outletActivity(ev, month)): Outlet[] {
  return plannedOutlets(ev)
    .filter((o) => !(activity.get(o.id)?.verified))
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Booked revenue of the people who work a territory (deals standing at the month end, same as the incentive screen). */
export function territoryBooked(ev: FieldEvidence, territoryId: Id, month: Month): { booked: number; people: Id[] } {
  const people = ev.reps.filter((r) => r.territoryId === territoryId).map((r) => r.employeeId);
  return { people, booked: sum(people.map((id) => computeIncentives(ev, id, month).achieved)) };
}

/** Outlet pairs from two different people within `metres`, each with a suggested fix. `ev` should already have moves applied. */
export function overlapViews(ev: FieldEvidence, metres = OVERLAP_METRES): OverlapView[] {
  const byId = new Map(ev.outlets.map((o) => [o.id, o]));
  const wd = outletWeekdays(ev);
  const nearCount = (repId: Id, mid: { lat: number; lng: number }) =>
    ev.outlets.filter((o) => o.repId === repId && haversineKm(o.pos, mid) * 1000 <= 1000).length;
  return territoryOverlaps(ev, metres).map((p) => {
    const a = byId.get(p.a)!, b = byId.get(p.b)!;
    const mid = { lat: (a.pos.lat + b.pos.lat) / 2, lng: (a.pos.lng + b.pos.lng) / 2 };
    const nearA = nearCount(p.repA, mid), nearB = nearCount(p.repB, mid);
    // The person with more outlets around keeps the area; the other person's outlet moves to them.
    const keepA = nearA >= nearB;
    return {
      ...p, weekdayA: wd.get(p.a) ?? 0, weekdayB: wd.get(p.b) ?? 0,
      suggestion: keepA
        ? { moveOutletId: p.b, fromRepId: p.repB, toRepId: p.repA, nearFrom: nearB, nearTo: nearA }
        : { moveOutletId: p.a, fromRepId: p.repA, toRepId: p.repB, nearFrom: nearA, nearTo: nearB },
    };
  });
}

/** A person's six-day beat plan: weekday 1..6 to the outlets planned that day (including outlets handed to them). */
export function beatPlan(ev: FieldEvidence, employeeId: Id): Record<number, Outlet[]> {
  const wd = outletWeekdays(ev);
  const plan: Record<number, Outlet[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const o of plannedOutlets(ev)) {
    if (o.repId !== employeeId) continue;
    const d = wd.get(o.id) ?? 0;
    if (plan[d]) plan[d]!.push(o);
  }
  return plan;
}

// ═════════════════════════════ team health ═════════════════════════════

type Index = { punches: Map<string, { in?: string; out?: string }>; visits: Map<string, Visit[]> };
const indexCache = new WeakMap<FieldEvidence, Index>();
function indexOf(ev: FieldEvidence): Index {
  let ix = indexCache.get(ev);
  if (!ix) {
    ix = { punches: new Map(), visits: new Map() };
    for (const p of ev.punches) ix.punches.set(`${p.employeeId}|${p.date}`, { in: p.in, out: p.out });
    for (const v of ev.visits) {
      const k = `${v.employeeId}|${v.date}`;
      const l = ix.visits.get(k);
      if (l) l.push(v); else ix.visits.set(k, [v]);
    }
    indexCache.set(ev, ix);
  }
  return ix;
}

/** A person worked on a date when there is a punch (even an incomplete one) or any visit. */
export function workedOn(ev: FieldEvidence, employeeId: Id, date: ISODate): boolean {
  const ix = indexOf(ev);
  const k = `${employeeId}|${date}`;
  return ix.punches.has(k) || ix.visits.has(k);
}
const isWorkingDate = (ev: FieldEvidence, d: ISODate): boolean => weekdayOf(d) !== 0 && !ev.holidays.includes(d);

/**
 * Length of the working day in minutes: first punch-in to last punch-out. When a punch is missing it is estimated from
 * the first and last verified visit with the same buffer the regularisation rule uses on each side. Undefined if neither works.
 */
export function daySpanMin(ev: FieldEvidence, employeeId: Id, date: ISODate): number | undefined {
  const ix = indexOf(ev);
  const k = `${employeeId}|${date}`;
  const p = ix.punches.get(k);
  if (p?.in && p.out) return toMin(p.out) - toMin(p.in);
  const ver = (ix.visits.get(k) ?? []).filter((v) => v.verified).sort((a, b) => a.start.localeCompare(b.start));
  if (!ver.length) return undefined;
  return toMin(ver[ver.length - 1]!.end) - toMin(ver[0]!.start) + 2 * REGULARISATION_POLICY.bufferMin;
}

/** Mondays of every week that overlaps [from, to]. */
export function weekStarts(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = addDays(from, -((weekdayOf(from) + 6) % 7)); d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}

/** The teams (one per city), with whether their numbers may be shown. */
export function teamsOf(ev: FieldEvidence): Team[] {
  const order: string[] = [];
  const by = new Map<string, Id[]>();
  for (const r of ev.reps) {
    if (!by.has(r.city)) { by.set(r.city, []); order.push(r.city); }
    by.get(r.city)!.push(r.employeeId);
  }
  return order.map((name) => ({ name, empIds: by.get(name)!, size: by.get(name)!.length, shown: by.get(name)!.length >= MIN_TEAM_SIZE }));
}

/** Team signals week by week. Team level only: the result has no per-person numbers. */
export function teamWeekly(ev: FieldEvidence, empIds: Id[]): WeekSignals[] {
  const ix = indexOf(ev);
  return weekStarts(ev.from, ev.to).map((weekStart) => {
    const weekEnd = addDays(weekStart, 6);
    const from = weekStart < ev.from ? ev.from : weekStart;
    const to = weekEnd > ev.to ? ev.to : weekEnd;
    const fullWeek = weekStart >= ev.from && weekEnd <= ev.to;
    let workedDays = 0, spanDays = 0, longDays = 0, spanSum = 0, eveningVisits = 0, workingDays = 0, noPunchDays = 0, peopleWithRest = 0;
    for (const id of empIds) {
      let hadRest = false;
      for (const date of datesBetween(from, to)) {
        const worked = workedOn(ev, id, date);
        if (worked) {
          workedDays++;
          const s = daySpanMin(ev, id, date);
          if (s != null) { spanDays++; spanSum += s; if (s > LONG_DAY_MIN) longDays++; }
          eveningVisits += (ix.visits.get(`${id}|${date}`) ?? []).filter((v) => v.start >= EVENING_FROM).length;
        } else hadRest = true;
        if (isWorkingDate(ev, date)) { workingDays++; if (!worked) noPunchDays++; }
      }
      if (fullWeek && hadRest) peopleWithRest++;
    }
    return {
      weekStart, from, to, fullWeek, people: empIds.length, workedDays, spanDays, longDays,
      longDayShare: spanDays ? longDays / spanDays : null,
      avgSpanH: spanDays ? spanSum / spanDays / 60 : null,
      eveningVisits, workingDays, noPunchDays, noPunchPerPerson: empIds.length ? noPunchDays / empIds.length : 0,
      peopleWithRest: fullWeek ? peopleWithRest : null,
      restCoverage: fullWeek && empIds.length ? peopleWithRest / empIds.length : null,
    };
  });
}

/** Headline numbers for the whole window, plus no-punch days per person for each calendar month. */
export function teamSummary(ev: FieldEvidence, empIds: Id[]): TeamSummary {
  const weeks = teamWeekly(ev, empIds);
  const spanDays = sum(weeks.map((w) => w.spanDays));
  const longDays = sum(weeks.map((w) => w.longDays));
  const spanTotalH = sum(weeks.map((w) => (w.avgSpanH ?? 0) * w.spanDays));
  const full = weeks.filter((w) => w.fullWeek);
  const months = Array.from(new Set(datesBetween(ev.from, ev.to).map((d) => d.slice(0, 7))));
  const noPunchByMonth = months.map((month) => {
    const dates = datesBetween(ev.from, ev.to).filter((d) => d.startsWith(month) && isWorkingDate(ev, d));
    const days = sum(empIds.map((id) => dates.filter((d) => !workedOn(ev, id, d)).length));
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
    return { month, days, perPerson: empIds.length ? days / empIds.length : 0, partial: ev.to < monthEnd };
  });
  return {
    people: empIds.length,
    workedDays: sum(weeks.map((w) => w.workedDays)), spanDays, longDays,
    longDayShare: spanDays ? longDays / spanDays : null,
    avgSpanH: spanDays ? spanTotalH / spanDays : null,
    eveningVisits: sum(weeks.map((w) => w.eveningVisits)),
    noPunchByMonth,
    fullWeeks: full.length,
    restCoverage: full.length && empIds.length ? sum(full.map((w) => w.peopleWithRest ?? 0)) / (full.length * empIds.length) : null,
  };
}

/** Runs of consecutive worked days longer than `MAX_DAYS_IN_A_ROW`. Names are fine here: this is about the law, not wellbeing. */
export function restStreaks(ev: FieldEvidence, employeeId: Id, minDays = MAX_DAYS_IN_A_ROW + 1): Streak[] {
  const out: Streak[] = [];
  let run: ISODate[] = [];
  const close = () => { if (run.length >= minDays) out.push({ employeeId, from: run[0]!, to: run[run.length - 1]!, days: run.length }); run = []; };
  for (const d of datesBetween(ev.from, ev.to)) { if (workedOn(ev, employeeId, d)) run.push(d); else close(); }
  close();
  return out;
}
export function allRestStreaks(ev: FieldEvidence): Streak[] {
  return ev.reps.flatMap((r) => restStreaks(ev, r.employeeId)).sort((a, b) => a.from.localeCompare(b.from) || a.employeeId.localeCompare(b.employeeId));
}

export const fmtRange = (from: ISODate, to: ISODate): string => `${fmtDate(from)} to ${fmtDate(to)}`;
