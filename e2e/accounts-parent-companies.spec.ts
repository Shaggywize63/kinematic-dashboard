import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { scopeToSpark, apiPath } from './spark';

/**
 * Accounts page (connected-B2B / Spark & Ray): parent companies ("groups",
 * is_group=true) are kept out of the default Accounts list and listed in a
 * separate "Parent companies" tab, which fetches /crm/accounts?group=1.
 */
const ACCOUNTS = [{ id: 'a1', org_id: 'o', name: 'Tata Steel - Meramandali', industry: 'Steel', owner_name: 'Asha Menon' }];
const GROUPS = [{ id: 'g1', org_id: 'o', name: 'Tata Steel Limited', industry: null, owner_name: 'Asha Menon' }];

async function setup(page: Page, o: { spark?: boolean } = {}): Promise<string[]> {
  const seen: string[] = [];
  if (o.spark !== false) await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: {} } },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/accounts') {
        seen.push(url);
        const groups = new URL(url).searchParams.get('group');
        const data = groups ? GROUPS : ACCOUNTS;
        return route.fulfill({ json: { success: true, data, pagination: { total: data.length, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false } } }).then(() => true);
      }
      return false;
    },
  });
  return seen;
}

test.describe('Accounts — Parent companies tab (Spark)', () => {
  test('default list excludes groups; the Parent companies tab fetches group=1 and lists them', async ({ page }) => {
    const seen = await setup(page);
    await page.goto('/dashboard/crm/accounts');
    await expect(page.getByText('Tata Steel - Meramandali')).toBeVisible({ timeout: 30_000 });
    // The default accounts fetch did NOT ask for groups.
    expect(seen.some((u) => !new URL(u).searchParams.get('group'))).toBeTruthy();

    await page.getByRole('tab', { name: 'Parent companies' }).click();
    await expect(page.getByText('Tata Steel Limited')).toBeVisible();
    await expect(page.getByText('Tata Steel - Meramandali')).toHaveCount(0);
    // The groups fetch carried group=1.
    await expect.poll(() => seen.some((u) => new URL(u).searchParams.get('group') === '1')).toBeTruthy();
  });

  test('another tenant: no Parent companies tab', async ({ page }) => {
    await setup(page, { spark: false });
    await page.goto('/dashboard/crm/accounts');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tab', { name: 'Parent companies' })).toHaveCount(0);
  });
});
