import { test, expect, type Locator, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark } from './spark';

/**
 * Form-field order — account / contact / deal Create pages and Edit modals.
 *
 * Settings -> Custom Fields lets an admin put an entity's built-in fields and its custom fields in ONE order
 * (built-ins: config.field_overrides["<entity>.<key>"].order; custom fields: crm_custom_field_defs.position, numbered
 * on the same scale). The forms honour it with CSS `order` on a single grid, so a custom field can sit between two
 * built-ins. A tenant that never reordered (no `order` on any override) must see exactly the old layout.
 *
 * Each case asserts the VISUAL reading order (bounding boxes: top, then left) of the labels it names, plus the
 * computed CSS `order` on a couple of fields, and that WITHOUT `order` nothing is styled.
 */

const def = (entity: string, field_key: string, label: string, position: number) => ({
  id: `cf-${entity}-${field_key}`, entity_type: entity, field_key, label, field_type: 'text',
  position, is_active: true, required: false, hidden: false,
});
const CUSTOM_DEFS = [
  def('account', 'region', 'Region', 2),
  def('account', 'segment', 'Segment', 9),
  def('contact', 'loyalty_note', 'Loyalty note', 2),
  def('contact', 'segment_note', 'Segment note', 10),
  def('deal', 'site_type', 'Site type', 2),
  def('deal', 'dealer_note', 'Dealer note', 8),
];

const ACCOUNT = { id: 'acc-1', org_id: SEED_USER.org_id, name: 'Acme Forge', outcome: 'Quote accepted', description: 'Forgings', created_by: SEED_USER.id };
const CONTACT_B2C = {
  id: 'c-1', org_id: SEED_USER.org_id, first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair',
  email: 'priya@x.example', phone: '9876500000', is_b2c: true, created_by: SEED_USER.id,
};
const DEAL = {
  id: 'deal-1', name: 'Q4 TMT Supply', amount: 500000, stage_id: 's1', stage_name: 'Negotiation',
  pipeline_id: 'p1', probability: 0.6, status: 'open', created_by: SEED_USER.id,
};
const PIPELINES = [{ id: 'p1', name: 'Sales', is_default: true, stages: [{ id: 's1', name: 'Negotiation', position: 0, stage_type: 'open' }] }];

type OrderMap = Record<string, number>;

/** { 'account.name': 1, ... } -> field_overrides carrying `order`. */
const withOrder = (orders: OrderMap) =>
  Object.fromEntries(Object.entries(orders).map(([k, order]) => [k, { order }]));

async function setup(page: Page, orders: OrderMap | null, opts: { businessType?: string; spark?: boolean; rawOverrides?: Record<string, unknown> } = {}) {
  if (opts.spark) await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: {
      success: true,
      data: { business_type: opts.businessType ?? 'both', config: { field_overrides: opts.rawOverrides ?? (orders ? withOrder(orders) : {}) } },
    },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method !== 'GET') return false;
      if (p === '/api/v1/crm/custom-fields') return ok(route, CUSTOM_DEFS);
      if (p === '/api/v1/crm/pipelines') return ok(route, PIPELINES);
      if (p === '/api/v1/crm/accounts/acc-1') return ok(route, ACCOUNT);
      if (p === '/api/v1/crm/contacts/c-1') return ok(route, CONTACT_B2C);
      if (p === '/api/v1/crm/deals/deal-1') return ok(route, DEAL);
      return false;
    },
  });
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The given labels in the order a user reads them (row by row, left to right). A label may carry a trailing required
 * marker ("Name *") or an explanatory suffix ("Amount (₹) — fixed at creation").
 */
async function visualOrder(root: Locator, labels: string[]): Promise<string[]> {
  const found: { label: string; top: number; left: number }[] = [];
  for (const label of labels) {
    const span = root.locator('span').filter({ hasText: new RegExp(`^${esc(label)}(\\s*\\*|\\s—.*)?$`) }).first();
    // The form re-renders while settings / custom-field defs load: a missing or detached label is "not settled yet",
    // reported as a marker so expect.poll keeps retrying instead of aborting on a thrown error.
    const b = await span.boundingBox({ timeout: 1_000 }).catch(() => null);
    if (!b) return [`(not rendered: ${label})`];
    found.push({ label, top: Math.round(b.y), left: Math.round(b.x) });
  }
  // Same row = tops within a few px (a field whose label sits on a different line-height still belongs to its row).
  const ROW = 12;
  found.sort((a, b) => a.top - b.top);
  const rows: (typeof found)[] = [];
  for (const f of found) {
    const row = rows[rows.length - 1];
    if (row && f.top - row[0].top <= ROW) row.push(f); else rows.push([f]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.left - b.left)).map((f) => f.label);
}

/** Wait until the form has settled into `expected` (settings + custom-field defs load asynchronously). */
async function expectOrder(root: Locator, labels: string[], expected: string[]) {
  await expect.poll(() => visualOrder(root, labels), { timeout: 20_000 }).toEqual(expected);
}

/** CSS `order` of the closest label/wrapper holding this label text: '0' = untouched. */
async function cssOrder(root: Locator, label: string): Promise<string> {
  const span = root.locator('span').filter({ hasText: new RegExp(`^${esc(label)}(\\s*\\*|\\s—.*)?$`) }).first();
  return span.evaluate((el) => {
    const host = (el.closest('label') ?? el.parentElement) as HTMLElement;
    return getComputedStyle(host).order;
  });
}

/** Number of inline `order` declarations anywhere inside `root` (0 when the form is not ordered). */
async function inlineOrderCount(root: Locator): Promise<number> {
  return root.evaluate((el) => Array.from(el.querySelectorAll<HTMLElement>('*')).filter((n) => n.style.order !== '').length);
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

// ── Account ────────────────────────────────────────────────────────────────────────────────────────────────────
const ACCOUNT_ORDER: OrderMap = {
  'account.employees': 0, 'account.name': 1, 'account.outcome': 3, 'account.description': 4,
  'account.website': 5, 'account.phone': 6, 'account.industry': 7, 'account.annual_revenue': 8,
};

test.describe('Account Create page', () => {
  const labels = ['Name', 'Industry', 'Website', 'Phone', 'Annual Revenue', 'Employees', 'Outcome', 'Region', 'Segment'];
  const open = async (page: Page) => {
    await page.goto('/dashboard/crm/accounts/new');
    const form = page.locator('form');
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible({ timeout: 30_000 });
    return form;
  };

  test('ordered: built-ins, Outcome and custom fields interleave in the admin order', async ({ page }) => {
    await setup(page, ACCOUNT_ORDER, { spark: true });
    const form = await open(page);
    await expectOrder(form, labels, ['Employees', 'Name', 'Region', 'Outcome', 'Website', 'Phone', 'Industry', 'Annual Revenue', 'Segment']);
    expect(await cssOrder(form, 'Name')).toBe('1');
    expect(await cssOrder(form, 'Region')).toBe('2');
    expect(await cssOrder(form, 'Outcome')).toBe('3');
    expect(await cssOrder(form, 'Segment')).toBe('9');
  });

  test('a field the admin never placed (no order on it) goes after the ordered ones', async ({ page }) => {
    await setup(page, { 'account.name': 0, 'account.website': 1 }, { spark: true });
    const form = await open(page);
    await expectOrder(form, ['Name', 'Website', 'Industry', 'Segment'], ['Name', 'Website', 'Segment', 'Industry']);
    // Segment (custom, position 9) is placed; Industry has no order => end of the list.
    expect(await cssOrder(form, 'Industry')).toBe('100000');
  });

  test('without `order` the layout is the default and nothing is styled', async ({ page }) => {
    await setup(page, null, { spark: true });
    const form = await open(page);
    await expectOrder(form, labels, ['Name', 'Industry', 'Website', 'Phone', 'Annual Revenue', 'Employees', 'Outcome', 'Region', 'Segment']);
    expect(await inlineOrderCount(form)).toBe(0);
  });

  test('a legacy `position` on a built-in override is NOT an order (forms stay default)', async ({ page }) => {
    // Same as the default case but the override map carries only legacy `position` values.
    await setup(page, null, { spark: true, rawOverrides: { 'account.employees': { position: 0 }, 'account.name': { position: 5 } } });
    const form = await open(page);
    await expectOrder(form, labels, ['Name', 'Industry', 'Website', 'Phone', 'Annual Revenue', 'Employees', 'Outcome', 'Region', 'Segment']);
    expect(await inlineOrderCount(form)).toBe(0);
  });
});

test.describe('Account Edit modal', () => {
  const labels = ['Name', 'Industry', 'Website', 'Phone', 'Annual Revenue (₹)', 'Employees', 'Outcome', 'Description', 'Region', 'Segment'];

  test('ordered: Outcome, Description and custom fields share the grid with the built-ins', async ({ page }) => {
    await setup(page, ACCOUNT_ORDER, { spark: true });
    const dialog = await openEdit(page, '/dashboard/crm/accounts/acc-1', 'Edit Account');
    await expectOrder(dialog, labels, ['Employees', 'Name', 'Region', 'Outcome', 'Description', 'Website', 'Phone', 'Industry', 'Annual Revenue (₹)', 'Segment']);
    expect(await cssOrder(dialog, 'Name')).toBe('1');
    expect(await cssOrder(dialog, 'Region')).toBe('2');
    expect(await cssOrder(dialog, 'Description')).toBe('4');
  });

  test('without `order` the layout is the default and nothing is styled', async ({ page }) => {
    await setup(page, null, { spark: true });
    const dialog = await openEdit(page, '/dashboard/crm/accounts/acc-1', 'Edit Account');
    await expectOrder(dialog, labels, ['Name', 'Industry', 'Website', 'Phone', 'Annual Revenue (₹)', 'Employees', 'Outcome', 'Description', 'Region', 'Segment']);
    expect(await inlineOrderCount(dialog)).toBe(0);
  });
});

// ── Contact ────────────────────────────────────────────────────────────────────────────────────────────────────
const CONTACT_B2C_ORDER: OrderMap = {
  'contact.email': 0, 'contact.first_name': 1, 'contact.last_name': 3, 'contact.phone': 4,
  'contact.country': 5, 'contact.city': 6, 'contact.postal_code': 7, 'contact.mobile': 8,
};

test.describe('Contact Create page', () => {
  const open = async (page: Page) => {
    await page.goto('/dashboard/crm/contacts/new');
    await expect(page.getByRole('heading', { name: 'New Contact' })).toBeVisible({ timeout: 30_000 });
    return page.locator('form');
  };

  test('B2C ordered: personal, address and custom fields interleave (State + City move together)', async ({ page }) => {
    await setup(page, CONTACT_B2C_ORDER);
    const form = await open(page);
    await expectOrder(
      form,
      ['First Name', 'Last Name', 'Email', 'Primary Mobile', 'State', 'City', 'Postal Code', 'Country', 'Loyalty note', 'Segment note'],
      ['Email', 'First Name', 'Loyalty note', 'Last Name', 'Primary Mobile', 'Country', 'State', 'City', 'Postal Code', 'Segment note'],
    );
    // The B2C and B2B sections collapse into one grid, so the sectioned headings are gone.
    await expect(form.getByText('Customer Details', { exact: true })).toHaveCount(0);
  });

  test('B2C ordered: Alternate mobiles stays with Primary Mobile', async ({ page }) => {
    await setup(page, CONTACT_B2C_ORDER);
    const form = await open(page);
    await expectOrder(form, ['Primary Mobile', 'Country'], ['Primary Mobile', 'Country']);
    const mobile = (await form.locator('span').filter({ hasText: /^Primary Mobile/ }).first().boundingBox())!;
    const alt = (await form.getByText('Alternate mobile numbers', { exact: true }).boundingBox())!;
    expect(alt.y).toBeGreaterThan(mobile.y);
    expect(Math.abs(alt.x - mobile.x)).toBeLessThan(2);
  });

  test('B2B ordered: Job Title, City and custom fields interleave', async ({ page }) => {
    await setup(page, { 'contact.title': 0, 'contact.first_name': 3, 'contact.city': 4, 'contact.email': 5, 'contact.last_name': 6, 'contact.phone': 7 }, { businessType: 'b2b' });
    const form = await open(page);
    await expectOrder(
      form,
      ['First Name', 'Last Name', 'Email', 'Primary Mobile', 'City', 'Job Title', 'Loyalty note'],
      ['Job Title', 'Loyalty note', 'First Name', 'City', 'Email', 'Last Name', 'Primary Mobile'],
    );
  });

  test('without `order` the layout is the default and nothing is styled', async ({ page }) => {
    await setup(page, null);
    const form = await open(page);
    await expectOrder(
      form,
      ['First Name', 'Last Name', 'Email', 'Primary Mobile', 'State', 'City', 'Postal Code', 'Country', 'Loyalty note', 'Segment note'],
      ['First Name', 'Last Name', 'Email', 'Primary Mobile', 'State', 'City', 'Postal Code', 'Country', 'Loyalty note', 'Segment note'],
    );
    await expect(form.getByText('Customer Details', { exact: true })).toHaveCount(1);
    expect(await inlineOrderCount(form)).toBe(0);
  });

  test('without `order` (B2B) the layout is the default and nothing is styled', async ({ page }) => {
    await setup(page, null, { businessType: 'b2b' });
    const form = await open(page);
    await expectOrder(form, ['First Name', 'Primary Mobile', 'City', 'Job Title', 'Loyalty note'], ['First Name', 'Primary Mobile', 'City', 'Job Title', 'Loyalty note']);
    expect(await inlineOrderCount(form)).toBe(0);
  });
});

test.describe('Contact Edit modal', () => {
  const labels = ['First Name', 'Last Name', 'Email', 'Phone', 'Mobile', 'State', 'City', 'Postal Code', 'Country', 'Loyalty note', 'Segment note'];

  test('ordered: built-ins and custom fields share one grid', async ({ page }) => {
    await setup(page, CONTACT_B2C_ORDER);
    const dialog = await openEdit(page, '/dashboard/crm/contacts/c-1', 'Edit Contact');
    await expectOrder(dialog, labels, ['Email', 'First Name', 'Loyalty note', 'Last Name', 'Phone', 'Country', 'State', 'City', 'Postal Code', 'Mobile', 'Segment note']);
    expect(await cssOrder(dialog, 'First Name')).toBe('1');
    expect(await cssOrder(dialog, 'Loyalty note')).toBe('2');
  });

  test('without `order` the layout is the default and nothing is styled', async ({ page }) => {
    await setup(page, null);
    const dialog = await openEdit(page, '/dashboard/crm/contacts/c-1', 'Edit Contact');
    await expectOrder(dialog, labels, ['First Name', 'Last Name', 'Email', 'Phone', 'Mobile', 'State', 'City', 'Postal Code', 'Country', 'Loyalty note', 'Segment note']);
    expect(await inlineOrderCount(dialog)).toBe(0);
  });
});

// ── Deal ───────────────────────────────────────────────────────────────────────────────────────────────────────
const DEAL_ORDER: OrderMap = {
  'deal.expected_close_date': 0, 'deal.name': 1, 'deal.stage_id': 3, 'deal.probability': 4,
  'deal.amount': 5, 'deal.lead_id': 6, 'deal.pipeline_id': 7,
};

test.describe('Deal Create page', () => {
  const labels = ['Name', 'Product (optional)', 'Amount (INR)', 'Pipeline', 'Stage', 'Expected Close Date', 'Source Lead (optional)', 'Site type', 'Dealer note'];
  const open = async (page: Page) => {
    await page.goto('/dashboard/crm/deals/new');
    await expect(page.getByRole('heading', { name: 'New Deal' })).toBeVisible({ timeout: 30_000 });
    return page.locator('form');
  };

  test('ordered: built-ins and custom fields interleave; Product + Volume ride with Amount', async ({ page }) => {
    await setup(page, DEAL_ORDER);
    const form = await open(page);
    await expectOrder(form, labels, ['Expected Close Date', 'Name', 'Site type', 'Stage', 'Product (optional)', 'Amount (INR)', 'Source Lead (optional)', 'Pipeline', 'Dealer note']);
    expect(await cssOrder(form, 'Stage')).toBe('3');
    expect(await cssOrder(form, 'Product (optional)')).toBe('5');
    expect(await cssOrder(form, 'Site type')).toBe('2');
  });

  test('without `order` the layout is the default and nothing is styled', async ({ page }) => {
    await setup(page, null);
    const form = await open(page);
    await expectOrder(form, labels, ['Name', 'Product (optional)', 'Amount (INR)', 'Pipeline', 'Stage', 'Expected Close Date', 'Source Lead (optional)', 'Site type', 'Dealer note']);
    expect(await inlineOrderCount(form)).toBe(0);
  });
});

test.describe('Deal Edit modal', () => {
  const labels = ['Name', 'Amount (₹)', 'Pipeline', 'Stage', 'Probability (%)', 'Expected Close', 'Site type', 'Dealer note'];

  test('ordered: built-ins and custom fields share one grid', async ({ page }) => {
    await setup(page, DEAL_ORDER);
    const dialog = await openEdit(page, '/dashboard/crm/deals/deal-1', 'Edit Deal');
    await expectOrder(dialog, labels, ['Expected Close', 'Name', 'Site type', 'Stage', 'Probability (%)', 'Amount (₹)', 'Pipeline', 'Dealer note']);
    expect(await cssOrder(dialog, 'Name')).toBe('1');
    expect(await cssOrder(dialog, 'Site type')).toBe('2');
  });

  test('without `order` the layout is the default and nothing is styled', async ({ page }) => {
    await setup(page, null);
    const dialog = await openEdit(page, '/dashboard/crm/deals/deal-1', 'Edit Deal');
    await expectOrder(dialog, labels, ['Name', 'Amount (₹)', 'Pipeline', 'Stage', 'Probability (%)', 'Expected Close', 'Site type', 'Dealer note']);
    expect(await inlineOrderCount(dialog)).toBe(0);
  });
});
