import { test, expect, type Page } from '@playwright/test';
import { openHrms } from './hrms-utils';
import { getFieldEvidence, toMin } from '../src/lib/hrms/field/evidence';
import { beatCoverage, computeIncentives, computeTravelAllowance, territoryOverlaps } from '../src/lib/hrms/field/engines';
import { decideDispute, fieldStore, holdIncentive, pushFieldPayToPayroll } from '../src/lib/hrms/field/store';
import { getDb, resetDb } from '../src/lib/hrms/db';
import { fmtDate, fullName, inr } from '../src/lib/hrms/format';
import { PREVIEW_TODAY } from '../src/lib/hrms/seed';
import * as E from '../src/lib/hrms/fieldpay/engines';
import { cancelRestNote, fieldPayStore, reassignOutlet, scheduleRestDay, undoReassignment } from '../src/lib/hrms/fieldpay/store';

/**
 * Field pay: Incentives, Travel & GPS, Territory & beats, Team health.
 * Two kinds of test: pure checks of the engines in src/lib/hrms/fieldpay (no browser), and browser flows on the seeded
 * sample data. Screens are compared with the engines run on the same evidence, so a page can never drift from the maths.
 */

const ev = getFieldEvidence();
const DB_KEY = 'kinematic_hrms_preview_v3';
const FIELD_KEY = 'kinematic_hrms_area_field_v1';
const PAY_KEY = 'kinematic_hrms_area_fieldpay_v1';
const slow = { timeout: 60_000 };
const num1 = (n: number): string => (Math.round(n * 10) / 10).toLocaleString('en-IN', { maximumFractionDigits: 1, minimumFractionDigits: 0 });

test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });
test.describe.configure({ timeout: 150_000 });

/** Uncaught page errors and console errors (React render errors, hydration mismatches) fail a test. */
function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
const readStore = <T,>(page: Page, key: string): Promise<T> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);
const readAdjustments = async (page: Page, month: string) => {
  const db = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), DB_KEY) as { adjustments: { employeeId: string; month: string; kind: string; amount: number; note?: string }[] };
  return db.adjustments.filter((a) => (a.note ?? '').startsWith(`[field ${month}]`));
};
const names: Record<string, string> = Object.fromEntries(getDb().employees.map((e) => [e.id, fullName(e)]));
const repIds = ev.reps.map((r) => r.employeeId);
/** Names of the people in the incentive table, in the order shown (read from the buttons' labels). */
const peopleOrder = (page: Page): Promise<string[]> =>
  page.getByRole('button', { name: /^Open the workings for/ }).evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? '').replace('Open the workings for ', '')));
const NO_RANKING = /leaderboard|top performer|best performer|worst performer|rank #/i;

// ═════════════════════════════ pure logic: no browser ═════════════════════════════
test.describe('incentive what-if and statement', () => {
  test('the what-if uses the same band maths as the real calculation, for every person and month', () => {
    for (const id of repIds) for (const m of ['2026-09', '2026-10', '2026-11']) {
      const real = computeIncentives(ev, id, m);
      const w = E.payoutForBooked(ev.plan, real.target, real.achieved, E.collectedShareOf(real));
      expect(w.bandRows.map((b) => Math.round(b.revenueInBand)), `${id} ${m}`).toEqual(real.bandRows.map((b) => Math.round(b.revenueInBand)));
      expect(w.accrued).toBeCloseTo(real.bandRows.reduce((s, b) => s + b.amount, 0), 6);
      // payable now is the share of the accrued payout that sits on collected deals, within rounding per deal
      expect(Math.abs(w.payableNow - real.gross)).toBeLessThanOrEqual(real.lines.length);
      expect(Math.abs(w.held - real.heldTotal)).toBeLessThanOrEqual(real.lines.length);
    }
  });

  test('below the first paying line it pays nothing, and more booked never pays less', () => {
    const target = 1_000_000;
    expect(E.payoutForBooked(ev.plan, target, 690_000).accrued).toBe(0);
    expect(E.payoutForBooked(ev.plan, target, 700_000).accrued).toBe(0);
    expect(E.payoutForBooked(ev.plan, target, 1_000_000).accrued).toBeCloseTo(300_000 * 0.01, 6);
    expect(E.payoutForBooked(ev.plan, target, 1_200_000).accrued).toBeCloseTo(3000 + 200_000 * 0.015, 6);
    expect(E.payoutForBooked(ev.plan, target, 1_500_000).accrued).toBeCloseTo(3000 + 3000 + 300_000 * 0.025, 6);
    let prev = -1;
    for (let b = 0; b <= 2_000_000; b += 50_000) { const p = E.payoutForBooked(ev.plan, target, b).accrued; expect(p).toBeGreaterThanOrEqual(prev); prev = p; }
    expect(E.payoutForBooked(ev.plan, 0, 500_000).accrued).toBe(0);
  });

  test('the what-if names the next line and how much more reaches it; none above the top band', () => {
    const w = E.payoutForBooked(ev.plan, 1_000_000, 600_000);
    expect(w.nextEdge).toEqual({ pct: 70, rate: 0.01, moreBooked: 100_000 });
    expect(E.payoutForBooked(ev.plan, 1_000_000, 750_000).nextEdge?.pct).toBe(100);
    expect(E.payoutForBooked(ev.plan, 1_000_000, 1_300_000).nextEdge).toBeUndefined();
    // collected share splits the same payout into payable and held
    const half = E.payoutForBooked(ev.plan, 1_000_000, 1_200_000, 0.5);
    expect(half.payableNow + half.held).toBeCloseTo(half.accrued, 6);
    expect(half.payableNow).toBeCloseTo(half.accrued / 2, 6);
  });

  test('the rep statement is in the first person and carries the real numbers, the clawback reason and the hold', () => {
    const g = computeIncentives(ev, 'emp_19', '2026-10');
    const s = E.repStatement(g, ev.plan).join(' ');
    expect(s).toContain(`You booked ${inr(g.achieved)} in October 2026, which is 131% of your target of ${inr(g.target)}`);
    expect(s).toContain(`${inr(g.clawbackTotal)} is taken back`);
    expect(s).toContain(`You will be paid ${inr(g.net)}`);
    expect(s).toMatch(/not a ranking/);
    expect(s).not.toMatch(/\bhe\b|\bshe\b|\btheir\b/i);
    const f = E.repStatement(computeIncentives(ev, 'emp_20', '2026-10'), ev.plan).join(' ');
    expect(f).toMatch(/starts paying at 70%/);
    expect(f).toMatch(/more booked would have reached that line/);
    expect(f).toMatch(/nothing is taken back/);
    expect(f).toMatch(/acknowledgement/);
    const held = E.repStatement(g, ev.plan, { heldReason: 'Waiting for the customer to confirm' }).join(' ');
    expect(held).toContain('HR has put your payout on hold: "Waiting for the customer to confirm"');
    expect(held).not.toContain('You will be paid');
  });
});

test.describe('what goes to payroll', () => {
  test('the preview equals what the push hands over, and a second push replaces the rows instead of adding', () => {
    resetDb(); fieldStore.reset();
    try {
      holdIncentive('2026-10', 'emp_8', 'Waiting for the customer to confirm the cancellation');
      decideDispute('disp_seed_1', 'accepted', 89, 'Odometer photos match the day');
      const state = fieldStore.get();
      const ids = new Set(getDb().employees.map((e) => e.id));
      const preview = E.payrollPreview(ev, '2026-10', state.incentiveRuns['2026-10']!.holds, state.travelOverrides, ids);
      expect(preview.heldPeople).toBe(1);
      expect(preview.rows.find((r) => r.employeeId === 'emp_8')).toMatchObject({ incentive: 0, withheld: 907, held: true });

      const res = pushFieldPayToPayroll('2026-10');
      expect(res).toEqual({ incentives: preview.incentives, travel: preview.travel, people: preview.people });
      const first = E.pushedSummary(getDb().adjustments, '2026-10');
      expect(first).toMatchObject({ incentives: preview.incentives, travel: preview.travel, people: preview.people });
      expect(first.rows).toBe(preview.rows.filter((r) => r.incentive > 0).length + preview.rows.filter((r) => r.travel > 0).length);

      pushFieldPayToPayroll('2026-10');
      expect(E.pushedSummary(getDb().adjustments, '2026-10')).toEqual(first);
      // rows of another month and untagged rows are not counted
      expect(E.pushedSummary(getDb().adjustments, '2026-11').rows).toBe(0);
      // the held person gets travel, with the decided km, and no incentive
      const karthik = getDb().adjustments.filter((a) => (a.note ?? '').startsWith('[field 2026-10]') && a.employeeId === 'emp_8');
      expect(karthik.map((a) => a.kind)).toEqual(['reimbursement']);
      expect(karthik[0]!.amount).toBe(E.effectiveTravel(ev, 'emp_8', '2026-10', state.travelOverrides).amount);
    } finally { resetDb(); fieldStore.reset(); }
  });
});

test.describe('travel statement with decided disputes', () => {
  test('with nothing decided it is the field engine statement', () => {
    for (const id of repIds) {
      const t = computeTravelAllowance(ev, id, '2026-10');
      const e = E.effectiveTravel(ev, id, '2026-10', {});
      expect(e.amount).toBe(t.amount);
      expect(e.gpsKm).toBe(t.payableKm);
      expect(e.extraKm).toBe(0);
      expect(e.days).toHaveLength(t.days.length);
      expect(e.days.every((d) => d.decidedKm == null)).toBe(true);
    }
  });

  test('a decided distance pays the extra km at the vehicle rate; a figure below the GPS adds nothing', () => {
    const base = E.effectiveTravel(ev, 'emp_8', '2026-10', {});
    const gps = base.days.find((d) => d.date === '2026-10-16')!.trailKm;
    const decided = E.effectiveTravel(ev, 'emp_8', '2026-10', { 'emp_8|2026-10-16': { km: 89, by: 'x', at: 'x', note: 'x' } });
    const day = decided.days.find((d) => d.date === '2026-10-16')!;
    expect(day.decidedKm).toBe(89);
    expect(day.effectiveKm).toBeCloseTo(89, 1);
    expect(decided.extraAmount).toBe(Math.round((89 - gps) * 3.5));
    expect(decided.amount).toBe(base.amount + decided.extraAmount);
    expect(decided.effectiveKm).toBeCloseTo(base.gpsKm + (89 - gps), 1);
    const lower = E.effectiveTravel(ev, 'emp_8', '2026-10', { 'emp_8|2026-10-16': { km: gps - 5, by: 'x', at: 'x', note: 'x' } });
    expect(lower.amount).toBe(base.amount);
    // the default day to open is the dispute candidate
    expect(E.defaultTravelDay(base)).toBe('2026-10-16');
    expect(E.defaultTravelDay(E.effectiveTravel(ev, 'emp_6', '2026-10', {}))).toBeDefined();
  });

  test('the gap window is the longest stretch with no fix', () => {
    const trail = ev.trails.find((t) => t.employeeId === 'emp_8' && t.date === '2026-10-16')!;
    expect(E.gapWindow(trail.points)).toEqual({ from: '13:05', to: '16:45', minutes: 220 });
    const clean = ev.trails.find((t) => t.employeeId === 'emp_6' && t.date === '2026-10-05')!;
    expect(E.gapWindow(clean.points)).toBeUndefined();
  });
});

test.describe('territory logic', () => {
  test('coverage with no reassignments is the field engine coverage, and a visit by anyone counts', () => {
    for (const id of repIds) for (const m of ['2026-10', '2026-11']) {
      const a = beatCoverage(ev, id, m), b = E.coverageFor(ev, id, m);
      expect([b.planned, b.visited, b.pct]).toEqual([a.planned, a.visited, a.pct]);
      expect(b.missedIds).toEqual(a.missed.map((o) => o.id));
    }
    expect(E.plannedOutlets(ev).some((o) => o.id === E.FAR_OUTLET_ID)).toBe(false);
  });

  test('handing an outlet over changes who owns it and who is credited, but the visit it already had still counts', () => {
    const o = E.plannedOutlets(ev).find((x) => x.repId === 'emp_20' && (E.outletActivity(ev, '2026-10').get(x.id)?.verified ?? 0) > 0)!;
    const moved = E.applyMoves(ev, { [o.id]: { toRepId: 'emp_19', fromRepId: 'emp_20', at: 'x', by: 'x' } });
    expect(moved.outlets.find((x) => x.id === o.id)!.repId).toBe('emp_19');
    expect(ev.outlets.find((x) => x.id === o.id)!.repId).toBe('emp_20');   // the evidence itself is untouched
    const before = { f: E.coverageFor(ev, 'emp_20', '2026-10'), g: E.coverageFor(ev, 'emp_19', '2026-10') };
    const after = { f: E.coverageFor(moved, 'emp_20', '2026-10'), g: E.coverageFor(moved, 'emp_19', '2026-10') };
    expect(after.f.planned).toBe(before.f.planned - 1);
    expect(after.g.planned).toBe(before.g.planned + 1);
    expect(after.g.visited).toBe(before.g.visited + 1);
    expect(after.f.visited).toBe(before.f.visited - 1);
    expect(E.applyMoves(ev, {})).toBe(ev);
    // the beat plan puts it on the same weekday for the new owner
    const wd = E.outletWeekdays(ev).get(o.id)!;
    expect(E.beatPlan(moved, 'emp_19')[wd]!.some((x) => x.id === o.id)).toBe(true);
    expect(E.beatPlan(moved, 'emp_20')[wd]!.some((x) => x.id === o.id)).toBe(false);
  });

  test('every person has a six-day plan of eight outlets, and dormant outlets are the unvisited ones, tier A first', () => {
    for (const id of repIds) {
      const plan = E.beatPlan(ev, id);
      expect(Object.keys(plan)).toHaveLength(6);
      for (let d = 1; d <= 6; d++) expect(plan[d], `${id} day ${d}`).toHaveLength(8);
    }
    const dormant = E.dormantOutlets(ev, '2026-10');
    const act = E.outletActivity(ev, '2026-10');
    expect(dormant.every((o) => !(act.get(o.id)?.verified))).toBe(true);
    expect(dormant.length).toBe(repIds.reduce((s, id) => s + E.coverageFor(ev, id, '2026-10').missedIds.length, 0));
    const tiers = dormant.map((o) => o.tier);
    expect([...tiers].sort()).toEqual(tiers);
    const t = E.territoryCoverage(ev, 'ter_del_c', '2026-10');
    expect(t.planned).toBe(48);
    expect(t.visited + t.missedIds.length).toBe(48);
  });

  test('overlaps include Farhan and Gaurav, each with a suggestion that clears the pair', () => {
    const pairs = E.overlapViews(ev);
    expect(pairs.length).toBe(territoryOverlaps(ev, 500).length);
    const fg = pairs.filter((p) => [p.repA, p.repB].sort().join() === 'emp_19,emp_20');
    expect(fg.length).toBeGreaterThan(0);
    for (const p of pairs) {
      expect(p.metres).toBeLessThanOrEqual(500);
      expect([p.repA, p.repB]).toContain(p.suggestion.fromRepId);
      expect([p.repA, p.repB]).toContain(p.suggestion.toRepId);
      expect(p.suggestion.fromRepId).not.toBe(p.suggestion.toRepId);
      expect(p.suggestion.nearTo).toBeGreaterThanOrEqual(p.suggestion.nearFrom);
    }
    const p = fg[0]!;
    const moved = E.applyMoves(ev, { [p.suggestion.moveOutletId]: { toRepId: p.suggestion.toRepId, fromRepId: p.suggestion.fromRepId, at: 'x', by: 'x' } });
    expect(E.overlapViews(moved).some((q) => q.a === p.a && q.b === p.b)).toBe(false);
    expect(E.overlapViews(moved).length).toBeLessThan(pairs.length);
  });

  test('reassigning checks its input, hands an outlet back to its owner by removing the move, and can be undone', () => {
    fieldPayStore.reset();
    try {
      const o = E.plannedOutlets(ev).find((x) => x.repId === 'emp_6')!;
      expect(reassignOutlet('nope', 'emp_7').ok).toBe(false);
      expect(reassignOutlet(o.id, 'emp_999').ok).toBe(false);
      expect(reassignOutlet(o.id, 'emp_6')).toMatchObject({ ok: false });
      expect(reassignOutlet(o.id, 'emp_7').ok).toBe(true);
      expect(fieldPayStore.get().moves[o.id]).toMatchObject({ toRepId: 'emp_7', fromRepId: 'emp_6' });
      expect(reassignOutlet(o.id, 'emp_6').ok).toBe(true);        // back to the owner: no move left
      expect(fieldPayStore.get().moves[o.id]).toBeUndefined();
      reassignOutlet(o.id, 'emp_7'); undoReassignment(o.id);
      expect(Object.keys(fieldPayStore.get().moves)).toHaveLength(0);
    } finally { fieldPayStore.reset(); }
  });
});

test.describe('team health logic', () => {
  const delhi = repIds.filter((id) => ev.reps.find((r) => r.employeeId === id)!.city === 'Delhi');

  test('Delhi has six people and is shown; Bengaluru has two and is not', () => {
    const teams = E.teamsOf(ev);
    expect(teams.map((t) => [t.name, t.size, t.shown])).toEqual([['Delhi', 6, true], ['Bengaluru', 2, false]]);
    expect(E.MIN_TEAM_SIZE).toBe(5);
    expect(teams[0]!.empIds.sort()).toEqual([...delhi].sort());
  });

  test('weekly signals add up to what the raw punches and visits say', () => {
    const weeks = E.teamWeekly(ev, delhi);
    expect(weeks).toHaveLength(6);
    expect(weeks.map((w) => w.fullWeek)).toEqual([false, true, true, true, true, false]);
    expect(weeks[0]!.weekStart).toBe('2026-09-28');
    const longDirect = ev.punches.filter((p) => delhi.includes(p.employeeId) && p.in && p.out && toMin(p.out) - toMin(p.in) > 600).length;
    expect(weeks.reduce((s, w) => s + w.longDays, 0)).toBe(longDirect);
    const eveningDirect = ev.visits.filter((v) => delhi.includes(v.employeeId) && v.start >= '19:00').length;
    expect(weeks.reduce((s, w) => s + w.eveningVisits, 0)).toBe(eveningDirect);
    expect(eveningDirect).toBeGreaterThan(0);
    const punchedDirect = new Set(ev.punches.filter((p) => delhi.includes(p.employeeId)).map((p) => `${p.employeeId}|${p.date}`));
    const visitDays = new Set(ev.visits.filter((v) => delhi.includes(v.employeeId)).map((v) => `${v.employeeId}|${v.date}`));
    expect(weeks.reduce((s, w) => s + w.workedDays, 0)).toBe(new Set([...punchedDirect, ...visitDays]).size);
    // share and average are consistent with the counts
    for (const w of weeks) if (w.spanDays) expect(w.longDayShare).toBeCloseTo(w.longDays / w.spanDays, 9);
  });

  test('rest-day coverage counts only full weeks, and the week of the seven-day run shows a gap', () => {
    const weeks = E.teamWeekly(ev, delhi);
    expect(weeks[0]!.restCoverage).toBeNull();
    expect(weeks[5]!.restCoverage).toBeNull();
    const w5 = weeks.find((w) => w.weekStart === '2026-10-05')!;
    expect(w5.peopleWithRest).toBe(5);
    expect(w5.restCoverage).toBeCloseTo(5 / 6, 9);
    expect(weeks.filter((w) => w.fullWeek && w.weekStart !== '2026-10-05').every((w) => w.restCoverage === 1)).toBe(true);
    const sum = E.teamSummary(ev, delhi);
    expect(sum.fullWeeks).toBe(4);
    expect(sum.restCoverage).toBeCloseTo(23 / 24, 9);
    expect(sum.noPunchByMonth.map((m) => [m.month, m.partial])).toEqual([['2026-10', false], ['2026-11', true]]);
  });

  test('the day length is punch-in to punch-out, or estimated from verified visits when a punch is missing', () => {
    const p = ev.punches.find((x) => x.employeeId === 'emp_6' && x.date === '2026-10-07')!;
    expect(E.daySpanMin(ev, 'emp_6', '2026-10-07')).toBe(toMin(p.out!) - toMin(p.in!));
    expect(E.daySpanMin(ev, 'emp_6', '2026-10-07')!).toBeGreaterThan(600);
    const noOut = ev.punches.find((x) => x.employeeId === 'emp_6' && x.date === '2026-10-14')!;
    expect(noOut.out).toBeUndefined();
    const ver = ev.visits.filter((v) => v.employeeId === 'emp_6' && v.date === '2026-10-14' && v.verified).sort((a, b) => a.start.localeCompare(b.start));
    expect(E.daySpanMin(ev, 'emp_6', '2026-10-14')).toBe(toMin(ver[ver.length - 1]!.end) - toMin(ver[0]!.start) + 30);
    expect(E.daySpanMin(ev, 'emp_6', '2026-10-04')).toBeUndefined();   // a Sunday nobody worked
  });

  test('team results carry no per-person data', () => {
    const json = JSON.stringify([E.teamWeekly(ev, delhi), E.teamSummary(ev, delhi)]);
    expect(json).not.toMatch(/emp_\d/);
    for (const id of delhi) expect(json).not.toContain(names[id]!);
  });

  test('a run of more than six working days is a weekly-off finding, and only Imran has one', () => {
    const all = E.allRestStreaks(ev);
    expect(all.map((s) => s.employeeId)).toEqual(['emp_6']);
    expect(all[0]!.from).toBe('2026-10-05');
    expect(all[0]!.days).toBeGreaterThanOrEqual(7);
    expect(E.restStreaks(ev, 'emp_4')).toEqual([]);
    // the same person has a six-day run later, which is within the limit
    expect(E.restStreaks(ev, 'emp_6', 6).length).toBeGreaterThan(E.restStreaks(ev, 'emp_6').length);
  });

  test('rest-day notes check their date and are not duplicated', () => {
    fieldPayStore.reset();
    try {
      const base = { employeeId: 'emp_6', streakFrom: '2026-10-05', streakTo: '2026-10-11', note: 'Agreed with the manager' };
      expect(scheduleRestDay({ ...base, date: PREVIEW_TODAY })).toMatchObject({ ok: false });
      expect(scheduleRestDay({ ...base, date: '' })).toMatchObject({ ok: false });
      expect(scheduleRestDay({ ...base, date: '2026-11-09' }).ok).toBe(true);
      expect(scheduleRestDay({ ...base, date: '2026-11-09' })).toMatchObject({ ok: false });
      const [n] = fieldPayStore.get().restNotes;
      expect(n).toMatchObject({ employeeId: 'emp_6', date: '2026-11-09', note: 'Agreed with the manager' });
      cancelRestNote(n!.id);
      expect(fieldPayStore.get().restNotes).toHaveLength(0);
    } finally { fieldPayStore.reset(); }
  });
});

// ═════════════════════════════ Incentives ═════════════════════════════
const INC = '/dashboard/hrms/incentives';
const incOct = repIds.map((id) => ({ id, res: computeIncentives(ev, id, '2026-10') }));
const sumBy = (rows: typeof incOct, f: (r: ReturnType<typeof computeIncentives>) => number) => rows.reduce((s, r) => s + f(r.res), 0);

test.describe('incentives page', () => {
  test('shows the seeded month: totals, a name-sorted table, the plan, and no console errors', async ({ page }) => {
    const errors = watch(page);
    await openHrms(page, INC);
    await expect(page.getByRole('heading', { name: 'Incentives', level: 1 })).toBeVisible();
    await expect(page.getByTestId('inc-stat-booked')).toContainText(inr(sumBy(incOct, (r) => r.achieved)));
    await expect(page.getByTestId('inc-stat-payable')).toContainText(inr(sumBy(incOct, (r) => r.gross)));
    await expect(page.getByTestId('inc-stat-held')).toContainText(inr(sumBy(incOct, (r) => r.heldTotal)));
    await expect(page.getByTestId('inc-stat-clawback')).toContainText(inr(1738));
    await expect(page.getByTestId('inc-stat-net')).toContainText(inr(sumBy(incOct, (r) => r.net)));
    const first = page.getByRole('table').first().getByRole('row');
    await expect(first).toHaveCount(9);   // header + 8 people
    expect(await peopleOrder(page)).toEqual(['Farhan Ali', 'Gaurav Saxena', 'Imran Sheikh', 'Karthik Subramanian', 'Pooja Verma', 'Rohit Chauhan', 'Sana Qureshi', 'Yash Rathore']);
    const gaurav = page.getByRole('row').filter({ hasText: 'Gaurav Saxena' });
    const g = computeIncentives(ev, 'emp_19', '2026-10');
    for (const v of [g.target, g.achieved, g.gross, g.heldTotal, g.net]) await expect(gaurav).toContainText(inr(v));
    await expect(gaurav).toContainText('131%');
    await expect(gaurav).toContainText(`-${inr(g.clawbackTotal)}`);
    await expect(page.getByTestId('plan-card')).toContainText('Sample company policy');
    await expect(page.locator('main')).not.toContainText(NO_RANKING);
    expect(errors).toEqual([]);
  });

  test('the month switch recomputes everything; November is part-month and pays nothing yet', async ({ page }) => {
    await openHrms(page, INC);
    await page.getByLabel('Month', { exact: true }).selectOption('2026-09');
    const sep = repIds.map((id) => ({ id, res: computeIncentives(ev, id, '2026-09') }));
    await expect(page.getByTestId('inc-stat-booked')).toContainText(inr(sumBy(sep, (r) => r.achieved)));
    await expect(page.getByTestId('inc-stat-net')).toContainText(inr(sumBy(sep, (r) => r.net)));
    await page.getByLabel('Month', { exact: true }).selectOption('2026-11');
    await expect(page.getByTestId('inc-stat-payable')).toContainText('₹0');
    await expect(page.getByText(/November is in progress/).first()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Sana Qureshi' })).toContainText('45%');
  });

  test('columns can be sorted by the person, but the default is alphabetical and there is no ranking styling', async ({ page }) => {
    await openHrms(page, INC);
    const firstName = async () => (await peopleOrder(page))[0];
    expect(await firstName()).toBe('Farhan Ali');
    const netHeader = page.getByRole('table').first().locator('th', { hasText: /^net/i });
    await netHeader.click();
    expect(await firstName()).toBe('Farhan Ali');            // ascending: nil net first (stable order)
    await expect(netHeader).toHaveAttribute('aria-sort', 'ascending');
    await netHeader.click();
    expect(await firstName()).toBe('Gaurav Saxena');         // descending: biggest net first
    await expect(page.getByText('Sorted by name. The order is not a ranking.')).toBeVisible();
  });

  test('the detail sheet explains the month: plain words, bands, deals, and a clawback with its reason', async ({ page }) => {
    await openHrms(page, INC);
    await page.getByRole('button', { name: 'Open the workings for Gaurav Saxena' }).click();
    const dlg = page.getByRole('dialog', { name: /Gaurav Saxena, Oct 2026/ });
    const g = computeIncentives(ev, 'emp_19', '2026-10');
    await expect(dlg.getByTestId('sheet-explanation')).toContainText('131% attainment');
    for (const l of g.explanation) await expect(dlg.getByTestId('sheet-explanation')).toContainText(l);
    await expect(dlg.getByTestId('band-bar')).toBeVisible();
    for (const b of g.bandRows) await expect(dlg.getByRole('row').filter({ hasText: inr(b.revenueInBand) }).first()).toContainText(inr(b.amount));
    for (const l of g.lines) await expect(dlg.getByRole('row').filter({ hasText: l.customer }).filter({ hasText: inr(l.value) }).first()).toBeVisible();
    await expect(dlg.getByRole('row').filter({ hasText: 'Held for collection' }).first()).toBeVisible();
    const c = g.clawbacks[0]!;
    await expect(dlg.getByTestId('sheet-clawbacks')).toContainText(`${inr(c.amount)} taken back`);
    await expect(dlg.getByTestId('sheet-clawbacks')).toContainText(c.why);
    await expect(dlg.getByTestId('sheet-clawbacks')).toContainText('only taken when the rep has signed the plan and the cancellation falls inside the 60-day window');
    await expect(dlg).toContainText('Plan acknowledged in writing');
    await expect(dlg.getByRole('link', { name: 'Open employee profile' })).toHaveAttribute('href', '/dashboard/hrms/employees/emp_19');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();

    // a person whose plan is not signed: the cancelled deal is not taken back, and the reason says why
    await page.getByRole('button', { name: 'Open the workings for Farhan Ali' }).click();
    const f = page.getByRole('dialog', { name: /Farhan Ali, Oct 2026/ });
    await expect(f.getByTestId('sheet-clawbacks')).toContainText('Nothing taken back');
    await expect(f.getByTestId('sheet-clawbacks')).toContainText('No signed acknowledgement of the incentive plan is on file');
  });

  test('"As the rep sees it" is a first-person statement the rep could read in their app', async ({ page }) => {
    await openHrms(page, INC);
    await page.getByRole('button', { name: 'Open the workings for Gaurav Saxena' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('tab', { name: 'As the rep sees it' }).click();
    const g = computeIncentives(ev, 'emp_19', '2026-10');
    const stmt = dlg.getByTestId('rep-statement');
    await expect(stmt).toContainText(`You booked ${inr(g.achieved)} in October 2026, which is 131% of your target of ${inr(g.target)}.`);
    await expect(stmt).toContainText(`${inr(g.clawbackTotal)} is taken back`);
    await expect(stmt).toContainText(`You will be paid ${inr(g.net)}`);
    await expect(dlg).toContainText('nothing is sent to anyone');
    // when HR holds the payout, the statement says so and says the person can reply
    await dlg.getByRole('tab', { name: 'Workings' }).click();
    await dlg.getByRole('button', { name: 'Hold the incentive' }).click();
    await page.getByRole('dialog', { name: /Hold the incentive of Gaurav Saxena/ }).getByLabel('Reason').fill('Waiting for the Lotus Developers cancellation to be confirmed');
    await page.getByRole('dialog', { name: /Hold the incentive of Gaurav Saxena/ }).getByRole('button', { name: 'Hold incentive' }).click();
    await dlg.getByRole('tab', { name: 'As the rep sees it' }).click();
    await expect(dlg.getByTestId('rep-statement')).toContainText('HR has put your payout on hold: "Waiting for the Lotus Developers cancellation to be confirmed"');
    await expect(dlg.getByTestId('rep-statement')).toContainText('reply to HR');
  });

  test('the what-if slider recomputes the payout from the plan bands and goes back to actual', async ({ page }) => {
    await openHrms(page, INC);
    await page.getByRole('button', { name: 'Open the workings for Gaurav Saxena' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('tab', { name: 'What if' }).click();
    const g = computeIncentives(ev, 'emp_19', '2026-10');
    const share = E.collectedShareOf(g);
    await expect(dlg.getByTestId('whatif-attainment')).toHaveText('131%');
    await expect(dlg.getByTestId('whatif-payable')).toHaveText(inr(g.gross));
    await expect(dlg.getByTestId('whatif-diff')).toHaveText('No change');

    await dlg.getByLabel('Booked revenue in rupees').fill('2000000');
    const w = E.payoutForBooked(ev.plan, g.target, 2_000_000, share);
    await expect(dlg.getByTestId('whatif-attainment')).toHaveText(`${Math.round(w.attainmentPct)}%`);
    await expect(dlg.getByTestId('whatif-accrued')).toHaveText(inr(w.accrued));
    await expect(dlg.getByTestId('whatif-payable')).toHaveText(inr(w.payableNow));
    await expect(dlg.getByTestId('whatif-diff')).toHaveText(`+${inr(Math.round(w.payableNow) - g.gross)}`);

    await dlg.getByLabel('Booked revenue in rupees').fill('900000');
    await expect(dlg.getByTestId('whatif-accrued')).toHaveText('₹0');
    await expect(dlg.getByTestId('whatif-payable')).toHaveText('₹0');
    await expect(dlg.getByText(/The next line is 70% of target/)).toBeVisible();

    // the slider moves the same number
    await dlg.getByTestId('whatif-slider').fill('1400000');
    await expect(dlg.getByLabel('Booked revenue in rupees')).toHaveValue('1400000');
    await expect(dlg.getByTestId('whatif-attainment')).toHaveText('100%');
    await expect(dlg.getByTestId('whatif-accrued')).toHaveText(inr(E.payoutForBooked(ev.plan, g.target, 1_400_000).accrued));
    await dlg.getByRole('button', { name: 'Back to actual' }).click();
    await expect(dlg.getByTestId('whatif-attainment')).toHaveText('131%');
  });

  test('the plan card is read-only and says plainly that it is company policy and a sample', async ({ page }) => {
    await openHrms(page, INC);
    const card = page.getByTestId('plan-card');
    await expect(card).toContainText('Field sales incentive FY 2026-27');
    await expect(card).toContainText('company policy, not a rule of law');
    await expect(card).toContainText('a sample written for the preview');
    await expect(card).toContainText('80%');
    await expect(card).toContainText('60 days after closing');
    for (const rate of ['Nothing', '1%', '1.5%', '2.5%']) await expect(card.getByRole('row').filter({ hasText: rate }).first()).toBeVisible();
    await expect(card.getByRole('button')).toHaveCount(0);
    await expect(card.getByRole('textbox')).toHaveCount(0);
  });

  test('a hold needs a written reason, shows in the table and the run, survives a reload and can be released', async ({ page }) => {
    await openHrms(page, INC);
    const hold = page.getByRole('button', { name: 'Hold the incentive of Karthik Subramanian' });
    await hold.click();
    const dlg = page.getByRole('dialog', { name: /Hold the incentive of Karthik Subramanian/ });
    await dlg.getByRole('button', { name: 'Hold incentive' }).click();
    await expect(dlg.getByText(/Write at least 8 characters/)).toBeVisible();
    await dlg.getByLabel('Reason').fill('Short');
    await dlg.getByRole('button', { name: 'Hold incentive' }).click();
    await expect(dlg.getByText(/Write at least 8 characters/)).toBeVisible();
    await dlg.getByLabel('Reason').fill('Waiting for the Skyline Realty cancellation to be confirmed');
    await dlg.getByRole('button', { name: 'Hold incentive' }).click();
    await expect(dlg).toBeHidden();

    const row = page.getByRole('row').filter({ hasText: 'Karthik Subramanian' });
    await expect(row).toContainText('Held by HR');
    await expect(row.getByRole('button', { name: 'Release the hold on Karthik Subramanian' })).toBeVisible();
    const preview = E.payrollPreview(ev, '2026-10', { emp_8: 'x' }, {}, new Set(Object.keys(names)));
    await expect(page.getByTestId('run-incentives')).toHaveText(inr(preview.incentives));
    await expect(page.getByTestId('run-panel')).toContainText(`1 (${inr(907)} kept back)`);
    expect((await readStore<{ incentiveRuns: Record<string, { holds: Record<string, string> }> }>(page, FIELD_KEY)).incentiveRuns['2026-10']!.holds.emp_8).toContain('Skyline Realty');

    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: 'Karthik Subramanian' })).toContainText('Held by HR', slow);
    await page.getByRole('row').filter({ hasText: 'Karthik Subramanian' }).getByRole('button', { name: 'Release the hold on Karthik Subramanian' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Karthik Subramanian' })).not.toContainText('Held by HR');
    await expect(page.getByTestId('run-panel')).toContainText('Nobody');
  });

  test('Approve run lists who is held, and Push to payroll stays off until the run is approved', async ({ page }) => {
    await openHrms(page, INC);
    const push = page.getByRole('button', { name: 'Push to payroll' });
    await expect(push).toBeDisabled();
    await expect(page.getByTestId('run-status-line')).toContainText('Approve the run first');
    await page.getByRole('button', { name: 'Hold the incentive of Pooja Verma' }).click();
    await page.getByRole('dialog').getByLabel('Reason').fill('Customer dispute on the Nair Contracting order');
    await page.getByRole('dialog').getByRole('button', { name: 'Hold incentive' }).click();

    await page.getByRole('button', { name: 'Approve run' }).click();
    const dlg = page.getByRole('dialog', { name: /Approve the Oct 2026 incentive run/ });
    await expect(dlg.getByTestId('approve-held')).toContainText('Held by HR, not paid in this run (1)');
    await expect(dlg.getByTestId('approve-held')).toContainText('Pooja Verma');
    await expect(dlg.getByTestId('approve-held')).toContainText('Customer dispute on the Nair Contracting order');
    await expect(dlg).toContainText('Gaurav Saxena');   // the clawback taken off his net is listed too
    await expect(dlg).toContainText('does not move any money');
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('run-panel')).toContainText('Draft');
    await expect(push).toBeDisabled();

    await page.getByRole('button', { name: 'Approve run' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve run' }).click();
    await expect(page.getByTestId('run-status-line')).toContainText('Approved by You (HR admin)');
    await expect(page.getByRole('button', { name: 'Approve run' })).toBeDisabled();
    await expect(push).toBeEnabled();
    await expect(page.getByRole('row').filter({ hasText: 'Gaurav Saxena' })).toContainText('Approved');
    await expect(page.getByRole('row').filter({ hasText: 'Pooja Verma' })).toContainText('Held by HR');
    expect((await readStore<{ incentiveRuns: Record<string, { status: string }> }>(page, FIELD_KEY)).incentiveRuns['2026-10']!.status).toBe('approved');
    await page.reload();
    await expect(page.getByTestId('run-status-line')).toContainText('Approved by You (HR admin)', slow);
  });

  test('push to payroll: the result card matches the run, the adjustments exist in Payroll, and pushing twice does not double them', async ({ page }) => {
    test.setTimeout(240_000);
    await openHrms(page, INC);
    const ids = new Set(Object.keys(names));
    const preview = E.payrollPreview(ev, '2026-10', {}, {}, ids);
    await expect(page.getByTestId('run-panel')).toContainText('already paid in the sample data');   // October is a closed month in the sample payroll
    await page.getByRole('button', { name: 'Approve run' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve run' }).click();
    await page.getByRole('button', { name: 'Push to payroll' }).click();
    const dlg = page.getByRole('dialog', { name: /Push Oct 2026 to payroll/ });
    await expect(dlg).toContainText(`${inr(preview.incentives)} of incentives`);
    await dlg.getByRole('button', { name: 'Push to payroll' }).click();

    const result = page.getByTestId('push-result');
    await expect(result.getByTestId('push-incentives')).toHaveText(inr(preview.incentives));
    await expect(result.getByTestId('push-travel')).toHaveText(inr(preview.travel));
    await expect(result.getByTestId('push-people')).toHaveText(String(preview.people));
    await expect(page.getByTestId('run-panel')).toContainText('In payroll');
    await expect(page.getByRole('row').filter({ hasText: 'Gaurav Saxena' })).toContainText('In payroll');
    const rows = await readAdjustments(page, '2026-10');
    expect(rows.reduce((s, r) => s + (r.kind === 'incentive' ? r.amount : 0), 0)).toBe(preview.incentives);
    const rowCount = rows.length;
    expect(rowCount).toBeGreaterThan(8);

    // through the UI: the Adjustments tab of Payroll shows the rows
    await result.getByRole('link', { name: 'Open payroll adjustments' }).click();
    await expect(page.getByRole('heading', { name: 'Payroll', exact: true })).toBeVisible(slow);
    await expect(page.getByRole('tab', { name: /^Adjustments/ })).toHaveAttribute('aria-selected', 'true');
    await page.getByLabel('Month', { exact: true }).selectOption('2026-10');
    const g = computeIncentives(ev, 'emp_19', '2026-10');
    const gRow = page.getByRole('row').filter({ hasText: '[field 2026-10] Sales incentive' }).filter({ hasText: 'Gaurav Saxena' });
    await expect(gRow).toContainText(inr(g.net));
    await expect(gRow).toContainText('Locked (paid)');
    await expect(page.getByRole('row').filter({ hasText: 'Travel allowance from GPS trail' }).filter({ hasText: 'Karthik Subramanian' })).toContainText(inr(computeTravelAllowance(ev, 'emp_8', '2026-10').amount));
    await expect(page.getByRole('row').filter({ hasText: '[field 2026-10]' })).toHaveCount(rowCount);

    // push again from the incentives page: the same rows, not twice as many
    await page.goto(INC);
    await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
    await page.getByRole('button', { name: 'Push again' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Push again' }).click();
    await expect(page.getByTestId('push-incentives')).toHaveText(inr(preview.incentives));
    expect(await readAdjustments(page, '2026-10')).toHaveLength(rowCount);
    expect(E.pushedSummary((await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), DB_KEY)).adjustments, '2026-10').incentives).toBe(preview.incentives);
  });

  test('November is an open month: the push carries travel only, with no lock warning', async ({ page }) => {
    await openHrms(page, INC);
    await page.getByLabel('Month', { exact: true }).selectOption('2026-11');
    await expect(page.getByTestId('run-panel')).not.toContainText('already paid in the sample data');
    await page.getByRole('button', { name: 'Approve run' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve run' }).click();
    await page.getByRole('button', { name: 'Push to payroll' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Push to payroll' }).click();
    const nov = E.payrollPreview(ev, '2026-11', {}, {}, new Set(Object.keys(names)));
    await expect(page.getByTestId('push-travel')).toHaveText(inr(nov.travel));
    await expect(page.getByTestId('push-incentives')).toHaveText('₹0');
    await expect(page.getByTestId('push-people')).toHaveText(String(nov.people));
    const rows = await readAdjustments(page, '2026-11');
    expect(rows.length).toBe(repIds.length);
    expect(rows.every((r) => r.kind === 'reimbursement')).toBe(true);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(nov.travel);
  });

  test('a hold placed after the push is flagged as a change, and pushing again updates payroll', async ({ page }) => {
    await openHrms(page, INC);
    await page.getByRole('button', { name: 'Approve run' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve run' }).click();
    await page.getByRole('button', { name: 'Push to payroll' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Push to payroll' }).click();
    const ids = new Set(Object.keys(names));
    const all = E.payrollPreview(ev, '2026-10', {}, {}, ids);
    await expect(page.getByTestId('push-incentives')).toHaveText(inr(all.incentives));
    await expect(page.getByTestId('push-result')).not.toContainText('figures have changed');

    await page.getByRole('button', { name: 'Hold the incentive of Gaurav Saxena' }).click();
    await page.getByRole('dialog').getByLabel('Reason').fill('Customer asked for a credit note on the Heritage Hotels invoice');
    await page.getByRole('dialog').getByRole('button', { name: 'Hold incentive' }).click();
    await expect(page.getByTestId('push-result')).toContainText('The figures have changed since the last push');
    await expect(page.getByTestId('push-incentives')).toHaveText(inr(all.incentives));      // payroll still has the old figure until you push again
    const held = E.payrollPreview(ev, '2026-10', { emp_19: 'x' }, {}, ids);
    expect(held.incentives).toBe(all.incentives - 6592);
    await expect(page.getByTestId('run-incentives')).toHaveText(inr(held.incentives));

    await page.getByRole('button', { name: 'Push again' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Push again' }).click();
    await expect(page.getByTestId('push-incentives')).toHaveText(inr(held.incentives));
    await expect(page.getByTestId('push-result')).not.toContainText('figures have changed');
    const rows = await readAdjustments(page, '2026-10');
    expect(rows.filter((r) => r.employeeId === 'emp_19').map((r) => r.kind)).toEqual(['reimbursement']);   // travel still goes, the incentive does not
  });

  test('no sideways page scroll at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHrms(page, INC);
    await expect(page.getByTestId('inc-stat-net')).toBeVisible();
    await page.waitForTimeout(600);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Open the workings for Gaurav Saxena' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const box = await page.getByRole('dialog').boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
  });
});

// ═════════════════════════════ Travel & GPS ═════════════════════════════
const TRV = '/dashboard/hrms/travel';
const karthik = E.effectiveTravel(ev, 'emp_8', '2026-10', {});

test.describe('travel page', () => {
  test('opens on Karthik\'s October statement with the engine\'s totals, the policy label and the GPS principle', async ({ page }) => {
    const errors = watch(page);
    await openHrms(page, TRV);
    await expect(page.getByRole('heading', { name: 'Travel & GPS', level: 1 })).toBeVisible();
    await expect(page.getByTestId('gps-principle')).toContainText('GPS is the default because it is objective');
    await expect(page.getByTestId('gps-principle')).toContainText('always dispute a day with their odometer photo');
    await expect(page.getByTestId('gps-principle')).toContainText('HR decides, and the decision is kept on the record');
    await expect(page.getByTestId('trv-stat-days')).toContainText(String(karthik.days.length));
    await expect(page.getByTestId('trv-stat-gps')).toContainText(`${num1(karthik.gpsKm)} km`);
    await expect(page.getByTestId('trv-stat-amount')).toContainText(inr(karthik.amount));
    await expect(page.getByTestId('trv-stat-rate')).toContainText('₹3.5 per km');
    await expect(page.getByTestId('trv-stat-rate')).toContainText('Sample company travel policy');
    await expect(page.getByTestId('statement-amount')).toHaveText(inr(karthik.amount));
    await expect(page.getByTestId('statement-km')).toHaveText(num1(karthik.effectiveKm));
    await expect(page.getByTestId('statement').getByRole('row')).toHaveCount(karthik.days.length + 2);   // header, days, total
    const row = page.getByTestId('statement').getByRole('row').filter({ hasText: 'Fri 16 Oct' });
    await expect(row).toContainText('29.2');
    await expect(row).toContainText('89');
    await expect(row).toContainText('3h 40m');
    await expect(row).toContainText(inr(102));
    await expect(page.locator('main')).not.toContainText(NO_RANKING);
    expect(errors).toEqual([]);
  });

  test('the day panel opens on the dispute candidate with its numbers, and a plot whose gap is drawn as a guess', async ({ page }) => {
    await openHrms(page, TRV);
    const panel = page.getByTestId('day-panel');
    await expect(panel).toContainText('Karthik Subramanian, Fri 16 Oct');
    await expect(panel.getByTestId('day-gps')).toHaveText('29.2 km');
    await expect(panel.getByTestId('day-odo')).toContainText('89 km');
    await expect(panel.getByTestId('day-odo')).toContainText('Photos: start yes, end yes');
    await expect(panel.getByTestId('day-gap')).toHaveText('3h 40m (13:05 to 16:45)');
    await expect(panel.getByTestId('day-pays')).toContainText('29.2 km');
    await expect(panel).toContainText('GPS gap hides distance');
    await expect(panel).toContainText('The odometer says 89 km against 29.2 km on the trail');
    const plot = panel.getByTestId('trail-plot');
    await expect(plot).toBeVisible();
    expect(await plot.locator('polyline').count()).toBeGreaterThanOrEqual(2);
    expect(await plot.locator('polyline[stroke-dasharray]').count()).toBe(1);   // the one stretch with no fix
    const visits = ev.visits.filter((v) => v.employeeId === 'emp_8' && v.date === '2026-10-16');
    await expect(panel.getByTestId('day-visits').getByRole('listitem')).toHaveCount(visits.length);
    await expect(plot.locator('title', { hasText: 'verified' }).first()).toBeAttached();

    // another day: the panel follows and the numbers beside it are that day's
    await page.getByRole('button', { name: 'Show Tue 13 Oct on the map' }).click();
    const d13 = karthik.days.find((d) => d.date === '2026-10-13')!;
    await expect(panel).toContainText('Karthik Subramanian, Tue 13 Oct');
    await expect(panel.getByTestId('day-gps')).toHaveText(`${num1(d13.trailKm)} km`);
    await expect(panel).toContainText('No dispute needed');
  });

  test('the month and the person pickers change the statement; November is part of the evidence', async ({ page }) => {
    await openHrms(page, TRV);
    await page.getByLabel('Person', { exact: true }).selectOption('emp_6');
    const imran = E.effectiveTravel(ev, 'emp_6', '2026-10', {});
    await expect(page.getByTestId('trv-stat-days')).toContainText(String(imran.days.length));
    await expect(page.getByTestId('statement-amount')).toHaveText(inr(imran.amount));
    await expect(page.getByTestId('day-panel')).toContainText('Imran Sheikh');
    await page.getByLabel('Month', { exact: true }).selectOption('2026-11');
    const nov = E.effectiveTravel(ev, 'emp_6', '2026-11', {});
    await expect(page.getByTestId('statement-amount')).toHaveText(inr(nov.amount));
    await expect(page.getByTestId('trv-stat-days')).toContainText(String(nov.days.length));
    await page.getByLabel('Person', { exact: true }).selectOption('emp_4');
    await expect(page.getByTestId('trv-stat-rate')).toContainText('₹9 per km');
    await expect(page.getByTestId('trv-stat-rate')).toContainText('Car');
  });

  test('the seeded dispute shows the thread, the system value against the claim, and who has to decide', async ({ page }) => {
    await openHrms(page, TRV);
    const card = page.getByTestId('disputes-card');
    await expect(card.getByRole('row').filter({ hasText: 'Karthik Subramanian' })).toContainText('Open');
    await expect(card.getByRole('row').filter({ hasText: 'Karthik Subramanian' })).toContainText('29.2');
    await expect(card.getByTestId('no-candidates')).toContainText('No other day this month');
    await card.getByRole('button', { name: /Open the dispute of Karthik Subramanian on 16 Oct 2026/ }).click();
    const dlg = page.getByRole('dialog', { name: /Travel dispute: Karthik Subramanian, Fri 16 Oct/ });
    await expect(dlg.getByTestId('dispute-system')).toContainText('29.2 km');
    await expect(dlg.getByTestId('dispute-claim')).toContainText('89 km');
    await expect(dlg.getByTestId('dispute-thread')).toContainText('My phone died around 1 pm');
    await expect(dlg.getByTestId('dispute-thread')).toContainText('Employee: Karthik Subramanian');
    await expect(dlg).toContainText('3h 40m stretch of no fixes from 13:05 to 16:45');
    await expect(dlg).toContainText('photos at start present and end present');
    await expect(dlg.getByTestId('decision-form')).toContainText('The person can reply in the thread before you decide');
  });

  test('a decision needs a choice, a sensible distance and a written note', async ({ page }) => {
    await openHrms(page, TRV);
    await page.getByRole('button', { name: /Open the dispute of Karthik Subramanian/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Record decision' }).click();
    await expect(dlg.getByText('Choose a decision.')).toBeVisible();
    await expect(dlg.getByText(/Write the reason for your decision/)).toBeVisible();
    await dlg.getByRole('radio', { name: /^Partly accept/ }).check();
    await dlg.getByLabel(/Distance you accept/).fill('20');
    await dlg.getByLabel(/Note for the record/).fill('Photos are clear');
    await dlg.getByRole('button', { name: 'Record decision' }).click();
    await expect(dlg.getByText('Enter more than the GPS figure (29.2 km), or reject.')).toBeVisible();
    await dlg.getByLabel(/Distance you accept/).fill('95');
    await expect(dlg.getByText('Enter less than the claim (89 km), or accept the full claim.')).toBeVisible();
    await dlg.getByLabel(/Distance you accept/).fill('60');
    await dlg.getByLabel(/Note for the record/).fill('ok');
    await dlg.getByRole('button', { name: 'Record decision' }).click();
    await expect(dlg.getByText(/Write the reason for your decision/)).toBeVisible();
    // nothing was recorded by any of that
    expect((await readStore<{ disputes: { status: string }[]; travelOverrides: object }>(page, FIELD_KEY)).disputes[0]!.status).toBe('open');
  });

  test('accepting the odometer figure changes the statement, adds the extra amount and survives a reload', async ({ page }) => {
    await openHrms(page, TRV);
    await page.getByRole('button', { name: /Open the dispute of Karthik Subramanian/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('radio', { name: /^Accept the odometer figure \(89 km\)/ }).check();
    await dlg.getByLabel(/Note for the record/).fill('Odometer photos at 9:20 and 19:05 match the claim');
    await dlg.getByRole('button', { name: 'Record decision' }).click();
    const decided = E.effectiveTravel(ev, 'emp_8', '2026-10', { 'emp_8|2026-10-16': { km: 89, by: 'x', at: 'x', note: 'x' } });
    await expect(dlg.getByTestId('decision-summary')).toContainText('Accepted: 89 km');
    await expect(dlg.getByTestId('decision-summary')).toContainText('The statement now pays 89 km for this day');
    await expect(dlg.getByTestId('dispute-thread')).toContainText('Decision: accepted (89 km). Odometer photos at 9:20 and 19:05 match the claim');
    await expect(dlg.getByTestId('decision-form')).toHaveCount(0);
    await page.keyboard.press('Escape');

    const check = async () => {
      await expect(page.getByTestId('statement-amount')).toHaveText(inr(decided.amount));
      await expect(page.getByTestId('statement-km')).toHaveText(num1(decided.effectiveKm));
      const row = page.getByTestId('statement').getByRole('row').filter({ hasText: 'Fri 16 Oct' });
      await expect(row).toContainText('HR decided');
      await expect(row).toContainText(inr(311));
      await expect(page.getByTestId('trv-stat-amount')).toContainText(`Includes ${inr(decided.extraAmount)} from disputes`);
      await expect(page.getByTestId('day-pays')).toContainText('89 km');
      await expect(page.getByTestId('disputes-card').getByRole('row').filter({ hasText: 'Karthik Subramanian' })).toContainText('Accepted');
    };
    await check();
    expect(decided.extraAmount).toBe(209);
    await page.reload();
    await expect(page.getByTestId('statement-amount')).toHaveText(inr(decided.amount), slow);
    await check();
    expect((await readStore<{ travelOverrides: Record<string, { km: number }> }>(page, FIELD_KEY)).travelOverrides['emp_8|2026-10-16']!.km).toBe(89);
  });

  test('a partly accepted distance pays only that much; a rejection leaves the statement alone and keeps the reason', async ({ page }) => {
    await openHrms(page, TRV);
    await page.getByRole('button', { name: /Open the dispute of Karthik Subramanian/ }).click();
    let dlg = page.getByRole('dialog');
    await dlg.getByRole('radio', { name: /^Partly accept/ }).check();
    await dlg.getByLabel(/Distance you accept/).fill('60');
    await dlg.getByLabel(/Note for the record/).fill('Accepting the first beat only; the second has no visit proof');
    await dlg.getByRole('button', { name: 'Record decision' }).click();
    await expect(dlg.getByTestId('decision-summary')).toContainText('Partly accepted: 60 km');
    await page.keyboard.press('Escape');
    const partly = E.effectiveTravel(ev, 'emp_8', '2026-10', { 'emp_8|2026-10-16': { km: 60, by: 'x', at: 'x', note: 'x' } });
    await expect(page.getByTestId('statement-amount')).toHaveText(inr(partly.amount));
    expect(partly.amount).toBe(karthik.amount + Math.round((60 - 29.2) * 3.5));
    await expect(page.getByTestId('day-pays')).toContainText('60 km');

    // a second person's dispute, rejected: nothing changes on the statement
    await page.getByLabel('Person', { exact: true }).selectOption('emp_6');
    await page.getByRole('button', { name: 'Show Wed 7 Oct on the map' }).click();
    const gps = E.effectiveTravel(ev, 'emp_6', '2026-10', {}).days.find((d) => d.date === '2026-10-07')!.trailKm;
    await page.getByRole('button', { name: 'Raise a dispute for this day' }).click();
    const raise = page.getByRole('dialog', { name: /Raise a dispute for Imran Sheikh/ });
    await raise.getByLabel(/Distance the person says/).fill(String(Math.ceil(gps) + 30));
    await raise.getByLabel(/What the person says/).fill('I rode to a dealer outside the beat that afternoon');
    await raise.getByRole('button', { name: 'Raise dispute' }).click();
    dlg = page.getByRole('dialog', { name: /Travel dispute: Imran Sheikh/ });
    await dlg.getByRole('radio', { name: /^Reject/ }).check();
    await dlg.getByLabel(/Note for the record/).fill('No visit proof for the dealer, so GPS stands');
    await dlg.getByRole('button', { name: 'Record decision' }).click();
    await expect(dlg.getByTestId('decision-summary')).toContainText('Rejected');
    await expect(dlg.getByTestId('decision-summary')).toContainText('No visit proof for the dealer, so GPS stands');
    await expect(dlg.getByTestId('decision-summary')).not.toContainText('The statement now pays');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('statement-amount')).toHaveText(inr(E.effectiveTravel(ev, 'emp_6', '2026-10', {}).amount));
    expect(Object.keys((await readStore<{ travelOverrides: object }>(page, FIELD_KEY)).travelOverrides)).toEqual(['emp_8|2026-10-16']);
  });

  test('a reply is added to the thread as HR or recorded for the employee, and stays after a reload', async ({ page }) => {
    await openHrms(page, TRV);
    await page.getByRole('button', { name: /Open the dispute of Karthik Subramanian/ }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByRole('button', { name: 'Add to thread' })).toBeDisabled();
    await dlg.getByLabel('Message').fill('Can you send the photo of the 19:05 reading as well?');
    await dlg.getByRole('button', { name: 'Add to thread' }).click();
    await expect(dlg.getByTestId('dispute-thread')).toContainText('HR: You (HR admin)');
    await dlg.getByLabel('Write as').selectOption('employee');
    await dlg.getByLabel('Message').fill('Sent it just now, it shows 27,709 km');
    await dlg.getByRole('button', { name: 'Add to thread' }).click();
    await expect(dlg.getByTestId('dispute-thread').getByRole('listitem')).toHaveCount(3);
    await expect(dlg.getByTestId('dispute-thread')).toContainText('Sent it just now, it shows 27,709 km');
    await expect(dlg).toContainText('the employee writes their own messages from their app');
    await page.reload();
    await page.getByRole('button', { name: /Open the dispute of Karthik Subramanian/ }).click({ timeout: 60_000 });
    await expect(page.getByRole('dialog').getByTestId('dispute-thread').getByRole('listitem')).toHaveCount(3);
  });

  test('a dispute can be raised on behalf of an employee for any day, once, and it persists', async ({ page }) => {
    await openHrms(page, TRV);
    await page.getByLabel('Person', { exact: true }).selectOption('emp_9');
    const day = E.effectiveTravel(ev, 'emp_9', '2026-10', {}).days.find((d) => d.date === '2026-10-22')!;
    await page.getByRole('button', { name: 'Show Thu 22 Oct on the map' }).click();
    await page.getByRole('button', { name: 'Raise a dispute for this day' }).click();
    const dlg = page.getByRole('dialog', { name: /Raise a dispute for Sana Qureshi, Thu 22 Oct/ });
    await dlg.getByLabel(/Distance the person says/).fill('5');
    await dlg.getByRole('button', { name: 'Raise dispute' }).click();
    await expect(dlg.getByText(/That is not more than the GPS figure/)).toBeVisible();
    await expect(dlg.getByText(/Write what the person told you/)).toBeVisible();
    await dlg.getByLabel(/Distance the person says/).fill(String(Math.ceil(day.trailKm) + 10));
    await dlg.getByLabel(/What the person says/).fill('The phone was in a bag for part of the ride');
    await dlg.getByRole('button', { name: 'Raise dispute' }).click();
    const sheet = page.getByRole('dialog', { name: /Travel dispute: Sana Qureshi, Thu 22 Oct/ });
    await expect(sheet.getByTestId('dispute-thread')).toContainText('The phone was in a bag for part of the ride');
    await expect(sheet.getByTestId('dispute-thread')).toContainText('Employee: Sana Qureshi');
    await expect(sheet.getByTestId('decision-form')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('disputes-card').getByRole('row').filter({ hasText: 'Sana Qureshi' })).toContainText('Open');
    await expect(page.getByRole('button', { name: 'Raise a dispute for this day' })).toBeDisabled();
    await expect(page.getByTestId('day-panel')).toContainText('A dispute for this day already exists (open)');
    await page.reload();
    await page.getByLabel('Person', { exact: true }).selectOption('emp_9');
    await expect(page.getByTestId('disputes-card').getByRole('row').filter({ hasText: 'Sana Qureshi' })).toContainText('Open', slow);
    expect((await readStore<{ disputes: { employeeId: string; ref: string }[] }>(page, FIELD_KEY)).disputes.filter((d) => d.employeeId === 'emp_9' && d.ref === '2026-10-22')).toHaveLength(1);
  });

  test('what goes to payroll is summarised read-only, and a decided dispute travels to payroll when the run is pushed', async ({ page }) => {
    test.setTimeout(240_000);
    await openHrms(page, TRV);
    const ids = new Set(Object.keys(names));
    const before = E.payrollPreview(ev, '2026-10', {}, {}, ids);
    const sum = page.getByTestId('payroll-summary');
    await expect(sum.getByTestId('sum-travel')).toHaveText(inr(before.travel));
    await expect(sum.getByTestId('sum-incentives')).toHaveText(inr(before.incentives));
    await expect(sum).toContainText('Run not yet approved');
    await expect(sum.getByRole('link', { name: 'Incentives page' })).toHaveAttribute('href', '/dashboard/hrms/incentives');
    await expect(sum.getByRole('button')).toHaveCount(0);   // the push lives on the Incentives page

    await page.getByRole('button', { name: /Open the dispute of Karthik Subramanian/ }).click();
    await page.getByRole('dialog').getByRole('radio', { name: /^Accept the odometer figure/ }).check();
    await page.getByRole('dialog').getByLabel(/Note for the record/).fill('Odometer photos match the claim');
    await page.getByRole('dialog').getByRole('button', { name: 'Record decision' }).click();
    await page.keyboard.press('Escape');
    const after = E.payrollPreview(ev, '2026-10', {}, { 'emp_8|2026-10-16': { km: 89, by: 'x', at: 'x', note: 'x' } }, ids);
    expect(after.travel).toBe(before.travel + 209);
    await expect(sum.getByTestId('sum-travel')).toHaveText(inr(after.travel));
    await expect(sum).toContainText(`Includes ${inr(209)} from decided disputes`);

    await sum.getByRole('link', { name: 'Incentives page' }).click();
    await expect(page.getByRole('heading', { name: 'Incentives', level: 1 })).toBeVisible(slow);
    await expect(page.getByTestId('run-travel')).toHaveText(inr(after.travel));
    await page.getByRole('button', { name: 'Approve run' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve run' }).click();
    await page.getByRole('button', { name: 'Push to payroll' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Push to payroll' }).click();
    await expect(page.getByTestId('push-travel')).toHaveText(inr(after.travel));
    const k = (await readAdjustments(page, '2026-10')).filter((a) => a.employeeId === 'emp_8' && a.kind === 'reimbursement');
    expect(k).toHaveLength(1);
    expect(k[0]!.amount).toBe(karthik.amount + 209);
  });

  test('no sideways page scroll at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHrms(page, TRV);
    await expect(page.getByTestId('day-panel')).toBeVisible();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: /Open the dispute of Karthik Subramanian/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect((await page.getByRole('dialog').boundingBox())!.width).toBeLessThanOrEqual(390);
  });
});

// ═════════════════════════════ Territory & beats ═════════════════════════════
const TER = '/dashboard/hrms/territory';
const delhiTerritories = ev.territories.filter((t) => t.city === 'Delhi').map((t) => t.id);
const delhiReps = ev.reps.filter((r) => r.city === 'Delhi').map((r) => r.employeeId);
const territoryOf = (outletId: string) => ev.outlets.find((o) => o.id === outletId)!.territoryId;
const touchesDelhi = (p: { a: string; b: string }) => delhiTerritories.includes(territoryOf(p.a)) || delhiTerritories.includes(territoryOf(p.b));

test.describe('territory page', () => {
  test('lists every territory with potential, booked, coverage and people, and no console errors', async ({ page }) => {
    const errors = watch(page);
    await openHrms(page, TER);
    await expect(page.getByRole('heading', { name: 'Territory & beats', level: 1 })).toBeVisible();
    const table = page.getByTestId('territory-table');
    for (const t of ev.territories) {
      const row = table.getByRole('row').filter({ hasText: t.name });
      const cov = E.territoryCoverage(ev, t.id, '2026-10');
      const b = E.territoryBooked(ev, t.id, '2026-10');
      await expect(row).toContainText(inr(t.potentialPerMonth));
      await expect(row).toContainText(inr(b.booked));
      await expect(row).toContainText(`${Math.round((b.booked / t.potentialPerMonth) * 100)}%`);
      await expect(row).toContainText(`${cov.pct}% (${cov.visited} of ${cov.planned})`);
      for (const id of b.people) await expect(row).toContainText(names[id]!.split(' ')[0]!);
    }
    await expect(page.getByText('It is not a performance score for any person.')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(NO_RANKING);
    expect(errors).toEqual([]);
  });

  test('the view starts on Delhi: outlets, coverage, dormant and overlap counts come from the engines', async ({ page }) => {
    await openHrms(page, TER);
    const inDelhi = E.plannedOutlets(ev).filter((o) => delhiTerritories.includes(o.territoryId));
    const act = E.outletActivity(ev, '2026-10');
    const visited = inDelhi.filter((o) => (act.get(o.id)?.verified ?? 0) > 0).length;
    const dormant = E.dormantOutlets(ev, '2026-10').filter((o) => delhiTerritories.includes(o.territoryId));
    const overlaps = E.overlapViews(ev).filter(touchesDelhi);
    await expect(page.getByTestId('ter-stat-outlets')).toContainText(String(inDelhi.length));
    await expect(page.getByTestId('ter-stat-coverage')).toContainText(`${Math.round((visited / inDelhi.length) * 100)}%`);
    await expect(page.getByTestId('ter-stat-dormant')).toContainText(String(dormant.length));
    await expect(page.getByTestId('ter-stat-overlaps')).toContainText(String(overlaps.length));
    await expect(page.getByTestId('ter-stat-moves')).toContainText('None yet');
    const plot = page.getByTestId('territory-plot');
    await expect(plot).toBeVisible();
    expect(await plot.locator('g:has(title)').count()).toBeGreaterThanOrEqual(inDelhi.length);
    await expect(page.getByTestId('map-legend')).toContainText('Square: no verified visit');
    for (const id of delhiReps) await expect(page.getByTestId('map-legend')).toContainText(names[id]!);
  });

  test('the territory and person filters narrow the map, the counts and the people table', async ({ page }) => {
    await openHrms(page, TER);
    await page.getByLabel('Territory', { exact: true }).selectOption('ter_del_s');
    await expect(page.getByTestId('ter-stat-outlets')).toContainText('96');
    const options = await page.getByLabel('Person', { exact: true }).locator('option').allInnerTexts();
    expect(options.sort()).toEqual(['Everyone in view', 'Imran Sheikh', 'Pooja Verma']);
    await page.getByLabel('Person', { exact: true }).selectOption('emp_6');
    await expect(page.getByTestId('ter-stat-outlets')).toContainText('48');
    const c = E.coverageFor(ev, 'emp_6', '2026-10');
    await expect(page.getByTestId('ter-stat-coverage')).toContainText(`${c.pct}%`);
    await expect(page.getByTestId('ter-stat-dormant')).toContainText(String(c.missedIds.length));
    await expect(page.getByTestId('map-legend')).toContainText('Imran Sheikh');
    await expect(page.getByTestId('map-legend')).not.toContainText('Pooja Verma');
    // Bengaluru is its own world: switching city resets the person
    await page.getByLabel('Territory', { exact: true }).selectOption('city:Bengaluru');
    await expect(page.getByTestId('ter-stat-outlets')).toContainText('96');
    await expect(page.getByLabel('Person', { exact: true })).toHaveValue('all');
    // the territory table also filters: its name is a control
    await page.getByRole('button', { name: 'Show Delhi Central only' }).click();
    await expect(page.getByTestId('ter-stat-outlets')).toContainText('48');
    await expect(page.getByLabel('Territory', { exact: true })).toHaveValue('ter_del_c');
  });

  test('the people table shows outlet coverage from the engine and never a ranking or a score', async ({ page }) => {
    await openHrms(page, TER);
    const t = page.getByTestId('people-table');
    for (const id of delhiReps) {
      const c = beatCoverage(ev, id, '2026-10');
      await expect(t.getByTestId(`cov-${id}`)).toHaveText(`${c.pct}% (${c.visited} of ${c.planned})`);
    }
    const order = await t.getByRole('button', { name: /^Show only/ }).allInnerTexts();
    expect(order.map((x) => x.trim())).toEqual([...order.map((x) => x.trim())].sort());
    await expect(t).not.toContainText(/score|rank/i);
    await page.getByRole('button', { name: 'Show only Gaurav Saxena' }).click();
    await expect(page.getByLabel('Person', { exact: true })).toHaveValue('emp_19');
    await expect(page.getByRole('heading', { name: /Beat plan: Gaurav Saxena/ })).toBeVisible();
  });

  test('the beat plan is six days of eight outlets, with visits per outlet, and follows the person', async ({ page }) => {
    await openHrms(page, TER);
    await expect(page.getByRole('heading', { name: 'Beat plan: Farhan Ali' })).toBeVisible();
    const act = E.outletActivity(ev, '2026-10');
    for (let d = 1; d <= 6; d++) {
      const day = page.getByTestId(`beat-day-${d}`);
      const outlets = E.beatPlan(ev, 'emp_20')[d]!;
      await expect(day.getByRole('listitem')).toHaveCount(8);
      await expect(day).toContainText(`8 outlets, ${outlets.filter((o) => (act.get(o.id)?.verified ?? 0) > 0).length} visited`);
    }
    const first = E.beatPlan(ev, 'emp_20')[1]![0]!;
    const v = act.get(first.id)?.verified ?? 0;
    await expect(page.getByTestId('beat-day-1').getByRole('button', { name: `Show ${first.name} on the map` }).first()).toContainText(v ? `${v} verified visit` : 'visit');
    await page.getByLabel('Person', { exact: true }).selectOption('emp_19');
    await expect(page.getByRole('heading', { name: 'Beat plan: Gaurav Saxena' })).toBeVisible();
    await expect(page.getByTestId('beat-day-3').getByRole('listitem')).toHaveCount(8);
  });

  test('dormant outlets are the planned outlets with no verified visit, tier A first, with their last verified visit', async ({ page }) => {
    await openHrms(page, TER);
    const card = page.getByTestId('dormant-card');
    const dormant = E.dormantOutlets(ev, '2026-10').filter((o) => delhiTerritories.includes(o.territoryId));
    await expect(card).toContainText(`${dormant.length} outlets, tier A first`);
    await expect(card.getByRole('row')).toHaveCount(dormant.length + 1);
    await expect(card.getByRole('row').nth(1)).toContainText('Tier A');
    const one = dormant[0]!;
    await expect(card.getByRole('row').filter({ hasText: one.name }).first()).toContainText(names[one.repId]!);
    await expect(card).toContainText('None since 1 Oct');
    await card.getByRole('button', { name: `Show ${one.name} on the map` }).first().click();
    await expect(page.getByTestId('outlet-panel')).toContainText(one.name);
    await expect(page.getByTestId('outlet-panel')).toContainText('Visits this month');
    // a person with full coverage has none
    await page.getByLabel('Person', { exact: true }).selectOption('emp_19');
    await expect(card).toContainText('Every planned outlet in view had a verified visit.');
  });

  test('overlaps name both outlets, both people and their days, with a suggestion; filtering to Gaurav finds Farhan', async ({ page }) => {
    await openHrms(page, TER);
    const rows = page.getByTestId('overlap-row');
    await expect(rows.first()).toContainText('m apart');
    await expect(rows.first()).toContainText('Suggested: move');
    await expect(page.getByTestId('overlap-card').getByRole('button', { name: /^Show all/ })).toBeVisible();
    await page.getByLabel('Person', { exact: true }).selectOption('emp_19');
    const mine = E.overlapViews(ev).filter((p) => p.repA === 'emp_19' || p.repB === 'emp_19');
    expect(mine.length).toBeGreaterThan(0);
    const showAll = page.getByTestId('overlap-card').getByRole('button', { name: /^Show all/ });
    if (mine.length > 4) await showAll.click();
    await expect(rows).toHaveCount(mine.length);
    for (let i = 0; i < mine.length; i++) await expect(rows.nth(i)).toContainText('Gaurav Saxena');
    const withFarhan = mine.filter((p) => [p.repA, p.repB].includes('emp_20'));
    expect(withFarhan.length).toBeGreaterThan(0);
    await expect(rows.filter({ hasText: 'Farhan Ali' })).toHaveCount(withFarhan.length);
    const nearest = withFarhan[0]!;
    await expect(rows.filter({ hasText: `${nearest.metres} m apart` }).first()).toContainText('Farhan Ali');
  });

  test('applying a suggested move reassigns the outlet; counts, coverage and the map follow, and it survives a reload', async ({ page }) => {
    await openHrms(page, TER);
    const pairs = E.overlapViews(ev).filter(touchesDelhi);
    const p = pairs[0]!;
    const s = p.suggestion;
    const outlet = ev.outlets.find((o) => o.id === s.moveOutletId)!;
    const moved = E.applyMoves(ev, { [s.moveOutletId]: { toRepId: s.toRepId, fromRepId: s.fromRepId, at: 'x', by: 'x' } });
    const overlapsAfter = E.overlapViews(moved).filter(touchesDelhi).length;

    const row = page.getByTestId('overlap-row').first();
    await row.getByRole('button', { name: /\(suggested\)/ }).click();
    await expect(page.getByTestId('ter-stat-moves')).toContainText('Shown on the map and in coverage');
    await expect(page.getByTestId('ter-stat-overlaps')).toContainText(String(overlapsAfter));
    const check = async () => {
      for (const id of [s.fromRepId, s.toRepId]) {
        const c = E.coverageFor(moved, id, '2026-10');
        await expect(page.getByTestId(`cov-${id}`)).toHaveText(`${c.pct}% (${c.visited} of ${c.planned})`);
      }
      await expect(page.getByTestId('people-table').getByRole('row').filter({ hasText: names[s.toRepId]! })).toContainText(String(E.coverageFor(moved, s.toRepId, '2026-10').planned));
    };
    await check();
    await page.getByLabel('Person', { exact: true }).selectOption(s.toRepId);
    await expect(page.getByRole('heading', { name: `Beat plan: ${names[s.toRepId]}` })).toBeVisible();
    await expect(page.getByTestId('beat-plan')).toContainText(`Moved from ${names[s.fromRepId]!.split(' ')[0]}`);
    await expect(page.getByTestId('beat-plan').getByRole('button', { name: `Show ${outlet.name} on the map` }).first()).toBeVisible();
    expect((await readStore<{ moves: Record<string, { toRepId: string; fromRepId: string }> }>(page, PAY_KEY)).moves[s.moveOutletId]).toMatchObject({ toRepId: s.toRepId, fromRepId: s.fromRepId });

    await page.reload();
    await expect(page.getByTestId('ter-stat-moves')).toContainText('Shown on the map and in coverage', slow);
    await check();
  });

  test('clicking an outlet shows it; it can be reassigned by hand and the move undone', async ({ page }) => {
    await openHrms(page, TER);
    const o = E.beatPlan(ev, 'emp_20')[2]![0]!;
    await page.getByTestId('beat-day-2').getByRole('button', { name: `Show ${o.name} on the map` }).first().click();
    const panel = page.getByTestId('outlet-panel');
    await expect(panel).toContainText(o.name);
    await expect(panel.getByTestId('outlet-owner')).toHaveText('Farhan Ali');
    await expect(panel).toContainText('Tue');
    // a click on the marker itself selects the same outlet
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('outlet-panel')).toHaveCount(0);
    await page.getByTestId('territory-plot').locator('g', { has: page.locator('title', { hasText: new RegExp(`^${o.name}, tier ${o.tier}, Farhan Ali,`) }) }).first().dispatchEvent('click');
    await expect(page.getByTestId('outlet-panel')).toContainText(o.name);

    await panel.getByLabel('Reassign this outlet to').selectOption('emp_22');
    await panel.getByRole('button', { name: 'Reassign outlet' }).click();
    await expect(panel.getByTestId('outlet-owner')).toHaveText('Yash Rathore');
    await expect(panel).toContainText('Moved from Farhan Ali by You (HR admin)');
    await expect(page.getByTestId('ter-stat-moves')).toContainText('Shown on the map and in coverage');
    await panel.getByRole('button', { name: 'Undo the move' }).click();
    await expect(panel.getByTestId('outlet-owner')).toHaveText('Farhan Ali');
    await expect(page.getByTestId('ter-stat-moves')).toContainText('None yet');
  });

  test('November is marked as part-month, and no sideways page scroll at 390px', async ({ page }) => {
    await openHrms(page, TER);
    await page.getByLabel('Month', { exact: true }).selectOption('2026-11');
    await expect(page.getByText(/November is in progress/)).toBeVisible();
    await expect(page.getByTestId('territory-table')).toContainText('Booked, Nov 2026');
    const c = E.territoryCoverage(ev, 'ter_del_s', '2026-11');
    await expect(page.getByTestId('territory-table').getByRole('row').filter({ hasText: 'Delhi South' })).toContainText(`${c.pct}% (${c.visited} of ${c.planned})`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('territory-plot')).toBeVisible();
    const box = await page.getByTestId('territory-plot').boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
  });
});

// ═════════════════════════════ Team health ═════════════════════════════
const TH = '/dashboard/hrms/team-health';
const delhiTeam = E.teamsOf(ev)[0]!;
const delhiWeeks = E.teamWeekly(ev, delhiTeam.empIds);
const delhiSum = E.teamSummary(ev, delhiTeam.empIds);

test.describe('team health page', () => {
  test('says what it is for, shows Delhi as team totals, and hides Bengaluru because it is under five people', async ({ page }) => {
    const errors = watch(page);
    await openHrms(page, TH);
    await expect(page.getByRole('heading', { name: 'Team health', level: 1 })).toBeVisible();
    const purpose = page.getByTestId('th-purpose');
    await expect(purpose).toContainText('Help managers rebalance beats before people burn out');
    await expect(purpose).toContainText('It is not used to rate individuals');
    await expect(purpose).toContainText('fewer than 5 people is not shown at all');
    const delhi = page.getByTestId('team-delhi');
    await expect(delhi).toContainText('6 people, team totals only');
    await expect(delhi.getByTestId('th-long')).toContainText(`${(delhiSum.longDayShare! * 100).toFixed(1)}%`);
    await expect(delhi.getByTestId('th-long')).toContainText(`${delhiSum.longDays} of ${delhiSum.spanDays} worked days`);
    await expect(delhi.getByTestId('th-span')).toContainText(`${num1(delhiSum.avgSpanH!)} h`);
    await expect(delhi.getByTestId('th-evening')).toContainText(String(delhiSum.eveningVisits));
    const oct = delhiSum.noPunchByMonth.find((m) => m.month === '2026-10')!;
    await expect(delhi.getByTestId('th-absence')).toContainText(`${num1(oct.perPerson)} per person`);
    await expect(delhi.getByTestId('th-rest')).toContainText(`${(delhiSum.restCoverage! * 100).toFixed(0)}%`);

    const blr = page.getByTestId('team-bengaluru');
    await expect(blr.getByTestId('team-bengaluru-hidden')).toHaveText('Not shown: fewer than 5 people, to protect privacy.');
    await expect(blr).toContainText('2 people');
    await expect(blr.getByRole('img')).toHaveCount(0);
    await expect(blr).not.toContainText(/Long days|Average day|per person|%/);
    await expect(page.locator('main')).not.toContainText(NO_RANKING);
    expect(errors).toEqual([]);
  });

  test('five small charts cover the weeks of October and early November, and the same numbers are in a table', async ({ page }) => {
    await openHrms(page, TH);
    const charts = page.getByTestId('th-charts');
    for (const id of ['chart-long', 'chart-span', 'chart-evening', 'chart-absence', 'chart-rest']) await expect(charts.getByTestId(id)).toBeVisible();
    await expect(charts.getByRole('img')).toHaveCount(5);
    await expect(charts.getByTestId('chart-long')).toHaveAttribute('aria-label', /28 Sep \(part week\)/);
    await expect(charts.getByTestId('chart-long')).toHaveAttribute('aria-label', /2 Nov \(part week\)/);
    await expect(charts.getByTestId('chart-rest')).toHaveAttribute('aria-label', /28 Sep \(part week\) not available/);
    await expect(charts.getByTestId('chart-rest')).toHaveAttribute('aria-label', /5 Oct 83%/);
    await expect(charts.getByTestId('chart-span').locator('line[stroke-dasharray]')).toHaveCount(1);   // the 10-hour mark
    expect(await charts.getByTestId('chart-evening').locator('rect').count()).toBe(6);

    await page.getByTestId('th-table').getByText('Show the numbers as a table').click();
    const table = page.getByTestId('th-table').getByRole('table');
    await expect(table.getByRole('row')).toHaveCount(delhiWeeks.length + 1);
    for (const [i, w] of delhiWeeks.entries()) {
      const row = table.getByRole('row').nth(i + 1);
      await expect(row).toContainText(fmtDate(w.weekStart));
      await expect(row).toContainText(String(w.workedDays));
      await expect(row).toContainText(w.restCoverage != null ? `${(w.restCoverage * 100).toFixed(0)}%` : 'n/a');
      if (!w.fullWeek) await expect(row).toContainText('part week');
    }
    await expect(page.getByTestId('team-delhi')).toContainText('A star marks a part week');
  });

  test('no person appears anywhere in the wellbeing cards: no names, no ranking, no score', async ({ page }) => {
    await openHrms(page, TH);
    await page.getByTestId('th-table').getByText('Show the numbers as a table').click();
    const text = await page.getByTestId('team-delhi').innerText();
    const bengaluru = await page.getByTestId('team-bengaluru').innerText();
    for (const id of repIds) {
      expect(text).not.toContain(names[id]!);
      expect(bengaluru).not.toContain(names[id]!);
      expect(text).not.toContain(names[id]!.split(' ')[0]!);
    }
    expect(text).toContain('No names, no ranking and no score for any person');
    expect(text).not.toMatch(/emp_\d/);
    for (const label of await page.getByTestId('th-charts').getByRole('img').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))) {
      for (const id of repIds) expect(label).not.toContain(names[id]!.split(' ')[0]!);
    }
    await expect(page.getByTestId('team-delhi').getByRole('link')).toHaveCount(0);
  });

  test('weekly-off compliance names the person with the run of days, tags the rule as reported and sends the reader to the advisor', async ({ page }) => {
    await openHrms(page, TH);
    const card = page.getByTestId('weekly-off');
    await expect(card).toContainText('Names shown to HR');
    await expect(card).toContainText('Reported, confirm');
    await expect(card).toContainText('This card is about the law, not wellbeing');
    await expect(card).toContainText("Shops & Establishments rule and the Labour Codes position with the advisor");
    await expect(card).toContainText('a sample setting, not a legal finding');
    const streak = E.allRestStreaks(ev)[0]!;
    const row = card.getByRole('row').filter({ hasText: 'Imran Sheikh' });
    await expect(card.getByRole('row')).toHaveCount(2);   // header and one person
    await expect(row.getByTestId('streak-days-emp_6')).toHaveText(String(streak.days));
    await expect(row).toContainText('Mon 5 Oct 2026');
    await expect(row).toContainText(`Sun ${Number(streak.to.slice(8))} Oct 2026`);
    await expect(row).toContainText('None yet');
    await expect(card.getByRole('link', { name: 'Time & leave' })).toHaveAttribute('href', '/dashboard/hrms/time');
  });

  test('Schedule a rest day records a note, says it does not change the roster, and keeps it after a reload', async ({ page }) => {
    await openHrms(page, TH);
    await page.getByRole('button', { name: 'Schedule a rest day for Imran Sheikh' }).click();
    const dlg = page.getByRole('dialog', { name: 'Schedule a rest day for Imran Sheikh' });
    await expect(dlg).toContainText('It does not change the roster or attendance');
    await dlg.getByLabel('Rest day').fill('2026-11-05');
    await dlg.getByRole('button', { name: 'Save note' }).click();
    await expect(dlg.getByText('Choose a date after today.')).toBeVisible();
    await dlg.getByLabel('Rest day').fill('2026-11-09');
    await dlg.getByLabel('Note (optional)').fill('Agreed with Rohit as a compensatory day');
    await dlg.getByRole('button', { name: 'Save note' }).click();
    await expect(dlg).toBeHidden();

    const notes = page.getByTestId('rest-notes');
    await expect(notes).toContainText('Imran Sheikh: rest day noted for Mon 9 Nov 2026');
    await expect(notes).toContainText('Agreed with Rohit as a compensatory day');
    await expect(notes).toContainText('This is a note only. It does not change the roster.');
    await expect(page.getByTestId('weekly-off').getByRole('row').filter({ hasText: 'Imran Sheikh' })).toContainText('9 Nov 2026');
    const stored = await readStore<{ restNotes: { employeeId: string; date: string; note: string }[] }>(page, PAY_KEY);
    expect(stored.restNotes).toHaveLength(1);
    expect(stored.restNotes[0]).toMatchObject({ employeeId: 'emp_6', date: '2026-11-09' });

    // the same day cannot be noted twice
    await page.getByRole('button', { name: 'Schedule a rest day for Imran Sheikh' }).click();
    await page.getByRole('dialog').getByLabel('Rest day').fill('2026-11-09');
    await page.getByRole('dialog').getByRole('button', { name: 'Save note' }).click();
    await expect(page.getByRole('dialog').getByText('A note for that day already exists.')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await page.reload();
    await expect(page.getByTestId('rest-notes')).toContainText('rest day noted for Mon 9 Nov 2026', slow);
    await page.getByRole('button', { name: /Remove the rest-day note for Imran Sheikh/ }).click();
    await expect(page.getByTestId('rest-notes')).toHaveCount(0);
    expect((await readStore<{ restNotes: unknown[] }>(page, PAY_KEY)).restNotes).toHaveLength(0);
  });

  test('no sideways page scroll at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHrms(page, TH);
    await expect(page.getByTestId('th-charts')).toBeVisible();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const svg = await page.getByTestId('chart-long').boundingBox();
    expect(svg!.width).toBeLessThanOrEqual(390);
    await page.getByRole('button', { name: 'Schedule a rest day for Imran Sheikh' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
});
