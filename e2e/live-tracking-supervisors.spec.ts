import { test, expect } from '@playwright/test';
import { seedSession, mockApi } from './utils';
import { FAKE_MAPS } from './fakeMaps';

/**
 * Live Trailing lists field reps AND the people above them (supervisors, city / territory managers). The page used to
 * keep the "supervisors" group permanently switched off, so a manager on a role like `city_manager` (e.g. Agrisynx's
 * Hariom Patidar) never showed up for anyone, even the client's admin. They are on by default now, with a toolbar pill.
 */
const iso = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

async function open(page: import('@playwright/test').Page) {
  await page.addInitScript(FAKE_MAPS);
  await seedSession(page);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      if (method === 'GET' && url.split('?')[0].endsWith('/analytics/live-locations')) {
        await route.fulfill({ json: { success: true, data: { locations: [
          { id: 'r1', name: 'Radhakishan Rep', role: 'executive', status: 'active', lat: 22.72, lng: 75.86, location_source: 'live', location_captured_at: iso(2), last_location_updated_at: iso(2), battery_percentage: 70 },
          { id: 'm1', name: 'Hariom Patidar', role: 'city_manager', status: 'active', lat: 23.088, lng: 75.158, location_source: 'live', location_captured_at: iso(3), last_location_updated_at: iso(3), battery_percentage: 84, zone_name: 'Ujjain' },
          { id: 's1', name: 'Ujjval Trivedi', role: 'supervisor', status: 'checked_out', lat: 22.7, lng: 75.8, location_source: 'checkin', last_location_updated_at: iso(300) },
          { id: 'a1', name: 'Some Client Account', role: 'client', status: 'absent', lat: null, lng: null },
        ] } } });
        return true;
      }
      return false;
    },
  });
  await page.goto('/dashboard/live-tracking');
}

test.describe('Live Trailing — supervisors and city managers', () => {
  test('a city manager is listed and on the map, labelled with what they are', async ({ page }) => {
    await open(page);
    await expect(page.locator('.lt-row', { hasText: 'Radhakishan Rep' })).toBeVisible();
    const hariom = page.locator('.lt-row', { hasText: 'Hariom Patidar' });
    await expect(hariom).toBeVisible();
    await expect(hariom).toContainText('City Manager');
    await expect(page.locator('.lt-row', { hasText: 'Ujjval Trivedi' })).toContainText('Supervisor');
    await expect(page.getByText('Supervisors (2)')).toBeVisible();      // city manager + supervisor, not the client account
    await expect(page.locator('.lt-row', { hasText: 'Some Client Account' })).toHaveCount(0);

    await hariom.click();
    await expect.poll(() => page.evaluate('window.__gm.info.content')).toContain('Hariom Patidar');
    expect(await page.evaluate('window.__gm.info.content') as string).toContain('City Manager');
  });

  test('the Supervisors pill hides and shows them without touching the field reps', async ({ page }) => {
    await open(page);
    const pill = page.getByRole('button', { name: /Supervisors\s*2/ });
    await expect(pill).toHaveAttribute('aria-pressed', 'true');
    await pill.click();
    await expect(pill).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.lt-row', { hasText: 'Hariom Patidar' })).toHaveCount(0);
    await expect(page.locator('.lt-row', { hasText: 'Radhakishan Rep' })).toBeVisible();
    await pill.click();
    await expect(page.locator('.lt-row', { hasText: 'Hariom Patidar' })).toBeVisible();
  });

  test('a client with no supervisors sees no pill', async ({ page }) => {
    await page.addInitScript(FAKE_MAPS);
    await seedSession(page);
    await mockApi(page, {
      onRequest: async (route, url, method) => {
        if (method === 'GET' && url.split('?')[0].endsWith('/analytics/live-locations')) {
          await route.fulfill({ json: { success: true, data: { locations: [
            { id: 'r1', name: 'Only Rep', role: 'executive', status: 'active', lat: 12.9, lng: 77.6, location_source: 'live', location_captured_at: iso(1), last_location_updated_at: iso(1) },
          ] } } });
          return true;
        }
        return false;
      },
    });
    await page.goto('/dashboard/live-tracking');
    await expect(page.locator('.lt-row', { hasText: 'Only Rep' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Supervisors/ })).toHaveCount(0);
  });
});
