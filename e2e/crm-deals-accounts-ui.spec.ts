import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * The Deals and Accounts list pages.
 *  - Deals: status tiles (All / Open / Won / Lost + win rate) whose count and value come from one count-only request per
 *    status with the list's own filters; a tile is also the status filter; overdue / due-soon close dates; Clear filters;
 *    an admin-hidden built-in field (amount) drops its column and turns the tiles into counts.
 *  - Accounts: search, sort and paging on the server (the count badge is the server total, not the first page); each row
 *    shows its open / won deal and contact rollups; an admin-hidden built-in field (industry) drops its column.
 * All data is fake and served by page.route.
 */

test.describe.configure({ timeout: 120_000 });

type Row = Record<string, unknown>;
const iso = (offsetDays: number) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10); };

const PIPELINES = [{ id: 'pl-1', name: 'Sales', is_default: true, stages: [{ id: 'st-1', name: 'Qualified', position: 1 }, { id: 'st-2', name: 'Proposal', position: 2 }] }];
const DEALS: Row[] = [
  { id: 'd1', name: 'Rooftop solar — Phase 2', account_id: 'a1', account_name: 'Northwind Builders', pipeline_id: 'pl-1', stage_id: 'st-2', stage_name: 'Proposal', amount: 1250000, probability: 0.6, expected_close_date: iso(-4), status: 'open', owner_id: 'u1', owner_name: 'Priya Shah' },
  { id: 'd2', name: 'Warehouse racking', account_id: 'a2', account_name: 'Contoso Logistics', pipeline_id: 'pl-1', stage_id: 'st-1', stage_name: 'Qualified', amount: 480000, probability: 0.3, expected_close_date: iso(3), status: 'open', owner_id: 'u1', owner_name: 'Priya Shah' },
  { id: 'd3', name: 'Annual service contract', account_id: 'a1', account_name: 'Northwind Builders', pipeline_id: 'pl-1', stage_id: 'st-2', stage_name: 'Proposal', amount: 900000, expected_close_date: iso(-20), actual_close_date: iso(-10), status: 'won', owner_id: 'u2', owner_name: 'Arjun Rao' },
];
const STATUS_TOTALS: Record<string, { total: number; value: number }> = { open: { total: 20, value: 4060000 }, won: { total: 6, value: 1800000 }, lost: { total: 2, value: 300000 } };

const ACCOUNTS: Row[] = [
  { id: 'a1', name: 'Northwind Builders', industry: 'Construction', website: 'https://www.northwind.example', state: 'Maharashtra', country: 'India', owner_id: 'u1', owner_name: 'Priya Shah', open_deals_count: 2, open_deals_value: 2150000, won_deals_count: 1, won_deals_value: 900000, contacts_count: 4, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
  { id: 'a2', name: 'Contoso Logistics', industry: 'Logistics', state: 'Karnataka', owner_id: null, owner_name: null, open_deals_count: 0, open_deals_value: 0, won_deals_count: 0, won_deals_value: 0, contacts_count: 0, created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' },
];

interface Seen { deals: URLSearchParams[]; accounts: URLSearchParams[] }

async function setup(page: Page, overrides: Record<string, unknown> = {}, accountsTotal = 137): Promise<Seen> {
  const seen: Seen = { deals: [], accounts: [] };
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: { field_overrides: overrides } } },
    onRequest: async (route: Route, url: string, method: string) => {
      const u = new URL(url);
      if (method !== 'GET') return false;
      if (u.pathname === '/api/v1/crm/pipelines') { await route.fulfill({ json: { success: true, data: PIPELINES } }); return true; }
      if (u.pathname === '/api/v1/crm/deals') {
        const p = u.searchParams; seen.deals.push(p);
        const st = p.get('status') ?? '';
        if (p.get('limit') === '1' && STATUS_TOTALS[st]) {
          const t = STATUS_TOTALS[st]!;
          await route.fulfill({ json: { success: true, data: DEALS.filter((d) => d.status === st).slice(0, 1), totals: { value: t.value, volume_kg: 0 }, pagination: { total: t.total, page: 1, limit: 1, totalPages: t.total, hasNext: t.total > 1, hasPrev: false } } });
          return true;
        }
        const rows = st ? DEALS.filter((d) => d.status === st) : DEALS;
        await route.fulfill({ json: { success: true, data: rows, totals: { value: 0, volume_kg: 0 }, pagination: { total: rows.length, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false } } });
        return true;
      }
      if (u.pathname === '/api/v1/crm/accounts') {
        const p = u.searchParams; seen.accounts.push(p);
        const q = (p.get('q') ?? '').toLowerCase();
        const rows = q ? ACCOUNTS.filter((a) => String(a.name).toLowerCase().includes(q)) : ACCOUNTS;
        const total = q ? rows.length : accountsTotal;
        const limit = Number(p.get('limit') ?? 50);
        await route.fulfill({ json: { success: true, data: rows, pagination: { total, page: Number(p.get('page') ?? 1), limit, totalPages: Math.max(1, Math.ceil(total / limit)), hasNext: total > limit, hasPrev: false } } });
        return true;
      }
      return false;
    },
  });
  return seen;
}

test.describe('Deals list', () => {
  test('status tiles: counts and values per status across every page, win rate from closed deals', async ({ page }) => {
    const seen = await setup(page);
    await page.goto('/dashboard/crm/deals');
    await expect(page.getByTestId('deal-tile-open')).toContainText('₹40.6L', { timeout: 30_000 });
    await expect(page.getByTestId('deal-tile-open')).toContainText('20 deals');
    await expect(page.getByTestId('deal-tile-won')).toContainText('₹18L');
    await expect(page.getByTestId('deal-tile-lost')).toContainText('2 deals');
    await expect(page.getByTestId('deal-tile-all')).toContainText('28 deals');            // 20 + 6 + 2
    await expect(page.getByTestId('deal-tile-all')).toContainText('₹61.6L');
    await expect(page.getByTestId('deal-tile-rate')).toContainText('75%');                // 6 won of 8 closed
    await expect(page.getByTestId('deal-tile-rate')).toContainText('6 won of 8 closed');
    // one count-only call per status
    const counted = [...new Set(seen.deals.filter((p) => p.get('limit') === '1').map((p) => p.get('status')))].sort();
    expect(counted).toEqual(['lost', 'open', 'won']);
  });

  test('a tile is the status filter; Clear filters resets it', async ({ page }) => {
    const seen = await setup(page);
    await page.goto('/dashboard/crm/deals');
    await expect(page.getByRole('link', { name: 'Rooftop solar — Phase 2' })).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('deal-tile-won').click();
    await expect(page.getByTestId('deal-tile-won')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => seen.deals.some((p) => p.get('status') === 'won' && p.get('limit') === '50')).toBe(true);
    await expect(page.getByRole('link', { name: 'Annual service contract' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rooftop solar — Phase 2' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByTestId('deal-tile-all')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: 'Rooftop solar — Phase 2' })).toBeVisible();
  });

  test('open deals flag overdue and due-soon close dates; the account links to its page', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/deals');
    const overdue = page.getByRole('row', { name: /Rooftop solar/ });
    await expect(overdue).toContainText('4 days overdue', { timeout: 30_000 });
    await expect(overdue).toContainText('60% likely');
    await expect(page.getByRole('row', { name: /Warehouse racking/ })).toContainText('Due in 3 days');
    await expect(page.getByRole('row', { name: /Annual service contract/ })).not.toContainText('overdue');   // closed deals never flag
    await expect(overdue.getByRole('link', { name: 'Northwind Builders' })).toHaveAttribute('href', '/dashboard/crm/accounts/a1');
  });

  test('an admin-hidden amount drops its column and the tiles show counts, not money', async ({ page }) => {
    await setup(page, { 'deal.amount': { hidden: true } });
    await page.goto('/dashboard/crm/deals');
    await expect(page.getByRole('link', { name: 'Rooftop solar — Phase 2' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('columnheader', { name: /Amount/ })).toHaveCount(0);
    await expect(page.getByTestId('deal-tile-open')).toContainText('20');
    await expect(page.getByTestId('deal-tile-open')).not.toContainText('₹');
  });
});

test.describe('Accounts list', () => {
  test('pages on the server: the count is the server total, rows carry deal and contact rollups', async ({ page }) => {
    const seen = await setup(page);
    await page.goto('/dashboard/crm/accounts');
    await expect(page.getByTestId('accounts-total')).toHaveText('137 accounts', { timeout: 30_000 });
    expect(seen.accounts[0]!.get('page')).toBe('1');
    expect(seen.accounts[0]!.get('limit')).toBe('50');
    await expect(page.getByTestId('pager-range')).toHaveText('1–50 of 137');
    const nw = page.getByRole('row', { name: /Northwind Builders/ });
    await expect(nw).toContainText('northwind.example');
    await expect(nw).toContainText('Maharashtra, India');
    await expect(page.getByTestId('account-open-a1')).toContainText('₹21.5L');
    await expect(page.getByTestId('account-open-a1')).toContainText('2 deals');
    await expect(nw).toContainText('₹9L');                                        // won value
    await expect(page.getByTestId('account-open-a2')).toHaveText('—');
    // the next page is a server request, not a slice of the first 50
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect.poll(() => seen.accounts.some((p) => p.get('page') === '2')).toBe(true);
  });

  test('search runs on the server and says how many matched', async ({ page }) => {
    const seen = await setup(page);
    await page.goto('/dashboard/crm/accounts');
    await expect(page.getByTestId('accounts-total')).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder('Search accounts...').fill('contoso');
    await expect.poll(() => seen.accounts.some((p) => p.get('q') === 'contoso')).toBe(true);
    await expect(page.getByText('1 match')).toBeVisible();
    await expect(page.getByRole('row', { name: /Northwind/ })).toHaveCount(0);
    await page.getByPlaceholder('Search accounts...').fill('zzz');
    await expect(page.getByText('No accounts match this search')).toBeVisible();
  });

  test('an admin-hidden industry drops its column', async ({ page }) => {
    await setup(page, { 'account.industry': { hidden: true } });
    await page.goto('/dashboard/crm/accounts');
    await expect(page.getByRole('row', { name: /Northwind Builders/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('columnheader', { name: /Industry/ })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Northwind Builders/ })).not.toContainText('Construction');
  });
});

// ───────────────────────────── detail pages ─────────────────────────────
const ACCOUNT_FULL: Row = { ...ACCOUNTS[0], phone: '+91 98200 11111', email: 'hello@northwind.example', annual_revenue: 250000000, employees: 420, address_line1: '12 Marine Drive', postal_code: '400002' };
const DEAL_D1: Row = { ...DEALS[0], created_at: '2026-10-01T00:00:00Z', updated_at: '2026-11-10T00:00:00Z' };

async function setupDetail(page: Page, overrides: Record<string, unknown> = {}, deal: Row = DEAL_D1): Promise<void> {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: { field_overrides: overrides } } },
    onRequest: async (route: Route, url: string, method: string) => {
      const p = new URL(url).pathname;
      if (method !== 'GET') return false;
      const ok = async (data: unknown) => { await route.fulfill({ json: { success: true, data } }); return true; };
      if (p === '/api/v1/crm/accounts/a1') return ok(ACCOUNT_FULL);
      if (p === '/api/v1/crm/deals/d1') return ok(deal);
      if (p === '/api/v1/crm/pipelines') return ok(PIPELINES);
      return false;   // sub-resources fall through to the empty default
    },
  });
}

test.describe('Deal detail', () => {
  test('status is a badge, an overdue open deal is flagged, probability reads as a percent', async ({ page }) => {
    await setupDetail(page);
    await page.goto('/dashboard/crm/deals/d1');
    const facts = page.getByTestId('deal-key-facts');
    await expect(facts).toBeVisible({ timeout: 30_000 });
    await expect(facts).toContainText('4 days overdue');
    await expect(facts).toContainText('60%');
    await expect(facts).not.toContainText('6000%');
  });

  test('a legacy whole-number probability (60) still reads 60%, not 6000%', async ({ page }) => {
    await setupDetail(page, {}, { ...DEAL_D1, probability: '60' });
    await page.goto('/dashboard/crm/deals/d1');
    const facts = page.getByTestId('deal-key-facts');
    await expect(facts).toContainText('60%', { timeout: 30_000 });
    await expect(facts).not.toContainText('6000%');
  });

  test('admin-hidden built-in fields (stage, probability, close date, owner, amount) are not shown', async ({ page }) => {
    await setupDetail(page, { 'deal.stage_id': { hidden: true }, 'deal.probability': { hidden: true }, 'deal.expected_close_date': { hidden: true }, 'deal.owner_id': { hidden: true }, 'deal.amount': { hidden: true } });
    await page.goto('/dashboard/crm/deals/d1');
    const facts = page.getByTestId('deal-key-facts');
    await expect(facts).toBeVisible({ timeout: 30_000 });
    await expect(facts).toContainText('Status');
    for (const label of ['Stage', 'Probability', 'Close Date', 'Owner']) await expect(facts.getByText(label, { exact: true })).toHaveCount(0);
    await expect(page.getByText('₹12,50,000')).toHaveCount(0);   // the Amount hero
  });
});

test.describe('Account detail', () => {
  test('shows owner, revenue, employees and email next to industry and phone', async ({ page }) => {
    await setupDetail(page);
    await page.goto('/dashboard/crm/accounts/a1');
    const facts = page.getByTestId('account-key-facts');
    await expect(facts).toBeVisible({ timeout: 30_000 });
    for (const t of ['Construction', '+91 98200 11111', 'Priya Shah', '25,00,00,000', '420', 'hello@northwind.example']) await expect(facts).toContainText(t);
  });

  test('admin-hidden built-in fields are not shown, and a relabel is used', async ({ page }) => {
    await setupDetail(page, { 'account.owner_id': { hidden: true }, 'account.phone': { hidden: true }, 'account.industry': { label: 'Sector' } });
    await page.goto('/dashboard/crm/accounts/a1');
    const facts = page.getByTestId('account-key-facts');
    await expect(facts).toBeVisible({ timeout: 30_000 });
    await expect(facts).toContainText('Sector');
    await expect(facts).not.toContainText('Priya Shah');
    await expect(facts).not.toContainText('+91 98200 11111');
  });
});
