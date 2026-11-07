import type { Page } from '@playwright/test';
import { demoLogin } from './utils';

/**
 * Open an HRMS page as the demo account, the only account that sees HRMS. The demo session serves its own mocks on
 * the client, and the module runs on sample data kept in localStorage, so a fresh browser context always starts from
 * the seed and no API interception is needed.
 */
export async function openHrms(page: Page, path = '/dashboard/hrms'): Promise<void> {
  await demoLogin(page);
  await page.goto(path);
  await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
}
