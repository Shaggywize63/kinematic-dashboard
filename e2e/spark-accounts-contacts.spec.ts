import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, fail, ok, scopeToSpark } from './spark';

/**
 * Spark & Ray accounts + contacts:
 *  - a REQUIRED Outcome on account create / edit (inline error, no request until it is filled), shown on the detail;
 *  - "Add contact" on the account detail opens contacts/new with the account pre-linked and locked;
 *  - contacts/new has an optional Account picker; an existing contact can be added to / moved between accounts
 *    (contact detail + the contacts list) via PATCH /crm/contacts/:id { account_id }.
 * A non-Spark tenant sees none of it and its payloads are unchanged.
 */

const ACCOUNT = { id: 'acc-1', org_id: 'e2e-org-1', name: 'Acme Forge', outcome: 'Quote accepted, PO expected', created_at: '2026-01-05T09:00:00Z', updated_at: '2026-01-05T09:00:00Z' };
const ACCOUNTS = [ACCOUNT, { id: 'acc-2', org_id: 'e2e-org-1', name: 'Beta Castings', created_at: '2026-01-06T09:00:00Z', updated_at: '2026-01-06T09:00:00Z' }];
const CONTACT = { id: 'c-1', org_id: 'e2e-org-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair', email: 'priya@x.example', is_b2c: false, created_at: '2026-01-05T09:00:00Z', updated_at: '2026-01-05T09:00:00Z' };
const LINKED = { ...CONTACT, id: 'c-2', first_name: 'Dev', last_name: 'Shah', full_name: 'Dev Shah', account_id: 'acc-1', account_name: 'Acme Forge' };

type Writes = { method: string; path: string; body: Record<string, any> }[];

async function setup(page: Page, writes: Writes, opts: { contacts?: unknown[]; createFails?: string } = {}) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1') return ok(route, ACCOUNT);
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

test.describe('Spark account Outcome', () => {
  test('create: blocks save with an inline error, then sends the trimmed outcome', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes);
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Name', { exact: true }).fill('Gamma Dies');

    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Outcome is required' })).toBeVisible();
    expect(writes).toHaveLength(0);

    // Whitespace alone is still empty.
    await page.getByLabel('Outcome').fill('   ');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Outcome is required' })).toBeVisible();
    expect(writes).toHaveLength(0);

    await page.getByLabel('Outcome').fill('  Site visit done; trial agreed  ');
    await expect(page.getByRole('alert').filter({ hasText: 'Outcome is required' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ method: 'POST', path: '/api/v1/crm/accounts', body: { name: 'Gamma Dies', outcome: 'Site visit done; trial agreed' } });
  });

  test('create: a server 400 about the outcome shows inline', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes, { createFails: 'Outcome is required' });
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Name', { exact: true }).fill('Gamma Dies');
    await page.getByLabel('Outcome').fill('Something');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Outcome is required' })).toBeVisible();
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

  test('detail shows the outcome; the edit modal cannot save it blank and PATCHes the new text', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes);
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByTestId('account-outcome')).toContainText('Quote accepted, PO expected', { timeout: 30_000 });

    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Edit Account' });
    const outcome = dialog.getByLabel('Outcome');
    await expect(outcome).toHaveValue('Quote accepted, PO expected');
    await outcome.fill('');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Outcome is required');
    expect(writes).toHaveLength(0);

    await outcome.fill('PO received');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/crm/accounts/acc-1', body: { outcome: 'PO received' } });
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
    const account = page.getByLabel('Account', { exact: true });
    await expect(account).toHaveValue('Acme Forge');
    await expect(account).toBeDisabled();
    await expect(page.getByText('This contact will be added to this account.')).toBeVisible();

    await page.getByLabel('First Name').fill('Meera');
    await page.getByLabel('Email').fill('meera@acme.example');
    await page.getByRole('button', { name: 'Create' }).click();
    // City is required on every contact.
    await expect(page.getByText(/City is required/)).toBeVisible();
    expect(writes).toHaveLength(0);
  });

  test('contacts/new without a link has an optional Account picker and sends account_id', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes);
    await page.goto('/dashboard/crm/contacts/new');
    await expect(page.getByRole('heading', { name: 'New Contact' })).toBeVisible({ timeout: 30_000 });
    const picker = page.getByLabel('Account', { exact: true });
    await expect(picker).toBeEnabled();
    await picker.click();
    await picker.fill('beta');
    await page.getByRole('option', { name: 'Beta Castings' }).dispatchEvent('mousedown');
    await expect(picker).toHaveValue('Beta Castings');
  });

  test('non-Spark: contacts/new has no Account picker and the detail has no account button', async ({ page }) => {
    const writes: Writes = [];
    await setup(page, writes);
    await page.goto('/dashboard/crm/contacts/new');
    await expect(page.getByRole('heading', { name: 'New Contact' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Account', { exact: true })).toHaveCount(0);
    await page.goto('/dashboard/crm/contacts/c-1');
    await expect(page.getByText('Priya Nair').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Add to an account|Change account/ })).toHaveCount(0);
  });
});

test.describe('Spark: add / change the account of an existing contact', () => {
  test('contact detail: "Add to an account" PATCHes account_id', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes);
    await page.goto('/dashboard/crm/contacts/c-1');
    await page.getByRole('button', { name: 'Add to an account' }).click({ timeout: 30_000 });
    const dialog = page.getByRole('dialog', { name: 'Add to an account' });
    const save = dialog.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    const picker = dialog.getByLabel('Account', { exact: true });
    await picker.click();
    await picker.fill('acme');
    await dialog.getByRole('option', { name: 'Acme Forge' }).dispatchEvent('mousedown');
    await save.click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/crm/contacts/c-1', body: { account_id: 'acc-1' } });
  });

  test('contact detail: a contact that has an account offers "Change account"', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes);
    await page.goto('/dashboard/crm/contacts/c-2');
    await page.getByRole('button', { name: 'Change account' }).click({ timeout: 30_000 });
    const dialog = page.getByRole('dialog', { name: 'Change account' });
    await expect(dialog.getByLabel('Account', { exact: true })).toHaveValue('Acme Forge');
    const picker = dialog.getByLabel('Account', { exact: true });
    await picker.click();
    await picker.fill('beta');
    await dialog.getByRole('option', { name: 'Beta Castings' }).dispatchEvent('mousedown');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/crm/contacts/c-2', body: { account_id: 'acc-2' } });
  });

  test('contacts list: per-row Add to an account / Change account', async ({ page }) => {
    const writes: Writes = [];
    await scopeToSpark(page);
    await setup(page, writes);
    await page.goto('/dashboard/crm/contacts');
    await expect(page.getByRole('button', { name: 'Add to an account for Priya Nair' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Change account for Dev Shah' })).toBeVisible();
    await page.getByRole('button', { name: 'Add to an account for Priya Nair' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add to an account' });
    const picker = dialog.getByLabel('Account', { exact: true });
    await picker.click();
    await dialog.getByRole('option', { name: 'Beta Castings' }).dispatchEvent('mousedown');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].body).toEqual({ account_id: 'acc-2' });
  });

  test('non-Spark contacts list: no account actions', async ({ page }) => {
    await setup(page, []);
    await page.goto('/dashboard/crm/contacts');
    await expect(page.getByText('Priya Nair').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Add to an account|Change account/ })).toHaveCount(0);
  });
});
