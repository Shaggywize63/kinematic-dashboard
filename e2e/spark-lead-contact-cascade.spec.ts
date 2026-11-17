import { test, expect, type Locator, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark } from './spark';

/**
 * Spark & Ray lead form: linking an EXISTING contact also brings in that person's company and the company's
 * industry, so the rep doesn't re-enter what the CRM already knows. A company the rep already linked is kept.
 */

const PERSON = { id: 'c-9', first_name: 'R.', last_name: 'Sharma', title: 'Sr. Manager', phone: '9876500000', email: 'r.sharma@ntpc.example', account_id: 'acc-ntpc', account_name: 'NTPC Limited' };
const NTPC = { id: 'acc-ntpc', name: 'NTPC Limited', industry: 'Power & Energy' };
const BETA = { id: 'acc-2', name: 'Beta Castings', industry: null };

async function setup(page: Page) {
  await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: {} } },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/contacts') return ok(route, [PERSON]);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-ntpc') return ok(route, NTPC);
      if (method === 'GET' && p === '/api/v1/crm/accounts') return ok(route, [BETA]);
      return false;
    },
  });
}

/**
 * Type into a typeahead and wait for its options. The page is server-rendered, so a fill() that lands before
 * React has hydrated is never seen by the search effect.
 */
async function typeUntilOption(page: Page, box: Locator, text: string, option: RegExp) {
  await expect(box).toBeVisible({ timeout: 30_000 });
  // Per-character typing (not fill): the DOM value accumulates, so whichever keystroke lands after hydration
  // carries the whole term. The delay also clears the typeahead's 250ms debounce between characters.
  await box.click();
  await box.pressSequentially(text, { delay: 120 });
  await expect(page.getByRole('option', { name: option }).first()).toBeVisible({ timeout: 20_000 });
}

const companyBox = (page: Page) => page.locator('#lead-field-company');

async function pickPerson(page: Page) {
  const search = page.getByPlaceholder('Start typing a contact name…').first();
  await typeUntilOption(page, search, 'Sharma', /R\. Sharma/);
  await page.getByRole('option', { name: /R\. Sharma/ }).first().click();
}

test.describe('Spark lead form: linking a contact brings their company + industry', () => {
  test('picking an existing person links their company and autofills its industry (read-only)', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads/new');
    await pickPerson(page);
    await expect(companyBox(page)).toHaveValue('NTPC Limited');
    const industry = page.locator('#lead-field-industry');
    await expect(industry).toHaveValue('Power & Energy');
    await expect(industry).toBeDisabled();
  });

  test('a company the rep already linked is kept when a person from another company is picked', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/leads/new');
    const company = companyBox(page);
    await typeUntilOption(page, company, 'Beta', /Beta Castings/);
    await page.getByRole('option', { name: /Beta Castings/ }).click();
    await expect(company).toHaveValue('Beta Castings');
    await pickPerson(page);
    // The person is linked, but their company never overwrites the one the rep chose.
    await expect(company).toHaveValue('Beta Castings');
  });
});
