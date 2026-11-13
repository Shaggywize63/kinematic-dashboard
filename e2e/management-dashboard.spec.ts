import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'fs';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, scopeToSpark } from './spark';

/**
 * Management Dashboard — the directors' overview for the connected-B2B workspace
 * (Spark & Ray). It is a pure CONSUMER of the two existing report endpoints, so
 * everything is mocked: we seed an admin session, scope the dashboard to Spark,
 * and intercept BOTH GET /api/v1/crm/reports/business (group_by engineer / brand
 * / account) and GET /api/v1/crm/reports/engineer-scorecard. No live API.
 *
 * Covered: the KPI strip reads the business-report totals (incl. cost + cost %);
 * top engineers come from the scorecard; the top-brand / top-account cards from
 * the grouped business report; a saved-question chip deep-links into the
 * Business Report with the right query string; changing the date range refetches
 * BOTH endpoints with the new params; Export CSV produces a download; a 404 from
 * either endpoint drops to the "not available" state; and a non-Spark tenant
 * never sees the tile or the page.
 */

const PAGE = '/dashboard/crm/reports/management';
const REPORTS = '/dashboard/crm/reports';
const BUSINESS = '/api/v1/crm/reports/business';
const SCORECARD = '/api/v1/crm/reports/engineer-scorecard';

type GroupBy = 'engineer' | 'industry' | 'brand' | 'product' | 'account';

const ENGINEER_ROWS = [
  { key: 'u-asha', label: 'Asha Rao', leads_count: 12, orders_won: 5, quoted_value: 250000, order_value: 180000, brands: ['Finolex', 'Havells'], cost: 42000 },
  { key: 'u-ravi', label: 'Ravi Kumar', leads_count: 7, orders_won: 2, quoted_value: 90000, order_value: 60000, brands: ['Finolex'], cost: null },
];
const BRAND_ROWS = [
  { key: 'b-hav', label: 'Havells', leads_count: 9, orders_won: 4, quoted_value: 160000, order_value: 150000, brands: ['Havells'], cost: 20000 },
  { key: 'b-fin', label: 'Finolex', leads_count: 6, orders_won: 3, quoted_value: 120000, order_value: 90000, brands: ['Finolex'], cost: 12000 },
];
const ACCOUNT_ROWS = [
  { key: 'a-acme', label: 'Acme Industries', leads_count: 8, orders_won: 4, quoted_value: 140000, order_value: 120000, brands: ['Havells'], cost: 18000 },
  { key: 'a-beta', label: 'Beta Corp', leads_count: 5, orders_won: 2, quoted_value: 80000, order_value: 70000, brands: ['Finolex'], cost: 9000 },
];

// Totals used by the KPI strip (the backend sends these on the engineer grouping).
const TOTALS = { leads_count: 19, orders_won: 7, quoted_value: 340000, order_value: 240000, brands: ['Finolex', 'Havells'], cost: 42000 };

function businessPayload(groupBy: GroupBy, costAvailable = true) {
  const rows = groupBy === 'brand' ? BRAND_ROWS : groupBy === 'account' ? ACCOUNT_ROWS : ENGINEER_ROWS;
  return {
    range: { from: '2025-11-01', to: '2025-11-30' },
    group_by: groupBy,
    scope: 'all',
    filters: { engineer_id: null, industry: null, brand: null, product_id: null, account_id: null },
    rows,
    totals: TOTALS,
    cost_available: costAvailable,
  };
}

function scorecardPayload(attendanceAvailable = true) {
  return {
    range: { from: '2025-11-01', to: '2025-11-30', granularity: 'month' },
    attendance_available: attendanceAvailable,
    engineers: [
      { user_id: 'u-asha', name: 'Asha Rao', attendance_days: 18, leads_count: 12, orders_won: 5, quoted_value: 250000, order_value: 180000, brands: ['Finolex', 'Havells'], buckets: [] },
      { user_id: 'u-ravi', name: 'Ravi Kumar', attendance_days: null, leads_count: 7, orders_won: 2, quoted_value: 90000, order_value: 60000, brands: ['Finolex'], buckets: [] },
    ],
    totals: { leads_count: 19, orders_won: 7, quoted_value: 340000, order_value: 240000, brands: ['Finolex', 'Havells'] },
  };
}

/** Wire the dashboard as a Spark admin and record every request's query params. */
async function setupSpark(page: Page, opts: { costAvailable?: boolean } = {}) {
  const businessCalls: Array<Record<string, string>> = [];
  const scorecardCalls: Array<Record<string, string>> = [];
  await seedSession(page); // SEED_USER is super_admin -> passes the admin/manager gate
  await scopeToSpark(page);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: {} } },
    onRequest: async (route: Route, url: string) => {
      const path = apiPath(url);
      if (path === BUSINESS) {
        const params = Object.fromEntries(new URL(url).searchParams.entries());
        businessCalls.push(params);
        await route.fulfill({ status: 200, json: { success: true, data: businessPayload((params.group_by as GroupBy) || 'engineer', opts.costAvailable ?? true) } });
        return true;
      }
      if (path === SCORECARD) {
        const params = Object.fromEntries(new URL(url).searchParams.entries());
        scorecardCalls.push(params);
        await route.fulfill({ status: 200, json: { success: true, data: scorecardPayload() } });
        return true;
      }
      return false;
    },
  });
  return { businessCalls, scorecardCalls };
}

test.describe('Management Dashboard (connected-B2B)', () => {
  test('the KPI strip reads the business-report totals, including cost and cost %', async ({ page }) => {
    await setupSpark(page);
    await page.goto(PAGE);

    await expect(page.getByTestId('management-kpis')).toBeVisible();
    await expect(page.getByTestId('kpi-orders')).toContainText('7');
    await expect(page.getByTestId('kpi-order-value')).toContainText('₹2.4L');   // 240000
    await expect(page.getByTestId('kpi-quoted')).toContainText('₹3.4L');        // 340000
    await expect(page.getByTestId('kpi-leads')).toContainText('19');
    await expect(page.getByTestId('kpi-cost')).toContainText('₹42K');           // 42000
    await expect(page.getByTestId('kpi-cost-pct')).toContainText('17.5%');      // 42000 / 240000
  });

  test('cost KPIs are withheld when cost is not available', async ({ page }) => {
    await setupSpark(page, { costAvailable: false });
    await page.goto(PAGE);
    await expect(page.getByTestId('kpi-orders')).toBeVisible();
    await expect(page.getByTestId('kpi-cost')).toHaveCount(0);
    await expect(page.getByTestId('kpi-cost-pct')).toHaveCount(0);
  });

  test('top engineers come from the scorecard; brand + account cards from the business report', async ({ page }) => {
    await setupSpark(page);
    await page.goto(PAGE);

    // Top engineers (from the scorecard), sorted by order value desc.
    const engRows = page.getByTestId('management-engineer-row');
    await expect(engRows).toHaveCount(2);
    const asha = engRows.filter({ hasText: 'Asha Rao' });
    await expect(asha).toContainText('5');       // orders won
    await expect(asha).toContainText('₹1.8L');   // order value
    await expect(asha).toContainText('18');      // attendance days
    // Ravi's attendance is null -> dash.
    await expect(engRows.filter({ hasText: 'Ravi Kumar' })).toContainText('—');

    // Top by brand.
    const brandRows = page.getByTestId('management-brand-row');
    await expect(brandRows).toHaveCount(2);
    await expect(brandRows.filter({ hasText: 'Havells' })).toContainText('₹1.5L'); // 150000

    // Top by account.
    const acctRows = page.getByTestId('management-account-row');
    await expect(acctRows).toHaveCount(2);
    await expect(acctRows.filter({ hasText: 'Acme Industries' })).toContainText('₹1.2L'); // 120000
  });

  test('a saved-question chip deep-links into the Business Report with the right query string', async ({ page }) => {
    await setupSpark(page);
    await page.goto(PAGE);
    await expect(page.getByTestId('management-saved-questions')).toBeVisible();

    await page.getByTestId('management-saved-question').filter({ hasText: 'Value by brand' }).click();
    await page.waitForURL(/\/dashboard\/crm\/reports\/business\?.*group_by=brand/);
    // The current range rides along on the deep link.
    expect(page.url()).toContain('from=');
    expect(page.url()).toContain('to=');
    // The Business Report initialised its grouping from the URL (Brand tab selected).
    await expect(page.getByRole('tab', { name: 'Brand', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  test('changing the date range refetches BOTH endpoints with the new params', async ({ page }) => {
    const { businessCalls, scorecardCalls } = await setupSpark(page);
    await page.goto(PAGE);
    await expect(page.getByTestId('management-kpis')).toBeVisible();

    // First load: three business groupings + one scorecard.
    await expect.poll(() => businessCalls.some((c) => c.group_by === 'engineer')).toBeTruthy();
    await expect.poll(() => businessCalls.some((c) => c.group_by === 'brand')).toBeTruthy();
    await expect.poll(() => businessCalls.some((c) => c.group_by === 'account')).toBeTruthy();
    await expect.poll(() => scorecardCalls.length).toBeGreaterThan(0);

    // Change the From date — both endpoints refetch with the new `from`.
    await page.getByLabel('From').fill('2025-10-01');
    await expect.poll(() => businessCalls.some((c) => c.from === '2025-10-01')).toBeTruthy();
    await expect.poll(() => scorecardCalls.some((c) => c.from === '2025-10-01')).toBeTruthy();
  });

  test('Export CSV produces a download of the overview rows', async ({ page }) => {
    await setupSpark(page);
    await page.goto(PAGE);
    await expect(page.getByTestId('management-kpis')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Export CSV/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^management-overview-.*\.csv$/);
    const path = await download.path();
    const text = readFileSync(path!, 'utf8');
    // Header + rows from every section we fetched.
    expect(text).toContain('Section,Name,Leads,Orders won,Order value,Quoted value');
    expect(text).toContain('Asha Rao');       // engineer section
    expect(text).toContain('Havells');        // brand section
    expect(text).toContain('Acme Industries'); // account section
  });

  test('a 404 from either endpoint shows the shared "not available" state', async ({ page }) => {
    await seedSession(page);
    await scopeToSpark(page);
    await mockApi(page, {
      onRequest: async (route: Route, url: string) => {
        const path = apiPath(url);
        if (path === SCORECARD) {
          await route.fulfill({ status: 404, json: { success: false, error: { code: 'NOT_AVAILABLE', message: 'Not available' } } });
          return true;
        }
        if (path === BUSINESS) {
          await route.fulfill({ status: 200, json: { success: true, data: businessPayload('engineer') } });
          return true;
        }
        return false;
      },
    });
    await page.goto(PAGE);
    await expect(page.getByText('Not available for this workspace')).toBeVisible();
    await expect(page.getByTestId('management-engineer-row')).toHaveCount(0);
  });
});

test.describe('Management Dashboard gating', () => {
  test('a non-Spark tenant does not see the tile and the page is withheld', async ({ page }) => {
    // Seed an admin bound to a non-Spark client; do NOT scope to Spark.
    await seedSession(page, { ...SEED_USER, client_id: 'a1f67468-526e-4734-be3a-2cb132cc2804' });
    await mockApi(page);

    // The reports hub does not list the Management Dashboard tile.
    await page.goto(REPORTS);
    await expect(page.getByRole('link', { name: 'Team Performance' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Management Dashboard' })).toHaveCount(0);

    // Direct navigation shows the "not available" state (no rows).
    await page.goto(PAGE);
    await expect(page.getByText('Not available for this workspace')).toBeVisible();
    await expect(page.getByTestId('management-engineer-row')).toHaveCount(0);
  });
});
