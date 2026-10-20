import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Attendance overview: the day list reads at a glance and behaves — a rep on break is not "Absent", a person with no
 * record is judged against the client's shift rules (week off / not in yet / absent), the stat tiles are filters,
 * days can be stepped through, "Mark absent" really writes, a background refresh does not flash the table, and a name
 * in the monthly summary opens that person's days.
 *
 * Runs against an intercepted API and asserts on what the page shows and what it SENDS. The clock is pinned (IST
 * Wednesday 21 Oct 2026, 11:30 unless a test says otherwise) so "today", "late" and "not in yet" are deterministic.
 */

test.use({ timezoneId: 'Asia/Kolkata', locale: 'en-IN' });

const NOW = Date.UTC(2026, 9, 21, 6, 0, 0); // 11:30 IST, a Wednesday
const TODAY = '2026-10-21';
const user = (id: string, name: string) => ({ id, name, employee_id: `E-${id}`, role: 'field_executive', is_active: true, zones: { name: 'Zone A' } });
const ASHA = user('u-asha', 'Asha Menon');
const RAVI = user('u-ravi', 'Ravi Kumar');
const MEERA = user('u-meera', 'Meera Iyer');
const USERS = [ASHA, RAVI, MEERA];

const rec = (u: ReturnType<typeof user>, extra: Record<string, unknown> = {}) => ({
  id: `att-${u.id}`, user_id: u.id, date: TODAY, status: 'checked_out',
  checkin_at: `${TODAY}T09:12:00+05:30`, checkout_at: `${TODAY}T18:05:00+05:30`, total_hours: 8.8,
  users: { name: u.name, role: u.role, employee_id: u.employee_id, zones: u.zones },
  ...extra,
});

interface Seen { method: string; path: string; query: URLSearchParams; body: any }

async function setup(page: Page, o: {
  team?: unknown[] | ((q: URLSearchParams) => unknown[] | Promise<unknown[]>);
  rules?: unknown;
  summary?: unknown;
  now?: number;
} = {}) {
  const seen: Seen[] = [];
  await page.clock.setFixedTime(new Date(o.now ?? NOW));
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      const u = new URL(url);
      let body: any = null;
      try { body = route.request().postDataJSON(); } catch { /* not json */ }
      seen.push({ method, path: u.pathname, query: u.searchParams, body });
      if (method !== 'GET') return false;
      const ok = (data: unknown) => route.fulfill({ json: { success: true, data } }).then(() => true);
      if (u.pathname === '/api/v1/attendance/team') {
        const t = typeof o.team === 'function' ? await o.team(u.searchParams) : (o.team ?? [rec(ASHA)]);
        return ok(t);
      }
      if (u.pathname === '/api/v1/users') return ok(USERS);
      if (u.pathname === '/api/v1/attendance/rules') return ok(o.rules ?? []);
      if (u.pathname === '/api/v1/attendance/summary') return ok(o.summary ?? { from: TODAY, to: TODAY, working_days: 1, rows: [] });
      return false;
    },
  });
  return seen;
}

const RULES = (weeklyOff: number[]) => ({ configured: true, rules: { shift_start: '09:30', shift_end: '18:30', grace_minutes: 10, weekly_off: weeklyOff }, transport_modes: [] });
const tile = (page: Page, label: string) => page.locator(`div:text-is("${label}")`).locator('xpath=ancestor::div[2]').first();
const open = async (page: Page) => {
  await page.goto('/dashboard/attendance-overview');
  await expect(page.getByText('Asha Menon').first()).toBeVisible({ timeout: 60_000 });
};
const rowOf = (page: Page, name: string) => page.locator('tbody tr').filter({ hasText: name });

test.describe('Attendance — status and tiles', () => {
  test('a rep on break reads "On break", not "Absent", and has a tile and a filter', async ({ page }) => {
    await setup(page, { team: [rec(ASHA, { status: 'on_break', checkout_at: null, break_minutes: 25 })] });
    await open(page);
    await expect(rowOf(page, 'Asha Menon').getByText('On break')).toBeVisible();
    await expect(rowOf(page, 'Asha Menon').getByText('25m break')).toBeVisible();
    await expect(tile(page, 'On break')).toContainText('1');
    await expect(page.getByLabel('Filter by status').locator('option[value="on_break"]')).toHaveCount(1);
    // Ravi and Meera have no record at all: they, and only they, are absent.
    await expect(tile(page, 'Absent')).toContainText('2');
  });

  test('every tile is a filter: press to narrow, press again to clear', async ({ page }) => {
    await setup(page, { team: [rec(ASHA), rec(RAVI, { status: 'checked_in', checkout_at: null })] });
    await open(page);
    const absent = page.getByRole('button', { name: /Absent/ }).first();
    await expect(absent).toHaveAttribute('aria-pressed', 'false');
    await absent.click();
    await expect(absent).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Meera Iyer').first()).toBeVisible();
    await expect(page.getByText('Asha Menon')).toHaveCount(0);
    await expect(page.getByLabel('Filter by status')).toHaveValue('absent');
    await absent.click();
    await expect(page.getByText('Asha Menon').first()).toBeVisible();
    await expect(page.getByLabel('Filter by status')).toHaveValue('all');
  });

  test('a mock-GPS check-in is flagged on the row and in the detail', async ({ page }) => {
    await setup(page, { team: [rec(ASHA, { checkin_is_mock: true, checkin_distance_m: 1840, checkin_lat: 19.07, checkin_lng: 72.87 })] });
    await open(page);
    await expect(rowOf(page, 'Asha Menon').getByText('Mock GPS')).toBeVisible();
    await page.getByText('Asha Menon').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Mock GPS detected')).toBeVisible();
    await expect(dialog.getByText('1,840 m from the site')).toBeVisible();
  });

  test('columns sort: Hours ascending puts the shortest day first, a second press reverses, a third restores', async ({ page }) => {
    await setup(page, { team: [rec(ASHA, { total_hours: 8.8 }), rec(RAVI, { total_hours: 4.1 }), rec(MEERA, { total_hours: 6 })] });
    await open(page);
    const order = () => page.getByTestId('att-name').allTextContents();
    const hours = page.locator('thead th').filter({ hasText: 'Hours' }).locator('[role="button"]');
    await hours.click();
    expect((await order()).slice(0, 3)).toEqual(['Ravi Kumar', 'Meera Iyer', 'Asha Menon']);
    await hours.click();
    expect((await order()).slice(0, 3)).toEqual(['Asha Menon', 'Meera Iyer', 'Ravi Kumar']);
    await hours.click();
    expect((await order()).slice(0, 3)).toEqual(['Asha Menon', 'Ravi Kumar', 'Meera Iyer']);
  });
});

test.describe('Attendance — judging a day with no record', () => {
  test('a client with no saved rules: everyone without a record is Absent, as before', async ({ page }) => {
    await setup(page, { team: [rec(ASHA)], rules: { configured: false, rules: { shift_start: '09:30', shift_end: '18:30', grace_minutes: 10, weekly_off: [0, 3] } } });
    await open(page);
    await expect(rowOf(page, 'Ravi Kumar').getByText('Absent')).toBeVisible();
    await expect(page.locator('div:text-is("Not in yet")')).toHaveCount(0);
    await expect(page.locator('div:text-is("Week off")')).toHaveCount(0);
  });

  test('before shift start (+ grace) today, the people not in yet are "Not in yet", not Absent', async ({ page }) => {
    await setup(page, { team: [rec(ASHA)], rules: RULES([0]), now: Date.UTC(2026, 9, 21, 2, 30, 0) }); // 08:00 IST, shift 09:30 + 10
    await open(page);
    await expect(rowOf(page, 'Ravi Kumar').getByText('Not in yet')).toBeVisible();
    await expect(tile(page, 'Not in yet')).toContainText('2');
    await expect(tile(page, 'Absent')).toContainText('0');
  });

  test('once the shift has started, the same people are Absent', async ({ page }) => {
    await setup(page, { team: [rec(ASHA)], rules: RULES([0]) }); // 11:30 IST
    await open(page);
    await expect(rowOf(page, 'Ravi Kumar').getByText('Absent')).toBeVisible();
    await expect(page.locator('div:text-is("Not in yet")')).toHaveCount(0);
    await expect(tile(page, 'Absent')).toContainText('2');
  });

  test('on a weekly-off day nobody is Absent — they are "Week off"', async ({ page }) => {
    await setup(page, { team: [], rules: RULES([3]) }); // Wednesday off
    await page.goto('/dashboard/attendance-overview');
    await expect(page.getByText('Ravi Kumar').first()).toBeVisible({ timeout: 60_000 });
    await expect(rowOf(page, 'Ravi Kumar').getByText('Week off')).toBeVisible();
    await expect(tile(page, 'Week off')).toContainText('3');
    await expect(tile(page, 'Absent')).toContainText('0');
  });

  test('a future day is not a gap: stepping a range past today adds no rows for it', async ({ page }) => {
    await setup(page, { team: [rec(ASHA)], rules: RULES([]) });
    await page.goto(`/dashboard/attendance-overview?from=${TODAY}&to=2026-10-25`);
    await expect(page.getByText('Ravi Kumar').first()).toBeVisible({ timeout: 60_000 });
    // Only today can be absent for Ravi — not the four days that have not happened yet.
    await expect(rowOf(page, 'Ravi Kumar')).toHaveCount(1);
  });
});

test.describe('Attendance — day navigation', () => {
  test('previous / next step by a day, never past today, and "Today" jumps back', async ({ page }) => {
    const seen = await setup(page);
    await open(page);
    const teamCalls = () => seen.filter((r) => r.path === '/api/v1/attendance/team').map((r) => `${r.query.get('from')}..${r.query.get('to')}`);
    await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Jump to today' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Previous day' }).click();
    await expect.poll(teamCalls).toContain('2026-10-20..2026-10-20');
    await expect(page.getByRole('button', { name: 'Next day' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Jump to today' })).toBeVisible();

    await page.getByRole('button', { name: 'Jump to today' }).click();
    await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Jump to today' })).toHaveCount(0);
  });

  test('a range steps by its own length', async ({ page }) => {
    const seen = await setup(page);
    await page.goto(`/dashboard/attendance-overview?from=2026-10-12&to=2026-10-18`); // a 7-day week
    await expect(page.getByText('Asha Menon').first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Previous period' }).click();
    await expect.poll(() => seen.filter((r) => r.path === '/api/v1/attendance/team').map((r) => `${r.query.get('from')}..${r.query.get('to')}`)).toContain('2026-10-05..2026-10-11');
  });
});

test.describe('Attendance — actions and refresh', () => {
  test('"Mark absent" PATCHes the override endpoint (the old POST to /:id/override never existed)', async ({ page }) => {
    const seen = await setup(page, { team: [rec(ASHA)] });
    await open(page);
    // Ravi has no record: nothing to mark, so he gets no such button. Asha does.
    await expect(page.getByRole('button', { name: 'Mark absent' })).toHaveCount(1);
    await rowOf(page, 'Asha Menon').getByRole('button', { name: 'Mark absent' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mark absent' }).click();
    await expect.poll(() => seen.filter((r) => r.method === 'PATCH' && r.path === '/api/v1/attendance/att-u-asha/override').length).toBe(1);
    const call = seen.find((r) => r.method === 'PATCH')!;
    expect(call.body).toEqual({ status: 'absent', override_reason: 'Marked absent by admin' });
    expect(seen.filter((r) => r.method === 'POST' && /\/attendance\/.+\/override/.test(r.path))).toHaveLength(0);
  });

  test('a record already marked absent offers no "Mark absent"', async ({ page }) => {
    await setup(page, { team: [rec(ASHA, { status: 'absent', checkin_at: null, checkout_at: null, total_hours: null })] });
    await open(page);
    await expect(page.getByRole('button', { name: 'Mark absent' })).toHaveCount(0);
    await page.getByText('Asha Menon').first().click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Mark absent' })).toHaveCount(0);
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Edit' })).toBeVisible();
  });

  test('Refresh re-reads in place: the rows stay on screen while the request is in flight', async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    let gated = false;
    let held = 0;
    await setup(page, { team: async () => { if (gated) { held += 1; await gate; } return [rec(ASHA)]; } });
    await open(page);
    gated = true; // from here on, answers are held back
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect.poll(() => held).toBeGreaterThan(0);
    // The request is still in flight — and the table is still the table, not a skeleton.
    await expect(rowOf(page, 'Asha Menon')).toBeVisible();
    release();
  });
});

test.describe('Attendance — one person\'s days', () => {
  const SUMMARY = { from: '2026-10-01', to: TODAY, working_days: 18, rows: [
    { user_id: 'u-asha', name: 'Asha Menon', working_days: 18, present: 2, late: 1, half_day: 1, on_leave: 1, absent: 14 },
    { user_id: 'u-ravi', name: 'Ravi Kumar', working_days: 18, present: 16, late: 0, half_day: 0, on_leave: 0, absent: 2 },
  ] };
  const ASHA_MONTH = [
    rec(ASHA, { id: 'a1', date: '2026-10-19', checkin_at: '2026-10-19T09:52:00+05:30', checkout_at: '2026-10-19T18:00:00+05:30', total_hours: 8, late: { is_late: true, minutes_late: 12 } }),
    rec(ASHA, { id: 'a2', date: '2026-10-20' }),
    rec(ASHA, { id: 'a3', date: '2026-10-15', status: 'half_day', checkin_at: '2026-10-15T09:30:00+05:30', checkout_at: '2026-10-15T13:00:00+05:30', total_hours: 3.5 }),
    rec(ASHA, { id: 'a4', date: '2026-10-16', status: 'on_leave', checkin_at: null, checkout_at: null, total_hours: null }),
  ];
  const openMonthly = async (page: Page) => {
    await page.goto('/dashboard/attendance-overview');
    await page.getByRole('tab', { name: 'Monthly summary' }).click();
    await expect(page.getByTestId('summary-row')).toHaveCount(2);
  };

  test('clicking a name asks for that person only, over the summary range, and draws their calendar', async ({ page }) => {
    const seen = await setup(page, {
      team: (q) => (q.get('user_id') === 'u-asha' ? ASHA_MONTH : []),
      summary: SUMMARY,
      rules: RULES([0]), // Sundays off
    });
    await openMonthly(page);
    await page.getByRole('button', { name: 'Asha Menon' }).click();

    const dialog = page.getByRole('dialog', { name: 'Asha Menon' });
    await expect(dialog).toBeVisible();
    const call = seen.filter((r) => r.path === '/api/v1/attendance/team' && r.query.get('user_id') === 'u-asha').pop()!;
    expect(call.query.get('from')).toBe('2026-10-01');
    expect(call.query.get('to')).toBe(TODAY);

    const stat = (label: string) => dialog.locator(`div:text-is("${label}")`).locator('xpath=following-sibling::div[1]');
    await expect(stat('Present')).toHaveText('2');
    await expect(stat('Late')).toHaveText('1');
    await expect(stat('Half day')).toHaveText('1');
    await expect(stat('Leave')).toHaveText('1');
    // 21 days in range: 2 present + 1 half + 1 leave + 3 Sundays off → the other 14 (today included, 11:30 is past shift start) are absent.
    await expect(stat('Absent')).toHaveText('14');

    const cal = dialog.getByTestId('person-calendar');
    await expect(cal.locator('[data-kind="off"]')).toHaveCount(3);
    await expect(cal.locator('[data-kind="present"]')).toHaveCount(2);
    await expect(cal.locator('[data-kind="leave"]')).toHaveCount(1);
    // Days worked lists the three days with a check-in, newest first, with the late chip on the 19th.
    await expect(dialog.getByText('Late 12 min')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('the search box narrows the rows and the totals follow', async ({ page }) => {
    await setup(page, { summary: SUMMARY });
    await openMonthly(page);
    await expect(page.getByTestId('summary-total').locator('td').nth(2)).toHaveText('18');
    await page.getByLabel('Search employees').fill('rav');
    await expect(page.getByTestId('summary-row')).toHaveCount(1);
    await expect(page.getByTestId('summary-total').locator('td').nth(2)).toHaveText('16');
    await page.getByLabel('Search employees').fill('zzz');
    await expect(page.getByText('No employee matches your search')).toBeVisible();
  });

  test('"View month" in a day\'s detail opens the same view for the month of that record', async ({ page }) => {
    const seen = await setup(page, { team: (q) => (q.get('user_id') === 'u-asha' ? ASHA_MONTH : [rec(ASHA)]) });
    await open(page);
    await page.getByText('Asha Menon').first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'View month' }).click();
    await expect(page.getByRole('dialog', { name: 'Asha Menon' }).getByTestId('person-calendar')).toBeVisible();
    await expect.poll(() => seen.some((r) => r.path === '/api/v1/attendance/team' && r.query.get('user_id') === 'u-asha' && r.query.get('from') === '2026-10-01')).toBe(true);
  });
});
