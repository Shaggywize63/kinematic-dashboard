import { test, expect } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark } from './spark';

/**
 * Spark & Ray account page: "Recent updates" (contact select + composer, posts to
 * /crm/accounts/:id/updates) and the Journey / Assign task / New deal shortcuts. A non-Spark tenant must
 * look exactly as before — no card, no buttons, no calls to the Spark-only endpoints.
 */

const ACCOUNT = { id: 'acc-1', org_id: 'e2e-org-1', name: 'Acme Forge', created_at: '2026-01-05T09:00:00Z', updated_at: '2026-01-05T09:00:00Z' };
const CONTACTS = [
  { id: 'c-1', first_name: 'Priya', last_name: 'Nair', email: 'priya@acme.example', account_id: 'acc-1' },
  { id: 'c-2', first_name: 'Dev', last_name: 'Shah', email: 'dev@acme.example', account_id: 'acc-1' },
];
const EXISTING = {
  id: 'upd-1', account_id: 'acc-1', contact_id: 'c-2', body: 'Dev asked for a revised quote', created_by: 'someone-else',
  created_at: new Date(Date.now() - 3600_000).toISOString(), updated_at: new Date().toISOString(), contact_name: 'Dev Shah', author_name: 'Asha Rao',
};

async function setup(page: import('@playwright/test').Page, calls: { posted: Record<string, unknown>[]; updatesGets: number }) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1') return ok(route, ACCOUNT);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1/contacts') return ok(route, CONTACTS);
      if (p === '/api/v1/crm/accounts/acc-1/updates') {
        if (method === 'GET') { calls.updatesGets += 1; return ok(route, [EXISTING]); }
        if (method === 'POST') {
          const body = route.request().postDataJSON() as Record<string, unknown>;
          calls.posted.push(body);
          const contact = CONTACTS.find((c) => c.id === body.contact_id);
          return ok(route, {
            id: 'upd-new', account_id: 'acc-1', contact_id: body.contact_id ?? null, body: body.body, created_by: SEED_USER.id,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            contact_name: contact ? `${contact.first_name} ${contact.last_name}` : null, author_name: SEED_USER.name,
          }, 201);
        }
      }
      return false;
    },
  });
}

test.describe('Spark account page', () => {
  test('shows Recent updates with a contact select and posts the right body', async ({ page }) => {
    const calls = { posted: [] as Record<string, unknown>[], updatesGets: 0 };
    await scopeToSpark(page);
    await setup(page, calls);
    await page.goto('/dashboard/crm/accounts/acc-1');

    await expect(page.getByText('Recent updates', { exact: true })).toBeVisible({ timeout: 30_000 });
    const card = page.getByTestId('account-updates');
    // The existing update renders with its contact + author.
    await expect(card.getByText('Dev asked for a revised quote')).toBeVisible();
    await expect(card.getByText('with Dev Shah')).toBeVisible();

    // The contact select lists "No specific contact" + the account's contacts.
    const select = card.getByLabel('Contact person').first();
    await expect(select.locator('option')).toHaveText(['No specific contact', 'Priya Nair', 'Dev Shah']);

    // Post is disabled until there is text.
    const post = card.getByRole('button', { name: 'Post' });
    await expect(post).toBeDisabled();
    await select.selectOption({ label: 'Priya Nair' });
    await card.getByLabel('Update', { exact: true }).fill('Visited the plant, PO expected next week');
    await post.click();

    await expect(card.getByText('Visited the plant, PO expected next week')).toBeVisible();
    expect(calls.posted).toEqual([{ body: 'Visited the plant, PO expected next week', contact_id: 'c-1' }]);

    // "No specific contact" omits contact_id.
    await select.selectOption({ label: 'No specific contact' });
    await card.getByLabel('Update', { exact: true }).fill('General check-in');
    await post.click();
    await expect(card.getByText('General check-in')).toBeVisible();
    expect(calls.posted[1]).toEqual({ body: 'General check-in' });
  });

  test('has the View journey / Assign task / New deal shortcuts pre-filled with the account', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page, { posted: [], updatesGets: 0 });
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByRole('link', { name: 'View journey' })).toHaveAttribute('href', '/dashboard/crm/accounts/acc-1/journey', { timeout: 30_000 });
    const assign = page.getByRole('link', { name: 'Assign task / activity' });
    await expect(assign).toHaveAttribute('href', /\/dashboard\/crm\/activities\/new\?account_id=acc-1&account_name=Acme%20Forge/);
    await expect(page.getByRole('link', { name: 'New deal' })).toHaveAttribute('href', '/dashboard/crm/deals/new?account_id=acc-1');
  });

  test('a non-Spark tenant sees none of it and never calls the updates endpoint', async ({ page }) => {
    const calls = { posted: [] as Record<string, unknown>[], updatesGets: 0 };
    await setup(page, calls);
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByText('Acme Forge').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expect(page.getByText('Recent updates', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'View journey' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Assign task / activity' })).toHaveCount(0);
    expect(calls.updatesGets).toBe(0);
  });
});
