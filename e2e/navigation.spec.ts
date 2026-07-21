import { test, expect } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * Smoke-navigate the main CRM surfaces in offline demo mode and assert each
 * route mounts real content (not a crash / error boundary). Each page has a
 * stable, page-specific anchor we key off.
 */
test.describe('CRM navigation smoke (demo mode)', () => {
  test.beforeEach(async ({ page }) => {
    await demoLogin(page);
  });

  test('deals page renders', async ({ page }) => {
    await page.goto('/dashboard/crm/deals');
    await expect(page).toHaveURL(/\/dashboard\/crm\/deals/);
    await expect(page.getByPlaceholder('Search deals...')).toBeVisible();
  });

  test('contacts page renders', async ({ page }) => {
    await page.goto('/dashboard/crm/contacts');
    await expect(page).toHaveURL(/\/dashboard\/crm\/contacts/);
    await expect(page.getByPlaceholder('Search contacts...')).toBeVisible();
  });

  test('accounts page renders', async ({ page }) => {
    await page.goto('/dashboard/crm/accounts');
    await expect(page).toHaveURL(/\/dashboard\/crm\/accounts/);
    await expect(page.getByPlaceholder('Search accounts...')).toBeVisible();
  });

  test('activities page renders', async ({ page }) => {
    await page.goto('/dashboard/crm/activities');
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities/);
    // The FE/assignee filter input is a stable anchor for the activities page.
    await expect(page.getByPlaceholder('Filter by FE / assignee…')).toBeVisible();
  });

  test('CRM dashboard renders', async ({ page }) => {
    await page.goto('/dashboard/crm/dashboard');
    await expect(page).toHaveURL(/\/dashboard\/crm\/dashboard/);
    // Sidebar shell present -> no crash.
    await expect(page.locator('aside')).toBeVisible();
  });
});
