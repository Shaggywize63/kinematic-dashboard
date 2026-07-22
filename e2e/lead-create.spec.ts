import { test, expect } from '@playwright/test';
import { mockApi, seedSession } from './utils';

/**
 * Lead-create write flow using a seeded NON-demo session + full route
 * interception, so the client actually issues fetches that we capture and
 * assert on.
 *
 * Settings are mocked to a B2C tenant that HIDES the city field, which keeps
 * the required-field set to { first_name, last_name, phone } and avoids the
 * async city/location picker. Geolocation is granted globally in the config,
 * so the form's auto-capture fills lat/lng and enables the submit button.
 */
const B2C_SETTINGS = {
  success: true,
  data: {
    business_type: 'b2c',
    config: { field_overrides: { 'lead.city': { hidden: true } } },
  },
};

test.describe('Lead create (route-intercepted)', () => {
  test('fills the form, POSTs, shows success + navigates', async ({ page }) => {
    let postedBody: Record<string, unknown> | null = null;

    await seedSession(page);
    await mockApi(page, {
      settings: B2C_SETTINGS,
      onRequest: async (route, url, method) => {
        const path = url.split('?')[0];
        if (method === 'POST' && path.endsWith('/crm/leads')) {
          try {
            postedBody = route.request().postDataJSON();
          } catch {
            postedBody = null;
          }
          await route.fulfill({
            json: { success: true, data: { id: 'e2e-lead-1', ...(postedBody ?? {}) } },
          });
          return true;
        }
        // Give the post-create detail page a plausible lead so it doesn't error.
        if (method === 'GET' && /\/crm\/leads\/e2e-lead-1$/.test(path)) {
          await route.fulfill({
            json: { success: true, data: { id: 'e2e-lead-1', first_name: 'Test', last_name: 'Lead', is_b2c: true, status: 'new' } },
          });
          return true;
        }
        return false;
      },
    });

    await page.goto('/dashboard/crm/leads/new');
    await expect(page.getByRole('heading', { name: 'New Lead' })).toBeVisible();

    await page.locator('#lead-field-first_name').fill('Test');
    await page.locator('#lead-field-last_name').fill('Lead');
    await page.locator('#lead-field-phone').fill('9876543210');

    // Geolocation auto-capture enables the button; wait for it.
    const submit = page.getByRole('button', { name: 'Create Lead' });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();

    // Success path: toast + navigation to the new lead's detail page.
    await expect(page).toHaveURL(/\/dashboard\/crm\/leads\/e2e-lead-1/, { timeout: 20_000 });

    // The POST carried the values we typed.
    expect(postedBody).not.toBeNull();
    expect(postedBody).toMatchObject({ first_name: 'Test', last_name: 'Lead', phone: '9876543210' });
  });

  test('client-side validation blocks submit when the name is missing', async ({ page }) => {
    let leadPosted = false;

    await seedSession(page);
    await mockApi(page, {
      settings: B2C_SETTINGS,
      onRequest: async (route, url, method) => {
        const path = url.split('?')[0];
        if (method === 'POST' && path.endsWith('/crm/leads')) {
          leadPosted = true;
          await route.fulfill({ json: { success: true, data: { id: 'should-not-happen' } } });
          return true;
        }
        return false;
      },
    });

    await page.goto('/dashboard/crm/leads/new');
    await expect(page.getByRole('heading', { name: 'New Lead' })).toBeVisible();

    // Leave first_name empty; wait for geolocation to enable the button.
    const submit = page.getByRole('button', { name: 'Create Lead' });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();

    // A sonner error toast surfaces and no lead is POSTed.
    await expect(page.getByText(/First name is required/i)).toBeVisible();
    expect(leadPosted).toBe(false);
    await expect(page).toHaveURL(/\/dashboard\/crm\/leads\/new$/);
  });
});
