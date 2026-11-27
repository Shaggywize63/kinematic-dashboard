import { test, expect } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * The regression this guards: the new design shipped gated to `demo@kinematicapp.com`, but the public demo login
 * everyone actually uses is `demo@kinematic.com` — so the demo account saw nothing. This signs in through the REAL
 * login screen as that built-in demo account (offline, no backend) and checks the redesign is there: the Classic/New
 * switch, the designed icon family, and the movable tiles — and that switching to Classic gives the old UI back.
 */

test.describe('New design — built-in demo login (demo@kinematic.com)', () => {
  test('signing in as the demo account shows the switch, the designed icons and the movable tiles', async ({ page }) => {
    await demoLogin(page);

    const toggle = page.getByTestId('design-toggle');
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('html')).toHaveAttribute('data-design', 'new');

    // designed icons are drawn (the swap renders <svg class="kicon">)
    await expect(page.locator('svg.kicon').first()).toBeVisible();

    // the page-wide tile controls are in the header
    await expect(page.getByTestId('tiles-customize')).toBeVisible();
  });

  test('the switch gives the classic UI back and remembers the choice across a reload', async ({ page }) => {
    await demoLogin(page);
    await expect(page.getByTestId('design-toggle')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('design-toggle').getByRole('button', { name: 'Classic', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-design', 'classic');
    await expect(page.locator('svg.kicon')).toHaveCount(0);
    await expect(page.getByTestId('tiles-customize')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('design-toggle')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('html')).toHaveAttribute('data-design', 'classic');

    await page.getByTestId('design-toggle').getByRole('button', { name: 'New', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-design', 'new');
  });
});
