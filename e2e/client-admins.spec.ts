import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Client Management → Admins: a master admin adds more admins to a client, switches one off, and moves one that was
 * saved in the wrong organisation. Runs against an intercepted API; the server's rules are covered by the backend's
 * clientAdmins tests. What matters here: the Admins button reaches the panel, the form sends what was typed, the new
 * admin's sign-in details are shown once, errors from the server are shown, and every action calls the right route.
 */

const CLIENT = { id: 'cl-adm-1', name: 'Acme Field Co', is_active: true, modules: ['crm_leads'], created_at: '2026-01-01T00:00:00Z', email: 'owner@acme.co' };

type Admin = { id: string; name: string; email: string; mobile: string | null; role: string; is_active: boolean; created_at: string; is_primary: boolean; in_client_org: boolean };
const OWNER: Admin = { id: 'u-owner', name: 'Acme Owner', email: 'owner@acme.co', mobile: null, role: 'client', is_active: true, created_at: '2026-01-01T00:00:00Z', is_primary: true, in_client_org: true };
const MISPLACED: Admin = { id: 'u-misplaced', name: 'Ravi Old', email: 'ravi@acme.co', mobile: '9000000001', role: 'client', is_active: true, created_at: '2026-02-01T00:00:00Z', is_primary: false, in_client_org: false };

async function open(page: Page, opts: { admins?: Admin[]; seats?: { allocated: number | null; active: number }; postStatus?: number } = {}) {
  let admins = [...(opts.admins ?? [OWNER, MISPLACED])];
  const posts: Array<Record<string, unknown>> = [];
  const patches: Array<{ id: string; body: Record<string, unknown> }> = [];
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const path = new URL(url).pathname;
      if (method === 'GET' && path === '/api/v1/clients') { await route.fulfill({ json: { success: true, data: [CLIENT] } }); return true; }
      if (method === 'GET' && path === `/api/v1/clients/${CLIENT.id}/admins`) {
        await route.fulfill({ json: { success: true, data: { admins, project: 'kinematic', seats: opts.seats ?? { allocated: 10, active: admins.filter((a) => a.is_active).length } } } });
        return true;
      }
      if (method === 'POST' && path === `/api/v1/clients/${CLIENT.id}/admins`) {
        const body = route.request().postDataJSON();
        posts.push(body);
        if (opts.postStatus && opts.postStatus >= 400) {
          await route.fulfill({ status: opts.postStatus, json: { success: false, error: `${body.email} is already used by Someone Else.`, code: 'DUPLICATE_ERROR' } });
          return true;
        }
        const made: Admin = { id: 'u-new', name: body.name, email: String(body.email).toLowerCase(), mobile: body.mobile ?? null, role: 'client', is_active: true, created_at: '2026-11-18T10:00:00Z', is_primary: false, in_client_org: true };
        admins = [...admins, made];
        await route.fulfill({ status: 201, json: { success: true, data: { ...made, project: 'kinematic' } } });
        return true;
      }
      const m = path.match(new RegExp(`^/api/v1/clients/${CLIENT.id}/admins/([^/]+)$`));
      if (method === 'PATCH' && m) {
        const body = route.request().postDataJSON();
        patches.push({ id: m[1], body });
        admins = admins.map((a) => (a.id !== m[1] ? a : body.move_to_client_org ? { ...a, in_client_org: true } : { ...a, is_active: body.is_active }));
        await route.fulfill({ json: { success: true, data: admins.find((a) => a.id === m[1]) } });
        return true;
      }
      return false;
    },
  });
  await page.goto('/dashboard/clients');
  await expect(page.getByText(CLIENT.name, { exact: true })).toBeVisible({ timeout: 45_000 });
  return { posts, patches };
}

const openAdmins = async (page: Page) => {
  await page.getByTestId(`client-admins-btn-${CLIENT.id}`).click();
  await expect(page.getByText('Edit Client')).toBeVisible();
  await expect(page.getByTestId('client-admins-panel')).toBeVisible();
};

test.describe('Client Management: admins per client', () => {
  test('the Admins button opens the client with its admins listed', async ({ page }) => {
    await open(page);
    await openAdmins(page);
    const panel = page.getByTestId('client-admins-panel');
    await expect(panel).toBeInViewport();
    await expect(page.getByTestId(`client-admin-${OWNER.id}`)).toContainText('Main login');
    await expect(page.getByTestId(`client-admin-${MISPLACED.id}`)).toContainText('Wrong organisation');
    await expect(page.getByTestId('client-admins-seats')).toContainText('2 of 10');
  });

  test('adding an admin sends the form and shows the sign-in details once', async ({ page }) => {
    const { posts } = await open(page);
    await openAdmins(page);
    await page.getByTestId('client-admins-add').click();
    await page.getByLabel('Full name').fill('Priya Nair');
    await page.getByLabel('Email').fill('Priya@Acme.co');
    // A pasted number with a country code and spaces is cleaned to its 10 digits.
    await page.getByLabel('Mobile (optional)').fill('+91 98765 43210');
    await expect(page.getByLabel('Mobile (optional)')).toHaveValue('9876543210');
    await page.getByTestId('client-admins-generate').click();
    const password = await page.getByLabel('Password').inputValue();
    expect(password).toHaveLength(14);
    await page.getByTestId('client-admins-save').click();

    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toEqual({ name: 'Priya Nair', email: 'Priya@Acme.co', mobile: '9876543210', password });
    const handover = page.getByTestId('client-admins-handover');
    await expect(handover).toContainText('Priya Nair is now an admin of Acme Field Co');
    await expect(handover).toContainText('priya@acme.co');
    await expect(handover).toContainText(password);
    await expect(page.getByTestId('client-admin-u-new')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(handover).toHaveCount(0);
  });

  test('a bad form is stopped before it reaches the server', async ({ page }) => {
    const { posts } = await open(page);
    await openAdmins(page);
    await page.getByTestId('client-admins-add').click();
    await page.getByLabel('Full name').fill('No Email');
    await page.getByLabel('Password').fill('Harbour-Lantern-58');
    await page.getByTestId('client-admins-save').click();
    await expect(page.getByTestId('client-admins-message')).toContainText('Enter an email');
    expect(posts).toHaveLength(0);
  });

  test('a refusal from the server is shown and the form stays open', async ({ page }) => {
    await open(page, { postStatus: 409 });
    await openAdmins(page);
    await page.getByTestId('client-admins-add').click();
    await page.getByLabel('Full name').fill('Priya Nair');
    await page.getByLabel('Email').fill('priya@acme.co');
    await page.getByLabel('Password').fill('Harbour-Lantern-58');
    await page.getByTestId('client-admins-save').click();
    await expect(page.getByTestId('client-admins-message')).toContainText('already used by Someone Else');
    await expect(page.getByTestId('client-admins-form')).toBeVisible();
    await expect(page.getByTestId('client-admins-handover')).toHaveCount(0);
  });

  test('switching an admin off asks first, then calls the server', async ({ page }) => {
    const { patches } = await open(page);
    await openAdmins(page);
    await page.getByTestId(`client-admin-off-${OWNER.id}`).click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toEqual({ id: OWNER.id, body: { is_active: false } });
    await expect(page.getByTestId(`client-admin-${OWNER.id}`)).toContainText('Switched off');
    await expect(page.getByTestId(`client-admin-on-${OWNER.id}`)).toBeVisible();
  });

  test('an admin in the wrong organisation can be moved into the client', async ({ page }) => {
    const { patches } = await open(page);
    await openAdmins(page);
    await page.getByTestId(`client-admin-move-${MISPLACED.id}`).click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toEqual({ id: MISPLACED.id, body: { move_to_client_org: true } });
    await expect(page.getByTestId(`client-admin-${MISPLACED.id}`)).not.toContainText('Wrong organisation');
  });

  test('when every seat is taken, adding is blocked and the panel says why', async ({ page }) => {
    await open(page, { seats: { allocated: 2, active: 2 } });
    await openAdmins(page);
    await expect(page.getByTestId('client-admins-seats')).toContainText('raise Max Active Users');
    await page.getByTestId('client-admins-add').click();
    await expect(page.getByTestId('client-admins-save')).toBeDisabled();
  });

  test('a new client explains where its first admin comes from', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Add Client' }).click();
    await expect(page.getByText('become this client\'s first admin')).toBeVisible();
    await expect(page.getByTestId('client-admins-panel')).toHaveCount(0);
  });

  test('the panel fits a phone screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await openAdmins(page);
    await page.getByTestId('client-admins-add').click();
    const overflow = await page.getByTestId('client-admins-panel').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('Settings → Users: a "Client" administrator', () => {
  test('is created inside the picked client, not through POST /users', async ({ page }) => {
    const clientPosts: Array<Record<string, unknown>> = [];
    let userPosts = 0;
    await seedSession(page, SEED_USER);
    await mockApi(page, {
      onRequest: async (route, url, method) => {
        const path = new URL(url).pathname;
        if (method === 'GET' && path === '/api/v1/clients') { await route.fulfill({ json: { success: true, data: [CLIENT] } }); return true; }
        if (method === 'POST' && path === `/api/v1/clients/${CLIENT.id}/admins`) {
          clientPosts.push(route.request().postDataJSON());
          await route.fulfill({ status: 201, json: { success: true, data: { ...OWNER, id: 'u-new', project: 'kinematic' } } });
          return true;
        }
        if (method === 'POST' && path === '/api/v1/users') { userPosts += 1; await route.fulfill({ status: 201, json: { success: true, data: {} } }); return true; }
        return false;
      },
    });
    await page.goto('/dashboard/settings');
    await page.getByRole('button', { name: 'Add administrator' }).click({ timeout: 45_000 });
    await page.getByPlaceholder('e.g. Rahul Sharma').fill('Priya Nair');
    await page.getByPlaceholder('rahul@kinematic.com').fill('priya@acme.co');
    await page.locator('select').filter({ has: page.locator('option[value="client"]') }).selectOption('client');
    await page.locator('select').filter({ has: page.locator('option', { hasText: 'Select client' }) }).selectOption(CLIENT.id);
    await page.getByPlaceholder('Secure password').fill('Harbour-Lantern-58');
    await page.getByRole('button', { name: 'Save administrator' }).click();

    await expect.poll(() => clientPosts.length).toBe(1);
    expect(clientPosts[0]).toEqual({ name: 'Priya Nair', email: 'priya@acme.co', password: 'Harbour-Lantern-58' });
    expect(userPosts).toBe(0);
  });
});
