import { test, expect, type Page } from '@playwright/test';
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

async function setup(page: Page, o: { user: Record<string, unknown>; adminOnly: boolean }) {
  const seen: Seen[] = [];
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
  return seen;
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
