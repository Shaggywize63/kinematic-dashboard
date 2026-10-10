import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Distribution → Orders and Payments lists.
 *
 * The list endpoints return bare rows (ids only), so both pages resolve outlet / distributor / salesman names
 * from the lists they can already fetch (/stores, /distribution/distributors, /users) and fall back to a short id
 * only when a name cannot be found. Orders also gets server-side filters — date range, salesman (employee),
 * outlet — that must be SENT as query params (salesman_id / outlet_id / from / to) and refetch on change.
 * Payments shows who collected, from which outlet, mode, status and the invoice allocation (read-only).
 *
 * Everything runs against an intercepted API and asserts on what the page shows and SENDS.
 */

const D1 = 'd1111111-1111-4111-8111-111111111111';
const S_RAVI = 's1111111-1111-4111-8111-111111111111';
const S_ASHA = 's2222222-2222-4222-8222-222222222222';
const S_OLD = 's3333333-3333-4333-8333-333333333333';
const S_GONE = 's9999999-9999-4999-8999-999999999999'; // not in any list we can read
const O_BALAJI = 'a1111111-1111-4111-8111-111111111111';
const O_HARI = 'a2222222-2222-4222-8222-222222222222';

const DISTRIBUTORS = [{ id: D1, name: 'Sri Lakshmi Traders', is_active: true }];
const USERS = [
  { id: S_RAVI, name: 'Ravi Kumar', is_active: true },
  { id: S_ASHA, name: 'Asha Menon', is_active: true },
  { id: S_OLD, name: 'Old Rep', is_active: false }, // deactivated: still named on old rows, not offered as a filter
];
const STORES = [{ id: O_BALAJI, name: 'Balaji Stores' }, { id: O_HARI, name: 'Hari Mart' }];

const order = (n: number, o: Partial<Record<string, unknown>>) => ({
  id: `ord-${n}`, order_no: `ORD-00${n}`, status: 'placed', grand_total: 1000 * n, placed_at: `2026-10-0${n}T10:00:00+05:30`,
  geofence_passed: true, outlet_id: O_BALAJI, distributor_id: D1, salesman_id: S_RAVI, ...o,
});
const ORDERS = [
  order(1, {}),
  order(2, { outlet_id: O_HARI, salesman_id: S_ASHA }),
  order(3, { salesman_id: S_GONE, outlet_id: 'a9999999-9999-4999-8999-999999999999', distributor_id: 'd9999999-9999-4999-8999-999999999999' }),
];

interface Seen { path: string; query: URLSearchParams }

async function setup(page: Page, handlers: (path: string, q: URLSearchParams) => unknown | undefined) {
  const seen: Seen[] = [];
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      if (method !== 'GET') return false;
      const u = new URL(url);
      seen.push({ path: u.pathname, query: u.searchParams });
      let data: unknown;
      if (u.pathname === '/api/v1/distribution/distributors') data = DISTRIBUTORS;
      else if (u.pathname === '/api/v1/users') data = USERS;
      else if (u.pathname === '/api/v1/stores') data = STORES;
      else data = handlers(u.pathname, u.searchParams);
      if (data === undefined) return false;
      await route.fulfill({ json: { success: true, data } });
      return true;
    },
  });
  return seen;
}

const ordersReqs = (seen: Seen[]) => seen.filter((r) => r.path === '/api/v1/distribution/orders');
const lastOrdersReq = (seen: Seen[]) => ordersReqs(seen).pop()!;
const row = (page: Page, text: string) => page.locator('tbody tr').filter({ hasText: text });

// ── Orders ───────────────────────────────────────────────────────────────────
test.describe('Distribution orders — names and filters', () => {
  /** Behaves like the real endpoint for the filters under test. */
  const serve = (path: string, q: URLSearchParams) => {
    if (path !== '/api/v1/distribution/orders') return undefined;
    return ORDERS.filter((o) => (!q.get('salesman_id') || o.salesman_id === q.get('salesman_id')) && (!q.get('outlet_id') || o.outlet_id === q.get('outlet_id')));
  };

  test('shows outlet, distributor and salesman NAMES, not truncated ids; an unknown id falls back to a short id', async ({ page }) => {
    await setup(page, serve);
    await page.goto('/dashboard/distribution/orders');

    const r1 = row(page, 'ORD-001');
    await expect(r1).toContainText('Balaji Stores');
    await expect(r1).toContainText('Sri Lakshmi Traders');
    await expect(r1).toContainText('Ravi Kumar');
    await expect(r1).not.toContainText(S_RAVI.slice(0, 8));
    await expect(r1).not.toContainText(D1.slice(0, 8));
    await expect(r1).not.toContainText(O_BALAJI.slice(0, 8));

    await expect(row(page, 'ORD-002')).toContainText('Hari Mart');
    await expect(row(page, 'ORD-002')).toContainText('Asha Menon');

    // Nothing resolves for ORD-003: the short ids are shown rather than blanks.
    const r3 = row(page, 'ORD-003');
    await expect(r3).toContainText(`${S_GONE.slice(0, 8)}…`);
    await expect(r3).toContainText('a9999999…');
    await expect(r3).toContainText('d9999999…');
  });

  test('the salesman filter lists active people, sends salesman_id, and refetches', async ({ page }) => {
    const seen = await setup(page, serve);
    await page.goto('/dashboard/distribution/orders');
    await expect(row(page, 'ORD-001')).toBeVisible();
    expect(lastOrdersReq(seen).query.get('salesman_id')).toBeNull(); // nothing selected: nothing sent
    expect(lastOrdersReq(seen).query.get('limit')).toBe('200');

    const select = page.getByLabel('Filter by salesman');
    await expect(select.locator('option')).toHaveText(['All salesmen', 'Asha Menon', 'Ravi Kumar']); // Old Rep is inactive
    await select.selectOption({ label: 'Asha Menon' });

    await expect(row(page, 'ORD-002')).toBeVisible();
    await expect(row(page, 'ORD-001')).toHaveCount(0);
    expect(lastOrdersReq(seen).query.get('salesman_id')).toBe(S_ASHA);
  });

  test('the outlet filter sends outlet_id, refetches, and clears', async ({ page }) => {
    const seen = await setup(page, serve);
    await page.goto('/dashboard/distribution/orders');
    await expect(row(page, 'ORD-001')).toBeVisible();

    await page.getByText('All outlets').click();
    const dropdown = page.getByPlaceholder('Search by name, city, or zone…').locator('xpath=../..');
    await dropdown.getByText('Hari Mart').click();

    await expect(row(page, 'ORD-002')).toBeVisible();
    await expect(row(page, 'ORD-001')).toHaveCount(0);
    expect(lastOrdersReq(seen).query.get('outlet_id')).toBe(O_HARI);

    // Clearing goes back to the unfiltered list (the client's 60s GET cache may answer it without a new request,
    // so assert on what is shown, not on a fresh network call).
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(row(page, 'ORD-001')).toBeVisible();
    await expect(row(page, 'ORD-002')).toBeVisible();
    await expect(page.getByText('All outlets')).toBeVisible();
  });

  test('a date range is sent as the IST day bounds, so the whole last day is included', async ({ page }) => {
    const seen = await setup(page, serve);
    await page.goto('/dashboard/distribution/orders');
    await expect(row(page, 'ORD-001')).toBeVisible();

    await page.getByLabel('Placed from').fill('2026-10-01');
    await page.getByLabel('Placed to').fill('2026-10-07');
    await expect.poll(() => lastOrdersReq(seen).query.get('to')).toBe('2026-10-07T23:59:59.999+05:30');
    expect(lastOrdersReq(seen).query.get('from')).toBe('2026-10-01T00:00:00+05:30');
  });

  test('filters combine, and "Clear filters" resets every one of them', async ({ page }) => {
    const seen = await setup(page, serve);
    await page.goto('/dashboard/distribution/orders');
    await expect(row(page, 'ORD-001')).toBeVisible();

    await page.getByLabel('Filter by status').selectOption('placed');
    await page.getByLabel('Filter by salesman').selectOption({ label: 'Ravi Kumar' });
    await page.getByLabel('Placed from').fill('2026-10-01');
    await expect.poll(() => lastOrdersReq(seen).query.get('from')).toBe('2026-10-01T00:00:00+05:30');
    const q = lastOrdersReq(seen).query;
    expect(q.get('status')).toBe('placed');
    expect(q.get('salesman_id')).toBe(S_RAVI);

    await expect(row(page, 'ORD-002')).toHaveCount(0); // Ravi's orders only

    // Reset: every control is back to empty and the unfiltered list is shown again.
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(row(page, 'ORD-002')).toBeVisible();
    await expect(page.getByLabel('Filter by status')).toHaveValue('');
    await expect(page.getByLabel('Filter by salesman')).toHaveValue('');
    await expect(page.getByLabel('Placed from')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
  });

  test('a From date after the To date is flagged and nothing is requested for it', async ({ page }) => {
    const seen = await setup(page, serve);
    await page.goto('/dashboard/distribution/orders');
    await expect(row(page, 'ORD-001')).toBeVisible();
    await page.getByLabel('Placed to').fill('2026-10-01');
    await expect.poll(() => lastOrdersReq(seen).query.get('to')).toBe('2026-10-01T23:59:59.999+05:30');
    const before = ordersReqs(seen).length;

    // Playwright bypasses the input's min/max, like a typed date would.
    await page.getByLabel('Placed from').fill('2026-10-05');
    await expect(page.getByText('The From date is after the To date.')).toBeVisible();
    await page.waitForTimeout(500);
    expect(ordersReqs(seen).length).toBe(before);
  });

  test('a failed load is reported instead of showing a silent empty list', async ({ page }) => {
    await seedSession(page, SEED_USER);
    await mockApi(page, {
      me: { success: true, data: SEED_USER },
      onRequest: async (route, url, method) => {
        if (method === 'GET' && new URL(url).pathname === '/api/v1/distribution/orders') {
          await route.fulfill({ status: 500, json: { success: false, error: 'orders unavailable' } });
          return true;
        }
        return false;
      },
    });
    await page.goto('/dashboard/distribution/orders');
    await expect(page.getByRole('alert').filter({ hasText: 'orders unavailable' })).toBeVisible();
  });
});

// ── Payments ─────────────────────────────────────────────────────────────────
const payment = (n: number, o: Partial<Record<string, unknown>>) => ({
  id: `pay-${n}`, payment_no: `PAY-00${n}`, outlet_id: O_BALAJI, salesman_id: S_RAVI, mode: 'cash', status: 'cleared', amount: 1000,
  reference: null, received_at: `2026-10-0${n}T11:00:00+05:30`, applied_to_invoices: [], ...o,
});
const INV = (n: number) => `i000000${n}-0000-4000-8000-000000000000`;
const PAYMENTS = [
  // fully allocated across two invoices
  payment(1, { amount: 1500, applied_to_invoices: [{ invoice_id: INV(1), invoice_no: 'INV-0042', amount: 1200 }, { invoice_id: INV(2), invoice_no: 'INV-0043', amount: 300 }] }),
  // partly allocated: the rest stays on account
  payment(2, { outlet_id: O_HARI, salesman_id: S_ASHA, mode: 'upi', reference: 'UTR778899', amount: 1000, applied_to_invoices: [{ invoice_id: INV(3), invoice_no: 'INV-0050', amount: 600 }] }),
  // nothing applied
  payment(3, { mode: 'cheque', status: 'pending', amount: 500, applied_to_invoices: [] }),
  // an old row: allocation stored before invoice numbers were (id only)
  payment(4, { amount: 250, applied_to_invoices: [{ invoice_id: 'abcdef12-0000-4000-8000-000000000000', amount: 250 }] }),
  // many invoices
  payment(5, { amount: 5000, applied_to_invoices: [1, 2, 3, 4, 5].map((i) => ({ invoice_id: INV(i), invoice_no: `INV-10${i}`, amount: 1000 })) }),
];

test.describe('Distribution payments — who, where, and what it settled', () => {
  const serve = (path: string, q: URLSearchParams) =>
    path === '/api/v1/distribution/payments' ? PAYMENTS.filter((p) => !q.get('mode') || p.mode === q.get('mode')) : undefined;

  test('shows outlet, collected-by, mode and status as names/labels', async ({ page }) => {
    await setup(page, serve);
    await page.goto('/dashboard/distribution/payments');

    const headers = page.locator('thead th');
    await expect(headers).toContainText(['Payment #', 'Outlet', 'Collected by', 'Mode', 'Reference', 'Received', 'Status', 'Applied to invoices', 'Amount']);

    const r2 = row(page, 'PAY-002');
    await expect(r2).toContainText('Hari Mart');
    await expect(r2).toContainText('Asha Menon');
    await expect(r2).toContainText('upi');
    await expect(r2).toContainText('cleared');
    await expect(r2).not.toContainText(O_HARI.slice(0, 8));
    await expect(row(page, 'PAY-003')).toContainText('cheque');
    await expect(row(page, 'PAY-003')).toContainText('pending');
    await expect(row(page, 'PAY-001')).toContainText('Ravi Kumar');
    // the outlet still links through to its ledger
    await expect(row(page, 'PAY-002').getByRole('link', { name: 'Hari Mart' })).toHaveAttribute('href', `/dashboard/distribution/ledger?outlet_id=${O_HARI}`);
  });

  test('the allocation column lists invoice number + amount per entry, and what is left on account', async ({ page }) => {
    await setup(page, serve);
    await page.goto('/dashboard/distribution/payments');

    const r1 = row(page, 'PAY-001');
    await expect(r1.getByTestId('allocation')).toHaveText(['INV-0042 · ₹1,200', 'INV-0043 · ₹300']);
    await expect(r1).not.toContainText('On account');

    const r2 = row(page, 'PAY-002');
    await expect(r2.getByTestId('allocation')).toHaveText(['INV-0050 · ₹600']);
    await expect(r2).toContainText('On account ₹400');

    // Nothing applied: a dash, not an invented allocation.
    await expect(row(page, 'PAY-003').getByTestId('allocation')).toHaveCount(0);

    // Old row with no invoice_no: the invoice id stands in.
    await expect(row(page, 'PAY-004').getByTestId('allocation')).toHaveText(['#abcdef12 · ₹250']);

    // Many invoices: the first three, then a count (the full list is in the tooltip).
    const r5 = row(page, 'PAY-005');
    await expect(r5.getByTestId('allocation')).toHaveCount(3);
    await expect(r5).toContainText('+2 more');
  });

  test('the page stays read-only and the mode filter still refetches', async ({ page }) => {
    const seen = await setup(page, serve);
    await page.goto('/dashboard/distribution/payments');
    await expect(row(page, 'PAY-001')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Add|New|Edit|Delete|Approve)/ })).toHaveCount(0);

    await page.getByLabel('Filter by mode').selectOption('upi');
    await expect(row(page, 'PAY-002')).toBeVisible();
    await expect(row(page, 'PAY-001')).toHaveCount(0);
    const last = seen.filter((r) => r.path === '/api/v1/distribution/payments').pop()!;
    expect(last.query.get('mode')).toBe('upi');
  });
});
