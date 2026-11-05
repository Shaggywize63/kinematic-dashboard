import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark } from './spark';

/**
 * Spark & Ray lead form: a Google address picker on create AND edit that fills the address AND pins the lead at
 * the PICKED address (not at the rep's device position), plus the Industry dropdown with colour dots and the
 * Sub-industry custom field shown right after Industry (and only there). Everything is mocked: the backend
 * Places proxy answers /crm/places/autocomplete + /crm/places/details; the browser reports the rep standing in
 * Bengaluru (12.9716, 77.5946, set in playwright.config.ts) while the picked address is in Pune.
 */

const PICKED = { lat: 18.5204, lng: 73.8567 };
const DETAILS = { address_line1: 'Plot 5, MIDC Bhosari, Pune, Maharashtra 411026', city: 'Pune', state: 'Maharashtra', postal_code: '411026', latitude: PICKED.lat, longitude: PICKED.lng };
const SUB_INDUSTRY_DEF = { id: 'cf-sub', entity_type: 'lead', field_key: 'industry_category', label: 'Industry Category', field_type: 'text', applies_to: 'b2b', position: 5, is_active: true };
const OTHER_DEF = { id: 'cf-other', entity_type: 'lead', field_key: 'visit_note', label: 'Visit note', field_type: 'text', applies_to: 'both', position: 1, is_active: true };
const SETTINGS = { success: true, data: { business_type: 'b2b', config: { field_overrides: { 'lead.city': { hidden: true } } } } };

type Calls = { posted: Record<string, unknown>[]; patched: Record<string, unknown>[]; places: string[] };

async function setup(page: Page, calls: Calls, extra?: (route: Route, p: string, method: string) => Promise<boolean> | boolean) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: SETTINGS,
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (extra && await extra(route, p, method)) return true;
      if (method === 'GET' && p === '/api/v1/crm/custom-fields') return ok(route, [OTHER_DEF, SUB_INDUSTRY_DEF]);
      if (method === 'GET' && p === '/api/v1/crm/places/autocomplete') { calls.places.push(url); return ok(route, [{ place_id: 'pl-1', description: 'Plot 5, MIDC Bhosari, Pune' }]); }
      if (method === 'GET' && p === '/api/v1/crm/places/details') { calls.places.push(url); return ok(route, DETAILS); }
      if (method === 'POST' && p === '/api/v1/crm/leads') { calls.posted.push(route.request().postDataJSON()); return ok(route, { id: 'l-new' }, 201); }
      return false;
    },
  });
}

async function pickAddress(page: Page, q = 'Plot 5 MIDC', text = 'Plot 5, MIDC Bhosari, Pune') {
  await page.getByLabel('Search address').fill(q);
  await page.getByText(text, { exact: true }).click();
}

test.describe('Spark lead create: address picker pins the lead', () => {
  test('picking an address sets the lead pin to that address, not the device GPS', async ({ page }) => {
    const calls: Calls = { posted: [], patched: [], places: [] };
    await scopeToSpark(page);
    await setup(page, calls);
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.getByLabel('Search address')).toBeVisible({ timeout: 30_000 });
    await page.locator('#lead-field-company').fill('Bhosari Forge Pvt Ltd');
    await pickAddress(page);

    await expect(page.locator('#lead-field-address_line1')).toHaveValue(DETAILS.address_line1);
    await expect(page.getByText('Pinned to the selected address')).toBeVisible();
    await expect(page.getByText(`${PICKED.lat.toFixed(6)}, ${PICKED.lng.toFixed(6)}`)).toBeVisible();
    // The GPS "Update" shortcut is gone once the address owns the pin.
    await expect(page.getByRole('button', { name: 'Update', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: /Create lead/i }).click();
    await expect.poll(() => calls.posted.length).toBe(1);
    expect(calls.posted[0]).toMatchObject({ latitude: PICKED.lat, longitude: PICKED.lng, address_line1: DETAILS.address_line1, city: 'Pune', state: 'Maharashtra', postal_code: '411026' });
  });

  test('a device fix that arrives AFTER the pick does not move the pin', async ({ page }) => {
    const calls: Calls = { posted: [], patched: [], places: [] };
    // Slow GPS: the rep's fix lands 2.5s later, long after the address was picked.
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (ok: PositionCallback) => {
        setTimeout(() => ok({ coords: { latitude: 12.9716, longitude: 77.5946, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() } as unknown as GeolocationPosition), 2500);
      };
    });
    await scopeToSpark(page);
    await setup(page, calls);
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.getByLabel('Search address')).toBeVisible({ timeout: 30_000 });
    await page.locator('#lead-field-company').fill('Bhosari Forge Pvt Ltd');
    await pickAddress(page);
    await expect(page.getByText(`${PICKED.lat.toFixed(6)}, ${PICKED.lng.toFixed(6)}`)).toBeVisible();
    await page.waitForTimeout(3500);
    await expect(page.getByText(`${PICKED.lat.toFixed(6)}, ${PICKED.lng.toFixed(6)}`)).toBeVisible();
    await expect(page.getByText('12.971600')).toHaveCount(0);
    await page.getByRole('button', { name: /Create lead/i }).click();
    await expect.poll(() => calls.posted.length).toBe(1);
    expect(calls.posted[0]).toMatchObject({ latitude: PICKED.lat, longitude: PICKED.lng });
  });

  test('with no address picked it falls back to the device location', async ({ page }) => {
    const calls: Calls = { posted: [], patched: [], places: [] };
    await scopeToSpark(page);
    await setup(page, calls);
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.getByLabel('Search address')).toBeVisible({ timeout: 30_000 });
    await page.locator('#lead-field-company').fill('Walk-in Forge');
    await expect(page.getByText('12.971600, 77.594600')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Create lead/i }).click();
    await expect.poll(() => calls.posted.length).toBe(1);
    expect(calls.posted[0]).toMatchObject({ latitude: 12.9716, longitude: 77.5946 });
  });

  test('re-picking an address moves the pin again', async ({ page }) => {
    const calls: Calls = { posted: [], patched: [], places: [] };
    await scopeToSpark(page);
    await setup(page, calls, async (route, p, method) => {
      if (method === 'GET' && p === '/api/v1/crm/places/autocomplete' && new URL(route.request().url()).searchParams.get('q') === 'Chakan') {
        return ok(route, [{ place_id: 'pl-2', description: 'Gate 2, Chakan MIDC, Pune' }]);
      }
      if (method === 'GET' && p === '/api/v1/crm/places/details' && new URL(route.request().url()).searchParams.get('place_id') === 'pl-2') {
        return ok(route, { ...DETAILS, address_line1: 'Gate 2, Chakan MIDC, Pune', latitude: 18.7603, longitude: 73.8629 });
      }
      return false;
    });
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.getByLabel('Search address')).toBeVisible({ timeout: 30_000 });
    await page.locator('#lead-field-company').fill('Chakan Works');
    await pickAddress(page);
    await expect(page.getByText('18.520400, 73.856700')).toBeVisible();
    await pickAddress(page, 'Chakan', 'Gate 2, Chakan MIDC, Pune');
    await expect(page.locator('#lead-field-address_line1')).toHaveValue('Gate 2, Chakan MIDC, Pune');
    await expect(page.getByText('18.760300, 73.862900')).toBeVisible();
  });

  test('a hidden address_line1 drops the picker (field-override gate)', async ({ page }) => {
    const calls: Calls = { posted: [], patched: [], places: [] };
    await scopeToSpark(page);
    await seedSession(page, SEED_USER);
    await mockApi(page, { settings: { success: true, data: { business_type: 'b2b', config: { field_overrides: { 'lead.city': { hidden: true }, 'lead.address_line1': { hidden: true } } } } } });
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.locator('#lead-field-company')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Search address')).toHaveCount(0);
    expect(calls.places).toHaveLength(0);
  });

  test('a non-Spark tenant gets no address picker on a B2B lead', async ({ page }) => {
    const calls: Calls = { posted: [], patched: [], places: [] };
    await setup(page, calls);
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.locator('#lead-field-company')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Search address')).toHaveCount(0);
  });
});

test.describe('Spark lead create: Industry + Sub-industry', () => {
  test('the Industry dropdown shows a colour dot per option and on the selected value', async ({ page }) => {
    const calls: Calls = { posted: [], patched: [], places: [] };
    await scopeToSpark(page);
    await setup(page, calls);
    await page.goto('/dashboard/crm/leads/new');
    const industry = page.locator('#lead-field-industry');
    await expect(industry).toBeVisible({ timeout: 30_000 });
    await industry.click();
    const options = page.getByRole('listbox').getByRole('option');
    await expect(options).toHaveCount(8); // blank + the seven
    const colours = await options.evaluateAll((els) => els.map((e) => e.querySelector('[data-testid="industry-dot"]')?.getAttribute('data-color') ?? null));
    expect(colours).toEqual([null, '#2563EB', '#DC2626', '#16A34A', '#F59E0B', '#7C3AED', '#0891B2', '#6B7280']);
    await page.getByRole('option', { name: 'Automotive' }).click();
    await expect(industry).toContainText('Automotive');
    await expect(industry.locator('[data-testid="industry-dot"]')).toHaveAttribute('data-color', '#DC2626');
  });

  test('Sub-industry sits right after Industry and the custom field is not rendered twice', async ({ page }) => {
    const calls: Calls = { posted: [], patched: [], places: [] };
    await scopeToSpark(page);
    await setup(page, calls);
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.locator('#lead-field-industry')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#lead-cf-industry_category')).toHaveCount(1);
    await expect(page.locator('#lead-cf-industry_category')).toContainText('Sub-industry');
    await expect(page.getByText('Industry Category')).toHaveCount(0);
    // DOM order inside the Company grid: ... Industry, Sub-industry, then the generic custom fields.
    const order = await page.evaluate(() => {
      const a = document.getElementById('lead-field-industry')!.closest('div[style*="flex-direction: column"]')!;
      const sub = document.getElementById('lead-cf-industry_category')!;
      const other = document.getElementById('lead-cf-visit_note')!;
      const follows = (x: Node, y: Node) => !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { subAfterIndustry: follows(a, sub), otherAfterSub: follows(sub, other) };
    });
    expect(order).toEqual({ subAfterIndustry: true, otherAfterSub: true });
  });

  test('the sub-industry value is saved in custom_fields', async ({ page }) => {
    const calls: Calls = { posted: [], patched: [], places: [] };
    await scopeToSpark(page);
    await setup(page, calls);
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.getByLabel('Search address')).toBeVisible({ timeout: 30_000 });
    await page.locator('#lead-field-company').fill('Bhosari Forge Pvt Ltd');
    await page.locator('#lead-cf-industry_category input').fill('Forgings');
    await page.locator('#lead-field-industry').click();
    await page.getByRole('option', { name: 'Manufacturing' }).click();
    await expect(page.getByText(/\d+\.\d{6}, \d+\.\d{6}/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Create lead/i }).click();
    await expect.poll(() => calls.posted.length).toBe(1);
    expect(calls.posted[0]).toMatchObject({ industry: 'Manufacturing', custom_fields: { industry_category: 'Forgings' } });
  });

  test('a non-Spark tenant keeps free-text Industry and the generic "Industry Category" field', async ({ page }) => {
    const calls: Calls = { posted: [], patched: [], places: [] };
    await setup(page, calls);
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.locator('#lead-field-industry')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('input#lead-field-industry')).toHaveCount(1);
    await expect(page.locator('#lead-cf-industry_category')).toContainText('Industry Category');
  });
});

// ── Edit modal ──
const LEAD = {
  id: 'l-1', org_id: 'e2e-org-1', first_name: null, last_name: 'Acme Forge', company: 'Acme Forge', status: 'new', is_b2c: false,
  industry: 'Manufacturing', address_line1: 'Old Rd, Nashik', city: 'Nashik', state: 'Maharashtra', latitude: 19.9975, longitude: 73.7898,
  custom_fields: { industry_category: 'Castings' }, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
};

test.describe('Spark lead edit', () => {
  async function openEdit(page: Page, calls: Calls) {
    await scopeToSpark(page);
    await setup(page, calls, async (route, p, method) => {
      if (method === 'GET' && p === '/api/v1/crm/leads/l-1') return ok(route, LEAD);
      if (method === 'PATCH' && p === '/api/v1/crm/leads/l-1') { calls.patched.push(route.request().postDataJSON()); return ok(route, { ...LEAD, ...route.request().postDataJSON() }); }
      return false;
    });
    await page.goto('/dashboard/crm/leads/l-1');
    await page.getByRole('button', { name: 'Edit lead' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  }

  test('editing the address moves the coordinates to the new address', async ({ page }) => {
    const calls: Calls = { posted: [], patched: [], places: [] };
    await openEdit(page, calls);
    const dialog = page.getByRole('dialog');
    // No GPS shortcut for a lead that already has an address.
    await expect(dialog.getByRole('button', { name: 'Use current location' })).toHaveCount(0);
    await expect(dialog.locator('div:has(> label:text-is("Latitude")) input')).toHaveValue('19.9975');
    await pickAddress(page);
    await expect(dialog.locator('div:has(> label:text-is("Latitude")) input')).toHaveValue(PICKED.lat.toFixed(6));
    await expect(dialog.locator('div:has(> label:text-is("Longitude")) input')).toHaveValue(PICKED.lng.toFixed(6));
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.patched.length).toBe(1);
    expect(calls.patched[0]).toMatchObject({ latitude: PICKED.lat, longitude: PICKED.lng, address_line1: DETAILS.address_line1, postal_code: '411026' });
    // The admin hid City in these settings, so the built-in city / state columns are left untouched.
    expect(calls.patched[0]).not.toHaveProperty('city');
  });

  test('Sub-industry follows Industry in the modal and keeps its saved value', async ({ page }) => {
    const calls: Calls = { posted: [], patched: [], places: [] };
    await openEdit(page, calls);
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('#lead-edit-industry')).toContainText('Manufacturing');
    await expect(dialog.locator('#lead-cf-industry_category')).toHaveCount(1);
    await expect(dialog.locator('#lead-cf-industry_category input')).toHaveValue('Castings');
    await expect(dialog.getByText('Industry Category')).toHaveCount(0);
    await dialog.locator('#lead-cf-industry_category input').fill('Forgings');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.patched.length).toBe(1);
    expect(calls.patched[0]).toMatchObject({ industry: 'Manufacturing', custom_fields: { industry_category: 'Forgings' } });
  });
});
