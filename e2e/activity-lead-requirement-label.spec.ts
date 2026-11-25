import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { scopeToSpark, apiPath, ok } from './spark';

/**
 * Logging an activity: the Lead entity picker labels each lead with the person's
 * name AND their requirement on the connected-B2B (Spark & Ray) workspace, so
 * one person's several leads/requirements are told apart. Other tenants keep
 * "Name · phone".
 */
const LEADS = [
  { id: 'lead-1', first_name: 'Sandip', last_name: 'Kundu', phone: '9163393449', requirement: 'New business opportunities and feedback of previous supply.' },
  { id: 'lead-2', first_name: 'Sandip', last_name: 'Kundu', phone: '9163393449', requirement: 'Replace ASCO pulse valves with MAC pulse valves.' },
];
const R1 = 'New business opportunities and feedback of previous supply.';
const R2 = 'Replace ASCO pulse valves with MAC pulse valves.';

// A structured Spark lead: no first/last on the row (the form links an existing
// contact); the customer name is stamped as `contact_name` by the API, and the
// company comes from the linked account (`account_name`) or the free-text company.
const STRUCTURED = [
  { id: 'lead-3', first_name: null, last_name: null, company: 'Budge Budge Refineries', account_name: 'Tata Steel - Meramandali', contact_name: 'Sandip Kundu', requirement: 'Pulse valves for the ESP revamp.' },
];

async function setup(page: Page, o: { spark?: boolean; leads?: unknown[] } = {}) {
  if (o.spark !== false) await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: {} } },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/leads') return ok(route, o.leads ?? LEADS);
      return false;
    },
  });
}

// Pick "Lead" in the entity-type select, focus the search, return the open dropdown.
async function openLeadPicker(page: Page) {
  await page.goto('/dashboard/crm/activities/new');
  const typeSelect = page.locator('select').filter({ has: page.locator('option[value="account"]') });
  await expect(typeSelect).toBeVisible({ timeout: 30_000 });
  await typeSelect.selectOption('lead');
  await page.getByPlaceholder(/Type to search leads/i).click();
}

test.describe('Activity → Lead picker shows the requirement', () => {
  test('Spark: each lead option shows name + its requirement (disambiguated)', async ({ page }) => {
    await setup(page);
    await openLeadPicker(page);
    // Both same-person leads are told apart by their requirement text.
    await expect(page.getByText(R1)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(R2)).toBeVisible();
    // The person's name is still shown (em-dash joins name — requirement).
    await expect(page.getByText(/Sandip Kundu — /).first()).toBeVisible();
  });

  test('Spark: a structured lead shows company · customer — requirement (account name wins)', async ({ page }) => {
    await setup(page, { leads: STRUCTURED });
    await openLeadPicker(page);
    // The company (linked account name) leads, then the stamped contact, then the requirement —
    // so the rep sees WHICH customer the lead is for, not just a person who may recur elsewhere.
    await expect(page.getByText('Tata Steel - Meramandali · Sandip Kundu — Pulse valves for the ESP revamp.')).toBeVisible({ timeout: 15_000 });
  });

  test('Spark: picking a lead shows the "this activity is for" Company → Lead → Contact context', async ({ page }) => {
    await setup(page, { leads: STRUCTURED });
    await openLeadPicker(page);
    await page.getByText('Tata Steel - Meramandali · Sandip Kundu — Pulse valves for the ESP revamp.').click();
    const ctx = page.getByTestId('activity-linked-context');
    await expect(ctx).toBeVisible();
    await expect(ctx).toContainText('This activity is for');
    await expect(ctx).toContainText('Tata Steel - Meramandali'); // Company
    await expect(ctx).toContainText('Sandip Kundu');             // Contact
    await expect(ctx).toContainText('Pulse valves for the ESP revamp.'); // Lead (requirement)
  });

  test('another tenant: name · phone, no requirement', async ({ page }) => {
    await setup(page, { spark: false });
    await openLeadPicker(page);
    await expect(page.getByText('9163393449').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(R1)).toHaveCount(0);
    await expect(page.getByText(R2)).toHaveCount(0);
  });
});
