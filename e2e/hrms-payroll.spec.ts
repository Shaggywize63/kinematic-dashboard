import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { openHrms } from './hrms-utils';
import {
  buildBankFile, buildBreakup, buildEcr, computeFnf, computePayRunPayslips, computePayslip, employeesForRun, runTotals,
} from '../src/lib/hrms/engine';
import { makeSeed, PREVIEW_TODAY } from '../src/lib/hrms/seed';
import { addDays, inr, inrWords } from '../src/lib/hrms/format';
import { monthEnd } from '../src/lib/hrms/rules';
import type { HrmsDb, FnfCase } from '../src/lib/hrms/types';
import {
  adjustmentLock, comparePayslips, explainChange, remainingSchedule, taxComparison, validateAdjustment, validateStructure, wageEffect,
} from '../src/components/hrms/payroll/logic';

/**
 * Payroll, payslips and My HR. Two kinds of test:
 *  - pure checks of the helpers behind the screens against the engine (no browser), and
 *  - browser flows on the seeded sample database, where numbers on screen are compared with the engine run on
 *    the very data the browser holds (read back from localStorage), so a screen can never drift from the engine.
 */

const DB_KEY = 'kinematic_hrms_preview_v3';
const readDb = (page: Page): Promise<HrmsDb> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), DB_KEY);
const seed = makeSeed();
const retail = 'ent_retail';
const slow = { timeout: 60_000 };

async function startNovRun(page: Page) {
  await openHrms(page, '/dashboard/hrms/payroll');
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.waitForURL(/\/payroll\/runs\//, { timeout: 90_000 });
  await expect(page.getByRole('heading', { name: /Pay run, November 2026/ })).toBeVisible(slow);
}
const step = (page: Page, s: string) => page.locator(`[data-step="${s}"]`).click();

/** Start the November run, accept the blockers, compute. Leaves the page on the Compute step. */
async function computeNovRun(page: Page) {
  await startNovRun(page);
  await step(page, 'checks');
  const go = page.getByRole('button', { name: 'Continue to compute' });
  await expect(go).toBeDisabled();
  await page.getByRole('checkbox', { name: /I understand/ }).check();
  await go.click();
  await page.getByRole('button', { name: 'Compute payslips' }).click();
  await expect(page.getByTestId('payslip-table')).toBeVisible(slow);
}
async function novRun(page: Page) {
  const db = await readDb(page);
  return { db, run: db.payRuns.find((r) => r.month === '2026-11' && r.entityId === retail)! };
}

// ═════════════════════════════ pure checks: no browser ═════════════════════════════
test.describe('payroll helpers against the engine', () => {
  test('every seeded payslip adds up: lines, gross, deductions, net and employer cost', () => {
    for (const run of seed.payRuns) {
      for (const s of run.payslips) {
        const reimb = s.reimbursements.reduce((t, l) => t + l.amount, 0);
        expect(s.gross).toBe(s.earnings.reduce((t, l) => t + l.amount, 0));
        expect(s.totalDeductions).toBe(s.deductions.reduce((t, l) => t + l.amount, 0));
        expect(s.net).toBe(s.gross + reimb - s.totalDeductions);
        expect(s.employerCost).toBe(s.gross + reimb + s.employer.reduce((t, l) => t + l.amount, 0));
        expect(s.paidDays + s.lopDays).toBe(s.daysInMonth);
      }
    }
  });

  test('a month-on-month move over 10% is flagged with its cause: loss of pay, adjustment, salary change', () => {
    const db = structuredClone(seed);
    const emp = (id: string) => db.employees.find((e) => e.id === id)!;
    // November: Vikram (emp_10) has a 12,000 Diwali bonus in the seed; give Neha (emp_3) 15 days of loss of pay and Divya (emp_5) a raise.
    db.attendance.find((a) => a.employeeId === 'emp_3' && a.month === '2026-11')!.lopDays = 15;
    emp('emp_5').annualCtc = 2700000;
    const run = { id: 'run_nov', month: '2026-11', entityId: retail, type: 'regular' as const, status: 'computed' as const, lawVersion: 'x', createdAt: '', payslips: computePayRunPayslips(db, '2026-11', retail, 'run_nov'), audit: [] };
    db.payRuns.push(run);
    const { prevRun, changes } = comparePayslips(db, run);
    expect(prevRun?.month).toBe('2026-10');
    const lop = changes.get('emp_3')!;
    expect(lop.flagged).toBe(true);
    expect(lop.reasons.join(' ')).toContain('Loss of pay');
    const bonus = changes.get('emp_10')!;
    expect(bonus.flagged).toBe(true);
    expect(bonus.reasons.join(' ')).toContain('Bonus');
    const raise = changes.get('emp_5')!;
    expect(raise.flagged).toBe(true);
    expect(raise.reasons.join(' ')).toContain('Salary structure or CTC change');
    // someone with nothing different is not flagged, and the percentage is net against net
    const calm = Array.from(changes.values()).find((c) => !c.flagged && c.prev)!;
    expect(Math.abs(calm.pct!)).toBeLessThanOrEqual(10);
    const prev = prevRun!.payslips.find((p) => p.employeeId === 'emp_3')!;
    const cur = run.payslips.find((p) => p.employeeId === 'emp_3')!;
    expect(lop.pct).toBeCloseTo(((cur.net - prev.net) / prev.net) * 100, 6);
    expect(explainChange(db, prev, cur).length).toBeGreaterThan(0);
  });

  test('structure validation: one balancing component, BASIC as a wage, percentages in bounds', () => {
    const std = structuredClone(seed.structures.find((s) => s.id === 'str_std')!);
    expect(validateStructure(std).errors).toEqual([]);

    const twoBalances = structuredClone(std);
    twoBalances.components.push({ id: 'x', code: 'OTHER', name: 'Other', kind: 'earning', calc: { type: 'balance', value: 0 }, isWage: false, taxable: true, pfApplicable: false, esiApplicable: true, prorate: true, showInPayslip: true });
    expect(validateStructure(twoBalances).errors.join(' ')).toContain('Only one balancing component');

    const noBasic = structuredClone(std);
    noBasic.components = noBasic.components.filter((c) => c.code !== 'BASIC');
    expect(validateStructure(noBasic).errors.join(' ')).toContain('BASIC is required');

    const basicNotWage = structuredClone(std);
    basicNotWage.components.find((c) => c.code === 'BASIC')!.isWage = false;
    expect(validateStructure(basicNotWage).errors.join(' ')).toContain('BASIC must be flagged as a wage');

    const over = structuredClone(std);
    over.components.find((c) => c.code === 'BASIC')!.calc.value = 140;
    const errs = validateStructure(over).errors.join(' ');
    expect(errs).toContain('at most 100');
    expect(errs).toContain('more than 100%');
  });

  test('the 50% add-back raises the PF wage and the employer PF by the amounts the engine reports', () => {
    const field = seed.structures.find((s) => s.id === 'str_field')!;
    const b = buildBreakup(field, 600000, { asOn: monthEnd('2026-11') });
    const fx = wageEffect(b, monthEnd('2026-11'), true, false);
    expect(Math.round(b.wageTest.addBack)).toBe(7500);
    expect(fx.pfWageWithout).toBe(17500);
    expect(fx.pfWageWith).toBe(25000);
    expect(fx.pfWageDelta).toBe(7500);
    expect(fx.employerPfDelta).toBe(900);
    const nonMember = buildBreakup(field, 600000, { asOn: monthEnd('2026-11'), pfMember: false });
    expect(wageEffect(nonMember, monthEnd('2026-11'), false, false).pfWageDelta).toBe(0);
  });

  test('the EMI schedule recovers exactly the outstanding amount, with the last EMI the remainder', () => {
    const rows = remainingSchedule(20000, 3000, 8000, '2026-11', 2);
    expect(rows.map((r) => r.emi)).toEqual([3000, 3000, 3000, 3000]);
    expect(rows[0]!.n).toBe(3);
    expect(rows[0]!.month).toBe('2026-11');
    expect(rows[rows.length - 1]!.closing).toBe(0);
    const odd = remainingSchedule(10000, 3000, 0, '2026-11');
    expect(odd.map((r) => r.emi)).toEqual([3000, 3000, 3000, 1000]);
    expect(odd.reduce((n, r) => n + r.emi, 0)).toBe(10000);
    expect(odd.map((r) => r.month)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  test('the tax comparison is the engine: monthly TDS equals the TDS line of a full-attendance payslip', () => {
    for (const id of ['emp_1', 'emp_2', 'emp_3', 'emp_5']) {
      const e = seed.employees.find((x) => x.id === id)!;
      const cmp = taxComparison(seed, e)!;
      const slip = computePayslip({
        employee: e, structure: seed.structures.find((s) => s.id === e.structureId)!, location: seed.locations.find((l) => l.id === e.locationId)!,
        adjustments: [], loans: [], shiftHours: 8, month: '2026-11', runId: 'x',
      });
      const tds = slip.deductions.find((d) => d.code === 'TDS')?.amount ?? 0;
      expect(tds).toBe(e.taxRegime === 'old' ? cmp.monthlyOld : cmp.monthlyNew);
      expect(cmp.better).toBe(cmp.newR.total <= cmp.oldR.total ? 'new' : 'old');
    }
    // more 80C can only lower old-regime tax
    const arvind = seed.employees.find((e) => e.id === 'emp_2')!;
    const base = taxComparison(seed, arvind)!;
    const more = taxComparison(seed, arvind, { ...arvind.declaration, sec80C: 150000 })!;
    expect(more.oldR.total).toBeLessThanOrEqual(base.oldR.total);
    expect(more.newR.total).toBe(base.newR.total);
  });

  test('adjustments of a frozen or paid run are locked, and one for someone not on the payroll is refused', () => {
    expect(adjustmentLock(seed, { employeeId: 'emp_4', month: '2026-10' })?.status).toBe('paid');
    expect(adjustmentLock(seed, { employeeId: 'emp_4', month: '2026-11' })).toBeUndefined();
    const ok = { employeeId: 'emp_4', month: '2026-11', kind: 'bonus' as const, amount: '5000', taxable: true, note: '' };
    expect(validateAdjustment(seed, ok)).toEqual({});
    expect(validateAdjustment(seed, { ...ok, amount: '0' }).amount).toBeTruthy();
    expect(validateAdjustment(seed, { ...ok, month: '2026-10' }).month).toContain('paid');
    expect(validateAdjustment(seed, { ...ok, employeeId: 'emp_23' }).employeeId).toContain('not on the');
    expect(employeesForRun(seed, '2026-11', retail).some((e) => e.id === 'emp_23')).toBe(false);
  });
});

// ═════════════════════════════ hub ═════════════════════════════
test.describe('payroll hub', () => {
  test('lists the seeded runs with totals from the engine, and deep-links to a tab', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/payroll');
    await expect(page.getByRole('heading', { name: 'Payroll', exact: true })).toBeVisible();
    const oct = seed.payRuns.find((r) => r.month === '2026-10' && r.entityId === retail)!;
    const t = runTotals(oct);
    const row = page.getByRole('row').filter({ hasText: 'Oct 2026' }).filter({ hasText: 'Meridian Retail' });
    await expect(row).toContainText(inr(t.gross));
    await expect(row).toContainText(inr(t.net));
    await expect(row).toContainText(inr(t.employerCost));
    await expect(row).toContainText(String(t.headcount));
    await expect(row).toContainText('IN-2026.11 (preview)');
    await expect(page.getByRole('row').filter({ hasText: 'Paid' })).toHaveCount(4);

    await page.getByLabel('Status', { exact: true }).selectOption('draft');
    await expect(page.getByText('No run matches these filters.')).toBeVisible();

    await openHrms(page, '/dashboard/hrms/payroll?tab=fnf');
    await expect(page.getByRole('tab', { name: /Full and final/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: /^Runs/ })).toHaveAttribute('aria-selected', 'false');
  });

  test('Start run opens the run for the month, and starting again opens the same one', async ({ page }) => {
    await startNovRun(page);
    const first = page.url();
    await page.goBack();
    await expect(page.getByTestId('run-scope')).toContainText('A draft run already exists');
    await page.getByRole('button', { name: /Open draft run/ }).click();
    await page.waitForURL(/\/payroll\/runs\//);
    expect(page.url().split('?')[0]).toBe(first.split('?')[0]);
    const db = await readDb(page);
    expect(db.payRuns.filter((r) => r.month === '2026-11' && r.entityId === retail)).toHaveLength(1);
  });
});

// ═════════════════════════════ the run, end to end ═════════════════════════════
test.describe('pay run', () => {
  test('inputs: loss of pay and overtime are validated and saved; adjustments validate and appear', async ({ page }) => {
    test.setTimeout(180_000);
    await startNovRun(page);
    await expect(page.getByTestId('step-inputs')).toBeVisible();

    const lop = page.getByLabel('Loss of pay days for Ritu Malhotra');
    await lop.fill('45');
    await lop.press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: '0 to 30 days' })).toBeVisible();
    await lop.fill('3');
    await lop.press('Enter');
    await expect(page.getByLabel('Paid days for Ritu Malhotra')).toHaveValue('27');
    expect((await readDb(page)).attendance.find((a) => a.employeeId === 'emp_1' && a.month === '2026-11')!.lopDays).toBe(3);

    const paid = page.getByLabel('Paid days for Neha Bansal');
    await paid.fill('26');
    await paid.press('Enter');
    await expect(page.getByLabel('Loss of pay days for Neha Bansal')).toHaveValue('4');

    const adjust = page.getByRole('button', { name: 'Add adjustment' });
    await adjust.click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Add adjustment' }).click();
    await expect(dlg.getByText('Choose an employee')).toBeVisible();
    await expect(dlg.getByText('Enter an amount')).toBeVisible();
    await dlg.getByLabel('Employee').selectOption({ label: 'Neha Bansal (MER-1003)' });
    await dlg.getByLabel(/Amount/).fill('5000');
    await dlg.getByLabel('Note').fill('Spot award');
    await dlg.getByRole('button', { name: 'Add adjustment' }).click();
    await expect(dlg).toBeHidden();
    const row = page.getByRole('row').filter({ hasText: 'Spot award' });
    await expect(row).toContainText('Neha Bansal');
    await expect(row).toContainText('₹5,000');
    const db = await readDb(page);
    expect(db.adjustments.some((a) => a.employeeId === 'emp_3' && a.month === '2026-11' && a.amount === 5000 && a.kind === 'bonus')).toBe(true);
  });

  test('checks, compute and review: blockers need a confirmation, and every number is the engine\'s', async ({ page }) => {
    test.setTimeout(240_000);
    await startNovRun(page);
    await step(page, 'checks');
    await expect(page.getByTestId('checks-blocker')).toContainText('No bank account');
    await expect(page.getByTestId('checks-warning')).toContainText('UAN not Aadhaar-seeded');
    await expect(page.getByTestId('checks-info')).toContainText('50% wage rule add-back');
    await expect(page.getByRole('link', { name: 'Fix' }).first()).toHaveAttribute('href', /\/dashboard\/hrms\/employees\//);
    // compute is refused until the blockers are confirmed
    await step(page, 'compute');
    await expect(page.getByRole('button', { name: 'Compute payslips' })).toBeDisabled();
    await step(page, 'checks');
    await page.getByRole('checkbox', { name: /I understand/ }).check();
    await page.getByRole('button', { name: 'Continue to compute' }).click();
    await page.getByRole('button', { name: 'Compute payslips' }).click();
    await expect(page.getByTestId('payslip-table')).toBeVisible(slow);

    const { db, run } = await novRun(page);
    expect(run.status).toBe('computed');
    expect(run.audit.some((a) => a.action.startsWith('Continued past 1 blocker'))).toBe(true);
    const expected = computePayRunPayslips(db, '2026-11', retail, 'x');
    expect(run.payslips).toHaveLength(expected.length);
    const t = runTotals(run);
    // the stored payslips are what the engine gives for the data the browser holds
    for (const s of run.payslips) {
      const e = expected.find((x) => x.employeeId === s.employeeId)!;
      expect([s.gross, s.totalDeductions, s.net, s.employerCost]).toEqual([e.gross, e.totalDeductions, e.net, e.employerCost]);
      const reimb = s.reimbursements.reduce((n, l) => n + l.amount, 0);
      expect(s.net).toBe(s.gross + reimb - s.totalDeductions);
    }
    // totals strip
    await expect(page.getByTestId('payslip-row')).toHaveCount(expected.length);
    for (const v of [t.gross, t.net, t.employerCost, t.tds, t.pt]) await expect(page.getByText(inr(v), { exact: true }).first()).toBeVisible();
    await expect(page.getByText(inr(t.pfEmployee + t.pfEmployer), { exact: true })).toBeVisible();
    await expect(page.getByText(inr(t.esi), { exact: true })).toBeVisible();

    // one payslip, line by line
    const emp = db.employees.find((e) => e.id === 'emp_10')!; // Vikram: loan EMI plus the Diwali bonus
    const slip = run.payslips.find((s) => s.employeeId === emp.id)!;
    const row = page.getByTestId('payslip-row').filter({ hasText: 'Vikram Joshi' });
    await expect(row).toContainText(inr(slip.gross));
    await expect(row).toContainText(inr(slip.net));
    await row.getByRole('button', { name: /Show the lines of Vikram Joshi/ }).click();
    const detail = page.locator(`#detail-${slip.id}`);
    for (const l of [...slip.earnings, ...slip.deductions, ...slip.employer]) await expect(detail).toContainText(l.name);
    await expect(detail).toContainText('Wage test (50% rule)');
    await expect(detail).toContainText('Bonus (Diwali bonus)');
    await expect(detail).toContainText('Loan EMI');

    // month-on-month: the 12,000 bonus moves Vikram's net by more than 10% and the reason is shown
    const { changes } = comparePayslips(db, run);
    expect(changes.get(emp.id)!.flagged).toBe(true);
    await expect(detail).toContainText('Why net pay moved');
    await expect(detail).toContainText('Adjustment this month: Bonus ₹12,000');
    await expect(page.getByTestId('run-compare')).toContainText(`${Array.from(changes.values()).filter((c) => c.flagged).length} payslip`);
    await page.getByLabel('Show', { exact: true }).selectOption('changed');
    await expect(page.getByTestId('payslip-row')).toHaveCount(Array.from(changes.values()).filter((c) => c.flagged).length);

    // statutory parameters carry their confidence
    await page.getByRole('button', { name: /Show statutory parameters/ }).click();
    await expect(page.getByRole('cell', { name: 'PF wage ceiling' })).toBeVisible();
    await expect(page.getByText('Reported, confirm').first()).toBeVisible();

    // inputs changed after compute: the run says so and cannot be frozen
    await step(page, 'inputs');
    const ot = page.getByLabel('Overtime hours for Ritu Malhotra');
    await ot.fill('4');
    await ot.press('Enter');
    await step(page, 'compute');
    await expect(page.getByText('Inputs changed after the last compute')).toBeVisible();
    await step(page, 'freeze');
    await expect(page.getByRole('button', { name: 'Freeze run' })).toBeDisabled();
    await step(page, 'compute');
    await page.getByRole('button', { name: 'Recompute now' }).click();
    await expect(page.getByText('Payslips match the current inputs.')).toBeVisible();
  });

  test('freeze locks the inputs, an unfreeze needs a reason and gives the loan EMIs back; pay builds the files', async ({ page }) => {
    test.setTimeout(300_000);
    await computeNovRun(page);
    const before = await readDb(page);
    const loansBefore = Object.fromEntries(before.loans.map((l) => [l.id, l.recovered]));

    await step(page, 'review');
    await expect(page.getByTestId('readiness')).toContainText('Payslips match the current inputs');
    await page.getByRole('button', { name: 'Continue to freeze' }).click();
    await page.getByRole('button', { name: 'Freeze run' }).click();
    const dlg = page.getByRole('dialog', { name: 'Freeze this run?' });
    await expect(dlg).toContainText('payslips');
    await dlg.getByRole('button', { name: 'Freeze run' }).click();
    await expect(page.getByTestId('step-pay')).toBeVisible(slow);
    await expect(page.getByRole('heading', { name: /Pay run, November 2026/ })).toContainText('Frozen');

    let { db, run } = await novRun(page);
    expect(run.status).toBe('frozen');
    for (const l of db.loans) {
      const emi = run.payslips.filter((s) => s.employeeId === l.employeeId).flatMap((s) => s.deductions.filter((d) => d.code === 'LOAN')).reduce((n, d) => n + d.amount, 0);
      expect(l.recovered - loansBefore[l.id]!).toBe(emi);
    }
    // inputs are locked while frozen
    await step(page, 'inputs');
    await expect(page.getByLabel('Loss of pay days for Ritu Malhotra')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Add adjustment' })).toBeDisabled();

    // unfreeze: a reason is required, and the EMIs are given back
    await step(page, 'freeze');
    await page.getByRole('button', { name: 'Unfreeze' }).click();
    const un = page.getByRole('dialog', { name: 'Unfreeze this run' });
    await un.getByRole('button', { name: 'Unfreeze run' }).click();
    await expect(un.getByText('Give a reason of at least a few words')).toBeVisible();
    await un.getByLabel('Reason').fill('An incentive was missed for the sales team');
    await un.getByRole('button', { name: 'Unfreeze run' }).click();
    await expect(page.getByRole('heading', { name: /Pay run, November 2026/ })).toContainText('Computed');
    ({ db, run } = await novRun(page));
    expect(run.status).toBe('computed');
    for (const l of db.loans) expect(l.recovered).toBe(loansBefore[l.id]);
    const trail = page.getByRole('table').last();
    await expect(trail).toContainText('Unfrozen: An incentive was missed for the sales team');
    await expect(trail).toContainText('Frozen. Payslips are locked.');
    await step(page, 'inputs');
    await expect(page.getByLabel('Loss of pay days for Ritu Malhotra')).toBeEnabled();

    // freeze again, then pay
    await step(page, 'freeze');
    await page.getByRole('button', { name: 'Freeze run' }).click();
    await page.getByRole('dialog', { name: 'Freeze this run?' }).getByRole('button', { name: 'Freeze run' }).click();
    await expect(page.getByTestId('step-pay')).toBeVisible(slow);
    ({ db, run } = await novRun(page));
    for (const l of db.loans) expect(l.recovered - loansBefore[l.id]!).toBeGreaterThanOrEqual(0);
    const onceMore = Object.fromEntries(db.loans.map((l) => [l.id, l.recovered]));
    expect(onceMore).not.toEqual(loansBefore); // recovered once, not twice
    for (const l of db.loans) {
      const emi = run.payslips.filter((s) => s.employeeId === l.employeeId).flatMap((s) => s.deductions.filter((d) => d.code === 'LOAN')).reduce((n, d) => n + d.amount, 0);
      expect(l.recovered - loansBefore[l.id]!).toBe(emi);
    }

    // bank file
    const bank = buildBankFile(db, run);
    const total = bank.rows.reduce((n, r) => n + Number(r[5]), 0);
    await expect(page.getByTestId('bank-total')).toContainText(inr(total));
    await expect(page.getByText('Reconciles', { exact: true })).toBeVisible();
    await expect(page.getByTestId('bank-skipped')).toContainText('No bank account');
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download bank file/ }).click()]);
    const csvText = readFileSync(await csv.path(), 'utf8').split('\n');
    expect(csvText[0]).toBe('Employee code,Name,Account number,IFSC,Bank,Amount,Narration');
    expect(csvText).toHaveLength(bank.rows.length + 1);
    expect(csvText.slice(1).reduce((n, line) => n + Number(line.split(',')[5]), 0)).toBe(total);
    expect(csv.suggestedFilename()).toContain('bank-advice-2026-11');

    // ECR
    const ecr = buildEcr(db, run);
    await expect(page.getByTestId('ecr-blocked')).toContainText('UAN');
    expect(ecr.blocked.length).toBeGreaterThan(0);
    const [ecrFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download ECR/ }).click()]);
    const ecrText = readFileSync(await ecrFile.path(), 'utf8');
    expect(ecrText).toBe(ecr.text);
    expect(ecrText.split('\n')).toHaveLength(ecr.rows);

    // mark paid, then a payslip
    await page.getByRole('button', { name: 'Mark as paid' }).click();
    await page.getByRole('dialog', { name: 'Mark this run as paid?' }).getByRole('button', { name: 'Mark as paid' }).click();
    await expect(page.getByRole('heading', { name: /Pay run, November 2026/ })).toContainText('Paid');
    expect((await novRun(page)).run.status).toBe('paid');
    await step(page, 'freeze');
    await expect(page.getByText(/A paid run cannot be unfrozen/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unfreeze' })).toHaveCount(0);

    const slip = run.payslips.find((s) => s.employeeId === 'emp_1')!;
    await step(page, 'pay');
    await page.getByRole('link', { name: 'Open payslip of Ritu Malhotra' }).click();
    await page.waitForURL(/\/payslips\//, { timeout: 90_000 });
    await expect(page.getByTestId('net-pay')).toHaveText(inr(slip.net), slow);
    await expect(page.getByTestId('net-words')).toHaveText(inrWords(slip.net));
  });
});

// ═════════════════════════════ payslip ═════════════════════════════
test.describe('payslip', () => {
  test('shows the paper payslip with the stored figures, prints through a scoped style and downloads a CSV', async ({ page }) => {
    test.setTimeout(180_000);
    await openHrms(page, '/dashboard/hrms/my');
    await page.getByRole('link', { name: 'Open the payslip for Oct 2026' }).click();
    await page.waitForURL(/\/payslips\//, { timeout: 90_000 });
    const paper = page.getByTestId('payslip-paper');
    await expect(paper).toBeVisible(slow);

    const db = await readDb(page);
    const id = page.url().split('/').pop()!;
    const slip = db.payRuns.flatMap((r) => r.payslips).find((s) => s.id === id)!;
    const run = db.payRuns.find((r) => r.payslips.some((s) => s.id === id))!;
    expect(slip.employeeId).toBe('emp_1');

    await expect(page.getByTestId('net-pay')).toHaveText(inr(slip.net));
    await expect(page.getByTestId('net-words')).toHaveText(inrWords(slip.net));
    for (const l of [...slip.earnings, ...slip.deductions, ...slip.employer]) {
      await expect(paper).toContainText(l.name);
      await expect(paper).toContainText(inr(l.amount));
    }
    await expect(paper).toContainText(inr(slip.gross));
    await expect(paper).toContainText(inr(slip.totalDeductions));
    await expect(paper).toContainText(`Computed under ${run.lawVersion}`);
    await expect(paper).toContainText('Meridian Retail Pvt Ltd');
    await expect(paper).toContainText('Ritu Malhotra');
    // sensitive identifiers are masked
    const emp = db.employees.find((e) => e.id === 'emp_1')!;
    await expect(paper).not.toContainText(emp.pan!);
    await expect(paper).not.toContainText(emp.uan!);
    await expect(paper).not.toContainText(emp.bank!.accountNumber);
    await expect(paper).toContainText(emp.pan!.slice(0, 2) + '•••••' + emp.pan!.slice(-3));
    await expect(paper).toContainText('† Counted as wages');

    // print styles are scoped to the paper
    expect(await page.evaluate(() => Array.from(document.querySelectorAll('style')).filter((s) => (s.textContent ?? '').includes('.payslip-paper')).length)).toBe(1);
    await page.evaluate(() => { (window as unknown as { __printed: number }).__printed = 0; window.print = () => { (window as unknown as { __printed: number }).__printed++; }; });
    await page.getByRole('button', { name: 'Print' }).click();
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
    await page.emulateMedia({ media: 'print' });
    await expect(paper).toBeVisible();
    await expect(page.getByRole('heading', { name: /Payslip, Ritu Malhotra/ })).toBeHidden();
    await page.emulateMedia({ media: 'screen' });

    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
    const lines = readFileSync(await dl.path(), 'utf8').split('\n');
    expect(lines[0]).toBe('Section,Code,Description,Amount');
    expect(lines).toContain(`Total,NET,Net pay,${slip.net}`);
    expect(lines).toContain(`Total,GROSS,Gross earnings,${slip.gross}`);

    await expect(page.getByRole('link', { name: /Payroll \/ Oct 2026 run/ })).toHaveAttribute('href', new RegExp(`/payroll/runs/${run.id}`));
  });

  test('an unknown payslip link says so', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/payslips/does-not-exist');
    await expect(page.getByText('There is no payslip with this link')).toBeVisible(slow);
  });
});

// ═════════════════════════════ structures ═════════════════════════════
test.describe('salary structures', () => {
  test('the list shows how many people are on each structure', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/payroll?tab=structures');
    for (const s of seed.structures) {
      const row = page.getByRole('row').filter({ hasText: s.name });
      await expect(row.getByRole('cell').nth(3)).toHaveText(String(seed.employees.filter((e) => e.structureId === s.id).length));
      await expect(row.getByRole('cell').nth(2)).toHaveText(String(s.components.length));
    }
    await expect(page.getByRole('row').filter({ hasText: 'Field sales' })).toContainText('Add-back');
    await expect(page.getByRole('row').filter({ hasText: 'Office staff' })).toContainText('Pass');
    // a structure with people on it cannot be deleted
    await expect(page.getByRole('button', { name: 'Delete Office staff' })).toBeDisabled();
  });

  test('builder: breakup, wage test and reconciliation come from the engine for any CTC', async ({ page }) => {
    test.setTimeout(180_000);
    await openHrms(page, '/dashboard/hrms/payroll/structures/str_std');
    await expect(page.getByRole('heading', { name: 'Office staff' })).toBeVisible(slow);
    const std = seed.structures.find((s) => s.id === 'str_std')!;
    const b12 = buildBreakup(std, 1200000, { asOn: monthEnd('2026-11') });
    await expect(page.getByLabel(/Annual CTC/)).toHaveValue('1200000');
    await expect(page.getByTestId('breakup-gross')).toHaveText(inr(b12.monthlyGross));
    await expect(page.getByTestId('wage-test')).toContainText('Pass');
    await expect(page.getByTestId('reconciliation')).toContainText('Reconciles');
    await expect(page.getByTestId('breakup-table')).toContainText(inr(b12.lines.find((l) => l.code === 'PF_ER')!.monthly));

    // a different CTC changes every figure
    await page.getByLabel(/Annual CTC/).fill('1800000');
    const b18 = buildBreakup(std, 1800000, { asOn: monthEnd('2026-11') });
    await expect(page.getByTestId('breakup-gross')).toHaveText(inr(b18.monthlyGross));
    // an invalid CTC is refused
    await page.getByLabel(/Annual CTC/).fill('');
    await expect(page.getByText('Enter an annual CTC')).toBeVisible();
    await page.getByLabel(/Annual CTC/).fill('1200000');

    // the employees on the structure with their own breakup totals
    const ritu = seed.employees.find((e) => e.id === 'emp_1')!;
    const rb = buildBreakup(std, ritu.annualCtc!, { asOn: monthEnd('2026-11'), pfMember: ritu.pfMember, pfOnActual: ritu.pfOnActualWage, overrides: ritu.structureOverrides });
    const row = page.getByRole('row').filter({ hasText: 'Ritu Malhotra' });
    await expect(row).toContainText(inr(ritu.annualCtc));
    await expect(row).toContainText(inr(rb.monthlyGross));
    await expect(row).toContainText(inr(rb.lines.reduce((n, l) => n + l.monthly, 0)));
    await expect(row).toContainText(inr(rb.pfWage));

    // the field structure fails the 50% test: add-back and the effect on PF
    await openHrms(page, '/dashboard/hrms/payroll/structures/str_field');
    await page.getByLabel(/Annual CTC/).fill('600000');
    const field = seed.structures.find((s) => s.id === 'str_field')!;
    const bf = buildBreakup(field, 600000, { asOn: monthEnd('2026-11') });
    const fx = wageEffect(bf, monthEnd('2026-11'), true, false);
    await expect(page.getByTestId('wage-test')).toContainText('Fail, add-back applied');
    await expect(page.getByTestId('wage-test')).toContainText(inr(bf.wageTest.addBack));
    await expect(page.getByTestId('wage-effect')).toContainText(inr(fx.pfWageWith));
    await expect(page.getByTestId('wage-effect')).toContainText(inr(fx.employerPfDelta));
    await expect(page.getByTestId('wage-effect')).toContainText('Reported, confirm');
    await expect(page.getByTestId('structure-warnings')).toContainText('Wages are');
  });

  test('create a structure, add and reorder components, validation blocks a bad one, and a save persists', async ({ page }) => {
    test.setTimeout(240_000);
    await openHrms(page, '/dashboard/hrms/payroll?tab=structures');
    await page.getByRole('button', { name: 'New structure' }).click();
    const dlg = page.getByRole('dialog', { name: 'New salary structure' });
    await dlg.getByRole('button', { name: 'Create structure' }).click();
    await expect(dlg.getByText('Give the structure a name')).toBeVisible();
    await dlg.getByLabel(/Structure name/).fill('Office staff');
    await expect(dlg.getByText('A structure with this name already exists')).toBeVisible();
    await dlg.getByLabel(/Structure name/).fill('Sales managers');
    await dlg.getByRole('button', { name: 'Create structure' }).click();
    await page.waitForURL(/\/payroll\/structures\/str_/, { timeout: 90_000 });
    await expect(page.getByRole('heading', { name: 'Sales managers' })).toBeVisible(slow);
    const rows = page.getByTestId('component-row');
    await expect(rows).toHaveCount(4);

    // the new structure's breakup is the engine's
    const created = (await readDb(page)).structures.find((s) => s.name === 'Sales managers')!;
    await expect(page.getByTestId('breakup-gross')).toHaveText(inr(buildBreakup(created, 1200000, { asOn: monthEnd('2026-11') }).monthlyGross));

    // add a component: validation first
    await page.getByRole('button', { name: 'Add component' }).click();
    const cf = page.getByRole('dialog', { name: 'Add component' });
    await cf.getByRole('button', { name: 'Add component' }).click();
    await expect(cf.getByText('Enter a code')).toBeVisible();
    await expect(cf.getByText('Enter a name')).toBeVisible();
    await expect(cf.getByText('Enter a value')).toBeVisible();
    await cf.getByLabel(/^Code/).fill('hra');
    await cf.getByLabel(/^Name/).fill('House Rent Allowance');
    await cf.getByLabel('How it is calculated').selectOption('pct_ctc');
    await cf.getByLabel(/^Value/).fill('150');
    await cf.getByRole('button', { name: 'Add component' }).click();
    await expect(cf.getByText('Percent of CTC must be above 0 and at most 100')).toBeVisible();
    await cf.getByLabel('How it is calculated').selectOption('pct_basic');
    await cf.getByLabel(/^Value/).fill('40');
    await cf.getByRole('button', { name: 'Add component' }).click();
    await expect(cf).toBeHidden();
    await expect(rows).toHaveCount(5);
    await expect(page.getByTestId('breakup-table')).toContainText('₹20,000'); // 40% of the 50,000 basic

    // a second balancing component is an error and blocks the save
    await page.getByRole('button', { name: 'Add component' }).click();
    await cf.getByLabel(/^Code/).fill('FLEX');
    await cf.getByLabel(/^Name/).fill('Flexi Allowance');
    await cf.getByLabel('How it is calculated').selectOption('balance');
    await cf.getByRole('button', { name: 'Add component' }).click();
    await expect(page.getByTestId('structure-errors')).toContainText('Only one balancing component is allowed');
    await expect(page.getByRole('button', { name: 'Save structure' })).toBeDisabled();
    await page.getByRole('button', { name: 'Remove FLEX' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove component' }).click();
    await expect(page.getByTestId('structure-errors')).toHaveCount(0);

    // removing BASIC is an error too; discard brings everything back
    await page.getByRole('button', { name: 'Remove BASIC' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove component' }).click();
    await expect(page.getByTestId('structure-errors')).toContainText('BASIC is required');
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(rows).toHaveCount(4);

    // reorder and save
    await page.getByRole('button', { name: 'Add component' }).click();
    await cf.getByLabel(/^Code/).fill('HRA');
    await cf.getByLabel(/^Name/).fill('House Rent Allowance');
    await cf.getByLabel('How it is calculated').selectOption('pct_basic');
    await cf.getByLabel(/^Value/).fill('40');
    await cf.getByRole('button', { name: 'Add component' }).click();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Move HRA up' }).click(); // from last place to first
    await expect(rows.first()).toContainText('HRA');
    await expect(page.getByRole('button', { name: 'Move HRA up' })).toBeDisabled();
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await page.getByRole('button', { name: 'Save structure' }).click();
    await expect(page.getByText('Unsaved changes')).toBeHidden();
    const saved = (await readDb(page)).structures.find((s) => s.name === 'Sales managers')!;
    expect(saved.components.map((c) => c.code)).toEqual(['HRA', 'BASIC', 'SPECIAL', 'PF_ER', 'ESI_ER']);
    await page.reload();
    await expect(page.getByTestId('component-row').first()).toContainText('HRA', slow);

    // unused structures can be deleted, after a confirmation
    await openHrms(page, '/dashboard/hrms/payroll?tab=structures');
    await page.getByRole('button', { name: 'Delete Sales managers' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete structure' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Sales managers' })).toHaveCount(0);
  });
});

// ═════════════════════════════ adjustments ═════════════════════════════
test.describe('adjustments', () => {
  test('closed months are locked; open months can be added to, edited and deleted', async ({ page }) => {
    test.setTimeout(180_000);
    await openHrms(page, '/dashboard/hrms/payroll?tab=adjustments');
    const novRows = seed.adjustments.filter((a) => a.month === '2026-11');
    await expect(page.getByRole('row').filter({ hasText: 'Nov 2026' })).toHaveCount(novRows.length);

    await page.getByLabel('Month', { exact: true }).selectOption('2026-10');
    await expect(page.getByRole('row').filter({ hasText: 'Oct 2026' })).toHaveCount(seed.adjustments.filter((a) => a.month === '2026-10').length);
    await expect(page.getByRole('row').filter({ hasText: 'Locked (paid)' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Edit adjustment for Rohit Chauhan/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Delete adjustment for Rohit Chauhan/ })).toBeDisabled();

    await page.getByLabel('Month', { exact: true }).selectOption('2026-11');
    await page.getByRole('button', { name: 'Add adjustment' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Employee').selectOption({ label: 'Imran Sheikh (MER-1006)' });
    await dlg.getByLabel('Kind').selectOption('one_time_deduction');
    await dlg.getByLabel(/Amount/).fill('0');
    await dlg.getByRole('button', { name: 'Add adjustment' }).click();
    await expect(dlg.getByText('Amount must be more than zero')).toBeVisible();
    // a month with a paid run is refused
    await dlg.getByLabel(/Amount/).fill('1500');
    await dlg.getByLabel(/^Month/).selectOption('2026-10');
    await dlg.getByRole('button', { name: 'Add adjustment' }).click();
    await expect(dlg.getByText(/run is paid/)).toBeVisible();
    // someone who has left is refused
    await dlg.getByLabel(/^Month/).selectOption('2026-11');
    await dlg.getByLabel('Employee').selectOption({ label: 'Deepa Pillai (MER-1023)' });
    await dlg.getByRole('button', { name: 'Add adjustment' }).click();
    await expect(dlg.getByText(/not on the Nov 2026 payroll/)).toBeVisible();
    await dlg.getByLabel('Employee').selectOption({ label: 'Imran Sheikh (MER-1006)' });
    await dlg.getByLabel('Note').fill('Damaged tablet');
    await dlg.getByRole('button', { name: 'Add adjustment' }).click();
    await expect(dlg).toBeHidden();

    const pay = novRows.filter((a) => a.kind !== 'one_time_deduction').reduce((n, a) => n + a.amount, 0);
    await expect(page.getByTestId('adj-summary')).toContainText(inr(pay));
    await expect(page.getByTestId('adj-summary')).toContainText(inr(1500));
    const row = page.getByRole('row').filter({ hasText: 'Damaged tablet' });
    await expect(row).toContainText('-₹1,500');

    await row.getByRole('button', { name: /Edit adjustment/ }).click();
    await dlg.getByLabel(/Amount/).fill('1800');
    await dlg.getByRole('button', { name: 'Save changes' }).click();
    await expect(row).toContainText('₹1,800');

    await row.getByRole('button', { name: /Delete adjustment/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete adjustment' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Damaged tablet' })).toHaveCount(0);
    expect((await readDb(page)).adjustments).toHaveLength(seed.adjustments.length);
  });
});

// ═════════════════════════════ loans ═════════════════════════════
test.describe('loans and advances', () => {
  test('shows recovered and outstanding amounts, previews the EMI schedule and validates a new loan', async ({ page }) => {
    test.setTimeout(180_000);
    await openHrms(page, '/dashboard/hrms/payroll?tab=loans');
    const out = seed.loans.reduce((n, l) => n + l.principal - l.recovered, 0);
    await expect(page.getByTestId('loan-summary')).toContainText(inr(out));
    const pooja = seed.loans.find((l) => l.employeeId === 'emp_7')!;
    const row = page.getByRole('row').filter({ hasText: 'Pooja Verma' });
    await expect(row).toContainText(inr(pooja.recovered));
    await expect(row).toContainText(inr(pooja.principal - pooja.recovered));
    await expect(page.getByRole('button', { name: /Delete loan of Pooja Verma/ })).toBeDisabled();

    await page.getByRole('button', { name: /View EMI schedule for Pooja Verma/ }).click();
    const modal = page.getByRole('dialog');
    const left = Math.ceil((pooja.principal - pooja.recovered) / pooja.emi);
    await expect(modal.getByRole('row')).toHaveCount(left + 1);
    await expect(modal.getByRole('row').nth(1)).toContainText('Nov 2026');
    await expect(modal.getByRole('row').nth(1)).toContainText('Next');
    await expect(modal.getByRole('row').nth(left)).toContainText('₹0');
    await modal.getByRole('button', { name: 'Close', exact: true }).last().click();

    await page.getByRole('button', { name: 'Add loan or advance' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dlg.getByText('Choose an employee')).toBeVisible();
    await dlg.getByLabel('Employee').selectOption({ label: 'Tanvi Kapoor (MER-1018)' });
    await dlg.getByLabel(/Amount lent/).fill('10000');
    await dlg.getByLabel(/Monthly EMI/).fill('20000');
    await expect(dlg.getByText('The EMI cannot be more than the amount lent')).toBeVisible();
    await dlg.getByLabel(/Monthly EMI/).fill('3000');
    await expect(dlg.getByRole('row')).toHaveCount(5); // 3,000 x 3 and a last 1,000, plus the header
    await dlg.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dlg).toBeHidden();
    const added = page.getByRole('row').filter({ hasText: 'Tanvi Kapoor' });
    await expect(added).toContainText('₹10,000');
    await expect(added).toContainText('Recovering');
    expect((await readDb(page)).loans).toHaveLength(seed.loans.length + 1);

    await added.getByRole('button', { name: /Delete loan of Tanvi Kapoor/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Tanvi Kapoor' })).toHaveCount(0);
  });
});

// ═════════════════════════════ full and final ═════════════════════════════
test.describe('full and final', () => {
  test('the paid case shows the engine\'s settlement, with the gratuity explanation', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/payroll?tab=fnf');
    const c = seed.fnfCases[0]!;
    const res = computeFnf(seed, c)!;
    const row = page.getByRole('row').filter({ hasText: 'Deepa Pillai' });
    await expect(row).toContainText(inr(res.net));
    await expect(row).toContainText('Paid');
    await page.getByRole('button', { name: /Open the settlement of Deepa Pillai/ }).click();
    await expect(page.getByTestId('fnf-net')).toHaveText(inr(res.net));
    await expect(page.getByTestId('fnf-sheet')).toContainText(res.gratuity.reason);
    await expect(page.getByTestId('fnf-sheet')).toContainText('Not eligible');
    for (const l of res.lines) await expect(page.getByTestId('fnf-sheet')).toContainText(l.label);
    await expect(page.getByRole('button', { name: 'Approve settlement' })).toHaveCount(0);
  });

  test('create, approve and pay a settlement; the net payable is the engine\'s and the due date follows the two-day clock', async ({ page }) => {
    test.setTimeout(180_000);
    await openHrms(page, '/dashboard/hrms/payroll?tab=fnf');
    await page.getByRole('button', { name: 'New settlement' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByLabel('Employee')).toHaveValue('emp_22');
    await dlg.getByLabel(/Last working day/).fill('');
    await dlg.getByLabel('Leave days to encash').fill('99');
    await dlg.getByRole('button', { name: 'Create settlement' }).click();
    await expect(dlg.getByText('Enter the last working day')).toBeVisible();
    await expect(dlg.getByText(/days of earned leave are available/)).toBeVisible();
    await dlg.getByLabel(/Last working day/).fill('2026-11-30');
    await dlg.getByLabel('Leave days to encash').fill('5');
    await dlg.getByLabel('Other payments').fill('1000');
    await dlg.getByLabel('Other recoveries').fill('250');
    await dlg.getByLabel('Notice days served').fill('20');
    await expect(dlg.getByText(/the net payable is/)).toBeVisible();
    await dlg.getByRole('button', { name: 'Create settlement' }).click();
    await expect(dlg).toBeHidden();

    const db = await readDb(page);
    const c = db.fnfCases.find((x) => x.employeeId === 'emp_22')!;
    expect(c).toMatchObject({ status: 'draft', lastWorkingDate: '2026-11-30', noticeDaysServed: 20, leaveEncashDays: 5, otherPayments: 1000, otherRecoveries: 250, dueBy: '2026-12-02' });
    const res = computeFnf(db, c as FnfCase)!;
    const sheet = page.getByTestId('fnf-sheet');
    await expect(page.getByTestId('fnf-net')).toHaveText(inr(res.net));
    await expect(sheet).toContainText('2 Dec 2026');
    await expect(sheet).toContainText('Notice shortfall recovery (10 days)');
    await expect(sheet).toContainText('Leave encashment (5 days)');
    await expect(sheet).toContainText('also includes Yash Rathore'); // the November run pays the same days
    expect(res.net).toBe(res.payable - res.recoverable);
    expect(res.recoverable).toBe(res.lines.filter((l) => l.kind === 'recovery').reduce((n, l) => n + l.amount, 0));

    await page.getByRole('button', { name: 'Approve settlement' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mark as paid' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit inputs' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mark as paid' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mark as paid' }).click();
    await expect(page.getByRole('button', { name: 'Mark as paid' })).toHaveCount(0);
    expect((await readDb(page)).fnfCases.find((x) => x.employeeId === 'emp_22')!.status).toBe('paid');
    // the table now shows the case as paid, and nobody is left to settle
    await expect(page.getByRole('button', { name: 'New settlement' })).toBeDisabled();
  });

  test('a settlement past its due date shows an overdue badge, and the statement prints', async ({ page }) => {
    test.setTimeout(180_000);
    await openHrms(page, '/dashboard/hrms/payroll?tab=fnf');
    await page.getByRole('button', { name: 'New settlement' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel(/Last working day/).fill('2026-10-20');
    await dlg.getByLabel('Resignation date').fill('2026-09-20');
    await dlg.getByLabel('Leave days to encash').fill('0');
    await dlg.getByRole('button', { name: 'Create settlement' }).click();
    await expect(dlg).toBeHidden();
    const due = '2026-10-22'; // Tuesday 20 Oct plus two working days
    const days = Math.round((Date.parse(`${PREVIEW_TODAY}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000);
    expect(addDays(due, days)).toBe(PREVIEW_TODAY);
    await expect(page.getByTestId('fnf-sheet')).toContainText(`Overdue by ${days} days`);
    await expect(page.getByRole('row').filter({ hasText: 'Yash Rathore' })).toContainText(`Overdue ${days} days`);
    await page.getByLabel('Status', { exact: true }).selectOption('overdue');
    await expect(page.getByRole('row').filter({ hasText: 'Yash Rathore' })).toHaveCount(1);
    await expect(page.getByRole('row').filter({ hasText: 'Deepa Pillai' })).toHaveCount(0);

    await page.evaluate(() => { (window as unknown as { __printed: number }).__printed = 0; window.print = () => { (window as unknown as { __printed: number }).__printed++; }; });
    await page.getByRole('button', { name: 'Print statement' }).click();
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
    expect(await page.evaluate(() => Array.from(document.querySelectorAll('style')).filter((s) => (s.textContent ?? '').includes('.fnf-print')).length)).toBe(1);
    const res = computeFnf(await readDb(page), (await readDb(page)).fnfCases.find((c) => c.employeeId === 'emp_22')!)!;
    await expect(page.locator('.fnf-print')).toContainText(inrWords(Math.abs(res.net)));
    await expect(page.locator('.fnf-print')).toContainText('FULL AND FINAL SETTLEMENT STATEMENT');
  });
});

// ═════════════════════════════ My HR ═════════════════════════════
test.describe('My HR', () => {
  test('defaults to the first active employee: payslips, year to date, letters and documents', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/my');
    await expect(page.getByTestId('my-name')).toHaveText('Ritu Malhotra', slow);
    const slips = seed.payRuns.filter((r) => r.status === 'paid').flatMap((r) => r.payslips.filter((s) => s.employeeId === 'emp_1').map((s) => ({ r, s })));
    expect(slips).toHaveLength(2);
    for (const { s } of slips) {
      const row = page.getByRole('row').filter({ hasText: new RegExp(s.month === '2026-09' ? 'Sep 2026' : 'Oct 2026') }).filter({ hasText: 'Meridian Retail' });
      await expect(row).toContainText(inr(s.net));
      await expect(row).toContainText(inr(s.gross));
    }
    const gross = slips.reduce((n, x) => n + x.s.gross, 0);
    const tds = slips.reduce((n, x) => n + (x.s.deductions.find((d) => d.code === 'TDS')?.amount ?? 0), 0);
    const pf = slips.reduce((n, x) => n + (x.s.deductions.find((d) => d.code === 'PF')?.amount ?? 0), 0);
    await expect(page.getByText(inr(gross), { exact: true })).toBeVisible();
    await expect(page.getByText(inr(tds), { exact: true }).first()).toBeVisible();
    await expect(page.getByText(inr(pf), { exact: true })).toBeVisible();
    await expect(page.getByTestId('ytd-note')).toContainText('Sep 2026 to Oct 2026');
    await expect(page.getByText('No letter has been issued to Ritu Malhotra yet.')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Appointment letter' })).toContainText('Verified');
    // nothing is shown for a run that is only computed: the payslips list holds released runs only
    await expect(page.getByRole('row').filter({ hasText: 'Nov 2026' })).toHaveCount(0);
  });

  test('tax: both regimes on the real salary, a recommendation, validation, and a saved declaration', async ({ page }) => {
    test.setTimeout(180_000);
    await openHrms(page, '/dashboard/hrms/my');
    await page.getByLabel('Employee', { exact: true }).selectOption({ label: 'Arvind Nair (MER-1002)' });
    await expect(page.getByTestId('my-name')).toHaveText('Arvind Nair');
    const arvind = seed.employees.find((e) => e.id === 'emp_2')!;
    const cmp = taxComparison(seed, arvind)!;
    const table = page.getByTestId('tax-compare');
    await expect(table).toContainText(inr(cmp.newR.total));
    await expect(table).toContainText(inr(cmp.oldR.total));
    await expect(table).toContainText(inr(cmp.annualGross));
    await expect(table).toContainText(inr(cmp.monthlyOld));
    const reco = page.getByTestId('tax-recommendation');
    await expect(reco).toContainText(`${cmp.better} regime gives the lower tax`);
    await expect(reco).toContainText(inr(Math.abs(cmp.newR.total - cmp.oldR.total)));
    await expect(page.getByText('Reported, confirm').first()).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Old regime' })).toBeChecked();

    // the comparison follows the declaration
    const more = taxComparison(seed, arvind, { ...arvind.declaration, sec80C: 150000 })!;
    await page.getByLabel(/Section 80C/).fill('150000');
    await expect(table).toContainText(inr(more.oldR.total));

    // validation: rent above 1 lakh needs the landlord's PAN
    await page.getByLabel(/Rent paid/).fill('240000');
    await page.getByLabel('Landlord PAN').fill('');
    await page.getByRole('button', { name: 'Submit for verification' }).click();
    await expect(page.getByText(/needs the landlord's PAN/)).toBeVisible();
    await page.getByLabel(/80D/).fill('1.2.3'); // the field only accepts digits and a dot, so a minus sign never gets in
    await expect(page.getByText(/must be a number/)).toBeVisible();
    await page.getByLabel(/80D/).fill('25000');
    await page.getByLabel('Landlord PAN').fill('ABCPE1234F');
    await page.getByRole('button', { name: 'Submit for verification' }).click();
    await expect(page.getByText('Submitted, awaiting HR')).toBeVisible();
    const saved = (await readDb(page)).employees.find((e) => e.id === 'emp_2')!;
    expect(saved.declaration).toMatchObject({ sec80C: 150000, sec80D: 25000, rentPaidAnnual: 240000, landlordPan: 'ABCPE1234F', status: 'submitted', submittedOn: PREVIEW_TODAY });

    // switching regime is saved on the employee
    await page.getByRole('radio', { name: 'New regime' }).check();
    await page.getByRole('button', { name: 'Save changes' }).click();
    expect((await readDb(page)).employees.find((e) => e.id === 'emp_2')!.taxRegime).toBe('new');
  });

  test('leave: balances, and an application that is validated and kept in page state only', async ({ page }) => {
    test.setTimeout(180_000);
    await openHrms(page, '/dashboard/hrms/my');
    const cl = seed.leaveBalances.find((b) => b.employeeId === 'emp_1' && b.leaveTypeId === 'lv_cl')!;
    await expect(page.getByRole('row').filter({ hasText: 'Casual Leave' })).toContainText(String(cl.opening + cl.accrued - cl.taken));
    await expect(page.getByText(/no leave-request store/i)).toBeVisible();

    await page.getByRole('button', { name: 'Apply leave' }).click();
    const dlg = page.getByRole('dialog', { name: 'Apply leave' });
    await dlg.getByRole('button', { name: 'Submit request' }).click();
    await expect(dlg.getByText('Give a short reason')).toBeVisible();
    await dlg.getByLabel('Leave type').selectOption({ label: 'Casual Leave' });
    await dlg.getByLabel('From').fill('2026-11-09');
    await dlg.getByLabel('To').fill('2026-11-14');
    await dlg.getByLabel(/Reason/).fill('Family function');
    await expect(dlg.getByTestId('leave-days')).toContainText('6');
    await dlg.getByRole('button', { name: 'Submit request' }).click();
    await expect(dlg.getByText(/at most 3 days at a time/)).toBeVisible();
    await dlg.getByLabel('To').fill('2026-11-10');
    await expect(dlg.getByTestId('leave-days')).toContainText('2');
    await dlg.getByRole('button', { name: 'Submit request' }).click();
    await expect(dlg).toBeHidden();
    const reqs = page.getByTestId('leave-requests');
    await expect(reqs).toContainText('Casual Leave');
    await expect(reqs).toContainText('Family function');
    await expect(page.getByRole('row').filter({ hasText: 'Casual Leave' }).first()).toContainText(String(cl.opening + cl.accrued - cl.taken - 2));

    // a second request that overlaps is refused
    await page.getByRole('button', { name: 'Apply leave' }).click();
    await dlg.getByLabel('From').fill('2026-11-10');
    await dlg.getByLabel('To').fill('2026-11-10');
    await dlg.getByLabel(/Reason/).fill('One more day');
    await dlg.getByRole('button', { name: 'Submit request' }).click();
    await expect(dlg.getByText(/overlap a request you already made/)).toBeVisible();
    await dlg.getByRole('button', { name: 'Cancel' }).click();

    await reqs.getByRole('button', { name: /Cancel the Casual Leave request/ }).click();
    await expect(page.getByTestId('leave-requests')).toHaveCount(0);
    // nothing reached the data store
    expect(Object.keys(await readDb(page))).not.toContain('leaveRequests');
  });
});

// ═════════════════════════════ viewing aid ═════════════════════════════
// Writes screenshots to /tmp/hrms-shots for looking at the layout. Off unless HRMS_SHOTS=1.
test.describe('screenshots', () => {
  test.skip(!process.env.HRMS_SHOTS, 'set HRMS_SHOTS=1 to write screenshots');
  test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  // The dashboard scrolls inside a fixed-height shell, so a full-page capture would stop at the window height. Each page is
  // shot twice: at 1280x900 (what a laptop shows), and in a tall window so the whole page can be looked at.
  const shot = async (page: Page, n: string) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: `/tmp/hrms-shots/payroll-${n}.png` });
    await page.setViewportSize({ width: 1280, height: 2600 });
    await page.screenshot({ path: `/tmp/hrms-shots/payroll-${n}-tall.png` });
    await page.setViewportSize({ width: 1280, height: 900 });
  };

  test('main pages', async ({ page }) => {
    test.setTimeout(420_000);
    await openHrms(page, '/dashboard/hrms/payroll');
    await expect(page.getByTestId('run-scope')).toBeVisible(slow);
    await shot(page, 'hub-runs');
    await openHrms(page, '/dashboard/hrms/payroll?tab=structures');
    await expect(page.getByRole('row').filter({ hasText: 'Office staff' })).toBeVisible(slow);
    await shot(page, 'hub-structures');
    await openHrms(page, '/dashboard/hrms/payroll?tab=adjustments');
    await expect(page.getByTestId('adj-summary')).toBeVisible(slow);
    await shot(page, 'hub-adjustments');
    await openHrms(page, '/dashboard/hrms/payroll?tab=loans');
    await expect(page.getByTestId('loan-summary')).toBeVisible(slow);
    await shot(page, 'hub-loans');
    await openHrms(page, '/dashboard/hrms/payroll?tab=fnf');
    await page.getByRole('button', { name: /Open the settlement of Deepa Pillai/ }).click();
    await expect(page.getByTestId('fnf-net')).toBeVisible(slow);
    await shot(page, 'hub-fnf');

    await openHrms(page, '/dashboard/hrms/payroll/structures/str_field');
    await expect(page.getByTestId('wage-test')).toBeVisible(slow);
    await page.getByLabel(/Annual CTC/).fill('600000');
    await shot(page, 'structure');

    await computeNovRun(page);
    await shot(page, 'run-compute');
    const slip = (await novRun(page)).run.payslips.find((s) => s.employeeId === 'emp_10')!;
    await page.getByRole('button', { name: /Show the lines of Vikram Joshi/ }).click();
    await expect(page.locator(`#detail-${slip.id}`)).toBeVisible();
    await shot(page, 'run-compute-detail');
    await step(page, 'inputs');
    await shot(page, 'run-inputs');
    await step(page, 'checks');
    await shot(page, 'run-checks');
    await step(page, 'review');
    await shot(page, 'run-review');
    await step(page, 'freeze');
    await page.getByRole('button', { name: 'Freeze run' }).click();
    await page.getByRole('dialog', { name: 'Freeze this run?' }).getByRole('button', { name: 'Freeze run' }).click();
    await expect(page.getByTestId('step-pay')).toBeVisible(slow);
    await shot(page, 'run-pay');

    await openHrms(page, '/dashboard/hrms/my');
    await expect(page.getByTestId('my-name')).toBeVisible(slow);
    await shot(page, 'my-hr');
    await page.getByLabel('Employee', { exact: true }).selectOption({ label: 'Arvind Nair (MER-1002)' });
    await expect(page.getByTestId('tax-compare')).toBeVisible();
    await shot(page, 'my-hr-arvind');

    await openHrms(page, '/dashboard/hrms/my');
    await page.getByRole('link', { name: 'Open the payslip for Oct 2026' }).click();
    await expect(page.getByTestId('payslip-paper')).toBeVisible(slow);
    await shot(page, 'payslip');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/hrms-shots/payroll-payslip-mobile.png' });
  });
});

