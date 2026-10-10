import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Expenses: claimant, approver and admin flows against an intercepted API.
 * The assertions that matter most are the product rules: a rejection can't be
 * sent without a remark, the remark is shown back to the claimant, receipts are
 * uploaded as multipart, and the policy check surfaces problems before submit.
 */

const CLAIM_ID = '11111111-1111-4111-8111-111111111111';
const REVIEW_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_A = '33333333-3333-4333-8333-333333333331';
const ITEM_B = '33333333-3333-4333-8333-333333333332';
const REV_A = '44444444-4444-4444-8444-444444444441';
const REV_B = '44444444-4444-4444-8444-444444444442';
const POLICY_ID = '55555555-5555-4555-8555-555555555555';

const rules = {
  mileage_rate: 12, receipt_required_over: 500, max_claim_amount: null, submit_within_days: 30,
  auto_approve_under: 300, escalate_over: 10000, enforcement: 'flag',
  categories: Object.fromEntries(['mileage', 'travel', 'food', 'lodging', 'fuel', 'toll', 'misc'].map((c) => [c, {
    enabled: true, per_day_limit: c === 'food' ? 500 : null, per_claim_limit: null, per_month_limit: null, receipt_required_over: null,
  }])),
};

const REJECTED = {
  id: CLAIM_ID, user_id: SEED_USER.id, claim_no: 'EXP-0007', title: 'Pune client visit', status: 'rejected', currency: 'INR',
  total_amount: 1850, approved_amount: null, distance_km: null, gps_derived_km: null, approver_id: null, current_level: 1,
  submitted_at: '2026-10-02T09:00:00Z', reviewed_by: 'm1', reviewed_at: '2026-10-03T10:00:00Z',
  review_note: 'Hotel receipt is unreadable — upload a clearer photo.', reviewer_name: 'Meera Rao', ai_summary: null,
  ai_flags: [{ code: 'receipt_missing', severity: 'warn', detail: 'Lodging of ₹1,500 has no receipt.', item_id: ITEM_A }],
  policy_name: 'Field sales rep', submit_count: 1, reimbursed_at: null, reimbursed_ref: null, created_at: '2026-10-01T09:00:00Z', user_name: 'E2E Admin',
  items: [
    { id: ITEM_A, claim_id: CLAIM_ID, category: 'lodging', item_date: '2026-10-01', description: null, amount: 1500, distance_km: null, from_location: null, to_location: null,
      merchant: 'Hotel Sahyadri', receipt_url: 'https://x.test/storage/v1/object/public/kinematic-receipts/o/u/r.jpg', receipt_signed_url: 'https://x.test/r.jpg?token=1',
      ai_extracted: null, flagged: true, flag_reason: 'Lodging of ₹1,500 has no receipt.', decision: 'rejected', decision_note: 'Receipt is blurry' },
    { id: ITEM_B, claim_id: CLAIM_ID, category: 'food', item_date: '2026-10-01', description: 'Dinner', amount: 350, distance_km: null, from_location: null, to_location: null,
      merchant: 'Vaishali', receipt_url: null, ai_extracted: null, flagged: false, flag_reason: null, decision: 'approved', decision_note: null },
  ],
  approvals: [{
    id: 'ap1', claim_id: CLAIM_ID, level: 1, round: 1, approver_id: 'm1', status: 'rejected', note: 'Hotel receipt is unreadable — upload a clearer photo.',
    decided_at: '2026-10-03T10:00:00Z', approver_name: 'Meera Rao',
    item_decisions: [{ item_id: ITEM_A, category: 'lodging', amount: 1500, decision: 'rejected', note: 'Receipt is blurry' }, { item_id: ITEM_B, category: 'food', amount: 350, decision: 'approved', note: null }],
  }],
};

const TO_REVIEW = {
  id: REVIEW_ID, user_id: 'u-other', claim_no: 'EXP-0011', title: 'Mumbai trip', status: 'submitted', currency: 'INR', total_amount: 900,
  approved_amount: null, distance_km: null, gps_derived_km: null, approver_id: SEED_USER.id, current_level: 1, submitted_at: '2026-10-04T09:00:00Z',
  reviewed_by: null, reviewed_at: null, review_note: null, ai_summary: 'Two expenses totalling ₹900.', ai_flags: [], policy_name: 'Field sales rep',
  submit_count: 1, reimbursed_at: null, reimbursed_ref: null, created_at: '2026-10-04T08:00:00Z', user_name: 'Ravi Kumar', employee_id: 'E102',
  items: [
    { id: REV_A, claim_id: REVIEW_ID, category: 'food', item_date: '2026-10-04', description: null, amount: 400, distance_km: null, from_location: null, to_location: null, merchant: 'Cafe',
      receipt_url: null, ai_extracted: null, flagged: false, flag_reason: null, decision: null, decision_note: null },
    { id: REV_B, claim_id: REVIEW_ID, category: 'toll', item_date: '2026-10-04', description: null, amount: 500, distance_km: null, from_location: null, to_location: null, merchant: null,
      receipt_url: null, ai_extracted: null, flagged: false, flag_reason: null, decision: null, decision_note: null },
  ],
  approvals: [{ id: 'ap2', claim_id: REVIEW_ID, level: 1, round: 1, approver_id: SEED_USER.id, status: 'pending', note: null, decided_at: null, approver_name: 'E2E Admin' }],
};

const MY_POLICY = {
  id: POLICY_ID, name: 'Field sales rep', currency: 'INR', mileage_rate: 12, auto_approve_under: 300, escalate_over: 10000,
  require_receipt_over: 500, category_limits: { food: 500 }, is_active: true, rules,
};

const POLICY = {
  id: POLICY_ID, name: 'Field sales rep', description: 'Everyday travel and meals', is_active: true, priority: 100, currency: 'INR',
  applies_to: { everyone: true, roles: [], org_role_ids: [], user_ids: [] }, effective_from: null, effective_to: null, rules, covers: 24, people: [],
};

const PRESETS = [
  { key: 'blank', name: 'Blank policy', description: 'Start empty', rules },
  { key: 'strict', name: 'Strict — block on violation', description: 'A receipt for every expense.', rules: { ...rules, receipt_required_over: 0, enforcement: 'block' } },
];

interface Seen { requests: Array<{ method: string; path: string; body: unknown }> }

async function setup(page: Page, extra?: (route: Route, path: string, method: string) => Promise<boolean> | boolean): Promise<Seen> {
  const seen: Seen = { requests: [] };
  await seedSession(page);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace('/api/v1/expenses', '');
      if (!url.includes('/api/v1/expenses')) return false;
      let body: unknown = null;
      try { body = route.request().postDataJSON(); } catch { /* not json */ }
      seen.requests.push({ method, path, body });
      if (extra && (await extra(route, path, method))) return true;
      const ok = (data: unknown, more: Record<string, unknown> = {}) => route.fulfill({ json: { success: true, data, ...more } }).then(() => true);
      if (method === 'GET' && path === '/policy') return ok(MY_POLICY);
      if (method === 'GET' && path === '/claims') return ok([REJECTED]);
      if (method === 'GET' && path === `/claims/${CLAIM_ID}`) return ok(REJECTED);
      if (method === 'GET' && path === `/claims/${REVIEW_ID}`) return ok(TO_REVIEW);
      if (method === 'GET' && path === '/claims/pending') return ok([TO_REVIEW]);
      if (method === 'GET' && path === '/claims/awaiting-reimbursement') return ok([]);
      if (method === 'GET' && path === '/policies') return ok([POLICY]);
      if (method === 'GET' && path === '/policies/presets') return ok(PRESETS);
      if (method === 'GET' && path === '/policies/roles') return ok({ legacy: [{ role: 'supervisor', people: 4 }], org_roles: [] });
      if (method === 'GET' && path === '/policies/people') return ok([{ id: 'p1', name: 'Asha Menon', employee_id: 'E7', role: 'executive', email: null }]);
      return false;
    },
  });
  return seen;
}

test.describe('Expenses — claimant', () => {
  test('a rejected claim shows who rejected it and why, right in the list', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/expenses');
    await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();
    await expect(page.getByText('Pune client visit')).toBeVisible();
    await expect(page.getByText('Rejected by Meera Rao:')).toBeVisible();
    await expect(page.getByText('Hotel receipt is unreadable — upload a clearer photo.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fix and resubmit' })).toBeVisible();
    await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/my-claims.png` : undefined, fullPage: true });
  });

  test('the claim page shows the remark, the line-level remark and the history', async ({ page }) => {
    await setup(page);
    await page.goto(`/dashboard/expenses/${CLAIM_ID}`);
    // (Next's route announcer is also role=alert, so scope to the rejection banner.)
    const alert = page.locator('[role=alert]').filter({ hasText: 'Rejected by' });
    await expect(alert).toContainText('Rejected by Meera Rao');
    await expect(alert).toContainText('Hotel receipt is unreadable — upload a clearer photo.');
    await expect(page.getByText('Remark: ', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Receipt is blurry').first()).toBeVisible();
    await expect(page.getByText('Line rejected').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Fix and resubmit' })).toBeVisible();
    await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/claim-rejected.png` : undefined, fullPage: true });
  });

  test('uploads a receipt, fills the line from it, and warns before submitting', async ({ page }) => {
    const seen = await setup(page, async (route, path, method) => {
      if (method === 'POST' && path === '/receipts') {
        await route.fulfill({ json: { success: true, data: {
          url: 'https://x.test/storage/v1/object/public/kinematic-receipts/o/e2e-user-1/new.png', path: 'o/e2e-user-1/new.png', bucket: 'kinematic-receipts',
          content_type: 'image/png', size: 70, signed_url: 'https://x.test/new.png?token=2',
          scan: { merchant: 'Hotel Sahyadri', txn_date: '2026-10-01', amount: 1500, currency: 'INR', tax_amount: null, category: 'lodging' },
        } } });
        return true;
      }
      if (method === 'POST' && path === '/claims/check') {
        await route.fulfill({ json: { success: true, data: {
          policy: MY_POLICY, total: 1500, blocking: false, would_auto_approve: false,
          violations: [{ code: 'over_category_limit', severity: 'warn', detail: 'Lodging on 2026-10-01 is ₹1,500, above the ₹1,000 daily limit.', item_id: '0' }],
        } } });
        return true;
      }
      return false;
    });
    await page.goto('/dashboard/expenses/new');
    await expect(page.getByRole('heading', { name: 'New expense claim' })).toBeVisible();
    await expect(page.getByText('Your policy')).toBeVisible();

    // 1×1 PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: png });

    await expect(page.getByLabel('Merchant', { exact: false }).first()).toHaveValue('Hotel Sahyadri');
    await expect(page.getByText('Receipt attached', { exact: true })).toBeVisible();
    await expect(page.getByText('Read from the receipt')).toBeVisible();
    await expect(page.getByText('Over daily limit.').first()).toBeVisible();
    await expect(page.getByText('1 thing the approver will notice')).toBeVisible();

    const upload = seen.requests.find((r) => r.path === '/receipts');
    expect(upload?.method).toBe('POST');
    await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/new-claim.png` : undefined, fullPage: true });
  });

  test('a policy that blocks stops the submit button', async ({ page }) => {
    await setup(page, async (route, path, method) => {
      if (method === 'POST' && path === '/claims/check') {
        await route.fulfill({ json: { success: true, data: {
          policy: MY_POLICY, total: 900, blocking: true, would_auto_approve: false,
          violations: [{ code: 'receipt_missing', severity: 'warn', detail: 'Food of ₹900 needs a receipt.', item_id: '0', blocking: true }],
        } } });
        return true;
      }
      return false;
    });
    await page.goto('/dashboard/expenses/new');
    await page.getByPlaceholder('Where was it spent?').fill('Cafe');
    await page.getByPlaceholder('0').first().fill('900');
    await expect(page.getByText('Fix these before you can submit')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save as draft' })).toBeEnabled();
  });
});

test.describe('Expenses — approver', () => {
  test('rejecting needs a remark and sends it', async ({ page }) => {
    const seen = await setup(page, async (route, path, method) => {
      if (method === 'PATCH' && path === `/claims/${REVIEW_ID}/decision`) {
        await route.fulfill({ json: { success: true, data: { ok: true, status: 'rejected' } } });
        return true;
      }
      return false;
    });
    await page.goto(`/dashboard/expenses/${REVIEW_ID}`);
    await expect(page.getByRole('heading', { name: /Mumbai trip/ })).toBeVisible();
    await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/review.png` : undefined, fullPage: true });

    await page.getByRole('button', { name: 'Reject claim' }).click();
    const dialog = page.getByRole('dialog');
    const confirm = dialog.getByRole('button', { name: 'Reject claim' });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('textbox').fill('Toll receipt missing — please attach it.');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect.poll(() => seen.requests.find((r) => r.path === `/claims/${REVIEW_ID}/decision`)?.body).toMatchObject({
      decision: 'rejected', note: 'Toll receipt missing — please attach it.',
    });
  });

  test('a rejected line must carry its own remark before the claim can be approved', async ({ page }) => {
    const seen = await setup(page, async (route, path, method) => {
      if (method === 'PATCH' && path === `/claims/${REVIEW_ID}/decision`) {
        await route.fulfill({ json: { success: true, data: { ok: true, status: 'approved', approved_amount: 400, rejected_lines: 1 } } });
        return true;
      }
      return false;
    });
    await page.goto(`/dashboard/expenses/${REVIEW_ID}`);
    await page.getByRole('button', { name: 'Reject' }).nth(1).click();   // the second line's Reject
    await expect(page.getByText('You will approve')).toBeVisible();
    await page.getByRole('button', { name: 'Approve selected' }).click();
    await expect(page.getByText('A remark is needed to reject this line')).toBeVisible();
    expect(seen.requests.some((r) => r.path.endsWith('/decision'))).toBe(false);

    await page.getByLabel('Remark for the rejected line').fill('Not a business toll');
    await page.getByRole('button', { name: 'Approve selected' }).click();
    await expect.poll(() => seen.requests.find((r) => r.path.endsWith('/decision'))?.body).toMatchObject({
      decision: 'approved',
      items: [{ id: REV_A, decision: 'approved' }, { id: REV_B, decision: 'rejected', note: 'Not a business toll' }],
    });
  });

  test('the queue lists the claim with quick actions', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/expenses/approvals');
    await expect(page.getByText('Ravi Kumar')).toBeVisible();
    await expect(page.getByText('Mumbai trip')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
    await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/approvals.png` : undefined, fullPage: true });
  });
});

test.describe('Expenses — policies', () => {
  test('lists policies with who they cover', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/expenses/policies');
    await expect(page.getByRole('heading', { name: 'Expense policies' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Field sales rep' })).toBeVisible();
    await expect(page.getByText('governs 24 people now')).toBeVisible();
    await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/policies.png` : undefined, fullPage: true });
  });

  test('creates a policy from a template in a few clicks', async ({ page }) => {
    const seen = await setup(page, async (route, path, method) => {
      if (method === 'POST' && path === '/policies') {
        await route.fulfill({ status: 201, json: { success: true, data: { ...POLICY, id: 'new-1' } } });
        return true;
      }
      return false;
    });
    await page.goto('/dashboard/expenses/policies/new');
    await page.getByRole('button', { name: /Strict — block on violation/ }).click();
    await expect(page.getByLabel('Policy name', { exact: false })).toHaveValue('Strict — block on violation');
    await page.getByRole('radio', { name: /Specific roles or people/ }).click();
    await page.getByRole('button', { name: /supervisor/ }).click();
    await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/policy-editor.png` : undefined, fullPage: true });
    await page.getByRole('button', { name: 'Create policy' }).click();

    await expect.poll(() => seen.requests.find((r) => r.method === 'POST' && r.path === '/policies')?.body).toMatchObject({
      name: 'Strict — block on violation',
      applies_to: { everyone: false, roles: ['supervisor'] },
      rules: { enforcement: 'block', receipt_required_over: 0 },
    });
  });

  test('will not save a restricted policy with nobody chosen', async ({ page }) => {
    const seen = await setup(page);
    await page.goto('/dashboard/expenses/policies/new');
    await page.getByLabel('Policy name', { exact: false }).fill('Interns');
    await page.getByRole('radio', { name: /Specific roles or people/ }).click();
    await expect(page.getByText('Choose who this policy applies to')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create policy' })).toBeDisabled();
    expect(seen.requests.some((r) => r.method === 'POST' && r.path === '/policies')).toBe(false);
  });
});

// ── GPS distance (policy rule `gps_distance`) + rejection hint ────────────────
// With vehicle rates and `gps_distance: true`, a mileage line is the day's GPS-measured distance: no odometer
// readings or photos, a "Fill from my GPS route for this date" button, the amount worked out from the vehicle's
// rate. Policies without the rule are untouched.

const VEHICLE_RULES = { ...rules, vehicle_rates: [{ id: 'two_wheeler', label: 'Two-wheeler', rate_per_km: 4 }], odometer_photos_required: true };
const GPS_POLICY = { ...MY_POLICY, rules: { ...VEHICLE_RULES, gps_distance: true } };
const ODO_POLICY = { ...MY_POLICY, rules: VEHICLE_RULES };

const TRAVEL_23 = {
  date: '2026-10-10', user_id: SEED_USER.id, attendance_id: 'att-1', started_at: '2026-10-10T03:42:00Z', ended_at: '2026-10-10T12:35:00Z', in_progress: false,
  total_km: 23.4, method: 'gps_trail', legs: [{ index: 0 }, { index: 1 }, { index: 2 }], stops: [], points_used: 120, points_excluded: 3,
};

/** Answers GET /attendance/travel (outside /expenses, so it needs its own route) and records the dates asked for. */
async function mockTravel(page: Page, data: Record<string, unknown> | ((date: string) => Record<string, unknown>) = TRAVEL_23) {
  const dates: string[] = [];
  await page.route(/\/api\/v1\/attendance\/travel/, async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? '';
    dates.push(date);
    await route.fulfill({ json: { success: true, data: typeof data === 'function' ? data(date) : data } });
  });
  return dates;
}

/** Expense endpoints a new-claim page needs when the policy is `policy`. */
const claimPageHandlers = (policy: unknown) => async (route: Route, path: string, method: string) => {
  const ok = (data: unknown) => route.fulfill({ json: { success: true, data } }).then(() => true);
  if (method === 'GET' && path === '/policy') return ok(policy);
  if (method === 'GET' && path === '/odometer-history') return ok([]);
  if (method === 'POST' && path === '/claims/check') return ok({ policy, total: 0, violations: [], blocking: false, would_auto_approve: false });
  if (method === 'POST' && path === '/claims') return ok({ ...REJECTED, id: 'new-1', status: 'draft' });
  if (method === 'GET' && path === '/claims/new-1') return ok({ ...REJECTED, id: 'new-1', status: 'draft', review_note: null, items: [] });
  return false;
};

async function newMileageLine(page: Page) {
  await page.goto('/dashboard/expenses/new');
  await expect(page.getByText('Your policy')).toBeVisible();
  await page.getByLabel('Category').selectOption('mileage');
}

test.describe('Expenses — claim distance from GPS', () => {
  test('a GPS-distance policy asks for a distance, not odometer readings, and fills it from the day\'s route', async ({ page }) => {
    const seen = await setup(page, claimPageHandlers(GPS_POLICY));
    const dates = await mockTravel(page);
    await newMileageLine(page);

    await expect(page.getByLabel('Distance (km)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fill from my GPS route for this date' })).toBeVisible();
    await expect(page.getByText('Odometer before the trip')).toHaveCount(0);
    await expect(page.getByText('Odometer after the trip')).toHaveCount(0);
    await expect(page.getByText('Add odometer photo')).toHaveCount(0);
    await expect(page.getByText('Mileage is claimed from your GPS route — no odometer readings or photos.')).toBeVisible();
    // Nothing typed yet: no distance, no amount.
    await expect(page.getByText('Measured from your GPS route')).toBeVisible();

    const date = await page.getByLabel('Date').inputValue();
    await page.getByRole('button', { name: 'Fill from my GPS route for this date' }).click();

    await expect(page.getByLabel('Distance (km)')).toHaveValue('23.4');
    expect(dates).toEqual([date]);
    await expect(page.getByText(/23\.4 km over 3 legs from your GPS route/)).toBeVisible();
    // 23.4 km x ₹4 / km, priced from the policy's only vehicle (nobody has to pick it).
    await expect(page.getByText(/₹93\.60/).first()).toBeVisible();

    // The live policy check is sent the same GPS line (so it is judged the way it will be saved).
    await expect.poll(() => seen.requests.filter((r) => r.path === '/claims/check').pop()?.body).toMatchObject({
      items: [{ category: 'mileage', vehicle_type: 'two_wheeler', distance_km: 23.4 }],
    });

    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect.poll(() => seen.requests.find((r) => r.method === 'POST' && r.path === '/claims')?.body).toMatchObject({
      items: [{
        category: 'mileage', item_date: date, vehicle_type: 'two_wheeler', distance_km: 23.4, amount: null,
        odometer_start: null, odometer_end: null, odometer_start_photo_url: null, odometer_end_photo_url: null,
      }],
    });
  });

  test('no GPS travel that day: it says so and leaves the distance empty', async ({ page }) => {
    await setup(page, claimPageHandlers(GPS_POLICY));
    await mockTravel(page, { ...TRAVEL_23, total_km: 0, method: 'none', legs: [] });
    await newMileageLine(page);
    await page.getByRole('button', { name: 'Fill from my GPS route for this date' }).click();
    await expect(page.getByText('No GPS travel was recorded for that day').first()).toBeVisible();
    await expect(page.getByLabel('Distance (km)')).toHaveValue('');
  });

  test('no attendance that day: it says so instead of filling 0', async ({ page }) => {
    await setup(page, claimPageHandlers(GPS_POLICY));
    await mockTravel(page, { ...TRAVEL_23, attendance_id: null, total_km: 0, method: 'none', legs: [] });
    await newMileageLine(page);
    await page.getByRole('button', { name: 'Fill from my GPS route for this date' }).click();
    await expect(page.getByText('You have no attendance for that day, so there is no route to measure').first()).toBeVisible();
    await expect(page.getByLabel('Distance (km)')).toHaveValue('');
  });

  test('an open shift fills what there is so far and tells the rep to fill again after checking out', async ({ page }) => {
    await setup(page, claimPageHandlers(GPS_POLICY));
    await mockTravel(page, { ...TRAVEL_23, in_progress: true, total_km: 6.5, legs: [{ index: 0 }] });
    await newMileageLine(page);
    await page.getByRole('button', { name: 'Fill from my GPS route for this date' }).click();
    await expect(page.getByLabel('Distance (km)')).toHaveValue('6.5');
    await expect(page.getByText(/your shift is still open, so fill this again after you check out/)).toBeVisible();
  });

  test('a line without a distance cannot be saved, and the message points at the GPS button', async ({ page }) => {
    const seen = await setup(page, claimPageHandlers(GPS_POLICY));
    await newMileageLine(page);
    await page.getByPlaceholder('Starting point').fill('Office'); // something typed, but no distance
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByText(/needs the distance — use “Fill from my GPS route” or type it/)).toBeVisible();
    expect(seen.requests.some((r) => r.method === 'POST' && r.path === '/claims')).toBe(false);
  });

  test('a policy without the rule still asks for odometer readings (nothing changes for it)', async ({ page }) => {
    await setup(page, claimPageHandlers(ODO_POLICY));
    await newMileageLine(page);
    await expect(page.getByText('Odometer before the trip')).toBeVisible();
    await expect(page.getByText('Odometer after the trip')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fill from my GPS route for this date' })).toHaveCount(0);
    await expect(page.getByLabel('Distance (km)')).toHaveCount(0);
  });

  test('a saved line that already has odometer readings keeps its odometer form on a GPS policy', async ({ page }) => {
    const odoClaim = {
      ...REJECTED, id: CLAIM_ID, status: 'draft', review_note: null, approvals: [],
      items: [{ id: ITEM_A, claim_id: CLAIM_ID, category: 'mileage', item_date: '2026-10-01', description: null, amount: 80, distance_km: 20, from_location: null, to_location: null,
        merchant: null, receipt_url: null, vehicle_type: 'two_wheeler', odometer_start: 1000, odometer_end: 1020, ai_extracted: null, flagged: false, flag_reason: null }],
    };
    await setup(page, async (route, path, method) => {
      if (method === 'GET' && path === `/claims/${CLAIM_ID}`) { await route.fulfill({ json: { success: true, data: odoClaim } }); return true; }
      return claimPageHandlers(GPS_POLICY)(route, path, method);
    });
    await page.goto(`/dashboard/expenses/${CLAIM_ID}/edit`);
    await expect(page.getByText('Odometer before the trip')).toBeVisible();
    await expect(page.getByLabel('Odometer before the trip')).toHaveValue('1000');
    await expect(page.getByRole('button', { name: 'Fill from my GPS route for this date' })).toHaveCount(0);
  });

  test('the claim page labels a GPS line, with no odometer shown', async ({ page }) => {
    const gpsClaim = {
      ...TO_REVIEW,
      items: [{ id: REV_A, claim_id: REVIEW_ID, category: 'mileage', item_date: '2026-10-04', description: null, amount: 93.6, distance_km: 23.4, from_location: null, to_location: null,
        merchant: null, receipt_url: null, vehicle_type: 'two_wheeler', odometer_start: null, odometer_end: null, ai_extracted: null, flagged: false, flag_reason: null, decision: null, decision_note: null }],
    };
    await setup(page, async (route, path, method) => {
      if (method === 'GET' && path === `/claims/${REVIEW_ID}`) { await route.fulfill({ json: { success: true, data: gpsClaim } }); return true; }
      return false;
    });
    await page.goto(`/dashboard/expenses/${REVIEW_ID}`);
    await expect(page.getByText('Two wheeler · GPS distance')).toBeVisible();
    await expect(page.getByText(/23\.4 km/).first()).toBeVisible();
    await expect(page.getByText(/Odometer/)).toHaveCount(0);
  });
});

test.describe('Expenses — policy editor: GPS distance switch', () => {
  const gpsSwitch = (page: Page) => page.getByRole('switch', { name: 'Claim distance from GPS (no odometer)' });
  const withPolicy = (policy: unknown) => async (route: Route, path: string, method: string) => {
    if (method === 'GET' && path === `/policies/${POLICY_ID}`) { await route.fulfill({ json: { success: true, data: policy } }); return true; }
    if (method === 'PUT' && path === `/policies/${POLICY_ID}`) { await route.fulfill({ json: { success: true, data: policy } }); return true; }
    return false;
  };

  test('with vehicle types it can be switched on, and the save carries gps_distance', async ({ page }) => {
    const seen = await setup(page, withPolicy({ ...POLICY, rules: VEHICLE_RULES }));
    await page.goto(`/dashboard/expenses/policies/${POLICY_ID}`);
    await expect(gpsSwitch(page)).toBeEnabled();
    await expect(gpsSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await gpsSwitch(page).click();
    await expect(gpsSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Save policy' }).click();
    await expect.poll(() => seen.requests.find((r) => r.method === 'PUT' && r.path === `/policies/${POLICY_ID}`)?.body).toMatchObject({
      rules: { gps_distance: true, vehicle_rates: [{ id: 'two_wheeler', label: 'Two-wheeler', rate_per_km: 4 }] },
    });
  });

  test('a policy that has it on shows it on, and switching it off is saved as off', async ({ page }) => {
    const seen = await setup(page, withPolicy({ ...POLICY, rules: { ...VEHICLE_RULES, gps_distance: true } }));
    await page.goto(`/dashboard/expenses/policies/${POLICY_ID}`);
    await expect(gpsSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await gpsSwitch(page).click();
    await page.getByRole('button', { name: 'Save policy' }).click();
    await expect.poll(() => seen.requests.find((r) => r.method === 'PUT')?.body).toMatchObject({ rules: { gps_distance: false } });
  });

  test('with no vehicle type it is off and cannot be switched on', async ({ page }) => {
    await setup(page, withPolicy(POLICY));
    await page.goto(`/dashboard/expenses/policies/${POLICY_ID}`);
    await expect(gpsSwitch(page)).toBeDisabled();
    await expect(gpsSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('Add a vehicle type first.', { exact: true })).toBeVisible();
  });

  test('a new policy sends gps_distance: false unless it is switched on', async ({ page }) => {
    const seen = await setup(page, async (route, path, method) => {
      if (method === 'POST' && path === '/policies') { await route.fulfill({ status: 201, json: { success: true, data: { ...POLICY, id: 'new-1' } } }); return true; }
      return false;
    });
    await page.goto('/dashboard/expenses/policies/new');
    await page.getByLabel('Policy name', { exact: false }).fill('Plain');
    await page.getByRole('button', { name: 'Create policy' }).click();
    await expect.poll(() => seen.requests.find((r) => r.method === 'POST' && r.path === '/policies')?.body).toMatchObject({ rules: { gps_distance: false } });
  });
});

test.describe('Expenses — rejecting tells the claimant what happens', () => {
  const HINT = 'The claimant is notified with this reason and can edit and resubmit.';

  test('the reject dialog on a claim says the claimant is notified and can resubmit', async ({ page }) => {
    await setup(page);
    await page.goto(`/dashboard/expenses/${REVIEW_ID}`);
    await page.getByRole('button', { name: 'Reject claim' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('remark-footnote')).toHaveText(HINT);
    // It sits under the reason box: the textbox comes first in the dialog.
    const order = await dialog.evaluate((el) => {
      const t = el.querySelector('textarea');
      const f = el.querySelector('[data-testid="remark-footnote"]');
      return !!t && !!f && !!(t.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order).toBe(true);
  });

  test('so does the quick reject in the approvals queue', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/expenses/approvals');
    await page.getByRole('button', { name: 'Reject', exact: true }).first().click();
    await expect(page.getByRole('dialog').getByTestId('remark-footnote')).toHaveText(HINT);
  });
});
