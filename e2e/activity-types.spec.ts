import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok } from './spark';
import { activityTypesApi, BUILTIN_ACTIVITY_TYPES, normalizeActivityTypes, prettifySlug } from '../src/lib/activityTypes';

/**
 * Activity types: every picker / filter / icon / label reads GET /crm/activity-types (built-ins + the custom
 * types an admin adds in Settings -> Activity Types, e.g. "Industry Visit") with a safe fallback to the
 * built-ins. A row whose type isn't in the list still renders (the slug prettified).
 */

type TypeRow = { id: string; slug: string; name: string; icon: string; color: string | null; position: number; is_system: boolean; is_active: boolean };
const BUILTIN_ROWS: TypeRow[] = ([
  ['meeting', 'Meeting', '📅'], ['call', 'Call', '📞'], ['email', 'Email', '✉️'], ['task', 'Task', '✅'],
  ['note', 'Note', '📝'], ['sms', 'SMS', '💬'], ['whatsapp', 'WhatsApp', '💬'],
] as const).map(([slug, name, icon], i) => ({ id: `builtin:${slug}`, slug, name, icon, color: null, position: i, is_system: true, is_active: true }));
const TYPES: TypeRow[] = [...BUILTIN_ROWS, { id: 'cust-1', slug: 'industry_visit', name: 'Industry Visit', icon: '🏭', color: '#2563EB', position: 7, is_system: false, is_active: true }];

const row = (over: Record<string, unknown>) => ({
  id: 'a', org_id: 'e2e-org-1', subject: 'Row', status: 'open', created_at: '2026-10-01T05:00:00Z', updated_at: '2026-10-01T05:00:00Z', ...over,
});
const ROWS = [
  row({ id: 'a-1', type: 'industry_visit', subject: 'Foundry walk-through' }),
  row({ id: 'a-2', type: 'site_audit', subject: 'Unlisted type row' }),
  row({ id: 'a-3', type: 'call', subject: 'Plain call' }),
];

async function setup(page: Page, opts: { types?: unknown; typesFail?: boolean; list?: unknown[]; seen?: string[]; posts?: Record<string, any>[] } = {}) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/activity-types') {
        if (opts.typesFail) return route.fulfill({ status: 500, json: { success: false, error: 'boom' } }).then(() => true);
        return ok(route, opts.types ?? TYPES);
      }
      if (method === 'GET' && p === '/api/v1/crm/activities') {
        opts.seen?.push(url);
        const list = opts.list ?? ROWS;
        return route.fulfill({ json: { success: true, data: list, pagination: { total: list.length, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false } } }).then(() => true);
      }
      if (method === 'POST' && p === '/api/v1/crm/activities') {
        opts.posts?.push(route.request().postDataJSON());
        return ok(route, { id: 'act-new' }, 201);
      }
      return false;
    },
  });
}

test.describe('activity types: lists and filters', () => {
  test('the type filter lists the custom type and filtering sends its slug', async ({ page }) => {
    const seen: string[] = [];
    await setup(page, { seen });
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByText('Foundry walk-through')).toBeVisible({ timeout: 30_000 });

    const filter = page.locator('select').first();
    await expect(filter.locator('option')).toContainText(['All Activities', 'Meeting', 'Call', 'Email', 'Task', 'Note', 'SMS', 'WhatsApp', 'Industry Visit']);
    await filter.selectOption({ label: '🏭 Industry Visit' });
    await expect.poll(() => seen.some((u) => /[?&]type=industry_visit/.test(u))).toBe(true);
  });

  test('cards show the custom type name + icon; an unlisted type is prettified', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByText('Foundry walk-through')).toBeVisible({ timeout: 30_000 });
    // Type tag uses the type's name, not the raw slug.
    await expect(page.getByText('Industry Visit', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('industry_visit')).toHaveCount(0);
    // The custom type's own emoji renders as its icon.
    await expect(page.getByText('🏭', { exact: true }).first()).toBeVisible();
    // A type that is not in the list still renders its row, slug prettified.
    await expect(page.getByText('Unlisted type row')).toBeVisible();
    await expect(page.getByText('Site Audit', { exact: true })).toBeVisible();
  });

  test('the edit modal offers the custom type and keeps a row\'s unlisted type', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByText('Foundry walk-through')).toBeVisible({ timeout: 30_000 });
    // The edit modal's Type field: a <label>Type</label> followed by its <select>.
    const editType = () => page.locator('label', { hasText: /^Type$/ }).locator('xpath=..').locator('select');
    const card = (text: string) => page.locator('div', { hasText: text }).filter({ has: page.getByRole('button', { name: /Edit/ }) }).last();
    await card('Foundry walk-through').getByRole('button', { name: /Edit/ }).click();
    const typeSelect = editType();
    await expect(typeSelect).toHaveValue('industry_visit');
    await expect(typeSelect.locator('option')).toContainText(['Meeting', 'Call', 'Industry Visit']);
    await page.getByLabel('Close').click();

    await card('Unlisted type row').getByRole('button', { name: /Edit/ }).click();
    const sel2 = editType();
    await expect(sel2).toHaveValue('site_audit');
    await expect(sel2.locator('option', { hasText: 'Site Audit' })).toHaveCount(1);
  });

  test('falls back to the built-ins when the endpoint fails', async ({ page }) => {
    await setup(page, { typesFail: true });
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByText('Plain call')).toBeVisible({ timeout: 30_000 });
    const filter = page.locator('select').first();
    await expect(filter.locator('option')).toContainText(['All Activities', 'Meeting', 'Call', 'Email', 'Task', 'Note', 'SMS', 'WhatsApp']);
    await expect(filter.locator('option', { hasText: 'Industry Visit' })).toHaveCount(0);
  });
});

test.describe('activity types: create form', () => {
  test('the picker offers the custom type and the payload carries its slug', async ({ page }) => {
    const posts: Record<string, any>[] = [];
    await setup(page, { posts });
    await page.goto('/dashboard/crm/activities/new');
    await expect(page.getByRole('heading', { name: 'Log Activity' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Type *' }).click();
    await page.getByRole('option', { name: /Industry Visit/ }).click();
    await page.getByRole('button', { name: 'Log Activity' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });
    expect(posts).toHaveLength(1);
    expect(posts[0].type).toBe('industry_visit');
  });

  test('inactive custom types are not offered; built-ins stay', async ({ page }) => {
    await setup(page, { types: TYPES.map((t) => (t.slug === 'industry_visit' ? { ...t, is_active: false } : t)) });
    await page.goto('/dashboard/crm/activities/new');
    await expect(page.getByRole('heading', { name: 'Log Activity' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Type *' }).click();
    await expect(page.getByRole('option', { name: /Call/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Industry Visit/ })).toHaveCount(0);
  });
});

test.describe('activity types: helpers', () => {
  test('prettifySlug', () => {
    expect(prettifySlug('industry_visit')).toBe('Industry Visit');
    expect(prettifySlug('site-audit')).toBe('Site Audit');
    expect(prettifySlug('')).toBe('');
    expect(prettifySlug(null)).toBe('');
  });
  test('normalizeActivityTypes accepts an array or {data}, drops junk and duplicates, orders by position', () => {
    const out = normalizeActivityTypes({ data: [
      { slug: 'b', name: 'B', position: 2 }, { slug: 'a', name: '', position: 1 }, { slug: 'a', name: 'dup', position: 0 }, { name: 'no slug' }, null,
    ] });
    expect(out.map((t) => t.slug)).toEqual(['a', 'b']);
    expect(out[0].name).toBe('A');
    expect(normalizeActivityTypes(undefined)).toEqual([]);
    expect(normalizeActivityTypes('x')).toEqual([]);
  });
  test('labelFor falls back to a prettified slug; active excludes deactivated types', () => {
    const api = activityTypesApi([...BUILTIN_ACTIVITY_TYPES, { slug: 'old', name: 'Old', icon: null, color: null, position: 9, is_system: false, is_active: false }]);
    expect(api.labelFor('call')).toBe('Call');
    expect(api.labelFor('industry_visit')).toBe('Industry Visit');
    expect(api.active.map((t) => t.slug)).not.toContain('old');
    expect(api.meta('old')?.name).toBe('Old');
  });
});
