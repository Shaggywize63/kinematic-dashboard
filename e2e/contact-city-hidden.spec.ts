import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * An admin can hide the City field (Settings → Custom Fields). The contact create form then has no City control, but it
 * used to send `city: ""` anyway and the server answered "Validation failed: city: City is required". A hidden or blank
 * city must simply be left out of the request.
 */
async function setup(page: Page, overrides: Record<string, unknown>) {
  const posts: Array<Record<string, unknown>> = [];
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: { field_overrides: overrides } } },
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
      if (method === 'POST' && path === '/api/v1/crm/contacts') {
        posts.push(route.request().postDataJSON());
        await route.fulfill({ json: { success: true, data: { id: 'c-new', first_name: 'Ravi' } } });
        return true;
      }
      return false;
    },
  });
  return posts;
}

test.describe('Contact create with City hidden', () => {
  test('creates the contact without sending a city', async ({ page }) => {
    const posts = await setup(page, { 'contact.city': { hidden: true } });
    await page.goto('/dashboard/crm/contacts/new');
    await expect(page.getByText('New Contact').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('City', { exact: false }).filter({ hasText: /^City/ })).toHaveCount(0);

    await page.getByLabel('First Name', { exact: false }).first().fill('Ravi');
    await page.getByLabel('Primary Mobile', { exact: false }).first().fill('9932740840');
    await page.getByLabel('Email', { exact: false }).first().fill('ravi@example.com').catch(() => undefined);
    await page.getByRole('button', { name: 'Create' }).click();

    await expect.poll(() => posts.length, { timeout: 15_000 }).toBe(1);
    expect(Object.prototype.hasOwnProperty.call(posts[0], 'city')).toBe(false);
  });

  test('with City visible and blank the form still asks for it and sends nothing', async ({ page }) => {
    const posts = await setup(page, {});
    await page.goto('/dashboard/crm/contacts/new');
    await expect(page.getByText('New Contact').first()).toBeVisible({ timeout: 60_000 });
    await page.getByLabel('First Name', { exact: false }).first().fill('Ravi');
    await page.getByLabel('Primary Mobile', { exact: false }).first().fill('9932740840');
    await page.getByLabel('Email', { exact: false }).first().fill('ravi@example.com').catch(() => undefined);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText(/City is required/i).first()).toBeVisible();
    expect(posts).toHaveLength(0);
  });
});
