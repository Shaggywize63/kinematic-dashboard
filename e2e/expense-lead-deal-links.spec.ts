import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, fail, ok, scopeToSpark } from './spark';

/**
 * Connected-B2B (Spark & Ray): every expense claim can be linked to a CRM lead and a deal, and each lead / deal
 * page shows what was spent on it. Covers the claim editor pickers (gating, deal -> lead, lead -> deal list,
 * clearing, edit prefill, what is sent), the claim page links, and the Expenses card on the lead and deal pages
 * (spend, % of value, visits, claims, empty and error states, other tenants see nothing and call nothing).
 */

const CLAIM_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '33333333-3333-4333-8333-333333333331';
const POLICY = { id: 'pol-1', name: 'Field sales rep', currency: 'INR', mileage_rate: 12, rules: { mileage_rate: 12, categories: {} } };

const LEADS = [
  { id: 'lead-1', first_name: 'Asha', last_name: 'Rao', phone: '98765 43210', email: 'asha@acme.test' },
  { id: 'lead-2', first_name: 'Ravi', last_name: 'Kumar', phone: null, email: 'ravi@forge.test' },
];
const DEALS = [
  { id: 'deal-1', name: 'Plugs for Q3', lead_id: 'lead-1', lead_name: 'Asha Rao · 98765 43210', amount: 10000 },
  { id: 'deal-9', name: 'Coils for Q4', lead_id: 'lead-2', lead_name: null, amount: 5000 },
];

const claim = (over: Record<string, unknown> = {}) => ({
  id: CLAIM_ID, user_id: SEED_USER.id, claim_no: 'EXP-0042', title: 'Pune visit', status: 'draft', currency: 'INR', total_amount: 400,
  approved_amount: null, distance_km: null, gps_derived_km: null, approver_id: null, current_level: 1, submitted_at: null, reviewed_by: null,
  reviewed_at: null, review_note: null, ai_summary: null, ai_flags: [], policy_name: 'Field sales rep', submit_count: 0, reimbursed_at: null,
  reimbursed_ref: null, created_at: '2026-10-01T09:00:00Z', user_name: 'E2E Admin', clarification: 'Site visit', account_id: null, account_name: null,
  lead_id: null, deal_id: null, lead_name: null, deal_name: null,
  items: [{ id: ITEM_ID, claim_id: CLAIM_ID, category: 'food', item_date: '2026-10-01', description: null, amount: 400, distance_km: null, from_location: null, to_location: null,
    merchant: 'Cafe', receipt_url: null, ai_extracted: null, flagged: false, flag_reason: null, decision: null, decision_note: null }],
  approvals: [],
  ...over,
});
const LINKED = { lead_id: 'lead-1', deal_id: 'deal-1', lead_name: 'Asha Rao', deal_name: 'Plugs for Q3' };

interface Seen {
  claimBodies: Array<Record<string, any>>;
  dealListQueries: string[];
  leadListQueries: string[];
  crmCalls: string[];
  expenseGets: string[];
}

async function setup(page: Page, o: { claim?: Record<string, unknown>; expenses?: (route: any, kind: string) => Promise<boolean> | boolean } = {}): Promise<Seen> {
  const seen: Seen = { claimBodies: [], dealListQueries: [], leadListQueries: [], crmCalls: [], expenseGets: [] };
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
      if (method === 'GET' && /\/api\/v1\/crm\/(leads|deals)\/[^/]+\/expenses$/.test(p)) {
        const kind = p.includes('/leads/') ? 'lead' : 'deal';
        seen.expenseGets.push(p);
        if (o.expenses && (await o.expenses(route, kind))) return true;
      }
      if (method === 'GET' && p === '/api/v1/crm/leads') { seen.leadListQueries.push(query); return ok(route, LEADS); }
      if (method === 'GET' && p === '/api/v1/crm/deals') {
        seen.dealListQueries.push(query);
        const lead = new URLSearchParams(query).get('lead_id');
        return ok(route, lead ? DEALS.filter((d) => d.lead_id === lead) : DEALS);
      }
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-2') return ok(route, LEADS[1]);
      if (method === 'GET' && p === '/api/v1/expenses/policy') return ok(route, POLICY);
      if (method === 'GET' && p === '/api/v1/expenses/linkable-submissions') return ok(route, []);
      if (method === 'POST' && p === '/api/v1/expenses/claims/check') return ok(route, { policy: POLICY, total: 400, violations: [], blocking: false, would_auto_approve: false });
      if (method === 'GET' && p === `/api/v1/expenses/claims/${CLAIM_ID}`) return ok(route, o.claim ?? claim());
      if ((method === 'POST' && p === '/api/v1/expenses/claims') || (method === 'PATCH' && p === `/api/v1/expenses/claims/${CLAIM_ID}`)) {
        seen.claimBodies.push(route.request().postDataJSON());
        return ok(route, claim());
      }
      if (p.startsWith('/api/v1/crm/') && /leads|deals/.test(p)) seen.crmCalls.push(`${method} ${p}`);
      return false;
    },
  });
  return seen;
}

const pickFrom = async (page: Page, box: string, option: string | RegExp) => {
  await page.getByRole('textbox', { name: box, exact: true }).click();
  await page.getByRole('option', { name: option }).click();
};
const saveDraft = (page: Page) => page.getByRole('button', { name: /Save as draft|Save changes/ }).click();
const newClaimWithLine = async (page: Page) => {
  await page.goto('/dashboard/expenses/new');
  await expect(page.getByRole('heading', { name: 'New expense claim' })).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder('Where was it spent?').fill('Cafe');
  await page.getByPlaceholder('0').first().fill('400');
};

test.describe('Claim editor: lead and deal pickers', () => {
  test('Spark sees Lead and Deal pickers', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page);
    await page.goto('/dashboard/expenses/new');
    await expect(page.getByRole('textbox', { name: 'Lead', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('textbox', { name: 'Deal', exact: true })).toBeVisible();
  });

  test('a non-Spark client has no Lead / Deal pickers', async ({ page }) => {
    const seen = await setup(page);
    await newClaimWithLine(page);
    await expect(page.getByText('Clarification', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Lead', exact: true })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Deal', exact: true })).toHaveCount(0);
    // (the app shell makes its own small lead-count call; the picker's searches are limit=20)
    expect(seen.leadListQueries.filter((q) => q.includes('limit=20'))).toEqual([]);
    expect(seen.dealListQueries).toEqual([]);
    await saveDraft(page);
    await expect.poll(() => seen.claimBodies.length).toBe(1);
    expect(seen.claimBodies[0]).not.toHaveProperty('lead_id');
    expect(seen.claimBodies[0]).not.toHaveProperty('deal_id');
  });

  test('leads are labelled with their phone; picking a deal fills its lead and sends both ids', async ({ page }) => {
    await scopeToSpark(page);
    const seen = await setup(page);
    await newClaimWithLine(page);

    await page.getByRole('textbox', { name: 'Lead', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Asha Rao · 98765 43210' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Ravi Kumar' })).toBeVisible();
    await page.getByRole('heading', { name: 'New expense claim' }).click(); // close the list without picking

    await pickFrom(page, 'Deal', 'Plugs for Q3');
    await expect(page.getByText('💼 Plugs for Q3')).toBeVisible();
    await expect(page.getByText('👤 Asha Rao · 98765 43210')).toBeVisible();
    await saveDraft(page);
    await expect.poll(() => seen.claimBodies.length).toBe(1);
    expect(seen.claimBodies[0]).toMatchObject({ lead_id: 'lead-1', deal_id: 'deal-1' });
  });

  test('a deal whose list row has no lead name still shows its lead (looked up)', async ({ page }) => {
    await scopeToSpark(page);
    const seen = await setup(page);
    await newClaimWithLine(page);
    await pickFrom(page, 'Deal', 'Coils for Q4');
    await expect(page.getByText('👤 Ravi Kumar')).toBeVisible();
    await saveDraft(page);
    await expect.poll(() => seen.claimBodies.length).toBe(1);
    expect(seen.claimBodies[0]).toMatchObject({ lead_id: 'lead-2', deal_id: 'deal-9' });
  });

  test('choosing a lead narrows the deal list to that lead; another lead drops a deal that is not theirs', async ({ page }) => {
    await scopeToSpark(page);
    const seen = await setup(page);
    await newClaimWithLine(page);

    await pickFrom(page, 'Lead', /^Ravi Kumar/);
    await page.getByRole('textbox', { name: 'Deal', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Coils for Q4' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Plugs for Q3' })).toHaveCount(0);
    expect(seen.dealListQueries.some((q) => new URLSearchParams(q).get('lead_id') === 'lead-2')).toBe(true);
    await page.getByRole('option', { name: 'Coils for Q4' }).click();

    // Swapping to another lead removes the deal (it belongs to Ravi).
    await page.getByRole('button', { name: 'Clear lead' }).click();
    await expect(page.getByText('💼 Coils for Q4')).toHaveCount(0);
    await pickFrom(page, 'Lead', /^Asha Rao/);
    await saveDraft(page);
    await expect.poll(() => seen.claimBodies.length).toBe(1);
    expect(seen.claimBodies[0]).toMatchObject({ lead_id: 'lead-1', deal_id: null });
  });

  test('editing pre-fills the saved lead and deal and sends them back unchanged', async ({ page }) => {
    await scopeToSpark(page);
    const seen = await setup(page, { claim: claim(LINKED) });
    await page.goto(`/dashboard/expenses/${CLAIM_ID}/edit`);
    await expect(page.getByText('👤 Asha Rao')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('💼 Plugs for Q3')).toBeVisible();
    await saveDraft(page);
    await expect.poll(() => seen.claimBodies.length).toBe(1);
    expect(seen.claimBodies[0]).toMatchObject({ lead_id: 'lead-1', deal_id: 'deal-1' });
  });

  test('clearing the deal keeps the lead; clearing the lead takes its deal with it; both send null', async ({ page }) => {
    await scopeToSpark(page);
    const seen = await setup(page, { claim: claim(LINKED) });
    await page.goto(`/dashboard/expenses/${CLAIM_ID}/edit`);
    await expect(page.getByText('💼 Plugs for Q3')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Clear deal' }).click();
    await expect(page.getByText('💼 Plugs for Q3')).toHaveCount(0);
    await expect(page.getByText('👤 Asha Rao')).toBeVisible();
    await saveDraft(page);
    await expect.poll(() => seen.claimBodies.length).toBe(1);
    expect(seen.claimBodies[0]).toMatchObject({ lead_id: 'lead-1', deal_id: null });
  });

  test('clearing the lead clears its deal too', async ({ page }) => {
    await scopeToSpark(page);
    const seen = await setup(page, { claim: claim(LINKED) });
    await page.goto(`/dashboard/expenses/${CLAIM_ID}/edit`);
    await expect(page.getByText('👤 Asha Rao')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Clear lead' }).click();
    await expect(page.getByRole('textbox', { name: 'Lead', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Deal', exact: true })).toBeVisible();
    await saveDraft(page);
    await expect.poll(() => seen.claimBodies.length).toBe(1);
    expect(seen.claimBodies[0]).toMatchObject({ lead_id: null, deal_id: null });
  });
});

test.describe('Claim page: lead and deal links', () => {
  test('shows the Lead and Deal as links to their CRM pages', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page, { claim: claim(LINKED) });
    await page.goto(`/dashboard/expenses/${CLAIM_ID}`);
    await expect(page.getByRole('link', { name: 'Asha Rao', exact: true })).toHaveAttribute('href', '/dashboard/crm/leads/lead-1', { timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Plugs for Q3', exact: true })).toHaveAttribute('href', '/dashboard/crm/deals/deal-1');
    await expect(page.getByText('Lead', { exact: true })).toBeVisible();
    await expect(page.getByText('Deal', { exact: true })).toBeVisible();
  });

  test('a claim with no lead or deal shows neither row', async ({ page }) => {
    await scopeToSpark(page);
    await setup(page);
    await page.goto(`/dashboard/expenses/${CLAIM_ID}`);
    await expect(page.getByText('EXP-0042').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Lead', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Deal', { exact: true })).toHaveCount(0);
  });
});

const EXPENSES = {
  currency: 'INR',
  totals: { claim_count: 3, spent_amount: 3000, pending_amount: 500, draft_amount: 0, rejected_amount: 0 },
  visit_count: 3, opportunity_value: 10000, spent_pct_of_value: 30,
  claims: [
    { id: 'cl-1', claim_no: 'EXP-0101', title: 'Site visit', status: 'approved', total_amount: 3000, currency: 'INR', created_at: '2026-10-05T09:00:00Z', user_id: 'u-asha', user_name: 'Asha Rao', lead_id: 'lead-1', deal_id: 'deal-1', deal_name: 'Plugs for Q3' },
    { id: 'cl-2', claim_no: 'EXP-0102', title: 'Demo trip', status: 'submitted', total_amount: 500, currency: 'INR', created_at: '2026-10-06T09:00:00Z', user_id: 'u-ravi', user_name: 'Ravi Kumar', lead_id: 'lead-1', deal_id: null, deal_name: null },
  ],
};
const LEAD = { id: 'lead-1', first_name: 'Asha', last_name: 'Rao', full_name: 'Asha Rao', phone: '9876543210', is_b2c: false, status: 'working', created_by: SEED_USER.id, created_at: '2026-09-20T10:00:00Z' };
const DEAL = { id: 'deal-1', org_id: 'e2e-org-1', name: 'Plugs for Q3', pipeline_id: 'pl-1', stage_id: 'st-1', stage_name: 'New', status: 'open', amount: 10000, created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' };

async function crmSetup(page: Page, expenses: (route: any, kind: string) => Promise<boolean> | boolean) {
  const seen = await setup(page, { expenses });
  // The lead / deal records themselves (layered on top of the shared mock: registered later, so it runs first).
  await page.route('**/api/v1/crm/leads/lead-1', (route) => (route.request().method() === 'GET' ? route.fulfill({ json: { success: true, data: LEAD } }) : route.fallback()));
  await page.route('**/api/v1/crm/deals/deal-1', (route) => (route.request().method() === 'GET' ? route.fulfill({ json: { success: true, data: DEAL } }) : route.fallback()));
  return seen;
}

for (const kind of ['lead', 'deal'] as const) {
  const url = kind === 'lead' ? '/dashboard/crm/leads/lead-1' : '/dashboard/crm/deals/deal-1';
  const ready = (page: Page) => (kind === 'lead'
    ? expect(page.getByLabel('Lead intelligence')).toBeVisible({ timeout: 30_000 })
    : expect(page.getByText('Plugs for Q3').first()).toBeVisible({ timeout: 30_000 }));

  test.describe(`${kind} page: Expenses card`, () => {
    test('shows spend, % of value, claims and visits, the non-zero breakdown and the claims list', async ({ page }) => {
      await scopeToSpark(page);
      const seen = await crmSetup(page, (route) => ok(route, EXPENSES));
      await page.goto(url);
      await ready(page);
      await expect(page.getByText('₹3,000 spent · 30% of ₹10,000')).toBeVisible();
      await expect(page.getByText('3 claims · 3 visits')).toBeVisible();
      await expect(page.getByText('Pending ₹500', { exact: true })).toBeVisible();
      await expect(page.getByText(/Draft ₹0|Rejected ₹0/)).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'EXP-0101' })).toHaveAttribute('href', '/dashboard/expenses/cl-1');
      await expect(page.getByRole('link', { name: 'EXP-0102' })).toHaveAttribute('href', '/dashboard/expenses/cl-2');
      await expect(page.getByText('Ravi Kumar', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('Showing 2 of 3')).toBeVisible();
      expect(seen.expenseGets).toEqual([`/api/v1/crm/${kind === 'lead' ? 'leads' : 'deals'}/${kind}-1/expenses`]);
    });

    test('no opportunity value shows just the spend; zero spend reads ₹0 spent', async ({ page }) => {
      await scopeToSpark(page);
      await crmSetup(page, (route) => ok(route, {
        ...EXPENSES, opportunity_value: null, spent_pct_of_value: null,
        totals: { claim_count: 1, spent_amount: 0, pending_amount: 750, draft_amount: 250, rejected_amount: 100 }, visit_count: 1, claims: [],
      }));
      await page.goto(url);
      await ready(page);
      await expect(page.getByText('₹0 spent', { exact: true })).toBeVisible();
      await expect(page.getByText('1 claim · 1 visit')).toBeVisible();
      await expect(page.getByText('Pending ₹750 · Draft ₹250 · Rejected ₹100')).toBeVisible();
      await expect(page.getByText(/% of/)).toHaveCount(0);
    });

    test('shows a calm empty state when nothing is linked', async ({ page }) => {
      await scopeToSpark(page);
      await crmSetup(page, (route) => ok(route, {
        currency: 'INR', totals: { claim_count: 0, spent_amount: 0, pending_amount: 0, draft_amount: 0, rejected_amount: 0 },
        visit_count: 0, opportunity_value: 10000, spent_pct_of_value: 0, claims: [],
      }));
      await page.goto(url);
      await ready(page);
      await expect(page.getByText('No expenses linked yet')).toBeVisible();
      await expect(page.getByText(/spent/)).toHaveCount(0);
    });

    test('shows a calm error with a retry when the expenses cannot be loaded', async ({ page }) => {
      await scopeToSpark(page);
      let calls = 0;
      await crmSetup(page, (route) => { calls += 1; return calls === 1 ? fail(route, 500, 'boom') : ok(route, EXPENSES); });
      await page.goto(url);
      await ready(page);
      await expect(page.getByText('Couldn’t load expenses')).toBeVisible();
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByText('₹3,000 spent · 30% of ₹10,000')).toBeVisible();
    });

    test('an unexpected reply shows the error state instead of breaking the page', async ({ page }) => {
      await scopeToSpark(page);
      await crmSetup(page, (route) => ok(route, []));
      await page.goto(url);
      await ready(page);
      await expect(page.getByText('Couldn’t load expenses')).toBeVisible();
    });

    test('another client sees no Expenses card and makes no call', async ({ page }) => {
      const seen = await crmSetup(page, (route) => ok(route, EXPENSES));
      await page.goto(url);
      await ready(page);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/ spent|No expenses linked yet|Couldn’t load expenses|Loading expenses/)).toHaveCount(0);
      expect(seen.expenseGets).toEqual([]);
    });
  });
}
