import type { Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/** The master admin (the only account that sees HRMS until the module is granted to clients). */
export const MASTER = { ...SEED_USER, email: 's@kinematicapp.com', name: 'Master Admin' };

/**
 * Open an HRMS page as the master admin. The module runs on sample data kept in localStorage, so a fresh
 * browser context always starts from the seed and no API mocking is needed beyond the layout's own calls.
 */
export async function openHrms(page: Page, path = '/dashboard/hrms'): Promise<void> {
  await seedSession(page, MASTER);
  await mockApi(page, { me: { success: true, data: MASTER } });
  await page.goto(path);
  await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
}
