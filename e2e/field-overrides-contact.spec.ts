import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Field-override gate — contact Edit modal.
 *
 * Phase 0 increment #3. Same contract as the lead forms, applied to the next
 * entity: hiding a built-in contact field in CRM Settings must remove it from
 * the ContactEditModal. Added data-field hooks to the modal's gated rows and
 * assert on them, scoped to the modal's role="dialog" ("Edit Contact").
 */

const CONTACT = {
  id: 'contact-1', first_name: 'Ravi', last_name: 'Kumar', full_name: 'Ravi Kumar',
  email: 'ravi@acme.example.com', phone: '9876500000', title: 'Buyer',
  is_b2c: false, created_by: SEED_USER.id,
};

async function setup(page: Page, overrides: Record<string, unknown> = {}) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: { field_overrides: overrides } } },
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
      const ok = (data: unknown) => route.fulfill({ json: { success: true, data } }).then(() => true);
      if (method === 'GET' && path === '/api/v1/crm/contacts/contact-1') return ok(CONTACT);
      if (method === 'PATCH' && path === '/api/v1/crm/contacts/contact-1') return ok(CONTACT);
      return false; // activities / deals / notes / emails / users fall through to mockApi's [] default
    },
  });
}

const openContactEdit = async (page: Page) => {
  await page.goto('/dashboard/crm/contacts/contact-1');
  const edit = page.getByRole('button', { name: 'Edit', exact: true }).first();
  await expect(edit).toBeVisible({ timeout: 30_000 });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'Edit Contact' });
  await expect(dialog).toBeVisible();
  return dialog;
};

test.describe('Field-override gate — contact Edit modal', () => {
  test('control: email, phone and title render with no overrides', async ({ page }) => {
    await setup(page);
    const dialog = await openContactEdit(page);
    await expect(dialog.locator('[data-field="email"]')).toHaveCount(1);
    await expect(dialog.locator('[data-field="phone"]')).toHaveCount(1);
    await expect(dialog.locator('[data-field="title"]')).toHaveCount(1);
  });

  test('hiding email removes it (phone + title stay)', async ({ page }) => {
    await setup(page, { 'contact.email': { hidden: true } });
    const dialog = await openContactEdit(page);
    await expect(dialog.locator('[data-field="email"]')).toHaveCount(0);
    await expect(dialog.locator('[data-field="phone"]')).toHaveCount(1);
    await expect(dialog.locator('[data-field="title"]')).toHaveCount(1);
  });

  test('hiding phone removes it (email stays)', async ({ page }) => {
    await setup(page, { 'contact.phone': { hidden: true } });
    const dialog = await openContactEdit(page);
    await expect(dialog.locator('[data-field="phone"]')).toHaveCount(0);
    await expect(dialog.locator('[data-field="email"]')).toHaveCount(1);
  });

  test('hiding title removes it (email stays)', async ({ page }) => {
    await setup(page, { 'contact.title': { hidden: true } });
    const dialog = await openContactEdit(page);
    await expect(dialog.locator('[data-field="title"]')).toHaveCount(0);
    await expect(dialog.locator('[data-field="email"]')).toHaveCount(1);
  });
});
