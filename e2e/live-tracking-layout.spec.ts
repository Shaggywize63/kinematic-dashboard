import { test, expect, type Page } from '@playwright/test';
import { demoLogin } from './utils';
import { FAKE_MAPS } from './fakeMaps';

/**
 * Live Trailing LAYOUT — the map is the point of the page, so it must stay big.
 *
 * The first version stacked a header, five KPI tiles and a filter band above the map, and put the
 * selected rep's details in a strip BELOW it: at 1280x720 the map was 240px tall once a rep was picked
 * (15% of the screen on a phone). These specs pin the fix: the map keeps its size when a rep is
 * selected (the rep card floats over it), controls live in a compact toolbar/sidebar, and the phone
 * layout still leaves a usable map.
 */

const box = async (page: Page, sel: string) => {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`no box for ${sel}`);
  return b;
};

async function open(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  // The demo trail is generated from the wall clock — pin it to mid-afternoon so it has pings at any hour.
  const afternoon = new Date();
  afternoon.setHours(14, 30, 0, 0);
  await page.clock.setFixedTime(afternoon);
  await page.addInitScript(FAKE_MAPS);
  await demoLogin(page);
  await page.goto('/dashboard/live-tracking');
  await page.locator('.lt-row').first().waitFor();
  await expect(page.getByText(/Last sync:/)).toBeVisible();
}

test.describe('Live Trailing layout (desktop 1280x720)', () => {
  test.beforeEach(async ({ page }) => open(page, { width: 1280, height: 720 }));

  test('the page fits the viewport — no page scroll', async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(overflow).toBeLessThanOrEqual(4);
  });

  test('the map is big, and selecting a rep does NOT shrink it', async ({ page }) => {
    const idle = await box(page, '.lt-mapbox');
    expect(idle.height).toBeGreaterThan(500); // was 430 idle / 240 selected at this size
    expect(idle.width).toBeGreaterThan(660);

    await page.locator('.lt-row', { hasText: 'Arjun Sharma' }).click();
    await expect(page.locator('.lt-detail')).toBeVisible();

    const selected = await box(page, '.lt-mapbox');
    expect(Math.abs(selected.height - idle.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(selected.width - idle.width)).toBeLessThanOrEqual(1);
  });

  test('the rep card floats over the map rather than sitting below it', async ({ page }) => {
    await page.locator('.lt-row', { hasText: 'Arjun Sharma' }).click();
    const map = await box(page, '.lt-mapbox');
    const card = await box(page, '.lt-detail');
    expect(card.y).toBeGreaterThanOrEqual(map.y);
    expect(card.y + card.height).toBeLessThanOrEqual(map.y + map.height + 1);
    expect(card.x).toBeGreaterThanOrEqual(map.x);
    expect(card.x + card.width).toBeLessThanOrEqual(map.x + map.width + 1);
  });

  test('status chips carry the counts and filter the list; clicking again clears the filter', async ({ page }) => {
    const rows = page.locator('.lt-row');
    await expect(rows).toHaveCount(5);
    await expect(page.getByRole('button', { name: /^All 5$/ })).toHaveAttribute('aria-pressed', 'true');

    const active = page.getByRole('button', { name: /^Active 3$/ });
    await active.click();
    await expect(active).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(3);
    await expect(page.locator('.lt-row', { hasText: 'Rahul Verma' })).toHaveCount(0); // on break

    await active.click();
    await expect(rows).toHaveCount(5);
    await expect(page.getByRole('button', { name: /^All 5$/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('hiding the list gives the map the full width, and showing it brings the list back', async ({ page }) => {
    const before = await box(page, '.lt-mapbox');
    await page.getByRole('button', { name: /Hide list/ }).click();
    await expect(page.locator('.lt-sidebar')).toBeHidden();
    const wide = await box(page, '.lt-mapbox');
    expect(wide.width).toBeGreaterThan(before.width + 250);

    await page.getByRole('button', { name: /Show list/ }).click();
    await expect(page.locator('.lt-sidebar')).toBeVisible();
    const back = await box(page, '.lt-mapbox');
    expect(Math.abs(back.width - before.width)).toBeLessThanOrEqual(1);
  });

  test('the rep card collapses to its header and expands again', async ({ page }) => {
    await page.locator('.lt-row', { hasText: 'Arjun Sharma' }).click();
    const detail = page.locator('.lt-detail');
    await expect(detail.getByText('Last known location', { exact: false }).first()).toBeVisible();

    await detail.getByRole('button', { name: 'Collapse details' }).click();
    await expect(detail.getByText('Last known location', { exact: false })).toHaveCount(0);
    await expect(detail.getByText('Arjun Sharma')).toBeVisible(); // header stays

    await detail.getByRole('button', { name: 'Expand details' }).click();
    await expect(detail.getByText('Last known location', { exact: false }).first()).toBeVisible();
  });

  test('closing the card clears the selection and restores the colour key', async ({ page }) => {
    await expect(page.getByText('Location off')).toBeVisible(); // legend, nothing selected
    await page.locator('.lt-row', { hasText: 'Arjun Sharma' }).click();
    await expect(page.getByText('Location off')).toHaveCount(0); // card owns the corner now
    await page.locator('.lt-detail').getByRole('button', { name: 'Close details' }).click();
    await expect(page.locator('.lt-detail')).toHaveCount(0);
    await expect(page.getByText('Location off')).toBeVisible();
  });

  test('the trail CSV is named for the day being viewed, not always today', async ({ page }) => {
    await page.locator('.lt-row', { hasText: 'Arjun Sharma' }).click();
    await page.getByRole('button', { name: 'Yesterday' }).click();

    const chip = page.getByRole('button', { name: /Trail · .* pings/ });
    await expect(chip).toBeVisible(); // label says which day, instead of "Today's trail"
    const [download] = await Promise.all([page.waitForEvent('download'), chip.click()]);

    // Work out the two IST days IN the page, where the clock is pinned — the Node process's real clock can
    // sit on a different IST day than the page's pinned afternoon.
    const [today, yesterday] = await page.evaluate(() => {
      const d = (ago: number) => new Date(Date.now() + 5.5 * 3600_000 - ago * 86_400_000).toISOString().slice(0, 10);
      return [d(0), d(1)];
    });
    expect(download.suggestedFilename()).toContain(yesterday);
    expect(download.suggestedFilename()).not.toContain(today);
  });

  test('the search box leaves room for its icon (a global rule used to crush the padding)', async ({ page }) => {
    const pad = await page.getByLabel('Search field executives').evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    expect(pad).toBeGreaterThanOrEqual(30);
  });
});

test.describe('Live Trailing layout (phone 390x844)', () => {
  test.beforeEach(async ({ page }) => open(page, { width: 390, height: 844 }));

  test('a selected rep still leaves a usable map (was 129px tall)', async ({ page }) => {
    await page.locator('.lt-row', { hasText: 'Arjun Sharma' }).click();
    await expect(page.locator('.lt-detail')).toBeVisible();
    const map = await box(page, '.lt-mapbox');
    expect(map.height).toBeGreaterThanOrEqual(340);
  });

  test('the map comes first, the rep card sits below it (not over it), desktop-only buttons are hidden', async ({ page }) => {
    const list = await box(page, '.lt-sidebar');
    const map = await box(page, '.lt-mapbox');
    expect(map.y).toBeLessThan(list.y);

    await page.locator('.lt-row', { hasText: 'Arjun Sharma' }).click();
    const card = await box(page, '.lt-detail');
    const mapAfter = await box(page, '.lt-mapbox');
    expect(card.y).toBeGreaterThanOrEqual(mapAfter.y + mapAfter.height - 1);

    await expect(page.getByRole('button', { name: /Hide list/ })).toBeHidden();
    await expect(page.getByRole('button', { name: /Fullscreen map/ })).toBeHidden();
  });

  test('the rep list is never stranded hidden when a desktop session shrinks to a phone', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole('button', { name: /Hide list/ }).click();
    await expect(page.locator('.lt-sidebar')).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.lt-sidebar')).toBeVisible();
  });
});
