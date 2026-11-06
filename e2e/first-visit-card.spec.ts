import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok } from './spark';
import { BMW_CLIENT_ID, PASA_CLIENT_ID, TATA_TISCON_CLIENT_ID } from '../src/lib/clientFeatures';

/**
 * The "Mark first visit done" card on Log Activity is a Tata flow. Opening the form from a lead used to show it to
 * every client; now only Tata Tiscon and PASA (the tenants the lead-create redirect sends into this screen) keep it.
 * Everyone else, BMW included, gets the plain Log Activity form, still linked to the lead.
 */

type Body = Record<string, any>;
const OTHER_CLIENT_ID = '0490f34d-d9a3-4f39-99e2-8f3adba8c583'; // a client that is not one of the first-visit tenants
const asClient = (client_id: string | null) => ({ ...SEED_USER, client_id });

const CARD = /Mark first visit done/;

async function setup(page: Page, user: Record<string, unknown>, writes: Body[] = [], opts: { picker?: string; actingAs?: string } = {}) {
  await seedSession(page, user);
  if (opts.picker || opts.actingAs) {
    await page.addInitScript(([picker, acting]) => {
      if (picker) localStorage.setItem('kinematic_selected_client', picker);
      // Super-admin "Login as client": pinned in memory, deliberately not saved to the picker key.
      if (acting) localStorage.setItem('kinematic_acting_as', JSON.stringify({ org_id: 'e2e-org-1', client_id: acting, name: 'Acting client' }));
    }, [opts.picker ?? '', opts.actingAs ?? ''] as const);
  }
  await mockApi(page, {
    // The layout writes /auth/me back into the stored user, so it must return the same user we seeded.
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'POST' && p === '/api/v1/crm/activities') {
        writes.push(route.request().postDataJSON() as Body);
        return ok(route, { id: 'a-new' }, 201);
      }
      if (method === 'GET' && p === '/api/v1/crm/activities') {
        return route.fulfill({ json: { success: true, data: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false } } }).then(() => true);
      }
      return false;
    },
  });
}

const openFromLead = async (page: Page) => {
  await page.goto('/dashboard/crm/activities/new?lead_id=lead-1');
  await expect(page.getByRole('heading', { name: 'Log Activity' })).toBeVisible({ timeout: 30_000 });
};

test.describe('first-visit card: who sees it', () => {
  test('Tata Tiscon sees the card, and not the plain date fields', async ({ page }) => {
    await setup(page, asClient(TATA_TISCON_CLIENT_ID));
    await openFromLead(page);
    await expect(page.getByText(CARD)).toBeVisible();
    await expect(page.getByTestId('activity-date')).toHaveCount(0);
    await expect(page.getByTestId('activity-scheduled')).toHaveCount(0);
  });

  test('PASA (a Tata-style tenant) keeps the card', async ({ page }) => {
    await setup(page, asClient(PASA_CLIENT_ID));
    await openFromLead(page);
    await expect(page.getByText(CARD)).toBeVisible();
  });

  test('BMW does not get the card', async ({ page }) => {
    await setup(page, asClient(BMW_CLIENT_ID));
    await openFromLead(page);
    await expect(page.getByTestId('activity-date')).toBeVisible();
    await expect(page.getByText(CARD)).toHaveCount(0);
  });

  test('any other client does not get the card', async ({ page }) => {
    await setup(page, asClient(OTHER_CLIENT_ID));
    await openFromLead(page);
    await expect(page.getByTestId('activity-date')).toBeVisible();
    await expect(page.getByText(CARD)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Also schedule next visit/ })).toHaveCount(0);
  });

  test('a user with no client and none picked does not get the card', async ({ page }) => {
    await setup(page, asClient(null));
    await openFromLead(page);
    await expect(page.getByText(CARD)).toHaveCount(0);
  });

  test('a super-admin who picked Tata in the client picker gets the card', async ({ page }) => {
    await setup(page, asClient(null), [], { picker: TATA_TISCON_CLIENT_ID });
    await openFromLead(page);
    await expect(page.getByText(CARD)).toBeVisible();
  });

  test('a super-admin who picked another client does not', async ({ page }) => {
    await setup(page, asClient(null), [], { picker: OTHER_CLIENT_ID });
    await openFromLead(page);
    await expect(page.getByText(CARD)).toHaveCount(0);
  });

  test('a super-admin using "Login as client" on Tata gets the card', async ({ page }) => {
    await setup(page, asClient(null), [], { actingAs: TATA_TISCON_CLIENT_ID });
    await openFromLead(page);
    await expect(page.getByText(CARD)).toBeVisible();
  });

  test('without a lead, Tata gets the plain form too (the card is only for a lead)', async ({ page }) => {
    await setup(page, asClient(TATA_TISCON_CLIENT_ID));
    await page.goto('/dashboard/crm/activities/new');
    await expect(page.getByRole('heading', { name: 'Log Activity' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(CARD)).toHaveCount(0);
    await expect(page.getByTestId('activity-date')).toBeVisible();
  });
});

test.describe('first-visit card: what a client without it gets', () => {
  test('opened from a lead, the plain form still links the lead and saves a normal activity', async ({ page }) => {
    const writes: Body[] = [];
    await setup(page, asClient(OTHER_CLIENT_ID), writes);
    await openFromLead(page);

    await page.getByRole('button', { name: 'Log Activity' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });

    expect(writes).toHaveLength(1);
    expect(writes[0].lead_id).toBe('lead-1');
    expect(writes[0].status).toBe('completed');
    expect(Math.abs(Date.parse(writes[0].completed_at) - Date.now())).toBeLessThan(2 * 60_000);
    // None of the first-visit bookkeeping leaks into a client that does not use it.
    expect(JSON.stringify(writes[0].custom_fields ?? {})).not.toMatch(/first_visit|visit_kind/);
  });

  test('Tata still saves the first visit as before', async ({ page }) => {
    const writes: Body[] = [];
    await setup(page, asClient(TATA_TISCON_CLIENT_ID), writes);
    await openFromLead(page);

    await page.getByRole('button', { name: 'Log Activity' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });

    expect(writes).toHaveLength(1);
    expect(writes[0].lead_id).toBe('lead-1');
    expect(writes[0].custom_fields?.is_first_visit).toBe(true);
    expect(writes[0].custom_fields?.visit_kind).toBe('completed');
  });
});
