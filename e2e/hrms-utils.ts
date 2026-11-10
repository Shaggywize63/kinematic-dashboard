import type { Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/** The master admin: the only account that sees HRMS (see src/lib/hrms/access.ts). */
export const MASTER_USER = { ...SEED_USER, email: 's@kinematicapp.com', name: 'Master Admin', role: 'super_admin' };

/**
 * Open an HRMS page as the master admin. The module runs on sample data kept in localStorage and makes no API calls
 * of its own, so the session is seeded and the dashboard shell's own calls are intercepted; a fresh browser context
 * always starts from the seed.
 */
export async function openHrms(page: Page, path = '/dashboard/hrms'): Promise<void> {
  await seedSession(page, MASTER_USER);
  await mockApi(page, { me: { success: true, data: MASTER_USER } });
  await page.goto(path);
  await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
}
