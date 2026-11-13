import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, scopeToSpark } from './spark';

/**
 * Business Report — the flexible directors' report for the connected-B2B
 * workspace (Spark & Ray). Everything is mocked: we seed an admin session,
 * scope the dashboard to Spark, and intercept GET /api/v1/crm/reports/business
 * with the exact backend contract. No live API.
 *
 * Covered: rows + totals with the right numbers; switching group_by and scope
 * and changing the date refetch with the asserted new query params; the brand
 * fan-out note for group_by=brand; Cost "—" when cost_available:false; the 404
 * "not available" path; and a non-Spark tenant never seeing the tile or page.
 */

const PAGE = '/dashboard/crm/reports/business';
const REPORTS = '/dashboard/crm/reports';
const ENDPOINT = '/api/v1/crm/reports/business';

type GroupBy = 'engineer' | 'industry' | 'brand' | 'product' | 'account';
type Scope = 'own' | 'supervised' | 'all';

function businessPayload(opts: { costAvailable?: boolean; groupBy?: GroupBy; scope?: Scope } = {}) {
  const cost_available = opts.costAvailable ?? true;
  const group_by = opts.groupBy ?? 'engineer';
  const scope = opts.scope ?? 'all';
  return {
    range: { from: '2025-11-01', to: '2025-11-30' },
    group_by,
    scope,
    filters: { engineer_id: null, industry: null, brand: null, product_id: null, account_id: null },
    // Two rows, sorted by order_value desc — the UI renders in the order returned.
    rows: [
      {
        key: 'u-asha', label: 'Asha Rao',
        leads_count: 12, orders_won: 5,
        quoted_value: 250000, order_value: 180000,
        brands: ['Finolex', 'Havells', 'Polycab', 'RR', 'KEI'],
        cost: 42000,
      },
      {
        key: 'u-ravi', label: 'Ravi Kumar',
        leads_count: 7, orders_won: 2,
        quoted_value: 90000, order_value: 60000,
        brands: ['Finolex'],
        cost: null, // no cost captured for this row -> "—" even when available
      },
    ],
    totals: {
      leads_count: 19, orders_won: 7,
      quoted_value: 340000, order_value: 240000,
      brands: ['Finolex', 'Havells', 'Polycab', 'RR', 'KEI'],
      cost: 42000,
    },
    cost_available,
  };
}

/** Wire the dashboard as a Spark admin and record every business-report request's query params. */
async function setupSpark(page: Page, opts: { costAvailable?: boolean } = {}) {
  const calls: Array<Record<string, string>> = [];
  await seedSession(page); // SEED_USER is super_admin -> passes the admin/manager gate
  await scopeToSpark(page);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: {} } },
    onRequest: async (route: Route, url: string) => {
      if (apiPath(url) === ENDPOINT) {
        const params = Object.fromEntries(new URL(url).searchParams.entries());
        calls.push(params);
        await route.fulfill({
          status: 200,
          json: { success: true, data: businessPayload({ costAvailable: opts.costAvailable, groupBy: params.group_by as GroupBy, scope: params.scope as Scope }) },
        });
        return true;
      }
      return false;
    },
  });
  return { calls };
}

test.describe('Business Report (connected-B2B)', () => {
  test('renders rows with the right numbers, a totals row, brand chips and cost', async ({ page }) => {
    await setupSpark(page);
    await page.goto(PAGE);

    const rows = page.getByTestId('business-row');
    await expect(rows).toHaveCount(2);

    // Asha — ₹1.8L order value, ₹42K cost.
    const asha = rows.filter({ hasText: 'Asha Rao' });
    await expect(asha).toContainText('12');        // leads
    await expect(asha).toContainText('₹2.5L');     // quoted
    await expect(asha).toContainText('₹1.8L');     // order value
    await expect(asha).toContainText('₹42K');      // cost
    // Brand chips, truncated to 3 with a "+2" overflow badge.
    await expect(asha.getByTestId('business-brand')).toHaveCount(3);
    await expect(asha).toContainText('Finolex');
    await expect(asha).toContainText('+2');

    // Ravi — cost null -> dash in the cost cell.
    const ravi = rows.filter({ hasText: 'Ravi Kumar' });
    await expect(ravi).toContainText('₹60K');      // order value
    await expect(ravi.getByTestId('business-cost')).toHaveText('—');

    // Totals row.
    const totals = page.getByTestId('business-totals');
    await expect(totals).toContainText('Total');
    await expect(totals).toContainText('19');       // total leads
    await expect(totals).toContainText('₹2.4L');    // total order value
    await expect(totals).toContainText('₹42K');     // total cost
  });

  test('cost shows "—" for every row when cost is not available', async ({ page }) => {
    await setupSpark(page, { costAvailable: false });
    await page.goto(PAGE);
    await expect(page.getByTestId('business-row')).toHaveCount(2);
    const cost = page.getByTestId('business-cost');
    await expect(cost).toHaveCount(2);
    // Asha has ₹42K, but with cost_available:false both cost cells read "—".
    await expect(cost.nth(0)).toHaveText('—');
    await expect(cost.nth(1)).toHaveText('—');
    // The totals cost cell is also "—".
    await expect(page.getByTestId('business-totals-cost')).toHaveText('—');
  });

  test('the brand fan-out note appears only when grouping by brand or product', async ({ page }) => {
    await setupSpark(page);
    await page.goto(PAGE);
    await expect(page.getByTestId('business-row').first()).toBeVisible();

    // Default group_by=engineer -> no fan-out note.
    await expect(page.getByTestId('business-fanout-note')).toHaveCount(0);

    // Switch to Brand -> the note appears.
    await page.getByRole('tab', { name: 'Brand', exact: true }).click();
    await expect(page.getByTestId('business-fanout-note')).toBeVisible();
    await expect(page.getByTestId('business-fanout-note')).toContainText('counted in each of its rows');

    // Switch to Product -> the note stays (fan-out applies to products too).
    await page.getByRole('tab', { name: 'Product', exact: true }).click();
    await expect(page.getByTestId('business-fanout-note')).toBeVisible();

    // Back to Engineer -> the note is gone.
    await page.getByRole('tab', { name: 'Engineer', exact: true }).click();
    await expect(page.getByTestId('business-fanout-note')).toHaveCount(0);
  });

  test('changing group_by, scope and the date refetches with the new params', async ({ page }) => {
    const { calls } = await setupSpark(page);
    await page.goto(PAGE);
    await expect(page.getByTestId('business-row').first()).toBeVisible();

    // First load uses the defaults: group_by=engineer, scope=all.
    await expect.poll(() => calls.at(-1)?.group_by).toBe('engineer');
    await expect.poll(() => calls.at(-1)?.scope).toBe('all');

    // Switch grouping to Industry.
    await page.getByRole('tab', { name: 'Industry', exact: true }).click();
    await expect.poll(() => calls.some((c) => c.group_by === 'industry')).toBeTruthy();

    // Change the scope select to "My team" (supervised).
    await page.getByLabel('Scope').selectOption('supervised');
    await expect.poll(() => calls.some((c) => c.scope === 'supervised')).toBeTruthy();

    // Change the From date — the request carries the new `from`.
    await page.getByLabel('From').fill('2025-10-01');
    await expect.poll(() => calls.some((c) => c.from === '2025-10-01')).toBeTruthy();
    // And the latest request still carries the industry grouping + supervised scope chosen above.
    await expect.poll(() => calls.at(-1)?.group_by).toBe('industry');
    await expect.poll(() => calls.at(-1)?.scope).toBe('supervised');
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
    await expect(page.getByTestId('business-row')).toHaveCount(0);
  });
});

test.describe('Business Report gating', () => {
  test('a non-Spark tenant does not see the tile and the page is withheld', async ({ page }) => {
    // Seed an admin bound to a non-Spark client; do NOT scope to Spark.
    await seedSession(page, { ...SEED_USER, client_id: 'a1f67468-526e-4734-be3a-2cb132cc2804' });
    await mockApi(page);

    // The reports hub does not list the Business Report tile.
    await page.goto(REPORTS);
    await expect(page.getByRole('link', { name: 'Team Performance' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Business Report' })).toHaveCount(0);

    // Direct navigation shows the "not available" state (no rows).
    await page.goto(PAGE);
    await expect(page.getByText('Not available for this workspace')).toBeVisible();
    await expect(page.getByTestId('business-row')).toHaveCount(0);
  });
});
