import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Lead detail page: hero + journey + KPI strip, the Overview / Timeline / Deals / Call insights tabs, the unified
 * timeline (notes + activities + call analysis) and the intelligence rail. Runs against an intercepted API and
 * asserts on what the page shows and on what it SENDS.
 */

const now = Date.now();
const iso = (offsetH: number) => new Date(now + offsetH * 3600_000).toISOString();

const LEAD = {
  id: 'lead-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair', phone: '9876501234', email: 'priya@nairsteel.example.com',
  title: 'Procurement Head', company: 'Nair Steel Traders', is_b2c: false, status: 'working', owner_id: 'u-asha', owner_name: 'Asha Menon',
  source_name: 'Website', created_by: SEED_USER.id, created_at: '2026-09-20T10:00:00Z', score: 72, score_grade: 'B',
  score_breakdown: { phone_present: 8, email_present: 5, calls_30d: 12 },
};
const ACTIVITIES = [
  { id: 'a1', org_id: 'o', type: 'task', subject: 'Send revised quotation', status: 'open', due_at: iso(-30), owner_name: 'Asha Menon', created_at: iso(-90), updated_at: iso(-90) },
  { id: 'a2', org_id: 'o', type: 'meeting', subject: 'Site visit', status: 'open', due_at: iso(52), owner_name: 'Asha Menon', created_at: iso(-60), updated_at: iso(-60) },
  { id: 'a3', org_id: 'o', type: 'call', subject: 'Intro call', body: 'Discussed monthly TMT requirement.', status: 'completed', completed_at: iso(-72), outcome: 'Connected', owner_name: 'Asha Menon', created_at: iso(-73), updated_at: iso(-72) },
];
const UPDATES = [
  { id: 'u1', lead_id: 'lead-1', org_id: 'o', client_id: null, author_id: SEED_USER.id, author_name: 'E2E Admin', body: 'Wants a revised quote with freight.', created_at: iso(-20) },
  { id: 'u2', lead_id: 'lead-1', org_id: 'o', client_id: null, author_id: 'u-asha', author_name: 'Asha Menon', body: 'Budget approved for Q4.', created_at: iso(-71) },
];
const DEALS = [
  { id: 'd1', org_id: 'o', name: 'Q4 TMT supply', pipeline_id: 'p', stage_id: 's', stage_name: 'Negotiation', amount: 450000, status: 'open', created_at: iso(-50), updated_at: iso(-50) },
  { id: 'd2', org_id: 'o', name: 'Pilot order', pipeline_id: 'p', stage_id: 's2', stage_name: 'Closed won', amount: 120000, status: 'won', created_at: iso(-500), updated_at: iso(-400) },
];
const CONVOS = [
  { id: 'c1', status: 'complete', created_at: iso(-72), duration_seconds: 410, language: 'en', champion_name: 'Asha Menon', employee_id: null, lead_id: 'lead-1', lead_name: 'Priya Nair', lead_city: null, intent: 'Ready to buy', intent_score: 78, sentiment: 'Positive', summary: 'Customer confirmed the monthly requirement.' },
];

interface Seen { method: string; path: string; body: any }
const writes = (seen: Seen[], method: string, path: string | RegExp) =>
  seen.filter((r) => r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)));

async function setup(page: Page, o: { user?: Record<string, unknown>; overrides?: Record<string, unknown>; lead?: Record<string, unknown>; convos?: unknown[] } = {}) {
  const seen: Seen[] = [];
  const user = o.user ?? SEED_USER;
  await seedSession(page, user);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: { field_overrides: o.overrides ?? {} } } },
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
      let body: any = null;
      try { body = route.request().postDataJSON(); } catch { /* not json */ }
      if (method !== 'GET') seen.push({ method, path, body });
      const ok = (data: unknown) => route.fulfill({ json: { success: true, data } }).then(() => true);
      const lead = { ...LEAD, ...(o.lead ?? {}) };
      if (method === 'GET' && path === '/api/v1/crm/leads/lead-1') return ok(lead);
      if (method === 'PATCH' && path === '/api/v1/crm/leads/lead-1') return ok({ ...lead, ...(body ?? {}) });
      if (method === 'GET' && path === '/api/v1/crm/leads/lead-1/activities') return ok(ACTIVITIES);
      if (method === 'GET' && path === '/api/v1/crm/leads/lead-1/updates') return ok(UPDATES);
      if (method === 'POST' && path === '/api/v1/crm/leads/lead-1/updates') {
        return ok({ id: 'u-new', lead_id: 'lead-1', org_id: 'o', client_id: null, author_id: SEED_USER.id, author_name: 'E2E Admin', body: body?.body, created_at: new Date().toISOString() });
      }
      if (method === 'DELETE' && /\/leads\/lead-1\/updates\//.test(path)) return ok({ deleted: true });
      if (method === 'PATCH' && /\/api\/v1\/crm\/activities\//.test(path)) return ok({ ...ACTIVITIES[0], ...(body ?? {}) });
      if (method === 'GET' && path === '/api/v1/crm/leads/lead-1/deals') return ok(DEALS);
      if (method === 'GET' && path.endsWith('/leads/lead-1/conversations')) return ok(o.convos ?? CONVOS);
      if (method === 'GET' && path === '/api/v1/users') return ok([{ id: 'u-asha', name: 'Asha Menon' }]);
      return false;
    },
  });
  return seen;
}

const open = async (page: Page, hash = '') => {
  await page.goto(`/dashboard/crm/leads/lead-1${hash}`);
  await expect(page.getByText('Owner: Asha Menon')).toBeVisible({ timeout: 30_000 });
};

test.describe('Lead detail — structure', () => {
  test('shows who, where they are in the journey, and what needs doing', async ({ page }) => {
    await setup(page);
    await open(page);
    await expect(page.getByText('Procurement Head · Nair Steel Traders')).toBeVisible();
    // Journey: New is behind us, Working is current.
    const journey = page.getByRole('navigation', { name: 'Lead journey' });
    await expect(journey.locator('[aria-current="step"]')).toContainText('Working');
    // KPI strip: an overdue follow-up is called out, deals are totalled. The overdue
    // count is in whole IST calendar days, so the fixed 30h-ago fixture reads "1d" or
    // "2d" depending on the IST hour CI runs at — match any day count so the assertion
    // is stable round the clock (it was flaking red on the 00:00–06:00 IST runs).
    await expect(page.getByText(/Overdue · \d+d/).first()).toBeVisible();
    await expect(page.getByText('₹5,70,000')).toBeVisible();
    // Tabs carry counts; Call insights only exists because there are conversations.
    await expect(page.getByRole('tab', { name: /^Timeline/ })).toContainText('5');
    await expect(page.getByRole('tab', { name: /^Deals/ })).toContainText('2');
    await expect(page.getByRole('tab', { name: /^Call insights/ })).toBeVisible();
  });

  test('the active tab lives in the URL hash, so a reload lands on it', async ({ page }) => {
    await setup(page);
    await open(page);
    await page.getByRole('tab', { name: /^Deals/ }).click();
    await expect(page).toHaveURL(/#deals$/);
    await expect(page.getByText('Q4 TMT supply')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('tab', { name: /^Deals/ })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: /^Overview/ }).click();
    await expect(page).not.toHaveURL(/#/);
  });

  test('arrow keys move between tabs', async ({ page }) => {
    await setup(page);
    await open(page);
    await page.getByRole('tab', { name: /^Overview/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /^Timeline/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('no Call insights tab when there are no recorded calls', async ({ page }) => {
    await setup(page, { convos: [] });
    await open(page);
    await expect(page.getByRole('tab', { name: /^Call insights/ })).toHaveCount(0);
  });

  test('the owner and the intelligence rail are always on screen', async ({ page }) => {
    await setup(page);
    await open(page, '#timeline');
    await expect(page.getByText('Owner: Asha Menon')).toBeVisible();
    await expect(page.getByText('Consent (DPDP)', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lead score' })).toBeVisible();
  });
});

test.describe('Lead detail — journey', () => {
  test('clicking a step moves the lead to that status', async ({ page }) => {
    const seen = await setup(page);
    await open(page);
    await page.getByRole('navigation', { name: 'Lead journey' }).getByRole('button', { name: /Qualified/ }).click();
    await expect.poll(() => writes(seen, 'PATCH', '/api/v1/crm/leads/lead-1')[0]?.body).toEqual({ status: 'qualified' });
  });

  test('a closed lead shows the way back and no journey progress', async ({ page }) => {
    await setup(page, { lead: { status: 'lost', lost_reason: 'Went with a competitor' } });
    await open(page);
    await expect(page.getByText('Lead marked as lost')).toBeVisible();
    await expect(page.getByText('Reason: Went with a competitor')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Re-open lead' }).first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Lead journey' }).locator('[aria-current="step"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Convert', exact: true })).toHaveCount(0);
  });
});

test.describe('Lead detail — timeline', () => {
  test('adds a note and shows it first', async ({ page }) => {
    const seen = await setup(page);
    await open(page, '#timeline');
    await page.getByPlaceholder(/Write an update/).fill('Confirmed site visit for Friday');
    await page.getByRole('button', { name: 'Add update' }).click();
    await expect.poll(() => writes(seen, 'POST', '/api/v1/crm/leads/lead-1/updates')[0]?.body).toEqual({ body: 'Confirmed site visit for Friday' });
    await expect(page.getByText('Confirmed site visit for Friday')).toBeVisible();
  });

  test('"Up next" lists only open work, soonest first, and Complete sends the status', async ({ page }) => {
    const seen = await setup(page);
    await open(page, '#timeline');
    const upNext = page.getByRole('region', { name: /Up next/ });
    await expect(upNext.getByText('Send revised quotation')).toBeVisible();
    await expect(upNext.getByText('Site visit')).toBeVisible();
    await expect(upNext.getByText('Intro call')).toHaveCount(0); // done — belongs to the history
    await upNext.getByRole('button', { name: 'Complete' }).first().click();
    await expect.poll(() => writes(seen, 'PATCH', /\/crm\/activities\/a1$/)[0]?.body).toMatchObject({ status: 'completed' });
  });

  test('history can be filtered, and only your own notes can be edited', async ({ page }) => {
    await setup(page);
    await open(page, '#timeline');
    const history = page.getByRole('region', { name: /History/ });
    await history.getByRole('button', { name: /^Calls/ }).click();
    await expect(history.getByText('Intro call')).toBeVisible();
    await expect(history.getByText('Budget approved for Q4.')).toHaveCount(0);
    await history.getByRole('button', { name: /^All/ }).click();
    // The admin wrote u1 → Edit + Delete; u2 is Asha's → admin may delete it but not edit it.
    await history.getByRole('button', { name: 'More actions' }).nth(1).click();
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  });

  test('deleting a note asks first, then sends the delete', async ({ page }) => {
    const seen = await setup(page);
    await open(page, '#timeline');
    const history = page.getByRole('region', { name: /History/ });
    await history.getByRole('button', { name: 'More actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    expect(writes(seen, 'DELETE', /updates\//)).toHaveLength(0);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => writes(seen, 'DELETE', /\/leads\/lead-1\/updates\/u1$/).length).toBe(1);
  });
});

test.describe('Lead detail — field overrides and access', () => {
  test('hiding Status drops the journey and the status control; hiding Score drops every score surface', async ({ page }) => {
    await setup(page, { overrides: { 'lead.status': { hidden: true }, 'lead.score': { hidden: true } } });
    await open(page);
    await expect(page.getByRole('navigation', { name: 'Lead journey' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Change status' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Lead score' })).toHaveCount(0);
    await expect(page.getByText('Lead score', { exact: true })).toHaveCount(0);
  });

  test('hiding company and title empties the subtitle; relabelling Owner changes the label', async ({ page }) => {
    await setup(page, { overrides: { 'lead.company': { hidden: true }, 'lead.title': { hidden: true }, 'lead.owner_id': { label: 'Account manager' } } });
    await page.goto('/dashboard/crm/leads/lead-1');
    await expect(page.getByText('Account manager: Asha Menon')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Procurement Head')).toHaveCount(0);
    await expect(page.getByText('Nair Steel Traders')).toHaveCount(0);
  });

  test('a rep who did not create the lead gets no Edit button', async ({ page }) => {
    const rep = { ...SEED_USER, id: 'e2e-rep-1', name: 'E2E Rep', role: 'field_executive' };
    await setup(page, { user: rep });
    await open(page);
    await expect(page.getByRole('button', { name: 'Edit lead' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Proposal' })).toBeVisible();
  });
});
