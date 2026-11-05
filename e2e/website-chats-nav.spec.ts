import { test, expect } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * "Website Chats" is a platform-operator surface: a super admin sees it, but not while viewing AS a client
 * (Client Management -> Login) or as a user.
 */
const setup = async (page: import('@playwright/test').Page) => {
  await seedSession(page, SEED_USER);
  await mockApi(page, { me: { success: true, data: SEED_USER } });
};

test('a super admin sees Website Chats in the sidebar', async ({ page }) => {
  await setup(page);
  await page.goto('/dashboard/crm');
  await expect(page.getByRole('link', { name: /Website Chats/ }).first()).toBeVisible({ timeout: 30_000 });
});

test('while viewing as a client, Website Chats (and Conversations) are gone', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('kinematic_acting_as', JSON.stringify({ org_id: 'e2e-org-1', client_id: 'c0218852-0a19-4dd0-b9fa-72f9e32ed0d8', token: 'impersonation-token', name: 'Spark and Ray' }));
  });
  await page.goto('/dashboard/crm');
  // The rest of the CRM navigation is there…
  await expect(page.getByRole('link', { name: /Leads/ }).first()).toBeVisible({ timeout: 30_000 });
  // …but not the operator-only surfaces.
  await expect(page.getByRole('link', { name: /Website Chats/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Conversations$/ })).toHaveCount(0);
});
