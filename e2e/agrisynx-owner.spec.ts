import { test, expect, type Locator, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Admin-only lead assignment (crm_settings.config.lead_form.owner_assignment = 'admin_only').
 *
 * With the flag on, only an admin may choose or change a lead's owner; everybody else keeps SEEING the owner
 * as text but gets no control, and the page never sends an owner on their behalf. Without the flag nothing
 * changes for anyone. Every place the web lets you set a lead's owner is covered:
 *   create · edit modal · detail "Assign" · list row picker · list bulk "Assign to me" / "Assign to…" · import.
 *
 * Each site is checked for the three people that matter:
 *   - a rep (non-admin) on a client WITH the flag      -> no control
 *   - an admin on a client WITH the flag                -> control, and it works
 *   - a rep (non-admin) on a client WITHOUT the flag    -> control, exactly as before
 * plus the edge that decides "admin": an admin-tier role on a self-only ('own') org role is NOT an admin.
 *
 * The bottom half is the hardening for when the setting cannot be READ (request fails / is blocked / comes back
 * empty): last-known value for this user + client, else the restriction ON for a non-admin, admins untouched —
 * on every site above — plus what sign-out must wipe so none of that (or any other per-user state) outlives it.
 *
 * Everything runs against an intercepted API and asserts on what the page shows and what it SENDS.
 */

const ADMIN = SEED_USER; // super_admin
const REP = { ...SEED_USER, id: 'e2e-rep-1', name: 'E2E Rep', role: 'field_executive' };
/** sub_admin is an admin-tier preset, but this person's org role is self-only (data_scope 'own'): a field rep. */
const OWN_SCOPE_SUB_ADMIN = {
  ...SEED_USER, id: 'e2e-own-1', name: 'E2E Own Scope', role: 'sub_admin',
  org_role_data_scope: 'own', org_role: { id: 'role-fe', name: 'Field Executive', data_scope: 'own' },
};
/** A client's own admin account: counts as admin for assignment. */
const CLIENT_ADMIN = { ...SEED_USER, id: 'e2e-client-1', name: 'E2E Client', role: 'client' };

const USERS = [
  { id: 'u-asha', name: 'Asha Menon' },
  { id: 'e2e-rep-1', name: 'E2E Rep' },
  { id: SEED_USER.id, name: 'E2E Admin' },
];

const LEAD = {
  id: 'lead-1', first_name: 'Ramesh', last_name: 'Sharma', full_name: 'Ramesh Sharma', phone: '9876543210', is_b2c: true,
  status: 'new', owner_id: 'u-asha', owner_name: 'Asha Menon', created_by: 'e2e-rep-1', created_at: '2026-10-01T10:00:00Z',
};

// City is hidden so the form needs only name + mobile (no async city catalog); B2C so there is no company to fill.
const settings = (adminOnly: boolean) => ({
  success: true,
  data: {
    business_type: 'b2c',
    config: {
      field_overrides: { 'lead.city': { hidden: true } },
      ...(adminOnly ? { lead_form: { owner_assignment: 'admin_only' } } : {}),
    },
  },
});

interface Seen { method: string; path: string; body: any }
const writes = (seen: Seen[], method: string, path: string | RegExp) =>
  seen.filter((r) => r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)));

/** How GET /crm/settings misbehaves: a 500, a dropped connection, or a 204 with no body at all. */
type SettingsFault = 'http' | 'abort' | 'empty' | null;
interface Ctl { settingsFault: SettingsFault; settingsHits: number }

async function setupCtl(page: Page, o: { user: Record<string, unknown>; adminOnly: boolean; settingsFault?: SettingsFault }) {
  const seen: Seen[] = [];
  const ctl: Ctl = { settingsFault: o.settingsFault ?? null, settingsHits: 0 };
  await seedSession(page, o.user);
  await mockApi(page, {
    settings: settings(o.adminOnly),
    me: { success: true, data: o.user },
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
      let body: any = null;
      try { body = route.request().postDataJSON(); } catch { /* not json */ }
      if (method !== 'GET') seen.push({ method, path, body });
      const ok = (data: unknown, more: Record<string, unknown> = {}) => route.fulfill({ json: { success: true, data, ...more } }).then(() => true);

      if (method === 'GET' && path === '/api/v1/crm/settings') {
        ctl.settingsHits++;
        if (ctl.settingsFault === 'abort') return route.abort('connectionfailed').then(() => true);
        if (ctl.settingsFault === 'empty') return route.fulfill({ status: 204 }).then(() => true);
        if (ctl.settingsFault === 'http') {
          return route.fulfill({ status: 500, json: { success: false, error: { code: 'INTERNAL', message: 'settings unavailable' } } }).then(() => true);
        }
      }
      if (method === 'GET' && path === '/api/v1/users') return ok(USERS);
      if (method === 'GET' && path === '/api/v1/crm/leads') {
        return ok([LEAD], { pagination: { total: 1, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false } });
      }
      if (method === 'GET' && path === `/api/v1/crm/leads/${LEAD.id}`) return ok(LEAD);
      if (method === 'POST' && path === '/api/v1/crm/leads') return ok({ id: 'lead-new', ...(body ?? {}) });
      if (method === 'PATCH' && path === `/api/v1/crm/leads/${LEAD.id}`) return ok({ ...LEAD, ...(body ?? {}) });
      if (method === 'POST' && path === '/api/v1/crm/leads/bulk-assign') return ok({ updated: 1 });
      if (method === 'POST' && path === '/api/v1/crm/import/upload') return ok({ id: 'job-1', status: 'uploaded', total_rows: 1 });
      if (method === 'POST' && path === '/api/v1/crm/import/preview') {
        return ok({ job: { id: 'job-1', status: 'previewed', total_rows: 1 }, sample: [{ first_name: 'Anita' }] });
      }
      return false;
    },
  });
  return { seen, ctl };
}

async function setup(page: Page, o: { user: Record<string, unknown>; adminOnly: boolean }) {
  return (await setupCtl(page, o)).seen;
}

/** Wait until the page has both answers it needs (the setting and who is looking), then let React settle. */
async function settled(page: Page, go: () => Promise<unknown>) {
  const settingsDone = page.waitForResponse((r) => r.url().includes('/crm/settings'));
  const meDone = page.waitForResponse((r) => r.url().endsWith('/auth/me'));
  await go();
  await Promise.all([settingsDone, meDone]);
  await page.waitForTimeout(400);
}

const ownerPicker = (page: Page) => page.getByPlaceholder('Search team member…');

// ── create ──────────────────────────────────────────────────────────────────
async function fillAndSubmit(page: Page) {
  await page.locator('#lead-field-first_name').fill('Anita');
  await page.locator('#lead-field-last_name').fill('Rao');
  await page.locator('#lead-field-phone').fill('9123456780');
  const submit = page.getByRole('button', { name: 'Create lead' });
  await expect(submit).toBeEnabled({ timeout: 20_000 });
  await submit.click();
}

test.describe('Admin-only lead owner — create', () => {
  test('a rep on a flagged client has no Owner control and the lead is created without an owner', async ({ page }) => {
    const seen = await setup(page, { user: REP, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads/new'));
    // The Assignment section now says it is only stage + source (it only does once the setting is known).
    await expect(page.getByText('Stage and source.')).toBeVisible();
    await expect(page.getByLabel('Source', { exact: false })).toBeVisible();
    await expect(page.getByText('Owner', { exact: true })).toHaveCount(0);
    await expect(ownerPicker(page)).toHaveCount(0);

    await fillAndSubmit(page);
    await expect.poll(() => writes(seen, 'POST', '/api/v1/crm/leads')[0]?.body).toBeTruthy();
    const body = writes(seen, 'POST', '/api/v1/crm/leads')[0].body;
    expect(body).toMatchObject({ first_name: 'Anita', phone: '9123456780' });
    expect(body).not.toHaveProperty('owner_id');
  });

  test('a self-only rep (own scope) on a flagged client sends no owner either — not even themselves', async ({ page }) => {
    const seen = await setup(page, { user: OWN_SCOPE_SUB_ADMIN, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads/new'));
    await expect(page.getByText('Stage and source.')).toBeVisible();
    await expect(ownerPicker(page)).toHaveCount(0);
    await fillAndSubmit(page);
    await expect.poll(() => writes(seen, 'POST', '/api/v1/crm/leads')[0]?.body).toBeTruthy();
    expect(writes(seen, 'POST', '/api/v1/crm/leads')[0].body).not.toHaveProperty('owner_id');
  });

  test('an admin on a flagged client still picks an owner, and it is sent', async ({ page }) => {
    const seen = await setup(page, { user: ADMIN, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads/new'));
    await expect(ownerPicker(page)).toBeVisible();
    await expect(page.getByText('Stage, source and owner.', { exact: false })).toBeVisible();
    await ownerPicker(page).click();
    await page.locator('#new-lead-form').getByText('Asha Menon', { exact: true }).click();
    await fillAndSubmit(page);
    await expect.poll(() => writes(seen, 'POST', '/api/v1/crm/leads')[0]?.body).toBeTruthy();
    expect(writes(seen, 'POST', '/api/v1/crm/leads')[0].body).toMatchObject({ owner_id: 'u-asha' });
  });

  test('a client\'s own admin account counts as admin', async ({ page }) => {
    await setup(page, { user: CLIENT_ADMIN, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads/new'));
    await expect(ownerPicker(page)).toBeVisible();
  });

  test('a rep on a client WITHOUT the flag keeps the Owner control and can send one', async ({ page }) => {
    const seen = await setup(page, { user: REP, adminOnly: false });
    await settled(page, () => page.goto('/dashboard/crm/leads/new'));
    await expect(ownerPicker(page)).toBeVisible();
    await ownerPicker(page).click();
    await page.locator('#new-lead-form').getByText('E2E Rep', { exact: true }).click();
    await fillAndSubmit(page);
    await expect.poll(() => writes(seen, 'POST', '/api/v1/crm/leads')[0]?.body).toBeTruthy();
    expect(writes(seen, 'POST', '/api/v1/crm/leads')[0].body).toMatchObject({ owner_id: 'e2e-rep-1' });
  });

  test('the Owner control still obeys the admin\'s hide list, flag or not', async ({ page }) => {
    await seedSession(page, ADMIN);
    await mockApi(page, {
      me: { success: true, data: ADMIN },
      settings: { success: true, data: { business_type: 'b2c', config: {
        lead_form: { owner_assignment: 'admin_only' }, field_overrides: { 'lead.city': { hidden: true }, 'lead.owner_id': { hidden: true } },
      } } },
    });
    await settled(page, () => page.goto('/dashboard/crm/leads/new'));
    await expect(page.getByLabel('Source', { exact: false })).toBeVisible();
    await expect(ownerPicker(page)).toHaveCount(0);
  });
});

// ── edit modal (opened from the list) ───────────────────────────────────────
async function openEdit(page: Page) {
  await page.getByRole('button', { name: 'Edit lead' }).click();
  await expect(page.getByText('Edit lead', { exact: true })).toBeVisible();
  await expect(page.getByText('Assignment', { exact: true })).toBeVisible();
  await page.waitForTimeout(400);
}

test.describe('Admin-only lead owner — edit', () => {
  test('a rep on a flagged client sees no Owner picker and saves the owner the lead already has', async ({ page }) => {
    const seen = await setup(page, { user: REP, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads'));
    await expect(page.getByText('Ramesh Sharma')).toBeVisible();
    await openEdit(page);
    await expect(ownerPicker(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => writes(seen, 'PATCH', '/api/v1/crm/leads/lead-1')[0]?.body).toBeTruthy();
    // The unchanged owner — the server sees no change.
    expect(writes(seen, 'PATCH', '/api/v1/crm/leads/lead-1')[0].body.owner_id).toBe('u-asha');
  });

  test('an admin on a flagged client can change the owner in the modal', async ({ page }) => {
    const seen = await setup(page, { user: ADMIN, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads'));
    await expect(page.getByText('Ramesh Sharma')).toBeVisible();
    await openEdit(page);
    await expect(ownerPicker(page).last()).toBeVisible();
    await ownerPicker(page).last().click();
    await page.getByText('E2E Rep', { exact: true }).last().click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => writes(seen, 'PATCH', '/api/v1/crm/leads/lead-1')[0]?.body).toBeTruthy();
    expect(writes(seen, 'PATCH', '/api/v1/crm/leads/lead-1')[0].body.owner_id).toBe('e2e-rep-1');
  });

  test('a rep on a client WITHOUT the flag keeps the Owner picker in the modal', async ({ page }) => {
    await setup(page, { user: REP, adminOnly: false });
    await settled(page, () => page.goto('/dashboard/crm/leads'));
    await expect(page.getByText('Ramesh Sharma')).toBeVisible();
    await openEdit(page);
    await expect(ownerPicker(page).last()).toBeVisible();
  });
});

// ── lead detail ─────────────────────────────────────────────────────────────
const assignButton = (page: Page) => page.getByRole('button', { name: /^Assign/ });

test.describe('Admin-only lead owner — detail', () => {
  test('a rep on a flagged client has no Assign menu, but still sees who owns the lead', async ({ page }) => {
    await setup(page, { user: REP, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads/lead-1'));
    await expect(page.getByText('Owner: Asha Menon')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Proposal' })).toBeVisible();
    await expect(assignButton(page)).toHaveCount(0);
  });

  test('an admin-tier role on a self-only org role is not an admin: no Assign menu', async ({ page }) => {
    await setup(page, { user: OWN_SCOPE_SUB_ADMIN, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads/lead-1'));
    await expect(page.getByText('Owner: Asha Menon')).toBeVisible();
    await expect(assignButton(page)).toHaveCount(0);
  });

  test('an admin on a flagged client can assign from the detail page', async ({ page }) => {
    const seen = await setup(page, { user: ADMIN, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads/lead-1'));
    await expect(assignButton(page)).toBeVisible();
    await assignButton(page).click();
    await page.getByRole('menuitem', { name: 'E2E Rep' }).click();
    await expect.poll(() => writes(seen, 'PATCH', '/api/v1/crm/leads/lead-1')[0]?.body).toBeTruthy();
    expect(writes(seen, 'PATCH', '/api/v1/crm/leads/lead-1')[0].body).toEqual({ owner_id: 'e2e-rep-1' });
  });

  test('a rep on a client WITHOUT the flag keeps the Assign menu', async ({ page }) => {
    await setup(page, { user: REP, adminOnly: false });
    await settled(page, () => page.goto('/dashboard/crm/leads/lead-1'));
    await expect(page.getByText('Owner: Asha Menon')).toBeVisible();
    await expect(assignButton(page)).toBeVisible();
  });
});

// ── leads list: row owner picker + bulk assign ──────────────────────────────
const rowOwnerPicker = (page: Page) => page.getByTitle('Click to reassign');

test.describe('Admin-only lead owner — leads list', () => {
  test('a rep on a flagged client: the owner is plain text and a selection offers no Assign actions', async ({ page }) => {
    await setup(page, { user: REP, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads'));
    await expect(page.getByText('Ramesh Sharma')).toBeVisible();
    // Still displayed...
    await expect(page.getByRole('cell', { name: /Asha Menon/ })).toBeVisible();
    // ...but not as a control.
    await expect(rowOwnerPicker(page)).toHaveCount(0);

    await page.getByLabel('Select Ramesh Sharma').check();
    await expect(page.getByText('selected', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /Delete 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign to me' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Assign to…/ })).toHaveCount(0);
  });

  test('an admin on a flagged client keeps the row picker and both bulk actions', async ({ page }) => {
    const seen = await setup(page, { user: ADMIN, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads'));
    await expect(rowOwnerPicker(page)).toBeVisible();
    await page.getByLabel('Select Ramesh Sharma').check();
    await expect(page.getByRole('button', { name: 'Assign to me' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Assign to…/ })).toBeVisible();

    await page.getByRole('button', { name: 'Assign to me' }).click();
    await expect.poll(() => writes(seen, 'POST', '/api/v1/crm/leads/bulk-assign')[0]?.body).toBeTruthy();
    expect(writes(seen, 'POST', '/api/v1/crm/leads/bulk-assign')[0].body).toMatchObject({ lead_ids: ['lead-1'], owner_id: SEED_USER.id });
  });

  test('a rep on a client WITHOUT the flag keeps everything', async ({ page }) => {
    await setup(page, { user: REP, adminOnly: false });
    await settled(page, () => page.goto('/dashboard/crm/leads'));
    await expect(rowOwnerPicker(page)).toBeVisible();
    await page.getByLabel('Select Ramesh Sharma').check();
    await expect(page.getByRole('button', { name: 'Assign to me' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Assign to…/ })).toBeVisible();
  });
});

// ── import ──────────────────────────────────────────────────────────────────
const CSV = 'first_name,phone,owner_email\nAnita,9123456780,asha@example.com\n';

async function toMapStep(page: Page) {
  await page.locator('input[type=file]').setInputFiles({ name: 'leads.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await expect(page.getByText('Map your CSV columns to lead fields:')).toBeVisible();
}
/** The mapping <select> next to a CSV column header. */
const mappingFor = (page: Page, header: string) =>
  page.getByText(header, { exact: true }).locator('xpath=following-sibling::select');

test.describe('Admin-only lead owner — import', () => {
  test('a rep on a flagged client cannot map a column to the owner; it is skipped and never sent', async ({ page }) => {
    const seen = await setup(page, { user: REP, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads/import'));
    await toMapStep(page);

    // The usual columns still map by themselves...
    await expect(mappingFor(page, 'first_name')).toHaveValue('first_name');
    // ...the owner column is left alone, and the option is not offered.
    await expect(mappingFor(page, 'owner_email')).toHaveValue('');
    await expect(page.locator('option', { hasText: 'Assign To' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Preview' }).click();
    await expect.poll(() => writes(seen, 'POST', '/api/v1/crm/import/preview')[0]?.body).toBeTruthy();
    const mapping = writes(seen, 'POST', '/api/v1/crm/import/preview')[0].body.mapping;
    expect(mapping).toMatchObject({ first_name: 'first_name', phone: 'phone' });
    expect(Object.values(mapping)).not.toContain('owner_email');
    expect(Object.values(mapping)).not.toContain('owner_name');
  });

  test('an admin on a flagged client gets the owner column mapped', async ({ page }) => {
    const seen = await setup(page, { user: ADMIN, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads/import'));
    await toMapStep(page);
    await expect(mappingFor(page, 'owner_email')).toHaveValue('owner_email');
    await expect(mappingFor(page, 'first_name').locator('option', { hasText: 'Assign To (owner email)' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect.poll(() => writes(seen, 'POST', '/api/v1/crm/import/preview')[0]?.body).toBeTruthy();
    expect(writes(seen, 'POST', '/api/v1/crm/import/preview')[0].body.mapping).toMatchObject({ owner_email: 'owner_email' });
  });

  test('a rep on a client WITHOUT the flag still maps the owner column', async ({ page }) => {
    await setup(page, { user: REP, adminOnly: false });
    await settled(page, () => page.goto('/dashboard/crm/leads/import'));
    await toMapStep(page);
    await expect(mappingFor(page, 'owner_email')).toHaveValue('owner_email');
    await expect(mappingFor(page, 'first_name').locator('option', { hasText: 'Assign To (owner email)' })).toHaveCount(1);
  });
});

// ── the setting cannot be read ──────────────────────────────────────────────
// Before: a failed GET /crm/settings meant "no restriction", so every owner control came back for a non-admin on
// a client that had turned the restriction on. Now: last-known value for this user + client, else restricted.
// Admins keep every control either way.

/** The storage contract (leadOwnerAccess.ts): one key per user + client scope, '1' = admin-only, '0' = open. */
const lastKnownKey = (userId: string, scope = 'org') => `kinematic_owner_assign:${userId}:${scope}`;
const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';

/** Pre-load a last-known value (an init script, so it is there before the page's first read). */
async function rememberLastKnown(page: Page, userId: string, value: boolean, scope = 'org') {
  await page.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } }, [lastKnownKey(userId, scope), value ? '1' : '0']);
}
async function selectClient(page: Page, clientId: string) {
  await page.addInitScript(([id]) => { try { window.localStorage.setItem('kinematic_selected_client', id); } catch { /* ignore */ } }, [clientId]);
}
const stored = (page: Page, key: string) => page.evaluate((k) => window.localStorage.getItem(k), key);
const storedKeys = (page: Page) => page.evaluate(() => Object.keys(window.localStorage));

/** Like settled(), for a settings request that fails: wait for the failure (every retry of it) and for the profile. */
async function settledUnreadable(page: Page, fault: Exclude<SettingsFault, null>, go: () => Promise<unknown>) {
  let failures = 0;
  const onFailed = (r: { url(): string }) => { if (r.url().includes('/crm/settings')) failures++; };
  page.on('requestfailed', onFailed);
  const meDone = page.waitForResponse((r) => r.url().endsWith('/auth/me'));
  const settingsDone = fault === 'abort'
    ? expect.poll(() => failures, { timeout: 20_000 }).toBeGreaterThanOrEqual(3) // the API client tries a GET three times
    : page.waitForResponse((r) => r.url().includes('/crm/settings'));
  await go();
  await Promise.all([settingsDone, meDone]);
  page.off('requestfailed', onFailed);
  await page.waitForTimeout(400);
}

/** One place the web lets you set an owner: how to reach it, and what "has the owner control" / "has none" look like. */
interface Site {
  name: string;
  url: string;
  reach?: (page: Page) => Promise<void>;
  check: (page: Page, shown: boolean) => Promise<void>;
}
const SITES: Site[] = [
  {
    name: 'create', url: '/dashboard/crm/leads/new',
    check: async (page, shown) => {
      if (shown) { await expect(ownerPicker(page)).toBeVisible(); return; }
      await expect(page.getByText('Stage and source.')).toBeVisible(); // the form knows it is locked, not just still loading
      await expect(ownerPicker(page)).toHaveCount(0);
    },
  },
  {
    name: 'edit modal', url: '/dashboard/crm/leads',
    reach: async (page) => { await expect(page.getByText('Ramesh Sharma')).toBeVisible(); await openEdit(page); },
    check: async (page, shown) => {
      if (shown) await expect(ownerPicker(page).last()).toBeVisible();
      else await expect(ownerPicker(page)).toHaveCount(0);
    },
  },
  {
    name: 'detail', url: '/dashboard/crm/leads/lead-1',
    reach: async (page) => { await expect(page.getByText('Owner: Asha Menon')).toBeVisible(); },
    check: async (page, shown) => {
      if (shown) await expect(assignButton(page)).toBeVisible();
      else await expect(assignButton(page)).toHaveCount(0);
    },
  },
  {
    name: 'list', url: '/dashboard/crm/leads',
    reach: async (page) => { await expect(page.getByText('Ramesh Sharma')).toBeVisible(); await page.getByLabel('Select Ramesh Sharma').check(); },
    check: async (page, shown) => {
      await expect(page.getByRole('button', { name: /Delete 1/ })).toBeVisible(); // the selection bar is up
      const want = (l: Locator) => (shown ? expect(l).toBeVisible() : expect(l).toHaveCount(0));
      await want(rowOwnerPicker(page));
      await want(page.getByRole('button', { name: 'Assign to me' }));
      await want(page.getByRole('button', { name: /Assign to…/ }));
    },
  },
  {
    name: 'import', url: '/dashboard/crm/leads/import',
    reach: async (page) => { await toMapStep(page); await expect(mappingFor(page, 'first_name')).toHaveValue('first_name'); },
    check: async (page, shown) => {
      await expect(mappingFor(page, 'owner_email')).toHaveValue(shown ? 'owner_email' : '');
      await expect(mappingFor(page, 'first_name').locator('option', { hasText: 'Assign To (owner email)' })).toHaveCount(shown ? 1 : 0);
    },
  },
];

async function runUnreadable(page: Page, site: Site, o: { user: typeof REP; lastKnown: boolean | null; shown: boolean }) {
  if (o.lastKnown !== null) await rememberLastKnown(page, o.user.id, o.lastKnown);
  const { ctl } = await setupCtl(page, { user: o.user, adminOnly: false, settingsFault: 'http' });
  await settledUnreadable(page, 'http', () => page.goto(site.url));
  await site.reach?.(page);
  await site.check(page, o.shown);
  expect(ctl.settingsHits).toBeGreaterThan(0); // the read really did fail
  // A failed read never rewrites what was last known.
  expect(await stored(page, lastKnownKey(o.user.id))).toBe(o.lastKnown === null ? null : o.lastKnown ? '1' : '0');
}

for (const site of SITES) {
  test.describe(`Admin-only lead owner — settings unreadable — ${site.name}`, () => {
    test('a rep whose last-known setting was admin-only gets no owner control', async ({ page }) => {
      await runUnreadable(page, site, { user: REP, lastKnown: true, shown: false });
    });
    test('a rep whose last-known setting was open keeps the owner control', async ({ page }) => {
      await runUnreadable(page, site, { user: REP, lastKnown: false, shown: true });
    });
    test('a rep with no last-known value gets no owner control (restriction assumed)', async ({ page }) => {
      await runUnreadable(page, site, { user: REP, lastKnown: null, shown: false });
    });
    test('an admin with no last-known value keeps the owner control', async ({ page }) => {
      await runUnreadable(page, site, { user: ADMIN as typeof REP, lastKnown: null, shown: true });
    });
    test('an admin whose last-known setting was admin-only keeps the owner control', async ({ page }) => {
      await runUnreadable(page, site, { user: ADMIN as typeof REP, lastKnown: true, shown: true });
    });
  });
}

test.describe('Admin-only lead owner — settings unreadable — other ways to fail', () => {
  test('a blocked / dropped connection counts as a failed read', async ({ page }) => {
    const { ctl } = await setupCtl(page, { user: REP, adminOnly: false, settingsFault: 'abort' });
    await settledUnreadable(page, 'abort', () => page.goto('/dashboard/crm/leads/new'));
    await expect(page.getByText('Stage and source.')).toBeVisible();
    await expect(ownerPicker(page)).toHaveCount(0);
    expect(ctl.settingsHits).toBeGreaterThanOrEqual(3);
  });

  test('a dropped connection with an "open" last-known value keeps the control', async ({ page }) => {
    await rememberLastKnown(page, REP.id, false);
    await setupCtl(page, { user: REP, adminOnly: false, settingsFault: 'abort' });
    await settledUnreadable(page, 'abort', () => page.goto('/dashboard/crm/leads/new'));
    await expect(ownerPicker(page)).toBeVisible();
  });

  test('an answer with no body at all (204) counts as a failed read', async ({ page }) => {
    await setupCtl(page, { user: REP, adminOnly: false, settingsFault: 'empty' });
    await settledUnreadable(page, 'empty', () => page.goto('/dashboard/crm/leads/lead-1'));
    await expect(page.getByText('Owner: Asha Menon')).toBeVisible();
    await expect(assignButton(page)).toHaveCount(0);
  });

  test('the last-known value belongs to one user: someone else\'s "open" does not unlock a rep', async ({ page }) => {
    await rememberLastKnown(page, 'someone-else', false);
    await setupCtl(page, { user: REP, adminOnly: false, settingsFault: 'http' });
    await settledUnreadable(page, 'http', () => page.goto('/dashboard/crm/leads/new'));
    await expect(page.getByText('Stage and source.')).toBeVisible();
    await expect(ownerPicker(page)).toHaveCount(0);
  });

  test('the last-known value belongs to one client: another client\'s "open" does not unlock a rep', async ({ page }) => {
    await selectClient(page, CLIENT_A);
    await rememberLastKnown(page, REP.id, false, CLIENT_B);
    await rememberLastKnown(page, REP.id, false, 'org');
    await setupCtl(page, { user: REP, adminOnly: false, settingsFault: 'http' });
    await settledUnreadable(page, 'http', () => page.goto('/dashboard/crm/leads/new'));
    await expect(page.getByText('Stage and source.')).toBeVisible();
    await expect(ownerPicker(page)).toHaveCount(0);
  });

  test('…and the value remembered for the selected client is the one used', async ({ page }) => {
    await selectClient(page, CLIENT_A);
    await rememberLastKnown(page, REP.id, false, CLIENT_A);
    await setupCtl(page, { user: REP, adminOnly: false, settingsFault: 'http' });
    await settledUnreadable(page, 'http', () => page.goto('/dashboard/crm/leads/new'));
    await expect(ownerPicker(page)).toBeVisible();
  });
});

test.describe('Admin-only lead owner — a successful read is unchanged, and is what gets remembered', () => {
  test('a flagged client is remembered as admin-only', async ({ page }) => {
    await setup(page, { user: REP, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads/new'));
    await expect(page.getByText('Stage and source.')).toBeVisible();
    expect(await stored(page, lastKnownKey(REP.id))).toBe('1');
  });

  test('a client without the flag is remembered as open, and nothing is hidden', async ({ page }) => {
    await setup(page, { user: REP, adminOnly: false });
    await settled(page, () => page.goto('/dashboard/crm/leads/new'));
    await expect(ownerPicker(page)).toBeVisible();
    expect(await stored(page, lastKnownKey(REP.id))).toBe('0');
  });

  test('a successful read beats a stale last-known value, and replaces it', async ({ page }) => {
    await rememberLastKnown(page, REP.id, true); // stale: the admin has since turned the restriction off
    await setup(page, { user: REP, adminOnly: false });
    await settled(page, () => page.goto('/dashboard/crm/leads/new'));
    await expect(ownerPicker(page)).toBeVisible();
    expect(await stored(page, lastKnownKey(REP.id))).toBe('0');
  });

  test('flagged, then the server goes away: still restricted after a reload', async ({ page }) => {
    const { ctl } = await setupCtl(page, { user: REP, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads/new'));
    await expect(page.getByText('Stage and source.')).toBeVisible();

    // Drop the client's own cached responses so the reload really has to ask the server, then break it.
    await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('kapi')).forEach((k) => window.localStorage.removeItem(k)));
    ctl.settingsFault = 'http';
    await settledUnreadable(page, 'http', () => page.reload());
    await expect(page.getByText('Stage and source.')).toBeVisible();
    await expect(ownerPicker(page)).toHaveCount(0);
  });

  test('open, then the server goes away: the control stays after a reload', async ({ page }) => {
    const { ctl } = await setupCtl(page, { user: REP, adminOnly: false });
    await settled(page, () => page.goto('/dashboard/crm/leads/new'));
    await expect(ownerPicker(page)).toBeVisible();

    await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('kapi')).forEach((k) => window.localStorage.removeItem(k)));
    ctl.settingsFault = 'http';
    await settledUnreadable(page, 'http', () => page.reload());
    await expect(ownerPicker(page)).toBeVisible();
  });
});

// ── sign-out ────────────────────────────────────────────────────────────────
async function signOut(page: Page) {
  await page.locator('button[aria-haspopup="menu"]').filter({ hasText: REP.name }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 });
}

test.describe('Sign-out wipes what belongs to the person who was signed in', () => {
  test('credentials, request scope, cached responses and the last-known setting are all gone; device preferences stay', async ({ page }) => {
    await setup(page, { user: REP, adminOnly: true });
    await settled(page, () => page.goto('/dashboard/crm/leads'));
    await expect(page.getByText('Ramesh Sharma')).toBeVisible();

    // The session left real state behind...
    const during = await storedKeys(page);
    expect(during.some((k) => k.startsWith('kapi2:'))).toBe(true);
    expect(during).toContain(lastKnownKey(REP.id));

    // ...and a lot more could be: a client / city picked, a super-admin's parked session and "login as" token, a
    // pre-rename cache entry, other people's last-known values.
    await page.evaluate(([clientId, otherOwnerKey, sameUserOtherClientKey]) => {
      const set = (k: string, v: string) => window.localStorage.setItem(k, v);
      set('kinematic_refresh_token', 'refresh-1');
      set('kinematic_supabase_project', 'kinematic');
      set('kinematic_selected_client', clientId);
      set('kinematic_hide_client_filter', '1');
      set('kinematic_selected_city', 'Pune');
      set('kinematic_acting_as', JSON.stringify({ org_id: 'o', client_id: clientId, token: 'impersonation-token', name: 'Some client' }));
      set('kinematic_impersonate_user', JSON.stringify({ id: 'target-user' }));
      set('kinematic_impersonate_prev_project', 'default');
      set('kinematic_su_session', JSON.stringify({ token: 'su-token', refresh: 'su-refresh' }));
      set('kapi:legacy-entry', '{"data":[]}');
      set(otherOwnerKey, '1');
      set(sameUserOtherClientKey, '0');
      // not about a person: must survive
      set('kinematic-theme', 'dark');
      set('kin_sidebar_collapsed', '1');
      set('kinematic_last_identity', JSON.stringify({ email: 'e2e@example.com', orgId: 'e2e-org-1', clientId: null, project: 'default' }));
      set('kinematic_nav_prefs:e2e-rep-1', '{"sectionOrder":[],"itemOrder":{}}');
    }, [CLIENT_A, lastKnownKey('someone-else'), lastKnownKey(REP.id, CLIENT_A)]);

    await signOut(page);
    const after = await storedKeys(page);
    const gone = [
      'kinematic_token', 'kinematic_refresh_token', 'kinematic_user', 'kinematic_expiry', 'kinematic_supabase_project',
      'kinematic_selected_client', 'kinematic_hide_client_filter', 'kinematic_selected_city',
      'kinematic_acting_as', 'kinematic_impersonate_user', 'kinematic_impersonate_prev_project', 'kinematic_su_session',
      'kapi:legacy-entry',
    ];
    for (const k of gone) expect(after, `${k} should be removed on sign-out`).not.toContain(k);
    expect(after.filter((k) => k.startsWith('kapi2:') || k.startsWith('kapi:') || k.startsWith('kinematic_owner_assign:'))).toEqual([]);
    for (const k of ['kinematic-theme', 'kin_sidebar_collapsed', 'kinematic_last_identity', 'kinematic_nav_prefs:e2e-rep-1']) {
      expect(after, `${k} is not session state and should survive`).toContain(k);
    }
  });

  test('a GET still in flight when the person signs out cannot write its answer back afterwards', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let held = 0;
    await seedSession(page, REP);
    await mockApi(page, {
      settings: settings(true),
      me: { success: true, data: REP },
      onRequest: async (route, url, method) => {
        const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
        if (method === 'GET' && path === '/api/v1/crm/leads' && !url.includes('inbound')) {
          held++;
          await gate; // the list answers only after sign-out
          await route.fulfill({ json: { success: true, data: [LEAD], pagination: { total: 1, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false } } });
          return true;
        }
        if (method === 'GET' && path === '/api/v1/users') { await route.fulfill({ json: { success: true, data: USERS } }); return true; }
        return false;
      },
    });
    await page.goto('/dashboard/crm/leads');
    await expect.poll(() => held).toBeGreaterThan(0);
    await page.waitForTimeout(800); // the settings / profile reads have answered and been cached
    expect((await storedKeys(page)).some((k) => k.startsWith('kapi2:'))).toBe(true);

    await signOut(page);
    expect((await storedKeys(page)).filter((k) => k.startsWith('kapi'))).toEqual([]);

    release();
    await page.waitForTimeout(800); // let the late answer land
    expect((await storedKeys(page)).filter((k) => k.startsWith('kapi') || k.startsWith('kinematic_owner_assign:'))).toEqual([]);
  });
});
