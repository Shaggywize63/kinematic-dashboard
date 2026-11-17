import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, fail, ok, scopeToSpark } from './spark';

/**
 * Spark & Ray accounts + contacts:
 *  - NO Outcome on account create / edit any more (a stored one is shown read-only as "Outcome (earlier)" on the detail);
 *  - "Add contact" on the account detail opens contacts/new with the account pre-linked and locked;
 *  - contacts/new has an optional Company picker; an existing contact can be added to / moved between accounts
 *    (contact detail + the contacts list) via PATCH /crm/contacts/:id { account_id }.
 * A non-Spark tenant sees none of it and its payloads are unchanged.
 */

const ACCOUNT = { id: 'acc-1', org_id: 'e2e-org-1', name: 'Acme Forge', outcome: 'Quote accepted, PO expected', created_at: '2026-01-05T09:00:00Z', updated_at: '2026-01-05T09:00:00Z' };
const ACCOUNTS = [ACCOUNT, { id: 'acc-2', org_id: 'e2e-org-1', name: 'Beta Castings', created_at: '2026-01-06T09:00:00Z', updated_at: '2026-01-06T09:00:00Z' }];
const CONTACT = { id: 'c-1', org_id: 'e2e-org-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair', email: 'priya@x.example', is_b2c: false, created_at: '2026-01-05T09:00:00Z', updated_at: '2026-01-05T09:00:00Z' };
const LINKED = { ...CONTACT, id: 'c-2', first_name: 'Dev', last_name: 'Shah', full_name: 'Dev Shah', account_id: 'acc-1', account_name: 'Acme Forge' };

type Writes = { method: string; path: string; body: Record<string, any> }[];

async function setup(page: Page, writes: Writes, opts: { contacts?: unknown[]; createFails?: string; account?: Record<string, unknown> } = {}) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1') return ok(route, opts.account ?? ACCOUNT);
      if (method === 'GET' && p === '/api/v1/crm/accounts') return ok(route, ACCOUNTS);
      if (method === 'GET' && p === '/api/v1/crm/contacts') return ok(route, opts.contacts ?? [CONTACT, LINKED]);
      if (method === 'GET' && p === '/api/v1/crm/contacts/c-1') return ok(route, CONTACT);
      if (method === 'GET' && p === '/api/v1/crm/contacts/c-2') return ok(route, LINKED);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1/timeline') return ok(route, null);
      if (['POST', 'PATCH'].includes(method) && /^\/api\/v1\/crm\/(accounts|contacts)(\/[^/]+)?$/.test(p)) {
        const body = route.request().postDataJSON() as Record<string, any>;
        writes.push({ method, path: p, body });
        if (opts.createFails && method === 'POST') return fail(route, 400, opts.createFails);
        return ok(route, { ...(p.includes('contacts') ? CONTACT : ACCOUNT), ...body, id: p.split('/')[5] || 'new-1' }, method === 'POST' ? 201 : 200);
      }
      return false;
    },
  });
}

test.describe('Spark account Outcome is gone from accounts', () => {
  test('create: no Outcome field; saves without one and sends no outcome', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes);
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Outcome')).toHaveCount(0);
    await page.getByLabel('Name', { exact: true }).fill('Gamma Dies');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ method: 'POST', path: '/api/v1/crm/accounts', body: { name: 'Gamma Dies' } });
    expect(Object.keys(writes[0].body)).not.toContain('outcome');
  });

  test('non-Spark: no Outcome field and no outcome in the payload', async ({ page }) => {
    const writes: Writes = [];
    await setup(page, writes);
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Outcome')).toHaveCount(0);
    await page.getByLabel('Name', { exact: true }).fill('Gamma Dies');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(Object.keys(writes[0].body)).not.toContain('outcome');
  });

  test('detail shows a stored outcome read-only as "Outcome (earlier)"; the edit modal has no Outcome and PATCHes without it', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes);
    await page.goto('/dashboard/crm/accounts/acc-1');
    const earlier = page.getByTestId('account-outcome');
    await expect(earlier).toContainText('Quote accepted, PO expected', { timeout: 30_000 });
    await expect(earlier).toContainText('Outcome (earlier)');

    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Edit Account' });
    await expect(dialog.getByLabel('Outcome')).toHaveCount(0);
    await dialog.getByLabel(/^Name/).fill('Acme Forge Ltd');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/crm/accounts/acc-1', body: { name: 'Acme Forge Ltd' } });
    expect(Object.keys(writes[0].body)).not.toContain('outcome');
  });

  test('an account without a stored outcome shows no Outcome block; non-Spark never does', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes, { account: { ...ACCOUNT, outcome: null } });
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByText('Acme Forge').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('account-outcome')).toHaveCount(0);
  });

  test('non-Spark detail / edit modal: no outcome anywhere', async ({ page }) => {
    const writes: Writes = [];
    await setup(page, writes);
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByText('Acme Forge').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('account-outcome')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Add contact' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: 'Edit Account' }).getByLabel('Outcome')).toHaveCount(0);
  });
});

test.describe('Spark: Add contact from an account', () => {
  test('the button opens contacts/new with the account locked; the contact is created on it', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes);
    await page.goto('/dashboard/crm/accounts/acc-1');
    const add = page.getByRole('link', { name: 'Add contact' });
    await expect(add).toBeVisible({ timeout: 30_000 });
    await expect(add).toHaveAttribute('href', /\/dashboard\/crm\/contacts\/new\?account_id=acc-1&account_name=Acme%20Forge/);
    await add.click();

    await expect(page.getByRole('heading', { name: 'New Contact' })).toBeVisible({ timeout: 30_000 });
    const account = page.getByLabel('Company', { exact: true });
    await expect(account).toHaveValue('Acme Forge');
    await expect(account).toBeDisabled();
    await expect(page.getByText('This contact will be added to this company.')).toBeVisible();

    await page.getByLabel('First Name').fill('Meera');
    await page.getByLabel('Email').fill('meera@acme.example');
    await page.getByRole('button', { name: 'Create' }).click();
    // City is required on every contact.
    await expect(page.getByText(/City is required/)).toBeVisible();
    expect(writes).toHaveLength(0);
  });

  test('contacts/new without a link has an optional Company picker and sends account_id', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes);
    await page.goto('/dashboard/crm/contacts/new');
    await expect(page.getByRole('heading', { name: 'New Contact' })).toBeVisible({ timeout: 30_000 });
    const picker = page.getByLabel('Company', { exact: true });
    await expect(picker).toBeEnabled();
    await picker.click();
    await picker.fill('beta');
    await page.getByRole('option', { name: 'Beta Castings' }).dispatchEvent('mousedown');
    await expect(picker).toHaveValue('Beta Castings');
  });

  test('non-Spark: contacts/new has no Company picker and the detail has no company button', async ({ page }) => {
    const writes: Writes = [];
    await setup(page, writes);
    await page.goto('/dashboard/crm/contacts/new');
    await expect(page.getByRole('heading', { name: 'New Contact' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Company', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Account', { exact: true })).toHaveCount(0);
    await page.goto('/dashboard/crm/contacts/c-1');
    await expect(page.getByText('Priya Nair').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Add to a company|Change company/ })).toHaveCount(0);
  });
});

test.describe('Spark: add / change the account of an existing contact', () => {
  test('contact detail: "Add to a company" PATCHes account_id', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes);
    await page.goto('/dashboard/crm/contacts/c-1');
    await page.getByRole('button', { name: 'Add to a company' }).click({ timeout: 30_000 });
    const dialog = page.getByRole('dialog', { name: 'Add to a company' });
    const save = dialog.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    const picker = dialog.getByLabel('Company', { exact: true });
    await picker.click();
    await picker.fill('acme');
    await dialog.getByRole('option', { name: 'Acme Forge' }).dispatchEvent('mousedown');
    await save.click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/crm/contacts/c-1', body: { account_id: 'acc-1' } });
  });

  test('contact detail: a contact that has an account offers "Change company"', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes);
    await page.goto('/dashboard/crm/contacts/c-2');
    await page.getByRole('button', { name: 'Change company' }).click({ timeout: 30_000 });
    const dialog = page.getByRole('dialog', { name: 'Change company' });
    await expect(dialog.getByLabel('Company', { exact: true })).toHaveValue('Acme Forge');
    const picker = dialog.getByLabel('Company', { exact: true });
    await picker.click();
    await picker.fill('beta');
    await dialog.getByRole('option', { name: 'Beta Castings' }).dispatchEvent('mousedown');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/crm/contacts/c-2', body: { account_id: 'acc-2' } });
  });

  test('contacts list: per-row Add to a company / Change company', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes);
    await page.goto('/dashboard/crm/contacts');
    await expect(page.getByRole('button', { name: 'Add to a company for Priya Nair' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Change company for Dev Shah' })).toBeVisible();
    await page.getByRole('button', { name: 'Add to a company for Priya Nair' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add to a company' });
    const picker = dialog.getByLabel('Company', { exact: true });
    await picker.click();
    await dialog.getByRole('option', { name: 'Beta Castings' }).dispatchEvent('mousedown');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].body).toEqual({ account_id: 'acc-2' });
  });

  test('non-Spark contacts list: no company actions', async ({ page }) => {
    await setup(page, []);
    await page.goto('/dashboard/crm/contacts');
    await expect(page.getByText('Priya Nair').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Add to a company|Change company/ })).toHaveCount(0);
  });
});

// Industry on the Spark contact form belongs to the COMPANY: an existing company shows its industry read-only; a
// company without one, or a brand-new company typed in here, gets the industry dropdown and the value is saved onto
// the company (a new company is created with it — or an existing one with the same name is reused).
test.describe('Spark: industry on the contact form (tied to the company)', () => {
  const GAMMA = { id: 'acc-3', org_id: 'e2e-org-1', name: 'Gamma Steel', industry: 'Power & Energy', created_at: '2026-01-07T09:00:00Z', updated_at: '2026-01-07T09:00:00Z' };
  async function setupIndustry(page: Page, writes: Writes, opts: { duplicate?: boolean } = {}) {
    await scopeToSpark(page);
    await seedSession(page, SEED_USER);
    await mockApi(page, {
      // B2B org with City hidden, so the form can be submitted without the location picker.
      settings: { success: true, data: { business_type: 'b2b', config: { field_overrides: { 'contact.city': { hidden: true } } } } },
      onRequest: async (route, url, method) => {
        const p = apiPath(url);
        if (method === 'GET' && p === '/api/v1/crm/accounts') return ok(route, [...ACCOUNTS, GAMMA]);
        if (['POST', 'PATCH'].includes(method) && /^\/api\/v1\/crm\/(accounts|contacts)(\/[^/]+)?$/.test(p)) {
          const body = route.request().postDataJSON() as Record<string, any>;
          writes.push({ method, path: p, body });
          if (opts.duplicate && method === 'POST' && p === '/api/v1/crm/accounts') {
            await route.fulfill({ status: 409, json: { success: false, error: 'An account with this name already exists', code: 'DUPLICATE_ACCOUNT', existing: { id: 'acc-2', name: 'Beta Castings' } } });
            return true;
          }
          return ok(route, { ...body, id: p.split('/')[5] || (p.includes('accounts') ? 'acc-new' : 'c-new') }, method === 'POST' ? 201 : 200);
        }
        return false;
      },
    });
  }
  async function pickCompany(page: Page, q: string, name: string) {
    const picker = page.getByLabel('Company', { exact: true });
    await picker.click();
    await picker.fill(q);
    await page.getByRole('option', { name }).dispatchEvent('mousedown');
    await expect(picker).toHaveValue(name);
  }
  async function pickIndustry(page: Page, name: string) {
    await page.getByTestId('contact-industry').getByRole('combobox').click();
    await page.getByRole('option', { name, exact: true }).dispatchEvent('mousedown');
  }
  async function fillAndCreate(page: Page) {
    await page.getByLabel('First Name').fill('Meera');
    await page.getByLabel('Email').fill('meera@x.example');
    await page.getByRole('button', { name: 'Create' }).click();
  }

  test('no company chosen: no industry field', async ({ page }) => {
    const writes: Writes = [];
    await setupIndustry(page, writes);
    await page.goto('/dashboard/crm/contacts/new');
    await expect(page.getByRole('heading', { name: 'New Contact' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('contact-industry')).toHaveCount(0);
  });

  test('existing company with an industry: shown read-only, nothing written to the company', async ({ page }) => {
    const writes: Writes = [];
    await setupIndustry(page, writes);
    await page.goto('/dashboard/crm/contacts/new');
    await expect(page.getByRole('heading', { name: 'New Contact' })).toBeVisible({ timeout: 30_000 });
    await pickCompany(page, 'gamma', 'Gamma Steel');
    const box = page.getByTestId('contact-industry');
    await expect(box.getByRole('textbox')).toHaveValue('Power & Energy');
    await expect(box.getByRole('textbox')).toBeDisabled();
    await expect(box.getByText('From the company.')).toBeVisible();
    await fillAndCreate(page);
    await expect.poll(() => writes.filter((w) => w.path === '/api/v1/crm/contacts').length).toBe(1);
    expect(writes.find((w) => w.path === '/api/v1/crm/contacts')!.body).toMatchObject({ account_id: 'acc-3' });
    expect(writes.filter((w) => w.path.startsWith('/api/v1/crm/accounts'))).toHaveLength(0);
  });

  test('existing company without an industry: dropdown, and the pick is saved onto the company', async ({ page }) => {
    const writes: Writes = [];
    await setupIndustry(page, writes);
    await page.goto('/dashboard/crm/contacts/new');
    await expect(page.getByRole('heading', { name: 'New Contact' })).toBeVisible({ timeout: 30_000 });
    await pickCompany(page, 'beta', 'Beta Castings');
    await pickIndustry(page, 'Manufacturing');
    await fillAndCreate(page);
    // The contact POST is the LAST write, so poll on it: once it lands, every earlier write is in too.
    await expect.poll(() => writes.filter((w) => w.path === '/api/v1/crm/contacts').length).toBe(1);
    expect(writes.find((w) => w.path === '/api/v1/crm/accounts/acc-2')).toMatchObject({ method: 'PATCH', body: { industry: 'Manufacturing' } });
    expect(writes.find((w) => w.path === '/api/v1/crm/contacts')!.body).toMatchObject({ account_id: 'acc-2' });
  });

  test('new company: created with the picked industry, and the contact is linked to it', async ({ page }) => {
    const writes: Writes = [];
    await setupIndustry(page, writes);
    await page.goto('/dashboard/crm/contacts/new');
    await expect(page.getByRole('heading', { name: 'New Contact' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: '+ Not listed? Add a new company' }).click();
    await page.getByLabel('New company name').fill('Delta Pumps');
    await pickIndustry(page, 'Automotive');
    await fillAndCreate(page);
    await expect.poll(() => writes.filter((w) => w.path === '/api/v1/crm/contacts').length).toBe(1);
    expect(writes[0]).toMatchObject({ method: 'POST', path: '/api/v1/crm/accounts', body: { name: 'Delta Pumps', industry: 'Automotive' } });
    expect(writes.find((w) => w.path === '/api/v1/crm/contacts')!.body).toMatchObject({ account_id: 'acc-new' });
  });

  test('new company whose name already exists: the existing company is reused', async ({ page }) => {
    const writes: Writes = [];
    await setupIndustry(page, writes, { duplicate: true });
    await page.goto('/dashboard/crm/contacts/new');
    await expect(page.getByRole('heading', { name: 'New Contact' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: '+ Not listed? Add a new company' }).click();
    await page.getByLabel('New company name').fill('beta castings');
    await fillAndCreate(page);
    await expect.poll(() => writes.filter((w) => w.path === '/api/v1/crm/contacts').length).toBe(1);
    expect(writes.find((w) => w.path === '/api/v1/crm/contacts')!.body).toMatchObject({ account_id: 'acc-2' });
  });
});
