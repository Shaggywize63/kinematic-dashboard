import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Agrisynx customisation (web):
 *   - lead types are called "Dealer" / "Farmers" (crm_settings.config.lead_form)
 *   - Dealer: Shop Name, Dealer Name, Location (address search), mobile, Description
 *     dropdown, Schedule visit (date + time -> activity + reminder), Shop image
 *   - Farmers: name, mobile, Location, Crop (searchable), Suggested product
 *     (names from Products), Photo
 *   - Daily allowance: the admin sets vehicle types + per-km cost; a mileage line
 *     asks for the odometer before / after (with photos).
 *
 * Every test runs against an intercepted API and asserts on what the page SENDS.
 */

// City is hidden to keep the form deterministic (no async city catalog); everything
// else mirrors what src/tools/agrisynx-lead-forms.ts seeds.
const SETTINGS = {
  success: true,
  data: {
    business_type: 'both',
    config: {
      lead_form: {
        segment_labels: { b2b: 'Dealer', b2c: 'Farmers' },
        address_on_b2b: true,
        schedule_visit: { segments: ['b2b'] },
      },
      field_overrides: {
        'lead.first_name@b2b': { label: 'Dealer Name' },
        'lead.first_name@b2c': { label: 'Farmer Name' },
        'lead.company': { label: 'Shop Name' },
        'lead.last_name': { hidden: true },
        'lead.phone': { label: 'Mobile Number' },
        'lead.address_line1': { label: 'Location', required: true },
        'lead.city': { hidden: true },
        'lead.email': { hidden: true },
        'lead.title': { hidden: true },
        'lead.industry': { hidden: true },
        'lead.status': { hidden: true },
        'lead.source_id': { hidden: true },
        'lead.alternate_mobiles': { hidden: true },
        'lead.address_line2': { hidden: true },
        'lead.postal_code': { hidden: true },
        'lead.country': { hidden: true },
        'lead.date_of_birth': { hidden: true },
        'lead.gender': { hidden: true },
        'lead.preferred_contact_method': { hidden: true },
        'lead.marketing_consent': { hidden: true },
        'lead.whatsapp_consent': { hidden: true },
      },
    },
  },
};

const CUSTOM_FIELDS = [
  { id: 'cf1', entity_type: 'lead', field_key: 'visit_description', label: 'Description', field_type: 'select', required: true, applies_to: 'b2b', position: 0,
    options: ['Dealer Visit', 'First Time Visit', 'Dealer Appoint', 'Order/Collection'] },
  { id: 'cf2', entity_type: 'lead', field_key: 'crop', label: 'Crop', field_type: 'select', required: true, applies_to: 'b2c', position: 1,
    options: ['Rice (Paddy)', 'Wheat', 'Maize', 'Cotton', '__searchable__'] },
  { id: 'cf3', entity_type: 'lead', field_key: 'suggested_product', label: 'Suggested Product', field_type: 'select', required: false, applies_to: 'b2c', position: 2,
    options: ['__source:products__'] },
];
const PRODUCTS = [
  { id: 'p1', name: 'NPK 19-19-19', is_active: true },
  { id: 'p2', name: 'Neem Oil', is_active: true },
  { id: 'p3', name: 'Retired Product', is_active: false },
];

/** "YYYY-MM-DDTHH:mm" for a datetime-local input, `days` from now at 10:30 local. */
function localAt(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T10:30`;
}

interface Posted { body: Record<string, unknown> | null }

/** SETTINGS with extra built-in field overrides on top (e.g. `{ 'lead.data_consent': { hidden: true } }`). */
const settingsWith = (overrides: Record<string, unknown>) => ({
  ...SETTINGS,
  data: { ...SETTINGS.data, config: { ...SETTINGS.data.config, field_overrides: { ...SETTINGS.data.config.field_overrides, ...overrides } } },
});

async function setupLeads(page: Page, settings: unknown = SETTINGS): Promise<Posted> {
  const posted: Posted = { body: null };
  await seedSession(page);
  await mockApi(page, {
    settings,
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0];
      if (method === 'POST' && path.endsWith('/crm/leads')) {
        try { posted.body = route.request().postDataJSON(); } catch { posted.body = null; }
        await route.fulfill({ json: { success: true, data: { id: 'e2e-lead-1', ...(posted.body ?? {}), scheduled_visit: { id: 'act-1' } } } });
        return true;
      }
      if (method === 'GET' && path.endsWith('/crm/custom-fields')) {
        await route.fulfill({ json: { success: true, data: CUSTOM_FIELDS } });
        return true;
      }
      if (method === 'GET' && path.endsWith('/crm/products')) {
        await route.fulfill({ json: { success: true, data: PRODUCTS } });
        return true;
      }
      if (method === 'GET' && /\/crm\/leads\/e2e-lead-1$/.test(path)) {
        await route.fulfill({ json: { success: true, data: { id: 'e2e-lead-1', first_name: 'Test', is_b2c: false, status: 'new' } } });
        return true;
      }
      return false;
    },
  });
  return posted;
}

test.describe('Agrisynx — Dealer / Farmers lead form', () => {
  test('the lead types read Dealer and Farmers instead of B2B and B2C', async ({ page }) => {
    await setupLeads(page);
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.getByRole('tab', { name: 'Dealer' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Farmers' })).toBeVisible();
    await expect(page.getByText('B2B · Business')).toHaveCount(0);
    await expect(page.getByText('B2C · Consumer')).toHaveCount(0);
  });

  test('a dealer is created with its shop, location and a scheduled visit', async ({ page }) => {
    const posted = await setupLeads(page);
    await page.goto('/dashboard/crm/leads/new');

    // Relabelled built-ins + the hidden Last name.
    await expect(page.getByLabel('Dealer Name', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Shop Name', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Mobile Number', { exact: false })).toBeVisible();
    await expect(page.locator('#lead-field-last_name')).toHaveCount(0);
    // The Location block (address search + GPS pin) now shows on a dealer too.
    await expect(page.locator('#lead-field-address_line1')).toBeVisible();
    await expect(page.locator('#lead-field-location')).toBeVisible();

    await page.locator('#lead-field-first_name').fill('Ramesh Sharma');
    await page.locator('#lead-field-company').fill('Sharma Agro');
    await page.locator('#lead-field-phone').fill('9876543210');
    await page.locator('#lead-field-address_line1').fill('Plot 4, Market Road, Nashik');
    await page.locator('#lead-cf-visit_description select').selectOption('Dealer Visit');

    const when = localAt(1);
    await page.locator('#lead-field-visit_at').fill(when);

    const submit = page.getByRole('button', { name: 'Create lead' });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();

    await expect(page).toHaveURL(/\/dashboard\/crm\/leads\/e2e-lead-1/, { timeout: 20_000 });
    expect(posted.body).toMatchObject({
      first_name: 'Ramesh Sharma', company: 'Sharma Agro', phone: '9876543210', is_b2c: false,
      address_line1: 'Plot 4, Market Road, Nashik',
      custom_fields: { visit_description: 'Dealer Visit' },
      schedule_visit: { due_at: new Date(when).toISOString(), subject: 'Dealer Visit — Sharma Agro' },
    });
  });

  test('a visit time in the past is refused before anything is sent', async ({ page }) => {
    const posted = await setupLeads(page);
    await page.goto('/dashboard/crm/leads/new');
    await page.locator('#lead-field-first_name').fill('Ramesh');
    await page.locator('#lead-field-company').fill('Sharma Agro');
    await page.locator('#lead-field-phone').fill('9876543210');
    await page.locator('#lead-field-address_line1').fill('Market Road');
    await page.locator('#lead-cf-visit_description select').selectOption('Dealer Visit');
    await page.locator('#lead-field-visit_at').fill(localAt(-2));

    const submit = page.getByRole('button', { name: 'Create lead' });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();

    await expect(page.getByText(/Pick a visit time in the future/)).toBeVisible();
    expect(posted.body).toBeNull();
  });

  test('without a visit time the lead is saved without a schedule_visit', async ({ page }) => {
    const posted = await setupLeads(page);
    await page.goto('/dashboard/crm/leads/new');
    await page.locator('#lead-field-first_name').fill('Ramesh');
    await page.locator('#lead-field-company').fill('Sharma Agro');
    await page.locator('#lead-field-phone').fill('9876543210');
    await page.locator('#lead-field-address_line1').fill('Market Road');
    await page.locator('#lead-cf-visit_description select').selectOption('First Time Visit');

    const submit = page.getByRole('button', { name: 'Create lead' });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/leads\/e2e-lead-1/, { timeout: 20_000 });
    expect(posted.body).not.toBeNull();
    expect(posted.body).not.toHaveProperty('schedule_visit');
  });

  test('the Location is required (and 10-digit mobile enforced) for a dealer', async ({ page }) => {
    const posted = await setupLeads(page);
    await page.goto('/dashboard/crm/leads/new');
    await page.locator('#lead-field-first_name').fill('Ramesh');
    await page.locator('#lead-field-company').fill('Sharma Agro');
    await page.locator('#lead-field-phone').fill('98765');
    const submit = page.getByRole('button', { name: 'Create lead' });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();
    await expect(page.getByText(/10-digit number/)).toBeVisible();

    await page.locator('#lead-field-phone').fill('9876543210');
    await submit.click();
    await expect(page.getByText(/Location is required/)).toBeVisible();
    expect(posted.body).toBeNull();
  });

  test('a farmer picks the crop from a searchable list and a product by name; there is no Schedule visit', async ({ page }) => {
    const posted = await setupLeads(page);
    await page.goto('/dashboard/crm/leads/new');
    await page.getByRole('tab', { name: 'Farmers' }).click();

    await expect(page.getByLabel('Farmer Name', { exact: false })).toBeVisible();
    await expect(page.locator('#lead-field-visit_at')).toHaveCount(0);

    // Crop: type to filter, pick with the mouse.
    const crop = page.locator('#lead-cf-crop input');
    await crop.click();
    await expect(page.getByRole('option', { name: 'Rice (Paddy)' })).toBeVisible();
    await crop.fill('whe');
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.getByRole('option', { name: 'Wheat' }).click();
    await expect(crop).toHaveValue('Wheat');
    // The behaviour tokens are never shown as choices.
    await crop.click();
    await expect(page.getByText('__searchable__')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Suggested product: names from Products only (active ones, no price).
    const product = page.locator('#lead-cf-suggested_product input');
    await product.click();
    await expect(page.getByRole('option', { name: 'NPK 19-19-19' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Neem Oil' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Retired Product' })).toHaveCount(0);
    await expect(page.getByText('__source:products__')).toHaveCount(0);
    await product.fill('neem');
    await product.press('Enter');
    await expect(product).toHaveValue('Neem Oil');

    await page.locator('#lead-field-first_name').fill('Suresh Patil');
    await page.locator('#lead-field-phone').fill('9123456780');
    await page.locator('#lead-field-address_line1').fill('Village Road, Sinnar');

    const submit = page.getByRole('button', { name: 'Create lead' });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/leads\/e2e-lead-1/, { timeout: 20_000 });
    expect(posted.body).toMatchObject({
      first_name: 'Suresh Patil', phone: '9123456780', is_b2c: true,
      custom_fields: { crop: 'Wheat', suggested_product: 'Neem Oil' },
    });
    expect(posted.body).not.toHaveProperty('schedule_visit');
  });
});

// ── Travel allowance by vehicle ─────────────────────────────────────────────
const POLICY_ID = '55555555-5555-4555-8555-555555555555';
const rules = {
  mileage_rate: 12, receipt_required_over: 500, max_claim_amount: null, submit_within_days: 30,
  auto_approve_under: 0, escalate_over: null, enforcement: 'flag',
  vehicle_rates: [
    { id: 'two_wheeler', label: 'Two-wheeler', rate_per_km: 4 },
    { id: 'car', label: 'Car', rate_per_km: 9 },
  ],
  odometer_photos_required: true,
  categories: Object.fromEntries(['mileage', 'travel', 'food', 'lodging', 'fuel', 'toll', 'misc'].map((c) => [c, {
    enabled: true, per_day_limit: null, per_claim_limit: null, per_month_limit: null, receipt_required_over: null,
  }])),
};
const MY_POLICY = {
  id: POLICY_ID, name: 'Field team', currency: 'INR', mileage_rate: 12, auto_approve_under: 0, escalate_over: null,
  require_receipt_over: 500, category_limits: null, is_active: true, rules,
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function setupExpenses(page: Page, extra?: (route: Route, path: string, method: string) => Promise<boolean>) {
  const seen: Array<{ method: string; path: string; body: any }> = [];
  await seedSession(page);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      if (!url.includes('/api/v1/expenses')) return false;
      const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace('/api/v1/expenses', '');
      let body: any = null;
      try { body = route.request().postDataJSON(); } catch { /* not json */ }
      seen.push({ method, path, body });
      if (extra && (await extra(route, path, method))) return true;
      const ok = (data: unknown) => route.fulfill({ json: { success: true, data } }).then(() => true);
      if (method === 'GET' && path === '/policy') return ok(MY_POLICY);
      if (method === 'GET' && path === '/policies/presets') return ok([]);
      if (method === 'GET' && path === '/policies/roles') return ok({ legacy: [], org_roles: [] });
      if (method === 'POST' && path === '/claims/check') return ok({ policy: MY_POLICY, total: 208, blocking: false, would_auto_approve: false, violations: [] });
      if (method === 'POST' && path === '/receipts') {
        return ok({ url: 'https://x.test/storage/v1/object/public/kinematic-receipts/o/u/odo.png', path: 'o/u/odo.png', bucket: 'kinematic-receipts',
          content_type: 'image/png', size: 70, signed_url: 'https://x.test/odo.png?token=1', scan: null });
      }
      if (method === 'POST' && path === '/claims') return ok({ id: 'c-new', status: 'draft', items: [] });
      return false;
    },
  });
  return seen;
}

test.describe('Agrisynx — daily allowance by vehicle', () => {
  test('a mileage line asks for the vehicle and the odometer before / after, and works out the amount', async ({ page }) => {
    const seen = await setupExpenses(page);
    await page.goto('/dashboard/expenses/new');
    await expect(page.getByRole('heading', { name: 'New expense claim' })).toBeVisible();
    await page.getByLabel('Category').selectOption('mileage');

    // The flat Distance / Amount boxes are gone; the vehicle + odometer take their place.
    await expect(page.getByLabel('Distance (km)')).toHaveCount(0);
    await page.getByLabel('Vehicle', { exact: false }).selectOption('two_wheeler');
    await page.getByLabel('Odometer before the trip', { exact: false }).fill('12340');
    await page.getByLabel('Odometer after the trip', { exact: false }).fill('12392');

    // 52 km at ₹4 / km.
    await expect(page.getByText('52 km', { exact: true })).toBeVisible();
    await expect(page.getByText('₹208', { exact: true }).first()).toBeVisible();

    // A photo for each reading.
    const files = page.locator('input[type=file]');
    await files.nth(0).setInputFiles({ name: 'before.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('Photo attached', { exact: true })).toHaveCount(1);
    await files.nth(1).setInputFiles({ name: 'after.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('Photo attached', { exact: true })).toHaveCount(2);

    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect.poll(() => seen.find((r) => r.method === 'POST' && r.path === '/claims')?.body).toBeTruthy();

    const item = seen.find((r) => r.method === 'POST' && r.path === '/claims')!.body.items[0];
    expect(item).toMatchObject({
      category: 'mileage', vehicle_type: 'two_wheeler', odometer_start: 12340, odometer_end: 12392,
      odometer_start_photo_url: expect.stringContaining('odo.png'), odometer_end_photo_url: expect.stringContaining('odo.png'),
    });
    // The server works distance and amount out — the page never sends them.
    expect(item.amount).toBeNull();
    expect(item.distance_km).toBeNull();
    // Odometer photos are uploaded without the receipt OCR read.
    expect(seen.filter((r) => r.path === '/receipts')).toHaveLength(2);
  });

  test('an after reading below the before reading is not saved', async ({ page }) => {
    const seen = await setupExpenses(page);
    await page.goto('/dashboard/expenses/new');
    await page.getByLabel('Category').selectOption('mileage');
    await page.getByLabel('Vehicle', { exact: false }).selectOption('car');
    await page.getByLabel('Odometer before the trip', { exact: false }).fill('5000');
    await page.getByLabel('Odometer after the trip', { exact: false }).fill('4990');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByText(/lower than the reading before it/)).toBeVisible();
    expect(seen.some((r) => r.method === 'POST' && r.path === '/claims')).toBe(false);
  });

  test('a policy without vehicle types keeps the plain distance and amount boxes', async ({ page }) => {
    await setupExpenses(page, async (route, path, method) => {
      if (method === 'GET' && path === '/policy') {
        const { vehicle_rates: _v, odometer_photos_required: _o, ...flat } = rules;
        await route.fulfill({ json: { success: true, data: { ...MY_POLICY, rules: flat } } });
        return true;
      }
      return false;
    });
    await page.goto('/dashboard/expenses/new');
    await page.getByLabel('Category').selectOption('mileage');
    await expect(page.getByLabel('Distance (km)', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Odometer before the trip', { exact: false })).toHaveCount(0);
  });

  test('the admin sets vehicle types and a cost per km on the policy', async ({ page }) => {
    const seen = await setupExpenses(page, async (route, path, method) => {
      if (method === 'POST' && path === '/policies') {
        await route.fulfill({ status: 201, json: { success: true, data: { id: 'new-1' } } });
        return true;
      }
      return false;
    });
    await page.goto('/dashboard/expenses/policies/new');
    await page.getByLabel('Policy name', { exact: false }).fill('Field team');

    await page.getByRole('button', { name: 'Add vehicle type' }).click();
    await page.getByLabel('Vehicle type 1', { exact: true }).fill('Two-wheeler');
    await page.getByLabel('Cost per km for Two-wheeler').fill('4');
    await page.getByRole('button', { name: 'Add vehicle type' }).click();
    await page.getByLabel('Vehicle type 2', { exact: true }).fill('Car');
    await expect(page.getByText(/Enter a per-km cost for “Car”/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create policy' })).toBeDisabled();
    await page.getByLabel('Cost per km for Car').fill('9');

    await page.getByRole('button', { name: 'Create policy' }).click();
    await expect.poll(() => seen.find((r) => r.method === 'POST' && r.path === '/policies')?.body).toMatchObject({
      name: 'Field team',
      rules: {
        vehicle_rates: [{ label: 'Two-wheeler', rate_per_km: 4 }, { label: 'Car', rate_per_km: 9 }],
        odometer_photos_required: true,
      },
    });
  });
});

// ── DPDP "Data consent" is a built-in field the admin can hide, relabel or require ──────────────
async function fillDealer(page: Page) {
  await page.locator('#lead-field-first_name').fill('Ramesh Sharma');
  await page.locator('#lead-field-company').fill('Sharma Agro');
  await page.locator('#lead-field-phone').fill('9876543210');
  await page.locator('#lead-field-address_line1').fill('Plot 4, Market Road, Nashik');
  await page.locator('#lead-cf-visit_description select').selectOption('Dealer Visit');
}
const consentTick = (page: Page) => page.getByRole('checkbox', { name: /consents to the collection/ });

test.describe('Agrisynx — Data consent field override (lead create)', () => {
  test('shown by default, and what the rep ticks is recorded', async ({ page }) => {
    const posted = await setupLeads(page);
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.getByText('Data consent', { exact: true })).toBeVisible();
    await fillDealer(page);
    await consentTick(page).check();
    const submit = page.getByRole('button', { name: 'Create lead' });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/leads\/e2e-lead-1/, { timeout: 20_000 });
    expect(posted.body).toMatchObject({ _consent: { consented: true, method: 'web_form' } });
  });

  test('hidden for the client: no block on the form and no _consent in the request', async ({ page }) => {
    const posted = await setupLeads(page, settingsWith({ 'lead.data_consent': { hidden: true } }));
    await page.goto('/dashboard/crm/leads/new');
    await fillDealer(page);
    await expect(page.locator('#lead-field-first_name')).toHaveValue('Ramesh Sharma');
    await expect(page.getByText('Data consent', { exact: true })).toHaveCount(0);
    await expect(consentTick(page)).toHaveCount(0);
    const submit = page.getByRole('button', { name: 'Create lead' });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/leads\/e2e-lead-1/, { timeout: 20_000 });
    expect(posted.body).not.toBeNull();
    expect(posted.body).not.toHaveProperty('_consent');
  });

  test('hidden for one lead type only: gone on Dealer, still there on Farmers', async ({ page }) => {
    await setupLeads(page, settingsWith({ 'lead.data_consent@b2b': { hidden: true } }));
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.getByRole('tab', { name: 'Dealer' })).toBeVisible();
    await expect(page.locator('#lead-field-company')).toBeVisible();
    await expect(page.getByText('Data consent', { exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Farmers' }).click();
    await expect(page.getByText('Data consent', { exact: true })).toBeVisible();
  });

  test('relabelled and required: the admin\'s name is shown and the tick is mandatory', async ({ page }) => {
    const posted = await setupLeads(page, settingsWith({ 'lead.data_consent': { label: 'Consent to keep this record', required: true } }));
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.getByText('Consent to keep this record', { exact: true })).toBeVisible();
    await expect(page.getByText('Data consent', { exact: true })).toHaveCount(0);
    await fillDealer(page);
    const submit = page.getByRole('button', { name: 'Create lead' });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();
    await expect(page.getByText(/capture the individual.s consent/)).toBeVisible();
    expect(posted.body).toBeNull();
    await consentTick(page).check();
    await submit.click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/leads\/e2e-lead-1/, { timeout: 20_000 });
    expect(posted.body).toMatchObject({ _consent: { consented: true } });
  });
});

test.describe('Agrisynx — Data consent field override (lead detail)', () => {
  test('the consent card shows by default, can be relabelled, and goes when hidden', async ({ page }) => {
    await setupLeads(page);
    await page.goto('/dashboard/crm/leads/e2e-lead-1');
    await expect(page.getByText('Consent (DPDP)', { exact: true })).toBeVisible();
  });

  test('relabelled', async ({ page }) => {
    await setupLeads(page, settingsWith({ 'lead.data_consent': { label: 'Permission to hold data' } }));
    await page.goto('/dashboard/crm/leads/e2e-lead-1');
    await expect(page.getByText('Permission to hold data', { exact: true })).toBeVisible();
    await expect(page.getByText('Consent (DPDP)', { exact: true })).toHaveCount(0);
  });

  test('hidden', async ({ page }) => {
    await setupLeads(page, settingsWith({ 'lead.data_consent': { hidden: true } }));
    await page.goto('/dashboard/crm/leads/e2e-lead-1');
    // Wait for the page itself (the lead's name) so "absent" is not just "not rendered yet".
    await expect(page.getByText('Test', { exact: false }).first()).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByText('Consent (DPDP)', { exact: true })).toHaveCount(0);
  });
});

test.describe('Agrisynx — Data consent is listed in Settings → Custom Fields', () => {
  test('the admin can find Data consent in the lead field list', async ({ page }) => {
    await setupLeads(page);
    await page.goto('/dashboard/crm/settings/custom-fields');
    await expect(page.getByText('Data consent (DPDP)').first()).toBeVisible({ timeout: 20_000 });
  });
});

// ── CRM dashboard: total leads split by lead type, and the Open Volume switch ──────────────────
const SUMMARY = {
  total_leads: 1290, new_leads_30d: 40, open_deals: 3, open_deal_value: 90000, open_deal_volume: 1500,
  won_deals_30d: 1, won_revenue_30d: 20000, win_rate_30d: 0.25, avg_deal_size: 20000, avg_sales_cycle_days: 12, pipeline_velocity: 1, activities_7d: 9, conversion_rate: 0.1,
};

async function setupDashboard(page: Page, o: { summary?: Record<string, unknown>; settings?: unknown; user?: Record<string, unknown>; storedUser?: Record<string, unknown> } = {}) {
  const user = o.user ?? SEED_USER;
  await seedSession(page, o.storedUser ?? user);
  await mockApi(page, {
    settings: o.settings ?? SETTINGS,
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      if (method === 'GET' && url.split('?')[0].endsWith('/crm/analytics/dashboard-complete')) {
        await route.fulfill({ json: { success: true, data: { summary: { ...SUMMARY, ...(o.summary ?? {}) }, funnel: [], pipelineValue: [], winRate: [], forecast: [], leadScoreDistribution: [] } } });
        return true;
      }
      return false;
    },
  });
}

test.describe('Agrisynx — CRM dashboard: total leads by lead type', () => {
  test('a client with named lead types sees "Total leads" split into Dealers and Farmers', async ({ page }) => {
    await setupDashboard(page, { summary: { leads_by_segment: { b2b: 1234, b2c: 56 } } });
    await page.goto('/dashboard/crm/dashboard');
    await expect(page.getByText('Total leads', { exact: true })).toBeVisible();
    await expect(page.getByText('Dealers 1,234 · Farmers 56')).toBeVisible();
    await expect(page.getByText('1,290', { exact: true })).toBeVisible();
    // The existing tile is untouched.
    await expect(page.getByText('New Leads', { exact: true })).toBeVisible();
    await expect(page.getByText('1290 total')).toBeVisible();
  });

  test('no split from the API, nothing new on the dashboard', async ({ page }) => {
    await setupDashboard(page);
    await page.goto('/dashboard/crm/dashboard');
    await expect(page.getByText('New Leads', { exact: true })).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.getByText('Total leads', { exact: true })).toHaveCount(0);
  });

  test('lead types that were never renamed read B2B / B2C', async ({ page }) => {
    await setupDashboard(page, { settings: { success: true, data: { business_type: 'both', config: {} } }, summary: { leads_by_segment: { b2b: 3, b2c: 4 } } });
    await page.goto('/dashboard/crm/dashboard');
    await expect(page.getByText('B2B 3 · B2C 4')).toBeVisible();
  });
});

test.describe('Agrisynx — CRM dashboard: Open Volume switch (app_ui_config.home.open_volume)', () => {
  test('by default the Open Pipeline tile shows its volume', async ({ page }) => {
    await setupDashboard(page);
    await page.goto('/dashboard/crm/dashboard');
    await expect(page.getByText('3 deals · 1.5 MT')).toBeVisible();
  });

  test('open_volume: false hides the volume and keeps the deal count and value', async ({ page }) => {
    const user = { ...SEED_USER, app_ui_config: { home: { open_volume: false } } };
    await setupDashboard(page, { user });
    await page.goto('/dashboard/crm/dashboard');
    await expect(page.getByText('3 deals', { exact: true })).toBeVisible();
    await expect(page.getByText(/MT|kg/)).toHaveCount(0);
    await expect(page.getByText('Open Pipeline', { exact: true })).toBeVisible();
  });

  test('the flag is picked up from /auth/me even when the stored session predates it', async ({ page }) => {
    const user = { ...SEED_USER, app_ui_config: { home: { open_volume: false } } };
    await setupDashboard(page, { user, storedUser: SEED_USER });
    await page.goto('/dashboard/crm/dashboard');
    await expect(page.getByText('3 deals', { exact: true })).toBeVisible();
    await expect(page.getByText('3 deals · 1.5 MT')).toHaveCount(0);
  });

  test('open_volume: true, or other home items hidden, leaves the volume alone', async ({ page }) => {
    const user = { ...SEED_USER, app_ui_config: { home: { open_volume: true, stores: false } } };
    await setupDashboard(page, { user });
    await page.goto('/dashboard/crm/dashboard');
    await expect(page.getByText('3 deals · 1.5 MT')).toBeVisible();
  });
});
