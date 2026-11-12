import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, fail } from './spark';

/**
 * Duplicate accounts page: GET /crm/accounts/similar lists groups of look-alike accounts; the admin picks the one
 * to keep and merges the rest via POST /crm/accounts/merge (dry_run:true previews). All API calls are mocked.
 */

const acc = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, city: null, state: null, industry: null, owner_id: null, owner_name: null,
  created_at: '2026-03-01T00:00:00Z', contact_count: 0, lead_count: 0, deal_count: 0, ...over,
});

// Group A: "NTPC Lara Ltd." has the most records so it is the default keep (even though it is the newer one).
const GROUP_A = {
  key: 'ntpc-lara', score: 0.94,
  accounts: [
    acc('a-1', 'NTPC Lara', { city: 'Raigarh', state: 'Chhattisgarh', industry: 'Power', owner_name: 'Asha Rao', created_at: '2026-01-10T00:00:00Z', contact_count: 1, lead_count: 0, deal_count: 0 }),
    acc('a-2', 'NTPC Lara Ltd.', { industry: 'Power', created_at: '2026-02-10T00:00:00Z', contact_count: 3, lead_count: 2, deal_count: 1 }),
    acc('a-3', 'NTPC Lara Limited', { created_at: '2026-03-10T00:00:00Z', contact_count: 0, lead_count: 1, deal_count: 0 }),
  ],
};
// Group B: a tie on counts, so the oldest account is the default keep.
const GROUP_B = {
  key: 'acme-forge', score: 1,
  accounts: [
    acc('b-1', 'Acme Forge', { created_at: '2026-05-01T00:00:00Z', contact_count: 1 }),
    acc('b-2', 'Acme Forge ', { created_at: '2026-02-01T00:00:00Z', contact_count: 1 }),
  ],
};

const MOVED = {
  contacts: 6, leads: 4, converted_leads: 0, deals: 2, activities: 0, notes: 0, sites: 0, visits: 0,
  account_updates: 0, expenses: 0, form_submissions: 0, child_accounts: 0,
};

type Calls = { similar: string[]; merges: Record<string, any>[] };

async function setup(page: Page, o: {
  groups?: unknown[]; mergeStatus?: number; mergeMessage?: string; dupes?: unknown[]; user?: Record<string, unknown>;
} = {}): Promise<Calls> {
  const calls: Calls = { similar: [], merges: [] };
  await seedSession(page, o.user || SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/accounts/similar') {
        calls.similar.push(url);
        return ok(route, { groups: o.groups ?? [GROUP_A, GROUP_B] });
      }
      if (method === 'POST' && p === '/api/v1/crm/accounts/merge') {
        const body = route.request().postDataJSON() as Record<string, any>;
        calls.merges.push(body);
        if (o.mergeStatus && o.mergeStatus >= 400) return fail(route, o.mergeStatus, o.mergeMessage || 'Only admins can merge accounts');
        const keepName = [...GROUP_A.accounts, ...GROUP_B.accounts].find((a) => a.id === body.keep_id)?.name.trim() || 'Kept';
        return ok(route, {
          dry_run: !!body.dry_run,
          kept: { id: body.keep_id, org_id: 'o', name: keepName, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
          merged_ids: body.merge_ids,
          moved: MOVED,
          skipped: [],
          duplicate_contacts: body.dry_run ? [] : (o.dupes ?? []),
        });
      }
      return false;
    },
  });
  return calls;
}

const group = (page: Page, key: string) => page.getByTestId(`dup-group-${key}`);
const acct = (page: Page, id: string) => page.getByTestId(`dup-account-${id}`);

test.describe('Duplicate accounts', () => {
  test('groups render with names, details and counts, plus the header count', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/accounts/duplicates');
    await expect(page.getByRole('heading', { name: /Duplicate accounts/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: /Duplicate accounts/ })).toContainText('2 groups');
    await expect(group(page, 'ntpc-lara')).toBeVisible();
    await expect(group(page, 'acme-forge')).toBeVisible();

    const second = acct(page, 'a-2');
    await expect(second).toContainText('NTPC Lara Ltd.');
    await expect(second).toContainText('3 contacts · 2 leads · 1 deal');
    const first = acct(page, 'a-1');
    await expect(first).toContainText('Raigarh, Chhattisgarh');
    await expect(first).toContainText('Power');
    await expect(first).toContainText('Owner: Asha Rao');
    await expect(first).toContainText('1 contact · 0 leads · 0 deals');
    await expect(page.getByTestId('dup-group-ntpc-lara').getByText('94% match')).toBeVisible();
  });

  test('default keep is the account with the most records; a tie goes to the oldest', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/accounts/duplicates');
    await expect(group(page, 'ntpc-lara')).toBeVisible({ timeout: 60_000 });
    await expect(acct(page, 'a-2').getByRole('radio', { name: 'Keep this one' })).toBeChecked();
    await expect(acct(page, 'a-1').getByRole('radio', { name: 'Keep this one' })).not.toBeChecked();
    // The kept account has no merge checkbox; the others are ticked.
    await expect(acct(page, 'a-2').getByRole('checkbox')).toHaveCount(0);
    await expect(acct(page, 'a-1').getByRole('checkbox', { name: 'Merge into the kept account' })).toBeChecked();
    await expect(acct(page, 'a-3').getByRole('checkbox', { name: 'Merge into the kept account' })).toBeChecked();
    // Tie on records: b-2 is older.
    await expect(acct(page, 'b-2').getByRole('radio', { name: 'Keep this one' })).toBeChecked();
    await expect(acct(page, 'b-1').getByRole('radio', { name: 'Keep this one' })).not.toBeChecked();
  });

  test('Preview sends dry_run:true and shows what would move, without merging', async ({ page }) => {
    const calls = await setup(page);
    await page.goto('/dashboard/crm/accounts/duplicates');
    await expect(group(page, 'ntpc-lara')).toBeVisible({ timeout: 60_000 });
    await group(page, 'ntpc-lara').getByRole('button', { name: 'Preview' }).click();
    await expect.poll(() => calls.merges.length).toBe(1);
    expect(calls.merges[0]).toEqual({ keep_id: 'a-2', merge_ids: ['a-1', 'a-3'], dry_run: true });
    await expect(page.getByTestId('dup-preview-ntpc-lara')).toContainText('Will move 6 contacts, 4 leads, 2 deals');
    // Still listed: a preview changes nothing.
    await expect(group(page, 'ntpc-lara')).toBeVisible();
  });

  test('Merge asks first, then sends keep_id + merge_ids, removes the group and toasts', async ({ page }) => {
    const calls = await setup(page, { dupes: [
      { keep_contact_id: 'c-1', other_contact_id: 'c-2', reason: 'same_email' },
      { keep_contact_id: 'c-3', other_contact_id: 'c-4', reason: 'same_phone' },
    ] });
    await page.goto('/dashboard/crm/accounts/duplicates');
    await expect(group(page, 'ntpc-lara')).toBeVisible({ timeout: 60_000 });

    await group(page, 'ntpc-lara').getByRole('button', { name: 'Merge', exact: true }).click();
    // Inline confirmation (not a browser dialog); nothing is sent yet.
    const confirm = page.getByTestId('dup-confirm-ntpc-lara');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Merge 2 accounts into NTPC Lara Ltd.?');
    await expect(confirm).toContainText('removed from lists');
    expect(calls.merges).toHaveLength(0);

    // Cancel closes it without sending anything.
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    expect(calls.merges).toHaveLength(0);

    await group(page, 'ntpc-lara').getByRole('button', { name: 'Merge', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, merge' }).click();
    await expect.poll(() => calls.merges.length).toBe(1);
    expect(calls.merges[0]).toEqual({ keep_id: 'a-2', merge_ids: ['a-1', 'a-3'] });
    expect(calls.merges[0]).not.toHaveProperty('dry_run');

    await expect(page.getByText('Merged 2 accounts into NTPC Lara Ltd.. 6 contacts, 4 leads, 2 deals moved.')).toBeVisible();
    await expect(group(page, 'ntpc-lara')).toHaveCount(0);
    await expect(group(page, 'acme-forge')).toBeVisible();
    await expect(page.getByTestId('dup-notice')).toContainText('2 contacts look like duplicates: check them in the account');
    await expect(page.getByRole('heading', { name: /Duplicate accounts/ })).toContainText('1 group');
  });

  test('un-ticking an account, or changing the kept one, changes merge_ids', async ({ page }) => {
    const calls = await setup(page);
    await page.goto('/dashboard/crm/accounts/duplicates');
    await expect(group(page, 'ntpc-lara')).toBeVisible({ timeout: 60_000 });

    await acct(page, 'a-3').getByRole('checkbox').uncheck();
    await group(page, 'ntpc-lara').getByRole('button', { name: 'Merge', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, merge' }).click();
    await expect.poll(() => calls.merges.length).toBe(1);
    expect(calls.merges[0]).toEqual({ keep_id: 'a-2', merge_ids: ['a-1'] });
  });

  test('picking another account to keep moves the merge set', async ({ page }) => {
    const calls = await setup(page);
    await page.goto('/dashboard/crm/accounts/duplicates');
    await expect(group(page, 'ntpc-lara')).toBeVisible({ timeout: 60_000 });
    await acct(page, 'a-1').getByRole('radio', { name: 'Keep this one' }).check();
    await expect(acct(page, 'a-1').getByRole('checkbox')).toHaveCount(0);
    await expect(acct(page, 'a-2').getByRole('checkbox', { name: 'Merge into the kept account' })).toBeChecked();
    await group(page, 'ntpc-lara').getByRole('button', { name: 'Preview' }).click();
    await expect.poll(() => calls.merges.length).toBe(1);
    expect(calls.merges[0]).toEqual({ keep_id: 'a-1', merge_ids: ['a-2', 'a-3'], dry_run: true });
  });

  test('unticking every other account disables Preview and Merge', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/accounts/duplicates');
    await expect(group(page, 'acme-forge')).toBeVisible({ timeout: 60_000 });
    await acct(page, 'b-1').getByRole('checkbox').uncheck();
    await expect(group(page, 'acme-forge').getByRole('button', { name: 'Preview' })).toBeDisabled();
    await expect(group(page, 'acme-forge').getByRole('button', { name: 'Merge', exact: true })).toBeDisabled();
  });

  test('"Not duplicates" hides the group and it stays hidden after a reload', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/accounts/duplicates');
    await expect(group(page, 'acme-forge')).toBeVisible({ timeout: 60_000 });
    await group(page, 'acme-forge').getByRole('button', { name: 'Not duplicates' }).click();
    await expect(group(page, 'acme-forge')).toHaveCount(0);
    await expect(group(page, 'ntpc-lara')).toBeVisible();

    await page.reload();
    await expect(group(page, 'ntpc-lara')).toBeVisible({ timeout: 60_000 });
    await expect(group(page, 'acme-forge')).toHaveCount(0);
    await expect(page.getByText('1 group hidden as not duplicates.')).toBeVisible();

    await page.getByRole('button', { name: 'Show again' }).click();
    await expect(group(page, 'acme-forge')).toBeVisible();
  });

  test('empty state, and the Min match select refetches with min_score', async ({ page }) => {
    const calls = await setup(page, { groups: [] });
    await page.goto('/dashboard/crm/accounts/duplicates');
    await expect(page.getByText('No duplicate accounts found')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => calls.similar.length).toBe(1);
    expect(calls.similar[0]).toContain('min_score=0.88');

    await page.getByLabel('Min match').selectOption('0.75');
    await expect.poll(() => calls.similar.length).toBe(2);
    expect(calls.similar[1]).toContain('min_score=0.75');
    await page.getByLabel('Min match').selectOption('1');
    await expect.poll(() => calls.similar.length).toBe(3);
    expect(calls.similar[2]).toMatch(/min_score=1(&|$)/);
  });

  test('a refused merge (403) shows the admin-only message and keeps the group', async ({ page }) => {
    const calls = await setup(page, { mergeStatus: 403 });
    await page.goto('/dashboard/crm/accounts/duplicates');
    await expect(group(page, 'ntpc-lara')).toBeVisible({ timeout: 60_000 });
    await group(page, 'ntpc-lara').getByRole('button', { name: 'Merge', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, merge' }).click();
    await expect.poll(() => calls.merges.length).toBe(1);
    await expect(page.getByTestId('dup-error-ntpc-lara')).toContainText('Only admins can merge accounts');
    await expect(group(page, 'ntpc-lara')).toBeVisible();
    await expect(page.getByTestId('dup-confirm-ntpc-lara')).toHaveCount(0);
  });

  test('a failed load shows the error with Try again', async ({ page }) => {
    await seedSession(page, SEED_USER);
    let n = 0;
    await mockApi(page, {
      onRequest: async (route, url, method) => {
        if (method === 'GET' && apiPath(url) === '/api/v1/crm/accounts/similar') {
          n += 1;
          return n === 1 ? fail(route, 500, 'Server exploded') : ok(route, { groups: [GROUP_B] });
        }
        return false;
      },
    });
    await page.goto('/dashboard/crm/accounts/duplicates');
    await expect(page.getByText('Could not load duplicate accounts')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Server exploded')).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(group(page, 'acme-forge')).toBeVisible();
  });

  test('the Accounts page links to Find duplicates', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/crm/accounts');
    const link = page.getByRole('link', { name: 'Find duplicates' });
    await expect(link).toBeVisible({ timeout: 60_000 });
    await expect(link).toHaveAttribute('href', '/dashboard/crm/accounts/duplicates');
    await link.click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/accounts\/duplicates$/);
    await expect(page.getByRole('heading', { name: /Duplicate accounts/ })).toBeVisible({ timeout: 60_000 });
  });

  test('works at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await setup(page);
    await page.goto('/dashboard/crm/accounts/duplicates');
    await expect(group(page, 'ntpc-lara')).toBeVisible({ timeout: 60_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(group(page, 'ntpc-lara').getByRole('button', { name: 'Not duplicates' })).toBeVisible();
  });
});

test.describe('Account page contacts', () => {
  test('shows the count and an empty state when there are no contacts', async ({ page }) => {
    await seedSession(page, SEED_USER);
    await mockApi(page, {
      onRequest: async (route, url, method) => {
        const p = apiPath(url);
        if (method === 'GET' && p === '/api/v1/crm/accounts/acc-1') return ok(route, { id: 'acc-1', org_id: 'o', name: 'Acme Forge', created_at: '2026-01-05T09:00:00Z', updated_at: '2026-01-05T09:00:00Z' });
        if (method === 'GET' && /^\/api\/v1\/crm\/accounts\/acc-1\/(contacts|deals|notes|activities)$/.test(p)) return ok(route, []);
        return false;
      },
    });
    await page.goto('/dashboard/crm/accounts/acc-1');
    await expect(page.getByText('Contacts (0)')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('account-contacts-empty')).toContainText('No contacts yet.');
  });
});
