import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark } from './spark';

/**
 * Spark & Ray: the lead's industry shows as a coloured badge on the lead detail header and in the leads table
 * (and respects the admin's hide-industry override). Other tenants see neither.
 */

const LEAD = {
  id: 'lead-1', first_name: null, last_name: 'Acme Forge', full_name: 'Acme Forge', company: 'Acme Forge', is_b2c: false, status: 'working',
  industry: 'Automotive', created_at: '2026-09-20T10:00:00Z',
};
const ROWS = [
  { ...LEAD, id: 'l-1', industry: 'Pharma & Healthcare', last_name: 'Cure Labs', full_name: 'Cure Labs', company: 'Cure Labs' },
  { ...LEAD, id: 'l-2', industry: 'Textiles', last_name: 'Loom Works', full_name: 'Loom Works', company: 'Loom Works' },
  { ...LEAD, id: 'l-3', industry: null, last_name: 'Blank Co', full_name: 'Blank Co', company: 'Blank Co' },
];

async function setup(page: Page, overrides: Record<string, unknown> = {}) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: { field_overrides: overrides } } },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1') return ok(route, LEAD);
      if (method === 'GET' && p === '/api/v1/crm/leads') {
        await route.fulfill({ json: { success: true, data: ROWS, pagination: { page: 1, limit: 25, total: ROWS.length, pages: 1 } } });
        return true;
      }
      return false;
    },
  });
}

test.describe('Industry badges', () => {
  test('lead detail header shows a coloured industry badge for Spark', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page);
    await page.goto('/dashboard/crm/leads/lead-1');
    const badge = page.getByTestId('industry-badge');
    await expect(badge).toBeVisible({ timeout: 30_000 });
    await expect(badge).toHaveText('Automotive');
    await expect(badge).toHaveAttribute('data-color', '#DC2626');
  });

  test('the badge honours the hide-industry override', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page, { 'lead.industry': { hidden: true } });
    await page.goto('/dashboard/crm/leads/lead-1');
    await expect(page.getByRole('heading').or(page.getByText('Acme Forge').first()).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('industry-badge')).toHaveCount(0);
  });

  test('a non-Spark tenant has no industry badge on the lead header', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads/lead-1');
    await expect(page.getByText('Acme Forge').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('industry-badge')).toHaveCount(0);
  });

  test('the leads table shows the badge per row (unknown = grey, blank = none)', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page);
    await page.goto('/dashboard/crm/leads');
    const row = (name: string) => page.locator('tr.lead-row').filter({ hasText: name });
    await expect(row('Cure Labs').getByTestId('industry-badge')).toHaveAttribute('data-color', '#16A34A', { timeout: 30_000 });
    await expect(row('Loom Works').getByTestId('industry-badge')).toHaveAttribute('data-color', '#6B7280');
    await expect(row('Loom Works').getByTestId('industry-badge')).toHaveText('Textiles');
    await expect(row('Blank Co').getByTestId('industry-badge')).toHaveCount(0);
  });

  test('a non-Spark tenant has no badges in the leads table', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads');
    await expect(page.locator('tr.lead-row').filter({ hasText: 'Cure Labs' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('industry-badge')).toHaveCount(0);
  });
});
