import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath } from './spark';

/**
 * Activities → Calendar view offers three views — Month (grid), Week (7-day) and
 * Day (agenda) — switchable from a segmented toggle in the calendar header. An
 * activity dated today must appear in all three, and the toggle must mark the
 * active view. The customer still shows on each chip (see
 * activity-calendar-customer.spec.ts).
 */
const today = new Date();
// Dated exactly today so it lands in the current month, week AND day.
const dueIso = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0).toISOString();

const ACT = {
  id: 'act-1', org_id: 'e2e-org-1', type: 'industry_visit', subject: 'Industry Visit',
  status: 'open', due_at: dueIso, created_at: dueIso, updated_at: dueIso,
  lead_id: 'lead-1', lead_name: 'Budge Budge Refineries Limited - Budge Budge',
  company_name: 'Budge Budge Refineries Limited',
};

async function setup(page: Page) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/activities') {
        return route.fulfill({ json: { success: true, data: [ACT], pagination: { total: 1, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false } } }).then(() => true);
      }
      return false;
    },
  });
}

test.describe('Activities calendar — Month / Week / Day views', () => {
  test('switches between month, week and day views; today\'s activity shows in each', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    await setup(page);
    await page.goto('/dashboard/crm/activities?layout=calendar');

    // Month view is the default: the chip (with its customer) is on the grid.
    await expect(page.getByTitle(/Industry Visit — Budge Budge Refineries Limited/).first()).toBeVisible({ timeout: 30_000 });
    const monthBtn = page.getByRole('button', { name: /^month$/i });
    const weekBtn = page.getByRole('button', { name: /^week$/i });
    const dayBtn = page.getByRole('button', { name: /^day$/i });
    await expect(monthBtn).toHaveAttribute('aria-pressed', 'true');

    // Week view: today's activity is still on the grid; the toggle updates.
    await weekBtn.click();
    await expect(weekBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(monthBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTitle(/Industry Visit — Budge Budge Refineries Limited/).first()).toBeVisible();

    // Day view: the activity shows as an agenda row naming the customer.
    await dayBtn.click();
    await expect(dayBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Industry Visit — Budge Budge Refineries Limited', { exact: false }).first()).toBeVisible();
  });
});
