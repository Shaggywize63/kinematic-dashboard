import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, PRODUCTS, scopeToSpark, USERS } from './spark';
import {
  buildDealSectionPayload, buildDealSectionsConfig, computeFinalPrice, emptyDealSectionValues, enabledDealSections,
  extractDealSections, moveDealSection, resolveDealSections, seedDealSectionValues, validateDealSections,
} from '../src/lib/sparkDealSections';

/**
 * Spark & Ray deal sections (Quotation -> Pricing -> Product trial -> Approvals & people) on deals/new, the deal
 * Edit modal and the deal detail, driven by crm_settings.config.deal_sections (enabled / label / position); and
 * the Settings -> Deal sections admin page that writes it. Other tenants keep the standard deal pages.
 */

const PIPELINES = [{ id: 'pl-1', name: 'Standard', is_default: true, stages: [{ id: 'st-1', name: 'New' }] }];
const ACCOUNTS = [{ id: 'acc-1', name: 'Acme Forge' }];
const DEAL = {
  id: 'deal-1', org_id: 'e2e-org-1', name: 'Plugs for Q3', pipeline_id: 'pl-1', stage_id: 'st-1', stage_name: 'New', status: 'open', amount: 4100,
  quotation_no: 'QT-2026-014',
  pricing_quoted: 10000, pricing_discount_pct: 12.5, pricing_final: 8750, pricing_valid_till: '2026-12-31',
  trial_required: true, trial_start: '2026-11-10', trial_end: '2026-11-20', trial_result: 'pending', trial_notes: 'Run on line 2',
  technical_approval_by: 'u-asha', technical_approval_by_name: 'Asha Rao', prepared_by: 'u-ravi', prepared_by_name: 'Ravi Kumar',
  checked_by: null, checked_by_name: null, supervisor_id: 'u-meera', supervisor_id_name: 'Meera Iyer',
  created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
};

type Seen = { posted: Record<string, any>[]; patched: Record<string, any>[]; settingsPatched: Record<string, any>[] };
const fresh = (): Seen => ({ posted: [], patched: [], settingsPatched: [] });

async function setup(page: Page, seen: Seen, dealSections?: Record<string, unknown>) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: dealSections ? { deal_sections: dealSections } : {} } },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/users') return ok(route, USERS);
      if (method === 'GET' && p === '/api/v1/crm/pipelines') return ok(route, PIPELINES);
      if (method === 'GET' && p === '/api/v1/crm/products') return ok(route, PRODUCTS);
      if (method === 'GET' && p === '/api/v1/crm/accounts') return ok(route, ACCOUNTS);
      if (method === 'POST' && p === '/api/v1/crm/deals') { seen.posted.push(route.request().postDataJSON()); return ok(route, { id: 'deal-1', name: 'Created', status: 'open' }, 201); }
      if (method === 'GET' && p === '/api/v1/crm/deals/deal-1') return ok(route, DEAL);
      if (method === 'PATCH' && p === '/api/v1/crm/deals/deal-1') { seen.patched.push(route.request().postDataJSON()); return ok(route, { ...DEAL, ...route.request().postDataJSON() }); }
      if (method === 'PATCH' && p === '/api/v1/crm/settings') { seen.settingsPatched.push(route.request().postDataJSON()); return ok(route, { business_type: 'both', config: route.request().postDataJSON().config }); }
      return false;
    },
  });
}

// The create form's pipeline / client-scope effects reset fields when they land, so wait for the page to settle.
const openNew = async (page: Page) => {
  await page.goto('/dashboard/crm/deals/new');
  await expect(page.getByRole('heading', { name: 'New Deal' })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
};
const headings = (page: Page) => page.getByTestId('deal-sections').locator('section > div:first-child');
const pickUser = async (page: Page, label: string, name: string) => {
  const box = page.getByLabel(label, { exact: true });
  await box.click();
  await page.getByText(name, { exact: true }).click();
};

test.describe('deal sections: deals/new', () => {
  test('Spark shows the four sections in order; pricing is live; the body carries every section field', async ({ page }) => {
    const seen = fresh();
    await scopeToSpark(page);
    await setup(page, seen);
    await openNew(page);
    await expect(headings(page)).toHaveText(['Quotation', 'Pricing', 'Product trial', 'Approvals & people']);

    await page.getByLabel('Name', { exact: true }).fill('Plugs for Q3');
    await page.getByLabel('Quotation number').fill('QT-2026-014');

    // Pricing: final = quoted less discount, live.
    await page.getByLabel('Quoted price').fill('10000');
    await expect(page.getByTestId('pricing-final')).toHaveValue('10000');
    await page.getByLabel('Discount %').fill('12.5');
    await expect(page.getByTestId('pricing-final')).toHaveValue('8750');
    await page.getByLabel('Valid till').fill('2026-12-31');

    // Trial: details only appear when a trial is needed.
    await expect(page.getByLabel('Trial start')).toHaveCount(0);
    await page.getByLabel('Trial needed').selectOption('yes');
    await page.getByLabel('Trial start').fill('2026-11-10');
    await page.getByLabel('Trial end').fill('2026-11-20');
    await page.getByLabel('Trial result').selectOption('pending');
    await page.getByLabel('Trial notes').fill('Run on line 2');

    // People: dropdowns of the org's users.
    await pickUser(page, 'Technical approval given by', 'Asha Rao');
    await pickUser(page, 'Prepared by', 'Ravi Kumar');
    await pickUser(page, 'Checked by', 'Meera Iyer');
    await pickUser(page, 'Supervisor name', 'Asha Rao');

    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/deals\/deal-1/, { timeout: 20_000 });
    expect(seen.posted).toHaveLength(1);
    expect(seen.posted[0]).toMatchObject({
      quotation_no: 'QT-2026-014',
      pricing_quoted: 10000, pricing_discount_pct: 12.5, pricing_final: 8750, pricing_valid_till: '2026-12-31',
      trial_required: true, trial_start: '2026-11-10', trial_end: '2026-11-20', trial_result: 'pending', trial_notes: 'Run on line 2',
      technical_approval_by: 'u-asha', prepared_by: 'u-ravi', checked_by: 'u-meera', supervisor_id: 'u-asha',
    });
  });

  test('a trial that ends before it starts is blocked client-side', async ({ page }) => {
    const seen = fresh();
    await scopeToSpark(page);
    await setup(page, seen);
    await openNew(page);
    await page.getByLabel('Name', { exact: true }).fill('Bad trial');
    await page.getByLabel('Trial needed').selectOption('yes');
    await page.getByLabel('Trial start').fill('2026-11-20');
    await page.getByLabel('Trial end').fill('2026-11-10');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Trial end must be on or after the trial start' })).toBeVisible();
    expect(seen.posted).toHaveLength(0);
    // Same day is fine.
    await page.getByLabel('Trial end').fill('2026-11-20');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect.poll(() => seen.posted.length).toBe(1);
  });

  test('a discount above 100 is rejected', async ({ page }) => {
    const seen = fresh();
    await scopeToSpark(page);
    await setup(page, seen);
    await openNew(page);
    await page.getByLabel('Name', { exact: true }).fill('Too generous');
    await page.getByLabel('Quoted price').fill('100');
    await page.getByLabel('Discount %').fill('150');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Discount must be between 0 and 100' })).toBeVisible();
    expect(seen.posted).toHaveLength(0);
  });

  test('config: a disabled section is hidden and not sent; labels and order are honoured', async ({ page }) => {
    const seen = fresh();
    await scopeToSpark(page);
    await setup(page, seen, {
      quotation: { label: 'Quote', position: 3 },
      pricing: { enabled: false, position: 1 },
      product_trial: { position: 2 },
      approvals: { label: 'Sign-off', position: 0 },
    });
    await openNew(page);
    await expect(headings(page)).toHaveText(['Sign-off', 'Product trial', 'Quote']);
    await expect(page.getByLabel('Quoted price')).toHaveCount(0);
    await page.getByLabel('Name', { exact: true }).fill('Configured');
    await page.getByLabel('Quotation number').fill('Q-1');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect.poll(() => seen.posted.length).toBe(1);
    const keys = Object.keys(seen.posted[0]);
    for (const k of ['pricing_quoted', 'pricing_discount_pct', 'pricing_final', 'pricing_valid_till']) expect(keys).not.toContain(k);
    expect(seen.posted[0].quotation_no).toBe('Q-1');
    expect(seen.posted[0].trial_required).toBe(false);
  });

  test('a disabled Quotation section hides the number and the product lines', async ({ page }) => {
    const seen = fresh();
    await scopeToSpark(page);
    await setup(page, seen, { quotation: { enabled: false } });
    await openNew(page);
    await expect(page.getByLabel('Quotation number')).toHaveCount(0);
    await expect(page.getByTestId('deal-items')).toHaveCount(0);
    await page.getByLabel('Name', { exact: true }).fill('No quotation');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect.poll(() => seen.posted.length).toBe(1);
    expect(Object.keys(seen.posted[0])).not.toContain('quotation_no');
    expect(Object.keys(seen.posted[0])).not.toContain('items');
  });

  test('non-Spark: no sections and none of the fields in the payload', async ({ page }) => {
    const seen = fresh();
    await setup(page, seen);
    await openNew(page);
    await expect(page.getByTestId('deal-sections')).toHaveCount(0);
    await expect(page.getByLabel('Quoted price')).toHaveCount(0);
    await page.getByLabel('Name', { exact: true }).fill('Plain');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect.poll(() => seen.posted.length).toBe(1);
    for (const k of ['quotation_no', 'pricing_quoted', 'pricing_final', 'trial_required', 'prepared_by', 'supervisor_id']) expect(Object.keys(seen.posted[0])).not.toContain(k);
  });
});

test.describe('deal sections: detail + edit modal', () => {
  test('detail shows the sections read-only, people by name', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page, fresh());
    await page.goto('/dashboard/crm/deals/deal-1');
    const view = page.getByTestId('deal-sections-view');
    await expect(view).toBeVisible({ timeout: 30_000 });
    await expect(view.getByTestId('deal-section-view-quotation')).toContainText('QT-2026-014');
    const pricing = view.getByTestId('deal-section-view-pricing');
    await expect(pricing).toContainText('10,000');
    await expect(pricing).toContainText('12.5%');
    await expect(pricing).toContainText('8,750');
    await expect(pricing).toContainText('31 Dec 2026');
    const trial = view.getByTestId('deal-section-view-product_trial');
    await expect(trial).toContainText('Yes');
    await expect(trial).toContainText('Pending');
    await expect(trial).toContainText('Run on line 2');
    const people = view.getByTestId('deal-section-view-approvals');
    await expect(people).toContainText('Asha Rao');
    await expect(people).toContainText('Ravi Kumar');
    await expect(people).toContainText('Meera Iyer');
    // Checked by was never set.
    await expect(people.getByText('Checked by').locator('xpath=..')).toContainText('—');
  });

  test('detail honours a disabled section and a renamed one', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page, fresh(), { pricing: { enabled: false }, approvals: { label: 'Sign-off' } });
    await page.goto('/dashboard/crm/deals/deal-1');
    await expect(page.getByTestId('deal-sections-view')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('deal-section-view-pricing')).toHaveCount(0);
    await expect(page.getByTestId('deal-section-view-approvals')).toContainText('Sign-off');
  });

  test('non-Spark detail: no sections card', async ({ page }) => {
    await setup(page, fresh());
    await page.goto('/dashboard/crm/deals/deal-1');
    await expect(page.getByText('Plugs for Q3').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('deal-sections-view')).toHaveCount(0);
  });

  test('Edit modal: seeded, the final price recomputes, and the PATCH carries the sections', async ({ page }) => {
    const seen = fresh();
    await scopeToSpark(page);
    await setup(page, seen);
    await page.goto('/dashboard/crm/deals/deal-1');
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click({ timeout: 30_000 });
    const dialog = page.getByRole('dialog', { name: 'Edit Deal' });
    await expect(dialog.getByLabel('Quoted price')).toHaveValue('10000');
    await expect(dialog.getByTestId('pricing-final')).toHaveValue('8750');
    await expect(dialog.getByLabel('Trial needed')).toHaveValue('yes');
    await expect(dialog.getByLabel('Prepared by', { exact: true })).toHaveValue('Ravi Kumar');
    await dialog.getByLabel('Discount %').fill('20');
    await expect(dialog.getByTestId('pricing-final')).toHaveValue('8000');
    await dialog.getByLabel('Trial end').fill('2026-11-05'); // before the 10th
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: 'Trial end must be on or after' })).toBeVisible();
    expect(seen.patched).toHaveLength(0);
    await dialog.getByLabel('Trial end').fill('2026-11-25');
    await dialog.getByLabel('Valid till').fill('');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => seen.patched.length).toBe(1);
    expect(seen.patched[0]).toMatchObject({
      pricing_quoted: 10000, pricing_discount_pct: 20, pricing_final: 8000, pricing_valid_till: null,
      trial_required: true, trial_end: '2026-11-25', technical_approval_by: 'u-asha', prepared_by: 'u-ravi', supervisor_id: 'u-meera', checked_by: null,
    });
  });

  test('non-Spark Edit modal: no sections and no section fields in the PATCH', async ({ page }) => {
    const seen = fresh();
    await setup(page, seen);
    await page.goto('/dashboard/crm/deals/deal-1');
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click({ timeout: 30_000 });
    const dialog = page.getByRole('dialog', { name: 'Edit Deal' });
    await expect(dialog.getByLabel('Quoted price')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => seen.patched.length).toBe(1);
    for (const k of ['quotation_no', 'pricing_quoted', 'trial_required', 'prepared_by']) expect(Object.keys(seen.patched[0])).not.toContain(k);
  });
});

test.describe('deal sections: Settings -> Deal sections', () => {
  const row = (page: Page, key: string) => page.getByTestId(`deal-section-row-${key}`);

  test('lists the four sections; toggle, rename and reorder update the live preview; Save PATCHes the whole object', async ({ page }) => {
    const seen = fresh();
    await scopeToSpark(page);
    await setup(page, seen);
    await page.goto('/dashboard/crm/settings/deal-sections');
    await expect(page.getByRole('heading', { name: 'Deal sections' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('deal-section-list').locator('> li')).toHaveCount(4);
    const preview = page.getByTestId('deal-sections-preview');
    await expect(preview.locator('section > div:first-child')).toHaveText(['Quotation', 'Pricing', 'Product trial', 'Approvals & people']);
    const save = page.getByRole('button', { name: 'Save changes' });
    await expect(save).toBeDisabled();

    await page.getByLabel('Enable Pricing').uncheck();
    await page.getByLabel('Label for Approvals & people').fill('Sign-off');
    await page.getByLabel('Move Approvals & people up').click();
    await page.getByLabel('Move Approvals & people up').click();
    await expect(preview.locator('section > div:first-child')).toHaveText(['Quotation', 'Sign-off', 'Product trial']);
    await expect(row(page, 'pricing')).toContainText('Hidden');
    await expect(page.getByLabel('Move Quotation up')).toBeDisabled();

    await save.click();
    await expect.poll(() => seen.settingsPatched.length).toBe(1);
    expect(seen.settingsPatched[0]).toEqual({
      config: { deal_sections: {
        quotation: { enabled: true, label: 'Quotation', position: 0 },
        approvals: { enabled: true, label: 'Sign-off', position: 1 },
        pricing: { enabled: false, label: 'Pricing', position: 2 },
        product_trial: { enabled: true, label: 'Product trial', position: 3 },
      } },
    });
    await expect(save).toBeDisabled();
  });

  test('loads the saved config; a blank label falls back to the default name', async ({ page }) => {
    const seen = fresh();
    await scopeToSpark(page);
    await setup(page, seen, { pricing: { enabled: false, label: 'Price', position: 0 } });
    await page.goto('/dashboard/crm/settings/deal-sections');
    await expect(page.getByLabel('Label for Pricing')).toHaveValue('Price', { timeout: 30_000 });
    await expect(page.getByLabel('Enable Pricing')).not.toBeChecked();
    await expect(page.getByTestId('deal-section-row-pricing')).toContainText('Hidden');
    await page.getByLabel('Label for Quotation').fill('  ');
    // The preview and the stored name stay "Quotation"; nothing changed, so there is nothing to save.
    await expect(page.getByTestId('deal-sections-preview').locator('section > div:first-child').first()).toHaveText('Quotation');
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(seen.settingsPatched).toHaveLength(0);
  });

  test('settings index: the card appears for Spark only; non-Spark gets a notice on the page', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page, fresh());
    await page.goto('/dashboard/crm/settings');
    await expect(page.getByRole('link', { name: /Deal sections/ })).toBeVisible({ timeout: 30_000 });
  });

  test('non-Spark: no card on the index and the page explains it applies to Spark & Ray', async ({ page }) => {
    await setup(page, fresh());
    await page.goto('/dashboard/crm/settings');
    await expect(page.getByRole('link', { name: /Activity Types/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: /Deal sections/ })).toHaveCount(0);
    await page.goto('/dashboard/crm/settings/deal-sections');
    await expect(page.getByText('Deal sections apply to Spark & Ray')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('deal-section-list')).toHaveCount(0);
  });
});

test.describe('deal sections: helpers', () => {
  test('resolveDealSections: defaults, partial config, junk and ordering', () => {
    expect(resolveDealSections(undefined).map((s) => [s.key, s.label, s.enabled])).toEqual([
      ['quotation', 'Quotation', true], ['pricing', 'Pricing', true], ['product_trial', 'Product trial', true], ['approvals', 'Approvals & people', true],
    ]);
    const r = resolveDealSections({ approvals: { position: 0, label: ' Sign-off ' }, pricing: { enabled: false }, product_trial: { label: '   ' }, quotation: 5 });
    // A non-object entry is ignored (default position 0), so Quotation and Approvals tie and keep their default order.
    expect(r.map((s) => s.key)).toEqual(['quotation', 'approvals', 'pricing', 'product_trial']);
    expect(r[1].label).toBe('Sign-off');
    expect(r.find((s) => s.key === 'product_trial')?.label).toBe('Product trial');
    expect(enabledDealSections(r).map((s) => s.key)).not.toContain('pricing');
    expect(resolveDealSections('x').length).toBe(4);
    expect(resolveDealSections([1]).length).toBe(4);
    expect(resolveDealSections({ pricing: { label: 'x'.repeat(100) } }).find((s) => s.key === 'pricing')?.label).toHaveLength(60);
  });
  test('extractDealSections reads data.config.deal_sections only', () => {
    expect(extractDealSections({ config: { deal_sections: { pricing: { enabled: false } } } })).toEqual({ pricing: { enabled: false } });
    expect(extractDealSections(null)).toEqual({});
    expect(extractDealSections({ config: { deal_sections: [] } })).toEqual({});
  });
  test('moveDealSection swaps neighbours and is a no-op at the ends; buildDealSectionsConfig numbers positions', () => {
    const base = resolveDealSections(undefined);
    expect(moveDealSection(base, 'quotation', -1)).toBe(base);
    expect(moveDealSection(base, 'approvals', 1)).toBe(base);
    const moved = moveDealSection(base, 'pricing', -1);
    expect(moved.map((s) => s.key)).toEqual(['pricing', 'quotation', 'product_trial', 'approvals']);
    expect(buildDealSectionsConfig(moved).pricing).toEqual({ enabled: true, label: 'Pricing', position: 0 });
    expect(buildDealSectionsConfig(moved).quotation.position).toBe(1);
  });
  test('computeFinalPrice', () => {
    expect(computeFinalPrice('', '10')).toBeNull();
    expect(computeFinalPrice('1000', '')).toBe(1000);
    expect(computeFinalPrice('1000', '12.5')).toBe(875);
    expect(computeFinalPrice('999.99', '33.3')).toBe(666.99);
    expect(computeFinalPrice('1000', '150')).toBe(0);
    expect(computeFinalPrice('abc', '1')).toBeNull();
  });
  test('validateDealSections only checks enabled sections', () => {
    const on = resolveDealSections(undefined);
    const off = resolveDealSections({ pricing: { enabled: false }, product_trial: { enabled: false } });
    const v = { ...emptyDealSectionValues(), pricing_discount_pct: '101', trial_required: true, trial_start: '2026-01-02', trial_end: '2026-01-01' };
    expect(Object.keys(validateDealSections(v, on)).sort()).toEqual(['pricing_discount_pct', 'trial_end']);
    expect(validateDealSections(v, off)).toEqual({});
    expect(validateDealSections({ ...v, pricing_discount_pct: '10', trial_end: '2026-01-02' }, on)).toEqual({});
  });
  test('buildDealSectionPayload: create omits blanks, patch nulls them, disabled sections send nothing', () => {
    const on = resolveDealSections(undefined);
    const v = { ...emptyDealSectionValues(), pricing_quoted: '500', pricing_discount_pct: '10', prepared_by: 'u-1' };
    const create = buildDealSectionPayload(v, on, 'create');
    expect(create).toEqual({ pricing_quoted: 500, pricing_discount_pct: 10, pricing_final: 450, trial_required: false, prepared_by: 'u-1' });
    const patch = buildDealSectionPayload(v, on, 'patch');
    expect(patch).toMatchObject({ quotation_no: null, pricing_valid_till: null, trial_start: null, trial_result: null, checked_by: null, prepared_by: 'u-1', trial_required: false });
    expect(buildDealSectionPayload(v, resolveDealSections({ quotation: { enabled: false }, pricing: { enabled: false }, product_trial: { enabled: false }, approvals: { enabled: false } }), 'patch')).toEqual({});
    // "No trial needed" never sends the other trial fields on create.
    expect(Object.keys(buildDealSectionPayload({ ...v, trial_start: '2026-01-01' }, on, 'create'))).not.toContain('trial_start');
  });
  test('seedDealSectionValues copes with a bare / odd row', () => {
    expect(seedDealSectionValues(null)).toEqual(emptyDealSectionValues());
    const s = seedDealSectionValues({ pricing_quoted: 10, pricing_valid_till: '2026-12-31T00:00:00Z', trial_result: 'weird', trial_required: true });
    expect(s.pricing_quoted).toBe('10');
    expect(s.pricing_valid_till).toBe('2026-12-31');
    expect(s.trial_result).toBe('');
    expect(s.trial_required).toBe(true);
  });
});
