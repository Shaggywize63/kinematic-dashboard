import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { scopeToSpark, apiPath, ok } from './spark';

/**
 * The lead detail "Requirement" card (connected-B2B / Spark & Ray): shows the
 * lead's own requirement + its make/product/qty lines, for ANY lead type —
 * including a "Discussion" lead that has captured a requirement, where it was
 * previously only in the header name. Absent for other tenants / no requirement.
 */
const LEAD = {
  id: 'lead-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair',
  company: 'Nair Steel', is_b2c: false, status: 'working', lead_type: 'discussion',
  requirement: 'Replace ASCO pulse valves with MAC pulse valves.',
  owner_id: 'u-asha', owner_name: 'Asha Menon', created_by: SEED_USER.id, created_at: '2026-09-20T10:00:00Z',
};
const LINES = [
  { id: 'pl-1', lead_id: 'lead-1', make_name: 'Festo', product_name: 'Pulse valve 1/2"', qty: 10, unit: 'nos' },
  { id: 'pl-2', lead_id: 'lead-1', make_name: 'MAC', product_name: 'Pilot valve', qty: 4, unit: 'nos' },
];

async function setup(page: Page, o: { spark?: boolean; lead?: Record<string, unknown>; lines?: unknown[] } = {}) {
  if (o.spark !== false) await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: { field_overrides: {} } } },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1') return ok(route, o.lead ?? LEAD);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1/product-lines') return ok(route, o.lines ?? LINES);
      return false;
    },
  });
}

const card = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: /^Requirement/ }) });

test.describe('Lead detail — Requirement card', () => {
  test('shows the requirement + product lines on a Discussion lead', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads/lead-1');
    await expect(card(page)).toBeVisible({ timeout: 30_000 });
    await expect(card(page).getByText('Replace ASCO pulse valves with MAC pulse valves.')).toBeVisible();
    await expect(card(page).getByText(/Festo · Pulse valve/)).toBeVisible();
    await expect(card(page).getByText('10 nos')).toBeVisible();
  });

  test('absent when the lead has no requirement and no lines', async ({ page }) => {
    await setup(page, { lead: { ...LEAD, requirement: null }, lines: [] });
    await page.goto('/dashboard/crm/leads/lead-1');
    await expect(page.getByText('Priya Nair').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await expect(card(page)).toHaveCount(0);
  });

  test('absent for another tenant', async ({ page }) => {
    await setup(page, { spark: false });
    await page.goto('/dashboard/crm/leads/lead-1');
    await expect(page.getByText('Priya Nair').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await expect(card(page)).toHaveCount(0);
  });
});
