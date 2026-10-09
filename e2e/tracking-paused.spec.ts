import { test, expect } from '@playwright/test';
import { seedSession, mockApi } from './utils';
import { FAKE_MAPS } from './fakeMaps';
import { trackingPausedMinutes, trackingPausedText, fmtSilence, TRACKING_PAUSED_AFTER_MIN } from '../src/lib/trackingPaused';

/**
 * A rep's phone can stop reporting (battery saver, app closed by the phone, no signal) and their pin then just
 * says "30m ago". Live Trailing now says what is happening: "Tracking paused". Only for someone who is on shift,
 * whose last fix was a real GPS ping, and who has been silent for two missed reports.
 */
const NOW = Date.parse('2026-10-09T06:30:00Z');
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

test.describe('trackingPausedMinutes', () => {
  test('on shift and silent for 25+ minutes is paused', () => {
    expect(trackingPausedMinutes({ status: 'active', location_source: 'live', location_captured_at: minsAgo(30) }, NOW)).toBe(30);
    expect(trackingPausedMinutes({ status: 'on_break', last_location_updated_at: minsAgo(68) }, NOW)).toBe(68);
    expect(trackingPausedMinutes({ status: 'active', location_captured_at: minsAgo(TRACKING_PAUSED_AFTER_MIN) }, NOW)).toBe(TRACKING_PAUSED_AFTER_MIN);
  });

  test('a phone that reported recently is not paused (one missed 10-minute report is normal)', () => {
    expect(trackingPausedMinutes({ status: 'active', location_captured_at: minsAgo(3) }, NOW)).toBeNull();
    expect(trackingPausedMinutes({ status: 'active', location_captured_at: minsAgo(TRACKING_PAUSED_AFTER_MIN - 1) }, NOW)).toBeNull();
  });

  test('silence is expected when the rep is off shift', () => {
    expect(trackingPausedMinutes({ status: 'checked_out', location_captured_at: minsAgo(300) }, NOW)).toBeNull();
    expect(trackingPausedMinutes({ status: 'absent', location_captured_at: minsAgo(300) }, NOW)).toBeNull();
  });

  test('a check-in point or zone pin has no live fix to be stale', () => {
    expect(trackingPausedMinutes({ status: 'active', location_source: 'checkin', location_captured_at: minsAgo(300) }, NOW)).toBeNull();
    expect(trackingPausedMinutes({ status: 'active', location_source: 'zone' }, NOW)).toBeNull();
  });

  test('a phone that says its location is switched off keeps its own, more specific message', () => {
    for (const s of ['services_off', 'denied', 'restricted']) {
      expect(trackingPausedMinutes({ status: 'active', location_status: s, location_captured_at: minsAgo(90) }, NOW)).toBeNull();
    }
    expect(trackingPausedMinutes({ status: 'active', location_status: 'on', location_captured_at: minsAgo(90) }, NOW)).toBe(90);
  });

  test('no timestamp or a bad one is never "paused"', () => {
    expect(trackingPausedMinutes({ status: 'active' }, NOW)).toBeNull();
    expect(trackingPausedMinutes({ status: 'active', location_captured_at: 'nonsense' }, NOW)).toBeNull();
  });

  test('wording', () => {
    expect(fmtSilence(30)).toBe('30 min');
    expect(fmtSilence(68)).toBe('1 h 8 min');
    expect(fmtSilence(120)).toBe('2 h');
    expect(trackingPausedText(45)).toMatch(/^Tracking paused — no location from this phone for 45 min/);
  });
});

test.describe('Live Trailing (stand-in Maps SDK)', () => {
  test('a silent rep is flagged in the list and the popup; a reporting rep is not', async ({ page }) => {
    const now = Date.now();
    const iso = (m: number) => new Date(now - m * 60_000).toISOString();
    await page.addInitScript(FAKE_MAPS);
    await seedSession(page);
    await mockApi(page, {
      onRequest: async (route, url, method) => {
        if (method === 'GET' && url.split('?')[0].endsWith('/analytics/live-locations')) {
          await route.fulfill({ json: { success: true, data: { locations: [
            { id: 'r1', name: 'Quiet Rep', role: 'field_executive', status: 'active', lat: 12.7588, lng: 75.9744, location_source: 'live', location_captured_at: iso(42), last_location_updated_at: iso(42), battery_percentage: 15 },
            { id: 'r2', name: 'Fresh Rep', role: 'field_executive', status: 'active', lat: 12.93, lng: 77.62, location_source: 'live', location_captured_at: iso(2), last_location_updated_at: iso(2), battery_percentage: 80 },
          ] } } });
          return true;
        }
        return false;
      },
    });
    await page.goto('/dashboard/live-tracking');
    const quiet = page.locator('.lt-row', { hasText: 'Quiet Rep' });
    const fresh = page.locator('.lt-row', { hasText: 'Fresh Rep' });
    await expect(quiet).toContainText('tracking paused');
    await expect(fresh).not.toContainText('tracking paused');

    await quiet.click();
    await expect.poll(() => page.evaluate('window.__gm.info.content')).toContain('Tracking paused');
    const html = await page.evaluate('window.__gm.info.content') as string;
    expect(html).toMatch(/no location from this phone for 4\d min/);
    expect(html).toContain('Quiet Rep');

    await fresh.click();
    await expect.poll(() => page.evaluate('window.__gm.info.content')).toContain('Fresh Rep');
    expect(await page.evaluate('window.__gm.info.content') as string).not.toContain('Tracking paused');
  });
});
