import { test, expect, type Page } from '@playwright/test';
import { openHrms } from './hrms-utils';
import { makeSeed, PREVIEW_TODAY } from '../src/lib/hrms/seed';
import { diffDays } from '../src/lib/hrms/format';
import { LABOUR_CODES } from '../src/lib/hrms/rules';
import {
  emptyRegistrationForm, entityGaps, entityToForm, expiryStatus, registrationToForm, stateCoverage, validateEntity, validateRegistration,
} from '../src/components/hrms/org/orgLogic';
import {
  analyseRow, compOffExpiryDays, crossesMidnight, describeLeavePolicy, duplicateDates, fmtWeek, holidayCounts, latestMonths, mondayOf, monthWeeks,
  overtimeToForm, paidMinutes, quarterMonths, shiftToForm, shiftToYear, spanMinutes, validateHoliday, validateOvertime, validateShift, withCompOffExpiry,
} from '../src/components/hrms/time/timeLogic';
import type { RosterRow } from '../src/lib/hrms/types';

/**
 * Organisation and Time & leave. The first block is pure logic (no browser); the rest drives the real screens on the
 * seeded sample data. "Today" is PREVIEW_TODAY (2026-11-07) everywhere, so every number here is reproducible.
 */

const seed = makeSeed();
const ORG = '/dashboard/hrms/organization';
const TIME = '/dashboard/hrms/time';
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const tab = (page: Page, name: RegExp) => page.getByRole('tab', { name }).first();

// ───────────────────────────────── pure logic ─────────────────────────────────
test.describe('organisation logic', () => {
  const retail = seed.entities.find((e) => e.id === 'ent_retail')!;
  const logi = seed.entities.find((e) => e.id === 'ent_logistics')!;

  test('registrations are flagged expired, expiring within 90 days, or valid', () => {
    expect(expiryStatus({ validTo: '2026-04-30' }).kind).toBe('expired');
    expect(expiryStatus({ validTo: '2026-12-31' })).toMatchObject({ kind: 'expiring', days: 54 });
    expect(expiryStatus({ validTo: '2027-02-05' })).toMatchObject({ kind: 'expiring', days: 90 }); // the 90th day is still inside the window
    expect(expiryStatus({ validTo: '2027-02-06' }).kind).toBe('valid');
    expect(expiryStatus({ validTo: PREVIEW_TODAY })).toMatchObject({ kind: 'expiring', days: 0 });
    expect(expiryStatus({}).kind).toBe('none');
  });

  test('state coverage lists what each state needs and finds the sample gaps', () => {
    const r = stateCoverage(seed, retail);
    expect(r.map((s) => s.state)).toEqual(['Delhi', 'Karnataka']);
    const ka = r.find((s) => s.state === 'Karnataka')!;
    expect(ka.items.map((i) => `${i.type}:${i.status}`)).toEqual(['pf:on_file', 'pt:on_file', 'lwf:on_file', 'shops:missing']);
    const dl = r.find((s) => s.state === 'Delhi')!;
    expect(dl.items.map((i) => `${i.type}:${i.status}`)).toEqual(['pf:on_file', 'shops:expiring']);
    expect(dl.notNeeded.map((n) => n.label)).toEqual(['ESI', 'PT', 'LWF']); // Delhi has no PT table row, nobody is under the ESI ceiling
    expect(entityGaps(seed, retail)).toBe(1);

    const mh = stateCoverage(seed, logi);
    expect(mh).toHaveLength(1);
    expect(mh[0]!.items.map((i) => `${i.type}:${i.status}`)).toEqual(['pf:on_file', 'esi:on_file', 'pt:on_file', 'lwf:missing', 'shops:missing']);
    expect(mh[0]!.items.find((i) => i.type === 'esi')!.confidence).toBe('reported');
    expect(entityGaps(seed, logi)).toBe(2);
  });

  test('ESI is only required where somebody earns under the ceiling', () => {
    const db = makeSeed();
    for (const e of db.employees) if (e.entityId === 'ent_logistics') e.annualCtc = 1_200_000; // lift everyone far above 21,000 a month
    const mh = stateCoverage(db, db.entities.find((e) => e.id === 'ent_logistics')!)[0]!;
    expect(mh.items.some((i) => i.type === 'esi')).toBe(false);
    expect(mh.notNeeded.some((n) => n.label === 'ESI')).toBe(true);
  });

  test('an expired registration still counts as a gap', () => {
    const db = makeSeed();
    const ent = db.entities.find((e) => e.id === 'ent_retail')!;
    ent.registrations.find((r) => r.id === 'reg_shops_dl')!.validTo = '2026-10-01';
    const dl = stateCoverage(db, ent).find((s) => s.state === 'Delhi')!;
    expect(dl.items.find((i) => i.type === 'shops')!.status).toBe('expired');
    expect(dl.gaps).toBe(1);
  });

  test('entity validation checks PAN, TAN, CIN, GSTIN and pincode, and ties the GSTIN to the PAN', () => {
    const good = entityToForm(retail);
    expect(validateEntity(good, [logi])).toEqual({});
    const bad = validateEntity({ ...good, pan: 'BAD', tan: 'X1', cin: 'nope', gstin: '07AABCM4821K1Z5X', pincode: '12', name: '', state: '', city: '', line1: '' }, [logi]);
    expect(Object.keys(bad).sort()).toEqual(['cin', 'city', 'gstin', 'line1', 'name', 'pan', 'pincode', 'state', 'tan']);
    expect(validateEntity({ ...good, pan: 'AAACM1234F' }, [logi]).gstin).toMatch(/does not match the entity PAN/);
    expect(validateEntity({ ...good, pan: logi.pan, gstin: '' }, [logi]).pan).toMatch(/already uses this PAN/);
    expect(validateEntity({ ...good, signName: 'Someone', signDesignation: '' }, [logi]).signDesignation).toBeTruthy();
  });

  test('registration validation: state for PT/LWF/Shops, number format for TAN and GST, dates in order, no exact duplicate', () => {
    const f = { ...emptyRegistrationForm(), type: 'pt' as const, number: 'X1' };
    expect(validateRegistration(f, retail).state).toMatch(/registered per state/);
    expect(validateRegistration({ ...f, type: 'gst', number: 'abc' }, retail).number).toBeTruthy();
    expect(validateRegistration({ ...f, type: 'tan', number: 'DELM12345B' }, retail)).toEqual({});
    expect(validateRegistration({ ...f, state: 'Karnataka', validFrom: '2026-05-01', validTo: '2026-04-01' }, retail).validTo).toMatch(/on or after/);
    const dup = registrationToForm(retail.registrations.find((r) => r.id === 'reg_pt_ka')!);
    expect(validateRegistration(dup, retail).number).toMatch(/already on file/);
    expect(validateRegistration(dup, retail, 'reg_pt_ka')).toEqual({});
  });
});

test.describe('time and leave logic', () => {
  test('shift arithmetic: paid duration, midnight crossing, night flag', () => {
    expect(spanMinutes('09:30', '18:30')).toBe(540);
    expect(paidMinutes({ start: '09:30', end: '18:30', breakMinutes: 60 })).toBe(480);
    expect(spanMinutes('22:00', '06:00')).toBe(480);
    expect(paidMinutes({ start: '22:00', end: '06:00', breakMinutes: 45 })).toBe(435);
    expect(crossesMidnight('22:00', '06:00')).toBe(true);
    expect(crossesMidnight('09:00', '18:00')).toBe(false);
    expect(spanMinutes('10:00', '10:00')).toBe(0);
    // the seed's own night flags agree with the times
    for (const s of seed.shifts) expect(crossesMidnight(s.start, s.end)).toBe(s.isNight);
  });

  test('shift validation', () => {
    const night = seed.shifts.find((s) => s.id === 'sh_night')!;
    const base = shiftToForm(seed.shifts.find((s) => s.id === 'sh_gen')!);
    expect(validateShift(base, seed.shifts.filter((s) => s.id !== 'sh_gen')).errors).toEqual({});
    const e = validateShift({ ...base, name: 'early', end: base.start, breakMinutes: '300', graceMinutes: '-1', fullDayHours: '20', halfDayHours: '0' }, seed.shifts).errors;
    expect(e.name).toMatch(/already a shift/);
    expect(e.end).toMatch(/same time/);
    expect(e.breakMinutes).toBeTruthy();
    expect(e.graceMinutes).toBeTruthy();
    expect(e.fullDayHours).toBeTruthy();
    expect(e.halfDayHours).toBeTruthy();
    // the seeded night shift pays 7 h 15 min against an 8 h full day: a warning, not an error
    const v = validateShift(shiftToForm(night), seed.shifts.filter((s) => s.id !== night.id));
    expect(v.errors).toEqual({});
    expect(v.warnings[0]).toMatch(/7 h 15 min/);
  });

  test('roster checks: weekly off, 48 hours, consent for women on nights, and a streak that crosses the week boundary', () => {
    const shifts = new Map(seed.shifts.map((s) => [s.id, s]));
    const row = (days: string[], employeeId = 'emp_4'): RosterRow => ({ employeeId, weekStart: '2026-11-02', days });
    const six = ['sh_gen', 'sh_gen', 'sh_gen', 'sh_gen', 'sh_gen', 'sh_gen', 'off'];
    expect(analyseRow(row(six), undefined, { gender: 'male' }, shifts, true).warnings).toEqual([]);
    expect(analyseRow(row(six), undefined, { gender: 'male' }, shifts, true).hours).toBe(48);

    const seven = analyseRow(row(Array(7).fill('sh_gen')), undefined, { gender: 'male' }, shifts, true);
    expect(seven.warnings.map((w) => w.id)).toEqual(['no_off', 'hours']);
    expect(seven.hours).toBe(56);

    const retail = analyseRow(row(['sh_retail', 'sh_retail', 'sh_retail', 'sh_retail', 'sh_retail', 'sh_retail', 'off']), undefined, { gender: 'male' }, shifts, true);
    expect(retail.hours).toBe(51); // 6 x 8.5
    expect(retail.warnings.map((w) => w.id)).toEqual(['hours']);

    // last week ended with 4 working days, this week starts with 3 before the first off: 7 in a row
    const prev = { ...row(['off', 'sh_gen', 'sh_gen', 'sh_gen', 'sh_gen', 'sh_gen', 'sh_gen']), weekStart: '2026-10-26' };
    const thisWeek = row(['sh_gen', 'off', 'sh_gen', 'sh_gen', 'sh_gen', 'sh_gen', 'off']);
    expect(analyseRow(thisWeek, prev, { gender: 'male' }, shifts, true).warnings.map((w) => w.text)).toEqual(['7 working days in a row, counting last week']);
    expect(analyseRow(thisWeek, undefined, { gender: 'male' }, shifts, true).warnings).toEqual([]);

    const nights = analyseRow(row(['sh_night', 'sh_night', 'off', 'sh_gen', 'sh_gen', 'off', 'off']), undefined, { gender: 'female' }, shifts, true);
    expect(nights.consentDays).toEqual([0, 1]);
    expect(analyseRow(row(['sh_night', 'off', 'off', 'off', 'off', 'off', 'off']), undefined, { gender: 'female' }, shifts, false).warnings).toEqual([]);
    expect(analyseRow(row(['sh_night', 'off', 'off', 'off', 'off', 'off', 'off']), undefined, { gender: 'male' }, shifts, true).warnings).toEqual([]);
  });

  test('weeks start on Monday', () => {
    expect(mondayOf(PREVIEW_TODAY)).toBe('2026-11-02');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
    expect(fmtWeek('2026-11-02')).toBe('2 Nov to 8 Nov 2026');
    expect(fmtWeek('2026-12-28')).toBe('28 Dec to 3 Jan 2027');
  });

  test('overtime rule: the multiplier floor is an error, the quarterly cap above the limit a warning', () => {
    const f = overtimeToForm(seed.overtimeRules[0]!);
    expect(validateOvertime(f)).toEqual({ errors: {}, warnings: {} });
    expect(validateOvertime({ ...f, rateMultiplier: '1.5' }).errors.rateMultiplier).toMatch(/2x/);
    expect(validateOvertime({ ...f, rateMultiplier: String(LABOUR_CODES.overtimeMultiplier) }).errors.rateMultiplier).toBeUndefined();
    expect(validateOvertime({ ...f, quarterlyCapHours: '145' }).warnings.quarterlyCapHours).toMatch(/144/);
    expect(validateOvertime({ ...f, quarterlyCapHours: '145' }).errors.quarterlyCapHours).toBeUndefined();
    expect(validateOvertime({ ...f, quarterlyCapHours: '144' }).warnings.quarterlyCapHours).toBeUndefined();
    expect(validateOvertime({ ...f, appliesTo: [] }).errors.appliesTo).toBeTruthy();
  });

  test('quarters follow the Indian financial year', () => {
    expect(quarterMonths('2026-11')).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(quarterMonths('2027-02')).toEqual(['2027-01', '2027-02', '2027-03']);
    expect(quarterMonths('2026-04')).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(latestMonths(seed.attendance, 3)).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  test('leave policy sentence matches the policy fields', () => {
    const el = seed.leaveTypes.find((l) => l.code === 'EL')!;
    expect(describeLeavePolicy(el)).toContain('Earns 1.25 days a month after 6 months. Up to 30 days carry forward for 24 months. Up to 30 days can be encashed, and on exit.');
    expect(describeLeavePolicy({ ...el, encashment: { allowed: true, maxDays: 10, onExit: false } })).toContain('Up to 10 days can be encashed.');
    expect(describeLeavePolicy({ ...el, carryForward: { allowed: false, maxDays: 0, expiryMonths: 0 } })).toContain('Unused days lapse at year end.');
    expect(describeLeavePolicy({ ...el, accrual: { mode: 'yearly', days: 1, afterMonths: 0 } })).toContain('Gets 1 day a year.');
    const co = seed.leaveTypes.find((l) => l.code === 'CO')!;
    expect(compOffExpiryDays(co.description)).toBe(60);
    expect(describeLeavePolicy(co)).toContain('Lapses after 60 days.');
    expect(withCompOffExpiry(co.description, 45)).toContain('Lapses after 45 days.');
    expect(withCompOffExpiry(co.description, undefined)).not.toMatch(/Lapses/);
    expect(describeLeavePolicy(seed.leaveTypes.find((l) => l.code === 'LWP')!)).toMatch(/^Unpaid/);
  });

  test('holiday helpers: duplicates, counts, leap day, month grids, list validation', () => {
    const dl = seed.holidayLists.find((h) => h.id === 'hol_dl')!;
    expect(holidayCounts(dl.holidays)).toEqual({ fixed: 7, optional: 1, total: 8, duplicates: 0 });
    const withDup = [...dl.holidays, { date: '2026-11-08', name: 'Bhai Dooj', optional: false }];
    expect([...duplicateDates(withDup)]).toEqual(['2026-11-08']);
    expect(holidayCounts(withDup).duplicates).toBe(1);
    expect(shiftToYear('2024-02-29', 2025)).toBe('2025-02-28');
    expect(shiftToYear('2024-02-29', 2028)).toBe('2028-02-29');
    expect(shiftToYear('2026-01-26', 2027)).toBe('2027-01-26');
    const nov = monthWeeks(2026, 11);
    // 1 Nov 2026 is a Sunday, so the first week has six empty cells before it
    expect(nov[0]!.slice(0, 6).every((c) => c === null)).toBe(true);
    expect(nov[0]![6]).toBe('2026-11-01');
    expect(nov.flat().filter(Boolean)).toHaveLength(30);
    expect(validateHoliday({ date: '2027-01-01', name: 'x', optional: false }, dl).errors.date).toMatch(/2026/);
    expect(validateHoliday({ date: '2026-11-08', name: 'Bhai Dooj', optional: false }, dl).warning).toMatch(/Diwali/);
    expect(validateHoliday({ date: '2026-11-08', name: '', optional: false }, dl).errors.name).toBeTruthy();
  });
});

// ───────────────────────────────── organisation screens ─────────────────────────────────
test.describe('organisation screens', () => {
  test('legal entities show registrations with expiry badges and the state coverage gaps', async ({ page }) => {
    await openHrms(page, ORG);
    await expect(page.getByRole('heading', { level: 1, name: 'Organisation' })).toBeVisible();
    await expect(page.getByTestId('entity-card-ent_retail')).toContainText('Meridian Retail Pvt Ltd');
    await expect(page.getByTestId('entity-card-ent_retail')).toContainText('1 registration gap');
    await expect(page.getByTestId('entity-card-ent_logistics')).toContainText('2 registration gaps');

    const shops = page.getByRole('row').filter({ hasText: 'SE/DL/2016/88213' });
    await expect(shops).toContainText(`Expires in ${diffDays(PREVIEW_TODAY, '2026-12-31')} days`);
    await expect(page.getByTestId('coverage-gap-count')).toHaveText('1');
    await expect(page.getByTestId('coverage-Karnataka-shops')).toContainText('Missing');
    await expect(page.getByTestId('coverage-Karnataka-pt')).toContainText('On file');
    await expect(page.getByTestId('coverage-Delhi-shops')).toContainText('On file, expiring');
    await expect(page.getByTestId('coverage-Delhi')).toContainText('Not needed here');
    await expect(page.getByTestId('coverage-Karnataka-pt')).toContainText('Sample, confirm'); // the PT table carries its confidence badge

    await page.getByTestId('entity-card-ent_logistics').click();
    const clra = page.getByRole('row').filter({ hasText: 'CLRA/MH/2021/0112' });
    await expect(clra).toContainText(`Expired ${diffDays('2026-04-30', PREVIEW_TODAY)} days ago`);
    await expect(page.getByTestId('coverage-gap-count')).toHaveText('2');
    await expect(page.getByTestId('coverage-Maharashtra-lwf')).toContainText('Missing');
    await expect(page.getByTestId('coverage-Maharashtra-esi')).toContainText('On file');
  });

  test('adding the missing registration closes the gap', async ({ page }) => {
    await openHrms(page, ORG);
    await page.getByRole('button', { name: 'Add Shops registration for Karnataka' }).click();
    const d = dialog(page, /Add registration to Meridian Retail/);
    await expect(d.getByLabel(/^Registration/)).toHaveValue('shops');
    await expect(d.getByLabel(/^State/)).toHaveValue('Karnataka');
    await d.getByLabel(/^Number/).fill('SE/KA/2024/5521');
    await d.getByLabel(/^Valid from/).fill('2024-04-01');
    await d.getByLabel(/^Valid to/).fill('2027-03-31');
    await d.getByRole('button', { name: 'Add registration' }).click();
    await expect(d).toBeHidden();
    await expect(page.getByTestId('coverage-Karnataka-shops')).toContainText('On file');
    await expect(page.getByTestId('coverage-Karnataka-shops')).toContainText('SE/KA/2024/5521');
    await expect(page.getByTestId('coverage-gap-count')).toHaveCount(0);
    await expect(page.getByTestId('entity-card-ent_retail')).toContainText('No gaps');
    await expect(page.getByRole('row').filter({ hasText: 'SE/KA/2024/5521' })).toContainText('Valid');
  });

  test('registration form validates and refuses an exact duplicate', async ({ page }) => {
    await openHrms(page, ORG);
    await page.getByRole('button', { name: 'Add registration', exact: true }).click();
    const d = dialog(page, /Add registration to/);
    await d.getByLabel(/^Registration/).selectOption('pt');
    await d.getByRole('button', { name: 'Add registration' }).click();
    await expect(d.getByText('PT is registered per state. Choose the state')).toBeVisible();
    await expect(d.getByText('Registration number is required')).toBeVisible();
    await d.getByLabel(/^State/).selectOption('Karnataka');
    await d.getByLabel(/^Number/).fill('PT/KA/0456712');
    await d.getByRole('button', { name: 'Add registration' }).click();
    await expect(d.getByText('This registration is already on file for the entity')).toBeVisible();
    await d.getByLabel(/^Number/).fill('PT/KA/777');
    await d.getByLabel(/^Valid from/).fill('2026-06-01');
    await d.getByLabel(/^Valid to/).fill('2026-01-01');
    await d.getByRole('button', { name: 'Add registration' }).click();
    await expect(d.getByText(/Valid to must be on or after/)).toBeVisible();
    await d.getByLabel(/^Valid to/).fill('2027-06-01');
    await d.getByRole('button', { name: 'Add registration' }).click();
    await expect(d).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText: 'PT/KA/777' })).toBeVisible();
  });

  test('entity form checks PAN, TAN, GSTIN and pincode, then saves the change', async ({ page }) => {
    await openHrms(page, ORG);
    await page.getByRole('button', { name: 'Edit Meridian Retail Pvt Ltd' }).click();
    const d = dialog(page, 'Edit Meridian Retail Pvt Ltd');
    await d.getByLabel(/^PAN/).fill('BADPAN');
    await d.getByLabel(/^TAN/).fill('X1');
    await d.getByLabel(/^Pincode/).fill('12');
    await d.getByRole('button', { name: 'Save changes' }).click();
    await expect(d.getByText('PAN looks like ABCDE1234F')).toBeVisible();
    await expect(d.getByText('TAN looks like DELA12345B')).toBeVisible();
    await expect(d.getByText('Pincode is 6 digits')).toBeVisible();
    await expect(d.getByText(/Fix the 3 highlighted fields/)).toBeVisible();
    // a valid PAN that disagrees with the GSTIN is still an error
    await d.getByLabel(/^PAN/).fill('AAACM1234F');
    await d.getByLabel(/^TAN/).fill('DELM12345B');
    await d.getByLabel(/^Pincode/).fill('110020');
    await d.getByRole('button', { name: 'Save changes' }).click();
    await expect(d.getByText(/does not match the entity PAN/)).toBeVisible();
    await d.getByLabel(/^PAN/).fill('AABCM4821K');
    await d.getByLabel(/^Legal name/).fill('Meridian Retail Private Limited');
    await d.getByRole('button', { name: 'Save changes' }).click();
    await expect(d).toBeHidden();
    await expect(page.getByTestId('entity-card-ent_retail')).toContainText('Meridian Retail Private Limited');
    await expect(page.getByRole('heading', { name: 'Meridian Retail Private Limited' })).toBeVisible();
  });

  test('removing a registration asks first and reopens the gap', async ({ page }) => {
    await openHrms(page, ORG);
    await page.getByRole('button', { name: /^Remove Shops and Establishments SE\/DL/ }).click();
    const d = dialog(page, 'Remove registration');
    await expect(d).toContainText('SE/DL/2016/88213');
    await d.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'SE/DL/2016/88213' })).toBeVisible();
    await page.getByRole('button', { name: /^Remove Shops and Establishments SE\/DL/ }).click();
    await dialog(page, 'Remove registration').getByRole('button', { name: 'Remove registration' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'SE/DL/2016/88213' })).toHaveCount(0);
    await expect(page.getByTestId('coverage-Delhi-shops')).toContainText('Missing');
    await expect(page.getByTestId('coverage-gap-count')).toHaveText('2');
  });

  test('an entity that still has people cannot be removed', async ({ page }) => {
    await openHrms(page, ORG);
    await page.getByRole('button', { name: 'Remove Meridian Retail Pvt Ltd' }).click();
    const d = dialog(page, 'Cannot remove Meridian Retail Pvt Ltd');
    const staff = seed.employees.filter((e) => e.entityId === 'ent_retail');
    await expect(d).toContainText(`${staff.length} employees`);
    await expect(d).toContainText('2 locations');
    await d.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByTestId('entity-card-ent_retail')).toBeVisible();
  });

  test('a new legal entity can be added and then removed', async ({ page }) => {
    await openHrms(page, ORG);
    await page.getByRole('button', { name: 'Add legal entity' }).first().click();
    const d = dialog(page, 'Add legal entity');
    await d.getByRole('button', { name: 'Add entity' }).click();
    await expect(d.getByText('Legal name is required')).toBeVisible();
    await d.getByLabel(/^Legal name/).fill('Meridian Services LLP');
    await d.getByLabel(/^PAN/).fill('AAHFM1111A');
    await d.getByLabel(/^TAN/).fill('BLRM55555C');
    await d.getByLabel(/^Address line 1/).fill('5 MG Road');
    await d.getByLabel(/^City/).fill('Bengaluru');
    await d.getByLabel(/^State/).selectOption('Karnataka');
    await d.getByLabel(/^Pincode/).fill('560001');
    await d.getByRole('button', { name: 'Add entity' }).click();
    await expect(d).toBeHidden();
    await expect(page.getByTestId('entity-card-ent_retail')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Meridian Services LLP' })).toBeVisible();
    await expect(page.getByText('No people in any state yet')).toBeVisible();
    await page.getByRole('button', { name: 'Remove Meridian Services LLP' }).click();
    await dialog(page, 'Remove legal entity').getByRole('button', { name: 'Remove entity' }).click();
    await expect(page.locator('[data-testid^="entity-card-"]')).toHaveCount(2);
  });

  test('locations: metro default follows the city, removal is blocked while people are assigned', async ({ page }) => {
    await openHrms(page, ORG);
    await tab(page, /^Locations/).click();
    await expect(page.getByRole('row').filter({ hasText: 'Delhi HQ' })).toContainText('Meridian Retail Pvt Ltd');

    await page.getByRole('button', { name: 'Add location', exact: true }).click();
    const d = dialog(page, 'Add location');
    await d.getByRole('button', { name: 'Add location' }).click();
    await expect(d.getByText('Location name is required')).toBeVisible();
    await d.getByLabel(/^Location name/).fill('Pune Hub');
    await d.getByLabel(/^Legal entity/).selectOption({ label: 'Meridian Logistics LLP' });
    await d.getByLabel(/^State/).selectOption('Maharashtra');
    await d.getByLabel(/^City/).fill('Pune');
    await expect(d.getByLabel('Metro city for HRA')).toBeChecked(); // Pune joined the list on 1 Apr 2026
    await d.getByLabel(/^City/).fill('Jaipur');
    await expect(d.getByLabel('Metro city for HRA')).not.toBeChecked();
    await d.getByLabel(/^City/).fill('Pune');
    await expect(d.getByLabel('Metro city for HRA')).toBeChecked();
    await expect(d).toContainText('Reported, confirm'); // the metro list carries its confidence
    await d.getByLabel(/^Holiday list/).selectOption({ label: 'Maharashtra 2026' });
    await d.getByRole('button', { name: 'Add location' }).click();
    await expect(d).toBeHidden();
    const row = page.getByRole('row').filter({ hasText: 'Pune Hub' });
    await expect(row).toContainText('Metro, 50%');
    await expect(row).toContainText('Maharashtra 2026');

    // Delhi HQ has people
    await page.getByRole('button', { name: 'Remove Delhi HQ' }).click();
    const blocked = dialog(page, 'Cannot remove Delhi HQ');
    await expect(blocked).toContainText(`${seed.employees.filter((e) => e.locationId === 'loc_del').length} employees`);
    await blocked.getByRole('button', { name: 'Got it' }).click();

    // an empty one goes after a confirmation
    await page.getByRole('button', { name: 'Remove Pune Hub' }).click();
    await dialog(page, 'Remove location').getByRole('button', { name: 'Remove location' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Pune Hub' })).toHaveCount(0);
  });

  test('location search and entity filter narrow the table; the entity of a staffed location is locked', async ({ page }) => {
    await openHrms(page, ORG);
    await tab(page, /^Locations/).click();
    await page.getByLabel('Filter by legal entity').selectOption('ent_logistics');
    await expect(page.getByRole('row').filter({ hasText: 'Bhiwandi Warehouse' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Delhi HQ' })).toHaveCount(0);
    await page.getByLabel('Filter by legal entity').selectOption('all');
    await page.getByLabel('Search locations').fill('bengal');
    await expect(page.getByRole('row').filter({ hasText: 'Bengaluru Office' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Delhi HQ' })).toHaveCount(0);
    await page.getByLabel('Search locations').fill('zzz');
    await expect(page.getByText('No location matches this search.')).toBeVisible();
    await page.getByLabel('Search locations').fill('');
    await page.getByRole('button', { name: 'Edit Delhi HQ' }).click();
    const d = dialog(page, 'Edit Delhi HQ');
    await d.getByLabel(/^Legal entity/).selectOption({ label: 'Meridian Logistics LLP' });
    await d.getByRole('button', { name: 'Save changes' }).click();
    await expect(d.getByText(/Move them before changing the entity/)).toBeVisible();
    await d.getByRole('button', { name: 'Cancel' }).click();
  });

  test('departments and designations: add, edit, headcount, and delete blocked while in use', async ({ page }) => {
    await openHrms(page, ORG);
    await tab(page, /^Departments/).click();
    const wh = seed.employees.filter((e) => e.departmentId === 'dep_wh' && e.status !== 'exited').length;
    await expect(page.getByTestId('headcount-dep_wh')).toHaveText(String(wh));
    await page.getByRole('button', { name: 'Remove Warehouse' }).click();
    const blocked = dialog(page, 'Cannot remove Warehouse');
    await expect(blocked).toContainText(`${wh} employees`);
    await blocked.getByRole('button', { name: 'Got it' }).click();

    await page.getByRole('button', { name: 'Add department', exact: true }).click();
    const d = dialog(page, 'Add department');
    await d.getByRole('button', { name: 'Add department' }).click();
    await expect(d.getByText('Department name is required')).toBeVisible();
    await d.getByLabel(/^Department name/).fill('operations');
    await d.getByRole('button', { name: 'Add department' }).click();
    await expect(d.getByText(/There is already a department called operations/)).toBeVisible();
    await d.getByLabel(/^Department name/).fill('Legal');
    await d.getByLabel(/^Department head/).selectOption({ label: 'Ritu Malhotra (MER-1001)' });
    await d.getByRole('button', { name: 'Add department' }).click();
    await expect(d).toBeHidden();
    const legal = page.getByRole('row').filter({ hasText: 'Legal' });
    await expect(legal).toContainText('Ritu Malhotra');
    await expect(legal).toContainText('0');
    await page.getByRole('button', { name: 'Edit Legal' }).click();
    await dialog(page, 'Edit Legal').getByLabel(/^Department name/).fill('Legal and Compliance');
    await dialog(page, 'Edit Legal').getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Legal and Compliance' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove Legal and Compliance' }).click();
    await dialog(page, 'Remove department').getByRole('button', { name: 'Remove department' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Legal and Compliance' })).toHaveCount(0);

    await tab(page, /^Designations/).click();
    await expect(page.getByTestId('headcount-des_wh')).toHaveText(String(seed.employees.filter((e) => e.designationId === 'des_wh' && e.status !== 'exited').length));
    await page.getByRole('button', { name: 'Remove Warehouse Associate' }).click();
    await dialog(page, 'Cannot remove Warehouse Associate').getByRole('button', { name: 'Got it' }).click();
    await page.getByRole('button', { name: 'Add designation', exact: true }).click();
    const g = dialog(page, 'Add designation');
    await g.getByLabel(/^Designation name/).fill('Trainee');
    await g.getByLabel(/^Grade/).fill('T1');
    await g.getByRole('button', { name: 'Add designation' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Trainee' })).toContainText('T1');
    await page.getByLabel('Search designations').fill('train');
    await expect(page.getByRole('row').filter({ hasText: 'Software Engineer' })).toHaveCount(0);
  });

  test('changes survive a reload (the preview store is persisted)', async ({ page }) => {
    await openHrms(page, ORG);
    await tab(page, /^Departments/).click();
    await page.getByRole('button', { name: 'Add department', exact: true }).click();
    await dialog(page, 'Add department').getByLabel(/^Department name/).fill('Procurement');
    await dialog(page, 'Add department').getByRole('button', { name: 'Add department' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Procurement' })).toBeVisible();
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
    await expect(page.getByRole('row').filter({ hasText: 'Procurement' })).toBeVisible(); // ?tab=departments came back too
  });
});

// ───────────────────────────────── time and leave screens ─────────────────────────────────
test.describe('time and leave screens', () => {
  test('shifts: paid duration, derived night flag, validation, and delete blocked while assigned', async ({ page }) => {
    await openHrms(page, TIME);
    await expect(page.getByRole('heading', { level: 1, name: 'Time and leave' })).toBeVisible();
    await expect(page.getByTestId('paid-sh_gen')).toContainText('8 h');
    await expect(page.getByTestId('paid-sh_night')).toContainText('7 h 15 min');
    await expect(page.getByTestId('paid-sh_night')).toContainText('Under the 8 h full day');
    await expect(page.getByTestId('paid-sh_retail')).toContainText('8 h 30 min');

    await page.getByRole('button', { name: 'Add shift', exact: true }).click();
    const d = dialog(page, 'Add shift');
    await d.getByRole('button', { name: 'Add shift' }).click();
    await expect(d.getByText('Shift name is required')).toBeVisible();
    await d.getByLabel(/^Shift name/).fill('General');
    await d.getByRole('button', { name: 'Add shift' }).click();
    await expect(d.getByText(/There is already a shift called General/)).toBeVisible();
    await d.getByLabel(/^Shift name/).fill('Late');
    await d.getByLabel(/^Starts/).fill('14:00');
    await d.getByLabel(/^Ends/).fill('14:00');
    await d.getByRole('button', { name: 'Add shift' }).click();
    await expect(d.getByText('Start and end cannot be the same time')).toBeVisible();
    await d.getByLabel(/^Ends/).fill('02:00');
    await expect(d.getByTestId('shift-derived')).toContainText('Night shift: Yes');
    await expect(d.getByTestId('shift-derived')).toContainText('Paid duration: 11 h');
    await d.getByLabel(/^Full day/).fill('13');
    await d.getByRole('button', { name: 'Add shift' }).click();
    await expect(d.getByText(/longer than the 12 h on duty/)).toBeVisible();
    await d.getByLabel(/^Full day/).fill('8');
    await d.getByRole('radio', { name: 'Coral' }).click();
    await d.getByRole('button', { name: 'Add shift' }).click();
    await expect(d).toBeHidden();
    const late = page.getByRole('row').filter({ hasText: 'Late' });
    await expect(late).toContainText('14:00 to 02:00');
    await expect(late).toContainText('(next day)');
    await expect(late).toContainText('Night');

    await page.getByRole('button', { name: 'Delete General' }).click();
    const blocked = dialog(page, 'Cannot delete General');
    await expect(blocked).toContainText(`${seed.employees.filter((e) => e.shiftId === 'sh_gen' && e.status !== 'exited').length} employees`);
    await expect(blocked).toContainText('roster days');
    await blocked.getByRole('button', { name: 'Got it' }).click();

    await page.getByRole('button', { name: 'Delete Late' }).click();
    await dialog(page, 'Delete shift').getByRole('button', { name: 'Delete shift' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Late' })).toHaveCount(0);
  });

  test('roster: a cell edit saves at once and the row, hours and consent checks respond', async ({ page }) => {
    await openHrms(page, `${TIME}?tab=roster`);
    await expect(page.getByTestId('week-label')).toHaveText('2 Nov to 8 Nov 2026');
    await expect(page.getByTestId('roster-row-emp_4')).toContainText('Rohit Chauhan');
    await expect(page.getByTestId('warn-emp_4-no_off')).toHaveCount(0);
    await expect(page.getByTestId('roster-row-emp_4')).toContainText('All checks pass');

    // working the Sunday as well: no weekly off and 56 scheduled hours
    await page.getByTestId('cell-emp_4-6').click();
    await page.getByLabel('Shift for Rohit Chauhan, Sunday 8 Nov').selectOption('sh_gen');
    await expect(page.getByTestId('warn-emp_4-no_off')).toHaveText('No weekly off this week');
    await expect(page.getByTestId('warn-emp_4-hours')).toHaveText('56 scheduled hours (limit 48)');
    await expect(page.getByTestId('roster-row-emp_4')).toContainText('56 h');
    await expect(page.getByTestId('coverage-day-6')).toContainText('13 off'); // all 14 were off on Sunday, now Rohit is on

    // the saved edit survives a reload
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
    await expect(page.getByTestId('warn-emp_4-no_off')).toBeVisible();

    // and back to a weekly off clears both warnings
    await page.getByTestId('cell-emp_4-6').click();
    await page.getByLabel('Shift for Rohit Chauhan, Sunday 8 Nov').selectOption('off');
    await expect(page.getByTestId('roster-row-emp_4')).toContainText('All checks pass');

    // Rekha works nights and is a woman: consent is flagged because the overtime rule asks for it
    await expect(page.getByTestId('warn-emp_14-consent')).toHaveText('Night shift, consent needed (6 days)');
    await expect(page.getByTestId('cell-emp_14-0')).toContainText('Consent needed');
    await expect(page.getByTestId('roster-row-emp_14')).toContainText('43.5 h');
  });

  test('roster: week controls, default rows, copy last week, and a streak that runs across the boundary', async ({ page }) => {
    await openHrms(page, `${TIME}?tab=roster`);
    // make Rohit work every day of this week, so next week's copy carries a 7 day run into it
    await page.getByTestId('cell-emp_4-6').click();
    await page.getByLabel('Shift for Rohit Chauhan, Sunday 8 Nov').selectOption('sh_gen');

    await page.getByRole('button', { name: 'Previous week' }).click();
    await expect(page.getByTestId('week-label')).toHaveText('26 Oct to 1 Nov 2026');
    await expect(page.getByText('Nobody is rostered for 26 Oct to 1 Nov 2026')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy last week' }).first()).toBeDisabled();
    await page.getByRole('button', { name: 'Create from default shifts' }).click();
    const rosterable = seed.employees.filter((e) => e.status === 'active' || e.status === 'on_notice').length;
    await expect(page.getByTestId('roster-grid').locator('tbody tr')).toHaveCount(rosterable);
    // default pattern: own shift Monday to Saturday, Sunday off
    await expect(page.getByTestId('cell-emp_12-0')).toContainText('Early');
    await expect(page.getByTestId('cell-emp_12-6')).toContainText('Off');

    await page.getByRole('button', { name: 'Next week' }).click();
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(page.getByTestId('week-label')).toHaveText('9 Nov to 15 Nov 2026');
    await expect(page.getByText('Nobody is rostered for 9 Nov to 15 Nov 2026')).toBeVisible();
    await page.getByRole('button', { name: 'Copy last week' }).first().click();
    await expect(page.getByTestId('roster-grid').locator('tbody tr')).toHaveCount(14);
    await expect(page.getByTestId('warn-emp_4-no_off')).toBeVisible(); // Rohit's no-off week was copied

    // give him a day off midway: the 7 days of last week still count towards the run
    await page.getByTestId('cell-emp_4-2').click();
    await page.getByLabel('Shift for Rohit Chauhan, Wednesday 11 Nov').selectOption('off');
    await expect(page.getByTestId('warn-emp_4-no_off')).toHaveCount(0);
    await expect(page.getByTestId('warn-emp_4-streak')).toHaveText('9 working days in a row, counting last week');

    // the people who are not on this week are offered in one click
    const missing = rosterable - 14;
    await page.getByRole('button', { name: `Add ${missing} not on this week` }).click();
    await expect(page.getByTestId('roster-grid').locator('tbody tr')).toHaveCount(rosterable);

    // copying over an existing week asks first
    await page.getByRole('button', { name: 'Copy last week' }).first().click();
    const d = dialog(page, "Replace this week's roster rows");
    await expect(d).toContainText('already has roster rows');
    await d.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('warn-emp_4-streak')).toBeVisible(); // nothing was replaced
    await page.getByRole('button', { name: 'Copy last week' }).first().click();
    await dialog(page, "Replace this week's roster rows").getByRole('button', { name: 'Copy and replace' }).click();
    // Rohit's row is last week's again: no weekly off, and now 14 days in a row with last week's 7
    await expect(page.getByTestId('warn-emp_4-no_off')).toBeVisible();
    await expect(page.getByTestId('warn-emp_4-streak')).toHaveText('14 working days in a row, counting last week');
  });

  test('roster: filters narrow the grid', async ({ page }) => {
    await openHrms(page, `${TIME}?tab=roster`);
    await page.getByLabel('Filter by location').selectOption('loc_mum');
    await expect(page.getByTestId('roster-grid').locator('tbody tr')).toHaveCount(seed.roster.filter((r) => seed.employees.find((e) => e.id === r.employeeId)!.locationId === 'loc_mum').length);
    await page.getByLabel('Filter by location').selectOption('all');
    await page.getByLabel('Search people').fill('neha');
    await expect(page.getByTestId('roster-grid').locator('tbody tr')).toHaveCount(1);
    await page.getByLabel('Search people').fill('qqq');
    await expect(page.getByText("Nobody on this week's roster matches the filters.")).toBeVisible();
  });

  test('overtime: the multiplier floor blocks saving, the cap warns, and the table matches the attendance data', async ({ page }) => {
    await openHrms(page, `${TIME}?tab=overtime`);
    const mult = page.getByLabel(/^Pay multiplier/);
    const cap = page.getByLabel(/^Quarterly cap/);
    await expect(mult).toHaveValue('2');
    await mult.fill('1.5');
    await expect(page.getByText(/cannot pay less than 2x the ordinary rate/)).toBeVisible();
    await page.getByRole('button', { name: 'Save rule' }).click();
    await expect(page.getByText('Fix the highlighted field to save.')).toBeVisible();
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
    await expect(page.getByLabel(/^Pay multiplier/)).toHaveValue('2'); // the invalid value was never saved

    await page.getByLabel(/^Pay multiplier/).fill('2.5');
    await expect(page.getByText(/cannot pay less than/)).toHaveCount(0);
    await page.getByLabel(/^Quarterly cap/).fill('200');
    await expect(page.getByText(/200 hours is above the 144 hour quarterly limit/)).toBeVisible();
    await page.getByRole('button', { name: 'Save rule' }).click();
    await expect(page.getByText('Saved. Payroll uses this rule for overtime pay.')).toBeVisible();
    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
    await expect(page.getByLabel(/^Pay multiplier/)).toHaveValue('2.5');
    await expect(page.getByLabel(/^Quarterly cap/)).toHaveValue('200');

    // numbers come from db.attendance: Manoj Patil (emp_12) quarter to date is October plus November so far
    const qtd = ['2026-10', '2026-11'].reduce((t, m) => t + (seed.attendance.find((a) => a.employeeId === 'emp_12' && a.month === m)?.overtimeHours ?? 0), 0);
    expect(qtd).toBeGreaterThan(0);
    await expect(page.getByTestId('ot-qtd-emp_12')).toHaveText(`${qtd} h`);
    for (const m of latestMonths(seed.attendance, 3)) {
      const h = seed.attendance.find((a) => a.employeeId === 'emp_12' && a.month === m)?.overtimeHours ?? 0;
      await expect(page.getByTestId(`ot-emp_12-${m}`)).toHaveText(`${h} h`);
    }
    await expect(page.getByTestId('ot-cap-emp_12')).toContainText(`${Math.round((qtd / 200) * 100)}%`);
    await expect(page.getByTestId('ot-cap-emp_12')).not.toContainText('Above 80%');
    await expect(page.getByRole('row').filter({ hasText: 'Aditya Bhat' })).toHaveCount(0); // nobody without overtime in the default view

    // a tighter cap flags people above 80%, then over the cap
    await page.getByLabel(/^Quarterly cap/).fill(String(Math.ceil(qtd / 0.9)));
    await page.getByRole('button', { name: 'Save rule' }).click();
    await expect(page.getByTestId('ot-cap-emp_12')).toContainText('Above 80%');
    await page.getByLabel(/^Quarterly cap/).fill(String(qtd - 3));
    await page.getByRole('button', { name: 'Save rule' }).click();
    await expect(page.getByTestId('ot-cap-emp_12')).toContainText('Over the cap');
    await expect(page.getByText(/above 80% of the cap/)).toBeVisible();

    // applies-to needs at least one type
    for (const label of ['Permanent', 'Fixed term', 'Contract', 'Daily wage']) await page.getByLabel(label, { exact: true }).uncheck();
    await expect(page.getByText('Choose at least one employment type')).toBeVisible();
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByLabel('Permanent', { exact: true })).toBeChecked();
  });

  test('leave rules: plain-English policy, live preview in the editor, maternity note, comp-off expiry, delete rules', async ({ page }) => {
    await openHrms(page, `${TIME}?tab=leave`);
    await expect(page.getByTestId('policy-EL')).toContainText('Earns 1.25 days a month after 6 months. Up to 30 days carry forward for 24 months. Up to 30 days can be encashed, and on exit.');
    await expect(page.getByRole('row').filter({ hasText: 'Compensatory Off' })).toContainText('Lapses after 60 days');
    await expect(page.getByRole('row').filter({ hasText: 'Maternity Leave' })).toContainText('Maternity Benefit Act applies');

    await page.getByRole('button', { name: 'Edit Earned Leave' }).click();
    const d = dialog(page, 'Edit Earned Leave');
    await expect(d.getByTestId('leave-preview')).toContainText('Earns 1.25 days a month after 6 months.');
    await d.getByLabel(/^Days a month/).fill('2');
    await expect(d.getByTestId('leave-preview')).toContainText('Earns 2 days a month after 6 months.');
    await d.getByLabel(/^Starts after/).fill('0');
    await expect(d.getByTestId('leave-preview')).toContainText('Earns 2 days a month.');
    await d.getByLabel('Encash while employed').uncheck();
    await expect(d.getByTestId('leave-preview')).toContainText('Up to 30 days are paid out on exit only.');
    await d.getByRole('button', { name: 'Save changes' }).click();
    await expect(d).toBeHidden();
    await expect(page.getByTestId('policy-EL')).toContainText('Earns 2 days a month. Up to 30 days carry forward for 24 months. Up to 30 days are paid out on exit only.');

    // validation
    await page.getByRole('button', { name: 'Add leave type', exact: true }).click();
    const a = dialog(page, 'Add leave type');
    await a.getByRole('button', { name: 'Add leave type' }).click();
    await expect(a.getByText('Leave type name is required')).toBeVisible();
    await expect(a.getByText('Code is required')).toBeVisible();
    await a.getByLabel(/^Leave type name/).fill('Study Leave');
    await a.getByLabel(/^Code/).fill('el');
    await a.getByRole('button', { name: 'Add leave type' }).click();
    await expect(a.getByText('EL is already used by another leave type')).toBeVisible();
    await a.getByLabel(/^Code/).fill('STD');
    await a.getByLabel(/^Accrual/).selectOption('yearly');
    await a.getByLabel(/^Days a year/).fill('5');
    await expect(a.getByTestId('leave-preview')).toContainText('Gets 5 days a year.');
    await a.getByRole('button', { name: 'Add leave type' }).click();
    await expect(a).toBeHidden();
    await expect(page.getByTestId('policy-STD')).toContainText('Gets 5 days a year.');

    // maternity
    await page.getByRole('button', { name: 'Edit Maternity Leave' }).click();
    const m = dialog(page, 'Edit Maternity Leave');
    await expect(m).toContainText('Maternity Benefit Act.');
    await expect(m).toContainText('26 weeks of paid leave (182 days)');
    await m.getByLabel(/^Days credited/).fill('100');
    await expect(m.getByText(/below the 26 weeks \(182 days\)/)).toBeVisible();
    await m.getByRole('button', { name: 'Cancel' }).click();

    // comp-off expiry
    await page.getByRole('button', { name: 'Edit Compensatory Off' }).click();
    const c = dialog(page, 'Edit Compensatory Off');
    await expect(c.getByLabel(/^Comp-off lapses after/)).toHaveValue('60');
    await c.getByLabel(/^Comp-off lapses after/).fill('45');
    await expect(c.getByTestId('leave-preview')).toContainText('Lapses after 45 days.');
    await c.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Compensatory Off' })).toContainText('Lapses after 45 days');

    // delete: blocked while balances exist, confirmed otherwise
    await page.getByRole('button', { name: 'Delete Earned Leave' }).click();
    const blocked = dialog(page, 'Cannot delete Earned Leave');
    const holders = new Set(seed.leaveBalances.filter((b) => b.leaveTypeId === 'lv_el').map((b) => b.employeeId)).size;
    await expect(blocked).toContainText(`${holders} employees hold balances in Earned Leave`);
    await blocked.getByRole('button', { name: 'Got it' }).click();
    await page.getByRole('button', { name: 'Delete Study Leave' }).click();
    await dialog(page, 'Delete leave type').getByRole('button', { name: 'Delete leave type' }).click();
    await expect(page.getByTestId('policy-STD')).toHaveCount(0);
  });

  test('holidays: counts, duplicate flag, calendar, copy to another year, and list delete rules', async ({ page }) => {
    await openHrms(page, `${TIME}?tab=holidays`);
    const stat = (label: string) => page.getByText(label, { exact: true }).locator('xpath=following-sibling::div[1]');
    await expect(page.getByLabel('Holiday list')).toHaveValue('hol_dl');
    await expect(stat('Fixed holidays')).toHaveText('7');
    await expect(stat('Optional holidays')).toHaveText('1');
    await expect(stat('Duplicate dates')).toHaveText('0');
    await expect(page.getByRole('row').filter({ hasText: 'Diwali' })).toContainText('8 Nov 2026');
    await expect(page.getByRole('row').filter({ hasText: 'Guru Nanak Jayanti' })).toContainText('Optional');
    await expect(page.getByText('Used by Delhi HQ.')).toBeVisible();

    // validation, then a holiday on an existing date is allowed but flagged
    await page.getByRole('button', { name: 'Add holiday', exact: true }).click();
    const d = dialog(page, 'Add holiday to Delhi 2026');
    await d.getByRole('button', { name: 'Add holiday' }).click();
    await expect(d.getByText('Pick a date')).toBeVisible();
    await expect(d.getByText('Holiday name is required')).toBeVisible();
    await d.getByLabel(/^Date/).fill('2027-01-01');
    await d.getByLabel(/^Holiday name/).fill('New Year');
    await d.getByRole('button', { name: 'Add holiday' }).click();
    await expect(d.getByText('This list is for 2026. Pick a date in 2026')).toBeVisible();
    await d.getByLabel(/^Date/).fill('2026-11-08');
    await d.getByLabel(/^Holiday name/).fill('Bhai Dooj');
    await expect(d.getByText(/already has Diwali/)).toBeVisible();
    await d.getByRole('button', { name: 'Add holiday' }).click();
    await expect(d).toBeHidden();
    await expect(stat('Fixed holidays')).toHaveText('8');
    await expect(stat('Duplicate dates')).toHaveText('1');
    await expect(page.getByText('Duplicate date', { exact: true })).toHaveCount(2);

    // edit makes it optional; remove asks first
    await page.getByRole('button', { name: 'Edit Bhai Dooj' }).click();
    await dialog(page, 'Edit Bhai Dooj').getByLabel('Optional holiday').check();
    await dialog(page, 'Edit Bhai Dooj').getByRole('button', { name: 'Save changes' }).click();
    await expect(stat('Optional holidays')).toHaveText('2');

    // calendar view
    await page.getByRole('tab', { name: 'Calendar' }).click();
    await expect(page.getByTestId('month-11')).toContainText('November 2026');
    await expect(page.getByTestId('day-2026-11-08')).toHaveAttribute('aria-label', /Diwali and Bhai Dooj \(optional\), duplicate date/);
    await expect(page.getByTestId('day-2026-11-05')).toHaveAttribute('aria-label', /Guru Nanak Jayanti \(optional\)/);
    await expect(page.getByTestId('month-12')).toContainText('25 Christmas');
    await page.getByTestId('day-2026-12-25').click();
    await expect(dialog(page, 'Edit Christmas')).toBeVisible();
    await dialog(page, 'Edit Christmas').getByRole('button', { name: 'Cancel' }).click();
    await page.getByTestId('day-2026-06-10').click();
    const add = dialog(page, 'Add holiday to Delhi 2026');
    await expect(add.getByLabel(/^Date/)).toHaveValue('2026-06-10');
    await add.getByLabel(/^Holiday name/).fill('Founders Day');
    await add.getByRole('button', { name: 'Add holiday' }).click();
    await expect(page.getByTestId('month-06')).toContainText('10 Founders Day');
    await page.getByRole('tab', { name: 'List' }).click();

    // remove the extra holiday with confirmation
    await page.getByRole('button', { name: 'Remove Founders Day' }).click();
    await dialog(page, 'Remove holiday').getByRole('button', { name: 'Remove holiday' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Founders Day' })).toHaveCount(0);

    // copy to the next year
    await page.getByRole('button', { name: 'Copy list' }).click();
    const cp = dialog(page, 'Copy Delhi 2026');
    await expect(cp.getByLabel(/^List name/)).toHaveValue('Delhi 2027');
    await expect(cp).toContainText('Festivals such as Diwali');
    await cp.getByRole('button', { name: 'Create copy' }).click();
    await expect(page.getByLabel('Holiday list')).toHaveValue(/^hol_/);
    await expect(page.getByLabel('Holiday list').locator('option:checked')).toHaveText('Delhi 2027');
    await expect(page.getByRole('row').filter({ hasText: 'Republic Day' })).toContainText('26 Jan 2027');
    await expect(stat('Total')).toHaveText('9');
    // the same state and year again is refused
    await page.getByRole('button', { name: 'Copy list' }).click();
    const again = dialog(page, 'Copy Delhi 2027');
    await again.getByLabel(/^Year/).fill('2027');
    await again.getByLabel(/^State/).selectOption('Delhi');
    await again.getByRole('button', { name: 'Create copy' }).click();
    await expect(again.getByText(/A Delhi list for 2027 already exists/)).toBeVisible();
    await again.getByLabel(/^State/).selectOption('Gujarat');
    await again.getByLabel(/^Year/).fill('2027');
    await expect(again.getByLabel(/^List name/)).toHaveValue('Gujarat 2027');
    await again.getByRole('button', { name: 'Create copy' }).click();
    await expect(page.getByLabel('Holiday list').locator('option:checked')).toHaveText('Gujarat 2027');

    // a list a location uses cannot be deleted; an unused one can
    await page.getByLabel('Holiday list').selectOption({ label: 'Delhi 2026' });
    await page.getByRole('button', { name: 'Delete list Delhi 2026' }).click();
    await expect(dialog(page, 'Cannot delete Delhi 2026')).toContainText('Delhi HQ');
    await dialog(page, 'Cannot delete Delhi 2026').getByRole('button', { name: 'Got it' }).click();
    await page.getByLabel('Holiday list').selectOption({ label: 'Gujarat 2027' });
    await page.getByRole('button', { name: 'Delete list Gujarat 2027' }).click();
    await dialog(page, 'Delete holiday list').getByRole('button', { name: 'Delete list' }).click();
    await expect(page.getByLabel('Holiday list').locator('option', { hasText: 'Gujarat 2027' })).toHaveCount(0);
  });
});

// ───────────────────────────────── layout ─────────────────────────────────
test.describe('layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const [name, path] of [['organisation', ORG], ['time and leave', `${TIME}?tab=roster`], ['holidays calendar', `${TIME}?tab=holidays`]] as const) {
    test(`${name} does not scroll sideways on a phone`, async ({ page }) => {
      await openHrms(page, path);
      if (name === 'holidays calendar') await page.getByRole('tab', { name: 'Calendar' }).click();
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

// ───────────────────────────────── screenshots (HRMS_SHOTS=1) ─────────────────────────────────
test.describe('screenshots', () => {
  test.skip(!process.env.HRMS_SHOTS, 'set HRMS_SHOTS=1 to write /tmp/hrms-shots/org-time-*.png');
  test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const shot = (page: Page, name: string) => page.screenshot({ path: `/tmp/hrms-shots/org-time-${name}.png`, fullPage: true });

  test('main pages', async ({ page }) => {
    await openHrms(page, ORG);
    await page.getByTestId('coverage-Karnataka').waitFor();
    await shot(page, 'org-entities');
    await page.getByRole('button', { name: 'Edit Meridian Retail Pvt Ltd' }).click();
    await shot(page, 'org-entity-modal');
    await page.keyboard.press('Escape');
    await tab(page, /^Locations/).click();
    await shot(page, 'org-locations');
    await tab(page, /^Departments/).click();
    await shot(page, 'org-departments');

    await page.goto(TIME);
    await page.getByTestId('paid-sh_gen').waitFor();
    await shot(page, 'time-shifts');
    await tab(page, /^Roster/).click();
    await page.getByTestId('roster-grid').waitFor();
    await shot(page, 'time-roster');
    await tab(page, /^Overtime/).click();
    await page.getByTestId('ot-qtd-emp_12').waitFor();
    await shot(page, 'time-overtime');
    await tab(page, /^Leave rules/).click();
    await page.getByTestId('policy-EL').waitFor();
    await shot(page, 'time-leave');
    await page.getByRole('button', { name: 'Edit Earned Leave' }).click();
    await shot(page, 'time-leave-modal');
    await page.keyboard.press('Escape');
    await tab(page, /^Holidays/).click();
    await page.getByLabel('Holiday list').waitFor();
    await shot(page, 'time-holidays-list');
    await page.getByRole('tab', { name: 'Calendar' }).click();
    await shot(page, 'time-holidays-calendar');
  });
});
