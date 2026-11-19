import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { scopeToSpark, apiPath, ok } from './spark';

/**
 * Spark & Ray: only admins may mark an activity complete. The "Complete" control
 * on the lead detail's "Up next" card is hidden for a field rep, shown for an
 * admin. Other tenants are unchanged (any assignee can complete).
 */
const LEAD = { id: 'lead-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair',
  company: 'Nair Steel', is_b2c: false, status: 'working', owner_id: 'u-asha', owner_name: 'Asha Menon',
  created_by: 'someone-else', created_at: '2026-09-20T10:00:00Z' };
const soon = new Date(Date.now() + 36e5).toISOString();
const ACTIVITY = { id: 'act-1', org_id: 'o', type: 'task', subject: 'Visit the plant', status: 'open',
  due_at: soon, created_at: soon, updated_at: soon };

async function setup(page: Page, o: { spark?: boolean; role?: string } = {}) {
  const user = o.role ? { ...SEED_USER, role: o.role } : SEED_USER;
  if (o.spark !== false) await scopeToSpark(page);
  await seedSession(page, user);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: { field_overrides: {} } } },
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1') return ok(route, LEAD);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1/activities') return ok(route, [ACTIVITY]);
      return false;
    },
  });
}

const open = async (page: Page) => {
  await page.goto('/dashboard/crm/leads/lead-1');
  await expect(page.getByText('Visit the plant').first()).toBeVisible({ timeout: 30_000 });
};

test.describe('Activity complete — admin only (Spark)', () => {
  test('admin sees the Complete control', async ({ page }) => {
    await setup(page);
    await open(page);
    await expect(page.getByRole('button', { name: 'Complete' }).first()).toBeVisible();
  });

  test('a field rep does NOT see the Complete control', async ({ page }) => {
    await setup(page, { role: 'executive' });
    await open(page);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'Complete' })).toHaveCount(0);
  });

  test('another tenant: a rep still sees Complete (unchanged)', async ({ page }) => {
    await setup(page, { spark: false, role: 'executive' });
    await open(page);
    await expect(page.getByRole('button', { name: 'Complete' }).first()).toBeVisible();
  });
});
