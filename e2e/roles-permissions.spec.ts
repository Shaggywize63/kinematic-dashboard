import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Sub-admins & Roles management (Settings → Role Hierarchy).
 *
 * Covers the admin screen built over the EXISTING backend roles API
 * (/api/v1/roles): listing roles, creating a role with module access toggles
 * (the POST body must carry the chosen MODULE KEYS in `permissions`), deleting
 * a role behind a confirm, and assigning a user to a role (a single
 * `users.org_role_id` — assignment is a PATCH /api/v1/users/:id). A non-admin
 * must not see the screen at all.
 *
 * All roles endpoints are MOCKED — no live backend.
 */

type Body = Record<string, unknown>;

interface RoleFixture {
  id: string; org_id: string; client_id: string | null; name: string;
  description: string | null; parent_id: string | null; position: number;
  color: string | null; permissions: string[]; permissions_write: string[];
  assigned_cities: string[]; created_at: string; updated_at: string;
  user_count?: number;
}

const ROLE: RoleFixture = {
  id: 'role-1', org_id: 'e2e-org-1', client_id: null, name: 'Sales Head',
  description: 'Owns the sales org', parent_id: null, position: 0, color: '#6366f1',
  permissions: [], permissions_write: [], assigned_cities: [],
  created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z', user_count: 0,
};

const DIRECTORY = [
  { id: 'u1', name: 'Asha Rao', email: 'asha@example.com', role: 'sub_admin', org_role_id: null },
  { id: 'u2', name: 'Bhaskar N', email: 'bhaskar@example.com', role: 'field_executive', org_role_id: null },
];

/** Captures every write the screen issues against the roles/users API. */
interface Captured {
  postedRoles: Body[];
  deletedRoleIds: string[];
  patchedUsers: Array<{ id: string; body: Body }>;
}

async function setup(page: Page, cap: Captured, opts: { user?: Record<string, unknown> } = {}) {
  await seedSession(page, opts.user ?? SEED_USER);
  await mockApi(page, {
    onRequest: async (route: Route, url: string, method: string) => {
      const path = url.split('?')[0];

      // Hierarchy tree (nested) — the page renders this.
      if (method === 'GET' && path.endsWith('/api/v1/roles/tree')) {
        await route.fulfill({ json: [{ ...ROLE, children: [] }] });
        return true;
      }
      // Direct members of a role — bare array, like the backend.
      if (method === 'GET' && /\/api\/v1\/roles\/[^/]+\/users$/.test(path)) {
        await route.fulfill({ json: [] });
        return true;
      }
      // Flat list.
      if (method === 'GET' && path.endsWith('/api/v1/roles')) {
        await route.fulfill({ json: [ROLE] });
        return true;
      }
      // Create a role.
      if (method === 'POST' && path.endsWith('/api/v1/roles')) {
        cap.postedRoles.push(route.request().postDataJSON() as Body);
        await route.fulfill({ json: { ...ROLE, id: 'role-new', name: 'created', user_count: 0 } });
        return true;
      }
      // Delete a role.
      if (method === 'DELETE' && /\/api\/v1\/roles\/[^/]+$/.test(path)) {
        cap.deletedRoleIds.push(path.split('/').pop() as string);
        await route.fulfill({ status: 204, body: '' });
        return true;
      }
      // Directory of users (assignment picker).
      if (method === 'GET' && path.endsWith('/api/v1/users')) {
        await route.fulfill({ json: { success: true, data: DIRECTORY } });
        return true;
      }
      // Assign/unassign = patch the user's org_role_id.
      if (method === 'PATCH' && /\/api\/v1\/users\/[^/]+$/.test(path)) {
        cap.patchedUsers.push({ id: path.split('/').pop() as string, body: route.request().postDataJSON() as Body });
        await route.fulfill({ json: { success: true, data: {} } });
        return true;
      }
      return false;
    },
  });
}

function fresh(): Captured {
  return { postedRoles: [], deletedRoleIds: [], patchedUsers: [] };
}

test.describe('Roles & Permissions admin screen', () => {
  test('lists existing roles', async ({ page }) => {
    const cap = fresh();
    await setup(page, cap);
    await page.goto('/dashboard/settings/roles');

    await expect(page.getByRole('heading', { name: 'Role Hierarchy' })).toBeVisible();
    await expect(page.getByText('Sales Head')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add Top-Level Role' })).toBeVisible();
  });

  test('creating a role sends the selected MODULE KEYS in permissions', async ({ page }) => {
    const cap = fresh();
    await setup(page, cap);
    await page.goto('/dashboard/settings/roles');

    await page.getByRole('button', { name: '+ Add Top-Level Role' }).click();
    await expect(page.getByText('New role')).toBeVisible();
    await page.getByPlaceholder('e.g. VP of Sales').fill('Regional Manager');

    // Toggle a module ON via its Read checkbox. Scope to the module grid (the
    // scroll box under the sticky "Module" header) so we never hit the sidebar.
    const grid = page.getByText('Module', { exact: true }).locator('xpath=ancestor::div[2]');
    const readBox = grid.getByText('Lead Analytics', { exact: true }).locator('xpath=following-sibling::input[1]');
    await readBox.check();
    // The toggle is reflected in the counter.
    await expect(page.getByText(/1 read · 0 write\./)).toBeVisible();

    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await expect.poll(() => cap.postedRoles.length).toBe(1);
    const body = cap.postedRoles[0];
    expect(body.name).toBe('Regional Manager');
    expect(body.permissions).toContain('crm_lead_analytics');
    // Write wasn't ticked, so it stays empty (write is a subset of read).
    expect(body.permissions_write).toEqual([]);
  });

  test('deleting a role goes through a confirm and calls DELETE', async ({ page }) => {
    const cap = fresh();
    await setup(page, cap);
    await page.goto('/dashboard/settings/roles');

    // Select the role to open its detail panel, then delete from there.
    await page.getByText('Sales Head').click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: '🗑 Delete' }).click();

    await expect.poll(() => cap.deletedRoleIds).toContain('role-1');
  });

  test('assigning a user patches that user with the role id', async ({ page }) => {
    const cap = fresh();
    await setup(page, cap);
    await page.goto('/dashboard/settings/roles');

    await page.getByText('Sales Head').click();
    const picker = page.getByLabel('Assign a user to this role');
    await expect(picker).toBeVisible();
    await picker.selectOption('u1');
    await page.getByRole('button', { name: 'Assign' }).click();

    await expect.poll(() => cap.patchedUsers.length).toBe(1);
    expect(cap.patchedUsers[0].id).toBe('u1');
    expect(cap.patchedUsers[0].body).toEqual({ org_role_id: 'role-1' });
  });

  test('a non-admin does NOT see the screen', async ({ page }) => {
    const cap = fresh();
    await setup(page, cap, {
      user: { ...SEED_USER, role: 'field_executive' },
    });
    await page.goto('/dashboard/settings/roles');

    await expect(page.getByText('Admin access required')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add Top-Level Role' })).toHaveCount(0);
    // And no role data is rendered.
    await expect(page.getByText('Sales Head')).toHaveCount(0);
  });
});
