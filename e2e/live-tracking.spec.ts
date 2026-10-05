import { test, expect } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * Live Trailing — "where is this person?" (offline demo mode).
 *
 * The e2e environment has no Google Maps key, so the map itself and reverse
 * geocoding are unavailable by design; that is exactly the case where the page
 * must still tell a manager where a rep is, from the raw coordinates.
 */
test.describe('Live Trailing location details (demo mode)', () => {
  test.beforeEach(async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/live-tracking');
  });

  test('every rep row shows where they are — coordinates when no place name is available', async ({ page }) => {
    const row = page.locator('.lt-row', { hasText: 'Arjun Sharma' });
    await expect(row).toBeVisible();
    // No geocoder here → falls back to the short coordinate form.
    await expect(row).toContainText('12.9352, 77.6245');
  });

  test('selecting a rep shows a last-known-location card with exact coordinates and a Maps link', async ({ page }) => {
    await page.locator('.lt-row', { hasText: 'Arjun Sharma' }).click();

    const detail = page.locator('.lt-detail');
    await expect(detail).toBeVisible();
    await expect(detail.getByText('Last known location', { exact: false }).first()).toBeVisible();
    await expect(detail.getByText('12.935200, 77.624500')).toBeVisible();
    await expect(detail.getByText('Place name unavailable', { exact: false })).toBeVisible();

    const link = detail.getByRole('link', { name: /Open in Google Maps/ });
    await expect(link).toHaveAttribute('href', /google\.com\/maps\?q=12\.9352%2C77\.6245/);
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(detail.getByRole('button', { name: 'Copy' })).toBeVisible();
  });

  test('switching reps updates the card to that rep\'s coordinates', async ({ page }) => {
    await page.locator('.lt-row', { hasText: 'Arjun Sharma' }).click();
    await expect(page.locator('.lt-detail').getByText('12.935200, 77.624500')).toBeVisible();
    await page.locator('.lt-row', { hasText: 'Priya Patel' }).click();
    await expect(page.locator('.lt-detail').getByText('12.927900, 77.627100')).toBeVisible();
  });
});
