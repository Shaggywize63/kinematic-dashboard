import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark, SPARK_CLIENT_ID, USERS } from './spark';

/**
 * Spark & Ray round 3 (web):
 *  1. no Outcome on account create / edit (the stored one is read-only on the detail);
 *  2. an Outcome text area on the activity create + edit forms, required once the activity is completed;
 *  3. "Company: <name>" on activity rows, a link to the account when the row carries a company_id;
 *  4. Account + User filters on the Activities page (list, summary and export), shown to the client-admin role;
 *  5. an Addresses card (sites API) on the account detail;
 *  6. Company label + links on contacts, and "+ Add contact" on the account detail.
 * Every other tenant is unchanged.
 */

const iso = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const ACCOUNT = { id: 'acc-1', org_id: 'e2e-org-1', name: 'Acme Forge', outcome: null, created_at: '2026-01-05T09:00:00Z', updated_at: '2026-01-05T09:00:00Z' };
const ACCOUNTS = [ACCOUNT, { id: 'acc-2', org_id: 'e2e-org-1', name: 'Beta Castings', created_at: '2026-01-06T09:00:00Z', updated_at: '2026-01-06T09:00:00Z' }];
const base = { org_id: 'e2e-org-1', type: 'call', created_at: iso(-50), updated_at: iso(-49) };
const ACT_LINKED = { ...base, id: 'a1', subject: 'Call about quote', status: 'completed', completed_at: iso(-48), outcome: 'PO expected Friday', company_id: 'acc-1', company_name: 'Acme Forge' };
const ACT_TEXT_ONLY = { ...base, id: 'a2', subject: 'Intro visit', status: 'open', due_at: iso(24), company_id: null, company_name: 'Walk-in Traders' };
const ACT_PLAIN = { ...base, id: 'a3', subject: 'Follow up', status: 'open', due_at: iso(48) };
const SUMMARY = { total: 3, overdue: 0, upcoming: 2, completed: 1, undated: 0, by_status: { open: 2, in_progress: 0, cancelled: 0, completed: 1, unset: 0 } };
const pag = (total: number, page = 1, totalPages = 1) => ({ total, page, limit: 50, totalPages, hasNext: page < totalPages, hasPrev: page > 1 });

type Req = { method: string; path: string; query: URLSearchParams; body?: Record<string, any> };

interface Opts {
  user?: Record<string, unknown>;
  settings?: unknown;
  activities?: unknown[];
  totalPages?: number;
  sites?: Record<string, any>[];
  contacts?: unknown[];
  account?: Record<string, unknown>;
}

/** Mock the API; every request is recorded so tests can assert query strings and bodies. */
async function setup(page: Page, reqs: Req[], opts: Opts = {}) {
  const user = opts.user ?? SEED_USER;
  await seedSession(page, user);
  const sites = [...(opts.sites ?? [])];
  await mockApi(page, {
    me: { success: true, data: user },
    settings: opts.settings,
    onRequest: async (route: Route, url: string, method: string) => {
      const p = apiPath(url);
      const query = new URL(url).searchParams;
      let body: Record<string, any> | undefined;
      try { body = route.request().postDataJSON() ?? undefined; } catch { body = undefined; }
      if (p.startsWith('/api/v1/crm/') || p === '/api/v1/users') reqs.push({ method, path: p, query, body });

      if (method === 'GET' && p === '/api/v1/users') return ok(route, USERS);
      if (method === 'GET' && p === '/api/v1/crm/accounts') {
        const q = (query.get('q') || '').toLowerCase();
        return ok(route, ACCOUNTS.filter((a) => !q || a.name.toLowerCase().includes(q)));
      }
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1') return ok(route, opts.account ?? ACCOUNT);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1/sites') return ok(route, sites);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1/contacts') return ok(route, []);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1/timeline') return ok(route, null);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1/activities') return ok(route, opts.activities ?? []);
      if (method === 'GET' && p === '/api/v1/crm/contacts') return ok(route, opts.contacts ?? []);
      if (method === 'GET' && p === '/api/v1/crm/activities/summary') return ok(route, SUMMARY);
      if (method === 'GET' && p === '/api/v1/crm/activities') {
        const list = opts.activities ?? [ACT_LINKED, ACT_TEXT_ONLY, ACT_PLAIN];
        const pg = Number(query.get('page') || 1);
        return route.fulfill({ json: { success: true, data: list, pagination: pag(list.length, pg, opts.totalPages ?? 1) } }).then(() => true);
      }
      if (method === 'GET' && p === '/api/v1/crm/activities/export') return route.fulfill({ status: 200, contentType: 'text/csv', body: 'a,b\n' }).then(() => true);
      if (method === 'GET' && p === '/api/v1/crm/places/autocomplete') return ok(route, [{ place_id: 'pl-1', description: 'Plot 5, MIDC Chakan, Pune' }]);
      if (method === 'GET' && p === '/api/v1/crm/places/details') return ok(route, { address_line1: 'Plot 5, MIDC Chakan', city: 'Pune', state: 'Maharashtra', postal_code: '410501', latitude: 18.7601, longitude: 73.8626 });
      if (method === 'POST' && p === '/api/v1/crm/sites') {
        const row = { id: 'site-new', ...body };
        sites.push(row);
        return ok(route, row, 201);
      }
      if (method === 'PATCH' && /^\/api\/v1\/crm\/sites\/[^/]+$/.test(p)) {
        const id = p.split('/').pop()!;
        const i = sites.findIndex((s) => s.id === id);
        if (i >= 0) sites[i] = { ...sites[i], ...body };
        return ok(route, sites[i] ?? { id, ...body });
      }
      if (method === 'DELETE' && /^\/api\/v1\/crm\/sites\/[^/]+$/.test(p)) {
        const id = p.split('/').pop()!;
        const i = sites.findIndex((s) => s.id === id);
        if (i >= 0) sites.splice(i, 1);
        return route.fulfill({ status: 204 }).then(() => true);
      }
      if (['POST', 'PATCH'].includes(method) && /^\/api\/v1\/crm\/(activities|accounts|contacts)(\/[^/]+)?$/.test(p)) {
        return ok(route, { id: p.split('/')[5] || 'new-1', ...body }, method === 'POST' ? 201 : 200);
      }
      return false;
    },
  });
}

const writes = (reqs: Req[], method: string, re: RegExp) => reqs.filter((r) => r.method === method && re.test(r.path));
const listCalls = (reqs: Req[]) => reqs.filter((r) => r.method === 'GET' && r.path === '/api/v1/crm/activities');
const summaryCalls = (reqs: Req[]) => reqs.filter((r) => r.method === 'GET' && r.path === '/api/v1/crm/activities/summary');

// The Spark client-admin role: pinned to Spark by its login, and kept out of the owner-assignment controls by the
// client's "admin only" setting + an own-data scope -- the combination that used to hide the user filter.
const CLIENT_ADMIN = { ...SEED_USER, id: 'u-client', role: 'client', client_id: SPARK_CLIENT_ID, org_role_data_scope: 'own' };
const ADMIN_ONLY_SETTINGS = { success: true, data: { business_type: 'both', config: { lead_form: { owner_assignment: 'admin_only' } } } };

test.describe('1. accounts carry no Outcome', () => {
  test('create + edit forms have no Outcome; a stored one is read-only "Outcome (earlier)"', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs, { account: { ...ACCOUNT, outcome: 'Quote accepted' } });
    await page.goto('/dashboard/crm/accounts/new');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Outcome')).toHaveCount(0);

    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByTestId('account-outcome')).toContainText('Outcome (earlier)', { timeout: 30_000 });
    await expect(page.getByTestId('account-outcome')).toContainText('Quote accepted');
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: 'Edit Account' }).getByLabel('Outcome')).toHaveCount(0);
  });
});

test.describe('2. activity Outcome', () => {
  const logBtn = (page: Page) => page.getByRole('button', { name: 'Log Activity' });

  test('create: required when logged as completed, optional when scheduled; trimmed; omitted when blank', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs);
    await page.goto('/dashboard/crm/activities/new');
    await expect(page.getByRole('heading', { name: 'Log Activity' })).toBeVisible({ timeout: 30_000 });
    const outcome = page.getByLabel('Outcome');
    await expect(outcome).toBeVisible();

    // No schedule => logged as completed => Outcome is required.
    await logBtn(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Outcome is required' })).toBeVisible();
    expect(writes(reqs, 'POST', /\/crm\/activities$/)).toHaveLength(0);
    await outcome.fill('   ');
    await logBtn(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Outcome is required' })).toBeVisible();
    expect(writes(reqs, 'POST', /\/crm\/activities$/)).toHaveLength(0);

    await outcome.fill('  Customer agreed to a trial  ');
    await logBtn(page).click();
    await expect.poll(() => writes(reqs, 'POST', /\/crm\/activities$/).length).toBe(1);
    expect(writes(reqs, 'POST', /\/crm\/activities$/)[0].body).toMatchObject({ status: 'completed', outcome: 'Customer agreed to a trial' });
  });

  test('create: a scheduled activity needs no Outcome and sends none when blank', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs);
    await page.goto('/dashboard/crm/activities/new');
    await expect(page.getByRole('heading', { name: 'Log Activity' })).toBeVisible({ timeout: 30_000 });
    await page.locator('input[type="datetime-local"]').fill('2030-01-15T10:30');
    await logBtn(page).click();
    await expect.poll(() => writes(reqs, 'POST', /\/crm\/activities$/).length).toBe(1);
    const body = writes(reqs, 'POST', /\/crm\/activities$/)[0].body!;
    expect(body.status).toBe('planned');
    expect(Object.keys(body)).not.toContain('outcome');
  });

  test('non-Spark: no Outcome field on the create form', async ({ page }) => {
    const reqs: Req[] = [];
    await setup(page, reqs);
    await page.goto('/dashboard/crm/activities/new');
    await expect(page.getByRole('heading', { name: 'Log Activity' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Outcome')).toHaveCount(0);
    await logBtn(page).click();
    await expect.poll(() => writes(reqs, 'POST', /\/crm\/activities$/).length).toBe(1);
    expect(Object.keys(writes(reqs, 'POST', /\/crm\/activities$/)[0].body!)).not.toContain('outcome');
  });

  test('edit: a completed activity cannot lose its Outcome; a scheduled one can clear it (null)', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs);
    await page.goto('/dashboard/crm/activities');
    const row = page.locator('div').filter({ hasText: /^.*Call about quote/ }).filter({ has: page.getByRole('button', { name: '✎ Edit' }) }).last();
    await expect(page.getByText('Call about quote')).toBeVisible({ timeout: 30_000 });
    await row.getByRole('button', { name: '✎ Edit' }).click();
    const outcome = page.getByLabel('Outcome');
    await expect(outcome).toHaveValue('PO expected Friday');
    await outcome.fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Outcome is required' })).toBeVisible();
    expect(writes(reqs, 'PATCH', /\/crm\/activities\//)).toHaveLength(0);
    await outcome.fill('  PO received  ');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => writes(reqs, 'PATCH', /\/crm\/activities\/a1$/).length).toBe(1);
    expect(writes(reqs, 'PATCH', /\/crm\/activities\/a1$/)[0].body).toMatchObject({ outcome: 'PO received' });
  });

  test('edit: a scheduled activity may leave Outcome blank and sends null', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs, { activities: [ACT_TEXT_ONLY] });
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByText('Intro visit')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: '✎ Edit' }).click();
    await expect(page.getByLabel('Outcome')).toHaveValue('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => writes(reqs, 'PATCH', /\/crm\/activities\/a2$/).length).toBe(1);
    expect(writes(reqs, 'PATCH', /\/crm\/activities\/a2$/)[0].body!.outcome).toBeNull();
  });

  test('Mark Complete asks for the Outcome first and PATCHes status + outcome together', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs, { activities: [ACT_TEXT_ONLY] });
    await page.goto('/dashboard/crm/activities');
    await page.getByRole('button', { name: '✓ Mark Complete' }).click({ timeout: 30_000 });
    const dialog = page.getByRole('dialog', { name: 'Complete activity' });
    await dialog.getByRole('button', { name: 'Mark complete' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Outcome is required');
    expect(writes(reqs, 'PATCH', /\/crm\/activities\//)).toHaveLength(0);
    await dialog.getByLabel('Outcome').fill('Visited, trial scheduled');
    await dialog.getByRole('button', { name: 'Mark complete' }).click();
    await expect.poll(() => writes(reqs, 'PATCH', /\/crm\/activities\/a2$/).length).toBe(1);
    expect(writes(reqs, 'PATCH', /\/crm\/activities\/a2$/)[0].body).toMatchObject({ status: 'completed', outcome: 'Visited, trial scheduled' });
  });

  test('the Outcome shows on the activity row', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs);
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByTestId('activity-outcome')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId('activity-outcome')).toContainText('PO expected Friday');
  });
});

test.describe('3. company on activity rows', () => {
  test('activities page: linked company is a link to the account, name-only is plain text, none shows nothing', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs);
    await page.goto('/dashboard/crm/activities');
    const companies = page.getByTestId('activity-company');
    await expect(companies).toHaveCount(2, { timeout: 30_000 });
    const link = companies.filter({ hasText: 'Acme Forge' }).getByRole('link', { name: 'Acme Forge' });
    await expect(link).toHaveAttribute('href', '/dashboard/crm/accounts/acc-1');
    const plain = companies.filter({ hasText: 'Walk-in Traders' });
    await expect(plain).toContainText('Company: Walk-in Traders');
    await expect(plain.getByRole('link')).toHaveCount(0);
  });

  test('account page timeline rows show the company link too', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs, { activities: [ACT_LINKED] });
    await page.goto('/dashboard/crm/accounts/acc-1');
    const company = page.getByTestId('activity-company');
    await expect(company).toHaveCount(1, { timeout: 30_000 });
    await expect(company.getByRole('link', { name: 'Acme Forge' })).toHaveAttribute('href', '/dashboard/crm/accounts/acc-1');
  });

  test('non-Spark: no company line even if a row carries one', async ({ page }) => {
    const reqs: Req[] = [];
    await setup(page, reqs);
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByText('Call about quote')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('activity-company')).toHaveCount(0);
    await expect(page.getByTestId('activity-outcome')).toHaveCount(0);
  });
});

test.describe('4. Account + User filters on Activities', () => {
  test('client-admin role sees both filters; picking them refetches list + summary with account_id / owner_id and resets to page 1', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs, { user: CLIENT_ADMIN, settings: ADMIN_ONLY_SETTINGS, totalPages: 3 });
    await page.goto('/dashboard/crm/activities');
    const filters = page.getByTestId('activity-filters');
    await expect(filters).toBeVisible({ timeout: 30_000 });
    const userFilter = filters.getByLabel('Filter by user');
    await expect(userFilter).toBeVisible();
    await expect(filters.getByRole('button', { name: /Search by account/ })).toBeVisible();

    // Go to page 2, then change a filter: the list must come back on page 1.
    await page.getByTitle('Next page').click();
    await expect.poll(() => listCalls(reqs).some((r) => r.query.get('page') === '2')).toBe(true);

    // Account (searchable).
    await filters.getByRole('button', { name: /Search by account/ }).click();
    await filters.getByPlaceholder('Type an account name…').fill('beta');
    await filters.getByRole('button', { name: 'Beta Castings' }).click();
    await expect.poll(() => listCalls(reqs).some((r) => r.query.get('account_id') === 'acc-2')).toBe(true);
    await expect.poll(() => summaryCalls(reqs).some((r) => r.query.get('account_id') === 'acc-2')).toBe(true);
    const afterAccount = listCalls(reqs).filter((r) => r.query.get('account_id') === 'acc-2');
    expect(afterAccount[afterAccount.length - 1].query.get('page')).toBe('1');

    // User (from the assignable-users list).
    await userFilter.click();
    await page.getByText('Ravi Kumar', { exact: true }).click();
    await expect.poll(() => listCalls(reqs).some((r) => r.query.get('owner_id') === 'u-ravi' && r.query.get('account_id') === 'acc-2')).toBe(true);
    await expect.poll(() => summaryCalls(reqs).some((r) => r.query.get('owner_id') === 'u-ravi' && r.query.get('account_id') === 'acc-2')).toBe(true);
    expect(reqs.some((r) => r.path === '/api/v1/users' && r.query.get('scope') === 'assignable')).toBe(true);

    // Export carries both.
    await page.getByRole('button', { name: /Export CSV/ }).click();
    await expect.poll(() => reqs.some((r) => r.path === '/api/v1/crm/activities/export' && r.query.get('owner_id') === 'u-ravi' && r.query.get('account_id') === 'acc-2')).toBe(true);

    // Clear: both controls reset (the unfiltered list itself is served from the API client's GET cache, so no new request is asserted).
    await filters.getByRole('button', { name: 'Clear filters' }).click();
    await expect(filters.getByRole('button', { name: /Search by account/ })).toBeVisible();
    await expect(userFilter).toHaveValue('');
    await expect(filters.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
  });

  test('a plain Spark user (not an admin) also gets the filters', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs, { user: { ...SEED_USER, id: 'u-fe', role: 'field_executive', client_id: SPARK_CLIENT_ID } });
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByTestId('activity-filters').getByLabel('Filter by user')).toBeVisible({ timeout: 30_000 });
  });

  test('non-Spark admin: no account filter and the old assignee filter is unchanged', async ({ page }) => {
    const reqs: Req[] = [];
    await setup(page, reqs);
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByText('Call about quote')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Search by account/ })).toHaveCount(0);
    await expect(page.getByPlaceholder('Filter by FE / assignee…')).toBeVisible();
  });
});

test.describe('5. account Addresses card', () => {
  const SITE = { id: 'site-1', account_id: 'acc-1', name: 'Head office', address_line1: '12 Ring Road', city: 'Pune', state: 'Maharashtra', postal_code: '411001', latitude: 18.52, longitude: 73.85 };

  test('lists addresses with a map pin; add (via address search), edit and delete use the sites API', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs, { sites: [SITE] });
    await page.goto('/dashboard/crm/accounts/acc-1');
    const card = page.getByTestId('account-addresses');
    await expect(card).toContainText('Head office', { timeout: 30_000 });
    await expect(card).toContainText('12 Ring Road');
    await expect(card).toContainText('Pune, Maharashtra – 411001');
    await expect(card.getByRole('link', { name: 'Open Head office on the map' })).toBeVisible();

    // Add: label + address search (backend places proxy) -> fields + pin filled -> save.
    await card.getByRole('button', { name: '+ Add address' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add address' });
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Label is required');
    expect(writes(reqs, 'POST', /\/crm\/sites$/)).toHaveLength(0);
    await dialog.getByLabel('Label', { exact: true }).fill('Plant 2');
    await dialog.getByPlaceholder(/Start typing an address/).fill('Plot 5 Chakan');
    await dialog.getByText('Plot 5, MIDC Chakan, Pune').click();
    await expect(dialog.getByLabel('Address line 1')).toHaveValue('Plot 5, MIDC Chakan');
    await expect(dialog.getByLabel('City')).toHaveValue('Pune');
    await expect(dialog.getByLabel('State')).toHaveValue('Maharashtra');
    await expect(dialog.getByLabel('PIN code')).toHaveValue('410501');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => writes(reqs, 'POST', /\/crm\/sites$/).length).toBe(1);
    expect(writes(reqs, 'POST', /\/crm\/sites$/)[0].body).toMatchObject({
      account_id: 'acc-1', name: 'Plant 2', address_line1: 'Plot 5, MIDC Chakan', city: 'Pune', state: 'Maharashtra', postal_code: '410501', latitude: 18.7601, longitude: 73.8626,
    });
    await expect(card).toContainText('Plant 2');
    await expect(card).toContainText('Addresses (2)');

    // Edit.
    await card.getByRole('button', { name: 'Edit address Head office' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit address' });
    await expect(edit.getByLabel('Label', { exact: true })).toHaveValue('Head office');
    await edit.getByLabel('Label', { exact: true }).fill('Registered office');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => writes(reqs, 'PATCH', /\/crm\/sites\/site-1$/).length).toBe(1);
    expect(writes(reqs, 'PATCH', /\/crm\/sites\/site-1$/)[0].body).toMatchObject({ name: 'Registered office', city: 'Pune' });
    await expect(card).toContainText('Registered office');

    // Delete.
    page.once('dialog', (d) => d.accept());
    await card.getByRole('button', { name: 'Delete address Registered office' }).click();
    await expect.poll(() => writes(reqs, 'DELETE', /\/crm\/sites\/site-1$/).length).toBe(1);
    await expect(card).not.toContainText('Registered office');
    await expect(card).toContainText('Addresses (1)');
  });

  test('empty state is explained', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs);
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByTestId('account-addresses')).toContainText('No addresses yet', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: '+ Add address' })).toBeVisible();
  });

  test('non-Spark has no Addresses card and never calls the sites API', async ({ page }) => {
    const reqs: Req[] = [];
    await setup(page, reqs);
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByText('Acme Forge').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('account-addresses')).toHaveCount(0);
    expect(reqs.some((r) => r.path.includes('/sites'))).toBe(false);
  });
});

test.describe('6. contacts <-> company', () => {
  const LINKED = { id: 'c-2', org_id: 'e2e-org-1', first_name: 'Dev', last_name: 'Shah', full_name: 'Dev Shah', email: 'dev@x.example', is_b2c: false, account_id: 'acc-1', account_name: 'Acme Forge', created_at: '2026-01-05T09:00:00Z', updated_at: '2026-01-05T09:00:00Z' };

  test('contacts list: Company column links to the account', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs, { contacts: [LINKED] });
    await page.goto('/dashboard/crm/contacts');
    await expect(page.getByRole('cell', { name: 'Company', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Acme Forge' })).toHaveAttribute('href', '/dashboard/crm/accounts/acc-1');
    await expect(page.getByRole('button', { name: 'Change company for Dev Shah' })).toBeVisible();
  });

  test('non-Spark contacts list keeps the Account column', async ({ page }) => {
    const reqs: Req[] = [];
    await setup(page, reqs, { contacts: [LINKED] });
    await page.goto('/dashboard/crm/contacts');
    await expect(page.getByRole('cell', { name: 'Account', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('cell', { name: 'Company', exact: true })).toHaveCount(0);
  });

  test('account page: visible "+ Add contact" opens contact create with the company pre-linked and locked', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs);
    await page.goto('/dashboard/crm/accounts/acc-1');
    const add = page.getByRole('link', { name: '+ Add contact' });
    await expect(add).toBeVisible({ timeout: 30_000 });
    await expect(add).toHaveAttribute('href', /\/dashboard\/crm\/contacts\/new\?account_id=acc-1&account_name=Acme%20Forge/);
    await add.click();
    await expect(page.getByRole('heading', { name: 'New Contact' })).toBeVisible({ timeout: 30_000 });
    const company = page.getByLabel('Company', { exact: true });
    await expect(company).toHaveValue('Acme Forge');
    await expect(company).toBeDisabled();
  });

  test('contact detail shows Company as a link; edit modal Company picker is clearable (account_id null)', async ({ page }) => {
    const reqs: Req[] = [];
    await scopeToSpark(page);
    await setup(page, reqs, { contacts: [LINKED] });
    await page.route('**/api/v1/crm/contacts/c-2', (route) => {
      if (route.request().method() === 'GET') return ok(route, LINKED);
      return route.fallback();
    });
    await page.goto('/dashboard/crm/contacts/c-2');
    await expect(page.getByRole('link', { name: 'Acme Forge' }).first()).toHaveAttribute('href', '/dashboard/crm/accounts/acc-1', { timeout: 30_000 });
    await expect(page.getByText('Company', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Edit Contact' });
    const picker = dialog.getByLabel('Company', { exact: true });
    await expect(picker).toHaveValue('Acme Forge');
    await dialog.getByRole('button', { name: 'Clear company' }).click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => writes(reqs, 'PATCH', /\/crm\/contacts\/c-2$/).length).toBe(1);
    expect(writes(reqs, 'PATCH', /\/crm\/contacts\/c-2$/)[0].body!.account_id).toBeNull();
  });
});
