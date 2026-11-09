import { test, expect, type Page } from '@playwright/test';
import { openHrms } from './hrms-utils';
import { makeSeed, PREVIEW_TODAY } from '../src/lib/hrms/seed';
import { makeWorkforceSeed } from '../src/lib/hrms/workforce/seed';
import { checkAadhaar, completeness, sampleAadhaar } from '../src/lib/hrms/validators';
import { minWageFor } from '../src/lib/hrms/rules';
import type { HrmsDb } from '../src/lib/hrms/types';
import type { WorkforceData } from '../src/lib/hrms/workforce/types';
import {
  CONTRACT_MONTHS, DEFAULT_POLICY, DEFAULT_RULES, ROUND_TO, adviseInvoice, assessContractor, assessRisk, attendanceHeadcount, buildBoard, checkPin, compareNames,
  counted, emptySteps, evaluatePunch, findMissingOuts, generateUan, licenceCoverage, licenceToday, matchShiftDate, minWageEntry, planFor, readiness, recoveryMonth,
  registrationBlockers, requiredWage, runChecks, runCheck, stepDone, testWage, toAbs, validateAmount, validatePolicy, wageStanding, wageSummary, workerLines, fmtHm, type CheckResult,
} from '../src/lib/hrms/workforce/engine';

/**
 * Workforce area: contract labour, wage access, site kiosk and verified onboarding. Two kinds of test:
 *  - pure checks of the engines on the seeded sample data (no browser), and
 *  - browser flows. The browser starts from the seed every time; the stored data is read back from localStorage so a
 *    screen can never drift from what was saved. Everything outside the browser (PAN, Aadhaar, bank, EPFO, face match) is
 *    a simulation, and the tests check that the screens say so.
 */

const WF_KEY = 'kinematic_hrms_area_workforce_v1';
const DB_KEY = 'kinematic_hrms_preview_v3';
const TODAY = PREVIEW_TODAY;
const seed = makeSeed();
const wfSeed = makeWorkforceSeed();
const slow = { timeout: 60_000 };

const readWf = (page: Page): Promise<WorkforceData> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), WF_KEY);
const readDb = (page: Page): Promise<HrmsDb> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), DB_KEY);
const rawWf = (page: Page): Promise<string> => page.evaluate((k) => localStorage.getItem(k) || '', WF_KEY);

/** Fail a test on uncaught page errors and console errors (a React render or hydration error shows up here). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });
test.describe.configure({ timeout: 150_000 });

const money = (n: number) => `₹${new Intl.NumberFormat('en-IN').format(n)}`;
const dialog = (page: Page) => page.getByRole('dialog');

// ═════════════════════════════ pure checks: contract labour ═════════════════════════════
test.describe('contract labour engine', () => {
  const contract = wfSeed.contract;
  const sai = contract.contractors.find((c) => c.id === 'ctr_sai')!;
  const ganesh = contract.contractors.find((c) => c.id === 'ctr_ganesh')!;
  const assess = (id: string, month: string, c = contract, d = seed) => assessContractor(d, c, id, month, TODAY)!;

  test('licence coverage counts the days a licence is valid inside the month, and today’s state is dated', () => {
    expect(licenceCoverage(ganesh, '2026-10')).toEqual({ covered: 31, total: 31 });
    expect(licenceCoverage(ganesh, '2026-11')).toEqual({ covered: 0, total: 30 });
    expect(licenceCoverage({ licenceFrom: '2025-01-01', licenceTo: '2026-10-15' }, '2026-10')).toEqual({ covered: 15, total: 31 });
    expect(licenceToday(ganesh, TODAY)).toEqual({ state: 'expired', days: 7 });
    expect(licenceToday(sai, TODAY).state).toBe('valid');
    expect(licenceToday({ licenceFrom: '2025-01-01', licenceTo: '2026-12-15' }, TODAY).state).toBe('expiring');
    expect(licenceToday({ licenceFrom: '2026-12-01', licenceTo: '2027-12-01' }, TODAY).state).toBe('not_started');
  });

  test('the minimum is pro-rated by days worked and capped at a full month; the rate and its confidence come from rules.ts', () => {
    expect(requiredWage(15500, 26)).toBe(15500);
    expect(requiredWage(15500, 13)).toBe(7750);
    expect(requiredWage(15500, 31)).toBe(15500);
    expect(requiredWage(15500, 0)).toBe(0);
    const entry = minWageEntry('Maharashtra', 'unskilled')!;
    expect(entry.monthly).toBe(minWageFor('Maharashtra', 'unskilled'));
    expect(entry.confidence).toBe('indicative');
    const below = testWage({ key: 'w', name: 'A', skill: 'unskilled', source: 'contractor', days: 26, wagePaid: 14000 }, 'Maharashtra');
    expect(below.status).toBe('below');
    expect(below.shortfall).toBe(entry.monthly - 14000);
    expect(below.confidence).toBe('indicative');
    expect(testWage({ key: 'w', name: 'A', skill: 'unskilled', source: 'contractor', days: 26, wagePaid: entry.monthly }, 'Maharashtra').status).toBe('ok');
    expect(testWage({ key: 'w', name: 'A', skill: 'unskilled', source: 'contractor', days: 0, wagePaid: 0 }, 'Maharashtra').status).toBe('absent');
  });

  test('a state and skill with no sample rate cannot be tested: the check says so instead of passing', () => {
    expect(minWageEntry('Maharashtra', 'semi_skilled')).toBeUndefined();
    const checks = runChecks({
      contractor: sai, month: '2026-10', today: TODAY, proofs: [], invoice: { headcount: 1, amount: 1 },
      workers: [{ key: 'w', name: 'Semi Skilled', skill: 'semi_skilled', source: 'contractor', days: 26, wagePaid: 20000 }],
    });
    const mw = checks.find((c) => c.id === 'min_wage')!;
    expect(mw.status).toBe('warn');
    expect(mw.detail).toContain('no sample minimum');
  });

  test('seeded contractors: Sai is medium (ESI proof missing, 8 billed against 6 on attendance), Ganesh high, Kalyan low', () => {
    const s = assess('ctr_sai', '2026-10');
    expect(s.risk.level).toBe('medium');
    expect(s.checks.find((c) => c.id === 'headcount')!.status).toBe('fail');
    expect(s.checks.find((c) => c.id === 'headcount')!.detail).toContain('8 people but attendance shows 6');
    expect(s.checks.find((c) => c.id === 'esi_proof')!.status).toBe('fail');
    expect(s.advice.advice).toBe('hold');
    expect(s.advice.missing.map((m) => m.kind)).toEqual(['esi_challan']);

    const g = assess('ctr_ganesh', '2026-10');
    expect(g.risk.level).toBe('high');
    const mw = g.checks.find((c) => c.id === 'min_wage')!;
    expect(mw.status).toBe('fail');
    expect(mw.detail).toContain('Rohan Pawar');
    expect(mw.confidence).toBe('indicative');
    expect(g.checks.find((c) => c.id === 'licence_today')!.status).toBe('fail');
    expect(g.checks.find((c) => c.id === 'pf_proof')!.status).toBe('fail');
    expect(assess('ctr_ganesh', '2026-09').risk.level).toBe('medium');

    for (const m of CONTRACT_MONTHS) {
      const k = assess('ctr_kalyan', m);
      expect(k.risk.level).toBe('low');
      expect(k.risk.reasons).toEqual([]);
      expect(k.advice.advice).toBe('clear');
    }
    expect(assess('ctr_sai', '2026-09').risk.level).toBe('low');
  });

  test('headcount: more billed than on attendance fails, fewer warns, equal passes', () => {
    const base = { contractor: sai, month: '2026-10', today: TODAY, proofs: [] as never[], workers: [1, 2, 3].map((i) => ({ key: `w${i}`, name: `W${i}`, skill: 'unskilled' as const, source: 'contractor' as const, days: 20, wagePaid: 16000 })) };
    const at = (n: number) => runChecks({ ...base, invoice: { headcount: n, amount: 1 } }).find((c) => c.id === 'headcount')!;
    expect(at(3).status).toBe('pass');
    expect(at(5).status).toBe('fail');
    expect(at(2).status).toBe('warn');
    expect(runChecks({ ...base }).find((c) => c.id === 'headcount')!.detail).toContain('No invoice');
    expect(attendanceHeadcount([...base.workers, { key: 'x', name: 'X', skill: 'unskilled', source: 'contractor', days: 0, wagePaid: 0 }])).toBe(3);
  });

  test('contract workers in the core HR records are counted in the headcount', () => {
    const lines = workerLines(seed, contract, 'ctr_sai', '2026-10');
    const hr = lines.filter((l) => l.source === 'hr');
    expect(hr.map((l) => l.name)).toEqual(['Dinesh Kamble']);
    expect(hr[0]!.employeeId).toBe('emp_15');
    const att = seed.attendance.find((a) => a.employeeId === 'emp_15' && a.month === '2026-10')!;
    expect(hr[0]!.days).toBe(att.presentDays);
    expect(lines.length).toBe(contract.workers.filter((w) => w.contractorId === 'ctr_sai').length + 1);
    // Someone who is not a contract employee in the core records is ignored even if assigned.
    const bad = structuredClone(contract);
    bad.coreAssignments.push({ employeeId: 'emp_1', contractorId: 'ctr_sai', skill: 'skilled' });
    expect(workerLines(seed, bad, 'ctr_sai', '2026-10').some((l) => l.employeeId === 'emp_1')).toBe(false);
  });

  test('the expired contract labour registration of Meridian Logistics is surfaced as a blocker', () => {
    const b = registrationBlockers(seed, contract.contractors, TODAY);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ entityId: 'ent_logistics', number: 'CLRA/MH/2021/0112', validTo: '2026-04-30', kind: 'expired' });
    expect(b[0]!.daysAgo).toBeGreaterThan(180);
    const renewed = structuredClone(seed);
    renewed.entities.find((e) => e.id === 'ent_logistics')!.registrations.find((r) => r.type === 'clra')!.validTo = '2027-04-30';
    expect(registrationBlockers(renewed, contract.contractors, TODAY)).toEqual([]);
    const none = structuredClone(seed);
    none.entities.find((e) => e.id === 'ent_logistics')!.registrations = [];
    expect(registrationBlockers(none, contract.contractors, TODAY)[0]!.kind).toBe('missing');
  });

  test('risk is a rule over findings, not a score', () => {
    const mk = (severity: 'serious' | 'moderate', status: CheckResult['status'] = 'fail'): CheckResult => ({ id: 'codes', label: 'x', severity, status, detail: `${severity} ${status}` });
    expect(assessRisk([]).level).toBe('low');
    expect(assessRisk([mk('serious', 'pass'), mk('moderate', 'pass')]).level).toBe('low');
    expect(assessRisk([mk('moderate')]).level).toBe('medium');
    expect(assessRisk([mk('serious')]).level).toBe('medium');
    expect(assessRisk([mk('serious'), mk('moderate')]).level).toBe('medium');
    expect(assessRisk([mk('serious'), mk('moderate'), mk('moderate')]).level).toBe('high');
    expect(assessRisk([mk('serious'), mk('serious')]).level).toBe('high');
    const r = assessRisk([mk('moderate'), mk('serious', 'warn')]);
    expect(r.reasons.map((x) => x.severity)).toEqual(['serious', 'moderate']);
  });

  test('advice: a missing proof means hold; only a moderate finding means review; a decision keeps what was advised', () => {
    const clean = structuredClone(contract);
    expect(assess('ctr_kalyan', '2026-10', clean).advice.advice).toBe('clear');
    clean.invoices.find((i) => i.contractorId === 'ctr_kalyan' && i.month === '2026-10')!.headcount = 5;
    const review = assess('ctr_kalyan', '2026-10', clean);
    expect(review.advice.advice).toBe('review');
    expect(review.risk.level).toBe('medium');
    clean.proofs.find((p) => p.contractorId === 'ctr_kalyan' && p.month === '2026-10' && p.kind === 'wage_register')!.status = 'missing';
    const hold = assess('ctr_kalyan', '2026-10', clean);
    expect(hold.advice.advice).toBe('hold');
    expect(hold.advice.missing.map((m) => m.kind)).toEqual(['wage_register']);
    expect(adviseInvoice(hold.checks, hold.proofs, '2026-10').headline).toBe('Hold recommended');
    expect(assess('ctr_ganesh', '2026-09').decision?.decision).toBe('hold');
  });
});

// ═════════════════════════════ pure checks: wage access ═════════════════════════════
test.describe('wage access engine', () => {
  const policy = DEFAULT_POLICY;
  const stand = (id: string, reqs = wfSeed.wage.requests, d: HrmsDb = seed, p = policy) => wageStanding(d, p, reqs, id, TODAY)!;

  test('the maths: earned = net x paid days / days in the month; cap = share of (earned less recoveries), rounded down', () => {
    for (const id of ['emp_1', 'emp_3', 'emp_5', 'emp_10']) {
      const s = stand(id, []);
      expect(s.month).toBe('2026-11');
      expect(s.daysElapsed).toBe(7);
      expect(s.daysInMonth).toBe(30);
      expect(s.paidDays).toBe(7);
      expect(s.earned).toBe(Math.round((s.net * 7) / 30));
      expect(s.afterRecoveries).toBe(Math.max(0, s.earned - s.recoveriesDue));
      expect(s.cap).toBe(Math.floor((s.afterRecoveries * 0.5) / ROUND_TO) * ROUND_TO);
      expect(s.available).toBe(s.cap);
    }
    expect(stand('emp_10', []).recoveriesDue).toBe(5000);   // Vikram's loan EMI
    expect(stand('emp_7', []).recoveriesDue).toBe(2000);    // Pooja's advance
    expect(stand('emp_1', []).recoveriesDue).toBe(0);
    expect(stand('emp_10', []).available).toBeLessThan(policy.minAmount);
  });

  test('loss of pay already recorded in the month takes unpaid days out of the earned days', () => {
    const d = structuredClone(seed);
    d.attendance.find((a) => a.employeeId === 'emp_5' && a.month === '2026-11')!.lopDays = 2;
    const s = stand('emp_5', [], d);
    expect(s.unpaidDays).toBe(2);
    expect(s.paidDays).toBe(5);
    expect(s.earned).toBe(Math.round((s.net * 5) / 30));
    expect(s.earned).toBeLessThan(stand('emp_5', []).earned);
  });

  test('who is eligible: permanent and fixed-term, active, tenure, a bank account, and a request left this month', () => {
    expect(stand('emp_5').eligible).toBe(true);
    expect(stand('emp_21').eligible).toBe(true);                       // fixed-term, 11 months
    expect(stand('emp_9').reasons.join(' ')).toContain('No bank account');   // Sana
    expect(stand('emp_9').available).toBe(0);
    expect(stand('emp_15').reasons.join(' ')).toContain('Contract employees');
    expect(stand('emp_22').reasons.join(' ')).toContain('On notice');
    const strict = { ...policy, minTenureMonths: 12 };
    expect(stand('emp_21', [], seed, strict).reasons.join(' ')).toContain('Joined 11 months ago');
    expect(stand('emp_21', [], seed, { ...policy, eligibleTypes: ['permanent'] as typeof policy.eligibleTypes }).eligible).toBe(false);
    // two requests used up the limit of two
    const used = [
      { id: 'a', employeeId: 'emp_5', month: '2026-11', amount: 500, fee: 0, status: 'pending' as const, requestedOn: TODAY },
      { id: 'b', employeeId: 'emp_5', month: '2026-11', amount: 500, fee: 0, status: 'declined' as const, requestedOn: TODAY },
      { id: 'c', employeeId: 'emp_5', month: '2026-11', amount: 500, fee: 0, status: 'settled' as const, requestedOn: TODAY },
    ];
    const s = stand('emp_5', used);
    expect(s.requestsUsed).toBe(2);                                   // the declined one does not count
    expect(s.eligible).toBe(false);
    expect(s.reasons.join(' ')).toContain('Already used 2 of 2');
  });

  test('what was already drawn comes off the available amount, and the advance it created is not counted twice as a recovery', () => {
    const d = structuredClone(seed);
    d.loans.push({ id: 'loan_wa', employeeId: 'emp_1', kind: 'advance', principal: 2000, emi: 2000, startMonth: '2026-11', recovered: 0 });
    const reqs = [{ id: 'w1', employeeId: 'emp_1', month: '2026-11', amount: 2000, fee: 0, status: 'approved' as const, requestedOn: TODAY, loanId: 'loan_wa' }];
    const before = stand('emp_1', []);
    const after = stand('emp_1', reqs, d);
    expect(after.recoveriesDue).toBe(0);
    expect(after.drawn).toBe(2000);
    expect(after.cap).toBe(before.cap);
    expect(after.available).toBe(before.cap - 2000);
    // An ordinary loan that is not a wage access advance still counts.
    d.loans.push({ id: 'loan_x', employeeId: 'emp_1', kind: 'loan', principal: 50000, emi: 10000, startMonth: '2026-11', recovered: 0 });
    expect(stand('emp_1', reqs, d).recoveriesDue).toBe(10000);
  });

  test('a request is never valid above what is available, below the minimum, off the step, or for someone ineligible', () => {
    const s = stand('emp_3', []);
    expect(validateAmount(s, policy, 5000)).toEqual([]);
    expect(validateAmount(s, policy, s.available)).toEqual([]);
    expect(validateAmount(s, policy, s.available + ROUND_TO).join(' ')).toContain('more than');
    expect(validateAmount(s, policy, 400).join(' ')).toContain('smallest request');
    expect(validateAmount(s, policy, 1250).join(' ')).toContain('multiples of');
    expect(validateAmount(s, policy, 0).join(' ')).toContain('Enter an amount');
    expect(validateAmount(stand('emp_10', []), policy, 2000).join(' ')).toContain('more than the');
    expect(validateAmount(stand('emp_9', []), policy, 1000).join(' ')).toContain('No bank account');
    expect(validateAmount(stand('emp_15', []), policy, 1000).length).toBeGreaterThan(0);
  });

  test('a new advance is recovered in this month’s payroll, or the next one once this month’s run is frozen', () => {
    expect(recoveryMonth(seed, 'emp_3', TODAY)).toBe('2026-11');
    const d = structuredClone(seed);
    d.payRuns.push({ id: 'run_nov', month: '2026-11', entityId: 'ent_retail', type: 'regular', status: 'frozen', lawVersion: 'x', createdAt: '', payslips: [], audit: [] });
    expect(recoveryMonth(d, 'emp_3', TODAY)).toBe('2026-12');
    expect(recoveryMonth(d, 'emp_12', TODAY)).toBe('2026-11');   // Manoj is in the other entity
  });

  test('policy validation and the summary numbers', () => {
    expect(validatePolicy(policy)).toEqual({});
    expect(validatePolicy({ ...policy, maxSharePct: 0 }).maxSharePct).toBeTruthy();
    expect(validatePolicy({ ...policy, maxSharePct: 101 }).maxSharePct).toBeTruthy();
    expect(validatePolicy({ ...policy, monthlyRequestLimit: 0 }).monthlyRequestLimit).toBeTruthy();
    expect(validatePolicy({ ...policy, fee: -1 }).fee).toBeTruthy();
    expect(validatePolicy({ ...policy, eligibleTypes: [] }).eligibleTypes).toBeTruthy();
    expect(validatePolicy({ ...policy, minAmount: 550 }).minAmount).toBeTruthy();
    const sum = wageSummary(seed, policy, wfSeed.wage.requests, TODAY);
    expect(sum.pending).toBe(3);
    expect(sum.approvedThisMonth).toBe(0);
    expect(sum.outstanding).toBe(0);
    expect(sum.eligibleTotal).toBe(22);
    expect(sum.eligible).toBe(19);                                    // not Sana (no bank), Dinesh (contract), Yash (notice)
    expect(sum.requestsThisMonth).toBe(3);
  });
});

// ═════════════════════════════ pure checks: kiosk ═════════════════════════════
test.describe('kiosk engine', () => {
  const early = { start: '07:00', end: '16:00', graceMinutes: 10 };
  const night = { start: '22:00', end: '06:00', graceMinutes: 10 };
  const rules = DEFAULT_RULES;
  const at = (hm: string, date = TODAY) => { const [h, m] = hm.split(':').map(Number); return { date, minute: h! * 60 + m! }; };
  const punch = (direction: 'in' | 'out', hm: string, o: Partial<Parameters<typeof evaluatePunch>[0]> = {}) => evaluatePunch({ rules, now: at(hm), direction, shift: early, ...o });

  test('a normal IN inside the shift window is accepted; after the grace period it is accepted as late', () => {
    expect(punch('in', '06:55')).toMatchObject({ result: 'accepted', flags: [] });
    expect(punch('in', '07:10')).toMatchObject({ result: 'accepted', flags: [] });             // exactly the grace
    const late = punch('in', '07:14');
    expect(late.result).toBe('accepted');
    expect(late.flags).toEqual(['late']);
    expect(late.lateBy).toBe(14);
    expect(late.message).toContain('14 minutes');
  });

  test('a second punch inside the duplicate window is ignored with a message; outside it, it counts', () => {
    const last = { ...at('09:00'), direction: 'in' as const };
    const dup = punch('out', '09:01', { last });
    expect(dup.result).toBe('ignored');
    expect(dup.flags).toEqual(['duplicate']);
    expect(dup.message).toContain('already recorded');
    expect(dup.message).toContain('2 minutes');
    expect(punch('out', '09:02', { last }).result).not.toBe('ignored');
    expect(evaluatePunch({ rules: { ...rules, duplicateWindowMin: 10 }, now: at('09:08'), direction: 'out', shift: early, last }).result).toBe('ignored');
  });

  test('IN twice without OUT is flagged, and OUT without IN is flagged', () => {
    const doubled = punch('in', '10:00', { last: { ...at('07:00'), direction: 'in' } });
    expect(doubled.result).toBe('flagged');
    expect(doubled.flags).toContain('double_in');
    expect(doubled.message).toContain('no OUT');
    const orphan = punch('out', '16:05', { last: { ...at('16:00', '2026-11-06'), direction: 'out' } });
    expect(orphan.result).toBe('flagged');
    expect(orphan.flags).toEqual(['out_without_in']);
    expect(punch('out', '16:05').flags).toEqual(['out_without_in']);
    expect(punch('out', '16:05', { last: { ...at('07:02'), direction: 'in' } })).toMatchObject({ result: 'accepted', flags: [] });
  });

  test('a punch outside the person’s shift window is flagged; the margins before and after the shift are normal', () => {
    expect(punch('in', '13:00').flags).not.toContain('outside_shift');     // mid-shift is inside the window (it is late, not outside)
    expect(punch('in', '20:00').flags).toContain('outside_shift');
    expect(punch('in', '20:00').result).toBe('flagged');
    expect(punch('in', '06:00').flags).not.toContain('outside_shift');     // 60 minutes early
    expect(punch('in', '05:59').flags).toContain('outside_shift');
    expect(punch('out', '18:00', { last: { ...at('07:00'), direction: 'in' } }).flags).not.toContain('outside_shift');   // 120 minutes late
    expect(punch('out', '18:01', { last: { ...at('07:00'), direction: 'in' } }).flags).toContain('outside_shift');
    expect(punch('in', '20:00', { shift: undefined }).flags).not.toContain('outside_shift');   // no shift: nothing to compare with
  });

  test('a punch on a rostered weekly off is flagged', () => {
    const p = punch('in', '07:00', { rosterOff: true });
    expect(p.result).toBe('flagged');
    expect(p.flags).toEqual(['weekly_off']);
  });

  test('a night shift crosses midnight: its OUT the next morning is inside the window', () => {
    const s = night;
    expect(matchShiftDate(s, rules, toAbs('2026-11-07', 6 * 60 + 5), '2026-11-07')).toBe('2026-11-06');
    expect(matchShiftDate(s, rules, toAbs('2026-11-06', 21 * 60 + 55), '2026-11-06')).toBe('2026-11-06');
    expect(matchShiftDate(s, rules, toAbs('2026-11-07', 12 * 60), '2026-11-07')).toBeNull();
    const out = evaluatePunch({ rules, now: at('06:05'), direction: 'out', shift: night, last: { ...at('21:55', '2026-11-06'), direction: 'in' } });
    expect(out).toMatchObject({ result: 'accepted', flags: [], shiftDate: '2026-11-06' });
  });

  test('three wrong PINs lock the person for the lockout time; a right PIN resets the count; a lock runs out', () => {
    const now = toAbs(TODAY, 600);
    const wrong = (lock?: Parameters<typeof checkPin>[0], t = now) => checkPin(lock, rules, t, '0000', '1234');
    const a = wrong();
    expect(a).toMatchObject({ ok: false, locked: false, lock: { tries: 1 } });
    expect(a.message).toContain('2 tries left');
    const b = wrong(a.lock);
    expect(b.message).toContain('1 try left');
    const c = wrong(b.lock);
    expect(c.locked).toBe(true);
    expect(c.lock.lockedUntil).toBe(now + rules.lockoutMin);
    // even the right PIN is refused while locked
    const refused = checkPin(c.lock, rules, now + 5, '1234', '1234');
    expect(refused).toMatchObject({ ok: false, locked: true });
    expect(refused.message).toContain('10 minutes');
    // after the lockout it works again
    expect(checkPin(c.lock, rules, now + rules.lockoutMin, '1234', '1234')).toMatchObject({ ok: true, lock: { tries: 0 } });
    // a right PIN in between resets the count
    expect(checkPin(a.lock, rules, now, '1234', '1234').lock.tries).toBe(0);
    expect(checkPin(undefined, rules, now, '1234', undefined).message).toContain('No PIN');
  });

  test('seeded day: Dinesh has a missing OUT, Anita is late and not in, Santosh came late, Manoj is on site', () => {
    const k = wfSeed.kiosk;
    const missing = findMissingOuts(seed, k, toAbs(TODAY, k.clockMin));
    expect(missing.map((m) => m.employeeId)).toEqual(['emp_15']);
    expect(missing[0]!.key).toBe('missing_out:emp_15:2026-11-06');
    expect(findMissingOuts(seed, k, toAbs(TODAY, 5 * 60))).toEqual([]);     // at 05:00 the night shift is still running
    const board = buildBoard(seed, k, TODAY, k.clockMin);
    const by = Object.fromEntries(board.map((b) => [b.employee.id, b]));
    expect(by.emp_15!.status).toBe('missing_out');
    expect(by.emp_11!.status).toBe('late_not_in');
    expect(by.emp_11!.lateBy).toBe(20);
    expect(by.emp_13!.status).toBe('in');
    expect(by.emp_13!.lateBy).toBe(14);
    expect(by.emp_12!.status).toBe('in');
    expect(by.emp_12!.lateBy).toBeUndefined();
    expect(by.emp_14!.status).toBe('expected');
    expect(board[0]!.status).toBe('missing_out');                           // most urgent first
    // before the general shift starts, Anita is simply expected
    expect(buildBoard(seed, k, TODAY, 9 * 60).find((b) => b.employee.id === 'emp_11')!.status).toBe('expected');
    // ignored double taps do not count
    expect(counted(k.punches.filter((p) => p.employeeId === 'emp_12')).length).toBe(3);
    expect(k.punches.filter((p) => p.employeeId === 'emp_12').length).toBe(4);
  });

  test('the roster decides the shift: a roster row for the week wins, weekly off is off, no row falls back to the default shift', () => {
    const anita = seed.employees.find((e) => e.id === 'emp_11')!;
    const dinesh = seed.employees.find((e) => e.id === 'emp_15')!;
    expect(planFor(seed, anita, TODAY)).toMatchObject({ off: false, rostered: true });
    expect(planFor(seed, anita, '2026-11-08').off).toBe(true);              // Sunday
    expect(planFor(seed, dinesh, TODAY)).toMatchObject({ off: false, rostered: false });
    expect(planFor(seed, dinesh, TODAY).shift!.id).toBe('sh_night');
    expect(fmtHm(9 * 60 + 5)).toBe('09:05');
  });
});

// ═════════════════════════════ pure checks: verified onboarding ═════════════════════════════
test.describe('verification engine (all simulated)', () => {
  const inputs = (name: string) => wfSeed.verify.cases.find((c) => c.name === name)!.inputs;
  const run = (key: Parameters<typeof runCheck>[0]['key'], name: string, extra: Partial<Parameters<typeof runCheck>[0]> = {}) => runCheck({ key, name, inputs: inputs(name), runsSoFar: 1, ...extra });

  test('names: the same words in any order match, a spelling slip or initials are close, anything else is different', () => {
    expect(compareNames('Aditya Bhat', 'BHAT ADITYA')).toBe('match');
    expect(compareNames('Mr. Aditya Bhat', 'ADITYA BHAT')).toBe('match');
    expect(compareNames('Shreya Banerjee', 'SHREYA BANERJI')).toBe('close');
    expect(compareNames('Rahul Deshmukh', 'R S DESHMUKH')).toBe('close');
    expect(compareNames('Aditya Bhat', 'Rohit Sharma')).toBe('different');
    expect(compareNames('Aditya Bhat', 'Aditya Rao')).toBe('different');
    expect(compareNames('', 'X')).toBe('different');
  });

  test('PAN: the shape is checked for real, then a canned registry answers the same way every time; a name mismatch shows both names', () => {
    expect(run('pan', 'Aditya Bhat')).toMatchObject({ status: 'verified' });
    const mm = run('pan', 'Shreya Banerjee');
    expect(mm.status).toBe('mismatch');
    expect(mm.compare).toEqual({ label: 'Name on PAN', ours: 'Shreya Banerjee', theirs: 'SHREYA BANERJI' });
    expect(run('pan', 'Shreya Banerjee')).toEqual(mm);                                           // repeatable
    const base = inputs('Aditya Bhat');
    expect(runCheck({ key: 'pan', name: 'Aditya Bhat', inputs: { ...base, pan: 'NOTAPAN' }, runsSoFar: 0 }).evidence).toContain('PAN format is wrong');
    expect(runCheck({ key: 'pan', name: 'Aditya Bhat', inputs: { ...base, pan: 'AAACM1234F' }, runsSoFar: 0 }).evidence).toContain('not an individual');
    expect(runCheck({ key: 'pan', name: 'Aditya Bhat', inputs: { ...base, pan: 'ZZZPZ9999Z' }, runsSoFar: 0 }).status).toBe('failed');
  });

  test('Aadhaar: the checksum is real, only the last four digits come back, and the full number is never in the evidence', () => {
    const good = sampleAadhaar(25);
    expect(checkAadhaar(good).ok).toBe(true);
    const r = run('aadhaar', 'Shreya Banerjee', { aadhaar: good });
    expect(r.status).toBe('verified');
    expect(r.aadhaarLast4).toBe(good.slice(-4));
    expect(JSON.stringify(r)).not.toContain(good);
    expect(JSON.stringify(r)).not.toContain(good.slice(0, 8));
    const wrongSum = good.slice(0, 11) + String((Number(good[11]) + 1) % 10);
    const bad = run('aadhaar', 'Shreya Banerjee', { aadhaar: wrongSum });
    expect(bad.status).toBe('failed');
    expect(bad.evidence).toContain('checksum');
    expect(bad.aadhaarLast4).toBeUndefined();
    expect(run('aadhaar', 'Shreya Banerjee', { aadhaar: '123' }).status).toBe('failed');
    expect(run('aadhaar', 'Shreya Banerjee', { aadhaar: sampleAadhaar(99) }).evidence).toContain('deactivated');
  });

  test('bank: IFSC and account are checked, the holder name is compared, closed accounts fail', () => {
    expect(run('bank', 'Aditya Bhat')).toMatchObject({ status: 'verified', results: { bankName: 'HDFC Bank' } });
    const rahul = run('bank', 'Rahul Deshmukh');
    expect(rahul.status).toBe('mismatch');
    expect(rahul.compare!.theirs).toBe('R S DESHMUKH');
    const base = inputs('Aditya Bhat');
    expect(runCheck({ key: 'bank', name: 'Aditya Bhat', inputs: { ...base, bankAccount: '12' }, runsSoFar: 0 }).evidence).toContain('Account number not accepted');
    expect(runCheck({ key: 'bank', name: 'Aditya Bhat', inputs: { ...base, ifsc: 'bad' }, runsSoFar: 0 }).evidence).toContain('IFSC not accepted');
    expect(runCheck({ key: 'bank', name: 'Aditya Bhat', inputs: { ...base, ifsc: 'ZZZZ0000001' }, runsSoFar: 0 }).evidence).toContain('not found');
    expect(runCheck({ key: 'bank', name: 'Aditya Bhat', inputs: { ...base, bankAccount: '50100000010000' }, runsSoFar: 0 }).evidence).toContain('closed');
    expect(runCheck({ key: 'bank', name: 'Aditya Bhat', inputs: { ...base, accountHolder: 'Someone Else' }, runsSoFar: 0 }).status).toBe('mismatch');
  });

  test('UAN: an existing one is looked up, a blank one is generated the same way every time', () => {
    const existing = run('uan', 'Rahul Deshmukh');
    expect(existing).toMatchObject({ status: 'verified', results: { uan: '100412345678', uanStatus: 'aadhaar_seeded' } });
    expect(run('uan', 'Aditya Bhat').results).toMatchObject({ uan: '100987654321', uanStatus: 'activated' });
    const gen = run('uan', 'Shreya Banerjee');
    expect(gen.status).toBe('verified');
    expect(gen.results!.uanStatus).toBe('generated');
    expect(gen.results!.uan).toBe(generateUan('Shreya Banerjee|BQMPB7781L'));
    expect(gen.results!.uan).toMatch(/^[0-9]{12}$/);
    expect(gen.evidence).toContain('sample UAN');
    const base = inputs('Aditya Bhat');
    expect(runCheck({ key: 'uan', name: 'Aditya Bhat', inputs: { ...base, uan: '123' }, runsSoFar: 0 }).status).toBe('failed');
    expect(runCheck({ key: 'uan', name: 'Aditya Bhat', inputs: { ...base, uan: '100000000000' }, runsSoFar: 0 }).evidence).toContain('not found');
  });

  test('education and employer take two runs: the first sends the request, the second brings the answer', () => {
    const first = run('education', 'Aditya Bhat', { runsSoFar: 0 });
    expect(first.status).toBe('in_progress');
    expect(run('education', 'Aditya Bhat', { runsSoFar: 1 }).status).toBe('verified');
    const base = inputs('Aditya Bhat');
    expect(runCheck({ key: 'education', name: 'Aditya Bhat', inputs: { ...base, institution: 'Nowhere Institute' }, runsSoFar: 1 }).status).toBe('failed');
    expect(runCheck({ key: 'education', name: 'Aditya Bhat', inputs: { ...base, gradYear: '1950' }, runsSoFar: 0 }).status).toBe('failed');
    expect(run('employer', 'Rahul Deshmukh', { runsSoFar: 0 }).status).toBe('in_progress');
    expect(run('employer', 'Rahul Deshmukh', { runsSoFar: 1 }).status).toBe('verified');
    const dates = runCheck({ key: 'employer', name: 'Rahul Deshmukh', inputs: { ...inputs('Rahul Deshmukh'), employerFrom: '2018-01-01' }, runsSoFar: 1 });
    expect(dates.status).toBe('mismatch');
    expect(dates.compare!.label).toBe('Service dates');
    expect(runCheck({ key: 'employer', name: 'X', inputs: { ...base, employerName: 'Unknown Co' }, runsSoFar: 1 }).status).toBe('failed');
  });

  test('readiness: four mandatory steps, an accepted mismatch counts, the rest is listed as blocking', () => {
    const [aditya, shreya, rahul] = wfSeed.verify.cases;
    expect(readiness(aditya!)).toMatchObject({ pct: 50, mandatoryDone: 2, canClear: false });
    expect(readiness(aditya!).blocking.map((b) => b.key)).toEqual(['bank', 'uan']);
    expect(readiness(aditya!).optionalPending.map((b) => b.key)).toEqual(['education', 'employer']);
    expect(readiness(shreya!).blocking.map((b) => b.key)).toEqual(['pan', 'aadhaar', 'uan']);
    expect(readiness(shreya!).blocking[0]!.why).toContain('Accept it with a reason');
    expect(readiness(rahul!).pct).toBe(25);
    const c = structuredClone(shreya!);
    expect(stepDone(c.steps.pan)).toBe(false);
    c.steps.pan.accepted = { reason: 'Spelling on the PAN card only', by: 'x', on: TODAY };
    expect(stepDone(c.steps.pan)).toBe(true);
    c.steps.pan.accepted = undefined;
    c.steps.pan.correction = { note: 'Fix it', by: 'x', on: TODAY };
    expect(readiness(c).blocking[0]!.why).toContain('Correction requested');
    const all = structuredClone(emptySteps());
    for (const k of ['pan', 'aadhaar', 'bank', 'uan'] as const) all[k] = { status: 'verified', runs: 1 };
    expect(readiness({ steps: all })).toMatchObject({ pct: 100, canClear: true, blocking: [] });
    expect(readiness({ steps: emptySteps() })).toMatchObject({ pct: 0, canClear: false });
  });
});

// ═════════════════════════════ contract labour page ═════════════════════════════
const CONTRACT = '/dashboard/hrms/contract-labour';
const card = (page: Page, id: string) => page.getByTestId(`contractor-${id}`);

test.describe('contract labour page', () => {
  test('shows the three contractors, the expired registration blocker and who is at what risk', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, CONTRACT);
    await expect(page.getByRole('heading', { name: 'Contract labour', level: 1 })).toBeVisible();
    const blocker = page.getByTestId('clra-blocker');
    await expect(blocker).toContainText('Meridian Logistics LLP');
    await expect(blocker).toContainText('CLRA/MH/2021/0112');
    await expect(blocker).toContainText('30 Apr 2026');
    await expect(blocker.getByRole('link', { name: 'Open Organization' })).toHaveAttribute('href', /\/dashboard\/hrms\/organization/);
    await expect(blocker).toContainText('Sample, confirm');
    await expect(card(page, 'ctr_sai')).toContainText('Sai Manpower Services');
    await expect(card(page, 'ctr_ganesh')).toContainText('Licence expired 31 Oct 2026');
    await expect(card(page, 'ctr_kalyan')).toContainText('Kalyan Skilled Workforce LLP');
    await expect(card(page, 'ctr_sai').getByTestId('risk-meter')).toHaveAttribute('data-level', 'medium');
    await expect(card(page, 'ctr_ganesh').getByTestId('risk-meter')).toHaveAttribute('data-level', 'high');
    await expect(card(page, 'ctr_kalyan').getByTestId('risk-meter')).toHaveAttribute('data-level', 'low');
    await expect(card(page, 'ctr_sai')).toContainText('invoice ₹3,42,000');
    expect(errors).toEqual([]);
  });

  test('the month switch re-works every check: Sai is low risk in September and medium in October', async ({ page }) => {
    await openHrms(page, CONTRACT);
    await page.getByRole('tab', { name: 'Sep 2026' }).click();
    await expect(card(page, 'ctr_sai').getByTestId('risk-meter')).toHaveAttribute('data-level', 'low');
    await expect(card(page, 'ctr_ganesh').getByTestId('risk-meter')).toHaveAttribute('data-level', 'medium');
    await expect(page.getByTestId('invoice-advice')).toContainText('Looks clear to pay');
    await expect(page.getByTestId('decision-summary')).toContainText('Cleared to pay');
    await page.getByRole('tab', { name: 'Oct 2026' }).click();
    await expect(card(page, 'ctr_sai').getByTestId('risk-meter')).toHaveAttribute('data-level', 'medium');
    await expect(page.getByTestId('invoice-advice')).toContainText('Hold recommended');
    await expect(page.getByTestId('invoice-advice')).toContainText('esi challan');
  });

  test('Sai, October: the checks name what is wrong in plain words, with the confidence on the wage test', async ({ page }) => {
    await openHrms(page, CONTRACT);
    await expect(page.getByTestId('check-headcount')).toHaveAttribute('data-status', 'fail');
    await expect(page.getByTestId('check-headcount')).toContainText('bills 8 people but attendance shows 6');
    await expect(page.getByTestId('check-esi_proof')).toHaveAttribute('data-status', 'fail');
    await expect(page.getByTestId('check-pf_proof')).toHaveAttribute('data-status', 'pass');
    await expect(page.getByTestId('check-min_wage')).toHaveAttribute('data-status', 'pass');
    await expect(page.getByTestId('check-min_wage')).toContainText('Sample, confirm');
    await expect(page.getByTestId('risk-panel')).toContainText('ESI challan for Oct 2026 has not been received');
    await expect(page.getByTestId('risk-panel').getByText('Serious', { exact: true })).toBeVisible();
    await expect(page.getByTestId('risk-panel').getByText('Moderate', { exact: true })).toBeVisible();
    await page.getByTestId('risk-panel').getByText('How the risk level is decided').click();
    await expect(page.getByTestId('risk-panel')).toContainText('There is no score');
    // the HR-record contract worker is in the list, marked as such
    const workers = page.getByTestId('workers-panel');
    await expect(workers.getByRole('row', { name: /Dinesh Kamble/ })).toContainText('HR records');
    await expect(workers.getByRole('row', { name: /Nitin Kadu/ })).toContainText('No attendance');
    await expect(workers).toContainText('Sample, confirm');
  });

  test('Ganesh: expired licence, three workers under the minimum, PF proof missing', async ({ page }) => {
    await openHrms(page, CONTRACT);
    await card(page, 'ctr_ganesh').click();
    await expect(page.getByTestId('check-licence_today')).toContainText('expired on 31 Oct 2026, 7 days ago');
    await expect(page.getByTestId('check-min_wage')).toHaveAttribute('data-status', 'fail');
    await expect(page.getByTestId('check-min_wage')).toContainText('3 of 5 workers were paid under');
    const workers = page.getByTestId('workers-panel');
    await expect(workers.getByRole('row', { name: /Sagar Dalvi/ })).toContainText('Short by ₹1,600');
    await expect(workers.getByRole('row', { name: /Mahesh Chavan/ })).toContainText('At or above');
    await expect(page.getByTestId('proof-pf_challan')).toContainText('Missing');
    await expect(page.getByTestId('risk-panel')).toContainText('High risk');
  });

  test('a proof: add a file, verify it, and it is kept after a reload; verifying shows who and when', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, CONTRACT);
    const esi = page.getByTestId('proof-esi_challan');
    await expect(esi).toContainText('Missing');
    await esi.getByRole('button', { name: 'Add file for ESI challan' }).click();
    const dlg = dialog(page);
    await dlg.getByLabel('File name').fill('x');
    await dlg.getByRole('button', { name: 'Mark as received' }).click();
    await expect(dlg.getByText('Enter a file name')).toBeVisible();
    await dlg.getByLabel('File name').fill('sai-esi-oct-final.pdf');
    await dlg.getByRole('button', { name: 'Mark as received' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(esi).toContainText('Received');
    await expect(esi).toContainText('sai-esi-oct-final.pdf');
    await expect(esi).toContainText('not yet checked by a person');
    await expect(page.getByTestId('check-esi_proof')).toHaveAttribute('data-status', 'pass');
    await esi.getByRole('button', { name: 'Verify ESI challan' }).click();
    await expect(esi).toContainText('Verified by You (HR admin) on 7 Nov 2026');
    await expect(page.getByTestId('invoice-advice')).toContainText('Review before paying');   // headcount is still off
    const saved = (await readWf(page)).contract.proofs.find((p) => p.id === 'pr_sai_2026-10_esi_challan')!;
    expect(saved).toMatchObject({ status: 'received', fileName: 'sai-esi-oct-final.pdf', verifiedBy: 'You (HR admin)', verifiedOn: TODAY });
    await page.reload();
    await expect(page.getByTestId('proof-esi_challan')).toContainText('Verified by You (HR admin)');
    await expect(page.getByTestId('invoice-advice')).toContainText('Review before paying');
    expect(errors).toEqual([]);
  });

  test('rejecting a proof asks for a reason and the check fails with it', async ({ page }) => {
    await openHrms(page, CONTRACT);
    const pf = page.getByTestId('proof-pf_challan');
    await pf.getByRole('button', { name: 'Reject PF challan and return' }).click();
    const dlg = dialog(page);
    await dlg.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(dlg.getByText('Say why it is rejected')).toBeVisible();
    await dlg.getByLabel('Why is it rejected?').fill('Wrong month on the challan');
    await dlg.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(pf).toContainText('Rejected: Wrong month on the challan');
    await expect(page.getByTestId('check-pf_proof')).toHaveAttribute('data-status', 'fail');
    await expect(page.getByTestId('check-pf_proof')).toContainText('was rejected: Wrong month');
    await pf.getByRole('button', { name: 'Remove file for PF challan and return' }).click();
    await expect(pf).toContainText('Missing');
  });

  test('holding an invoice needs a reason and keeps the contractor’s reply; the decision survives a reload and can be changed', async ({ page }) => {
    await openHrms(page, CONTRACT);
    await page.getByTestId('hold-invoice').click();
    const dlg = dialog(page);
    await dlg.getByRole('button', { name: 'Hold invoice' }).click();
    await expect(dlg.getByText('Say why the invoice is on hold')).toBeVisible();
    await dlg.getByLabel('Why is it on hold?').fill('ESI challan for October not received');
    await dlg.getByLabel(/Contractor.s reply/).fill('Will send it on Monday');
    await dlg.getByRole('button', { name: 'Hold invoice' }).click();
    const sum = page.getByTestId('decision-summary');
    await expect(sum).toContainText('On hold');
    await expect(sum).toContainText('You (HR admin)');
    await expect(sum).toContainText('ESI challan for October not received');
    await expect(sum).toContainText('Will send it on Monday');
    await expect(card(page, 'ctr_sai')).toContainText('On hold');
    const d = (await readWf(page)).contract.decisions.find((x) => x.id === 'ctr_sai:2026-10')!;
    expect(d).toMatchObject({ decision: 'hold', advisory: 'hold', on: TODAY, contractorReply: 'Will send it on Monday' });
    await page.reload();
    await expect(page.getByTestId('decision-summary')).toContainText('On hold');
    await page.getByRole('button', { name: 'Change decision' }).click();
    await expect(page.getByTestId('clear-pay')).toBeVisible();
    expect((await readWf(page)).contract.decisions.find((x) => x.id === 'ctr_sai:2026-10')).toBeUndefined();
  });

  test('clearing against the advice needs a reason, and the override is recorded with what was advised', async ({ page }) => {
    await openHrms(page, CONTRACT);
    await card(page, 'ctr_ganesh').click();
    await page.getByTestId('clear-pay').click();
    const dlg = dialog(page);
    await expect(dlg).toContainText('The checks advised a hold');
    await dlg.getByRole('button', { name: 'Clear to pay' }).click();
    await expect(dlg.getByText('The checks advised against this')).toBeVisible();
    await dlg.getByLabel('Why are you clearing it?').fill('PF challan received by email, verified on a call');
    await dlg.getByRole('button', { name: 'Clear to pay' }).click();
    const sum = page.getByTestId('decision-summary');
    await expect(sum).toContainText('Cleared to pay');
    await expect(sum).toContainText('cleared against advice: hold was advised');
    expect((await readWf(page)).contract.decisions.find((x) => x.id === 'ctr_ganesh:2026-10')).toMatchObject({ decision: 'cleared', advisory: 'hold' });
  });

  test('when everything passes, Clear to pay needs no reason', async ({ page }) => {
    await openHrms(page, CONTRACT);
    await card(page, 'ctr_kalyan').click();
    await expect(page.getByTestId('invoice-advice')).toContainText('Looks clear to pay');
    await page.getByTestId('clear-pay').click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('decision-summary')).toContainText('Cleared to pay');
    await expect(page.getByTestId('decision-summary')).toContainText('All proofs held and every check passes');
  });

  test('correcting the people billed on the invoice re-works the headcount check', async ({ page }) => {
    await openHrms(page, CONTRACT);
    await expect(page.getByTestId('check-headcount')).toHaveAttribute('data-status', 'fail');
    const save = page.getByRole('button', { name: 'Save people billed' });
    await expect(save).toBeDisabled();
    await page.getByLabel('People billed on SMS/1026').fill('6');
    await save.click();
    await expect(page.getByTestId('check-headcount')).toHaveAttribute('data-status', 'pass');
    expect((await readWf(page)).contract.invoices.find((i) => i.id === 'inv_sai_oct')!.headcount).toBe(6);
    await page.getByLabel('People billed on SMS/1026').fill('9');
    await save.click();
    await expect(page.getByTestId('check-headcount')).toHaveAttribute('data-status', 'fail');
    await page.getByLabel('People billed on SMS/1026').fill('4');
    await save.click();
    await expect(page.getByTestId('check-headcount')).toHaveAttribute('data-status', 'warn');
  });

  test('no sideways page scroll at 390px, and the wide tables scroll inside their own box', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHrms(page, CONTRACT);
    await expect(page.getByTestId('clra-blocker')).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
    const workersScroll = await page.getByTestId('workers-panel').locator('table').evaluate((t) => t.parentElement!.scrollWidth - t.parentElement!.clientWidth);
    expect(workersScroll).toBeGreaterThan(0);
  });
});

// ═════════════════════════════ wage access page ═════════════════════════════
const WAGE = '/dashboard/hrms/wage-access';
const approveBtn = (page: Page, amount: number, who: string) => page.getByRole('button', { name: `Approve ${money(amount)} for ${who}` });

test.describe('wage access page', () => {
  test('the preview notice is always on screen, on both views, and the HR view starts with three waiting requests', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, WAGE);
    const notice = page.getByTestId('wage-access-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Preview only');
    await expect(notice).toContainText('regulatory and tax treatment');
    await expect(notice).toContainText('confirmed with counsel before any live use');
    await expect(notice).toContainText('Sample, confirm');
    await expect(page.getByTestId('inbox')).toContainText('3 waiting');
    for (const id of ['wa_1', 'wa_2', 'wa_3']) await expect(page.getByTestId(`request-${id}`)).toBeVisible();
    await expect(page.getByTestId('policy-card')).toContainText('50%');
    await expect(page.getByTestId('policy-card')).toContainText('Permanent and Fixed-term');
    await page.getByRole('tab', { name: 'Employee view' }).click();
    await expect(notice).toBeVisible();
    await expect(page.getByTestId('can-take')).toContainText('You can take up to ₹15,000');   // Divya, the default person
    expect(errors).toEqual([]);
  });

  test('a request that is more than what is available cannot be approved, and the page says why', async ({ page }) => {
    await openHrms(page, WAGE);
    const vikram = page.getByTestId('request-wa_2');
    await expect(vikram).toContainText('₹2,000 is more than the ₹400 available');
    await expect(vikram).toContainText('₹5,000 due to payroll');
    await expect(approveBtn(page, 2000, 'Vikram Joshi')).toBeDisabled();
    await expect(approveBtn(page, 5000, 'Neha Bansal')).toBeEnabled();
    await expect(approveBtn(page, 2500, 'Meenal Shah')).toBeEnabled();
  });

  test('approving creates a core advance that shows in Payroll, Loans and advances, and lowers what is left', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, WAGE);
    await approveBtn(page, 5000, 'Neha Bansal').click();
    await expect(page.getByTestId('request-wa_1')).toHaveCount(0);
    await expect(page.getByTestId('inbox')).toContainText('2 waiting');
    await expect(page.getByTestId('recovery-wa_1')).toContainText('Neha Bansal');
    await expect(page.getByTestId('recovery-wa_1')).toContainText('taken in the Nov 2026 payroll');
    await expect(page.getByTestId('recovery-wa_1')).toContainText('₹5,000 to recover');
    const row = page.getByTestId('eligibility').getByRole('row', { name: /Neha Bansal/ });
    await expect(row).toContainText('₹5,000');      // drawn
    await expect(row).toContainText('₹1,100');      // 6,100 less 5,000
    await expect(row).toContainText('1 of 2');      // an approved request still counts as one of the two
    const db = await readDb(page);
    const loan = db.loans.find((l) => l.note?.startsWith('Wage access wa_1'))!;
    expect(loan).toMatchObject({ employeeId: 'emp_3', kind: 'advance', principal: 5000, emi: 5000, startMonth: '2026-11', recovered: 0 });
    const req = (await readWf(page)).wage.requests.find((r) => r.id === 'wa_1')!;
    expect(req).toMatchObject({ status: 'approved', loanId: loan.id, recoverIn: '2026-11', decidedBy: 'You (HR admin)' });
    // through the UI: the Loans tab on the payroll page
    await page.goto('/dashboard/hrms/payroll?tab=loans');
    const loans = page.getByRole('row', { name: /Neha Bansal/ });
    await expect(loans).toContainText('Advance');
    await expect(loans).toContainText('₹5,000');
    await expect(loans).toContainText('Nov 2026');
    await expect(page.getByTestId('loan-summary')).toContainText('3 shown');
    // and it survives a reload of the wage page
    await page.goto(WAGE);
    await expect(page.getByTestId('recovery-wa_1')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('after an approval what is left shrinks, and someone with less than the smallest request left cannot draw', async ({ page }) => {
    await openHrms(page, WAGE);
    // Meenal has ₹2,700 available and asks for ₹2,500: approving it leaves ₹200, below the ₹500 minimum.
    await approveBtn(page, 2500, 'Meenal Shah').click();
    await expect(page.getByTestId('request-wa_3')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Employee view' }).click();
    await page.getByLabel('Choose employee').selectOption({ label: 'Meenal Shah (MER-1021)' });
    await expect(page.getByTestId('can-take')).toContainText('You can take up to ₹200');
    await expect(page.getByTestId('cannot-draw')).toContainText('nothing to draw right now');
  });

  test('declining needs a reason the person can read, and the request moves to History', async ({ page }) => {
    await openHrms(page, WAGE);
    await page.getByRole('button', { name: 'Decline request from Vikram Joshi' }).click();
    const dlg = dialog(page);
    await dlg.getByRole('button', { name: 'Decline', exact: true }).click();
    await expect(dlg.getByText('Give the person a reason')).toBeVisible();
    await dlg.getByLabel('Reason').fill('Only ₹400 is available, ask again after the 15th');
    await dlg.getByRole('button', { name: 'Decline', exact: true }).click();
    await expect(page.getByTestId('request-wa_2')).toHaveCount(0);
    await expect(page.getByTestId('inbox')).toContainText('2 waiting');
    const hist = page.getByTestId('history').getByRole('row', { name: /Vikram Joshi/ });
    await expect(hist).toContainText('Declined');
    await expect(hist).toContainText('ask again after the 15th');
    expect((await readWf(page)).wage.requests.find((r) => r.id === 'wa_2')).toMatchObject({ status: 'declined', decidedBy: 'You (HR admin)' });
    // a declined request does not use up one of the person's requests
    await expect(page.getByTestId('eligibility').getByRole('row', { name: /Vikram Joshi/ })).toContainText('0 of 2');
    // a core loan was not created
    expect((await readDb(page)).loans.length).toBe(seed.loans.length);
  });

  test('editing the policy checks the values, is kept after a reload, and changes what people can draw', async ({ page }) => {
    await openHrms(page, WAGE);
    await page.getByRole('button', { name: 'Edit policy' }).click();
    await page.getByLabel('Share of earned salary available (%)').fill('0');
    await page.getByRole('button', { name: 'Save policy' }).click();
    await expect(page.getByText('Enter a share from 1 to 100.')).toBeVisible();
    await page.getByLabel('Smallest request (₹)').fill('550');
    await page.getByLabel('Share of earned salary available (%)').fill('25');
    await page.getByRole('button', { name: 'Save policy' }).click();
    await expect(page.getByText('Enter a multiple of 100, at least 100.')).toBeVisible();
    await page.getByLabel('Smallest request (₹)').fill('500');
    await page.getByLabel('Fee per request (₹)').fill('50');
    await page.getByRole('button', { name: 'Save policy' }).click();
    await expect(page.getByTestId('policy-card')).toContainText('25%');
    await expect(page.getByTestId('policy-card')).toContainText('₹50');
    // 25% of Neha's ₹12,263 earned is about ₹3,065, rounded down to ₹3,000, so the ₹5,000 request no longer fits
    await expect(page.getByTestId('eligibility').getByRole('row', { name: /Neha Bansal/ })).toContainText('₹3,000');
    await expect(approveBtn(page, 5000, 'Neha Bansal')).toBeDisabled();
    await expect(page.getByTestId('request-wa_1')).toContainText('is more than the ₹3,000 available');
    expect((await readWf(page)).wage.policy).toMatchObject({ maxSharePct: 25, fee: 50, minAmount: 500 });
    await page.reload();
    await expect(page.getByTestId('policy-card')).toContainText('25%');
    await expect(approveBtn(page, 5000, 'Neha Bansal')).toBeDisabled();
  });

  test('policy: a longer minimum tenure and a narrower eligible group each take people out, with the reason shown', async ({ page }) => {
    await openHrms(page, WAGE);
    const meenal = page.getByTestId('eligibility').getByRole('row', { name: /Meenal Shah/ });
    await expect(meenal).toContainText('Yes');
    await page.getByRole('button', { name: 'Edit policy' }).click();
    await page.getByLabel('Minimum tenure (months)').fill('12');
    await page.getByRole('button', { name: 'Save policy' }).click();
    await expect(meenal).toContainText('Joined 11 months ago. The policy asks for 12.');
    await expect(approveBtn(page, 2500, 'Meenal Shah')).toBeDisabled();
    await page.getByRole('button', { name: 'Edit policy' }).click();
    await page.getByLabel('Fixed-term').uncheck();
    await page.getByLabel('Permanent').uncheck();
    await page.getByRole('button', { name: 'Save policy' }).click();
    await expect(page.getByText('Pick at least one group.')).toBeVisible();
    await page.getByLabel('Permanent').check();
    await page.getByRole('button', { name: 'Save policy' }).click();
    await expect(page.getByTestId('policy-card')).toContainText('Permanent');
    await expect(page.getByTestId('policy-card').getByTestId('policy-who-is-eligible')).not.toContainText('Fixed-term');
  });

  test('Employee view: a slider request lands in the HR inbox, and the person can cancel a waiting one', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, WAGE);
    await page.getByRole('tab', { name: 'Employee view' }).click();
    await expect(page.getByTestId('breakdown')).toContainText('Earned so far');
    const slider = page.getByRole('slider', { name: 'Amount to draw' });
    await slider.fill('3000');
    await expect(page.getByTestId('draw-amount')).toHaveText('₹3,000');
    await expect(page.getByTestId('employee-card')).toContainText('Fee: ₹0');
    await page.getByTestId('request-submit').click();
    await expect(page.getByTestId('my-history')).toContainText('₹3,000');
    await expect(page.getByTestId('my-history')).toContainText('Waiting');
    const saved = (await readWf(page)).wage.requests.find((r) => r.employeeId === 'emp_5' && r.status === 'pending')!;
    expect(saved).toMatchObject({ amount: 3000, month: '2026-11', fee: 0, requestedOn: TODAY });
    await page.getByRole('tab', { name: 'HR view' }).click();
    await expect(page.getByTestId('inbox')).toContainText('4 waiting');
    await expect(page.getByTestId(`request-${saved.id}`)).toContainText('Divya Menon');
    await page.reload();
    await expect(page.getByTestId('inbox')).toContainText('4 waiting');
    await page.getByRole('tab', { name: 'Employee view' }).click();
    await page.getByRole('button', { name: `Cancel request ${saved.id}` }).click();
    await expect(page.getByTestId('my-history').getByTestId(`my-request-${saved.id}`)).toContainText('Cancelled');
    await page.getByRole('tab', { name: 'HR view' }).click();
    await expect(page.getByTestId('inbox')).toContainText('3 waiting');
    expect(errors).toEqual([]);
  });

  test('Employee view: someone who is not eligible sees why and gets no slider; the request limit is enforced', async ({ page }) => {
    await openHrms(page, `${WAGE}?tab=employee`);
    const pick = page.getByLabel('Choose employee');
    await pick.selectOption({ label: 'Sana Qureshi (MER-1009)' });
    await expect(page.getByTestId('not-eligible')).toBeVisible();
    await expect(page.getByTestId('employee-card')).toContainText('No bank account on file to pay into.');
    await expect(page.getByRole('slider')).toHaveCount(0);
    await pick.selectOption({ label: 'Dinesh Kamble (MER-1015)' });
    await expect(page.getByTestId('employee-card')).toContainText('Contract employees are not in the eligible group.');
    await pick.selectOption({ label: 'Yash Rathore (MER-1022)' });
    await expect(page.getByTestId('employee-card')).toContainText('On notice');
    // Neha has used 1 of 2: one more request is allowed, then the limit shows
    await pick.selectOption({ label: 'Neha Bansal (MER-1003)' });
    await expect(page.getByTestId('breakdown')).toContainText('1 of 2');
    await page.getByRole('slider', { name: 'Amount to draw' }).fill('500');
    await page.getByTestId('request-submit').click();
    await expect(page.getByTestId('not-eligible')).toBeVisible();
    await expect(page.getByTestId('employee-card')).toContainText('Already used 2 of 2 requests for Nov 2026.');
    await expect(page.getByRole('slider')).toHaveCount(0);
  });

  test('the HR view lists everyone with what they can draw, and no sideways page scroll at 390px', async ({ page }) => {
    await openHrms(page, WAGE);
    const table = page.getByTestId('eligibility');
    await expect(table.getByRole('row', { name: /Sana Qureshi/ })).toContainText('No bank account on file to pay into.');
    await expect(table.getByRole('row', { name: /Ritu Malhotra/ })).toContainText('₹17,600');
    await expect(table.getByRole('row', { name: /Pooja Verma/ })).toContainText('₹2,000');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('wage-access-notice')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.getByRole('tab', { name: 'Employee view' }).click();
    await expect(page.getByTestId('can-take')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

// ═════════════════════════════ site kiosk page ═════════════════════════════
const KIOSK = '/dashboard/hrms/kiosk';
async function openKiosk(page: Page) {
  await page.getByTestId('open-kiosk').click();
  await expect(page.getByTestId('kiosk-overlay')).toBeVisible();
}
async function digits(page: Page, d: string) {
  for (const ch of d) await page.getByTestId('kiosk-pad').getByRole('button', { name: ch, exact: true }).click();
}
/** Employee number, PIN, then IN or OUT. Leaves the kiosk on the result screen. */
async function punch(page: Page, number: string, pin: string, dir: 'in' | 'out') {
  await digits(page, number);
  await digits(page, pin);
  await page.getByTestId(dir === 'in' ? 'kiosk-in' : 'kiosk-out').click();
}
const exitKiosk = (page: Page) => page.getByTestId('exit-kiosk').click();

test.describe('site kiosk page', () => {
  test('the dashboard shows who is due today against who has punched, the late ones, and the exceptions', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, KIOSK);
    await expect(page.getByRole('heading', { name: 'Site kiosk', level: 1 })).toBeVisible();
    const roster = page.getByTestId('roster');
    await expect(roster).toContainText('7 Nov 2026, 09:50');
    await expect(roster.getByRole('row', { name: /Dinesh Kamble/ })).toContainText('Missing OUT');
    await expect(roster.getByRole('row', { name: /Dinesh Kamble/ })).toContainText('Default shift, no roster row this week');
    await expect(roster.getByRole('row', { name: /Anita Desai/ })).toContainText('Late, not in');
    await expect(roster.getByRole('row', { name: /Manoj Patil/ })).toContainText('On site');
    await expect(roster.getByRole('row', { name: /Manoj Patil/ })).toContainText('06:52');
    await expect(roster.getByRole('row', { name: /Santosh Gaikwad/ })).toContainText('14 min after start');
    await expect(roster.getByRole('row', { name: /Rekha More/ })).toContainText('Due at 22:00');
    await expect(page.getByTestId('late')).toContainText('Santosh Gaikwad punched IN at 07:14, 14 minutes after the shift start');
    await expect(page.getByTestId('late')).toContainText('Anita Desai is 20 minutes past the shift start and has not punched IN');
    await expect(page.getByTestId('exceptions')).toContainText('2 open');
    await expect(page.getByTestId('exception-kx_1')).toContainText('Dinesh Kamble: IN at 21:58 on 6 Nov 2026');
    await expect(page.getByTestId('exception-kx_2')).toContainText('OUT without IN');
    const devices = page.getByTestId('devices');
    await expect(devices.getByRole('row', { name: /Gate 1 tablet/ })).toContainText('Online');
    await expect(devices.getByRole('row', { name: /Dock office tablet/ })).toContainText('Offline');
    await expect(page.getByTestId('punch-feed').getByRole('row').nth(1)).toContainText('Santosh Gaikwad');
    await expect(page.getByTestId('punch-feed')).toContainText('Double tap');
    await expect(page.getByTestId('dpdp')).toContainText('No biometrics are stored');
    await expect(page.getByTestId('dpdp')).toContainText('30 days');
    await expect(page.getByTestId('dpdp')).toContainText('Sample, confirm');
    expect(errors).toEqual([]);
  });

  test('kiosk mode: a ticking clock from state, the face match is labelled as simulated, and an IN is recorded with the late note', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, KIOSK);
    await openKiosk(page);
    const clock = page.getByTestId('kiosk-clock');
    await expect(clock).toHaveText(/^09:50:\d\d$/);
    const t1 = await clock.innerText();
    await expect.poll(async () => clock.innerText(), { timeout: 5000 }).not.toBe(t1);
    await expect(page.getByRole('dialog', { name: 'Site kiosk' })).toContainText('Saturday, 7 Nov 2026');
    // Anita, 09:50, shift starts 09:30 with 15 minutes grace
    await digits(page, '1011');
    await expect(page.getByRole('dialog', { name: 'Site kiosk' })).toContainText('Employee 1011: enter your PIN');
    await digits(page, '4821');
    await expect(page.getByTestId('kiosk-name')).toHaveText('Is this you, Anita D.?');
    await expect(page.getByTestId('kiosk-face')).toContainText('Simulated face match');
    await expect(page.getByTestId('kiosk-face')).toContainText('no biometric data is stored');
    await expect(page.getByRole('dialog', { name: 'Site kiosk' })).toContainText('Photo placeholder. Nothing is captured.');
    await page.getByTestId('kiosk-in').click();
    await expect(page.getByTestId('kiosk-result-accepted')).toBeVisible();
    await expect(page.getByTestId('kiosk-headline')).toHaveText(/^Punched IN at 09:5\d$/);
    await expect(page.getByTestId('kiosk-message')).toContainText('minutes after the shift start');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog', { name: 'Site kiosk' })).toContainText('Enter your employee number');
    await exitKiosk(page);
    await expect(page.getByTestId('roster').getByRole('row', { name: /Anita Desai/ })).toContainText('On site');
    await expect(page.getByTestId('late')).toContainText('Anita Desai punched IN at 09:5');
    await expect(page.getByTestId('punch-feed').getByRole('row').nth(1)).toContainText('Anita Desai');
    const p = (await readWf(page)).kiosk.punches.find((x) => x.employeeId === 'emp_11' && x.date === TODAY)!;
    expect(p).toMatchObject({ direction: 'in', result: 'accepted', flags: ['late'], deviceId: 'dev_gate', source: 'kiosk' });
    expect(errors).toEqual([]);
  });

  test('an unknown number is refused with a message; the physical keyboard works too', async ({ page }) => {
    await openHrms(page, KIOSK);
    await openKiosk(page);
    await digits(page, '9999');
    await expect(page.getByTestId('kiosk-message')).toContainText('employee number was not found');
    await page.keyboard.type('1012');
    await expect(page.getByRole('dialog', { name: 'Site kiosk' })).toContainText('Employee 1012: enter your PIN');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('135');
    await page.keyboard.type('7');
    await expect(page.getByTestId('kiosk-name')).toHaveText('Is this you, Manoj P.?');
  });

  test('three wrong PINs lock the person, the lock shows on the dashboard, and HR can unlock', async ({ page }) => {
    await openHrms(page, KIOSK);
    await openKiosk(page);
    await digits(page, '1012');
    await digits(page, '0000');
    await expect(page.getByTestId('kiosk-message')).toContainText('Wrong PIN. 2 tries left.');
    await digits(page, '1111');
    await expect(page.getByTestId('kiosk-message')).toContainText('Wrong PIN. 1 try left.');
    await digits(page, '2222');
    await expect(page.getByRole('dialog', { name: 'Site kiosk' })).toContainText('Locked for now');
    await expect(page.getByTestId('kiosk-message')).toContainText('locked for 15 minutes');
    await page.getByRole('button', { name: 'Back' }).click();
    // even the right PIN is refused while locked
    await digits(page, '1012');
    await expect(page.getByRole('dialog', { name: 'Site kiosk' })).toContainText('Locked for now');
    await expect(page.getByTestId('kiosk-message')).toHaveText(/Try again in 1[45] minutes/);
    await page.getByRole('button', { name: 'Back' }).click();
    await exitKiosk(page);
    const pins = page.getByTestId('pins');
    await expect(pins.getByRole('row', { name: /Manoj Patil/ })).toContainText(/Locked, 1[45] min left/);
    expect((await readWf(page)).kiosk.locks.emp_12).toMatchObject({ tries: 3 });
    await page.reload();
    await expect(page.getByTestId('pins').getByRole('row', { name: /Manoj Patil/ })).toContainText(/Locked, 1[45] min left/);   // survives a reload
    await page.getByRole('button', { name: 'Unlock Manoj Patil' }).click();
    await expect(page.getByTestId('pins').getByRole('row', { name: /Manoj Patil/ })).not.toContainText('Locked');
    await openKiosk(page);
    await punch(page, '1012', '1357', 'out');
    await expect(page.getByTestId('kiosk-result-accepted')).toBeVisible();
  });

  test('a double tap inside the window is ignored with a message and does not count as a punch', async ({ page }) => {
    await openHrms(page, KIOSK);
    await openKiosk(page);
    await punch(page, '1012', '1357', 'out');                       // Manoj goes OUT at 09:50
    await expect(page.getByTestId('kiosk-headline')).toHaveText(/^Punched OUT at 09:5\d$/);
    await page.getByRole('button', { name: 'Done' }).click();
    await punch(page, '1012', '1357', 'out');                       // and taps again straight away
    await expect(page.getByTestId('kiosk-result-ignored')).toBeVisible();
    await expect(page.getByTestId('kiosk-headline')).toHaveText('Already recorded');
    await expect(page.getByTestId('kiosk-message')).toContainText('A second punch within 2 minutes is ignored');
    await exitKiosk(page);
    const punches = (await readWf(page)).kiosk.punches.filter((p) => p.employeeId === 'emp_12' && p.date === TODAY);
    expect(punches.map((p) => `${p.direction}:${p.result}`)).toEqual(['in:accepted', 'in:ignored', 'out:accepted', 'out:ignored']);
    await expect(page.getByTestId('roster').getByRole('row', { name: /Manoj Patil/ })).toContainText('Finished');
    await expect(page.getByTestId('exceptions')).toContainText('2 open');   // an ignored tap raises nothing
  });

  test('IN twice, and a punch outside the shift window, are recorded and flagged, never refused', async ({ page }) => {
    await openHrms(page, KIOSK);
    await openKiosk(page);
    await punch(page, '1013', '2468', 'in');                        // Santosh is already IN since 07:14
    await expect(page.getByTestId('kiosk-result-flagged')).toBeVisible();
    await expect(page.getByTestId('kiosk-headline')).toContainText('IN recorded, HR will review');
    await expect(page.getByTestId('kiosk-message')).toContainText('no OUT after it');
    await page.getByRole('button', { name: 'Done' }).click();
    await punch(page, '1014', '9035', 'in');                        // Rekha is a night shift person, at 09:50
    await expect(page.getByTestId('kiosk-result-flagged')).toBeVisible();
    await expect(page.getByTestId('kiosk-message')).toContainText('outside your shift (22:00 to 06:00)');
    await exitKiosk(page);
    await expect(page.getByTestId('exceptions')).toContainText('4 open');
    await expect(page.getByTestId('exceptions')).toContainText('IN twice without OUT');
    await expect(page.getByTestId('exceptions')).toContainText('Outside shift window');
    const k = (await readWf(page)).kiosk;
    expect(k.punches.filter((p) => p.result === 'flagged' && p.date === TODAY).map((p) => p.flags)).toEqual([['double_in'], ['outside_shift']]);
    expect(k.exceptions.filter((e) => e.status === 'open').map((e) => e.kind).sort()).toEqual(['double_in', 'missing_out', 'out_without_in', 'outside_shift']);
  });

  test('a failed face match (simulated) blocks the punch until it passes; wrong state is explained on screen', async ({ page }) => {
    await openHrms(page, KIOSK);
    await openKiosk(page);
    await page.getByLabel('Simulate a face match failure').check();
    await digits(page, '1012');
    await digits(page, '1357');
    await expect(page.getByTestId('kiosk-face')).toContainText('No match (simulated)');
    await expect(page.getByTestId('kiosk-in')).toHaveCount(0);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('kiosk-face')).toContainText('No match (simulated)');
    await page.getByLabel('Simulate a face match failure').uncheck();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('kiosk-face')).toContainText('Matched (simulated)');
    await expect(page.getByTestId('kiosk-out')).toBeVisible();
    // nothing was recorded for the failed attempts
    await exitKiosk(page);
    expect((await readWf(page)).kiosk.punches.filter((p) => p.employeeId === 'emp_12' && p.date === TODAY).length).toBe(2);
  });

  test('the preview clock moves on, and the dashboard raises a missing OUT once a shift is long over', async ({ page }) => {
    await openHrms(page, KIOSK);
    await expect(page.getByTestId('exceptions')).toContainText('2 open');
    for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Move preview clock forward 1 hour' }).click();
    await expect(page.getByTestId('roster')).toContainText('18:50');
    await expect(page.getByTestId('exceptions')).toContainText('4 open');                 // Manoj and Santosh, IN since the morning
    await expect(page.getByTestId('exceptions')).toContainText('Manoj Patil: IN at 06:52 on 7 Nov 2026 and no OUT by the shift end (16:00 on 7 Nov 2026)');
    await expect(page.getByTestId('roster').getByRole('row', { name: /Manoj Patil/ })).toContainText('Missing OUT');
    await expect(page.getByTestId('roster').getByRole('row', { name: /Rekha More/ })).toContainText('Due at 22:00');
    await page.reload();
    await expect(page.getByTestId('exceptions')).toContainText('4 open');                 // kept, and not raised twice
    expect((await readWf(page)).kiosk.exceptions.filter((e) => e.kind === 'missing_out').length).toBe(3);
  });

  test('resolving an exception needs a note, can add the real OUT time, and the record is kept', async ({ page }) => {
    await openHrms(page, KIOSK);
    await page.getByRole('button', { name: /Resolve exception: Dinesh Kamble/ }).click();
    const dlg = dialog(page);
    await dlg.getByRole('button', { name: 'Resolve', exact: true }).click();
    await expect(dlg.getByText('Write what you found')).toBeVisible();
    await dlg.getByLabel('What did you find?').fill('Forgot to punch out. Supervisor confirmed he left at 06:10.');
    await dlg.getByLabel('Real OUT time (optional)').fill('06:10');
    await dlg.getByRole('button', { name: 'Resolve', exact: true }).click();
    await expect(page.getByTestId('exceptions')).toContainText('1 open');
    await expect(page.getByTestId('exception-kx_1')).toHaveCount(0);
    await page.getByTestId('exceptions').getByText('2 resolved').click();
    await expect(page.getByTestId('resolved-kx_1')).toContainText('Forgot to punch out');
    await expect(page.getByTestId('resolved-kx_1')).toContainText('You (HR admin)');
    const k = (await readWf(page)).kiosk;
    expect(k.exceptions.find((e) => e.id === 'kx_1')).toMatchObject({ status: 'resolved', resolvedBy: 'You (HR admin)', resolvedOn: TODAY });
    const fix = k.punches.find((p) => p.source === 'correction')!;
    expect(fix).toMatchObject({ employeeId: 'emp_15', direction: 'out', date: TODAY, minute: 6 * 60 + 10, result: 'accepted' });
    await expect(page.getByTestId('punch-feed')).toContainText('Added by HR');
    await expect(page.getByTestId('roster').getByRole('row', { name: /Dinesh Kamble/ })).not.toContainText('Missing OUT');
    await page.reload();
    await expect(page.getByTestId('exceptions')).toContainText('1 open');
  });

  test('tablets: add one, disable one; a disabled tablet shows a locked screen and cannot take punches', async ({ page }) => {
    await openHrms(page, KIOSK);
    await page.getByRole('button', { name: 'Add tablet' }).click();
    const dlg = dialog(page);
    await dlg.getByRole('button', { name: 'Add tablet' }).click();
    await expect(dlg.getByText('Give the tablet a name')).toBeVisible();
    await dlg.getByLabel('Name').fill('Gate 1 tablet');
    await dlg.getByRole('button', { name: 'Add tablet' }).click();
    await expect(dlg.getByText('A tablet with this name already exists.')).toBeVisible();
    await dlg.getByLabel('Name').fill('Gate 2 tablet');
    await dlg.getByLabel('Where it is').fill('Bhiwandi Warehouse, rear gate');
    await dlg.getByRole('button', { name: 'Add tablet' }).click();
    const row = page.getByTestId('devices').getByRole('row', { name: /Gate 2 tablet/ });
    await expect(row).toContainText('Online');
    await expect(page.getByText('2 of 3', { exact: true })).toBeVisible();      // Gate 1 and Gate 2 are online; the Dock office tablet is not
    await page.getByRole('button', { name: 'Disable Gate 1 tablet' }).click();
    await expect(page.getByTestId('devices').getByRole('row', { name: /Gate 1 tablet/ })).toContainText('Disabled');
    await page.reload();
    await expect(page.getByTestId('devices').getByRole('row', { name: /Gate 1 tablet/ })).toContainText('Disabled');
    await expect(page.getByTestId('devices').getByRole('row', { name: /Gate 2 tablet/ })).toBeVisible();
    // in kiosk mode the disabled one is marked, and picking it locks the screen
    await openKiosk(page);
    await expect(page.getByLabel('This tablet')).toHaveValue(/dev_/);
    await page.getByLabel('This tablet').selectOption({ label: 'Gate 1 tablet (disabled)' });
    await expect(page.getByRole('dialog', { name: 'Site kiosk' })).toContainText('This tablet is switched off');
    await exitKiosk(page);
    await page.getByRole('button', { name: 'Enable Gate 1 tablet' }).click();
    await expect(page.getByTestId('devices').getByRole('row', { name: /Gate 1 tablet/ })).toContainText('Online');
  });

  test('PINs: HR sets a new one (4 digits), the old one stops working, and the PIN is never shown on the dashboard', async ({ page }) => {
    await openHrms(page, KIOSK);
    await expect(page.getByTestId('pins')).not.toContainText('1357');
    await page.getByRole('button', { name: 'Set PIN for Manoj Patil' }).click();
    const dlg = dialog(page);
    await dlg.getByLabel('New 4-digit PIN').fill('12');
    await dlg.getByRole('button', { name: 'Save PIN' }).click();
    await expect(dlg.getByText('A PIN is exactly 4 digits.')).toBeVisible();
    await dlg.getByLabel('New 4-digit PIN').fill('8642');
    await dlg.getByRole('button', { name: 'Save PIN' }).click();
    expect((await readWf(page)).kiosk.pins.emp_12).toBe('8642');
    await openKiosk(page);
    await digits(page, '1012');
    await digits(page, '1357');
    await expect(page.getByTestId('kiosk-message')).toContainText('Wrong PIN');
    await digits(page, '8642');
    await expect(page.getByTestId('kiosk-name')).toBeVisible();
  });

  test('the punch rules can be changed: a longer duplicate window ignores a punch five minutes later', async ({ page }) => {
    await openHrms(page, KIOSK);
    await page.getByLabel('Ignore a second punch within (minutes)').fill('10');
    await page.getByRole('button', { name: 'Save rules' }).click();
    expect((await readWf(page)).kiosk.rules.duplicateWindowMin).toBe(10);
    await openKiosk(page);
    await punch(page, '1012', '1357', 'out');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: '+1 min', exact: true }).click();
    await punch(page, '1012', '1357', 'in');
    await expect(page.getByTestId('kiosk-result-ignored')).toBeVisible();
    await expect(page.getByTestId('kiosk-message')).toContainText('within 10 minutes');
  });

  test('no sideways page scroll at 390px; kiosk mode fits the screen too', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHrms(page, KIOSK);
    await expect(page.getByTestId('roster')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await openKiosk(page);
    await expect(page.getByTestId('kiosk-pad')).toBeVisible();
    const over = await page.getByTestId('kiosk-overlay').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});

// ═════════════════════════════ verified onboarding page ═════════════════════════════
const VERIFY = '/dashboard/hrms/verified-onboarding';
const person = (page: Page, id: string) => page.getByTestId(`person-${id}`);
const step = (page: Page, key: string) => page.getByTestId(`step-${key}`);
async function runStep(page: Page, label: string, fill?: (dlg: ReturnType<typeof dialog>) => Promise<void>) {
  await page.getByRole('button', { name: `Run ${label}` }).click();
  const dlg = dialog(page);
  if (fill) await fill(dlg);
  await dlg.getByLabel('The person has agreed to this check').check();
  await dlg.getByTestId('run-check').click();
  await expect(dlg).toHaveCount(0);
}

test.describe('verified onboarding page', () => {
  test('three people, each with a readiness bar and what blocks them; the page says every check is simulated', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, VERIFY);
    await expect(page.getByRole('heading', { name: 'Verified onboarding', level: 1 })).toBeVisible();
    const banner = page.getByTestId('sim-banner');
    await expect(banner).toContainText('Every external check on this page is a simulation');
    await expect(banner).toContainText('Simulated response. No data leaves your browser.');
    await expect(person(page, 'vc_aditya')).toContainText('2 of 4 required checks');
    await expect(person(page, 'vc_aditya')).toContainText('2 blocking');
    await expect(person(page, 'vc_shreya')).toContainText('1 of 4 required checks');
    await expect(person(page, 'vc_rahul')).toContainText('Rahul Deshmukh');
    await expect(page.getByTestId('readiness')).toContainText('50% ready');
    await expect(page.getByTestId('readiness')).toContainText('2 of 6 checks done');
    await expect(page.getByTestId('blocking')).toContainText('Bank account check: Not started.');
    await expect(page.getByTestId('blocking')).toContainText('UAN lookup or generation: Not started.');
    await expect(page.getByTestId('blocking')).toContainText('education check, previous employer check');
    await expect(page.getByTestId('clear-join')).toBeDisabled();
    await expect(page.getByTestId('clear-join')).toHaveAttribute('title', /Blocked by: Bank account check, UAN lookup or generation/);
    await expect(page.getByTestId('readiness').getByRole('link', { name: 'MER-1024' })).toHaveAttribute('href', '/dashboard/hrms/employees/emp_24');
    // every step has its own consent line, and a run step says it was simulated, by whom and when
    for (const k of ['pan', 'aadhaar', 'bank', 'uan', 'education', 'employer']) await expect(page.getByTestId(`consent-${k}`)).toContainText('We check');
    await expect(page.getByTestId('consent-pan')).toContainText('We keep the result');
    await expect(step(page, 'pan')).toContainText('Run on 5 Nov 2026 by Tanvi Kapoor (HR)');
    await expect(step(page, 'pan')).toContainText('Simulated response. No data leaves your browser.');
    await expect(step(page, 'education')).toHaveAttribute('data-status', 'in_progress');
    await page.getByTestId('person-vc_shreya').click();
    await expect(page.getByTestId('readiness')).toContainText('25% ready');
    await expect(person(page, 'vc_rahul')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a check needs the person’s consent, shows what is checked and why, and is labelled as simulated in the dialog', async ({ page }) => {
    await openHrms(page, VERIFY);
    await page.getByRole('button', { name: 'Run Bank account check' }).click();
    const dlg = dialog(page);
    await expect(dlg.getByTestId('sim-label')).toHaveText('Simulated response. No data leaves your browser.');
    await expect(dlg.getByTestId('consent-line')).toContainText('We check that the account number and IFSC are valid');
    await expect(dlg.getByTestId('consent-line')).toContainText('to pay your salary into the right account');
    await expect(dlg.getByTestId('consent-line')).toContainText('deleted within 30 days if you do not join');
    await expect(dlg.getByLabel('Account number')).toHaveValue('50100456123498');
    await dlg.getByTestId('run-check').click();
    await expect(dlg.getByText('Tick the consent box first.')).toBeVisible();
    await expect(step(page, 'bank')).toHaveAttribute('data-status', 'not_started');
    await dlg.getByLabel('The person has agreed to this check').check();
    await dlg.getByTestId('run-check').click();
    await expect(dlg).toHaveCount(0);
    await expect(step(page, 'bank')).toHaveAttribute('data-status', 'verified');
    await expect(step(page, 'bank')).toContainText('Penny-drop (simulated) reached HDFC Bank, account ending 3498');
    await expect(step(page, 'bank')).toContainText('Consent recorded 7 Nov 2026');
    await expect(step(page, 'bank')).toContainText('Run on 7 Nov 2026 by You (HR admin)');
    await expect(page.getByTestId('readiness')).toContainText('75% ready');
    const saved = (await readWf(page)).verify.cases[0]!.steps.bank;
    expect(saved).toMatchObject({ status: 'verified', ranBy: 'You (HR admin)', ranAt: TODAY, consentAt: TODAY, runs: 1 });
  });

  test('a bad detail fails the check with the validator’s message and can be fixed and run again', async ({ page }) => {
    await openHrms(page, VERIFY);
    await runStep(page, 'Bank account check', async (dlg) => { await dlg.getByLabel('IFSC').fill('HDFC123'); });
    await expect(step(page, 'bank')).toHaveAttribute('data-status', 'failed');
    await expect(step(page, 'bank')).toContainText('IFSC not accepted: IFSC looks like HDFC0001234');
    await expect(page.getByTestId('blocking')).toContainText('Bank account check: Failed.');
    await page.getByRole('button', { name: 'Re-run Bank account check' }).click();
    const again = dialog(page);
    await expect(again.getByLabel('IFSC')).toHaveValue('HDFC123');            // what was typed is kept, so it can be fixed
    await again.getByLabel('IFSC').fill('HDFC0000123');
    await again.getByLabel('The person has agreed to this check').check();
    await again.getByTestId('run-check').click();
    await expect(step(page, 'bank')).toHaveAttribute('data-status', 'verified');
    await expect(page.getByTestId('blocking')).not.toContainText('Bank account check');
  });

  test('Aadhaar: validated with its checksum, only the last four digits are kept, and the full number is nowhere in storage', async ({ page }) => {
    await openHrms(page, VERIFY);
    await person(page, 'vc_shreya').click();
    const full = sampleAadhaar(25);                       // the first sample number for the second person in the list
    await page.getByRole('button', { name: 'Run Aadhaar check' }).click();
    const dlg = dialog(page);
    await dlg.getByLabel('Aadhaar number').fill(full.slice(0, 11) + String((Number(full[11]) + 1) % 10));    // wrong checksum
    await dlg.getByLabel('The person has agreed to this check').check();
    await dlg.getByTestId('run-check').click();
    await expect(step(page, 'aadhaar')).toHaveAttribute('data-status', 'failed');
    await expect(step(page, 'aadhaar')).toContainText('fails its checksum');
    await expect(page.getByTestId('aadhaar-shown')).toHaveCount(0);
    // now the sample number, through the helper button
    await page.getByRole('button', { name: 'Re-run Aadhaar check' }).click();
    const d2 = dialog(page);
    await d2.getByRole('button', { name: 'Use a sample number' }).click();
    await expect(d2.getByLabel('Aadhaar number')).toHaveValue(full.replace(/(\d{4})(?=\d)/g, '$1 '));
    await d2.getByLabel('The person has agreed to this check').check();
    await d2.getByTestId('run-check').click();
    await expect(step(page, 'aadhaar')).toHaveAttribute('data-status', 'verified');
    await expect(page.getByTestId('aadhaar-shown')).toHaveText(`Aadhaar kept: XXXX XXXX ${full.slice(-4)}`);
    await expect(step(page, 'aadhaar')).not.toContainText(full);
    await expect(page.locator('body')).not.toContainText(full);
    await expect(page.locator('body')).not.toContainText(full.slice(0, 8));
    const raw = await rawWf(page);
    expect(raw).not.toContain(full);
    expect(raw).not.toContain(full.slice(0, 8));
    expect(raw).toContain(`"aadhaarLast4":"${full.slice(-4)}"`);
    expect(await page.evaluate(() => Object.values(localStorage).join('\n'))).not.toContain(full);
  });

  test('a name mismatch on the PAN shows both names; HR accepts it with a reason, and that is on the record', async ({ page }) => {
    await openHrms(page, VERIFY);
    await person(page, 'vc_shreya').click();
    const cmp = page.getByTestId('compare-pan');
    await expect(cmp).toContainText('Shreya Banerjee');
    await expect(cmp).toContainText('SHREYA BANERJI');
    await expect(step(page, 'pan')).toHaveAttribute('data-status', 'mismatch');
    await expect(page.getByTestId('blocking')).toContainText('Mismatch (Name on PAN). Accept it with a reason or request a correction.');
    await page.getByRole('button', { name: 'Accept the mismatch: PAN check' }).click();
    const dlg = dialog(page);
    await expect(dlg).toContainText('Shreya Banerjee');
    await expect(dlg).toContainText('SHREYA BANERJI');
    await dlg.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(dlg.getByText('Give a reason of at least 10 characters')).toBeVisible();
    await dlg.getByLabel('Why is this acceptable?').fill('too short');
    await dlg.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(dlg.getByText('Give a reason of at least 10 characters')).toBeVisible();
    await dlg.getByLabel('Why is this acceptable?').fill('Spelling differs on the PAN card; ID proof shows the same person');
    await dlg.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(step(page, 'pan')).toContainText('Accepted by HR');
    await expect(step(page, 'pan')).toContainText('Accepted by You (HR admin) on 7 Nov 2026: Spelling differs on the PAN card');
    await expect(page.getByTestId('readiness')).toContainText('50% ready');
    await expect(page.getByTestId('blocking')).not.toContainText('PAN check');
    expect((await readWf(page)).verify.cases[1]!.steps.pan.accepted).toMatchObject({ by: 'You (HR admin)', on: TODAY });
    await page.reload();
    await page.getByTestId('person-vc_shreya').click();
    await expect(step(page, 'pan')).toContainText('Accepted by HR');
  });

  test('or HR asks for a correction: the step stays blocking and says when it was asked', async ({ page }) => {
    await openHrms(page, VERIFY);
    await person(page, 'vc_shreya').click();
    await page.getByRole('button', { name: 'Request a correction: PAN check' }).click();
    const dlg = dialog(page);
    await dlg.getByRole('button', { name: 'Record request' }).click();
    await expect(dlg.getByText('Say what needs correcting.')).toBeVisible();
    await dlg.getByLabel('What should be corrected?').fill('Ask NSDL to fix the spelling');
    await dlg.getByRole('button', { name: 'Record request' }).click();
    await expect(step(page, 'pan')).toContainText('Correction requested by You (HR admin) on 7 Nov 2026: Ask NSDL to fix the spelling');
    await expect(page.getByTestId('blocking')).toContainText('Correction requested on 7 Nov 2026; re-run once it arrives.');
    await expect(page.getByRole('button', { name: 'Re-run PAN check' })).toBeVisible();
    // the corrected PAN arrives: a PAN whose holder name matches the offer letter verifies on re-run
    await page.getByRole('button', { name: 'Re-run PAN check' }).click();
    const d2 = dialog(page);
    await d2.getByLabel('PAN', { exact: true }).fill('AJRPB4412K');
    await d2.getByLabel('The person has agreed to this check').check();
    await d2.getByTestId('run-check').click();
    await expect(step(page, 'pan')).toHaveAttribute('data-status', 'mismatch');       // that PAN belongs to Aditya, not Shreya
    await expect(page.getByTestId('compare-pan')).toContainText('ADITYA BHAT');
  });

  test('education takes two runs: the request goes out, then Check for a reply brings the answer', async ({ page }) => {
    await openHrms(page, VERIFY);
    await expect(step(page, 'education')).toHaveAttribute('data-status', 'in_progress');
    await expect(page.getByTestId('blocking')).not.toContainText('Education');
    await page.getByRole('button', { name: 'Check for a reply: Education check' }).click();
    await expect(step(page, 'education')).toHaveAttribute('data-status', 'verified');
    await expect(step(page, 'education')).toContainText('Visvesvaraya Technological University confirmed B.E. Computer Science, 2022 (simulated)');
    await expect(page.getByTestId('readiness')).toContainText('3 of 6 checks done');
    await expect(page.getByTestId('readiness')).toContainText('50% ready');          // recommended steps do not move the required bar
    await runStep(page, 'Previous employer check');
    await expect(step(page, 'employer')).toHaveAttribute('data-status', 'in_progress');
    await expect(step(page, 'employer')).toContainText('Request sent to Lumen Software Pvt Ltd (simulated)');
  });

  test('clearing Aditya writes the verified details to his employee record, so statutory completeness reflects it', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, VERIFY);
    const before = (await readDb(page)).employees.find((e) => e.id === 'emp_24')!;
    expect(before.pan).toBeUndefined();
    expect(before.uanStatus).toBe('none');
    expect(completeness(before).missing).toEqual(expect.arrayContaining(['PAN', 'Aadhaar', 'Bank account']));
    await runStep(page, 'Bank account check');
    await runStep(page, 'UAN lookup or generation');
    await expect(step(page, 'uan')).toContainText('UAN 100987654321 is active, last employer Lumen Software Pvt Ltd. It is not yet linked to Aadhaar');
    await expect(page.getByTestId('readiness')).toContainText('100% ready');
    await expect(page.getByTestId('blocking')).toContainText('Nothing is blocking');
    await page.getByTestId('clear-join').click();
    await expect(page.getByTestId('cleared-note')).toContainText('Cleared to join on 7 Nov 2026 by You (HR admin)');
    await expect(page.getByTestId('cleared-note')).toContainText('now on the employee record');
    await expect(person(page, 'vc_aditya')).toContainText('Cleared to join');
    await expect(page.getByRole('button', { name: 'Re-run PAN check' })).toBeDisabled();
    const emp = (await readDb(page)).employees.find((e) => e.id === 'emp_24')!;
    expect(emp).toMatchObject({
      pan: 'AJRPB4412K', aadhaarLast4: wfSeed.verify.cases[0]!.aadhaarLast4, aadhaarVerified: true, uan: '100987654321', uanStatus: 'activated', status: 'onboarding',
      bank: { accountNumber: '50100456123498', ifsc: 'HDFC0000123', bankName: 'HDFC Bank', accountHolder: 'Aditya Bhat' },
    });
    expect(emp.documents.filter((d) => ['pan_card', 'aadhaar', 'bank_proof'].includes(d.type)).every((d) => d.status === 'verified')).toBe(true);
    expect(emp.history.some((h) => h.field === 'PAN' && h.to === 'AJRPB4412K')).toBe(true);
    const after = completeness(emp, false);
    expect(after.missing).not.toContain('PAN');
    expect(after.missing).not.toContain('Aadhaar');
    expect(after.missing).not.toContain('Bank account');
    expect(after.pct).toBeGreaterThan(completeness(before).pct);
    expect((await readWf(page)).verify.cases[0]!.cleared).toMatchObject({ by: 'You (HR admin)', on: TODAY, wroteToEmployee: true });
    // the Employees page shows the verified PAN and the Aadhaar as last four digits only
    await page.goto('/dashboard/hrms/employees/emp_24?tab=statutory');
    await expect(page.getByText('AJRPB4412K')).toBeVisible();
    await expect(page.getByText('100987654321')).toBeVisible();
    await expect(page.getByTestId('aadhaar-value')).toHaveText('XXXX XXXX ••••');       // last four digits only, masked until revealed
    await expect(page.getByTestId('bank-value')).toContainText('3498');
    await expect(page.getByText('HDFC0000123')).toBeVisible();
    await page.goto(VERIFY);
    await expect(person(page, 'vc_aditya')).toContainText('Cleared to join');
    expect(errors).toEqual([]);
  });

  test('a candidate without an employee record can be cleared too, and is told no record was updated', async ({ page }) => {
    await openHrms(page, VERIFY);
    await person(page, 'vc_rahul').click();
    await expect(page.getByTestId('readiness')).toContainText('Candidate: no employee record yet');
    await page.getByRole('button', { name: 'Run Aadhaar check' }).click();
    const dlg = dialog(page);
    await dlg.getByRole('button', { name: 'Use a sample number' }).click();
    await dlg.getByLabel('The person has agreed to this check').check();
    await dlg.getByTestId('run-check').click();
    await runStep(page, 'UAN lookup or generation');
    await expect(step(page, 'uan')).toContainText('It is linked to Aadhaar');
    await runStep(page, 'Bank account check');
    await expect(step(page, 'bank')).toHaveAttribute('data-status', 'mismatch');
    await expect(page.getByTestId('compare-bank')).toContainText('R S DESHMUKH');
    await expect(page.getByTestId('clear-join')).toBeDisabled();
    await page.getByRole('button', { name: 'Accept the mismatch: Bank account check' }).click();
    await dialog(page).getByLabel('Why is this acceptable?').fill('Account is in initials, cancelled cheque shows the same person');
    await dialog(page).getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(page.getByTestId('clear-join')).toBeEnabled();
    await page.getByTestId('clear-join').click();
    await expect(page.getByTestId('cleared-note')).toContainText('There is no employee record yet');
    const wf = await readWf(page);
    expect(wf.verify.cases[2]!.cleared).toMatchObject({ wroteToEmployee: false });
    expect((await readDb(page)).employees.length).toBe(seed.employees.length);
    await page.reload();
    await person(page, 'vc_rahul').click();
    await expect(page.getByTestId('cleared-note')).toBeVisible();
  });

  test('Reset sample data brings the seeded checks back', async ({ page }) => {
    await openHrms(page, VERIFY);
    await runStep(page, 'Bank account check');
    await expect(step(page, 'bank')).toHaveAttribute('data-status', 'verified');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Reset sample data' }).click();
    await expect(step(page, 'bank')).toHaveAttribute('data-status', 'not_started');
    expect((await readWf(page)).verify.cases[0]!.steps.bank.status).toBe('not_started');
  });

  test('no sideways page scroll at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHrms(page, VERIFY);
    await expect(page.getByTestId('sim-banner')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.getByTestId('person-vc_shreya').click();
    await expect(page.getByTestId('compare-pan')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('areas and the first-load state', () => {
  test('every workforce page loads with no console errors and its sample data in the store', async ({ page }) => {
    const errors = watchErrors(page);
    for (const [path, h] of [[CONTRACT, 'Contract labour'], [WAGE, 'Wage access'], [KIOSK, 'Site kiosk'], [VERIFY, 'Verified onboarding']] as const) {
      await openHrms(page, path);
      await expect(page.getByRole('heading', { name: h, level: 1 })).toBeVisible();
    }
    const wf = await readWf(page);
    expect(wf.contract.contractors).toHaveLength(3);
    expect(wf.wage.requests.length).toBe(wfSeed.wage.requests.length);
    expect(wf.kiosk.devices).toHaveLength(2);
    expect(wf.verify.cases).toHaveLength(3);
    expect(errors).toEqual([]);
  });
});
