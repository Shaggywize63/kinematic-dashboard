import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { demoLogin, mockApi, seedSession, SEED_USER } from './utils';
import {
  csvStamp, earliestCheckIn, fmtClock, fmtMinutes, gpsText, latestCheckOut, stampMs, sumMinutes, visitMinutes,
} from '../src/lib/visitTime';

/**
 * Check-in / check-out / time spent for every form (client rule `form_checkin_required`):
 *   - Work Activities: each form row shows Check-in, Check-out and Time spent ("—" when the rep recorded none);
 *     the group header uses ONLY real check-in/out stamps (never the submission time) and SUMS the time spent;
 *     the detail modal has the same tiles; the CSV has real Check-in / Check-out (date + time) and a
 *     "Time spent (min)" column, and no longer invents times from `submitted_at`.
 *   - Submissions: Check-in / Check-out / Time spent columns (sortable), the same tiles in the modal, and the
 *     stray "/* … *\/" text that used to render inside the modal is gone.
 *
 * Everything runs against an intercepted API and asserts on what the page shows and what the CSV contains.
 */

// The pages print times in the viewer's time zone; pin it so the expected strings are deterministic.
test.use({ timezoneId: 'Asia/Kolkata', locale: 'en-IN' });

// ── pure helpers (no browser, no server) ─────────────────────────────────────
test.describe('visitTime helpers', () => {
  test('minutes: the stored value wins, then the two stamps; impossible pairs are unknown', () => {
    expect(visitMinutes({ duration_minutes: 18, check_in_at: null, check_out_at: null })).toBe(18);
    expect(visitMinutes({ duration_minutes: '18' })).toBe(18);
    // Old row: both stamps, no stored duration -> worked out.
    expect(visitMinutes({ check_in_at: '2026-10-09T05:00:00Z', check_out_at: '2026-10-09T05:35:00Z' })).toBe(35);
    // A stored 0 is "unknown" for older app builds: the stamps decide.
    expect(visitMinutes({ duration_minutes: 0, check_in_at: '2026-10-09T05:00:00Z', check_out_at: '2026-10-09T05:12:00Z' })).toBe(12);
    // Checked in and out within the same half minute: a real 0.
    expect(visitMinutes({ check_in_at: '2026-10-09T05:00:00Z', check_out_at: '2026-10-09T05:00:20Z' })).toBe(0);
    // Out before in, longer than a day, or only one stamp: unknown, never negative.
    expect(visitMinutes({ check_in_at: '2026-10-09T06:00:00Z', check_out_at: '2026-10-09T05:00:00Z' })).toBeNull();
    expect(visitMinutes({ check_in_at: '2026-10-08T04:00:00Z', check_out_at: '2026-10-09T05:00:00Z' })).toBeNull();
    expect(visitMinutes({ check_in_at: '2026-10-09T05:00:00Z' })).toBeNull();
    expect(visitMinutes({})).toBeNull();
    expect(visitMinutes({ duration_minutes: 99999 })).toBeNull();
  });

  test('formatting: "—" for unknown, "<1m" for a real zero, hours and minutes otherwise', () => {
    expect(fmtMinutes(null)).toBe('—');
    expect(fmtMinutes(0)).toBe('<1m');
    expect(fmtMinutes(18)).toBe('18m');
    expect(fmtMinutes(65)).toBe('1h 5m');
    expect(fmtMinutes(120)).toBe('2h 0m');
  });

  test('a group sums the forms that have a time and says how many that was; none = no total', () => {
    const rows = [
      { check_in_at: '2026-10-09T04:30:00Z', check_out_at: '2026-10-09T04:48:00Z', duration_minutes: 18 },
      { check_in_at: '2026-10-09T05:00:00Z', check_out_at: '2026-10-09T05:35:00Z' },
      {},
    ];
    expect(sumMinutes(rows)).toEqual({ total: 53, counted: 2 });
    expect(sumMinutes([{}, {}])).toEqual({ total: null, counted: 0 });
    expect(earliestCheckIn(rows)).toBe('2026-10-09T04:30:00Z');
    expect(latestCheckOut(rows)).toBe('2026-10-09T05:35:00Z');
    expect(earliestCheckIn([{}])).toBeNull();
    expect(latestCheckOut([{}])).toBeNull();
  });

  test('stamps: Postgres-style text is read; absent or garbage is "—" / "" and never a made-up time', () => {
    expect(stampMs('2026-10-09 04:30:00+00')).toBe(Date.parse('2026-10-09T04:30:00Z'));
    expect(stampMs('not a date')).toBeNull();
    expect(stampMs(null)).toBeNull();
    expect(fmtClock(null)).toBe('—');
    expect(csvStamp(undefined)).toBe('');
    // "YYYY-MM-DD HH:mm" in the viewer's own time zone (the browser test below pins Asia/Kolkata and checks 10:00).
    const d = new Date('2026-10-09T04:30:00Z');
    const p2 = (n: number) => String(n).padStart(2, '0');
    expect(csvStamp('2026-10-09T04:30:00Z')).toBe(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`);
    expect(csvStamp('2026-10-09T04:30:00Z')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(gpsText('12.9,77.6')).toBe('12.9,77.6');
    expect(gpsText(null, 13, 80.2)).toBe('13,80.2');
    expect(gpsText(null, undefined, undefined)).toBe('');
    expect(gpsText('', null, null)).toBe('');
  });
});

// ── fixtures ─────────────────────────────────────────────────────────────────
const USER = { name: 'Arjun Sharma', employee_id: 'E1' };
const form = (id: string, outlet: string, extra: Record<string, unknown>) => ({
  id, user_id: 'u1', outlet_name: outlet, users: USER, activities: { name: 'Store Visit' }, builder_forms: { id: 'bf1', title: 'Store Audit' },
  address: 'MG Road', ...extra,
});

// 09 Oct 2026, IST = UTC+5:30  (04:30Z = 10:00 am)
const ROWS = [
  // Reliance Fresh: two forms, both with real stamps (the second has no stored duration: an older row).
  form('f-a', 'Reliance Fresh', {
    submitted_at: '2026-10-09T05:00:00Z', check_in_at: '2026-10-09T04:30:00Z', check_out_at: '2026-10-09T04:48:00Z', duration_minutes: 18,
    check_in_gps: '12.9,77.6', check_out_gps: '12.91,77.61',
    form_responses: [{ builder_questions: { label: 'Shelf' }, value_text: 'Full' }],
  }),
  form('f-b', 'Reliance Fresh', {
    submitted_at: '2026-10-09T05:36:00Z', check_in_at: '2026-10-09T05:00:00Z', check_out_at: '2026-10-09T05:35:00Z', duration_minutes: null,
    check_in_gps: '12.9,77.6', check_out_gps: '12.9,77.6',
  }),
  // Gamma Stores: no check-in/out at all. Submitted at 1:30 pm IST — which must NOT show up as a visit time.
  form('f-c', 'Gamma Stores', { submitted_at: '2026-10-09T08:00:00Z' }),
  // Delta Mart: one form with stamps, one without.
  form('f-d', 'Delta Mart', { submitted_at: '2026-10-09T09:00:00Z', check_in_at: '2026-10-09T08:30:00Z', check_out_at: '2026-10-09T08:50:00Z', duration_minutes: 20 }),
  form('f-e', 'Delta Mart', { submitted_at: '2026-10-09T09:30:00Z', location_lat: 13.0, location_lng: 80.2 }),
];

interface Req { path: string; query: URLSearchParams }

async function setup(page: Page, o: { total?: number; rows?: unknown[] } = {}) {
  const seen: Req[] = [];
  const rows = o.rows ?? ROWS;
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      const u = new URL(url);
      if (method !== 'GET') return false;
      seen.push({ path: u.pathname, query: u.searchParams });
      if (u.pathname === '/api/v1/forms/admin/submissions') {
        // The real shape: { success, data: { data: [rows], pagination } }
        await route.fulfill({ json: { success: true, data: { data: rows, pagination: { page: 1, limit: 50, total: o.total ?? rows.length } } } });
        return true;
      }
      const one = u.pathname.match(/^\/api\/v1\/forms\/submissions\/([^/]+)$/);
      if (one) {
        await route.fulfill({ json: { success: true, data: rows.find((r) => (r as { id: string }).id === one[1]) ?? {} } });
        return true;
      }
      return false;
    },
  });
  return seen;
}

const t = (page: Page, id: string) => page.getByTestId(id);
const am = (hhmm: string) => new RegExp(`^${hhmm}\\s*am$`, 'i');

// ── Work Activities ──────────────────────────────────────────────────────────
test.describe('Work Activities — time spent per form', () => {
  test('the group header sums real time spent and never borrows the submission time', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/work-activities');
    await expect(page.getByText('Reliance Fresh')).toBeVisible({ timeout: 60_000 });

    // Reliance Fresh: 18 + 35 (worked out for the older row) = 53 min, first in 10:00 am, last out 11:05 am.
    await expect(t(page, 'wa-group-spent').nth(0)).toHaveText('53m');
    await expect(t(page, 'wa-group-in').nth(0)).toHaveText(am('10:00'));
    await expect(t(page, 'wa-group-out').nth(0)).toHaveText(am('11:05'));

    // Gamma Stores has no stamps: three dashes — NOT its 1:30 pm submission time.
    await expect(t(page, 'wa-group-spent').nth(1)).toHaveText('—');
    await expect(t(page, 'wa-group-in').nth(1)).toHaveText('—');
    await expect(t(page, 'wa-group-out').nth(1)).toHaveText('—');
    await expect(page.getByText('Processing')).toHaveCount(0);

    // Delta Mart: only one of its two forms has a time -> 20m, and the header says so.
    await expect(t(page, 'wa-group-spent').nth(2)).toHaveText('20m');
    await expect(page.getByText('1 of 2 forms')).toBeVisible();
    await expect(page.getByText('2 of 2 forms')).toHaveCount(0);
  });

  test('each form row shows Check-in, Check-out and Time spent, with "—" when there is none', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/work-activities');
    await page.getByText('Reliance Fresh').click();

    await expect(t(page, 'wa-form-in')).toHaveCount(2);
    await expect(t(page, 'wa-form-in').nth(0)).toHaveText(am('10:00'));
    await expect(t(page, 'wa-form-out').nth(0)).toHaveText(am('10:18'));
    await expect(t(page, 'wa-form-spent').nth(0)).toHaveText('18m');
    await expect(t(page, 'wa-form-in').nth(1)).toHaveText(am('10:30'));
    await expect(t(page, 'wa-form-out').nth(1)).toHaveText(am('11:05'));
    await expect(t(page, 'wa-form-spent').nth(1)).toHaveText('35m');

    await page.getByText('Gamma Stores').click(); // opens its group (the first one closes)
    await expect(t(page, 'wa-form-in')).toHaveCount(1);
    await expect(t(page, 'wa-form-in').first()).toHaveText('—');
    await expect(t(page, 'wa-form-out').first()).toHaveText('—');
    await expect(t(page, 'wa-form-spent').first()).toHaveText('—');
  });

  test('the detail modal carries the same tiles', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/work-activities');
    await page.getByText('Reliance Fresh').click();
    await page.getByRole('button', { name: 'View Data' }).first().click();

    await expect(page.getByText('Submission Details')).toBeVisible();
    await expect(t(page, 'wa-modal-in')).toHaveText(/09 Oct,? 10:00\s*am/i);
    await expect(t(page, 'wa-modal-out')).toHaveText(/09 Oct,? 10:18\s*am/i);
    await expect(t(page, 'wa-modal-spent')).toHaveText('18m');
    await expect(page.getByText('12.9,77.6', { exact: true })).toBeVisible();
    await expect(page.getByText('undefined')).toHaveCount(0);
  });

  test('a form with no stamps shows dashes in the modal, not a guessed GPS or time', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/work-activities');
    await page.getByText('Gamma Stores').click();
    await page.getByRole('button', { name: 'View Data' }).first().click();
    await expect(page.getByText('Submission Details')).toBeVisible();
    await expect(t(page, 'wa-modal-in')).toHaveText('—');
    await expect(t(page, 'wa-modal-out')).toHaveText('—');
    await expect(t(page, 'wa-modal-spent')).toHaveText('—');
    await expect(page.getByText('undefined')).toHaveCount(0);
    await expect(page.getByText('Same as entry')).toHaveCount(0);
  });

  test('the CSV has real Check-in / Check-out and Time spent, and leaves cells empty instead of inventing times', async ({ page }) => {
    const seen = await setup(page);
    await page.goto('/dashboard/work-activities');
    await expect(page.getByText('Reliance Fresh')).toBeVisible({ timeout: 60_000 });

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download Report/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/^Kinematic_WorkActivities_.*\.csv$/);
    const text = readFileSync((await download.path())!, 'utf8');
    const [headerLine, ...lines] = text.split('\n');
    const header = headerLine.split(',');
    expect(header).toEqual([
      'Date', 'Client', 'Executive', 'Employee ID', 'Outlet', 'Activity', 'Address', 'Check In GPS', 'Check Out GPS',
      'Check-in', 'Check-out', 'Time spent (min)', 'Responses',
    ]);
    // Every cell is quoted; the GPS cells hold commas, so split on the quote-comma-quote boundary.
    const cells = (line: string) => line.slice(1, -1).split('","');
    const col = (name: string) => header.indexOf(name);
    const byOutlet = (name: string) => lines.map(cells).filter((c) => c[col('Outlet')] === name);

    const [a, b] = byOutlet('Reliance Fresh');
    expect(a[col('Check-in')]).toBe('2026-10-09 10:00');
    expect(a[col('Check-out')]).toBe('2026-10-09 10:18');
    expect(a[col('Time spent (min)')]).toBe('18');
    expect(a[col('Check In GPS')]).toBe('12.9,77.6');
    expect(a[col('Responses')]).toBe('Shelf: Full');
    expect(b[col('Check-in')]).toBe('2026-10-09 10:30');
    expect(b[col('Check-out')]).toBe('2026-10-09 11:05');
    expect(b[col('Time spent (min)')]).toBe('35'); // older row: worked out from the two stamps

    // No stamps -> empty cells (the old export filled in the 1:30 pm submission time), and no "undefined,undefined" GPS.
    const [c] = byOutlet('Gamma Stores');
    expect(c[col('Check-in')]).toBe('');
    expect(c[col('Check-out')]).toBe('');
    expect(c[col('Time spent (min)')]).toBe('');
    expect(c[col('Check In GPS')]).toBe('-');
    expect(text).not.toContain('undefined');
    expect(text).not.toMatch(/01:30|1:30/);

    // A builder-form row reports its position under location_lat / location_lng.
    const [, e] = byOutlet('Delta Mart');
    expect(e[col('Check In GPS')]).toBe('13,80.2');
    expect(e[col('Check-in')]).toBe('');

    // The export asks for the responses and a big page; nothing says it was cut short because nothing was.
    const exp = seen.filter((r) => r.path === '/api/v1/forms/admin/submissions' && r.query.get('include_responses') === 'true');
    expect(exp).toHaveLength(1);
    await expect(page.getByText(/Exported the first/)).toHaveCount(0);
  });

  test('when the server returns fewer rows than match, the export says it is partial', async ({ page }) => {
    await setup(page, { total: 250 });
    await page.goto('/dashboard/work-activities');
    await expect(page.getByText('Reliance Fresh')).toBeVisible({ timeout: 60_000 });
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download Report/ }).click()]);
    await download.path();
    await expect(page.getByText('Exported the first 5 of 250 records').first()).toBeVisible();
  });
});

test.describe('Work Activities — demo mode', () => {
  test('the canned visits show the time spent between their check-in and check-out (no network)', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/work-activities');
    await expect(page.getByTestId('wa-group-spent').first()).toBeVisible({ timeout: 60_000 });
    // Five canned visits, grouped by activity (Compliance, Inventory, Merchandising, Store Visit x2): out − in for each.
    await expect(page.getByTestId('wa-group-spent')).toHaveText(['45m', '40m', '48m', '38m', '36m']);
    await expect(page.getByTestId('wa-group-in').first()).not.toHaveText('—');
  });
});

// ── Submissions ──────────────────────────────────────────────────────────────
const SUBS = [
  { id: 'r1', user_id: 'u1', submitted_at: '2026-10-09T05:00:00Z', is_converted: true, outlet_name: 'Reliance Fresh', users: { name: 'Asha Menon', employee_id: 'E1' },
    form_templates: { name: 'Store Audit' }, activities: { name: 'Store Visit' },
    check_in_at: '2026-10-09T04:30:00Z', check_out_at: '2026-10-09T04:55:00Z', duration_minutes: 25 },
  { id: 'r2', user_id: 'u2', submitted_at: '2026-10-09T06:00:00Z', is_converted: false, outlet_name: 'Gamma Stores', users: { name: 'Ravi Kumar', employee_id: 'E2' },
    form_templates: { name: 'Store Audit' }, activities: { name: 'Store Visit' },
    check_in_at: '2026-10-09T05:30:00Z', check_out_at: '2026-10-09T06:35:00Z' },
  { id: 'r3', user_id: 'u3', submitted_at: '2026-10-09T07:00:00Z', is_converted: false, outlet_name: 'Delta Mart', users: { name: 'Meera Iyer', employee_id: 'E3' },
    form_templates: { name: 'Store Audit' }, activities: { name: 'Store Visit' } },
];

test.describe('Submissions — check-in / check-out columns', () => {
  test('columns, derived time spent, sorting and the modal tiles', async ({ page }) => {
    await setup(page, { rows: SUBS });
    await page.goto('/dashboard/submissions');
    await expect(page.getByText('Asha Menon')).toBeVisible({ timeout: 60_000 });

    // (The header cells are plain <th>s; match them by their text.)
    const th = (label: string) => page.locator('th').filter({ hasText: new RegExp(`^${label}`) });
    for (const h of ['Check-in', 'Check-out', 'Time spent']) {
      await expect(th(h)).toBeVisible();
    }
    const row = (name: string) => page.getByRole('row').filter({ hasText: name });

    await expect(row('Asha Menon').getByTestId('sub-checkin')).toHaveText(am('10:00'));
    await expect(row('Asha Menon').getByTestId('sub-checkout')).toHaveText(am('10:25'));
    await expect(row('Asha Menon').getByTestId('sub-spent')).toHaveText('25m');
    // No stored duration: worked out from the stamps (65 min).
    await expect(row('Ravi Kumar').getByTestId('sub-spent')).toHaveText('1h 5m');
    // No stamps at all.
    await expect(row('Meera Iyer').getByTestId('sub-checkin')).toHaveText('—');
    await expect(row('Meera Iyer').getByTestId('sub-checkout')).toHaveText('—');
    await expect(row('Meera Iyer').getByTestId('sub-spent')).toHaveText('—');

    // Sorting by check-in: earliest first, the row with none stays last.
    await th('Check-in').getByRole('button').click();
    await expect(page.getByTestId('sub-checkin')).toHaveText([am('10:00'), am('11:00'), '—']);
    await th('Check-in').getByRole('button').click(); // descending
    await expect(page.getByTestId('sub-checkin')).toHaveText([am('11:00'), am('10:00'), '—']);

    // The modal: same tiles, and the stray comment text is gone.
    await row('Asha Menon').getByRole('button', { name: 'View' }).click();
    await expect(page.getByText('Submission Details')).toBeVisible();
    await expect(page.getByText(/09 Oct,? 10:00\s*am/i)).toBeVisible();
    await expect(page.getByText(/09 Oct,? 10:25\s*am/i)).toBeVisible();
    await expect(page.getByText('25m', { exact: true })).toHaveCount(2); // the table cell + the modal tile
    await expect(page.getByText(/Check-in Details removed/)).toHaveCount(0);
    await expect(page.getByText('/*')).toHaveCount(0);
  });

  test('a row with no stamps shows dashes in the modal', async ({ page }) => {
    await setup(page, { rows: SUBS });
    await page.goto('/dashboard/submissions');
    await page.getByRole('row').filter({ hasText: 'Meera Iyer' }).getByRole('button', { name: 'View' }).click();
    await expect(page.getByText('Submission Details')).toBeVisible();
    await expect(page.getByText('Activity Session Duration')).toHaveCount(0);
  });
});
