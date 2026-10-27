import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Field-override gate — deal + account Edit modals.
 *
 * Phase 0 increment #4, completing the gate across all four CRM entities
 * (lead + contact done in #594/#595/#596). Hiding a built-in deal/account
 * field in CRM Settings must remove it from DealEditModal / AccountEditModal.
 * data-field hooks on the gated rows; assertions scoped to each modal's
 * role="dialog" ("Edit Deal" / "Edit Account").
 */

const DEAL = {
  id: 'deal-1', name: 'Q4 TMT Supply', amount: 500000, stage_id: 's1', stage_name: 'Negotiation',
  pipeline_id: 'p1', probability: '60', status: 'open', created_by: SEED_USER.id,
};
const ACCOUNT = {
  id: 'account-1', name: 'Nair Steel Traders', website: 'nairsteel.example.com',
  phone: '9876500000', industry: 'Steel', created_by: SEED_USER.id,
};

function makeSetup(entity: 'deals' | 'accounts', row: Record<string, unknown>) {
  return async (page: Page, overrides: Record<string, unknown> = {}) => {
    await seedSession(page, SEED_USER);
    await mockApi(page, {
      settings: { success: true, data: { business_type: 'both', config: { field_overrides: overrides } } },
      me: { success: true, data: SEED_USER },
      onRequest: async (route, url, method) => {
        const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
        const ok = (data: unknown) => route.fulfill({ json: { success: true, data } }).then(() => true);
        if (method === 'GET' && path === `/api/v1/crm/${entity}/${row.id}`) return ok(row);
        if (method === 'PATCH' && path === `/api/v1/crm/${entity}/${row.id}`) return ok(row);
        return false; // sub-resources / pipelines / stages fall through to mockApi's [] default
      },
    });
  };
}

const openEdit = async (page: Page, path: string, dialogName: string) => {
  await page.goto(path);
  const edit = page.getByRole('button', { name: 'Edit', exact: true }).first();
  await expect(edit).toBeVisible({ timeout: 30_000 });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: dialogName });
  await expect(dialog).toBeVisible();
  return dialog;
};

test.describe('Field-override gate — deal Edit modal', () => {
  const setup = makeSetup('deals', DEAL);
  const open = (page: Page) => openEdit(page, '/dashboard/crm/deals/deal-1', 'Edit Deal');

  test('control: name, stage and probability render with no overrides', async ({ page }) => {
    await setup(page);
    const d = await open(page);
    await expect(d.locator('[data-field="name"]')).toHaveCount(1);
    await expect(d.locator('[data-field="stage_id"]')).toHaveCount(1);
    await expect(d.locator('[data-field="probability"]')).toHaveCount(1);
  });

  test('hiding name removes it (stage + probability stay)', async ({ page }) => {
    await setup(page, { 'deal.name': { hidden: true } });
    const d = await open(page);
    await expect(d.locator('[data-field="name"]')).toHaveCount(0);
    await expect(d.locator('[data-field="stage_id"]')).toHaveCount(1);
    await expect(d.locator('[data-field="probability"]')).toHaveCount(1);
  });

  test('hiding stage_id removes it (name stays)', async ({ page }) => {
    await setup(page, { 'deal.stage_id': { hidden: true } });
    const d = await open(page);
    await expect(d.locator('[data-field="stage_id"]')).toHaveCount(0);
    await expect(d.locator('[data-field="name"]')).toHaveCount(1);
  });

  test('hiding probability removes it (name stays)', async ({ page }) => {
    await setup(page, { 'deal.probability': { hidden: true } });
    const d = await open(page);
    await expect(d.locator('[data-field="probability"]')).toHaveCount(0);
    await expect(d.locator('[data-field="name"]')).toHaveCount(1);
  });
});

test.describe('Field-override gate — account Edit modal', () => {
  const setup = makeSetup('accounts', ACCOUNT);
  const open = (page: Page) => openEdit(page, '/dashboard/crm/accounts/account-1', 'Edit Account');

  test('control: name, website and phone render with no overrides', async ({ page }) => {
    await setup(page);
    const d = await open(page);
    await expect(d.locator('[data-field="name"]')).toHaveCount(1);
    await expect(d.locator('[data-field="website"]')).toHaveCount(1);
    await expect(d.locator('[data-field="phone"]')).toHaveCount(1);
  });

  test('hiding website removes it (name + phone stay)', async ({ page }) => {
    await setup(page, { 'account.website': { hidden: true } });
    const d = await open(page);
    await expect(d.locator('[data-field="website"]')).toHaveCount(0);
    await expect(d.locator('[data-field="name"]')).toHaveCount(1);
    await expect(d.locator('[data-field="phone"]')).toHaveCount(1);
  });

  test('hiding phone removes it (name stays)', async ({ page }) => {
    await setup(page, { 'account.phone': { hidden: true } });
    const d = await open(page);
    await expect(d.locator('[data-field="phone"]')).toHaveCount(0);
    await expect(d.locator('[data-field="name"]')).toHaveCount(1);
  });
});
