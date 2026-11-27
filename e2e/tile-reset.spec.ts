import { test, expect, type Page } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * "Reset to default" for the movable tiles, driven through the real login screen as the demo account:
 *  - outside edit mode it appears only once the page has been rearranged, and puts the tiles back
 *  - in edit mode there is "Reset to default" (this page) and "Reset all pages" (asks to be clicked twice)
 */

// react-grid-layout renders at a default width and re-measures its container right after mount — wait until a box settles.
const stableWidth = async (page: Page, testId: string) => {
  const el = page.getByTestId(testId);
  let prev = (await el.boundingBox())!.width;
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(80);
    const cur = (await el.boundingBox())!.width;
    if (Math.abs(cur - prev) < 0.5) return cur;
    prev = cur;
  }
  return prev;
};

const savedKeys = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('km_tiles:')).length);

async function openHome(page: Page) {
  await demoLogin(page);
  await expect(page.getByTestId('tileboard-home-kpis')).toBeVisible({ timeout: 30_000 });
}

test.describe('Reset to default', () => {
  test('is offered outside edit mode only once the page is rearranged, and puts the tiles back', async ({ page }) => {
    await openHome(page);
    const before = await stableWidth(page, 'tile-forms');
    await expect(page.getByTestId('tiles-reset-outside')).toHaveCount(0);           // nothing to reset yet

    await page.getByTestId('tiles-customize').click();
    await page.getByTestId('tile-forms-w-Full').click();
    await page.getByTestId('tiles-done').click();
    await expect.poll(() => stableWidth(page, 'tile-forms')).toBeGreaterThan(before * 2);
    await expect(page.getByTestId('tiles-reset-outside')).toBeVisible();            // rearranged → offered, no edit mode needed

    await page.getByTestId('tiles-reset-outside').click();
    await expect.poll(async () => Math.abs((await stableWidth(page, 'tile-forms')) - before)).toBeLessThan(4);
    await expect(page.getByTestId('tiles-reset-outside')).toHaveCount(0);           // back to default: nothing left to reset
    expect(await savedKeys(page)).toBe(0);
  });

  test('is still offered after a reload (the saved layout is what makes it appear)', async ({ page }) => {
    await openHome(page);
    await page.getByTestId('tiles-customize').click();
    await page.getByTestId('tile-forms-w-Full').click();
    await page.getByTestId('tiles-done').click();
    await page.reload();
    await expect(page.getByTestId('tileboard-home-kpis')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('tiles-reset-outside')).toBeVisible();
  });

  test('edit mode has Reset to default, and Reset all pages asks for a second click', async ({ page }) => {
    await openHome(page);
    const before = await stableWidth(page, 'tile-forms');
    await page.getByTestId('tiles-customize').click();
    await page.getByTestId('tile-forms-w-Full').click();
    await expect.poll(() => stableWidth(page, 'tile-forms')).toBeGreaterThan(before * 2);

    const all = page.getByTestId('tiles-reset-all');
    await expect(page.getByTestId('tiles-reset')).toHaveText('Reset to default');
    await expect(all).toHaveText('Reset all pages');
    await all.click();                                                               // first click only arms it
    await expect(all).toHaveText('Click again to confirm');
    expect(await stableWidth(page, 'tile-forms')).toBeGreaterThan(before * 2);       // nothing reset yet
    await all.click();                                                               // second click does it
    await expect.poll(async () => Math.abs((await stableWidth(page, 'tile-forms')) - before)).toBeLessThan(4);
    expect(await savedKeys(page)).toBe(0);
  });

  test('the confirmation lapses on its own', async ({ page }) => {
    await openHome(page);
    await page.getByTestId('tiles-customize').click();
    await page.getByTestId('tiles-reset-all').click();
    await expect(page.getByTestId('tiles-reset-all')).toHaveText('Click again to confirm');
    await expect(page.getByTestId('tiles-reset-all')).toHaveText('Reset all pages', { timeout: 8_000 });
  });

  test('Reset all pages also puts back a layout saved on ANOTHER page', async ({ page }) => {
    await openHome(page);
    const homeBefore = await stableWidth(page, 'tile-forms');
    await page.getByTestId('tiles-customize').click();
    await page.getByTestId('tile-forms-w-Full').click();
    await page.getByTestId('tiles-done').click();
    expect(await savedKeys(page)).toBeGreaterThan(0);

    await page.goto('/dashboard/crm/dashboard');                                     // a different page with its own board
    await expect(page.getByTestId('tileboard-crm-dashboard-stats')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('tiles-customize').click();
    await page.getByTestId('tiles-reset-all').click();
    await page.getByTestId('tiles-reset-all').click();
    await page.getByTestId('tiles-done').click();
    expect(await savedKeys(page)).toBe(0);                                           // the home page's layout went too

    await page.goto('/dashboard');
    await expect(page.getByTestId('tileboard-home-kpis')).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => Math.abs((await stableWidth(page, 'tile-forms')) - homeBefore)).toBeLessThan(4);
  });

  test('Classic has no tile controls at all', async ({ page }) => {
    await openHome(page);
    await page.getByTestId('design-toggle').getByRole('button', { name: 'Classic', exact: true }).click();
    for (const id of ['tiles-customize', 'tiles-reset-outside', 'tiles-reset', 'tiles-reset-all']) await expect(page.getByTestId(id)).toHaveCount(0);
  });
});
