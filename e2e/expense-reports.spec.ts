import { test, expect } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * Smoke test for Expenses → Reports (demo account). Every report runs on the real
 * summary / claims-list endpoints, so this exercises the report picker, the
 * analytics reports and a claim register against the demo fixtures. Mileage is
 * hidden here because the demo client has no vehicle-rate policy.
 */
test.describe('Expense reports — demo account', () => {
  test('overview, breakdown reports and a register all render', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/expenses/reports');

    // Overview: the KPI row and the spend-over-time chart.
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Claimed', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Spend over time')).toBeVisible();

    // By employee → a demo claimant appears in the breakdown.
    await page.getByRole('tab', { name: 'By employee' }).click();
    await expect(page.getByText('Spend by employee')).toBeVisible();
    // The table cell (not the hidden User-filter <option>) proves the breakdown rendered.
    await expect(page.getByRole('cell', { name: 'Arjun Sharma' })).toBeVisible();

    // By category.
    await page.getByRole('tab', { name: 'By category' }).click();
    await expect(page.getByText('Spend by category')).toBeVisible();

    // A claim register (the claims list honours the status filter per report).
    await page.getByRole('tab', { name: 'Reimbursement register' }).click();
    await expect(page.getByRole('tab', { name: 'Reimbursement register' })).toHaveAttribute('aria-selected', 'true');

    // Mileage is hidden for a client with no vehicle-rate policy.
    await expect(page.getByRole('tab', { name: 'Mileage & odometer' })).toHaveCount(0);
  });
});
