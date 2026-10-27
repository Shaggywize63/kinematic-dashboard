import { test, expect, type Page } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * Header "text size" stepper (A- / A+). It drives a whole-UI CSS zoom via the
 * --font-zoom custom property on <html>, 100%–150% in 10% steps, persisted so
 * a reload keeps the chosen size.
 */

const zoom = (page: Page) =>
  page.evaluate(() => document.documentElement.style.getPropertyValue('--font-zoom').trim());

test.describe('Header text-size stepper', () => {
  test.beforeEach(async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard');
  });

  test('A+ / A- step the whole-UI zoom and persist across reloads', async ({ page }) => {
    const group = page.getByRole('group', { name: /Text size/ });
    await expect(group).toBeVisible();
    const inc = group.getByRole('button', { name: 'Increase text size' });
    const dec = group.getByRole('button', { name: 'Decrease text size' });

    // Starts at 100% — decrease is disabled.
    await expect(dec).toBeDisabled();

    await inc.click();
    await expect.poll(() => zoom(page)).toBe('1.1');
    await inc.click();
    await expect.poll(() => zoom(page)).toBe('1.2');

    // Persisted (cookie + localStorage) → survives a hard reload with no flash.
    await page.reload();
    await expect.poll(() => zoom(page)).toBe('1.2');

    await group.getByRole('button', { name: 'Decrease text size' }).click();
    await expect.poll(() => zoom(page)).toBe('1.1');
  });

  test('clamps at the 150% maximum', async ({ page }) => {
    const group = page.getByRole('group', { name: /Text size/ });
    const inc = group.getByRole('button', { name: 'Increase text size' });
    for (let i = 0; i < 8 && (await inc.isEnabled()); i++) await inc.click();
    await expect.poll(() => zoom(page)).toBe('1.5');
    await expect(inc).toBeDisabled();
  });
});
