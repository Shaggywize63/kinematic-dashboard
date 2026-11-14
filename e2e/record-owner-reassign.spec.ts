import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark, USERS } from './spark';

/**
 * "A person once assigned cannot be changed": admins / managers can change an account's owner, a deal's owner
 * and an activity's assignee after the fact; everyone else cannot (and the control is not offered). The
 * owner is only sent when it actually changed.
 */

type Call = { method: string; path: string; body: Record<string, any> };

const ACCOUNT = { id: 'account-1', name: 'Nair Steel Traders', industry: 'Steel', owner_id: 'u-asha', owner_name: 'Asha Rao', created_by: SEED_USER.id };
const DEAL = { id: 'deal-1', name: 'Q4 TMT Supply', amount: 500000, stage_id: 's1', stage_name: 'Negotiation', pipeline_id: 'p1', probability: '60', status: 'open', owner_id: 'u-asha', owner_name: 'Asha Rao', created_by: SEED_USER.id };
const ACTIVITY = { id: 'act-1', org_id: 'e2e-org-1', type: 'meeting', subject: 'Plant visit', status: 'open', created_at: '2026-10-01T05:00:00Z', updated_at: '2026-10-01T05:00:00Z', assigned_to: 'u-asha', assigned_to_name: 'Asha Rao' };

async function setup(page: Page, calls: Call[], role = 'super_admin') {
  await seedSession(page, { ...SEED_USER, role });
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: { field_overrides: {} } } },
    me: { success: true, data: { ...SEED_USER, role } },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/users') return ok(route, USERS);
      if (method === 'GET' && p === `/api/v1/crm/accounts/${ACCOUNT.id}`) return ok(route, ACCOUNT);
      if (method === 'GET' && p === `/api/v1/crm/deals/${DEAL.id}`) return ok(route, DEAL);
      if (method === 'GET' && p === '/api/v1/crm/activities') {
        return route.fulfill({ json: { success: true, data: [ACTIVITY], pagination: { total: 1, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false } } }).then(() => true);
      }
      if (method === 'PATCH' && /^\/api\/v1\/crm\/(accounts|deals|activities)\/[^/]+$/.test(p)) {
        calls.push({ method, path: p, body: route.request().postDataJSON() as Record<string, any> });
        const row = p.includes('/accounts/') ? ACCOUNT : p.includes('/deals/') ? DEAL : ACTIVITY;
        return ok(route, row);
      }
      return false;
    },
  });
}

const openEdit = async (page: Page, path: string, dialogName: string) => {
  await page.goto(path);
  const edit = page.getByRole('button', { name: 'Edit', exact: true }).first();
  await expect(edit).toBeVisible({ timeout: 30_000 });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: dialogName });
  await expect(dialog).toBeVisible();
  return dialog;
};

async function pickOwner(page: Page, dialog: ReturnType<Page['getByRole']>, name: string) {
  const field = dialog.locator('[data-field="owner_id"]');
  await expect(field).toHaveCount(1);
  await field.getByPlaceholder(/team member/).click();
  await page.getByText(name, { exact: true }).click();
}

// Accounts no longer expose the owner control in the Edit modal (owner stays server-side for access scoping).
test.describe('accounts: owner is not editable from the Edit modal', () => {
  test('an admin is not offered the owner control and no owner is sent', async ({ page }) => {
    const calls: Call[] = [];
    await setup(page, calls);
    const d = await openEdit(page, '/dashboard/crm/accounts/account-1', 'Edit Account');
    await expect(d.locator('[data-field="name"]')).toHaveCount(1);
    await expect(d.locator('[data-field="owner_id"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.length).toBe(1);
    expect('owner_id' in calls[0].body).toBe(false);
  });

  test('a field rep is not offered the owner control', async ({ page }) => {
    await setup(page, [], 'executive');
    const d = await openEdit(page, '/dashboard/crm/accounts/account-1', 'Edit Account');
    await expect(d.locator('[data-field="name"]')).toHaveCount(1);
    await expect(d.locator('[data-field="owner_id"]')).toHaveCount(0);
  });
});

for (const [entity, path, dialogName] of [
  ['deals', '/dashboard/crm/deals/deal-1', 'Edit Deal'],
] as const) {
  test.describe(`${entity}: change the owner after assignment`, () => {
    test('an admin picks a different owner and it is saved', async ({ page }) => {
      const calls: Call[] = [];
      await setup(page, calls);
      const d = await openEdit(page, path, dialogName);
      await pickOwner(page, d, 'Ravi Kumar');
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect.poll(() => calls.length).toBe(1);
      expect(calls[0].method).toBe('PATCH');
      expect(calls[0].body.owner_id).toBe('u-ravi');
    });

    test('saving without touching the owner does not send one', async ({ page }) => {
      const calls: Call[] = [];
      await setup(page, calls);
      await openEdit(page, path, dialogName);
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect.poll(() => calls.length).toBe(1);
      expect('owner_id' in calls[0].body).toBe(false);
    });

    test('a field rep is not offered the owner control', async ({ page }) => {
      await setup(page, [], 'executive');
      const d = await openEdit(page, path, dialogName);
      await expect(d.locator('[data-field="name"]')).toHaveCount(1);
      await expect(d.locator('[data-field="owner_id"]')).toHaveCount(0);
    });

    test('an admin hiding the owner field in Settings removes it', async ({ page }) => {
      await seedSession(page, SEED_USER);
      await mockApi(page, {
        settings: { success: true, data: { business_type: 'both', config: { field_overrides: { [`${entity === 'deals' ? 'deal' : 'account'}.owner_id`]: { hidden: true } } } } },
        me: { success: true, data: SEED_USER },
        onRequest: async (route, url, method) => {
          const p = apiPath(url);
          if (method === 'GET' && p === '/api/v1/users') return ok(route, USERS);
          if (method === 'GET' && p === `/api/v1/crm/${entity}/${entity === 'deals' ? DEAL.id : ACCOUNT.id}`) return ok(route, entity === 'deals' ? DEAL : ACCOUNT);
          return false;
        },
      });
      const d = await openEdit(page, path, dialogName);
      await expect(d.locator('[data-field="name"]')).toHaveCount(1);
      await expect(d.locator('[data-field="owner_id"]')).toHaveCount(0);
    });
  });
}

test.describe('activities: change the assignee after assignment', () => {
  test('a non-Spark admin gets an "Assigned to" picker and the change is sent as assigned_to', async ({ page }) => {
    const calls: Call[] = [];
    await setup(page, calls);
    await page.goto('/dashboard/crm/activities');
    await page.getByRole('button', { name: /Edit/ }).first().click();
    const field = page.getByText('Assigned to', { exact: true }).locator('xpath=..');
    await field.getByPlaceholder(/team member/).click();
    await page.getByText('Meera Iyer', { exact: true }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].body.assigned_to).toBe('u-meera');
  });

  test('a non-Spark rep does not get the picker and no assignee is sent', async ({ page }) => {
    const calls: Call[] = [];
    await setup(page, calls, 'executive');
    await page.goto('/dashboard/crm/activities');
    await page.getByRole('button', { name: /Edit/ }).first().click();
    await expect(page.getByText('Edit activity')).toBeVisible();
    await expect(page.getByText('Assigned to', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.length).toBe(1);
    expect('assigned_to' in calls[0].body).toBe(false);
  });

  test('Spark: a rep sees the assignees read-only; an admin can clear them all', async ({ page }) => {
    const calls: Call[] = [];
    await scopeToSpark(page);
    await setup(page, calls, 'executive');
    await page.goto('/dashboard/crm/activities');
    await page.getByRole('button', { name: /Edit/ }).first().click();
    await expect(page.getByTestId('assignee-readonly')).toContainText('only an admin or manager can change');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.length).toBe(1);
    expect('assignee_ids' in calls[0].body).toBe(false);
    expect('assigned_to' in calls[0].body).toBe(false);
  });

  test('Spark: an admin can remove every assignee (sent as an empty list)', async ({ page }) => {
    const calls: Call[] = [];
    await scopeToSpark(page);
    await setup(page, calls);
    await page.goto('/dashboard/crm/activities');
    await page.getByRole('button', { name: /Edit/ }).first().click();
    const group = page.getByRole('group', { name: 'Assign to (multiple)' });
    await expect(group.getByTestId('assignee-chip')).toHaveCount(1);
    await group.getByRole('button', { name: 'Remove Asha Rao' }).click();
    await expect(group.getByTestId('assignee-chip')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].body.assignee_ids).toEqual([]);
  });
});
