import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok } from './spark';
import { TATA_TISCON_CLIENT_ID } from '../src/lib/clientFeatures';

/**
 * "Activity Date" on the Log Activity form: the date something ALREADY happened on, separate from "Scheduled At"
 * (something still to do). It is saved as completed_at + status completed, so a call made last week lands on last
 * week in every timeline instead of "now". Blank = right now (unchanged); Scheduled At still plans a future one.
 */

type Body = Record<string, any>;

async function setup(page: Page, writes: Body[], user: Record<string, unknown> = SEED_USER) {
  await seedSession(page, user);
  await mockApi(page, {
    // The layout writes /auth/me back into the stored user, so it must return the same user we seeded.
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'POST' && p === '/api/v1/crm/activities') {
        writes.push(route.request().postDataJSON() as Body);
        return ok(route, { id: 'a-new' }, 201);
      }
      if (method === 'GET' && p === '/api/v1/crm/activities') {
        return route.fulfill({ json: { success: true, data: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false } } }).then(() => true);
      }
      return false;
    },
  });
}

// A moment `days` from now at hh:mm LOCAL time, as the datetime-local text the field takes and as the ISO instant the
// form should send. Computed in the browser so both use the browser's own timezone.
const moment = (page: Page, days: number, hh = 15, mm = 30) =>
  page.evaluate(([d, h, m]) => {
    const t = new Date();
    t.setDate(t.getDate() + d);
    t.setHours(h, m, 0, 0);
    const p = (n: number) => String(n).padStart(2, '0');
    return { local: `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`, iso: t.toISOString() };
  }, [days, hh, mm] as const);

const open = async (page: Page, query = '') => {
  await page.goto(`/dashboard/crm/activities/new${query}`);
  await expect(page.getByRole('heading', { name: 'Log Activity' })).toBeVisible({ timeout: 30_000 });
};
const save = (page: Page) => page.getByRole('button', { name: 'Log Activity' }).click();

test.describe('Log Activity: Activity Date', () => {
  test('a past Activity Date is saved as completed on that date, with no schedule', async ({ page }) => {
    const writes: Body[] = [];
    await setup(page, writes);
    await open(page);
    const past = await moment(page, -3);

    await page.getByTestId('activity-date').fill(past.local);
    await save(page);
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });

    expect(writes).toHaveLength(1);
    expect(writes[0].status).toBe('completed');
    expect(writes[0].completed_at).toBe(past.iso);
    expect(Object.keys(writes[0])).not.toContain('due_at');
  });

  test('a task with an Activity Date is logged as done, not planned', async ({ page }) => {
    const writes: Body[] = [];
    await setup(page, writes);
    await open(page, '?type=task');
    const past = await moment(page, -1, 10, 0);

    await page.getByTestId('activity-date').fill(past.local);
    await save(page);
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });

    expect(writes[0].type).toBe('task');
    expect(writes[0].status).toBe('completed');
    expect(writes[0].completed_at).toBe(past.iso);
  });

  test('Scheduled At still plans a future activity (no completed_at)', async ({ page }) => {
    const writes: Body[] = [];
    await setup(page, writes);
    await open(page);
    const future = await moment(page, 2);

    await page.getByTestId('activity-scheduled').fill(future.local);
    await save(page);
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });

    expect(writes[0].status).toBe('planned');
    expect(writes[0].due_at).toBe(future.iso);
    expect(Object.keys(writes[0])).not.toContain('completed_at');
  });

  test('both dates blank still logs it as happening right now', async ({ page }) => {
    const writes: Body[] = [];
    await setup(page, writes);
    await open(page);

    await save(page);
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });

    expect(writes[0].status).toBe('completed');
    expect(Math.abs(Date.parse(writes[0].completed_at) - Date.now())).toBeLessThan(2 * 60_000);
    expect(Object.keys(writes[0])).not.toContain('due_at');
  });

  test('setting both dates keeps both, and saves it as done on that date plus a scheduled follow-up', async ({ page }) => {
    const writes: Body[] = [];
    await setup(page, writes);
    await open(page);
    const past = await moment(page, -2);
    const future = await moment(page, 3);

    await page.getByTestId('activity-date').fill(past.local);
    await page.getByTestId('activity-scheduled').fill(future.local);
    // Neither picker wipes the other.
    await expect(page.getByTestId('activity-date')).toHaveValue(past.local);
    await expect(page.getByTestId('activity-scheduled')).toHaveValue(future.local);

    await save(page);
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });
    expect(writes).toHaveLength(2);
    const done = writes.find((w) => w.status === 'completed')!;
    const planned = writes.find((w) => w.status === 'planned')!;
    expect(done.completed_at).toBe(past.iso);
    expect(Object.keys(done)).not.toContain('due_at');
    expect(planned.due_at).toBe(future.iso);
    expect(Object.keys(planned)).not.toContain('completed_at');
  });

  test('the Activity Date cannot be in the future: the picker is capped at now and the save is refused', async ({ page }) => {
    const writes: Body[] = [];
    await setup(page, writes);
    await open(page);
    await expect(page.getByTestId('activity-date')).toHaveAttribute('max', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    const future = await moment(page, 2);
    await page.getByTestId('activity-date').fill(future.local);
    await save(page);

    // Either the browser's own max check or the form's toast stops it: nothing is posted and we stay on the form.
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities\/new/);
    expect(writes).toHaveLength(0);
  });
});

// The first-visit card is only for Tata (see e2e/first-visit-card.spec.ts), so these sign in as a Tata Tiscon user.
const TATA_USER = { ...SEED_USER, client_id: TATA_TISCON_CLIENT_ID };

test.describe('Log Activity from a lead: first visit date', () => {
  test('"Visited earlier?" lets the first visit be logged on its real date', async ({ page }) => {
    const writes: Body[] = [];
    await setup(page, writes, TATA_USER);
    await open(page, '?lead_id=lead-1');
    await expect(page.getByText(/Mark first visit done · today/)).toBeVisible();
    const past = await moment(page, -4, 11, 15);

    await page.getByRole('button', { name: 'Visited earlier? Set the date' }).click();
    await page.getByTestId('first-visit-date').fill(past.local);
    await expect(page.getByText(/Mark first visit done · on the date below/)).toBeVisible();
    await save(page);
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });

    expect(writes).toHaveLength(1);
    expect(writes[0].status).toBe('completed');
    expect(writes[0].completed_at).toBe(past.iso);
    expect(writes[0].custom_fields?.is_first_visit).toBe(true);
  });

  test('left alone, the first visit is still logged for right now', async ({ page }) => {
    const writes: Body[] = [];
    await setup(page, writes, TATA_USER);
    await open(page, '?lead_id=lead-1');

    await save(page);
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });

    expect(writes).toHaveLength(1);
    expect(Math.abs(Date.parse(writes[0].completed_at) - Date.now())).toBeLessThan(2 * 60_000);
  });
});
