import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, scopeToSpark } from './spark';

/**
 * Engineer Scorecard — the directors' report for the connected-B2B workspace
 * (Spark & Ray). Everything is mocked: we seed an admin session, scope the
 * dashboard to Spark, and intercept GET /api/v1/crm/reports/engineer-scorecard
 * with the exact backend contract. No live API.
 *
 * Covered: a row per engineer with the right numbers, the totals row, brand
 * chips (with a "+N" overflow), attendance "—" when attendance isn't available,
 * the granularity + date controls refetching with the new params, the 404
 * "not available" path, and a non-Spark tenant never seeing the screen.
 */

const PAGE = '/dashboard/crm/reports/engineer-scorecard';
const REPORTS = '/dashboard/crm/reports';
const ENDPOINT = '/api/v1/crm/reports/engineer-scorecard';

type Granularity = 'day' | 'week' | 'month';

function scorecardPayload(opts: { attendanceAvailable?: boolean } = {}) {
  const attendance_available = opts.attendanceAvailable ?? true;
  return {
    range: { from: '2025-11-01', to: '2025-11-30', granularity: 'month' as Granularity },
    attendance_available,
    // Sorted by order_value desc — the UI renders in the order returned.
    engineers: [
      {
        user_id: 'u-asha', name: 'Asha Rao',
        attendance_days: 18,
        leads_count: 12, orders_won: 5,
        quoted_value: 250000, order_value: 180000,
        brands: ['Finolex', 'Havells', 'Polycab', 'RR', 'KEI'],
        buckets: [{ bucket_start: '2025-11-01', leads_count: 12, orders_won: 5, order_value: 180000 }],
      },
      {
        user_id: 'u-ravi', name: 'Ravi Kumar',
        attendance_days: null, // not wired for this engineer -> "—" even when available
        leads_count: 7, orders_won: 2,
        quoted_value: 90000, order_value: 60000,
        brands: ['Finolex'],
        buckets: [{ bucket_start: '2025-11-01', leads_count: 7, orders_won: 2, order_value: 60000 }],
      },
    ],
    totals: {
      leads_count: 19, orders_won: 7,
      quoted_value: 340000, order_value: 240000,
      brands: ['Finolex', 'Havells', 'Polycab', 'RR', 'KEI'],
    },
  };
}

/** Wire the dashboard as a Spark admin and record every scorecard request's query params. */
async function setupSpark(page: Page, opts: { attendanceAvailable?: boolean } = {}) {
  const calls: Array<Record<string, string>> = [];
  await seedSession(page); // SEED_USER is super_admin -> passes the admin/manager gate
  await scopeToSpark(page);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: {} } },
    onRequest: async (route: Route, url: string) => {
      if (apiPath(url) === ENDPOINT) {
        const params = Object.fromEntries(new URL(url).searchParams.entries());
        calls.push(params);
        await route.fulfill({ status: 200, json: { success: true, data: scorecardPayload(opts) } });
        return true;
      }
      return false;
    },
  });
  return { calls };
}

test.describe('Engineer Scorecard (connected-B2B)', () => {
  test('renders a row per engineer with the right numbers, a totals row and brand chips', async ({ page }) => {
    await setupSpark(page);
    await page.goto(PAGE);

    const rows = page.getByTestId('scorecard-row');
    await expect(rows).toHaveCount(2);

    // Asha (top of the list, order value ₹1.8L).
    const asha = rows.filter({ hasText: 'Asha Rao' });
    await expect(asha).toContainText('12');        // leads
    await expect(asha).toContainText('₹2.5L');     // quoted value
    await expect(asha).toContainText('₹1.8L');     // order value
    // Brand chips, truncated to 3 with a "+2" overflow badge.
    await expect(asha.getByTestId('scorecard-brand')).toHaveCount(3);
    await expect(asha).toContainText('Finolex');
    await expect(asha).toContainText('+2');

    // Ravi.
    const ravi = rows.filter({ hasText: 'Ravi Kumar' });
    await expect(ravi).toContainText('₹60K');      // order value
    await expect(ravi).toContainText('—');         // attendance null -> dash

    // Totals row.
    const totals = page.getByTestId('scorecard-totals');
    await expect(totals).toContainText('Total');
    await expect(totals).toContainText('19');       // total leads
    await expect(totals).toContainText('₹2.4L');    // total order value
  });

  test('attendance shows "—" for every engineer when attendance is not available', async ({ page }) => {
    await setupSpark(page, { attendanceAvailable: false });
    await page.goto(PAGE);
    await expect(page.getByTestId('scorecard-row')).toHaveCount(2);
    const attendance = page.getByTestId('scorecard-attendance');
    await expect(attendance).toHaveCount(2);
    // Asha has 18 days, but with attendance_available:false both cells read "—".
    await expect(attendance.nth(0)).toHaveText('—');
    await expect(attendance.nth(1)).toHaveText('—');
  });

  test('changing the granularity and the date range refetches with the new params', async ({ page }) => {
    const { calls } = await setupSpark(page);
    await page.goto(PAGE);
    await expect(page.getByTestId('scorecard-row').first()).toBeVisible();

    // First load uses the default monthly window.
    await expect.poll(() => calls.at(-1)?.granularity).toBe('month');

    // Switch to Week.
    await page.getByRole('tab', { name: 'Week', exact: true }).click();
    await expect.poll(() => calls.some((c) => c.granularity === 'week')).toBeTruthy();

    // Change the From date — the request carries the new `from`.
    await page.getByLabel('From').fill('2025-10-01');
    await expect.poll(() => calls.some((c) => c.from === '2025-10-01')).toBeTruthy();
    // And it still carries the Week granularity chosen above.
    await expect.poll(() => calls.at(-1)?.granularity).toBe('week');
  });

  test('a 404 from the backend shows the "not available" state', async ({ page }) => {
    await seedSession(page);
    await scopeToSpark(page);
    await mockApi(page, {
      onRequest: async (route: Route, url: string) => {
        if (apiPath(url) === ENDPOINT) {
          await route.fulfill({ status: 404, json: { success: false, error: { code: 'NOT_AVAILABLE', message: 'Not available' } } });
          return true;
        }
        return false;
      },
    });
    await page.goto(PAGE);
    await expect(page.getByText('Not available for this workspace')).toBeVisible();
    await expect(page.getByTestId('scorecard-row')).toHaveCount(0);
  });
});

test.describe('Engineer Scorecard gating', () => {
  test('a non-Spark tenant does not see the scorecard tile and the page is withheld', async ({ page }) => {
    // Seed an admin bound to a non-Spark client; do NOT scope to Spark.
    await seedSession(page, { ...SEED_USER, client_id: 'a1f67468-526e-4734-be3a-2cb132cc2804' });
    await mockApi(page);

    // The reports hub does not list the Engineer Scorecard tile.
    await page.goto(REPORTS);
    await expect(page.getByRole('link', { name: 'Team Performance' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Engineer Scorecard' })).toHaveCount(0);

    // Direct navigation shows the "not available" state (no engineer rows).
    await page.goto(PAGE);
    await expect(page.getByText('Not available for this workspace')).toBeVisible();
    await expect(page.getByTestId('scorecard-row')).toHaveCount(0);
  });
});
