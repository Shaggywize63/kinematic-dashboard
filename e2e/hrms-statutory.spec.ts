import { test, expect, type Download, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'fs';
import { openHrms } from './hrms-utils';
import { buildBreakup, buildEcr, runTotals } from '../src/lib/hrms/engine';
import { makeSeed, PREVIEW_TODAY } from '../src/lib/hrms/seed';
import { PF } from '../src/lib/hrms/rules';
import { addDays, fmtDate, inr } from '../src/lib/hrms/format';
import {
  buildForm130, derivedStatus, esiRows, form130Employees, regularPayslip, suggestedDues, taxFor, tdsRows,
} from '../src/components/hrms/statutory/builders';
import { REPORTS } from '../src/components/hrms/reports/reportConfig';
import { retentionSentence } from '../src/components/hrms/statutory/privacy/model';

/**
 * Statutory, Reports and Privacy pages of the HRMS preview. The browser starts from the seeded sample data every time,
 * so expected figures are worked out here from the same seed and the engine, not typed in.
 */

const seed = makeSeed();
const OCT_RETAIL = seed.payRuns.find((r) => r.id === 'run_2026-10_ent_retail')!;
const OCT_LOGI = seed.payRuns.find((r) => r.id === 'run_2026-10_ent_logistics')!;
const OCT_RUNS = seed.payRuns.filter((r) => r.month === '2026-10');
const nav = { timeout: 45_000 };

test.setTimeout(150_000);

async function text(dl: Download): Promise<string> { return readFileSync((await dl.path())!, 'utf8'); }
async function tab(page: Page, name: RegExp | string) { await page.getByRole('tab', { name }).click(); }
const group = (page: Page, name: string) => page.locator('.hrms-cal-group').filter({ has: page.getByRole('heading', { name, exact: true }) });

test.describe('statutory: calendar', () => {
  test('status is worked out from the due date; filing moves a task and can be reopened', async ({ page }) => {
    // The stored status of the PF task says "upcoming" and the CLRA one "overdue"; the page derives them again from the date.
    expect(derivedStatus(seed.compliance.find((c) => c.id === 'cmp_clra')!)).toBe('overdue');
    expect(derivedStatus(seed.compliance.find((c) => c.id === 'cmp_tds_oct')!)).toBe('due_soon');
    expect(derivedStatus(seed.compliance.find((c) => c.id === 'cmp_pf_oct')!)).toBe('upcoming');

    await openHrms(page, '/dashboard/hrms/statutory?tab=calendar');
    await expect(group(page, 'Overdue').getByTestId('task-cmp_clra')).toBeVisible(nav);
    await expect(group(page, 'Due soon').getByTestId('task-cmp_tds_oct')).toBeVisible();
    await expect(group(page, 'Upcoming').getByTestId('task-cmp_pf_oct')).toBeVisible();
    await expect(group(page, 'Filed').getByTestId('task-cmp_tds_sep')).toBeVisible();
    await expect(group(page, 'Overdue').getByTestId('task-cmp_clra')).toContainText('days late');

    // Entity filter: the Logistics-only view keeps CLRA and drops the Retail due-soon TDS task.
    await page.getByLabel('Legal entity').selectOption({ label: 'Meridian Logistics LLP' });
    await expect(group(page, 'Overdue').getByTestId('task-cmp_clra')).toBeVisible();
    await expect(page.getByTestId('task-cmp_tds_oct')).toHaveCount(0);
    await expect(group(page, 'Due soon')).toContainText('Nothing falls due in the next 7 days.');
    await page.getByLabel('Legal entity').selectOption('all');
    await page.getByLabel('Law', { exact: true }).selectOption('PF');
    await expect(page.locator('[data-testid^="task-"]')).toHaveCount(seed.compliance.filter((c) => c.law === 'PF').length);
    await page.getByLabel('Law', { exact: true }).selectOption('all');

    // Mark filed validates the reference, then moves the task to Filed with the reference and today's preview date.
    await page.getByRole('button', { name: 'Mark filed: TDS deposit for October, Meridian Retail Pvt Ltd' }).click();
    const dlg = page.getByRole('dialog', { name: 'Mark as filed' });
    await dlg.getByRole('button', { name: 'Save filing' }).click();
    await expect(dlg.getByText('Enter the challan or acknowledgement number.')).toBeVisible();
    await dlg.getByLabel('Reference').fill('x');
    await dlg.getByRole('button', { name: 'Save filing' }).click();
    await expect(dlg.getByText('A reference is at least 4 characters.')).toBeVisible();
    await dlg.getByLabel('Reference').fill('CHL-77001');
    await dlg.getByRole('button', { name: 'Save filing' }).click();
    await expect(dlg).toHaveCount(0);
    const filed = group(page, 'Filed').getByTestId('task-cmp_tds_oct');
    await expect(filed).toContainText('CHL-77001');
    await expect(filed).toContainText('Filed 7 Nov 2026');
    await expect(group(page, 'Due soon')).toContainText('Nothing falls due in the next 7 days.');

    // Reopen asks first, then the date check puts it back under Due soon.
    await page.getByRole('button', { name: 'Reopen TDS deposit for October, Meridian Retail Pvt Ltd' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reopen' }).click();
    await expect(group(page, 'Due soon').getByTestId('task-cmp_tds_oct')).toBeVisible();
  });

  test('suggested dues for next month come from the calendar rules and can be added', async ({ page }) => {
    const sug = suggestedDues(seed);
    expect(sug.month).toBe('2026-12');
    await openHrms(page, '/dashboard/hrms/statutory?tab=calendar');
    await expect(page.locator('[data-testid^="suggestion-"]')).toHaveCount(sug.items.length, nav);
    await expect(page.getByRole('heading', { name: 'Suggested for December 2026' })).toBeVisible();
    const before = await page.locator('[data-testid^="task-"]').count();
    await page.getByRole('button', { name: 'Add to calendar: TDS deposit for November, Meridian Retail Pvt Ltd' }).click();
    await expect(page.getByTestId('suggestion-ent_retail:TDS:')).toContainText('On the calendar');
    await expect(page.locator('[data-testid^="task-"]')).toHaveCount(before + 1);
    await page.getByRole('button', { name: /^Add all to calendar/ }).click();
    await expect(page.locator('[data-testid^="task-"]')).toHaveCount(before + sug.items.length);
    await expect(page.getByRole('button', { name: /^Add all to calendar/ })).toBeDisabled();
  });
});

test.describe('statutory: rules and rates', () => {
  test('tables show the tags, sources and law version; the what-if follows the PF ceiling', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/statutory?tab=rules');
    await expect(page.getByText('not gazette-verified')).toBeVisible(nav);
    await expect(page.getByText('IN-2026.11 (preview)').first()).toBeVisible();
    const pf = page.locator('#rules-pf');
    await expect(pf).toContainText('₹15,000');
    await expect(pf).toContainText('₹25,000');
    await expect(pf).toContainText('PIB, S.O. 5109(E) (as reported)');
    await expect(pf.getByText('Verified', { exact: true })).toBeVisible();
    await expect(pf.getByText('Reported, confirm')).toBeVisible();
    await expect(page.locator('#rules-esi')).toContainText('not notified');
    await expect(page.locator('#rules-hra')).toContainText('Bengaluru');

    // Professional tax by state.
    await expect(page.locator('#rules-pt')).toContainText('Above ₹24,999');
    await page.getByLabel('State', { exact: true }).selectOption('Maharashtra');
    await expect(page.locator('#rules-pt')).toContainText('Women');
    await expect(page.locator('#rules-pt')).toContainText('Up to ₹25,000');
    await page.getByLabel('State', { exact: true }).selectOption('Delhi');
    await expect(page.locator('#rules-pt')).toContainText('No professional tax is modelled for Delhi');

    // TDS tables list both regimes.
    await expect(page.locator('#rules-tds')).toContainText('New regime');
    await expect(page.locator('#rules-tds')).toContainText('Old regime');
    await expect(page.locator('#rules-codes')).toContainText('S.O. 4711(E), 25 Aug 2026 (as reported)');

    // What-if: Harish Reddy (office structure, 15 lakh CTC) is capped by the PF ceiling.
    const harish = seed.employees.find((e) => e.firstName === 'Harish')!;
    const std = seed.structures.find((s) => s.id === harish.structureId)!;
    const at = (asOn: string) => { const b = buildBreakup(std, harish.annualCtc!, { asOn, pfMember: true, pfOnActual: harish.pfOnActualWage }); return Math.round((b.pfWage * PF.employeeRate) / 100); };
    expect(at('2026-09-16')).toBe(1800);
    expect(at('2026-09-17')).toBe(3000);
    await page.getByLabel('Employee for the what-if').selectOption(harish.id);
    await expect(page.getByTestId('pf-emp')).toHaveText(inr(3000));
    await page.getByRole('tab', { name: '₹15,000' }).click();
    await expect(page.getByTestId('pf-emp')).toHaveText(inr(1800));
    await expect(page.getByTestId('pf-wage')).toHaveText(inr(15000));
    const slip = regularPayslip(seed, harish)!;
    await expect(page.getByTestId('whatif-net')).toHaveText(inr(slip.net));
    // A manager contributes on actual wages, so the ceiling changes nothing.
    const mgr = seed.employees.find((e) => e.pfOnActualWage && e.annualCtc)!;
    await page.getByLabel('Employee for the what-if').selectOption(mgr.id);
    await expect(page.locator('#rules-whatif')).toContainText('contributes on actual wages');
  });
});

test.describe('statutory: returns', () => {
  test('ECR counts and blocked rows match the engine and the downloads are the same files', async ({ page }) => {
    const ecr = buildEcr(seed, OCT_RETAIL);
    expect(ecr.blocked.length).toBeGreaterThan(0);
    await openHrms(page, '/dashboard/hrms/statutory?tab=returns');
    await expect(page.getByTestId(`ecr-rows-${OCT_RETAIL.id}`)).toHaveText(String(ecr.rows), nav);
    const blocked = page.getByTestId(`ecr-blocked-${OCT_RETAIL.id}`);
    await expect(blocked).toContainText(`${ecr.blocked.length} ${ecr.blocked.length === 1 ? 'row' : 'rows'} blocked`);
    await expect(blocked).toContainText('Pooja Verma: No UAN');
    await expect(blocked).toContainText('UAN not Aadhaar-seeded');

    const [ecrDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download ECR for Oct 2026, Meridian Retail Pvt Ltd' }).click()]);
    expect(ecrDl.suggestedFilename()).toBe('ECR_DLCPM1234567000_2026-10.txt');
    expect(await text(ecrDl)).toBe(ecr.text);

    expect(esiRows(seed, OCT_LOGI).length).toBeGreaterThan(0);
    const [esiDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download ESI statement for Oct 2026, Meridian Logistics LLP' }).click()]);
    const esiLines = (await text(esiDl)).split('\n');
    expect(esiLines.length).toBe(esiRows(seed, OCT_LOGI).length + 1);
    expect(esiLines[0]).toContain('Employee (0.75%)');

    const [tdsDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download TDS summary for Oct 2026, Meridian Retail Pvt Ltd' }).click()]);
    const tdsLines = (await text(tdsDl)).split('\n').slice(1);
    expect(tdsLines.length).toBe(tdsRows(seed, OCT_RETAIL).length);
    expect(tdsLines.reduce((t, l) => t + Number(l.split(',').pop()), 0)).toBe(runTotals(OCT_RETAIL).tds);

    const [ptDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PT statement for Oct 2026, Meridian Retail Pvt Ltd' }).click()]);
    expect((await text(ptDl)).split('\n')[0]).toBe('State,Employee code,Name,Gender,Gross,Professional tax');
  });

  test('Form 130 shows the year from the paid runs, with TDS by month, tax computation and a Print button', async ({ page }) => {
    const emps = form130Employees(seed, '2026-04');
    const withTds = emps.map((e) => ({ e, tds: seed.payRuns.flatMap((r) => r.payslips).filter((s) => s.employeeId === e.id).reduce((t, s) => t + (s.deductions.find((d) => d.code === 'TDS')?.amount ?? 0), 0) }))
      .sort((a, b) => b.tds - a.tds)[0]!;
    expect(withTds.tds).toBeGreaterThan(0);
    const doc = buildForm130(seed, withTds.e.id, '2026-04')!;

    await openHrms(page, '/dashboard/hrms/statutory?tab=returns');
    await expect(page.getByRole('heading', { name: /Form 130/ }).first()).toBeVisible(nav);
    await page.getByLabel('Employee for Form 130').selectOption(withTds.e.id);
    const paper = page.getByTestId('form130');
    await expect(paper).toContainText('Part A');
    await expect(paper).toContainText('Part B');
    await expect(paper).toContainText(`${withTds.e.firstName} ${withTds.e.lastName}`);
    await expect(page.getByTestId('form130-tds')).toHaveText(inr(withTds.tds));
    // April to August have no run in the sample data and the statement says so instead of hiding them.
    await expect(paper).toContainText('No pay run in the sample data');
    await expect(paper).toContainText('Tax on the annual basis in words');
    await expect(page.getByTestId('form130-balance')).toHaveText(inr(Math.abs(doc.balance)));
    // The regime on file drives the computation.
    expect(['new', 'old']).toContain(doc.regime);

    await page.evaluate(() => { (window as unknown as { __prints: number }).__prints = 0; window.print = () => { (window as unknown as { __prints: number }).__prints++; }; });
    await page.getByRole('button', { name: 'Print Form 130' }).click();
    expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
  });
});

test.describe('statutory: registers', () => {
  test('registers are built from the data and the inspection pack lists the gaps', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/statutory?tab=registers');
    await expect(page.getByTestId('register-muster')).toContainText(`${seed.attendance.length} rows`, nav);

    const [muster] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Generate Muster roll' }).click()]);
    const lines = (await text(muster)).split('\n');
    expect(muster.suggestedFilename()).toMatch(/^muster-roll_all_2026-09_2026-11\.csv$/);
    expect(lines.length).toBe(seed.attendance.length + 1);
    expect(lines[0]).toContain('Loss of pay');
    await expect(page.getByRole('status').filter({ hasText: 'Generated' })).toBeVisible();

    const [wage] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Generate Wage register' }).click()]);
    const wageLines = (await text(wage)).split('\n');
    expect(wageLines.length).toBe(seed.payRuns.reduce((t, r) => t + r.payslips.length, 0) + 1);

    // Pack: November is still open and has no frozen run, so both gaps are named.
    const pack = page.getByTestId('pack-muster');
    await expect(pack).toContainText('Available');
    await expect(pack).toContainText('Nov 2026 is still open');
    await expect(page.getByTestId('pack-wage')).toContainText('no pay run yet');
    await expect(page.getByText('five years', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('as reported', { exact: false }).first()).toBeVisible();

    // Narrowing the scope to one month changes the row count.
    await page.getByLabel('Registers from month').selectOption('2026-10');
    await page.getByLabel('Registers to month').selectOption('2026-10');
    await expect(page.getByTestId('register-muster')).toContainText(`${seed.attendance.filter((a) => a.month === '2026-10').length} rows`);
    await page.getByLabel('Register entity').selectOption('ent_logistics');
    const logisticsIds = new Set(seed.employees.filter((e) => e.entityId === 'ent_logistics').map((e) => e.id));
    await expect(page.getByTestId('register-muster')).toContainText(`${seed.attendance.filter((a) => a.month === '2026-10' && logisticsIds.has(a.employeeId)).length} rows`);

    // Download all gives one zip with a CSV per register that has data, plus a README.
    await page.getByLabel('Register entity').selectOption('all');
    await page.getByLabel('Registers from month').selectOption('2026-09');
    await page.getByLabel('Registers to month').selectOption('2026-11');
    const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download all registers' }).click()]);
    expect(zip.suggestedFilename()).toMatch(/^inspection-pack_all_2026-09_2026-11\.zip$/);
    const bytes = readFileSync((await zip.path())!);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const body = bytes.toString('latin1');
    for (const n of ['muster-roll.csv', 'wage-register.csv', 'overtime-register.csv', 'leave-register.csv', 'README.txt']) expect(body).toContain(n);
  });
});

test.describe('statutory: tax', () => {
  test('regime and declaration status, and a regime comparison that matches the engine', async ({ page }) => {
    const people = seed.employees.filter((e) => e.status !== 'exited');
    const arvind = seed.employees.find((e) => e.firstName === 'Arvind')!;
    const slip = regularPayslip(seed, arvind)!;
    const gross = slip.wages.taxableMonthly * 12;
    const newTax = taxFor(seed, arvind, slip, 'new', gross).total;
    const oldTax = taxFor(seed, arvind, slip, 'old', gross).total;
    expect(newTax).not.toBe(oldTax);

    await openHrms(page, '/dashboard/hrms/statutory?tab=tax');
    await expect(page.getByText(`${people.length} of ${people.length} employees`)).toBeVisible(nav);
    await page.getByLabel('Employee for regime comparison').selectOption(arvind.id);
    await expect(page.getByTestId('cmp-new-tot')).toHaveText(inr(newTax));
    await expect(page.getByTestId('cmp-old-tot')).toHaveText(inr(oldTax));
    await expect(page.getByTestId('cmp-result')).toContainText(newTax < oldTax ? 'new regime' : 'old regime');
    await expect(page.getByTestId('cmp-result')).toContainText(inr(Math.abs(newTax - oldTax)));

    // Filters narrow the table.
    await page.getByLabel('Filter by regime').selectOption('old');
    const oldCount = people.filter((e) => e.taxRegime === 'old').length;
    await expect(page.getByText(`${oldCount} of ${people.length} employees`)).toBeVisible();
    await page.getByLabel('Filter by declaration status').selectOption('not_submitted');
    await expect(page.getByText('No employee matches these filters.')).toBeVisible();
    await page.getByLabel('Filter by regime').selectOption('all');
    await page.getByLabel('Search by name or code').fill('Pooja');
    await expect(page.getByRole('button', { name: 'Compare regimes for Pooja Verma' })).toBeVisible();
    // The row button drives the comparison above.
    await page.getByRole('button', { name: 'Compare regimes for Pooja Verma' }).click();
    await expect(page.getByLabel('Employee for regime comparison')).toHaveValue(seed.employees.find((e) => e.firstName === 'Pooja')!.id);
  });
});

test.describe('reports', () => {
  test('the hub groups every report and links to it', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/reports');
    for (const g of ['Headcount and people', 'Payroll', 'Statutory', 'Attendance and leave']) await expect(page.getByRole('heading', { name: g, exact: true })).toBeVisible(nav);
    await expect(page.locator('[data-testid^="report-card-"]')).toHaveCount(REPORTS.length);
    expect(REPORTS.length).toBe(18);
    await page.getByLabel('Search reports').fill('PF');
    await expect(page.getByTestId('report-card-pf-statement')).toBeVisible();
    await expect(page.getByTestId('report-card-bank-advice')).toHaveCount(0);
    await page.getByLabel('Search reports').fill('zzzz');
    await expect(page.getByText('No report matches')).toBeVisible();
    await page.getByLabel('Search reports').fill('salary');
    await page.getByTestId('report-card-salary-register').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Salary register' })).toBeVisible(nav);
  });

  test('salary register totals equal the payslips; filters, sorting and CSV export work', async ({ page }) => {
    const slips = (runs: typeof OCT_RUNS) => runs.flatMap((r) => r.payslips);
    const netAll = slips(OCT_RUNS).reduce((t, s) => t + s.net, 0);
    await openHrms(page, '/dashboard/hrms/reports/salary-register');
    const totals = page.getByTestId('report-totals');
    await expect(page.getByTestId('report-count')).toContainText(`Oct 2026 · ${slips(OCT_RUNS).length} rows`, nav);
    await expect(totals.locator('[data-total="net"]')).toHaveText(inr(netAll));
    await expect(totals.locator('[data-total="gross"]')).toHaveText(inr(slips(OCT_RUNS).reduce((t, s) => t + s.gross, 0)));

    // Entity filter changes the total to that entity's run.
    await page.getByLabel('Legal entity').selectOption('ent_logistics');
    const logi = OCT_RUNS.find((r) => r.entityId === 'ent_logistics')!;
    await expect(totals.locator('[data-total="net"]')).toHaveText(inr(logi.payslips.reduce((t, s) => t + s.net, 0)));
    await expect(page).toHaveURL(/entity=ent_logistics/);
    await page.getByLabel('Legal entity').selectOption('all');

    // Department filter.
    await page.getByLabel('Department').selectOption('dep_sales');
    const salesIds = new Set(seed.employees.filter((e) => e.departmentId === 'dep_sales').map((e) => e.id));
    await expect(totals.locator('[data-total="net"]')).toHaveText(inr(slips(OCT_RUNS).filter((s) => salesIds.has(s.employeeId)).reduce((t, s) => t + s.net, 0)));
    await page.getByLabel('Department').selectOption('all');

    // Sorting by net pay: header is a real button, descending on the second click.
    const header = page.getByRole('columnheader', { name: /Net pay/ });
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    const firstNet = await page.locator('tbody tr').first().locator('td').nth(11).innerText();
    expect(firstNet).toBe(inr(Math.max(...slips(OCT_RUNS).map((s) => s.net))));

    // Export keeps the sort and ends with a totals row.
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    expect(dl.suggestedFilename()).toBe('salary-register_2026-10.csv');
    const lines = (await text(dl)).split('\n');
    expect(lines.length).toBe(slips(OCT_RUNS).length + 2);
    expect(lines[0]).toContain('Net pay');
    expect(lines[lines.length - 1].startsWith('Total')).toBe(true);

    // A month with no run says so.
    await page.getByLabel('Month').selectOption('2026-07');
    await expect(page.getByText('There is no pay run with payslips for Jul 2026')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });

  test('headcount, attrition, bands and the statutory statements add up to the data', async ({ page }) => {
    const inHead = seed.employees.filter((e) => e.status === 'active' || e.status === 'on_notice');
    await openHrms(page, '/dashboard/hrms/reports/headcount-department');
    await expect(page.getByTestId('report-totals').locator('[data-total="headcount"]')).toHaveText(String(inHead.length), nav);
    await expect(page.getByTestId('report-chart')).toBeVisible();
    await page.getByRole('button', { name: 'View as table' }).click();
    await expect(page.getByTestId('report-chart').getByRole('table')).toBeVisible();

    await page.goto('/dashboard/hrms/reports/ctc-bands');
    await expect(page.getByTestId('report-totals').locator('[data-total="employees"]')).toHaveText(String(inHead.filter((e) => (e.annualCtc ?? 0) > 0).length), nav);

    await page.goto('/dashboard/hrms/reports/attrition');
    await expect(page.getByTestId('report-count')).toContainText('12 rows', nav);
    const leavers = seed.employees.filter((e) => e.lastWorkingDate && e.lastWorkingDate >= '2025-11-01' && e.lastWorkingDate <= '2026-10-31').length;
    await expect(page.getByTestId('report-totals').locator('[data-total="leavers"]')).toHaveText(String(leavers));

    await page.goto('/dashboard/hrms/reports/pf-statement');
    const pfEmployee = OCT_RUNS.flatMap((r) => r.payslips).reduce((t, s) => t + (s.deductions.find((d) => d.code === 'PF')?.amount ?? 0), 0);
    await expect(page.getByTestId('report-totals').locator('[data-total="employee"]')).toHaveText(inr(pfEmployee), nav);

    await page.goto('/dashboard/hrms/reports/tds-statement');
    await expect(page.getByTestId('report-totals').locator('[data-total="tds"]')).toHaveText(inr(OCT_RUNS.reduce((t, r) => t + runTotals(r).tds, 0)), nav);
    // PAN is masked on screen.
    await expect(page.locator('tbody tr').first()).not.toContainText(seed.employees[0]!.pan!);

    await page.goto('/dashboard/hrms/reports/attendance-muster');
    await expect(page.getByTestId('report-count')).toContainText(`${seed.attendance.filter((a) => a.month === '2026-10').length} rows`, nav);

    await page.goto('/dashboard/hrms/reports/birthdays-anniversaries');
    await expect(page.getByTestId('report-count')).toContainText('Nov 2026', nav);
    await expect(page.locator('tbody')).not.toContainText(/19(8|9)\d/); // never the year of birth
  });

  test('bank advice masks accounts on screen, and exporting writes the access log', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/reports/bank-advice');
    await expect(page.getByTestId('report-count')).toContainText('Oct 2026', nav);
    const first = await page.locator('tbody tr').first().innerText();
    expect(first).toMatch(/•+\d{4}/);
    const rowCount = Number((await page.getByTestId('report-count').innerText()).match(/(\d+) rows?/)![1]);
    expect(rowCount).toBeGreaterThan(10);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    const csv = (await text(dl)).split('\n');
    expect(csv.length).toBe(rowCount + 2); // header, rows, totals
    expect(csv[1]).toMatch(/,\d{9,18},/); // full account number in the file
    // The access log now has a row for every employee in the file.
    await page.goto('/dashboard/hrms/privacy?tab=access');
    await expect(page.getByTestId('access-count')).toContainText(`${seed.accessLog.length + rowCount} of ${seed.accessLog.length + rowCount} entries`, nav);
    await page.getByLabel('Filter by field').selectOption('Bank account (bank advice export)');
    await expect(page.getByTestId('access-count')).toContainText(`${rowCount} of`);
  });

  test('an unknown report name shows an empty state', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/reports/does-not-exist');
    await expect(page.getByText('There is no report called “does-not-exist”')).toBeVisible(nav);
    await expect(page.getByRole('link', { name: 'Back to reports' })).toBeVisible();
  });
});

test.describe('privacy', () => {
  test('consent ledger: counts, filters, and withdrawing keeps the row', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/privacy?tab=consent');
    await expect(page.getByTestId('ready-consent')).toBeVisible(nav);
    await expect(page.getByText(`${seed.consents.length} of ${seed.consents.length} records`)).toBeVisible();
    await page.getByLabel('Filter by purpose').selectOption('Face match for attendance');
    const face = seed.consents.filter((c) => c.purpose === 'Face match for attendance');
    await expect(page.getByText(`${face.length} of ${seed.consents.length} records`)).toBeVisible();
    await page.getByLabel('Filter by status').selectOption('withdrawn');
    await expect(page.getByText(`${face.filter((c) => c.withdrawnAt).length} of ${seed.consents.length} records`)).toBeVisible();
    await page.getByLabel('Filter by status').selectOption('active');

    const btn = page.getByRole('button', { name: /^Withdraw consent:/ }).first();
    const before = await page.getByRole('button', { name: /^Withdraw consent:/ }).count();
    expect(before).toBe(face.filter((c) => !c.withdrawnAt).length);
    await btn.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: /^Withdraw consent:/ })).toHaveCount(before);
    await btn.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Withdraw consent' }).click();
    await expect(page.getByRole('button', { name: /^Withdraw consent:/ })).toHaveCount(before - 1);
    await page.getByLabel('Filter by status').selectOption('withdrawn');
    await expect(page.getByText(`${face.filter((c) => c.withdrawnAt).length + 1} of ${seed.consents.length} records`)).toBeVisible();
    await expect(page.locator('tbody').getByText('Withdrawn 7 Nov 2026')).toHaveCount(1);
  });

  test('access log: filters and CSV export', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/privacy?tab=access');
    await expect(page.getByTestId('access-count')).toContainText(`${seed.accessLog.length} of ${seed.accessLog.length} entries`, nav);
    await expect(page.getByRole('note').filter({ hasText: 'Revealing a sensitive field' })).toBeVisible();
    await page.getByLabel('Filter by field').selectOption('Bank account');
    await expect(page.getByTestId('access-count')).toContainText(`${seed.accessLog.filter((a) => a.field === 'Bank account').length} of`);
    await expect(page.locator('tbody')).toContainText('Fix IFSC before payroll');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByLabel('From date').fill('2026-11-05');
    await expect(page.getByTestId('access-count')).toContainText(`${seed.accessLog.filter((a) => a.at.slice(0, 10) >= '2026-11-05').length} of`);
    await page.getByLabel('To date').fill('2026-11-05');
    await expect(page.getByTestId('access-count')).toContainText(`${seed.accessLog.filter((a) => a.at.slice(0, 10) === '2026-11-05').length} of`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    const lines = (await text(dl)).split('\n');
    expect(dl.suggestedFilename()).toBe('access-log.csv');
    expect(lines.length).toBe(1 + seed.accessLog.filter((a) => a.at.slice(0, 10) === '2026-11-05').length);
    await page.getByLabel('Search person, field or reason').fill('nonexistent-zzz');
    await expect(page.getByText('No access log entries match these filters.')).toBeVisible();
  });

  test('retention: plain-English rule, validation, edit changes the sentence and the purge date', async ({ page }) => {
    const loc = seed.retention.find((r) => r.id === 'rt_3')!;
    expect(retentionSentence(loc)).toBe('After 90 days the location trail is deleted.');
    await openHrms(page, '/dashboard/hrms/privacy?tab=retention');
    await expect(page.getByTestId('retention-sentence-rt_3')).toHaveText('After 90 days the location trail is deleted.', nav);
    await expect(page.getByTestId('retention-sentence-rt_1')).toHaveText('After 8 years the salary registers and payslips are anonymised.');
    await expect(page.getByTestId('retention-rt_3')).toContainText('Next purge, as an illustration');
    // Face templates are counted from the earliest exit in the sample, which is already past: the page says so.
    await expect(page.getByTestId('retention-rt_4')).toContainText('a real run would already have done it');

    await page.getByRole('button', { name: 'Edit retention rule: Location trail' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Keep for (years)').fill('abc');
    await dlg.getByRole('button', { name: 'Save rule' }).click();
    await expect(dlg.getByText('Enter a number.')).toBeVisible();
    await dlg.getByLabel('Keep for (years)').fill('0');
    await dlg.getByRole('button', { name: 'Save rule' }).click();
    await expect(dlg.getByText('It must be more than zero.')).toBeVisible();
    await dlg.getByLabel('Keep for (years)').fill('0.5');
    await dlg.getByLabel('Then').selectOption('anonymise');
    await expect(dlg.getByRole('status')).toHaveText('After 180 days the location trail is anonymised.');
    await dlg.getByRole('button', { name: 'Save rule' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByTestId('retention-sentence-rt_3')).toHaveText('After 180 days the location trail is anonymised.');
    await expect(page.getByTestId('retention-rt_3')).toContainText(fmtDate(addDays(PREVIEW_TODAY, Math.round(0.5 * 365))));
  });

  test('roles matrix is read-only and explains least privilege', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/privacy?tab=roles');
    const m = page.getByTestId('roles-matrix');
    await expect(m).toBeVisible(nav);
    for (const r of ['HR admin', 'Payroll admin', 'Manager', 'Employee']) await expect(m.getByRole('columnheader', { name: r })).toBeVisible();
    for (const c of ['Personal details', 'Statutory IDs', 'Bank details', 'Salary', 'Attendance and leave', 'Location']) await expect(m.getByRole('rowheader', { name: new RegExp(c) })).toBeVisible();
    await expect(page.getByText('Least privilege:')).toBeVisible();
    await expect(page.getByText('Read-only in the preview')).toBeVisible();
    await expect(m.getByRole('button')).toHaveCount(0);
    await expect(m.getByRole('combobox')).toHaveCount(0);
    // Managers have no access to bank details or salary.
    await expect(page.getByTestId('role-bank-2')).toContainText('No access');
    await expect(page.getByTestId('role-salary-2')).toContainText('No access');
  });

  test('requests: 30-day clock, validation, and the status workflow', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/privacy?tab=requests');
    // Sample: access request received 20 Oct has 12 days left; the correction received 5 Oct is 3 days overdue.
    await expect(page.getByTestId('clock-dsr_1')).toContainText('12 days left', nav);
    await expect(page.getByTestId('clock-dsr_2')).toContainText('Overdue by 3 days');

    await page.getByRole('button', { name: 'New request' }).click();
    const dlg = page.getByRole('dialog', { name: 'New data request' });
    await dlg.getByRole('button', { name: 'Log request' }).click();
    await expect(dlg.getByText('Describe the request in at least 10 characters.')).toBeVisible();
    await dlg.getByLabel('Type of request').selectOption('erasure');
    await expect(dlg.getByText('Erasure can be limited where a law requires')).toBeVisible();
    await dlg.getByLabel('Received on').fill('2026-11-07');
    await expect(dlg.getByText('The 30-day clock ends on 7 Dec 2026.')).toBeVisible();
    await dlg.getByLabel('Details').fill('Please delete my face template after I leave.');
    await dlg.getByRole('button', { name: 'Log request' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByText('30 days left')).toBeVisible();

    // Workflow on the new request: received -> in review -> done, which needs a note.
    await page.getByRole('button', { name: /^Start review: Erasure request/ }).click();
    await page.getByRole('button', { name: /^Mark done: Erasure request/ }).click();
    const close = page.getByRole('dialog', { name: 'Mark request as done' });
    await close.getByRole('button', { name: 'Mark done' }).click();
    await expect(close.getByText('Say in a few words what was done.')).toBeVisible();
    await close.getByLabel('What was done').fill('Face template removed from the attendance store.');
    await close.getByRole('button', { name: 'Mark done' }).click();
    await expect(page.getByText('Outcome: Face template removed from the attendance store.')).toBeVisible();

    // Reject needs a reason too, and the request leaves the open count.
    await page.getByRole('button', { name: 'Start review: Correction request from Pooja Verma' }).click();
    await page.getByRole('button', { name: 'Reject: Correction request from Pooja Verma' }).click();
    const rej = page.getByRole('dialog', { name: 'Reject request' });
    await rej.getByRole('button', { name: 'Reject request' }).click();
    await expect(rej.getByText('Give the reason for rejecting it.')).toBeVisible();
    await rej.getByLabel('Reason').fill('Bank record already matches the passbook.');
    await rej.getByRole('button', { name: 'Reject request' }).click();
    await expect(page.getByTestId('clock-dsr_2')).toHaveCount(0);

    // Requests survive a tab switch inside the page.
    await tab(page, /^Roles/);
    await tab(page, /^Requests/);
    await expect(page.getByText('Outcome: Bank record already matches the passbook.')).toBeVisible();
  });

  test('DPDP readiness is honest about what is partly done or not built', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/privacy');
    for (const k of ['notice', 'consent', 'retention', 'erasure', 'breach', 'access']) await expect(page.getByTestId(`ready-${k}`)).toBeVisible(nav);
    await expect(page.getByTestId('ready-breach')).toContainText('Not built');
    await expect(page.getByTestId('ready-notice')).toContainText('Partly');
    await expect(page.getByTestId('ready-access')).toContainText('In place');
    await expect(page.getByText('13 Nov 2026').first()).toBeVisible();
    await expect(page.getByText('13 May 2027').first()).toBeVisible();
    await expect(page.getByText('confirm them', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('in 6 days')).toBeVisible();
    expect(PREVIEW_TODAY).toBe('2026-11-07');
  });
});

test.describe('layout', () => {
  test('screenshots and no horizontal overflow at desktop and phone width', async ({ page }) => {
    mkdirSync('/tmp/hrms-shots', { recursive: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    const shots: [string, string][] = [
      ['/dashboard/hrms/statutory?tab=calendar', 'statutory-calendar'],
      ['/dashboard/hrms/statutory?tab=rules', 'statutory-rules'],
      ['/dashboard/hrms/statutory?tab=returns', 'statutory-returns'],
      ['/dashboard/hrms/statutory?tab=registers', 'statutory-registers'],
      ['/dashboard/hrms/statutory?tab=tax', 'statutory-tax'],
      ['/dashboard/hrms/reports', 'reports-hub'],
      ['/dashboard/hrms/reports/payroll-cost-department', 'reports-payroll-cost'],
      ['/dashboard/hrms/reports/attrition', 'reports-attrition'],
      ['/dashboard/hrms/privacy?tab=consent', 'privacy-consent'],
      ['/dashboard/hrms/privacy?tab=retention', 'privacy-retention'],
      ['/dashboard/hrms/privacy?tab=roles', 'privacy-roles'],
      ['/dashboard/hrms/privacy?tab=requests', 'privacy-requests'],
    ];
    // The dev server compiles each route on first visit and can answer with its own error page meanwhile: reload once.
    const ready = async (url: string) => {
      await page.goto(url);
      try { await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 30_000 }); } catch { await page.reload(); await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 }); }
      await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15_000 });
    };
    await openHrms(page, shots[0]![0]);
    for (const [url, name] of shots) {
      await ready(url);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `/tmp/hrms-shots/${name}.png`, fullPage: false });
      // The dashboard scrolls inside its shell, so a tall viewport is the way to see the whole page.
      await page.setViewportSize({ width: 1280, height: 2300 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `/tmp/hrms-shots/${name}-tall.png`, fullPage: false });
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    // The Form 130 sheet on its own, for an old-regime employee with declarations.
    await ready('/dashboard/hrms/statutory?tab=returns');
    await page.getByLabel('Employee for Form 130').selectOption(seed.employees.find((e) => e.firstName === 'Arvind')!.id);
    await page.getByTestId('form130').scrollIntoViewIfNeeded();
    await page.getByTestId('form130').screenshot({ path: '/tmp/hrms-shots/statutory-form130.png' });
    // Phone width: the page itself must not scroll sideways (tables scroll inside their own box).
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [url, name] of shots) {
      await ready(url);
      await page.waitForTimeout(400);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${name} overflows by ${over}px at 390px`).toBeLessThanOrEqual(1);
      if (name === 'statutory-calendar' || name === 'reports-hub') await page.screenshot({ path: `/tmp/hrms-shots/${name}-phone.png`, fullPage: false });
    }
  });
});
