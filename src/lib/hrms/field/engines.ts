// Pure logic over the field evidence. No React, no storage. Every function takes the evidence as an argument so the
// tests (and later the backend) can feed it anything. Every result carries its reasons in plain sentences, because
// the whole point of these screens is that a person can read WHY the system said something.
//
// Principles baked in (the pages must keep them):
//  * Integrity flags are ADVISORY. A flag never changes pay or attendance on its own. A person reviews it, and the
//    employee can reply before anything is decided.
//  * Everything is shown with the evidence behind it, so an HR person can disagree with it.

import { addDays, diffDays } from '../format';
import type { Id, ISODate, Month } from '../types';
import { haversineKm, toMin, toHHMM, weekdayOf } from './evidence';
import type {
  DayEvidence, ExpenseClaim, FieldEvidence, FlagType, IncentiveLine, IncentiveResult, IntegrityFlag, RegularisationSuggestion,
  TravelDay, TravelResult, Visit,
} from './types';

export const REGULARISATION_POLICY = {
  minVerifiedVisits: 2,
  minSpanMin: 120,
  minTrailKm: 3,
  /** The suggested punch is set this long outside the first and last verified visit. */
  bufferMin: 15,
};
export const INTEGRITY_RULES = {
  maxSpeedKmh: 90,              // between two check-ins, straight line
  fuelToleranceFactor: 1.25,
  fuelToleranceRupees: 100,
  odometerOverTrailFactor: 1.3,
  odometerMinExtraKm: 3,
  visitOutsidePunchMin: 60,
  idleTrailKm: 3,
  gapExplainsMin: 60,           // a GPS gap of at least this long explains a short trail
};

const monthOf = (d: ISODate): Month => d.slice(0, 7);
const inMonth = (d: ISODate, m: Month): boolean => d.startsWith(m);
export function datesBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
export const repOf = (ev: FieldEvidence, employeeId: Id) => ev.reps.find((r) => r.employeeId === employeeId);

// ───────────────────────────── one day of evidence ─────────────────────────────
export function dayEvidence(ev: FieldEvidence, employeeId: Id, date: ISODate): DayEvidence {
  const punch = ev.punches.find((p) => p.employeeId === employeeId && p.date === date);
  const visits = ev.visits.filter((v) => v.employeeId === employeeId && v.date === date).sort((a, b) => a.start.localeCompare(b.start));
  const verifiedVisits = visits.filter((v) => v.verified);
  const trail = ev.trails.find((t) => t.employeeId === employeeId && t.date === date);
  const odo = ev.odometer.find((o) => o.employeeId === employeeId && o.date === date);
  const first = verifiedVisits[0], last = verifiedVisits[verifiedVisits.length - 1];
  return {
    employeeId, date, punch, visits, verifiedVisits,
    firstVisitStart: first?.start, lastVisitEnd: last?.end,
    spanMin: first && last ? toMin(last.end) - toMin(first.start) : 0,
    trailKm: trail?.km ?? 0, trailGapMin: trail?.longestGapMin ?? 0,
    odometerKm: odo ? odo.endKm - odo.startKm : undefined,
    claims: ev.claims.filter((c) => c.employeeId === employeeId && c.date === date),
    isWorkingDay: weekdayOf(date) !== 0 && !ev.holidays.includes(date),
  };
}

// ───────────────────────────── missed punch → proof-of-work regularisation ─────────────────────────────
/** What to do about a day where the punch is missing but the person clearly worked. Returns null when there is nothing to regularise. */
export function regularisationFor(ev: FieldEvidence, employeeId: Id, date: ISODate): RegularisationSuggestion | null {
  const d = dayEvidence(ev, employeeId, date);
  const hasEvidence = d.visits.length > 0 || d.trailKm > 0;
  if (!d.punch || !hasEvidence) return null;                 // absent (no record at all), nothing to regularise
  if (d.punch.in && d.punch.out) return null;
  const P = REGULARISATION_POLICY;
  const evidence = { verifiedVisits: d.verifiedVisits.length, spanMin: d.spanMin, trailKm: d.trailKm };
  const reasons: string[] = [];
  const missing = !d.punch.in && !d.punch.out ? 'both punches' : !d.punch.out ? 'the punch-out' : 'the punch-in';
  reasons.push(`${missing[0]!.toUpperCase()}${missing.slice(1)} ${missing === 'both punches' ? 'are' : 'is'} missing.`);
  reasons.push(`${d.verifiedVisits.length} verified visit${d.verifiedVisits.length === 1 ? '' : 's'} (geo-fenced, with photo)${d.spanMin ? `, spread over ${Math.floor(d.spanMin / 60)}h ${d.spanMin % 60}m` : ''}.`);
  if (d.trailKm) reasons.push(`GPS trail shows ${d.trailKm.toFixed(1)} km of movement.`);
  let verdict: RegularisationSuggestion['verdict'];
  if (d.verifiedVisits.length === 0) { verdict = 'no_evidence'; reasons.push('No verified visit that day, so the visits alone do not prove the person worked.'); }
  else if (d.verifiedVisits.length >= P.minVerifiedVisits && d.spanMin >= P.minSpanMin && d.trailKm >= P.minTrailKm) {
    verdict = 'auto_approve'; reasons.push(`Meets the rule: at least ${P.minVerifiedVisits} verified visits over at least ${P.minSpanMin / 60} hours, with movement on the trail.`);
  } else { verdict = 'needs_review'; reasons.push(`Below the auto-approve rule (${P.minVerifiedVisits}+ verified visits over ${P.minSpanMin / 60}+ hours), so a manager should look.`); }
  return {
    employeeId, date, verdict, reasons, evidence,
    suggestedIn: !d.punch.in && d.firstVisitStart ? toHHMM(Math.max(0, toMin(d.firstVisitStart) - P.bufferMin)) : undefined,
    suggestedOut: !d.punch.out && d.lastVisitEnd ? toHHMM(Math.min(23 * 60 + 59, toMin(d.lastVisitEnd) + P.bufferMin)) : undefined,
  };
}
export function regularisationCandidates(ev: FieldEvidence): RegularisationSuggestion[] {
  const out: RegularisationSuggestion[] = [];
  for (const r of ev.reps) for (const date of datesBetween(ev.from, ev.to)) {
    const s = regularisationFor(ev, r.employeeId, date);
    if (s) out.push(s);
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ───────────────────────────── integrity flags ─────────────────────────────
const sevRank = { high: 0, warning: 1, info: 2 } as const;

export function integrityFlags(ev: FieldEvidence): IntegrityFlag[] {
  const R = INTEGRITY_RULES;
  const flags: IntegrityFlag[] = [];
  const push = (f: Omit<IntegrityFlag, 'id'> & { id?: string }) => flags.push({ ...f, id: f.id ?? `${f.type}:${f.employeeId}:${f.date}` });
  const dates = datesBetween(ev.from, ev.to);
  const fmtDur = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

  for (const rep of ev.reps) {
    const id = rep.employeeId;
    for (const date of dates) {
      const d = dayEvidence(ev, id, date);
      if (!d.punch && d.visits.length === 0) continue;

      // 1. Impossible travel between two verified check-ins.
      for (let i = 1; i < d.verifiedVisits.length; i++) {
        const a = d.verifiedVisits[i - 1]!, b = d.verifiedVisits[i]!;
        const km = haversineKm(a.pos, b.pos);
        const mins = Math.max(1, toMin(b.start) - toMin(a.end));
        const kmh = (km / mins) * 60;
        if (kmh > R.maxSpeedKmh) {
          push({
            type: 'impossible_travel', severity: 'high', employeeId: id, involves: [id], date,
            title: `Check-in ${km.toFixed(0)} km from the previous one, ${mins} minutes later`,
            evidence: [
              `Left ${outletName(ev, a)} at ${a.end}, checked in at ${outletName(ev, b)} at ${b.start}.`,
              `That is ${km.toFixed(1)} km in a straight line in ${mins} minutes, about ${kmh.toFixed(0)} km/h. The limit used here is ${R.maxSpeedKmh} km/h.`,
              `GPS trail shows ${d.trailKm.toFixed(1)} km for the whole day, which does not include a trip that far.`,
            ],
            suggestion: 'Ask the person. Common causes: a check-in made for the wrong outlet, a spoofed location, or a proxy check-in by someone else.',
          });
          break; // one flag per day is enough
        }
      }

      // 2. Punched in but no proof of work, or proof of work well outside the punch.
      if (d.punch?.in && d.punch.out && d.isWorkingDay) {
        if (d.verifiedVisits.length === 0 && d.trailKm < R.idleTrailKm) {
          push({
            type: 'punch_visit_mismatch', severity: 'warning', employeeId: id, involves: [id], date,
            title: 'Punched in, but no visits and almost no movement',
            evidence: [`Punched in ${d.punch.in}, out ${d.punch.out}.`, `0 verified visits and ${d.trailKm.toFixed(1)} km on the GPS trail for the day.`],
            suggestion: 'May be an office, training or leave day. Confirm with the manager before treating it as a problem.',
          });
        } else if (d.firstVisitStart && toMin(d.punch.in) - toMin(d.firstVisitStart) > R.visitOutsidePunchMin) {
          push({
            type: 'punch_visit_mismatch', severity: 'info', employeeId: id, involves: [id], date,
            title: 'Worked before punching in',
            evidence: [`First verified visit started at ${d.firstVisitStart}, the punch-in is ${d.punch.in}.`, `${fmtDur(toMin(d.punch.in) - toMin(d.firstVisitStart))} of work happened before the punch.`],
            suggestion: 'Likely a late punch. Regularise the start time so the hours are not under-counted.',
          });
        }
      }

      // 3. Fuel claim far above what the route could burn.
      const fuel = d.claims.filter((c) => c.category === 'fuel');
      if (fuel.length && rep.vehicle !== 'public') {
        const expected = d.trailKm * ev.travel.fuelRatePerKm[rep.vehicle];
        const claimed = fuel.reduce((s, c) => s + c.amount, 0);
        if (claimed > expected * R.fuelToleranceFactor + R.fuelToleranceRupees) {
          push({
            type: 'fuel_route_mismatch', severity: claimed > expected * 4 + 200 ? 'high' : 'warning', employeeId: id, involves: [id], date,
            title: `Fuel claim ₹${claimed.toLocaleString('en-IN')} against about ₹${Math.round(expected).toLocaleString('en-IN')} of route`,
            evidence: [
              `GPS trail for the day: ${d.trailKm.toFixed(1)} km on a ${rep.vehicle}. At the sample fuel rate of ₹${ev.travel.fuelRatePerKm[rep.vehicle]}/km that is about ₹${Math.round(expected)}.`,
              `Claimed ₹${claimed.toLocaleString('en-IN')} (${fuel.map((c) => c.vendor ?? 'fuel').join(', ')}).`,
              d.trailGapMin >= R.gapExplainsMin ? `The trail has a ${fmtDur(d.trailGapMin)} gap, so some distance may be missing.` : 'The trail has no meaningful gap that would explain the difference.',
            ],
            suggestion: 'Ask for the pump receipt and the route. A tank fill-up for the week is a legitimate reason, so check before rejecting.',
          });
        }
      }

      // 4. Odometer far above the trail with no GPS gap to explain it.
      if (d.odometerKm != null && d.trailKm > 0 && d.trailGapMin < R.gapExplainsMin &&
        d.odometerKm > d.trailKm * R.odometerOverTrailFactor + R.odometerMinExtraKm) {
        push({
          type: 'odometer_mismatch', severity: 'warning', employeeId: id, involves: [id], date,
          title: `Odometer ${d.odometerKm} km against ${d.trailKm.toFixed(0)} km on the GPS trail`,
          evidence: [
            `Odometer photos give ${d.odometerKm} km for the day; the GPS trail gives ${d.trailKm.toFixed(1)} km.`,
            `The phone had GPS all day (longest gap ${d.trailGapMin} minutes), so lost signal does not explain it.`,
          ],
          suggestion: 'Pay on the GPS distance. Ask whether the vehicle was used for personal trips or someone else rode it.',
        });
      }
    }
  }

  // 5. The same receipt twice.
  const byHash = new Map<string, ExpenseClaim[]>();
  for (const c of ev.claims) if (c.receiptHash) byHash.set(c.receiptHash, [...(byHash.get(c.receiptHash) ?? []), c]);
  for (const [hash, list] of byHash) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId));
    const first = list[0]!;
    const people = [...new Set(list.map((c) => c.employeeId))];
    push({
      type: 'receipt_reuse', severity: people.length > 1 ? 'high' : 'warning', employeeId: list[1]!.employeeId, involves: people, date: list[1]!.date,
      id: `receipt_reuse:${hash}`,
      title: people.length > 1 ? 'The same receipt was claimed by two people' : 'The same receipt was claimed on two days',
      evidence: [
        `Receipt fingerprint ${hash} appears ${list.length} times: ${list.map((c) => `${c.employeeId} on ${c.date} (₹${c.amount.toLocaleString('en-IN')}, ${c.category})`).join('; ')}.`,
        people.length > 1 ? 'Two colleagues eating together can both photograph one bill. It still has to be claimed once.' : 'A receipt photographed twice is usually a mistake, sometimes not.',
      ],
      suggestion: `Pay the first claim (${first.employeeId}, ${first.date}) and ask the other to withdraw theirs. Do not treat it as fraud without hearing them.`,
    });
  }

  // 6. A phone punching for more than one person on the same day.
  const deviceOwner = new Map(ev.reps.map((r) => [r.deviceId, r.employeeId]));
  for (const p of ev.punches) {
    const owner = deviceOwner.get(p.deviceId);
    if (owner && owner !== p.employeeId && p.in) {
      push({
        type: 'device_shared', severity: 'high', employeeId: p.employeeId, involves: [p.employeeId, owner], date: p.date,
        title: `Punch made from ${owner}'s phone`,
        evidence: [`${p.employeeId} punched in at ${p.in} from device ${p.deviceId}, which is registered to ${owner}.`, `${owner} also punched in from the same device on ${p.date}.`],
        suggestion: 'Possible buddy punching, or a shared or swapped phone. Check both people, and re-register devices if a swap is legitimate.',
      });
    }
  }

  return flags.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.date.localeCompare(a.date));
}
const outletName = (ev: FieldEvidence, v: Visit): string => ev.outlets.find((o) => o.id === v.outletId)?.name ?? v.outletId;
export const FLAG_LABEL: Record<FlagType, string> = {
  impossible_travel: 'Impossible travel', punch_visit_mismatch: 'Punch and visits disagree', fuel_route_mismatch: 'Fuel vs route',
  receipt_reuse: 'Receipt reused', odometer_mismatch: 'Odometer vs GPS', device_shared: 'Shared device',
};

// ───────────────────────────── incentives ─────────────────────────────
/** Incentive for one person and month, with a plain-language explanation. Deal status is judged as of the month end. */
export function computeIncentives(ev: FieldEvidence, employeeId: Id, month: Month): IncentiveResult {
  const plan = ev.plan;
  const target = ev.targets.find((t) => t.employeeId === employeeId && t.month === month)?.revenue ?? 0;
  const monthEnd = lastDayOf(month);
  // Deals closed in the month that were still standing at month end.
  const deals = ev.deals
    .filter((d) => d.employeeId === employeeId && inMonth(d.closedOn, month) && !(d.status !== 'won' && d.cancelledOn && d.cancelledOn <= monthEnd))
    .sort((a, b) => a.closedOn.localeCompare(b.closedOn) || a.id.localeCompare(b.id));
  const achieved = deals.reduce((s, d) => s + d.value, 0);
  const attainmentPct = target ? (achieved / target) * 100 : 0;

  // Marginal bands on the month's total booked revenue. Each deal then earns the month's average rate, so the order
  // deals were closed in does not decide who gets the better rate (and a clawback is a fair share of what was paid).
  const bandRows = plan.bands.map((b) => {
    const lo = (b.from / 100) * target;
    const hi = b.to == null ? Infinity : (b.to / 100) * target;
    const revenueInBand = target ? Math.max(0, Math.min(achieved, hi) - lo) : 0;
    return { ...b, revenueInBand, amount: revenueInBand * b.rate };
  });
  const accrued = bandRows.reduce((s, r) => s + r.amount, 0);
  const effectiveRate = achieved ? accrued / achieved : 0;
  const lines: IncentiveLine[] = deals.map((d) => {
    const collected = d.collectedPct >= plan.minCollectionPct;
    return {
      dealId: d.id, customer: d.customer, value: d.value, counted: d.value, rate: effectiveRate, amount: Math.round(d.value * effectiveRate),
      status: collected ? 'paid_now' : 'held_collection',
      why: `₹${d.value.toLocaleString('en-IN')} at the month's average rate of ${(effectiveRate * 100).toFixed(2)}%${collected ? '' : `. Held: only ${d.collectedPct}% collected, the plan pays at ${plan.minCollectionPct}%.`}`,
    };
  });
  const gross = lines.filter((l) => l.status === 'paid_now').reduce((s, l) => s + l.amount, 0);
  const heldTotal = lines.filter((l) => l.status === 'held_collection').reduce((s, l) => s + l.amount, 0);

  // Clawbacks: deals cancelled this month that were closed (and paid) in an earlier month.
  const rep = repOf(ev, employeeId);
  const clawbacks = ev.deals
    .filter((d) => d.employeeId === employeeId && d.status !== 'won' && d.cancelledOn && inMonth(d.cancelledOn, month) && !inMonth(d.closedOn, month))
    .map((d) => {
      const closeMonth = monthOf(d.closedOn);
      const paidThen = computeIncentives(ev, employeeId, closeMonth).lines.find((l) => l.dealId === d.id);
      const days = diffDays(d.closedOn, d.cancelledOn!);
      const inWindow = days <= plan.clawbackWindowDays;
      const paid = paidThen?.status === 'paid_now' ? paidThen.amount : 0;
      let allowed = true; let why = '';
      if (!paid) { allowed = false; why = 'Nothing was paid on this deal, so there is nothing to take back.'; }
      else if (!inWindow) { allowed = false; why = `Cancelled ${days} days after closing; the plan's clawback window is ${plan.clawbackWindowDays} days.`; }
      else if (!rep?.planAcknowledged) { allowed = false; why = 'No signed acknowledgement of the incentive plan is on file, so there is no contractual basis to recover it.'; }
      else why = `Cancelled ${days} days after closing, inside the ${plan.clawbackWindowDays}-day window, and the plan is acknowledged.`;
      return { dealId: d.id, customer: d.customer, amount: paid, allowed, why };
    });
  const clawbackTotal = clawbacks.filter((c) => c.allowed).reduce((s, c) => s + c.amount, 0);
  const net = gross - clawbackTotal;

  const explanation: string[] = [];
  explanation.push(`Target ₹${Math.round(target).toLocaleString('en-IN')}, booked ₹${Math.round(achieved).toLocaleString('en-IN')}: ${attainmentPct.toFixed(0)}% attainment.`);
  for (const b of bandRows) if (b.revenueInBand > 0) explanation.push(`₹${Math.round(b.revenueInBand).toLocaleString('en-IN')} fell in the ${b.from}%–${b.to ?? '∞'}% band at ${(b.rate * 100).toFixed(1)}% = ₹${Math.round(b.amount).toLocaleString('en-IN')}.`);
  if (heldTotal) explanation.push(`₹${heldTotal.toLocaleString('en-IN')} is held until those invoices are ${plan.minCollectionPct}% collected.`);
  for (const c of clawbacks) explanation.push(c.allowed ? `Clawback of ₹${c.amount.toLocaleString('en-IN')} for ${c.customer}. ${c.why}` : `No clawback for ${c.customer}. ${c.why}`);
  return { employeeId, month, target, achieved, attainmentPct, lines, bandRows, gross, clawbacks, clawbackTotal, net, heldTotal, explanation };
}
function lastDayOf(month: Month): ISODate {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

// ───────────────────────────── travel allowance ─────────────────────────────
export function computeTravelAllowance(ev: FieldEvidence, employeeId: Id, month: Month): TravelResult {
  const rep = repOf(ev, employeeId);
  const vehicle = rep?.vehicle ?? 'public';
  const rate = vehicle === 'public' ? 0 : ev.travel.ratePerKm[vehicle];
  const thr = ev.travel.disputeThresholdPct / 100;
  const days: TravelDay[] = [];
  for (const t of ev.trails.filter((x) => x.employeeId === employeeId && inMonth(x.date, month))) {
    const o = ev.odometer.find((x) => x.employeeId === employeeId && x.date === t.date);
    const odo = o ? o.endKm - o.startKm : undefined;
    let proposedKm: number | undefined; let note: string | undefined; let dispute = false;
    if (odo != null && odo > t.km * (1 + thr) && t.longestGapMin >= INTEGRITY_RULES.gapExplainsMin) {
      proposedKm = odo; dispute = true;
      note = `GPS had a ${Math.floor(t.longestGapMin / 60)}h ${t.longestGapMin % 60}m gap. The odometer says ${odo} km against ${t.km.toFixed(1)} km on the trail, so the person is probably under-paid.`;
    } else if (odo != null && odo > t.km * (1 + thr)) {
      note = `Odometer (${odo} km) is well above the trail (${t.km.toFixed(1)} km) with no GPS gap. Paid on GPS; see the integrity flag.`;
    }
    days.push({ date: t.date, trailKm: t.km, odometerKm: odo, gapMin: t.longestGapMin, payableKm: t.km, proposedKm, amount: Math.round(t.km * rate), disputeCandidate: dispute, note });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return {
    employeeId, month, vehicle, days,
    payableKm: Math.round(days.reduce((s, d) => s + d.payableKm, 0) * 10) / 10,
    amount: days.reduce((s, d) => s + d.amount, 0),
    disputeCandidates: days.filter((d) => d.disputeCandidate).length,
  };
}

// ───────────────────────────── coverage ─────────────────────────────
/** Share of a person's planned beat outlets that got a verified visit in the month, and which ones were never visited. */
export function beatCoverage(ev: FieldEvidence, employeeId: Id, month: Month) {
  const planned = ev.outlets.filter((o) => o.repId === employeeId && o.id !== 'out_far_blr');
  const visited = new Set(ev.visits.filter((v) => v.employeeId === employeeId && v.verified && inMonth(v.date, month)).map((v) => v.outletId));
  const missed = planned.filter((o) => !visited.has(o.id));
  return { planned: planned.length, visited: planned.length - missed.length, pct: planned.length ? Math.round(((planned.length - missed.length) / planned.length) * 100) : 0, missed };
}

/** Pairs of outlets belonging to two different people that are closer than `metres`: the territory overlap. */
export function territoryOverlaps(ev: FieldEvidence, metres = 500) {
  const out: { a: string; b: string; repA: Id; repB: Id; metres: number }[] = [];
  for (let i = 0; i < ev.outlets.length; i++) for (let j = i + 1; j < ev.outlets.length; j++) {
    const a = ev.outlets[i]!, b = ev.outlets[j]!;
    if (a.repId === b.repId) continue;
    const m = haversineKm(a.pos, b.pos) * 1000;
    if (m <= metres) out.push({ a: a.id, b: b.id, repA: a.repId, repB: b.repId, metres: Math.round(m) });
  }
  return out.sort((x, y) => x.metres - y.metres);
}
