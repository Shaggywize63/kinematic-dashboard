import { test, expect, type Page } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * The Aurora look (app/aurora.css) and the app-wide movable tiles (components/ui/TileGrid.tsx), driven through the REAL
 * login screen as the built-in demo account.
 *
 * Aurora must hold on a HARD reload too: server-rendered elements carry their inline style as `min-height:100vh;
 * background:var(--canvas)` (no spaces) while client-rendered ones have `min-height: 100vh`, and an attribute selector
 * written for only one spelling leaves the full-page wrapper opaque — which hides the sky on every reloaded page.
 */

const setTheme = (page: Page, theme: 'dark' | 'light') =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test.describe('Aurora — demo account', () => {
  test('the sky, glass cards and frosted chrome are on in the New design', async ({ page }) => {
    await demoLogin(page);
    await expect(page.getByTestId('design-toggle')).toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId('aurora-sky')).toBeAttached();
    expect(await cssVar(page, '--a-bg')).toBe('#060A14');                      // dark Aurora palette

    // a shared Card is glass: translucent fill, 20px corners, a light edge
    const card = page.locator('.km-card').first();
    await expect(card).toBeVisible();
    const s = await card.evaluate((el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, radius: c.borderTopLeftRadius, shadow: c.boxShadow }; });
    expect(s.radius).toBe('20px');
    expect(s.bg).toMatch(/rgba\(.*,\s*0?\.\d+\)/);                              // alpha < 1 → you can see the sky through it
    expect(s.shadow).not.toBe('none');

    // the sidebar and the top bar are frosted
    const frosted = await page.evaluate(() => [
      getComputedStyle(document.querySelector('aside[aria-label="Main navigation"]') as Element).backdropFilter,
      getComputedStyle(document.querySelector('main > header') as Element).backdropFilter,
    ]);
    for (const f of frosted) expect(f).toContain('blur');
  });

  test('the sky shows through after a hard reload (server-rendered inline styles)', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/crm/leads');                                    // a full page load: SSR markup, hydrated
    await expect(page.getByTestId('aurora-sky')).toBeAttached({ timeout: 30_000 });
    // nothing opaque between the page ground and the sky: the app wrapper beside the sidebar is transparent
    const wrapperBg = await page.evaluate(() => getComputedStyle((document.querySelector('aside[aria-label="Main navigation"]') as HTMLElement).parentElement as HTMLElement).backgroundColor);
    expect(wrapperBg).toBe('rgba(0, 0, 0, 0)');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  });

  test('light theme gets the light Aurora palette', async ({ page }) => {
    await demoLogin(page);
    await expect(page.getByTestId('aurora-sky')).toBeAttached({ timeout: 30_000 });
    await setTheme(page, 'light');
    expect(await cssVar(page, '--a-bg')).toBe('#E8ECF5');
    expect(await cssVar(page, '--a-ink')).toBe('#0B1020');
  });

  test('Classic has no sky and none of the Aurora tokens', async ({ page }) => {
    await demoLogin(page);
    await expect(page.getByTestId('design-toggle')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('design-toggle').getByRole('button', { name: 'Classic', exact: true }).click();
    await expect(page.getByTestId('aurora-sky')).toHaveCount(0);
    expect(await cssVar(page, '--a-glass')).toBe('');
    // cards are the original opaque surfaces again
    const bg = await page.locator('.km-card').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toMatch(/rgba/);
  });
});

test.describe('Movable tiles everywhere — CRM dashboard (a grid wrapped in TileGrid)', () => {
  const open = async (page: Page) => {
    await demoLogin(page);
    await page.goto('/dashboard/crm/dashboard');
    await expect(page.getByTestId('tileboard-crm-dashboard-stats')).toBeVisible({ timeout: 30_000 });
  };

  test('the header offers "Arrange tiles" and edit mode shows a bar on every tile', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('tiles-customize')).toHaveText(/Arrange tiles/);
    await page.getByTestId('tiles-customize').click();
    await expect(page.getByTestId('tile-edit-controls')).toBeVisible();
    expect(await page.locator('[data-testid="tileboard-crm-dashboard-stats"] .km-tile-bar').count()).toBeGreaterThan(1);
    await page.getByTestId('tiles-done').click();
    await expect(page.getByTestId('tiles-customize')).toBeVisible();
  });

  test('hovering a tile offers an "Arrange" pill that enters edit mode', async ({ page }) => {
    await open(page);
    const tile = page.locator('[data-testid="tileboard-crm-dashboard-stats"] [data-testid^="tile-"]:not([data-testid*="-grip"]):not([data-testid*="-w-"])').first();
    await tile.hover();
    const grip = tile.locator('.km-tile-grip');
    await expect(grip).toBeVisible();
    await grip.click();
    await expect(page.getByTestId('tile-edit-controls')).toBeVisible();
  });

  test('a size button resizes a tile, the layout sticks across a reload, and Reset restores it', async ({ page }) => {
    await open(page);
    const widthOf = async () => (await page.getByTestId('tile-open-pipeline').boundingBox())!.width;
    const before = await widthOf();
    await page.getByTestId('tiles-customize').click();
    await page.getByTestId('tile-open-pipeline-w-Full').click();
    await expect.poll(widthOf).toBeGreaterThan(before * 2);
    await page.getByTestId('tiles-done').click();

    await page.reload();
    await expect(page.getByTestId('tileboard-crm-dashboard-stats')).toBeVisible({ timeout: 30_000 });
    await expect.poll(widthOf).toBeGreaterThan(before * 2);

    await page.getByTestId('tiles-customize').click();
    await page.getByTestId('tiles-reset').click();
    await expect.poll(async () => Math.abs((await widthOf()) - before)).toBeLessThan(4);
  });

  test('Classic keeps the original grid on the same page', async ({ page }) => {
    await open(page);
    await page.getByTestId('design-toggle').getByRole('button', { name: 'Classic', exact: true }).click();
    await expect(page.getByTestId('tileboard-crm-dashboard-stats')).toHaveCount(0);
    await expect(page.getByTestId('tiles-customize')).toHaveCount(0);
    await expect(page.getByText('Open Pipeline').first()).toBeVisible();        // the tiles are still there, in the original grid
  });
});
