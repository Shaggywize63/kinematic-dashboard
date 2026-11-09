import { test, expect } from '@playwright/test';
import { getFieldEvidence, haversineKm, toHHMM, toMin } from '../src/lib/hrms/field/evidence';
import {
  beatCoverage, computeIncentives, computeTravelAllowance, dayEvidence, integrityFlags, regularisationCandidates, regularisationFor, territoryOverlaps,
} from '../src/lib/hrms/field/engines';

/** Pure logic behind the field-force screens (visit-proof attendance, integrity flags, incentives, travel). No browser. */

const ev = getFieldEvidence();
const flags = integrityFlags(ev);
const flag = (id: string) => flags.find((f) => f.id === id);

test.describe('field evidence', () => {
  test('is deterministic and shared', () => {
    expect(getFieldEvidence()).toBe(ev);
    expect(ev.reps).toHaveLength(8);
    expect(ev.from).toBe('2026-10-01');
    expect(ev.to).toBe('2026-11-06');
    expect(ev.visits.length).toBeGreaterThan(1200);
  });
  test('a verified visit is geo-fenced, has a photo and lasted at least five minutes', () => {
    for (const v of ev.visits) {
      const ok = v.distanceFromOutletM <= 150 && v.photo && toMin(v.end) - toMin(v.start) >= 5;
      expect(v.verified, v.id).toBe(ok);
    }
    const share = ev.visits.filter((v) => v.verified).length / ev.visits.length;
    expect(share).toBeGreaterThan(0.85);
    expect(share).toBeLessThan(0.97);
  });
  test('nobody works on Sundays except the two planted days, and nobody works on the holiday', () => {
    const sundays = ev.punches.filter((p) => new Date(`${p.date}T00:00:00Z`).getUTCDay() === 0);
    expect(sundays.map((p) => `${p.employeeId}|${p.date}`).sort()).toEqual(['emp_6|2026-10-11', 'emp_6|2026-10-18']);
    expect(ev.punches.some((p) => p.date === '2026-10-02')).toBe(false);
  });
  test('trail km is the great-circle sum times the road factor, and the time helpers round-trip', () => {
    expect(toHHMM(toMin('09:05'))).toBe('09:05');
    const t = ev.trails[10]!;
    let km = 0;
    for (let i = 1; i < t.points.length; i++) km += haversineKm(t.points[i - 1]!.pos, t.points[i]!.pos);
    expect(t.km).toBeCloseTo(km * 1.15, 0);
  });
});

test.describe('missed punch → proof-of-work regularisation', () => {
  test('a missing punch-out with eight verified visits is auto-approved, with a suggested time', () => {
    const r = regularisationFor(ev, 'emp_6', '2026-10-14')!;
    expect(r.verdict).toBe('auto_approve');
    const d = dayEvidence(ev, 'emp_6', '2026-10-14');
    expect(r.suggestedIn).toBeUndefined();
    expect(r.suggestedOut).toBe(toHHMM(toMin(d.lastVisitEnd!) + 15));
    expect(r.reasons.join(' ')).toMatch(/punch-out is missing/i);
  });
  test('both punches missing but plenty of visits: auto-approve, both times suggested', () => {
    const r = regularisationFor(ev, 'emp_9', '2026-10-08')!;
    expect(r.verdict).toBe('auto_approve');
    expect(r.suggestedIn).toBeDefined();
    expect(r.suggestedOut).toBeDefined();
  });
  test('one verified visit is not enough: it goes to a manager', () => {
    expect(regularisationFor(ev, 'emp_7', '2026-10-20')!.verdict).toBe('needs_review');
  });
  test('movement but no verified visit is "no evidence"', () => {
    const r = regularisationFor(ev, 'emp_22', '2026-11-05')!;
    expect(r.verdict).toBe('no_evidence');
    expect(r.evidence.trailKm).toBeGreaterThan(5);
  });
  test('complete punches and plain absences need nothing', () => {
    expect(regularisationFor(ev, 'emp_6', '2026-10-15')).toBeNull();
    const absent = ev.reps.flatMap((r) => ev.punches.filter((p) => p.employeeId === r.employeeId)).length;
    expect(absent).toBeGreaterThan(150);
    expect(regularisationFor(ev, 'emp_6', '2026-10-04')).toBeNull(); // a Sunday: no record at all
  });
  test('the candidate list contains every planted case and is newest first', () => {
    const c = regularisationCandidates(ev);
    const ids = c.map((x) => `${x.employeeId}|${x.date}`);
    for (const k of ['emp_6|2026-10-14', 'emp_9|2026-10-08', 'emp_7|2026-10-20', 'emp_22|2026-11-05']) expect(ids).toContain(k);
    const dates = c.map((x) => x.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

test.describe('integrity flags', () => {
  test('exactly the planted problems are found, nothing else', () => {
    expect(flags.map((f) => f.id).sort()).toEqual([
      'device_shared:emp_19:2026-10-06', 'device_shared:emp_19:2026-10-13', 'device_shared:emp_19:2026-10-20',
      'fuel_route_mismatch:emp_19:2026-10-27',
      'impossible_travel:emp_8:2026-10-09',
      'odometer_mismatch:emp_9:2026-10-22',
      'punch_visit_mismatch:emp_22:2026-11-03', 'punch_visit_mismatch:emp_4:2026-10-29',
      'receipt_reuse:rh_9f31a7c2', 'receipt_reuse:rh_c2d4e801',
    ]);
  });
  test('impossible travel: 41 km in 8 minutes', () => {
    const f = flag('impossible_travel:emp_8:2026-10-09')!;
    expect(f.severity).toBe('high');
    expect(f.evidence.join(' ')).toMatch(/41\.\d km/);
  });
  test('a duplicate receipt between two colleagues names both of them', () => {
    const f = flag('receipt_reuse:rh_9f31a7c2')!;
    expect(f.involves.sort()).toEqual(['emp_19', 'emp_20']);
    expect(f.severity).toBe('high');
    expect(flag('receipt_reuse:rh_c2d4e801')!.involves).toEqual(['emp_7']);
  });
  test('a shared device involves the phone owner', () => {
    const f = flag('device_shared:emp_19:2026-10-06')!;
    expect(f.involves).toEqual(['emp_19', 'emp_20']);
  });
  test('late punch is only an info flag, idle punch is a warning', () => {
    expect(flag('punch_visit_mismatch:emp_4:2026-10-29')!.severity).toBe('info');
    expect(flag('punch_visit_mismatch:emp_22:2026-11-03')!.severity).toBe('warning');
  });
  test('every flag carries evidence and a suggestion that asks a person, and is sorted high first', () => {
    for (const f of flags) {
      expect(f.evidence.length, f.id).toBeGreaterThan(0);
      expect(f.suggestion.length, f.id).toBeGreaterThan(20);
    }
    const rank = { high: 0, warning: 1, info: 2 };
    for (let i = 1; i < flags.length; i++) expect(rank[flags[i - 1]!.severity]).toBeLessThanOrEqual(rank[flags[i]!.severity]);
  });
  test('odometer far above the trail is flagged only when the GPS had no gap', () => {
    expect(flag('odometer_mismatch:emp_9:2026-10-22')).toBeDefined();
    expect(flag('odometer_mismatch:emp_8:2026-10-16')).toBeUndefined(); // the GPS gap explains it: a dispute, not a flag
  });
});

test.describe('incentives', () => {
  test('Gaurav in October: 131% attainment, bands add up, some pay held for collection', () => {
    const r = computeIncentives(ev, 'emp_19', '2026-10');
    expect(Math.round(r.attainmentPct)).toBe(131);
    expect(r.bandRows.reduce((s, b) => s + b.revenueInBand, 0)).toBeCloseTo(r.achieved, 0);
    expect(r.bandRows[0]!.revenueInBand).toBeCloseTo(0.7 * r.target, 0);
    expect(r.bandRows[3]!.revenueInBand).toBeGreaterThan(0);
    expect(r.heldTotal).toBeGreaterThan(0);
    const sum = r.lines.reduce((s, l) => s + l.amount, 0);
    const accrued = r.bandRows.reduce((s, b) => s + b.amount, 0);
    expect(Math.abs(sum - accrued)).toBeLessThanOrEqual(r.lines.length);
    expect(r.gross + r.heldTotal).toBe(sum);
    expect(r.explanation.join(' ')).toMatch(/131% attainment/);
  });
  test('below 70% pays nothing', () => {
    const r = computeIncentives(ev, 'emp_20', '2026-10');
    expect(r.attainmentPct).toBeLessThan(70);
    expect(r.gross + r.heldTotal).toBe(0);
  });
  test('a clawback is taken only with a signed plan and inside the window', () => {
    const g = computeIncentives(ev, 'emp_19', '2026-10');
    const cg = g.clawbacks.find((c) => c.dealId === 'deal_clw_gaurav')!;
    expect(cg.allowed).toBe(true);
    expect(cg.amount).toBeGreaterThan(0);
    expect(g.net).toBe(g.gross - cg.amount);

    const f = computeIncentives(ev, 'emp_20', '2026-10').clawbacks.find((c) => c.dealId === 'deal_clw_farhan')!;
    expect(f.allowed).toBe(false);
    expect(f.why).toMatch(/acknowledgement/i);

    const s = computeIncentives(ev, 'emp_9', '2026-11');
    const cs = s.clawbacks.find((c) => c.dealId === 'deal_clw_sana')!;
    expect(cs.allowed).toBe(false);
    expect(cs.why).toMatch(/60 days/);
    expect(s.clawbackTotal).toBe(0);
  });
  test('a deal cancelled in the month it closed is simply not counted', () => {
    const r = computeIncentives(ev, 'emp_8', '2026-10');
    expect(r.lines.some((l) => l.dealId === 'deal_clw_karthik')).toBe(false);
    expect(r.clawbacks).toHaveLength(0);
  });
  test('a deal cancelled after the month end still counted in its own month', () => {
    const r = computeIncentives(ev, 'emp_19', '2026-09');
    expect(r.lines.some((l) => l.dealId === 'deal_clw_gaurav')).toBe(true);
  });
});

test.describe('travel allowance', () => {
  test('pays on the GPS trail at the policy rate', () => {
    const t = computeTravelAllowance(ev, 'emp_6', '2026-10');
    expect(t.vehicle).toBe('bike');
    expect(t.days.length).toBeGreaterThan(20);
    expect(t.payableKm).toBeCloseTo(t.days.reduce((s, d) => s + d.trailKm, 0), 0);
    expect(t.amount).toBeGreaterThan(0);
    expect(Math.abs(t.amount - t.payableKm * 3.5)).toBeLessThan(t.days.length);
  });
  test('a GPS gap that hides a long ride becomes a dispute candidate with the odometer figure proposed', () => {
    const d = computeTravelAllowance(ev, 'emp_8', '2026-10').days.find((x) => x.date === '2026-10-16')!;
    expect(d.disputeCandidate).toBe(true);
    expect(d.gapMin).toBeGreaterThanOrEqual(180);
    expect(d.proposedKm).toBeGreaterThan(d.payableKm * 2);
    expect(d.note).toMatch(/gap/);
  });
  test('only that one day is a dispute candidate across the team', () => {
    const n = ev.reps.reduce((s, r) => s + computeTravelAllowance(ev, r.employeeId, '2026-10').disputeCandidates, 0);
    expect(n).toBe(1);
  });
  test('an odometer far above a gap-free trail is paid on GPS and explained, not offered as a dispute', () => {
    const d = computeTravelAllowance(ev, 'emp_9', '2026-10').days.find((x) => x.date === '2026-10-22')!;
    expect(d.disputeCandidate).toBe(false);
    expect(d.proposedKm).toBeUndefined();
    expect(d.note).toMatch(/no GPS gap/);
  });
});

test.describe('territory and beats', () => {
  test('beat coverage counts distinct verified outlets', () => {
    const c = beatCoverage(ev, 'emp_6', '2026-10');
    expect(c.planned).toBe(48);
    expect(c.visited + c.missed.length).toBe(c.planned);
    expect(c.pct).toBeGreaterThan(70);
  });
  test('Farhan and Gaurav share a Wednesday area', () => {
    const o = territoryOverlaps(ev, 500);
    expect(o.some((x) => [x.repA, x.repB].sort().join() === 'emp_19,emp_20')).toBe(true);
  });
});
