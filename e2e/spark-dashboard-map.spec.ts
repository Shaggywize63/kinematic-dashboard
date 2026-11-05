import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark } from './spark';
import { FAKE_MAPS } from './fakeMaps';

/**
 * CRM dashboard "Leads on Map" for Spark & Ray: an Industry filter (all + the seven + "No industry") that sends
 * `?industry=`, pins coloured by industry and positioned from each lead's latitude / longitude, and a legend.
 * Other tenants keep the status-coloured map with no filter. Uses the in-page Maps stand-in (e2e/fakeMaps.ts).
 */

const GEO = [
  { id: 'g1', first_name: null, last_name: 'Bhosari Forge', city: 'Pune', state: 'Maharashtra', status: 'new', latitude: 18.6298, longitude: 73.8475, industry: 'Manufacturing', company: 'Bhosari Forge' },
  { id: 'g2', first_name: null, last_name: 'Chakan Auto', city: 'Pune', state: 'Maharashtra', status: 'working', latitude: 18.7603, longitude: 73.8629, industry: 'automotive', company: 'Chakan Auto' },
  { id: 'g3', first_name: null, last_name: 'Cure Labs', city: 'Mumbai', state: 'Maharashtra', status: 'qualified', latitude: 19.076, longitude: 72.8777, industry: 'Pharma & Healthcare', company: 'Cure Labs' },
  { id: 'g4', first_name: null, last_name: 'Loom Works', city: 'Surat', state: 'Gujarat', status: 'new', latitude: 21.1702, longitude: 72.8311, industry: 'Textiles', company: 'Loom Works' },
  { id: 'g5', first_name: null, last_name: 'Blank Co', city: 'Delhi', state: 'Delhi', status: 'new', latitude: 28.6139, longitude: 77.209, industry: null, company: 'Blank Co' },
];

async function setup(page: Page, seen: string[]) {
  await page.addInitScript(FAKE_MAPS);
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/analytics/dashboard-complete') {
        return ok(route, {
          summary: { total_leads: 5, new_leads_30d: 2, open_deals: 0, open_deal_value: 0, won_deals_30d: 0, won_revenue_30d: 0, win_rate_30d: 0, avg_deal_size: 0, avg_sales_cycle_days: 0, pipeline_velocity: 0, activities_7d: 0, conversion_rate: 0, leads_by_segment: { b2b: 5, b2c: 0 } },
          funnel: [], pipelineValue: [], winRate: [], forecast: [], leadScoreDistribution: [],
        });
      }
      if (method === 'GET' && p === '/api/v1/crm/leads/geo') {
        seen.push(url);
        const ind = new URL(url).searchParams.get('industry');
        const rows = !ind ? GEO
          : ind === '__none__' ? GEO.filter((g) => !g.industry)
          : GEO.filter((g) => (g.industry ?? '').toLowerCase() === ind.toLowerCase());
        return ok(route, rows);
      }
      return false;
    },
  });
}

const markers = (page: Page) => page.evaluate(() => (window as any).__gm.markers.filter((m: any) => !m.removed).map((m: any) => ({ lat: m.o.position.lat, lng: m.o.position.lng, fill: m.o.icon.fillColor })));

test.describe('Dashboard leads map (Spark & Ray)', () => {
  test('pins sit at each lead\'s coordinates, coloured by industry, with a legend', async ({ page }) => {
    const seen: string[] = [];
    await scopeToSpark(page);
    await setup(page, seen);
    await page.goto('/dashboard/crm/dashboard');
    await expect.poll(async () => (await markers(page)).length, { timeout: 30_000 }).toBe(5);
    const ms = await markers(page);
    const byLat = (lat: number) => ms.find((m: any) => Math.abs(m.lat - lat) < 1e-6);
    expect(byLat(18.6298)).toMatchObject({ lng: 73.8475, fill: '#2563EB' }); // Manufacturing
    expect(byLat(18.7603)).toMatchObject({ lng: 73.8629, fill: '#DC2626' }); // "automotive" - case-insensitive
    expect(byLat(19.076)).toMatchObject({ fill: '#16A34A' });
    expect(byLat(21.1702)).toMatchObject({ fill: '#6B7280' }); // unknown industry -> grey
    expect(byLat(28.6139)).toMatchObject({ fill: '#6B7280' }); // no industry -> grey

    const legend = page.getByTestId('industry-legend');
    await expect(legend).toBeVisible();
    const rows = legend.getByTestId('industry-legend-row');
    await expect(rows).toHaveCount(8);
    expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-color')))).toEqual(['#2563EB', '#DC2626', '#16A34A', '#F59E0B', '#7C3AED', '#0891B2', '#6B7280', '#6B7280']);
    await expect(legend).toContainText('No industry');
    // Unfiltered request carries no industry param.
    expect(new URL(seen[0]).searchParams.has('industry')).toBe(false);
  });

  test('the Industry filter lists all + the seven + No industry and sends ?industry=', async ({ page }) => {
    const seen: string[] = [];
    await scopeToSpark(page);
    await setup(page, seen);
    await page.goto('/dashboard/crm/dashboard');
    const filter = page.getByTestId('map-industry-filter');
    await expect(filter).toBeVisible({ timeout: 30_000 });
    expect(await filter.locator('option').allTextContents()).toEqual([
      'All industries', 'Manufacturing', 'Automotive', 'Pharma & Healthcare', 'Food & Beverage', 'Construction & Infrastructure', 'Power & Energy', 'Other', 'No industry',
    ]);
    await expect.poll(async () => (await markers(page)).length).toBe(5);

    await filter.selectOption('Pharma & Healthcare');
    await expect.poll(() => seen.length).toBe(2);
    expect(new URL(seen[1]).searchParams.get('industry')).toBe('Pharma & Healthcare');
    await expect.poll(async () => (await markers(page)).length).toBe(1);
    expect((await markers(page))[0]).toMatchObject({ lat: 19.076, fill: '#16A34A' });

    await filter.selectOption('__none__');
    await expect.poll(() => seen.length).toBe(3);
    expect(new URL(seen[2]).searchParams.get('industry')).toBe('__none__');
    await expect.poll(async () => (await markers(page)).length).toBe(1);
    expect((await markers(page))[0]).toMatchObject({ lat: 28.6139 });

    await filter.selectOption('');
    await expect.poll(async () => (await markers(page)).length).toBe(5);
    // ("All" is answered from the api client's GET cache, so no new request is needed.)
  });

  test('a filter with no matches keeps the dropdown so it can be reset', async ({ page }) => {
    const seen: string[] = [];
    await scopeToSpark(page);
    await setup(page, seen);
    await page.goto('/dashboard/crm/dashboard');
    const filter = page.getByTestId('map-industry-filter');
    await expect(filter).toBeVisible({ timeout: 30_000 });
    await filter.selectOption('Power & Energy');
    await expect.poll(() => seen.length).toBe(2);
    await expect(filter).toBeVisible();
    await filter.selectOption('');
    await expect.poll(async () => (await markers(page)).length).toBe(5);
  });

  test('a client admin pinned to Spark (no picker selection) gets the filter too', async ({ page }) => {
    const seen: string[] = [];
    await setup(page, seen);
    // Re-seed as a client admin of Spark.
    await page.addInitScript((u) => window.localStorage.setItem('kinematic_user', JSON.stringify(u)), { ...SEED_USER, role: 'client', client_id: 'c0218852-0a19-4dd0-b9fa-72f9e32ed0d8' });
    await page.goto('/dashboard/crm/dashboard');
    await expect(page.getByTestId('map-industry-filter')).toBeVisible({ timeout: 30_000 });
  });

  test('a non-Spark tenant keeps the status-coloured map: no filter, no legend, no industry param', async ({ page }) => {
    const seen: string[] = [];
    await setup(page, seen);
    await page.goto('/dashboard/crm/dashboard');
    await expect.poll(async () => (await markers(page)).length, { timeout: 30_000 }).toBe(5);
    await expect(page.getByTestId('map-industry-filter')).toHaveCount(0);
    await expect(page.getByTestId('industry-legend')).toHaveCount(0);
    const fills = (await markers(page)).map((m: any) => m.fill);
    expect(fills).not.toContain('#2563EB');
    expect(seen.every((u) => !new URL(u).searchParams.has('industry'))).toBe(true);
  });
});
