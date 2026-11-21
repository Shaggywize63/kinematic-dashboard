import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { scopeToSpark, apiPath, ok } from './spark';

/**
 * "People on this lead" card (connected-B2B / Spark & Ray): tag more customer people onto a lead by
 * linking an existing contact, remove a secondary person, and always show the card (even with no people
 * yet) so a rep can add the first. Backend: POST /crm/leads/:id/people, DELETE …/:linkId.
 */
const LEAD = {
  id: 'lead-1', first_name: '', last_name: '', company: 'Hindustan Unilever Limited',
  display_name: 'Hindustan Unilever Limited · Haldia · Instrumentation — Replace Becker VT 4.25',
  is_b2c: false, status: 'new', owner_id: 'u-asha', owner_name: 'Asha Menon',
  created_by: 'u-asha', created_at: '2026-11-18T10:00:00Z',
};
const P1 = { id: 'lk-1', contact_id: 'c-1', is_primary: true, name: 'Aadesh Saini', title: 'Instrumentation Executive', position: 0 };
const P2 = { id: 'lk-2', contact_id: 'c-2', is_primary: false, name: 'Suresh Rao', title: 'Maintenance Executive', position: 1 };
const PICKABLE = { id: 'c-2', full_name: 'Suresh Rao', first_name: 'Suresh', last_name: 'Rao', title: 'Maintenance Executive' };

interface Seen { method: string; path: string; body: any }

async function setup(page: Page, o: { spark?: boolean; people?: any[] } = {}): Promise<Seen[]> {
  const seen: Seen[] = [];
  // Wide viewport so the right-sidebar "People on this lead" card gets its full width
  // (the name span is nowrap + minWidth:0 and collapses to 0 in a cramped aside).
  await page.setViewportSize({ width: 1600, height: 1000 });
  if (o.spark !== false) await scopeToSpark(page);
  await seedSession(page, SEED_USER);
  const people = o.people ?? [P1];
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: { field_overrides: {} } } },
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      let body: any = null;
      try { body = route.request().postDataJSON(); } catch { /* not json */ }
      if (method !== 'GET') seen.push({ method, path: p, body });
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1') return ok(route, LEAD);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1/people') return ok(route, people);
      if (method === 'GET' && p === '/api/v1/crm/contacts') return ok(route, [PICKABLE]);
      if (method === 'POST' && p === '/api/v1/crm/leads/lead-1/people') return ok(route, [P1, P2]);
      if (method === 'DELETE' && p === '/api/v1/crm/leads/lead-1/people/lk-2') return ok(route, [P1]);
      return false;
    },
  });
  return seen;
}

test.describe('People on this lead — tag / remove', () => {
  test('Spark: tag another person — the picker POSTs contact_id and the person appears', async ({ page }) => {
    const seen = await setup(page);
    await page.goto('/dashboard/crm/leads/lead-1');
    await expect(page.getByText('People on this lead')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Add a person' }).click();
    await page.getByPlaceholder(/Search a contact to tag/i).fill('Suresh');
    await page.getByRole('button', { name: /Suresh Rao/ }).click();

    await expect.poll(() => seen.filter((r) => r.method === 'POST' && r.path === '/api/v1/crm/leads/lead-1/people').length).toBe(1);
    const post = seen.find((r) => r.method === 'POST' && r.path === '/api/v1/crm/leads/lead-1/people');
    expect(post?.body.contact_id).toBe('c-2');
    // The newly-tagged secondary person now has a remove control in the card.
    await expect(page.getByRole('button', { name: 'Remove Suresh Rao' })).toBeVisible();
  });

  test('Spark: a secondary person can be removed (DELETE sent)', async ({ page }) => {
    const seen = await setup(page, { people: [P1, P2] });
    await page.goto('/dashboard/crm/leads/lead-1');
    const removeBtn = page.getByRole('button', { name: 'Remove Suresh Rao' });
    await expect(removeBtn).toBeVisible({ timeout: 30_000 });
    await removeBtn.click();
    await expect.poll(() => seen.filter((r) => r.method === 'DELETE' && r.path === '/api/v1/crm/leads/lead-1/people/lk-2').length).toBe(1);
  });

  test('Spark: an empty lead still shows the card with an Add control', async ({ page }) => {
    await setup(page, { people: [] });
    await page.goto('/dashboard/crm/leads/lead-1');
    await expect(page.getByText('People on this lead')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Add a person' })).toBeVisible();
  });

  test('another tenant (not Spark): no People card', async ({ page }) => {
    await setup(page, { spark: false, people: [P1] });
    await page.goto('/dashboard/crm/leads/lead-1');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('People on this lead')).toHaveCount(0);
  });
});
