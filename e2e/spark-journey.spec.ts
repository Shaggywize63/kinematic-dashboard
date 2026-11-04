import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, fail, scopeToSpark } from './spark';

/**
 * Spark & Ray account journey page: the 7-step flow, KPI chips, per-stage detail and the merged event feed,
 * from a mocked /crm/accounts/:id/journey payload. It must also survive an empty / junk payload, stack the
 * flow vertically on a phone, and stay out of the way for every other tenant.
 */

const step = (key: string, label: string, count: number, state: string, note: string | null = null) => ({ key, label, count, state, note, at: count ? '2026-09-01T00:00:00Z' : null });
const JOURNEY = {
  account: { id: 'acc-1', name: 'Acme Forge' },
  steps: [
    step('lead', 'Lead', 1, 'done', '1 lead'),
    step('account', 'Account', 1, 'done'),
    step('contacts', 'Contacts', 2, 'done', '2 people'),
    step('visits', 'Visits & forms', 3, 'done', '2 visits · 1 form'),
    step('followups', 'Tasks & updates', 2, 'done', '1 task · 1 update'),
    step('deals', 'Deals & quotations', 2, 'current', '2 deals · 1 quotation'),
    step('expenses', 'Expenses', 0, 'todo'),
  ],
  summary: { fe_count: 1, visit_count: 2, submission_count: 1, activity_count: 1, fes: [] },
  leads: [{ id: 'l-1', first_name: 'Priya', last_name: 'Nair', company: 'Acme Forge', status: 'converted', created_at: '2026-08-01T00:00:00Z' }],
  contacts: [{ id: 'c-1', first_name: 'Priya', last_name: 'Nair', title: 'Purchase Head', phone: '9876500001', email: 'priya@acme.example', created_at: '2026-08-02T00:00:00Z' },
             { id: 'c-2', first_name: 'Dev', last_name: 'Shah', title: null, phone: null, email: null, created_at: '2026-08-03T00:00:00Z' }],
  updates: [{ id: 'u-1', account_id: 'acc-1', contact_id: 'c-1', body: 'PO expected next week', created_by: 'x', created_at: '2026-09-10T08:00:00Z', updated_at: '2026-09-10T08:00:00Z', contact_name: 'Priya Nair', author_name: 'Asha Rao' }],
  visits: [{ kind: 'visit', id: 'v-1', at: '2026-09-05T05:00:00Z', user_name: 'Ravi Kumar', title: 'Site visit', status: 'completed' },
           { kind: 'visit', id: 'v-2', at: '2026-09-06T05:00:00Z', user_name: 'Ravi Kumar', title: 'Follow-up visit' }],
  forms: [{ kind: 'submission', id: 'f-1', at: '2026-09-05T06:00:00Z', user_name: 'Ravi Kumar', title: 'Customer visit form', ref_no: 'SRPR2627-12' }],
  activities: [{ kind: 'activity', id: 'a-1', at: '2026-09-07T05:00:00Z', user_name: 'Asha Rao', title: 'Send quotation', status: 'open' }],
  deals: [
    { id: 'd-1', name: 'Plugs Q3', amount: 4100, currency: 'INR', status: 'open', stage_name: 'Quotation sent', quotation_no: 'QT-2026-014', expected_close_date: '2026-10-30', created_at: '2026-09-08T00:00:00Z',
      items: [{ name: 'Spark Plug SP-100', quantity: 3, unit_price: 1200 }, { name: 'Freight', quantity: 1, unit_price: 500 }] },
    { id: 'd-2', name: 'Coils', amount: 70000, status: 'won', stage_name: 'Won', quotation_no: null, items: [] },
  ],
  expenses: [],
  events: [
    { at: '2026-09-10T08:00:00Z', kind: 'update', title: 'Account update', detail: 'PO expected next week', ref: null, who: 'Priya Nair · logged by Asha Rao' },
    { at: '2026-09-08T00:00:00Z', kind: 'deal', title: 'Plugs Q3', detail: 'Quotation QT-2026-014 · Quotation sent', ref: 'QT-2026-014', who: null },
    { at: '2026-09-05T06:00:00Z', kind: 'submission', title: 'Customer visit form', detail: null, ref: 'SRPR2627-12', who: 'Ravi Kumar' },
    { at: '2026-09-05T05:00:00Z', kind: 'visit', title: 'Site visit', detail: null, ref: null, who: 'Ravi Kumar' },
  ],
};

async function setup(page: Page, payload: unknown, gets: string[] = []) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1/journey') {
        gets.push(p);
        if (payload === 'error') return fail(route, 500, 'boom');
        return ok(route, payload);
      }
      return false;
    },
  });
}

test.describe('Account journey', () => {
  test('renders the steps, KPIs, sections and the event feed', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page, JOURNEY);
    await page.goto('/dashboard/crm/accounts/acc-1/journey');

    await expect(page.getByTestId('journey-account-name')).toHaveText('Acme Forge', { timeout: 30_000 });

    // Flow: 7 nodes in order, with counts, notes and the right state.
    const nodes = page.getByTestId('journey-flow').locator('[data-testid^="journey-node-"]');
    await expect(nodes).toHaveCount(7);
    const states = await nodes.evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));
    expect(states).toEqual(['done', 'done', 'done', 'done', 'done', 'current', 'todo']);
    await expect(page.getByTestId('journey-count-contacts')).toHaveText('2');
    await expect(page.getByTestId('journey-count-expenses')).toHaveText('0');
    await expect(page.getByText('2 deals · 1 quotation')).toBeVisible();

    // KPI chips.
    const kpis = page.getByTestId('journey-kpis');
    await expect(kpis).toContainText('Visits');
    await expect(kpis).toContainText('Open deals value');
    await expect(kpis).toContainText('4,100'); // only the open deal counts
    await expect(kpis).toContainText('Quotations');

    // Sections.
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
    await expect(page.getByText('Purchase Head')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent updates' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Visits & forms' }).getByTestId('ref-pill')).toHaveText('SRPR2627-12');
    await expect(page.getByRole('region', { name: 'Tasks' })).toContainText('Send quotation');
    await expect(page.getByRole('region', { name: 'Expenses' })).toContainText('No expense claims');

    // Deals & quotations table: quotation no, stage, amount; line items expand.
    const deals = page.getByTestId('journey-deals');
    await expect(deals.getByTestId('journey-deal-row')).toHaveCount(2);
    await expect(deals.getByTestId('journey-deal-row').first()).toContainText('QT-2026-014');
    await expect(deals.getByTestId('journey-deal-row').first()).toContainText('Quotation sent');
    await expect(page.getByTestId('journey-deal-items')).toHaveCount(0);
    await deals.getByRole('button', { name: 'Show line items' }).click();
    await expect(page.getByTestId('journey-deal-items')).toContainText('Spark Plug SP-100');
    await expect(page.getByTestId('journey-deal-items')).toContainText('3 × ₹1,200 = ₹3,600');

    // Event feed: newest first, with a kind label and the ref pill.
    const events = page.getByTestId('journey-event');
    await expect(events).toHaveCount(4);
    await expect(events.first()).toContainText('Account update');
    await expect(events.nth(2)).toContainText('SRPR2627-12');
    await expect(events.last()).toContainText('Site visit');

    // Clicking a node focuses its section.
    const dealsNode = page.getByTestId('journey-node-deals');
    await dealsNode.click();
    await expect(dealsNode).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#journey-deals')).toBeInViewport();
    await dealsNode.click();
    await expect(dealsNode).toHaveAttribute('aria-pressed', 'false');
  });

  test('does not crash on an empty payload or junk fields', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await scopeToSpark(page);
    await setup(page, {});
    await page.goto('/dashboard/crm/accounts/acc-1/journey');
    await expect(page.getByTestId('journey-flow')).toBeVisible({ timeout: 30_000 });
    const states = await page.getByTestId('journey-flow').locator('[data-testid^="journey-node-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));
    expect(states).toEqual(Array(7).fill('todo'));
    await expect(page.getByText('Nothing has happened on this account yet.')).toBeVisible();
    await expect(page.getByText('No deals or quotations yet.')).toBeVisible();
    await expect(page.getByTestId('journey-kpis')).toContainText('₹0');

    // Junk: wrong types everywhere. Still renders.
    await page.unroute('**/api/v1/**');
    await setup(page, { steps: 'nope', events: { a: 1 }, deals: [null, { id: 'x' }], visits: 'x', expenses: [{}], contacts: [{ id: 'c' }], updates: [null] });
    await page.reload();
    await expect(page.getByTestId('journey-flow')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('journey-expense')).toHaveCount(1);
    // Hydration warnings come from the app shell (theme / clock text) on every page; only real crashes count here.
    expect(errors.filter((m) => !/hydrat|server-rendered/i.test(m))).toEqual([]);
  });

  test('stacks the flow vertically on a phone with no horizontal page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await scopeToSpark(page);
    await setup(page, JOURNEY);
    await page.goto('/dashboard/crm/accounts/acc-1/journey');
    await expect(page.getByTestId('journey-node-lead')).toBeVisible({ timeout: 30_000 });
    const boxes = await page.getByTestId('journey-flow').locator('[data-testid^="journey-node-"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: r.y }; }));
    expect(new Set(boxes.map((b) => b.x)).size).toBe(1);
    expect(boxes.map((b) => b.y)).toEqual([...boxes.map((b) => b.y)].sort((a, b) => a - b));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('shows a retry state when the API fails', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page, 'error');
    await page.goto('/dashboard/crm/accounts/acc-1/journey');
    await expect(page.getByText('Could not load the journey')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('a non-Spark tenant gets a plain unavailable state and never calls the journey endpoint', async ({ page }) => {
    const gets: string[] = [];
    await setup(page, JOURNEY, gets);
    await page.goto('/dashboard/crm/accounts/acc-1/journey');
    await expect(page.getByText('Journey is not available')).toBeVisible({ timeout: 30_000 });
    expect(gets).toEqual([]);
  });
});
