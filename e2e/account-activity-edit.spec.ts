import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, scopeToSpark } from './spark';

/**
 * Account detail: every activity row has an Edit action that opens the shared edit form (the one on the Activities
 * page) and saves via PATCH /crm/activities/:id, then the list refreshes. Available for every tenant.
 */

const ACCOUNT = { id: 'acc-1', org_id: 'e2e-org-1', name: 'Acme Forge', created_at: '2026-01-05T09:00:00Z', updated_at: '2026-01-05T09:00:00Z' };
const iso = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function setup(page: Page, calls: { patched: Record<string, any>[]; deleted: string[]; activityGets: number }) {
  let subject = 'Site visit';
  const rows = () => [
    { id: 'act-1', org_id: 'o', type: 'meeting', subject, status: 'open', due_at: iso(24), owner_name: 'Asha Rao', created_at: iso(-5), updated_at: iso(-5) },
    { id: 'act-2', org_id: 'o', type: 'call', subject: 'Intro call', status: 'completed', completed_at: iso(-48), owner_name: 'Asha Rao', created_at: iso(-50), updated_at: iso(-48) },
  ].filter((r) => !calls.deleted.includes(r.id));
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1') return ok(route, ACCOUNT);
      if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1/activities') { calls.activityGets += 1; return ok(route, rows()); }
      if (method === 'GET' && /^\/api\/v1\/crm\/accounts\/acc-1\/(contacts|deals|notes)$/.test(p)) return ok(route, []);
      if (method === 'GET' && p === '/api/v1/crm/activity-types') return ok(route, []);
      if (method === 'PATCH' && p === '/api/v1/crm/activities/act-1') {
        const body = route.request().postDataJSON() as Record<string, any>;
        calls.patched.push(body);
        subject = body.subject ?? subject;
        return ok(route, { id: 'act-1', ...body });
      }
      if (method === 'DELETE' && p === '/api/v1/crm/activities/act-2') { calls.deleted.push('act-2'); return ok(route, { id: 'act-2' }); }
      return false;
    },
  });
}

test.describe('Account page activity edit', () => {
  test('Edit on a row opens the edit form, PATCHes, and refreshes the list', async ({ page }) => {
    const calls = { patched: [] as Record<string, any>[], deleted: [] as string[], activityGets: 0 };
    await setup(page, calls);
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByText('Activities (2)')).toBeVisible({ timeout: 30_000 });
    // Every row carries an Edit action.
    await expect(page.getByRole('button', { name: /^Edit activity:/ })).toHaveCount(2);

    await page.getByRole('button', { name: 'Edit activity: Site visit' }).click();
    await expect(page.getByText('Edit activity', { exact: true })).toBeVisible();
    const subject = page.locator('div:has(> label:text-is("Subject")) > input');
    await expect(subject).toHaveValue('Site visit');
    await subject.fill('Site visit - rescheduled');
    const before = calls.activityGets;
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => calls.patched.length).toBe(1);
    expect(calls.patched[0]).toMatchObject({ subject: 'Site visit - rescheduled', type: 'meeting' });
    await expect(page.getByText('Edit activity', { exact: true })).toHaveCount(0);
    await expect.poll(() => calls.activityGets).toBeGreaterThan(before);
    await expect(page.getByText('Site visit - rescheduled')).toBeVisible();
  });

  test('deleting from the form refreshes the account activity list (Spark too)', async ({ page }) => {
    const calls = { patched: [] as Record<string, any>[], deleted: [] as string[], activityGets: 0 };
    await scopeToSpark(page);
    await setup(page, calls);
    page.on('dialog', (d) => d.accept());
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByText('Activities (2)')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Edit activity: Intro call' }).click();
    await page.getByRole('button', { name: '🗑 Delete' }).click();
    await expect.poll(() => calls.deleted.length).toBe(1);
    await expect(page.getByRole('button', { name: /^Edit activity:/ })).toHaveCount(1);
  });
});
