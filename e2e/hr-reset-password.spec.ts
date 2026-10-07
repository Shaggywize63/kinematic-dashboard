import { test, expect, type Route } from '@playwright/test';
import { seedSession, mockApi } from './utils';

/**
 * HR → Team Directory → Reset password.
 *
 * The page used to POST with a hand-rolled fetch carrying a login token it had
 * snapshotted when it rendered. Once the access token had been renewed (or had
 * expired) that call failed with "Invalid or expired token" and never recovered.
 * It now goes through the shared client, which sends the CURRENT token, renews
 * it on a 401 and replays the request.
 */
const USER = {
  id: 'u-ramjan-1', org_id: 'e2e-org-1', client_id: 'c-tms', name: 'Ramjan Shaikh',
  email: 'ramjanshaikh921@gmail.com', role: 'executive', mobile: '9000000001', is_active: true,
  employee_id: 'TMS-014',
};
const STALE = 'e2e-token';          // what seedSession() puts in localStorage
const FRESH = 'fresh-token';        // what /auth/refresh hands back

test.describe('HR reset password', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page);
    await page.addInitScript(() => window.localStorage.setItem('kinematic_refresh_token', 'e2e-refresh'));
  });

  type Call = { auth: string | undefined; body: unknown; project: string | undefined };

  const handler = (
    resets: Call[],
    reply: (route: Route, auth: string | undefined) => Promise<void>,
    refreshes: string[] = [],
  ) => async (route: Route, url: string, method: string) => {
    const path = url.split('?')[0];
    if (method === 'GET' && path.endsWith('/api/v1/users')) {
      await route.fulfill({ json: { success: true, data: [USER] } });
      return true;
    }
    if (method === 'POST' && path.endsWith('/api/v1/auth/refresh')) {
      refreshes.push(route.request().postData() || '');
      await route.fulfill({ json: { success: true, data: { access_token: FRESH, refresh_token: 'e2e-refresh-2', expires_at: Math.floor(Date.now() / 1000) + 3600 } } });
      return true;
    }
    if (method === 'POST' && path.endsWith(`/api/v1/users/${USER.id}/reset-password`)) {
      const h = route.request().headers();
      resets.push({ auth: h['authorization'], body: route.request().postDataJSON(), project: h['x-kinematic-project'] });
      await reply(route, h['authorization']);
      return true;
    }
    return false;
  };

  const openResetModal = async (page: import('@playwright/test').Page) => {
    await page.goto('/dashboard/hr');
    await expect(page.getByText('Ramjan Shaikh')).toBeVisible();
    await page.locator('button[title="Reset password"]').first().click();
    await expect(page.getByPlaceholder('Enter new password…')).toBeVisible();
  };

  test('a stale login token is renewed and the reset still succeeds', async ({ page }) => {
    const resets: Call[] = [];
    const refreshes: string[] = [];
    await mockApi(page, {
      onRequest: handler(resets, async (route, auth) => {
        if (auth !== `Bearer ${FRESH}`) {
          await route.fulfill({ status: 401, json: { success: false, error: 'Invalid or expired token' } });
          return;
        }
        await route.fulfill({ json: { success: true, data: { message: 'Password reset' } } });
      }, refreshes),
    });

    await openResetModal(page);
    await page.getByPlaceholder('Enter new password…').fill('Tms@2026');
    await page.getByRole('button', { name: /Reset Password/ }).click();

    await expect(page.getByText('✓ Password reset!')).toBeVisible();
    await expect(page.getByText('Invalid or expired token')).toHaveCount(0);

    // First attempt carried the stale token, the replay carried the renewed one.
    expect(resets.map((r) => r.auth)).toEqual([`Bearer ${STALE}`, `Bearer ${FRESH}`]);
    expect(resets.every((r) => (r.body as { password: string }).password === 'Tms@2026')).toBe(true);
    expect(refreshes).toHaveLength(1);
    expect(JSON.parse(refreshes[0])).toEqual({ refresh_token: 'e2e-refresh' });
  });

  test('sends the tenant project header for a non-default project', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('kinematic_supabase_project', 'kinematic'));
    const resets: Call[] = [];
    await mockApi(page, {
      onRequest: handler(resets, async (route) => {
        await route.fulfill({ json: { success: true, data: { message: 'Password reset' } } });
      }),
    });

    await openResetModal(page);
    await page.getByPlaceholder('Enter new password…').fill('Tms@2026');
    await page.getByRole('button', { name: /Reset Password/ }).click();

    await expect(page.getByText('✓ Password reset!')).toBeVisible();
    expect(resets).toHaveLength(1);
    expect(resets[0].project).toBe('kinematic');
  });

  test('a server-side rejection is shown, not swallowed', async ({ page }) => {
    const resets: Call[] = [];
    await mockApi(page, {
      onRequest: handler(resets, async (route) => {
        await route.fulfill({ status: 403, json: { success: false, error: 'Only HR and admins can reset passwords' } });
      }),
    });

    await openResetModal(page);
    await page.getByPlaceholder('Enter new password…').fill('Tms@2026');
    await page.getByRole('button', { name: /Reset Password/ }).click();

    await expect(page.getByText('Only HR and admins can reset passwords')).toBeVisible();
    await expect(page.getByText('✓ Password reset!')).toHaveCount(0);
    expect(resets).toHaveLength(1);
  });
});
