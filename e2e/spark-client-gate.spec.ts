import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark, SPARK_CLIENT_ID } from './spark';

/**
 * Spark gate: a client-admin login (role `client`, `client_id` = Spark, NO header client-picker selection) must
 * get the Spark controls, same as a platform admin who picked Spark. A user of another client, or an org-wide
 * admin, must not. Picker / acting-as selection still wins over the user's own client.
 */

const ACCOUNT = { id: 'acc-1', org_id: 'e2e-org-1', name: 'Acme Forge', created_at: '2026-01-05T09:00:00Z', updated_at: '2026-01-05T09:00:00Z' };
const OTHER_CLIENT = '11111111-2222-4333-8444-555555555555';
const CLIENT_ADMIN = { ...SEED_USER, id: 'e2e-client-admin', role: 'client', client_id: SPARK_CLIENT_ID };

async function setup(page: Page, user: Record<string, unknown>) {
  await seedSession(page, user);
  await mockApi(page, {
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1') return ok(route, ACCOUNT);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1/contacts') return ok(route, []);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1/updates') return ok(route, []);
      return false;
    },
  });
}

test.describe('Spark gate follows the effective client', () => {
  test('a client admin pinned to Spark (no picker selection) sees the Spark controls', async ({ page }) => {
    await setup(page, CLIENT_ADMIN);
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByRole('link', { name: 'View journey' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Recent updates', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New deal' })).toBeVisible();
    const picked = await page.evaluate(() => window.localStorage.getItem('kinematic_selected_client'));
    expect(picked).toBeNull();
  });

  test('a user of another client sees none of them', async ({ page }) => {
    await setup(page, { ...CLIENT_ADMIN, client_id: OTHER_CLIENT });
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'View journey' })).toHaveCount(0);
    await expect(page.getByText('Recent updates', { exact: true })).toHaveCount(0);
  });

  test('an org-wide admin (no client) with no picker selection sees none of them', async ({ page }) => {
    await setup(page, SEED_USER);
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'View journey' })).toHaveCount(0);
  });

  test('the picker selection wins over the signed-in user\'s own client', async ({ page }) => {
    // Spark user, but the picker is on another client -> not Spark.
    await page.addInitScript((id) => window.localStorage.setItem('kinematic_selected_client', id), OTHER_CLIENT);
    await setup(page, CLIENT_ADMIN);
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'View journey' })).toHaveCount(0);
  });

  test('a platform admin who picks Spark still gets the Spark controls', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page, SEED_USER);
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByRole('link', { name: 'View journey' })).toBeVisible({ timeout: 30_000 });
  });
});
