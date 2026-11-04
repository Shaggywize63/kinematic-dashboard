import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, PRODUCTS, scopeToSpark } from './spark';
import { buildDealItems, grandTotal, lineTotal, type DealLineDraft } from '../src/lib/sparkAccounts';

/**
 * Spark & Ray deals/new: Customer (account) select (prefilled from ?account_id=), Quotation number and a
 * product-lines editor. The create body carries account_id, quotation_no and items; the amount is left to the
 * server. A non-Spark tenant sees none of these and keeps its form. Also: "New deal" on the lead detail.
 */

const ACCOUNTS = [{ id: 'acc-1', name: 'Acme Forge' }, { id: 'acc-2', name: 'Beta Castings' }];
const PIPELINES = [{ id: 'pl-1', name: 'Standard', is_default: true, stages: [{ id: 'st-1', name: 'New' }, { id: 'st-2', name: 'Quotation sent' }] }];

async function setup(page: Page, posted: Record<string, any>[]) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/pipelines') return ok(route, PIPELINES);
      if (method === 'GET' && p === '/api/v1/crm/products') return ok(route, PRODUCTS);
      if (method === 'GET' && p === '/api/v1/crm/accounts') return ok(route, ACCOUNTS);
      if (method === 'POST' && p === '/api/v1/crm/deals') {
        posted.push(route.request().postDataJSON());
        return ok(route, { id: 'deal-1', name: 'Created', status: 'open' }, 201);
      }
      if (method === 'GET' && p === '/api/v1/crm/deals/deal-1') return ok(route, { id: 'deal-1', name: 'Created', status: 'open', pipeline_id: 'pl-1', stage_id: 'st-1', quotation_no: 'QT-2026-014' });
      return false;
    },
  });
}

test.describe('Spark deals/new', () => {
  test('sends account_id, quotation_no and items; totals are live', async ({ page }) => {
    const posted: Record<string, any>[] = [];
    await scopeToSpark(page);
    await setup(page, posted);
    await page.goto('/dashboard/crm/deals/new?account_id=acc-1');

    await expect(page.getByRole('heading', { name: 'New Deal' })).toBeVisible({ timeout: 30_000 });
    // Customer is pre-filled from the query string and is a searchable select.
    const customer = page.getByRole('combobox', { name: 'Customer' }).or(page.getByLabel('Customer', { exact: true }));
    await expect(customer).toHaveValue('Acme Forge');
    await customer.click();
    await customer.fill('beta');
    const options = page.getByRole('listbox').getByRole('option');
    await expect(options).toHaveText(['Beta Castings']);
    await customer.fill('acme');
    await expect(options).toHaveText(['Acme Forge']);
    await options.first().dispatchEvent('mousedown');
    await expect(customer).toHaveValue('Acme Forge');

    await page.getByLabel('Quotation number').fill('QT-2026-014');
    await page.getByLabel('Name', { exact: true }).fill('Plugs for Q3');

    // Line 1: catalogue product prefills name + price; quantity is editable.
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.getByLabel('Line 1 product').selectOption({ label: 'Spark Plug SP-100' });
    await expect(page.getByLabel('Line 1 name')).toHaveValue('Spark Plug SP-100');
    await expect(page.getByLabel('Line 1 unit price')).toHaveValue('1200');
    await page.getByLabel('Line 1 quantity').fill('3');
    // Line 2: a custom item.
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.getByLabel('Line 2 name').fill('Freight');
    await page.getByLabel('Line 2 quantity').fill('1');
    await page.getByLabel('Line 2 unit price').fill('500');
    // Line 3 is half-typed and must be dropped.
    await page.getByRole('button', { name: 'Add line' }).click();

    await expect(page.getByTestId('deal-item-total').nth(0)).toContainText('3,600');
    await expect(page.getByTestId('deal-items-grand-total')).toContainText('4,100');
    await expect(page.getByLabel('Amount (from product lines)')).toHaveValue('4100');

    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/deals\/deal-1/, { timeout: 20_000 });

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      account_id: 'acc-1',
      quotation_no: 'QT-2026-014',
      items: [
        { product_id: 'p-1', name: 'Spark Plug SP-100', quantity: 3, unit_price: 1200 },
        { name: 'Freight', quantity: 1, unit_price: 500 },
      ],
    });
    expect(posted[0].items).toHaveLength(2);
    expect('amount' in posted[0]).toBe(false); // computed server-side from the lines

    // The new deal's detail shows the quotation number.
    await expect(page.getByText('Quotation no.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('QT-2026-014')).toBeVisible();
  });

  test('a non-Spark tenant sees no customer / quotation / lines and posts no Spark fields', async ({ page }) => {
    const posted: Record<string, any>[] = [];
    await setup(page, posted);
    await page.goto('/dashboard/crm/deals/new');
    await expect(page.getByRole('heading', { name: 'New Deal' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Quotation number')).toHaveCount(0);
    await expect(page.getByLabel('Customer', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('deal-items')).toHaveCount(0);
    await expect(page.getByText('Product (optional)')).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('Plain deal');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect.poll(() => posted.length).toBe(1);
    for (const k of ['quotation_no', 'items']) expect(Object.keys(posted[0])).not.toContain(k);
  });
});

test.describe('Spark lead detail: New deal', () => {
  const LEAD = { id: 'lead-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair', company: 'Acme Forge', is_b2c: false, status: 'converted', converted_at: '2026-10-01T00:00:00Z', converted_account_id: 'acc-1', created_by: SEED_USER.id, created_at: '2026-09-20T10:00:00Z' };
  const DEAL = { id: 'd1', org_id: 'o', name: 'Plugs Q3', pipeline_id: 'p', stage_id: 's', stage_name: 'Quotation sent', amount: 4100, status: 'open', quotation_no: 'QT-2026-014', created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' };

  async function leadSetup(page: Page) {
    await seedSession(page, SEED_USER);
    await mockApi(page, {
      onRequest: async (route, url, method) => {
        const p = apiPath(url);
        if (method === 'GET' && p === '/api/v1/crm/leads/lead-1') return ok(route, LEAD);
        if (method === 'GET' && p === '/api/v1/crm/leads/lead-1/deals') return ok(route, [DEAL]);
        return false;
      },
    });
  }

  test('Spark: New deal carries lead_id and the converted account; the quotation is listed', async ({ page }) => {
    await scopeToSpark(page);
    await leadSetup(page);
    await page.goto('/dashboard/crm/leads/lead-1#deals');
    const link = page.getByRole('link', { name: 'New deal' });
    await expect(link).toHaveAttribute('href', '/dashboard/crm/deals/new?lead_id=lead-1&account_id=acc-1', { timeout: 30_000 });
    await expect(page.getByTestId('deal-quotation-no')).toHaveText('Quotation QT-2026-014');
  });

  test('non-Spark: no New deal link', async ({ page }) => {
    await leadSetup(page);
    await page.goto('/dashboard/crm/leads/lead-1#deals');
    await expect(page.getByText('Plugs Q3')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'New deal' })).toHaveCount(0);
  });
});

test.describe('deal line helpers', () => {
  const line = (o: Partial<DealLineDraft>): DealLineDraft => ({ key: 'k', product_id: '', name: '', quantity: '1', unit_price: '', ...o });
  test('totals round to paise and ignore junk', () => {
    expect(lineTotal(line({ quantity: '3', unit_price: '1200' }))).toBe(3600);
    expect(lineTotal(line({ quantity: 'x', unit_price: '5' }))).toBe(0);
    expect(grandTotal([line({ quantity: '3', unit_price: '1200' }), line({ quantity: '0.5', unit_price: '0.07' })])).toBe(3600.04);
    expect(grandTotal(undefined as unknown as DealLineDraft[])).toBe(0);
  });
  test('buildDealItems keeps only named, positive-quantity, non-negative-price rows', () => {
    const items = buildDealItems([
      line({ name: ' A ', quantity: '2', unit_price: '10', product_id: 'p' }),
      line({ name: '', quantity: '1', unit_price: '5' }),
      line({ name: 'B', quantity: '0', unit_price: '5' }),
      line({ name: 'C', quantity: '1', unit_price: '-1' }),
      line({ name: 'Free', quantity: '1', unit_price: '0' }),
    ]);
    expect(items).toEqual([{ product_id: 'p', name: 'A', quantity: 2, unit_price: 10 }, { name: 'Free', quantity: 1, unit_price: 0 }]);
    expect(buildDealItems(null as unknown as DealLineDraft[])).toEqual([]);
  });
});
