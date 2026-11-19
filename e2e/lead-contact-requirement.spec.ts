import { test, expect, type Page, type Locator } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { scopeToSpark, apiPath, ok } from './spark';

/**
 * Inline edit of a captured contact's free-text `requirement` on the lead
 * detail "Contacts & requirements" card (connected-B2B / Spark & Ray only).
 *
 * The requirement used to be read-only here and only accrued from visits, so an
 * admin / the lead's creator can now correct it inline. The edit PATCHes
 * /crm/contacts/:id with { requirement } and updates the card in place.
 */

const LEAD = {
  id: 'lead-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair',
  company: 'Nair Steel', is_b2c: false, status: 'working', owner_id: 'u-asha', owner_name: 'Asha Menon',
  created_by: 'someone-else', created_at: '2026-09-20T10:00:00Z',
};
const CONTACT = {
  id: 'c-1', full_name: 'Sandip Kundu', first_name: 'Sandip', last_name: 'Kundu',
  title: 'DIW', department: 'Maintenance', phone: '9163393449', email: 'sandipkundu@electrosteel.com',
  requirement: 'New business opportunities and feedback of previous supply.',
};
const REQ = 'New business opportunities and feedback of previous supply.';

interface Seen { method: string; path: string; body: any }

async function setup(page: Page, o: { spark?: boolean; role?: string } = {}): Promise<Seen[]> {
  const seen: Seen[] = [];
  const user = o.role ? { ...SEED_USER, role: o.role } : SEED_USER;
  if (o.spark !== false) await scopeToSpark(page);
  await seedSession(page, user);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: { field_overrides: {} } } },
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      let body: any = null;
      try { body = route.request().postDataJSON(); } catch { /* not json */ }
      if (method !== 'GET') seen.push({ method, path: p, body });
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1') return ok(route, LEAD);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1/contacts') return ok(route, [CONTACT]);
      if (method === 'PATCH' && p === '/api/v1/crm/contacts/c-1') return ok(route, { ...CONTACT, ...(body ?? {}) });
      return false;
    },
  });
  return seen;
}

// Scope every query to the "Contacts & requirements" card so the sidebar search
// box and other page controls can't match.
async function openCard(page: Page): Promise<Locator> {
  await page.goto('/dashboard/crm/leads/lead-1');
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Contacts & requirements' }) });
  await expect(card.getByText('Sandip Kundu')).toBeVisible({ timeout: 30_000 });
  return card;
}

test.describe('Lead contact requirement — inline edit', () => {
  test('an admin edits the requirement; the PATCH carries it and the card updates', async ({ page }) => {
    const seen = await setup(page);
    const card = await openCard(page);
    await expect(card.getByText(REQ)).toBeVisible();
    await card.getByRole('button', { name: 'Edit' }).click();
    const box = card.getByRole('textbox');
    await expect(box).toHaveValue(REQ);
    await box.fill('Replace ASCO pulse valves with MAC pulse valves.');
    await card.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => seen.filter((r) => r.method === 'PATCH' && r.path === '/api/v1/crm/contacts/c-1').length).toBe(1);
    const patch = seen.find((r) => r.method === 'PATCH' && r.path === '/api/v1/crm/contacts/c-1');
    expect(patch?.body.requirement).toBe('Replace ASCO pulse valves with MAC pulse valves.');
    await expect(card.getByText('Replace ASCO pulse valves with MAC pulse valves.')).toBeVisible();
  });

  test('Cancel discards the change (no PATCH)', async ({ page }) => {
    const seen = await setup(page);
    const card = await openCard(page);
    await card.getByRole('button', { name: 'Edit' }).click();
    await card.getByRole('textbox').fill('something else');
    await card.getByRole('button', { name: 'Cancel' }).click();
    await expect(card.getByText(REQ)).toBeVisible();
    expect(seen.filter((r) => r.method === 'PATCH').length).toBe(0);
  });

  test('a field rep (non-admin, not the creator) sees no Edit control', async ({ page }) => {
    await setup(page, { role: 'executive' });
    const card = await openCard(page);
    await expect(card.getByText(REQ)).toBeVisible();
    await expect(card.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });

  test('another tenant (not Spark) gets no inline editor', async ({ page }) => {
    await setup(page, { spark: false });
    const card = await openCard(page);
    await expect(card.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });
});
