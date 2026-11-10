import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Client Management → KINI AI usage limits (per user, and for the whole client).
 * Runs against an intercepted API. The rules that matter: the form shows what the server has, an untouched save never
 * sends the KINI fields (so a limit that failed to load cannot be wiped), a change sends only what changed, blank means
 * "back to the default", and a bad number never reaches the server.
 */

const WITH_LIMITS = {
  id: 'cl-kini-1', name: 'Acme Live', is_active: true, modules: ['crm_leads'], created_at: '2026-01-01T00:00:00Z',
  kini_user_monthly_limit: 40, kini_org_monthly_limit: 500, kini_org_used_this_month: 143,
};
const NO_LIMITS = { id: 'cl-kini-2', name: 'Beta Fresh', is_active: true, modules: ['crm_leads'], created_at: '2026-01-01T00:00:00Z', kini_user_monthly_limit: null, kini_org_monthly_limit: null, kini_org_used_this_month: 0 };

async function open(page: Page, opts: { warn?: boolean } = {}) {
  const patches: Array<Record<string, unknown>> = [];
  const posts: Array<Record<string, unknown>> = [];
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const path = new URL(url).pathname;
      if (method === 'GET' && path === '/api/v1/clients') { await route.fulfill({ json: { success: true, data: [WITH_LIMITS, NO_LIMITS] } }); return true; }
      if (method === 'PATCH' && /^\/api\/v1\/clients\/[^/]+$/.test(path)) {
        patches.push(route.request().postDataJSON());
        await route.fulfill({ json: { success: true, data: { id: 'x', ...(opts.warn ? { warnings: ['The client was saved, but its KINI limits could not be saved. Try again.'] } : {}) } } });
        return true;
      }
      if (method === 'POST' && path === '/api/v1/clients') {
        posts.push(route.request().postDataJSON());
        await route.fulfill({ status: 201, json: { success: true, data: { id: 'new' } } });
        return true;
      }
      return false;
    },
  });
  await page.goto('/dashboard/clients');
  await expect(page.getByText('Acme Live', { exact: true })).toBeVisible({ timeout: 45_000 });
  return { patches, posts };
}

const editRow = async (page: Page, name: string) => {
  const card = page.locator('div', { has: page.getByText(name, { exact: true }) }).filter({ has: page.getByTitle('Edit client') }).last();
  await card.getByTitle('Edit client').click();
  await expect(page.getByText('Edit Client')).toBeVisible();
};
const perUser = (page: Page) => page.getByLabel('KINI questions per user per month');
const perClient = (page: Page) => page.getByLabel('KINI questions for the whole client per month');
const update = (page: Page) => page.getByRole('button', { name: 'Update Client' });

test.describe('Client Management: KINI limits', () => {
  test('the edit form shows the limits the server has and this month\'s usage', async ({ page }) => {
    await open(page);
    await editRow(page, 'Acme Live');
    await expect(perUser(page)).toHaveValue('40');
    await expect(perClient(page)).toHaveValue('500');
    await expect(page.getByTestId('kini-used')).toContainText('143');
    await expect(page.getByTestId('kini-used')).toContainText('500');
  });

  test('a client with nothing set shows blank boxes (the default applies)', async ({ page }) => {
    await open(page);
    await editRow(page, 'Beta Fresh');
    await expect(perUser(page)).toHaveValue('');
    await expect(perClient(page)).toHaveValue('');
    await expect(perUser(page)).toHaveAttribute('placeholder', 'Default');
  });

  test('saving without touching the KINI boxes does not send them', async ({ page }) => {
    const { patches } = await open(page);
    await editRow(page, 'Acme Live');
    await update(page).click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).not.toHaveProperty('kini_user_monthly_limit');
    expect(patches[0]).not.toHaveProperty('kini_org_monthly_limit');
  });

  test('changing one limit sends only that one', async ({ page }) => {
    const { patches } = await open(page);
    await editRow(page, 'Acme Live');
    await perUser(page).fill('75');
    await update(page).click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toMatchObject({ kini_user_monthly_limit: 75 });
    expect(patches[0]).not.toHaveProperty('kini_org_monthly_limit');
  });

  test('clearing a limit sends a blank, which puts the client back on the default', async ({ page }) => {
    const { patches } = await open(page);
    await editRow(page, 'Acme Live');
    await perClient(page).fill('');
    await update(page).click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toMatchObject({ kini_org_monthly_limit: '' });
    expect(patches[0]).not.toHaveProperty('kini_user_monthly_limit');
  });

  test('zero is refused in the form and nothing is sent', async ({ page }) => {
    const { patches } = await open(page);
    await editRow(page, 'Beta Fresh');
    await perUser(page).fill('0');
    await update(page).click();
    await expect(page.getByText(/whole number of at least 1/)).toBeVisible();
    expect(patches).toHaveLength(0);
  });

  test('a new client sends the limits that were typed, and none when left blank', async ({ page }) => {
    const { posts } = await open(page);
    await page.getByRole('button', { name: 'Add Client' }).click();
    await page.getByPlaceholder('e.g. Horizonn Studio').fill('Gamma New');
    await page.getByPlaceholder('Create password').fill('Passw0rd!x');
    await perClient(page).fill('250');
    await page.getByRole('button', { name: 'Create Client' }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toMatchObject({ name: 'Gamma New', kini_org_monthly_limit: 250 });
    expect(posts[0]).not.toHaveProperty('kini_user_monthly_limit');
  });

  test('a save the server only half completed tells the admin', async ({ page }) => {
    await open(page, { warn: true });
    const seen: string[] = [];
    page.on('dialog', async (d) => { seen.push(d.message()); await d.accept(); });
    await editRow(page, 'Acme Live');
    await perUser(page).fill('60');
    await update(page).click();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]).toMatch(/KINI limits could not be saved/);
  });
});
