import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Form Builder housekeeping: delete a field once it is added, rename / delete a form, rename / delete the activity
 * a form is linked to. Everything runs against an intercepted API and asserts on what the page shows and SENDS.
 *
 * Who sees what:
 *   - platform admin           -> everything
 *   - a client's own admin     -> can edit and delete FIELDS on any form they can open, and rename / delete their
 *                                 own activities; deleting a whole FORM only when it is linked to one of those
 *                                 activities (the form list is shared by every client of the org).
 */

const ADMIN = SEED_USER; // super_admin
const CLIENT_ADMIN = { ...SEED_USER, id: 'e2e-client-1', name: 'E2E Client', role: 'client', client_id: 'client-1' };

const ACTIVITIES = [{ id: 'act-1', name: 'Retail Audit', type: 'VISIT', is_active: true }];
const FORMS = [
  { id: 'form-1', title: 'Outlet Audit', description: '', status: 'draft', version: 1, icon: '📋', cover_color: '#E01E2C', activity_id: 'act-1', created_at: '2026-10-01T10:00:00Z' },
  // Not linked to any activity: nobody owns it, so a client's admin must not be offered its deletion.
  { id: 'form-2', title: 'Shared Survey', description: '', status: 'draft', version: 1, icon: '📋', cover_color: '#E01E2C', activity_id: null, created_at: '2026-10-02T10:00:00Z' },
];
const PAGES = [{ id: 'page-1', form_id: 'form-1', title: 'Page 1', page_order: 0 }];
const QUESTIONS = [
  { id: 'q-1', form_id: 'form-1', page_id: 'page-1', qtype: 'short_text', label: 'Outlet name', is_required: true, q_order: 0, options: [], validation: {}, logic: [], media_config: {} },
  { id: 'q-2', form_id: 'form-1', page_id: 'page-1', qtype: 'number', label: 'Shelf count', is_required: false, q_order: 1, options: [], validation: {}, logic: [], media_config: {} },
];

interface Seen { method: string; path: string; body: any }
const writes = (seen: Seen[], method: string, path: string | RegExp) =>
  seen.filter((r) => r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)));

async function setup(page: Page, user: Record<string, unknown> = ADMIN) {
  const seen: Seen[] = [];
  await seedSession(page, user);
  await mockApi(page, {
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
      let body: any = null;
      try { body = route.request().postDataJSON(); } catch { /* not json */ }
      if (method !== 'GET') seen.push({ method, path, body });
      const ok = (data: unknown) => route.fulfill({ json: { success: true, data } }).then(() => true);

      if (method === 'GET' && path === '/api/v1/builder/forms') return ok(FORMS);
      if (method === 'GET' && path === '/api/v1/activities') return ok(ACTIVITIES);
      if (method === 'GET' && /^\/api\/v1\/builder\/forms\/[^/]+\/pages$/.test(path)) return ok(PAGES);
      if (method === 'GET' && /^\/api\/v1\/builder\/forms\/[^/]+\/questions$/.test(path)) return ok(QUESTIONS);
      if (method === 'PATCH' && /^\/api\/v1\/builder\/forms\/[^/]+$/.test(path)) return ok({ ...FORMS[0], ...(body ?? {}) });
      if (method === 'DELETE' && /^\/api\/v1\/builder\/(forms|questions)\/[^/]+$/.test(path)) return ok({ deleted: true });
      if ((method === 'PATCH' || method === 'DELETE') && /^\/api\/v1\/activities\/[^/]+$/.test(path)) return ok({ ...ACTIVITIES[0], ...(body ?? {}) });
      return false;
    },
  });
  return seen;
}

/** The form cards render the title in a div, so find the card by its rename button instead. */
const renameFormBtn = (page: Page, title: string) => page.getByRole('button', { name: `Rename form ${title}` });
const deleteFormBtn = (page: Page, title: string) => page.getByRole('button', { name: `Delete form ${title}` });
const confirm = (page: Page) => page.getByRole('button', { name: 'Delete Forever' });

async function openList(page: Page) {
  await page.goto('/dashboard/form-builder');
  await expect(renameFormBtn(page, 'Outlet Audit')).toBeVisible({ timeout: 30_000 });
}
async function openEditor(page: Page) {
  await openList(page);
  await page.getByRole('button', { name: /Edit/ }).first().click();
  await expect(page.getByLabel('Form name')).toBeVisible();
  await expect(page.getByText('Outlet name').first()).toBeVisible();
}

test.describe('Form Builder — list', () => {
  test('a form can be renamed without opening it', async ({ page }) => {
    const seen = await setup(page);
    await openList(page);
    await renameFormBtn(page, 'Outlet Audit').click();
    await page.getByLabel('Form name').fill('Outlet Audit v2');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => writes(seen, 'PATCH', '/api/v1/builder/forms/form-1')[0]?.body).toEqual({ title: 'Outlet Audit v2' });
    await expect(renameFormBtn(page, 'Outlet Audit v2')).toBeVisible();
  });

  test('the linked activity can be renamed from the form card', async ({ page }) => {
    const seen = await setup(page);
    await openList(page);
    await page.getByRole('button', { name: 'Rename activity' }).first().click();
    await page.getByLabel('Activity name').fill('Store Audit');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => writes(seen, 'PATCH', '/api/v1/activities/act-1')[0]?.body).toEqual({ name: 'Store Audit' });
    await expect(page.getByRole('option', { name: 'Store Audit' }).first()).toBeAttached();
  });

  test('deleting the linked activity keeps the form and unlinks it', async ({ page }) => {
    const seen = await setup(page);
    await openList(page);
    await page.getByRole('button', { name: 'Delete activity' }).first().click();
    await confirm(page).click();
    await expect.poll(() => writes(seen, 'DELETE', '/api/v1/activities/act-1').length).toBe(1);
    await expect(renameFormBtn(page, 'Outlet Audit')).toBeVisible();
    await expect(page.getByLabel('Linked activity').first()).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Delete activity' })).toHaveCount(0);
  });

  test('a form can be deleted', async ({ page }) => {
    const seen = await setup(page);
    await openList(page);
    await deleteFormBtn(page, 'Outlet Audit').click();
    await confirm(page).click();
    await expect.poll(() => writes(seen, 'DELETE', '/api/v1/builder/forms/form-1').length).toBe(1);
  });

  test('a client admin may delete a form linked to their own activity, not an unlinked one', async ({ page }) => {
    await setup(page, CLIENT_ADMIN);
    await openList(page);
    await expect(deleteFormBtn(page, 'Outlet Audit')).toBeVisible();
    await expect(renameFormBtn(page, 'Shared Survey')).toBeVisible();
    await expect(deleteFormBtn(page, 'Shared Survey')).toHaveCount(0);
    // ...and manages their own activity.
    await expect(page.getByRole('button', { name: 'Rename activity' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete activity' }).first()).toBeVisible();
  });
});

test.describe('Form Builder — editor', () => {
  for (const [who, user] of [['a platform admin', ADMIN], ['a client admin', CLIENT_ADMIN]] as const) {
    test(`${who} can delete a field straight from its card`, async ({ page }) => {
      const seen = await setup(page, user);
      await openEditor(page);
      await page.getByRole('button', { name: 'Delete field Outlet name', exact: true }).click();
      await confirm(page).click();
      await expect.poll(() => writes(seen, 'DELETE', '/api/v1/builder/questions/q-1').length).toBe(1);
      await expect(page.getByText('Outlet name')).toHaveCount(0);
      await expect(page.getByText('Shelf count').first()).toBeVisible();
    });
  }

  test('the properties panel has a labelled Delete field button too', async ({ page }) => {
    const seen = await setup(page);
    await openEditor(page);
    await page.getByText('Shelf count').first().click();
    await page.getByRole('button', { name: 'Delete field', exact: true }).click();
    await confirm(page).click();
    await expect.poll(() => writes(seen, 'DELETE', '/api/v1/builder/questions/q-2').length).toBe(1);
  });

  test('renaming the form saves when you leave the name box; an emptied name is put back and not saved', async ({ page }) => {
    const seen = await setup(page);
    await openEditor(page);
    const name = page.getByLabel('Form name');
    await name.fill('Outlet Audit — Q4');
    await name.blur();
    await expect.poll(() => writes(seen, 'PATCH', '/api/v1/builder/forms/form-1')[0]?.body).toEqual({ title: 'Outlet Audit — Q4' });

    const before = writes(seen, 'PATCH', '/api/v1/builder/forms/form-1').length;
    await name.fill('   ');
    await name.blur();
    await expect(name).toHaveValue('Outlet Audit — Q4');
    expect(writes(seen, 'PATCH', '/api/v1/builder/forms/form-1').length).toBe(before);
  });

  test('Settings: rename the activity, and delete the whole form (back to the list)', async ({ page }) => {
    const seen = await setup(page);
    await openEditor(page);
    await page.getByRole('button', { name: 'settings', exact: true }).click();
    await page.getByRole('button', { name: 'Rename activity' }).click();
    await page.getByLabel('Activity name').fill('Store Audit');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => writes(seen, 'PATCH', '/api/v1/activities/act-1')[0]?.body).toEqual({ name: 'Store Audit' });

    await page.getByRole('button', { name: '🗑 Delete form' }).last().click();
    await confirm(page).click();
    await expect.poll(() => writes(seen, 'DELETE', '/api/v1/builder/forms/form-1').length).toBe(1);
    await expect(renameFormBtn(page, 'Outlet Audit')).toBeVisible();
  });
});
