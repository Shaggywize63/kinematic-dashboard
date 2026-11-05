import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, fail, ok, scopeToSpark } from './spark';

/**
 * Spark & Ray: Convert on a lead opens OUR deal form (deals/new in conversion mode), prefilled from the lead, and the
 * create POST carries lead_id + convert_lead:true. A non-Spark tenant keeps the old convert modal.
 */

const LEAD = {
  id: 'lead-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair', phone: '9876501234', email: 'priya@nair.example',
  company: 'Nair Forge', is_b2c: false, status: 'working', owner_id: 'u-asha', owner_name: 'Asha Menon',
  created_by: SEED_USER.id, created_at: '2026-09-20T10:00:00Z',
};
const PIPELINES = [{ id: 'pl-1', name: 'Standard', is_default: true, stages: [{ id: 'st-1', name: 'New' }] }];
const ACCOUNTS = [{ id: 'acc-9', name: 'Nair Forge Pvt Ltd' }];

async function setup(page: Page, o: { lead?: Record<string, unknown>; posted?: Record<string, any>[]; failPost?: string } = {}) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      const lead = { ...LEAD, ...(o.lead ?? {}) };
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1') return ok(route, lead);
      if (method === 'GET' && /^\/api\/v1\/crm\/leads\/lead-1\/(activities|deals|contacts|updates)$/.test(p)) return ok(route, []);
      if (method === 'GET' && p === '/api/v1/crm/pipelines') return ok(route, PIPELINES);
      if (method === 'GET' && p === '/api/v1/crm/products') return ok(route, []);
      if (method === 'GET' && p === '/api/v1/crm/accounts') return ok(route, ACCOUNTS);
      if (method === 'POST' && p === '/api/v1/crm/deals') {
        o.posted?.push(route.request().postDataJSON());
        if (o.failPost) return fail(route, 400, o.failPost);
        return ok(route, { id: 'deal-1', name: 'Created', status: 'open' }, 201);
      }
      if (method === 'GET' && p === '/api/v1/crm/deals/deal-1') return ok(route, { id: 'deal-1', name: 'Created', status: 'open', pipeline_id: 'pl-1', stage_id: 'st-1' });
      return false;
    },
  });
}

test.describe('Spark lead -> deal conversion', () => {
  test('Convert opens the deal form prefilled from the lead and POSTs lead_id + convert_lead', async ({ page }) => {
    const posted: Record<string, any>[] = [];
    await scopeToSpark(page);
    await setup(page, { posted });
    await page.goto('/dashboard/crm/leads/lead-1');

    await page.getByRole('button', { name: 'Convert', exact: true }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/deals\/new\?lead_id=lead-1&convert=1/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Convert Lead to Deal' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('convert-banner')).toContainText('Converting');
    await expect(page.getByTestId('convert-banner')).toContainText('Priya Nair');
    await expect(page.getByTestId('convert-banner')).toContainText('create/link the customer account');
    // The old convert modal is not used; the deal form has Spark's sections.
    await expect(page.getByText('Create account')).toHaveCount(0);
    await expect(page.getByLabel('Quotation number')).toBeVisible();
    // Name defaults to "company — contact" and stays editable.
    const name = page.getByLabel('Name', { exact: true });
    await expect(name).toHaveValue('Nair Forge — Priya Nair');
    await name.fill('Nair Forge — Q4 plugs');

    await page.getByRole('button', { name: 'Convert & create deal' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/deals\/deal-1/, { timeout: 20_000 });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ lead_id: 'lead-1', convert_lead: true, name: 'Nair Forge — Q4 plugs' });
    // The server makes the account; none is sent for an unconverted lead.
    expect(posted[0].account_id).toBeUndefined();
  });

  test('the leads-list "-> Deal" link (?convert=1) lands on the deal form, not the modal', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page);
    await page.goto('/dashboard/crm/leads/lead-1?convert=1');
    await expect(page).toHaveURL(/\/dashboard\/crm\/deals\/new\?lead_id=lead-1&convert=1/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Convert Lead to Deal' })).toBeVisible({ timeout: 30_000 });
  });

  test('an already-converted lead reuses its account and does not send convert_lead', async ({ page }) => {
    const posted: Record<string, any>[] = [];
    await scopeToSpark(page);
    await setup(page, { posted, lead: { status: 'converted', converted_at: '2026-10-01T10:00:00Z', converted_account_id: 'acc-9' } });
    await page.goto('/dashboard/crm/deals/new?lead_id=lead-1&convert=1');
    await expect(page.getByTestId('convert-banner')).toContainText('existing customer account', { timeout: 30_000 });
    await expect(page.getByLabel('Customer', { exact: true })).toHaveValue('Nair Forge Pvt Ltd');
    await page.getByRole('button', { name: 'Convert & create deal' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/deals\/deal-1/, { timeout: 20_000 });
    expect(posted[0]).toMatchObject({ lead_id: 'lead-1', account_id: 'acc-9' });
    expect(posted[0].convert_lead).toBeUndefined();
  });

  test('a server error shows inline and keeps the form open', async ({ page }) => {
    const posted: Record<string, any>[] = [];
    await scopeToSpark(page);
    await setup(page, { posted, failPost: 'Lead is not convertible' });
    await page.goto('/dashboard/crm/deals/new?lead_id=lead-1&convert=1');
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Nair Forge — Priya Nair', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Convert & create deal' }).click();
    await expect(page.getByTestId('deal-submit-error')).toContainText('Lead is not convertible');
    await expect(page).toHaveURL(/\/deals\/new/);
    await expect(page.getByRole('button', { name: 'Convert & create deal' })).toBeEnabled();
    expect(posted).toHaveLength(1);
  });

  test('non-Spark keeps the old convert modal and never redirects', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads/lead-1?convert=1');
    await expect(page.getByRole('heading', { name: /Convert/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard\/crm\/leads\/lead-1/);
    await expect(page.getByRole('button', { name: 'Convert & create deal' })).toHaveCount(0);
  });
});
