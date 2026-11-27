import { test, expect, type Page } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * Regressions reported on the Aurora design, driven through the real login screen as the demo account:
 *  - raised surfaces (hover pills, popovers, drag handles) must be SOLID, never see-through
 *  - a panel that renders nothing must not leave an orphan drag handle (it showed as a second "rearrange" sign)
 *  - a tile made bigger shows more: the facts behind its number
 */

const cssVar = (page: Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test.describe('Aurora surfaces are solid where they sit over content', () => {
  test('--s3 / --s4 (raised surfaces) are opaque colours in both themes', async ({ page }) => {
    await demoLogin(page);
    await expect(page.getByTestId('aurora-sky')).toBeAttached({ timeout: 30_000 });
    for (const v of ['--s3', '--s4']) expect(await cssVar(page, v)).toMatch(/^#[0-9a-f]{6}$/i);       // no alpha channel
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    for (const v of ['--s3', '--s4']) expect(await cssVar(page, v)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('the leads table row-action pill is opaque, so it never shows the date under it', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/crm/leads');
    const row = page.locator('tr.lead-row').first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.hover();
    const bg = await row.locator('.row-actions').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toMatch(/rgba\(.*,\s*0?\.\d+\)/);       // alpha < 1 would let the date show through
  });

  test('the analytics insight popover is opaque and readable', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/analytics');
    const info = page.locator('.kini-info').first();
    await expect(info).toBeVisible({ timeout: 60_000 });
    await info.hover();
    const pop = info.locator('.kini-info-pop');
    await expect(pop).toBeVisible();
    const bg = await pop.evaluate((el) => getComputedStyle(el).backgroundColor);
    const alpha = /rgba\(.*,\s*([0-9.]+)\)/.exec(bg)?.[1];
    expect(alpha === undefined || Number(alpha) >= 0.85).toBe(true);
  });
});

test.describe('Reorderable detail panels', () => {
  test('no orphan drag handle: every handle belongs to a panel that has content, and none overlap', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/crm/leads');
    const link = page.getByRole('link', { name: 'Vikram Reddy' }).first();
    await link.waitFor({ timeout: 60_000 });
    await link.click();
    await page.waitForURL(/leads\/[^/]+$/, { timeout: 60_000 });
    await expect(page.locator('.km-sp-grip').first()).toBeAttached({ timeout: 60_000 });

    const info = await page.evaluate(() => {
      const grips = Array.from(document.querySelectorAll<HTMLElement>('.km-sp-grip'));
      const rects = grips.map((g) => g.getBoundingClientRect());
      const visible = grips.map((g, i) => ({ g, r: rects[i], shown: getComputedStyle(g.closest('.km-sp') as HTMLElement).display !== 'none' }));
      const shown = visible.filter((v) => v.shown);
      const emptyShown = shown.filter((v) => (v.g.closest('.km-sp')!.querySelector('.km-sp-body') as HTMLElement).childElementCount === 0).length;
      let overlaps = 0;
      for (let a = 0; a < shown.length; a++) for (let b = a + 1; b < shown.length; b++) {
        const A = shown[a].r, B = shown[b].r;
        if (A.left < B.right && B.left < A.right && A.top < B.bottom && B.top < A.bottom) overlaps++;
      }
      return { total: grips.length, shown: shown.length, emptyShown, overlaps };
    });
    expect(info.shown).toBeGreaterThan(0);
    expect(info.emptyShown).toBe(0);
    expect(info.overlaps).toBe(0);
  });
});

test.describe('A tile made bigger shows more', () => {
  test('the home "Total forms filled" tile lists its facts once it is taller, and not before', async ({ page }) => {
    await demoLogin(page);
    await expect(page.getByTestId('tileboard-home-kpis')).toBeVisible({ timeout: 30_000 });
    const tile = page.getByTestId('tile-forms');
    await expect(tile.getByText('Peak day')).toHaveCount(0);                      // default size: just the number

    await page.getByTestId('tiles-customize').click();
    await page.getByTestId('tile-forms-w-⅓').click();
    for (let i = 0; i < 3; i++) await page.getByTestId('tile-forms-taller').click();
    await page.getByTestId('tiles-done').click();

    await expect(tile.getByText('Peak day')).toBeVisible();                        // roomy: facts behind the number…
    await expect(tile.getByText('Daily average')).toBeVisible();
    await expect(tile.locator('svg[aria-label$="recent trend"]')).toBeVisible();   // …and its trend

    await page.getByTestId('tiles-customize').click();
    await page.getByTestId('tiles-reset').click();
    await page.getByTestId('tiles-done').click();
    await expect(tile.getByText('Peak day')).toHaveCount(0);                      // back to default: back to just the number
  });

  test('Classic never shows the extra detail', async ({ page }) => {
    await demoLogin(page);
    await expect(page.getByTestId('design-toggle')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('design-toggle').getByRole('button', { name: 'Classic', exact: true }).click();
    await expect(page.getByText('Peak day')).toHaveCount(0);
  });
});
