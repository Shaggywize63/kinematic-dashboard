import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, fail, ok, PRODUCTS, scopeToSpark, USERS } from './spark';

/**
 * Spark & Ray activities: Assign to (multiple) with a Primary chip, Product interested from the catalogue and
 * a Form serial. The create body carries assignee_ids / product_ids / form_serial; an unknown serial comes
 * back as a 400 and is shown next to the field. A non-Spark tenant keeps the single "Assign To" picker and
 * its payload is unchanged.
 */

type Call = { method: string; body: Record<string, any> };

async function setup(page: Page, calls: Call[], opts: { serialRejected?: string[]; list?: unknown[] } = {}) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/users') return ok(route, USERS);
      if (method === 'GET' && p === '/api/v1/crm/products') return ok(route, PRODUCTS);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1') return ok(route, { id: 'acc-1', name: 'Acme Forge' });
      if (method === 'GET' && p === '/api/v1/crm/activities' && opts.list) {
        return route.fulfill({ json: { success: true, data: opts.list, pagination: { total: opts.list.length, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false } } }).then(() => true);
      }
      if ((method === 'POST' && p === '/api/v1/crm/activities') || (method === 'PATCH' && /^\/api\/v1\/crm\/activities\/[^/]+$/.test(p))) {
        const body = route.request().postDataJSON() as Record<string, any>;
        calls.push({ method, body });
        if (body.form_serial && (opts.serialRejected ?? []).includes(body.form_serial)) {
          return fail(route, 400, `Form serial ${body.form_serial} was not found`);
        }
        return ok(route, { id: 'act-new', ...body, form_ref_no: body.form_serial || null }, method === 'POST' ? 201 : 200);
      }
      return false;
    },
  });
}

test.describe('Spark activities/new', () => {
  test('sends assignee_ids, product_ids and form_serial; a bad serial shows a 400 inline', async ({ page }) => {
    const calls: Call[] = [];
    await scopeToSpark(page);
    await setup(page, calls, { serialRejected: ['SRPR2627-99'] });
    await page.goto('/dashboard/crm/activities/new?account_id=acc-1&account_name=Acme%20Forge');

    await expect(page.getByRole('heading', { name: 'Log Activity' })).toBeVisible({ timeout: 30_000 });
    // Pre-filled with the account from the query string.
    await expect(page.getByPlaceholder(/Type to search accounts/)).toHaveValue(/Acme Forge/);

    // Assignees: the signed-in user is the default Primary; add two more.
    const picker = page.getByTestId('assignee-picker');
    await expect(picker.getByTestId('assignee-chip')).toHaveCount(1);
    await expect(picker.getByTestId('assignee-chip').first()).toContainText('Primary');
    for (const name of ['Asha Rao', 'Ravi Kumar']) {
      await picker.getByPlaceholder(/team member/).click();
      await page.getByText(name, { exact: true }).click();
    }
    await expect(picker.getByTestId('assignee-chip')).toHaveCount(3);
    // Promote Ravi to primary: he moves to the front.
    await picker.getByTestId('assignee-chip').nth(2).getByRole('button', { name: 'Make primary' }).click();
    await expect(picker.getByTestId('assignee-chip').first()).toContainText('Ravi Kumar');
    await expect(picker.getByTestId('assignee-chip').first()).toContainText('Primary');

    // Products: two from the catalogue, then remove one.
    const products = page.getByTestId('product-picker');
    await products.getByLabel('Add product').selectOption({ label: 'Spark Plug SP-100' });
    await products.getByLabel('Add product').selectOption({ label: 'Glow Plug GP-7' });
    await expect(products.getByTestId('product-chip')).toHaveCount(2);
    await products.getByRole('button', { name: 'Remove Glow Plug GP-7' }).click();
    await expect(products.getByTestId('product-chip')).toHaveCount(1);

    // Serial is upper-cased as typed; an unknown one is rejected by the server.
    const serial = page.getByRole('textbox', { name: 'Form serial' });
    await serial.fill('srpr2627-99');
    await expect(serial).toHaveValue('SRPR2627-99');
    await page.getByRole('button', { name: 'Log Activity' }).click();

    await expect(page.getByTestId('form-serial-error')).toHaveText('Form serial SRPR2627-99 was not found');
    await expect(page).toHaveURL(/\/activities\/new/);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({
      account_id: 'acc-1',
      assigned_to: 'u-ravi',
      assignee_ids: ['u-ravi', SEED_USER.id, 'u-asha'],
      product_ids: ['p-1'],
      form_serial: 'SRPR2627-99',
    });

    // Fix the serial and save: no error, back on the list.
    await serial.fill('srpr2627-12');
    await expect(page.getByTestId('form-serial-error')).toHaveCount(0);
    await page.getByRole('button', { name: 'Log Activity' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });
    expect(calls).toHaveLength(2);
    expect(calls[1].body.form_serial).toBe('SRPR2627-12');
  });

  test('a non-Spark tenant keeps the single Assign To picker and an unchanged payload', async ({ page }) => {
    const calls: Call[] = [];
    await setup(page, calls);
    await page.goto('/dashboard/crm/activities/new');
    await expect(page.getByRole('heading', { name: 'Log Activity' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Assign To', { exact: true })).toBeVisible();
    await expect(page.getByText('Assign to (multiple)')).toHaveCount(0);
    await expect(page.getByText('Product interested')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Form serial' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Log Activity' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0].body)).not.toContain('assignee_ids');
    expect(Object.keys(calls[0].body)).not.toContain('product_ids');
    expect(Object.keys(calls[0].body)).not.toContain('form_serial');
    expect(calls[0].body.assigned_to).toBe(SEED_USER.id);
  });
});

test.describe('Spark activities list', () => {
  const ROW = {
    id: 'act-1', org_id: 'e2e-org-1', type: 'meeting', subject: 'Plant visit', status: 'open', created_at: '2026-10-01T05:00:00Z', updated_at: '2026-10-01T05:00:00Z',
    assigned_to: 'u-asha', assignees: [{ id: 'u-asha', name: 'Asha Rao' }, { id: 'u-ravi', name: 'Ravi Kumar' }],
    product_ids: ['p-2'], products: [{ id: 'p-2', name: 'Ignition Coil IC-20' }], form_ref_no: 'SRPR2627-12', form_submission_id: 'fs-1',
  };

  test('cards show assignee / product / form chips and the edit modal patches them', async ({ page }) => {
    const calls: Call[] = [];
    await scopeToSpark(page);
    await setup(page, calls, { list: [ROW] });
    await page.goto('/dashboard/crm/activities');

    const meta = page.getByTestId('spark-activity-meta');
    await expect(meta).toBeVisible({ timeout: 30_000 });
    await expect(meta).toContainText('Asha Rao · primary');
    await expect(meta).toContainText('Ravi Kumar');
    await expect(meta).toContainText('Ignition Coil IC-20');
    await expect(meta).toContainText('SRPR2627-12');

    await page.getByRole('button', { name: /Edit/ }).first().click();
    const modal = page.getByRole('group', { name: 'Assign to (multiple)' });
    await expect(modal.getByTestId('assignee-chip')).toHaveCount(2);
    await modal.getByRole('button', { name: 'Remove Ravi Kumar' }).click();
    await page.getByRole('textbox', { name: 'Form serial' }).fill('srpr2627-13');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].body).toMatchObject({ assignee_ids: ['u-asha'], product_ids: ['p-2'], form_serial: 'SRPR2627-13' });
  });

  test('a non-Spark list row has no spark chips', async ({ page }) => {
    await setup(page, [], { list: [{ ...ROW, assignees: undefined, products: undefined, form_ref_no: undefined }] });
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByText('Plant visit')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('spark-activity-meta')).toHaveCount(0);
  });
});
