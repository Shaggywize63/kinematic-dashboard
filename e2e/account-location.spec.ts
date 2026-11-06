import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import {
  accountLocationLines, accountLocationPayload, emptyAccountLocation, seedAccountLocation,
} from '../src/lib/accountLocation';

/**
 * Account location — address, State, City, PIN code, Country on the New Account page, the Edit Account modal and the
 * Account detail page. State -> City come from the location master (GET /crm/states, /crm/states/:id/cities); a city
 * that is not in the master can be typed; every field is a built-in gated by `account.<key>` overrides.
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
  test('create omits blanks, defaults Country to India and trims', () => {
    const f = { ...emptyAccountLocation(), address_line1: '  12 MG Road ', state: 'Maharashtra', city: 'Pune' };
    expect(accountLocationPayload(f, 'create')).toEqual({
      address_line1: '12 MG Road', state: 'Maharashtra', city: 'Pune', country: 'India',
    });
  });

  test('patch sends null for every blank field so it is cleared', () => {
    const f = { ...emptyAccountLocation(), state: 'Gujarat', country: '' };
    expect(accountLocationPayload(f, 'patch')).toEqual({
      address_line1: null, address_line2: null, city: null, state: 'Gujarat', postal_code: null, country: null,
    });
  });

  test('a hidden field is never sent, on create or patch', () => {
    const f = { ...emptyAccountLocation(), state: 'Gujarat', city: 'Ahmedabad' };
    const hide = (k: string) => k === 'state';
    expect(accountLocationPayload(f, 'create', hide)).not.toHaveProperty('state');
    expect(accountLocationPayload(f, 'patch', hide)).not.toHaveProperty('state');
    expect(accountLocationPayload(f, 'patch', hide)).toHaveProperty('city', 'Ahmedabad');
  });

  test('seed preloads saved values and tolerates null / missing rows', () => {
    expect(seedAccountLocation(ACCOUNT)).toEqual({
      address_line1: '12 MG Road', address_line2: 'Near the station', city: 'Pune', state: 'Maharashtra', postal_code: '411001', country: 'India',
    });
    expect(seedAccountLocation(null)).toEqual(emptyAccountLocation());
    expect(seedAccountLocation({ state: null, country: null }).country).toBe('India');
  });

  test('detail lines join street, "City, State – PIN" and country; hidden parts drop out', () => {
    expect(accountLocationLines(ACCOUNT)).toEqual({ street: '12 MG Road, Near the station', place: 'Pune, Maharashtra – 411001', country: 'India' });
    expect(accountLocationLines(ACCOUNT, (k) => k === 'state' || k === 'country')).toEqual({ street: '12 MG Road, Near the station', place: 'Pune – 411001', country: '' });
    expect(accountLocationLines({})).toEqual({ street: '', place: '', country: '' });
  });
});

test.describe('account location — New Account', () => {
  test('State then City from the master are sent, Country defaults to India, blanks are omitted', async ({ page }) => {
    const cap = await setup(page);
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-field="state"]')).toHaveCount(1);
    await expect(page.locator('[data-field="city"]')).toHaveCount(1);
    await expect(page.getByLabel('Country', { exact: true })).toHaveValue('India');

    await page.locator('form input').first().fill('Acme Traders'); // name
    await page.getByLabel('Address', { exact: true }).fill('5 Park Street');
    await page.getByLabel('State', { exact: true }).selectOption('Maharashtra');
    // City is filtered by the chosen state.
    await expect(page.getByLabel('City', { exact: true }).locator('option', { hasText: 'Mumbai' })).toHaveCount(1);
    await expect(page.getByLabel('City', { exact: true }).locator('option', { hasText: 'Ahmedabad' })).toHaveCount(0);
    await page.getByLabel('City', { exact: true }).selectOption('Mumbai');
    await page.getByLabel('PIN code', { exact: true }).fill('400001');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect.poll(() => cap.posts.length).toBe(1);
    const body = cap.posts[0];
    expect(body).toMatchObject({ name: 'Acme Traders', address_line1: '5 Park Street', state: 'Maharashtra', city: 'Mumbai', postal_code: '400001', country: 'India' });
    expect(body).not.toHaveProperty('address_line2');
  });

  test('a city that is not in the master can be typed', async ({ page }) => {
    const cap = await setup(page);
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    await page.locator('form input').first().fill('Small Town Co');
    await page.getByLabel('State', { exact: true }).selectOption('Gujarat');
    await page.getByLabel('City', { exact: true }).selectOption({ label: 'Other (type city)…' });
    await page.getByLabel('City', { exact: true }).fill('Chhota Udaipur');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect.poll(() => cap.posts.length).toBe(1);
    expect(cap.posts[0]).toMatchObject({ state: 'Gujarat', city: 'Chhota Udaipur' });
  });

  test('a rep with a single assigned city still gets the State -> City picker', async ({ page }) => {
    await setup(page, { user: { ...SEED_USER, assigned_city_names: ['Pune'] } });
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('State', { exact: true })).toBeVisible();
    await expect(page.getByLabel('City', { exact: true })).toHaveValue(''); // not pre-filled / locked to the beat
    await expect(page.getByText('your beat')).toHaveCount(0);
  });

  test('hiding State removes it and never sends it (City stays)', async ({ page }) => {
    const cap = await setup(page, { overrides: { 'account.state': { hidden: true } } });
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-field="state"]')).toHaveCount(0);
    await expect(page.locator('[data-field="city"]')).toHaveCount(1);
    await page.locator('form input').first().fill('No State Co');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect.poll(() => cap.posts.length).toBe(1);
    expect(cap.posts[0]).not.toHaveProperty('state');
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
    await expect(loc).toContainText('Pune, Maharashtra – 411001');
    await expect(loc).toContainText('India');
  });

  test('detail hides a location part the admin hid', async ({ page }) => {
    await setup(page, { overrides: { 'account.state': { hidden: true } } });
    await page.goto('/dashboard/crm/accounts/account-1');
    const loc = page.getByTestId('account-location');
    await expect(loc).toBeVisible({ timeout: 30_000 });
    await expect(loc).not.toContainText('Maharashtra');
    await expect(loc).toContainText('Pune – 411001');
  });

  test('the modal preloads State, City and the rest; changing State clears City; the patch carries them', async ({ page }) => {
    const cap = await setup(page);
    const d = await openEdit(page);
    await expect(d.getByLabel('State', { exact: true })).toHaveValue('Maharashtra');
    await expect(d.getByLabel('City', { exact: true })).toHaveValue('Pune');
    await expect(d.getByLabel('Address', { exact: true })).toHaveValue('12 MG Road');
    await expect(d.getByLabel('Address line 2', { exact: true })).toHaveValue('Near the station');
    await expect(d.getByLabel('PIN code', { exact: true })).toHaveValue('411001');
    await expect(d.getByLabel('Country', { exact: true })).toHaveValue('India');

    await d.getByLabel('State', { exact: true }).selectOption('Gujarat');
    await expect(d.getByLabel('City', { exact: true })).toHaveValue('');
    await d.getByLabel('City', { exact: true }).selectOption('Ahmedabad');
    await d.getByLabel('Address line 2', { exact: true }).fill('');
    await d.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => cap.patches.length).toBe(1);
    expect(cap.patches[0]).toMatchObject({ state: 'Gujarat', city: 'Ahmedabad', address_line1: '12 MG Road', address_line2: null, postal_code: '411001', country: 'India' });
  });

  test('a saved city that is not in the master is kept on edit', async ({ page }) => {
    const cap = await setup(page, { account: { ...ACCOUNT, city: 'Chhota Udaipur', state: 'Gujarat' } });
    const d = await openEdit(page);
    await expect(d.getByLabel('State', { exact: true })).toHaveValue('Gujarat');
    await expect(d.getByLabel('City', { exact: true })).toHaveValue('Chhota Udaipur');
    await d.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => cap.patches.length).toBe(1);
    expect(cap.patches[0]).toMatchObject({ state: 'Gujarat', city: 'Chhota Udaipur' });
  });

  test('hiding State removes it from the modal and from the patch (City stays)', async ({ page }) => {
    const cap = await setup(page, { overrides: { 'account.state': { hidden: true } } });
    const d = await openEdit(page);
    await expect(d.locator('[data-field="state"]')).toHaveCount(0);
    await expect(d.locator('[data-field="city"]')).toHaveCount(1);
    await d.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => cap.patches.length).toBe(1);
    expect(cap.patches[0]).not.toHaveProperty('state');
    expect(cap.patches[0]).toHaveProperty('city', 'Pune');
  });
});
