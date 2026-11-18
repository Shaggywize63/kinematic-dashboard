import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark } from './spark';

/**
 * Spark & Ray lead IDENTITY.
 *
 * Two surfaces, one model (src/lib/leadStructure.ts):
 *  - the create form shows the identity chain assembling itself as the rep types, and offers
 *    the linked company's known plants as one-tap chips;
 *  - an account says what is stopping its slice of the tree from being complete.
 *
 * The chain is ACCOUNT › PLANT › DEPARTMENT › CONTACT › REQUIREMENT › SERIAL › OWNER, and an
 * empty link must RENDER as empty rather than disappear — a gap you cannot see never gets filled.
 */

const PERSON = {
  id: 'c-9', first_name: 'R.', last_name: 'Sharma', title: 'Sr. Manager', phone: '9876500000',
  email: 'r.sharma@ntpc.example', account_id: 'acc-ntpc', account_name: 'NTPC Limited',
};
const NTPC = { id: 'acc-ntpc', name: 'NTPC Limited', industry: 'Power & Energy' };
const SITES = [
  { id: 'site-dadri', account_id: 'acc-ntpc', name: 'Dadri' },
  { id: 'site-korba', account_id: 'acc-ntpc', name: 'Korba' },
];

async function formSetup(page: Page) {
  await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: {} } },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/contacts') return ok(route, [PERSON]);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-ntpc') return ok(route, NTPC);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-ntpc/sites') return ok(route, SITES);
      if (method === 'GET' && p === '/api/v1/crm/accounts') return ok(route, [NTPC]);
      return false;
    },
  });
}

const slot = (page: Page, key: string) => page.getByTestId(`identity-slot-${key}`);
const value = (page: Page, key: string) => page.getByTestId(`identity-value-${key}`);

async function pickPerson(page: Page) {
  const search = page.getByPlaceholder('Start typing a contact name…').first();
  await expect(search).toBeVisible({ timeout: 30_000 });
  // Per-character typing: a fill() landing before hydration is never seen by the search effect,
  // and the delay clears the typeahead's 250ms debounce.
  await search.click();
  await search.pressSequentially('Sharma', { delay: 120 });
  await page.getByRole('option', { name: /R\. Sharma/ }).first().click();
}

test.describe('Lead form — the identity strip builds itself', () => {
  test('starts empty, showing every link as a gap rather than hiding them', async ({ page }) => {
    await formSetup(page);
    await page.goto('/dashboard/crm/leads/new');
    const strip = page.getByTestId('lead-identity-strip');
    await expect(strip).toBeVisible({ timeout: 30_000 });
    await expect(strip).toHaveAttribute('data-variant', 'form');
    await expect(strip).toHaveAttribute('data-complete', 'no');
    for (const key of ['account', 'plant', 'department', 'contact', 'requirement', 'serial']) {
      await expect(slot(page, key)).toHaveAttribute('data-filled', 'no');
      await expect(value(page, key)).toHaveText('Not set');
    }
  });

  test('linking a person fills the account and contact links live', async ({ page }) => {
    await formSetup(page);
    await page.goto('/dashboard/crm/leads/new');
    await pickPerson(page);
    await expect(value(page, 'account')).toHaveText('NTPC Limited');
    await expect(value(page, 'contact')).toHaveText('R. Sharma');
    await expect(slot(page, 'account')).toHaveAttribute('data-filled', 'yes');
  });

  test('the serial stays blank on the form — the backend allocates it on save', async ({ page }) => {
    await formSetup(page);
    await page.goto('/dashboard/crm/leads/new');
    await pickPerson(page);
    await expect(slot(page, 'serial')).toHaveAttribute('data-filled', 'no');
    await expect(slot(page, 'serial')).toHaveAttribute('title', /allocated automatically/i);
  });
});

test.describe('Lead form — plant picker', () => {
  test('offers the linked account’s plants as chips, and picking one fills the plant link', async ({ page }) => {
    await formSetup(page);
    await page.goto('/dashboard/crm/leads/new');
    await pickPerson(page);
    const chips = page.getByTestId('plant-chips');
    await expect(chips.getByRole('button', { name: 'Dadri' })).toBeVisible({ timeout: 20_000 });
    await expect(chips.getByRole('button', { name: 'Korba' })).toBeVisible();
    await chips.getByRole('button', { name: 'Dadri' }).click();
    await expect(chips.getByRole('button', { name: 'Dadri' })).toHaveAttribute('aria-pressed', 'true');
    await expect(value(page, 'plant')).toHaveText('Dadri');
  });

  test('clicking the picked chip again clears it, so a mis-tap is one tap to undo', async ({ page }) => {
    await formSetup(page);
    await page.goto('/dashboard/crm/leads/new');
    await pickPerson(page);
    const dadri = page.getByTestId('plant-chips').getByRole('button', { name: 'Dadri' });
    await dadri.click();
    await expect(value(page, 'plant')).toHaveText('Dadri');
    await dadri.click();
    await expect(slot(page, 'plant')).toHaveAttribute('data-filled', 'no');
  });

  test('a plant that is not on the account is badged NEW; a known one is not', async ({ page }) => {
    await formSetup(page);
    await page.goto('/dashboard/crm/leads/new');
    await pickPerson(page);
    const chips = page.getByTestId('plant-chips');
    await expect(chips.getByRole('button', { name: 'Dadri' })).toBeVisible({ timeout: 20_000 });
    // A known plant, picked from the account — nothing is being created.
    await chips.getByRole('button', { name: 'Dadri' }).click();
    await expect(page.getByTestId('plant-new-badge')).toHaveCount(0);
    // A name the account has never seen — flagged, so a typo is caught before it becomes a second site.
    const input = page.locator('input#\\:r0\\:-input, input[placeholder*="Dadri Super Thermal"]').first();
    await input.fill('Dadrii Super Thermal Plant');
    await expect(page.getByTestId('plant-new-badge')).toBeVisible();
    // Case and padding are not a new plant.
    await input.fill('  dadri  ');
    await expect(page.getByTestId('plant-new-badge')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// The account side: what is stopping this branch of the tree from being complete.
// ---------------------------------------------------------------------------

const GROUP = { id: 'acc-jsw', org_id: 'e2e-org-1', name: 'JSW Group', is_group: true, parent_account_id: null };
const CHILD_A = { id: 'acc-jsw-1', name: 'JSW JFE Steel Limited - Sambalpur, Odisha', parent_account_id: 'acc-jsw' };
const CHILD_B = { id: 'acc-jsw-2', name: 'JSW Cement Limited - Jajpur, Odisha', parent_account_id: 'acc-jsw' };

async function accountSetup(page: Page, opts: {
  children: unknown[]; childLeads: Record<string, unknown[]>; leads?: unknown[];
  account?: Record<string, unknown>; sites?: unknown[]; patches?: Record<string, unknown>[];
}) {
  await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'PATCH' && p === '/api/v1/crm/accounts/acc-jsw') {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        opts.patches?.push(body);
        return ok(route, { ...GROUP, ...(opts.account || {}), ...body });
      }
      if (method !== 'GET') return false;
      if (p === '/api/v1/crm/accounts/acc-jsw') return ok(route, { ...GROUP, ...(opts.account || {}) });
      if (p === '/api/v1/crm/accounts/acc-jsw/sites') return ok(route, opts.sites ?? []);
      // The children query — same path as the accounts list, told apart by the filter.
      if (p === '/api/v1/crm/accounts' && url.includes('parent_account_id=')) return ok(route, opts.children);
      for (const [id, leads] of Object.entries(opts.childLeads)) {
        if (p === `/api/v1/crm/accounts/${id}/leads`) return ok(route, leads);
      }
      if (p === '/api/v1/crm/accounts/acc-jsw/leads') return ok(route, opts.leads ?? []);
      if (p.startsWith('/api/v1/crm/accounts/acc-jsw/')) return ok(route, []);
      return false;
    },
  });
}

test.describe('Account page — what is missing to complete the tree', () => {
  test('a group whose companies carry no leads is called out as a break, with the count', async ({ page }) => {
    // The real JSW Group shape: two companies under it, not one lead between them.
    await accountSetup(page, { children: [CHILD_A, CHILD_B], childLeads: { 'acc-jsw-1': [], 'acc-jsw-2': [] } });
    await page.goto('/dashboard/crm/accounts/acc-jsw');
    const gaps = page.getByTestId('account-structure-gaps');
    await expect(gaps).toBeVisible({ timeout: 30_000 });
    await expect(gaps).toHaveAttribute('data-complete', 'no');
    await expect(gaps).toContainText('No leads anywhere under this group');
    await expect(gaps).toContainText('2 companies');
  });

  test('once a company under the group carries a lead, that break is gone', async ({ page }) => {
    await accountSetup(page, {
      children: [CHILD_A, CHILD_B],
      childLeads: { 'acc-jsw-1': [{ id: 'l-1', display_name: 'JSW · Sambalpur — Valves', site_name: 'Sambalpur', department: 'Procurement', requirement: 'Valves', primary_contact: { contact_id: 'c-1', name: 'A. Roy' } }], 'acc-jsw-2': [] },
    });
    await page.goto('/dashboard/crm/accounts/acc-jsw');
    const gaps = page.getByTestId('account-structure-gaps');
    await expect(gaps).toBeVisible({ timeout: 30_000 });
    await expect(gaps).not.toContainText('No leads anywhere under this group');
  });
});


test.describe('Account page — a gap is a control, not a nag', () => {
  test('each gap offers a labelled way to fix it', async ({ page }) => {
    await accountSetup(page, { children: [CHILD_A, CHILD_B], childLeads: { 'acc-jsw-1': [], 'acc-jsw-2': [] } });
    await page.goto('/dashboard/crm/accounts/acc-jsw');
    const gaps = page.getByTestId('account-structure-gaps');
    await expect(gaps).toBeVisible({ timeout: 30_000 });
    // Not just prose: the row is a button carrying the action it performs.
    await expect(gaps.getByRole('button', { name: /Open the companies/ })).toBeVisible();
  });

  test('the sections a gap points at exist on the page, with headings', async ({ page }) => {
    await accountSetup(page, { children: [], childLeads: {}, account: { is_group: false }, leads: [] });
    await page.goto('/dashboard/crm/accounts/acc-jsw');
    await expect(page.getByTestId('account-structure-gaps')).toBeVisible({ timeout: 30_000 });
    // Every anchor a gap can name is rendered, so a "jump to the fix" can never aim at nothing.
    for (const id of ['plants', 'leads', 'contacts', 'deals']) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
      await expect(page.locator(`#${id}`).getByRole('heading')).toBeVisible();
    }
  });

  test('"Set a parent company" opens the account dialog', async ({ page }) => {
    await accountSetup(page, { children: [], childLeads: {}, account: { is_group: false, parent_account_id: null }, leads: [] });
    await page.goto('/dashboard/crm/accounts/acc-jsw');
    const gaps = page.getByTestId('account-structure-gaps');
    await expect(gaps).toBeVisible({ timeout: 30_000 });
    await gaps.getByRole('button', { name: /Set a parent company/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('Account page — promote an individual account to a parent', () => {
  test('an individual account offers "Make this a parent account" and PATCHes is_group', async ({ page }) => {
    const patches: Record<string, unknown>[] = [];
    await accountSetup(page, { children: [], childLeads: {}, account: { is_group: false }, leads: [], patches });
    await page.goto('/dashboard/crm/accounts/acc-jsw');
    const promote = page.getByTestId('promote-to-parent');
    await expect(promote).toBeVisible({ timeout: 30_000 });
    await promote.click();
    // The write that actually makes it a parent — the flag the tree reads.
    await expect.poll(() => patches.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(patches[0]).toEqual({ is_group: true });
    // Once promoted it says so, and does not offer to promote again.
    await expect(page.getByTestId('is-parent-badge')).toBeVisible();
    await expect(promote).toHaveCount(0);
  });

  test('an account that is already a parent is never offered the promotion', async ({ page }) => {
    await accountSetup(page, { children: [CHILD_A], childLeads: { 'acc-jsw-1': [] }, account: { is_group: true } });
    await page.goto('/dashboard/crm/accounts/acc-jsw');
    await expect(page.getByTestId('is-parent-badge')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('promote-to-parent')).toHaveCount(0);
  });
});
