import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath } from './spark';

/**
 * Activities → Calendar view: each day-cell chip (and its tooltip) names the customer the
 * activity is for, not just the activity type — e.g. "Industry Visit — Budge Budge Refineries
 * Limited" instead of a bare "Industry Visit". The customer comes from the API-stamped
 * company_name (else the linked lead / account / contact / deal name).
 */
const today = new Date();
// Due date inside the currently-shown month (the calendar defaults to today's month).
const dueIso = new Date(today.getFullYear(), today.getMonth(), Math.min(today.getDate(), 28), 10, 0, 0).toISOString();

const ACT = {
  id: 'act-1', org_id: 'e2e-org-1', type: 'industry_visit', subject: 'Industry Visit',
  status: 'open', due_at: dueIso, created_at: dueIso, updated_at: dueIso,
  lead_id: 'lead-1', lead_name: 'Budge Budge Refineries Limited - Budge Budge',
  company_name: 'Budge Budge Refineries Limited',
};

async function setup(page: Page, activity: Record<string, unknown> = ACT) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/activities') {
        return route.fulfill({ json: { success: true, data: [activity], pagination: { total: 1, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false } } }).then(() => true);
      }
      return false;
    },
  });
}

test.describe('Activities calendar — shows the customer', () => {
  test('a calendar chip names the customer, not just the activity type', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    await setup(page);
    await page.goto('/dashboard/crm/activities?layout=calendar');
    await expect(page.getByTitle(/Industry Visit — Budge Budge Refineries Limited/).first()).toBeVisible({ timeout: 30_000 });
  });

  test('falls back to the linked lead name when there is no company_name', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    await setup(page, { ...ACT, company_name: null });
    await page.goto('/dashboard/crm/activities?layout=calendar');
    await expect(page.getByTitle(/Industry Visit — Budge Budge Refineries Limited - Budge Budge/).first()).toBeVisible({ timeout: 30_000 });
  });
});
