import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * The designed icon family in the real app (src/lib/kicons): the demo account gets the Kinematic glyphs across the
 * page and the sidebar; flipping the header toggle swaps them back and forth IN PLACE (no reload); the active nav
 * item's signature node turns brand red; every other account keeps lucide's icons untouched.
 */

const DEMO_USER = { ...SEED_USER, id: 'u-demo', name: 'Demo Rep', email: 'demo@kinematicapp.com' };
const OTHER_USER = { ...SEED_USER, id: 'u-other', name: 'Other Rep', email: 'rep@tata.com' };

async function open(page: Page, user: Record<string, unknown>) {
  await seedSession(page, user);
  await mockApi(page, { me: { success: true, data: user } });
  await page.goto('/dashboard');
  await expect(page.getByText('Total forms filled').first()).toBeVisible({ timeout: 30_000 });
}

const kicons = (page: Page) => page.locator('svg.kicon');
const lucideOnly = (page: Page) => page.locator('svg.lucide:not(.kicon)');
const toggle = (page: Page, name: 'Classic' | 'New') => page.getByTestId('design-toggle').getByRole('button', { name, exact: true });

test.describe('Designed icons — demo account', () => {
  test('the page and the sidebar draw the Kinematic glyphs', async ({ page }) => {
    await open(page, DEMO_USER);
    await expect.poll(() => kicons(page).count()).toBeGreaterThan(15);
    // sidebar nav icons are among them
    await expect(page.locator('nav svg.kicon, aside svg.kicon').first()).toBeVisible();
    // each is a layered drawing: line work, plus (for most) an offset plate and a node
    const sample = await kicons(page).first().evaluate((el) => ({ paths: el.querySelectorAll('path').length, vb: el.getAttribute('viewBox') }));
    expect(sample.paths).toBeGreaterThan(0);
    expect(sample.vb).toBe('0.9 0.9 22.2 22.2');
  });

  test('the active nav item picks up the brand red (its duotone plate); the others keep their own colour', async ({ page }) => {
    await open(page, DEMO_USER);
    const plateFill = (selector: string) => page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).fill : null;
    }, selector);
    const channels = (rgb: string | null) => (rgb ?? '').match(/\d+(\.\d+)?/g)?.map(Number) ?? [];

    // the Dashboard row is the active one
    const active = channels(await plateFill('[aria-current="page"] svg.kicon path[fill-opacity]'));
    expect(active.length, 'the active nav icon has a plate').toBeGreaterThanOrEqual(3);
    expect(active[0]).toBeGreaterThan(150);   // brand red: strongly red…
    expect(active[1]).toBeLessThan(80);       // …and not grey
    expect(active[2]).toBeLessThan(90);

    // a nav icon that is NOT active keeps its own (neutral) colour
    const other = channels(await plateFill('nav a:not([aria-current="page"]) svg.kicon path[fill-opacity], aside a:not([aria-current="page"]) svg.kicon path[fill-opacity]'));
    expect(other.length).toBeGreaterThanOrEqual(3);
    expect(other[1], 'an inactive icon is not red').toBeGreaterThan(80);
  });

  test('flipping the toggle swaps the icons in place, both ways, without a reload', async ({ page }) => {
    await open(page, DEMO_USER);
    await expect.poll(() => kicons(page).count()).toBeGreaterThan(15);
    // mark the document so we can prove it was not reloaded
    await page.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true; });

    await toggle(page, 'Classic').click();
    await expect.poll(() => kicons(page).count()).toBe(0);
    await expect.poll(() => lucideOnly(page).count()).toBeGreaterThan(15);

    await toggle(page, 'New').click();
    await expect.poll(() => kicons(page).count()).toBeGreaterThan(15);
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  });

  test('the chosen design sticks across a reload', async ({ page }) => {
    await open(page, DEMO_USER);
    await toggle(page, 'Classic').click();
    await expect.poll(() => kicons(page).count()).toBe(0);
    await page.reload();
    await expect(page.getByText('Total forms filled').first()).toBeVisible({ timeout: 30_000 });
    await expect(toggle(page, 'Classic')).toHaveAttribute('aria-pressed', 'true');
    expect(await kicons(page).count()).toBe(0);
  });
});

test.describe('Designed icons — everyone else', () => {
  test('keep lucide: no Kinematic glyph anywhere', async ({ page }) => {
    await open(page, OTHER_USER);
    await expect.poll(() => lucideOnly(page).count()).toBeGreaterThan(15);
    expect(await kicons(page).count()).toBe(0);
    await expect(page.getByTestId('design-toggle')).toHaveCount(0);
  });
});
