import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { scopeToSpark } from './spark';

/**
 * Sample invoices on a lead (connected-B2B / Spark & Ray only). A plain list of sample-invoice NUMBERS held on
 * the lead's custom_fields.sample_invoices jsonb — add via a text box, remove via a ×. Adding/removing PATCHes
 * the lead with the MERGED custom_fields (other keys preserved) and the page refetches so it survives a reload.
 * Runs against an intercepted, stateful API and asserts on what the page shows and on what it SENDS.
 */

const BASE_CUSTOM_FIELDS = { campaign: 'Diwali', sample_invoices: ['INV-1'] };

const LEAD = {
  id: 'lead-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair', phone: '9876501234',
  title: 'Procurement Head', company: 'Nair Steel Traders', is_b2c: false, status: 'working',
  owner_id: 'u-asha', owner_name: 'Asha Menon', created_by: SEED_USER.id, created_at: '2026-09-20T10:00:00Z',
  custom_fields: BASE_CUSTOM_FIELDS,
};

interface Seen { method: string; path: string; body: any }
const writes = (seen: Seen[], method: string, path: string) =>
  seen.filter((r) => r.method === method && r.path === path);

/** Stateful setup: PATCH /leads/lead-1 merges the body into the in-memory lead, so a refetch sees the change. */
async function setup(page: Page, o: { spark?: boolean; lead?: Record<string, unknown> } = {}) {
  const seen: Seen[] = [];
  if (o.spark !== false) await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  let leadState: Record<string, unknown> = { ...LEAD, ...(o.lead ?? {}) };
  await mockApi(page, {
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
      let body: any = null;
      try { body = route.request().postDataJSON(); } catch { /* not json */ }
      if (method !== 'GET') seen.push({ method, path, body });
      const ok = (data: unknown) => route.fulfill({ json: { success: true, data } }).then(() => true);
      if (method === 'GET' && path === '/api/v1/crm/leads/lead-1') return ok(leadState);
      if (method === 'PATCH' && path === '/api/v1/crm/leads/lead-1') {
        // Mirror the backend: fold the PATCH body onto the row (custom_fields replaced by what we send).
        leadState = { ...leadState, ...(body ?? {}) };
        return ok(leadState);
      }
      if (method === 'GET' && path === '/api/v1/crm/leads/lead-1/activities') return ok([]);
      if (method === 'GET' && path === '/api/v1/crm/leads/lead-1/updates') return ok([]);
      if (method === 'GET' && path === '/api/v1/crm/leads/lead-1/deals') return ok([]);
      if (method === 'GET' && path === '/api/v1/crm/leads/lead-1/contacts') return ok([]);
      if (method === 'GET' && path.endsWith('/leads/lead-1/conversations')) return ok([]);
      if (method === 'GET' && path.endsWith('/leads/lead-1/expenses')) return ok({ totals: {}, currency: 'INR', claims: [] });
      return false;
    },
  });
  return seen;
}

const open = async (page: Page) => {
  await page.goto('/dashboard/crm/leads/lead-1');
  await expect(page.getByText('Owner: Asha Menon')).toBeVisible({ timeout: 30_000 });
};

test.describe('Sample invoices — Spark & Ray', () => {
  test('Spark shows the card with the stored numbers', async ({ page }) => {
    await setup(page);
    await open(page);
    await expect(page.getByText('Sample invoices', { exact: true })).toBeVisible();
    await expect(page.getByText('INV-1', { exact: true })).toBeVisible();
  });

  test('adding a number appends it and PATCHes the MERGED custom_fields', async ({ page }) => {
    const seen = await setup(page);
    await open(page);
    await page.getByLabel('Invoice number').fill('INV-2');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    // It PATCHes the whole custom_fields: the existing campaign key is preserved, sample_invoices now has both.
    await expect.poll(() => writes(seen, 'PATCH', '/api/v1/crm/leads/lead-1')[0]?.body).toEqual({
      custom_fields: { campaign: 'Diwali', sample_invoices: ['INV-1', 'INV-2'] },
    });
    await expect(page.getByText('INV-2', { exact: true })).toBeVisible();
  });

  test('removing a number deletes it and PATCHes the remaining list', async ({ page }) => {
    const seen = await setup(page, { lead: { custom_fields: { campaign: 'Diwali', sample_invoices: ['INV-1', 'INV-2'] } } });
    await open(page);
    await expect(page.getByText('INV-2', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remove INV-1' }).click();
    await expect.poll(() => writes(seen, 'PATCH', '/api/v1/crm/leads/lead-1')[0]?.body).toEqual({
      custom_fields: { campaign: 'Diwali', sample_invoices: ['INV-2'] },
    });
    await expect(page.getByText('INV-1', { exact: true })).toHaveCount(0);
  });

  test('a blank entry is ignored — no PATCH is sent', async ({ page }) => {
    const seen = await setup(page);
    await open(page);
    // The Add button is disabled for blank/whitespace; force the submit path anyway via Enter.
    await page.getByLabel('Invoice number').fill('   ');
    await page.getByLabel('Invoice number').press('Enter');
    await page.waitForTimeout(300);
    expect(writes(seen, 'PATCH', '/api/v1/crm/leads/lead-1')).toHaveLength(0);
  });

  test('a duplicate of an existing number is ignored — no PATCH is sent', async ({ page }) => {
    const seen = await setup(page);
    await open(page);
    await page.getByLabel('Invoice number').fill('INV-1');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.waitForTimeout(300);
    expect(writes(seen, 'PATCH', '/api/v1/crm/leads/lead-1')).toHaveLength(0);
    // Still exactly one chip for INV-1.
    await expect(page.getByText('INV-1', { exact: true })).toHaveCount(1);
  });
});

test.describe('Sample invoices — other tenants', () => {
  test('a non-Spark tenant does NOT see the card', async ({ page }) => {
    const seen = await setup(page, { spark: false });
    await open(page);
    await expect(page.getByText('Sample invoices', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Invoice number')).toHaveCount(0);
    // And even the stored number never renders for them.
    await expect(page.getByText('INV-1', { exact: true })).toHaveCount(0);
    expect(seen.filter((r) => r.method === 'PATCH')).toHaveLength(0);
  });
});
