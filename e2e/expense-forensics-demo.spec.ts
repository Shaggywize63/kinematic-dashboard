import { test, expect } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * Smoke test for the expense forgery/forensics prototype in the DEMO account:
 * the demo fixtures populate the expense screens and the forensic highlights,
 * risk column, filters and travel links render.
 */
test.describe('Expense forensics — demo account', () => {
  test('approvals queue shows a forgery-risk column and a claim shows forensic highlights', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/expenses/approvals');
    await expect(page.getByText('Arjun Sharma').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('High risk').first()).toBeVisible();

    await page.goto('/dashboard/expenses/exp-101');
    await expect(page.getByText('Forensic highlights')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/within \d+\s*m of each other/i)).toBeVisible(); // co-location detail
    await expect(page.getByRole('link', { name: /travel report/i }).first()).toBeVisible();
  });

  test('all claims page has a User filter and per-row travel links', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/expenses/all');
    await expect(page.getByLabel('User')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: /Day report/i }).first()).toBeVisible();
  });

  test('policies page exposes the configurable forgery-check thresholds', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/expenses/policies');
    await expect(page.getByText('Forgery & forensics checks')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Halt length that is flagged/i)).toBeVisible();
  });
});
