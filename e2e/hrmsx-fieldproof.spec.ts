import { test, expect, type Page } from '@playwright/test';
import { openHrms } from './hrms-utils';
import { getFieldEvidence, toMin } from '../src/lib/hrms/field/evidence';
import { fmtDate } from '../src/lib/hrms/format';
import { INTEGRITY_RULES, REGULARISATION_POLICY, FLAG_LABEL, integrityFlags, regularisationCandidates, regularisationFor } from '../src/lib/hrms/field/engines';
import type { RegDecision, FlagReview } from '../src/lib/hrms/field/store';
import {
  VERIFIED_VISIT_RULE, approveAllPlan, dayStatus, finalTimes, monthCounts, monthDates, partition, policySentences, reviewStats, ruleChecks, spanText,
  timelineFor, validateTimes, visitProblems,
} from '../src/lib/hrms/fieldproof/logic';
import {
  NO_FILTERS, NO_REPLY_NOTE, claimsForReceipt, confirmGate, dayNumbers, decisionNote, devicePunches, filterFlags, flagStats, humanise, mergeFlags, ruleRows, travelPair,
} from '../src/lib/hrms/fieldproof/flags';

/**
 * Visit attendance (proof-of-work regularisation) and Integrity checks. The first block is pure logic over the field
 * evidence, with no browser. The rest drive the two pages. Both read the same deterministic evidence, so expected numbers
 * are worked out here from the engines, not typed in.
 */

const ev = getFieldEvidence();
const candidates = regularisationCandidates(ev);
const flags = integrityFlags(ev);
const FIELD_KEY = 'kinematic_hrms_area_field_v1';
const slow = { timeout: 60_000 };
const NAMES: Record<string, string> = {
  emp_4: 'Rohit Chauhan', emp_6: 'Imran Sheikh', emp_7: 'Pooja Verma', emp_8: 'Karthik Subramanian', emp_9: 'Sana Qureshi', emp_19: 'Gaurav Saxena', emp_20: 'Farhan Ali', emp_22: 'Yash Rathore',
};
const nameOf = (id: string) => NAMES[id] ?? id;
const readField = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), FIELD_KEY);
const approved = (emp: string, date: string, extra: Partial<RegDecision> = {}): RegDecision => ({ status: 'approved', by: 'x', at: '2026-11-07T10:00:00.000Z', ...extra });

// ═════════════════════════════ visit attendance: logic ═════════════════════════════
test.describe('visit attendance logic', () => {
  test('the verified-visit rule written on the page is the rule the evidence applies', () => {
    for (const v of ev.visits) {
      const problems = visitProblems(v);
      expect(problems.length === 0, v.id).toBe(v.verified);
    }
    expect(VERIFIED_VISIT_RULE).toEqual({ maxDistanceM: 150, minMinutes: 5, needsPhoto: true });
    const far = ev.visits.find((v) => v.distanceFromOutletM > 150 && v.photo && toMin(v.end) - toMin(v.start) >= 5)!;
    expect(visitProblems(far)).toEqual([`phone was ${far.distanceFromOutletM} m from the outlet, the limit is 150 m`]);
    expect(visitProblems({ distanceFromOutletM: 20, photo: false, start: '10:00', end: '10:03' })).toEqual(['no photo was taken', 'only 3 minutes on site, 5 are needed']);
  });

  test('the policy sentences quote the numbers in REGULARISATION_POLICY', () => {
    const p = policySentences();
    const P = REGULARISATION_POLICY;
    expect(p.rule.join(' ')).toContain(`At least ${P.minVerifiedVisits} verified visits`);
    expect(p.rule.join(' ')).toContain(`at least ${P.minSpanMin / 60} hours`);
    expect(p.rule.join(' ')).toContain(`at least ${P.minTrailKm} km`);
    expect(p.times.join(' ')).toContain(`${P.bufferMin} minutes before the first verified visit`);
    expect(p.times.join(' ')).toContain(`${P.bufferMin} minutes after the last verified visit`);
    expect(p.visit.join(' ')).toContain('150 m');
    expect(p.advisory.join(' ')).toContain('a manager has to decide');
  });

  test('the list starts as eight waiting days, four of them auto-approvable; decisions move them across', () => {
    expect(candidates).toHaveLength(8);
    expect(reviewStats(candidates, {})).toEqual({ waiting: 8, autoApprovable: 4, approved: 0, rejected: 0, infoRequested: 0 });
    const regs: Record<string, RegDecision> = {
      'emp_6|2026-10-14': approved('emp_6', '2026-10-14'),
      'emp_7|2026-10-20': { status: 'rejected', by: 'x', at: 'y', note: 'n' },
      'emp_22|2026-11-05': { status: 'info_requested', by: 'x', at: 'y', note: 'n' },
    };
    expect(reviewStats(candidates, regs)).toEqual({ waiting: 5, autoApprovable: 3, approved: 1, rejected: 1, infoRequested: 1 });
    const { pending, decided } = partition(candidates, regs);
    expect(pending).toHaveLength(5);
    expect(decided.map((d) => `${d.s.employeeId}|${d.s.date}`).sort()).toEqual(Object.keys(regs).sort());
    expect(pending.length + decided.length).toBe(candidates.length);
  });

  test('final times keep the punch that exists and fill the one that is missing; approve-all uses them', () => {
    const s = (id: string, date: string) => candidates.find((c) => c.employeeId === id && c.date === date)!;
    expect(finalTimes(ev, s('emp_6', '2026-10-14'))).toEqual({ in: '09:18', out: '15:38' });          // out was missing, in kept
    expect(finalTimes(ev, s('emp_9', '2026-10-08'))).toEqual({ in: '09:27', out: '14:28' });          // both missing
    expect(finalTimes(ev, s('emp_22', '2026-11-05'))).toEqual({ in: '', out: '' });                  // nothing to suggest
    const plan = approveAllPlan(ev, candidates);
    expect(plan.map((p) => `${p.employeeId}|${p.date}`).sort()).toEqual(['emp_20|2026-10-14', 'emp_6|2026-10-08', 'emp_6|2026-10-14', 'emp_9|2026-10-08']);
    for (const p of plan) expect(validateTimes(p.in, p.out)).toBeNull();
    // a day that is already decided is not in the plan
    expect(approveAllPlan(ev, partition(candidates, { 'emp_6|2026-10-14': approved('emp_6', '2026-10-14') }).pending)).toHaveLength(3);
  });

  test('times are validated: both present, valid, and out after in', () => {
    expect(validateTimes('', '15:00')).toBe('Enter the punch-in time.');
    expect(validateTimes('09:00', '')).toBe('Enter the punch-out time.');
    expect(validateTimes('09:00', '25:00')).toBe('Enter the punch-out time.');
    expect(validateTimes('15:00', '15:00')).toBe('Punch-out must be after punch-in.');
    expect(validateTimes('09:00', '18:30')).toBeNull();
  });

  test('the day timeline is in time order, numbers the visits, and says why a visit did not count', () => {
    const t = timelineFor(ev, 'emp_6', '2026-10-14');
    expect(t.map((e) => e.kind)).toEqual(['punch_in', ...Array(8).fill('visit'), 'punch_out']);
    expect(t[0]).toMatchObject({ at: '09:18', title: 'Punched in' });
    expect(t[t.length - 1]).toMatchObject({ at: null, missing: true, title: 'Punch-out is missing' });
    expect(t.filter((e) => e.kind === 'visit').map((e) => e.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const times = t.filter((e) => e.at).map((e) => e.at!);
    expect([...times].sort()).toEqual(times);
    expect(t[1]!.detail).toMatch(/^Verified: \d+ m from the outlet, photo taken, \d+ minutes on site\.$/);
    // a day with an unverified visit
    const v = ev.visits.find((x) => !x.verified)!;
    const day = timelineFor(ev, v.employeeId, v.date).find((e) => e.id === v.id)!;
    expect(day.verified).toBe(false);
    expect(day.detail).toMatch(/^Not verified: phone was \d+ m from the outlet/);
    expect(timelineFor(ev, 'emp_6', '2026-10-04')).toEqual([]);   // a Sunday with no record
  });

  test('calendar status: present, missed, off days, Sunday work, absence, and days the evidence does not reach', () => {
    const st = (e: string, d: string, regs: Record<string, RegDecision> = {}) => dayStatus(ev, regs, e, d);
    expect(st('emp_6', '2026-10-15').status).toBe('present');
    expect(st('emp_6', '2026-10-14').status).toBe('missed');
    expect(st('emp_6', '2026-10-14').candidate?.verdict).toBe('auto_approve');
    expect(st('emp_6', '2026-10-14', { 'emp_6|2026-10-14': approved('emp_6', '2026-10-14') }).status).toBe('regularised');
    expect(st('emp_6', '2026-10-14', { 'emp_6|2026-10-14': { status: 'rejected', by: 'x', at: 'y' } }).status).toBe('rejected');
    expect(st('emp_6', '2026-10-14', { 'emp_6|2026-10-14': { status: 'info_requested', by: 'x', at: 'y' } }).status).toBe('info');
    expect(st('emp_6', '2026-10-04')).toMatchObject({ status: 'off', label: 'Sunday' });
    expect(st('emp_6', '2026-10-02')).toMatchObject({ status: 'off', label: 'Holiday' });
    expect(st('emp_6', '2026-10-11')).toMatchObject({ status: 'present', label: 'Present, worked on a Sunday' });
    expect(st('emp_4', '2026-11-02').status).toBe('absent');
    expect(st('emp_6', '2026-11-07').status).toBe('upcoming');
    expect(st('emp_6', '2026-09-30').status).toBe('upcoming');
    // every cell is exactly one status and the eight people times the days add up
    for (const month of ['2026-10', '2026-11']) {
      const c = monthCounts(ev, {}, month);
      expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(8 * monthDates(month).length);
    }
    expect(monthCounts(ev, {}, '2026-10').missed).toBe(6);
    expect(monthCounts(ev, {}, '2026-11').missed).toBe(2);
    expect(monthCounts(ev, { 'emp_6|2026-10-14': approved('emp_6', '2026-10-14') }, '2026-10').regularised).toBe(1);
    expect(monthDates('2026-11')).toHaveLength(30);
    expect(monthDates('2026-10')[0]).toBe('2026-10-01');
  });

  test('the rule check lists the three parts with what the day had', () => {
    const r = regularisationFor(ev, 'emp_4', '2026-11-04')!;
    const c = ruleChecks(r.evidence);
    expect(c.map((x) => x.met)).toEqual([true, false, true]);
    expect(c[1]).toMatchObject({ actual: '1h 23m', needed: 'at least 2h' });
    expect(spanText(45)).toBe('45m');
    expect(spanText(125)).toBe('2h 05m');
    expect(ruleChecks(regularisationFor(ev, 'emp_22', '2026-11-05')!.evidence)[0]).toMatchObject({ actual: '0', met: false });
  });
});

// ═════════════════════════════ integrity checks: logic ═════════════════════════════
test.describe('integrity logic', () => {
  const reviews: Record<string, FlagReview> = {
    'punch_visit_mismatch:emp_4:2026-10-29': { status: 'cleared', by: 'x', at: 'y', note: 'n' },
    'device_shared:emp_19:2026-10-06': { status: 'open', by: 'x', at: 'y', reply: { text: 'I was at the service centre.', at: 'z' } },
  };
  const rows = mergeFlags(flags, reviews, nameOf);

  test('flags merge with reviews, and the engine\'s employee ids become names', () => {
    expect(rows).toHaveLength(10);
    expect(rows.find((r) => r.id === 'punch_visit_mismatch:emp_4:2026-10-29')!.status).toBe('cleared');
    const shared = rows.find((r) => r.id === 'device_shared:emp_19:2026-10-06')!;
    expect(shared.status).toBe('open');
    expect(shared.replied).toBe(true);
    expect(rows.find((r) => r.id === 'impossible_travel:emp_8:2026-10-09')!.replied).toBe(false);
    expect(shared.title).toBe("Punch made from Farhan Ali's phone");
    expect(shared.evidence.join(' ')).toContain('Gaurav Saxena punched in at 09:05');
    for (const r of rows) { expect(r.title + r.evidence.join(' ') + r.suggestion, r.id).not.toMatch(/emp_\d/); }
    expect(humanise("emp_19 and emp_2's", (id) => `<${id}>`)).toBe("<emp_19> and <emp_2>'s");
    expect(mergeFlags(flags, {})[0]!.title).toBe(flags[0]!.title);   // without names it leaves the text alone
  });

  test('stats count flags by severity and by status, and nothing counts people', () => {
    const s = flagStats(rows);
    expect(s).toEqual({ total: 10, bySeverity: { high: 6, warning: 3, info: 1 }, byStatus: { open: 9, cleared: 1, confirmed: 0, escalated: 0 } });
    expect(Object.keys(s)).toEqual(['total', 'bySeverity', 'byStatus']);
  });

  test('filters: type, severity, status, person and text, alone and together', () => {
    const f = (o: Partial<typeof NO_FILTERS>) => filterFlags(rows, { ...NO_FILTERS, ...o }, nameOf);
    expect(f({})).toHaveLength(10);
    expect(f({ type: 'device_shared' })).toHaveLength(3);
    expect(f({ type: 'receipt_reuse' })).toHaveLength(2);
    expect(f({ severity: 'high' })).toHaveLength(6);
    expect(f({ status: 'cleared' })).toHaveLength(1);
    expect(f({ person: 'emp_20' })).toHaveLength(4);        // three shared-device days and the shared receipt
    expect(f({ person: 'emp_19' })).toHaveLength(5);
    expect(f({ person: 'emp_19', severity: 'high', type: 'device_shared' })).toHaveLength(3);
    expect(f({ q: 'doddaballapur' })).toHaveLength(1);
    expect(f({ q: 'farhan' }).length).toBeGreaterThanOrEqual(4);
    expect(f({ q: 'no such thing' })).toEqual([]);
  });

  test('confirm is off until there is a reply or the reviewer says they asked and heard nothing', () => {
    expect(confirmGate({ replied: false }, false).allowed).toBe(false);
    expect(confirmGate({ replied: false }, false).reason).toContain('2 working days');
    expect(confirmGate({ replied: false }, true).allowed).toBe(true);
    expect(confirmGate({ replied: true }, false).allowed).toBe(true);
    expect(confirmGate({ replied: true }, false).reason).toContain('replied');
    expect(decisionNote('  Looks wrong  ', true)).toBe(`Looks wrong ${NO_REPLY_NOTE}`);
    expect(decisionNote('Looks wrong', false)).toBe('Looks wrong');
    expect(decisionNote('', false)).toBeUndefined();
  });

  test('the thresholds shown are the thresholds in use', () => {
    const r = ruleRows(ev);
    expect(r.map((x) => x.type).sort()).toEqual(Object.keys(FLAG_LABEL).sort());
    const all = JSON.stringify(r);
    expect(all).toContain(`${INTEGRITY_RULES.maxSpeedKmh} km/h`);
    expect(all).toContain(`${INTEGRITY_RULES.fuelToleranceFactor} times`);
    expect(all).toContain(`${INTEGRITY_RULES.visitOutsidePunchMin} min`);
    expect(all).toContain(`${INTEGRITY_RULES.gapExplainsMin} min`);
  });

  test('the evidence helpers find what each flag is about', () => {
    const jump = travelPair(ev, flags.find((f) => f.type === 'impossible_travel')!)!;
    expect(jump.km).toBeGreaterThan(40);
    expect(jump.mins).toBe(8);
    expect(Math.round(jump.kmh)).toBeGreaterThan(INTEGRITY_RULES.maxSpeedKmh);
    expect(travelPair(ev, { employeeId: 'emp_6', date: '2026-10-15' })).toBeNull();
    const claims = claimsForReceipt(ev, 'receipt_reuse:rh_9f31a7c2');
    expect(claims.map((c) => c.employeeId)).toEqual(['emp_19', 'emp_20']);
    expect(claims.every((c) => c.amount === 1240)).toBe(true);
    const dev = devicePunches(ev, flags.find((f) => f.id === 'device_shared:emp_19:2026-10-06')!);
    expect(dev).toMatchObject({ deviceId: 'dev_b20', ownerId: 'emp_20' });
    expect(dev.punches.map((p) => p.employeeId).sort()).toEqual(['emp_19', 'emp_20']);
    const odo = dayNumbers(ev, { employeeId: 'emp_9', date: '2026-10-22' });
    expect(odo.odometerKm).toBe(57);
    expect(Math.round(odo.trailKm)).toBe(24);
    const fuel = dayNumbers(ev, { employeeId: 'emp_19', date: '2026-10-27' });
    expect(fuel.fuelClaimed).toBe(1850);
    expect(fuel.fuelExpected).toBe(Math.round(fuel.trailKm * 2.4));
  });
});

// ═════════════════════════════ the pages ═════════════════════════════
const watch = (page: Page) => { const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); return errors; };
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const rowOf = (page: Page, text: string | RegExp) => page.getByRole('row').filter({ hasText: text });
const reviewBtn = (page: Page, who: string, dayMonth: string) => page.getByRole('button', { name: `Review ${who}, ${dayMonth}` });

test.describe('visit attendance page', () => {
  test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

  test('opens on the review list with the principle, the stats and every waiting day with its evidence', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = watch(page);
    await openHrms(page, '/dashboard/hrms/field');
    await expect(page.getByRole('heading', { name: 'Visit attendance', level: 1 })).toBeVisible();
    await expect(page.getByTestId('field-principle')).toContainText('A missed punch is never a reason to cut pay by itself', slow);
    await expect(page.getByTestId('field-principle')).toContainText('The person can see the same evidence');
    await expect(page.getByRole('tab', { name: /To review/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('stat-waiting')).toHaveText('8');
    await expect(page.getByTestId('stat-auto')).toHaveText('4');
    await expect(page.getByTestId('stat-approved')).toHaveText('0');
    await expect(page.getByTestId('stat-rejected')).toHaveText('0');
    for (const c of candidates) {
      const r = rowOf(page, NAMES[c.employeeId]!).filter({ hasText: fmtDate(c.date) });
      await expect(r).toHaveCount(1);
      await expect(r).toContainText(c.verdict === 'auto_approve' ? 'Meets the rule' : c.verdict === 'needs_review' ? 'Needs a manager' : 'No evidence');
      await expect(r).toContainText(`${c.evidence.trailKm.toFixed(1)} km`);
    }
    await expect(rowOf(page, 'Imran Sheikh').filter({ hasText: '14 Oct 2026' })).toContainText('out 15:38');
    await expect(rowOf(page, 'Sana Qureshi')).toContainText('in 09:27, out 14:28');
    await expect(rowOf(page, 'Yash Rathore')).toContainText('None. No verified visit.');
    await expect(page.getByRole('heading', { name: 'Decided (0)' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a day opens with the system\'s reasons, a timeline, a map and times prefilled from the suggestion', async ({ page }) => {
    test.setTimeout(150_000);
    await openHrms(page, '/dashboard/hrms/field');
    await reviewBtn(page, 'Imran Sheikh', '14 Oct').click();
    const dlg = dialog(page, 'Imran Sheikh, 14 Oct 2026');
    await expect(dlg).toContainText('Meets the rule');
    await expect(dlg).toContainText('The punch-out is missing.');
    await expect(dlg).toContainText('8 verified visits (geo-fenced, with photo), spread over 5h 45m.');
    await expect(dlg.getByTestId('day-timeline').locator('li')).toHaveCount(10);   // punch in, eight visits, punch out missing
    await expect(dlg.getByTestId('day-timeline').locator('li[data-kind="visit"][data-verified="true"]')).toHaveCount(8);
    await expect(dlg.getByTestId('day-timeline')).toContainText('Punch-out is missing');
    await expect(dlg.getByRole('img', { name: 'GPS trail with 8 visits' })).toBeVisible();
    await expect(dlg.getByLabel('Punch in time')).toHaveValue('09:18');
    await expect(dlg.getByLabel('Punch out time')).toHaveValue('15:38');
    await expect(dlg.getByRole('link', { name: 'Open employee Imran Sheikh' })).toHaveAttribute('href', '/dashboard/hrms/employees/emp_6');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
  });

  test('a visit that did not count says why, and the map marks it differently', async ({ page }) => {
    test.setTimeout(150_000);
    await openHrms(page, '/dashboard/hrms/field');
    await reviewBtn(page, 'Rohit Chauhan', '1 Oct').click();
    const dlg = dialog(page, 'Rohit Chauhan, 1 Oct 2026');
    const unverified = dlg.getByTestId('day-timeline').locator('li[data-verified="false"]');
    const n = await unverified.count();
    const expected = timelineFor(ev, 'emp_4', '2026-10-01').filter((e) => e.kind === 'visit' && !e.verified);
    expect(n).toBe(expected.length);
    if (n) await expect(unverified.first()).toContainText('Not verified: phone was');
    await expect(dlg).toContainText('Needs a manager');
    await expect(dlg).toContainText('Below the auto-approve rule');
  });

  test('approve: times are checked, a day that is not auto-approvable needs a note, and the decision survives a reload and can be reopened', async ({ page }) => {
    test.setTimeout(240_000);
    await openHrms(page, '/dashboard/hrms/field');
    // a day with no suggestion: nothing prefilled, so approving it needs times and a note
    await reviewBtn(page, 'Yash Rathore', '5 Nov').click();
    let dlg = dialog(page, 'Yash Rathore, 5 Nov 2026');
    await expect(dlg).toContainText('No verified visit');
    await expect(dlg.getByLabel('Punch in time')).toHaveValue('');
    await dlg.getByRole('button', { name: 'Approve with these times' }).click();
    await expect(dlg.getByRole('alert')).toHaveText('Enter the punch-in time.');
    await dlg.getByLabel('Punch in time').fill('09:30');
    await dlg.getByLabel('Punch out time').fill('09:00');
    await dlg.getByRole('button', { name: 'Approve with these times' }).click();
    await expect(dlg.getByRole('alert')).toHaveText('Punch-out must be after punch-in.');
    await dlg.getByLabel('Punch out time').fill('18:00');
    await dlg.getByRole('button', { name: 'Approve with these times' }).click();
    await expect(dlg.getByRole('alert')).toContainText('Say in a note why you are approving it');
    await dlg.getByLabel(/^Note/).fill('Manager Rohit confirms Yash was at the Rohini site all day.');
    await dlg.getByRole('button', { name: 'Approve with these times' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByTestId('stat-waiting')).toHaveText('7');
    await expect(page.getByTestId('stat-approved')).toHaveText('1');
    await expect(page.getByRole('heading', { name: 'Decided (1)' })).toBeVisible();
    const decided = rowOf(page, 'Yash Rathore').filter({ hasText: 'Approved' });
    await expect(decided).toContainText('09:30 to 18:00');
    await expect(decided).toContainText('You (HR admin)');
    await expect(decided).toContainText('Manager Rohit confirms Yash was at the Rohini site all day.');
    // an auto-approvable day: no note needed
    await reviewBtn(page, 'Imran Sheikh', '14 Oct').click();
    dlg = dialog(page, 'Imran Sheikh, 14 Oct 2026');
    await dlg.getByRole('button', { name: 'Approve with these times' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByTestId('stat-auto')).toHaveText('3');

    const stored = await readField(page);
    expect(stored.regularisations['emp_6|2026-10-14']).toMatchObject({ status: 'approved', in: '09:18', out: '15:38', by: 'You (HR admin)' });
    expect(stored.regularisations['emp_22|2026-11-05']).toMatchObject({ status: 'approved', in: '09:30', out: '18:00' });
    await page.reload();
    await expect(page.getByTestId('stat-approved')).toHaveText('2', slow);
    await expect(page.getByRole('heading', { name: 'Decided (2)' })).toBeVisible();

    // reopen puts the day back in the waiting list
    await page.getByRole('button', { name: 'Reopen Imran Sheikh, 14 Oct' }).click();
    await expect(page.getByTestId('stat-waiting')).toHaveText('7');
    await expect(page.getByRole('heading', { name: 'Decided (1)' })).toBeVisible();
    expect((await readField(page)).regularisations['emp_6|2026-10-14']).toBeUndefined();
  });

  test('ask for more information and reject both need a note, and say what they do', async ({ page }) => {
    test.setTimeout(180_000);
    await openHrms(page, '/dashboard/hrms/field');
    await reviewBtn(page, 'Pooja Verma', '20 Oct').click();
    const dlg = dialog(page, 'Pooja Verma, 20 Oct 2026');
    await expect(dlg).toContainText('1 verified visit');
    await dlg.getByRole('button', { name: 'Ask for more info' }).click();
    await expect(dlg.getByRole('alert')).toContainText('Say in a note what you need to know');
    await dlg.getByRole('button', { name: 'Reject' }).click();
    await expect(dlg.getByRole('alert')).toContainText('Say in a note why you are rejecting it');
    await dlg.getByLabel(/^Note/).fill('Please send the names of the shops you visited after 10:30.');
    await dlg.getByRole('button', { name: 'Ask for more info' }).click();
    await expect(dlg).toBeHidden();
    const r = rowOf(page, 'Pooja Verma').filter({ hasText: 'More information asked' });
    await expect(r).toContainText('Please send the names of the shops');
    await expect(page.getByText('1 more info asked')).toBeVisible();

    await reviewBtn(page, 'Rohit Chauhan', '4 Nov').click();
    const d2 = dialog(page, 'Rohit Chauhan, 4 Nov 2026');
    await d2.getByLabel(/^Note/).fill('Three visits in under an hour and a half and no other proof.');
    await d2.getByRole('button', { name: 'Reject' }).click();
    await expect(d2).toBeHidden();
    await expect(page.getByTestId('stat-rejected')).toHaveText('1');
    expect((await readField(page)).regularisations['emp_4|2026-11-04']).toMatchObject({ status: 'rejected', note: 'Three visits in under an hour and a half and no other proof.' });
    // a decided day opens read-only with the decision and a reopen button
    await page.getByRole('button', { name: 'Open Rohit Chauhan, 4 Nov', exact: true }).click();
    const d3 = dialog(page, 'Rohit Chauhan, 4 Nov 2026');
    await expect(d3.getByTestId('decision-card')).toContainText('Rejected by You (HR admin)');
    await expect(d3.getByRole('button', { name: 'Approve with these times' })).toHaveCount(0);
  });

  test('approve all auto-approvable asks first, says how many and which rule, and approves only those', async ({ page }) => {
    test.setTimeout(180_000);
    await openHrms(page, '/dashboard/hrms/field');
    await page.getByRole('button', { name: /Approve all auto-approvable/ }).click();
    const dlg = dialog(page, 'Approve all auto-approvable days?');
    await expect(dlg.getByTestId('approve-all-count')).toHaveText('4');
    await expect(dlg).toContainText('At least 2 verified visits that day.');
    await expect(dlg).toContainText('at least 2 hours apart');
    await expect(dlg).toContainText('at least 3 km');
    await expect(dlg).toContainText('Imran Sheikh, 14 Oct 2026: 09:18 to 15:38');
    await expect(dlg).toContainText('Sana Qureshi, 8 Oct 2026: 09:27 to 14:28');
    // cancel changes nothing
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('stat-approved')).toHaveText('0');
    await page.getByRole('button', { name: /Approve all auto-approvable/ }).click();
    await dialog(page, 'Approve all auto-approvable days?').getByRole('button', { name: 'Approve 4 days' }).click();
    await expect(page.getByTestId('stat-approved')).toHaveText('4');
    await expect(page.getByTestId('stat-waiting')).toHaveText('4');
    await expect(page.getByTestId('stat-auto')).toHaveText('0');
    await expect(page.getByRole('heading', { name: 'Decided (4)' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Approve all auto-approvable/ })).toBeDisabled();
    await expect(page.getByText('No waiting day meets the rule right now.')).toBeVisible();
    // the three that need judgement are still waiting
    for (const n of ['Rohit Chauhan', 'Pooja Verma', 'Yash Rathore']) await expect(rowOf(page, n).filter({ hasNotText: 'Approved' }).first()).toBeVisible();
    const stored = await readField(page);
    expect(Object.keys(stored.regularisations).sort()).toEqual(['emp_20|2026-10-14', 'emp_6|2026-10-08', 'emp_6|2026-10-14', 'emp_9|2026-10-08']);
    expect(stored.regularisations['emp_9|2026-10-08']).toMatchObject({ in: '09:27', out: '14:28', note: 'Met the auto-approve rule.' });
  });

  test('team calendar: eight people, the days of the month, a legend, and a day opens the same detail', async ({ page }) => {
    test.setTimeout(180_000);
    await openHrms(page, '/dashboard/hrms/field?tab=calendar');
    const grid = page.getByTestId('team-calendar');
    await expect(grid).toBeVisible(slow);
    await expect(page.getByRole('tab', { name: 'Team calendar' })).toHaveAttribute('aria-selected', 'true');
    await expect(grid.getByRole('rowheader')).toHaveCount(8);
    await expect(grid.getByRole('columnheader')).toHaveCount(31 + 1);                 // October plus the person column
    await expect(page.getByRole('button', { name: 'October 2026' })).toHaveAttribute('aria-pressed', 'true');
    const cell = (e: string, d: string) => page.getByTestId(`cell-${e}-${d}`);
    await expect(cell('emp_6', '2026-10-15')).toHaveAttribute('data-status', 'present');
    await expect(cell('emp_6', '2026-10-14')).toHaveAttribute('data-status', 'missed');
    await expect(cell('emp_6', '2026-10-04')).toHaveAttribute('data-status', 'off');
    await expect(cell('emp_6', '2026-10-02')).toHaveAttribute('data-status', 'off');
    await expect(cell('emp_4', '2026-10-15')).toHaveAttribute('aria-label', /Rohit Chauhan, 15 Oct 2026: (Present, both punches|Absent, no record)/);
    await expect(cell('emp_6', '2026-10-14')).toHaveAttribute('aria-label', 'Imran Sheikh, 14 Oct 2026: Missed punch, waiting for a decision. Open the day.');
    await expect(cell('emp_6', '2026-10-14')).toHaveText('!');
    // every cell has an accessible name that says the person, the date and the state
    const labels = await grid.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    expect(labels).toHaveLength(8 * 31);
    expect(labels.every((l) => /^[A-Z][a-z]+ [A-Za-z]+.*, \d{1,2} Oct 2026: .+/.test(l))).toBe(true);
    // the legend carries the counts, from the same logic
    const counts = monthCounts(ev, {}, '2026-10');
    const legend = page.getByTestId('calendar-legend');
    for (const t of ['Present, both punches', 'Regularised, approved', 'Missed punch, waiting for a decision', 'More information asked', 'Rejected', 'Absent, no record', 'Sunday or holiday', 'Not in the evidence yet']) await expect(legend).toContainText(t);
    await expect(legend).toContainText(`Present, both punches (${counts.present})`);
    await expect(legend).toContainText(`Missed punch, waiting for a decision (${counts.missed})`);
    await expect(legend).toContainText(`Sunday or holiday (${counts.off})`);

    // a click opens the same day detail, and approving it turns the cell into "regularised"
    await cell('emp_6', '2026-10-14').click();
    const dlg = dialog(page, 'Imran Sheikh, 14 Oct 2026');
    await expect(dlg.getByLabel('Punch out time')).toHaveValue('15:38');
    await dlg.getByRole('button', { name: 'Approve with these times' }).click();
    await expect(dlg).toBeHidden();
    await expect(cell('emp_6', '2026-10-14')).toHaveAttribute('data-status', 'regularised');
    await expect(cell('emp_6', '2026-10-14')).toHaveText('R');
    await expect(legend).toContainText('Regularised, approved (1)');
    // a day with nothing to regularise opens too, and says so
    await cell('emp_6', '2026-10-15').click();
    await expect(dialog(page, 'Imran Sheikh, 15 Oct 2026')).toContainText('Both punches are there, so there is nothing to regularise.');
    await page.keyboard.press('Escape');
    // November: the evidence stops on 6 Nov, so later days are not clickable
    await page.getByRole('button', { name: 'November 2026' }).click();
    await expect(grid.getByRole('columnheader')).toHaveCount(30 + 1);
    await expect(cell('emp_22', '2026-11-05')).toHaveAttribute('data-status', 'missed');
    await expect(cell('emp_4', '2026-11-02')).toHaveAttribute('data-status', 'absent');
    await expect(cell('emp_6', '2026-11-10')).toHaveAttribute('data-status', 'upcoming');
    await expect(cell('emp_6', '2026-11-10')).toHaveAttribute('aria-disabled', 'true');
    await cell('emp_6', '2026-11-10').click({ force: true });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // the calendar and the review list agree after a reload
    await page.reload();
    await expect(page.getByRole('button', { name: 'October 2026' })).toBeVisible(slow);
    await expect(cell('emp_6', '2026-10-14')).toHaveAttribute('data-status', 'regularised');
  });

  test('team calendar by keyboard: arrow keys move between days, Enter opens the day, Escape closes it', async ({ page }) => {
    test.setTimeout(150_000);
    await openHrms(page, '/dashboard/hrms/field?tab=calendar');
    const cell = (e: string, d: string) => page.getByTestId(`cell-${e}-${d}`);
    await expect(page.getByTestId('team-calendar')).toBeVisible(slow);
    // only one cell is a tab stop
    expect(await page.getByTestId('team-calendar').getByRole('button').evaluateAll((els) => els.filter((e) => e.getAttribute('tabindex') === '0').length)).toBe(1);
    await cell('emp_6', '2026-10-13').focus();
    await page.keyboard.press('ArrowRight');
    await expect(cell('emp_6', '2026-10-14')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');                              // next person down is Pooja Verma
    await expect(cell('emp_7', '2026-10-14')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(cell('emp_6', '2026-10-14')).toBeFocused();
    await page.keyboard.press('End');
    await expect(cell('emp_6', '2026-10-31')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(cell('emp_6', '2026-10-01')).toBeFocused();
    await cell('emp_6', '2026-10-14').focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page, 'Imran Sheikh, 14 Oct 2026')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('how it decides: the rule in sentences, the verified-visit test, why it is advisory, and worked examples from the data', async ({ page }) => {
    test.setTimeout(150_000);
    await openHrms(page, '/dashboard/hrms/field?tab=rules');
    await expect(page.getByTestId('rule-sentences')).toBeVisible(slow);
    await expect(page.getByTestId('rule-sentences')).toContainText('At least 2 verified visits that day.');
    await expect(page.getByTestId('rule-sentences')).toContainText('at least 2 hours apart');
    await expect(page.getByTestId('rule-sentences')).toContainText('at least 3 km of movement');
    await expect(page.getByText('15 minutes before the first verified visit started')).toBeVisible();
    await expect(page.getByTestId('verified-sentences')).toContainText('within 150 m of the outlet');
    await expect(page.getByTestId('verified-sentences')).toContainText('at least 5 minutes');
    await expect(page.getByText('cannot be edited in this preview')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Why it stays advisory for the unclear cases' })).toBeVisible();
    await expect(page.getByText('A missed punch is never a reason to cut pay by itself. Nothing on this page changes pay.')).toBeVisible();
    // no edit controls on a page that only explains
    await expect(page.getByRole('main').getByRole('spinbutton')).toHaveCount(0);
    const auto = page.getByTestId('example-auto_approve');
    await expect(auto).toContainText('Imran Sheikh, 14 Oct 2026');
    await expect(auto).toContainText('5h 45m');
    await expect(auto).toContainText('21.3 km');
    await expect(auto).toContainText('punch-out 15:38 would be suggested');
    const short = page.getByTestId('example-needs_review');
    await expect(short).toContainText('Rohit Chauhan, 4 Nov 2026');
    await expect(short).toContainText('1h 23m');
    await expect(short).toContainText('Not enough, needs at least 2h');
    await expect(page.getByTestId('example-no_evidence')).toContainText('Yash Rathore, 5 Nov 2026');
    await expect(page.getByTestId('example-no_evidence')).toContainText('no time is suggested');
  });

  test('the tab is kept in the address, and the page is usable at phone width on every tab', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = watch(page);
    await openHrms(page, '/dashboard/hrms/field');
    await expect(page.getByTestId('stat-waiting')).toBeVisible(slow);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await page.getByRole('tab', { name: 'Team calendar' }).click();
    await expect(page.getByTestId('team-calendar')).toBeVisible();
    expect(page.url()).toContain('tab=calendar');
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    // the grid scrolls inside its own box
    expect(await page.getByTestId('team-calendar').evaluate((el) => el.parentElement!.scrollWidth > el.parentElement!.clientWidth)).toBe(true);
    await page.getByRole('tab', { name: 'How it decides' }).click();
    await expect(page.getByTestId('rule-sentences')).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await page.getByRole('tab', { name: /To review/ }).click();
    await reviewBtn(page, 'Imran Sheikh', '14 Oct').click();
    await expect(dialog(page, 'Imran Sheikh, 14 Oct 2026')).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});

// ─────────────────────────────── integrity checks ───────────────────────────────
const flagBtn = (page: Page, title: string | RegExp) => page.getByRole('button', { name: typeof title === 'string' ? `Review: ${title}` : title });

test.describe('integrity checks page', () => {
  test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

  test('opens with the advisory statement, counts by severity and status, and every flag in plain words', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = watch(page);
    await openHrms(page, '/dashboard/hrms/integrity');
    await expect(page.getByRole('heading', { name: 'Integrity checks', level: 1 })).toBeVisible();
    await expect(page.getByTestId('integrity-advisory')).toContainText('Flags are advisory. They never change pay or attendance on their own. A person reviews each one, and the employee can reply before anything is decided.', slow);
    await expect(page.getByTestId('sev-high')).toContainText('6');
    await expect(page.getByTestId('sev-warning')).toContainText('3');
    await expect(page.getByTestId('sev-info')).toContainText('1');
    await expect(page.getByTestId('status-open')).toContainText('9');
    await expect(page.getByTestId('status-cleared')).toContainText('1');
    await expect(page.getByTestId('status-confirmed')).toContainText('0');
    await expect(page.getByTestId('status-escalated')).toContainText('0');
    await expect(page.getByRole('row')).toHaveCount(1 + 10 + 1 + 6);                      // flags, plus the rules table below
    await expect(page.getByTestId('flag-count')).toContainText('Showing 10 of 10 flags');
    await expect(rowOf(page, 'Check-in 41 km from the previous one')).toContainText('Karthik Subramanian');
    await expect(rowOf(page, 'Check-in 41 km from the previous one')).toContainText('Impossible travel');
    await expect(rowOf(page, "Punch made from Farhan Ali's phone").first()).toContainText('Gaurav Saxena, Farhan Ali');
    await expect(rowOf(page, '6 Oct 2026')).toContainText('Replied');
    await expect(rowOf(page, 'Worked before punching in')).toContainText('Cleared');
    // people read names, never the engine's ids
    expect(await page.getByRole('main').innerText()).not.toMatch(/emp_\d/);
    // nobody is ranked or scored
    expect((await page.getByRole('main').innerText()).toLowerCase()).not.toMatch(/risk|score|rank|leaderboard/);
    expect(errors).toEqual([]);
  });

  test('filters by type, severity, status, person and text, and says how many it shows', async ({ page }) => {
    test.setTimeout(150_000);
    await openHrms(page, '/dashboard/hrms/integrity');
    const count = page.getByTestId('flag-count');
    await expect(count).toContainText('Showing 10 of 10', slow);
    await page.getByLabel('Type', { exact: true }).selectOption({ label: 'Receipt reused' });
    await expect(count).toContainText('Showing 2 of 10');
    await page.getByLabel('Type', { exact: true }).selectOption('all');
    await page.getByLabel('Severity', { exact: true }).selectOption({ label: 'High' });
    await expect(count).toContainText('Showing 6 of 10');
    await page.getByLabel('Severity', { exact: true }).selectOption({ label: 'For information' });
    await expect(count).toContainText('Showing 1 of 10');
    await page.getByLabel('Severity', { exact: true }).selectOption('all');
    await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Cleared' });
    await expect(count).toContainText('Showing 1 of 10');
    await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Escalated' });
    await expect(page.getByText('No flag matches these filters.')).toBeVisible();
    await page.getByLabel('Status', { exact: true }).selectOption('all');
    await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Farhan Ali' });
    await expect(count).toContainText('Showing 4 of 10');
    await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Gaurav Saxena' });
    await expect(count).toContainText('Showing 5 of 10');
    await page.getByLabel('Person', { exact: true }).selectOption('all');
    await page.getByRole('searchbox', { name: 'Search the flags' }).fill('doddaballapur');
    await expect(count).toContainText('Showing 1 of 10');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(count).toContainText('Showing 10 of 10');
  });

  test('a flag opens with its evidence sentences, a picture of the jump, the suggestion and the right of reply', async ({ page }) => {
    test.setTimeout(150_000);
    await openHrms(page, '/dashboard/hrms/integrity');
    await flagBtn(page, 'Check-in 41 km from the previous one, 8 minutes later').click();
    const dlg = dialog(page, 'Check-in 41 km from the previous one, 8 minutes later');
    await expect(dlg).toContainText('This flag is advisory. It does not change pay or attendance.');
    await expect(dlg).toContainText('What the data shows');
    await expect(dlg).toContainText('That is 41.0 km in a straight line in 8 minutes');
    await expect(dlg).toContainText('The limit used here is 90 km/h');
    await expect(dlg.getByTestId('travel-map')).toBeVisible();
    await expect(dlg.getByText('Implied speed')).toBeVisible();
    await expect(dlg).toContainText('Ask the person.');
    await expect(dlg.getByTestId('reply-block')).toContainText('No reply on record yet.');
    await expect(dlg).toContainText('In the live product the employee writes this from their own app');
    await expect(dlg.getByLabel("Record the employee's reply")).toBeVisible();
  });

  test('confirm stays off until there is a reply or the reviewer says the person was asked, and it needs a note', async ({ page }) => {
    test.setTimeout(240_000);
    await openHrms(page, '/dashboard/hrms/integrity');
    await flagBtn(page, 'Check-in 41 km from the previous one, 8 minutes later').click();
    const dlg = dialog(page, 'Check-in 41 km from the previous one, 8 minutes later');
    const confirm = dlg.getByRole('button', { name: 'Confirm' });
    await expect(confirm).toBeDisabled();
    await expect(dlg.getByTestId('confirm-reason')).toContainText("Confirm is off until the employee's reply is on record");
    await expect(confirm).toHaveAttribute('aria-describedby', 'confirm-reason');
    await dlg.getByLabel(/I asked the employee and they did not reply within 2 working days/).check();
    await expect(confirm).toBeEnabled();
    await expect(dlg.getByTestId('confirm-reason')).toContainText('You have said the employee was asked');
    await confirm.click();
    await expect(dlg.getByRole('alert')).toContainText('A note is required to confirm');
    await dlg.getByLabel(/^Note/).fill('Karthik checked in for the wrong outlet from a phone left in the van.');
    await dlg.getByLabel(/I asked the employee/).uncheck();
    await expect(confirm).toBeDisabled();
    await dlg.getByLabel(/I asked the employee/).check();
    await confirm.click();
    await expect(dlg).toBeHidden();
    const row = rowOf(page, 'Check-in 41 km from the previous one');
    await expect(row).toContainText('Confirmed');
    await expect(page.getByTestId('status-confirmed')).toContainText('1');
    await expect(page.getByTestId('status-open')).toContainText('8');
    const stored = (await readField(page)).flagReviews['impossible_travel:emp_8:2026-10-09'];
    expect(stored.status).toBe('confirmed');
    expect(stored.note).toContain('wrong outlet');
    expect(stored.note).toContain('did not reply within 2 working days');
    await page.reload();
    await expect(rowOf(page, 'Check-in 41 km from the previous one')).toContainText('Confirmed', slow);
    // the decision is shown with who and when, and can be reopened
    await flagBtn(page, 'Check-in 41 km from the previous one, 8 minutes later').click();
    const again = dialog(page, 'Check-in 41 km from the previous one, 8 minutes later');
    await expect(again.getByTestId('flag-decision')).toContainText('Confirmed by You (HR admin)');
    await expect(again.getByTestId('flag-decision')).toContainText('did not reply within 2 working days');
    await again.getByRole('button', { name: 'Reopen' }).click();
    await expect(rowOf(page, 'Check-in 41 km from the previous one')).toContainText('Open');
    await expect(page.getByTestId('status-confirmed')).toContainText('0');
  });

  test('a recorded reply unlocks confirm; the seeded reply is shown as the employee\'s own words', async ({ page }) => {
    test.setTimeout(240_000);
    await openHrms(page, '/dashboard/hrms/integrity');
    // seeded: Gaurav has already replied on 6 Oct
    await rowOf(page, '6 Oct 2026').getByRole('button').click();
    let dlg = dialog(page, "Punch made from Farhan Ali's phone");
    await expect(dlg.getByTestId('reply-block')).toContainText('My phone was at the service centre that week');
    await expect(dlg.getByRole('button', { name: 'Confirm' })).toBeEnabled();
    await expect(dlg.getByTestId('confirm-reason')).toContainText('The employee has replied');
    await expect(dlg.getByLabel(/I asked the employee/)).toHaveCount(0);
    await page.keyboard.press('Escape');
    // a flag without a reply: record one, and the gate opens without the tick
    await flagBtn(page, /Review: Fuel claim ₹1,850/).click();
    dlg = dialog(page, /Fuel claim ₹1,850/);
    await expect(dlg.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await expect(dlg.getByRole('button', { name: 'Save reply' })).toBeDisabled();
    await dlg.getByLabel("Record the employee's reply").fill('I filled the tank for the whole week on Tuesday. The receipt is in my bag.');
    await dlg.getByRole('button', { name: 'Save reply' }).click();
    await expect(dlg.getByTestId('reply-block')).toContainText('I filled the tank for the whole week');
    await expect(dlg.getByRole('button', { name: 'Confirm' })).toBeEnabled();
    await expect(dlg.getByLabel(/I asked the employee/)).toHaveCount(0);
    expect((await readField(page)).flagReviews['fuel_route_mismatch:emp_19:2026-10-27'].reply.text).toContain('filled the tank');
    // the reply is kept when the flag is then cleared, and the row shows it
    await dlg.getByRole('button', { name: 'Clear' }).click();
    await expect(dlg).toBeHidden();
    const row = rowOf(page, /Fuel claim ₹1,850/);
    await expect(row).toContainText('Cleared');
    await expect(row).toContainText('Replied');
    expect((await readField(page)).flagReviews['fuel_route_mismatch:emp_19:2026-10-27']).toMatchObject({ status: 'cleared' });
  });

  test('clear needs no note; escalate does; both are recorded with a name and time', async ({ page }) => {
    test.setTimeout(180_000);
    await openHrms(page, '/dashboard/hrms/integrity');
    await flagBtn(page, /Review: Odometer 57 km/).click();
    let dlg = dialog(page, /Odometer 57 km/);
    await expect(dlg.getByRole('table', { name: "The day's numbers" })).toContainText('12,980 to 13,037 (57 km)');
    await dlg.getByRole('button', { name: 'Escalate' }).click();
    await expect(dlg.getByRole('alert')).toContainText('A note is required to escalate');
    await dlg.getByLabel(/^Note/).fill('Second odometer overshoot this quarter, passing to the regional manager.');
    await dlg.getByRole('button', { name: 'Escalate' }).click();
    await expect(dlg).toBeHidden();
    await expect(rowOf(page, /Odometer 57 km/)).toContainText('Escalated');
    await expect(page.getByTestId('status-escalated')).toContainText('1');

    await flagBtn(page, /Review: Punched in, but no visits/).click();
    dlg = dialog(page, /Punched in, but no visits/);
    await dlg.getByRole('button', { name: 'Clear' }).click();
    await expect(dlg).toBeHidden();
    await expect(rowOf(page, /Punched in, but no visits/)).toContainText('Cleared');
    const stored = await readField(page);
    expect(stored.flagReviews['odometer_mismatch:emp_9:2026-10-22']).toMatchObject({ status: 'escalated', by: 'You (HR admin)' });
    expect(stored.flagReviews['punch_visit_mismatch:emp_22:2026-11-03'].status).toBe('cleared');
    expect(stored.log.length).toBeGreaterThanOrEqual(2);
  });

  test('each kind of flag shows the evidence that suits it', async ({ page }) => {
    test.setTimeout(240_000);
    await openHrms(page, '/dashboard/hrms/integrity');
    await flagBtn(page, 'The same receipt was claimed by two people').click();
    let dlg = dialog(page, 'The same receipt was claimed by two people');
    const claims = dlg.getByRole('table', { name: 'Claims with the same receipt' });
    await expect(claims.getByRole('row')).toHaveCount(3);
    await expect(claims).toContainText('Gaurav Saxena');
    await expect(claims).toContainText('Farhan Ali');
    await expect(claims).toContainText('₹1,240');
    await expect(claims).toContainText('Kake Da Dhaba, Rohini');
    await page.keyboard.press('Escape');

    await rowOf(page, '20 Oct 2026').getByRole('button').click();
    dlg = dialog(page, "Punch made from Farhan Ali's phone");
    const punches = dlg.getByRole('table', { name: 'Punches on that day' });
    await expect(punches.getByRole('row')).toHaveCount(3);
    await expect(punches).toContainText('dev_b20');
    await expect(dlg).toContainText('Device dev_b20 is registered to Farhan Ali.');
    await page.keyboard.press('Escape');

    await flagBtn(page, /Review: Fuel claim ₹1,850/).click();
    dlg = dialog(page, /Fuel claim ₹1,850/);
    const nums = dlg.getByRole('table', { name: "The day's numbers" });
    await expect(nums).toContainText('₹1,850');
    await expect(nums).toContainText('₹45');
    await expect(dlg.getByRole('img', { name: /GPS trail with/ })).toBeVisible();
    await page.keyboard.press('Escape');

    await flagBtn(page, 'Worked before punching in').click();
    dlg = dialog(page, 'Worked before punching in');
    await expect(dlg.getByTestId('day-timeline')).toBeVisible();
    await expect(dlg.getByTestId('flag-decision')).toContainText('Cleared by Tanvi Kapoor');
    await expect(dlg.getByTestId('flag-decision')).toContainText('Late punch. Start time regularised to 09:55.');
  });

  test('what each check looks for shows the thresholds in use, as company policy that is read-only here', async ({ page }) => {
    test.setTimeout(150_000);
    await openHrms(page, '/dashboard/hrms/integrity');
    const card = page.getByTestId('rules-card');
    await expect(card).toBeVisible(slow);
    for (const l of Object.values(FLAG_LABEL)) await expect(card).toContainText(l);
    await expect(card).toContainText('90 km/h');
    await expect(card).toContainText('1.25 times the expected fuel plus ₹100');
    await expect(card).toContainText('₹2.4/km bike, ₹6.5/km car');
    await expect(card).toContainText('1.3 times plus 3 km');
    await expect(card).toContainText('more than 60 min');
    await expect(page.getByText('They are company policy, not law, and can be tuned. They are read-only in this preview')).toBeVisible();
  });

  test('works at phone width, with the list and an open flag', async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openHrms(page, '/dashboard/hrms/integrity');
    await expect(page.getByTestId('integrity-advisory')).toBeVisible(slow);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await flagBtn(page, 'Check-in 41 km from the previous one, 8 minutes later').click();
    await expect(dialog(page, 'Check-in 41 km from the previous one, 8 minutes later')).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
});
