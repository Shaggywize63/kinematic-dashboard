import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Field-override gate — Edit modal + Detail surfaces.
 *
 * Phase 0 increment #2. The Create form is covered by field-overrides.spec.ts;
 * the sites CLAUDE.md says have ALSO regressed are the lead Edit modal
 * (Status / Source / Owner) and the lead Detail hero/contact card. Here we
 * drive the real detail page and the real LeadEditModal with a mocked
 * `/crm/settings`, asserting the override is honoured at those render sites.
 *
 * Detail renders by distinctive text (hero: "Owner: …", "Source … Website";
 * contact card: the email value), so hiding a field removes that text. The
 * Edit modal renders status/source through a `data-field="<key>"` hook (added
 * so the assertion can't be confounded by the detail page sitting behind the
 * modal), scoped to the modal's role="dialog".
 */

const LEAD = {
  id: 'lead-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair',
  phone: '9876501234', email: 'priya@nairsteel.example.com', title: 'Procurement Head',
  company: 'Nair Steel Traders', is_b2c: false, status: 'working',
  owner_id: 'u-asha', owner_name: 'Asha Menon', source_name: 'Website',
  created_by: SEED_USER.id, created_at: '2026-09-20T10:00:00Z',
};

async function setup(page: Page, overrides: Record<string, unknown> = {}) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: { field_overrides: overrides } } },
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
      const ok = (data: unknown) => route.fulfill({ json: { success: true, data } }).then(() => true);
      if (method === 'GET' && path === '/api/v1/crm/leads/lead-1') return ok(LEAD);
      if (method === 'PATCH' && path === '/api/v1/crm/leads/lead-1') return ok(LEAD);
      if (method === 'GET' && path === '/api/v1/users') return ok([{ id: 'u-asha', name: 'Asha Menon' }]);
      return false; // other GETs fall through to mockApi's [] default
    },
  });
}

// The hero "Edit lead" action is always present for the lead's creator (our
// admin), whatever the field overrides — a stable readiness + modal opener.
const editBtn = (page: Page) => page.getByRole('button', { name: 'Edit lead' }).first();

const openDetail = async (page: Page) => {
  await page.goto('/dashboard/crm/leads/lead-1');
  await expect(editBtn(page)).toBeVisible({ timeout: 30_000 });
};

const openEditModal = async (page: Page) => {
  await openDetail(page);
  await editBtn(page).click();
  const dialog = page.getByRole('dialog', { name: 'Edit lead' });
  await expect(dialog).toBeVisible();
  return dialog;
};

test.describe('Field-override gate — lead Detail page', () => {
  // The hero gates owner/source through a data-field hook (source_name can be a
  // common word like "Website" that also appears elsewhere, so text matching is
  // ambiguous). Email is distinctive, so the contact card is asserted by value.
  const owner = (page: Page) => page.locator('[data-field="owner_id"]');
  const source = (page: Page) => page.locator('[data-field="source_id"]');

  test('control: owner, source and email render with no overrides', async ({ page }) => {
    await setup(page);
    await openDetail(page);
    await expect(owner(page)).toHaveCount(1);
    await expect(source(page)).toHaveCount(1);
    await expect(page.getByText(LEAD.email)).toBeVisible();
  });

  test('hiding owner_id removes the owner from the hero', async ({ page }) => {
    await setup(page, { 'lead.owner_id': { hidden: true } });
    await openDetail(page);
    await expect(owner(page)).toHaveCount(0);
    await expect(source(page)).toHaveCount(1); // sibling unaffected
  });

  test('hiding source_id removes the source from the hero', async ({ page }) => {
    await setup(page, { 'lead.source_id': { hidden: true } });
    await openDetail(page);
    await expect(source(page)).toHaveCount(0);
    await expect(owner(page)).toHaveCount(1);
  });

  test('hiding email removes it from the contact card', async ({ page }) => {
    await setup(page, { 'lead.email': { hidden: true } });
    await openDetail(page);
    await expect(page.getByText(LEAD.email)).toHaveCount(0);
    await expect(owner(page)).toHaveCount(1);
  });
});

test.describe('Field-override gate — lead Edit modal', () => {
  test('control: Status and Source render in the modal with no overrides', async ({ page }) => {
    await setup(page);
    const dialog = await openEditModal(page);
    await expect(dialog.locator('[data-field="status"]')).toHaveCount(1);
    await expect(dialog.locator('[data-field="source_id"]')).toHaveCount(1);
  });

  test('hiding status removes it from the edit modal (source stays)', async ({ page }) => {
    await setup(page, { 'lead.status': { hidden: true } });
    const dialog = await openEditModal(page);
    await expect(dialog.locator('[data-field="status"]')).toHaveCount(0);
    await expect(dialog.locator('[data-field="source_id"]')).toHaveCount(1);
  });

  test('hiding source_id removes it from the edit modal (status stays)', async ({ page }) => {
    await setup(page, { 'lead.source_id': { hidden: true } });
    const dialog = await openEditModal(page);
    await expect(dialog.locator('[data-field="source_id"]')).toHaveCount(0);
    await expect(dialog.locator('[data-field="status"]')).toHaveCount(1);
  });
});
