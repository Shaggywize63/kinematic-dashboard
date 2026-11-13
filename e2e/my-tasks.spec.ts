import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath } from './spark';

/**
 * "My Tasks" — each user's own assigned tasks, grouped by urgency, each
 * showing who assigned it. A CORE CRM surface for every tenant (no Spark
 * gate). These specs MOCK GET /api/v1/crm/my-tasks and assert grouping,
 * the "Assigned by" line, that the status filter + overdue toggle refetch
 * with the right query params, the empty states, and visibility to a
 * normal (non-super-admin, non-Spark) CRM user.
 */

type Row = Record<string, unknown>;

// ISO instant `days` from now at 15:30 local — grouping is calendar-day based,
// so these land deterministically in Overdue / Today / Upcoming.
const at = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(15, 30, 0, 0);
  return d.toISOString();
};

const base = (over: Row): Row => ({
  id: 'x', type: 'task', subject: 'Task', body: null, status: 'open',
  due_at: null, completed_at: null, activity_date: null, created_at: at(-2),
  lead_id: null, lead_name: null, lead_phone: null,
  contact_id: null, contact_name: null,
  account_id: null, account_name: null, company_id: null, company_name: null,
  deal_id: null, deal_name: null,
  owner_id: 'me', owner_name: 'Me', assigned_to: 'me', assigned_to_name: 'Me',
  assigned_by: null, assigned_by_name: null, is_overdue: false,
  ...over,
});

const FIXTURES: Row[] = [
  base({ id: 't-overdue', subject: 'Call overdue lead', due_at: at(-1), is_overdue: true,
    lead_id: 'lead-1', lead_name: 'Acme Steel', assigned_by: 'mgr', assigned_by_name: 'Priya Manager' }),
  base({ id: 't-today', subject: 'Send quote today', due_at: at(0),
    deal_id: 'deal-1', deal_name: 'Q4 Rebar order' }),
  base({ id: 't-upcoming', subject: 'Follow up next week', due_at: at(3),
    account_id: 'acc-1', account_name: 'Tata Projects' }),
  base({ id: 't-nodate', subject: 'Unscheduled task', due_at: null }),
];

// Seed + mock. `queries` collects every my-tasks request query string so the
// refetch assertions can read the params the page actually sent.
async function setup(page: Page, opts: { rows?: Row[]; queries?: string[]; user?: Record<string, unknown> } = {}) {
  const user = opts.user ?? SEED_USER;
  await seedSession(page, user);
  await mockApi(page, {
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/my-tasks') {
        opts.queries?.push(url.includes('?') ? url.slice(url.indexOf('?')) : '');
        return route
          .fulfill({ json: { success: true, data: opts.rows ?? FIXTURES, pagination: { total: (opts.rows ?? FIXTURES).length, page: 1, limit: 200, totalPages: 1, hasNext: false, hasPrev: false } } })
          .then(() => true);
      }
      return false;
    },
  });
}

const open = async (page: Page) => {
  await page.goto('/dashboard/crm/my-tasks');
  await expect(page.getByRole('heading', { name: 'My Tasks', exact: true })).toBeVisible({ timeout: 30_000 });
};

test.describe('My Tasks', () => {
  test('groups tasks by urgency (overdue vs today vs upcoming vs no date)', async ({ page }) => {
    await setup(page);
    await open(page);

    // Each task sits in its own urgency section.
    await expect(page.getByTestId('section-overdue').getByText('Call overdue lead')).toBeVisible();
    await expect(page.getByTestId('section-today').getByText('Send quote today')).toBeVisible();
    await expect(page.getByTestId('section-upcoming').getByText('Follow up next week')).toBeVisible();
    await expect(page.getByTestId('section-nodate').getByText('Unscheduled task')).toBeVisible();

    // The overdue task is NOT in the upcoming section (grouping is real, not a flat list).
    await expect(page.getByTestId('section-upcoming').getByText('Call overdue lead')).toHaveCount(0);

    // Linked record renders as a link to the right detail route.
    await expect(page.getByRole('link', { name: 'Acme Steel' })).toHaveAttribute('href', '/dashboard/crm/leads/lead-1');
    await expect(page.getByRole('link', { name: 'Tata Projects' })).toHaveAttribute('href', '/dashboard/crm/accounts/acc-1');
  });

  test('"Assigned by" shows when set and is omitted when null', async ({ page }) => {
    await setup(page);
    await open(page);

    // The overdue task was assigned by Priya Manager.
    await expect(page.getByTestId('section-overdue').getByText('Assigned by')).toBeVisible();
    await expect(page.getByText('Priya Manager')).toBeVisible();

    // The today task has assigned_by_name null -> no "Assigned by" line in its row.
    await expect(page.getByTestId('section-today').getByText('Assigned by')).toHaveCount(0);
  });

  test('status filter and overdue toggle refetch with the right query params', async ({ page }) => {
    const queries: string[] = [];
    await setup(page, { queries });
    await open(page);

    // Initial load: no status / overdue params (actionable default).
    await expect.poll(() => queries.length).toBeGreaterThan(0);
    const initial = queries[queries.length - 1];
    expect(initial).not.toContain('status=');
    expect(initial).not.toContain('overdue=');

    // Pick Completed -> refetch carries status=completed.
    await page.getByTestId('status-filter').selectOption('completed');
    await expect.poll(() => queries[queries.length - 1]).toContain('status=completed');

    // Toggle Overdue-only -> refetch carries overdue=true.
    await page.getByTestId('overdue-toggle').click();
    await expect.poll(() => queries[queries.length - 1]).toContain('overdue=true');
    await expect(page.getByTestId('overdue-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  test('empty states: no tasks, and nothing overdue', async ({ page }) => {
    await setup(page, { rows: [] });
    await open(page);

    await expect(page.getByText('You have no tasks')).toBeVisible();

    // With the overdue toggle on, the empty copy changes.
    await page.getByTestId('overdue-toggle').click();
    await expect(page.getByText('Nothing overdue')).toBeVisible();
  });

  test('visible to a normal (non-super-admin, non-Spark) CRM user', async ({ page }) => {
    const NORMAL_USER = {
      id: 'u-rep', org_id: 'org-1', client_id: 'd1d2d3d4-0000-4000-8000-000000000001',
      name: 'Normal Rep', email: 'rep@example.com', role: 'sales_executive',
      permissions: [] as string[],
      enabled_modules: [] as string[],
      enabled_packages: ['crm'],
      is_active: true,
    };
    await setup(page, { user: NORMAL_USER });
    await open(page);

    // The sidebar entry is present for a plain CRM user (no Spark / super-admin gate).
    await expect(page.getByRole('link', { name: 'My Tasks' }).first()).toBeVisible();
    // And the user's tasks actually render.
    await expect(page.getByText('Call overdue lead')).toBeVisible();
  });
});
