import { test, expect, type Page } from '@playwright/test';
import { demoLogin, mockApi, seedSession, SEED_USER } from './utils';

/**
 * Attendance overview → day-detail modal: "Distance travelled" for that person on that day, from
 * GET /api/v1/attendance/travel?date=YYYY-MM-DD&user_id=… — the total km plus the legs between check-in, each form
 * visit and check-out.
 *
 * The rules this pins: nothing is fetched until the modal is opened; the modal never waits on it (it has its own
 * loading, empty and error states, with a Retry); a day with no attendance has nothing to measure; a person who
 * never checked in does not trigger a request at all.
 */

test.use({ timezoneId: 'Asia/Kolkata', locale: 'en-IN' });

const TODAY = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const u = (id: string, name: string) => ({ id, name, employee_id: `E-${id}`, role: 'field_executive', is_active: true, zones: { name: 'Zone A' } });
const ASHA = u('u-asha', 'Asha Menon');
const RAVI = u('u-ravi', 'Ravi Kumar');

const record = (user: ReturnType<typeof u>, extra: Record<string, unknown> = {}) => ({
  id: `att-${user.id}`, user_id: user.id, date: TODAY, status: 'checked_out',
  checkin_at: `${TODAY}T09:12:00+05:30`, checkout_at: `${TODAY}T18:05:00+05:30`, total_hours: 8.8,
  users: { name: user.name, role: user.role, employee_id: user.employee_id, zones: user.zones },
  ...extra,
});

const at = (hhmm: string) => `${TODAY}T${hhmm}:00+05:30`;
const TRAVEL = {
  date: TODAY, user_id: ASHA.id, attendance_id: `att-${ASHA.id}`, started_at: at('09:12'), ended_at: at('18:05'), in_progress: false,
  total_km: 23.4, method: 'mixed',
  legs: [
    { index: 0, km: 9.1, method: 'gps_trail',
      from: { kind: 'checkin', at: at('09:12'), lat: 13.0, lng: 80.1, label: 'Check-in' },
      to: { kind: 'form_checkin', at: at('10:05'), lat: 13.05, lng: 80.2, label: 'Customer Visit' } },
    { index: 1, km: 14.3, method: 'straight_line',
      from: { kind: 'form_checkout', at: at('10:23'), lat: 13.05, lng: 80.2, label: 'Customer Visit' },
      to: { kind: 'checkout', at: at('18:05'), lat: 13.0, lng: 80.1, label: 'Check-out' } },
  ],
  stops: [{ submission_id: 's1', label: 'Customer Visit', check_in_at: at('10:05'), check_out_at: at('10:23'), minutes: 18 }],
  points_used: 120, points_excluded: 3,
};

interface Fake {
  team: unknown[];
  /** Answers GET /attendance/travel; may be gated / switched by a test. */
  travel: (q: URLSearchParams, n: number) => Promise<{ status?: number; body: unknown }> | { status?: number; body: unknown };
}

async function setup(page: Page, f: Partial<Fake> = {}) {
  const calls: URLSearchParams[] = [];
  const fake: Fake = {
    team: [record(ASHA)],
    travel: () => ({ body: { success: true, data: TRAVEL } }),
    ...f,
  };
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      if (method !== 'GET') return false;
      const x = new URL(url);
      if (x.pathname === '/api/v1/attendance/team') { await route.fulfill({ json: { success: true, data: fake.team } }); return true; }
      if (x.pathname === '/api/v1/users') { await route.fulfill({ json: { success: true, data: [ASHA, RAVI] } }); return true; }
      if (x.pathname === '/api/v1/attendance/travel') {
        calls.push(x.searchParams);
        const r = await fake.travel(x.searchParams, calls.length);
        await route.fulfill({ status: r.status ?? 200, json: r.body });
        return true;
      }
      return false;
    },
  });
  return { calls, fake };
}

async function openDay(page: Page, name = 'Asha Menon') {
  await page.goto('/dashboard/attendance-overview');
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 60_000 });
  await page.getByText(name).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

const box = (page: Page) => page.getByRole('dialog').getByTestId('day-travel');

test.describe('Attendance day detail — distance travelled', () => {
  test('nothing is fetched until the modal opens; then the total and the legs show', async ({ page }) => {
    const { calls } = await setup(page);
    await page.goto('/dashboard/attendance-overview');
    await expect(page.getByText('Asha Menon').first()).toBeVisible({ timeout: 60_000 });
    expect(calls).toHaveLength(0); // the table alone never asks

    await page.getByText('Asha Menon').first().click();
    await expect(page.getByRole('dialog').getByTestId('day-travel-total')).toHaveText('23.4 km');

    expect(calls).toHaveLength(1);
    expect(calls[0].get('date')).toBe(TODAY);
    expect(calls[0].get('user_id')).toBe(ASHA.id);

    await expect(box(page).getByText('2 legs')).toBeVisible();
    const legs = box(page).getByTestId('day-travel-leg');
    await expect(legs).toHaveCount(2);
    await expect(legs.nth(0)).toContainText('Check-in → Customer Visit');
    await expect(legs.nth(0)).toContainText('9.1 km');
    await expect(legs.nth(0)).toContainText(/09:12\s*am/i);
    await expect(legs.nth(1)).toContainText('Customer Visit → Check-out');
    await expect(legs.nth(1)).toContainText('14.3 km');
    await expect(legs.nth(1)).toContainText('straight line'); // no GPS trail on that leg
    await expect(legs.nth(0)).not.toContainText('straight line');
    await expect(box(page)).toContainText('1 visit · 18 min at customers');
    await expect(box(page).getByText('In progress')).toHaveCount(0);
  });

  test('an open shift says so, and its last leg runs to "now"', async ({ page }) => {
    const open = {
      ...TRAVEL, in_progress: true, ended_at: null, total_km: 4.2, method: 'gps_trail', stops: [],
      legs: [{ index: 0, km: 4.2, method: 'gps_trail',
        from: { kind: 'checkin', at: at('09:12'), lat: 13.0, lng: 80.1, label: 'Check-in' },
        to: { kind: 'now', at: at('11:30'), lat: 13.02, lng: 80.12, label: 'Now' } }],
    };
    await setup(page, { team: [record(ASHA, { status: 'checked_in', checkout_at: null })], travel: () => ({ body: { success: true, data: open } }) });
    await openDay(page);
    await expect(box(page).getByTestId('day-travel-total')).toHaveText('4.2 km');
    await expect(box(page).getByText('In progress')).toBeVisible();
    await expect(box(page).getByText('1 leg', { exact: true })).toBeVisible();
    await expect(box(page).getByTestId('day-travel-leg')).toContainText('– now');
  });

  test('the modal never waits for it: details and actions are usable while the route is still loading', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    await setup(page, { travel: async () => { await gate; return { body: { success: true, data: TRAVEL } }; } });
    await openDay(page);

    await expect(box(page).getByText('Working out the route…')).toBeVisible();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Check-in', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Edit' })).toBeEnabled();
    await expect(dialog.getByRole('button', { name: 'Mark absent' })).toBeEnabled();

    release();
    await expect(box(page).getByTestId('day-travel-total')).toHaveText('23.4 km');
  });

  test('a failed lookup says so in its own box and Retry loads it', async ({ page }) => {
    const { calls } = await setup(page, {
      travel: (_q, n) => (n === 1 ? { status: 500, body: { success: false, error: 'boom' } } : { body: { success: true, data: TRAVEL } }),
    });
    await openDay(page);
    await expect(box(page).getByText('Couldn’t load the distance for this day.')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Edit' })).toBeEnabled(); // the rest of the modal is fine

    await box(page).getByRole('button', { name: 'Retry' }).click();
    await expect(box(page).getByTestId('day-travel-total')).toHaveText('23.4 km');
    expect(calls).toHaveLength(2);
  });

  test('a day with no attendance, or with attendance but no travel, gets a plain message — not a "0 km" total', async ({ page }) => {
    await setup(page, {
      travel: () => ({ body: { success: true, data: { ...TRAVEL, attendance_id: null, started_at: null, ended_at: null, total_km: 0, method: 'none', legs: [], stops: [] } } }),
    });
    await openDay(page);
    await expect(box(page)).toContainText('No attendance on this day');
    await expect(box(page).getByTestId('day-travel-total')).toHaveCount(0);
  });

  test('attendance but nothing to measure', async ({ page }) => {
    await setup(page, {
      travel: () => ({ body: { success: true, data: { ...TRAVEL, total_km: 0, method: 'none', legs: [], stops: [] } } }),
    });
    await openDay(page);
    await expect(box(page)).toContainText('No travel recorded for this day.');
  });

  test('someone who never checked in has no shift to measure: no request at all', async ({ page }) => {
    const absent = { id: 'att-ravi', user_id: RAVI.id, date: TODAY, status: 'absent', users: { name: RAVI.name, role: RAVI.role, employee_id: RAVI.employee_id, zones: RAVI.zones } };
    const { calls } = await setup(page, { team: [absent] });
    await openDay(page, 'Ravi Kumar');
    await expect(page.getByRole('dialog').getByText('Absent').first()).toBeVisible();
    await expect(page.getByTestId('day-travel')).toHaveCount(0);
    expect(calls).toHaveLength(0);
  });

  test('closing and opening another person asks again for that person', async ({ page }) => {
    const { calls } = await setup(page, {
      team: [record(ASHA), record(RAVI)],
      travel: (q) => ({ body: { success: true, data: { ...TRAVEL, user_id: q.get('user_id'), total_km: q.get('user_id') === RAVI.id ? 5 : 23.4 } } }),
    });
    await openDay(page);
    await expect(page.getByTestId('day-travel-total')).toHaveText('23.4 km');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByText('Ravi Kumar').first().click();
    await expect(page.getByTestId('day-travel-total')).toHaveText('5 km');
    expect(calls.map((c) => c.get('user_id'))).toEqual([ASHA.id, RAVI.id]);
  });

  test('demo mode serves a canned day (no network)', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/attendance-overview');
    await expect(page.getByText('Total').first()).toBeVisible({ timeout: 60_000 });
    // Open the first row that has a check-in time (a checked-in / checked-out person).
    const row = page.getByRole('row').filter({ hasText: /Checked (in|out)/ }).first();
    await row.click();
    await expect(page.getByTestId('day-travel-total')).toHaveText('17.4 km');
    await expect(page.getByTestId('day-travel-leg')).toHaveCount(2);
  });
});
