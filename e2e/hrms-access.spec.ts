import { test, expect } from '@playwright/test';
import { demoLogin, mockApi, seedSession, SEED_USER } from './utils';
import { MASTER_USER, openHrms } from './hrms-utils';

/** HRMS is a preview on sample data: only the master admin may see it, in the sidebar and by deep link. */

const OTHER_ADMIN = { ...SEED_USER, email: 'someone.else@kinematicapp.com', name: 'Another Admin', role: 'super_admin' };
// The master admin viewing AS a client: the stored user is the client's, and the real caller is recorded on it.
const MASTER_VIEWING_AS_CLIENT = { ...SEED_USER, email: 'owner@acme.test', name: 'Acme Owner', role: 'admin', client_id: 'c1', impersonated_by: { email: 's@kinematicapp.com' } };

const bounced = async (page: import('@playwright/test').Page) => {
  await page.waitForURL(/\/dashboard$/, { timeout: 45_000 });
  await expect(page.getByTestId('hrms-preview-banner')).toHaveCount(0);
};

test.describe('who can see HRMS', () => {
  test('the master admin sees the HRMS groups in the sidebar and can open the overview', async ({ page }) => {
    await seedSession(page, MASTER_USER);
    await mockApi(page, { me: { success: true, data: MASTER_USER } });
    await page.goto('/dashboard');
    await expect(page.getByText('HRMS (Preview)')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('HRMS · Field force')).toBeVisible();
    await openHrms(page);
    await expect(page.getByTestId('hrms-preview-banner')).toBeVisible();
  });

  test('the demo account no longer sees HRMS, and a deep link bounces it', async ({ page }) => {
    await demoLogin(page);
    await expect(page.getByText('HRMS (Preview)')).toHaveCount(0);
    await page.goto('/dashboard/hrms');
    await bounced(page);
  });

  test('another admin does not see it, and a deep link bounces', async ({ page }) => {
    await seedSession(page, OTHER_ADMIN);
    await mockApi(page, { me: { success: true, data: OTHER_ADMIN } });
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /Finance|Overview/ }).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('HRMS (Preview)')).toHaveCount(0);
    await page.goto('/dashboard/hrms/payroll');
    await bounced(page);
  });

  test('a deep link to any of the newer modules bounces everyone else too', async ({ page }) => {
    await seedSession(page, OTHER_ADMIN);
    await mockApi(page, { me: { success: true, data: OTHER_ADMIN } });
    await page.goto('/dashboard/hrms/incentives');
    await bounced(page);
  });

  test('the master admin viewing as a client does not see it', async ({ page }) => {
    await seedSession(page, MASTER_VIEWING_AS_CLIENT);
    await mockApi(page, { me: { success: true, data: MASTER_VIEWING_AS_CLIENT } });
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /Overview|Analytics/ }).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('HRMS (Preview)')).toHaveCount(0);
    await page.goto('/dashboard/hrms');
    await bounced(page);
  });
});
