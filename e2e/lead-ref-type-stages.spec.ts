import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, fail, scopeToSpark } from './spark';
import {
  BUILTIN_STAGES, COMBINED_STAGES, STAGE_VALUE_RE, appendCombined, buildStatusesConfig, kindOf, moveStage, resolveStages, savedStages,
  slugifyStage, validateStages,
} from '../src/lib/leadStages';
import { leadFilterParams, activeFilterCount } from '../src/lib/crm/leadListParams';
import { LEAD_TYPE_OPTIONS, leadTypeForApi, leadTypeLabel } from '../src/lib/leadType';
import { extractLeadStatuses } from '../src/lib/crmLeadStatuses';

/**
 * Lead numbers, lead type and lead stages (connected-B2B / Spark & Ray; web).
 *   1. pure helpers (stage list building / validation, filter params, lead type);
 *   2. lead number (SR/LD/2627-12): no longer rendered in the lead UI; search by a stored number still works;
 *   3. lead type: built-in field gated on create / edit / detail / filter / settings (hide, relabel, require, order);
 *   4. Settings -> Lead stages: load, add the combined list, edit / reorder / remove, validation, save payload;
 *   5. the "Number existing leads" panel (preview, confirm, batches, 403 / 400 / 503 messages);
 *   6. the stage names and colours show in the table, filter, detail and edit modal.
 * Every API call is mocked.
 */

const COMBINED_CONFIG = buildStatusesConfig(COMBINED_STAGES);

const ROWS = [
  { id: 'l-1', first_name: null, last_name: 'Acme Forge', full_name: 'Acme Forge', company: 'Acme Forge', is_b2c: false, status: 'cold_call', ref_no: 'SR/LD/2627-12', lead_type: 'requirement', phone: '9876501234', created_at: '2026-09-20T10:00:00Z' },
  { id: 'l-2', first_name: null, last_name: 'Loom Works', full_name: 'Loom Works', company: 'Loom Works', is_b2c: false, status: 'universe', ref_no: 'SR/LD/2627-13', lead_type: 'discussion', created_at: '2026-09-21T10:00:00Z' },
  { id: 'l-3', first_name: null, last_name: 'Blank Co', full_name: 'Blank Co', company: 'Blank Co', is_b2c: false, status: 'trash', ref_no: null, lead_type: null, created_at: '2026-09-22T10:00:00Z' },
];
const DETAIL = {
  ...ROWS[0], org_id: 'e2e-org-1', owner_id: null, owner_name: null, source_name: 'Website', created_by: SEED_USER.id, updated_at: '2026-09-20T10:00:00Z',
};

type Settings = { business_type?: string; config?: Record<string, unknown> };
type Calls = { lists: string[]; exports: string[]; posted: Record<string, any>[]; patched: Record<string, any>[]; settingsPatches: Record<string, any>[] };

type Opts = {
  spark?: boolean;
  overrides?: Record<string, unknown>;
  statuses?: unknown[] | null;
  lead?: Record<string, unknown>;
  /** Delay (ms) before GET /crm/settings answers, to prove gated rows wait for it. */
  settingsDelay?: number;
};

async function setup(page: Page, o: Opts = {}): Promise<Calls> {
  const calls: Calls = { lists: [], exports: [], posted: [], patched: [], settingsPatches: [] };
  if (o.spark !== false) await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  const config: Record<string, unknown> = { field_overrides: o.overrides ?? {} };
  if (o.statuses !== null) config.lead_statuses = o.statuses ?? COMBINED_CONFIG;
  const settings: { success: true; data: Settings } = { success: true, data: { business_type: 'b2b', config } };
  await mockApi(page, {
    settings,
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/settings' && o.settingsDelay) {
        await new Promise((r) => setTimeout(r, o.settingsDelay));
        await route.fulfill({ json: settings });
        return true;
      }
      if (method === 'GET' && p === '/api/v1/crm/leads') {
        calls.lists.push(url);
        const lt = new URL(url).searchParams.get('lead_type');
        const data = lt ? ROWS.filter((r) => r.lead_type === lt) : ROWS;
        await route.fulfill({ json: { success: true, data, pagination: { page: 1, limit: 50, total: data.length, totalPages: 1, hasNext: false, hasPrev: false } } });
        return true;
      }
      if (method === 'GET' && p === '/api/v1/crm/leads/export') {
        calls.exports.push(url);
        await route.fulfill({ status: 200, contentType: 'text/csv', body: 'Lead No,Lead Type\nSR/LD/2627-12,requirement\n' });
        return true;
      }
      if (method === 'GET' && p === '/api/v1/crm/leads/l-1') return ok(route, { ...DETAIL, ...(o.lead ?? {}) });
      if (method === 'POST' && p === '/api/v1/crm/leads') { calls.posted.push(route.request().postDataJSON()); return ok(route, { id: 'l-new' }, 201); }
      if (method === 'PATCH' && p === '/api/v1/crm/leads/l-1') {
        const body = route.request().postDataJSON();
        calls.patched.push(body);
        return ok(route, { ...DETAIL, ...(o.lead ?? {}), ...body });
      }
      return false;
    },
  });
  return calls;
}

const row = (page: Page, name: string) => page.locator('tr.lead-row').filter({ hasText: name });

// ═════════════════════════════ 1. pure helpers ═════════════════════════════
test.describe('lead stages / type helpers', () => {
  test('combined list: the eleven stages, in order, with the right flags and distinct colours', () => {
    expect(COMBINED_STAGES.map((s) => s.value)).toEqual(['universe', 'above', 'inside', 'defined', 'cold_call', 'discussion', 'negotiation', 'won', 'finished', 'lost', 'trash']);
    expect(COMBINED_STAGES.map((s) => s.label)).toEqual(['Universe', 'Above', 'Inside', 'Defined', 'Cold Call', 'Discussion', 'Negotiation', 'Won', 'Finished', 'Lost', 'Trash']);
    expect(COMBINED_STAGES.map((s) => s.kind)).toEqual(['open', 'open', 'open', 'open', 'open', 'open', 'open', 'won', 'closed', 'lost', 'lost']);
    expect(COMBINED_STAGES.every((s) => STAGE_VALUE_RE.test(s.value))).toBe(true);
    // Distinct colours, except that Trash may share the neutral grey: nothing else repeats.
    expect(new Set(COMBINED_STAGES.map((s) => s.color)).size).toBe(COMBINED_STAGES.length);
  });

  test('buildStatusesConfig: positions 0..n-1, explicit flags (won = is_won, finished = is_open false, lost / trash = is_lost)', () => {
    const cfg = buildStatusesConfig(COMBINED_STAGES);
    expect(cfg.map((c) => c.position)).toEqual(COMBINED_STAGES.map((_, i) => i));
    const by = Object.fromEntries(cfg.map((c) => [c.value, c]));
    expect(by.universe).toMatchObject({ is_open: true, is_won: false, is_lost: false });
    expect(by.won).toMatchObject({ is_won: true, is_lost: false, is_open: false });
    expect(by.finished).toMatchObject({ is_won: false, is_lost: false, is_open: false });
    expect(by.lost).toMatchObject({ is_lost: true, is_won: false, is_open: false });
    expect(by.trash).toMatchObject({ is_lost: true, is_open: false });
  });

  test('a saved list round-trips: is_open:false (Finished) survives extractLeadStatuses and the editor, flags map back to kinds', () => {
    const data = { config: { lead_statuses: COMBINED_CONFIG } };
    const ex = extractLeadStatuses(data)!;
    expect(ex.find((s) => s.value === 'finished')?.is_open).toBe(false);
    expect(ex.map((s) => kindOf(s))).toEqual(COMBINED_STAGES.map((s) => s.kind));
    expect(savedStages(data)!.map((s) => [s.value, s.kind])).toEqual(COMBINED_STAGES.map((s) => [s.value, s.kind]));
  });

  test('resolveStages: no saved list = the built-in six shown as the current stages; a saved list wins', () => {
    expect(resolveStages(undefined)).toEqual({ stages: BUILTIN_STAGES, custom: false });
    expect(resolveStages({ config: {} }).custom).toBe(false);
    expect(resolveStages({ config: { lead_statuses: [] } }).custom).toBe(false);
    const r = resolveStages({ data: { config: { lead_statuses: [{ value: 'a', label: 'A', position: 1 }, { value: 'b', label: 'B', position: 0 }, { value: 'BAD', label: 'x' }] } } });
    expect(r.custom).toBe(true);
    expect(r.stages.map((s) => s.value)).toEqual(['b', 'a']); // position order, invalid key dropped
  });

  test('appendCombined adds only the missing values, at the end, keeps every existing stage as it is and in place', () => {
    const current = [
      { value: 'new', label: 'Brand new', color: '#111111', kind: 'open' as const },
      { value: 'won', label: 'Closed won', color: '#222222', kind: 'won' as const },
      { value: 'site_visit', label: 'Site visit', color: '#333333', kind: 'open' as const },
    ];
    const { stages, added } = appendCombined(current);
    expect(stages.slice(0, 3)).toEqual(current);
    expect(added.map((a) => a.value)).toEqual(['universe', 'above', 'inside', 'defined', 'cold_call', 'discussion', 'negotiation', 'finished', 'lost', 'trash']);
    expect(stages.length).toBe(3 + 10);
    // Running it again adds nothing and changes nothing.
    const again = appendCombined(stages);
    expect(again.added).toEqual([]);
    expect(again.stages).toEqual(stages);
    // The input is never mutated.
    expect(current.length).toBe(3);
  });

  test('validateStages: names, keys, uniqueness, colour, at least one; slugify; moveStage', () => {
    expect(validateStages(COMBINED_STAGES)).toEqual([]);
    expect(validateStages([])).toEqual(['Keep at least one stage.']);
    const base = { value: 'a', label: 'A', color: '#111111', kind: 'open' as const };
    expect(validateStages([{ ...base, label: '  ' }])[0]).toMatch(/needs a name/);
    expect(validateStages([{ ...base, value: 'Bad Key' }])[0]).toMatch(/lowercase letters/);
    expect(validateStages([{ ...base, value: '1abc' }])[0]).toMatch(/lowercase letters/);
    expect(validateStages([base, { ...base, label: 'B' }])).toEqual(['The key "a" is used by more than one stage.']);
    expect(validateStages([base, { ...base, value: 'b' }])).toEqual(['Two stages are called "A".']);
    expect(validateStages([{ ...base, color: 'red' }])[0]).toMatch(/#RRGGBB/);
    expect(slugifyStage('Cold Call')).toBe('cold_call');
    expect(slugifyStage('  Site visit (done) ')).toBe('site_visit_done');
    expect(slugifyStage('2nd round')).toBe('s_2nd_round');
    expect(slugifyStage('###')).toBe('');
    expect(moveStage(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveStage(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveStage(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  test('lead type: two options, labels, API value; the list filter sends lead_type and counts as a filter', () => {
    expect(LEAD_TYPE_OPTIONS).toEqual([{ value: 'requirement', label: 'Requirement' }, { value: 'discussion', label: 'Discussion' }]);
    expect(leadTypeLabel('discussion')).toBe('Discussion');
    expect(leadTypeLabel(null)).toBe('');
    expect(leadTypeLabel('other')).toBe('');
    expect(leadTypeForApi('requirement')).toBe('requirement');
    expect(leadTypeForApi('')).toBeNull();
    expect(leadTypeForApi('nope')).toBeNull();
    expect(leadFilterParams({ leadType: 'requirement' })).toEqual({ lead_type: 'requirement' });
    expect(leadFilterParams({})).toEqual({});
    expect(activeFilterCount({ leadType: 'discussion' })).toBe(1);
  });
});

// ═════════════════════════════ 2. lead number ═════════════════════════════
test.describe('Lead number', () => {
  // The per-lead number is no longer displayed in the web lead UI (backend
  // stopped assigning it; iOS/Android dropped it too). Searching an old lead
  // by a stored number still works, so that coverage stays.
  test('Spark: the search box mentions the lead number, sends q, and the page finds a lead by its number', async ({ page }) => {
    const calls = await setup(page);
    await page.goto('/dashboard/crm/leads');
    const search = page.getByPlaceholder('Search name, email, company, lead no...');
    await expect(search).toBeVisible({ timeout: 60_000 });
    await expect(row(page, 'Acme Forge')).toBeVisible();
    await search.fill('SR/LD/2627-13');
    await expect.poll(() => calls.lists.some((u) => new URL(u).searchParams.get('q') === 'SR/LD/2627-13')).toBe(true);
    // The server mock returns every row; the on-page filter narrows to the lead whose number matches.
    await expect(row(page, 'Loom Works')).toBeVisible();
    await expect(row(page, 'Acme Forge')).toHaveCount(0);
  });

  test('the per-lead number is not rendered anywhere in the web lead UI (table, card, preview, detail)', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads');
    await expect(row(page, 'Acme Forge')).toBeVisible({ timeout: 60_000 });
    // No Lead No. column or cell on the table.
    await expect(page.locator('table.responsive-cards th', { hasText: 'Lead No.' })).toHaveCount(0);
    await expect(page.getByTestId('lead-no')).toHaveCount(0);
    // Not in the column customiser.
    await page.getByTitle(/Customize columns and layout for Leads/).click();
    await expect(page.getByRole('checkbox', { name: /Lead No\./ })).toHaveCount(0);
    // Close the customiser by clicking its scrim (it has no Escape handler); wait for the
    // scrim to detach so it no longer intercepts the next click.
    await page.locator('.crm-view-customizer-scrim').click();
    await expect(page.locator('.crm-view-customizer-scrim')).toHaveCount(0);
    // Not in the quick preview.
    await row(page, 'Acme Forge').locator('td[data-label="Status"]').click();
    await expect(page.getByTestId('preview-lead-no')).toHaveCount(0);
    // Not on the lead detail header.
    await page.goto('/dashboard/crm/leads/l-1');
    await expect(page.getByText('Acme Forge').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('detail-lead-no')).toHaveCount(0);
  });
});

// ═════════════════════════════ 3. lead type ═════════════════════════════
test.describe('Lead type: create', () => {
  const create = async (page: Page, o: Opts = {}) => {
    const calls = await setup(page, { overrides: { 'lead.city': { hidden: true } }, ...o });
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.locator('#lead-field-company')).toBeVisible({ timeout: 60_000 });
    // Wait for the device fix first: it only lands once the page has hydrated (a hydration re-render would wipe typed text).
    await expect(page.getByText(/\d+\.\d{6}, \d+\.\d{6}/)).toBeVisible({ timeout: 30_000 });
    await page.locator('#lead-field-company').fill('Bhosari Forge Pvt Ltd');
    return calls;
  };

  test('Spark: a Lead type select (none / Requirement / Discussion); choosing one is sent', async ({ page }) => {
    const calls = await create(page);
    const sel = page.locator('#lead-field-lead_type');
    await expect(sel).toBeVisible();
    await expect(page.locator('label[for="lead-field-lead_type"]')).toHaveText('Lead type');
    expect(await sel.locator('option').allTextContents()).toEqual(['— None —', 'Requirement', 'Discussion']);
    await expect(sel).toHaveValue('');
    await sel.selectOption('requirement');
    await page.getByRole('button', { name: /Create lead/i }).click();
    await expect.poll(() => calls.posted.length).toBe(1);
    expect(calls.posted[0]).toMatchObject({ lead_type: 'requirement' });
  });

  test('left on none: no lead_type is sent', async ({ page }) => {
    const calls = await create(page);
    await page.getByRole('button', { name: /Create lead/i }).click();
    await expect.poll(() => calls.posted.length).toBe(1);
    expect(calls.posted[0]).not.toHaveProperty('lead_type');
  });

  test('relabelled by the admin: the new label shows (and is what the control is called)', async ({ page }) => {
    const calls = await create(page, { overrides: { 'lead.city': { hidden: true }, 'lead.lead_type': { label: 'Enquiry type' } } });
    await expect(page.locator('label[for="lead-field-lead_type"]')).toHaveText('Enquiry type');
    await expect(page.getByLabel('Enquiry type')).toBeVisible();
    await expect(page.getByText('Lead type', { exact: true })).toHaveCount(0);
    await page.getByLabel('Enquiry type').selectOption('discussion');
    await page.getByRole('button', { name: /Create lead/i }).click();
    await expect.poll(() => calls.posted.length).toBe(1);
    expect(calls.posted[0]).toMatchObject({ lead_type: 'discussion' });
  });

  test('hidden by the admin: not rendered and never sent', async ({ page }) => {
    const calls = await create(page, { overrides: { 'lead.city': { hidden: true }, 'lead.lead_type': { hidden: true } } });
    await expect(page.locator('#lead-field-lead_type')).toHaveCount(0);
    await page.getByRole('button', { name: /Create lead/i }).click();
    await expect.poll(() => calls.posted.length).toBe(1);
    expect(calls.posted[0]).not.toHaveProperty('lead_type');
  });

  test('required by the admin: an asterisk, saving without a choice is blocked with a message, then it goes through', async ({ page }) => {
    const calls = await create(page, { overrides: { 'lead.city': { hidden: true }, 'lead.lead_type': { required: true, label: 'Enquiry type' } } });
    await expect(page.locator('label[for="lead-field-lead_type"]')).toContainText('*');
    await expect(page.locator('#lead-field-lead_type')).toHaveAttribute('required', '');
    await page.getByRole('button', { name: /Create lead/i }).click();
    await expect(page.getByText('Enquiry type is required.')).toBeVisible();
    expect(calls.posted).toHaveLength(0);
    await page.locator('#lead-field-lead_type').selectOption('requirement');
    await page.getByRole('button', { name: /Create lead/i }).click();
    await expect.poll(() => calls.posted.length).toBe(1);
    expect(calls.posted[0]).toMatchObject({ lead_type: 'requirement' });
  });

  test('the form order puts it where the admin placed it (CSS order from the field overrides)', async ({ page }) => {
    await setup(page, { overrides: { 'lead.city': { hidden: true }, 'lead.first_name': { order: 0 }, 'lead.lead_type': { order: 7 }, 'lead.status': { order: 3 } } });
    await page.goto('/dashboard/crm/leads/new');
    const wrap = page.locator('div:has(> label[for="lead-field-lead_type"])');
    await expect(wrap).toBeVisible({ timeout: 60_000 });
    expect(await wrap.evaluate((el) => getComputedStyle(el).order)).toBe('7');
  });

  test('it waits for the settings: a field the admin hid never flashes up first', async ({ page }) => {
    await setup(page, { overrides: { 'lead.city': { hidden: true }, 'lead.lead_type': { hidden: true } }, settingsDelay: 2500 });
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.locator('#lead-field-company')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(800);
    await expect(page.locator('#lead-field-lead_type')).toHaveCount(0);
    await page.waitForTimeout(2500);
    await expect(page.locator('#lead-field-lead_type')).toHaveCount(0);
  });

  test('another client has no Lead type on the create form', async ({ page }) => {
    await setup(page, { spark: false, overrides: { 'lead.city': { hidden: true } } });
    await page.goto('/dashboard/crm/leads/new');
    await expect(page.locator('#lead-field-first_name')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(500);
    await expect(page.locator('#lead-field-lead_type')).toHaveCount(0);
  });
});

test.describe('Lead type: edit modal', () => {
  const openEdit = async (page: Page, o: Opts = {}) => {
    const calls = await setup(page, { overrides: { 'lead.city': { hidden: true } }, ...o });
    await page.goto('/dashboard/crm/leads/l-1');
    await page.getByRole('button', { name: 'Edit lead' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    return { calls, dialog, sel: dialog.locator('[data-field="lead_type"] select') };
  };

  test('shows the lead\'s current type; changing it sends the new value', async ({ page }) => {
    const { calls, dialog, sel } = await openEdit(page);
    await expect(sel).toHaveValue('requirement');
    expect(await sel.locator('option').allTextContents()).toEqual(['— None —', 'Requirement', 'Discussion']);
    await sel.selectOption('discussion');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.patched.length).toBe(1);
    expect(calls.patched[0]).toMatchObject({ lead_type: 'discussion' });
  });

  test('choosing none clears it (sent as null); saving untouched re-sends the existing value', async ({ page }) => {
    const first = await openEdit(page);
    await first.sel.selectOption('');
    await first.dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => first.calls.patched.length).toBe(1);
    expect(first.calls.patched[0]).toHaveProperty('lead_type', null);
  });

  test('untouched save keeps the type', async ({ page }) => {
    const { calls, dialog } = await openEdit(page, { lead: { lead_type: 'discussion' } });
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.patched.length).toBe(1);
    expect(calls.patched[0]).toHaveProperty('lead_type', 'discussion');
  });

  test('relabelled: the new label shows in the modal', async ({ page }) => {
    const { dialog } = await openEdit(page, { overrides: { 'lead.city': { hidden: true }, 'lead.lead_type': { label: 'Enquiry type' } } });
    await expect(dialog.locator('[data-field="lead_type"] label')).toContainText('Enquiry type');
    await expect(dialog.getByText('Lead type', { exact: true })).toHaveCount(0);
  });

  test('hidden: no control and the key is not sent', async ({ page }) => {
    const { calls, dialog } = await openEdit(page, { overrides: { 'lead.city': { hidden: true }, 'lead.lead_type': { hidden: true } } });
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeVisible();
    await expect(dialog.locator('[data-field="lead_type"]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.patched.length).toBe(1);
    expect(calls.patched[0]).not.toHaveProperty('lead_type');
  });

  test('required: saving with none is blocked with a message; picking a value saves', async ({ page }) => {
    const { calls, dialog, sel } = await openEdit(page, { lead: { lead_type: null }, overrides: { 'lead.city': { hidden: true }, 'lead.lead_type': { required: true, label: 'Enquiry type' } } });
    await expect(dialog.locator('[data-field="lead_type"] label')).toContainText('*');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Enquiry type is required.')).toBeVisible();
    expect(calls.patched).toHaveLength(0);
    await sel.selectOption('requirement');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.patched.length).toBe(1);
    expect(calls.patched[0]).toMatchObject({ lead_type: 'requirement' });
  });

  test('another client: no control, no key sent', async ({ page }) => {
    const { calls, dialog } = await openEdit(page, { spark: false, lead: { first_name: 'Priya', last_name: 'Nair' } });
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(dialog.locator('[data-field="lead_type"]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.patched.length).toBe(1);
    expect(calls.patched[0]).not.toHaveProperty('lead_type');
  });
});

test.describe('Lead type: lead page, preview and filter', () => {
  test('the lead page shows the type; a relabel renames it; hidden / empty / another client show nothing', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads/l-1');
    await expect(page.locator('[data-field="lead_type"]')).toContainText('Lead type Requirement', { timeout: 60_000 });
  });

  test('relabelled on the lead page', async ({ page }) => {
    await setup(page, { overrides: { 'lead.lead_type': { label: 'Enquiry type' } } });
    await page.goto('/dashboard/crm/leads/l-1');
    await expect(page.locator('[data-field="lead_type"]')).toContainText('Enquiry type Requirement', { timeout: 60_000 });
  });

  test('hidden on the lead page', async ({ page }) => {
    await setup(page, { overrides: { 'lead.lead_type': { hidden: true } } });
    await page.goto('/dashboard/crm/leads/l-1');
    await expect(page.getByText('Acme Forge').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-field="lead_type"]')).toHaveCount(0);
  });

  test('no type on the lead: nothing is shown', async ({ page }) => {
    await setup(page, { lead: { lead_type: null } });
    await page.goto('/dashboard/crm/leads/l-1');
    await expect(page.getByText('Acme Forge').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-field="lead_type"]')).toHaveCount(0);
  });

  test('another client: no type on the lead page even if the API returns one', async ({ page }) => {
    await setup(page, { spark: false });
    await page.goto('/dashboard/crm/leads/l-1');
    await expect(page.getByText('Acme Forge').first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(500);
    await expect(page.locator('[data-field="lead_type"]')).toHaveCount(0);
  });

  test('the quick preview lists the type, honouring the hide override', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads');
    await expect(row(page, 'Loom Works')).toBeVisible({ timeout: 60_000 });
    await row(page, 'Loom Works').locator('td[data-label="Status"]').click();
    await expect(page.getByRole('complementary', { name: 'Lead preview' })).toContainText('Discussion');
    await expect(page.getByRole('complementary', { name: 'Lead preview' })).toContainText('Lead type');
  });

  test('the Filters drawer has a Lead type filter: it narrows the list, shows a chip, and Export carries the same filter', async ({ page }) => {
    const calls = await setup(page);
    await page.goto('/dashboard/crm/leads');
    await expect(row(page, 'Acme Forge')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /Filters/ }).click();
    const sel = page.getByRole('combobox', { name: 'Lead type' });
    await expect(sel).toBeVisible();
    expect(await sel.locator('option').allTextContents()).toEqual(['All', 'Requirement', 'Discussion']);
    await sel.selectOption('requirement');
    await expect.poll(() => calls.lists.some((u) => u.includes('limit=50') && new URL(u).searchParams.get('lead_type') === 'requirement')).toBe(true);
    await page.getByRole('button', { name: /^Show \d+ lead/ }).click();
    await expect(row(page, 'Acme Forge')).toBeVisible();
    await expect(row(page, 'Loom Works')).toHaveCount(0);
    const chips = page.getByRole('list', { name: 'Applied filters' });
    await expect(chips).toContainText('Lead type');
    await expect(chips).toContainText('Requirement');

    // Same filter on the CSV export (list / export parity).
    await page.getByRole('button', { name: 'Export' }).click();
    await expect.poll(() => calls.exports.length).toBe(1);
    expect(new URL(calls.exports[0]).searchParams.get('lead_type')).toBe('requirement');

    // Removing the chip clears the filter: the chip goes and every lead is back.
    await chips.getByRole('button', { name: 'Remove Lead type filter' }).click();
    await expect(page.getByRole('list', { name: 'Applied filters' })).toHaveCount(0);
    await expect(row(page, 'Loom Works')).toBeVisible();
    await expect(row(page, 'Acme Forge')).toBeVisible();
  });

  test('the filter is relabelled with the field, and gone when the admin hides the field', async ({ page }) => {
    await setup(page, { overrides: { 'lead.lead_type': { label: 'Enquiry type' } } });
    await page.goto('/dashboard/crm/leads');
    await expect(row(page, 'Acme Forge')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /Filters/ }).click();
    await expect(page.getByRole('combobox', { name: 'Enquiry type' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Lead type' })).toHaveCount(0);
  });

  test('no filter when hidden, and none for another client', async ({ page }) => {
    await setup(page, { overrides: { 'lead.lead_type': { hidden: true } } });
    await page.goto('/dashboard/crm/leads');
    await expect(row(page, 'Acme Forge')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /Filters/ }).click();
    await expect(page.getByRole('combobox', { name: 'Source' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Lead type' })).toHaveCount(0);
  });

  test('no filter for another client', async ({ page }) => {
    await setup(page, { spark: false });
    await page.goto('/dashboard/crm/leads');
    await expect(row(page, 'Acme Forge')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /Filters/ }).click();
    await expect(page.getByRole('combobox', { name: 'Source' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Lead type' })).toHaveCount(0);
  });
});

test.describe('Lead type: Settings -> Custom Fields', () => {
  async function openFields(page: Page, spark: boolean) {
    const patches: Record<string, any>[] = [];
    if (spark) await scopeToSpark(page);
    await seedSession(page, SEED_USER);
    await mockApi(page, {
      settings: { success: true, data: { business_type: 'b2b', config: { field_overrides: {} } } },
      onRequest: async (route, url, method) => {
        const p = apiPath(url);
        if (method === 'GET' && p === '/api/v1/crm/custom-fields') return ok(route, []);
        if (method === 'PATCH' && p === '/api/v1/crm/settings') { patches.push(route.request().postDataJSON()); return ok(route, {}); }
        return false;
      },
    });
    await page.goto('/dashboard/crm/settings/custom-fields');
    await expect(page.getByTestId('field-row-lead-first_name')).toBeVisible({ timeout: 60_000 });
    return patches;
  }
  const rowKeys = (page: Page) =>
    page.locator('tr[data-testid^="field-row-lead-"]').evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') || '').replace('field-row-lead-', '')));

  test('Spark: Lead type is listed between Lead Source and Assigned To', async ({ page }) => {
    await openFields(page, true);
    const r = page.getByTestId('field-row-lead-lead_type');
    await expect(r).toBeVisible();
    await expect(r).toContainText('Lead type');
    const keys = await rowKeys(page);
    expect(keys.indexOf('lead_type')).toBe(keys.indexOf('source_id') + 1);
    expect(keys.indexOf('owner_id')).toBe(keys.indexOf('lead_type') + 1);
  });

  test('Spark: it can be reordered like the others (its order number is saved with the rest)', async ({ page }) => {
    const patches = await openFields(page, true);
    await page.getByTestId('field-row-lead-lead_type').getByRole('button', { name: 'Move down' }).click();
    await expect.poll(() => patches.length).toBe(1);
    const fo = patches[0].config.field_overrides;
    expect(typeof fo['lead.lead_type'].order).toBe('number');
    expect(fo['lead.lead_type'].order).toBeGreaterThan(fo['lead.owner_id'].order);
  });

  test('another client\'s settings list has no Lead type row', async ({ page }) => {
    await openFields(page, false);
    await expect(page.getByTestId('field-row-lead-source_id')).toBeVisible();
    await expect(page.getByTestId('field-row-lead-lead_type')).toHaveCount(0);
  });
});

// ═════════════════════════════ 4. Settings -> Lead stages ═════════════════════════════
type StageCalls = { patches: Record<string, any>[]; gets: number };

async function stagesPage(page: Page, o: { spark?: boolean; saved?: unknown[] | null; patchStatus?: number; patchMessage?: string } = {}): Promise<StageCalls> {
  const calls: StageCalls = { patches: [], gets: 0 };
  if (o.spark !== false) await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  const config: Record<string, unknown> = o.saved === null ? {} : { lead_statuses: o.saved ?? undefined };
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config } },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/settings') calls.gets++;
      if (method === 'PATCH' && p === '/api/v1/crm/settings') {
        calls.patches.push(route.request().postDataJSON());
        if (o.patchStatus && o.patchStatus >= 400) return fail(route, o.patchStatus, o.patchMessage || 'Save failed');
        return ok(route, { business_type: 'b2b', config: calls.patches.at(-1)!.config });
      }
      return false;
    },
  });
  return calls;
}

const SAVED = [
  { value: 'new', label: 'New', color: '#3B82F6', position: 0, is_won: false, is_lost: false, is_open: true },
  { value: 'won', label: 'Won (old name)', color: '#00AA00', position: 1, is_won: true },
  { value: 'lost', label: 'Lost', color: '#EF4444', position: 2, is_lost: true },
  { value: 'site_visit', label: 'Site visit', color: '#123456', position: 3, is_open: true },
];

const stageRows = (page: Page) => page.getByTestId('stage-row');
const stageValues = (page: Page) => stageRows(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.value));
const stageRow = (page: Page, value: string) => page.locator(`[data-testid="stage-row"][data-value="${value}"]`);

test.describe('Settings -> Lead stages', () => {
  test('Spark: the Settings index has a Lead stages card; another client has none', async ({ page }) => {
    await stagesPage(page);
    await page.goto('/dashboard/crm/settings');
    const card = page.getByRole('link', { name: /Lead stages/ });
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toHaveAttribute('href', '/dashboard/crm/settings/lead-stages');
  });

  test('another client: no card, and opening the page directly explains it applies to Spark & Ray', async ({ page }) => {
    await stagesPage(page, { spark: false });
    await page.goto('/dashboard/crm/settings');
    await expect(page.getByRole('link', { name: /Lead Sources/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: /Lead stages/ })).toHaveCount(0);
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(page.getByText('Lead stages and numbers apply to Spark & Ray')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('stage-list')).toHaveCount(0);
    await expect(page.getByTestId('lead-numbers-panel')).toHaveCount(0);
  });

  test('lists the saved stages: colour, name, key and the Won / Lost / Closed flags', async ({ page }) => {
    await stagesPage(page, { saved: buildStatusesConfig(COMBINED_STAGES) });
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(stageRows(page)).toHaveCount(11, { timeout: 60_000 });
    expect(await stageValues(page)).toEqual(COMBINED_STAGES.map((s) => s.value));
    const cold = stageRow(page, 'cold_call');
    await expect(cold.getByTestId('stage-label')).toHaveValue('Cold Call');
    await expect(cold.getByTestId('stage-key')).toHaveText('cold_call');
    await expect(cold.getByTestId('stage-swatch')).toHaveAttribute('data-color', '#06B6D4');
    await expect(cold.getByTestId('stage-flag')).toHaveCount(0);
    await expect(stageRow(page, 'won').getByTestId('stage-flag')).toHaveText('Won');
    await expect(stageRow(page, 'finished').getByTestId('stage-flag')).toHaveText('Closed');
    await expect(stageRow(page, 'lost').getByTestId('stage-flag')).toHaveText('Lost');
    await expect(stageRow(page, 'trash').getByTestId('stage-flag')).toHaveText('Lost');
    await expect(page.getByTestId('stages-defaults-note')).toHaveCount(0);
    await expect(page.getByTestId('stages-unsaved')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  test('no saved list: the built-in stages are shown as the current ones, with a note', async ({ page }) => {
    await stagesPage(page, { saved: null });
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(stageRows(page)).toHaveCount(6, { timeout: 60_000 });
    expect(await stageValues(page)).toEqual(['new', 'working', 'qualified', 'unqualified', 'converted', 'lost']);
    await expect(page.getByTestId('stages-defaults-note')).toBeVisible();
  });

  test('Add the combined stage list: appends only the missing, keeps existing as they are, then Save sends the full list', async ({ page }) => {
    const calls = await stagesPage(page, { saved: SAVED });
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(stageRows(page)).toHaveCount(4, { timeout: 60_000 });
    await expect(page.getByTestId('stages-combined-hint')).toContainText('existing stages are kept');
    await page.getByRole('button', { name: 'Add the combined stage list' }).click();
    expect(await stageValues(page)).toEqual(['new', 'won', 'lost', 'site_visit', 'universe', 'above', 'inside', 'defined', 'cold_call', 'discussion', 'negotiation', 'finished', 'trash']);
    // The existing stages are untouched (name, colour, flag).
    await expect(stageRow(page, 'won').getByTestId('stage-label')).toHaveValue('Won (old name)');
    await expect(stageRow(page, 'won').getByTestId('stage-swatch')).toHaveAttribute('data-color', '#00AA00');
    await expect(stageRow(page, 'won').getByTestId('stage-flag')).toHaveText('Won');
    await expect(page.getByTestId('stages-note')).toContainText('Added 9 stages');
    await expect(page.getByTestId('stages-unsaved')).toBeVisible();
    expect(calls.patches).toHaveLength(0); // nothing is saved until the admin says so

    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.patches.length).toBe(1);
    const sent = calls.patches[0].config.lead_statuses as Array<Record<string, unknown>>;
    expect(Object.keys(calls.patches[0].config)).toEqual(['lead_statuses']);
    expect(sent.map((s) => s.value)).toEqual(['new', 'won', 'lost', 'site_visit', 'universe', 'above', 'inside', 'defined', 'cold_call', 'discussion', 'negotiation', 'finished', 'trash']);
    expect(sent.map((s) => s.position)).toEqual(sent.map((_, i) => i));
    const by = Object.fromEntries(sent.map((s) => [s.value as string, s]));
    expect(by.won).toMatchObject({ label: 'Won (old name)', color: '#00AA00', is_won: true, is_lost: false, is_open: false });
    expect(by.universe).toMatchObject({ label: 'Universe', is_open: true, is_won: false, is_lost: false });
    expect(by.cold_call).toMatchObject({ label: 'Cold Call', is_open: true });
    expect(by.finished).toMatchObject({ label: 'Finished', is_open: false, is_won: false, is_lost: false });
    expect(by.trash).toMatchObject({ label: 'Trash', is_lost: true, is_open: false });
    expect(by.lost).toMatchObject({ is_lost: true });
    await expect(page.getByTestId('stages-unsaved')).toHaveCount(0);
  });

  test('the combined button is idempotent: a second click adds nothing', async ({ page }) => {
    await stagesPage(page, { saved: buildStatusesConfig(COMBINED_STAGES).slice(0, 5) });
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(stageRows(page)).toHaveCount(5, { timeout: 60_000 });
    await page.getByRole('button', { name: 'Add the combined stage list' }).click();
    await expect(stageRows(page)).toHaveCount(11);
    await page.getByRole('button', { name: 'Add the combined stage list' }).click();
    await expect(stageRows(page)).toHaveCount(11);
    await expect(page.getByTestId('stages-note')).toContainText('already in your list');
  });

  test('no saved list: the built-in six are kept, the missing combined stages are appended (lost is not repeated)', async ({ page }) => {
    const calls = await stagesPage(page, { saved: null });
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(stageRows(page)).toHaveCount(6, { timeout: 60_000 });
    await page.getByRole('button', { name: 'Add the combined stage list' }).click();
    expect(await stageValues(page)).toEqual(['new', 'working', 'qualified', 'unqualified', 'converted', 'lost', 'universe', 'above', 'inside', 'defined', 'cold_call', 'discussion', 'negotiation', 'won', 'finished', 'trash']);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.patches.length).toBe(1);
    expect(calls.patches[0].config.lead_statuses).toHaveLength(16);
    await expect(page.getByTestId('stages-defaults-note')).toHaveCount(0);
  });

  test('edit: rename, recolour, change what it counts as, reorder and remove; Save sends exactly that', async ({ page }) => {
    const calls = await stagesPage(page, { saved: SAVED });
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(stageRows(page)).toHaveCount(4, { timeout: 60_000 });

    const visit = stageRow(page, 'site_visit');
    await visit.getByTestId('stage-color-picker').fill('#ff0000');
    await expect(visit.getByTestId('stage-swatch')).toHaveAttribute('data-color', '#FF0000');
    await visit.getByTestId('stage-label').fill('Site survey');
    await visit.getByTestId('stage-kind').selectOption('closed');
    await expect(visit.getByTestId('stage-flag')).toHaveText('Closed');
    await visit.getByRole('button', { name: 'Move Site survey up' }).click();
    await visit.getByRole('button', { name: 'Move Site survey up' }).click();
    expect(await stageValues(page)).toEqual(['new', 'site_visit', 'won', 'lost']);
    await stageRow(page, 'lost').getByRole('button', { name: 'Remove Lost' }).click();
    expect(await stageValues(page)).toEqual(['new', 'site_visit', 'won']);
    await expect(page.getByTestId('stages-unsaved')).toBeVisible();

    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.patches.length).toBe(1);
    expect(calls.patches[0]).toEqual({
      config: {
        lead_statuses: [
          { value: 'new', label: 'New', color: '#3B82F6', position: 0, is_won: false, is_lost: false, is_open: true },
          { value: 'site_visit', label: 'Site survey', color: '#FF0000', position: 1, is_won: false, is_lost: false, is_open: false },
          { value: 'won', label: 'Won (old name)', color: '#00AA00', position: 2, is_won: true, is_lost: false, is_open: false },
        ],
      },
    });
    await expect(page.getByTestId('stages-unsaved')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  test('the ends have disabled arrows', async ({ page }) => {
    await stagesPage(page, { saved: SAVED });
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(stageRows(page)).toHaveCount(4, { timeout: 60_000 });
    await expect(stageRows(page).first().getByRole('button', { name: /Move .* up/ })).toBeDisabled();
    await expect(stageRows(page).last().getByRole('button', { name: /Move .* down/ })).toBeDisabled();
    await expect(stageRows(page).first().getByRole('button', { name: /Move .* down/ })).toBeEnabled();
  });

  test('add a stage: the key follows the name, appears at the end, and is saved with its kind', async ({ page }) => {
    const calls = await stagesPage(page, { saved: SAVED });
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(stageRows(page)).toHaveCount(4, { timeout: 60_000 });
    await page.getByLabel('New stage name').fill('Site Survey Done');
    await expect(page.getByLabel('New stage key')).toHaveValue('site_survey_done');
    await page.getByLabel('New stage counts as').selectOption('won');
    await page.getByRole('button', { name: 'Add stage' }).click();
    expect((await stageValues(page)).at(-1)).toBe('site_survey_done');
    await expect(stageRow(page, 'site_survey_done').getByTestId('stage-flag')).toHaveText('Won');
    await expect(page.getByLabel('New stage name')).toHaveValue('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.patches.length).toBe(1);
    const sent = calls.patches[0].config.lead_statuses as Array<Record<string, unknown>>;
    expect(sent.at(-1)).toMatchObject({ value: 'site_survey_done', label: 'Site Survey Done', position: 4, is_won: true, is_lost: false, is_open: false });
    expect(typeof sent.at(-1)!.color).toBe('string');
  });

  test('add a stage: an empty name, a bad key and a duplicate key or name are refused with a reason', async ({ page }) => {
    const calls = await stagesPage(page, { saved: SAVED });
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(stageRows(page)).toHaveCount(4, { timeout: 60_000 });
    const add = page.getByRole('button', { name: 'Add stage' });
    const err = page.getByTestId('add-stage-error');
    await add.click();
    await expect(err).toHaveText('Give the stage a name.');
    await page.getByLabel('New stage name').fill('Hello');
    await page.getByLabel('New stage key').fill('1 bad key');
    await add.click();
    await expect(err).toContainText('lowercase letters, digits and underscores');
    await page.getByLabel('New stage key').fill('won');
    await add.click();
    await expect(err).toContainText('already a stage with the key "won"');
    await page.getByLabel('New stage key').fill('hello');
    await page.getByLabel('New stage name').fill('  lost ');
    await add.click();
    await expect(err).toContainText('already a stage called "lost"');
    await expect(stageRows(page)).toHaveCount(4);
    expect(calls.patches).toHaveLength(0);
  });

  test('validation: a blank or duplicate name is flagged under the row and blocks Save (nothing is sent)', async ({ page }) => {
    const calls = await stagesPage(page, { saved: SAVED });
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(stageRows(page)).toHaveCount(4, { timeout: 60_000 });
    await stageRow(page, 'site_visit').getByTestId('stage-label').fill('   ');
    await expect(stageRow(page, 'site_visit').getByTestId('stage-problem')).toHaveText('Name is required.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByTestId('stages-errors')).toContainText('Stage 4 needs a name.');
    await stageRow(page, 'site_visit').getByTestId('stage-label').fill('lost');
    await expect(stageRow(page, 'site_visit').getByTestId('stage-problem')).toHaveText('Another stage has this name.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByTestId('stages-errors')).toContainText('Two stages are called "lost".');
    expect(calls.patches).toHaveLength(0);
    // Fixing it clears the messages and allows the save.
    await stageRow(page, 'site_visit').getByTestId('stage-label').fill('Site visit 2');
    await expect(page.getByTestId('stage-problem')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.patches.length).toBe(1);
  });

  test('removing every stage cannot be saved', async ({ page }) => {
    const calls = await stagesPage(page, { saved: [SAVED[0]] });
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(stageRows(page)).toHaveCount(1, { timeout: 60_000 });
    await stageRow(page, 'new').getByRole('button', { name: 'Remove New' }).click();
    await expect(stageRows(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByTestId('stages-errors')).toContainText('Keep at least one stage.');
    expect(calls.patches).toHaveLength(0);
  });

  test('a failed save shows the server\'s message and keeps the edits unsaved', async ({ page }) => {
    const calls = await stagesPage(page, { saved: SAVED, patchStatus: 400, patchMessage: 'lead_statuses[3].value "site_visit" is reserved' });
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(stageRows(page)).toHaveCount(4, { timeout: 60_000 });
    await stageRow(page, 'site_visit').getByTestId('stage-label').fill('Renamed');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByTestId('stages-save-error')).toHaveText('lead_statuses[3].value "site_visit" is reserved');
    expect(calls.patches).toHaveLength(1);
    await expect(page.getByTestId('stages-unsaved')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  test('Discard changes reloads the saved list (after a confirmation)', async ({ page }) => {
    await stagesPage(page, { saved: SAVED });
    page.on('dialog', (d) => d.accept());
    await page.goto('/dashboard/crm/settings/lead-stages');
    await expect(stageRows(page)).toHaveCount(4, { timeout: 60_000 });
    await page.getByRole('button', { name: 'Add the combined stage list' }).click();
    await expect(stageRows(page)).toHaveCount(13);
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(stageRows(page)).toHaveCount(4);
    await expect(page.getByTestId('stages-unsaved')).toHaveCount(0);
  });
});

// ═════════════════════════════ 5. Number existing leads ═════════════════════════════
type BackfillCall = { dry_run?: boolean; limit?: number };

async function backfillPage(page: Page, handler: (body: BackfillCall, n: number) => { status?: number; data?: unknown; message?: string }): Promise<BackfillCall[]> {
  const bodies: BackfillCall[] = [];
  await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: { lead_statuses: COMBINED_CONFIG } } },
    onRequest: async (route: Route, url, method) => {
      if (method === 'POST' && apiPath(url) === '/api/v1/crm/leads/ref-numbers/backfill') {
        const body = route.request().postDataJSON() as BackfillCall;
        bodies.push(body);
        const r = handler(body, bodies.length);
        if (r.status && r.status >= 400) return fail(route, r.status, r.message || 'Failed');
        return ok(route, r.data);
      }
      return false;
    },
  });
  await page.goto('/dashboard/crm/settings/lead-stages');
  await expect(page.getByTestId('lead-numbers-panel')).toBeVisible({ timeout: 60_000 });
  return bodies;
}

const SAMPLE = [{ id: 'l-9', name: 'Acme Forge', ref_no: null }, { id: 'l-8', name: 'Loom Works', ref_no: null }];
const panel = (page: Page) => page.getByTestId('lead-numbers-panel');

test.describe('Number existing leads', () => {
  test('Preview calls the backfill as a dry run and says how many leads have no number', async ({ page }) => {
    const bodies = await backfillPage(page, () => ({ data: { dry_run: true, total_missing: 1234, processed: 0, remaining: 1234, sample: SAMPLE } }));
    await panel(page).getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('backfill-preview-text')).toHaveText('1,234 leads have no number yet.');
    await expect(page.getByTestId('backfill-preview')).toContainText('Acme Forge');
    expect(bodies).toEqual([{ dry_run: true }]);
  });

  test('one lead missing reads in the singular; none missing says so and disables Number them now', async ({ page }) => {
    let missing = 1;
    await backfillPage(page, () => ({ data: { dry_run: true, total_missing: missing, processed: 0, remaining: missing, sample: missing ? SAMPLE.slice(0, 1) : [] } }));
    await panel(page).getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('backfill-preview-text')).toHaveText('1 lead has no number yet.');
    missing = 0;
    await panel(page).getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('backfill-preview-text')).toHaveText('Every lead already has a number.');
    await expect(panel(page).getByRole('button', { name: 'Number them now' })).toBeDisabled();
  });

  test('Number them now asks first (Cancel does nothing), then numbers in a batch and shows processed / remaining', async ({ page }) => {
    const bodies = await backfillPage(page, (b) => (b.dry_run
      ? { data: { dry_run: true, total_missing: 700, processed: 0, remaining: 700, sample: SAMPLE } }
      : { data: { dry_run: false, total_missing: 700, processed: 500, remaining: 200, sample: [{ id: 'l-9', name: 'Acme Forge', ref_no: 'SR/LD/2627-1' }] } }));
    await panel(page).getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('backfill-preview-text')).toBeVisible();
    await panel(page).getByRole('button', { name: 'Number them now' }).click();
    const confirm = page.getByTestId('backfill-confirm');
    await expect(confirm).toContainText('Give a number to 700 leads?');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    expect(bodies).toEqual([{ dry_run: true }]); // nothing was numbered

    await panel(page).getByRole('button', { name: 'Number them now' }).click();
    await page.getByTestId('backfill-confirm').getByRole('button', { name: 'Yes, number them' }).click();
    await expect(page.getByTestId('backfill-processed')).toHaveText('Numbered 500 leads.');
    await expect(page.getByTestId('backfill-remaining')).toHaveText('200 leads still without a number.');
    await expect(page.getByTestId('backfill-run')).toContainText('SR/LD/2627-1');
    expect(bodies).toEqual([{ dry_run: true }, { dry_run: false, limit: 500 }]);
  });

  test('it repeats on demand until nothing remains', async ({ page }) => {
    const bodies = await backfillPage(page, (b, n) => {
      if (b.dry_run) return { data: { dry_run: true, total_missing: 3, processed: 0, remaining: 3, sample: SAMPLE } };
      return n === 1
        ? { data: { dry_run: false, total_missing: 3, processed: 2, remaining: 1, sample: [] } }
        : { data: { dry_run: false, total_missing: 1, processed: 1, remaining: 0, sample: [] } };
    });
    await panel(page).getByRole('button', { name: 'Number them now' }).click();
    await expect(page.getByTestId('backfill-confirm')).toContainText('Give a number to every lead that has none?');
    await page.getByTestId('backfill-confirm').getByRole('button', { name: 'Yes, number them' }).click();
    await expect(page.getByTestId('backfill-remaining')).toHaveText('1 lead still without a number.');
    await panel(page).getByRole('button', { name: 'Number the next 1 lead' }).click();
    await expect(page.getByTestId('backfill-processed')).toHaveText('Numbered 1 lead.');
    await expect(page.getByTestId('backfill-remaining')).toHaveText('Every lead now has a number.');
    await expect(panel(page).getByRole('button', { name: /Number the next|Number them now/ })).toHaveCount(0);
    expect(bodies).toEqual([{ dry_run: false, limit: 500 }, { dry_run: false, limit: 500 }]);
  });

  test('a non-admin sees the 403 message plainly (nothing is numbered)', async ({ page }) => {
    await backfillPage(page, () => ({ status: 403, message: 'Only admins can number leads' }));
    await panel(page).getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('backfill-error')).toHaveText('Only admins can number leads');
    await expect(page.getByTestId('backfill-preview')).toHaveCount(0);
  });

  test('a client without lead numbers sees the 400 message', async ({ page }) => {
    await backfillPage(page, () => ({ status: 400, message: 'Lead numbers are not used by this client' }));
    await panel(page).getByRole('button', { name: 'Number them now' }).click();
    await page.getByTestId('backfill-confirm').getByRole('button', { name: 'Yes, number them' }).click();
    await expect(page.getByTestId('backfill-error')).toHaveText('Lead numbers are not used by this client');
    await expect(page.getByTestId('backfill-run')).toHaveCount(0);
  });

  test('a database that is not migrated yet shows the 503 message', async ({ page }) => {
    const msg = 'Lead numbers are not set up in this database yet. Apply migration_lead_ref_and_type.sql.';
    await backfillPage(page, () => ({ status: 503, message: msg }));
    await panel(page).getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('backfill-error')).toHaveText(msg, { timeout: 30_000 });
  });

  test('an error clears when the next call works', async ({ page }) => {
    await backfillPage(page, (_b, n) => (n === 1
      ? { status: 403, message: 'Only admins can number leads' }
      : { data: { dry_run: true, total_missing: 2, processed: 0, remaining: 2, sample: SAMPLE } }));
    await panel(page).getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('backfill-error')).toBeVisible();
    await panel(page).getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('backfill-preview-text')).toHaveText('2 leads have no number yet.');
    await expect(page.getByTestId('backfill-error')).toHaveCount(0);
  });
});

// ═════════════════════════════ 6. stage names and colours everywhere ═════════════════════════════
test.describe('Combined stages render with their labels and colours', () => {
  test('leads table: the badge reads the stage label in its colour (cold_call -> "Cold Call")', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads');
    await expect(row(page, 'Acme Forge')).toBeVisible({ timeout: 60_000 });
    const badge = row(page, 'Acme Forge').locator('td[data-label="Status"]').getByText('Cold Call');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveCSS('color', 'rgb(6, 182, 212)');
    await expect(row(page, 'Loom Works').locator('td[data-label="Status"]')).toContainText('Universe');
    await expect(row(page, 'Blank Co').locator('td[data-label="Status"]')).toContainText('Trash');
  });

  test('filter drawer and pipeline strip list the client\'s stages, not the built-in ones', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads');
    await expect(row(page, 'Acme Forge')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /Filters/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Filters' });
    for (const label of ['Universe', 'Above', 'Inside', 'Defined', 'Cold Call', 'Discussion', 'Negotiation', 'Won', 'Finished', 'Lost', 'Trash']) {
      await expect(dialog.getByRole('button', { name: label, exact: true }), label).toBeVisible();
    }
    for (const builtin of ['Working', 'Qualified', 'Unqualified', 'Converted']) {
      await expect(dialog.getByRole('button', { name: builtin, exact: true }), builtin).toHaveCount(0);
    }
  });

  test('picking a stage in the filter sends its key', async ({ page }) => {
    const calls = await setup(page);
    await page.goto('/dashboard/crm/leads');
    await expect(row(page, 'Acme Forge')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /Filters/ }).click();
    await page.getByRole('dialog', { name: 'Filters' }).getByRole('button', { name: 'Cold Call', exact: true }).click();
    await expect.poll(() => calls.lists.some((u) => new URL(u).searchParams.get('status_in') === 'cold_call')).toBe(true);
  });

  test('lead page: the status pill and the journey use the stage labels; closing stages (Lost, Trash) are not steps', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads/l-1');
    await expect(page.getByRole('button', { name: 'Change status' })).toContainText('Cold Call', { timeout: 60_000 });
    const journey = page.getByRole('navigation', { name: 'Lead journey' });
    await expect(journey).toContainText('Universe');
    await expect(journey).toContainText('Negotiation');
    await expect(journey).toContainText('Finished');
    await expect(journey).not.toContainText('Trash');
    await expect(journey).not.toContainText('Lost');
    await page.getByRole('button', { name: 'Change status' }).click();
    const menu = page.getByRole('listbox');
    await expect(menu).toContainText('Universe');
    await expect(menu).toContainText('Finished');
    await expect(menu).not.toContainText('Qualified');
  });

  test('lead page: a lead in a closing stage such as Trash shows no journey step as current', async ({ page }) => {
    await setup(page, { lead: { status: 'trash' } });
    await page.goto('/dashboard/crm/leads/l-1');
    await expect(page.getByText('Trash').first()).toBeVisible({ timeout: 60_000 });
    const journey = page.getByRole('navigation', { name: 'Lead journey' });
    await expect(journey).toBeVisible();
    await expect(journey.locator('li [aria-hidden] span')).toHaveCount(0); // no "current" dot
  });

  test('edit modal: the status select offers exactly the client\'s stages, and a lost-type stage asks for a reason', async ({ page }) => {
    const calls = await setup(page, { overrides: { 'lead.city': { hidden: true } } });
    await page.goto('/dashboard/crm/leads/l-1');
    await page.getByRole('button', { name: 'Edit lead' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    const status = dialog.locator('[data-field="status"] select');
    expect(await status.locator('option').allTextContents()).toEqual(['Universe', 'Above', 'Inside', 'Defined', 'Cold Call', 'Discussion', 'Negotiation', 'Won', 'Finished', 'Lost', 'Trash']);
    await expect(status).toHaveValue('cold_call');
    await expect(dialog.getByText('Reason', { exact: true })).toHaveCount(0);
    await status.selectOption('trash');
    await expect(dialog.getByText('Reason', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.patched.length).toBe(1);
    expect(calls.patched[0]).toMatchObject({ status: 'trash' });
  });

  test('create form: the status select starts at the first configured stage and lists the combined stages', async ({ page }) => {
    const calls = await setup(page, { overrides: { 'lead.city': { hidden: true } } });
    await page.goto('/dashboard/crm/leads/new');
    const status = page.locator('#lead-field-status');
    await expect(status).toBeVisible({ timeout: 60_000 });
    await expect(status).toHaveValue('universe');
    expect(await status.locator('option').allTextContents()).toEqual(['Universe', 'Above', 'Inside', 'Defined', 'Cold Call', 'Discussion', 'Negotiation', 'Won', 'Finished', 'Lost', 'Trash']);
    await page.locator('#lead-field-company').fill('Acme');
    await expect(page.getByText(/\d+\.\d{6}, \d+\.\d{6}/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Create lead/i }).click();
    await expect.poll(() => calls.posted.length).toBe(1);
    expect(calls.posted[0]).toMatchObject({ status: 'universe' });
  });
});
