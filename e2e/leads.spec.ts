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

  test('hovering a row offers "Open lead": one click to the full lead, no preview in between', async ({ page }) => {
    const row = page.locator('tr.lead-row').filter({ hasText: 'Vikram Reddy' });
    await row.hover();
    const open = row.getByRole('link', { name: 'Open lead' });
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute('href', '/dashboard/crm/leads/demo-lead-1');
    await open.click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/leads\/demo-lead-1$/);
  });

  test('the row actions are Open, WhatsApp, Edit and Convert — Call is in the preview and on the lead page', async ({ page }) => {
    const row = page.locator('tr.lead-row').filter({ hasText: 'Vikram Reddy' });
    await row.hover();
    await expect(row.getByRole('link', { name: 'Open lead' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Edit lead' })).toBeVisible();
    await expect(row.getByRole('link', { name: 'Convert to deal' })).toBeVisible();
    await expect(row.getByRole('link', { name: 'Call' })).toHaveCount(0);
  });

  // A cell with no link or button in it (the owner / source columns), so it is the row itself that is clicked.
  const plainCell = (page: import('@playwright/test').Page) => page.locator('tr.lead-row').filter({ hasText: 'Vikram Reddy' }).locator('td').nth(5);

  test('a single click on a row is still the quick preview (it does not navigate)', async ({ page }) => {
    await plainCell(page).click({ position: { x: 8, y: 8 } });
    await expect(page.getByRole('complementary', { name: 'Lead preview' })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/crm\/leads$/);
  });

  test('"New lead" navigates to the create form', async ({ page }) => {
    // The header CTA is a lucide "+" icon followed by "New lead".
    await page.getByRole('link', { name: /new lead/i }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/leads\/new$/);
    await expect(page.getByRole('heading', { name: 'New Lead' })).toBeVisible();
  });
});
