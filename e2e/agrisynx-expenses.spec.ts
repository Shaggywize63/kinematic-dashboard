import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Agrisynx expense customisation (web). Every behaviour here is switched on by DATA on the policy
 * (`rules.category_labels`, `route_fields`, `single_line`, `odometer_camera_only`, and one allowed category) and
 * a policy without those keys must behave exactly as before — the "standard" tests below pin that down.
 *
 * Everything runs against an intercepted API and asserts on what the page shows and what it SENDS.
 */

const POLICY_ID = '55555555-5555-4555-8555-555555555555';
const ALL = ['mileage', 'travel', 'food', 'lodging', 'fuel', 'toll', 'misc'];
const cats = (on: string[], perDay: Record<string, number> = {}) => Object.fromEntries(ALL.map((c) => [c, {
  enabled: on.includes(c), per_day_limit: perDay[c] ?? null, per_claim_limit: null, per_month_limit: null, receipt_required_over: null,
}]));
const VEHICLES = [
  { id: 'two_wheeler', label: 'Two-wheeler', rate_per_km: 4 },
  { id: 'car', label: 'Car', rate_per_km: 9 },
];
const BASE = {
  mileage_rate: 12, receipt_required_over: 500, max_claim_amount: null, submit_within_days: 30,
  auto_approve_under: 0, escalate_over: null, enforcement: 'flag',
};
/** Today's policy: every category, no vehicle rates, none of the new keys. */
const STANDARD = { ...BASE, categories: cats(ALL) };
/** Today's vehicle policy: vehicle rates, every category, none of the new keys. */
const STANDARD_VEHICLE = { ...BASE, vehicle_rates: VEHICLES, odometer_photos_required: true, categories: cats(ALL) };
/** The Agrisynx setup: one category (mileage, called "Travel"), no route, one line, camera-only odometer. */
const AGRI = {
  ...BASE, vehicle_rates: VEHICLES, odometer_photos_required: true,
  categories: cats(['mileage'], { mileage: 500 }),
  category_labels: { mileage: 'Travel' }, route_fields: false, single_line: true, odometer_camera_only: true,
};

const myPolicy = (rules: unknown) => ({
  id: POLICY_ID, name: 'Field team', currency: 'INR', mileage_rate: 12, auto_approve_under: 0, escalate_over: null,
  require_receipt_over: 500, category_limits: null, is_active: true, rules,
});
const fullPolicy = (rules: unknown, extra: Record<string, unknown> = {}) => ({
  id: POLICY_ID, name: 'Field team', description: null, is_active: true, priority: 100, currency: 'INR',
  applies_to: { everyone: true, roles: [], org_role_ids: [], user_ids: [] }, effective_from: null, effective_to: null, rules, covers: 3, people: [], ...extra,
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIELD_USER = { ...SEED_USER, id: 'e2e-rep-1', name: 'E2E Rep', role: 'field_executive' };

interface Seen { method: string; path: string; url: string; body: any }
interface Opts {
  user?: Record<string, unknown>;
  rules?: unknown;
  /** What GET /policies answers (admins / approvers). Defaults to the one policy. */
  policies?: unknown[];
  history?: (url: URL) => unknown[];
  /** n-th POST /receipts answer (0-based). */
  receipt?: (n: number) => Record<string, unknown>;
  claim?: Record<string, unknown>;
  extra?: (route: Route, path: string, method: string) => Promise<boolean>;
}

async function setup(page: Page, o: Opts = {}) {
  const seen: Seen[] = [];
  let receipts = 0;
  const user = o.user ?? SEED_USER;
  await seedSession(page, user);
  await mockApi(page, {
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      if (!url.includes('/api/v1/expenses')) return false;
      const u = new URL(url);
      const path = u.pathname.replace('/api/v1/expenses', '');
      let body: any = null;
      try { body = route.request().postDataJSON(); } catch { /* not json */ }
      seen.push({ method, path, url, body });
      if (o.extra && (await o.extra(route, path, method))) return true;
      const ok = (data: unknown, more: Record<string, unknown> = {}) => route.fulfill({ json: { success: true, data, ...more } }).then(() => true);
      const rules = o.rules ?? STANDARD;
      if (method === 'GET' && path === '/policy') return ok(myPolicy(rules));
      if (method === 'GET' && path === '/policies') return ok(o.policies ?? [fullPolicy(rules)]);
      if (method === 'GET' && path === `/policies/${POLICY_ID}`) return ok(fullPolicy(rules));
      if (method === 'GET' && path === '/policies/presets') return ok([]);
      if (method === 'GET' && path === '/policies/roles') return ok({ legacy: [], org_roles: [] });
      if (method === 'GET' && path === '/odometer-history') return ok(o.history ? o.history(u) : []);
      if (method === 'GET' && path === '/claims/all') return ok([], { pagination: { total: 0, page: 1, limit: 25 } });
      if (method === 'GET' && path === '/claims/summary') {
        return ok({
          totals: { claims: 2, claimed: 700, pending_count: 1, pending_amount: 400, approved_count: 1, approved_amount: 300, reimbursed_count: 0, reimbursed_amount: 0, rejected_count: 0, rejected_amount: 0, auto_approved_count: 0, avg_turnaround_hours: null },
          by_status: [], by_month: [{ month: '2026-10', amount: 700, claims: 2 }], by_category: [{ category: 'mileage', amount: 700 }], top_people: [], by_policy: [],
        });
      }
      if (method === 'GET' && o.claim && path === `/claims/${o.claim.id}`) return ok(o.claim);
      if (method === 'POST' && path === '/claims/check') return ok({ policy: myPolicy(rules), total: 208, blocking: false, would_auto_approve: false, violations: [] });
      if (method === 'POST' && path === '/receipts') {
        const n = receipts++;
        return ok({
          url: `https://x.test/storage/v1/object/public/kinematic-receipts/o/u/odo-${n}.png`, path: `o/u/odo-${n}.png`, bucket: 'kinematic-receipts',
          content_type: 'image/png', size: 70, signed_url: `https://x.test/odo-${n}.png?token=1`, scan: null, ...(o.receipt ? o.receipt(n) : {}),
        });
      }
      if (method === 'POST' && path === '/claims') return ok({ id: 'c-new', status: 'draft', items: [] });
      if (method === 'PUT' && path === `/policies/${POLICY_ID}`) return ok(fullPolicy(rules));
      return false;
    },
  });
  return seen;
}

const claimPosted = (seen: Seen[]) => seen.find((r) => r.method === 'POST' && r.path === '/claims')?.body;

// ── the claim form ──────────────────────────────────────────────────────────
test.describe('Agrisynx expenses — single category, "Travel"', () => {
  test('no category picker; the only category reads "Travel"; no From / To; no "Add another expense"', async ({ page }) => {
    const seen = await setup(page, { rules: AGRI });
    await page.goto('/dashboard/expenses/new');
    await expect(page.getByRole('heading', { name: 'New expense claim' })).toBeVisible();

    // The line is on the one allowed category (mileage -> the vehicle flow) and shows its custom name.
    await expect(page.getByLabel('Vehicle', { exact: false })).toBeVisible();
    await expect(page.getByText('Travel', { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel('Category')).toHaveCount(0);
    // The built-in name never leaks through, in the form or in the policy card.
    await expect(page.getByText('Mileage', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Not reimbursed/)).toHaveCount(0);
    // The policy card names the category through the same label.
    await expect(page.getByText('Daily limits')).toBeVisible();

    // No route fields, no second line.
    await expect(page.getByText('From', { exact: true })).toHaveCount(0);
    await expect(page.getByText('To', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add another expense' })).toHaveCount(0);

    await page.getByLabel('Vehicle', { exact: false }).selectOption('car');
    await page.getByLabel('Odometer before the trip', { exact: false }).fill('100');
    await page.getByLabel('Odometer after the trip', { exact: false }).fill('160');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect.poll(() => claimPosted(seen)).toBeTruthy();
    expect(claimPosted(seen).items).toHaveLength(1);
    expect(claimPosted(seen).items[0]).toMatchObject({ category: 'mileage', vehicle_type: 'car', odometer_start: 100, odometer_end: 160, from_location: null, to_location: null });
  });

  test('a policy without the new keys is unchanged: picker, From / To and "Add another expense" are all there', async ({ page }) => {
    await setup(page, { rules: STANDARD });
    await page.goto('/dashboard/expenses/new');
    const picker = page.getByLabel('Category');
    await expect(picker).toBeVisible();
    await expect(picker.locator('option')).toHaveText(['Mileage', 'Travel', 'Food', 'Lodging', 'Fuel', 'Toll', 'Other']);
    await picker.selectOption('mileage');
    await expect(page.getByLabel('From', { exact: true })).toBeVisible();
    await expect(page.getByLabel('To', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add another expense' })).toBeVisible();
    await page.getByRole('button', { name: 'Add another expense' }).click();
    await expect(page.getByLabel('Category')).toHaveCount(2);
  });

  test('From / To are also gone from the plain distance form when route_fields is false', async ({ page }) => {
    await setup(page, { rules: { ...STANDARD, route_fields: false } });
    await page.goto('/dashboard/expenses/new');
    await page.getByLabel('Category').selectOption('mileage');
    await expect(page.getByLabel('Distance (km)', { exact: false })).toBeVisible();
    await expect(page.getByLabel('From', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('To', { exact: true })).toHaveCount(0);
  });

  test('one expense per claim hides the button but an existing multi-line claim stays editable and removable', async ({ page }) => {
    const claim = {
      id: 'c-multi', user_id: SEED_USER.id, claim_no: 'EXP-0100', title: null, status: 'draft', currency: 'INR', total_amount: 600, distance_km: null, gps_derived_km: null,
      approver_id: null, current_level: 1, submitted_at: null, reviewed_by: null, reviewed_at: null, review_note: null, ai_summary: null, ai_flags: [], created_at: '2026-10-08T09:00:00Z',
      items: [
        { id: 'i1', claim_id: 'c-multi', category: 'food', item_date: '2026-10-08', description: null, amount: 200, distance_km: null, from_location: null, to_location: null, merchant: 'A', receipt_url: null, ai_extracted: null, flagged: false, flag_reason: null },
        { id: 'i2', claim_id: 'c-multi', category: 'food', item_date: '2026-10-08', description: null, amount: 400, distance_km: null, from_location: null, to_location: null, merchant: 'B', receipt_url: null, ai_extracted: null, flagged: false, flag_reason: null },
      ],
    };
    await setup(page, { rules: { ...STANDARD, single_line: true }, claim });
    await page.goto('/dashboard/expenses/c-multi/edit');
    await expect(page.getByLabel('Category')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Add another expense' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Remove this expense' }).first().click();
    await expect(page.getByLabel('Category')).toHaveCount(1);
  });

  test('a line already on another category keeps its picker so it can be moved onto the allowed one', async ({ page }) => {
    const claim = {
      id: 'c-old', user_id: SEED_USER.id, claim_no: 'EXP-0101', title: null, status: 'draft', currency: 'INR', total_amount: 200, distance_km: null, gps_derived_km: null,
      approver_id: null, current_level: 1, submitted_at: null, reviewed_by: null, reviewed_at: null, review_note: null, ai_summary: null, ai_flags: [], created_at: '2026-10-08T09:00:00Z',
      items: [{ id: 'i1', claim_id: 'c-old', category: 'food', item_date: '2026-10-08', description: null, amount: 200, distance_km: null, from_location: null, to_location: null, merchant: 'A', receipt_url: null, ai_extracted: null, flagged: false, flag_reason: null }],
    };
    await setup(page, { rules: AGRI, claim });
    await page.goto('/dashboard/expenses/c-old/edit');
    const picker = page.getByLabel('Category');
    await expect(picker).toBeVisible();
    await expect(picker.locator('option')).toHaveText(['Travel', 'Food']);
  });

  test('"Travel" for mileage does not collide with the real Travel category while both are in use', async ({ page }) => {
    await setup(page, { rules: { ...STANDARD, category_labels: { mileage: 'Travel' } } });
    await page.goto('/dashboard/expenses/new');
    await expect(page.getByLabel('Category').locator('option')).toHaveText(['Travel (Mileage)', 'Travel', 'Food', 'Lodging', 'Fuel', 'Toll', 'Other']);
  });
});

// ── odometer: camera only ───────────────────────────────────────────────────
test.describe('Agrisynx expenses — odometer from the camera', () => {
  test('the photo is read: the reading is filled in, flagged "check it", and stays editable', async ({ page }) => {
    const seen = await setup(page, {
      rules: AGRI,
      receipt: (n) => ({ odometer: n === 0 ? { reading: 12340, confidence: 'high' } : { reading: null, confidence: null } }),
    });
    await page.goto('/dashboard/expenses/new');
    await page.getByLabel('Vehicle', { exact: false }).selectOption('two_wheeler');

    // Camera capture only — the existing input, and no second upload-only one.
    const files = page.locator('input[type=file]');
    await expect(files).toHaveCount(2);
    await expect(files.nth(0)).toHaveAttribute('capture', 'environment');
    await expect(files.nth(1)).toHaveAttribute('capture', 'environment');

    const before = page.getByLabel('Odometer before the trip', { exact: false });
    await files.nth(0).setInputFiles({ name: 'before.png', mimeType: 'image/png', buffer: PNG });
    await expect(before).toHaveValue('12340');
    await expect(page.getByText('Read from the photo — check it')).toBeVisible();

    // A second photo the model could not read: nothing is guessed, the rep is asked to type it.
    const after = page.getByLabel('Odometer after the trip', { exact: false });
    await files.nth(1).setInputFiles({ name: 'after.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText("Couldn't read the number — enter it")).toBeVisible();
    await expect(after).toHaveValue('');
    await after.fill('12392');
    await expect(page.getByText("Couldn't read the number — enter it")).toHaveCount(0);
    await expect(page.getByText('52 km', { exact: true })).toBeVisible();

    // Editing a read value drops the "check it" note; the value is whatever the rep types.
    await before.fill('12341');
    await expect(page.getByText('Read from the photo — check it')).toHaveCount(0);

    const uploads = seen.filter((r) => r.method === 'POST' && r.path === '/receipts');
    expect(uploads).toHaveLength(2);
    for (const u of uploads) expect(new URL(u.url).searchParams.get('scan')).toBe('odometer');
  });

  test('a newly taken photo replaces the reading with the one read from it', async ({ page }) => {
    await setup(page, { rules: AGRI, receipt: (n) => ({ odometer: { reading: n === 0 ? 500 : 650, confidence: 'medium' } }) });
    await page.goto('/dashboard/expenses/new');
    const files = page.locator('input[type=file]');
    const before = page.getByLabel('Odometer before the trip', { exact: false });
    await files.nth(0).setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
    await expect(before).toHaveValue('500');
    await files.nth(0).setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: PNG });
    await expect(before).toHaveValue('650');
  });

  test('without the flag nothing changes: the photo is stored (scan=0) and the reading is typed', async ({ page }) => {
    const seen = await setup(page, { rules: STANDARD_VEHICLE, receipt: () => ({ odometer: { reading: 99999, confidence: 'high' } }) });
    await page.goto('/dashboard/expenses/new');
    await page.getByLabel('Category').selectOption('mileage');
    await page.locator('input[type=file]').nth(0).setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('Photo attached', { exact: true })).toHaveCount(1);
    await expect(page.getByLabel('Odometer before the trip', { exact: false })).toHaveValue('');
    await expect(page.getByText('Read from the photo — check it')).toHaveCount(0);
    const up = seen.find((r) => r.method === 'POST' && r.path === '/receipts')!;
    expect(new URL(up.url).searchParams.get('scan')).toBe('0');
  });

  test('camera-only needs vehicle rates: without them the flat distance form is untouched', async ({ page }) => {
    await setup(page, { rules: { ...STANDARD, odometer_camera_only: true } });
    await page.goto('/dashboard/expenses/new');
    await page.getByLabel('Category').selectOption('mileage');
    await expect(page.getByLabel('Distance (km)', { exact: false })).toBeVisible();
    await expect(page.locator('input[type=file]')).toHaveCount(0);
  });
});

// ── last reading + history ──────────────────────────────────────────────────
const HISTORY = [
  { id: 'h2', claim_id: 'c-b', claim_no: 'EXP-0012', claim_status: 'approved', user_id: 'u-ravi', user_name: 'Ravi Kumar', item_date: '2026-10-08', vehicle_type: 'car', vehicle_label: 'Car', odometer_start: 8100, odometer_end: 8160, distance_km: 60, amount: 540, start_photo_url: 'https://x.test/ravi-start.png?token=1', end_photo_url: 'https://x.test/ravi-end.png?token=1', created_at: '2026-10-08T10:00:00Z' },
  { id: 'h1', claim_id: 'c-a', claim_no: 'EXP-0009', claim_status: 'submitted', user_id: 'u-asha', user_name: 'Asha Menon', item_date: '2026-10-07', vehicle_type: 'two_wheeler', vehicle_label: 'Two-wheeler', odometer_start: 12340, odometer_end: 12392, distance_km: 52, amount: 208, start_photo_url: 'https://x.test/asha-start.png?token=1', end_photo_url: null, created_at: '2026-10-07T10:00:00Z' },
];

test.describe('Agrisynx expenses — odometer history', () => {
  test('the claim form reminds the rep where the odometer stood last time (vehicle flow only)', async ({ page }) => {
    const seen = await setup(page, { rules: STANDARD_VEHICLE, history: () => HISTORY });
    await page.goto('/dashboard/expenses/new');
    await page.getByLabel('Category').selectOption('mileage');
    // Newest row first -> its "after" reading, with its date.
    await expect(page.getByText(/Last reading: 8,160 km \(.*2026\)/)).toBeVisible();
    expect(new URL(seen.find((r) => r.path === '/odometer-history')!.url).searchParams.get('limit')).toBe('5');
  });

  test('no hint, and no request, for a policy without vehicle rates', async ({ page }) => {
    const seen = await setup(page, { rules: STANDARD, history: () => HISTORY });
    await page.goto('/dashboard/expenses/new');
    await page.getByLabel('Category').selectOption('mileage');
    await expect(page.getByLabel('Distance (km)', { exact: false })).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.getByText(/Last reading/)).toHaveCount(0);
    expect(seen.some((r) => r.path === '/odometer-history')).toBe(false);
  });

  test('an approver sees everyone with a Person column, and can narrow by person and by date', async ({ page }) => {
    const seen = await setup(page, {
      rules: STANDARD_VEHICLE,
      history: (u) => HISTORY.filter((r) => (!u.searchParams.get('user_id') || r.user_id === u.searchParams.get('user_id')) && (!u.searchParams.get('from') || r.item_date >= u.searchParams.get('from')!)),
    });
    await page.goto('/dashboard/expenses');
    await page.getByRole('link', { name: 'Odometer' }).click();
    await expect(page.getByRole('heading', { name: 'Odometer' })).toBeVisible();
    const table = page.locator('table');
    await expect(page.locator('th', { hasText: 'Person' })).toBeVisible();
    await expect(table.getByText('Ravi Kumar')).toBeVisible();
    await expect(table.getByText('Asha Menon')).toBeVisible();
    await expect(table.getByText('8,160')).toBeVisible();
    const first = new URL(seen.filter((r) => r.path === '/odometer-history').pop()!.url);
    expect(first.searchParams.get('all')).toBe('1');
    expect(first.searchParams.get('limit')).toBe('50');

    await page.getByLabel('Person').selectOption('u-asha');
    await expect(table.getByText('Ravi Kumar')).toHaveCount(0);
    await expect(table.getByText('Asha Menon')).toBeVisible();
    expect(new URL(seen.filter((r) => r.path === '/odometer-history').pop()!.url).searchParams.get('user_id')).toBe('u-asha');

    // The person list keeps everyone seen so far, so another person can be picked straight away.
    await expect(page.getByLabel('Person').locator('option')).toHaveText(['Everyone', 'Asha Menon', 'Ravi Kumar']);

    await page.getByLabel('Person').selectOption('');
    await page.getByLabel('From date').fill('2026-10-08');
    await expect(table.getByText('Asha Menon')).toHaveCount(0);
    expect(new URL(seen.filter((r) => r.path === '/odometer-history').pop()!.url).searchParams.get('from')).toBe('2026-10-08');
  });

  test('photos open from the row without leaving the page', async ({ page }) => {
    await setup(page, { rules: STANDARD_VEHICLE, history: () => HISTORY });
    await page.goto('/dashboard/expenses/odometer');
    await expect(page.locator('table').getByText('Ravi Kumar')).toBeVisible();
    await page.getByRole('button', { name: 'Before photo' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('img')).toHaveAttribute('src', 'https://x.test/ravi-start.png?token=1');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard\/expenses\/odometer$/);
  });

  test('a rep sees only their own entries: no Person column, no all=1', async ({ page }) => {
    const seen = await setup(page, { user: FIELD_USER, rules: STANDARD_VEHICLE, history: () => [HISTORY[1]] });
    await page.goto('/dashboard/expenses');
    await page.getByRole('link', { name: 'Odometer' }).click();
    await expect(page.getByText('12,392')).toBeVisible();
    await expect(page.locator('th', { hasText: 'Person' })).toHaveCount(0);
    await expect(page.getByLabel('Person')).toHaveCount(0);
    const req = new URL(seen.filter((r) => r.path === '/odometer-history').pop()!.url);
    expect(req.searchParams.get('all')).toBeNull();
    expect(req.searchParams.get('user_id')).toBeNull();
  });

  test('the Odometer tab stays out of the way for a client without vehicle rates', async ({ page }) => {
    const seen = await setup(page, { rules: STANDARD });
    await page.goto('/dashboard/expenses');
    await expect(page.getByRole('link', { name: 'All claims' })).toBeVisible();
    await expect.poll(() => seen.some((r) => r.path === '/policies') && seen.some((r) => r.path === '/policy')).toBe(true);
    await page.waitForTimeout(400);
    await expect(page.getByRole('link', { name: 'Odometer' })).toHaveCount(0);
  });

  test('a rep on a vehicle policy gets the tab', async ({ page }) => {
    await setup(page, { user: FIELD_USER, rules: STANDARD_VEHICLE });
    await page.goto('/dashboard/expenses');
    await expect(page.getByRole('link', { name: 'Odometer' })).toBeVisible();
  });

  test('a rep on a plain policy sees no tabs at all, exactly as before', async ({ page }) => {
    const seen = await setup(page, { user: FIELD_USER, rules: STANDARD });
    await page.goto('/dashboard/expenses');
    await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();
    await expect.poll(() => seen.some((r) => r.path === '/policy')).toBe(true);
    await page.waitForTimeout(400);
    await expect(page.getByRole('navigation', { name: 'Expenses' })).toHaveCount(0);
    expect(seen.some((r) => r.path === '/policies')).toBe(false);
  });

  test('an approver gets the tab when any listed policy pays by vehicle, even if their own does not', async ({ page }) => {
    await setup(page, { rules: STANDARD, policies: [fullPolicy(STANDARD), { ...fullPolicy(STANDARD_VEHICLE), id: 'p2', name: 'Sales team' }] });
    await page.goto('/dashboard/expenses');
    await expect(page.getByRole('link', { name: 'Odometer' })).toBeVisible();
  });
});

// ── the admin side ──────────────────────────────────────────────────────────
test.describe('Agrisynx expenses — policy editor', () => {
  test('saving an untouched policy keeps the claim-form rules (and any rule this page does not know)', async ({ page }) => {
    const seen = await setup(page, { rules: { ...AGRI, future_rule: { a: 1 } } });
    await page.goto(`/dashboard/expenses/policies/${POLICY_ID}`);
    await expect(page.getByLabel('Display name for Mileage')).toHaveValue('Travel');
    await expect(page.getByRole('switch', { name: 'Show From / To on mileage lines' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: 'One expense per claim' })).toHaveAttribute('aria-checked', 'true');
    const camera = page.getByRole('switch', { name: /Odometer photo: camera only/ });
    await expect(camera).toBeEnabled();
    await expect(camera).toHaveAttribute('aria-checked', 'true');
    // The category table says what the rep will see.
    await expect(page.getByText('shown as Travel')).toBeVisible();
    await expect(page.getByText('Only Travel is allowed')).toBeVisible();

    await page.getByRole('button', { name: 'Save policy' }).click();
    await expect.poll(() => seen.find((r) => r.method === 'PUT')?.body).toBeTruthy();
    expect(seen.find((r) => r.method === 'PUT')!.body.rules).toMatchObject({
      category_labels: { mileage: 'Travel' }, route_fields: false, single_line: true, odometer_camera_only: true,
      odometer_photos_required: true, future_rule: { a: 1 },
      vehicle_rates: [{ id: 'two_wheeler', label: 'Two-wheeler', rate_per_km: 4 }, { id: 'car', label: 'Car', rate_per_km: 9 }],
    });
  });

  test('renaming, and switching the choices off again, are saved (an empty name list clears them)', async ({ page }) => {
    const seen = await setup(page, { rules: AGRI });
    await page.goto(`/dashboard/expenses/policies/${POLICY_ID}`);
    await page.getByLabel('Display name for Mileage').fill('');
    await page.getByLabel('Display name for Food').fill('Meals');
    await page.getByRole('switch', { name: 'Show From / To on mileage lines' }).click();
    await page.getByRole('switch', { name: 'One expense per claim' }).click();
    await page.getByRole('switch', { name: /Odometer photo: camera only/ }).click();
    await page.getByRole('button', { name: 'Save policy' }).click();
    await expect.poll(() => seen.find((r) => r.method === 'PUT')?.body).toBeTruthy();
    const rules = seen.find((r) => r.method === 'PUT')!.body.rules;
    expect(rules.category_labels).toEqual({ food: 'Meals' });
    expect(rules).toMatchObject({ route_fields: true, single_line: false, odometer_camera_only: false });
  });

  test('a new policy starts on the standard form and the camera switch waits for a vehicle type', async ({ page }) => {
    const seen = await setup(page, {
      extra: async (route, path, method) => {
        if (method === 'POST' && path === '/policies') { await route.fulfill({ status: 201, json: { success: true, data: { id: 'new-1' } } }); return true; }
        return false;
      },
    });
    await page.goto('/dashboard/expenses/policies/new');
    await page.getByLabel('Policy name', { exact: false }).fill('Field team');
    await expect(page.getByRole('switch', { name: 'Show From / To on mileage lines' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('switch', { name: 'One expense per claim' })).toHaveAttribute('aria-checked', 'false');
    const camera = page.getByRole('switch', { name: /Odometer photo: camera only/ });
    await expect(camera).toBeDisabled();
    await page.getByRole('button', { name: 'Add vehicle type' }).click();
    await page.getByLabel('Vehicle type 1', { exact: true }).fill('Bike');
    await page.getByLabel('Cost per km for Bike').fill('3');
    await expect(camera).toBeEnabled();

    await page.getByRole('button', { name: 'Create policy' }).click();
    await expect.poll(() => seen.find((r) => r.method === 'POST' && r.path === '/policies')?.body).toBeTruthy();
    const rules = seen.find((r) => r.method === 'POST' && r.path === '/policies')!.body.rules;
    expect(rules.category_labels).toEqual({});
    expect(rules).toMatchObject({ route_fields: true, single_line: false, odometer_camera_only: false });
  });

  test('the editor warns when a new name matches another category, and when only one category is left', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/expenses/policies/new');
    await page.getByLabel('Display name for Mileage').fill('Travel');
    await expect(page.getByText(/“Travel” is also the name of another category.*“Travel \(Mileage\)”/)).toBeVisible();
    // Switch every other category off: nothing left to collide with, and claim forms stop asking.
    for (const name of ['Travel', 'Food', 'Lodging', 'Fuel', 'Toll', 'Other']) await page.getByRole('switch', { name: `${name} allowed` }).first().click();
    await expect(page.getByText(/is also the name of another category/)).toHaveCount(0);
    await expect(page.getByText('Only Travel is allowed')).toBeVisible();
  });

  test('the policies list says what a policy changes about the claim form, and nothing for a standard one', async ({ page }) => {
    await setup(page, { rules: AGRI, policies: [fullPolicy(AGRI), { ...fullPolicy(STANDARD), id: 'p2', name: 'Head office' }] });
    await page.goto('/dashboard/expenses/policies');
    await expect(page.getByText('Claim form: only Travel · one expense per claim · no From / To · camera-only odometer')).toBeVisible();
    await expect(page.getByText(/Claim form:/)).toHaveCount(1);
  });
});

// ── showing a claim ─────────────────────────────────────────────────────────
function claim(items: Array<Record<string, unknown>>) {
  return {
    id: 'c-1', user_id: SEED_USER.id, claim_no: 'EXP-0200', title: 'Dealer visits', status: 'draft', currency: 'INR', total_amount: 600, distance_km: null, gps_derived_km: null,
    approver_id: null, current_level: 1, submitted_at: null, reviewed_by: null, reviewed_at: null, review_note: null, ai_summary: null, ai_flags: [], created_at: '2026-10-08T09:00:00Z',
    policy_id: POLICY_ID, policy_name: 'Field team', submit_count: 1, reimbursed_at: null, reimbursed_ref: null, user_name: 'E2E Admin', approvals: [],
    items: items.map((it, i) => ({
      id: `it${i}`, claim_id: 'c-1', category: 'mileage', item_date: '2026-10-08', description: null, amount: 208, distance_km: 52, from_location: null, to_location: null,
      merchant: null, receipt_url: null, ai_extracted: null, flagged: false, flag_reason: null, ...it,
    })),
  };
}

test.describe('Agrisynx expenses — showing a claim', () => {
  test('a mileage line with no route never prints "— → —" (for every client); a half route still does', async ({ page }) => {
    await setup(page, { rules: STANDARD, claim: claim([{ distance_km: 52 }, { distance_km: 30, from_location: 'Pune' }, { distance_km: 12, from_location: 'Pune', to_location: 'Nashik' }]) });
    await page.goto('/dashboard/expenses/c-1');
    await expect(page.getByText('Dealer visits').first()).toBeVisible();
    await expect(page.getByText('52 km', { exact: true })).toBeVisible();
    await expect(page.getByText('Pune → — · 30 km')).toBeVisible();
    await expect(page.getByText('Pune → Nashik · 12 km')).toBeVisible();
    await expect(page.getByText('— → —')).toHaveCount(0);
  });

  test('with From / To switched off the route is not shown, and the category uses the policy name', async ({ page }) => {
    await setup(page, { rules: AGRI, claim: claim([{ distance_km: 52, from_location: 'Pune', to_location: 'Nashik' }]) });
    await page.goto('/dashboard/expenses/c-1');
    await expect(page.getByText('Travel', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('52 km', { exact: true })).toBeVisible();
    await expect(page.getByText(/Pune/)).toHaveCount(0);
    await expect(page.getByText('Mileage', { exact: true })).toHaveCount(0);
  });
});

// ── all claims ──────────────────────────────────────────────────────────────
test.describe('Agrisynx expenses — all claims', () => {
  test('one category in use everywhere: no category filter and no "By category" chart', async ({ page }) => {
    await setup(page, { rules: AGRI });
    await page.goto('/dashboard/expenses/all');
    await expect(page.getByText('By month')).toBeVisible();
    await expect(page.getByLabel('Status')).toBeVisible();
    await expect(page.getByLabel('Category')).toHaveCount(0);
    await expect(page.getByText('By category')).toHaveCount(0);
  });

  test('several categories: the filter and the chart stay, with the policy names', async ({ page }) => {
    await setup(page, { rules: { ...STANDARD, category_labels: { mileage: 'Travel' } } });
    await page.goto('/dashboard/expenses/all');
    await expect(page.getByText('By category')).toBeVisible();
    await expect(page.getByLabel('Category').locator('option')).toHaveText(['All categories', 'Travel (Mileage)', 'Travel', 'Food', 'Lodging', 'Fuel', 'Toll', 'Other']);
  });

  test('policies that disagree on a name show the standard one rather than mislabel somebody', async ({ page }) => {
    await setup(page, {
      rules: STANDARD,
      policies: [fullPolicy({ ...STANDARD, category_labels: { food: 'Meals' } }), { ...fullPolicy({ ...STANDARD, category_labels: { food: 'Food & drink' } }), id: 'p2', name: 'Other' }],
    });
    await page.goto('/dashboard/expenses/all');
    await expect(page.getByLabel('Category').locator('option').nth(3)).toHaveText('Food');
  });
});

// ── the vehicle list is the claimant's policy; a sole vehicle is pre-selected ──────────────────────
const ONE_VEHICLE = [{ id: 'bike', label: 'Bike', rate_per_km: 3 }];
const vehicleRules = (vehicle_rates: unknown[]) => ({ ...STANDARD_VEHICLE, vehicle_rates });
const vehicleSelect = (page: Page) => page.getByLabel('Vehicle', { exact: false });
/** A saved draft with one mileage line; `vehicle_type` is whatever the line was filed with (null = blank). */
const mileageClaim = (vehicle_type: string | null) => claim([{ vehicle_type, odometer_start: 100, odometer_end: 160, distance_km: 60, amount: 180 }]);

test.describe('Agrisynx expenses — vehicle: only the policy\'s own, and pre-selected when there is one', () => {
  test('exactly one vehicle on the policy: a new mileage line already has it, with nothing else to pick', async ({ page }) => {
    const seen = await setup(page, { rules: vehicleRules(ONE_VEHICLE) });
    await page.goto('/dashboard/expenses/new');
    await page.getByLabel('Category').selectOption('mileage');

    const vehicle = vehicleSelect(page);
    await expect(vehicle).toHaveValue('bike');
    // The list is that one vehicle — no "Choose a vehicle…" to clear it back to, and no other vehicle.
    await expect(vehicle.locator('option')).toHaveText(['Bike · ₹3 / km']);

    // The rep only types the odometer; the vehicle goes with the line without being touched.
    await page.getByLabel('Odometer before the trip', { exact: false }).fill('100');
    await page.getByLabel('Odometer after the trip', { exact: false }).fill('160');
    await expect(page.getByText('₹180', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect.poll(() => claimPosted(seen)).toBeTruthy();
    expect(claimPosted(seen).items[0]).toMatchObject({ category: 'mileage', vehicle_type: 'bike', odometer_start: 100, odometer_end: 160 });
  });

  test('the pre-selected vehicle does not count as a started expense: a blank claim still asks for one', async ({ page }) => {
    const seen = await setup(page, { rules: vehicleRules(ONE_VEHICLE) });
    await page.goto('/dashboard/expenses/new');
    await page.getByLabel('Category').selectOption('mileage');
    await expect(vehicleSelect(page)).toHaveValue('bike');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByText('Add at least one expense')).toBeVisible();
    expect(claimPosted(seen)).toBeFalsy();
    // ...and the live policy check (debounced ~650 ms) has nothing to check yet.
    await page.waitForTimeout(1000);
    expect(seen.some((r) => r.path === '/claims/check')).toBe(false);
  });

  test('two vehicles: nothing is pre-selected, the person picks, and both are listed', async ({ page }) => {
    const seen = await setup(page, { rules: vehicleRules(VEHICLES) });
    await page.goto('/dashboard/expenses/new');
    await page.getByLabel('Category').selectOption('mileage');

    const vehicle = vehicleSelect(page);
    await expect(vehicle).toHaveValue('');
    await expect(vehicle.locator('option')).toHaveText(['Choose a vehicle…', 'Two-wheeler · ₹4 / km', 'Car · ₹9 / km']);

    await vehicle.selectOption('car');
    await page.getByLabel('Odometer before the trip', { exact: false }).fill('100');
    await page.getByLabel('Odometer after the trip', { exact: false }).fill('160');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect.poll(() => claimPosted(seen)).toBeTruthy();
    expect(claimPosted(seen).items[0]).toMatchObject({ vehicle_type: 'car' });
  });

  test('two vehicles and a line that only has a note: no vehicle is invented for it', async ({ page }) => {
    const seen = await setup(page, { rules: vehicleRules(VEHICLES) });
    await page.goto('/dashboard/expenses/new');
    await page.getByLabel('Category').selectOption('mileage');
    await page.getByPlaceholder('Optional').fill('Visited dealers');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByText(/needs a vehicle and the odometer readings/)).toBeVisible();
    expect(claimPosted(seen)).toBeFalsy();
  });

  test('an existing line with a blank vehicle gets the sole vehicle, and saving sends it', async ({ page }) => {
    const seen = await setup(page, {
      rules: vehicleRules(ONE_VEHICLE), claim: mileageClaim(null),
      extra: async (route, path, method) => {
        if (method === 'PATCH' && path === '/claims/c-1') { await route.fulfill({ json: { success: true, data: { id: 'c-1', status: 'draft', items: [] } } }); return true; }
        return false;
      },
    });
    await page.goto('/dashboard/expenses/c-1/edit');
    await expect(vehicleSelect(page)).toHaveValue('bike');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect.poll(() => seen.find((r) => r.method === 'PATCH' && r.path === '/claims/c-1')?.body).toBeTruthy();
    expect(seen.find((r) => r.method === 'PATCH' && r.path === '/claims/c-1')!.body.items[0]).toMatchObject({ id: 'it0', vehicle_type: 'bike', odometer_start: 100, odometer_end: 160 });
  });

  test('an existing line that already has a vehicle keeps it when the policy has two', async ({ page }) => {
    const seen = await setup(page, {
      rules: vehicleRules(VEHICLES), claim: mileageClaim('car'),
      extra: async (route, path, method) => {
        if (method === 'PATCH' && path === '/claims/c-1') { await route.fulfill({ json: { success: true, data: { id: 'c-1', status: 'draft', items: [] } } }); return true; }
        return false;
      },
    });
    await page.goto('/dashboard/expenses/c-1/edit');
    await expect(vehicleSelect(page)).toHaveValue('car');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect.poll(() => seen.find((r) => r.method === 'PATCH' && r.path === '/claims/c-1')?.body).toBeTruthy();
    expect(seen.find((r) => r.method === 'PATCH' && r.path === '/claims/c-1')!.body.items[0]).toMatchObject({ vehicle_type: 'car' });
  });

  test('an existing line already on the policy\'s only vehicle is untouched', async ({ page }) => {
    const seen = await setup(page, {
      rules: vehicleRules(ONE_VEHICLE), claim: mileageClaim('bike'),
      extra: async (route, path, method) => {
        if (method === 'PATCH' && path === '/claims/c-1') { await route.fulfill({ json: { success: true, data: { id: 'c-1', status: 'draft', items: [] } } }); return true; }
        return false;
      },
    });
    await page.goto('/dashboard/expenses/c-1/edit');
    await expect(vehicleSelect(page)).toHaveValue('bike');
    await expect(vehicleSelect(page).locator('option')).toHaveCount(1);
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect.poll(() => seen.find((r) => r.method === 'PATCH' && r.path === '/claims/c-1')?.body).toBeTruthy();
    expect(seen.find((r) => r.method === 'PATCH' && r.path === '/claims/c-1')!.body.items[0]).toMatchObject({ vehicle_type: 'bike' });
  });

  test('a policy without vehicle rates is unchanged: no vehicle select at all', async ({ page }) => {
    await setup(page, { rules: STANDARD });
    await page.goto('/dashboard/expenses/new');
    await page.getByLabel('Category').selectOption('mileage');
    await expect(vehicleSelect(page)).toHaveCount(0);
    await expect(page.getByLabel('Distance (km)', { exact: false })).toBeVisible();
  });
});
