import { test, expect, type Locator, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark } from './spark';

/**
 * Form order (Settings → Custom Fields): the lead Create page and the Edit modal lay the built-in fields and the
 * custom fields out in ONE admin-chosen order. Built-ins carry `crm_settings.config.field_overrides['lead.<key>'].order`,
 * custom fields their `position`; both are numbers on one shared scale and become CSS `order` inside one grid.
 *
 * Assertions use the on-screen geometry (bounding boxes sorted row-major) plus the computed CSS `order`, and the
 * control tests prove that WITHOUT any `order` in the settings nothing changes (computed order stays 0 and the
 * sections keep their fixed layout).
 */

const LEAD = {
  id: 'lead-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair',
  phone: '9876501234', email: 'priya@nairsteel.example.com', title: 'Procurement Head',
  company: 'Nair Steel Traders', is_b2c: false, status: 'working',
  owner_id: 'u-asha', owner_name: 'Asha Menon', source_name: 'Website',
  created_by: SEED_USER.id, created_at: '2026-09-20T10:00:00Z',
};

const cf = (key: string, label: string, position: number) => ({
  id: `cf-${key}`, entity_type: 'lead', field_key: key, label, field_type: 'text', applies_to: 'both', position, is_active: true,
});
const CF_A = cf('cf_a', 'Alpha note', 2);
const CF_B = cf('cf_b', 'Beta note', 6);

// city (0) first_name (1) cf_a (2) last_name (3) phone (4) company (5) cf_b (6) email (7). Every other built-in is
// unplaced and sorts to the end.
const ORDERED = {
  'lead.city': { order: 0 }, 'lead.first_name': { order: 1 }, 'lead.last_name': { order: 3 }, 'lead.phone': { order: 4 },
  'lead.company': { order: 5 }, 'lead.email': { order: 7 },
};
const EXPECTED = ['city', 'first_name', 'cf_a', 'last_name', 'phone', 'company', 'cf_b', 'email'];

async function setup(page: Page, overrides: Record<string, unknown>, defs: unknown[] = [CF_A, CF_B], business_type = 'b2b') {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type, config: { field_overrides: overrides } } },
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/custom-fields') return ok(route, defs);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1') return ok(route, LEAD);
      if (method === 'GET' && p === '/api/v1/users') return ok(route, [{ id: 'u-asha', name: 'Asha Menon' }]);
      return false;
    },
  });
}

/** On-screen reading order (rows top-to-bottom, left-to-right) of the named elements. */
async function visualOrder(locs: Record<string, Locator>): Promise<string[]> {
  const rects = await Promise.all(Object.entries(locs).map(async ([k, l]) => {
    await expect(l, k).toBeVisible();
    const b = (await l.boundingBox())!;
    return { k, top: Math.round(b.y), left: Math.round(b.x) };
  }));
  return rects.sort((a, b) => a.top - b.top || a.left - b.left).map((r) => r.k);
}
const cssOrder = (l: Locator) => l.evaluate((el) => getComputedStyle(el).order);
const inlineOrder = (l: Locator) => l.evaluate((el) => (el as HTMLElement).style.order);
const parent = (l: Locator) => l.locator('xpath=..');
/** The outer element (label + control) of a create-page field, by its control's id. */
const outer = (page: Page | Locator, id: string) => page.locator(`xpath=//div[./label[@for="${id}"]]`);

// ── Create page ────────────────────────────────────────────────────────────
const createPage = (page: Page) => ({
  city: page.locator('#lead-field-city'),
  first_name: outer(page, 'lead-field-first_name'),
  last_name: outer(page, 'lead-field-last_name'),
  phone: outer(page, 'lead-field-phone'),
  company: outer(page, 'lead-field-company'),
  email: outer(page, 'lead-field-email'),
  cf_a: page.locator('#lead-cf-cf_a'),
  cf_b: page.locator('#lead-cf-cf_b'),
});
async function openCreate(page: Page) {
  await page.goto('/dashboard/crm/leads/new');
  await expect(page.locator('#lead-field-first_name')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#lead-cf-cf_a')).toBeVisible({ timeout: 30_000 });
}

test.describe('Lead form order — Create page', () => {
  test('ordered: built-in fields and custom fields interleave in the admin order (city before first name)', async ({ page }) => {
    await setup(page, ORDERED);
    await openCreate(page);
    const c = createPage(page);
    // The grid waits for the settings round-trip; the order is the settled one.
    await expect.poll(async () => (await visualOrder(c)).join(',')).toBe(EXPECTED.join(','));
    // Computed CSS order of each outer element.
    expect(await cssOrder(c.cf_a)).toBe('2');
    expect(await cssOrder(c.cf_b)).toBe('6');
    expect(await cssOrder(c.first_name)).toBe('1');
    expect(await cssOrder(c.email)).toBe('7');
    expect(await cssOrder(c.city)).toBe('0');
    // Unplaced built-ins (job title) sort to the end, after every placed field.
    expect(await cssOrder(outer(page, 'lead-field-title'))).toBe('100000');
  });

  test('not ordered: nothing changes — computed order is 0 and the fixed section layout stays', async ({ page }) => {
    await setup(page, { 'lead.city': { label: 'Town' } }); // an override, but no `order`
    await openCreate(page);
    const c = createPage(page);
    for (const k of ['first_name', 'last_name', 'phone', 'company', 'email'] as const) {
      expect(await cssOrder(c[k]), k).toBe('0');
      expect(await inlineOrder(c[k]), k).toBe('');
    }
    expect(await cssOrder(c.cf_a)).toBe('0');
    expect(await inlineOrder(c.cf_a)).toBe('');
    // Fixed layout: Contact section (first, last, phone, email) → Company (+ custom fields) → Location (city).
    const { city: _city, ...rest } = c; // the unordered city row is a `display: contents` wrapper (no box of its own)
    const order = await visualOrder(rest);
    expect(order.indexOf('first_name')).toBeLessThan(order.indexOf('company'));
    expect(order.indexOf('email')).toBeLessThan(order.indexOf('company'));
    expect(order.indexOf('company')).toBeLessThan(order.indexOf('cf_a'));
    // Section headings are still there.
    await expect(page.getByText('Who you’re talking to.')).toBeVisible();
    expect(await cssOrder(c.city)).toBe('0');
    expect(await inlineOrder(c.city)).toBe('');
  });
});

// ── Edit modal ─────────────────────────────────────────────────────────────
async function openEdit(page: Page) {
  await page.goto('/dashboard/crm/leads/lead-1');
  const edit = page.getByRole('button', { name: 'Edit lead' }).first();
  await expect(edit).toBeVisible({ timeout: 30_000 });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'Edit lead' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#lead-cf-cf_a')).toBeVisible({ timeout: 30_000 });
  return dialog;
}
const lbl = (dialog: Locator, re: RegExp) => dialog.locator('label', { hasText: re }).first();
const editLocs = (dialog: Locator) => ({
  city: dialog.locator('[data-field="city"]'),
  first_name: lbl(dialog, /^First Name\*?$/),
  last_name: lbl(dialog, /^Last Name\*?$/),
  phone: lbl(dialog, /^Phone\*?$/),
  company: lbl(dialog, /^Company\*?$/),
  email: lbl(dialog, /^Email\*?$/),
  cf_a: dialog.locator('#lead-cf-cf_a'),
  cf_b: dialog.locator('#lead-cf-cf_b'),
});

test.describe('Lead form order — Edit modal', () => {
  test('ordered: built-in fields and custom fields interleave in the admin order (city before first name)', async ({ page }) => {
    await setup(page, ORDERED);
    const dialog = await openEdit(page);
    const l = editLocs(dialog);
    await expect.poll(async () => (await visualOrder(l)).join(',')).toBe(EXPECTED.join(','));
    expect(await cssOrder(l.cf_a)).toBe('2');
    expect(await cssOrder(l.cf_b)).toBe('6');
    expect(await cssOrder(parent(l.first_name))).toBe('1');
    expect(await cssOrder(parent(l.email))).toBe('7');
    expect(await cssOrder(l.city)).toBe('0');
    // Unplaced built-in (job title) goes to the end.
    expect(await cssOrder(parent(lbl(dialog, /^Job Title\*?$/)))).toBe('100000');
  });

  test('not ordered: nothing changes — computed order is 0 and the fixed section layout stays', async ({ page }) => {
    await setup(page, { 'lead.city': { label: 'Town' } });
    const dialog = await openEdit(page);
    const l = editLocs(dialog);
    for (const k of ['first_name', 'last_name', 'phone', 'company', 'email'] as const) {
      expect(await cssOrder(parent(l[k])), k).toBe('0');
      expect(await inlineOrder(parent(l[k])), k).toBe('');
    }
    expect(await cssOrder(l.cf_a)).toBe('0');
    expect(await inlineOrder(l.cf_a)).toBe('');
    // Sections keep their headings and order: Contact → Company → ... → Additional details (custom fields last).
    await expect(dialog.getByText('Who you\'re talking to.')).toBeVisible();
    const order = await visualOrder({ first_name: l.first_name, email: l.email, company: l.company, cf_a: l.cf_a, cf_b: l.cf_b });
    expect(order.indexOf('email')).toBeLessThan(order.indexOf('company'));
    expect(order.indexOf('company')).toBeLessThan(order.indexOf('cf_a'));
  });
});

// ── Spark & Ray: Sub-industry stays glued to Industry ─────────────────────
// The Sub-industry custom field (industry_category) is rendered right beside Industry on Spark. Its own `position`
// (99) would put it last; in ordered mode it must still sit directly after Industry.
const SUB = cf('industry_category', 'Industry Category', 99);
const NOTE = cf('visit_note', 'Visit note', 3);
const SPARK_ORDERED = {
  'lead.city': { hidden: true },
  'lead.company': { order: 1 }, 'lead.industry': { order: 2 }, 'lead.title': { order: 5 },
};

test.describe('Lead form order — Spark Sub-industry stays glued to Industry', () => {
  test('Create page', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page, SPARK_ORDERED, [NOTE, SUB]);
    await page.goto('/dashboard/crm/leads/new');
    const sub = page.locator('#lead-cf-industry_category');
    await expect(sub).toBeVisible({ timeout: 30_000 });
    const locs = {
      company: outer(page, 'lead-field-company'),
      industry: outer(page, 'lead-field-industry'),
      sub,
      note: page.locator('#lead-cf-visit_note'),
      title: outer(page, 'lead-field-title'),
    };
    await expect.poll(async () => (await visualOrder(locs)).join(',')).toBe('company,industry,sub,note,title');
    // The wrapper carries Industry's order, so the pair stays adjacent.
    expect(await cssOrder(parent(sub))).toBe('2');
    expect(await cssOrder(locs.note)).toBe('3');
  });

  test('Edit modal', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page, SPARK_ORDERED, [NOTE, SUB]);
    await page.goto('/dashboard/crm/leads/lead-1');
    const edit = page.getByRole('button', { name: 'Edit lead' }).first();
    await expect(edit).toBeVisible({ timeout: 30_000 });
    await edit.click();
    const dialog = page.getByRole('dialog', { name: 'Edit lead' });
    const sub = dialog.locator('#lead-cf-industry_category');
    await expect(sub).toBeVisible({ timeout: 30_000 });
    const locs = {
      company: lbl(dialog, /^Company\*?$/),
      industry: lbl(dialog, /^Industry\*?$/),
      sub,
      note: dialog.locator('#lead-cf-visit_note'),
      title: lbl(dialog, /^Job Title\*?$/),
    };
    await expect.poll(async () => (await visualOrder(locs)).join(',')).toBe('company,industry,sub,note,title');
    expect(await cssOrder(parent(sub))).toBe('2');
  });
});
