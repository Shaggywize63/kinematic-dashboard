import { test, expect } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * Read + navigation flows over the offline demo fixtures. The demo account
 * serves CRM_LEADS (12 seeded leads) from src/lib/demo/seedData.ts entirely on
 * the client — no interception needed.
 */
test.describe('Leads list (demo mode)', () => {
  test.beforeEach(async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/crm/leads');
  });

  test('renders the leads table with fixture rows and the total pill', async ({ page }) => {
    // Total pill: "<n> leads" (12 seeded demo leads).
    await expect(page.getByText(/\bleads\b/).first()).toBeVisible();
    await expect(page.getByText('12 leads')).toBeVisible();

    // The responsive-cards table renders.
    await expect(page.locator('table.responsive-cards')).toBeVisible();

    // Seeded lead names appear as entity links.
    await expect(page.getByRole('link', { name: 'Vikram Reddy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Anjali Iyer' })).toBeVisible();

    // A Name-labelled cell exists (data-label wiring).
    await expect(page.locator('td[data-label="Name"]').first()).toBeVisible();
  });

  test('search box filters the visible rows', async ({ page }) => {
    const search = page.getByPlaceholder('Search name, email, company...');
    await expect(page.getByRole('link', { name: 'Vikram Reddy' })).toBeVisible();

    await search.fill('Anjali');
    await expect(page.getByRole('link', { name: 'Anjali Iyer' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vikram Reddy' })).toHaveCount(0);

    await search.fill('');
    await expect(page.getByRole('link', { name: 'Vikram Reddy' })).toBeVisible();
  });

  test('clicking a lead name navigates to its detail page', async ({ page }) => {
    await page.getByRole('link', { name: 'Vikram Reddy' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/leads\/demo-lead-1/);
  });

  test('"+ New Lead" navigates to the create form', async ({ page }) => {
    await page.getByRole('link', { name: '+ New Lead' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/leads\/new$/);
    await expect(page.getByRole('heading', { name: 'New Lead' })).toBeVisible();
  });
});
