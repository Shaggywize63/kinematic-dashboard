import { test, expect } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * The CRM Settings hub lists configuration sections, including the field-
 * overrides "Custom Fields" card that governs which built-in lead fields are
 * hidden / relabelled. Verify it renders in demo mode.
 */
test.describe('CRM settings (demo mode)', () => {
  test('settings hub renders its section cards', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/crm/settings');
    await expect(page).toHaveURL(/\/dashboard\/crm\/settings/);

    // Section cards from the settings index.
    await expect(page.getByText('Custom Fields').first()).toBeVisible();
    await expect(page.getByText('Lead Sources').first()).toBeVisible();
  });
});
