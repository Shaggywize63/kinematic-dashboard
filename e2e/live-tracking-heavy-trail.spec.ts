import { test, expect, type Page } from '@playwright/test';
import { seedSession, mockApi } from './utils';
import { FAKE_MAPS } from './fakeMaps';

/**
 * Live Trailing froze Rajkamal's browser tab ("Page Unresponsive", again and again): one rep had 2,471
 * pings stored for the day (24 distinct places — an old Android build stored each fix ~100 times) and the
 * page drew a clickable marker for every ping, then tore all of them down and rebuilt them on every
 * 60-second refresh (twice, once more when road-snapping answered).
 *
 * The map must stay light however long the trail is, and a refresh that brings back the same trail must
 * leave the drawn trail alone.
 */
const REP = { id: 'fe-harisha', name: 'Harisha' };
const BASE = Date.parse('2026-10-08T04:30:00.000Z');

/** `n` pings spread over 24 places, ~100 stacked copies each, a few seconds apart (the real shape). */
function stackedTrail(n: number, extra = 0) {
  const rows = Array.from({ length: n }, (_, k) => {
    const place = Math.floor(k / Math.ceil(n / 24));
    return {
      lat: 12.7296 + place * 0.0004, lng: 75.9534 + place * 0.0003, battery_percentage: 55,
      captured_at: new Date(BASE + place * 60_000 + (k % 4) * 1000).toISOString(),
      activity_type: k === 0 ? 'CHECK_IN' : 'HEARTBEAT',
    };
  });
  for (let i = 0; i < extra; i++) {
    rows.push({ lat: 12.74 + i * 0.0004, lng: 75.97, battery_percentage: 54, captured_at: new Date(BASE + (30 + i) * 60_000).toISOString(), activity_type: 'HEARTBEAT' });
  }
  return rows;
}

const gm = <T,>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const PING = `/ping \\d+ of \\d+/.test(m.o.title || '')`;
const liveDots = (page: Page) => gm<number>(page, `window.__gm.markers.filter(m => !m.removed && ${PING}).length`);
const createdDots = (page: Page) => gm<number>(page, `window.__gm.markers.filter(m => ${PING}).length`);
const livePolylines = (page: Page) => gm<number>(page, 'window.__gm.polylines.filter(p => !p.removed).length');
const createdPolylines = (page: Page) => gm<number>(page, 'window.__gm.polylines.length');

/** The page re-requests the trail when its "last synced HH:MM" label changes, so move the browser clock on a
 *  minute before each refresh (Date only — timers keep running). */
let minute = 0;
const nextMinute = (page: Page) => page.clock.setFixedTime(new Date(Date.UTC(2026, 9, 8, 9, 0, 0) + ++minute * 61_000));

/** Press Refresh and wait until the page has synced again (its "Last sync" label moved on). */
async function refresh(page: Page) {
  const label = page.getByText(/Last sync:/);
  const before = await label.textContent();
  await nextMinute(page);
  await page.getByRole('button', { name: /Refresh/ }).click();
  await expect(label).not.toHaveText(before!);
}

async function openHeavyTrail(page: Page, state: { rows: ReturnType<typeof stackedTrail>; trailFetches: number }) {
  await page.clock.setFixedTime(new Date(Date.UTC(2026, 9, 8, 9, 0, 0)));
  minute = 0;
  await page.addInitScript(FAKE_MAPS);
  await seedSession(page);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0];
      if (method !== 'GET') return false;
      if (path.endsWith('/analytics/live-locations')) {
        await route.fulfill({ json: { success: true, data: { locations: [{
          id: REP.id, name: REP.name, role: 'field_executive', status: 'checked_out', lat: 12.7296, lng: 75.9534,
          location_source: 'live', location_captured_at: new Date(BASE).toISOString(), battery_percentage: 55,
        }] } } });
        return true;
      }
      if (path.endsWith(`/users/${REP.id}/location-trail`)) {
        state.trailFetches++;
        await route.fulfill({ json: { success: true, data: state.rows } });
        return true;
      }
      return false;
    },
  });
  await page.goto('/dashboard/live-tracking');
  await expect(page.getByText(/Last sync:/)).toBeVisible(); // first load settled — a late sync would re-request the trail mid-test
  await page.locator('.lt-row', { hasText: REP.name }).click();
  await expect.poll(() => state.trailFetches).toBeGreaterThan(0);
  await expect.poll(() => liveDots(page)).toBeGreaterThan(2);
}

test.describe('Live Trailing with a very long trail', () => {
  test('a 2,471-ping day draws a bounded number of dots, still ends on the first and latest ping', async ({ page }) => {
    const state = { rows: stackedTrail(2471), trailFetches: 0 };
    await openHeavyTrail(page, state);

    expect(await liveDots(page)).toBeLessThanOrEqual(250);
    const titles = await gm<string[]>(page, `window.__gm.markers.filter(m => !m.removed && ${PING}).map(m => m.o.title)`);
    expect(titles.some((t) => /ping 1 of 2471$/.test(t))).toBe(true);
    expect(titles.some((t) => /ping 2471 of 2471$/.test(t))).toBe(true);
    // the line itself still follows every point (glow + main)
    expect(await livePolylines(page)).toBe(2);
    const pathLen = await gm<number>(page, 'window.__gm.polylines.filter(p => !p.removed)[1].o.path.length');
    expect(pathLen).toBe(2471);
  });

  test('a trail within the limit keeps a dot on every ping', async ({ page }) => {
    const state = { rows: stackedTrail(120), trailFetches: 0 };
    await openHeavyTrail(page, state);
    expect(await liveDots(page)).toBe(120);
  });

  test('a refresh that returns the same trail does not rebuild the drawn trail', async ({ page }) => {
    const state = { rows: stackedTrail(2471), trailFetches: 0 };
    await openHeavyTrail(page, state);
    const dotsBefore = await createdDots(page);
    const linesBefore = await createdPolylines(page);
    const fetchesBefore = state.trailFetches;

    await refresh(page);
    await expect.poll(() => state.trailFetches).toBeGreaterThan(fetchesBefore); // the trail WAS re-requested…
    await page.waitForTimeout(800);                                           // …and had time to render

    expect(await createdDots(page)).toBe(dotsBefore);       // …but not one new dot was built
    expect(await createdPolylines(page)).toBe(linesBefore); // …nor a new polyline
    expect(await liveDots(page)).toBeLessThanOrEqual(250);
  });

  test('a genuinely new ping does redraw the trail (and retires the old overlay)', async ({ page }) => {
    const state = { rows: stackedTrail(300), trailFetches: 0 };
    await openHeavyTrail(page, state);
    const dotsBefore = await createdDots(page);

    state.rows = stackedTrail(300, 1); // the rep reported once more
    const fetchesBefore = state.trailFetches;
    await refresh(page);
    await expect.poll(() => state.trailFetches).toBeGreaterThan(fetchesBefore);
    await expect.poll(() => createdDots(page)).toBeGreaterThan(dotsBefore);

    expect(await livePolylines(page)).toBe(2); // old glow+main removed, new ones drawn
    const titles = await gm<string[]>(page, `window.__gm.markers.filter(m => !m.removed && ${PING}).map(m => m.o.title)`);
    expect(titles.some((t) => /ping 301 of 301$/.test(t))).toBe(true);
    expect(titles.some((t) => /of 300$/.test(t))).toBe(false); // no stale dots from the previous trail
  });
});
