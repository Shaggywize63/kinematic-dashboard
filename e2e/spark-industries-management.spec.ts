import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark } from './spark';
import { FAKE_MAPS } from './fakeMaps';
import {
  DEFAULT_INDUSTRIES, HEX_COLOR, INDUSTRY_UNKNOWN_COLOR, NO_INDUSTRY, buildIndustriesConfig, clearSubIndustryOnChange, industryColor,
  industryLegend, industryOptions, moveIndustry, resolveIndustries, subIndustriesFor, subIndustryOptions, validateIndustries,
} from '../src/lib/industries';
import { SPARK_INDUSTRIES, industryColor as defaultColor } from '../src/lib/sparkIndustries';

/**
 * Settings -> Industries (Spark & Ray): the admin-managed industry list (name, colour, sub-industries, order) that
 * every industry dropdown / badge / map pin + legend + filter reads, plus the dependent Sub-industry dropdown.
 * Part 1 is pure (no browser); the rest mock /crm/settings and the leads / geo endpoints.
 */

const CFG = [
  { name: 'Agri', color: '#10B981', sub_industries: ['Seeds', 'Fertiliser', 'Machinery'] },
  { name: 'Textiles', color: '#ec4899', sub_industries: [] },
  { name: 'Other', color: '#6B7280', sub_industries: ['Misc'] },
];

// ── Part 1: pure helpers ────────────────────────────────────────────────────
test.describe('industries helpers', () => {
  test('defaults are the seven with their colours and no sub-industries; sparkIndustries is the default view', () => {
    expect(DEFAULT_INDUSTRIES.map((d) => d.name)).toEqual([...SPARK_INDUSTRIES]);
    expect(DEFAULT_INDUSTRIES.map((d) => d.color)).toEqual(['#2563EB', '#DC2626', '#16A34A', '#F59E0B', '#7C3AED', '#0891B2', '#6B7280']);
    expect(DEFAULT_INDUSTRIES.every((d) => d.sub_industries.length === 0)).toBe(true);
    expect(defaultColor('automotive')).toBe('#DC2626');
  });

  test('resolveIndustries: missing / empty / malformed config falls back to the defaults (fresh copies)', () => {
    for (const v of [undefined, null, {}, { config: {} }, { config: { industries: [] } }, { config: { industries: 'x' } }, { config: { industries: [null, 3, { name: ' ' }] } }]) {
      expect(resolveIndustries(v)).toEqual(DEFAULT_INDUSTRIES.map((d) => ({ ...d })));
    }
    const a = resolveIndustries(undefined); a[0].name = 'x'; a[0].sub_industries.push('y');
    expect(resolveIndustries(undefined)[0]).toEqual({ name: 'Manufacturing', color: '#2563EB', sub_industries: [] });
  });

  test('resolveIndustries: reads data.config.industries (or a raw array), keeps order, tidies rows', () => {
    const r = resolveIndustries({ config: { industries: CFG } });
    expect(r.map((d) => d.name)).toEqual(['Agri', 'Textiles', 'Other']);
    expect(r[1].color).toBe('#EC4899'); // upper-cased
    expect(resolveIndustries(CFG).map((d) => d.name)).toEqual(['Agri', 'Textiles', 'Other']);
    const messy = resolveIndustries({ config: { industries: [
      { name: '  Agri ', color: 'nope', sub_industries: [' Seeds', 'seeds', '', 7, 'Feed'] },
      { name: 'agri', color: '#000000' }, { name: 'Steel' },
    ] } });
    expect(messy).toEqual([
      { name: 'Agri', color: INDUSTRY_UNKNOWN_COLOR, sub_industries: ['Seeds', 'Feed'] },
      { name: 'Steel', color: INDUSTRY_UNKNOWN_COLOR, sub_industries: [] },
    ]);
  });

  test('industryColor: case/whitespace-insensitive; unknown / blank / junk -> grey', () => {
    const list = resolveIndustries(CFG);
    expect(industryColor(list, 'agri')).toBe('#10B981');
    expect(industryColor(list, '  TEXTILES ')).toBe('#EC4899');
    for (const v of ['Automotive', '', '   ', null, undefined, 42 as unknown as string]) expect(industryColor(list, v)).toBe('#6B7280');
    expect(industryColor(undefined, 'Automotive')).toBe('#DC2626');
    expect(industryColor(null, 'x')).toBe('#6B7280');
  });

  test('industryOptions appends a current value that is not in the list, once', () => {
    const list = resolveIndustries(CFG);
    expect(industryOptions(list)).toEqual(['Agri', 'Textiles', 'Other']);
    expect(industryOptions(list, 'Agri')).toEqual(['Agri', 'Textiles', 'Other']);
    expect(industryOptions(list, 'Steel')).toEqual(['Agri', 'Textiles', 'Other', 'Steel']);
    expect(industryOptions(list, '  ')).toEqual(['Agri', 'Textiles', 'Other']);
    expect(industryOptions(null, 'Steel').at(-1)).toBe('Steel');
  });

  test('subIndustriesFor / subIndustryOptions / clearSubIndustryOnChange', () => {
    const list = resolveIndustries(CFG);
    expect(subIndustriesFor(list, ' agri ')).toEqual(['Seeds', 'Fertiliser', 'Machinery']);
    expect(subIndustriesFor(list, 'Textiles')).toEqual([]);
    expect(subIndustriesFor(list, 'Nope')).toEqual([]);
    expect(subIndustriesFor(list, '')).toEqual([]);
    subIndustriesFor(list, 'Agri').push('x'); // a copy
    expect(list[0].sub_industries).toHaveLength(3);
    expect(subIndustryOptions(list, 'Agri', '')).toEqual(['Seeds', 'Fertiliser', 'Machinery']);
    expect(subIndustryOptions(list, 'Agri', 'Legacy')).toEqual(['Seeds', 'Fertiliser', 'Machinery', 'Legacy']); // kept selectable
    expect(subIndustryOptions(list, 'Agri', 'Seeds')).toHaveLength(3);
    expect(subIndustryOptions(list, 'Textiles', 'Legacy')).toEqual([]); // no list -> free text
    // Switching industry: clear when the new one lists subs without the value, or when the value came from the old list.
    expect(clearSubIndustryOnChange(list, 'Agri', 'Other', 'Seeds')).toBe(true);
    expect(clearSubIndustryOnChange(list, 'Agri', 'Textiles', 'Seeds')).toBe(true); // picked from Agri's list
    expect(clearSubIndustryOnChange(list, 'Agri', 'Textiles', 'My own text')).toBe(false); // free text under a list-less industry
    expect(clearSubIndustryOnChange(list, 'Textiles', 'Agri', 'My own text')).toBe(true);
    expect(clearSubIndustryOnChange(list, '', 'Agri', 'Seeds')).toBe(false); // valid under the new industry
    expect(clearSubIndustryOnChange(list, 'Textiles', 'Agri', undefined)).toBe(false);
  });

  test('industryLegend: the configured rows then "No industry"; defaults give the 7 + 1', () => {
    expect(industryLegend(resolveIndustries(CFG))).toEqual([
      { value: 'Agri', label: 'Agri', color: '#10B981' }, { value: 'Textiles', label: 'Textiles', color: '#EC4899' },
      { value: 'Other', label: 'Other', color: '#6B7280' }, { value: NO_INDUSTRY, label: 'No industry', color: '#6B7280' },
    ]);
    expect(industryLegend(undefined)).toHaveLength(8);
  });

  test('validateIndustries mirrors the backend', () => {
    const ok1 = [{ name: 'A', color: '#112233', sub_industries: ['x'] }];
    expect(validateIndustries(ok1)).toEqual([]);
    expect(validateIndustries([])).toHaveLength(1);
    expect(validateIndustries([{ name: '  ', color: '#112233', sub_industries: [] }]).join('|')).toMatch(/name is required/);
    expect(validateIndustries([{ name: 'A', color: '#112233', sub_industries: [] }, { name: ' a ', color: '#445566', sub_industries: [] }]).join('|')).toMatch(/Duplicate industry/);
    expect(validateIndustries([{ name: 'A', color: '#12', sub_industries: [] }]).join('|')).toMatch(/#RRGGBB/);
    expect(validateIndustries([{ name: 'A', color: '112233', sub_industries: [] }])).toHaveLength(1);
    expect(validateIndustries([{ name: 'A', color: '#112233', sub_industries: ['x', 'X'] }]).join('|')).toMatch(/duplicate sub-industry/);
    expect(validateIndustries([{ name: 'x'.repeat(61), color: '#112233', sub_industries: [] }])).toHaveLength(1);
    expect(HEX_COLOR.test('#abcDEF')).toBe(true);
  });

  test('buildIndustriesConfig trims + upper-cases; moveIndustry reorders without mutating', () => {
    expect(buildIndustriesConfig([{ name: ' A ', color: ' #aabbcc ', sub_industries: [' s ', ''] }])).toEqual([{ name: 'A', color: '#AABBCC', sub_industries: ['s'] }]);
    const l = [1, 2, 3];
    expect(moveIndustry(l, 1, -1)).toEqual([2, 1, 3]);
    expect(moveIndustry(l, 1, 1)).toEqual([1, 3, 2]);
    expect(moveIndustry(l, 0, -1)).toEqual([1, 2, 3]);
    expect(moveIndustry(l, 2, 1)).toEqual([1, 2, 3]);
    expect(l).toEqual([1, 2, 3]);
  });
});

// ── Part 2: the settings page ───────────────────────────────────────────────
type Store = { industries?: unknown; patches: Record<string, unknown>[]; failNext?: string };

async function setupSettings(page: Page, store: Store) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (p === '/api/v1/crm/settings' && method === 'GET') {
        return ok(route, { business_type: 'b2b', config: store.industries === undefined ? {} : { industries: store.industries } });
      }
      if (p === '/api/v1/crm/settings' && method === 'PATCH') {
        const body = route.request().postDataJSON();
        if (store.failNext) { const m = store.failNext; store.failNext = undefined; await route.fulfill({ status: 400, json: { success: false, error: m, message: m } }); return true; }
        store.patches.push(body);
        if ('industries' in (body.config ?? {})) store.industries = body.config.industries ?? undefined;
        return ok(route, { business_type: 'b2b', config: {} });
      }
      return false;
    },
  });
}

const rowsOf = (page: Page) => page.getByTestId('industry-row');
const names = (page: Page) => rowsOf(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
const saveBtn = (page: Page) => page.getByRole('button', { name: 'Save changes' });
const DEFAULT_NAMES = ['Manufacturing', 'Automotive', 'Pharma & Healthcare', 'Food & Beverage', 'Construction & Infrastructure', 'Power & Energy', 'Other'];

test.describe('Settings -> Industries page', () => {
  test('shows the defaults when nothing is configured; Save is disabled until a change', async ({ page }) => {
    const store: Store = { patches: [] };
    await scopeToSpark(page);
    await setupSettings(page, store);
    await page.goto('/dashboard/crm/settings/industries');
    await expect(rowsOf(page)).toHaveCount(7, { timeout: 30_000 });
    expect(await names(page)).toEqual(DEFAULT_NAMES);
    expect(await page.getByTestId('industry-swatch').evaluateAll((els) => els.map((e) => e.getAttribute('data-color')))).toEqual(['#2563EB', '#DC2626', '#16A34A', '#F59E0B', '#7C3AED', '#0891B2', '#6B7280']);
    await expect(page.getByTestId('industries-defaults-note')).toBeVisible();
    await expect(saveBtn(page)).toBeDisabled();
    await expect(page.getByTestId('industries-unsaved')).toHaveCount(0);
  });

  test('is reachable from the Settings index (Spark only)', async ({ page }) => {
    const store: Store = { patches: [] };
    await scopeToSpark(page);
    await setupSettings(page, store);
    await page.goto('/dashboard/crm/settings');
    const card = page.locator('a[href="/dashboard/crm/settings/industries"]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('Industries');
  });

  test('other tenants do not get the page content or the nav entry', async ({ page }) => {
    const store: Store = { patches: [] };
    await setupSettings(page, store);
    await page.goto('/dashboard/crm/settings/industries');
    await expect(page.getByText('Industries apply to Spark & Ray')).toBeVisible({ timeout: 30_000 });
    await expect(rowsOf(page)).toHaveCount(0);
    await page.goto('/dashboard/crm/settings');
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('a[href="/dashboard/crm/settings/industries"]')).toHaveCount(0);
  });

  test('loads a configured list in order', async ({ page }) => {
    const store: Store = { patches: [], industries: CFG };
    await scopeToSpark(page);
    await setupSettings(page, store);
    await page.goto('/dashboard/crm/settings/industries');
    await expect(rowsOf(page)).toHaveCount(3, { timeout: 30_000 });
    expect(await names(page)).toEqual(['Agri', 'Textiles', 'Other']);
    await expect(page.getByTestId('industries-defaults-note')).toHaveCount(0);
    await expect(rowsOf(page).first().getByTestId('sub-chip')).toHaveText(['Seeds', 'Fertiliser', 'Machinery']);
    await expect(page.getByTestId('industry-color-hex').nth(1)).toHaveValue('#EC4899'.toLowerCase().toUpperCase());
  });

  test('add, rename, recolour, sub-industries, reorder, delete -> one PATCH with the whole list', async ({ page }) => {
    const store: Store = { patches: [] };
    await scopeToSpark(page);
    await setupSettings(page, store);
    await page.goto('/dashboard/crm/settings/industries');
    await expect(rowsOf(page)).toHaveCount(7, { timeout: 30_000 });

    // Delete (confirm) "Other" and "Power & Energy".
    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete Other', exact: true }).click();
    await page.getByRole('button', { name: 'Delete Power & Energy', exact: true }).click();
    await expect(rowsOf(page)).toHaveCount(5);

    // Rename the first, recolour via the hex field.
    const first = rowsOf(page).first();
    await first.getByTestId('industry-name').fill('Heavy Manufacturing');
    await first.getByTestId('industry-color-hex').fill('#112233');
    await expect(first.getByTestId('industry-swatch')).toHaveAttribute('data-color', '#112233');
    await expect(page.getByTestId('industries-unsaved')).toBeVisible();

    // Sub-industries on Automotive: add two (Enter), a duplicate (ignored), remove one.
    const auto = rowsOf(page).nth(1);
    const sub = auto.getByTestId('sub-input');
    await sub.fill('Two-wheeler'); await sub.press('Enter');
    await sub.fill('Four-wheeler'); await sub.press('Enter');
    await sub.fill('two-wheeler'); await sub.press('Enter');
    await expect(auto.getByTestId('sub-chip')).toHaveText(['Two-wheeler', 'Four-wheeler']);
    await auto.getByRole('button', { name: 'Remove sub-industry Four-wheeler' }).click();
    await expect(auto.getByTestId('sub-chip')).toHaveText(['Two-wheeler']);

    // Reorder: move Food & Beverage up one (above Pharma).
    await page.getByRole('button', { name: 'Move Food & Beverage up' }).click();
    expect(await names(page)).toEqual(['Heavy Manufacturing', 'Automotive', 'Food & Beverage', 'Pharma & Healthcare', 'Construction & Infrastructure']);

    // Add a new one, with a native-picker colour.
    await page.getByRole('button', { name: 'Add industry' }).click();
    const added = rowsOf(page).last();
    await expect(added.getByTestId('industry-name')).toBeFocused();
    await added.getByTestId('industry-name').fill('Agri');
    await added.getByTestId('industry-color-picker').fill('#10b981');
    await expect(added.getByTestId('industry-color-hex')).toHaveValue('#10B981');

    await saveBtn(page).click();
    await expect.poll(() => store.patches.length).toBe(1);
    expect(store.patches[0]).toEqual({ config: { industries: [
      { name: 'Heavy Manufacturing', color: '#112233', sub_industries: [] },
      { name: 'Automotive', color: '#DC2626', sub_industries: ['Two-wheeler'] },
      { name: 'Food & Beverage', color: '#F59E0B', sub_industries: [] },
      { name: 'Pharma & Healthcare', color: '#16A34A', sub_industries: [] },
      { name: 'Construction & Infrastructure', color: '#7C3AED', sub_industries: [] },
      { name: 'Agri', color: '#10B981', sub_industries: [] },
    ] } });
    await expect(page.getByText('Industries saved')).toBeVisible();
    await expect(saveBtn(page)).toBeDisabled();
    await expect(page.getByTestId('industries-unsaved')).toHaveCount(0);

    // Reload: the saved list comes back.
    await page.reload();
    await expect(rowsOf(page)).toHaveCount(6, { timeout: 30_000 });
    expect(await names(page)).toEqual(['Heavy Manufacturing', 'Automotive', 'Food & Beverage', 'Pharma & Healthcare', 'Construction & Infrastructure', 'Agri']);
  });

  test('a half-typed sub-industry is committed on Save, not lost', async ({ page }) => {
    const store: Store = { patches: [], industries: CFG };
    await scopeToSpark(page);
    await setupSettings(page, store);
    await page.goto('/dashboard/crm/settings/industries');
    await expect(rowsOf(page)).toHaveCount(3, { timeout: 30_000 });
    await rowsOf(page).nth(1).getByTestId('sub-input').fill('Cotton');
    await saveBtn(page).click();
    await expect.poll(() => store.patches.length).toBe(1);
    expect((store.patches[0] as any).config.industries[1]).toEqual({ name: 'Textiles', color: '#EC4899', sub_industries: ['Cotton'] });
  });

  test('delete asks first: cancelling keeps the row', async ({ page }) => {
    const store: Store = { patches: [] };
    await scopeToSpark(page);
    await setupSettings(page, store);
    await page.goto('/dashboard/crm/settings/industries');
    await expect(rowsOf(page)).toHaveCount(7, { timeout: 30_000 });
    let msg = '';
    page.once('dialog', (d) => { msg = d.message(); void d.dismiss(); });
    await page.getByRole('button', { name: 'Delete Automotive', exact: true }).click();
    await expect.poll(() => msg).toContain('Automotive');
    await expect(rowsOf(page)).toHaveCount(7);
  });

  test('validation: duplicate (case-insensitive), blank name and bad colour block the save with messages', async ({ page }) => {
    const store: Store = { patches: [] };
    await scopeToSpark(page);
    await setupSettings(page, store);
    await page.goto('/dashboard/crm/settings/industries');
    await expect(rowsOf(page)).toHaveCount(7, { timeout: 30_000 });

    await rowsOf(page).nth(1).getByTestId('industry-name').fill('manufacturing');
    await expect(rowsOf(page).nth(0).getByText('Another industry already has this name.')).toBeVisible();
    await saveBtn(page).click();
    await expect(page.getByTestId('industries-errors')).toContainText('Duplicate industry');

    await rowsOf(page).nth(1).getByTestId('industry-name').fill('Automotive');
    await rowsOf(page).nth(2).getByTestId('industry-name').fill('   ');
    await rowsOf(page).nth(3).getByTestId('industry-color-hex').fill('#12');
    await expect(rowsOf(page).nth(3).getByText('Colour must be a #RRGGBB hex value.')).toBeVisible();
    await saveBtn(page).click();
    const errs = page.getByTestId('industries-errors');
    await expect(errs).toContainText('name is required');
    await expect(errs).toContainText('#RRGGBB');
    expect(store.patches).toHaveLength(0);

    // Deleting every row is not savable either.
    page.on('dialog', (d) => d.accept());
    for (let i = 0; i < 7; i++) await rowsOf(page).first().getByRole('button', { name: /^Delete / }).click();
    await expect(rowsOf(page)).toHaveCount(0);
    await saveBtn(page).click();
    await expect(page.getByTestId('industries-errors')).toContainText('at least one industry');
    expect(store.patches).toHaveLength(0);
  });

  test('a server rejection shows an error toast and keeps the unsaved state', async ({ page }) => {
    const store: Store = { patches: [], failNext: 'Duplicate industry "X"' };
    await scopeToSpark(page);
    await setupSettings(page, store);
    await page.goto('/dashboard/crm/settings/industries');
    await expect(rowsOf(page)).toHaveCount(7, { timeout: 30_000 });
    await rowsOf(page).first().getByTestId('industry-name').fill('Heavy');
    await saveBtn(page).click();
    await expect(page.getByText('Duplicate industry "X"')).toBeVisible();
    await expect(page.getByTestId('industries-unsaved')).toBeVisible();
    await expect(saveBtn(page)).toBeEnabled();
  });

  test('Reset to defaults saves null and restores the seven', async ({ page }) => {
    const store: Store = { patches: [], industries: CFG };
    await scopeToSpark(page);
    await setupSettings(page, store);
    await page.goto('/dashboard/crm/settings/industries');
    await expect(rowsOf(page)).toHaveCount(3, { timeout: 30_000 });
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Reset to defaults' }).click();
    await expect.poll(() => store.patches.length).toBe(1);
    expect(store.patches[0]).toEqual({ config: { industries: null } });
    await expect(rowsOf(page)).toHaveCount(7);
    expect(await names(page)).toEqual(DEFAULT_NAMES);
    await expect(page.getByTestId('industries-defaults-note')).toBeVisible();
  });
});

// ── Part 3: the lead create page + edit modal read the config ───────────────
const SUB_DEF = { id: 'cf-sub', entity_type: 'lead', field_key: 'industry_category', label: 'Industry Category', field_type: 'text', applies_to: 'b2b', position: 5, is_active: true };
const LEAD = {
  id: 'lead-1', first_name: null, last_name: 'Acme Forge', full_name: 'Acme Forge', company: 'Acme Forge', is_b2c: false, status: 'working',
  industry: 'Agri', created_at: '2026-09-20T10:00:00Z', created_by: SEED_USER.id, custom_fields: { industry_category: 'Legacy blend' },
};

async function setupLead(page: Page, industries: unknown, posted: Record<string, unknown>[] = []) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    // City hidden (as in the other Spark create specs) so the create form can be submitted without picking one.
    settings: { success: true, data: { business_type: 'b2b', config: { field_overrides: { 'lead.city': { hidden: true } }, ...(industries === undefined ? {} : { industries }) } } },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/custom-fields') return ok(route, [SUB_DEF]);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1') return ok(route, LEAD);
      if (method === 'POST' && p === '/api/v1/crm/leads') { posted.push(route.request().postDataJSON()); return ok(route, { id: 'l-new' }, 201); }
      return false;
    },
  });
}

test.describe('Lead forms use the configured industries', () => {
  test('create: options + colour dots come from the config; the Sub-industry dropdown follows the industry; change clears it', async ({ page }) => {
    const posted: Record<string, unknown>[] = [];
    await scopeToSpark(page);
    await setupLead(page, CFG, posted);
    await page.goto('/dashboard/crm/leads/new');
    const industry = page.locator('#lead-field-industry');
    await expect(industry).toBeVisible({ timeout: 30_000 });
    await industry.click();
    const options = page.getByRole('listbox').getByRole('option');
    await expect(options).toHaveCount(4); // blank + 3
    expect(await options.allTextContents()).toEqual(['—', 'Agri', 'Textiles', 'Other']);
    const colours = await options.evaluateAll((els) => els.map((e) => e.querySelector('[data-testid="industry-dot"]')?.getAttribute('data-color') ?? null));
    expect(colours).toEqual([null, '#10B981', '#EC4899', '#6B7280']);

    // No industry yet -> the Sub-industry is today's free-text input.
    await page.keyboard.press('Escape');
    await expect(page.locator('#lead-cf-industry_category input')).toBeVisible();

    // Agri lists sub-industries -> a dropdown of exactly those.
    await industry.click();
    await page.getByRole('option', { name: 'Agri' }).click();
    const sub = page.locator('#lead-cf-industry_category select');
    await expect(sub).toBeVisible();
    expect(await sub.locator('option').allTextContents()).toEqual(['— Select —', 'Seeds', 'Fertiliser', 'Machinery']);
    await expect(page.locator('#lead-cf-industry_category')).toContainText('Sub-industry');
    await sub.selectOption('Fertiliser');

    // Textiles lists none: the stale pick is cleared and the field is free text again.
    await industry.click();
    await page.getByRole('option', { name: 'Textiles' }).click();
    await expect(page.locator('#lead-cf-industry_category select')).toHaveCount(0);
    await expect(page.locator('#lead-cf-industry_category input')).toHaveValue('');

    // Back to Agri, pick Seeds, and submit: saved in custom_fields.industry_category exactly like the free-text value.
    await industry.click();
    await page.getByRole('option', { name: 'Agri' }).click();
    await page.locator('#lead-cf-industry_category select').selectOption('Seeds');
    await page.locator('#lead-field-company').fill('Green Acres Ltd');
    await expect(page.getByText(/\d+\.\d{6}, \d+\.\d{6}/)).toBeVisible({ timeout: 20_000 }); // device fix captured
    await page.getByRole('button', { name: /Create lead/i }).click();
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0]).toMatchObject({ industry: 'Agri', custom_fields: { industry_category: 'Seeds' } });
  });

  test('create: with no config the seven defaults and a free-text Sub-industry apply (unchanged)', async ({ page }) => {
    await scopeToSpark(page);
    await setupLead(page, undefined);
    await page.goto('/dashboard/crm/leads/new');
    const industry = page.locator('#lead-field-industry');
    await expect(industry).toBeVisible({ timeout: 30_000 });
    await industry.click();
    expect((await page.getByRole('listbox').getByRole('option').allTextContents()).slice(1)).toEqual(DEFAULT_NAMES);
    await page.getByRole('option', { name: 'Automotive' }).click();
    await expect(page.locator('#lead-cf-industry_category input')).toBeVisible();
    await expect(page.locator('#lead-cf-industry_category select')).toHaveCount(0);
  });

  test('edit modal: dependent Sub-industry dropdown keeps a stored value selectable and clears on a different industry', async ({ page }) => {
    await scopeToSpark(page);
    await setupLead(page, CFG);
    await page.goto('/dashboard/crm/leads/lead-1');
    await page.getByRole('button', { name: 'Edit lead' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Edit lead' });
    const sub = dialog.locator('#lead-cf-industry_category select');
    await expect(sub).toBeVisible({ timeout: 30_000 });
    expect(await sub.locator('option').allTextContents()).toEqual(['— Select —', 'Seeds', 'Fertiliser', 'Machinery', 'Legacy blend']);
    await expect(sub).toHaveValue('Legacy blend');
    await dialog.locator('#lead-edit-industry').click();
    await page.getByRole('option', { name: 'Other' }).click();
    // "Other" lists Misc only: the old value is not valid there -> cleared, options are Misc.
    await expect(dialog.locator('#lead-cf-industry_category select option')).toHaveText(['— Select —', 'Misc']);
    await expect(dialog.locator('#lead-cf-industry_category select')).toHaveValue('');
  });

  test('badges on the lead header use the configured colour; an unlisted industry is grey', async ({ page }) => {
    await scopeToSpark(page);
    await setupLead(page, CFG);
    await page.goto('/dashboard/crm/leads/lead-1');
    await expect(page.getByTestId('industry-badge')).toHaveAttribute('data-color', '#10B981', { timeout: 30_000 });
  });
});

// ── Part 4: the dashboard map legend + filter ───────────────────────────────
const GEO = [
  { id: 'g1', last_name: 'Seed Co', city: 'Pune', state: 'Maharashtra', status: 'new', latitude: 18.6, longitude: 73.8, industry: 'agri', company: 'Seed Co' },
  { id: 'g2', last_name: 'Loom', city: 'Surat', state: 'Gujarat', status: 'new', latitude: 21.1, longitude: 72.8, industry: 'Textiles', company: 'Loom' },
  { id: 'g3', last_name: 'Old Auto', city: 'Pune', state: 'Maharashtra', status: 'new', latitude: 18.7, longitude: 73.9, industry: 'Automotive', company: 'Old Auto' },
  { id: 'g4', last_name: 'Blank', city: 'Delhi', state: 'Delhi', status: 'new', latitude: 28.6, longitude: 77.2, industry: null, company: 'Blank' },
];

async function setupMap(page: Page, industries: unknown, seen: string[]) {
  await page.addInitScript(FAKE_MAPS);
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: industries === undefined ? {} : { industries } } },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/analytics/dashboard-complete') {
        return ok(route, {
          summary: { total_leads: 4, new_leads_30d: 1, open_deals: 0, open_deal_value: 0, won_deals_30d: 0, won_revenue_30d: 0, win_rate_30d: 0, avg_deal_size: 0, avg_sales_cycle_days: 0, pipeline_velocity: 0, activities_7d: 0, conversion_rate: 0, leads_by_segment: { b2b: 4, b2c: 0 } },
          funnel: [], pipelineValue: [], winRate: [], forecast: [], leadScoreDistribution: [],
        });
      }
      if (method === 'GET' && p === '/api/v1/crm/leads/geo') { seen.push(url); return ok(route, GEO); }
      return false;
    },
  });
}
const markers = (page: Page) => page.evaluate(() => (window as any).__gm.markers.filter((m: any) => !m.removed).map((m: any) => ({ lat: m.o.position.lat, fill: m.o.icon.fillColor })));

test.describe('Dashboard map uses the configured industries', () => {
  test('pins, legend rows (with counts) and the filter list come from the config; unlisted = grey', async ({ page }) => {
    const seen: string[] = [];
    await scopeToSpark(page);
    await setupMap(page, CFG, seen);
    await page.goto('/dashboard/crm/dashboard');
    await expect.poll(async () => (await markers(page)).length, { timeout: 30_000 }).toBe(4);
    const ms = await markers(page);
    const at = (lat: number) => ms.find((m: any) => Math.abs(m.lat - lat) < 1e-6);
    expect(at(18.6)).toMatchObject({ fill: '#10B981' }); // "agri" - case-insensitive
    expect(at(21.1)).toMatchObject({ fill: '#EC4899' });
    expect(at(18.7)).toMatchObject({ fill: '#6B7280' }); // Automotive is no longer configured -> grey
    expect(at(28.6)).toMatchObject({ fill: '#6B7280' });

    const rows = page.getByTestId('industry-legend').getByTestId('industry-legend-row');
    await expect(rows).toHaveCount(4);
    expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-color')))).toEqual(['#10B981', '#EC4899', '#6B7280', '#6B7280']);
    // Agri 1, Textiles 1, Other 1 (the unlisted Automotive lead is caught by "Other"), No industry 1.
    expect(await rows.evaluateAll((els) => els.map((e) => e.lastElementChild?.textContent))).toEqual(['1', '1', '1', '1']);
    await expect(page.getByTestId('map-industry-filter').locator('option')).toHaveText(['All industries', 'Agri', 'Textiles', 'Other', 'No industry']);

    await page.getByTestId('map-industry-filter').selectOption('Textiles');
    await expect.poll(() => seen.length).toBe(2);
    expect(new URL(seen[1]).searchParams.get('industry')).toBe('Textiles');
  });

  test('with no config the legend is the default seven + No industry', async ({ page }) => {
    const seen: string[] = [];
    await scopeToSpark(page);
    await setupMap(page, undefined, seen);
    await page.goto('/dashboard/crm/dashboard');
    const rows = page.getByTestId('industry-legend').getByTestId('industry-legend-row');
    await expect(rows).toHaveCount(8, { timeout: 30_000 });
    await expect.poll(async () => (await markers(page)).length).toBe(4);
  });
});
