import { test, expect, type Page } from '@playwright/test';
import { demoLogin } from './utils';
import { FAKE_MAPS } from './fakeMaps';

/**
 * Live Trailing MAP behaviour, against a minimal in-page stand-in for the
 * Google Maps JS SDK (the real one needs a billed key + network). The stand-in
 * records what the page asks of it, so these tests pin down the things that
 * kept going wrong on the real map: no place names when zoomed in, a pin that
 * didn't say where the rep is, and the 60s refresh undoing the user's zoom.
 */

const gm = <T,>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;

test.describe('Live Trailing map (stand-in Maps SDK)', () => {
  test.beforeEach(async ({ page }) => {
    // The demo trail is generated from the wall clock (pings every 10 min from
    // ~09:10 up to "now"), so at night it collapses to a single ping and the
    // trail tests would fail depending on WHEN CI runs. Pin the browser's clock
    // to mid-afternoon on the same day: Date only — timers keep running.
    const afternoon = new Date();
    afternoon.setHours(14, 30, 0, 0);
    await page.clock.setFixedTime(afternoon);
    await page.addInitScript(FAKE_MAPS);
    await demoLogin(page);
    await page.goto('/dashboard/live-tracking');
    await expect.poll(() => gm<number>(page, 'window.__gm.markers.length')).toBeGreaterThan(0);
  });

  test('selecting a rep opens a popup with the place name, exact coordinates and a Maps link', async ({ page }) => {
    await page.locator('.lt-row', { hasText: 'Arjun Sharma' }).click();
    await expect.poll(() => gm<string>(page, 'window.__gm.info.content')).toContain('Koramangala');
    const html = await gm<string>(page, 'window.__gm.info.content');
    expect(html).toContain('Plot 7, 80 Feet Rd, Koramangala, Bengaluru');
    expect(html).toContain('12.935200, 77.624500');
    expect(html).toContain('Arjun Sharma');
    expect(html).toContain('google.com/maps?q=12.9352%2C77.6245');
  });

  test('the sidebar row resolves the short place name', async ({ page }) => {
    await expect(page.locator('.lt-row', { hasText: 'Arjun Sharma' })).toContainText('80 Feet Road, Koramangala, Bengaluru');
  });

  test('every ping on the trail is clickable and reports its exact time and place', async ({ page }) => {
    await page.locator('.lt-row', { hasText: 'Arjun Sharma' }).click();
    // Wait for the demo trail to draw its ping markers (they carry a "ping N of M" title).
    await expect.poll(() => gm<number>(page, `window.__gm.markers.filter(m => !m.removed && /ping \\d+ of \\d+/.test(m.o.title || '')).length`)).toBeGreaterThan(2);

    const clickable = await gm<boolean>(page, `window.__gm.markers.filter(m => !m.removed && /ping \\d+ of \\d+/.test(m.o.title || '')).every(m => m.o.clickable === true)`);
    expect(clickable).toBe(true);

    // Click the latest ping.
    await page.evaluate(`(() => { const p = window.__gm.markers.filter(m => !m.removed && /ping \\d+ of \\d+/.test(m.o.title || '')); p[p.length - 1].fire('click'); })()`);
    await expect.poll(() => gm<string>(page, 'window.__gm.info.content')).toContain('Latest ping');
    const html = await gm<string>(page, 'window.__gm.info.content');
    expect(html).toMatch(/\d{2}:\d{2}:\d{2} (AM|PM|am|pm)/);
    expect(html).toContain('IST');
    await expect.poll(() => gm<string>(page, 'window.__gm.info.content')).toContain('Koramangala');
  });

  test('zooming in switches on place-name labels; zooming out restores the quiet overview', async ({ page }) => {
    const poiLabelsOn = (styles: string) => `(${styles}).some(r => r.featureType === 'poi' && r.elementType === 'labels.text.fill')`;
    const poiHidden = (styles: string) => `(${styles}).some(r => r.featureType === 'poi' && !r.elementType && r.stylers.some(s => s.visibility === 'off'))`;

    // Overview: POIs hidden, no POI label style.
    expect(await gm<boolean>(page, poiHidden('window.__gm.styles[window.__gm.styles.length - 1]'))).toBe(true);
    expect(await gm<boolean>(page, poiLabelsOn('window.__gm.styles[window.__gm.styles.length - 1]'))).toBe(false);

    await page.evaluate('window.__gm.map.setZoom(16)');
    expect(await gm<boolean>(page, poiLabelsOn('window.__gm.styles[window.__gm.styles.length - 1]'))).toBe(true);
    expect(await gm<boolean>(page, poiHidden('window.__gm.styles[window.__gm.styles.length - 1]'))).toBe(false);

    await page.evaluate('window.__gm.map.setZoom(10)');
    expect(await gm<boolean>(page, poiHidden('window.__gm.styles[window.__gm.styles.length - 1]'))).toBe(true);
  });

  test('a data refresh keeps the zoom the user chose and keeps the popup open', async ({ page }) => {
    await page.locator('.lt-row', { hasText: 'Arjun Sharma' }).click();
    await expect.poll(() => gm<string>(page, 'window.__gm.info.content')).toContain('Koramangala');
    await expect.poll(() => gm<number>(page, `window.__gm.markers.filter(m => !m.removed && /ping \\d+ of \\d+/.test(m.o.title || '')).length`)).toBeGreaterThan(2);

    // The user zooms in to read street names…
    await page.evaluate('window.__gm.map.setZoom(18)');
    const before = await page.evaluate('({ fit: window.__gm.fit, zooms: window.__gm.zooms.length, opens: window.__gm.opens })') as { fit: number; zooms: number; opens: number };

    // …then the 60s auto-refresh fires (same code path as the Refresh button).
    await page.getByRole('button', { name: /Refresh/ }).click();
    await expect.poll(() => gm<number>(page, 'window.__gm.opens')).toBeGreaterThan(before.opens); // popup re-opened on the new marker

    const after = await page.evaluate('({ fit: window.__gm.fit, zooms: window.__gm.zooms.length, zoom: window.__gm.map.zoom, open: !!window.__gm.info.at })') as { fit: number; zooms: number; zoom: number; open: boolean };
    expect(after.fit).toBe(before.fit);          // no re-fit of the viewport
    expect(after.zooms).toBe(before.zooms);      // no programmatic zoom change
    expect(after.zoom).toBe(18);                 // the user's zoom survived
    expect(after.open).toBe(true);               // popup still showing
  });

  test('a popup the user closed stays closed through a refresh', async ({ page }) => {
    await page.locator('.lt-row', { hasText: 'Arjun Sharma' }).click();
    await expect.poll(() => gm<boolean>(page, '!!window.__gm.info.at')).toBe(true);
    await page.evaluate("window.__gm.info.at = null; window.__gm.info.fire('closeclick')");
    const opens = await gm<number>(page, 'window.__gm.opens');
    await page.getByRole('button', { name: /Refresh/ }).click();
    await page.waitForTimeout(600);
    expect(await gm<number>(page, 'window.__gm.opens')).toBe(opens);
    expect(await gm<boolean>(page, '!!window.__gm.info.at')).toBe(false);
  });
});
