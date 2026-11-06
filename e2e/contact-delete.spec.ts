import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/** Contacts can be deleted from the contact page and from the contacts list (with a confirmation). */
const CONTACT = {
  id: 'contact-1', first_name: 'Ravi', last_name: 'Agarwal', full_name: 'Ravi Agarwal',
  email: 'ravi@example.com', phone: '9932740840', is_b2c: false, created_at: '2026-11-01T00:00:00Z',
};

async function setup(page: Page, o: { deleteStatus?: number } = {}) {
  const deletes: string[] = [];
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
      const json = (data: unknown, status = 200) => route.fulfill({ status, json: { success: status < 400, data } }).then(() => true);
      if (method === 'DELETE' && path === '/api/v1/crm/contacts/contact-1') {
        deletes.push(path);
        return o.deleteStatus && o.deleteStatus >= 400
          ? route.fulfill({ status: o.deleteStatus, json: { success: false, error: 'Not allowed to delete' } }).then(() => true)
          : route.fulfill({ status: 204, body: '' }).then(() => true);
      }
      if (method === 'GET' && path === '/api/v1/crm/contacts/contact-1') return json(CONTACT);
      if (method === 'GET' && path === '/api/v1/crm/contacts') return json([CONTACT]);
      return false;
    },
  });
  return deletes;
}

test.describe('Edit a contact', () => {
  test('a business contact saves without sending consumer fields (no city: null)', async ({ page }) => {
    const patches: Record<string, unknown>[] = [];
    await seedSession(page, SEED_USER);
    await mockApi(page, {
      me: { success: true, data: SEED_USER },
      onRequest: async (route, url, method) => {
        const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
        const json = (data: unknown) => route.fulfill({ status: 200, json: { success: true, data } }).then(() => true);
        if (method === 'PATCH' && path === '/api/v1/crm/contacts/contact-1') {
          patches.push(route.request().postDataJSON());
          return json({ ...CONTACT, first_name: 'Ravi' });
        }
        if (method === 'GET' && path === '/api/v1/crm/contacts/contact-1') return json(CONTACT);
        return false;
      },
    });
    await page.goto('/dashboard/crm/contacts/contact-1');
    await page.getByRole('button', { name: 'Edit', exact: true }).click({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => patches.length).toBe(1);
    const body = patches[0];
    expect(body.is_b2c).toBe(false);
    for (const k of ['city', 'state', 'country', 'gender', 'date_of_birth', 'address_line1']) expect(body).not.toHaveProperty(k);
  });
});

test.describe('Delete a contact', () => {
  test('contact page: Delete asks first, then deletes and returns to the list', async ({ page }) => {
    const deletes = await setup(page);
    await page.goto('/dashboard/crm/contacts/contact-1');
    const del = page.getByRole('button', { name: 'Delete Ravi Agarwal' });
    await expect(del).toBeVisible({ timeout: 60_000 });

    page.once('dialog', (d) => d.dismiss());
    await del.click();
    expect(deletes).toHaveLength(0); // cancelled: nothing deleted

    page.once('dialog', (d) => d.accept());
    await del.click();
    await expect.poll(() => deletes.length).toBe(1);
    await expect(page).toHaveURL(/\/dashboard\/crm\/contacts$/);
  });

  test('contacts list: each row has a Delete action that confirms first', async ({ page }) => {
    const deletes = await setup(page);
    await page.goto('/dashboard/crm/contacts');
    const del = page.getByRole('button', { name: 'Delete Ravi Agarwal' });
    await expect(del).toBeVisible({ timeout: 60_000 });
    page.once('dialog', (d) => d.dismiss());
    await del.click();
    expect(deletes).toHaveLength(0);
    page.once('dialog', (d) => d.accept());
    await del.click();
    await expect.poll(() => deletes.length).toBe(1);
  });

  test('a refused delete shows the error and keeps the contact page open', async ({ page }) => {
    const deletes = await setup(page, { deleteStatus: 403 });
    await page.goto('/dashboard/crm/contacts/contact-1');
    const del = page.getByRole('button', { name: 'Delete Ravi Agarwal' });
    await expect(del).toBeVisible({ timeout: 60_000 });
    page.once('dialog', (d) => d.accept());
    await del.click();
    await expect.poll(() => deletes.length).toBe(1);
    await expect(page.getByText(/Not allowed to delete|Could not delete/i).first()).toBeVisible();
    await expect(page).toHaveURL(/contacts\/contact-1$/);
  });
});
