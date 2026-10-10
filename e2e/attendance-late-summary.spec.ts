import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { demoLogin, mockApi, seedSession, SEED_USER } from './utils';

/**
 * Attendance overview: (1) lateness now comes from the API when the client has configured shift rules —
 * records carry `late: { is_late, minutes_late }` — and the page shows a "Late 12 min" chip, a Late tile and a
 * Late filter; a legacy client (no `late` key on its records) keeps the old behaviour exactly (no chip, no tile,
 * the fixed 09:30 on-time heuristic). (2) A "Monthly summary" view backed by GET /attendance/summary: per-employee
 * Present / Late / Half-day / Leave / Absent, totals row, sortable, month picker, CSV export.
 *
 * Everything runs against an intercepted API and asserts on what the page shows and SENDS.
 */

// The page judges "on time" with the browser's local clock; pin it to IST so the legacy 09:30 rule is deterministic.
test.use({ timezoneId: 'Asia/Kolkata' });

const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const TODAY = istToday();

interface Late { is_late: boolean; minutes_late: number }
const user = (id: string, name: string) => ({ id, name, employee_id: `E-${id}`, role: 'field_executive', is_active: true, zones: { name: 'Zone A' } });
const USERS = [user('u-asha', 'Asha Menon'), user('u-ravi', 'Ravi Kumar'), user('u-meera', 'Meera Iyer')];

/** A finished 8h day that checked in at `hhmm` IST. `late` is only attached for a client with shift rules. */
const record = (u: ReturnType<typeof user>, hhmm: string, late?: Late) => ({
  id: `att-${u.id}`, user_id: u.id, date: TODAY, status: 'checked_out',
  checkin_at: `${TODAY}T${hhmm}:00+05:30`, checkout_at: `${TODAY}T18:00:00+05:30`, total_hours: 8,
  users: { name: u.name, role: u.role, employee_id: u.employee_id, zones: u.zones },
  ...(late ? { late } : {}),
});

/** Shift 09:30 + 5 min grace: 09:42 is 12 min after start (late), 09:33 is inside the grace (on time). */
const CONFIGURED = [
  record(USERS[0], '09:42', { is_late: true, minutes_late: 12 }),
  record(USERS[1], '09:33', { is_late: false, minutes_late: 0 }),
  record(USERS[2], '10:40', { is_late: true, minutes_late: 70 }),
];
/** Same people, a client with NO rules configured: the API sends no `late` key at all. */
const LEGACY = [record(USERS[0], '09:12'), record(USERS[1], '10:15')];

interface Seen { path: string; query: URLSearchParams }

async function setup(page: Page, o: { team: unknown[]; summary?: (q: URLSearchParams) => { status?: number; body: unknown } }) {
  const seen: Seen[] = [];
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      if (method !== 'GET') return false;
      const u = new URL(url);
      const path = u.pathname;
      seen.push({ path, query: u.searchParams });
      if (path === '/api/v1/attendance/team') { await route.fulfill({ json: { success: true, data: o.team } }); return true; }
      if (path === '/api/v1/users') { await route.fulfill({ json: { success: true, data: USERS } }); return true; }
      if (path === '/api/v1/attendance/summary' && o.summary) {
        const r = o.summary(u.searchParams);
        await route.fulfill({ status: r.status ?? 200, json: r.body });
        return true;
      }
      return false;
    },
  });
  return seen;
}

/** The big number under a stat-tile / metric label (labels are rendered as mono eyebrows). */
const tileValue = (page: Page, label: string) =>
  page.locator(`div:text-is("${label}")`).locator('xpath=ancestor::div[2]').first();
const metricValue = (page: Page, label: string) =>
  page.locator(`div:text-is("${label}")`).locator('xpath=following-sibling::div[1]');

const goDaily = async (page: Page) => {
  await page.goto('/dashboard/attendance-overview');
  await expect(page.getByText('Asha Menon').first()).toBeVisible();
};

test.describe('Attendance — late from the API', () => {
  test('a configured client: Late chips, a Late tile that counts them, and a Late filter', async ({ page }) => {
    await setup(page, { team: CONFIGURED });
    await goDaily(page);

    await expect(page.getByText('Late 12 min')).toBeVisible();
    await expect(page.getByText('Late 70 min')).toBeVisible();
    await expect(page.getByText(/^Late \d+ min$/)).toHaveCount(2); // Ravi, inside the grace, gets none

    // The summary tile counts the late arrivals (2 of 3).
    await expect(tileValue(page, 'Late')).toContainText('2');

    // The on-time metric follows the API's verdict: only Ravi (09:33) was on time = 1 of 3.
    // (The legacy 09:30 rule would have called all three late = 0%.)
    await expect(metricValue(page, 'On-time check-ins')).toHaveText('33%');

    // Filter to just the late ones.
    await page.getByLabel('Filter by status').selectOption('late');
    await expect(page.getByText('Asha Menon').first()).toBeVisible();
    await expect(page.getByText('Meera Iyer').first()).toBeVisible();
    await expect(page.getByText('Ravi Kumar')).toHaveCount(0);
  });

  test('the record detail also shows the chip', async ({ page }) => {
    await setup(page, { team: CONFIGURED });
    await goDaily(page);
    await page.getByText('Asha Menon').first().click();
    await expect(page.getByRole('dialog').getByText('Late 12 min')).toBeVisible();
  });

  test('a legacy client (no `late` on its records) behaves exactly as before', async ({ page }) => {
    await setup(page, { team: LEGACY });
    await goDaily(page);

    // No chip, no Late tile, no Late filter option.
    await expect(page.getByText(/^Late \d+ min$/)).toHaveCount(0);
    await expect(page.locator('div:text-is("Late")')).toHaveCount(0);
    await expect(page.getByLabel('Filter by status').locator('option[value="late"]')).toHaveCount(0);
    // The six original tiles are all still there.
    for (const l of ['Total', 'Checked in', 'Checked out', 'On leave', 'Absent', 'Half day']) {
      await expect(page.locator(`div:text-is("${l}")`).first()).toBeVisible();
    }
    // The fixed 09:30 heuristic: 09:12 on time, 10:15 late = 1 of 2.
    await expect(metricValue(page, 'On-time check-ins')).toHaveText('50%');
  });
});

// ── Monthly summary ──────────────────────────────────────────────────────────
const ROWS = [
  { user_id: 'u-asha', name: 'Asha Menon', working_days: 26, present: 20, late: 3, half_day: 1, on_leave: 1, absent: 4 },
  { user_id: 'u-ravi', name: 'Ravi Kumar', working_days: 26, present: 24, late: 6, half_day: 0, on_leave: 0, absent: 2 },
  { user_id: 'u-meera', name: 'Meera Iyer', working_days: 20, present: 12, late: 0, half_day: 2, on_leave: 0, absent: 6 },
];

const monthOf = (d: string) => d.slice(0, 7);
const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};
const prevMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};
const THIS_MONTH = monthOf(TODAY);
const LAST_MONTH = prevMonth(THIS_MONTH);

const names = async (page: Page) => (await page.getByTestId('summary-row').locator('td:first-child').allTextContents()).map((t) => t.trim());

/** A column header of the summary table (the sort control is the button inside it). */
const header = (page: Page, name: string) => page.locator('thead th').filter({ hasText: new RegExp(`^${name}`) });

async function openSummary(page: Page) {
  await page.goto('/dashboard/attendance-overview');
  await page.getByRole('tab', { name: 'Monthly summary' }).click();
}

test.describe('Attendance — monthly summary', () => {
  const summary = (q: URLSearchParams) => {
    if (q.get('from') === `${LAST_MONTH}-01`) {
      return { body: { success: true, data: { from: q.get('from'), to: q.get('to'), working_days: 25, rows: [ROWS[1]] } } };
    }
    return { body: { success: true, data: { from: q.get('from'), to: q.get('to'), working_days: 7, rows: ROWS } } };
  };

  test('current month by default: the right range is requested and the table lists Present/Late/Half/Leave/Absent with totals', async ({ page }) => {
    const seen = await setup(page, { team: [], summary });
    await openSummary(page);

    await expect(page.getByTestId('summary-row')).toHaveCount(3);
    const req = seen.filter((r) => r.path === '/api/v1/attendance/summary');
    expect(req.length).toBeGreaterThanOrEqual(1); // (dev-mode StrictMode may double-fire the mount effect)
    const monthEnd = lastDay(THIS_MONTH);
    for (const r of req) {
      expect(r.query.get('from')).toBe(`${THIS_MONTH}-01`);
      expect(r.query.get('to')).toBe(monthEnd > TODAY ? TODAY : monthEnd); // never past today
    }

    for (const h of ['Employee', 'Working days', 'Present', 'Late', 'Half day', 'Leave', 'Absent']) {
      await expect(header(page, h)).toBeVisible();
    }
    const asha = page.getByTestId('summary-row').filter({ hasText: 'Asha Menon' });
    await expect(asha.locator('td')).toHaveText(['Asha Menon', '26', '20', '3', '1', '1', '4']);
    // Totals row: present 56, late 9, half 3, leave 1, absent 12.
    await expect(page.getByTestId('summary-total').locator('td')).toHaveText(['Total', '—', '56', '9', '3', '1', '12']);
    await expect(page.getByText('Late arrivals are counted within Present.')).toBeVisible();
    // The daily view's tiles are not on this tab.
    await expect(page.locator('div:text-is("Checked in")')).toHaveCount(0);
  });

  test('sorts worst-first by default and re-sorts by Late or Absent on click', async ({ page }) => {
    await setup(page, { team: [], summary });
    await openSummary(page);

    expect(await names(page)).toEqual(['Meera Iyer', 'Asha Menon', 'Ravi Kumar']); // absent desc: 6, 4, 2
    await header(page, 'Late').getByRole('button').click();
    expect(await names(page)).toEqual(['Ravi Kumar', 'Asha Menon', 'Meera Iyer']); // late desc: 6, 3, 0
    await header(page, 'Late').getByRole('button').click();
    expect(await names(page)).toEqual(['Meera Iyer', 'Asha Menon', 'Ravi Kumar']); // late asc: 0, 3, 6
    await header(page, 'Absent').getByRole('button').click();
    expect(await names(page)).toEqual(['Meera Iyer', 'Asha Menon', 'Ravi Kumar']); // absent desc again
    await header(page, 'Employee').getByRole('button').click();
    expect(await names(page)).toEqual(['Asha Menon', 'Meera Iyer', 'Ravi Kumar']); // A to Z
    // The totals row never moves into the sorted rows.
    await expect(page.getByTestId('summary-total')).toHaveCount(1);
  });

  test('changing the month refetches that month', async ({ page }) => {
    const seen = await setup(page, { team: [], summary });
    await openSummary(page);
    await expect(page.getByTestId('summary-row')).toHaveCount(3);

    await page.getByLabel('Month', { exact: true }).fill(LAST_MONTH);
    await expect(page.getByTestId('summary-row')).toHaveCount(1);
    await expect(page.getByTestId('summary-row').first()).toContainText('Ravi Kumar');

    const last = seen.filter((r) => r.path === '/api/v1/attendance/summary').pop()!;
    expect(last.query.get('from')).toBe(`${LAST_MONTH}-01`);
    expect(last.query.get('to')).toBe(lastDay(LAST_MONTH)); // a finished month is asked for in full
    await expect(page.getByTestId('summary-total').locator('td')).toHaveText(['Total', '—', '24', '6', '0', '0', '2']);
  });

  test('exports exactly what the table shows as a CSV (labelled CSV, sorted as on screen, totals last)', async ({ page }) => {
    await setup(page, { team: [], summary });
    await openSummary(page);
    await expect(page.getByTestId('summary-row')).toHaveCount(3);
    await expect(page.getByText(/Excel/)).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`^attendance-summary-${THIS_MONTH}-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
    const csv = readFileSync((await download.path())!, 'utf8').split('\n');
    expect(csv).toEqual([
      'Employee,Working days,Present,Late,Half day,Leave,Absent',
      'Meera Iyer,20,12,0,2,0,6',
      'Asha Menon,26,20,3,1,1,4',
      'Ravi Kumar,26,24,6,0,0,2',
      'Total,,56,9,3,1,12',
    ]);

    // Re-sort by Late and export again: the file follows the screen.
    await header(page, 'Late').getByRole('button').click();
    const [second] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    const csv2 = readFileSync((await second.path())!, 'utf8').split('\n');
    expect(csv2.slice(1, 4).map((l) => l.split(',')[0])).toEqual(['Ravi Kumar', 'Asha Menon', 'Meera Iyer']);
  });

  test('an API error is shown, and an empty month says so and disables the export', async ({ page }) => {
    let mode: 'error' | 'empty' = 'error';
    await setup(page, {
      team: [],
      summary: (q) => mode === 'error'
        ? { status: 400, body: { success: false, error: 'Date range cannot exceed 62 days' } }
        : { body: { success: true, data: { from: q.get('from'), to: q.get('to'), working_days: 0, rows: [] } } },
    });
    await openSummary(page);
    await expect(page.getByRole('alert').filter({ hasText: 'Date range cannot exceed 62 days' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();

    mode = 'empty';
    await page.getByRole('button', { name: 'Refresh monthly summary' }).click();
    await expect(page.getByText(/No attendance data for/)).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: '62 days' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });

  test('going back to Daily records restores the live list', async ({ page }) => {
    await setup(page, { team: CONFIGURED, summary });
    await openSummary(page);
    await expect(page.getByTestId('summary-row')).toHaveCount(3);
    await page.getByRole('tab', { name: 'Daily records' }).click();
    await expect(page.getByText('Late 12 min')).toBeVisible();
    await expect(page.getByTestId('summary-row')).toHaveCount(0);
  });

  test('demo mode shows a populated summary table', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/attendance-overview');
    await page.getByRole('tab', { name: 'Monthly summary' }).click();
    await expect(page.getByTestId('summary-row').first()).toBeVisible();
    await expect(page.getByTestId('summary-total')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  });
});
