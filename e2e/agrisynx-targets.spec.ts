import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession } from './utils';

/**
 * Sales + Collection rupee targets (web). Opt-in per client by DATA: GET /crm/targets/types answers [] (or fails)
 * for a client that has not switched them on, and then nothing new appears anywhere and the weekly lead target
 * is exactly what it always was.
 *
 * Everything runs against an intercepted API (the default mock answers every GET with `data: []`, so each
 * rupee endpoint has an explicit handler here) and asserts on what the page shows and what it SENDS.
 */

const LEVELS = [{ id: 'lvl-dealer', name: 'Dealer Rep' }, { id: 'lvl-mgr', name: 'Area Manager' }];
const USERS = [
  { id: 'u-asha', name: 'Asha Menon', role: 'executive', city: 'Pune', org_role_id: 'lvl-dealer' },
  { id: 'u-ravi', name: 'Ravi Kumar', role: 'executive', city: 'Nashik', org_role_id: 'lvl-dealer' },
  { id: 'u-meera', name: 'Meera Rao', role: 'manager', city: 'Pune', org_role_id: 'lvl-mgr' },
];
const SALES = { key: 'sales', label: 'Sales target', metric: 'sales_amount', period: 'monthly', unit: 'INR' };
const COLLECTION = { key: 'collection', label: 'Recovery target', metric: 'collection_amount', period: 'monthly', unit: 'INR' };

const BOARD = (type: string, label: string) => ({
  type, label, metric: `${type}_amount`, period: 'monthly', period_start: '2026-10-01', period_end: '2026-10-31', generated_at: '2026-10-09T06:00:00Z',
  stats: { participants: 3, total_target: 300000, total_achieved: 140000, meeting_target: 1, target_participants: 2, top_performer: { name: 'Asha Menon', achieved: 120000 }, lowest_performer: { name: 'Meera Rao', achieved: 0 } },
  entries: [
    { user_id: 'u-asha', name: 'Asha Menon', role: 'Dealer Rep', target: 100000, achieved: 120000, pct: 120 },
    { user_id: 'u-ravi', name: 'Ravi Kumar', role: 'Dealer Rep', target: 200000, achieved: 20000, pct: 10 },
    { user_id: 'u-meera', name: 'Meera Rao', role: 'Area Manager', target: null, achieved: 0, pct: null },
  ],
  role_id: null,
});

const entry = (o: Record<string, unknown>) => ({
  id: 'e1', kind: 'sales', amount: 25000, entry_date: '2026-10-08', lead_id: null, lead_name: null, note: null,
  user_id: 'u-asha', user_name: 'Asha Menon', created_at: '2026-10-08T09:00:00Z', ...o,
});

interface Seen { method: string; path: string; url: string; body: any }
interface Opts {
  /** Answer of GET /types: the list, or 'fail' for a server error. */
  types?: unknown[] | 'fail';
  /** false = the caller is not an approver: all=1 answers 403. */
  approver?: boolean;
  entries?: Array<Record<string, unknown>>;
  progress?: () => unknown;
  /** The typed admin read: GET /targets?type=. */
  typed?: unknown;
  /** Answer POST /entries with this error instead of creating the entry. */
  createError?: { status: number; message: string };
}

async function setup(page: Page, o: Opts = {}) {
  const seen: Seen[] = [];
  const state = { entries: [...(o.entries ?? [])], logged: 0 };
  await seedSession(page);
  await mockApi(page, {
    onRequest: async (route: Route, url, method) => {
      const u = new URL(url);
      const ok = (data: unknown, status = 200) => route.fulfill({ status, json: { success: true, data } }).then(() => true);
      const fail = (status: number, message: string) => route.fulfill({ status, json: { success: false, error: { message } } }).then(() => true);

      if (method === 'GET' && u.pathname === '/api/v1/users') return ok(USERS);
      if (method === 'GET' && u.pathname === '/api/v1/crm/analytics/dashboard-complete') {
        return ok({ summary: { total_leads: 0, new_leads_30d: 0, open_deals: 0, open_deal_value: 0, won_deals_30d: 0, won_revenue_30d: 0, win_rate_30d: 0, avg_deal_size: 0, avg_sales_cycle_days: 0, pipeline_velocity: 0, activities_7d: 0, conversion_rate: 0 }, funnel: [], pipelineValue: [], winRate: [], forecast: [], leadScoreDistribution: [] });
      }
      if (!u.pathname.startsWith('/api/v1/crm/targets')) return false;

      const path = u.pathname.replace('/api/v1/crm/targets', '');
      let body: any = null;
      try { body = route.request().postDataJSON(); } catch { /* not json */ }
      seen.push({ method, path, url, body });

      if (method === 'GET' && path === '/types') {
        if (o.types === 'fail') return fail(500, 'boom');
        return ok({ types: o.types ?? [] });
      }
      if (method === 'GET' && path === '/progress') {
        return ok(o.progress ? o.progress() : { period_start: '2026-10-01', period_end: '2026-10-31', types: [] });
      }
      if (method === 'GET' && path === '/levels') return ok(LEVELS);
      if (method === 'GET' && path === '') {
        const type = u.searchParams.get('type');
        if (type) return ok(o.typed ?? { default_target: 0, per_level: [], per_user: [] });
        return ok({ default_target: 5, per_level: [{ hierarchy_level_id: 'lvl-dealer', target_value: 3 }], per_user: [] });
      }
      if (method === 'PUT' && path === '') return ok({ id: 't1' });
      if (method === 'GET' && path === '/leaderboard') {
        const type = u.searchParams.get('type');
        return ok(type ? BOARD(type, type === 'sales' ? SALES.label : COLLECTION.label) : { period: 'today', days: 1, generated_at: '', stats: {}, entries: [] });
      }
      if (method === 'GET' && path === '/entries') {
        if ((u.searchParams.get('all') === '1') && o.approver === false) return fail(403, "Only an approver can view other people's entries");
        let rows = state.entries.filter((e) => !u.searchParams.get('kind') || e.kind === u.searchParams.get('kind'));
        if (u.searchParams.get('user_id')) rows = rows.filter((e) => e.user_id === u.searchParams.get('user_id'));
        if (u.searchParams.get('from')) rows = rows.filter((e) => String(e.entry_date) >= u.searchParams.get('from')!);
        return ok(rows);
      }
      if (method === 'POST' && path === '/entries') {
        if (o.createError) return fail(o.createError.status, o.createError.message);
        state.logged += Number(body.amount);
        return ok(entry({ id: 'new', kind: body.kind, amount: body.amount, note: body.note ?? null }), 201);
      }
      if (method === 'DELETE' && path.startsWith('/entries/')) {
        const id = path.split('/').pop();
        state.entries = state.entries.filter((e) => e.id !== id);
        return ok({ id });
      }
      return false;
    },
  });
  return { seen, state };
}

const calls = (seen: Seen[], method: string, path: string) => seen.filter((r) => r.method === method && r.path === path);
const q = (r: Seen, k: string) => new URL(r.url).searchParams.get(k);
/** The distinct values of a query param across calls (dev mode runs effects twice, so counts are not stable). */
const distinct = (rs: Seen[], k: string) => Array.from(new Set(rs.map((r) => q(r, k))));

// ── Settings → Targets ──────────────────────────────────────────────────────
test.describe('Targets settings — a client without rupee targets', () => {
  const cases: Array<[string, unknown[] | 'fail']> = [['types is []', []], ['the types call fails', 'fail']];
  for (const [name, types] of cases) {
    test(`${name}: the weekly lead target is exactly as before`, async ({ page }) => {
      const { seen } = await setup(page, { types });
      await page.goto('/dashboard/crm/settings/targets');
      await expect(page.getByText('Targets by hierarchy level')).toBeVisible();
      await expect(page.getByText('Fallback default')).toBeVisible();
      await expect(page.getByText('leads / week')).toBeVisible();
      await expect(page.getByText(/Set the weekly lead target for each hierarchy level/)).toBeVisible();
      await expect.poll(() => calls(seen, 'GET', '/types').length).toBeGreaterThan(0);
      await page.waitForTimeout(400);
      // No switch, no rupee anything.
      await expect(page.getByRole('tab', { name: 'Lead target' })).toHaveCount(0);
      await expect(page.getByText('₹ / month')).toHaveCount(0);
      await expect(page.getByText('Team progress')).toHaveCount(0);
      // The lead target is read and written without a `type`.
      expect(calls(seen, 'GET', '').map((r) => q(r, 'type'))).toEqual([null]);
      expect(seen.some((r) => r.path === '/progress' || r.path === '/entries' || (r.path === '/leaderboard'))).toBe(false);

      // The first level row (Dealer Rep): its number box and the Save button beside it.
      const box = page.locator('input[type=number]').first();
      await expect(box).toHaveValue('3');
      await box.fill('7');
      await box.locator('xpath=ancestor::div[1]').getByRole('button', { name: 'Save' }).click();
      await expect.poll(() => calls(seen, 'PUT', '')[0]?.body).toEqual({ hierarchy_level_id: 'lvl-dealer', target_value: 7 });
    });
  }
});

test.describe('Targets settings — Sales and Collection', () => {
  const TYPED = { default_target: 500000, per_level: [{ hierarchy_level_id: 'lvl-dealer', target_value: 200000 }], per_user: [{ user_id: 'u-asha', target_value: 90000 }] };

  test('a switch appears with the lead target first; the labels come from the client', async ({ page }) => {
    const { seen } = await setup(page, { types: [SALES, COLLECTION] });
    await page.goto('/dashboard/crm/settings/targets');
    const tabs = page.getByRole('tab');
    await expect(tabs.filter({ hasText: 'Lead target' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Sales target' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Recovery target' })).toBeVisible();
    // Still the lead UI underneath, read without a type.
    await expect(page.getByText('Targets by hierarchy level')).toBeVisible();
    await expect(page.getByText('leads / week')).toBeVisible();
    await expect(page.getByText('₹ / month')).toHaveCount(0);
    expect(calls(seen, 'GET', '').map((r) => q(r, 'type'))).toEqual([null]);
  });

  test('the Sales view is in ₹ / month, reads with the type and shows the saved targets in Indian grouping', async ({ page }) => {
    const { seen } = await setup(page, { types: [SALES, COLLECTION], typed: TYPED });
    await page.goto('/dashboard/crm/settings/targets');
    await page.getByRole('tab', { name: 'Sales target' }).click();

    await expect(page.getByText('Sales target by hierarchy level')).toBeVisible();
    await expect(page.getByText('₹ / month').first()).toBeVisible();
    await expect(page.getByText('leads / week')).toHaveCount(0);
    await expect(page.getByText('Leads / week')).toHaveCount(0);
    await expect(page.getByLabel('Dealer Rep sales target')).toHaveValue('2,00,000');
    await expect(page.getByLabel('Fallback sales target')).toHaveValue('5,00,000');
    expect(distinct(calls(seen, 'GET', ''), 'type')).toEqual([null, 'sales']);
    expect(distinct(calls(seen, 'GET', '/leaderboard'), 'type')).toEqual(['sales']);
  });

  test('a level, a person and the fallback save through the typed PUT as whole monthly rupees', async ({ page }) => {
    const { seen } = await setup(page, { types: [SALES, COLLECTION], typed: TYPED });
    await page.goto('/dashboard/crm/settings/targets');
    await page.getByRole('tab', { name: 'Sales target' }).click();
    const put = () => calls(seen, 'PUT', '').map((r) => r.body);
    const save = (label: string) => page.getByLabel(label).locator('xpath=ancestor::div[1]').getByRole('button', { name: 'Save' });

    // A level: typing groups the digits the Indian way; the request carries the plain integer.
    const level = page.getByLabel('Area Manager sales target');
    await level.fill('1500000');
    await expect(level).toHaveValue('15,00,000');
    await save('Area Manager sales target').click();
    await expect.poll(put).toEqual([{ type: 'sales', hierarchy_level_id: 'lvl-mgr', target_value: 1500000 }]);

    // The fallback for everyone else.
    await page.getByLabel('Fallback sales target').fill('2,50,000');
    await page.getByRole('button', { name: 'Save fallback' }).click();
    await expect.poll(put).toContainEqual({ type: 'sales', all: true, target_value: 250000 });

    // One person, found through their level.
    await page.getByLabel('Level', { exact: true }).selectOption('lvl-dealer');
    await expect(page.getByLabel('Ravi Kumar sales target')).toHaveAttribute('placeholder', '2,00,000');
    await expect(page.getByLabel('Asha Menon sales target')).toHaveValue('90,000');
    await page.getByLabel('Ravi Kumar sales target').fill('75000');
    await save('Ravi Kumar sales target').click();
    await expect.poll(put).toContainEqual({ type: 'sales', user_id: 'u-ravi', target_value: 75000 });
    expect(put()).toHaveLength(3);
  });

  test('a blank box cannot be saved, and a target above ₹100 crore is refused before anything is sent', async ({ page }) => {
    const { seen } = await setup(page, { types: [SALES], typed: TYPED });
    await page.goto('/dashboard/crm/settings/targets');
    await page.getByRole('tab', { name: 'Sales target' }).click();
    const box = page.getByLabel('Area Manager sales target');
    const saveBtn = box.locator('xpath=ancestor::div[1]').getByRole('button', { name: 'Save' });
    await expect(box).toHaveValue('');
    await expect(saveBtn).toBeDisabled();

    await box.fill('1000000000');
    await expect(box).toHaveValue('1,00,00,00,000');
    await expect(saveBtn).toBeEnabled();                       // exactly the ceiling is fine
    await box.fill('1000000001');
    await expect(page.getByText('At most ₹1,00,00,00,000 a month.')).toBeVisible();
    await expect(saveBtn).toBeDisabled();
    await box.fill('0');
    await expect(saveBtn).toBeEnabled();                       // 0 is a real target ("none")
    expect(calls(seen, 'PUT', '')).toHaveLength(0);
  });

  test('the Collection view uses the client\'s own label and the collection type', async ({ page }) => {
    const { seen } = await setup(page, { types: [SALES, COLLECTION] });
    await page.goto('/dashboard/crm/settings/targets');
    await page.getByRole('tab', { name: 'Recovery target' }).click();
    await expect(page.getByText('Recovery target by hierarchy level')).toBeVisible();
    await expect(page.getByText(/Set the monthly recovery target in rupees/)).toBeVisible();
    expect(distinct(calls(seen, 'GET', ''), 'type')).toEqual([null, 'collection']);
    expect(calls(seen, 'GET', '/entries').pop()).toBeTruthy();
    expect(q(calls(seen, 'GET', '/entries').pop()!, 'kind')).toBe('collection');

    // Back to the lead target: the weekly UI returns untouched.
    await page.getByRole('tab', { name: 'Lead target' }).click();
    await expect(page.getByText('leads / week')).toBeVisible();
    await expect(page.getByText('Team progress')).toHaveCount(0);
  });

  test('Team progress lists the month for each person with a bar, "—" for someone with no target', async ({ page }) => {
    await setup(page, { types: [SALES] });
    await page.goto('/dashboard/crm/settings/targets');
    await page.getByRole('tab', { name: 'Sales target' }).click();
    await expect(page.getByText('Team progress')).toBeVisible();
    await expect(page.getByText('1 Oct 2026 – 31 Oct 2026 · ₹1,40,000 of ₹3,00,000 · 1 of 2 on target')).toBeVisible();

    const rows = page.locator('table').first().locator('tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Asha Menon');
    await expect(rows.nth(0)).toContainText('Dealer Rep');
    await expect(rows.nth(0)).toContainText('₹1,00,000');
    await expect(rows.nth(0)).toContainText('₹1,20,000');
    await expect(rows.nth(0)).toContainText('120%');
    await expect(rows.nth(0).locator('[role=presentation]')).toHaveCSS('width', /px/);
    await expect(rows.nth(1)).toContainText('10%');
    await expect(rows.nth(2)).toContainText('Meera Rao');
    await expect(rows.nth(2).locator('td').nth(2)).toHaveText('—');
    await expect(rows.nth(2).locator('td').nth(4)).toHaveText('—');
    await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/targets-sales.png` : undefined, fullPage: true });
  });

  test('Entries: everyone\'s (all=1), filterable by person and date, and deletable after a confirm', async ({ page }) => {
    const { seen } = await setup(page, {
      types: [SALES],
      entries: [
        entry({ id: 'e1', amount: 25000, entry_date: '2026-10-08', lead_name: 'Sharma Agro', note: 'Cement order' }),
        entry({ id: 'e2', amount: 1250.5, entry_date: '2026-10-02', user_id: 'u-ravi', user_name: 'Ravi Kumar' }),
        entry({ id: 'e3', kind: 'collection', amount: 999, user_id: 'u-ravi', user_name: 'Ravi Kumar' }),
      ],
    });
    await page.goto('/dashboard/crm/settings/targets');
    await page.getByRole('tab', { name: 'Sales target' }).click();

    const table = page.locator('table').nth(1);
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(table).toContainText('₹25,000');
    await expect(table).toContainText('Sharma Agro');
    await expect(table).toContainText('Cement order');
    await expect(table).toContainText('₹1,250.5');
    await expect(table).not.toContainText('₹999');                   // the other kind
    const first = calls(seen, 'GET', '/entries')[0];
    expect([q(first, 'kind'), q(first, 'all'), q(first, 'limit')]).toEqual(['sales', '1', '50']);

    await page.getByLabel('Person', { exact: true }).selectOption('u-ravi');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table).toContainText('Ravi Kumar');
    expect(q(calls(seen, 'GET', '/entries').pop()!, 'user_id')).toBe('u-ravi');

    await page.getByLabel('Person', { exact: true }).selectOption('');
    await page.getByLabel('From date').fill('2026-10-05');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table).toContainText('Sharma Agro');
    expect(q(calls(seen, 'GET', '/entries').pop()!, 'from')).toBe('2026-10-05');
    await page.getByLabel('From date').fill('');

    // Delete asks first; "Cancel" sends nothing.
    await expect(table.locator('tbody tr')).toHaveCount(2);
    const boards = calls(seen, 'GET', '/leaderboard').length;
    await page.getByRole('button', { name: 'Delete the ₹25,000 entry' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('₹25,000 logged by Asha Menon on 8 Oct 2026');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(calls(seen, 'DELETE', '/entries/e1')).toHaveLength(0);

    await page.getByRole('button', { name: 'Delete the ₹25,000 entry' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete entry' }).click();
    await expect.poll(() => calls(seen, 'DELETE', '/entries/e1').length).toBe(1);
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table).not.toContainText('Sharma Agro');
    // The team totals are re-read: that entry no longer counts.
    await expect.poll(() => calls(seen, 'GET', '/leaderboard').length).toBeGreaterThan(boards);
  });

  test('a manager who is not an approver gets their own entries instead of an error', async ({ page }) => {
    const { seen } = await setup(page, { types: [SALES], approver: false, entries: [entry({ id: 'e9', amount: 4000, user_id: 'u-meera', user_name: 'Meera Rao' })] });
    await page.goto('/dashboard/crm/settings/targets');
    await page.getByRole('tab', { name: 'Sales target' }).click();
    await expect(page.getByText('Showing your own entries.')).toBeVisible();
    await expect(page.locator('table').nth(1)).toContainText('₹4,000');
    await expect(page.getByLabel('Person', { exact: true })).toHaveCount(0);
    const reqs = calls(seen, 'GET', '/entries');
    expect(q(reqs[0], 'all')).toBe('1');
    expect(q(reqs[reqs.length - 1], 'all')).toBeNull();
  });
});

// ── CRM home ────────────────────────────────────────────────────────────────
const PROGRESS = (achievedSales: number) => ({
  period_start: '2026-10-01', period_end: '2026-10-31',
  types: [
    { key: 'sales', label: 'Sales target', target: 500000, achieved: achievedSales, pct: Math.round((achievedSales / 500000) * 100), source: 'role' },
    { key: 'collection', label: 'Recovery target', target: null, achieved: 1000, pct: null, source: null },
  ],
});

test.describe('CRM home — My targets', () => {
  test('nothing at all for a client without rupee targets', async ({ page }) => {
    const { seen } = await setup(page, { types: [] });
    await page.goto('/dashboard/crm/home');
    await expect(page.getByText('Next best actions')).toBeVisible();
    await expect.poll(() => calls(seen, 'GET', '/types').length).toBeGreaterThan(0);
    await page.waitForTimeout(400);
    await expect(page.getByText('My targets')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Log sale|Log collection/ })).toHaveCount(0);
    expect(seen.some((r) => r.path === '/progress')).toBe(false);
  });

  test('shows the month\'s progress for each type, and a target-less type as "no target set"', async ({ page }) => {
    await setup(page, { types: [SALES, COLLECTION], progress: () => PROGRESS(120000) });
    await page.goto('/dashboard/crm/home');
    await expect(page.getByText('My targets')).toBeVisible();
    await expect(page.getByText('1 Oct – 31 Oct')).toBeVisible();
    await expect(page.getByText('₹1,20,000', { exact: true })).toBeVisible();
    await expect(page.getByText('of ₹5,00,000')).toBeVisible();
    await expect(page.getByText('24%')).toBeVisible();
    await expect(page.getByText('₹1,000', { exact: true })).toBeVisible();
    await expect(page.getByText('no target set', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log sale' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log collection' })).toBeVisible();
    await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/home-my-targets.png` : undefined, fullPage: true });
  });

  test('only the enabled types get a button', async ({ page }) => {
    await setup(page, { types: [SALES], progress: () => ({ ...PROGRESS(0), types: PROGRESS(0).types.slice(0, 1) }) });
    await page.goto('/dashboard/crm/home');
    await expect(page.getByRole('button', { name: 'Log sale' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log collection' })).toHaveCount(0);
  });

  test('Log sale posts the entry (no date, no dealer) and the totals refresh', async ({ page }) => {
    let achieved = 120000;
    const { seen } = await setup(page, { types: [SALES, COLLECTION], progress: () => PROGRESS(achieved) });
    await page.goto('/dashboard/crm/home');
    await expect(page.getByText('₹1,20,000', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Log sale' }).click();
    const dialog = page.getByRole('dialog');
    const save = dialog.getByRole('button', { name: 'Save' });
    await expect(dialog.getByText('Log sale', { exact: true })).toBeVisible();
    await expect(save).toBeDisabled();
    await dialog.getByLabel('Amount (₹)').fill('25000');
    await expect(dialog.getByLabel('Amount (₹)')).toHaveValue('25,000');
    await dialog.getByLabel('Note').fill('Cement order, Sharma Agro');
    achieved = 145000;                                     // what the server will report after the entry
    await save.click();

    await expect.poll(() => calls(seen, 'POST', '/entries')[0]?.body).toEqual({ kind: 'sales', amount: 25000, note: 'Cement order, Sharma Agro' });
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('₹1,45,000', { exact: true })).toBeVisible();
    await expect(page.getByText('29%')).toBeVisible();
    expect(calls(seen, 'GET', '/progress').length).toBeGreaterThanOrEqual(2);
  });

  test('Log collection sends the collection kind; a note is optional and paise are kept', async ({ page }) => {
    const { seen } = await setup(page, { types: [SALES, COLLECTION], progress: () => PROGRESS(0) });
    await page.goto('/dashboard/crm/home');
    await page.getByRole('button', { name: 'Log collection' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Amount (₹)').fill('1250.5');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => calls(seen, 'POST', '/entries')[0]?.body).toEqual({ kind: 'collection', amount: 1250.5 });
  });

  test('zero or an amount above the ceiling cannot be saved', async ({ page }) => {
    const { seen } = await setup(page, { types: [SALES], progress: () => PROGRESS(0) });
    await page.goto('/dashboard/crm/home');
    await page.getByRole('button', { name: 'Log sale' }).click();
    const dialog = page.getByRole('dialog');
    const amount = dialog.getByLabel('Amount (₹)');
    const save = dialog.getByRole('button', { name: 'Save' });
    await amount.fill('0');
    await expect(save).toBeDisabled();
    await amount.fill('1000000001');
    await expect(dialog.getByText('Up to ₹1,00,00,00,000')).toBeVisible();
    await expect(save).toBeDisabled();
    await amount.fill('1000000000');
    await expect(save).toBeEnabled();
    expect(calls(seen, 'POST', '/entries')).toHaveLength(0);
  });

  test('a refusal from the server is shown and the form stays open', async ({ page }) => {
    await setup(page, { types: [SALES], progress: () => PROGRESS(0), createError: { status: 409, message: 'Sales and collection entries need a one-time database update. Ask your administrator to apply it.' } });
    await page.goto('/dashboard/crm/home');
    await page.getByRole('button', { name: 'Log sale' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Amount (₹)').fill('500');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/need a one-time database update/)).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Amount (₹)')).toHaveValue('500');
  });
});

// ── the global city picker must not touch the rupee endpoints ──────────────
test.describe('Rupee targets ignore the global city scope', () => {
  test('with a city picked, no targets request carries ?city= (a city-aware CRM call still does)', async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.setItem('kinematic_selected_city', 'Pune'); } catch { /* ignore */ } });
    const all: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/crm/')) all.push(r.url()); });
    const { seen } = await setup(page, { types: [SALES, COLLECTION], progress: () => PROGRESS(1000), entries: [entry({})] });

    await page.goto('/dashboard/crm/home');
    await expect(page.getByText('My targets')).toBeVisible();
    await page.getByRole('button', { name: 'Log sale' }).click();
    await page.getByRole('dialog').getByLabel('Amount (₹)').fill('10');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => calls(seen, 'POST', '/entries').length).toBe(1);

    await page.goto('/dashboard/crm/settings/targets');
    await page.getByRole('tab', { name: 'Sales target' }).click();
    await expect(page.getByText('Team progress')).toBeVisible();
    await expect(page.locator('table').nth(1)).toContainText('₹25,000');

    // Positive control: the city picker IS active in this browser — a city-aware endpoint gets the filter.
    await page.goto('/dashboard/crm/dashboard');
    await expect.poll(() => all.some((u) => u.includes('/crm/analytics/dashboard-complete') && u.includes('city=Pune'))).toBe(true);

    const targetUrls = all.filter((u) => u.includes('/api/v1/crm/targets'));
    expect(targetUrls.length).toBeGreaterThanOrEqual(8);
    expect(targetUrls.filter((u) => /[?&]city=/.test(u))).toEqual([]);
  });
});
