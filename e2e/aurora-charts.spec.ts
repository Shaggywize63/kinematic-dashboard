import { test, expect, type Page } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * The Aurora charts (components/charts/AuroraCharts.tsx) on the home dashboard, driven through the real login screen
 * as the built-in demo account — whose dashboard-init mock is 60 field executives: 38 active, 6 on break, 11 checked out,
 * 5 absent (55 checked in = 92%), 3 on approved leave, 14 late check-ins, first check-in 8:02 am.
 *
 * Also: every recharts chart picks up the Aurora theme (quiet grid, glass tooltip) from one place.
 */

const ring = (page: Page) => page.locator('svg[aria-label^="Attendance today"]');

async function openHome(page: Page) {
  await demoLogin(page);
  await expect(ring(page)).toBeVisible({ timeout: 30_000 });
}

test.describe('Aurora Attendance card', () => {
  test('one tick per field executive, the rate in the middle, and a status list with captions', async ({ page }) => {
    await openHome(page);
    await expect(ring(page).locator('line')).toHaveCount(60);                       // 38 + 6 + 11 + 5

    const card = page.locator('.km-card', { has: ring(page) });
    await expect(card.getByText('Attendance today')).toBeVisible();
    await expect(card.getByText('Each tick is one field executive')).toBeVisible();
    await expect(card.getByText('92%')).toBeVisible();
    await expect(card.getByText('55 of 60 checked in')).toBeVisible();

    for (const [label, caption, n] of [
      ['Active', 'In the field now', '38'], ['On break', 'Paused their day', '6'],
      ['Checked out', 'Done for the day', '11'], ['Absent', 'No check-in, no leave', '5'],
    ]) {
      const row = card.locator('.km-au-row', { hasText: label });
      await expect(row).toContainText(caption);
      await expect(row).toContainText(n);
    }
    await expect(card.locator('.km-livepill')).toContainText(/\d{1,2}:\d{2}\s?(AM|PM)/);   // the live clock
  });

  test('the footer shows the facts the API sent', async ({ page }) => {
    await openHome(page);
    const card = page.locator('.km-card', { has: ring(page) });
    await expect(card.getByText('checked in after 10:00 am')).toBeVisible();
    await expect(card).toContainText('14');
    await expect(card).toContainText('First check-in');
    await expect(card).toContainText('8:02 am');
    await expect(card).toContainText('3');
    await expect(card.getByText('on approved leave')).toBeVisible();
  });

  test('hovering a status dims the other groups and the centre names it', async ({ page }) => {
    await openHome(page);
    const card = page.locator('.km-card', { has: ring(page) });
    const firstTick = ring(page).locator('line').first();                           // an "Active" tick
    await expect(firstTick).toHaveCSS('opacity', '1');
    await card.locator('.km-au-row', { hasText: 'On break' }).hover();
    await expect(firstTick).toHaveCSS('opacity', '0.2');
    await expect(card.getByText('on break', { exact: true })).toBeVisible();        // centre caption while focused
    await page.mouse.move(5, 5);
    await expect(firstTick).toHaveCSS('opacity', '1');
  });

  test('Classic keeps the original attendance card', async ({ page }) => {
    await openHome(page);
    await page.getByTestId('design-toggle').getByRole('button', { name: 'Classic', exact: true }).click();
    await expect(ring(page)).toHaveCount(0);
    await expect(page.getByText('Active · On break · Checked out · Absent')).toBeVisible();
    await expect(page.getByText('Weekly activity')).toBeVisible();
  });

  test('both themes define the status colours', async ({ page }) => {
    await openHome(page);
    const good = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--au-good').trim());
    expect(await good()).toBe('#0AAC23');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    expect(await good()).toBe('#0A9A20');
  });
});

test.describe('Aurora area chart (Forms filled)', () => {
  test('renders a smooth area and reads out a day on hover or with the arrow keys', async ({ page }) => {
    await openHome(page);
    const chart = page.locator('svg[aria-label="Forms filled per day"]');
    await expect(chart).toBeVisible();
    await expect(chart.locator('path').nth(1)).toBeVisible();                       // the area fill and the line

    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const tip = page.locator('.km-chart-tip[role="status"]');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/\d/);
    await page.mouse.move(5, 5);
    await expect(tip).toHaveCount(0);

    await chart.focus();
    await page.keyboard.press('ArrowRight');
    await expect(tip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
  });

  test('Classic keeps the bar chart', async ({ page }) => {
    await openHome(page);
    await page.getByTestId('design-toggle').getByRole('button', { name: 'Classic', exact: true }).click();
    await expect(page.locator('svg[aria-label="Forms filled per day"]')).toHaveCount(0);
  });
});

test.describe('Aurora theme reaches the shared recharts charts', () => {
  test('quiet grid lines and glass tooltips come from the shared chart theme', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/crm/dashboard');
    const grid = page.locator('.recharts-cartesian-grid line').first();
    await expect(grid).toBeAttached({ timeout: 30_000 });
    const stroke = await grid.evaluate((el) => getComputedStyle(el).stroke);
    expect(stroke).toMatch(/rgba\(255, 255, 255, 0\.07\)|rgb\(255 255 255 \/ 0\.07\)|rgba\(255,\s*255,\s*255,\s*0\.07\)/);
  });
});
