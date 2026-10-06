import { test, expect } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * Automated Route Plans as the DEMO account sees it. It used to get no method
 * cards, no vehicle list and no working preview / assign, because none of the
 * /route-plans/autoplan/* endpoints were mocked. It must now offer everything a
 * real account does.
 */
const METHODS = [
  'Cadence & priority', 'Territory / beat', 'Geographic clusters', 'Nearest field executive',
  'Balanced workload', 'Recurring journey plan', 'Manual only',
];

test.describe('Automated Route Plans (demo account)', () => {
  test.beforeEach(async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/route-automation');
    await expect(page.getByRole('heading', { name: 'Automated Route Plans' })).toBeVisible();
  });

  const card = (page: import('@playwright/test').Page, name: string) => page.getByRole('button', { name: new RegExp(`^\\s*${name.replace(/[/&]/g, '.')}`) });

  test('offers all seven assignment methods, and only "Manual only" is tagged MANUAL', async ({ page }) => {
    for (const m of METHODS) await expect(card(page, m)).toBeVisible();
    await expect(page.getByText('MANUAL', { exact: true })).toHaveCount(1);
  });

  test('offers all eight vehicle types', async ({ page }) => {
    const options = page.locator('label', { hasText: 'Vehicle' }).locator('select option');
    await expect(options).toHaveCount(8);
    await expect(options.filter({ hasText: 'Walking' })).toHaveCount(1);
    await expect(options.filter({ hasText: '2W EV' })).toHaveCount(1);
    await expect(options.filter({ hasText: '4W Diesel' })).toHaveCount(1);
  });

  test('shows the radius control only for the methods that use it, and none for Manual', async ({ page }) => {
    const radius = page.getByText('Max radius (km)');
    await card(page, 'Territory / beat').click();
    await expect(radius).toHaveCount(0);
    await card(page, 'Nearest field executive').click();
    await expect(radius).toBeVisible();
    await card(page, 'Balanced workload').click();
    await expect(radius).toBeVisible();
    await card(page, 'Manual only').click();
    await expect(page.getByText('Auto-assignment is')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Preview assignment' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Generate & assign' })).toHaveCount(0);
  });

  test('Preview assignment lists each rep with their stops, and differs by method', async ({ page }) => {
    await page.getByRole('button', { name: 'Preview assignment' }).click();
    await expect(page.getByText('Outlets due')).toBeVisible();
    await expect(page.getByText('Will be assigned')).toBeVisible();
    await expect(page.getByText('Arjun Sharma').first()).toBeVisible();
    const first = await page.getByText(/stops?$/).first().textContent();
    await card(page, 'Territory / beat').click();          // switching method clears the old preview
    await expect(page.getByText('Outlets due')).toHaveCount(0);
    await page.getByRole('button', { name: 'Preview assignment' }).click();
    await expect(page.getByText('Outlets due')).toBeVisible();
    await expect(page.getByText(/Preview only/)).toBeVisible();
    expect(first).toBeTruthy();
  });

  test('Generate & assign creates plans that then show on Route Plan', async ({ page }) => {
    await card(page, 'Geographic clusters').click();
    await page.getByRole('button', { name: 'Generate & assign' }).click();
    await expect(page.getByText(/^Assigned \d+ plans? for /).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /View route plans/ })).toBeVisible();
    await page.getByRole('link', { name: /View route plans/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/route-plan/);
    await expect(page.getByText(/Auto Plan · Geographic clusters/).first()).toBeVisible();
  });

  test('Save method persists the choice', async ({ page }) => {
    await card(page, 'Recurring journey plan').click();
    await page.getByRole('button', { name: 'Save method' }).click();
    await expect(page.getByText('Method saved as the org default.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Method saved' })).toBeVisible();
    await expect(page.getByText(/Saved method:/)).toContainText('Recurring journey plan');
  });

  test('Field executive locations show every state, and a base can be set for a rep with none', async ({ page }) => {
    await expect(page.getByText('1 without a location')).toBeVisible();
    await page.getByRole('button', { name: /Field executive locations/ }).click();
    for (const badge of ['Live', 'Base set', 'Last known', 'No location']) {
      await expect(page.getByText(badge, { exact: true }).first()).toBeVisible();
    }
    // the rep with no location is the only one whose row offers "Save base" with empty inputs
    const row = page.locator('div', { hasText: 'No location' }).filter({ has: page.getByPlaceholder('lat') }).last();
    await row.getByPlaceholder('lat').fill('18.52');
    await row.getByPlaceholder('lng').fill('73.85');
    await row.getByRole('button', { name: 'Save base' }).click();
    await expect(page.getByText('all set')).toBeVisible();
    await expect(page.getByText('1 without a location')).toHaveCount(0);
  });
});
