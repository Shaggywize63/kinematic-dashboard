import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { scopeToSpark, apiPath, ok } from './spark';

/**
 * Leads list (connected-B2B / Spark & Ray): each lead shows its parent company
 * (the lead's account → its parent group, stamped by the API) in its own
 * "Parent company" column. Other tenants don't get the column.
 */
const LEADS = [{
  id: 'lead-1', display_name: 'Tata Steel - Meramandali · Plant · Procurement — Pulse valves',
  is_b2c: false, account_id: 'a1', parent_company: 'Tata Steel Limited',
  company: 'Tata Steel - Meramandali', status: 'new', ref_no: 'SR/LD/2627-65',
  created_at: '2026-11-20T08:00:00Z',
}];

async function setup(page: Page, o: { spark?: boolean } = {}) {
  if (o.spark !== false) await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: {} } },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/leads') {
        return route.fulfill({ json: { success: true, data: LEADS, pagination: { total: 1, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false } } }).then(() => true);
      }
      return false;
    },
  });
}

test.describe('Leads list — Parent company column (Spark)', () => {
  test('Spark: a Parent company column shows the parent group', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads');
    await expect(page.getByText('Tata Steel - Meramandali').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('th', { hasText: 'Parent company' })).toBeVisible();
    await expect(page.getByText('Tata Steel Limited')).toBeVisible();
  });

  test('another tenant: no Parent company column', async ({ page }) => {
    await setup(page, { spark: false });
    await page.goto('/dashboard/crm/leads');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('th', { hasText: 'Parent company' })).toHaveCount(0);
  });
});
