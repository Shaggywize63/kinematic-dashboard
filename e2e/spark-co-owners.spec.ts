import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Co-owners (additional owners) card on the lead detail page.
 *
 * The record keeps its single primary owner; co-owners are peers who also see it. An admin (SEED_USER)
 * can add and remove them. The card is a built-in-owner render site, so it is withheld when the admin
 * hides `owner_id` via the field overrides (the CLAUDE.md contract).
 */

const LEAD = {
  id: 'lead-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair', phone: '9876501234',
  company: 'Nair Steel', is_b2c: false, status: 'working', owner_id: 'u-asha', owner_name: 'Asha Menon',
  created_by: SEED_USER.id, created_at: '2026-09-20T10:00:00Z',
};
const USERS = [{ id: 'u-asha', name: 'Asha Menon' }, { id: 'u-ravi', name: 'Ravi Kumar' }, { id: 'u-meera', name: 'Meera Iyer' }];

interface Seen { method: string; path: string; body: any }

async function setup(page: Page, o: { overrides?: Record<string, unknown>; coOwners?: unknown[]; role?: string } = {}) {
  const seen: Seen[] = [];
  const user = o.role ? { ...SEED_USER, role: o.role } : SEED_USER;
  await seedSession(page, user);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: { field_overrides: o.overrides ?? {} } } },
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
      let body: any = null;
      try { body = route.request().postDataJSON(); } catch { /* not json */ }
      if (method !== 'GET') seen.push({ method, path, body });
      const ok = (data: unknown) => route.fulfill({ json: { success: true, data } }).then(() => true);
      if (method === 'GET' && path === '/api/v1/crm/leads/lead-1') return ok(LEAD);
      if (method === 'GET' && path === '/api/v1/crm/leads/lead-1/co-owners') return ok(o.coOwners ?? [{ user_id: 'u-ravi', name: 'Ravi Kumar' }]);
      if (method === 'PUT' && path === '/api/v1/crm/leads/lead-1/co-owners') {
        const ids: string[] = body?.user_ids ?? [];
        return ok(ids.map((id) => ({ user_id: id, name: USERS.find((u) => u.id === id)?.name ?? null })));
      }
      if (method === 'GET' && path === '/api/v1/users') return ok(USERS);
      return false;
    },
  });
  return seen;
}

const open = async (page: Page) => {
  await page.goto('/dashboard/crm/leads/lead-1');
  await expect(page.getByText('Owners', { exact: true })).toBeVisible({ timeout: 30_000 });
};

test.describe('Lead co-owners card', () => {
  test('shows the primary owner and the co-owners', async ({ page }) => {
    await setup(page);
    await open(page);
    await expect(page.getByText('PRIMARY', { exact: true })).toBeVisible();
    await expect(page.getByText('Asha Menon').first()).toBeVisible();
    await expect(page.getByText('Ravi Kumar').first()).toBeVisible();
  });

  test('an admin can add a co-owner (PUT carries the full id set)', async ({ page }) => {
    const seen = await setup(page);
    await open(page);
    await page.getByLabel('Add a co-owner', { exact: true }).click();
    await page.getByText('Meera Iyer', { exact: true }).click();
    await expect.poll(() => seen.filter((r) => r.method === 'PUT' && r.path.endsWith('/co-owners')).length).toBe(1);
    const put = seen.find((r) => r.method === 'PUT' && r.path.endsWith('/co-owners'));
    expect(put?.body.user_ids.sort()).toEqual(['u-meera', 'u-ravi'].sort());
    await expect(page.getByText('Meera Iyer').first()).toBeVisible();
  });

  test('an admin can remove a co-owner', async ({ page }) => {
    const seen = await setup(page);
    await open(page);
    await page.getByRole('button', { name: 'Remove Ravi Kumar' }).click();
    await expect.poll(() => seen.filter((r) => r.method === 'PUT' && r.path.endsWith('/co-owners')).length).toBe(1);
    const put = seen.find((r) => r.method === 'PUT' && r.path.endsWith('/co-owners'));
    expect(put?.body.user_ids).toEqual([]);
  });

  test('an admin keeps the Owners card even when the owner field is hidden', async ({ page }) => {
    // Owner is hidden for reps, but an admin keeps the card (so they can still manage co-owners), mirroring the
    // Change-owner control that stays for admins when owner_id is hidden.
    await setup(page, { overrides: { 'lead.owner_id': { hidden: true } } });
    await open(page); // waits for the "Owners" card to render for the admin
    await expect(page.getByText('PRIMARY', { exact: true })).toBeVisible();
    await expect(page.getByText('Ravi Kumar').first()).toBeVisible();
  });

  test('a field rep does not see the Owners card when the owner field is hidden', async ({ page }) => {
    await setup(page, { overrides: { 'lead.owner_id': { hidden: true } }, role: 'executive' });
    await page.goto('/dashboard/crm/leads/lead-1');
    await expect(page.getByText('Priya Nair').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle'); // let the gated card resolve before asserting it's absent
    await expect(page.getByText('Owners', { exact: true })).toHaveCount(0);
  });
});
