import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession } from './utils';

/**
 * My account (/dashboard/profile): the signed-in user can change their own password (the server
 * verifies the current one) and upload a profile picture, and both are reachable from Settings.
 */
test.describe('My account', () => {
  type Json = Record<string, unknown>;

  async function open(page: Page, handlers: { onPasswordChange?: (body: Json, route: Route) => Promise<void> | void; patches?: Json[]; uploads?: string[] } = {}) {
    await seedSession(page);
    await mockApi(page, {
      onRequest: async (route, url, method) => {
        const path = url.split('?')[0];
        if (method === 'POST' && path.endsWith('/api/v1/auth/change-password')) {
          const body = route.request().postDataJSON() as Json;
          if (handlers.onPasswordChange) await handlers.onPasswordChange(body, route);
          else await route.fulfill({ json: { success: true, data: { ok: true } } });
          return true;
        }
        if (method === 'POST' && path.endsWith('/api/v1/upload/avatar')) {
          handlers.uploads?.push(route.request().headers()['content-type'] ?? '');
          await route.fulfill({ json: { success: true, data: { url: 'https://example.com/avatars/me.jpg' } } });
          return true;
        }
        if (method === 'PATCH' && path.endsWith('/api/v1/auth/me')) {
          const body = route.request().postDataJSON() as Json;
          handlers.patches?.push(body);
          await route.fulfill({ json: { success: true, data: { id: 'e2e-user-1', avatar_url: body.avatar_url } } });
          return true;
        }
        return false;
      },
    });
    await page.goto('/dashboard/profile');
    await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
  }

  const fill = async (page: Page, current: string, next: string, confirm: string) => {
    await page.getByLabel('Current password').fill(current);
    await page.getByLabel('New password', { exact: true }).fill(next);
    await page.getByLabel('Confirm new password').fill(confirm);
  };

  test('changing the password sends the current and the new one, then clears the form', async ({ page }) => {
    const sent: Json[] = [];
    await open(page, { onPasswordChange: async (body, route) => { sent.push(body); await route.fulfill({ json: { success: true, data: { ok: true } } }); } });

    await fill(page, 'Old-Secret-Value-12', 'Orchid-Lantern-47', 'Orchid-Lantern-47');
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toEqual({ current_password: 'Old-Secret-Value-12', new_password: 'Orchid-Lantern-47' });
    await expect(page.getByLabel('Current password')).toHaveValue('');
    await expect(page.getByLabel('New password', { exact: true })).toHaveValue('');
  });

  test('a wrong current password shows the server message and keeps the form', async ({ page }) => {
    await open(page, {
      onPasswordChange: async (_b, route) => {
        await route.fulfill({ status: 400, json: { success: false, error: 'Your current password is incorrect.', code: 'INVALID_CURRENT_PASSWORD' } });
      },
    });
    await fill(page, 'wrong-password-1', 'Orchid-Lantern-47', 'Orchid-Lantern-47');
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect(page.getByText('Your current password is incorrect.')).toBeVisible();
    await expect(page.getByLabel('New password', { exact: true })).toHaveValue('Orchid-Lantern-47');
  });

  test('the button stays disabled until the form is valid', async ({ page }) => {
    await open(page);
    const submit = page.getByRole('button', { name: 'Update password' });
    await expect(submit).toBeDisabled();

    await fill(page, 'Old-Secret-Value-12', 'short1', 'short1'); // under 10 characters
    await expect(submit).toBeDisabled();

    await fill(page, 'Old-Secret-Value-12', 'Orchid-Lantern-47', 'Orchid-Lantern-48'); // mismatch
    await expect(page.getByText('Passwords do not match.')).toBeVisible();
    await expect(submit).toBeDisabled();

    await fill(page, 'Old-Secret-Value-12', 'Old-Secret-Value-12', 'Old-Secret-Value-12'); // same as current
    await expect(submit).toBeDisabled();

    await fill(page, 'Old-Secret-Value-12', 'Orchid-Lantern-47', 'Orchid-Lantern-47');
    await expect(submit).toBeEnabled();
  });

  test('uploading a picture uploads it and saves it as the profile picture in one step', async ({ page }) => {
    const patches: Json[] = [];
    const uploads: string[] = [];
    await open(page, { patches, uploads });

    // 1x1 transparent PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await page.locator('input[type="file"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });

    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toEqual({ avatar_url: 'https://example.com/avatars/me.jpg' });
    expect(uploads[0]).toContain('multipart/form-data');
    await expect(page.getByRole('button', { name: /Change picture/ })).toBeVisible();
  });

  test('removing the picture clears it on the server', async ({ page }) => {
    const patches: Json[] = [];
    await seedSession(page, { ...(await import('./utils')).SEED_USER, avatar_url: 'https://example.com/avatars/me.jpg' });
    await mockApi(page, {
      me: { success: true, data: { ...(await import('./utils')).SEED_USER, avatar_url: 'https://example.com/avatars/me.jpg' } },
      onRequest: async (route, url, method) => {
        if (method === 'PATCH' && url.split('?')[0].endsWith('/api/v1/auth/me')) {
          patches.push(route.request().postDataJSON() as Json);
          await route.fulfill({ json: { success: true, data: { avatar_url: null } } });
          return true;
        }
        return false;
      },
    });
    await page.goto('/dashboard/profile');
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toEqual({ avatar_url: null });
  });

  test('CRM Settings links to My Account', async ({ page }) => {
    await seedSession(page);
    await mockApi(page);
    await page.goto('/dashboard/crm/settings');
    await page.getByRole('link', { name: /^My Account/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/profile$/);
  });
});
