import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'fs';
import { openHrms } from './hrms-utils';
import { makeSeed, PREVIEW_TODAY } from '../src/lib/hrms/seed';
import { addWorkingDays, runTotals } from '../src/lib/hrms/engine';
import { inr } from '../src/lib/hrms/format';
import type { HrmsDb } from '../src/lib/hrms/types';

/**
 * HR overview and Lifecycle (onboarding, exits, letters) on the seeded sample data.
 * Each test gets a fresh browser context, so the data always starts from the seed. The expected figures are
 * recomputed here from makeSeed() with plain expressions, not by calling the overview's own helpers.
 * "Today" is PREVIEW_TODAY (2026-11-07).
 */

const KEY = 'kinematic_hrms_preview_v3';
const readDb = (page: Page): Promise<HrmsDb> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) as string), KEY);
/** Edit the persisted database, then reload so the in-memory store picks it up. */
async function patchDb(page: Page, patch: { fnf?: { status: 'draft' | 'approved' | 'paid'; employeeId: string; lastWorkingDate: string } | null }): Promise<void> {
  await page.evaluate(({ k, fnf }) => {
    const db = JSON.parse(localStorage.getItem(k) as string);
    if (fnf) {
      db.fnfCases = db.fnfCases.filter((c: { employeeId: string }) => c.employeeId !== fnf.employeeId);
      db.fnfCases.push({ id: `fnf_e2e_${fnf.employeeId}`, noticeDaysServed: 30, leaveEncashDays: 0, otherRecoveries: 0, otherPayments: 0, dueBy: fnf.lastWorkingDate, ...fnf });
    }
    localStorage.setItem(k, JSON.stringify(db));
  }, { k: KEY, fnf: patch.fnf ?? null });
  await page.reload();
  await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
}

/** Fail a test on uncaught page errors (React render errors surface here). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });
test.describe.configure({ timeout: 150_000 });

const seed = makeSeed();
const live = seed.employees.filter((e) => e.status === 'active' || e.status === 'on_notice');
const stat = (page: Page, id: string) => page.getByTestId(`stat-${id}`);
/** A tile reads label, value, hint on separate lines; compare the label and the value exactly. */
async function expectStat(page: Page, id: string, label: string, value: string, hint?: string | RegExp): Promise<void> {
  await expect.poll(async () => {
    const l = (await stat(page, id).innerText()).split('\n').map((x) => x.trim()).filter(Boolean);
    return [l[0]?.toLowerCase(), l[1]];
  }).toEqual([label.toLowerCase(), value]);
  if (hint) await expect(stat(page, id)).toContainText(hint);
}

// ───────────────────────────────────── overview ─────────────────────────────────────
test.describe('overview', () => {
  test('headline numbers match the sample data', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page);
    await expect(page.getByRole('heading', { name: 'HR overview', level: 1 })).toBeVisible();

    const month = PREVIEW_TODAY.slice(0, 7);
    const hc = (on: string) => seed.employees.filter((e) => e.status !== 'onboarding' && e.joinDate <= on && (e.lastWorkingDate ? e.lastWorkingDate >= on : e.status !== 'exited')).length;
    const yearAgo = `${Number(PREVIEW_TODAY.slice(0, 4)) - 1}${PREVIEW_TODAY.slice(4)}`;
    const leavers12 = seed.employees.filter((e) => e.status === 'exited' && e.lastWorkingDate && e.lastWorkingDate > yearAgo).length;
    const attrition = ((leavers12 / ((hc(yearAgo) + hc(PREVIEW_TODAY)) / 2)) * 100).toFixed(1);
    const octCost = seed.payRuns.filter((r) => r.month === '2026-10' && r.type === 'regular').reduce((s, r) => s + runTotals(r).employerCost, 0);
    const openDues = seed.compliance.filter((t) => t.status !== 'filed' && t.dueOn <= '2026-12-07').length;
    const gaps = live.filter((e) => !e.pan || (e.pfMember && (!e.uan || e.uanStatus !== 'aadhaar_seeded')) || (e.payMode === 'bank' && !e.bank)).length;

    expect(live.length).toBe(22);   // guards the test data itself
    await expectStat(page, 'headcount', 'Active headcount', String(live.length), `${seed.employees.filter((e) => e.status === 'active').length} active, 1 on notice`);
    await expectStat(page, 'joiners', 'Joiners this month', String(seed.employees.filter((e) => e.joinDate.startsWith(month)).length), '2 yet to join');
    await expectStat(page, 'leavers', 'Leavers this month', String(seed.employees.filter((e) => e.lastWorkingDate?.startsWith(month)).length), '0 left, 1 still serving');
    await expectStat(page, 'notice', 'On notice', String(seed.employees.filter((e) => e.status === 'on_notice').length));
    await expectStat(page, 'attrition', 'Attrition, 12 months', `${attrition}%`, `${leavers12} leaver`);
    await expectStat(page, 'payroll', 'Monthly payroll cost', inr(octCost), 'Oct 2026');
    await expectStat(page, 'dues', 'Open compliance dues', String(openDues), 'Unfiled, due within 30 days: 1 overdue, 1 due within 7 days');
    await expectStat(page, 'gaps', 'Employees with data gaps', String(gaps));
    expect(errors).toEqual([]);
  });

  test('headcount bars, trend chart, compliance calendar and people dates come from the data', async ({ page }) => {
    await openHrms(page);

    // headcount by department: each row's count equals the seed
    const deptCard = page.getByRole('region', { name: 'Headcount by department' });
    for (const d of seed.departments) {
      const n = live.filter((e) => e.departmentId === d.id).length;
      if (n) await expect(deptCard.getByRole('listitem').filter({ hasText: d.name })).toContainText(String(n));
    }
    await expect(page.getByRole('heading', { name: 'Headcount by location' })).toBeVisible();

    // six-month trend: a stacked chart is drawn, and the table view shows only Sep and Oct with runs
    await expect(page.locator('[role="img"][aria-label^="Stacked column chart"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
    await page.getByRole('button', { name: 'View as table' }).click();
    const sep = seed.payRuns.filter((r) => r.month === '2026-09').reduce((s, r) => s + runTotals(r).employerCost, 0);
    await expect(page.getByRole('row', { name: /Sep 2026/ })).toContainText(inr(sep));
    await expect(page.getByRole('row', { name: /Nov 2026/ })).toContainText('No run yet');
    await expect(page.getByRole('row')).toHaveCount(7);   // header + six months

    // compliance mini-calendar: five rows, status computed from the due date against 7 Nov 2026
    const cal = page.getByRole('region', { name: 'Next compliance dues' });
    await expect(cal.getByRole('listitem')).toHaveCount(5);
    await expect(cal.getByRole('listitem').filter({ hasText: 'CLRA licence renewal' })).toContainText('Overdue');
    await expect(cal.getByRole('listitem').filter({ hasText: 'TDS deposit for October' })).toContainText('Due soon');
    await expect(cal.getByRole('listitem').filter({ hasText: 'PF contribution and ECR for October' }).first()).toContainText('Upcoming');

    // birthdays and anniversaries in the next 30 days
    const events = page.getByRole('region', { name: 'Birthdays and anniversaries' });
    await expect(events.getByRole('listitem').filter({ hasText: 'Rekha More' })).toContainText('Birthday');          // 11 Nov
    await expect(events.getByRole('listitem').filter({ hasText: 'Karthik Subramanian' })).toContainText('4 years');  // 14 Nov, joined 2022
    await expect(events.getByRole('listitem').filter({ hasText: 'Arvind Nair' })).toHaveCount(0);                    // his birthday was 2 Nov
  });

  test('needs-attention items link to the exact page and tab', async ({ page }) => {
    await openHrms(page);
    const list = page.locator('#needs-attention');
    await list.getByRole('button', { name: /Show all 12/ }).click();

    const link = (name: RegExp) => list.getByRole('link', { name });
    await expect(link(/Rekha More: PAN missing/)).toHaveAttribute('href', '/dashboard/hrms/employees/emp_14?tab=statutory');
    await expect(link(/Pooja Verma: UAN missing/)).toHaveAttribute('href', '/dashboard/hrms/employees/emp_7?tab=statutory');
    await expect(link(/Sana Qureshi: UAN not Aadhaar-seeded, bank account missing/)).toHaveAttribute('href', '/dashboard/hrms/employees/emp_9?tab=statutory');
    await expect(link(/CLRA licence \(Maharashtra\) expired 30 Apr 2026/)).toHaveAttribute('href', '/dashboard/hrms/organization');
    await expect(link(/Shops and Establishments registration \(Delhi\) expires 31 Dec 2026/)).toHaveAttribute('href', '/dashboard/hrms/organization');
    await expect(link(/CLRA licence renewal, Maharashtra/)).toHaveAttribute('href', '/dashboard/hrms/statutory');
    await expect(link(/TDS deposit for October/)).toHaveAttribute('href', '/dashboard/hrms/statutory');
    await expect(link(/Nov 2026 payroll not started for Meridian Retail/)).toHaveAttribute('href', '/dashboard/hrms/payroll');
    await expect(link(/Meenal Shah: fixed-term contract ends 23 Nov 2026/)).toHaveAttribute('href', '/dashboard/hrms/employees/emp_21?tab=employment');
    await expect(link(/Aditya Bhat: 5 of 7 joining tasks open/)).toHaveAttribute('href', '/dashboard/hrms/lifecycle?tab=onboarding');
    // nobody is in probation (everyone was confirmed 180 days after joining) and nobody is flagged twice
    await expect(list.getByRole('link', { name: /probation ends/ })).toHaveCount(0);

    // follow one: the exit item lands on the Exits tab with the case on the board
    await link(/Yash Rathore: 3 of 4 clearances pending/).click();
    await page.waitForURL('**/dashboard/hrms/lifecycle?tab=exits');
    await expect(page.getByRole('tab', { name: /^Exits/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('region', { name: /^Notice, 1 case/ })).toContainText('Yash Rathore');
  });

  test('the urgent filter keeps only red items', async ({ page }) => {
    await openHrms(page);
    const list = page.locator('#needs-attention');
    await list.getByRole('tab', { name: /^Urgent/ }).click();
    const links = list.getByRole('link');
    expect(await links.count()).toBeGreaterThan(0);
    for (const t of await links.allInnerTexts()) expect(t).toContain('Urgent');
  });

  test('starting the payroll run from the card creates a draft and moves the next action on', async ({ page }) => {
    await openHrms(page);
    const card = page.getByTestId('payroll-ent_retail');
    await expect(card).toContainText('Meridian Retail');
    await expect(card).toContainText('Not started');
    await card.getByRole('button', { name: 'Start run' }).click();
    await expect(card).toContainText('Draft');
    await expect(card.getByRole('link', { name: 'Compute payroll' })).toHaveAttribute('href', '/dashboard/hrms/payroll?month=2026-11&entity=ent_retail');
    await expect(page.getByTestId('payroll-ent_logistics')).toContainText('Not started');
    const db = await readDb(page);
    expect(db.payRuns.filter((r) => r.month === '2026-11' && r.entityId === 'ent_retail' && r.status === 'draft')).toHaveLength(1);
    // the earlier "not started" item is replaced by a "not closed" one for that entity
    await page.locator('#needs-attention').getByRole('button', { name: /Show all/ }).click();
    await expect(page.locator('#needs-attention').getByRole('link', { name: /Nov 2026 payroll for Meridian Retail Pvt Ltd is draft, not closed/ })).toBeVisible();
  });

  test('quick actions point at the right places', async ({ page }) => {
    await openHrms(page);
    await expect(page.getByRole('link', { name: 'Add employee' })).toHaveAttribute('href', '/dashboard/hrms/employees/new');
    await expect(page.getByRole('link', { name: 'Start payroll run' })).toHaveAttribute('href', '/dashboard/hrms/payroll');
    await page.getByRole('link', { name: 'Generate letter' }).click();
    await page.waitForURL('**/dashboard/hrms/lifecycle?tab=letters');   // the one-shot flag is consumed
    await expect(page.getByRole('dialog', { name: 'Generate letter' })).toBeVisible();
  });
});

// ───────────────────────────────────── onboarding ─────────────────────────────────────
test.describe('onboarding', () => {
  test('the board shows each joiner in the stage the data says', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/lifecycle?tab=onboarding');
    await expect(page.getByRole('tab', { name: /^Onboarding/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('region', { name: /^Registration, 1 case/ })).toContainText('Aditya Bhat');
    await expect(page.getByRole('region', { name: /^Documents, 1 case/ })).toContainText('Shreya Banerjee');
    await expect(page.getByRole('region', { name: /^Offer, 0 cases/ })).toContainText('No one here');
    const card = page.getByRole('button', { name: /Aditya Bhat/ });
    await expect(card).toContainText('Software Engineer');
    await expect(card).toContainText('16 Nov 2026');
    await expect(card).toContainText('Joins in 9 days');
    await expect(card).toContainText('2 of 7 tasks');
    // search narrows the board
    await page.getByRole('searchbox', { name: /Search joiners/ }).fill('shreya');
    await expect(page.getByRole('button', { name: /Aditya Bhat/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Shreya Banerjee/ })).toBeVisible();
    await page.getByRole('searchbox', { name: /Search joiners/ }).fill('zzz');
    await expect(page.getByText('No joiner matches')).toBeVisible();
  });

  test('toggle and add checklist tasks, then mark the joiner as joined and see the employee become active', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, '/dashboard/hrms/lifecycle?tab=onboarding');
    await page.getByRole('button', { name: /Aditya Bhat/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Onboarding: Aditya Bhat' });
    await expect(dlg).toContainText('2 of 7 done');
    await expect(dlg.getByRole('link', { name: 'Open employee profile' })).toHaveAttribute('href', '/dashboard/hrms/employees/emp_24');

    // toggle
    await dlg.getByRole('checkbox', { name: 'Upload PAN, Aadhaar, bank proof' }).check();
    await expect(dlg).toContainText('3 of 7 done');

    // add: the empty task is rejected with a field error, a good one is added with owner and due date
    await dlg.getByRole('button', { name: 'Add task' }).click();
    await expect(dlg.getByText('Describe the task in a few words')).toBeVisible();
    await dlg.getByLabel('Task', { exact: true }).fill('Collect address proof');
    await dlg.getByLabel('Owner').selectOption('Finance');
    await dlg.getByLabel('Due date').fill('2026-11-12');
    await dlg.getByRole('button', { name: 'Add task' }).click();
    await expect(dlg).toContainText('3 of 8 done');
    const added = dlg.getByRole('listitem').filter({ hasText: 'Collect address proof' });
    await expect(added).toContainText('Finance');
    await expect(added).toContainText('Due 12 Nov 2026');
    // a duplicate is rejected
    await dlg.getByLabel('Task', { exact: true }).fill('collect address proof');
    await dlg.getByRole('button', { name: 'Add task' }).click();
    await expect(dlg.getByText('This task is already on the list')).toBeVisible();

    // remove asks first
    await dlg.getByRole('button', { name: 'Remove task: Collect address proof' }).click();
    await page.getByRole('dialog', { name: 'Remove task' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(added).toHaveCount(1);
    await dlg.getByRole('button', { name: 'Remove task: Collect address proof' }).click();
    await page.getByRole('dialog', { name: 'Remove task' }).getByRole('button', { name: 'Remove' }).click();
    await expect(dlg).toContainText('3 of 7 done');

    // stage can be moved by hand; Done is only reachable through Mark as joined
    await dlg.getByLabel('Stage').selectOption('assets');
    expect((await readDb(page)).onboarding.find((c) => c.id === 'onb_1')!.stage).toBe('assets');
    await expect(dlg.getByLabel('Stage').locator('option[value="done"]')).toBeDisabled();

    // mark as joined
    await dlg.getByRole('button', { name: 'Mark as joined' }).click();
    const confirm = page.getByRole('dialog', { name: 'Confirm joining' });
    await expect(confirm).toContainText('4 tasks are still open');
    await expect(confirm).toContainText('16 Nov 2026');
    await confirm.getByRole('button', { name: 'Mark as joined' }).click();
    await expect(dlg).toHaveCount(0);

    await expect(page.getByRole('region', { name: /^Done, 1 case/ })).toContainText('Aditya Bhat');
    await expect(page.getByRole('region', { name: /^Registration, 0 cases/ })).toBeVisible();
    const db = await readDb(page);
    expect(db.employees.find((e) => e.id === 'emp_24')!.status).toBe('active');
    expect(db.employees.find((e) => e.id === 'emp_24')!.history[0]).toMatchObject({ field: 'Status', from: 'onboarding', to: 'active' });
    expect(db.onboarding.find((c) => c.id === 'onb_1')!.stage).toBe('done');

    // the overview sees it: headcount 23, and the new employee's missing PAN and bank show up
    await page.goto('/dashboard/hrms');
    await expectStat(page, 'headcount', 'Active headcount', '23');
    await page.locator('#needs-attention').getByRole('button', { name: /Show all/ }).click();
    await expect(page.locator('#needs-attention').getByRole('link', { name: /Aditya Bhat: PAN missing, bank account missing/ })).toHaveAttribute('href', '/dashboard/hrms/employees/emp_24?tab=statutory');
    await expect(page.locator('#needs-attention').getByRole('link', { name: /Aditya Bhat: \d+ of \d+ joining tasks open/ })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('new joiner: field errors, then a draft employee with the standard checklist', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/lifecycle?tab=onboarding');
    await page.getByRole('button', { name: 'New joiner' }).click();
    const dlg = page.getByRole('dialog', { name: 'New joiner' });
    await dlg.getByRole('button', { name: 'Create joiner' }).click();
    for (const msg of ['First name is required', 'Last name is required', 'Choose a gender', 'Date of birth is required', 'Email is required', 'Mobile number is required', 'Choose a designation', 'Choose a department']) {
      await expect(dlg.getByText(msg)).toBeVisible();
    }
    await expect(dlg.getByLabel('First name')).toBeFocused();
    expect((await readDb(page)).employees).toHaveLength(25);   // nothing was created

    await dlg.getByLabel('First name').fill('Tara');
    await dlg.getByLabel('Last name').fill('Kulkarni');
    await dlg.getByLabel('Gender').selectOption('female');
    await dlg.getByLabel('Date of birth').fill('1998-04-12');
    await dlg.getByLabel('Work email').fill('ritu.malhotra@meridian.example');
    await dlg.getByLabel('Mobile').fill('12345');
    await dlg.getByLabel('Designation').selectOption({ label: 'Accounts Executive (E2)' });
    await dlg.getByLabel('Department').selectOption({ label: 'Finance' });
    await dlg.getByRole('button', { name: 'Create joiner' }).click();
    await expect(dlg.getByText('An employee with this email already exists')).toBeVisible();
    await expect(dlg.getByText('Mobile is 10 digits starting 6 to 9')).toBeVisible();
    await dlg.getByLabel('Work email').fill('tara.kulkarni@meridian.example');
    await dlg.getByLabel('Mobile').fill('+91 98765 43210');
    await dlg.getByLabel('Annual CTC').fill('840000');
    await dlg.getByLabel('Employment type').selectOption('fixed_term');
    await dlg.getByRole('button', { name: 'Create joiner' }).click();
    await expect(dlg.getByText('Contract end date is required for this type')).toBeVisible();
    await dlg.getByLabel('Contract end date').fill('2027-11-20');
    await dlg.getByRole('button', { name: 'Create joiner' }).click();
    await expect(dlg).toHaveCount(0);

    const card = page.getByRole('region', { name: /^Offer, 1 case/ }).getByRole('button', { name: /Tara Kulkarni/ });
    await expect(card).toContainText('Accounts Executive');
    await expect(card).toContainText('0 of 8 tasks');
    const db = await readDb(page);
    const emp = db.employees.find((e) => e.firstName === 'Tara')!;
    expect(emp).toMatchObject({ status: 'onboarding', code: 'MER-1026', entityId: 'ent_retail', mobile: '9876543210', employmentType: 'fixed_term', annualCtc: 840000, gender: 'female' });
    const c = db.onboarding.find((x) => x.employeeId === emp.id)!;
    expect(c.tasks.map((t) => t.label)).toEqual([
      'Offer accepted and e-signed', 'Documents uploaded (PAN, Aadhaar, bank proof)', 'Previous employer UAN and relieving letter', 'Generate UAN or link existing',
      'ESIC registration (if applicable)', 'Bank account verification', 'Laptop and access', 'Induction schedule',
    ]);
    expect(c.tasks.every((t) => t.dueOn && t.dueOn >= PREVIEW_TODAY)).toBe(true);
  });
});

// ───────────────────────────────────── exits ─────────────────────────────────────
test.describe('exits', () => {
  test('start exit: last working date follows the notice period unless notice is waived', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/lifecycle?tab=exits');
    await expect(page.getByRole('region', { name: /^Notice, 1 case/ })).toContainText('Yash Rathore');
    await page.getByRole('button', { name: 'Start exit' }).click();
    const dlg = page.getByRole('dialog', { name: 'Start exit' });
    const employee = dlg.getByRole('combobox', { name: /^Employee/ });
    await dlg.getByRole('button', { name: 'Start exit' }).click();
    await expect(dlg.getByText('Choose an employee', { exact: true })).toBeVisible();
    await expect(employee).toBeFocused();
    // Yash already has an open exit and is not offered; Ritu (manager grade) has a 90-day notice
    await expect(employee.locator('option', { hasText: 'Yash Rathore' })).toHaveCount(0);
    await employee.selectOption({ label: 'Ritu Malhotra (MER-1001)' });
    await expect(dlg.getByLabel('Last working date')).toHaveValue('2027-02-05');      // 7 Nov 2026 + 90 days
    await dlg.getByLabel('Resignation date').fill('2026-11-10');
    await expect(dlg.getByLabel('Last working date')).toHaveValue('2027-02-08');
    await dlg.getByRole('checkbox', { name: /Notice is waived/ }).check();
    await expect(dlg.getByLabel('Last working date')).toHaveValue('2026-11-10');
    await dlg.getByRole('checkbox', { name: /Notice is waived/ }).uncheck();
    await dlg.getByLabel('Last working date').fill('2026-12-31');                      // shortened by hand
    await expect(dlg.getByRole('status')).toContainText('short of the 90-day notice');
    await dlg.getByLabel('Resignation date').fill('2016-01-01');
    await dlg.getByRole('button', { name: 'Start exit' }).click();
    await expect(dlg.getByText(/This is before the join date, 10 Apr 2017/)).toBeVisible();
    await dlg.getByLabel('Resignation date').fill('2026-11-10');
    await dlg.getByLabel('Last working date').fill('2026-12-31');
    await dlg.getByLabel('Reason').selectOption('retirement');
    await dlg.getByRole('button', { name: 'Start exit' }).click();
    await expect(dlg).toHaveCount(0);

    await expect(page.getByRole('region', { name: /^Notice, 2 cases/ })).toContainText('Ritu Malhotra');
    const db = await readDb(page);
    const ritu = db.employees.find((e) => e.id === 'emp_1')!;
    expect(ritu).toMatchObject({ status: 'on_notice', lastWorkingDate: '2026-12-31' });
    const ex = db.exits.find((x) => x.employeeId === 'emp_1')!;
    expect(ex).toMatchObject({ reason: 'retirement', resignationDate: '2026-11-10', lastWorkingDate: '2026-12-31', noticeWaived: false, stage: 'notice' });
    expect(ex.clearance.map((c) => c.department)).toEqual(['Reporting manager', 'IT', 'Finance', 'HR']);
    // and the overview now counts two people on notice
    await page.goto('/dashboard/hrms');
    await expectStat(page, 'notice', 'On notice', '2');
  });

  test('case detail: notice calculator and the settlement clock', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/lifecycle?tab=exits');
    await page.getByRole('button', { name: /Yash Rathore/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Exit: Yash Rathore' });
    const notice = dlg.getByRole('region', { name: 'Notice period' });
    // resigned 30 Oct, last day 30 Nov, notice 30 days; 8 days served by 7 Nov, 23 left
    await expect(notice).toContainText('30 days');
    await expect(notice).toContainText('31 days');
    await expect(notice).toContainText('Served as of 7 Nov 2026');
    await expect(notice).toContainText('8 days');
    await expect(notice).toContainText('23 days');
    await expect(notice.getByText('0 days', { exact: true })).toBeVisible();   // shortfall
    // bringing the last day forward creates a shortfall
    await dlg.getByLabel('Last working date').fill('2026-11-20');
    await expect(notice).toContainText('Shortfall');
    await expect(notice.getByText('9 days', { exact: true })).toBeVisible();   // 30 required, 21 planned
    expect((await readDb(page)).employees.find((e) => e.id === 'emp_22')!.lastWorkingDate).toBe('2026-11-20');
    await dlg.getByLabel('Last working date').fill('2026-11-30');
    await dlg.getByRole('checkbox', { name: 'Notice is waived' }).check();
    await expect(notice).toContainText('Waived (0 days)');
    await dlg.getByRole('checkbox', { name: 'Notice is waived' }).uncheck();

    // settlement: two working days after Monday 30 Nov is Wednesday 2 Dec
    const fnf = dlg.getByRole('region', { name: 'Full and final settlement' });
    expect(addWorkingDays('2026-11-30', 2)).toBe('2026-12-02');
    await expect(fnf.getByTestId('fnf-due')).toHaveText('2 Dec 2026');
    await expect(fnf).toContainText('Not started');
    await expect(fnf).toContainText('Due in 25 days');
    await expect(fnf.getByRole('link', { name: 'Create the settlement in payroll' })).toHaveAttribute('href', '/dashboard/hrms/payroll?tab=fnf&employee=emp_22');

    // clearance fields: owner and remarks save on blur
    await dlg.getByLabel('Remarks for IT').fill('Laptop wiped');
    await dlg.getByLabel('Remarks for IT').blur();
    await dlg.getByLabel('Owner for Finance').fill('Lakshmi Iyer');
    await dlg.getByLabel('Owner for Finance').press('Enter');
    const ex = (await readDb(page)).exits.find((x) => x.id === 'exit_1')!;
    expect(ex.clearance.find((c) => c.department === 'IT')!.remarks).toBe('Laptop wiped');
    expect(ex.clearance.find((c) => c.department === 'Finance')!.owner).toBe('Lakshmi Iyer');
    // assets: add, return, remove (with confirm)
    await dlg.getByLabel('New asset').fill('Laptop');
    await dlg.getByRole('button', { name: 'Add asset' }).click();
    await expect(dlg).toContainText('0 of 3 returned');
    await dlg.getByRole('checkbox', { name: 'Laptop' }).check();
    await expect(dlg).toContainText('1 of 3 returned');
    await dlg.getByRole('button', { name: 'Remove asset: Laptop' }).click();
    await page.getByRole('dialog', { name: 'Remove asset' }).getByRole('button', { name: 'Remove' }).click();
    await expect(dlg).toContainText('0 of 2 returned');
    // a clearance department can be added; duplicates are refused
    await dlg.getByLabel('New clearance department').fill('Admin');
    await dlg.getByRole('button', { name: 'Add department' }).click();
    await expect(dlg).toContainText('1 of 5 done');
    await dlg.getByLabel('New clearance department').fill('admin');
    await dlg.getByRole('button', { name: 'Add department' }).click();
    await expect(dlg.getByText('This department is already on the list')).toBeVisible();
  });

  test('closing an exit is blocked until clearance is done and the F&F case is paid, then allowed', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, '/dashboard/hrms/lifecycle?tab=exits');
    await page.getByRole('button', { name: /Yash Rathore/ }).click();
    let dlg = page.getByRole('dialog', { name: 'Exit: Yash Rathore' });
    const checks = dlg.getByTestId('close-checks');
    const closeBtn = dlg.getByRole('button', { name: 'Close exit' });

    // blocked twice over: three clearances pending, no F&F case
    await expect(closeBtn).toBeDisabled();
    await expect(checks).toContainText('3 of 4 clearances still pending: IT, Finance, HR.');
    await expect(checks).toContainText('No full and final case exists yet');
    await expect(checks.getByText('Blocking')).toHaveCount(2);

    // finish the clearance: one block left
    for (const d of ['IT', 'Finance', 'HR']) await dlg.getByRole('checkbox', { name: d, exact: true }).check();
    await expect(checks).toContainText('All 4 clearances are done.');
    await expect(checks.getByText('Blocking')).toHaveCount(1);
    await expect(closeBtn).toBeDisabled();

    // an unpaid F&F case still blocks, and the message names its status
    await patchDb(page, { fnf: { status: 'draft', employeeId: 'emp_22', lastWorkingDate: '2026-11-30' } });
    await page.getByRole('button', { name: /Yash Rathore/ }).click();
    dlg = page.getByRole('dialog', { name: 'Exit: Yash Rathore' });
    await expect(dlg.getByTestId('close-checks')).toContainText('The full and final case is draft, and it must be paid before the exit can close.');
    await expect(dlg.getByRole('button', { name: 'Close exit' })).toBeDisabled();
    await expect(dlg.getByRole('region', { name: 'Full and final settlement' })).toContainText('Draft');
    await expect(dlg.getByRole('region', { name: 'Full and final settlement' }).getByRole('link', { name: 'Open the settlement in payroll' })).toBeVisible();

    // paid: now it can be closed, after a confirmation
    await patchDb(page, { fnf: { status: 'paid', employeeId: 'emp_22', lastWorkingDate: '2026-11-30' } });
    await page.getByRole('button', { name: /Yash Rathore/ }).click();
    dlg = page.getByRole('dialog', { name: 'Exit: Yash Rathore' });
    await expect(dlg.getByTestId('close-checks').getByText('Blocking')).toHaveCount(0);
    await expect(dlg.getByRole('region', { name: 'Full and final settlement' })).toContainText('Settled');
    await dlg.getByRole('button', { name: 'Close exit' }).click();
    const confirm = page.getByRole('dialog', { name: 'Close exit', exact: true }).last();
    await expect(confirm).toContainText('30 Nov 2026');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    expect((await readDb(page)).employees.find((e) => e.id === 'emp_22')!.status).toBe('on_notice');
    await dlg.getByRole('button', { name: 'Close exit' }).click();
    await page.getByRole('dialog', { name: 'Close exit', exact: true }).last().getByRole('button', { name: 'Close exit' }).click();
    await expect(dlg).toHaveCount(0);

    await expect(page.getByRole('region', { name: /^Closed, 1 case/ })).toContainText('Yash Rathore');
    await expect(page.getByRole('region', { name: /^Notice, 0 cases/ })).toBeVisible();
    const db = await readDb(page);
    expect(db.employees.find((e) => e.id === 'emp_22')).toMatchObject({ status: 'exited', lastWorkingDate: '2026-11-30' });
    expect(db.exits.find((x) => x.id === 'exit_1')!.stage).toBe('closed');

    // headcount drops by one and the exit's attention items are gone
    await page.goto('/dashboard/hrms');
    await expectStat(page, 'headcount', 'Active headcount', '21');
    await expectStat(page, 'notice', 'On notice', '0');
    await page.locator('#needs-attention').getByRole('button', { name: /Show all/ }).click();
    await expect(page.locator('#needs-attention').getByRole('link', { name: /Yash Rathore/ })).toHaveCount(0);

    // a closed exit can be reopened
    await page.goto('/dashboard/hrms/lifecycle?tab=exits');
    await page.getByRole('button', { name: /Yash Rathore/ }).click();
    dlg = page.getByRole('dialog', { name: 'Exit: Yash Rathore' });
    await dlg.getByRole('button', { name: 'Reopen exit' }).click();
    await page.getByRole('dialog', { name: 'Reopen exit' }).getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByRole('region', { name: /^Settlement, 1 case/ })).toContainText('Yash Rathore');
    expect((await readDb(page)).employees.find((e) => e.id === 'emp_22')!.status).toBe('on_notice');
    expect(errors).toEqual([]);
  });

  test('stage moves: clearance must be complete before settlement', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/lifecycle?tab=exits');
    await page.getByRole('button', { name: /Yash Rathore/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Exit: Yash Rathore' });
    await dlg.getByRole('button', { name: 'Start clearance' }).click();
    await expect(dlg.getByRole('button', { name: 'Move to settlement' })).toBeDisabled();
    await expect(dlg).toContainText('3 clearances are pending.');
    for (const d of ['IT', 'Finance', 'HR']) await dlg.getByRole('checkbox', { name: d, exact: true }).check();
    await dlg.getByRole('button', { name: 'Move to settlement' }).click();
    expect((await readDb(page)).exits[0]!.stage).toBe('settlement');
    await dlg.getByRole('button', { name: 'Close window' }).click();
    await expect(page.getByRole('region', { name: /^Settlement, 1 case/ })).toContainText('Yash Rathore');
    // the exit filter by reason hides it
    await page.getByLabel('Filter by reason').selectOption('termination');
    await expect(page.getByText('No exit matches these filters.')).toBeVisible();
  });
});

// ───────────────────────────────────── letters ─────────────────────────────────────
test.describe('letters', () => {
  test('every letter type has a template, and the OSH Code note is shown', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/lifecycle?tab=letters');
    await expect(page.getByText('Appointment letters are mandatory under the OSH Code (as reported).')).toBeVisible();
    await expect(page.getByText('Every current employee has an appointment letter on file')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(7);
    await expect(page.getByRole('button', { name: 'Edit Warning letter' })).toBeVisible();
    const db = await readDb(page);
    expect(new Set(db.letterTemplates.map((t) => t.type))).toEqual(new Set(['offer', 'appointment', 'confirmation', 'increment', 'relieving', 'experience', 'warning']));
    expect(db.letterTemplates).toHaveLength(7);
    await page.reload();   // adding the missing template again must not duplicate it
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(7);
    await expect(page.getByText('No letters issued yet')).toBeVisible();
  });

  test('template editor: palette inserts fields at the cursor, preview substitutes an employee, unknown fields are refused', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/lifecycle?tab=letters');
    await page.getByRole('button', { name: 'Edit Increment letter' }).click();
    const dlg = page.getByRole('dialog', { name: 'Edit template: Increment letter' });
    const body = dlg.getByLabel('Letter body');
    await dlg.getByLabel('Preview with employee').selectOption({ label: 'Rohit Chauhan (MER-1004)' });
    const paper = dlg.getByTestId('letter-paper');
    await expect(paper).toContainText('Dear Rohit Chauhan');
    await expect(paper).toContainText('₹9,60,000');
    await expect(paper).toContainText('Meridian Retail Pvt Ltd');
    await expect(paper).toContainText('Ritu Malhotra, Director, People');

    // insert at the cursor: put it right after "Dear "
    await body.focus();
    await body.evaluate((el: HTMLTextAreaElement) => { el.setSelectionRange(5, 5); });
    await dlg.getByRole('button', { name: 'Insert Employee code' }).click();
    await expect(body).toHaveValue(/^Dear \{\{employee_code\}\}\{\{employee_name\}\},/);
    await expect(paper).toContainText('Dear MER-1004Rohit Chauhan');
    await expect(body).toBeFocused();
    // append another at the end of the text
    await body.evaluate((el: HTMLTextAreaElement) => { el.setSelectionRange(el.value.length, el.value.length); });
    await dlg.getByRole('button', { name: 'Insert Notice (days)' }).click();
    await expect(body).toHaveValue(/\{\{signatory\}\}\{\{notice_days\}\}$/);

    // a missing value is highlighted; an unknown field blocks saving
    await dlg.getByLabel('Preview with employee').selectOption({ label: 'Aditya Bhat (MER-1024)' });
    await expect(dlg.getByText('The chosen employee has no data for: Annual CTC')).toBeVisible();
    await expect(paper.locator('mark', { hasText: '{{ctc}}' })).toBeVisible();
    await body.fill('Dear {{employee_name}}, your pay is {{salary}}. A longer line so the body is long enough.');
    await dlg.getByRole('button', { name: 'Save template' }).click();
    await expect(dlg.getByText(/Unknown merge field: \{\{salary\}\}/).first()).toBeVisible();
    await dlg.getByLabel('Template name').fill('');
    await dlg.getByRole('button', { name: 'Save template' }).click();
    await expect(dlg.getByText('Give the template a name')).toBeVisible();

    // restore, tweak, save
    await dlg.getByRole('button', { name: 'Restore default wording for this type' }).click();
    await expect(body).toHaveValue(/revised to \{\{ctc\}\} with effect from \{\{effective_date\}\}/);
    await dlg.getByLabel('Template name').fill('Increment letter v2');
    await body.evaluate((el: HTMLTextAreaElement) => { el.setSelectionRange(el.value.length, el.value.length); });
    await dlg.getByRole('button', { name: 'Insert Company' }).click();
    await dlg.getByRole('button', { name: 'Save template' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit Increment letter v2' })).toBeVisible();
    const saved = (await readDb(page)).letterTemplates.find((t) => t.id === 'lt_inc')!;
    expect(saved.name).toBe('Increment letter v2');
    expect(saved.body.endsWith('{{signatory}}{{company}}')).toBe(true);

    // new template
    await page.getByRole('button', { name: 'New template' }).click();
    const nd = page.getByRole('dialog', { name: 'New template' });
    await nd.getByLabel('Template name').fill('Probation extension');
    await nd.getByLabel('Letter type').selectOption('confirmation');
    await nd.getByLabel('Letter body').fill('Dear {{employee_name}}, your probation is extended by {{probation_months}} months.');
    await nd.getByRole('button', { name: 'Save template' }).click();
    await expect(page.getByRole('button', { name: 'Edit Probation extension' })).toBeVisible();
    expect((await readDb(page)).letterTemplates).toHaveLength(8);
  });

  test('generate, issue, print, download, register and sign a letter', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, '/dashboard/hrms/lifecycle?tab=letters');
    await page.getByRole('button', { name: 'Generate Appointment letter' }).click();
    const dlg = page.getByRole('dialog', { name: 'Generate letter' });
    await expect(dlg.getByRole('button', { name: 'Issue letter' })).toBeDisabled();
    await expect(dlg).toContainText('Choose an employee to fill in and preview the letter.');

    // missing data blocks issuing and says what to fix
    await dlg.getByLabel('Template').selectOption({ label: 'Offer letter (Offer)' });
    await dlg.getByLabel('Employee').selectOption({ label: 'Aditya Bhat (MER-1024), onboarding' });
    await expect(dlg.getByRole('alert')).toContainText('No data for Annual CTC');
    await expect(dlg.getByRole('link', { name: /Open Aditya Bhat.s profile/ })).toHaveAttribute('href', '/dashboard/hrms/employees/emp_24');
    await expect(dlg.getByRole('button', { name: 'Issue letter' })).toBeDisabled();

    // a complete appointment letter
    await dlg.getByLabel('Template').selectOption({ label: 'Appointment letter (Appointment)' });
    await dlg.getByLabel('Employee').selectOption({ label: 'Rohit Chauhan (MER-1004)' });
    const paper = dlg.getByTestId('letter-paper');
    await expect(paper).toContainText('Dear Rohit Chauhan');
    await expect(paper).toContainText('appointed as Team Lead in the Sales & Field department at Delhi HQ with effect from 2 Mar 2020');
    await expect(paper).toContainText('annual CTC is ₹9,60,000');
    await expect(paper).toContainText('probation is 6 months and the notice period is 30 days');
    await expect(paper).toContainText('Ritu Malhotra, Director, People');
    await expect(paper).toContainText('Date: 7 Nov 2026');
    await expect(dlg.getByRole('button', { name: 'Issue letter' })).toBeEnabled();
    // wording can be edited for this letter only
    await dlg.getByRole('checkbox', { name: /Edit the wording for this letter only/ }).check();
    await dlg.getByLabel('Wording for this letter', { exact: true }).fill('Dear {{employee_name}}, welcome to {{company}}.');
    await expect(paper).toContainText('Dear Rohit Chauhan, welcome to Meridian Retail Pvt Ltd.');
    await dlg.getByRole('checkbox', { name: /Edit the wording for this letter only/ }).uncheck();
    await expect(paper).toContainText('appointed as Team Lead');

    await dlg.getByRole('button', { name: 'Issue letter' }).click();
    const done = page.getByRole('dialog', { name: 'Letter issued' });
    await expect(done).toContainText('Recorded in the issued-letters register as unsigned');
    expect((await readDb(page)).letters).toHaveLength(1);

    // print goes through a hidden iframe holding only the letter
    await page.evaluate(() => {
      const w = window as unknown as { __printed: string[] };
      w.__printed = [];
      new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
        if (n instanceof HTMLIFrameElement) w.__printed.push(n.contentDocument?.body?.textContent ?? '');
      }))).observe(document.body, { childList: true });
    });
    await done.getByRole('button', { name: 'Print' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: string[] }).__printed.length)).toBe(1);
    const printed = await page.evaluate(() => (window as unknown as { __printed: string[] }).__printed[0]!);
    expect(printed).toContain('Meridian Retail Pvt Ltd');
    expect(printed).toContain('Dear Rohit Chauhan');
    expect(printed).not.toContain('Needs attention');

    // download as text
    const [download] = await Promise.all([page.waitForEvent('download'), done.getByRole('button', { name: 'Download as text' }).click()]);
    expect(download.suggestedFilename()).toBe('appointment-letter-MER-1004.txt');
    const text = readFileSync((await download.path())!, 'utf8');
    expect(text).toContain('Meridian Retail Pvt Ltd');
    expect(text).toContain('Date: 7 Nov 2026');
    expect(text).toContain('Dear Rohit Chauhan');
    await done.getByRole('button', { name: 'Done' }).click();

    // register: dated with the preview date, unsigned until marked
    const row = page.getByRole('row', { name: /Rohit Chauhan/ });
    await expect(row).toContainText('Appointment');
    await expect(row).toContainText('Appointment letter');
    await expect(row).toContainText('7 Nov 2026');
    await expect(row).toContainText('Unsigned');
    expect((await readDb(page)).letters[0]).toMatchObject({ employeeId: 'emp_4', type: 'appointment', issuedOn: '2026-11-07', signed: false });
    await row.getByRole('button', { name: /as signed/ }).click();
    await expect(row).toContainText('Signed');
    await expect(row.getByRole('button', { name: /as signed/ })).toHaveCount(0);
    expect((await readDb(page)).letters[0]!.signed).toBe(true);
    // view it again
    await row.getByRole('button', { name: /^View / }).click();
    await expect(page.getByRole('dialog', { name: 'Appointment letter' }).getByTestId('letter-paper')).toContainText('Dear Rohit Chauhan');
    await page.getByRole('dialog', { name: 'Appointment letter' }).getByRole('button', { name: 'Close' }).last().click();

    // register filters
    await page.getByLabel('Filter by letter type').selectOption('offer');
    await expect(page.getByText('No letter matches these filters.')).toBeVisible();
    await page.getByLabel('Filter by letter type').selectOption('');
    await page.getByLabel('Filter by signed status').selectOption('unsigned');
    await expect(page.getByText('No letter matches these filters.')).toBeVisible();
    await page.getByLabel('Filter by signed status').selectOption('signed');
    await expect(page.getByRole('row', { name: /Rohit Chauhan/ })).toBeVisible();
    await page.getByRole('searchbox', { name: /Search by employee/ }).fill('nobody');
    await expect(page.getByText('No letter matches these filters.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a warning letter cannot be issued until the bracketed placeholder is replaced', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/lifecycle?tab=letters');
    await page.getByRole('button', { name: 'Generate Warning letter' }).click();
    const dlg = page.getByRole('dialog', { name: 'Generate letter' });
    await dlg.getByLabel('Employee').selectOption({ label: 'Rohit Chauhan (MER-1004)' });
    await expect(dlg.getByRole('alert')).toContainText('Replace the bracketed text before issuing');
    await expect(dlg.getByRole('button', { name: 'Issue letter' })).toBeDisabled();
    await dlg.getByRole('checkbox', { name: /Edit the wording/ }).check();
    const w = dlg.getByLabel('Wording for this letter', { exact: true });
    await w.fill((await w.inputValue()).replace(/\[[^\]]+\]/, 'On 3 Nov 2026 you left the store unattended during opening hours.'));
    await expect(dlg.getByRole('button', { name: 'Issue letter' })).toBeEnabled();
    await dlg.getByRole('button', { name: 'Issue letter' }).click();
    await expect(page.getByRole('dialog', { name: 'Letter issued' }).getByTestId('letter-paper')).toContainText('left the store unattended');
  });
});

// ───────────────────────────────────── narrow screens ─────────────────────────────────────
test.describe('narrow viewport', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  for (const path of ['/dashboard/hrms', '/dashboard/hrms/lifecycle?tab=onboarding', '/dashboard/hrms/lifecycle?tab=exits', '/dashboard/hrms/lifecycle?tab=letters']) {
    test(`no sideways page scroll at 390px: ${path}`, async ({ page }) => {
      await openHrms(page, path);
      await page.waitForTimeout(800);
      const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(over.sw).toBeLessThanOrEqual(over.iw + 1);
    });
  }
});

// ───────────────────────────────────── screenshots (opt in) ─────────────────────────────────────
test.describe('screenshots', () => {
  test.skip(!process.env.HRMS_SHOTS, 'set HRMS_SHOTS=1 to write screenshots to /tmp/hrms-shots');
  test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const dir = '/tmp/hrms-shots';
  test('overview and lifecycle pages', async ({ page }) => {
    mkdirSync(dir, { recursive: true });
    await openHrms(page);
    await page.locator('.recharts-surface').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/overview-1-top.png` });
    await page.setViewportSize({ width: 1280, height: 2300 });   // the shell scrolls inside <main>, so a tall window shows the whole page
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/overview-2-full.png` });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dashboard/hrms/lifecycle?tab=onboarding');
    await page.getByRole('button', { name: /Aditya Bhat/ }).waitFor();
    await page.screenshot({ path: `${dir}/overview-3-onboarding.png` });
    await page.getByRole('button', { name: /Aditya Bhat/ }).click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({ path: `${dir}/overview-4-onboarding-case.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'New joiner' }).click();
    await page.getByRole('button', { name: 'Create joiner' }).click();
    await page.screenshot({ path: `${dir}/overview-5-new-joiner-errors.png` });
    await page.keyboard.press('Escape');
    await page.goto('/dashboard/hrms/lifecycle?tab=exits');
    await page.getByRole('button', { name: /Yash Rathore/ }).click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({ path: `${dir}/overview-6-exit-case.png` });
    await page.getByRole('dialog').evaluate((el) => { el.querySelector('[style*="overflow-y"]')?.scrollTo(0, 99999); });
    await page.screenshot({ path: `${dir}/overview-7-exit-case-bottom.png` });
    await page.keyboard.press('Escape');
    await page.goto('/dashboard/hrms/lifecycle?tab=letters');
    await page.getByRole('button', { name: 'Edit Warning letter' }).waitFor();
    await page.screenshot({ path: `${dir}/overview-8-letters.png` });
    await page.getByRole('button', { name: 'Edit Appointment letter' }).click();
    await page.getByTestId('letter-paper').waitFor();
    await page.screenshot({ path: `${dir}/overview-9-template-editor.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Generate Appointment letter' }).click();
    await page.getByRole('dialog').getByRole('combobox', { name: /^Employee/ }).selectOption({ label: 'Rohit Chauhan (MER-1004)' });
    await page.getByTestId('letter-paper').waitFor();
    await page.screenshot({ path: `${dir}/overview-10-generate.png` });
    await page.getByRole('button', { name: 'Issue letter' }).click();
    await page.getByRole('dialog', { name: 'Letter issued' }).waitFor();
    await page.screenshot({ path: `${dir}/overview-11-issued.png` });
    await page.getByRole('button', { name: 'Done' }).click();
    await page.setViewportSize({ width: 1280, height: 1500 });
    await page.screenshot({ path: `${dir}/overview-12-letters-register.png` });
  });
});
