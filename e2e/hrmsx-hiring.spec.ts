import { test, expect, type Page } from '@playwright/test';
import { openHrms } from './hrms-utils';
import { makeSeed, PREVIEW_TODAY } from '../src/lib/hrms/seed';
import { buildBreakup } from '../src/lib/hrms/engine';
import { inr, inrShort } from '../src/lib/hrms/format';
import { getFieldEvidence } from '../src/lib/hrms/field/evidence';
import { makeHiringSeed } from '../src/lib/hrms/hiring/seed';
import type { HiringState, Review } from '../src/lib/hrms/hiring/types';
import * as E from '../src/lib/hrms/hiring/engines';
import * as P from '../src/lib/hrms/hiring/perfEngines';

/**
 * Talent area: Recruitment, Workforce planning, Performance. Two kinds of test:
 *  - pure checks of the engines behind the screens (no browser), and
 *  - browser flows on the seeded sample data, with the numbers on screen compared with the engines run on the same data.
 */

const AREA_KEY = 'kinematic_hrms_area_hiring_v1';
const DB_KEY = 'kinematic_hrms_preview_v3';
const readArea = (page: Page): Promise<HiringState> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), AREA_KEY);
const readDb = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), DB_KEY);

const seed = makeHiringSeed();
const core = makeSeed();
const today = PREVIEW_TODAY;
const months = E.fiscalMonths();
const planInput = (h = seed): E.PlanInput => ({ plan: h.plan, employees: core.employees, openings: h.openings, today });
const room = (id: string, h = seed) => {
  const o = h.openings.find((x) => x.id === id)!;
  return E.headcountRoom(o, { plan: h.plan, employees: core.employees, openings: h.openings, fyEnd: E.FY_END }, { department: o.departmentId, location: o.locationId, fyEndLabel: 'Mar 2027' });
};
const review = (emp: string): Review => structuredClone(seed.reviews.find((r) => r.employeeId === emp)!);

/** Fail on uncaught page errors and on console errors (React and hydration problems land here). Resource and font loads are not ours. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|fonts\.g|favicon|ERR_/.test(m.text())) errors.push(m.text()); });
  return errors;
}
/** No ancestor of the tab panel is wider than its box: the page itself does not scroll sideways. */
async function expectNoSideScroll(page: Page) {
  const r = await page.evaluate(() => {
    const issues: string[] = [];
    let el: HTMLElement | null = document.querySelector('[role=tabpanel]') as HTMLElement | null;
    while (el) { if (el.scrollWidth > el.clientWidth + 1) issues.push(`${el.tagName}.${el.className}:${el.scrollWidth}>${el.clientWidth}`); el = el.parentElement; }
    return { issues, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
  });
  expect(r.issues).toEqual([]);
  expect(r.sw).toBeLessThanOrEqual(r.iw + 1);
}

test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });
test.describe.configure({ timeout: 150_000 });

const REC = '/dashboard/hrms/recruitment';
const WFP = '/dashboard/hrms/workforce-planning';
const PERF = '/dashboard/hrms/performance';

// ═════════════════════════════ pure logic: recruitment ═════════════════════════════
test.describe('recruitment engine', () => {
  test('the seed is consistent: stages match history, nothing is dated after today, no photo, age or gender is kept', () => {
    expect(seed.openings).toHaveLength(7);
    expect(seed.candidates).toHaveLength(25);
    for (const c of seed.candidates) {
      expect(c.history[0]!.to, c.id).toBe('applied');
      expect(c.history[c.history.length - 1]!.to, c.id).toBe(c.stage);
      const dates = c.history.map((h) => h.on);
      expect([...dates].sort(), c.id).toEqual(dates);
      expect(dates[dates.length - 1]! <= today, c.id).toBe(true);
      expect(Object.keys(c).filter((k) => /photo|^dob|^age$|gender|birth/i.test(k)), c.id).toEqual([]);
      if (c.stage === 'rejected') expect(c.rejectReason, c.id).toBeTruthy();
      expect(/^[6-9]\d{9}$/.test(c.mobile), c.id).toBe(true);
    }
    const hired = seed.candidates.filter((c) => c.stage === 'hired');
    expect(hired.map((c) => c.convertedEmployeeId).sort()).toEqual(['emp_24', 'emp_25']);
    for (const c of hired) {
      expect(c.offer?.status).toBe('accepted');
      expect(core.employees.find((e) => e.id === c.convertedEmployeeId)?.status).toBe('onboarding');
    }
    expect(new Set(seed.candidates.map((c) => c.source))).toEqual(new Set(['referral', 'job_board', 'agency', 'campus', 'linkedin']));
  });

  test('approved headcount: seats free = plan at year end minus people there or joining minus seats other live openings hold', () => {
    const ase = room('open_ase_del');
    expect(ase).toMatchObject({ approved: 9, committed: 5, otherUnfilled: 0, room: 4, need: 2, ok: true });
    const wh = room('open_wh_mum');
    expect(wh).toMatchObject({ approved: 5, committed: 4, room: 1, need: 3, ok: false });
    expect(wh.message).toContain('needs 3');
    expect(wh.message).toContain('Workforce planning');
    // an opening that fills seats already counts the joiner as committed, so it is not counted twice
    expect(room('open_swe_blr')).toMatchObject({ committed: 3, need: 1, room: 2, ok: true });
  });

  test('raising the plan lifts the block; another live opening in the same place uses up the room; no plan line means nothing is approved', () => {
    const h = structuredClone(seed);
    h.plan.lines.find((l) => l.id === 'dep_wh|loc_mum')!.months['2027-03'] = 7;
    expect(room('open_wh_mum', h).ok).toBe(true);

    const g = structuredClone(seed);
    const wh = g.openings.find((o) => o.id === 'open_wh_mum')!;
    wh.headcount = 1;
    g.openings.push({ ...structuredClone(wh), id: 'wh2', status: 'open' });
    expect(room('open_wh_mum', g)).toMatchObject({ otherUnfilled: 1, room: 0, ok: false });

    const n = structuredClone(seed);
    n.openings.push({ ...structuredClone(n.openings[0]!), id: 'nolines', departmentId: 'dep_hr', locationId: 'loc_mum', status: 'draft' });
    const none = room('nolines', n);
    expect(none.hasLine).toBe(false);
    expect(none.ok).toBe(false);
    expect(none.message).toContain('no line');
  });

  test('opening age counts from the day it went live, and stops on the day it filled', () => {
    const age = (id: string) => E.openingAge(seed.openings.find((o) => o.id === id)!, today);
    expect(age('open_ase_del')).toBe(40);   // 28 Sep to 7 Nov
    expect(age('open_ops_del')).toBe(110);
    expect(age('open_acc_del')).toBe(49);   // 1 Sep to 20 Oct, then it stops
    expect(age('open_hr_del')).toBe(2);     // draft: from creation
  });

  test('stage moves: Hired needs an accepted offer, rejection needs a reason, an open offer must be answered, an employee is final', () => {
    const c = (id: string) => structuredClone(seed.candidates.find((x) => x.id === id)!);
    const interview = c('cand_02');
    expect(E.canMove(interview, 'hired')).toMatchObject({ ok: false });
    expect(E.canMove(interview, 'hired').reason).toContain('accepted');
    expect(E.canMove(interview, 'offer').ok).toBe(true);
    expect(E.canMove(interview, 'rejected')).toMatchObject({ ok: true, needsReason: true });
    expect(E.canMove(interview, 'interview').ok).toBe(false);

    const offerOut = c('cand_01');                       // offer extended, waiting for an answer
    expect(E.canMove(offerOut, 'rejected').ok).toBe(false);
    expect(E.canMove(offerOut, 'screen').ok).toBe(false);
    offerOut.offer!.status = 'accepted';
    expect(E.canMove(offerOut, 'hired').ok).toBe(true);

    const rejected = c('cand_04');
    expect(E.canMove(rejected, 'interview').ok).toBe(false);
    expect(E.canMove(rejected, 'applied').ok).toBe(true);

    expect(E.canMove(c('cand_11'), 'offer')).toMatchObject({ ok: false });   // already an employee
    expect(E.nextStage('screen')).toBe('interview');
    expect(E.nextStage('hired')).toBeNull();
    expect(E.prevStage('applied')).toBeNull();
  });

  test('scorecards: averages per round, rounds side by side, a missing competency stays empty, and nothing decides', () => {
    const c = seed.candidates.find((x) => x.id === 'cand_01')!;
    const m = E.scorecardMatrix(c.scorecards);
    expect(m.averages).toEqual([3.8, 3.8, 4.3]);
    expect(m.competencies).toEqual(['Role knowledge', 'Communication', 'Problem solving', 'Ownership', 'Teamwork', 'Learning agility']);
    expect(m.cells[m.competencies.indexOf('Teamwork')]).toEqual([null, 4, null]);
    expect(m.cells[m.competencies.indexOf('Role knowledge')]).toEqual([4, 4, 4]);
    expect(E.candidateAverage(c)).toEqual({ average: 4.0, rounds: 3 });
    expect(E.candidateAverage(seed.candidates.find((x) => x.id === 'cand_05')!)).toEqual({ average: null, rounds: 0 });
    expect(Object.keys(E).filter((k) => /recommend|decide|verdict|shortlist|autoreject/i.test(k))).toEqual([]);
    expect(E.validateScorecard({ round: 'Phone screen', interviewerId: 'emp_1', ratings: [{ competency: 'Ownership', rating: 6 }] })[0]).toContain('1 to 5');
    expect(E.validateScorecard({ round: 'Phone screen', interviewerId: 'emp_1', ratings: [] })[0]).toContain('at least one');
  });

  test('offer breakup is the payroll engine itself, and a structure with a low basic fails the 50% wages rule', () => {
    const field = core.structures.find((s) => s.id === 'str_field')!;
    const office = core.structures.find((s) => s.id === 'str_std')!;
    const v = E.offerBreakup(field, 600000, '2026-12-07');
    expect(v.breakup).toEqual(buildBreakup(field, 600000, { asOn: '2026-12-07', pfMember: true }));
    expect(v.wageOk).toBe(false);
    expect(v.breakup!.wageTest.addBack).toBeGreaterThan(0);
    expect(v.breakup!.wageTest.wagePct).toBeCloseTo(35, 0);
    expect(E.offerBreakup(office, 600000, '2026-12-07').wageOk).toBe(true);
    expect(E.offerBreakup(undefined, 600000, '2026-12-07')).toEqual({ breakup: null, wageOk: null, warnings: [] });
    expect(E.offerBreakup(office, 0, '2026-12-07').breakup).toBeNull();
  });

  test('offer checks: positive CTC, a joining date that is not in the past, a structure; band is a warning, not a block', () => {
    const o = seed.openings.find((x) => x.id === 'open_ase_del')!;
    expect(E.validateOffer({ ctc: 0, joiningDate: '2026-12-01', structureId: 'str_std' }, o, today).errors[0]).toContain('CTC');
    expect(E.validateOffer({ ctc: 600000, joiningDate: '2026-11-01', structureId: 'str_std' }, o, today).errors[0]).toContain('past');
    expect(E.validateOffer({ ctc: 600000, joiningDate: '2026-12-01', structureId: '' }, o, today).errors[0]).toContain('structure');
    const high = E.validateOffer({ ctc: 900000, joiningDate: '2026-12-01', structureId: 'str_std' }, o, today);
    expect(high.errors).toEqual([]);
    expect(high.warnings[0]).toContain('above the top');
  });

  test('opening validation catches the obvious mistakes', () => {
    const base = { title: 'x', departmentId: 'd', locationId: 'l', designationId: 'g', headcount: 2, bandMin: 3, bandMax: 5, hiringManagerId: 'm', filled: 0 };
    expect(E.validateOpening(base).errors).toEqual([]);
    expect(E.validateOpening({ ...base, headcount: 0 }).errors[0]).toContain('Headcount');
    expect(E.validateOpening({ ...base, headcount: 1, filled: 2 }).errors[0]).toContain('already filled');
    expect(E.validateOpening({ ...base, bandMax: 2 }).errors[0]).toContain('top of the band');
    expect(E.validateOpening({ ...base, title: ' ' }).errors[0]).toContain('title');
  });

  test('insights: time to hire, funnel, source effectiveness, offer accept rate and open positions by age', () => {
    const x = E.hiringInsights(seed.candidates, seed.openings, today);
    expect(x.timeToHire).toMatchObject({ count: 2, average: 42.5, median: 42.5 });
    expect(x.timeToHire.items.map((i) => i.days).sort()).toEqual([38, 47]);
    expect(x.funnel.map((f) => f.reached)).toEqual([25, 21, 12, 4, 2]);
    expect(x.funnel[1]!.stepConversion).toBe(84);
    expect(x.funnel[4]!.pctOfApplied).toBe(8);
    expect(x.offers).toMatchObject({ extended: 4, accepted: 2, declined: 1, waiting: 1, acceptRate: 66.7 });
    const referral = x.sources.find((s) => s.source === 'referral')!;
    expect(referral).toMatchObject({ applicants: 7, hired: 1, hireRate: 14.3 });
    expect(x.sources.reduce((s, r) => s + r.applicants, 0)).toBe(25);
    expect(x.rejections.reduce((s, r) => s + r.count, 0)).toBe(seed.candidates.filter((c) => c.stage === 'rejected').length);
    expect(x.age.map((a) => a.seats)).toEqual([1, 2, 1, 1]);
    expect(x.age.reduce((s, a) => s + a.seats, 0)).toBe(5);   // every unfilled seat on a live opening is in exactly one bucket
  });

  test('insights recompute from the data: an accepted offer and a hire change the numbers', () => {
    const c = structuredClone(seed.candidates);
    const nik = c.find((x) => x.id === 'cand_01')!;
    nik.offer!.status = 'accepted'; nik.offer!.decidedOn = today;
    nik.stage = 'hired'; nik.history.push({ from: 'offer', to: 'hired', on: today, by: 'x' });
    const x = E.hiringInsights(c, seed.openings, today);
    expect(x.offers).toMatchObject({ accepted: 3, declined: 1, acceptRate: 75 });
    expect(x.timeToHire.count).toBe(3);
    expect(x.funnel[4]!.reached).toBe(3);
  });
});

// ═════════════════════════════ pure logic: workforce planning ═════════════════════════════
test.describe('workforce planning engine', () => {
  test('headcount on a date: joiners in onboarding are left out until asked for, leavers count up to their last day', () => {
    expect(E.headcountOn(core.employees, today)).toBe(22);
    expect(E.headcountOn(core.employees, '2026-04-30')).toBe(23);            // Deepa Pillai was still here
    expect(E.headcountOn(core.employees, '2026-09-30')).toBe(23);            // her last working day
    expect(E.headcountOn(core.employees, '2026-10-01')).toBe(22);
    expect(E.headcountOn(core.employees, '2026-11-30', {}, true)).toBe(24);  // two joiners, Yash Rathore's last day
    expect(E.headcountOn(core.employees, '2026-12-01', {}, true)).toBe(23);
    expect(E.headcountOn(core.employees, today, { departmentId: 'dep_sales' })).toBe(9);
    expect(E.headcountOn(core.employees, today, { locationId: 'loc_mum' })).toBe(5);
  });

  test('plan vs actual by month: actual stops at today, committed carries on, gap is negative when short', () => {
    const s = E.monthlySeries(planInput(), {}, months);
    const by = (m: string) => s.find((p) => p.month === m)!;
    expect(by('2026-04')).toMatchObject({ plan: 23, actual: 23, committed: 23, gap: 0 });
    expect(by('2026-10')).toMatchObject({ plan: 27, actual: 22, gap: -5 });
    expect(by('2026-11')).toMatchObject({ plan: 29, actual: 22, committed: 24, gap: -7, basis: 'actual' });
    expect(by('2026-12')).toMatchObject({ plan: 31, actual: null, committed: 23, gap: -8, basis: 'committed' });
    expect(by('2027-03').plan).toBe(34);
    // by department and by location add up to the company
    for (const m of ['2026-06', '2026-11', '2027-02']) {
      const dep = ['dep_sales', 'dep_ops', 'dep_fin', 'dep_hr', 'dep_wh', 'dep_tech'].reduce((t, d) => t + E.monthlySeries(planInput(), { departmentId: d }, [m])[0]!.plan, 0);
      const loc = ['loc_del', 'loc_blr', 'loc_mum'].reduce((t, d) => t + E.monthlySeries(planInput(), { locationId: d }, [m])[0]!.plan, 0);
      expect(dep).toBe(by(m).plan);
      expect(loc).toBe(by(m).plan);
    }
  });

  test('open seats are approved seats on live openings that are still unfilled', () => {
    expect(E.openSeats(seed.openings, {})).toBe(5);
    expect(E.openSeats(seed.openings, { departmentId: 'dep_sales' })).toBe(3);
    expect(E.openSeats(seed.openings, { departmentId: 'dep_wh' })).toBe(0);   // pending approval is not approved yet
    const rows = E.groupRows(planInput(), 'department', '2026-11', ['dep_sales', 'dep_wh']);
    expect(rows.find((r) => r.key === 'dep_sales')).toMatchObject({ plan: 12, actual: 9, gap: -3, openSeats: 3 });
  });

  test('budget: planned = headcount x planned average CTC / 12, projected = actual + committed + open positions at the band middle', () => {
    const b = E.budgetFigures(planInput(), seed.openStartMonth, months);
    const planned = seed.plan.lines.reduce((t, l) => t + months.reduce((s, m) => s + (l.months[m]! * seed.plan.avgCtc[l.departmentId]!) / 12, 0), 0);
    expect(b.plannedFy).toBeCloseTo(planned, 4);
    expect(b.monthsElapsed).toBe(8);
    expect(b.runRate).toBe(15574000);       // annual CTC of the 22 people on the payroll today
    expect(b.openCostAnnual).toBe(2 * 570000 + 320000 + 1500000 + 350000);
    expect(b.openSeats).toBe(5);
    expect(b.openCostFy).toBeCloseTo((b.openCostAnnual / 12) * 3, 4);        // Jan, Feb, Mar
    expect(b.projectedWithHire).toBeCloseTo(b.projectedNoHire + b.openCostFy, 4);
    expect(b.varianceVsPlan).toBeCloseTo(b.projectedWithHire - b.plannedFy, 4);
    const sumMonthly = b.monthly.reduce((t, m) => t + m.cost, 0);
    expect(sumMonthly).toBeCloseTo(b.projectedWithHire, 4);
    // starting open positions later costs less
    const later = E.budgetFigures(planInput(), '2027-03', months);
    expect(later.openCostFy).toBeCloseTo(b.openCostAnnual / 12, 4);
    expect(later.projectedWithHire).toBeLessThan(b.projectedWithHire);
  });

  test('budget by department adds up to the company', () => {
    const all = E.budgetFigures(planInput(), seed.openStartMonth, months);
    const deps = ['dep_sales', 'dep_ops', 'dep_fin', 'dep_hr', 'dep_wh', 'dep_tech'].map((d) => E.budgetFigures(planInput(), seed.openStartMonth, months, { departmentId: d }));
    expect(deps.reduce((t, x) => t + x.plannedFy, 0)).toBeCloseTo(all.plannedFy, 3);
    expect(deps.reduce((t, x) => t + x.actualToDate, 0)).toBeCloseTo(all.actualToDate, 3);
    expect(deps.reduce((t, x) => t + x.openCostAnnual, 0)).toBeCloseTo(all.openCostAnnual, 3);
  });

  test('attrition: the rolling rate follows the overview formula, and an exit case with no employee flag is still counted once', () => {
    const recs = E.exitRecords(core.employees, core.exits, today);
    expect(recs.map((r) => [r.employeeId, r.kind])).toEqual([['emp_23', 'left'], ['emp_22', 'serving']]);   // Yash is in both the employee list and an exit case: one record
    const series = E.attritionSeries(core.employees, recs, months, today);
    const nov = series.find((p) => p.month === '2026-11')!;
    const yearAgo = '2025-11-07';
    const hc = (on: string) => core.employees.filter((e) => e.status !== 'onboarding' && e.joinDate <= on && (e.lastWorkingDate ? e.lastWorkingDate >= on : e.status !== 'exited')).length;
    const leavers12 = core.employees.filter((e) => e.status === 'exited' && e.lastWorkingDate && e.lastWorkingDate > yearAgo).length;
    expect(nov.exits12).toBe(leavers12);
    expect(nov.openingHc).toBe(hc(yearAgo));
    expect(nov.closingHc).toBe(hc(today));
    expect(nov.rate).toBe(Math.round((leavers12 / ((hc(yearAgo) + hc(today)) / 2)) * 1000) / 10);
    expect(nov.rate).toBe(4.5);
    expect(series.find((p) => p.month === '2026-09')).toMatchObject({ left: 1, serving: 0 });
    expect(series.find((p) => p.month === '2026-11')).toMatchObject({ left: 0, serving: 1 });
    expect(series.find((p) => p.month === '2026-12')!.rate).toBeNull();     // the future has no rate

    const db = structuredClone(core);
    db.exits.push({ id: 'x', employeeId: 'emp_10', reason: 'resignation', resignationDate: today, lastWorkingDate: '2026-12-15', noticeWaived: false, stage: 'notice', clearance: [], assets: [], interviewDone: false });
    const r2 = E.exitRecords(db.employees, db.exits, today);
    expect(r2).toHaveLength(3);
    expect(r2.find((r) => r.employeeId === 'emp_10')).toMatchObject({ kind: 'serving', lastWorkingDate: '2026-12-15' });
  });

  test('scenarios: hires add, attrition takes out a twelfth of the annual rate, cost is month-end headcount x CTC / 12', () => {
    const grow = E.projectScenario({ hiresPerMonth: 1, attritionPct: 0, avgCtc: 1_200_000 }, 24, '2026-11', '2027-03', 1000);
    expect(grow.rows.map((r) => r.headcount)).toEqual([25, 26, 27, 28]);
    expect(grow.rows.map((r) => r.cost)).toEqual([2_500_000, 2_600_000, 2_700_000, 2_800_000]);
    expect(grow.endHeadcount).toBe(28);
    expect(grow.costToEnd).toBe(10_600_000);
    expect(grow.fyTotal).toBe(10_601_000);

    const freeze = E.projectScenario({ hiresPerMonth: 0, attritionPct: 12, avgCtc: 1_200_000 }, 24, '2026-11', '2027-03', 0);
    expect(freeze.rows[0]).toMatchObject({ month: '2026-12', exits: 0.2, hires: 0 });   // 24 x 12% / 12 = 0.24, shown to one decimal
    expect(freeze.rows[0]!.headcount).toBe(23.8);
    expect(freeze.endHeadcount).toBeLessThan(24);
    expect(E.projectScenario({ hiresPerMonth: 0, attritionPct: 0, avgCtc: 1 }, 24, '2026-11', '2026-11', 0).rows).toEqual([]);

    const more = E.projectScenario({ hiresPerMonth: 2, attritionPct: 10, avgCtc: 760000 }, 24, '2026-11', '2027-03', 0);
    const base = E.projectScenario({ hiresPerMonth: 1, attritionPct: 8, avgCtc: 710000 }, 24, '2026-11', '2027-03', 0);
    expect(more.endHeadcount).toBeGreaterThan(base.endHeadcount);
    expect(more.costToEnd).toBeGreaterThan(base.costToEnd);
  });

  test('scenario checks', () => {
    expect(E.validateScenario({ name: 'x', hiresPerMonth: 1, attritionPct: 8, avgCtc: 700000 })).toEqual([]);
    expect(E.validateScenario({ name: ' ', hiresPerMonth: 1, attritionPct: 8, avgCtc: 700000 })[0]).toContain('name');
    expect(E.validateScenario({ name: 'x', hiresPerMonth: -1, attritionPct: 8, avgCtc: 700000 })[0]).toContain('Hires');
    expect(E.validateScenario({ name: 'x', hiresPerMonth: 1, attritionPct: 140, avgCtc: 700000 })[0]).toContain('Attrition');
    expect(E.validateScenario({ name: 'x', hiresPerMonth: 1, attritionPct: 8, avgCtc: 10 })[0]).toContain('Average CTC');
  });
});

// ═════════════════════════════ pure logic: performance ═════════════════════════════
test.describe('performance engine', () => {
  test('key result progress works up and down, and is held between 0 and 100', () => {
    expect(P.krProgress({ start: 0, target: 100, current: 40 })).toBe(40);
    expect(P.krProgress({ start: 12, target: 7, current: 9 })).toBe(60);       // lower is better: days to close the books
    expect(P.krProgress({ start: 0, target: 100, current: 250 })).toBe(100);
    expect(P.krProgress({ start: 10, target: 100, current: 5 })).toBe(0);
    expect(P.krProgress({ start: 5, target: 5, current: 5 })).toBe(100);
    const g = { keyResults: [{ id: 'a', title: '', unit: 'count' as const, start: 0, target: 10, current: 10, weight: 60 }, { id: 'b', title: '', unit: 'count' as const, start: 0, target: 10, current: 0, weight: 40 }] };
    expect(P.goalProgress(g)).toBe(60);
  });

  test('status comes from progress against time passed: within 10 points on track, to 25 at risk, then behind', () => {
    expect(P.statusFor(50, 50)).toBe('on_track');
    expect(P.statusFor(40, 50)).toBe('on_track');
    expect(P.statusFor(39, 50)).toBe('at_risk');
    expect(P.statusFor(25, 50)).toBe('at_risk');
    expect(P.statusFor(24, 50)).toBe('behind');
    expect(P.statusFor(100, 20)).toBe('done');
    const goal = seed.goals.find((g) => g.id === 'g_emp_3_1')!;
    expect(P.timeElapsed(goal, today)).toBe(60.4);                  // 1 Apr to 7 Nov of a year to 31 Mar
    expect(P.goalStatus(goal, today)).toMatchObject({ progress: 60, status: 'on_track' });
    expect(P.goalStatus(seed.goals.find((g) => g.id === 'g_emp_5_2')!, today).status).toBe('behind');
    expect(P.goalStatus(seed.goals.find((g) => g.id === 'g_emp_3_2')!, today).status).toBe('at_risk');
    expect(P.goalStatus(goal, '2026-03-01').status).toBe('not_started');
  });

  test('field goals use the field incentive plan numbers, read from the evidence and not copied', () => {
    const ev = getFieldEvidence();
    for (const rep of ev.reps) {
      const goals = seed.goals.filter((g) => g.employeeId === rep.employeeId);
      if (rep.employeeId === 'emp_22') { expect(goals).toHaveLength(0); continue; }   // Yash Rathore is on notice and not in the cycle
      const rev = goals.find((g) => g.title === 'Reach the Q3 revenue target')!.keyResults[0]!;
      const monthly = ev.targets.find((t) => t.employeeId === rep.employeeId && t.month === '2026-10')!;
      expect(rev.target, rep.employeeId).toBe(monthly.revenue * 3);
      const booked = ev.deals.filter((d) => d.employeeId === rep.employeeId && d.status === 'won' && d.closedOn >= '2026-10-01' && d.closedOn <= ev.to).reduce((s, d) => s + d.value, 0);
      expect(rev.current, rep.employeeId).toBe(booked);
      expect(goals.find((g) => g.title === 'Collect what we bill')!.keyResults[0]!.target).toBe(ev.plan.minCollectionPct);
    }
    expect(seed.goals.filter((g) => ['emp_4', 'emp_6', 'emp_7', 'emp_8', 'emp_9', 'emp_19', 'emp_20'].includes(g.employeeId))).toHaveLength(14);
    expect(new Set(seed.goals.map((g) => g.employeeId)).size).toBe(13);
  });

  test('team roll-up counts goals by status per manager and averages the people\'s progress', () => {
    const reports = Object.fromEntries(seed.reviews.map((r) => [r.employeeId, r.managerId]));
    const rolls = P.teamRollups(seed.goals, reports, today);
    const rohit = rolls.find((r) => r.managerId === 'emp_4')!;
    expect(rohit).toMatchObject({ people: 4, withGoals: 4 });
    expect(Object.values(rohit.counts).reduce((s, n) => s + n, 0)).toBe(8);
    const avg = ['emp_6', 'emp_7', 'emp_19', 'emp_20'].reduce((t, e) => t + P.personProgress(seed.goals.filter((g) => g.employeeId === e)), 0) / 4;
    expect(rohit.progress).toBeCloseTo(avg, 0);
    expect(P.weightTotal(seed.goals.filter((g) => g.employeeId === 'emp_3'))).toBe(100);
  });

  test('a progress update sets the current value and keeps the comment; a number and a comment are both required', () => {
    const g = structuredClone(seed.goals.find((x) => x.id === 'g_emp_5_2')!);
    const kr = g.keyResults[0]!;
    const bad = P.applyProgress(g, kr.id, 70, '  ', today, 'x', 'u1');
    expect(bad.ok).toBe(false);
    expect(P.applyProgress(g, kr.id, NaN, 'ok', today, 'x', 'u1').ok).toBe(false);
    const good = P.applyProgress(g, kr.id, 72, ' Reviews are now automatic ', today, 'x', 'u1');
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.goal.keyResults[0]!.current).toBe(72);
      expect(good.goal.updates[0]).toMatchObject({ value: 72, comment: 'Reviews are now automatic', on: today });
      expect(P.goalStatus(good.goal, today).status).toBe('on_track');
    }
    expect(P.validateGoal({ title: '', weight: 50, startDate: '2026-04-01', dueDate: '2027-03-31', keyResults: [] })).toEqual(expect.arrayContaining([expect.stringContaining('objective'), expect.stringContaining('key result')]));
  });

  test('visibility: the employee reads the manager review only after it is submitted; a manager reads the self review after it is submitted', () => {
    const r = review('emp_14');                                    // self submitted, manager review not started
    expect(P.canSeeManagerReview(r, 'employee')).toBe(false);
    expect(P.canSeeManagerReview(r, 'manager')).toBe(true);
    expect(P.canSeeManagerReview(r, 'hr')).toBe(true);
    expect(P.canSeeSelf(r, 'manager')).toBe(true);
    const s = review('emp_21');                                    // nothing submitted
    expect(P.canSeeSelf(s, 'manager')).toBe(false);
    expect(P.canSeeSelf(s, 'employee')).toBe(true);
    expect(P.canSeeSelf(s, 'hr')).toBe(true);
    const done = review('emp_6');                                  // both submitted
    expect(P.canSeeManagerReview(done, 'employee')).toBe(true);
  });

  test('a review is editable only by its author, only until it is submitted, and submit needs a complete form', () => {
    let r = review('emp_14');
    expect(P.canEditForm(r, 'manager', 'employee')).toBe(false);
    expect(P.canEditForm(r, 'manager', 'hr')).toBe(false);
    expect(P.canEditForm(r, 'manager', 'manager')).toBe(true);
    expect(P.canEditForm(r, 'self', 'employee')).toBe(false);      // already submitted: locked
    expect(P.applyDraft(r, 'self', 'employee', { strengths: 'changed' })).toMatchObject({ ok: false });
    expect(P.applyDraft(r, 'manager', 'employee', { strengths: 'x' })).toMatchObject({ ok: false });

    const early = P.submitReviewForm(r, 'manager', 'manager', today);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error).toContain('Rate every competency');
    const draft = P.applyDraft(r, 'manager', 'manager', { ratings: { Delivery: 4, 'Quality of work': 4, Collaboration: 3, Ownership: 4, 'Learning and growth': 3 }, strengths: 'Steady', development: 'Share earlier', overall: 4 });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    r = draft.review;
    const sub = P.submitReviewForm(r, 'manager', 'manager', today);
    expect(sub.ok).toBe(true);
    if (!sub.ok) return;
    expect(sub.review.manager.submittedOn).toBe(today);
    expect(P.applyDraft(sub.review, 'manager', 'manager', { strengths: 'edited after submit' })).toMatchObject({ ok: false });
    expect(P.submitReviewForm(sub.review, 'manager', 'manager', today)).toMatchObject({ ok: false });
    expect(P.canSeeManagerReview(sub.review, 'employee')).toBe(true);   // now visible
  });

  test('360 feedback: no result below three responses, comments sorted and unattributed at three or more', () => {
    const two = P.feedbackSummary(review('emp_6').feedback);
    expect(two).toMatchObject({ requested: 4, responded: 2, visible: false, remaining: 1, averages: [], comments: [] });
    const three = P.feedbackSummary(review('emp_5').feedback);
    expect(three.visible).toBe(true);
    expect(three.averages.find((a) => a.competency === 'Delivery')!.average).toBe(4.3);
    expect(three.comments).toEqual([...three.comments].sort((a, b) => a.localeCompare(b)));
    expect(P.feedbackSummary([])).toMatchObject({ requested: 0, visible: false });
    expect(P.MIN_FEEDBACK).toBe(3);

    expect(P.validateFeedbackRequest([], ['emp_3', 'emp_4'], 'emp_17')).toContain('at least 3');
    expect(P.validateFeedbackRequest([], ['emp_3', 'emp_4', 'emp_5'], 'emp_17')).toBeNull();
    expect(P.validateFeedbackRequest([], ['emp_17', 'emp_4', 'emp_5'], 'emp_17')).toContain('person being reviewed');
    expect(P.validateFeedbackRequest(review('emp_6').feedback, ['emp_3'], 'emp_6')).toBeNull();   // 4 asked already, adding one more is fine
  });

  test('calibration: distribution counts, a group under five shows no chart, a move needs a reason and is logged', () => {
    const ratings = seed.reviews.map(P.finalRating).filter((x): x is number => x != null);
    expect(ratings).toHaveLength(15);
    expect(P.ratingDistribution(ratings)).toEqual([0, 1, 5, 7, 2]);
    expect(P.distributionVisible(4)).toBe(false);
    expect(P.distributionVisible(5)).toBe(true);
    expect(P.MIN_TEAM).toBe(5);

    const r = review('emp_7');                                          // manager rated 2
    expect(P.finalRating(r)).toBe(2);
    expect(P.validateMove(r, 3, 'short')).toContain('reason');
    expect(P.validateMove(r, 2, 'a long enough reason here')).toContain('already');
    expect(P.validateMove(r, 7, 'a long enough reason here')).toContain('1 to 5');
    expect(P.validateMove(review('emp_14'), 3, 'a long enough reason here')).toContain('not submitted');
    const moved = P.applyMove(r, 3, '  Covered two beats for three weeks while a colleague was away.  ', 'HR', today, 'm1');
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.review.moves).toEqual([{ id: 'm1', from: 2, to: 3, reason: 'Covered two beats for three weeks while a colleague was away.', by: 'HR', on: today }]);
    expect(P.finalRating(moved.review)).toBe(3);
    expect(moved.review.manager.overall).toBe(2);                       // the manager's own rating is never overwritten
    expect(P.ratingDistribution(ratings.map((x, i) => (i === ratings.indexOf(2) ? 3 : x)))).toEqual([0, 0, 6, 7, 2]);
  });

  test('1:1 notes: a private note is visible only to its author; HR sees shared notes and a count of the hidden ones', () => {
    const t = seed.threads.find((x) => x.id === 'oo_4_6')!;
    expect(P.visibleNotes(t.notes, 'manager').map((n) => n.id)).toEqual(['n1', 'n2', 'n4']);
    expect(P.visibleNotes(t.notes, 'employee').map((n) => n.id)).toEqual(['n1', 'n3', 'n4']);
    expect(P.visibleNotes(t.notes, 'hr').map((n) => n.id)).toEqual(['n1', 'n4']);
    expect(P.hiddenNoteCount(t.notes, 'hr')).toBe(2);
    expect(P.hiddenNoteCount(t.notes, 'manager')).toBe(1);
    expect(P.isOverdue({ id: 'a', text: '', owner: 'manager', status: 'open', due: '2026-11-01', createdOn: '2026-10-01' }, today)).toBe(true);
    expect(P.isOverdue({ id: 'a', text: '', owner: 'manager', status: 'done', due: '2026-11-01', createdOn: '2026-10-01' }, today)).toBe(false);
  });

  test('cycle stages follow today\'s date, and completion counts submitted reviews', () => {
    const st = Object.fromEntries(seed.cycle.stages.map((s) => [s.key, P.stageState(s, today)]));
    expect(st).toEqual({ goals: 'done', self: 'done', manager: 'in_progress', calibration: 'upcoming', results: 'upcoming' });
    expect(P.completion(seed.reviews)).toEqual({ total: 20, self: 18, manager: 15 });
    expect(P.completion(seed.reviews.filter((r) => r.employeeId === 'emp_14' || r.employeeId === 'emp_15'))).toEqual({ total: 2, self: 1, manager: 0 });
  });
});

// ═════════════════════════════ recruitment screens ═════════════════════════════
test.describe('recruitment page', () => {
  test('renders the seeded pipeline, with the fairness note, no console errors, and no photo, age or gender anywhere', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, REC);
    await expect(page.getByRole('heading', { name: 'Recruitment', level: 1 })).toBeVisible();
    await expect(page.getByTestId('fairness-note')).toContainText('no candidate photos and no age or gender columns');
    for (const col of ['applied', 'screen', 'interview', 'offer', 'hired', 'rejected']) await expect(page.getByTestId(`col-${col}`)).toBeVisible();
    // the first opening with candidates is Area Sales Executive: 2 applied, 1 screen, 2 interview, 1 offer, 0 hired, 2 rejected
    const count = async (stage: string) => (await page.getByTestId(`col-${stage}`).locator('h3 + span').innerText()).trim();
    expect([await count('applied'), await count('screen'), await count('interview'), await count('offer'), await count('hired'), await count('rejected')]).toEqual(['2', '1', '2', '1', '0', '2']);
    await expect(page.getByTestId('col-offer')).toContainText('Nikhil Arora');
    await expect(page.getByTestId('col-offer')).toContainText('Offer extended');
    expect(errors).toEqual([]);

    await page.getByRole('tab', { name: /Candidates/ }).click();
    await expect(page.getByRole('row')).toHaveCount(26);   // header + 25 candidates
    const heads = (await page.locator('thead th').allInnerTexts()).join(' ').toLowerCase();
    expect(heads).toContain('expected ctc');
    expect(heads).not.toMatch(/\bage\b|gender|photo|birth/);
  });

  test('stage moves use explicit buttons, change the board and survive a reload', async ({ page }) => {
    await openHrms(page, REC);
    await page.getByRole('button', { name: 'Move Amit Tyagi to Screen' }).click();
    await expect(page.getByTestId('col-screen')).toContainText('Amit Tyagi');
    await expect(page.getByTestId('col-applied')).not.toContainText('Amit Tyagi');
    await page.getByRole('button', { name: 'Move Amit Tyagi back to Applied' }).click();
    await expect(page.getByTestId('col-applied')).toContainText('Amit Tyagi');
    await page.getByRole('button', { name: 'Move Amit Tyagi to Screen' }).click();
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    await expect(page.getByTestId('col-screen')).toContainText('Amit Tyagi');
    const a = await readArea(page);
    const c = a.candidates.find((x) => x.name === 'Amit Tyagi')!;
    expect(c.stage).toBe('screen');
    expect(c.history.map((h) => h.to)).toEqual(['applied', 'screen', 'applied', 'screen']);   // the history is kept, in order
  });

  test('moving to Rejected needs a reason code, and the reason is kept with the history', async ({ page }) => {
    await openHrms(page, REC);
    await page.getByRole('button', { name: 'Reject Amit Tyagi' }).click();
    const dlg = page.getByRole('dialog', { name: 'Reject Amit Tyagi' });
    await expect(dlg.getByRole('button', { name: 'Reject candidate' })).toBeDisabled();
    await dlg.getByLabel('Reason code').selectOption('notice_period');
    await dlg.getByRole('button', { name: 'Reject candidate' }).click();
    await expect(page.getByTestId('col-rejected')).toContainText('Amit Tyagi');
    await expect(page.getByTestId('col-rejected')).toContainText('Notice period too long');
    const c = (await readArea(page)).candidates.find((x) => x.name === 'Amit Tyagi')!;
    expect(c).toMatchObject({ stage: 'rejected', rejectReason: 'notice_period' });
    expect(c.history[c.history.length - 1]).toMatchObject({ to: 'rejected', reason: 'notice_period' });
    // and it can be reopened
    await page.getByRole('button', { name: 'Reopen Amit Tyagi' }).click();
    await expect.poll(async () => (await readArea(page)).candidates.find((x) => x.name === 'Amit Tyagi')!.stage).toBe('applied');
  });

  test('candidate detail: masked mobile, scorecards side by side with averages, and an average that decides nothing', async ({ page }) => {
    await openHrms(page, REC);
    await page.getByRole('button', { name: 'Open Nikhil Arora' }).click();
    const modal = page.getByTestId('candidate-modal');
    const raw = seed.candidates.find((c) => c.id === 'cand_01')!.mobile;
    const masked = await modal.getByTestId('masked-mobile').innerText();
    expect(masked).toMatch(/^\d{2}••••••\d{2}$/);
    expect(masked).not.toBe(raw);
    await expect(modal).not.toContainText(raw);
    const matrix = modal.getByTestId('scorecard-matrix');
    await expect(matrix.getByRole('columnheader')).toHaveCount(4);          // competency + three rounds
    const expected = E.scorecardMatrix(seed.candidates.find((c) => c.id === 'cand_01')!.scorecards).averages;
    for (let i = 0; i < 3; i++) await expect(modal.getByTestId(`round-average-${i}`)).toContainText(String(expected[i]));
    await expect(modal.getByTestId('scorecard-overall')).toContainText('4.0');
    await expect(modal.getByTestId('scorecard-overall')).toContainText('For information only');
    await expect(modal).toContainText('never recommends a hire or a reject');
    await expect(modal.getByTestId('stage-history')).toContainText('Offer');
  });

  test('a new scorecard adds a round, with its own average, and persists', async ({ page }) => {
    await openHrms(page, REC);
    await page.getByRole('button', { name: 'Open Kavita Rao' }).click();
    const modal = page.getByTestId('candidate-modal');
    await expect(modal.getByTestId('scorecard-matrix').getByRole('columnheader')).toHaveCount(3);
    await modal.getByRole('button', { name: 'Add scorecard' }).click();
    const form = modal.getByTestId('scorecard-form');
    await expect(form.getByRole('button', { name: 'Save scorecard' })).toBeDisabled();       // nothing rated yet
    await form.getByLabel('Round').selectOption('Manager round');
    await form.getByLabel('Interviewer').selectOption({ label: 'Arvind Nair' });
    await form.getByRole('radio', { name: /^Role knowledge: 5 of 5/ }).click();
    await form.getByRole('radio', { name: /^Communication: 3 of 5/ }).click();
    await form.getByRole('button', { name: 'Save scorecard' }).click();
    await expect(modal.getByTestId('scorecard-matrix').getByRole('columnheader')).toHaveCount(4);
    await expect(modal.getByTestId('round-average-2')).toContainText('4');                    // (5 + 3) / 2
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    const c = (await readArea(page)).candidates.find((x) => x.id === 'cand_02')!;
    expect(c.scorecards).toHaveLength(3);
    expect(c.scorecards[2]).toMatchObject({ round: 'Manager round', interviewerId: 'emp_2' });
  });

  test('offer builder: the monthly breakup comes from the core engine and flags a structure that fails the 50% rule', async ({ page }) => {
    await openHrms(page, REC);
    await page.getByRole('button', { name: 'Open Nikhil Arora' }).click();
    const modal = page.getByTestId('candidate-modal');
    await expect(modal.getByTestId('offer-breakup')).toBeVisible();
    await expect(modal.getByTestId('wage-test')).toContainText('Fails the 50% wages rule');
    const field = core.structures.find((s) => s.id === 'str_field')!;
    const b = buildBreakup(field, 600000, { asOn: '2026-12-07', pfMember: true });
    await expect(modal.getByTestId('offer-breakup')).toContainText(inr(b.monthlyCtc));
    await expect(modal.getByTestId('wage-test')).toContainText(inr(b.wageTest.addBack));
    await modal.getByLabel('Salary structure').selectOption('str_std');
    await expect(modal.getByTestId('wage-test')).toContainText('Passes the 50% wages rule');
    await modal.getByLabel('Annual CTC').fill('950000');
    await expect(modal.getByText(/above the top of the opening/)).toBeVisible();              // a warning, not a block
    await modal.getByLabel('Joining date').fill('2026-10-01');
    await expect(modal.getByText('The joining date cannot be in the past.')).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  test('accepted offer to employee: shows in Employees and Lifecycle, and the opening\'s filled seats go up', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, REC);
    await page.getByRole('button', { name: 'Open Nikhil Arora' }).click();
    const modal = page.getByTestId('candidate-modal');
    await modal.getByRole('button', { name: 'Mark offer accepted' }).click();
    await expect(modal.getByText('Offer accepted', { exact: true })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Hired', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await modal.getByRole('button', { name: 'Convert to employee' }).click();
    const dlg = page.getByRole('dialog', { name: /Create the employee record/ });
    await dlg.getByRole('button', { name: 'Create employee' }).click();
    await expect(dlg.getByText('Enter the date of birth.')).toBeVisible();                    // asked only now, and required
    await dlg.getByLabel('Date of birth').fill('1994-05-12');
    await dlg.getByLabel('Gender').selectOption('male');
    await dlg.getByRole('button', { name: 'Create employee' }).click();
    await expect(modal.getByTestId('converted-note')).toContainText('Nikhil Arora is now an employee');

    const db = await readDb(page);
    const emp = db.employees.find((e: { email: string }) => e.email === 'nikhil.arora@mail.example');
    expect(emp).toMatchObject({ firstName: 'Nikhil', lastName: 'Arora', status: 'onboarding', annualCtc: 600000, structureId: 'str_field', departmentId: 'dep_sales', locationId: 'loc_del', joinDate: '2026-12-07', designationId: 'des_ase' });
    expect(db.onboarding.some((o: { employeeId: string; name: string }) => o.employeeId === emp.id && o.name === 'Nikhil Arora')).toBe(true);
    const a = await readArea(page);
    expect(a.candidates.find((c) => c.id === 'cand_01')).toMatchObject({ stage: 'hired', convertedEmployeeId: emp.id });
    expect(a.openings.find((o) => o.id === 'open_ase_del')).toMatchObject({ filled: 1, status: 'open' });

    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: /Openings/ }).click();
    await expect(page.getByRole('row', { name: /Area Sales Executive/ })).toContainText('1/2 filled');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    await page.goto('/dashboard/hrms/lifecycle');
    await page.getByTestId('hrms-preview-banner').waitFor();
    await expect(page.getByText('Nikhil Arora').first()).toBeVisible();
    await page.goto('/dashboard/hrms/employees');
    await page.getByTestId('hrms-preview-banner').waitFor();
    await expect(page.getByText('Nikhil Arora').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the last seat filled closes the opening; an already converted candidate cannot be converted twice', async ({ page }) => {
    await openHrms(page, REC + '?tab=openings');
    await page.getByRole('row', { name: /Field Executive/ }).click();
    await expect(page.getByTestId('opening-modal')).toContainText('0 of 1 filled');
    await page.keyboard.press('Escape');
    // Faizal Ansari (interview) to Offer, build and extend the offer, accept, convert
    await page.getByRole('tab', { name: /Pipeline/ }).click();
    await page.getByRole('combobox', { name: 'Opening' }).selectOption('open_fe_blr');
    await page.getByRole('button', { name: 'Move Faizal Ansari to Offer' }).click();
    await page.getByRole('button', { name: 'Open offer for Faizal Ansari' }).click();
    const modal = page.getByTestId('candidate-modal');
    await modal.getByLabel('Annual CTC').fill('340000');
    await modal.getByLabel('Salary structure').selectOption('str_field');
    await modal.getByRole('button', { name: 'Save offer' }).click();
    await modal.getByRole('button', { name: 'Extend offer' }).click();
    await modal.getByRole('button', { name: 'Mark offer accepted' }).click();
    await modal.getByRole('button', { name: 'Convert to employee' }).click();
    const dlg = page.getByRole('dialog', { name: /Create the employee record/ });
    await dlg.getByLabel('Date of birth').fill('1999-02-20');
    await dlg.getByLabel('Gender').selectOption('male');
    await dlg.getByRole('button', { name: 'Create employee' }).click();
    await expect(modal.getByTestId('converted-note')).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Convert to employee' })).toHaveCount(0);
    const a = await readArea(page);
    expect(a.openings.find((o) => o.id === 'open_fe_blr')).toMatchObject({ filled: 1, status: 'filled', closedOn: today });
    expect(a.candidates.find((c) => c.id === 'cand_23')!.stage).toBe('hired');
    // the final stage cannot be changed any more
    await expect(modal.getByTestId('move-blocked')).toContainText('already an employee');
    await expect(modal.getByRole('button', { name: 'Applied', exact: true })).toBeDisabled();
  });

  test('an offer the candidate declines moves them to Rejected with the reason Withdrew, and the accept rate follows', async ({ page }) => {
    await openHrms(page, REC);
    await page.getByRole('button', { name: 'Open Nikhil Arora' }).click();
    const modal = page.getByTestId('candidate-modal');
    await expect(modal.getByTestId('move-blocked')).toContainText('An offer is out');       // cannot be moved around while the offer is open
    await modal.getByRole('button', { name: 'Mark offer declined' }).click();
    await expect(modal.getByRole('button', { name: 'Rejected', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Insights' }).click();
    await expect(page.getByTestId('stat-accept')).toContainText('50%');                    // 2 accepted, 2 declined
  });

  test('openings: the over-plan opening is flagged, cannot be approved, and can once the plan is raised on the planning page', async ({ page }) => {
    await openHrms(page, REC + '?tab=openings');
    const row = page.getByRole('row', { name: /Warehouse Associate/ });
    await expect(row).toContainText('Over plan');
    await expect(row).toContainText('Pending approval');
    await row.click();
    const modal = page.getByTestId('opening-modal');
    await expect(modal.getByTestId('room-check')).toContainText('The plan approves 5 for Warehouse at Bhiwandi Warehouse by Mar 2027');
    await expect(modal.getByTestId('room-check')).toContainText('This opening needs 3');
    await expect(modal.getByTestId('approve-blocked')).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Approve and open' })).toBeDisabled();
    await page.keyboard.press('Escape');

    await page.goto(WFP);
    await page.getByTestId('hrms-preview-banner').waitFor();
    await page.getByRole('button', { name: 'Edit plan' }).click();
    await page.getByLabel('Warehouse · Bhiwandi Warehouse, Mar 2027', { exact: true }).fill('7');
    await page.getByRole('button', { name: 'Save plan' }).click();

    await page.goto(REC + '?tab=openings');
    await page.getByTestId('hrms-preview-banner').waitFor();
    const row2 = page.getByRole('row', { name: /Warehouse Associate/ });
    await expect(row2).not.toContainText('Over plan');
    await row2.click();
    await expect(page.getByTestId('room-check')).toContainText('The plan approves 7');
    await page.getByTestId('opening-modal').getByLabel('Note for the hiring manager').fill('Approved after the plan was raised.');
    await page.getByRole('button', { name: 'Approve and open' }).click();
    await expect(page.getByRole('row', { name: /Warehouse Associate/ })).toContainText('Open');
    const o = (await readArea(page)).openings.find((x) => x.id === 'open_wh_mum')!;
    expect(o).toMatchObject({ status: 'open', openedOn: today });
    expect(o.approvals[o.approvals.length - 1]).toMatchObject({ decision: 'approved', note: 'Approved after the plan was raised.' });
  });

  test('rejecting an opening needs a note and sends it back to draft', async ({ page }) => {
    await openHrms(page, REC + '?tab=openings');
    await page.getByRole('row', { name: /Warehouse Associate/ }).click();
    const modal = page.getByTestId('opening-modal');
    await expect(modal.getByRole('button', { name: 'Reject with note' })).toBeDisabled();
    await modal.getByLabel('Note for the hiring manager').fill('Raise the plan first.');
    await modal.getByRole('button', { name: 'Reject with note' }).click();
    await expect(page.getByRole('row', { name: /Warehouse Associate/ })).toContainText('Draft');
    const o = (await readArea(page)).openings.find((x) => x.id === 'open_wh_mum')!;
    expect(o.status).toBe('draft');
    expect(o.approvals[o.approvals.length - 1]).toMatchObject({ decision: 'rejected', note: 'Raise the plan first.' });
  });

  test('create an opening, send it for approval, approve it: age starts on the day it goes live', async ({ page }) => {
    await openHrms(page, REC + '?tab=openings');
    await page.getByRole('button', { name: 'New opening' }).click();
    const modal = page.getByTestId('opening-modal');
    await expect(modal.getByRole('button', { name: 'Create draft' })).toBeDisabled();
    await modal.getByLabel('Title').fill('People Partner');
    await modal.getByLabel('Department').selectOption('dep_hr');
    await modal.getByLabel('Location').selectOption('loc_del');
    await modal.getByLabel('Designation').selectOption('des_hr');
    await modal.getByLabel('Hiring manager').selectOption('emp_1');
    await modal.getByLabel('CTC band, bottom').fill('500000');
    await modal.getByLabel('CTC band, top').fill('700000');
    await expect(modal.getByTestId('room-check')).toContainText('Within the approved plan');
    await modal.getByRole('button', { name: 'Create and send for approval' }).click();
    const row = page.getByRole('row', { name: /People Partner/ });
    await expect(row).toContainText('Pending approval');
    await expect(row).toContainText('waiting');
    await row.click();
    await page.getByRole('button', { name: 'Approve and open' }).click();
    await expect(page.getByRole('row', { name: /People Partner/ })).toContainText('0 days');
    const o = (await readArea(page)).openings.find((x) => x.title === 'People Partner')!;
    expect(o).toMatchObject({ status: 'open', openedOn: today, createdOn: today, headcount: 1, bandMin: 500000, bandMax: 700000 });
    expect(o.approvals.map((a) => a.decision)).toEqual(['submitted', 'approved']);
  });

  test('editing a live opening cannot raise its seats past the plan; an opening can be put on hold and resumed', async ({ page }) => {
    await openHrms(page, REC + '?tab=openings');
    await page.getByRole('row', { name: /Field Executive/ }).click();
    let modal = page.getByTestId('opening-modal');
    await modal.getByLabel('Headcount (seats)').fill('3');
    await expect(modal.getByTestId('room-check')).toContainText('Above the approved plan');
    await modal.getByRole('button', { name: 'Save changes' }).click();
    await expect(modal).toContainText('This opening needs 3');                                  // refused, the modal stays and explains
    expect((await readArea(page)).openings.find((o) => o.id === 'open_fe_blr')!.headcount).toBe(1);
    await modal.getByLabel('Headcount (seats)').fill('1');
    await modal.getByRole('button', { name: 'Put on hold' }).click();
    const dlg = page.getByRole('dialog', { name: 'Put the opening on hold' });
    await expect(dlg.getByRole('button', { name: 'Put on hold' })).toBeDisabled();
    await dlg.getByLabel(/Why is it on hold/).fill('Budget review');
    await dlg.getByRole('button', { name: 'Put on hold' }).click();
    await expect(page.getByRole('row', { name: /Field Executive/ })).toContainText('On hold');
    await page.getByRole('row', { name: /Field Executive/ }).click();
    modal = page.getByTestId('opening-modal');
    await expect(modal).toContainText('On hold: Budget review');
    await modal.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByRole('row', { name: /Field Executive/ })).toContainText('Open');
  });

  test('candidates can be added only to an open opening, with validation', async ({ page }) => {
    await openHrms(page, REC);
    await page.getByRole('button', { name: 'Add candidate' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add candidate' });
    await dlg.getByRole('button', { name: 'Add to Applied' }).click();
    await expect(dlg.getByRole('note')).toContainText('first and last name');
    await dlg.getByLabel('Full name').fill('Meera Krishnan');
    await dlg.getByLabel('Email').fill('meera.krishnan@mail.example');
    await dlg.getByLabel('Mobile').fill('98123');
    await dlg.getByRole('button', { name: 'Add to Applied' }).click();
    await expect(dlg.getByRole('note')).toContainText('Mobile');
    await dlg.getByLabel('Mobile').fill('9812345678');
    await dlg.getByLabel('Expected CTC').fill('560000');
    await dlg.getByLabel('Source').selectOption('campus');
    await dlg.getByRole('button', { name: 'Add to Applied' }).click();
    await expect(page.getByTestId('col-applied')).toContainText('Meera Krishnan');
    await expect(page.getByTestId('col-applied')).toContainText('Campus');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    await expect(page.getByTestId('col-applied')).toContainText('Meera Krishnan');

    await page.getByRole('combobox', { name: 'Opening' }).selectOption('open_ops_del');       // on hold
    await expect(page.getByRole('button', { name: 'Add candidate' })).toBeDisabled();
    await expect(page.getByTestId('add-disabled-reason')).toContainText('On hold');
  });

  test('insights match the engine, with the fairness rule and the working shown', async ({ page }) => {
    await openHrms(page, REC + '?tab=insights');
    const x = E.hiringInsights(seed.candidates, seed.openings, today);
    await expect(page.getByTestId('stat-tth')).toContainText(`${x.timeToHire.average} days`);
    await expect(page.getByTestId('stat-accept')).toContainText(`${x.offers.acceptRate}%`);
    await expect(page.getByTestId('stat-funnel')).toContainText(`${x.funnel[4]!.pctOfApplied}%`);
    await expect(page.getByTestId('stat-open')).toContainText('5');
    for (const id of ['funnel', 'sources', 'age-chart', 'rejections']) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId('funnel')).toContainText('21');
    await expect(page.getByTestId('sources')).toContainText('14.3%');
    await expect(page.getByTestId('insights')).toContainText('How these are worked out');
  });

  test('keyboard: stage buttons are reachable with Tab and work with Enter', async ({ page }) => {
    await openHrms(page, REC);
    const btn = page.getByRole('button', { name: 'Move Ishita Sethi to Screen' });
    await btn.focus();
    await expect(btn).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('col-screen')).toContainText('Ishita Sethi');
  });
});

test.describe('recruitment, narrow screen', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  for (const tab of ['pipeline', 'openings', 'candidates', 'insights']) {
    test(`no sideways page scroll at 390px: ${tab}`, async ({ page }) => {
      await openHrms(page, `${REC}?tab=${tab}`);
      await page.waitForTimeout(700);
      await expectNoSideScroll(page);
    });
  }
  test('the board stacks the stages and a candidate can still be opened', async ({ page }) => {
    await openHrms(page, REC);
    await expect(page.getByTestId('col-interview')).toBeVisible();
    await page.getByRole('button', { name: 'Open Kavita Rao' }).click();
    await expect(page.getByTestId('candidate-modal')).toBeVisible();
    await expectNoSideScroll(page);
  });
});

// ═════════════════════════════ workforce planning screens ═════════════════════════════
test.describe('workforce planning page', () => {
  test('renders the plan against actual with numbers from the engine, and no console errors', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, WFP);
    await expect(page.getByRole('heading', { name: 'Workforce planning', level: 1 })).toBeVisible();
    await expect(page.getByTestId('top-actual')).toContainText('22');
    await expect(page.getByTestId('top-plan')).toContainText('29');
    await expect(page.getByTestId('top-plan')).toContainText('Gap -7');
    await expect(page.getByTestId('top-seats')).toContainText('5');
    await expect(page.getByTestId('top-attrition')).toContainText('4.5%');
    await expect(page.getByTestId('plan-principle')).toContainText('not a ranking of people');
    const sales = page.getByTestId('plan-table').getByRole('row', { name: /Sales & Field/ }).locator('td');
    await expect(sales).toHaveText(['Sales & Field', '12', '9', '-3', '9', '3']);
    const foot = page.getByTestId('plan-table').locator('tfoot td');
    await expect(foot).toHaveText(['Company', '29', '22', '-7', '24', '5']);
    await expect(page.getByTestId('dept-charts').getByRole('img')).toHaveCount(6);
    expect(errors).toEqual([]);
  });

  test('a future month shows committed numbers; by location regroups the same plan', async ({ page }) => {
    await openHrms(page, WFP);
    await page.getByLabel('Month', { exact: true }).selectOption('2026-12');
    const foot = page.getByTestId('plan-table').locator('tfoot td');
    await expect(foot).toHaveText(['Company', '31', '23', '-8', '23', '5']);
    await expect(page.getByText('Future month: committed only')).toBeVisible();
    await page.getByLabel('Month', { exact: true }).selectOption('2026-11');
    await page.getByRole('tab', { name: 'By location' }).click();
    const delhi = page.getByTestId('plan-table').getByRole('row', { name: /Delhi HQ/ }).locator('td');
    await expect(delhi).toHaveText(['Delhi HQ', '15', '11', '-4', '12', '3']);
    await expect(page.getByTestId('plan-table').locator('tfoot td').nth(1)).toHaveText('29');   // the same company total
    await expect(page.getByTestId('dept-charts').getByRole('img')).toHaveCount(3);
  });

  test('the month by month table follows the chosen department, and marks the year-end column used for approvals', async ({ page }) => {
    await openHrms(page, WFP);
    await page.getByLabel('Show months for').selectOption('dep_wh');
    const rows = page.getByTestId('monthly-table').locator('tbody tr');
    await expect(rows).toHaveCount(12);
    await expect(rows.nth(11)).toContainText('Mar 2027');
    await expect(rows.nth(11)).toContainText('year end, used for approvals');
    await expect(rows.nth(11).locator('td').nth(1)).toHaveText('5');
    await expect(rows.nth(0).locator('td').nth(2)).toHaveText('4');
  });

  test('editing the plan persists, and Recruitment reads the new approved headcount', async ({ page }) => {
    await openHrms(page, WFP);
    await page.getByRole('button', { name: 'Edit plan' }).click();
    const cell = page.getByLabel('Sales & Field · Delhi HQ, Mar 2027', { exact: true });
    await expect(cell).toHaveValue('9');
    await cell.fill('12');
    await page.getByRole('button', { name: 'Save plan' }).click();
    await expect(page.getByTestId('plan-table')).toBeVisible();
    const a = await readArea(page);
    expect(a.plan.lines.find((l) => l.id === 'dep_sales|loc_del')!.months['2027-03']).toBe(12);
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    await page.getByLabel('Month', { exact: true }).selectOption('2027-03');
    await expect(page.getByTestId('plan-table').getByRole('row', { name: /Sales & Field/ }).locator('td').nth(1)).toHaveText('16');   // Delhi 12 + Bengaluru 4
    await page.goto(REC + '?tab=openings');
    await page.getByTestId('hrms-preview-banner').waitFor();
    await page.getByRole('row', { name: /Area Sales Executive/ }).click();
    await expect(page.getByTestId('room-check')).toContainText('The plan approves 12 for Sales & Field at Delhi HQ');
  });

  test('plan cells take whole numbers only, and a plan line can be added for a new department and location', async ({ page }) => {
    await openHrms(page, WFP);
    await page.getByRole('button', { name: 'Edit plan' }).click();
    const dlg = page.getByTestId('edit-plan');
    await expect(page.getByRole('button', { name: 'Save plan' })).toBeDisabled();             // nothing changed
    const cell = page.getByLabel('Operations · Delhi HQ, Dec 2026', { exact: true });
    await cell.fill('2.5x');
    await expect(cell).toHaveValue('25');                                                      // only digits are kept
    await cell.fill('');
    await dlg.getByLabel('New line department').selectOption('dep_tech');
    await dlg.getByLabel('New line location').selectOption('loc_del');
    await dlg.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByLabel('Technology · Delhi HQ, Mar 2027', { exact: true })).toHaveValue('0');
    await dlg.getByLabel('New line department').selectOption('dep_tech');
    await dlg.getByLabel('New line location').selectOption('loc_del');
    await dlg.getByRole('button', { name: 'Add line' }).click();                               // adding it twice is refused with a toast, not a second line
    const a = await readArea(page);
    expect(a.plan.lines.filter((l) => l.id === 'dep_tech|loc_del')).toHaveLength(1);
    expect(a.plan.lines).toHaveLength(11);
  });

  test('budget: figures match the engine, open positions are costed at the band middle, and the start month changes the projection', async ({ page }) => {
    await openHrms(page, WFP + '?tab=budget');
    const b = E.budgetFigures(planInput(), seed.openStartMonth, months);
    await expect(page.getByTestId('stat-planned')).toContainText(inrShort(b.plannedFy));
    await expect(page.getByTestId('stat-actual')).toContainText(inrShort(b.actualToDate));
    await expect(page.getByTestId('stat-open')).toContainText(inrShort(b.openCostAnnual));
    await expect(page.getByTestId('stat-projected')).toContainText(inrShort(b.projectedWithHire));
    await expect(page.getByTestId('open-cost')).toContainText(inr(3_310_000));
    await expect(page.getByTestId('open-cost')).toContainText(inr(570000));                    // Area Sales Executive band middle
    await expect(page.getByTestId('budget-chart')).toBeVisible();
    await page.getByLabel('Open positions start costing from').selectOption('2027-03');
    const later = E.budgetFigures(planInput(), '2027-03', months);
    await expect(page.getByTestId('stat-projected')).toContainText(inrShort(later.projectedWithHire));
    expect((await readArea(page)).openStartMonth).toBe('2027-03');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    await expect(page.getByLabel('Open positions start costing from')).toHaveValue('2027-03');
  });

  test('budget follows the plan: a higher planned average CTC raises the planned spend', async ({ page }) => {
    await openHrms(page, WFP);
    await page.getByRole('button', { name: 'Edit plan' }).click();
    await page.getByLabel('Average CTC, Technology').fill('2000000');
    await page.getByRole('button', { name: 'Save plan' }).click();
    const h = structuredClone(seed);
    h.plan.avgCtc.dep_tech = 2_000_000;
    const b = E.budgetFigures(planInput(h), h.openStartMonth, months);
    await page.getByRole('tab', { name: 'Budget' }).click();
    await expect(page.getByTestId('stat-planned')).toContainText(inrShort(b.plannedFy));
  });

  test('attrition: the formula is written out with the real numbers, and exits and notices are listed', async ({ page }) => {
    await openHrms(page, WFP + '?tab=attrition');
    await expect(page.getByTestId('stat-rate')).toContainText('4.5%');
    await expect(page.getByTestId('stat-serving')).toContainText('1');
    await expect(page.getByTestId('attrition-formula')).toContainText('people who left in the last 12 months ÷ average headcount × 100');
    await expect(page.getByTestId('attrition-formula')).toContainText('1 left ÷ (22 + 22) ÷ 2 = 22.0 average, so 4.5%');
    const sep = page.getByTestId('attrition-table').getByRole('row', { name: /Sep 2026/ });
    await expect(sep).toContainText('4.4%');
    await expect(page.getByTestId('exits-chart')).toBeVisible();
    await expect(page.getByTestId('rate-chart')).toBeVisible();
    await expect(page.getByRole('row', { name: /Deepa Pillai/ })).toContainText('Left');
    await expect(page.getByRole('row', { name: /Yash Rathore/ })).toContainText('Serving notice');
  });

  test('a new exit in Lifecycle changes the attrition numbers', async ({ page }) => {
    await openHrms(page, WFP + '?tab=attrition');
    await page.evaluate((k) => {
      const db = JSON.parse(localStorage.getItem(k) as string);
      const e = db.employees.find((x: { id: string }) => x.id === 'emp_10');
      e.status = 'exited'; e.lastWorkingDate = '2026-11-03';
      localStorage.setItem(k, JSON.stringify(db));
    }, DB_KEY);
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    const db = JSON.parse(JSON.stringify(core));
    const e = db.employees.find((x: { id: string }) => x.id === 'emp_10');
    e.status = 'exited'; e.lastWorkingDate = '2026-11-03';
    const nov = E.attritionSeries(db.employees, E.exitRecords(db.employees, db.exits, today), months, today).find((p) => p.month === '2026-11')!;
    await expect(page.getByTestId('stat-rate')).toContainText(`${nov.rate}%`);
  });

  test('scenarios: three starting scenarios with projected headcount and cost, matching the engine', async ({ page }) => {
    await openHrms(page, WFP + '?tab=scenarios');
    const startHc = E.monthlySeries(planInput(), {}, ['2026-11'])[0]!.committed;
    const spent = E.budgetFigures(planInput(), seed.openStartMonth, months).actualToDate;
    expect(startHc).toBe(24);
    for (const s of seed.scenarios) {
      const r = E.projectScenario(s, startHc, '2026-11', '2027-03', spent);
      await expect(page.getByTestId(`scenario-${s.id}`).getByTestId('end-hc')).toHaveText(String(r.endHeadcount));
      await expect(page.getByTestId(`scenario-${s.id}`)).toContainText(inrShort(r.costToEnd));
    }
    await expect(page.getByTestId('scenario-scn_base').getByTestId('end-hc')).toHaveText('27.3');
    await expect(page.getByTestId('scenario-scn_freeze').getByTestId('end-hc')).toHaveText('23.4');
    await expect(page.getByTestId('scenario-scn_growth').getByTestId('end-hc')).toHaveText('31.1');
  });

  test('editing a scenario\'s assumptions is saved and changes the projection; a bad number is refused', async ({ page }) => {
    await openHrms(page, WFP + '?tab=scenarios');
    await page.getByRole('button', { name: 'Edit Base' }).click();
    const dlg = page.getByRole('dialog', { name: 'Edit Base' });
    await dlg.getByLabel('Attrition a year').fill('140');
    await expect(dlg.getByRole('button', { name: 'Save scenario' })).toBeDisabled();
    await expect(dlg).toContainText('Attrition: a percentage from 0 to 100');
    await dlg.getByLabel('Attrition a year').fill('8');
    await dlg.getByLabel('Hires a month').fill('2');
    await dlg.getByRole('button', { name: 'Save scenario' }).click();
    const r = E.projectScenario({ hiresPerMonth: 2, attritionPct: 8, avgCtc: 710000 }, 24, '2026-11', '2027-03', 0);
    await expect(page.getByTestId('scenario-scn_base').getByTestId('end-hc')).toHaveText(String(r.endHeadcount));
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    await expect(page.getByTestId('scenario-scn_base').getByTestId('end-hc')).toHaveText(String(r.endHeadcount));
    expect((await readArea(page)).scenarios.find((s) => s.id === 'scn_base')!.hiresPerMonth).toBe(2);
  });

  test('add a scenario, compare it with another, and delete it (the starting three cannot be deleted)', async ({ page }) => {
    await openHrms(page, WFP + '?tab=scenarios');
    await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0);
    await page.getByRole('button', { name: 'Add a scenario' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add a scenario' });
    await dlg.getByLabel('Name').fill('Slow burn');
    await dlg.getByLabel('Hires a month').fill('0.5');
    await dlg.getByLabel('Attrition a year').fill('6');
    await dlg.getByLabel('Average CTC').fill('700000');
    await dlg.getByRole('button', { name: 'Save scenario' }).click();
    await expect(page.getByRole('heading', { name: 'Slow burn' })).toBeVisible();
    await page.getByLabel('Compare A').selectOption({ label: 'Slow burn' });
    await page.getByLabel('Compare B').selectOption({ label: 'Aggressive growth' });
    const a = E.projectScenario({ hiresPerMonth: 0.5, attritionPct: 6, avgCtc: 700000 }, 24, '2026-11', '2027-03', 0);
    const b = E.projectScenario(seed.scenarios[2]!, 24, '2026-11', '2027-03', 0);
    const diff = Math.round((b.endHeadcount - a.endHeadcount) * 10) / 10;
    await expect(page.getByTestId('cmp-hc')).toContainText(String(a.endHeadcount));
    await expect(page.getByTestId('cmp-hc')).toContainText(String(b.endHeadcount));
    await expect(page.getByTestId('cmp-hc')).toContainText(`+${diff}`);
    await expect(page.getByTestId('compare-summary')).toContainText(`${diff} more people than`);
    await expect(page.getByTestId('compare-chart')).toBeVisible();
    await page.getByLabel('Compare B').selectOption({ label: 'Slow burn' });
    await expect(page.getByTestId('compare-summary')).toContainText('Pick two different scenarios');
    await page.getByRole('button', { name: 'Delete Slow burn' }).click();
    await expect(page.getByRole('heading', { name: 'Slow burn' })).toHaveCount(0);
    expect((await readArea(page)).scenarios).toHaveLength(3);
    await expect(page.getByLabel('Compare A')).toHaveValue('scn_base');                       // the choice fell back to something that exists
  });
});

test.describe('workforce planning, narrow screen', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  for (const tab of ['headcount', 'budget', 'attrition', 'scenarios']) {
    test(`no sideways page scroll at 390px: ${tab}`, async ({ page }) => {
      await openHrms(page, `${WFP}?tab=${tab}`);
      await page.waitForTimeout(700);
      await expectNoSideScroll(page);
    });
  }
  test('the edit-plan grid scrolls inside its own box', async ({ page }) => {
    await openHrms(page, WFP);
    await page.getByRole('button', { name: 'Edit plan' }).click();
    await expect(page.getByTestId('edit-plan')).toBeVisible();
    await expectNoSideScroll(page);
  });
});

// ═════════════════════════════ performance screens ═════════════════════════════
test.describe('performance page: cycle', () => {
  test('shows the five stages with status from today, completion by department, and the pay principle', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, PERF);
    await expect(page.getByRole('heading', { name: 'Performance', level: 1 })).toBeVisible();
    await expect(page.getByTestId('perf-principle')).toContainText('Ratings never drive pay automatically');
    await expect(page.getByTestId('perf-principle').getByRole('link', { name: 'Compensation' })).toHaveAttribute('href', '/dashboard/hrms/compensation');
    await expect(page.getByTestId('timeline').getByRole('listitem')).toHaveCount(5);
    for (const [k, v] of Object.entries({ goals: 'done', self: 'done', manager: 'in_progress', calibration: 'upcoming', results: 'upcoming' })) {
      await expect(page.getByTestId(`stage-${k}`)).toHaveAttribute('data-state', v);
    }
    await expect(page.getByTestId('cycle-total')).toContainText('self 18/20');
    await expect(page.getByTestId('cycle-total')).toContainText('manager 15/20');
    const sales = page.getByRole('row', { name: /Sales & Field/ });
    await expect(sales).toContainText('8/8');
    await expect(sales).toContainText('7/8');
    await expect(page.getByRole('row', { name: /Finance/ }).getByRole('button', { name: 'Remind Finance' })).toBeDisabled();   // everyone has submitted
    expect(errors).toEqual([]);
  });

  test('a reminder is logged (and labelled a simulation); the dates can be edited, status follows, and overlaps are refused', async ({ page }) => {
    await openHrms(page, PERF);
    await expect(page.getByText('SIMULATION')).toBeVisible();
    await page.getByRole('button', { name: 'Remind Warehouse' }).click();
    await expect(page.getByTestId('reminder-log')).toContainText('reminder to Warehouse');
    await page.getByRole('button', { name: 'Edit dates' }).click();
    const dlg = page.getByRole('dialog', { name: 'Edit cycle dates' });
    await dlg.locator('#cy-calibration-s').fill('2026-11-10');                                // before manager review ends
    await dlg.getByRole('button', { name: 'Save dates' }).click();
    await expect(dlg.getByRole('note')).toContainText('cannot start before Manager review ends');
    await dlg.locator('#cy-calibration-s').fill('2026-11-07');
    await dlg.locator('#cy-manager-e').fill('2026-11-06');
    await dlg.getByRole('button', { name: 'Save dates' }).click();
    await expect(page.getByTestId('stage-manager')).toHaveAttribute('data-state', 'done');
    await expect(page.getByTestId('stage-calibration')).toHaveAttribute('data-state', 'in_progress');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    await expect(page.getByTestId('stage-calibration')).toHaveAttribute('data-state', 'in_progress');
    expect((await readArea(page)).cycle.reminders[0]).toMatchObject({ on: today, departmentId: 'dep_wh' });
  });
});

test.describe('performance page: goals', () => {
  test('team roll-up and a person\'s goals, with status derived from progress against time', async ({ page }) => {
    await openHrms(page, PERF + '?tab=goals');
    const reports = Object.fromEntries(seed.reviews.map((r) => [r.employeeId, r.managerId]));
    const rohit = P.teamRollups(seed.goals, reports, today).find((r) => r.managerId === 'emp_4')!;
    await expect(page.getByTestId('rollup').getByRole('row', { name: /Rohit Chauhan/ })).toContainText(`${rohit.progress}%`);
    await expect(page.getByTestId('rollup').getByRole('row', { name: /Ritu Malhotra/ })).toContainText('at risk');
    await page.getByRole('button', { name: 'Show the team of Rohit Chauhan' }).click();
    await expect(page.getByLabel('Team', { exact: true })).toHaveValue('emp_4');
    const people = await page.getByLabel('Person', { exact: true }).locator('option').allInnerTexts();
    expect(people.map((p) => p.replace(/ \(.*/, '')).sort()).toEqual(['Farhan Ali', 'Gaurav Saxena', 'Imran Sheikh', 'Pooja Verma']);
    await page.getByLabel('Person', { exact: true }).selectOption('emp_6');
    const g = seed.goals.find((x) => x.id === 'g_emp_6_1')!;
    const s = P.goalStatus(g, today);
    await expect(page.getByTestId('goal-g_emp_6_1')).toHaveAttribute('data-status', s.status);
    await expect(page.getByTestId('goal-g_emp_6_1')).toContainText(`${s.progress}% done`);
    await expect(page.getByTestId('person-progress')).toContainText(`${P.personProgress(seed.goals.filter((x) => x.employeeId === 'emp_6'))}%`);
  });

  test('field goals use the field incentive plan numbers (three times the monthly target)', async ({ page }) => {
    await openHrms(page, PERF + '?tab=goals');
    await page.getByLabel('Person', { exact: true }).selectOption('emp_6');
    const ev = getFieldEvidence();
    const monthly = ev.targets.find((t) => t.employeeId === 'emp_6' && t.month === '2026-10')!;
    const card = page.getByTestId('goal-g_emp_6_1');
    await expect(card).toContainText(inrShort(monthly.revenue * 3));
    await expect(card).toContainText('three times the monthly target in the field incentive plan');
    await expect(card).toContainText(inrShort(seed.goals.find((g) => g.id === 'g_emp_6_1')!.keyResults[0]!.current));
    await expect(page.getByTestId('goal-g_emp_6_2')).toContainText(`${ev.plan.minCollectionPct}%`);
  });

  test('a progress update needs a comment, changes the status and survives a reload', async ({ page }) => {
    await openHrms(page, PERF + '?tab=goals');
    await page.getByLabel('Person', { exact: true }).selectOption('emp_5');
    const card = page.getByTestId('goal-g_emp_5_2');
    await expect(card).toHaveAttribute('data-status', 'behind');
    await card.getByRole('button', { name: 'Update Pull requests reviewed within one day' }).click();
    const dlg = page.getByRole('dialog', { name: 'Update progress' });
    await dlg.getByLabel(/New value/).fill('72');
    await expect(dlg.getByRole('button', { name: 'Save update' })).toBeDisabled();             // a number alone is not enough
    await dlg.getByLabel('Comment').fill('Review rota is working.');
    await dlg.getByRole('button', { name: 'Save update' }).click();
    await expect(card).toHaveAttribute('data-status', 'on_track');                             // 55% done against 60% of the time
    await expect(card).toContainText('Review rota is working.');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    await page.getByLabel('Person', { exact: true }).selectOption('emp_5');
    await expect(page.getByTestId('goal-g_emp_5_2')).toHaveAttribute('data-status', 'on_track');
    const g = (await readArea(page)).goals.find((x) => x.id === 'g_emp_5_2')!;
    expect(g.keyResults[0]!.current).toBe(72);
    expect(g.updates[0]).toMatchObject({ value: 72, comment: 'Review rota is working.', on: today });
  });

  test('add a goal for a person with key results; weights over 100 are flagged; a goal can be edited and deleted', async ({ page }) => {
    await openHrms(page, PERF + '?tab=goals');
    await page.getByLabel('Person', { exact: true }).selectOption('emp_18');
    await page.getByRole('button', { name: 'Add goal' }).click();
    let dlg = page.getByRole('dialog', { name: 'Add goal' });
    await expect(dlg.getByRole('button', { name: 'Save goal' })).toBeDisabled();
    await dlg.getByLabel('Objective').fill('Improve the joiner survey');
    await dlg.getByLabel('Weight (%)').fill('20');
    await dlg.getByLabel('Key result 1', { exact: true }).fill('Survey score out of ten');
    await dlg.locator('#kr-0-g').fill('9');
    await dlg.locator('#kr-0-c').fill('6');
    await dlg.getByRole('button', { name: 'Save goal' }).click();
    await expect(page.getByText('Improve the joiner survey')).toBeVisible();
    await expect(page.getByText('Goal weights add up to 120%')).toBeVisible();
    let a = await readArea(page);
    const goal = a.goals.find((g) => g.title === 'Improve the joiner survey')!;
    expect(goal.keyResults[0]).toMatchObject({ target: 9, current: 6, start: 0 });
    // edit: raise 'now' and the progress follows
    await page.getByRole('button', { name: 'Edit Improve the joiner survey' }).click();
    dlg = page.getByRole('dialog', { name: 'Edit goal' });
    await dlg.locator('#kr-0-c').fill('9');
    await dlg.getByRole('button', { name: 'Save goal' }).click();
    await expect(page.getByTestId(`goal-${goal.id}`)).toHaveAttribute('data-status', 'done');
    // delete
    await page.getByRole('button', { name: 'Edit Improve the joiner survey' }).click();
    await page.getByRole('dialog', { name: 'Edit goal' }).getByRole('button', { name: 'Delete goal' }).click();
    await expect(page.getByText('Improve the joiner survey')).toHaveCount(0);
    a = await readArea(page);
    expect(a.goals.some((g) => g.id === goal.id)).toBe(false);
  });
});

test.describe('performance page: reviews', () => {
  test('the employee cannot see what the manager wrote until the manager submits, and a submitted review is locked', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, PERF + '?tab=reviews');
    await page.getByRole('button', { name: 'Open review for Rekha More' }).click();      // self review submitted, manager review not started
    const modal = page.getByTestId('review-modal');
    await expect(modal).toHaveAttribute('data-role', 'hr');
    await expect(modal.getByTestId('form-manager')).toBeVisible();                        // HR can read it (empty so far)
    await modal.getByRole('tab', { name: 'Employee' }).click();
    await expect(modal.getByTestId('manager-hidden')).toContainText('has not submitted');
    await expect(modal.getByTestId('form-manager')).toHaveCount(0);

    // the manager writes a draft: the employee still sees nothing
    await modal.getByRole('tab', { name: 'Manager' }).click();
    await expect(modal.getByTestId('form-manager')).toHaveAttribute('data-locked', 'false');
    await modal.locator('#manager-str').fill('ZZ-draft-strength-text');
    await modal.getByRole('button', { name: 'Save draft' }).click();
    await modal.getByRole('tab', { name: 'Employee' }).click();
    await expect(modal.getByText('ZZ-draft-strength-text')).toHaveCount(0);
    await expect(modal.getByTestId('manager-hidden')).toBeVisible();

    // submit needs a complete form
    await modal.getByRole('tab', { name: 'Manager' }).click();
    await expect(modal.getByRole('button', { name: 'Submit and lock' })).toBeDisabled();
    await expect(modal.getByTestId('manager-problems')).toContainText('Rate every competency');
    for (const c of ['Delivery', 'Quality of work', 'Collaboration', 'Ownership', 'Learning and growth']) {
      await modal.getByRole('radio', { name: new RegExp(`^Manager rating, ${c}: 4 of 5`) }).click();
    }
    await modal.locator('#manager-dev').fill('Plan the shift handover in writing.');
    await modal.getByRole('radio', { name: /^Manager overall rating: 4 of 5/ }).click();
    await modal.getByRole('button', { name: 'Submit and lock' }).click();
    await expect(modal.getByTestId('form-manager')).toHaveAttribute('data-locked', 'true');
    await expect(modal.getByRole('radio', { name: /^Manager overall rating: 5 of 5/ })).toBeDisabled();
    await expect(modal.locator('#manager-str')).toBeDisabled();

    // now the employee can read it
    await modal.getByRole('tab', { name: 'Employee' }).click();
    await expect(modal.getByTestId('form-manager')).toBeVisible();
    await expect(modal.getByTestId('manager-overall')).toContainText('4 · Exceeds');
    await expect(modal.locator('#manager-str')).toHaveValue('ZZ-draft-strength-text');
    await expect(modal.getByTestId('manager-hidden')).toHaveCount(0);

    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    await page.getByRole('button', { name: 'Open review for Rekha More' }).click();
    await expect(page.getByTestId('form-manager')).toHaveAttribute('data-locked', 'true');
    const r = (await readArea(page)).reviews.find((x) => x.employeeId === 'emp_14')!;
    expect(r.manager).toMatchObject({ overall: 4, submittedOn: today });
    expect(errors).toEqual([]);
  });

  test('a manager sees the self review only after the employee submits; the employee\'s own review locks on submit', async ({ page }) => {
    await openHrms(page, PERF + '?tab=reviews');
    await page.getByRole('button', { name: 'Open review for Meenal Shah' }).click();     // nothing submitted yet
    const modal = page.getByTestId('review-modal');
    await modal.getByRole('tab', { name: 'Manager' }).click();
    await expect(modal.getByTestId('self-hidden')).toBeVisible();
    await expect(modal.getByTestId('form-self')).toHaveCount(0);
    await modal.getByRole('tab', { name: 'Employee' }).click();
    const self = modal.getByTestId('form-self');
    await expect(self).toHaveAttribute('data-locked', 'false');
    await expect(modal.getByTestId('manager-hidden')).toBeVisible();
    for (const c of ['Delivery', 'Quality of work', 'Collaboration', 'Ownership', 'Learning and growth']) {
      await self.getByRole('radio', { name: new RegExp(`^Self rating, ${c}: 3 of 5`) }).click();
    }
    await modal.locator('#self-str').fill('Learns fast.');
    await modal.locator('#self-dev').fill('Speak up in meetings.');
    await self.getByRole('radio', { name: /^Self overall rating: 3 of 5/ }).click();
    await self.getByRole('button', { name: 'Submit and lock' }).click();
    await expect(self).toHaveAttribute('data-locked', 'true');
    await expect(self.getByRole('button', { name: 'Submit and lock' })).toHaveCount(0);
    await modal.getByRole('tab', { name: 'Manager' }).click();
    await expect(modal.getByTestId('form-self')).toBeVisible();                           // visible to the manager now
    await expect(modal.getByTestId('self-overall')).toContainText('3 · Meets expectations');
    await expect(modal.getByTestId('form-manager')).toHaveAttribute('data-locked', 'false');
    await expect(modal.getByTestId('form-self').getByRole('radio', { name: /^Self overall rating: 4 of 5/ })).toBeDisabled();
  });

  test('the list filters by who is waiting, and counts follow submissions', async ({ page }) => {
    await openHrms(page, PERF + '?tab=reviews');
    await expect(page.getByRole('row')).toHaveCount(21);
    await page.getByLabel('Show', { exact: true }).selectOption('self');
    await expect(page.getByRole('row')).toHaveCount(3);                                    // header + 2 (Dinesh Kamble, Meenal Shah)
    await page.getByLabel('Show', { exact: true }).selectOption('manager');
    await expect(page.getByRole('row')).toHaveCount(6);                                    // 5 managers still to submit
    await page.getByLabel('Show', { exact: true }).selectOption('done');
    await expect(page.getByRole('row')).toHaveCount(16);                                   // 15 with both
    await page.getByLabel('Department', { exact: true }).selectOption('dep_wh');
    await expect(page.getByRole('row')).toHaveCount(2);
    await expect(page.getByRole('row', { name: /Manoj Patil/ })).toContainText('Submitted');
  });

  test('360 feedback: below three responses only a count is shown; the third response reveals an anonymous average', async ({ page }) => {
    await openHrms(page, PERF + '?tab=reviews');
    await page.getByRole('button', { name: 'Open review for Imran Sheikh' }).click();
    const fb = page.getByTestId('feedback-360');
    await expect(page.getByTestId('feedback-count')).toHaveText('2 of 4 asked have responded.');
    await expect(page.getByTestId('feedback-hidden')).toContainText('1 more response is needed to reach the minimum of 3');
    await expect(page.getByTestId('feedback-aggregate')).toHaveCount(0);
    await expect(fb).not.toContainText('Generous with leads');                              // the one comment so far is not readable
    await page.getByLabel('Respond as').selectOption({ label: 'Farhan Ali' });
    const panel = page.getByTestId('respond-panel');
    await expect(panel.getByRole('button', { name: 'Submit feedback' })).toBeDisabled();
    for (const c of ['Delivery', 'Quality of work', 'Collaboration', 'Ownership', 'Learning and growth']) await panel.getByRole('radio', { name: new RegExp(`^Peer rating, ${c}: 5 of 5`) }).click();
    await panel.getByLabel('One comment (optional)').fill('Always shares the route plan early.');
    await panel.getByRole('button', { name: 'Submit feedback' }).click();
    await expect(page.getByTestId('feedback-count')).toHaveText('3 of 4 asked have responded.');
    await expect(page.getByTestId('feedback-hidden')).toHaveCount(0);
    const agg = page.getByTestId('feedback-aggregate');
    await expect(agg).toBeVisible();
    const sum = P.feedbackSummary([
      ...seed.reviews.find((r) => r.employeeId === 'emp_6')!.feedback.filter((f) => f.status === 'submitted'),
      { id: 'n', reviewerId: 'emp_20', requestedOn: today, status: 'submitted', ratings: { Delivery: 5, 'Quality of work': 5, Collaboration: 5, Ownership: 5, 'Learning and growth': 5 }, comment: 'x' },
    ]);
    await expect(agg).toContainText(`${sum.averages[0]!.average.toFixed(1)} / 5`);
    await expect(agg).toContainText('Generous with leads and tips from the field.');
    await expect(agg).toContainText('Comments, not attributed');
    await expect(agg).not.toContainText('Farhan');                                          // nothing says who wrote what
    // the employee sees the same anonymous result and no names of who was asked
    await page.getByRole('tab', { name: 'Employee' }).click();
    await expect(page.getByTestId('feedback-aggregate')).toBeVisible();
    await expect(page.getByTestId('feedback-360')).not.toContainText('Asked:');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    expect((await readArea(page)).reviews.find((r) => r.employeeId === 'emp_6')!.feedback.filter((f) => f.status === 'submitted')).toHaveLength(3);
  });

  test('360 feedback can be requested only from at least three people, never from the person being reviewed', async ({ page }) => {
    await openHrms(page, PERF + '?tab=reviews');
    await page.getByRole('button', { name: 'Open review for Harish Reddy' }).click();
    const fb = page.getByTestId('feedback-360');
    await expect(page.getByTestId('feedback-count')).toHaveText('No feedback has been requested yet.');
    await expect(fb.getByRole('checkbox', { name: 'Harish Reddy' })).toHaveCount(0);        // cannot ask for feedback from yourself
    await fb.getByRole('checkbox', { name: 'Neha Bansal' }).check();
    await fb.getByRole('checkbox', { name: 'Divya Menon' }).check();
    await fb.getByRole('button', { name: 'Request feedback' }).click();
    await expect(fb.getByRole('note').first()).toContainText('Ask at least 3 people');
    await fb.getByRole('checkbox', { name: 'Vikram Joshi' }).check();
    await fb.getByRole('button', { name: 'Request feedback' }).click();
    await expect(page.getByTestId('feedback-count')).toHaveText('0 of 3 asked have responded.');
    await expect(fb.getByRole('checkbox', { name: 'Neha Bansal' })).toBeDisabled();           // already asked
    expect((await readArea(page)).reviews.find((r) => r.employeeId === 'emp_17')!.feedback).toHaveLength(3);
  });
});

test.describe('performance page: calibration', () => {
  test('the distribution is an aggregate, a group under five has no chart, and a manager view hides individual ratings', async ({ page }) => {
    await openHrms(page, PERF + '?tab=calibration');
    await expect(page.getByTestId('calibration')).toContainText('No forced distribution is applied');
    await expect(page.getByTestId('dist-chart')).toBeVisible();
    await expect(page.getByTestId('dist-text')).toContainText('1: 0 · 2: 1 · 3: 5 · 4: 7 · 5: 2');
    await expect(page.getByTestId('dist-chart')).not.toContainText('Pooja');                   // counts only, no names
    await page.getByLabel('Group', { exact: true }).selectOption({ label: 'Sales & Field' });
    await expect(page.getByTestId('dist-chart')).toBeVisible();                                // 8 people
    await expect(page.getByTestId('dist-text')).toContainText('2: 1 · 3: 2 · 4: 3 · 5: 1');
    await page.getByLabel('Group', { exact: true }).selectOption({ label: 'Operations' });                      // 3 people
    await expect(page.getByTestId('dist-hidden')).toContainText('fewer than 5 people');
    await expect(page.getByTestId('dist-chart')).toHaveCount(0);
    await expect(page.getByTestId('calibration-table').getByRole('row')).toHaveCount(4);       // HR still sees them in the table
    await page.getByRole('tab', { name: 'Manager' }).click();
    await expect(page.getByTestId('table-hidden')).toContainText('visible only to HR');
    await expect(page.getByTestId('calibration-table')).toHaveCount(0);
    await expect(page.getByTestId('calibration')).toHaveAttribute('data-viewer', 'manager');
  });

  test('moving a rating needs a written reason, is logged with who and when, keeps the manager\'s rating, and survives a reload', async ({ page }) => {
    await openHrms(page, PERF + '?tab=calibration');
    await expect(page.getByTestId('move-log-empty')).toBeVisible();
    await page.getByRole('button', { name: 'Move the rating of Pooja Verma' }).click();
    const dlg = page.getByRole('dialog', { name: 'Move the rating of Pooja Verma' });
    await expect(dlg.getByRole('button', { name: 'Move and log' })).toBeDisabled();
    await dlg.getByLabel('New rating').selectOption('3');
    await dlg.getByLabel('Reason').fill('too short');
    await expect(dlg.getByRole('button', { name: 'Move and log' })).toBeDisabled();
    await dlg.getByLabel('Reason').fill('Covered two beats for three weeks while a colleague was away.');
    await dlg.getByRole('button', { name: 'Move and log' }).click();
    await expect(page.getByTestId('move-log')).toContainText('Pooja Verma: 2 to 3');
    await expect(page.getByTestId('move-log')).toContainText('Covered two beats for three weeks');
    await expect(page.getByTestId('move-log')).toContainText('You (HR admin)');
    await expect(page.getByTestId('dist-text')).toContainText('2: 0 · 3: 6 · 4: 7 · 5: 2');
    await expect(page.getByRole('row', { name: /Pooja Verma/ })).toContainText('(moved)');
    await expect(page.getByRole('row', { name: /Pooja Verma/ })).toContainText('2');           // the manager column still says 2
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    await expect(page.getByTestId('move-log')).toContainText('Pooja Verma: 2 to 3');
    const r = (await readArea(page)).reviews.find((x) => x.employeeId === 'emp_7')!;
    expect(r.manager.overall).toBe(2);
    expect(r.moves).toHaveLength(1);
    expect(r.moves[0]).toMatchObject({ from: 2, to: 3, on: today });
    // the log names people, so a manager view does not show it
    await page.getByRole('tab', { name: 'Manager' }).click();
    await expect(page.getByTestId('move-log')).toHaveCount(0);
  });

  test('a rating that the manager has not submitted cannot be moved', async ({ page }) => {
    await openHrms(page, PERF + '?tab=calibration');
    await expect(page.getByRole('button', { name: 'Move the rating of Rekha More' })).toBeDisabled();
  });
});

test.describe('performance page: 1:1s', () => {
  test('private notes are visible only to their author; HR sees a count of the hidden ones', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, PERF + '?tab=one-on-ones');
    await page.getByRole('button', { name: '1:1 Rohit Chauhan with Imran Sheikh' }).click();
    const thread = page.getByTestId('thread');
    await expect(thread).toHaveAttribute('data-role', 'manager');
    await expect(thread.locator('[data-private="true"]')).toHaveCount(1);                    // the manager's own private note
    await expect(thread).toContainText('Rating discussion later this month');
    await expect(thread).not.toContainText('Bengaluru trip');                                // the report's private note
    await expect(page.getByTestId('hidden-notes')).toContainText('1 private note is hidden');
    await thread.getByRole('tab', { name: 'Report' }).click();
    await expect(thread).toContainText('Bengaluru trip');
    await expect(thread).not.toContainText('Rating discussion later this month');
    await thread.getByRole('tab', { name: 'HR' }).click();
    await expect(thread.locator('[data-private="true"]')).toHaveCount(0);
    await expect(page.getByTestId('hidden-notes')).toContainText('2 private notes are hidden');
    await expect(thread.getByRole('button', { name: 'Add note' })).toHaveCount(0);           // HR reads, does not write
    await expect(thread.getByLabel('Next 1:1')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('a new private note is stored as private, shows a Private badge to its author and stays hidden from the others', async ({ page }) => {
    await openHrms(page, PERF + '?tab=one-on-ones');
    await page.getByRole('button', { name: '1:1 Rohit Chauhan with Imran Sheikh' }).click();
    const thread = page.getByTestId('thread');
    await thread.getByLabel('New note').fill('ZZ-private-thought about the quarter');
    await thread.getByLabel(/Private \(only I can read it\)/).check();
    await thread.getByRole('button', { name: 'Add note' }).click();
    await expect(thread.locator('[data-private="true"]')).toHaveCount(2);
    await expect(thread.getByText('ZZ-private-thought about the quarter')).toBeVisible();
    await thread.getByRole('tab', { name: 'Report' }).click();
    await expect(thread.getByText('ZZ-private-thought')).toHaveCount(0);
    await thread.getByRole('tab', { name: 'HR' }).click();
    await expect(thread.getByText('ZZ-private-thought')).toHaveCount(0);
    await expect(page.getByTestId('hidden-notes')).toContainText('3 private notes are hidden');
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    const n = (await readArea(page)).threads.find((t) => t.id === 'oo_4_6')!.notes[0]!;
    expect(n).toMatchObject({ private: true, authorRole: 'manager', on: today });
  });

  test('action items change status and persist; the next 1:1 date can be set; overdue is flagged', async ({ page }) => {
    await openHrms(page, PERF + '?tab=one-on-ones');
    await page.getByRole('button', { name: '1:1 Rohit Chauhan with Imran Sheikh' }).click();
    const thread = page.getByTestId('thread');
    await thread.getByLabel('Status of Share the collections tracker').selectOption('done');
    await thread.getByLabel('New action item').fill('Visit two South Delhi dealers together');
    await thread.getByLabel('Due date').fill('2026-11-20');
    await thread.getByRole('button', { name: 'Add action' }).click();
    await expect(page.getByTestId('actions')).toContainText('Visit two South Delhi dealers together');
    await thread.getByLabel('Next 1:1').fill('2026-11-17');
    await thread.getByRole('button', { name: 'Save date' }).click();
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    await page.getByRole('button', { name: /1:1 Rohit Chauhan with Imran Sheikh/ }).click();
    await expect(page.getByTestId('actions').locator('select').nth(1)).toHaveValue('done');
    await expect(page.getByTestId('thread').getByLabel('Next 1:1')).toHaveValue('2026-11-17');
    const t = (await readArea(page)).threads.find((x) => x.id === 'oo_4_6')!;
    expect(t.nextOn).toBe('2026-11-17');
    expect(t.actions.find((a) => a.text === 'Share the collections tracker')!.status).toBe('done');
    expect(t.actions.find((a) => a.text === 'Visit two South Delhi dealers together')).toMatchObject({ status: 'open', due: '2026-11-20', owner: 'report' });
    // an action past its due date is flagged
    await page.evaluate((k) => {
      const a = JSON.parse(localStorage.getItem(k) as string);
      a.threads.find((x: { id: string }) => x.id === 'oo_4_6').actions[0].due = '2026-11-02';
      localStorage.setItem(k, JSON.stringify(a));
    }, AREA_KEY);
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    await expect(page.getByRole('button', { name: /1:1 Rohit Chauhan with Imran Sheikh/ })).toContainText('overdue');
  });

  test('a manager and report pair can be added, but not twice and not with oneself', async ({ page }) => {
    await openHrms(page, PERF + '?tab=one-on-ones');
    await page.getByRole('button', { name: 'Add a pair' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add a 1:1 pair' });
    await expect(dlg.getByRole('button', { name: 'Add pair' })).toBeDisabled();
    await dlg.getByLabel('Manager').selectOption({ label: 'Ritu Malhotra' });
    await dlg.getByLabel('Report').selectOption({ label: 'Ritu Malhotra' });
    await dlg.getByRole('button', { name: 'Add pair' }).click();
    await expect(dlg.getByRole('note')).toContainText('cannot hold a 1:1 with themselves');
    await dlg.getByLabel('Report').selectOption({ label: 'Tanvi Kapoor' });
    await dlg.getByRole('button', { name: 'Add pair' }).click();
    await expect(page.getByRole('button', { name: '1:1 Ritu Malhotra with Tanvi Kapoor' })).toBeVisible();
    await expect(page.getByTestId('thread')).toContainText('Tanvi Kapoor, 1:1 with Ritu Malhotra');
    expect((await readArea(page)).threads).toHaveLength(7);
  });
});

test.describe('performance, narrow screen', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  for (const tab of ['cycle', 'goals', 'reviews', 'calibration', 'one-on-ones']) {
    test(`no sideways page scroll at 390px: ${tab}`, async ({ page }) => {
      await openHrms(page, `${PERF}?tab=${tab}`);
      await page.waitForTimeout(700);
      await expectNoSideScroll(page);
    });
  }
  test('a review opens and fits at 390px', async ({ page }) => {
    await openHrms(page, PERF + '?tab=reviews');
    await page.getByRole('button', { name: 'Open review for Imran Sheikh' }).click();
    await expect(page.getByTestId('review-modal')).toBeVisible();
    await expectNoSideScroll(page);
  });
});

test.describe('reset', () => {
  test('Reset sample data returns the talent area to its seed', async ({ page }) => {
    await openHrms(page, REC);
    await page.getByRole('button', { name: 'Move Amit Tyagi to Screen' }).click();
    await expect.poll(async () => (await readArea(page)).candidates.find((c) => c.name === 'Amit Tyagi')!.stage).toBe('screen');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Reset sample data' }).click();
    await expect(page.getByTestId('col-applied')).toContainText('Amit Tyagi');
    expect((await readArea(page)).candidates.find((c) => c.name === 'Amit Tyagi')!.stage).toBe('applied');
  });
});
