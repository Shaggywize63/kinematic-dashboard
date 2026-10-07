import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession } from './utils';

/**
 * A mobile number is optional when creating a user (CRM → Settings → Team Members).
 * A person still needs one of mobile / email to sign in, and a mobile that is given is sent
 * (and still has to be 10 digits server-side). The page must not invent a "<mobile>@kinematic.app"
 * email when there is no mobile, and must not send an empty mobile.
 */
test.describe('Create user without a mobile number', () => {
  type Posted = Record<string, unknown>;

  async function open(page: Page, posted: Posted[]) {
    await seedSession(page);
    await mockApi(page, {
      onRequest: async (route, url, method) => {
        const path = url.split('?')[0];
        // The hierarchy-role list comes back as a bare array (not wrapped in { data }).
        if (method === 'GET' && path.endsWith('/api/v1/roles')) {
          await route.fulfill({ json: [] });
          return true;
        }
        if (method === 'POST' && path.endsWith('/api/v1/users')) {
          posted.push(route.request().postDataJSON() as Posted);
          await route.fulfill({ json: { success: true, data: { id: 'new-user' } } });
          return true;
        }
        return false;
      },
    });
    await page.goto('/dashboard/crm/settings/users');
    await page.getByRole('button', { name: '+ Add User' }).click();
    await expect(page.getByText('New User')).toBeVisible();
  }

  test('a name and an email are enough — no mobile is sent', async ({ page }) => {
    const posted: Posted[] = [];
    await open(page, posted);

    await expect(page.getByText('Mobile (optional)')).toBeVisible();
    await page.getByPlaceholder('e.g. Rahul Sharma').fill('Ujjval Trivedi');
    await page.getByPlaceholder('needed if there is no mobile').fill('ujjval@example.com');
    await page.getByPlaceholder('Minimum 10 characters').fill('Agrisynx@2026');
    await page.getByRole('button', { name: 'Create User' }).click();

    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0].email).toBe('ujjval@example.com');
    expect(posted[0]).not.toHaveProperty('mobile');
    expect(String(posted[0].email)).not.toContain('@kinematic.app');
  });

  test('a name and a mobile are enough — the sign-in email is derived from the mobile', async ({ page }) => {
    const posted: Posted[] = [];
    await open(page, posted);

    await page.getByPlaceholder('e.g. Rahul Sharma').fill('Rahul Sharma');
    await page.getByPlaceholder('10-digit mobile').fill('9876543210');
    await page.getByPlaceholder('Minimum 10 characters').fill('Agrisynx@2026');
    await page.getByRole('button', { name: 'Create User' }).click();

    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0].mobile).toBe('9876543210');
    expect(posted[0].email).toBe('9876543210@kinematic.app');
  });

  test('neither a mobile nor an email is refused, and nothing is sent', async ({ page }) => {
    const posted: Posted[] = [];
    await open(page, posted);

    await page.getByPlaceholder('e.g. Rahul Sharma').fill('No Contact');
    await page.getByPlaceholder('Minimum 10 characters').fill('Agrisynx@2026');
    await page.getByRole('button', { name: 'Create User' }).click();

    await expect(page.getByText('Name and either a mobile number or an email are required')).toBeVisible();
    expect(posted).toHaveLength(0);
  });
});
