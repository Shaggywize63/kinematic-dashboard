import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, fail, scopeToSpark } from './spark';

/**
 * Makes and Brands (connected-B2B / Spark & Ray): Settings cards, the Makes and Brands management pages (one shared
 * component), the Make / Brand columns + filters on Products, the Make / Brand selects and "Product reference" label
 * on the product forms, and "Import from file". Every API call is mocked; the other tenants' screens are unchanged.
 */

type NL = { id: string; name: string; description: string | null; is_active: boolean; sort_order: number; product_count: number; created_at: string };
const nl = (id: string, name: string, over: Partial<NL> = {}): NL => ({
  id, name, description: null, is_active: true, sort_order: 0, product_count: 0, created_at: '2026-01-01T00:00:00Z', ...over,
});

const MAKES = [
  nl('m-festo', 'Festo', { description: 'German pneumatics', product_count: 4 }),
  nl('m-piab', 'Piab', { product_count: 0 }),
  nl('m-old', 'Oldco', { is_active: false, product_count: 1 }),
];
const BRANDS = [
  nl('b-mac', 'MAC', { product_count: 3 }),
  nl('b-phd', 'PHD', { product_count: 0 }),
  nl('b-beko', 'BEKO', { is_active: false }),
];
const CATS = [{ id: 'cat-1', name: 'Cylinders' }, { id: 'cat-2', name: 'Vacuum' }];
const PRODUCTS = [
  { id: 'p-1', org_id: 'o', sku: '13280', name: 'Pneumatic cylinder 32mm', price: 4250, currency: 'INR', is_active: true, category_id: 'cat-1', make_id: 'm-festo', brand_id: 'b-mac', make_name: 'Festo', brand_name: 'MAC', unit: 'each', tax_rate_pct: 18, hsn_code: '8412' },
  { id: 'p-2', org_id: 'o', sku: '20415', name: 'Vacuum cup 40mm', price: 1180.5, currency: 'INR', is_active: true, category_id: 'cat-2', make_id: 'm-piab', brand_id: null, make_name: 'Piab', brand_name: null, unit: 'each', tax_rate_pct: 18, hsn_code: null },
  { id: 'p-3', org_id: 'o', sku: '30001', name: 'Rotary actuator', price: 9900, currency: 'INR', is_active: true, category_id: null, make_id: null, brand_id: 'b-phd', make_name: null, brand_name: 'PHD', unit: 'each', tax_rate_pct: 18, hsn_code: null },
];

type Calls = {
  lists: Record<'makes' | 'brands' | 'products', string[]>;
  writes: Array<{ method: string; path: string; body: any }>;
  bulk: any[];
  dialogs: string[];
};

type Opts = {
  spark?: boolean;
  makes?: NL[]; brands?: NL[]; products?: any[];
  /** Every makes/brands call answers 503 NOT_MIGRATED. */
  notMigrated?: boolean;
  /** Reply to POST /products and PATCH /products/:id with 409 DUPLICATE. */
  productDuplicate?: boolean;
  bulkResult?: any;
  bulkFail?: { status: number; message: string };
};

const NOT_MIGRATED = 'Makes and brands are not set up in this database yet. Apply migration_makes_brands.sql.';

async function setup(page: Page, o: Opts = {}): Promise<Calls> {
  const calls: Calls = { lists: { makes: [], brands: [], products: [] }, writes: [], bulk: [], dialogs: [] };
  const stores: Record<'makes' | 'brands', NL[]> = {
    makes: (o.makes ?? MAKES).map((x) => ({ ...x })),
    brands: (o.brands ?? BRANDS).map((x) => ({ ...x })),
  };
  const products = (o.products ?? PRODUCTS).map((x) => ({ ...x }));
  let seq = 0;
  page.on('dialog', (d) => { calls.dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  if (o.spark !== false) await scopeToSpark(page);
  await seedSession(page, SEED_USER);

  const nlRoute = async (route: Route, kind: 'makes' | 'brands', id: string | undefined, method: string, url: string) => {
    const noun = kind === 'makes' ? 'make' : 'brand';
    if (o.notMigrated) return fail(route, 503, NOT_MIGRATED);
    const list = stores[kind];
    if (method === 'GET') {
      calls.lists[kind].push(url);
      const sp = new URL(url).searchParams;
      let rows = list;
      const q = (sp.get('q') || '').toLowerCase();
      if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
      if (sp.get('is_active')) rows = rows.filter((r) => String(r.is_active) === sp.get('is_active'));
      return ok(route, rows);
    }
    const body = (route.request().postDataJSON?.() ?? {}) as any;
    calls.writes.push({ method, path: apiPath(url), body });
    const dupOf = (name: string, except?: string) => list.find((r) => r.name.toLowerCase() === String(name).trim().toLowerCase() && r.id !== except);
    if (method === 'POST') {
      if (dupOf(body.name)) return fail(route, 409, `A ${noun} named "${body.name}" already exists`);
      const row = nl(`${kind}-new-${++seq}`, body.name, { description: body.description ?? null, is_active: body.is_active ?? true });
      list.push(row);
      return ok(route, row, 201);
    }
    const row = list.find((r) => r.id === id);
    if (!row) return fail(route, 404, 'Not found');
    if (method === 'PATCH') {
      if (body.name !== undefined && dupOf(body.name, id)) return fail(route, 409, `A ${noun} named "${body.name}" already exists`);
      Object.assign(row, body);
      return ok(route, row);
    }
    if (method === 'DELETE') {
      if (row.product_count > 0) return fail(route, 409, `Used by ${row.product_count} products. Switch it off instead.`);
      stores[kind] = list.filter((r) => r.id !== id);
      return route.fulfill({ status: 204 }).then(() => true);
    }
    return false;
  };

  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: {} } },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      let m = p.match(/^\/api\/v1\/crm\/(makes|brands)(?:\/([^/]+))?$/);
      if (m) return nlRoute(route, m[1] as 'makes' | 'brands', m[2], method, url);
      if (method === 'GET' && p === '/api/v1/crm/product-categories') return ok(route, CATS);
      if (method === 'POST' && p === '/api/v1/crm/products/bulk') {
        const body = route.request().postDataJSON() as any;
        calls.bulk.push(body);
        if (o.bulkFail) return fail(route, o.bulkFail.status, o.bulkFail.message);
        return ok(route, o.bulkResult ?? { created: body.rows.length, updated: 0, skipped: 0, errors: [], makes_created: [], brands_created: [] });
      }
      m = p.match(/^\/api\/v1\/crm\/products(?:\/([^/]+))?$/);
      if (m) {
        const id = m[1];
        if (method === 'GET' && !id) {
          calls.lists.products.push(url);
          const sp = new URL(url).searchParams;
          let rows = products;
          const q = (sp.get('q') || '').toLowerCase();
          if (q) rows = rows.filter((r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
          if (sp.get('make_id')) rows = rows.filter((r) => r.make_id === sp.get('make_id'));
          if (sp.get('brand_id')) rows = rows.filter((r) => r.brand_id === sp.get('brand_id'));
          return ok(route, rows);
        }
        if (method === 'GET' && id) {
          const row = products.find((r) => r.id === id);
          return row ? ok(route, row) : fail(route, 404, 'Not found');
        }
        if (method === 'POST' || method === 'PATCH') {
          const body = route.request().postDataJSON() as any;
          calls.writes.push({ method, path: p, body });
          if (o.productDuplicate) return fail(route, 409, `A product with reference "${body.sku}" already exists`);
          return ok(route, { ...(products.find((r) => r.id === id) ?? { id: 'p-new', org_id: 'o', currency: 'INR', is_active: true }), ...body }, method === 'POST' ? 201 : 200);
        }
      }
      return false;
    },
  });
  return calls;
}

// Sortable headers carry a sort glyph after the label, so match on the label at the start.
const headers = (labels: string[]) => labels.map((l) => new RegExp('^' + l.replace(/[^\w\s]/g, '\\$&') + '(\\s*\\S)?$'));

const row = (page: Page, id: string) => page.getByTestId(`nl-row-${id}`);

// ── Settings index ──────────────────────────────────────────────────────────
// The Makes settings page has been removed (a product's Make is now free text); only Brands remains.
test.describe('Settings cards', () => {
  test('Spark & Ray sees the Brands card, and no Makes card', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/settings');
    await expect(page.locator('a[href="/dashboard/crm/settings/brands"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('a[href="/dashboard/crm/settings/brands"]')).toContainText('Brands');
    await expect(page.locator('a[href="/dashboard/crm/settings/makes"]')).toHaveCount(0);
  });

  test('another client sees no Brands card', async ({ page }) => {
    await setup(page, { spark: false });
    await page.goto('/dashboard/crm/settings');
    await expect(page.locator('a[href="/dashboard/crm/settings/sources"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('a[href="/dashboard/crm/settings/makes"]')).toHaveCount(0);
    await expect(page.locator('a[href="/dashboard/crm/settings/brands"]')).toHaveCount(0);
  });

  test('the Brands card opens its page', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/settings');
    await page.locator('a[href="/dashboard/crm/settings/brands"]').click();
    await expect(page.getByRole('heading', { name: 'Brands' })).toBeVisible({ timeout: 60_000 });
  });
});

// ── Brands page (same component, brand wording and API) ─────────────────────
test.describe('Brands page', () => {
  test('lists brands, adds one, rejects a duplicate and switches one off', async ({ page }) => {
    const calls = await setup(page);
    await page.goto('/dashboard/crm/settings/brands');
    await expect(row(page, 'b-mac')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Brands' })).toBeVisible();
    await expect(row(page, 'b-mac').getByRole('cell').nth(2)).toHaveText('3');
    await expect(row(page, 'b-beko').getByRole('switch')).toHaveAttribute('aria-checked', 'false');

    await page.getByRole('button', { name: 'Add brand' }).click();
    await page.getByLabel('New brand name').fill('PIAB');
    await page.getByLabel('New brand name').press('Enter');
    await expect(page.getByRole('cell', { name: 'PIAB', exact: true })).toBeVisible();
    await page.getByLabel('New brand name').fill('mac');
    await page.getByLabel('New brand name').press('Enter');
    await expect(page.getByTestId('nl-add-error')).toHaveText('A brand named "mac" already exists');

    await row(page, 'b-phd').getByRole('switch').click();
    await expect(row(page, 'b-phd').getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(calls.writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'POST /api/v1/crm/brands', 'POST /api/v1/crm/brands', 'PATCH /api/v1/crm/brands/b-phd',
    ]);
    expect(calls.lists.makes).toHaveLength(0);
  });

  test('rename and delete (unused) work; a brand in use shows IN_USE', async ({ page }) => {
    const calls = await setup(page);
    await page.goto('/dashboard/crm/settings/brands');
    await expect(row(page, 'b-phd')).toBeVisible({ timeout: 60_000 });
    await row(page, 'b-phd').getByRole('button', { name: 'Edit PHD' }).click();
    await row(page, 'b-phd').getByLabel('Brand name').fill('PHD Inc');
    await row(page, 'b-phd').getByRole('button', { name: 'Save' }).click();
    await expect(row(page, 'b-phd')).toContainText('PHD Inc');

    await row(page, 'b-mac').getByRole('button', { name: 'Delete MAC' }).click();
    await row(page, 'b-mac').getByRole('button', { name: 'Yes, delete' }).click();
    await expect(page.getByTestId('nl-row-error-b-mac')).toHaveText('Used by 3 products. Switch it off instead.');

    await row(page, 'b-phd').getByRole('button', { name: 'Delete PHD Inc' }).click();
    await row(page, 'b-phd').getByRole('button', { name: 'Yes, delete' }).click();
    await expect(row(page, 'b-phd')).toHaveCount(0);
    expect(calls.writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'PATCH /api/v1/crm/brands/b-phd', 'DELETE /api/v1/crm/brands/b-mac', 'DELETE /api/v1/crm/brands/b-phd',
    ]);
  });

  test('NOT_MIGRATED shows on the page', async ({ page }) => {
    await setup(page, { notMigrated: true });
    await page.goto('/dashboard/crm/settings/brands');
    await expect(page.getByTestId('nl-load-error')).toHaveText(NOT_MIGRATED, { timeout: 60_000 });
  });
});

// ── Products list ───────────────────────────────────────────────────────────
test.describe('Products list', () => {
  test('Spark & Ray: Reference, Name, Make, Price columns (no Brand / Category); Make is the free-text value', async ({ page }) => {
    await setup(page, { products: [
      { ...PRODUCTS[0], make: 'Festo' },         // free-text make
      { ...PRODUCTS[1], make: 'Piab' },
      { ...PRODUCTS[2], make: null, make_name: null },
    ] });
    await page.goto('/dashboard/crm/products');
    await expect(page.getByRole('cell', { name: '13280' })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('thead th')).toHaveText(headers(['Reference', 'Name', 'Make', 'Price', 'Active', 'Actions']));
    const r1 = page.getByRole('row').filter({ hasText: '13280' });
    await expect(r1.getByRole('cell').nth(1)).toHaveText('Pneumatic cylinder 32mm');
    await expect(r1.getByRole('cell').nth(2)).toHaveText('Festo');
    const r3 = page.getByRole('row').filter({ hasText: '30001' });
    await expect(r3.getByRole('cell').nth(2)).toHaveText('—');
    // No Make / Brand filter selects any more.
    await expect(page.getByLabel('Make')).toHaveCount(0);
    await expect(page.getByLabel('Brand')).toHaveCount(0);
    await expect(page.getByPlaceholder('Search reference, name...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import from file' })).toBeVisible();
  });

  test('Spark & Ray: the search box refetches with q (no make_id / brand_id params)', async ({ page }) => {
    const calls = await setup(page);
    await page.goto('/dashboard/crm/products');
    await expect(page.getByRole('cell', { name: '13280' })).toBeVisible({ timeout: 60_000 });
    await page.getByLabel('Search products').fill('13280');
    await expect(page.getByRole('cell', { name: '20415' })).toHaveCount(0);
    await expect(page.getByRole('cell', { name: '13280' })).toBeVisible();
    expect(calls.lists.products.at(-1)).toContain('q=13280');
    expect(calls.lists.products.every((u) => !/make_id|brand_id/.test(u))).toBe(true);
    expect(calls.lists.makes).toHaveLength(0);
    expect(calls.lists.brands).toHaveLength(0);
  });

  test('Spark & Ray: the Make column sorts', async ({ page }) => {
    await setup(page, { products: [
      { ...PRODUCTS[0], make: 'Festo' }, { ...PRODUCTS[1], make: 'Piab' }, { ...PRODUCTS[2], make: null, make_name: null },
    ] });
    await page.goto('/dashboard/crm/products');
    await expect(page.getByRole('cell', { name: '13280' })).toBeVisible({ timeout: 60_000 });
    await page.locator('thead th').filter({ hasText: 'Make' }).getByText('Make').click();
    const makes = async () => page.locator('tbody tr').evaluateAll((trs) => trs.map((t) => (t.children[2] as HTMLElement).innerText));
    expect(await makes()).toEqual(['Festo', 'Piab', '—']);
  });

  test('another client: the table is unchanged (SKU, Category, weight, tax, HSN), no make/brand filters, no import', async ({ page }) => {
    const calls = await setup(page, { spark: false });
    await page.goto('/dashboard/crm/products');
    await expect(page.getByRole('cell', { name: '13280' })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('thead th')).toHaveText(headers(['SKU', 'Name', 'Category', 'Price', 'Weight', 'Price/tonne', 'Tax %', 'HSN', 'Active', 'Actions']));
    await expect(page.getByPlaceholder('Search SKU, name...')).toBeVisible();
    await expect(page.getByLabel('Make')).toHaveCount(0);
    await expect(page.getByLabel('Brand')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Import from file' })).toHaveCount(0);
    expect(calls.lists.makes).toHaveLength(0);
    expect(calls.lists.brands).toHaveLength(0);
    expect(calls.lists.products.every((u) => !/make_id|brand_id/.test(u))).toBe(true);
  });
});

// ── Product forms ───────────────────────────────────────────────────────────
test.describe('Product forms', () => {
  test('new product (Spark): Product reference label, free-text Make (no Brand / Category), make in the POST', async ({ page }) => {
    const calls = await setup(page);
    await page.goto('/dashboard/crm/products/new');
    await expect(page.getByText('Product reference', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('SKU', { exact: true })).toHaveCount(0);
    // Make is a free-text box now; Brand and Category are gone for Spark products.
    await expect(page.getByLabel('Make')).toHaveRole('textbox');
    await expect(page.getByText('Brand', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Category', { exact: true })).toHaveCount(0);
    await page.getByLabel('Product reference').fill('77001');
    await page.getByLabel('Name', { exact: true }).fill('Gripper');
    await page.getByLabel('Make').fill('MAC');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/products$/, { timeout: 30_000 });
    const post = calls.writes.find((w) => w.method === 'POST' && w.path === '/api/v1/crm/products');
    expect(post?.body).toMatchObject({ sku: '77001', name: 'Gripper', make: 'MAC' });
    expect(post?.body).not.toHaveProperty('make_id');
    expect(post?.body).not.toHaveProperty('brand_id');
  });

  test('new product (Spark): an empty Make sends make: null', async ({ page }) => {
    const calls = await setup(page);
    await page.goto('/dashboard/crm/products/new');
    await page.getByLabel('Product reference').fill('77002');
    await page.getByLabel('Name', { exact: true }).fill('Plain');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/products$/, { timeout: 30_000 });
    const post = calls.writes.find((w) => w.method === 'POST');
    expect(post?.body.make).toBeNull();
    expect(post?.body).not.toHaveProperty('make_id');
  });

  test('new product (Spark): a duplicate reference shows the server message on the reference field and stays put', async ({ page }) => {
    await setup(page, { productDuplicate: true });
    await page.goto('/dashboard/crm/products/new');
    await page.getByLabel('Product reference').fill('13280');
    await page.getByLabel('Name', { exact: true }).fill('Again');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByTestId('field-error')).toHaveText('A product with reference "13280" already exists');
    await expect(page).toHaveURL(/\/products\/new$/);
    await expect(page.getByLabel('Product reference')).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Product reference').fill('13281');
    await expect(page.getByTestId('field-error')).toHaveCount(0);
  });

  test('new product (another client): SKU label, no Make or Brand', async ({ page }) => {
    const calls = await setup(page, { spark: false });
    await page.goto('/dashboard/crm/products/new');
    await expect(page.getByText('SKU', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Product reference')).toHaveCount(0);
    await expect(page.getByLabel('Make')).toHaveCount(0);
    await expect(page.getByLabel('Brand')).toHaveCount(0);
    await page.getByLabel('SKU').fill('X1');
    await page.getByLabel('Name', { exact: true }).fill('Thing');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/products$/, { timeout: 30_000 });
    const post = calls.writes.find((w) => w.method === 'POST');
    expect(post?.body).not.toHaveProperty('make_id');
    expect(post?.body).not.toHaveProperty('brand_id');
    expect(calls.lists.makes).toHaveLength(0);
  });

  test('edit product (Spark): the free-text Make is preselected and saved (no make_id / Brand)', async ({ page }) => {
    const calls = await setup(page, { products: [{ ...PRODUCTS[0], make: 'Festo' }] });
    await page.goto('/dashboard/crm/products/p-1');
    await expect(page.getByLabel('Product reference')).toHaveValue('13280', { timeout: 60_000 });
    await expect(page.getByLabel('Make')).toHaveValue('Festo');
    await expect(page.getByText('Brand', { exact: true })).toHaveCount(0);
    await page.getByLabel('Make').fill('Piab');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => calls.writes.length).toBe(1);
    expect(calls.writes[0].method).toBe('PATCH');
    expect(calls.writes[0].body).toMatchObject({ sku: '13280', make: 'Piab' });
    expect(calls.writes[0].body).not.toHaveProperty('make_id');
  });

  test('edit product (Spark): 409 shows the duplicate message under the reference', async ({ page }) => {
    await setup(page, { productDuplicate: true });
    await page.goto('/dashboard/crm/products/p-2');
    await expect(page.getByLabel('Product reference')).toHaveValue('20415', { timeout: 60_000 });
    await page.getByLabel('Product reference').fill('13280');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('field-error')).toHaveText('A product with reference "13280" already exists');
  });

  test('edit product (another client): SKU label and no make / brand in the PATCH', async ({ page }) => {
    const calls = await setup(page, { spark: false });
    await page.goto('/dashboard/crm/products/p-1');
    await expect(page.getByLabel('SKU')).toHaveValue('13280', { timeout: 60_000 });
    await expect(page.getByLabel('Make')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => calls.writes.length).toBe(1);
    expect(calls.writes[0].body).not.toHaveProperty('make_id');
  });
});

// ── Import from file ────────────────────────────────────────────────────────
const CSV_12 = [
  'Reference,Name,Make,Brand,Unit,Price,Category',
  ...Array.from({ length: 12 }, (_, i) => `${1000 + i},Item ${i + 1},${i % 2 ? 'Festo' : 'Piab'},${i % 3 ? 'MAC' : 'PHD'},each,${(i + 1) * 100},Cylinders`),
].join('\n');

const openImport = async (page: Page) => {
  await page.goto('/dashboard/crm/products');
  await page.getByRole('button', { name: 'Import from file' }).click({ timeout: 60_000 });
  await expect(page.getByTestId('product-import')).toBeVisible();
};

test.describe('Import from file', () => {
  test('pasting CSV shows counts, the first 10 rows, and both options on by default', async ({ page }) => {
    await setup(page);
    await openImport(page);
    const dlg = page.getByTestId('product-import');
    await expect(dlg.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
    await dlg.getByTestId('import-text').fill(CSV_12);
    await expect(dlg.getByTestId('import-counts')).toHaveText('12 products found · 2 makes · 2 brands');
    await expect(dlg.getByTestId('import-preview-row')).toHaveCount(10);
    await expect(dlg.getByText('Showing the first 10 of 12 products.')).toBeVisible();
    await expect(dlg.getByTestId('import-preview-row').first()).toContainText('1000');
    await expect(dlg.getByLabel('Add makes and brands that are not in the lists yet')).toBeChecked();
    await expect(dlg.getByLabel('Update products that already exist')).toBeChecked();
    await expect(dlg.getByRole('button', { name: 'Import 12 products' })).toBeEnabled();
  });

  test('sends the rows (header aliases mapped, no local fields) and both flags, then shows the result with error rows', async ({ page }) => {
    const calls = await setup(page, {
      bulkResult: {
        created: 1, updated: 0, skipped: 1,
        errors: [{ row: 3, reference: '', message: 'Reference is required' }, { row: 4, reference: 'X9', message: 'Price must be a number' }],
        makes_created: ['Piab'], brands_created: ['PIAB', 'PHD'],
      },
    });
    await openImport(page);
    const dlg = page.getByTestId('product-import');
    await dlg.getByTestId('import-text').fill([
      'Product Reference,PRODUCT NAME,Manufacturer,brand,Rate,Unit',
      '13280,Cylinder,Festo,MAC,"4,250",each',
      '20415,"Cup, 40mm",Piab,,1180.5,',
      ',No ref,,,,',
    ].join('\r\n'));
    await expect(dlg.getByTestId('import-counts')).toHaveText('3 products found · 2 makes · 1 brand');
    await expect(dlg.getByText('1 row has no reference or no name and will be reported as errors.')).toBeVisible();
    await dlg.getByRole('button', { name: 'Import 3 products' }).click();

    await expect(page.getByTestId('import-result-counts')).toHaveText('1 created · 0 updated · 2 not imported');
    await expect(page.getByTestId('import-not-imported')).toHaveText('Not imported (2)');
    await expect(page.getByTestId('import-new-makes')).toHaveText('New makes added: Piab');
    await expect(page.getByTestId('import-new-brands')).toHaveText('New brands added: PIAB, PHD');
    await expect(page.getByTestId('import-error-row')).toHaveCount(2);
    await expect(page.getByTestId('import-error-row').nth(0)).toContainText('3');
    await expect(page.getByTestId('import-error-row').nth(0)).toContainText('Reference is required');
    await expect(page.getByTestId('import-error-row').nth(1)).toContainText('X9');
    await expect(page.getByTestId('import-error-row').nth(1)).toContainText('Price must be a number');

    expect(calls.bulk).toEqual([{
      rows: [
        { reference: '13280', name: 'Cylinder', make: 'Festo', brand: 'MAC', unit: 'each', price: 4250 },
        { reference: '20415', name: 'Cup, 40mm', make: 'Piab', price: 1180.5 },
        { reference: '', name: 'No ref' },
      ],
      create_missing: true,
      update_existing: true,
    }]);
  });

  test('the two checkboxes are sent as chosen', async ({ page }) => {
    const calls = await setup(page);
    await openImport(page);
    const dlg = page.getByTestId('product-import');
    await dlg.getByTestId('import-text').fill('Reference,Name\n1,A');
    await dlg.getByLabel('Add makes and brands that are not in the lists yet').uncheck();
    await dlg.getByLabel('Update products that already exist').uncheck();
    await dlg.getByRole('button', { name: 'Import 1 product' }).click();
    await expect(page.getByTestId('import-result')).toBeVisible();
    await expect(page.getByText('Every row was imported without problems.')).toBeVisible();
    expect(calls.bulk[0]).toMatchObject({ create_missing: false, update_existing: false });
  });

  test('done reloads the products list', async ({ page }) => {
    const calls = await setup(page);
    await openImport(page);
    const lists = calls.lists.products.length;
    await page.getByTestId('import-text').fill('Reference,Name\n1,A');
    await page.getByRole('button', { name: 'Import 1 product' }).click();
    await expect(page.getByTestId('import-result')).toBeVisible();
    await expect.poll(() => calls.lists.products.length).toBeGreaterThan(lists);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('product-import')).toHaveCount(0);
  });

  test('a .csv file with a BOM and CRLF line breaks is read; the file name is shown', async ({ page }) => {
    const calls = await setup(page);
    await openImport(page);
    await page.getByTestId('import-file').setInputFiles({
      name: 'catalogue.csv', mimeType: 'text/csv',
      buffer: Buffer.from('﻿Ref,Name,Make\r\n13280,"Cylinder, 32",Festo\r\n20415,Cup,Piab\r\n', 'utf8'),
    });
    await expect(page.getByTestId('import-counts')).toHaveText('2 products found · 2 makes · 0 brands');
    await expect(page.getByText('catalogue.csv')).toBeVisible();
    await page.getByRole('button', { name: 'Import 2 products' }).click();
    await expect(page.getByTestId('import-result')).toBeVisible();
    expect(calls.bulk[0].rows).toEqual([
      { reference: '13280', name: 'Cylinder, 32', make: 'Festo' },
      { reference: '20415', name: 'Cup', make: 'Piab' },
    ]);
  });

  test('more than 2,000 rows: a clear message, Import is disabled and nothing is sent', async ({ page }) => {
    const calls = await setup(page);
    await openImport(page);
    const lines = ['Reference,Name'];
    for (let i = 1; i <= 2001; i++) lines.push(`${i},Item ${i}`);
    await page.getByTestId('import-text').fill(lines.join('\n'));
    await expect(page.getByTestId('import-too-many')).toContainText('This file has 2,001 products. A single import can hold up to 2,000.');
    await expect(page.getByTestId('product-import').getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
    expect(calls.bulk).toHaveLength(0);
    // Exactly 2,000 is fine.
    await page.getByTestId('import-text').fill(lines.slice(0, 2001).join('\n'));
    await expect(page.getByTestId('import-too-many')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Import 2,000 products' })).toBeEnabled();
  });

  test('missing columns are explained and block the import', async ({ page }) => {
    const calls = await setup(page);
    await openImport(page);
    await page.getByTestId('import-text').fill('Code,Title\n1,A');
    const problems = page.getByTestId('import-problems');
    await expect(problems).toContainText('No "Reference" column found');
    await expect(problems).toContainText('No "Name" column found');
    await expect(page.getByTestId('import-preview')).toHaveCount(0);
    await expect(page.getByTestId('product-import').getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
    expect(calls.bulk).toHaveLength(0);
  });

  test('a server error is shown in the dialog and the file is kept', async ({ page }) => {
    await setup(page, { bulkFail: { status: 503, message: NOT_MIGRATED } });
    await openImport(page);
    await page.getByTestId('import-text').fill('Reference,Name,Make\n1,A,Festo');
    await page.getByRole('button', { name: 'Import 1 product' }).click();
    await expect(page.getByTestId('import-error')).toHaveText(NOT_MIGRATED);
    await expect(page.getByTestId('import-text')).toHaveValue('Reference,Name,Make\n1,A,Festo');
    await expect(page.getByRole('button', { name: 'Import 1 product' })).toBeEnabled();
  });

  test('Download template saves a sample CSV with the supported headers', async ({ page }) => {
    await setup(page);
    await openImport(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download template' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('products-template.csv');
    const stream = await download.createReadStream();
    let text = '';
    for await (const chunk of stream) text += chunk.toString('utf8');
    expect(text.split(/\r?\n/)[0]).toBe('Reference,Name,Make,Brand,Unit,Price,Category,Description');
    expect(text).toContain('13280');
  });

  test('Cancel and Escape close the dialog without sending anything', async ({ page }) => {
    const calls = await setup(page);
    await openImport(page);
    await page.getByTestId('import-text').fill('Reference,Name\n1,A');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('product-import')).toHaveCount(0);
    await page.getByRole('button', { name: 'Import from file' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('product-import')).toHaveCount(0);
    expect(calls.bulk).toHaveLength(0);
  });
});
