import { test, expect } from '@playwright/test';
import { demoLogin, mockApi, seedSession, SEED_USER } from './utils';

/** HRMS is a preview on sample data: only the demo account may see it, in the sidebar and by deep link. */

const MASTER = { ...SEED_USER, email: 's@kinematicapp.com', name: 'Master Admin' };

test.describe('who can see HRMS', () => {
  test('the demo account sees the HRMS group in the sidebar and can open the overview', async ({ page }) => {
    await demoLogin(page);
    await expect(page.getByText('HRMS (Preview)')).toBeVisible({ timeout: 30_000 });
    await page.goto('/dashboard/hrms');
    await expect(page.getByTestId('hrms-preview-banner')).toBeVisible({ timeout: 45_000 });
  });

  test('the master admin does not see HRMS in the sidebar', async ({ page }) => {
    await seedSession(page, MASTER);
    await mockApi(page, { me: { success: true, data: MASTER } });
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /Finance|Overview/ }).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('HRMS (Preview)')).toHaveCount(0);
  });

  test('a deep link bounces everyone who is not the demo account back to the dashboard', async ({ page }) => {
    await seedSession(page, MASTER);
    await mockApi(page, { me: { success: true, data: MASTER } });
    await page.goto('/dashboard/hrms/payroll');
    await page.waitForURL(/\/dashboard$/, { timeout: 45_000 });
    await expect(page.getByTestId('hrms-preview-banner')).toHaveCount(0);
  });

  test('a stray demo email without the demo token does not unlock it', async ({ page }) => {
    await seedSession(page, { ...MASTER, email: 'demo@kinematic.com' }); // token is the e2e one, not the demo token
    await mockApi(page, { me: { success: true, data: { ...MASTER, email: 'demo@kinematic.com' } } });
    await page.goto('/dashboard/hrms');
    await page.waitForURL(/\/dashboard$/, { timeout: 45_000 });
  });
});
