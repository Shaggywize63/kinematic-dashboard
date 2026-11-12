import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark } from './spark';
import {
  buildDealItems, dealLineErrors, dealRollup, hasAnyOrderValue, isMacBrand, lineDraftFromItem, macFunnelError, orderedTotal, orderValueOf,
  type DealLineDraft,
} from '../src/lib/sparkAccounts';

/**
 * Connected-B2B (Spark & Ray): deals carry product lines with a Make, a Brand (not the same thing), the product
 * reference (sku), a quoted value, an ORDER value and a typed MAC funnel reference (required for brand MAC).
 * Covers the line editor (selects, product prefill, MAC rule, totals, narrow layout), what deals/new and the edit
 * modal send, the deal detail Products table, the Won step that confirms ordered values, the lead Deals card and
 * the account Deals card, and that every other tenant is unchanged and makes no makes / brands calls.
 */

const nl = (id: string, name: string) => ({ id, name, description: null, is_active: true, sort_order: 0 });
const MAKES = [nl('m-festo', 'Festo'), nl('m-piab', 'Piab')];
const BRANDS = [nl('b-mac', 'MAC'), nl('b-phd', 'PHD'), nl('b-lower', 'mac ')];
const PRODUCTS = [
  { id: 'p-1', sku: '13280', name: 'Pneumatic cylinder 32mm', price: 4250, currency: 'INR', is_active: true, make_id: 'm-festo', brand_id: 'b-mac', make_name: 'Festo', brand_name: 'MAC' },
  { id: 'p-2', sku: '20415', name: 'Vacuum cup 40mm', price: 1180, currency: 'INR', is_active: true, make_id: 'm-piab', brand_id: null, make_name: 'Piab', brand_name: null },
  { id: 'p-3', sku: '30001', name: 'Rotary actuator', price: 9900, currency: 'INR', is_active: true, make_id: null, brand_id: 'b-phd', make_name: null, brand_name: 'PHD' },
  { id: 'p-4', sku: '', name: 'Loose fitting', price: 100, currency: 'INR', is_active: true, make_id: null, brand_id: null, make_name: null, brand_name: null },
];
const ACCOUNTS = [{ id: 'acc-1', name: 'Acme Forge' }];
const PIPELINES = [{ id: 'pl-1', name: 'Standard', is_default: true, stages: [{ id: 'st-1', name: 'New' }] }];

const L1 = {
  id: 'li-1', deal_id: 'deal-1', product_id: 'p-1', name: 'Pneumatic cylinder 32mm', sku: '13280', reference: '13280', quantity: 2, unit_price: 4250, line_total: 8500,
  make_id: 'm-festo', make_name: 'Festo', brand_id: 'b-mac', brand_name: 'MAC', funnel_ref: 'MAC-FN-2291', order_value: 8000,
};
const L2 = {
  id: 'li-2', deal_id: 'deal-1', product_id: null, name: 'Freight', sku: null, reference: null, quantity: 1, unit_price: 500, line_total: 500,
  make_id: null, make_name: null, brand_id: null, brand_name: null, funnel_ref: null, order_value: null,
};
const DEAL = {
  id: 'deal-1', org_id: 'e2e-org-1', name: 'Plugs for Q3', pipeline_id: 'pl-1', stage_id: 'st-1', stage_name: 'New', status: 'open', amount: 9000,
  line_count: 2, quoted_amount: 9000, order_amount: 8000, brands: ['MAC'], created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
};
const LEAD = { id: 'lead-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair', company: 'Acme Forge', is_b2c: false, status: 'converted', converted_at: '2026-10-01T00:00:00Z', converted_account_id: 'acc-1', created_by: SEED_USER.id, created_at: '2026-09-20T10:00:00Z' };
const mkDeal = (id: string, name: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id, org_id: 'o', name, pipeline_id: 'p', stage_id: 's', stage_name: 'Quotation sent', amount, quoted_amount: amount, order_amount: null, brands: [], line_count: 1, status: 'open',
  created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', ...extra,
});
const LEAD_DEALS = [
  mkDeal('d1', 'Plugs Q3', 4100, { brands: ['MAC', 'PHD'], line_count: 2 }),
  mkDeal('d2', 'Valves', 12000, { status: 'won', stage_name: 'Closed won', order_amount: 11000, brands: ['PIAB'] }),
  mkDeal('d3', 'Spares', 500, { line_count: 0 }),
];

interface Write { method: string; path: string; body: any }
interface Calls {
  writes: Write[];
  deals: Record<string, any>[];
  makesGets: number; brandsGets: number; lineGets: number;
}
interface Opts {
  spark?: boolean;
  lines?: any[];
  leadDeals?: any[];
  lineWriteError?: { method: string; status: number; message: string };
  dealPostError?: { status: number; message: string };
}

async function setup(page: Page, o: Opts = {}): Promise<Calls> {
  const calls: Calls = { writes: [], deals: [], makesGets: 0, brandsGets: 0, lineGets: 0 };
  const store: any[] = (o.lines ?? [L1, L2]).map((x) => ({ ...x }));
  let seq = 0;
  if (o.spark !== false) await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      let body: any = null;
      if (method !== 'GET') { try { body = route.request().postDataJSON(); } catch { /* none */ } }
      if (method === 'GET' && p === '/api/v1/crm/makes') { calls.makesGets++; return ok(route, MAKES); }
      if (method === 'GET' && p === '/api/v1/crm/brands') { calls.brandsGets++; return ok(route, BRANDS); }
      if (method === 'GET' && p === '/api/v1/crm/products') return ok(route, PRODUCTS);
      if (method === 'GET' && p === '/api/v1/crm/pipelines') return ok(route, PIPELINES);
      if (method === 'GET' && p === '/api/v1/crm/accounts') return ok(route, ACCOUNTS);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1') return ok(route, ACCOUNTS[0]);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1/deals') return ok(route, o.leadDeals ?? LEAD_DEALS);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1') return ok(route, LEAD);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1/deals') return ok(route, o.leadDeals ?? LEAD_DEALS);
      if (method === 'POST' && p === '/api/v1/crm/deals') {
        calls.deals.push(body);
        if (o.dealPostError) { await route.fulfill({ status: o.dealPostError.status, json: { success: false, error: o.dealPostError.message, message: o.dealPostError.message } }); return true; }
        return ok(route, { id: 'deal-1', name: 'Created', status: 'open' }, 201);
      }
      if (method === 'GET' && p === '/api/v1/crm/deals/deal-1') return ok(route, DEAL);
      if (method === 'GET' && p === '/api/v1/crm/deals/deal-1/line-items') { calls.lineGets++; return ok(route, store.map((x) => ({ ...x }))); }
      if (p.startsWith('/api/v1/crm/line-items/') || p === '/api/v1/crm/deals/deal-1/line-items' || p === '/api/v1/crm/deals/deal-1' || p === '/api/v1/crm/deals/deal-1/win' || p === '/api/v1/crm/deals/deal-1/lose') {
        if (method !== 'GET') {
          calls.writes.push({ method, path: p, body });
          const err = o.lineWriteError;
          if (err && err.method === method && p.includes('line-items')) {
            await route.fulfill({ status: err.status, json: { success: false, error: err.message, message: err.message } });
            return true;
          }
          const lid = p.split('/').pop() as string;
          if (p.startsWith('/api/v1/crm/line-items/')) {
            const i = store.findIndex((x) => x.id === lid);
            if (method === 'DELETE') { if (i >= 0) store.splice(i, 1); await route.fulfill({ status: 204 }); return true; }
            if (i >= 0) Object.assign(store[i], body);
            return ok(route, store[i] ?? {});
          }
          if (p === '/api/v1/crm/deals/deal-1/line-items') {
            const row = { id: `li-new-${++seq}`, deal_id: 'deal-1', line_total: (body.quantity ?? 1) * (body.unit_price ?? 0), ...body };
            store.push(row);
            return ok(route, row, 201);
          }
          if (p.endsWith('/win')) return ok(route, { ...DEAL, status: 'won' });
          if (p.endsWith('/lose')) return ok(route, { ...DEAL, status: 'lost' });
          return ok(route, { ...DEAL, ...body });
        }
      }
      return false;
    },
  });
  return calls;
}

const openNew = async (page: Page, qs = '') => {
  await page.goto(`/dashboard/crm/deals/new${qs}`);
  await expect(page.getByRole('heading', { name: 'New Deal' })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
};
const addLine = async (page: Page) => { await page.getByRole('button', { name: 'Add line' }).click(); };
const optionTexts = (page: Page, label: string) => page.getByLabel(label).locator('option').allTextContents();
const create = (page: Page) => page.getByRole('button', { name: 'Create', exact: true });

test.describe('deal line editor: make, brand and product prefill', () => {
  test('loads the makes and brands once, lists them with None, and shows "reference · name" on products', async ({ page }) => {
    const calls = await setup(page);
    await openNew(page);
    await addLine(page);
    expect(await optionTexts(page, 'Line 1 make')).toEqual(['None', 'Festo', 'Piab']);
    expect(await optionTexts(page, 'Line 1 brand')).toEqual(['None', 'MAC', 'PHD', 'mac ']);
    expect(await optionTexts(page, 'Line 1 product')).toEqual([
      'Custom item', '13280 · Pneumatic cylinder 32mm', '20415 · Vacuum cup 40mm', '30001 · Rotary actuator', 'Loose fitting',
    ]);
    // A second row reuses the lists: still one call each.
    await addLine(page);
    expect(await optionTexts(page, 'Line 2 make')).toEqual(['None', 'Festo', 'Piab']);
    expect(calls.makesGets).toBe(1);
    expect(calls.brandsGets).toBe(1);
  });

  test('picking a product pre-fills make and brand; both stay editable and None is allowed', async ({ page }) => {
    await setup(page);
    await openNew(page);
    await addLine(page);
    await page.getByLabel('Line 1 product').selectOption('p-1');
    await expect(page.getByLabel('Line 1 name')).toHaveValue('Pneumatic cylinder 32mm');
    await expect(page.getByLabel('Line 1 unit price')).toHaveValue('4250');
    await expect(page.getByLabel('Line 1 make')).toHaveValue('m-festo');
    await expect(page.getByLabel('Line 1 brand')).toHaveValue('b-mac');
    // Editable.
    await page.getByLabel('Line 1 make').selectOption('m-piab');
    await page.getByLabel('Line 1 brand').selectOption('b-phd');
    await expect(page.getByLabel('Line 1 make')).toHaveValue('m-piab');
    await expect(page.getByLabel('Line 1 brand')).toHaveValue('b-phd');
    // None is allowed.
    await page.getByLabel('Line 1 make').selectOption('');
    await page.getByLabel('Line 1 brand').selectOption('');
    await expect(page.getByLabel('Line 1 make')).toHaveValue('');
    await expect(page.getByLabel('Line 1 brand')).toHaveValue('');
    // A product with only a make fills the make and leaves the brand alone; one with neither changes neither.
    await page.getByLabel('Line 1 product').selectOption('p-2');
    await expect(page.getByLabel('Line 1 make')).toHaveValue('m-piab');
    await expect(page.getByLabel('Line 1 brand')).toHaveValue('');
    await page.getByLabel('Line 1 product').selectOption('p-3');
    await expect(page.getByLabel('Line 1 brand')).toHaveValue('b-phd');
    await expect(page.getByLabel('Line 1 make')).toHaveValue('m-piab');
    await page.getByLabel('Line 1 product').selectOption('p-4');
    await expect(page.getByLabel('Line 1 make')).toHaveValue('m-piab');
    await expect(page.getByLabel('Line 1 brand')).toHaveValue('b-phd');
    // Back to a custom item: the typed name stays.
    await page.getByLabel('Line 1 product').selectOption('');
    await expect(page.getByLabel('Line 1 name')).toHaveValue('Loose fitting');
  });
});

test.describe('MAC funnel reference rule', () => {
  const ERR = 'MAC funnel reference is required for MAC products';

  test('MAC shows the required marker and inline error, blocks save until typed; the payload carries it', async ({ page }) => {
    const calls = await setup(page);
    await openNew(page);
    await page.getByLabel('Name', { exact: true }).fill('Cylinders');
    await addLine(page);
    // Optional while no MAC brand: no marker, no error.
    await expect(page.getByTestId('funnel-required')).toHaveCount(0);
    await expect(page.getByTestId('deal-item-error')).toHaveCount(0);
    await page.getByLabel('Line 1 product').selectOption('p-1'); // brand MAC
    await expect(page.getByTestId('funnel-required')).toBeVisible();
    await expect(page.getByLabel('Line 1 funnel reference')).toHaveAttribute('aria-required', 'true');
    await expect(page.getByTestId('deal-item-error')).toHaveText(ERR);
    // Whitespace does not count.
    await page.getByLabel('Line 1 funnel reference').fill('   ');
    await expect(page.getByTestId('deal-item-error')).toHaveText(ERR);

    await create(page).click();
    await expect(page.getByText(ERR).first()).toBeVisible();
    await page.waitForTimeout(300);
    expect(calls.deals).toHaveLength(0); // blocked, nothing sent
    await expect(page).toHaveURL(/\/deals\/new/);

    await page.getByLabel('Line 1 funnel reference').fill('  MAC-FN-2291 ');
    await expect(page.getByTestId('deal-item-error')).toHaveCount(0);
    await expect(page.getByTestId('funnel-required')).toBeVisible(); // still required, just satisfied
    await create(page).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/deals\/deal-1/, { timeout: 20_000 });
    expect(calls.deals).toHaveLength(1);
    expect(calls.deals[0].items).toEqual([
      { product_id: 'p-1', name: 'Pneumatic cylinder 32mm', quantity: 1, unit_price: 4250, make_id: 'm-festo', brand_id: 'b-mac', funnel_ref: 'MAC-FN-2291' },
    ]);
  });

  test('a non-MAC brand keeps the funnel reference optional and saves without it', async ({ page }) => {
    const calls = await setup(page);
    await openNew(page);
    await page.getByLabel('Name', { exact: true }).fill('Actuators');
    await addLine(page);
    await page.getByLabel('Line 1 product').selectOption('p-3'); // PHD
    await expect(page.getByTestId('funnel-required')).toHaveCount(0);
    await expect(page.getByTestId('deal-item-error')).toHaveCount(0);
    await expect(page.getByLabel('Line 1 funnel reference')).toHaveAttribute('placeholder', 'Optional');
    await create(page).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/deals\/deal-1/, { timeout: 20_000 });
    expect(calls.deals[0].items).toEqual([{ product_id: 'p-3', name: 'Rotary actuator', quantity: 1, unit_price: 9900, brand_id: 'b-phd' }]);
    expect(Object.keys(calls.deals[0].items[0])).not.toContain('funnel_ref');
  });

  test('the brand name match is case-insensitive and trimmed', async ({ page }) => {
    await setup(page);
    await openNew(page);
    await addLine(page);
    await page.getByLabel('Line 1 brand').selectOption('b-lower'); // named "mac "
    await expect(page.getByTestId('funnel-required')).toBeVisible();
    await expect(page.getByTestId('deal-item-error')).toHaveText(ERR);
    await page.getByLabel('Line 1 brand').selectOption('b-phd');
    await expect(page.getByTestId('funnel-required')).toHaveCount(0);
    await page.getByLabel('Line 1 brand').selectOption('b-mac');
    await expect(page.getByTestId('funnel-required')).toBeVisible();
  });

  test('a server rejection is shown with its line number and the form stays put', async ({ page }) => {
    await setup(page, { dealPostError: { status: 400, message: `Line 1: ${ERR}` } });
    await openNew(page);
    await page.getByLabel('Name', { exact: true }).fill('Cylinders');
    await addLine(page);
    await page.getByLabel('Line 1 name').fill('Cylinder');
    await page.getByLabel('Line 1 unit price').fill('10');
    await create(page).click();
    await expect(page.getByText(`Line 1: ${ERR}`)).toBeVisible();
    await expect(page).toHaveURL(/\/deals\/new/);
  });
});

test.describe('quoted and ordered totals, and the create payload', () => {
  test('Quoted always shows; Ordered appears only once a line has an order value; keys are sent only when set', async ({ page }) => {
    const calls = await setup(page);
    await openNew(page);
    await page.getByLabel('Name', { exact: true }).fill('Mixed');
    await addLine(page);
    await page.getByLabel('Line 1 product').selectOption('p-3'); // PHD, 9900
    await page.getByLabel('Line 1 quantity').fill('2');
    await addLine(page);
    await page.getByLabel('Line 2 name').fill('Freight');
    await page.getByLabel('Line 2 unit price').fill('500');
    await addLine(page); // half-typed, dropped

    await expect(page.getByTestId('deal-items-grand-total')).toHaveText('₹20,300');
    await expect(page.getByTestId('deal-items').getByText('Quoted', { exact: false }).last()).toBeVisible();
    await expect(page.getByTestId('deal-items-ordered-total')).toHaveCount(0);

    await page.getByLabel('Line 1 order value').fill('19000');
    await page.getByLabel('Line 1 funnel reference').fill('PHD-7');
    await expect(page.getByTestId('deal-items-ordered-total')).toHaveText('₹19,000');
    await expect(page.getByTestId('deal-items-grand-total')).toHaveText('₹20,300');
    await page.getByLabel('Line 2 order value').fill('0'); // zero is a real order value
    await expect(page.getByTestId('deal-items-ordered-total')).toHaveText('₹19,000');

    await create(page).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/deals\/deal-1/, { timeout: 20_000 });
    expect(calls.deals[0].items).toEqual([
      { product_id: 'p-3', name: 'Rotary actuator', quantity: 2, unit_price: 9900, brand_id: 'b-phd', funnel_ref: 'PHD-7', order_value: 19000 },
      { name: 'Freight', quantity: 1, unit_price: 500, order_value: 0 },
    ]);
  });

  test('a negative order value blocks the save', async ({ page }) => {
    const calls = await setup(page);
    await openNew(page);
    await page.getByLabel('Name', { exact: true }).fill('Neg');
    await addLine(page);
    await page.getByLabel('Line 1 name').fill('Thing');
    await page.getByLabel('Line 1 unit price').fill('10');
    await page.getByLabel('Line 1 order value').fill('-5');
    await expect(page.getByTestId('deal-item-error')).toHaveText('Order value must be 0 or more');
    await create(page).click();
    await page.waitForTimeout(300);
    expect(calls.deals).toHaveLength(0);
  });

  test('the row layout holds on a phone-width screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await setup(page);
    await openNew(page);
    await addLine(page);
    await page.getByLabel('Line 1 product').selectOption('p-1');
    const row = page.getByTestId('deal-item-row');
    await expect(row).toBeVisible();
    for (const label of ['Line 1 product', 'Line 1 name', 'Line 1 make', 'Line 1 brand', 'Line 1 funnel reference', 'Line 1 order value', 'Line 1 quantity', 'Line 1 unit price']) {
      await expect(page.getByLabel(label)).toBeVisible();
    }
    const box = await row.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('line helpers', () => {
  const line = (o: Partial<DealLineDraft>): DealLineDraft => ({ key: 'k', product_id: '', name: 'X', quantity: '1', unit_price: '10', ...o });

  test('buildDealItems sends the new keys only when set', () => {
    expect(buildDealItems([line({})])).toEqual([{ name: 'X', quantity: 1, unit_price: 10 }]);
    expect(buildDealItems([line({ make_id: '', brand_id: '', funnel_ref: '  ', order_value: '' })])).toEqual([{ name: 'X', quantity: 1, unit_price: 10 }]);
    expect(buildDealItems([line({ make_id: 'm', brand_id: 'b', funnel_ref: ' F-1 ', order_value: '7.5' })])).toEqual([
      { name: 'X', quantity: 1, unit_price: 10, make_id: 'm', brand_id: 'b', funnel_ref: 'F-1', order_value: 7.5 },
    ]);
    expect(buildDealItems([line({ order_value: '0' })])[0].order_value).toBe(0);
    // Create mode never sends nulls or ids, even on a row that has an id.
    expect(buildDealItems([line({ id: 'li-9' })])).toEqual([{ name: 'X', quantity: 1, unit_price: 10 }]);
    // Half-typed rows are still dropped.
    expect(buildDealItems([line({ name: '', brand_id: 'b' }), line({ quantity: '0' })])).toEqual([]);
  });

  test('patch mode sends explicit nulls only to clear a stored line', () => {
    expect(buildDealItems([line({ id: 'li-1' })], 'patch')).toEqual([
      { id: 'li-1', name: 'X', quantity: 1, unit_price: 10, product_id: null, make_id: null, brand_id: null, funnel_ref: null, order_value: null },
    ]);
    expect(buildDealItems([line({})], 'patch')).toEqual([{ name: 'X', quantity: 1, unit_price: 10 }]); // a new row: omitted
    expect(buildDealItems([line({ id: 'li-1', product_id: 'p', make_id: 'm', brand_id: 'b', funnel_ref: 'F', order_value: '5' })], 'patch')).toEqual([
      { id: 'li-1', name: 'X', quantity: 1, unit_price: 10, product_id: 'p', make_id: 'm', brand_id: 'b', funnel_ref: 'F', order_value: 5 },
    ]);
  });

  test('MAC rule, order values and rollups', () => {
    expect(['MAC', ' mac ', 'Mac'].map(isMacBrand)).toEqual([true, true, true]);
    expect(['PHD', 'MACH', '', null, undefined].map((b) => isMacBrand(b as string))).toEqual([false, false, false, false, false]);
    expect(macFunnelError({ funnel_ref: '' }, 'MAC')).toBe('MAC funnel reference is required for MAC products');
    expect(macFunnelError({ funnel_ref: 'x' }, 'MAC')).toBeNull();
    expect(macFunnelError({ funnel_ref: '' }, 'PHD')).toBeNull();
    const rows = [line({ key: 'a', brand_name: 'MAC' }), line({ key: 'b', brand_name: 'PHD', order_value: '-1' }), line({ key: 'c', brand_name: 'MAC', funnel_ref: 'z' })];
    expect(dealLineErrors(rows)).toEqual({ a: 'MAC funnel reference is required for MAC products', b: 'Order value must be 0 or more' });
    expect(orderValueOf({ order_value: '' })).toBeNull();
    expect(orderValueOf({ order_value: 'abc' })).toBeNull();
    expect(orderValueOf({ order_value: '12.5' })).toBe(12.5);
    expect(hasAnyOrderValue([line({}), line({ order_value: '0' })])).toBe(true);
    expect(hasAnyOrderValue([line({}), line({ order_value: ' ' })])).toBe(false);
    expect(orderedTotal([line({ order_value: '10.1' }), line({ order_value: '' }), line({ order_value: '0.2' })])).toBe(10.3);
  });

  test('lineDraftFromItem and dealRollup', () => {
    expect(lineDraftFromItem(L1)).toMatchObject({ id: 'li-1', key: 'srv-li-1', product_id: 'p-1', quantity: '2', unit_price: '4250', make_id: 'm-festo', brand_id: 'b-mac', brand_name: 'MAC', funnel_ref: 'MAC-FN-2291', order_value: '8000' });
    expect(lineDraftFromItem(L2)).toMatchObject({ product_id: '', make_id: '', brand_id: '', funnel_ref: '', order_value: '' });
    expect(dealRollup(LEAD_DEALS)).toEqual({ count: 3, quoted: 16600, ordered: 11000 });
    expect(dealRollup([{ amount: 100 }, { amount: 50, order_amount: null }])).toEqual({ count: 2, quoted: 150, ordered: null });
    expect(dealRollup(undefined as never)).toEqual({ count: 0, quoted: 0, ordered: null });
  });
});

test.describe('deal edit modal', () => {
  const openEdit = async (page: Page) => {
    await page.goto('/dashboard/crm/deals/deal-1');
    await expect(page.getByText('Plugs for Q3').first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Deal' });
    await expect(dialog.getByLabel('Line 1 name')).toBeVisible({ timeout: 20_000 });
    return dialog;
  };

  test('loads the stored lines with make, brand, funnel reference and order value', async ({ page }) => {
    await setup(page);
    const dialog = await openEdit(page);
    await expect(dialog.getByTestId('deal-item-row')).toHaveCount(2);
    await expect(dialog.getByLabel('Line 1 product')).toHaveValue('p-1');
    await expect(dialog.getByLabel('Line 1 name')).toHaveValue('Pneumatic cylinder 32mm');
    await expect(dialog.getByLabel('Line 1 quantity')).toHaveValue('2');
    await expect(dialog.getByLabel('Line 1 unit price')).toHaveValue('4250');
    await expect(dialog.getByLabel('Line 1 make')).toHaveValue('m-festo');
    await expect(dialog.getByLabel('Line 1 brand')).toHaveValue('b-mac');
    await expect(dialog.getByLabel('Line 1 funnel reference')).toHaveValue('MAC-FN-2291');
    await expect(dialog.getByLabel('Line 1 order value')).toHaveValue('8000');
    await expect(dialog.getByTestId('funnel-required')).toBeVisible(); // brand MAC
    await expect(dialog.getByTestId('deal-item-error')).toHaveCount(0); // and it is filled
    await expect(dialog.getByLabel('Line 2 name')).toHaveValue('Freight');
    await expect(dialog.getByLabel('Line 2 make')).toHaveValue('');
    await expect(dialog.getByLabel('Line 2 order value')).toHaveValue('');
    await expect(dialog.getByTestId('deal-items-grand-total')).toHaveText('₹9,000');
    await expect(dialog.getByTestId('deal-items-ordered-total')).toHaveText('₹8,000');
  });

  test('saving diffs the lines: delete removed, PATCH changed (unchanged ones are left), POST new, then the deal', async ({ page }) => {
    const calls = await setup(page);
    const dialog = await openEdit(page);
    await dialog.getByLabel('Line 1 make').selectOption('m-piab');
    await dialog.getByLabel('Line 1 order value').fill('8200');
    await dialog.getByRole('button', { name: 'Remove line 2' }).click();
    await dialog.getByRole('button', { name: 'Add line' }).click();
    await dialog.getByLabel('Line 2 product').selectOption('p-2');
    await dialog.getByLabel('Line 2 quantity').fill('3');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.writes.length, { timeout: 20_000 }).toBe(4);
    expect(calls.writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'DELETE /api/v1/crm/line-items/li-2',
      'PATCH /api/v1/crm/line-items/li-1',
      'POST /api/v1/crm/deals/deal-1/line-items',
      'PATCH /api/v1/crm/deals/deal-1',
    ]);
    expect(calls.writes[1].body).toEqual({
      product_id: 'p-1', name: 'Pneumatic cylinder 32mm', quantity: 2, unit_price: 4250, make_id: 'm-piab', brand_id: 'b-mac', funnel_ref: 'MAC-FN-2291', order_value: 8200,
    });
    expect(calls.writes[2].body).toEqual({ product_id: 'p-2', name: 'Vacuum cup 40mm', quantity: 3, unit_price: 1180, make_id: 'm-piab' });
    expect(calls.writes[3].body).not.toHaveProperty('items'); // the deal PATCH ignores items; lines go through line-items
  });

  test('clearing a stored line field sends an explicit null; untouched lines send nothing', async ({ page }) => {
    const calls = await setup(page);
    const dialog = await openEdit(page);
    await dialog.getByLabel('Line 1 brand').selectOption(''); // no MAC any more, so the funnel reference may go
    await dialog.getByLabel('Line 1 funnel reference').fill('');
    await dialog.getByLabel('Line 1 order value').fill('');
    await expect(dialog.getByTestId('funnel-required')).toHaveCount(0);
    await expect(dialog.getByTestId('deal-items-ordered-total')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.writes.length, { timeout: 20_000 }).toBe(2);
    expect(calls.writes[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/crm/line-items/li-1' });
    expect(calls.writes[0].body).toEqual({
      product_id: 'p-1', name: 'Pneumatic cylinder 32mm', quantity: 2, unit_price: 4250, make_id: 'm-festo', brand_id: null, funnel_ref: null, order_value: null,
    });
    expect(calls.writes.some((w) => w.path.endsWith('/li-2'))).toBe(false);
    expect(calls.writes[1]).toMatchObject({ method: 'PATCH', path: '/api/v1/crm/deals/deal-1' });
  });

  test('a MAC line without its funnel reference blocks the save; nothing is written', async ({ page }) => {
    const calls = await setup(page);
    const dialog = await openEdit(page);
    await dialog.getByLabel('Line 1 funnel reference').fill('');
    await expect(dialog.getByTestId('deal-item-error')).toHaveText('MAC funnel reference is required for MAC products');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForTimeout(400);
    expect(calls.writes).toHaveLength(0);
    await expect(dialog).toBeVisible();
  });

  test('a server error on a line is shown with its line number and the deal is not saved', async ({ page }) => {
    const calls = await setup(page, { lineWriteError: { method: 'PATCH', status: 400, message: 'Brand not found' } });
    const dialog = await openEdit(page);
    await dialog.getByLabel('Line 1 order value').fill('1');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Line 1: Brand not found')).toBeVisible();
    expect(calls.writes.filter((w) => w.path === '/api/v1/crm/deals/deal-1')).toHaveLength(0);
    await expect(dialog).toBeVisible();
  });
});

test.describe('deal detail Products table', () => {
  test('shows reference, item, make, brand, qty, quoted, ordered, funnel ref and totals; blanks are dashes', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/deals/deal-1');
    const table = page.getByTestId('deal-lines-table');
    await expect(table).toBeVisible({ timeout: 30_000 });
    await expect(table.locator('thead th')).toHaveText(['Reference', 'Item', 'Make', 'Brand', 'Qty', 'Quoted', 'Ordered', 'Funnel ref']);
    const rows = table.getByTestId('deal-line-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('td')).toHaveText(['13280', 'Pneumatic cylinder 32mm', 'Festo', 'MAC', '2', '₹8,500', '₹8,000', 'MAC-FN-2291']);
    await expect(rows.nth(1).locator('td')).toHaveText(['—', 'Freight', '—', '—', '1', '₹500', '—', '—']);
    await expect(page.getByTestId('deal-lines-quoted-total')).toHaveText('₹9,000');
    await expect(page.getByTestId('deal-lines-ordered-total')).toHaveText('₹8,000');
  });

  test('the ordered total is a dash when no line has an order value; an empty deal says so', async ({ page }) => {
    await setup(page, { lines: [{ ...L1, order_value: null }, L2] });
    await page.goto('/dashboard/crm/deals/deal-1');
    await expect(page.getByTestId('deal-lines-table')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('deal-lines-ordered-total')).toHaveText('—');
  });

  test('no lines: an empty state', async ({ page }) => {
    await setup(page, { lines: [] });
    await page.goto('/dashboard/crm/deals/deal-1');
    await expect(page.getByText('No product lines yet. Use Edit deal to add the products quoted to the customer.')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('Won flow: confirm the ordered value', () => {
  const NO_ORDERS = [{ ...L1, order_value: null }, L2];
  const openClose = async (page: Page) => {
    await page.goto('/dashboard/crm/deals/deal-1');
    await expect(page.getByTestId('deal-lines-table')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Close Deal' }).click();
  };
  const winReason = (page: Page) => page.locator('select:has(option[value="Competitive pricing"])');

  test('pre-fills each line with its quoted value, lets it be edited, and saves the lines before closing', async ({ page }) => {
    const calls = await setup(page, { lines: NO_ORDERS });
    await openClose(page);
    await expect(page.getByText('Confirm the ordered value')).toBeVisible();
    await expect(page.getByTestId('order-value-row')).toHaveCount(2);
    await expect(page.getByLabel('Ordered value for Pneumatic cylinder 32mm')).toHaveValue('8500');
    await expect(page.getByLabel('Ordered value for Freight')).toHaveValue('500');
    await page.getByLabel('Ordered value for Pneumatic cylinder 32mm').fill('8000');
    await winReason(page).selectOption('Competitive pricing');
    await page.getByRole('button', { name: 'Close as Won' }).click();
    await expect.poll(() => calls.writes.length, { timeout: 20_000 }).toBe(3);
    expect(calls.writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'PATCH /api/v1/crm/line-items/li-1',
      'PATCH /api/v1/crm/line-items/li-2',
      'POST /api/v1/crm/deals/deal-1/win',
    ]);
    expect(calls.writes[0].body).toEqual({ order_value: 8000 });
    expect(calls.writes[1].body).toEqual({ order_value: 500 });
    expect(calls.writes[2].body).toMatchObject({ reason: 'Competitive pricing' });
  });

  test('only lines whose value changed (or had none) are saved; an existing order value is kept as the default', async ({ page }) => {
    const calls = await setup(page); // L1 already ordered 8000, L2 not
    await openClose(page);
    await expect(page.getByText('Confirm the ordered value')).toBeVisible();
    await expect(page.getByLabel('Ordered value for Pneumatic cylinder 32mm')).toHaveValue('8000');
    await expect(page.getByLabel('Ordered value for Freight')).toHaveValue('500');
    await winReason(page).selectOption('Competitive pricing');
    await page.getByRole('button', { name: 'Close as Won' }).click();
    await expect.poll(() => calls.writes.length, { timeout: 20_000 }).toBe(2);
    expect(calls.writes.map((w) => `${w.method} ${w.path}`)).toEqual(['PATCH /api/v1/crm/line-items/li-2', 'POST /api/v1/crm/deals/deal-1/win']);
  });

  test('a blank or negative ordered value is handled: blank leaves the line unset, negative blocks the close', async ({ page }) => {
    const calls = await setup(page, { lines: NO_ORDERS });
    await openClose(page);
    await winReason(page).selectOption('Competitive pricing');
    await page.getByLabel('Ordered value for Freight').fill('-1');
    await page.getByRole('button', { name: 'Close as Won' }).click();
    await expect(page.getByText('Enter a valid ordered value for Freight')).toBeVisible();
    expect(calls.writes).toHaveLength(0);
    await page.getByLabel('Ordered value for Freight').fill('');
    await page.getByRole('button', { name: 'Close as Won' }).click();
    await expect.poll(() => calls.writes.length, { timeout: 20_000 }).toBe(2);
    expect(calls.writes.map((w) => `${w.method} ${w.path}`)).toEqual(['PATCH /api/v1/crm/line-items/li-1', 'POST /api/v1/crm/deals/deal-1/win']);
  });

  test('no step when every line already has an order value', async ({ page }) => {
    const calls = await setup(page, { lines: [L1, { ...L2, order_value: 500 }] });
    await openClose(page);
    await expect(page.getByText('Closed Amount (₹)')).toBeVisible();
    await expect(page.getByText('Confirm the ordered value')).toHaveCount(0);
    await winReason(page).selectOption('Competitive pricing');
    await page.getByRole('button', { name: 'Close as Won' }).click();
    await expect.poll(() => calls.writes.length, { timeout: 20_000 }).toBe(1);
    expect(calls.writes[0].path).toBe('/api/v1/crm/deals/deal-1/win');
  });

  test('Lost needs nothing: no step and no line writes', async ({ page }) => {
    const calls = await setup(page, { lines: NO_ORDERS });
    await openClose(page);
    await expect(page.getByText('Confirm the ordered value')).toBeVisible();
    await page.getByRole('button', { name: '✗ Lost' }).click();
    await expect(page.getByText('Confirm the ordered value')).toHaveCount(0);
    await page.locator('select:has(option[value="Lost to competitor"])').selectOption('Lost to competitor');
    await page.getByRole('button', { name: 'Close as Lost' }).click();
    await expect.poll(() => calls.writes.length, { timeout: 20_000 }).toBe(1);
    expect(calls.writes[0]).toMatchObject({ method: 'POST', path: '/api/v1/crm/deals/deal-1/lose' });
  });

  test('a deal with no lines closes as before', async ({ page }) => {
    const calls = await setup(page, { lines: [] });
    await page.goto('/dashboard/crm/deals/deal-1');
    await expect(page.getByText('No product lines yet.')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Close Deal' }).click();
    await expect(page.getByText('Confirm the ordered value')).toHaveCount(0);
    await winReason(page).selectOption('Competitive pricing');
    await page.getByRole('button', { name: 'Close as Won' }).click();
    await expect.poll(() => calls.writes.length, { timeout: 20_000 }).toBe(1);
  });
});

test.describe('lead Deals card', () => {
  test('lists every deal with quoted, ordered and brand chips, and a header line with the totals', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads/lead-1#deals');
    const summary = page.getByTestId('deals-summary');
    await expect(summary).toBeVisible({ timeout: 30_000 });
    await expect(summary).toHaveText('3 deals · ₹16,600 quoted · ₹11,000 ordered');
    const row = (name: string) => page.getByRole('link', { name: new RegExp(name) });
    await expect(row('Plugs Q3')).toHaveAttribute('href', '/dashboard/crm/deals/d1');
    await expect(row('Plugs Q3')).toContainText('Quotation sent');
    await expect(row('Plugs Q3').getByTestId('deal-quoted')).toHaveText('Quoted ₹4,100');
    await expect(row('Plugs Q3').getByTestId('deal-ordered')).toHaveText('Ordered —');
    await expect(row('Plugs Q3').getByTestId('deal-brand-chip')).toHaveText(['MAC', 'PHD']);
    await expect(row('Valves')).toContainText('won');
    await expect(row('Valves').getByTestId('deal-ordered')).toHaveText('Ordered ₹11,000');
    await expect(row('Valves').getByTestId('deal-brand-chip')).toHaveText(['PIAB']);
    await expect(row('Spares').getByTestId('deal-brand-chip')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'New deal' })).toHaveAttribute('href', '/dashboard/crm/deals/new?lead_id=lead-1&account_id=acc-1');
  });

  test('the header omits "ordered" until something was ordered, and says "1 deal" for one', async ({ page }) => {
    await setup(page, { leadDeals: [LEAD_DEALS[0]] });
    await page.goto('/dashboard/crm/leads/lead-1#deals');
    await expect(page.getByTestId('deals-summary')).toHaveText('1 deal · ₹4,100 quoted', { timeout: 30_000 });
  });

  test('empty state and the New deal action', async ({ page }) => {
    await setup(page, { leadDeals: [] });
    await page.goto('/dashboard/crm/leads/lead-1#deals');
    await expect(page.getByText('No deals yet. Add one for each requirement.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('deals-summary')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'New deal' })).toHaveAttribute('href', '/dashboard/crm/deals/new?lead_id=lead-1&account_id=acc-1');
  });
});

test.describe('account Deals card', () => {
  test('shows quoted and ordered per deal and in a header line', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/accounts/acc-1');
    const summary = page.getByTestId('deals-summary');
    await expect(summary).toBeVisible({ timeout: 30_000 });
    await expect(summary).toHaveText('3 deals · ₹16,600 quoted · ₹11,000 ordered');
    const valves = page.getByRole('link', { name: /Valves/ });
    await expect(valves.getByTestId('deal-quoted')).toHaveText('Quoted ₹12,000');
    await expect(valves.getByTestId('deal-ordered')).toHaveText('Ordered ₹11,000');
    await expect(page.getByRole('link', { name: /Plugs Q3/ }).getByTestId('deal-brand-chip')).toHaveText(['MAC', 'PHD']);
  });
});

test.describe('other tenants are unchanged', () => {
  test('deals/new has no line editor, makes no makes / brands calls and posts no line items', async ({ page }) => {
    const calls = await setup(page, { spark: false });
    await openNew(page);
    await expect(page.getByTestId('deal-items')).toHaveCount(0);
    await page.getByLabel('Name', { exact: true }).fill('Plain deal');
    await create(page).click();
    await expect.poll(() => calls.deals.length).toBe(1);
    expect(Object.keys(calls.deals[0])).not.toContain('items');
    expect(calls.makesGets).toBe(0);
    expect(calls.brandsGets).toBe(0);
  });

  test('deal detail keeps the legacy Products card, never loads line items, and closes without a step', async ({ page }) => {
    const calls = await setup(page, { spark: false, lines: [{ ...L1, order_value: null }] });
    await page.goto('/dashboard/crm/deals/deal-1');
    await expect(page.getByText('Link this deal to a lead to track product quantities here.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('deal-lines-card')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close Deal' }).click();
    await expect(page.getByText('Closed Amount (₹)')).toBeVisible();
    await expect(page.getByText('Confirm the ordered value')).toHaveCount(0);
    expect(calls.lineGets).toBe(0);
    expect(calls.makesGets + calls.brandsGets).toBe(0);
  });

  test('the edit modal has no line editor and the lead Deals card keeps its totals tiles', async ({ page }) => {
    const calls = await setup(page, { spark: false });
    await page.goto('/dashboard/crm/deals/deal-1');
    await expect(page.getByText('Plugs for Q3').first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Edit Deal' })).toBeVisible();
    await expect(page.getByTestId('deal-items')).toHaveCount(0);
    expect(calls.lineGets).toBe(0);

    await page.goto('/dashboard/crm/leads/lead-1#deals');
    await expect(page.getByRole('link', { name: /Plugs Q3/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('deals-summary')).toHaveCount(0);
    await expect(page.getByTestId('deal-brand-chip')).toHaveCount(0);
    await expect(page.getByTestId('deal-ordered')).toHaveCount(0);
    await expect(page.getByText('Balance', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New deal' })).toHaveCount(0);
  });
});
