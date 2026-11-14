import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import {
  accountLocationLines, accountLocationPayload, emptyAccountLocation, seedAccountLocation,
} from '../src/lib/accountLocation';

/**
 * Account location — address, State, PIN code, Country on the New Account page, the Edit Account modal and the
 * Account detail page. Accounts have NO City: State comes from the location master (GET /crm/states), create sends no
 * city and edit never touches it (a city stored earlier is left alone, never nulled). Every field is a built-in gated
 * by `account.<key>` overrides.
 */

const STATES = [{ id: 'st-mh', name: 'Maharashtra' }, { id: 'st-gj', name: 'Gujarat' }];
const CITIES: Record<string, Array<{ id: string; name: string }>> = {
  'st-mh': [{ id: 'c-mum', name: 'Mumbai' }, { id: 'c-pun', name: 'Pune' }],
  'st-gj': [{ id: 'c-ahm', name: 'Ahmedabad' }],
};

const ACCOUNT = {
  id: 'account-1', name: 'Nair Steel Traders', website: 'nairsteel.example.com', phone: '9876500000', industry: 'Steel',
  address_line1: '12 MG Road', address_line2: 'Near the station', city: 'Pune', state: 'Maharashtra',
  postal_code: '411001', country: 'India', created_by: SEED_USER.id, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

type Captured = { posts: Array<Record<string, unknown>>; patches: Array<Record<string, unknown>> };

async function setup(page: Page, opts: { overrides?: Record<string, unknown>; user?: Record<string, unknown>; account?: Record<string, unknown> } = {}): Promise<Captured> {
  const user = opts.user ?? SEED_USER;
  const account = opts.account ?? ACCOUNT;
  const cap: Captured = { posts: [], patches: [] };
  await seedSession(page, user);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: { field_overrides: opts.overrides ?? {} } } },
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
      const ok = (data: unknown) => route.fulfill({ json: { success: true, data } }).then(() => true);
      if (method === 'GET' && path === '/api/v1/crm/states') return ok(STATES);
      const m = path.match(/^\/api\/v1\/crm\/states\/([^/]+)\/cities$/);
      if (method === 'GET' && m) return ok(CITIES[m[1]] ?? []);
      if (method === 'GET' && path === `/api/v1/crm/accounts/${account.id}`) return ok(account);
      if (method === 'POST' && path === '/api/v1/crm/accounts') {
        cap.posts.push(route.request().postDataJSON());
        return ok({ ...account, id: 'new-1' });
      }
      if (method === 'PATCH' && path === `/api/v1/crm/accounts/${account.id}`) {
        cap.patches.push(route.request().postDataJSON());
        return ok(account);
      }
      return false;
    },
  });
  return cap;
}

const openEdit = async (page: Page) => {
  await page.goto('/dashboard/crm/accounts/account-1');
  const edit = page.getByRole('button', { name: 'Edit', exact: true }).first();
  await expect(edit).toBeVisible({ timeout: 30_000 });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'Edit Account' });
  await expect(dialog).toBeVisible();
  return dialog;
};

test.describe('account location — payload builders (pure)', () => {
  test('create omits blanks, defaults Country to India and trims; never carries a city', () => {
    const f = { ...emptyAccountLocation(), address_line1: '  12 MG Road ', state: 'Maharashtra', city: 'Pune' } as ReturnType<typeof emptyAccountLocation>;
    expect(accountLocationPayload(f, 'create')).toEqual({
      address_line1: '12 MG Road', state: 'Maharashtra', country: 'India',
    });
    expect(emptyAccountLocation()).not.toHaveProperty('city');
  });

  test('patch sends null for every blank field so it is cleared, but never touches city', () => {
    const f = { ...emptyAccountLocation(), state: 'Gujarat', country: '' };
    const body = accountLocationPayload(f, 'patch');
    expect(body).toEqual({
      address_line1: null, address_line2: null, state: 'Gujarat', postal_code: null, country: null,
    });
    expect(body).not.toHaveProperty('city');
  });

  test('a hidden field is never sent, on create or patch', () => {
    const f = { ...emptyAccountLocation(), state: 'Gujarat', postal_code: '380001' };
    const hide = (k: string) => k === 'state';
    expect(accountLocationPayload(f, 'create', hide)).not.toHaveProperty('state');
    expect(accountLocationPayload(f, 'patch', hide)).not.toHaveProperty('state');
    expect(accountLocationPayload(f, 'patch', hide)).toHaveProperty('postal_code', '380001');
  });

  test('seed preloads saved values (ignoring a stored city) and tolerates null / missing rows', () => {
    expect(seedAccountLocation(ACCOUNT)).toEqual({
      address_line1: '12 MG Road', address_line2: 'Near the station', state: 'Maharashtra', postal_code: '411001', country: 'India',
    });
    expect(seedAccountLocation(null)).toEqual(emptyAccountLocation());
    expect(seedAccountLocation({ state: null, country: null }).country).toBe('India');
  });

  test('detail lines join street, "State – PIN" and country (no city, even if one is stored); hidden parts drop out', () => {
    expect(accountLocationLines(ACCOUNT)).toEqual({ street: '12 MG Road, Near the station', place: 'Maharashtra – 411001', country: 'India' });
    expect(accountLocationLines(ACCOUNT, (k) => k === 'state' || k === 'country')).toEqual({ street: '12 MG Road, Near the station', place: '411001', country: '' });
    expect(accountLocationLines({})).toEqual({ street: '', place: '', country: '' });
  });
});

test.describe('account location — New Account', () => {
  test('State from the master is sent, there is no City, Country defaults to India, blanks are omitted', async ({ page }) => {
    const cap = await setup(page);
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-field="state"]')).toHaveCount(1);
    await expect(page.locator('[data-field="city"]')).toHaveCount(0);
    await expect(page.getByLabel('City', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Country', { exact: true })).toHaveValue('India');

    await page.locator('form input').first().fill('Acme Traders'); // name
    await page.getByLabel('Address', { exact: true }).fill('5 Park Street');
    await page.getByLabel('State', { exact: true }).selectOption('Maharashtra');
    await page.getByLabel('PIN code', { exact: true }).fill('400001');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect.poll(() => cap.posts.length).toBe(1);
    const body = cap.posts[0];
    expect(body).toMatchObject({ name: 'Acme Traders', address_line1: '5 Park Street', state: 'Maharashtra', postal_code: '400001', country: 'India' });
    expect(body).not.toHaveProperty('address_line2');
    expect(body).not.toHaveProperty('city');
  });

  test('a rep with a single assigned city still gets the State picker and no City control', async ({ page }) => {
    await setup(page, { user: { ...SEED_USER, assigned_city_names: ['Pune'] } });
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('State', { exact: true })).toBeVisible();
    await expect(page.getByLabel('City', { exact: true })).toHaveCount(0);
    await expect(page.getByText('your beat')).toHaveCount(0);
  });

  test('hiding State removes it and never sends it', async ({ page }) => {
    const cap = await setup(page, { overrides: { 'account.state': { hidden: true } } });
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-field="state"]')).toHaveCount(0);
    await expect(page.locator('[data-field="city"]')).toHaveCount(0);
    await page.locator('form input').first().fill('No State Co');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect.poll(() => cap.posts.length).toBe(1);
    expect(cap.posts[0]).not.toHaveProperty('state');
    expect(cap.posts[0]).not.toHaveProperty('city');
  });

  test('a duplicate name (409) shows an inline notice linking to the existing account, form stays open', async ({ page }) => {
    await seedSession(page, SEED_USER);
    await mockApi(page, {
      settings: { success: true, data: { business_type: 'both', config: { field_overrides: {} } } },
      me: { success: true, data: SEED_USER },
      onRequest: async (route, url, method) => {
        const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
        if (method === 'GET' && path === '/api/v1/crm/states') return route.fulfill({ json: { success: true, data: STATES } }).then(() => true);
        if (method === 'POST' && path === '/api/v1/crm/accounts') {
          return route.fulfill({ status: 409, json: { error: 'An account with this name already exists', code: 'DUPLICATE_ACCOUNT', existing: { id: 'acc-existing', name: 'Acme Traders' } } }).then(() => true);
        }
        return false; // name-blur pre-check GET /accounts?q= falls through to the empty default
      },
    });
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    await page.locator('form input').first().fill('Acme Traders');
    await page.getByRole('button', { name: 'Create' }).click();

    const dup = page.getByTestId('account-duplicate');
    await expect(dup).toBeVisible();
    await expect(dup).toContainText('already exists');
    await expect(dup.getByRole('link')).toHaveAttribute('href', '/dashboard/crm/accounts/acc-existing');
    // The form is not navigated away — the rep can rename and retry.
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible();
  });

  test('hiding address, PIN code and country removes those rows; relabel applies', async ({ page }) => {
    await setup(page, { overrides: {
      'account.address_line1': { hidden: true }, 'account.postal_code': { hidden: true }, 'account.country': { hidden: true },
      'account.state': { label: 'Province' },
    } });
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    for (const k of ['address_line1', 'postal_code', 'country']) await expect(page.locator(`[data-field="${k}"]`)).toHaveCount(0);
    await expect(page.locator('[data-field="address_line2"]')).toHaveCount(1);
    await expect(page.locator('[data-field="state"]')).toContainText('Province');
  });
});

test.describe('account location — Edit Account + detail', () => {
  test('detail shows the saved location', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/accounts/account-1');
    const loc = page.getByTestId('account-location');
    await expect(loc).toBeVisible({ timeout: 30_000 });
    await expect(loc).toContainText('12 MG Road, Near the station');
    await expect(loc).toContainText('Maharashtra – 411001');
    await expect(loc).not.toContainText('Pune'); // a city stored earlier is not shown
    await expect(loc).toContainText('India');
  });

  test('detail hides a location part the admin hid', async ({ page }) => {
    await setup(page, { overrides: { 'account.state': { hidden: true } } });
    await page.goto('/dashboard/crm/accounts/account-1');
    const loc = page.getByTestId('account-location');
    await expect(loc).toBeVisible({ timeout: 30_000 });
    await expect(loc).not.toContainText('Maharashtra');
    await expect(loc).toContainText('411001');
  });

  test('the modal preloads State and the rest, has no City; the patch carries them and never city', async ({ page }) => {
    const cap = await setup(page);
    const d = await openEdit(page);
    await expect(d.getByLabel('State', { exact: true })).toHaveValue('Maharashtra');
    await expect(d.getByLabel('City', { exact: true })).toHaveCount(0);
    await expect(d.locator('[data-field="city"]')).toHaveCount(0);
    await expect(d.getByLabel('Address', { exact: true })).toHaveValue('12 MG Road');
    await expect(d.getByLabel('Address line 2', { exact: true })).toHaveValue('Near the station');
    await expect(d.getByLabel('PIN code', { exact: true })).toHaveValue('411001');
    await expect(d.getByLabel('Country', { exact: true })).toHaveValue('India');

    await d.getByLabel('State', { exact: true }).selectOption('Gujarat');
    await d.getByLabel('Address line 2', { exact: true }).fill('');
    await d.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => cap.patches.length).toBe(1);
    expect(cap.patches[0]).toMatchObject({ state: 'Gujarat', address_line1: '12 MG Road', address_line2: null, postal_code: '411001', country: 'India' });
    expect(cap.patches[0]).not.toHaveProperty('city'); // the stored city is left alone, not nulled
  });

  test('a saved state that is not in the master is kept on edit; city is still not sent', async ({ page }) => {
    const cap = await setup(page, { account: { ...ACCOUNT, city: 'Chhota Udaipur', state: 'Goa' } });
    const d = await openEdit(page);
    await expect(d.getByLabel('State', { exact: true })).toHaveValue('Goa');
    await d.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => cap.patches.length).toBe(1);
    expect(cap.patches[0]).toMatchObject({ state: 'Goa' });
    expect(cap.patches[0]).not.toHaveProperty('city');
  });

  test('hiding State removes it from the modal and from the patch', async ({ page }) => {
    const cap = await setup(page, { overrides: { 'account.state': { hidden: true } } });
    const d = await openEdit(page);
    await expect(d.locator('[data-field="state"]')).toHaveCount(0);
    await expect(d.locator('[data-field="city"]')).toHaveCount(0);
    await d.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => cap.patches.length).toBe(1);
    expect(cap.patches[0]).not.toHaveProperty('state');
    expect(cap.patches[0]).not.toHaveProperty('city');
  });
});
