import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok } from './spark';

/**
 * Edit activity shows the same options as Log Activity: the Linked entity (Lead / Contact / Deal / Account + search),
 * and the Activity date for a completed one. A link is only sent when it was changed, and re-linking clears the others.
 */
const ACCOUNT = { id: 'acc-1', org_id: 'o', name: 'Acme Forge', created_at: '2026-01-05T09:00:00Z', updated_at: '2026-01-05T09:00:00Z' };
const iso = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function setup(page: Page, patched: Record<string, any>[]) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1') return ok(route, ACCOUNT);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1/activities') {
        return ok(route, [{ id: 'act-1', org_id: 'o', type: 'call', subject: 'Intro call', status: 'completed', completed_at: iso(-48),
          contact_id: 'con-1', contact_name: 'Ravi Agrawal', created_at: iso(-50), updated_at: iso(-48) }]);
      }
      if (method === 'GET' && /^\/api\/v1\/crm\/accounts\/acc-1\/(contacts|deals|notes)$/.test(p)) return ok(route, []);
      if (method === 'GET' && p === '/api/v1/crm/activity-types') return ok(route, []);
      if (method === 'GET' && p === '/api/v1/crm/leads') return ok(route, [{ id: 'lead-9', first_name: 'Neeraj', last_name: 'Urmalia', phone: '7747019157' }]);
      if (method === 'PATCH' && p === '/api/v1/crm/activities/act-1') {
        patched.push(route.request().postDataJSON() as Record<string, any>);
        return ok(route, { id: 'act-1' });
      }
      return false;
    },
  });
}

async function openEdit(page: Page) {
  await page.goto('/dashboard/crm/accounts/acc-1');
  await page.getByRole('button', { name: 'Edit activity: Intro call' }).click({ timeout: 60_000 });
  await expect(page.getByText('Edit activity', { exact: true })).toBeVisible();
}

test.describe('Edit activity: linked entity', () => {
  test('shows the current link and the activity date; an untouched save sends no link', async ({ page }) => {
    const patched: Record<string, any>[] = [];
    await setup(page, patched);
    await openEdit(page);
    await expect(page.locator('#linked-entity-type')).toHaveValue('contact');
    await expect(page.locator('#linked-entity-search')).toHaveValue('Ravi Agrawal');
    await expect(page.getByTestId('edit-activity-date')).toBeVisible();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => patched.length).toBe(1);
    for (const k of ['lead_id', 'contact_id', 'deal_id', 'account_id', 'completed_at']) expect(patched[0]).not.toHaveProperty(k);
  });

  test('re-linking to a lead sets lead_id and clears the other links', async ({ page }) => {
    const patched: Record<string, any>[] = [];
    await setup(page, patched);
    await openEdit(page);
    await page.locator('#linked-entity-type').selectOption('lead');
    await page.locator('#linked-entity-search').click();
    await page.getByRole('option', { name: /Neeraj Urmalia/ }).dispatchEvent('mousedown');
    await expect(page.locator('#linked-entity-search')).toHaveValue(/Neeraj Urmalia/);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => patched.length).toBe(1);
    expect(patched[0]).toMatchObject({ lead_id: 'lead-9', contact_id: null, deal_id: null, account_id: null });
  });

  test('choosing a type without picking a record is refused; None unlinks', async ({ page }) => {
    const patched: Record<string, any>[] = [];
    await setup(page, patched);
    await openEdit(page);
    await page.locator('#linked-entity-type').selectOption('deal');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/Pick a deal to link/i)).toBeVisible();
    expect(patched).toHaveLength(0);
    await page.locator('#linked-entity-type').selectOption('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => patched.length).toBe(1);
    expect(patched[0]).toMatchObject({ lead_id: null, contact_id: null, deal_id: null, account_id: null });
  });
});
