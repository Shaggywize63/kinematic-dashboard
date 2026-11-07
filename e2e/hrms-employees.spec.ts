import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { openHrms } from './hrms-utils';
import { makeSeed, PREVIEW_TODAY } from '../src/lib/hrms/seed';
import { attendanceFor, buildBreakup, computePayslip } from '../src/lib/hrms/engine';
import { checkAadhaar, sampleAadhaar } from '../src/lib/hrms/validators';
import { inr } from '../src/lib/hrms/format';
import { SHORT_MISSING, addMonthsToDate, parseCsv, parseFlexDate, statutorySummary, validateImport, autoMap } from '../src/components/hrms/employees/logic';

/** Employees area: list, CSV import, new employee, profile tabs. Runs on the seeded sample data (localStorage, fresh per test). */

test.describe.configure({ timeout: 180_000 });

const seed = makeSeed();
const emp = (id: string) => seed.employees.find((e) => e.id === id)!;
const LIST = '/dashboard/hrms/employees';
const profile = (id: string, tab?: string) => `${LIST}/${id}${tab ? `?tab=${tab}` : ''}`;

async function dbOf(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('kinematic_hrms_preview_v3') || 'null'));
}
async function statValue(page: Page, label: string): Promise<string> {
  return (await page.getByText(label, { exact: true }).first().locator('xpath=following-sibling::div[1]').innerText()).trim();
}
async function tabIs(page: Page, name: string) {
  await expect(page.getByRole('tab', { name, exact: false }).and(page.locator('[aria-selected="true"]'))).toBeVisible();
}

// ───────────────────────────── pure logic ─────────────────────────────
test.describe('csv parser and date helpers (no browser)', () => {
  test('RFC 4180: quotes, doubled quotes, commas and line breaks inside quotes, CRLF, BOM', () => {
    const text = '﻿Name,Note\r\n"Smith, Jo","said ""hi"""\r\n"Two\nlines",plain\r\n';
    const { rows, unterminated } = parseCsv(text);
    expect(unterminated).toBe(false);
    expect(rows).toEqual([['Name', 'Note'], ['Smith, Jo', 'said "hi"'], ['Two\nlines', 'plain']]);
  });
  test('empty fields, a missing final newline and blank lines', () => {
    expect(parseCsv('a,b,c\n1,,3\n\n4,5,').rows).toEqual([['a', 'b', 'c'], ['1', '', '3'], ['4', '5', '']]);
  });
  test('an unclosed quote is reported', () => {
    expect(parseCsv('a,b\n"oops,1\n').unterminated).toBe(true);
  });
  test('dates: ISO and Indian formats, month arithmetic clamps the day', () => {
    expect(parseFlexDate('2026-11-07')).toBe('2026-11-07');
    expect(parseFlexDate('7/11/2026')).toBe('2026-11-07');
    expect(parseFlexDate('31-02-2026')).toBeNull();
    expect(addMonthsToDate('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonthsToDate('2026-05-15', 6)).toBe('2026-11-15');
  });
  test('header auto-mapping uses each field once', () => {
    expect(autoMap(['First Name', 'Surname', 'Email ID', 'DOJ', 'Date of Birth', 'Mystery'])).toEqual(['firstName', 'lastName', 'email', 'joinDate', 'dob', '']);
  });
  test('import validation applies the same rules as the form and catches in-file duplicates', () => {
    const header = ['First name', 'Last name', 'Email', 'Mobile', 'Gender', 'Date of birth', 'Join date', 'Department', 'Designation', 'Location', 'PAN'];
    const good = ['Asha', 'Rao', 'asha.rao@example.com', '9876500001', 'female', '1996-02-02', '2026-11-02', 'Finance', 'Accounts Executive', 'Delhi HQ', 'ABCPR1234F'];
    const bad = ['Bad', 'Row', 'asha.rao@example.com', '123', 'x', '31/02/2026', '2026-11-02', 'Nowhere', 'Accounts Executive', 'Delhi HQ', 'ZZZ'];
    const res = validateImport(seed, [good, bad], autoMap(header));
    expect(res[0]!.errors).toEqual([]);
    expect(res[0]!.draft?.entityId).toBe('ent_retail');
    const msgs = res[1]!.errors.join(' | ');
    expect(msgs).toContain('Unknown department "Nowhere"');
    expect(msgs).toContain('Mobile is 10 digits starting 6 to 9');
    expect(msgs).toContain('PAN looks like ABCDE1234F');
    expect(msgs).toContain('Email is repeated in this file (first used on line 2)');
    expect(res[1]!.line).toBe(3);
  });
});

// ───────────────────────────── list ─────────────────────────────
test.describe('employee list', () => {
  test('shows everyone with real stats, search, filters, sorting and an empty state', async ({ page }) => {
    await openHrms(page, LIST);
    await expect(page.getByRole('heading', { name: 'Employees', exact: true })).toBeVisible();
    await expect(page.getByTestId('employee-count')).toHaveText(`Showing ${seed.employees.length} of ${seed.employees.length}`);

    const by = (s: string) => seed.employees.filter((e) => e.status === s).length;
    expect(await statValue(page, 'Active')).toBe(String(by('active')));
    expect(await statValue(page, 'On notice')).toBe(String(by('on_notice')));
    expect(await statValue(page, 'Onboarding')).toBe(String(by('onboarding')));
    const incomplete = seed.employees.filter((e) => e.status !== 'exited' && statutorySummary(seed, e).comp.missing.length > 0).length;
    expect(await statValue(page, 'Incomplete statutory data')).toBe(String(incomplete));

    // Columns
    for (const h of ['Employee', 'Designation', 'Department', 'Location', 'Type', 'Status', 'Joined', 'Statutory data']) {
      await expect(page.locator('thead th').filter({ hasText: new RegExp(`^${h}`, 'i') })).toBeVisible();
    }

    // Search by name, code and email
    await page.getByRole('searchbox', { name: /Search name, code or email/ }).fill('pooja');
    await expect(page.getByTestId('employee-count')).toHaveText(`Showing 1 of ${seed.employees.length}`);
    const row = page.getByRole('row', { name: /Pooja Verma/ });
    await expect(row).toContainText(emp('emp_7').code);
    await expect(row).toContainText('Field Executive');
    await expect(row).toContainText('Sales & Field');
    await expect(row).toContainText('Delhi HQ');
    await expect(row).toContainText('Permanent');
    await expect(row).toContainText('Active');
    await expect(row).toContainText('20 May 2024');
    await expect(row).toContainText('UAN');           // a missing-item chip
    await page.getByRole('searchbox').fill('MER-1012');
    await expect(page.getByRole('row', { name: /Manoj Patil/ })).toBeVisible();
    await page.getByRole('searchbox').fill('divya.menon@');
    await expect(page.getByRole('row', { name: /Divya Menon/ })).toBeVisible();
    await page.getByRole('searchbox').fill('zzzz-nobody');
    await expect(page.getByText('No employees match these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByTestId('employee-count')).toHaveText(`Showing ${seed.employees.length} of ${seed.employees.length}`);

    // Filters
    await page.getByLabel('Status', { exact: true }).selectOption('on_notice');
    await expect(page.getByTestId('employee-count')).toHaveText(`Showing ${by('on_notice')} of ${seed.employees.length}`);
    await expect(page.getByRole('row', { name: /Yash Rathore/ })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByLabel('Employment type', { exact: true }).selectOption('contract');
    await expect(page.getByRole('row', { name: /Dinesh Kamble/ })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByLabel('Legal entity', { exact: true }).selectOption('ent_logistics');
    await expect(page.getByTestId('employee-count')).toHaveText(`Showing ${seed.employees.filter((e) => e.entityId === 'ent_logistics').length} of ${seed.employees.length}`);
    // The location list narrows to the chosen entity.
    await expect(page.getByLabel('Location', { exact: true }).locator('option')).toHaveText(['All locations', 'Bhiwandi Warehouse']);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByLabel('Department', { exact: true }).selectOption('dep_wh');
    await expect(page.getByTestId('employee-count')).toHaveText(`Showing ${seed.employees.filter((e) => e.departmentId === 'dep_wh').length} of ${seed.employees.length}`);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByLabel('Incomplete only').check();
    await expect(page.getByTestId('employee-count')).toHaveText(`Showing ${seed.employees.filter((e) => statutorySummary(seed, e).comp.missing.length > 0).length} of ${seed.employees.length}`);
    await page.getByRole('button', { name: 'Clear filters' }).click();

    // Sorting by join date, both directions
    const firstCode = async () => (await page.locator('tbody tr').first().innerText()).match(/MER-\d{4}/)![0];
    await page.locator('thead th').filter({ hasText: /^Joined/i }).click();
    expect(await firstCode()).toBe('MER-1001');       // Ritu, 2017
    await page.locator('thead th').filter({ hasText: /^Joined/i }).click();
    expect(await firstCode()).toBe('MER-1025');       // Shreya, 23 Nov 2026
  });

  test('statutory completeness bar and chips come from completeness()', async ({ page }) => {
    await openHrms(page, LIST);
    for (const id of ['emp_7', 'emp_9', 'emp_1']) {
      const e = emp(id);
      const s = statutorySummary(seed, e);
      const row = page.getByRole('row', { name: new RegExp(`${e.firstName} ${e.lastName}`) });
      await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(s.comp.pct));
      if (s.comp.missing.length === 0) await expect(row.getByText('Complete')).toBeVisible();
      else await expect(row).toContainText(SHORT_MISSING[s.comp.missing[0]!] ?? s.comp.missing[0]!);
    }
  });

  test('row click opens the profile', async ({ page }) => {
    await openHrms(page, LIST);
    await page.getByRole('row', { name: /Imran Sheikh/ }).getByText('Area Sales Executive').click();
    await page.waitForURL('**/dashboard/hrms/employees/emp_6', { timeout: 45_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Imran Sheikh');
  });

  test('exports the filtered list as CSV', async ({ page }) => {
    await openHrms(page, LIST);
    await page.getByLabel('Department', { exact: true }).selectOption('dep_wh');
    const warehouse = seed.employees.filter((e) => e.departmentId === 'dep_wh');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    expect(dl.suggestedFilename()).toBe('employees.csv');
    const lines = readFileSync((await dl.path())!, 'utf8').trim().split('\n');
    expect(lines[0]).toContain('Code,Name,Email,Mobile');
    expect(lines.length).toBe(warehouse.length + 1);
    expect(lines.join('\n')).not.toMatch(/Aadhaar number|IFSC/);
    expect(lines.some((l) => l.includes('Manoj Patil'))).toBe(true);
    expect(lines.some((l) => l.includes('Imran Sheikh'))).toBe(false);
  });
});

// ───────────────────────────── CSV import ─────────────────────────────
test.describe('CSV import', () => {
  const header = 'First Name,Last Name,Email,Mobile,Gender,Date of Birth,Date of Joining,Department,Designation,Location,PAN,Bank Account,IFSC,Employment Type';
  const rows = [
    'Kabir,Anand,kabir.anand@example.com,9876501234,male,1997-03-14,2026-11-02,Operations,Operations Associate,Delhi HQ,ABCPK1234F,,,permanent',
    '"Mira","D\'Souza, Jr",mira.d@example.com,+91 98765 43211,F,15/08/1995,2026-12-01,Finance,Accounts Executive,Bengaluru Office,,,,fixed term',
    'Bad,Pan,bad.pan@example.com,12345,male,1990-01-01,2026-11-02,Astrology,Operations Associate,Delhi HQ,ABCDE12345,,,permanent',
    'Dup,Email,kabir.anand@example.com,9876501299,male,1990-01-01,2026-11-02,Operations,Operations Associate,Delhi HQ,,1234,HDFC1001234,permanent',
  ];

  test('template download, parse, map, validate row by row, import only the valid rows', async ({ page }) => {
    await openHrms(page, LIST);
    await page.getByRole('button', { name: 'Import CSV' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import employees from CSV' });
    await expect(dialog).toBeVisible();

    const [tpl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download template' }).click()]);
    expect(tpl.suggestedFilename()).toBe('employee-import-template.csv');
    const tplRows = parseCsv(readFileSync((await tpl.path())!, 'utf8')).rows;
    expect(tplRows[0]).toContain('First name');
    expect(tplRows[0]).toContain('Annual CTC');
    expect(tplRows.length).toBe(3);

    await dialog.getByTestId('import-file').setInputFiles({ name: 'staff.csv', mimeType: 'text/csv', buffer: Buffer.from([header, ...rows].join('\r\n')) });
    await expect(dialog.getByText('staff.csv')).toBeVisible();
    await expect(dialog.getByTestId('import-valid')).toHaveText('2 valid');
    await expect(dialog.getByTestId('import-invalid')).toHaveText('2 with errors');

    // Headers were matched by name
    await expect(dialog.getByLabel('Field for column Date of Joining')).toHaveValue('joinDate');
    await expect(dialog.getByLabel('Field for column First Name')).toHaveValue('firstName');

    // Row level messages
    const errs = dialog.getByTestId('import-error-row');
    await expect(errs).toHaveCount(2);
    await expect(errs.nth(0)).toContainText('4');                       // file line number (header is line 1)
    await expect(errs.nth(0)).toContainText('Unknown department "Astrology"');
    await expect(errs.nth(0)).toContainText('Mobile is 10 digits starting 6 to 9');
    await expect(errs.nth(0)).toContainText('PAN looks like ABCDE1234F');
    await expect(errs.nth(1)).toContainText('Email is repeated in this file');
    await expect(errs.nth(1)).toContainText('IFSC looks like HDFC0001234');
    await expect(errs.nth(1)).toContainText('Account number is 9 to 18 digits');

    await dialog.getByRole('button', { name: 'Import 2 employees' }).click();
    await expect(dialog.getByText('Imported 2 employees.')).toBeVisible();
    await expect(dialog.getByText('2 rows were left out because of errors.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(dialog).toBeHidden();

    const n = seed.employees.length;
    await expect(page.getByTestId('employee-count')).toHaveText(`Showing ${n + 2} of ${n + 2}`);
    await page.getByRole('searchbox').fill('kabir');
    const kabir = page.getByRole('row', { name: /Kabir Anand/ });
    await expect(kabir).toContainText(`MER-${1001 + n}`);
    await expect(kabir).toContainText('Active');                         // joined before the preview's today
    await page.getByRole('searchbox').fill('mira');
    const mira = page.getByRole('row', { name: /Mira/ });
    await expect(mira).toContainText('Onboarding');                      // joins in December
    await expect(mira).toContainText('D\'Souza, Jr');                    // comma inside quotes survived
    await expect(mira).toContainText('Fixed term');

    // Stored with the rules applied: mobile normalised, last name intact, PAN upper-cased
    const db = await dbOf(page);
    const m = db.employees.find((e: { email: string }) => e.email === 'mira.d@example.com');
    expect(m.mobile).toBe('9876543211');
    expect(m.lastName).toBe("D'Souza, Jr");
    expect(m.entityId).toBe('ent_retail');
  });

  test('unmapped required columns block the import until they are mapped', async ({ page }) => {
    await openHrms(page, LIST);
    await page.getByRole('button', { name: 'Import CSV' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import employees from CSV' });
    const csv = 'Given,Family,Mail,Phone,Sex,Born,Start,Dept,Role,Office\nZoya,Khan,zoya.khan@example.com,9876500077,female,1998-06-06,2026-11-03,Finance,Accounts Executive,Delhi HQ\n';
    await dialog.getByTestId('import-file').setInputFiles({ name: 'odd.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(dialog.getByText(/Map these required fields to import: First name, Email, Date of birth, Join date/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
    await dialog.getByLabel('Field for column Given').selectOption('firstName');
    await dialog.getByLabel('Field for column Mail').selectOption('email');
    await dialog.getByLabel('Field for column Born').selectOption('dob');
    await dialog.getByLabel('Field for column Start').selectOption('joinDate');
    await expect(dialog.getByTestId('import-valid')).toHaveText('1 valid');
    await dialog.getByRole('button', { name: 'Import 1 employee' }).click();
    await expect(dialog.getByText('Imported 1 employee.')).toBeVisible();
  });

  test('a file with an unclosed quote is refused with a clear message', async ({ page }) => {
    await openHrms(page, LIST);
    await page.getByRole('button', { name: 'Import CSV' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import employees from CSV' });
    await dialog.getByTestId('import-file').setInputFiles({ name: 'broken.csv', mimeType: 'text/csv', buffer: Buffer.from('First name,Email\n"Open,quote@example.com\n') });
    await expect(dialog.getByRole('alert')).toContainText('never closed');
  });
});

// ───────────────────────────── new employee ─────────────────────────────
test.describe('new employee', () => {
  async function fillBasics(page: Page, o: { first: string; last: string; email: string; join?: string }) {
    await page.locator('#new-firstName').fill(o.first);
    await page.locator('#new-lastName').fill(o.last);
    await page.locator('#new-email').fill(o.email);
    await page.locator('#new-mobile').fill('9812345678');
    await page.locator('#new-gender').selectOption('female');
    await page.locator('#new-dob').fill('1995-05-05');
    await page.locator('#new-location').selectOption('loc_blr');
    await page.locator('#new-dept').selectOption('dep_tech');
    await page.locator('#new-desig').selectOption('des_dev');
    if (o.join) await page.locator('#new-join').fill(o.join);
  }

  test('shows field errors, checks PAN and the Aadhaar checksum, keeps only the last four digits, opens the profile', async ({ page }) => {
    await openHrms(page, `${LIST}/new`);
    await page.getByRole('button', { name: 'Create employee' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'before saving' })).toBeVisible();
    for (const m of ['First name is required', 'Email is required', 'Mobile number is required', 'Choose a gender', 'Date of birth is required', 'Choose a location', 'Choose a department', 'Choose a designation']) {
      await expect(page.getByText(m, { exact: true }).first()).toBeVisible();
    }

    await fillBasics(page, { first: 'Tara', last: 'Nambiar', email: 'divya.menon@meridian.example' });
    await page.locator('#new-pan').fill('ABCDE12345');
    await page.locator('#new-aadhaar').fill('1234 5678 9012');
    await page.getByRole('button', { name: 'Create employee' }).click();
    await expect(page.getByText('Another employee already uses this email').first()).toBeVisible();
    await expect(page.getByText('PAN looks like ABCDE1234F').first()).toBeVisible();
    await expect(page.getByText('Aadhaar is 12 digits and does not start with 0 or 1').first()).toBeVisible();
    await page.locator('#new-aadhaar').fill('2345 6789 0123');
    await expect(page.getByText('This Aadhaar number fails its checksum').first()).toBeVisible();

    const aadhaar = sampleAadhaar(7);
    expect(checkAadhaar(aadhaar).ok).toBe(true);
    await page.locator('#new-email').fill('tara.nambiar@meridian.example');
    await page.locator('#new-pan').fill('abcpn1234k');
    await page.locator('#new-aadhaar').fill(aadhaar);
    await page.locator('#new-structure').selectOption('str_std');
    await page.locator('#new-ctc').fill('900000');
    await expect(page.getByText(/75,000 a month/)).toBeVisible();
    await page.getByRole('button', { name: 'Create employee' }).click();

    await page.waitForURL(/\/dashboard\/hrms\/employees\/emp_[a-z0-9]+$/, { timeout: 45_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tara Nambiar');
    await expect(page.getByTestId('employee-code')).toHaveText(`MER-${1001 + seed.employees.length}`);
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();   // joined today

    const db = await dbOf(page);
    const created = db.employees.find((e: { email: string }) => e.email === 'tara.nambiar@meridian.example');
    expect(created.status).toBe('active');
    expect(created.pan).toBe('ABCPN1234K');
    expect(created.aadhaarLast4).toBe(aadhaar.slice(-4));
    expect(created.aadhaarVerified).toBe(false);
    expect(created.entityId).toBe('ent_retail');
    expect(created.annualCtc).toBe(900000);
    expect(JSON.stringify(db)).not.toContain(aadhaar);              // the full number is nowhere in storage
    expect(created.history[0].to).toBe('Created');
    expect(created.documents.length).toBeGreaterThan(0);
  });

  test('a join date after today creates an Onboarding employee', async ({ page }) => {
    await openHrms(page, `${LIST}/new`);
    await fillBasics(page, { first: 'Neel', last: 'Chopra', email: 'neel.chopra@meridian.example', join: '2026-12-14' });
    await expect(page.getByText('the employee will be created as Onboarding')).toBeVisible();
    await page.getByRole('button', { name: 'Create employee' }).click();
    await page.waitForURL(/\/dashboard\/hrms\/employees\/emp_[a-z0-9]+$/, { timeout: 45_000 });
    await expect(page.getByText('still onboarding')).toBeVisible();
    const db = await dbOf(page);
    expect(db.employees.find((e: { email: string }) => e.email === 'neel.chopra@meridian.example').status).toBe('onboarding');
  });

  test('a fixed-term hire needs a contract end date', async ({ page }) => {
    await openHrms(page, `${LIST}/new`);
    await fillBasics(page, { first: 'Om', last: 'Pillai', email: 'om.pillai@meridian.example' });
    await page.locator('#new-type').selectOption('fixed_term');
    await page.getByRole('button', { name: 'Create employee' }).click();
    await expect(page.getByText('Contract end date is required for this employment type').first()).toBeVisible();
    await page.locator('#new-contractEnd').fill('2027-10-31');
    await page.getByRole('button', { name: 'Create employee' }).click();
    await page.waitForURL(/\/dashboard\/hrms\/employees\/emp_[a-z0-9]+$/, { timeout: 45_000 });
  });
});

// ───────────────────────────── profile ─────────────────────────────
test.describe('profile', () => {
  test('unknown id shows an empty state with a way back', async ({ page }) => {
    await openHrms(page, profile('emp_nope'));
    await expect(page.getByText('There is no employee with this ID')).toBeVisible();
    await page.getByRole('link', { name: 'Go to the employee list' }).click();
    await page.waitForURL('**/dashboard/hrms/employees', { timeout: 45_000 });
  });

  test('header, tabs and ?tab= deep links', async ({ page }) => {
    await openHrms(page, profile('emp_7'));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Pooja Verma');
    await expect(page.getByTestId('employee-code')).toHaveText('MER-1007');
    await expect(page.getByRole('link', { name: 'Email', exact: true })).toHaveAttribute('href', `mailto:${emp('emp_7').email}`);
    const names = ['Overview', 'Personal', 'Employment', 'Statutory', 'Documents', 'Salary', 'Leave', 'History'];
    for (const n of names) await expect(page.getByRole('tab', { name: new RegExp(`^${n}`) })).toBeVisible();
    await tabIs(page, 'Overview');

    await page.goto(profile('emp_7', 'statutory'));
    await tabIs(page, 'Statutory');
    await expect(page.getByText('What applies today')).toBeVisible();
    await page.goto(profile('emp_7', 'salary'));
    await tabIs(page, 'Salary');
    await expect(page.getByText('Structure and CTC')).toBeVisible();
    await page.getByRole('tab', { name: /^Leave/ }).click();
    expect(page.url()).toContain('tab=leave');
  });

  test('overview: completeness checklist links to the fixing tab; dates to watch; reporting line', async ({ page }) => {
    await openHrms(page, profile('emp_7'));
    const s = statutorySummary(seed, emp('emp_7'));
    await expect(page.getByText(`${s.comp.pct}% complete`)).toBeVisible();
    await expect(page.getByTestId('check-UAN')).toHaveAttribute('data-state', 'missing');
    await expect(page.getByTestId('check-PAN')).toHaveAttribute('data-state', 'ok');
    await expect(page.getByTestId('check-ESIC number')).toHaveAttribute('data-state', s.esiApplicable ? 'missing' : 'na');
    await expect(page.getByLabel('Reporting chain').getByRole('link', { name: 'Rohit Chauhan' })).toBeVisible();
    await page.getByTestId('check-UAN').getByRole('link', { name: /Fix in Statutory/ }).click();
    await tabIs(page, 'Statutory');
    expect(page.url()).toContain('tab=statutory');

    // Fixed-term contract ending 23 Nov: 16 days from the preview's today
    await openHrms(page, profile('emp_21'));
    await expect(page.getByText('Contract ends on 23 Nov 2026 (in 16 days)')).toBeVisible();
    // On notice: last working day is shown with a warning
    await openHrms(page, profile('emp_22'));
    await expect(page.getByText(/Last working day is 30 Nov 2026 \(in 23 days\)/)).toBeVisible();
    // Joining soon
    await openHrms(page, profile('emp_24'));
    await expect(page.getByText(/Joins on 16 Nov 2026 \(in 9 days\)/)).toBeVisible();
  });

  test('personal: edit, validate, save, cancel with a discard confirmation; the change log records it', async ({ page }) => {
    await openHrms(page, profile('emp_5', 'personal'));
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#pe-email').fill('not-an-email');
    await page.locator('#pe-mobile').fill('12345');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Enter a valid email').first()).toBeVisible();
    await expect(page.getByText('Mobile is 10 digits starting 6 to 9').first()).toBeVisible();
    await page.locator('#pe-email').fill('ritu.malhotra@meridian.example');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Another employee already uses this email').first()).toBeVisible();

    await page.locator('#pe-email').fill('divya.m@meridian.example');
    await page.locator('#pe-mobile').fill('+91 98111 22233');
    await page.locator('#pe-fatherName').fill('Gopal Menon');
    await page.locator('#pe-city').fill('Mysuru');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await expect(page.getByText('divya.m@meridian.example')).toBeVisible();
    await expect(page.getByText('Gopal Menon')).toBeVisible();
    await expect(page.getByText(/Mysuru/)).toBeVisible();

    // Cancel with unsaved edits asks first
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#pe-fatherName').fill('Someone Else');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog', { name: 'Discard your changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByText('Gopal Menon')).toBeVisible();

    // Switching tabs with unsaved edits asks too
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#pe-fatherName').fill('Unsaved');
    await page.getByRole('tab', { name: /^History/ }).click();
    await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible();
    await page.getByRole('button', { name: 'Discard and switch' }).click();
    await tabIs(page, 'History');

    // The log has old and new values; DOB-style fields the shared logger skips are written too
    const row = page.getByRole('row', { name: /Mobile/ });
    await expect(row).toContainText(emp('emp_5').mobile);
    await expect(row).toContainText('9811122233');
    await expect(page.getByRole('row', { name: /Father's name/ })).toContainText('Gopal Menon');
    await expect(page.getByRole('row', { name: /^Address/ })).toContainText('Updated');
    await expect(page.getByRole('row', { name: /^Email/ })).toContainText('divya.m@meridian.example');
  });

  test('employment: department names (not ids) in the log, reporting loop blocked, exit asks first', async ({ page }) => {
    await openHrms(page, profile('emp_7', 'employment'));
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#ee-dept').selectOption('dep_fin');
    await page.locator('#ee-mgr').selectOption('emp_3');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await page.getByRole('tab', { name: /^History/ }).click();
    const dep = page.getByRole('row', { name: /^Department/ });
    await expect(dep).toContainText('Sales & Field');
    await expect(dep).toContainText('Finance');
    await expect(dep).not.toContainText('dep_');
    await expect(page.getByRole('row', { name: /^Reports to/ })).toContainText('Neha Bansal');

    // emp_4 manages emp_6; making emp_6 the manager of emp_4 would be a loop
    await page.goto(profile('emp_4', 'employment'));
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#ee-mgr').selectOption('emp_6');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('That would create a reporting loop').first()).toBeVisible();
    await page.locator('#ee-mgr').selectOption('');

    // Exit needs a last working date and a confirmation
    await page.locator('#ee-status').selectOption('exited');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Last working date is required for this status').first()).toBeVisible();
    await page.locator('#ee-lwd').fill('2026-11-20');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const dlg = page.getByRole('dialog', { name: 'Mark this employee as exited?' });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    expect((await dbOf(page)).employees.find((e: { id: string }) => e.id === 'emp_4').status).toBe('active');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('dialog', { name: 'Mark this employee as exited?' }).getByRole('button', { name: 'Mark as exited' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    expect((await dbOf(page)).employees.find((e: { id: string }) => e.id === 'emp_4').status).toBe('exited');
  });

  test('statutory: Aadhaar and bank are masked, revealing needs a reason and is logged; edits validate and update completeness', async ({ page }) => {
    const arvind = emp('emp_2');
    await openHrms(page, profile('emp_2', 'statutory'));
    await expect(page.getByTestId('aadhaar-value')).toHaveText('XXXX XXXX ••••');
    expect(await page.getByTestId('bank-value').innerText()).toMatch(/^•+\d{4}$/);

    await page.getByRole('button', { name: 'Reveal Aadhaar last four digits' }).click();
    const dlg = page.getByRole('dialog', { name: /Reveal Aadhaar/ });
    await dlg.getByRole('button', { name: 'Reveal for one minute' }).click();
    await expect(dlg.getByText('Enter a reason of at least 5 characters')).toBeVisible();
    await dlg.getByLabel(/Reason/).fill('Checking against the PAN card');
    await dlg.getByRole('button', { name: 'Reveal for one minute' }).click();
    await expect(page.getByTestId('aadhaar-value')).toHaveText(`XXXX XXXX ${arvind.aadhaarLast4}`);
    await page.getByRole('button', { name: 'Hide Aadhaar digits' }).click();
    await expect(page.getByTestId('aadhaar-value')).toHaveText('XXXX XXXX ••••');

    await page.getByRole('button', { name: 'Reveal full account number' }).click();
    await page.getByRole('dialog').getByLabel(/Reason/).fill('Fix IFSC before payroll');
    await page.getByRole('dialog').getByRole('button', { name: 'Reveal for one minute' }).click();
    await expect(page.getByTestId('bank-value')).toHaveText(arvind.bank!.accountNumber);

    // Both reveals are in the access log with their reasons
    const log = (await dbOf(page)).accessLog.filter((a: { employeeId: string }) => a.employeeId === 'emp_2');
    expect(log.some((a: { field: string; reason: string }) => a.field.startsWith('Aadhaar') && a.reason === 'Checking against the PAN card')).toBe(true);
    expect(log.some((a: { field: string; reason: string }) => a.field === 'Bank account number' && a.reason === 'Fix IFSC before payroll')).toBe(true);
    await page.getByRole('tab', { name: /^History/ }).click();
    await expect(page.getByRole('row', { name: /Checking against the PAN card/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Fix IFSC before payroll/ })).toBeVisible();

    // Old regime declaration is shown with values; the schemes card reads the rules
    await page.getByRole('tab', { name: /^Statutory/ }).click();
    await expect(page.getByText(inr(arvind.declaration.sec80C)).first()).toBeVisible();
    await expect(page.getByText('Provident fund')).toBeVisible();
    await expect(page.getByText(/PF wage ceiling in force: ₹25,000/)).toBeVisible();   // since 17 Sep 2026
    await expect(page.getByText('Karnataka:').first()).toBeVisible();                 // PT state of the Bengaluru office
    await expect(page.getByText('Reported, confirm').first()).toBeVisible();
  });

  test('statutory edit: validators, then a fix lifts the completeness checklist', async ({ page }) => {
    await openHrms(page, profile('emp_7', 'statutory'));
    await page.getByRole('button', { name: 'Edit statutory details' }).click();
    await page.locator('#se-pan').fill('BADPAN');
    await page.locator('#se-uan').fill('123');
    await page.locator('#se-esic').fill('12');
    await page.locator('#se-ifsc').fill('HDFC1');
    await page.locator('#se-bankHolder').fill('Pooja Verma');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('PAN looks like ABCDE1234F').first()).toBeVisible();
    await expect(page.getByText('UAN is 12 digits').first()).toBeVisible();
    await expect(page.getByText('ESIC number is 10 digits (17 for older numbers)').first()).toBeVisible();
    await expect(page.getByText('IFSC looks like HDFC0001234').first()).toBeVisible();
    await expect(page.getByText('A UAN is entered, so set its status').first()).toBeVisible();

    await page.locator('#se-pan').fill(emp('emp_7').pan!);
    await page.locator('#se-uan').fill('100200300777');
    await page.locator('#se-uanStatus').selectOption('aadhaar_seeded');
    await page.locator('#se-esic').fill('');
    await page.locator('#se-bankHolder').fill(emp('emp_7').bank!.accountHolder);
    await page.locator('#se-ifsc').fill(emp('emp_7').bank!.ifsc);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();

    await page.getByRole('tab', { name: /^Overview/ }).click();
    await expect(page.getByTestId('check-UAN')).toHaveAttribute('data-state', 'ok');
    await expect(page.getByTestId('check-UAN not Aadhaar-seeded')).toHaveAttribute('data-state', 'ok');
    const after = { ...emp('emp_7'), uan: '100200300777', uanStatus: 'aadhaar_seeded' as const };
    const pct = statutorySummary(seed, after as typeof seed.employees[number]).comp.pct;
    await expect(page.getByText(`${pct}% complete`)).toBeVisible();
  });

  test('statutory edit: old-regime declaration needs a landlord PAN above one lakh of rent; declaration status is saved', async ({ page }) => {
    await openHrms(page, profile('emp_3', 'statutory'));   // Neha, old regime
    await page.getByRole('button', { name: 'Edit statutory details' }).click();
    await page.locator('#se-drent').fill('240000');
    await page.locator('#se-dpan').fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Landlord PAN is needed when yearly rent is above ₹1,00,000').first()).toBeVisible();
    await page.locator('#se-dpan').fill('BCDPS1234E');
    await page.locator('#se-d80c').fill('150000');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await expect(page.getByText('₹1,50,000').first()).toBeVisible();
    await page.getByRole('tab', { name: /^History/ }).click();
    await expect(page.getByRole('row', { name: /Tax declaration/ })).toBeVisible();
  });

  test('documents: upload, verify, reject with confirmation, add and remove', async ({ page }) => {
    await openHrms(page, profile('emp_9', 'documents'));            // Sana: cancelled cheque is pending
    await expect(page.getByText('3 of 4 mandatory documents received')).toBeVisible();
    const cheque = page.getByRole('row', { name: /Cancelled cheque/ });
    await expect(cheque).toContainText('Pending');
    await expect(cheque).toContainText('Mandatory');
    await expect(cheque.getByRole('button', { name: 'Verify Cancelled cheque' })).toBeDisabled();

    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), cheque.getByRole('button', { name: 'Upload Cancelled cheque' }).click()]);
    await chooser.setFiles({ name: 'cheque-scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample') });
    await expect(cheque).toContainText('Uploaded');
    await expect(cheque).toContainText('cheque-scan.pdf');
    await expect(cheque).toContainText('7 Nov 2026');
    await expect(page.getByText('4 of 4 mandatory documents received')).toBeVisible();

    await cheque.getByRole('button', { name: 'Verify Cancelled cheque' }).click();
    await expect(cheque).toContainText('Verified');

    await cheque.getByRole('button', { name: 'Reject Cancelled cheque' }).click();
    await page.getByRole('dialog', { name: /Reject Cancelled cheque/ }).getByRole('button', { name: 'Cancel' }).click();
    await expect(cheque).toContainText('Verified');
    await cheque.getByRole('button', { name: 'Reject Cancelled cheque' }).click();
    await page.getByRole('dialog', { name: /Reject Cancelled cheque/ }).getByRole('button', { name: 'Reject document' }).click();
    await expect(cheque).toContainText('Rejected');
    await expect(page.getByText('3 of 4 mandatory documents received')).toBeVisible();

    // Add a document with a file, then remove it (mandatory documents have no Remove button)
    await page.getByRole('button', { name: 'Add document' }).click();
    const add = page.getByRole('dialog', { name: 'Add a document' });
    await add.getByLabel('Name').fill('');
    await add.getByRole('button', { name: 'Add document' }).click();
    await expect(add.getByText('Give the document a name')).toBeVisible();
    await add.getByLabel('Name').fill('Driving licence');
    await add.getByLabel('File for the new document').setInputFiles({ name: 'dl.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x') });
    await add.getByRole('button', { name: 'Add document' }).click();
    const dl = page.getByRole('row', { name: /Driving licence/ });
    await expect(dl).toContainText('Uploaded');
    await expect(dl).not.toContainText('Mandatory');
    await expect(cheque.getByRole('button', { name: /Remove/ })).toHaveCount(0);
    await dl.getByRole('button', { name: 'Remove Driving licence' }).click();
    await page.getByRole('dialog', { name: /Remove Driving licence/ }).getByRole('button', { name: 'Remove document' }).click();
    await expect(dl).toHaveCount(0);

    // The completeness item on the overview follows the documents
    await page.getByRole('tab', { name: /^Overview/ }).click();
    await expect(page.getByTestId('check-Mandatory documents')).toHaveAttribute('data-state', 'missing');
  });

  test('salary: live breakup, 50% rule and take-home match the engine; saving writes the revision history', async ({ page }) => {
    const e = emp('emp_4');        // Rohit: field-sales structure, 9.6 lakh, fails the 50% rule
    const field = seed.structures.find((s) => s.id === 'str_field')!;
    const asOn = PREVIEW_TODAY;
    const exp = buildBreakup(field, e.annualCtc!, { asOn, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage });
    await openHrms(page, profile('emp_4', 'salary'));
    await expect(page.locator('#sal-ctc')).toHaveValue(String(e.annualCtc));

    for (const l of exp.lines) {
      const row = page.getByRole('row', { name: new RegExp(`^${l.name}`) }).first();
      await expect(row).toContainText(inr(l.monthly));
      await expect(row).toContainText(inr(l.monthly * 12));
    }
    await expect(page.getByTestId('gross-monthly')).toHaveText(inr(exp.monthlyGross));
    const wage = page.getByTestId('wage-rule');
    await expect(wage).toHaveAttribute('data-pass', 'fail');
    await expect(page.getByTestId('addback')).toHaveText(inr(exp.wageTest.addBack));
    expect(exp.wageTest.passes).toBe(false);
    await expect(page.getByTestId('wage-rule-impact')).toContainText(inr(exp.pfWage));

    // Take-home for November, from computePayslip with the November attendance row
    const slipFor = (ctc: number, overrides?: Record<string, number>) => computePayslip({
      employee: { ...e, annualCtc: ctc, structureOverrides: overrides }, structure: field, location: seed.locations.find((l) => l.id === e.locationId)!,
      attendance: attendanceFor(seed, e.id, '2026-11'), adjustments: [], loans: seed.loans, overtimeRule: seed.overtimeRules[0], shiftHours: 8, month: '2026-11', runId: 'x',
    });
    await expect(page.getByTestId('net-estimate')).toHaveText(inr(slipFor(e.annualCtc!).net));
    await expect(page.getByTestId('slip-gross')).toHaveText(inr(slipFor(e.annualCtc!).gross));

    // Edit the CTC: everything recomputes before saving
    await page.locator('#sal-ctc').fill('1200000');
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    const exp2 = buildBreakup(field, 1200000, { asOn, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage });
    await expect(page.getByTestId('gross-monthly')).toHaveText(inr(exp2.monthlyGross));
    await expect(page.getByTestId('addback')).toHaveText(inr(exp2.wageTest.addBack));
    await expect(page.getByTestId('net-estimate')).toHaveText(inr(slipFor(1200000).net));

    // Validation
    await page.locator('#sal-ctc').fill('12 lakh');
    await page.getByRole('button', { name: 'Save salary' }).click();
    await expect(page.getByText('Annual CTC must be a whole number of rupees').first()).toBeVisible();

    // An override on Travel Allowance re-balances the special allowance
    await page.locator('#sal-ctc').fill('1200000');
    await page.getByLabel('Override for Travel Allowance').fill('6000');
    const exp3 = buildBreakup(field, 1200000, { asOn, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: { f_travel: 6000 } });
    const special = (b: typeof exp3) => b.lines.find((l) => l.code === 'SPECIAL')!.monthly;
    expect(special(exp3)).toBe(special(exp2) - 1000);
    await expect(page.getByTestId('gross-monthly')).toHaveText(inr(exp3.monthlyGross));
    await page.getByRole('button', { name: 'Save salary' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Salary saved' })).toBeVisible();

    // Revision history comes from the change log
    const hist = page.getByRole('heading', { name: 'Revision history' }).locator('xpath=../..');
    await expect(hist.getByRole('row', { name: /Annual CTC/ })).toContainText('₹9,60,000');
    await expect(hist.getByRole('row', { name: /Annual CTC/ })).toContainText('₹12,00,000');
    await expect(hist.getByRole('row', { name: /Override: Travel Allowance/ })).toContainText('₹6,000');

    // Persisted: reload and the saved values come back
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor();
    await expect(page.locator('#sal-ctc')).toHaveValue('1200000');
    await expect(page.getByLabel('Override for Travel Allowance')).toHaveValue('6000');
    const db = await dbOf(page);
    expect(db.employees.find((x: { id: string }) => x.id === 'emp_4').structureOverrides).toEqual({ f_travel: 6000 });

    // Clearing the override removes it and logs that too
    await page.getByRole('button', { name: 'Clear all overrides' }).click();
    await page.getByRole('button', { name: 'Save salary' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Salary saved' })).toBeVisible();
    expect((await dbOf(page)).employees.find((x: { id: string }) => x.id === 'emp_4').structureOverrides).toBeUndefined();
  });

  test('salary: an office-structure CTC that passes the 50% rule; an employee with no structure gets one', async ({ page }) => {
    const e = emp('emp_1');       // Ritu: office structure, 24 lakh
    const std = seed.structures.find((s) => s.id === 'str_std')!;
    const exp = buildBreakup(std, e.annualCtc!, { asOn: PREVIEW_TODAY, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage });
    await openHrms(page, profile('emp_1', 'salary'));
    await expect(page.getByTestId('wage-rule')).toHaveAttribute('data-pass', 'pass');
    await expect(page.getByTestId('addback')).toHaveText(inr(0));
    expect(exp.wageTest.passes).toBe(true);
    await expect(page.getByTestId('gross-monthly')).toHaveText(inr(exp.monthlyGross));

    await page.goto(profile('emp_24', 'salary'));          // Aditya: onboarding, no structure yet
    await expect(page.getByText('No salary structure is set')).toBeVisible();
    await expect(page.getByText('Choose a structure and enter the annual CTC')).toBeVisible();
    await page.locator('#sal-structure').selectOption('str_std');
    await page.getByRole('button', { name: 'Save salary' }).click();
    await expect(page.getByText('Enter the annual CTC for this structure').first()).toBeVisible();
    await page.locator('#sal-ctc').fill('1800000');
    await page.getByRole('button', { name: 'Save salary' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Salary saved' })).toBeVisible();
    await page.getByRole('tab', { name: /^Overview/ }).click();
    await expect(page.getByTestId('check-Salary structure')).toHaveAttribute('data-state', 'ok');
  });

  test('leave: balances per type match the data', async ({ page }) => {
    const e = emp('emp_5');
    await openHrms(page, profile('emp_5', 'leave'));
    for (const b of seed.leaveBalances.filter((x) => x.employeeId === e.id)) {
      const t = seed.leaveTypes.find((x) => x.id === b.leaveTypeId)!;
      const expected = b.opening + b.accrued - b.taken - b.encashed - b.lapsed;
      await expect(page.getByTestId(`balance-${t.code}`)).toHaveText(String(expected));
    }
    await expect(page.getByRole('row', { name: /Earned Leave/ })).toBeVisible();
    await expect(page.getByText('Other leave types')).toBeVisible();

    await page.goto(profile('emp_24', 'leave'));
    await expect(page.getByText('No leave balances on file')).toBeVisible();
  });

  test('history: change log is searchable and the seed rows read in plain words', async ({ page }) => {
    await openHrms(page, profile('emp_1', 'history'));      // Ritu: seed has a CTC revision row
    await expect(page.getByRole('row', { name: /Annual CTC/ })).toContainText('₹21,60,000');
    await expect(page.getByRole('row', { name: /Annual CTC/ })).toContainText('₹24,00,000');
    await expect(page.getByRole('row', { name: /^Status/ })).toContainText('Onboarding');
    await page.getByRole('searchbox', { name: /Filter by field or value/ }).fill('ctc');
    await expect(page.locator('tbody tr')).toHaveCount(2);   // change log row + the (empty) access-log placeholder row
  });
});

// ───────────────────────────── layout ─────────────────────────────
test.describe('layout', () => {
  test('phone width: no horizontal page scroll on the list, new form and profile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    for (const path of [LIST, `${LIST}/new`, profile('emp_4'), profile('emp_4', 'salary'), profile('emp_2', 'statutory')]) {
      await openHrms(page, path);
      await page.waitForTimeout(400);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, path).toBeLessThanOrEqual(1);
    }
  });

  test('screenshots for review', async ({ page }) => {
    // The dashboard scrolls inside its own container, so tall shots use a tall viewport rather than fullPage.
    await page.setViewportSize({ width: 1280, height: 900 });
    await openHrms(page, LIST);
    await expect(page.getByTestId('employee-count')).toBeVisible();
    await page.screenshot({ path: '/tmp/hrms-shots/employees-list.png' });
    const tableOverflow = await page.evaluate(() => { const t = document.querySelector('table')!.parentElement!; return t.scrollWidth - t.clientWidth; });
    expect(tableOverflow).toBeLessThanOrEqual(1);   // the statutory column is on screen at 1280, no sideways scroll
    await page.setViewportSize({ width: 1280, height: 1500 });
    for (const tab of ['overview', 'statutory', 'salary', 'documents']) {
      await openHrms(page, profile('emp_4', tab));
      await page.waitForTimeout(600);
      await page.screenshot({ path: `/tmp/hrms-shots/employees-profile-${tab}.png` });
    }
    await openHrms(page, profile('emp_7', 'overview'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/tmp/hrms-shots/employees-profile-incomplete.png' });
    await openHrms(page, `${LIST}/new`);
    await page.getByRole('button', { name: 'Create employee' }).click();
    await page.setViewportSize({ width: 1280, height: 2600 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/tmp/hrms-shots/employees-new-errors.png' });
  });
});
