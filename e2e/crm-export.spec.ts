import { test, expect, type Route } from '@playwright/test';
import { seedSession, mockApi } from './utils';
import { readFileSync } from 'fs';

/**
 * CRM list "Export" buttons (Leads, Deals, Activities).
 *
 * These used a hand-rolled fetch that sent the raw stored token and no
 * X-Kinematic-Project header, so for a tenant on a non-default project the
 * server verified the token against the wrong database and the export failed
 * every time — "Export failed: Invalid or expired token" (Leads) / "HTTP 401"
 * (Activities). They now go through api.download, which sends the project
 * header and renews an expired token once and retries.
 */
const STALE = 'e2e-token';   // what seedSession() stores
const FRESH = 'fresh-token'; // what /auth/refresh returns
const CSV = 'name,status\nAsha,open\nRavi,won\n';

const PAGES = [
  { key: 'leads', url: '/dashboard/crm/leads', button: { name: 'Export', exact: true }, file: /^leads-\d{4}-\d{2}-\d{2}\.csv$/ },
  { key: 'deals', url: '/dashboard/crm/deals', button: { name: /Export CSV/ }, file: /^deals-\d{4}-\d{2}-\d{2}\.csv$/ },
  { key: 'activities', url: '/dashboard/crm/activities', button: { name: /Export CSV/ }, file: /^activities-\d{4}-\d{2}-\d{2}\.csv$/ },
] as const;

type Seen = { auth?: string; project?: string; org?: string };

for (const pg of PAGES) {
  test.describe(`${pg.key} export`, () => {
    test.beforeEach(async ({ page }) => {
      await seedSession(page);
      await page.addInitScript(() => {
        window.localStorage.setItem('kinematic_refresh_token', 'e2e-refresh');
        // A Kinematic-project tenant: the dashboard stores its project at login.
        window.localStorage.setItem('kinematic_supabase_project', 'kinematic');
      });
    });

    const handler = (seen: Seen[], reply: (route: Route, h: Record<string, string>) => Promise<void>) =>
      async (route: Route, url: string, method: string) => {
        const path = url.split('?')[0];
        if (method === 'POST' && path.endsWith('/api/v1/auth/refresh')) {
          await route.fulfill({ json: { success: true, data: { access_token: FRESH, refresh_token: 'e2e-refresh-2', expires_at: Math.floor(Date.now() / 1000) + 3600 } } });
          return true;
        }
        if (method === 'GET' && path.endsWith(`/api/v1/crm/${pg.key}/export`)) {
          const h = route.request().headers();
          seen.push({ auth: h['authorization'], project: h['x-kinematic-project'], org: h['x-org-id'] });
          await reply(route, h);
          return true;
        }
        return false;
      };

    test('downloads the CSV: sends the project header and recovers from an expired token', async ({ page }) => {
      const seen: Seen[] = [];
      await mockApi(page, {
        // Mimic the real server: only the right project + a live token is accepted.
        onRequest: handler(seen, async (route, h) => {
          if (h['x-kinematic-project'] !== 'kinematic' || h['authorization'] !== `Bearer ${FRESH}`) {
            await route.fulfill({ status: 401, json: { success: false, error: 'Invalid or expired token' } });
            return;
          }
          await route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body: CSV });
        }),
      });

      await page.goto(pg.url);
      const button = page.getByRole('button', pg.button);
      await expect(button).toBeVisible();
      const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);

      expect(download.suggestedFilename()).toMatch(pg.file);
      expect(readFileSync((await download.path())!, 'utf8')).toBe(CSV);
      // First try used the expired token, the replay the renewed one — project header on both.
      expect(seen.map((s) => s.auth)).toEqual([`Bearer ${STALE}`, `Bearer ${FRESH}`]);
      expect(seen.every((s) => s.project === 'kinematic')).toBe(true);
      expect(seen.every((s) => s.org === 'e2e-org-1')).toBe(true);
    });

    test('a server-side rejection is reported with its reason and nothing is downloaded', async ({ page }) => {
      const seen: Seen[] = [];
      await mockApi(page, {
        onRequest: handler(seen, async (route) => {
          await route.fulfill({ status: 403, json: { success: false, error: 'Forbidden: admin only' } });
        }),
      });

      let downloaded = false;
      page.on('download', () => { downloaded = true; });
      await page.goto(pg.url);
      const button = page.getByRole('button', pg.button);
      await expect(button).toBeVisible();
      await button.click();

      await expect(page.getByText('Export failed: Forbidden: admin only')).toBeVisible();
      expect(downloaded).toBe(false);
      expect(seen).toHaveLength(1);
    });
  });
}
