import { test, expect, type Page } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * Live Trailing MAP behaviour, against a minimal in-page stand-in for the
 * Google Maps JS SDK (the real one needs a billed key + network). The stand-in
 * records what the page asks of it, so these tests pin down the things that
 * kept going wrong on the real map: no place names when zoomed in, a pin that
 * didn't say where the rep is, and the 60s refresh undoing the user's zoom.
 */
const FAKE_MAPS = `
(() => {
  const gm = { map: null, markers: [], info: null, fit: 0, zooms: [], styles: [], opens: 0, geocodes: [] };
  window.__gm = gm;
  class Evented {
    constructor() { this._l = {}; }
    addListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); return { remove() {} }; }
    fire(ev, ...a) { (this._l[ev] || []).forEach((f) => f(...a)); }
  }
  class Map extends Evented {
    constructor(el, o) { super(); this.o = o; this.zoom = o.zoom; this.center = o.center; gm.map = this; gm.styles.push(o.styles); }
    setOptions(o) { if (o.styles) gm.styles.push(o.styles); }
    getZoom() { return this.zoom; }
    setZoom(z) { this.zoom = z; gm.zooms.push(z); this.fire('zoom_changed'); }
    setCenter(c) { this.center = c; }
    fitBounds() { gm.fit++; }
  }
  class Marker extends Evented {
    constructor(o) { super(); this.o = o; this.removed = false; gm.markers.push(this); }
    setMap(m) { if (!m) this.removed = true; }
    getPosition() { return this.o.position; }
  }
  class InfoWindow extends Evented {
    constructor() { super(); gm.info = this; this.content = ''; this.at = null; }
    setContent(c) { this.content = c; }
    open(map, m) { this.at = m; gm.opens++; }
    close() { this.at = null; }
  }
  class LatLngBounds {
    constructor() { this.p = []; }
    extend(p) { this.p.push(p); }
    _b() { const la = this.p.map((x) => x.lat || x.lat()), ln = this.p.map((x) => x.lng || x.lng());
      return { n: Math.max(...la), s: Math.min(...la), e: Math.max(...ln), w: Math.min(...ln) }; }
    getNorthEast() { const b = this._b(); return { lat: b.n, lng: b.e, equals: (o) => o.lat === b.n && o.lng === b.e }; }
    getSouthWest() { const b = this._b(); return { lat: b.s, lng: b.w }; }
    getCenter() { const b = this._b(); return { lat: (b.n + b.s) / 2, lng: (b.e + b.w) / 2 }; }
  }
  class Polyline { constructor() {} setMap() {} }
  class DirectionsService { route(_r, cb) { cb(null, 'ZERO_RESULTS'); } }
  class Geocoder {
    async geocode({ location }) {
      gm.geocodes.push(location);
      return { results: [{
        formatted_address: 'Plot 7, 80 Feet Rd, Koramangala, Bengaluru, Karnataka 560034, India',
        types: ['street_address'],
        address_components: [
          { long_name: '80 Feet Road', types: ['route'] },
          { long_name: 'Koramangala', types: ['sublocality_level_1', 'sublocality'] },
          { long_name: 'Bengaluru', types: ['locality'] },
        ],
      }] };
    }
  }
  window.google = { maps: {
    Map, Marker, InfoWindow, LatLngBounds, Polyline, DirectionsService, Geocoder,
    SymbolPath: { CIRCLE: 0 }, ControlPosition: { RIGHT_BOTTOM: 1 }, TravelMode: { DRIVING: 'DRIVING' },
    event: { trigger() {} },
    importLibrary: async (name) => (name === 'geocoding' ? { Geocoder } : {}),
  } };
})();
`;

const gm = <T,>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;

test.describe('Live Trailing map (stand-in Maps SDK)', () => {
  test.beforeEach(async ({ page }) => {
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
