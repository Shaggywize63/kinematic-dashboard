import { test, expect, type Page } from '@playwright/test';
import { openHrms } from './hrms-utils';
import { makeSeed } from '../src/lib/hrms/seed';
import { computePayRunPayslips } from '../src/lib/hrms/engine';
import { PAYCHECK_RULES, CHECK_INFO, analyseSwing, draftTarget, previousRegularRun, reviewKey, reviewState, runPayChecks, summarise } from '../src/lib/hrms/paychecks/engine';
import type { HrmsDb, PayRun, Payslip } from '../src/lib/hrms/types';

/**
 * Pay-run checks: pure logic (the engine, fed anomalous databases built here from a clone of the seed) and the page.
 * The seed is clean apart from three real data gaps (Pooja has no UAN, Sana no bank and an unlinked UAN), so the clean
 * cases use the Logistics entity or a clone with the gaps closed.
 */

const RETAIL = 'ent_retail';
const LOGI = 'ent_logistics';
const DB_KEY = 'kinematic_hrms_preview_v3';
const AREA_KEY = 'kinematic_hrms_area_paychecks_v1';
const readDb = (page: Page): Promise<HrmsDb> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), DB_KEY);
const slow = { timeout: 60_000 };

const octRun = (db: HrmsDb, ent = RETAIL): PayRun => db.payRuns.find((r) => r.month === '2026-10' && r.entityId === ent)!;
/** A computed November draft for the entity, built like the Payroll screen builds it. */
function withNov(db: HrmsDb, ent = RETAIL): PayRun {
  const id = `run_nov_${ent}`;
  const run: PayRun = { id, month: '2026-11', entityId: ent, type: 'regular', status: 'computed', lawVersion: 'x', createdAt: '', payslips: computePayRunPayslips(db, '2026-11', ent, id), audit: [] };
  db.payRuns.push(run);
  return run;
}
const emp = (db: HrmsDb, id: string) => db.employees.find((e) => e.id === id)!;
const slip = (run: PayRun, id: string): Payslip => run.payslips.find((s) => s.employeeId === id)!;
const finding = (db: HrmsDb, run: PayRun, id: string) => runPayChecks(db, run).findings.find((f) => f.id === id);
const ids = (db: HrmsDb, run: PayRun) => runPayChecks(db, run).findings.map((f) => f.id);
/** The seed with its three data gaps closed, so any finding left is the one a test planted. */
function cleanSeed(): HrmsDb {
  const db = makeSeed();
  emp(db, 'emp_7').uan = '100200300499'; emp(db, 'emp_7').uanStatus = 'aadhaar_seeded';
  emp(db, 'emp_9').uanStatus = 'aadhaar_seeded';
  emp(db, 'emp_9').bank = { accountHolder: 'Sana Qureshi', accountNumber: '50100099887766', ifsc: 'HDFC0000123', bankName: 'HDFC Bank', accountType: 'savings' };
  return db;
}

// ═════════════════════════════ the engine, no browser ═════════════════════════════
test.describe('pay-run checks engine', () => {
  test('the seeded October run: three data gaps and one explained swing, nothing else, each with its numbers', () => {
    const db = makeSeed();
    const r = runPayChecks(db, octRun(db));
    expect(r.computed).toBe(true);
    expect(r.prevMonth).toBe('2026-09');
    expect(r.payslips).toBe(17);
    expect(r.prevPayslips).toBe(18);
    expect(r.findings.map((f) => `${f.severity}:${f.id}`).sort()).toEqual([
      'info:missing_uan:emp_9', 'info:net_swing:emp_6', 'warning:missing_bank:emp_9', 'warning:missing_uan:emp_7',
    ]);
    const swing = r.findings.find((f) => f.id === 'net_swing:emp_6')!;
    const prev = slip(previousRegularRun(db, octRun(db))!, 'emp_6'), cur = slip(octRun(db), 'emp_6');
    expect(swing.lines.join(' ')).toContain(`₹${prev.net.toLocaleString('en-IN')}`);
    expect(swing.lines.join(' ')).toContain(`₹${cur.net.toLocaleString('en-IN')}`);
    expect(swing.lines.join(' ')).toContain('Incentive (Q2 sales incentive) ₹9,500');
    expect(swing.facts.find((f) => f.label === 'Share explained')!.value).toBe('100%');
    expect(swing.employeeIds).toEqual(['emp_6']);
  });

  test('a person who left for a recorded reason is not a finding, and is counted as explained', () => {
    const db = makeSeed();
    const r = runPayChecks(db, octRun(db));
    expect(emp(db, 'emp_23').status).toBe('exited'); // Deepa is in September's run and not in October's
    expect(r.findings.some((f) => f.id === 'headcount:emp_23')).toBe(false);
    expect(r.coverage.find((c) => c.kind === 'headcount')!.note).toMatch(/1 person is missing or new for a reason/);
  });

  test('clean data: the Logistics run has 0 findings, and every check still reports what it looked at', () => {
    const db = makeSeed();
    for (const run of [octRun(db, LOGI), withNov(db, LOGI)]) {
      const r = runPayChecks(db, run);
      expect(r.findings).toEqual([]);
      expect(r.coverage.map((c) => c.kind)).toEqual(CHECK_INFO.map((c) => c.kind));
      for (const c of r.coverage) { expect(c.found, c.kind).toBe(0); expect(c.examined, c.kind).toBeGreaterThan(0); expect(c.looksAt.length, c.kind).toBeGreaterThan(20); }
      expect(r.coverage.find((c) => c.kind === 'net_swing')!.examined).toBe(5);
    }
  });

  test('with the data gaps closed, the Retail October run has one finding left, the explained incentive swing', () => {
    const db = cleanSeed();
    expect(ids(db, octRun(db))).toEqual(['net_swing:emp_6']);
  });

  test('the first run of an entity has nothing to compare with: the comparison checks say so and the rest still run', () => {
    const db = makeSeed();
    const sep = db.payRuns.find((r) => r.month === '2026-09' && r.entityId === LOGI)!;
    const r = runPayChecks(db, sep);
    expect(r.prevRunId).toBeUndefined();
    expect(r.coverage.find((c) => c.kind === 'net_swing')!.note).toMatch(/no earlier run/);
    expect(r.coverage.find((c) => c.kind === 'headcount')!.note).toMatch(/no earlier run/);
    expect(r.coverage.find((c) => c.kind === 'duplicate_bank')!.examined).toBe(5);
  });

  test('a draft that was never computed is reported as not computed, not as clean', () => {
    const db = makeSeed();
    const draft: PayRun = { id: 'r', month: '2026-11', entityId: RETAIL, type: 'regular', status: 'draft', lawVersion: 'x', createdAt: '', payslips: [], audit: [] };
    db.payRuns.push(draft);
    const r = runPayChecks(db, draft);
    expect(r.computed).toBe(false);
    expect(r.findings).toEqual([]);
  });

  test('swing: the 25% line, and unexplained moves are warning below 50% and high from 50%', () => {
    const db = makeSeed();
    const run = withNov(db);
    const prev = slip(octRun(db), 'emp_3');
    const check = (factor: number) => { const copy = structuredClone(run); const s = slip(copy, 'emp_3'); s.net = Math.round(prev.net * factor); return finding(db, copy, 'net_swing:emp_3'); };
    expect(check(0.76)).toBeUndefined();            // down 24%
    expect(check(1.24)).toBeUndefined();            // up 24%
    expect(check(0.7)!.severity).toBe('warning');   // down 30%
    expect(check(1.3)!.severity).toBe('warning');
    expect(check(0.45)!.severity).toBe('high');     // down 55%
    expect(check(0.7)!.lines.join(' ')).toContain('Nothing recorded explains it');
    expect(PAYCHECK_RULES.swingPct).toBe(25);
  });

  test('swing: a one-time payment explains it (info), and a huge one is still worth a look (warning)', () => {
    const db = makeSeed();
    expect(finding(db, withNov(db), 'net_swing:emp_10')!.severity).toBe('info'); // the 12,000 Diwali bonus in the seed
    const big = makeSeed();
    big.adjustments.push({ id: 'a1', employeeId: 'emp_21', month: '2026-11', kind: 'bonus', amount: 200000, taxable: true, note: 'Spot award' });
    const f = finding(big, withNov(big), 'net_swing:emp_21')!;
    expect(f.severity).toBe('warning');
    expect(f.lines.join(' ')).toContain('Bonus (Spot award) ₹2,00,000');
    expect(f.lines.join(' ')).toMatch(/7\.9 times the usual monthly pay of ₹25,189/);
    expect(f.title).toContain('net pay up 850%');
  });

  test('swing: loss of pay, a salary change, a loan and a one-off deduction each explain the move', () => {
    const lop = makeSeed(); lop.attendance.find((a) => a.employeeId === 'emp_3' && a.month === '2026-11')!.lopDays = 15;
    const a = finding(lop, withNov(lop), 'net_swing:emp_3')!;
    expect(a.severity).toBe('info');
    expect(a.lines.join(' ')).toContain('Loss of pay went from 0 to 15 days');

    const raise = makeSeed(); emp(raise, 'emp_5').annualCtc = 2700000;
    const b = finding(raise, withNov(raise), 'net_swing:emp_5')!;
    expect(b.severity).toBe('info');
    expect(b.lines.join(' ')).toContain('Fixed pay changed from ₹1,43,393');

    const loan = makeSeed(); loan.loans.push({ id: 'l1', employeeId: 'emp_3', kind: 'loan', principal: 90000, emi: 30000, startMonth: '2026-11', recovered: 0 });
    expect(finding(loan, withNov(loan), 'net_swing:emp_3')!.lines.join(' ')).toContain('Loan, advance or other deductions went from ₹0 to ₹30,000');

    const ded = makeSeed(); ded.adjustments.push({ id: 'd1', employeeId: 'emp_3', month: '2026-11', kind: 'one_time_deduction', amount: 30000, taxable: false });
    expect(finding(ded, withNov(ded), 'net_swing:emp_3')!.severity).toBe('info');
  });

  test('swing: a cause that points the other way does not explain the move (analyseSwing)', () => {
    const db = makeSeed();
    const prev = structuredClone(slip(octRun(db), 'emp_3'));
    const cur = structuredClone(prev);
    cur.net = Math.round(prev.net * 0.5);                           // net halves ...
    cur.earnings.push({ code: 'BONUS', name: 'Bonus', amount: 5000, taxable: true }); // ... while a bonus appears: wrong direction
    const a = analyseSwing(prev, cur);
    expect(a.causes.map((c) => c.key)).toContain('one_time');
    expect(a.share).toBe(0);
    expect(a.verdict).toBe('unexplained');
    // last month's one-time pay not repeating is a cause for a drop
    const withBonus = structuredClone(prev); withBonus.earnings.push({ code: 'BONUS', name: 'Bonus (Diwali)', amount: 30000, taxable: true }); withBonus.net = prev.net + 30000;
    const drop = analyseSwing(withBonus, prev);
    expect(drop.causes[0]!.key).toBe('one_time_gone');
    expect(drop.verdict).toBe('explained');
  });

  test('who is in the run: a missing active person and an unexplained newcomer are warnings, a real joiner is not', () => {
    const db = makeSeed();
    const gone = withNov(db); gone.payslips = gone.payslips.filter((s) => s.employeeId !== 'emp_5');
    const g = finding(db, gone, 'headcount:emp_5')!;
    expect(g.severity).toBe('warning');
    expect(g.lines.join(' ')).toContain('Nothing in the data says they left');

    const noStructure = makeSeed(); const gone2 = withNov(noStructure); gone2.payslips = gone2.payslips.filter((s) => s.employeeId !== 'emp_5'); emp(noStructure, 'emp_5').structureId = undefined;
    expect(finding(noStructure, gone2, 'headcount:emp_5')!.lines.join(' ')).toContain('no salary structure or CTC');

    const newcomer = makeSeed(); const nov = withNov(newcomer); const prev = octRun(newcomer); prev.payslips = prev.payslips.filter((s) => s.employeeId !== 'emp_21');
    expect(finding(newcomer, nov, 'headcount:emp_21')!.lines.join(' ')).toContain('24 Nov 2025');

    const joiner = makeSeed(); const nov2 = withNov(joiner); const prev2 = octRun(joiner); prev2.payslips = prev2.payslips.filter((s) => s.employeeId !== 'emp_21'); emp(joiner, 'emp_21').joinDate = '2026-11-10';
    expect(finding(joiner, nov2, 'headcount:emp_21')).toBeUndefined();

    const moved = makeSeed(); const nov3 = withNov(moved); nov3.payslips = nov3.payslips.filter((s) => s.employeeId !== 'emp_5'); emp(moved, 'emp_5').entityId = LOGI;
    expect(finding(moved, nov3, 'headcount:emp_5')).toBeUndefined();
  });

  test('the same bank account on two people: high when the IFSC matches, a warning when it does not, and the number is masked', () => {
    const db = makeSeed();
    const a = emp(db, 'emp_7'), b = emp(db, 'emp_8');
    b.bank!.accountNumber = a.bank!.accountNumber;
    b.bank!.ifsc = 'HDFC0000999'; a.bank!.ifsc = 'HDFC0000999';
    const f = finding(db, octRun(db), 'duplicate_bank:emp_7+emp_8')!;
    expect(f.severity).toBe('high');
    expect(f.employeeIds.sort()).toEqual(['emp_7', 'emp_8']);
    expect(f.title).toContain('Pooja Verma');
    expect(f.title).toContain('Karthik Subramanian');
    expect(JSON.stringify(f)).not.toContain(a.bank!.accountNumber);
    expect(f.lines[0]).toContain(a.bank!.accountNumber.slice(-4));
    b.bank!.ifsc = 'ICIC0000456';
    expect(finding(db, octRun(db), 'duplicate_bank:emp_7+emp_8')!.severity).toBe('warning');
    const fresh = makeSeed();
    expect(ids(fresh, octRun(fresh))).not.toContain('duplicate_bank:emp_7+emp_8');
  });

  test('pay and status: paid before joining, paid after leaving, an unprorated joiner, and F&F that pays the same days', () => {
    const db = makeSeed();
    const nov = withNov(db);
    // Aditya is onboarding and joins on 16 Nov: give him a payslip as a wrong run would
    const adi = structuredClone(slip(nov, 'emp_5')); adi.employeeId = 'emp_24';
    nov.payslips.push(adi);
    const f = finding(db, nov, 'status_pay:emp_24')!;
    expect(f.severity).toBe('high');
    expect(f.lines.join(' ')).toContain('joins on 16 Nov 2026');

    const left = makeSeed(); const nov2 = withNov(left);
    const deepa = structuredClone(slip(nov2, 'emp_5')); deepa.employeeId = 'emp_23'; nov2.payslips.push(deepa);
    expect(finding(left, nov2, 'status_pay:emp_23')!.lines.join(' ')).toContain('left on 30 Sep 2026');
    expect(finding(left, nov2, 'status_pay:emp_23')!.severity).toBe('high');

    const joiner = makeSeed(); emp(joiner, 'emp_21').joinDate = '2026-11-10';
    const j = finding(joiner, withNov(joiner), 'status_pay:emp_21')!;
    expect(j.severity).toBe('warning');
    expect(j.lines.join(' ')).toContain('paid for 30 of 30 days');

    const fnf = makeSeed(); fnf.fnfCases.push({ id: 'f1', employeeId: 'emp_22', lastWorkingDate: '2026-11-30', noticeDaysServed: 20, leaveEncashDays: 0, otherRecoveries: 0, otherPayments: 0, status: 'draft', dueBy: '2026-12-02' });
    const y = finding(fnf, withNov(fnf), 'status_pay:emp_22')!;
    expect(y.severity).toBe('warning');
    expect(y.lines.join(' ')).toContain('may be paid twice');
  });

  test('a leaver whose last day is in the run with no F&F case is information, and a full month past the last day is a warning', () => {
    const db = makeSeed();
    const y = finding(db, withNov(db), 'status_pay:emp_22')!;
    expect(y.severity).toBe('info');
    expect(y.lines.join(' ')).toContain('No F&F settlement exists yet');
    const early = makeSeed(); emp(early, 'emp_22').lastWorkingDate = '2026-11-20';
    const e = finding(early, withNov(early), 'status_pay:emp_22')!;
    expect(e.severity).toBe('warning');
    expect(e.lines.join(' ')).toContain('pays all 30 days');
  });

  test('impossible payslips: zero or negative net, and loss of pay above the days in the month', () => {
    const db = makeSeed();
    const nov = withNov(db);
    slip(nov, 'emp_3').net = -500;
    slip(nov, 'emp_4').lopDays = 45; slip(nov, 'emp_4').paidDays = 0;
    slip(nov, 'emp_5').net = 0;
    const r = runPayChecks(db, nov);
    expect(r.findings.find((f) => f.id === 'invalid_pay:emp_3')!.severity).toBe('high');
    expect(r.findings.find((f) => f.id === 'invalid_pay:emp_3')!.lines[0]).toContain('-₹500');
    expect(r.findings.find((f) => f.id === 'invalid_pay:emp_4')!.lines.join(' ')).toContain('45 loss-of-pay days against 30 days');
    expect(r.findings.find((f) => f.id === 'invalid_pay:emp_5')!.lines[0]).toContain('₹0');
    // paid days plus loss of pay that do not make the month are a warning
    const odd = makeSeed(); const nov2 = withNov(odd); slip(nov2, 'emp_3').paidDays = 20;
    expect(finding(odd, nov2, 'invalid_pay:emp_3')!.severity).toBe('warning');
  });

  test('minimum wage: advisory, tagged with the table\'s confidence, and measured on fixed pay so loss of pay cannot trigger it', () => {
    const db = makeSeed();
    emp(db, 'emp_21').annualCtc = 150000;
    const f = finding(db, withNov(db), 'min_wage:emp_21')!;
    expect(f.severity).toBe('warning');
    expect(f.confidence).toBe('indicative');
    expect(f.lines.join(' ')).toContain('₹18,500');
    expect(f.lines.join(' ')).toContain('Confirm the notified figure with your advisor');
    // 20 days of loss of pay cuts the payslip but not the fixed pay, so no finding
    const lop = makeSeed(); lop.attendance.find((a) => a.employeeId === 'emp_22' && a.month === '2026-11')!.lopDays = 20;
    expect(finding(lop, withNov(lop), 'min_wage:emp_22')).toBeUndefined();
    // interns are left out
    const intern = makeSeed(); emp(intern, 'emp_21').annualCtc = 150000; emp(intern, 'emp_21').employmentType = 'intern';
    expect(finding(intern, withNov(intern), 'min_wage:emp_21')).toBeUndefined();
  });

  test('PF base: above the ceiling without the higher-wage option, a deduction that is not 12%, PF for a non-member', () => {
    const db = makeSeed();
    const nov = withNov(db);
    slip(nov, 'emp_3').wages.pfWage = 40000;                                  // Neha, not on the higher-wage option
    const f = finding(db, nov, 'pf_base:emp_3')!;
    expect(f.severity).toBe('high');
    expect(f.confidence).toBe('reported');
    expect(f.lines.join(' ')).toContain('above the ₹25,000 ceiling');
    // Ritu is on the higher-wage option: a PF base above the ceiling is fine
    expect(ids(db, nov)).not.toContain('pf_base:emp_1');
    const pf = slip(nov, 'emp_4').deductions.find((d) => d.code === 'PF')!; pf.amount += 400;
    expect(finding(db, nov, 'pf_base:emp_4')!.lines.join(' ')).toMatch(/PF deducted is ₹[\d,]+, but 12% of the base/);
    const nonMember = makeSeed(); const nov2 = withNov(nonMember); emp(nonMember, 'emp_10').pfMember = false;   // flipped after the run was computed
    expect(finding(nonMember, nov2, 'pf_base:emp_10')!.lines.join(' ')).toContain('is not a PF member');
  });

  test('ESI base: deducted above the ceiling, or missing within it', () => {
    const db = makeSeed();
    const nov = withNov(db);
    slip(nov, 'emp_3').deductions.push({ code: 'ESI', name: 'ESI (employee)', amount: 400 });   // gross is 55,557
    const f = finding(db, nov, 'esi_base:emp_3')!;
    expect(f.lines.join(' ')).toContain('above the ₹21,000 ESI ceiling');
    expect(f.confidence).toBe('reported');
    const missing = makeSeed();
    const nov3 = withNov(missing, LOGI);
    expect(slip(nov3, 'emp_13').deductions.some((d) => d.code === 'ESI')).toBe(true);  // Santosh, gross about 17,000, has ESI
    slip(nov3, 'emp_13').deductions = slip(nov3, 'emp_13').deductions.filter((d) => d.code !== 'ESI');
    expect(finding(missing, nov3, 'esi_base:emp_13')!.lines.join(' ')).toContain('no ESI is deducted');
  });

  test('bank details and UAN: missing, invalid, unlinked', () => {
    const db = cleanSeed();
    const nov = withNov(db);
    expect(runPayChecks(db, nov).findings.filter((f) => f.kind === 'missing_bank' || f.kind === 'missing_uan')).toEqual([]);
    emp(db, 'emp_3').bank = undefined;
    emp(db, 'emp_4').bank!.ifsc = 'BAD';
    emp(db, 'emp_5').uan = undefined;
    emp(db, 'emp_6').uanStatus = 'generated';
    const r = runPayChecks(db, nov);
    expect(r.findings.find((f) => f.id === 'missing_bank:emp_3')!.lines[0]).toContain('has no bank account on file');
    expect(r.findings.find((f) => f.id === 'missing_bank:emp_4')!.lines.join(' ')).toContain('IFSC BAD does not look valid');
    expect(r.findings.find((f) => f.id === 'missing_uan:emp_5')!.severity).toBe('warning');
    expect(r.findings.find((f) => f.id === 'missing_uan:emp_6')!.severity).toBe('info');
    // someone paid in cash needs no bank account
    emp(db, 'emp_3').payMode = 'cash';
    expect(runPayChecks(db, nov).findings.some((f) => f.id === 'missing_bank:emp_3')).toBe(false);
  });

  test('ids are stable across recomputes, findings are sorted worst first, and the checks never change the data', () => {
    const db = makeSeed();
    db.adjustments.push({ id: 'a1', employeeId: 'emp_21', month: '2026-11', kind: 'bonus', amount: 200000, taxable: true });
    const nov = withNov(db);
    const before = JSON.stringify(db);
    const a = runPayChecks(db, nov), b = runPayChecks(db, structuredClone(nov));
    expect(a.findings.map((f) => f.id)).toEqual(b.findings.map((f) => f.id));
    expect(JSON.stringify(db)).toBe(before);
    const rank = { high: 0, warning: 1, info: 2 };
    for (let i = 1; i < a.findings.length; i++) expect(rank[a.findings[i - 1]!.severity]).toBeLessThanOrEqual(rank[a.findings[i]!.severity]);
    for (const f of a.findings) { expect(f.lines.length, f.id).toBeGreaterThan(0); expect(f.employeeIds.length, f.id).toBeGreaterThan(0); expect(f.signature.length).toBeGreaterThan(3); }
  });

  test('a review counts only while the numbers are the ones the reviewer saw', () => {
    const db = makeSeed();
    db.adjustments.push({ id: 'a1', employeeId: 'emp_21', month: '2026-11', kind: 'bonus', amount: 200000, taxable: true });
    const nov = withNov(db);
    const f = finding(db, nov, 'net_swing:emp_21')!;
    const review = { by: 'x', at: '2026-11-07T10:00:00.000Z', note: 'ok', signature: f.signature };
    expect(reviewState(undefined, f)).toBe('open');
    expect(reviewState(review, f)).toBe('reviewed');
    db.adjustments[db.adjustments.length - 1]!.amount = 250000;
    nov.payslips = computePayRunPayslips(db, '2026-11', RETAIL, nov.id);
    const f2 = finding(db, nov, 'net_swing:emp_21')!;
    expect(f2.id).toBe(f.id);
    expect(f2.signature).not.toBe(f.signature);
    expect(reviewState(review, f2)).toBe('changed');
    const key = reviewKey(RETAIL, '2026-11', f.id);
    expect(key).toBe(`ent_retail|2026-11|net_swing:emp_21`);
    const s = summarise([f2], { [key]: review }, RETAIL, '2026-11');
    expect(s).toMatchObject({ total: 1, reviewed: 0, changed: 1, needLook: 1, info: 0 });
  });

  test('the draft target is the month after the latest closed run, and moves on once that month is closed', () => {
    const db = makeSeed();
    expect(draftTarget(db, RETAIL, '2026-11')).toMatchObject({ month: '2026-11', existing: undefined });
    const nov = withNov(db);
    expect(draftTarget(db, RETAIL, '2026-11').existing?.id).toBe(nov.id);   // a draft already exists: recompute it, do not duplicate
    nov.status = 'frozen';
    expect(draftTarget(db, RETAIL, '2026-11').month).toBe('2026-12');
    expect(draftTarget({ ...db, payRuns: [] }, RETAIL, '2026-11').month).toBe('2026-11');
  });
});

// ═════════════════════════════ the page ═════════════════════════════
test.describe('pay-run checks page', () => {
  test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });
  const watch = (page: Page) => { const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); return errors; };

  test('opens on the latest run with seeded findings, the advisory statement, progress and what was checked', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = watch(page);
    await openHrms(page, '/dashboard/hrms/pay-checks');
    await expect(page.getByRole('heading', { name: 'Pay-run checks', level: 1 })).toBeVisible();
    await expect(page.getByTestId('paychecks-advisory')).toContainText('never block a run');
    await expect(page.getByTestId('run-context')).toContainText('Meridian Retail Pvt Ltd, October 2026', slow);
    await expect(page.getByTestId('run-context')).toContainText('17 payslips');
    await expect(page.getByTestId('run-context')).toContainText('compared with September 2026 (18 payslips)');
    await expect(page.getByTestId('stat-total')).toHaveText('4');
    await expect(page.getByTestId('stat-look')).toHaveText('2');
    await expect(page.getByTestId('stat-info')).toHaveText('2');
    await expect(page.getByTestId('stat-reviewed')).toHaveText('1');
    await expect(page.getByTestId('review-progress')).toContainText('1 of 4');
    await expect(page.getByTestId('review-progress').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    for (const id of ['missing_bank:emp_9', 'missing_uan:emp_7', 'net_swing:emp_6', 'missing_uan:emp_9']) await expect(page.getByTestId(`finding-${id}`)).toBeVisible();
    // the seeded review shows who, when and what was written
    const reviewed = page.getByTestId('finding-net_swing:emp_6');
    await expect(reviewed).toContainText('Reviewed');
    await expect(reviewed).toContainText('Neha Bansal');
    await expect(reviewed).toContainText('Q2 sales incentive');
    // every check is listed, with how much it looked at
    await expect(page.getByTestId('coverage-card').getByRole('row')).toHaveCount(CHECK_INFO.length + 1);
    await expect(page.getByTestId('coverage-found-missing_uan')).toHaveText('2');
    await expect(page.getByTestId('coverage-found-net_swing')).toHaveText('1');
    await expect(page.getByText('never block a run. They inform the person who freezes it', { exact: false }).last()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a finding shows its numbers, a confidence tag where one applies, and links to the employee and the run', async ({ page }) => {
    test.setTimeout(150_000);
    await openHrms(page, '/dashboard/hrms/pay-checks');
    const swing = page.getByTestId('finding-net_swing:emp_6');
    await expect(swing).toContainText('Imran Sheikh: net pay up 32.8% on Sep 2026');
    await expect(swing).toContainText('Net, Sep 2026');
    await expect(swing).toContainText('Share explained');
    await expect(swing.getByRole('link', { name: 'Open employee Imran Sheikh' })).toHaveAttribute('href', '/dashboard/hrms/employees/emp_6');
    await expect(page.getByRole('link', { name: 'Open the October 2026 run in Payroll' })).toHaveAttribute('href', /\/dashboard\/hrms\/payroll\/runs\/run_2026-10_ent_retail$/);
    await expect(page.getByTestId('finding-missing_bank:emp_9')).toContainText('The bank file will skip');
  });

  test('mark reviewed needs a note, moves the progress, and survives a reload; reopen puts it back', async ({ page }) => {
    test.setTimeout(150_000);
    await openHrms(page, '/dashboard/hrms/pay-checks');
    await page.getByRole('button', { name: /Mark reviewed: Pooja Verma/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Mark as reviewed' });
    await expect(dlg.getByRole('button', { name: 'Save review' })).toBeDisabled();
    await expect(dlg).toContainText('A short note is needed before you can save');
    await dlg.getByLabel(/What did you decide/).fill('ok');
    await expect(dlg.getByRole('button', { name: 'Save review' })).toBeDisabled();
    await dlg.getByLabel(/What did you decide/).fill('Asked Pooja for her old UAN, due Friday.');
    await dlg.getByRole('button', { name: 'Save review' }).click();
    await expect(dlg).toBeHidden();
    const card = page.getByTestId('finding-missing_uan:emp_7');
    await expect(card).toHaveAttribute('data-state', 'reviewed');
    await expect(card).toContainText('Asked Pooja for her old UAN, due Friday.');
    await expect(card).toContainText('You (HR admin)');
    await expect(page.getByTestId('stat-reviewed')).toHaveText('2');
    await expect(page.getByTestId('review-progress')).toContainText('2 of 4');

    await page.reload();
    await expect(page.getByTestId('finding-missing_uan:emp_7')).toHaveAttribute('data-state', 'reviewed', slow);
    await expect(page.getByTestId('stat-reviewed')).toHaveText('2');
    const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), AREA_KEY);
    expect(stored.reviews['ent_retail|2026-10|missing_uan:emp_7'].note).toBe('Asked Pooja for her old UAN, due Friday.');

    await page.getByRole('button', { name: /Reopen: Pooja Verma/ }).click();
    await expect(page.getByTestId('finding-missing_uan:emp_7')).toHaveAttribute('data-state', 'open');
    await expect(page.getByTestId('stat-reviewed')).toHaveText('1');
  });

  test('filters: severity, check, review status and search narrow the list and say how many', async ({ page }) => {
    test.setTimeout(150_000);
    await openHrms(page, '/dashboard/hrms/pay-checks');
    const cards = page.locator('[data-testid^="finding-"]');
    await expect(cards).toHaveCount(4, slow);
    await page.getByLabel('Severity', { exact: true }).selectOption('look');
    await expect(cards).toHaveCount(2);
    await expect(page.getByText('Showing 2 of 4 findings')).toBeVisible();
    await page.getByLabel('Severity', { exact: true }).selectOption('info');
    await expect(cards).toHaveCount(2);
    await page.getByLabel('Severity', { exact: true }).selectOption('all');
    await page.getByLabel('Check', { exact: true }).selectOption('missing_uan');
    await expect(cards).toHaveCount(2);
    await page.getByLabel('Check', { exact: true }).selectOption('all');
    await page.getByLabel('Review status').selectOption('reviewed');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Imran Sheikh');
    await page.getByLabel('Review status').selectOption('open');
    await expect(cards).toHaveCount(3);
    await page.getByLabel('Review status').selectOption('all');
    await page.getByRole('searchbox', { name: 'Search person or text' }).fill('sana');
    await expect(cards).toHaveCount(2);
    await page.getByRole('searchbox', { name: 'Search person or text' }).fill('zzz');
    await expect(page.getByText('No finding matches these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(cards).toHaveCount(4);
  });

  test('a clean entity says 0 findings and still lists everything that was checked', async ({ page }) => {
    test.setTimeout(150_000);
    await openHrms(page, '/dashboard/hrms/pay-checks');
    await page.getByLabel('Legal entity').selectOption(LOGI);
    await expect(page.getByTestId('run-context')).toContainText('Meridian Logistics LLP, October 2026', slow);
    await expect(page.getByText('0 findings', { exact: true })).toBeVisible();
    await expect(page.getByTestId('stat-total')).toHaveText('0');
    await expect(page.getByTestId('review-progress')).toHaveCount(0);
    await expect(page.getByTestId('coverage-card').getByRole('row')).toHaveCount(CHECK_INFO.length + 1);
    for (const c of CHECK_INFO) await expect(page.getByTestId('coverage-card')).toContainText(c.label);
    await expect(page.getByTestId('coverage-found-net_swing')).toHaveText('0');
    expect(page.url()).toContain('entity=ent_logistics');
  });

  test('the month picker lists each run; the first run says there is nothing to compare with', async ({ page }) => {
    test.setTimeout(150_000);
    await openHrms(page, '/dashboard/hrms/pay-checks');
    const month = page.getByLabel('Pay run month');
    await expect(month.locator('option')).toHaveText(['Oct 2026 (Paid)', 'Sep 2026 (Paid)']);
    await month.selectOption('2026-09');
    await expect(page.getByTestId('run-context')).toContainText('no earlier run to compare with', slow);
    await expect(page.getByTestId('coverage-card')).toContainText('Skipped: there is no earlier run');
    await expect(page.getByTestId('run-context')).toContainText('18 payslips');
    expect(page.url()).toContain('month=2026-09');
    await page.reload();
    await expect(page.getByTestId('run-context')).toContainText('September 2026', slow);
  });

  test('a real anomaly made in the app: a large bonus added in Payroll shows up as a swing in the prepared draft, and a review goes stale when it changes', async ({ page }) => {
    test.setTimeout(300_000);
    // 1. add the bonus through the Payroll adjustments screen
    await openHrms(page, '/dashboard/hrms/payroll?tab=adjustments');
    await page.getByRole('button', { name: 'Add adjustment' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Employee').selectOption({ label: 'Meenal Shah (MER-1021)' });
    await dlg.getByLabel(/Amount/).fill('200000');
    await dlg.getByLabel('Note').fill('Spot award');
    await dlg.getByRole('button', { name: 'Add adjustment' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText: 'Spot award' })).toContainText('₹2,00,000');

    // 2. prepare the November draft from the checks page
    await page.goto('/dashboard/hrms/pay-checks');
    await page.getByTestId('run-context').waitFor(slow);
    await expect(page.getByTestId('prepare-draft')).toHaveText('Prepare a draft for the next month');
    await expect(page.getByText('Creates November 2026 for Meridian Retail Pvt Ltd')).toBeVisible();
    await page.getByTestId('prepare-draft').click();
    await expect(page.getByTestId('run-context')).toContainText('November 2026', slow);
    await expect(page.getByTestId('run-context')).toContainText('compared with October 2026');
    await expect(page.getByLabel('Pay run month')).toHaveValue('2026-11');
    await expect(page.getByTestId('prepare-draft')).toHaveText('Recompute the November 2026 draft');

    // 3. the swing is there, with the numbers, and agrees with the engine run on the very data the browser holds
    const swing = page.getByTestId('finding-net_swing:emp_21');
    await expect(swing).toContainText('Meenal Shah: net pay up 850% on Oct 2026');
    await expect(swing).toContainText('Bonus (Spot award) ₹2,00,000');
    await expect(swing).toContainText('7.9 times the usual monthly pay');
    await expect(swing.getByText('Warning', { exact: true })).toBeVisible();
    const db = await readDb(page);
    const nov = db.payRuns.find((r) => r.month === '2026-11' && r.entityId === RETAIL)!;
    expect(nov.status).toBe('computed');
    expect(nov.payslips.length).toBeGreaterThan(10);
    const engine = runPayChecks(db, nov);
    const shown = await page.locator('[data-testid^="finding-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('finding-', '')));
    expect(shown.sort()).toEqual(engine.findings.map((f) => f.id).sort());
    await expect(page.getByTestId('stat-total')).toHaveText(String(engine.findings.length));
    // the seeded Diwali bonus is explained and shown for information
    await expect(page.getByTestId('finding-net_swing:emp_10')).toContainText('Bonus (Diwali bonus) ₹12,000');
    // a leaver whose last day is in this run, with no F&F yet
    await expect(page.getByTestId('finding-status_pay:emp_22')).toContainText('No F&F settlement exists yet');

    // 4. review it, then change the amount in Payroll: after a recompute the review is marked as stale
    await page.getByRole('button', { name: /Mark reviewed: Meenal Shah/ }).click();
    await page.getByRole('dialog', { name: 'Mark as reviewed' }).getByLabel(/What did you decide/).fill('Checked with her manager, the amount is right.');
    await page.getByRole('dialog', { name: 'Mark as reviewed' }).getByRole('button', { name: 'Save review' }).click();
    await expect(swing).toHaveAttribute('data-state', 'reviewed');

    await page.goto('/dashboard/hrms/payroll?tab=adjustments');
    await page.getByRole('button', { name: /Edit adjustment for Meenal Shah/ }).click();
    await page.getByRole('dialog').getByLabel(/Amount/).fill('250000');
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Spot award' })).toContainText('₹2,50,000');
    await page.goto('/dashboard/hrms/pay-checks?month=2026-11');
    await page.getByTestId('run-context').waitFor(slow);
    await page.getByTestId('prepare-draft').click();
    await expect(page.getByTestId('finding-net_swing:emp_21')).toHaveAttribute('data-state', 'changed', slow);
    await expect(page.getByTestId('finding-net_swing:emp_21')).toContainText('Changed since reviewed');
    await expect(page.getByTestId('finding-net_swing:emp_21')).toContainText('The numbers changed after this was reviewed');
    await expect(page.getByTestId('finding-net_swing:emp_21')).toContainText('₹2,50,000');
    // the run itself was recomputed once, not duplicated
    expect((await readDb(page)).payRuns.filter((r) => r.month === '2026-11' && r.entityId === RETAIL)).toHaveLength(1);
  });

  test('the page works at phone width without sideways scrolling, for findings, the clean state and the empty filter', async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openHrms(page, '/dashboard/hrms/pay-checks');
    await page.getByTestId('run-context').waitFor(slow);
    const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await over()).toBeLessThanOrEqual(1);
    await page.getByLabel('Legal entity').selectOption(LOGI);
    await expect(page.getByText('0 findings', { exact: true })).toBeVisible();
    expect(await over()).toBeLessThanOrEqual(1);
    await page.getByLabel('Legal entity').selectOption(RETAIL);
    await page.getByRole('button', { name: /Mark reviewed: Pooja Verma/ }).click();
    expect(await over()).toBeLessThanOrEqual(1);
    await expect(page.getByRole('dialog', { name: 'Mark as reviewed' })).toBeVisible();
  });
});
