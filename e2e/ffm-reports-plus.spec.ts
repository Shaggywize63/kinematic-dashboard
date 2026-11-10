import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'fs';
import { mockApi, seedSession, SEED_USER } from './utils';
import {
  csvCell, csvLine, toCsv, rangeProblem, daysInRange, addDaysYmd, median, fmtDelta, fmtInr, fmtNum, fmtPct, fmtIstTime, fmtDay, MAX_RANGE_DAYS,
} from '../src/components/ffm/reports/reportUtils';

/**
 * Field Force reports (plus): Rep Activity, Beat Compliance, Time & Travel, Outlet Visit Gaps, Geo-fence Exceptions,
 * Supervisor Teams, and the extra columns on Attendance Summary, Visit Coverage and Hours & Idle.
 *
 * Runs against an intercepted API (seeded session). For every report: rows and columns render from the mocked
 * response, a filter change refetches with the right query, the CSV carries the columns the screen shows, the empty
 * and error states render, and nothing scrolls the page sideways at 390 px. Plus the pure helpers behind the CSV.
 */

const API = '/api/v1/analytics/ffm/reports/';
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const TODAY = istToday();

interface Seen { path: string; q: URLSearchParams }
type Answer = unknown | { __status: number; body: unknown };
const failing = (status: number, error: string): Answer => ({ __status: status, body: { success: false, error } });

/** Seed a session, answer the named endpoints (keyed by path after /api/v1/), record every GET, open the page. */
async function open(page: Page, url: string, answers: Record<string, (q: URLSearchParams) => Answer>, o: { width?: number } = {}) {
  const seen: Seen[] = [];
  if (o.width) await page.setViewportSize({ width: o.width, height: 900 });
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route: Route, full, method) => {
      if (method !== 'GET') return false;
      const u = new URL(full);
      seen.push({ path: u.pathname, q: u.searchParams });
      const key = u.pathname.replace('/api/v1/', '');
      const fn = answers[key];
      if (!fn) return false;
      const a = fn(u.searchParams) as { __status?: number; body?: unknown };
      if (a && typeof a === 'object' && '__status' in a) { await route.fulfill({ status: a.__status, json: a.body }); return true; }
      await route.fulfill({ json: { success: true, data: a } });
      return true;
    },
  });
  await page.goto(url);
  return seen;
}
const calls = (seen: Seen[], suffix: string) => seen.filter((s) => s.path.endsWith(suffix));

const csvOfDownload = async (page: Page, click: () => Promise<void>) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  return readFileSync((await dl.path())!, 'utf8').replace(/^﻿/, '');
};

const noSidewaysScroll = async (page: Page) => {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw + 1);
};

// ── fixtures ──────────────────────────────────────────────────────────────

const REP_ROW = (over: Record<string, unknown>) => ({
  fe_id: 'r1', fe_name: 'Asha', planned_stops: 5, visited_stops: 3, missed_stops: 2, adherence_pct: 60, plan_days: 2, active_days: 2, zero_visit_days: 0,
  productive_visits: 2, productive_pct: 66.7, orders: 2, revenue_inr: 1500, aov_inr: 750, order_days: 1, orders_per_day: 2, calls_per_day: 1.5,
  km_total: 20.5, km_per_visit: 6.8, km_per_day: 10.3, timed_visits: 3, avg_dwell_min: 18.3, avg_planned_min: 15, under_2min_pct: 0, onsite_hours: 0.9,
  first_call_time: '09:15', last_call_time: '09:53', avg_span_hours: 0.6, checkins: 3, outside_geofence: 0, outside_pct: 0, max_distance_m: 0,
  days_present: 3, avg_hours: 7.8, total_hours: 15.5, avg_checkin_time: '09:15', missed_checkouts: 1, ...over,
});
const REP_ACTIVITY = {
  from: TODAY, to: TODAY, reps_in_view: 2,
  rows: [REP_ROW({}), REP_ROW({ fe_id: 'r2', fe_name: 'Bala', planned_stops: 3, visited_stops: 2, adherence_pct: 66.7, calls_per_day: 1, productive_pct: 50, orders: 1, revenue_inr: 800, aov_inr: 800, km_total: 12, km_per_visit: 6, avg_dwell_min: 1 })],
  totals: { planned_stops: 8, visited_stops: 5, adherence_pct: 62.5, productive_visits: 3, productive_pct: 60, orders: 3, revenue_inr: 2300, aov_inr: 767, km_total: 32.5, km_per_visit: 6.5 },
  median: { calls_per_day: 1.3, adherence_pct: 63.4, productive_pct: 58.4, aov_inr: 775, avg_dwell_min: 9.7, km_per_visit: 6.4 },
};

const BEAT = {
  from: TODAY, to: TODAY,
  weeks: [
    { week: '2026-W45', week_start: '2026-11-02', planned: 4, visited: 2, missed: 2, adherence_pct: 50, active_reps: 3 },
    { week: '2026-W46', week_start: '2026-11-09', planned: 7, visited: 4, missed: 3, adherence_pct: 57.1, active_reps: 3 },
  ],
  reps: [
    { fe_id: 'r1', fe_name: 'Asha', plans: 3, planned: 5, visited: 3, missed: 2, adherence_pct: 60, plan_days: 2, zero_visit_days: 0, by_week: { '2026-11-02': 50, '2026-11-09': 66.7 } },
    { fe_id: 'r3', fe_name: 'Chitra', plans: 2, planned: 3, visited: 1, missed: 2, adherence_pct: 33.3, plan_days: 2, zero_visit_days: 1, by_week: { '2026-11-02': 0, '2026-11-09': 50 } },
  ],
  totals: { planned: 11, visited: 6, missed: 5, adherence_pct: 54.5, plan_days: 6, zero_visit_days: 1 },
  median_adherence_pct: 60,
  rep_options: [{ id: 'r1', name: 'Asha' }, { id: 'r2', name: 'Bala' }, { id: 'r3', name: 'Chitra' }],
};

const TIME_TRAVEL = {
  from: TODAY, to: TODAY,
  rows: [
    { fe_id: 'r1', fe_name: 'Asha', active_days: 2, km_total: 20.5, km_per_day: 10.3, visited_stops: 3, km_per_visit: 6.8, timed_visits: 3, avg_dwell_min: 18.3, onsite_hours: 0.9, onsite_min: 55, first_call_time: '09:15', last_call_time: '09:53', avg_span_hours: 0.6, days_present: 3, worked_hours: 15.5, onsite_share_pct: 5.9 },
    { fe_id: 'r3', fe_name: 'Chitra', active_days: 1, km_total: 9, km_per_day: 9, visited_stops: 1, km_per_visit: 9, timed_visits: 1, avg_dwell_min: 30, onsite_hours: 0.5, onsite_min: 30, first_call_time: '09:15', last_call_time: '09:45', avg_span_hours: 0.5, days_present: 0, worked_hours: 0, onsite_share_pct: null },
  ],
  totals: { km_total: 29.5, visited_stops: 4, onsite_hours: 1.4, worked_hours: 15.5 },
  median: { km_per_visit: 7.9, avg_dwell_min: 24.2, avg_span_hours: 0.6, onsite_share_pct: 5.9 },
};

const GAP_ROWS = [
  { store_id: 's4', outlet_name: 'Annapurna Foods', city: null, rep_id: 'r1', rep_name: 'Asha', planned_calls: 2, visited_calls: 0, last_visit_date: null, days_since_last_visit: null, last_order_date: null, orders: 0, revenue_inr: 0 },
  { store_id: 's5', outlet_name: 'Lakshmi Traders', city: 'Chennai', rep_id: 'r1', rep_name: 'Asha', planned_calls: 1, visited_calls: 1, last_visit_date: '2026-09-20', days_since_last_visit: 51, last_order_date: '2026-10-05', orders: 1, revenue_inr: 300 },
  { store_id: 's1', outlet_name: 'Shree Stores', city: 'Chennai', rep_id: 'r2', rep_name: 'Bala', planned_calls: 4, visited_calls: 3, last_visit_date: '2026-11-09', days_since_last_visit: 1, last_order_date: '2026-11-09', orders: 2, revenue_inr: 1800 },
];
const GAPS = {
  from: '2026-09-12', to: TODAY, as_of: TODAY, total: 3, rows: GAP_ROWS,
  summary: { outlets: 3, never_visited: 1, visited: 2, avg_days_since_last_visit: 26 },
  rep_options: [{ id: 'r1', name: 'Asha' }, { id: 'r2', name: 'Bala' }],
};

const GEO = {
  from: TODAY, to: TODAY, total: 2,
  rows: [
    { fe_id: 'r2', fe_name: 'Bala', outlet_name: 'Shree Stores', beat: 'Beat-B', visited_at: '2026-11-09T05:30:00Z', day: '2026-11-09', distance_m: 250, geofence_m: 100, over_by_m: 150 },
    { fe_id: 'r3', fe_name: 'Chitra', outlet_name: 'Krishna Kirana', beat: 'Beat-C', visited_at: '2026-11-10T03:45:00Z', day: '2026-11-10', distance_m: 60, geofence_m: 50, over_by_m: 10 },
  ],
  summary: [
    { fe_id: 'r2', fe_name: 'Bala', checkins: 2, outside_geofence: 2, outside_pct: 100, max_distance_m: 250, mock_location: 0, vpn_detected: 0, suspect_pings: 0 },
    { fe_id: 'r3', fe_name: 'Chitra', checkins: 1, outside_geofence: 1, outside_pct: 100, max_distance_m: 60, mock_location: 0, vpn_detected: 0, suspect_pings: 2 },
    { fe_id: 'r1', fe_name: 'Asha', checkins: 3, outside_geofence: 0, outside_pct: 0, max_distance_m: 0, mock_location: 2, vpn_detected: 1, suspect_pings: 0 },
  ],
  rep_options: [{ id: 'r1', name: 'Asha' }, { id: 'r2', name: 'Bala' }, { id: 'r3', name: 'Chitra' }],
};

const SUPERVISORS = {
  from: TODAY, to: TODAY, reps_in_view: 3,
  rows: [
    { supervisor_id: 's1', supervisor_name: 'Meera', reps: 2, active_reps: 2, planned_stops: 8, visited_stops: 5, adherence_pct: 62.5, productive_visits: 3, productive_pct: 60, active_rep_days: 4, calls_per_rep_day: 1.3, orders: 3, revenue_inr: 2300, revenue_per_rep_inr: 1150, days_present: 5 },
    { supervisor_id: 's2', supervisor_name: 'Ravi', reps: 1, active_reps: 1, planned_stops: 3, visited_stops: 1, adherence_pct: 33.3, productive_visits: 1, productive_pct: 100, active_rep_days: 1, calls_per_rep_day: 1, orders: 1, revenue_inr: 700, revenue_per_rep_inr: 700, days_present: 0 },
  ],
  median: { adherence_pct: 47.9, productive_pct: 80, calls_per_rep_day: 1.2, revenue_per_rep_inr: 925 },
};

// ══════════════════════════════════════════════════════════════════════════
// Pure helpers
// ══════════════════════════════════════════════════════════════════════════

test.describe('report helpers (no browser)', () => {
  test('csvCell quotes commas, quotes and line breaks, and defuses a leading formula character', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+91 98')).toBe("'+91 98");
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell('@home')).toBe("'@home");
    expect(csvCell(-5)).toBe('-5');          // a real negative number is not text
    expect(csvCell(0)).toBe('0');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(NaN)).toBe('');
    expect(csvCell(true)).toBe('true');
  });
  test('toCsv writes the header and one line per row in column order', () => {
    const cols = [{ label: 'Name', csv: (r: { n: string; v: number | null }) => r.n }, { label: 'Value', csv: (r: { n: string; v: number | null }) => r.v }];
    expect(toCsv(cols, [{ n: 'A, Inc', v: 3 }, { n: 'B', v: null }])).toBe('Name,Value\n"A, Inc",3\nB,');
    expect(csvLine(['x', 1, null])).toBe('x,1,');
  });
  test('daysInRange / rangeProblem enforce the same 62-day limit as the server', () => {
    expect(daysInRange('2026-11-01', '2026-11-10')).toBe(10);
    expect(daysInRange('2026-11-10', '2026-11-01')).toBe(0);
    expect(daysInRange('', '2026-11-01')).toBe(0);
    expect(MAX_RANGE_DAYS).toBe(62);
    expect(rangeProblem('2026-09-10', '2026-11-10')).toBeNull();                        // exactly 62 days
    expect(rangeProblem('2026-09-09', '2026-11-10')).toMatch(/at most 62 days/);        // 63
    expect(rangeProblem('2026-11-10', '2026-11-01')).toMatch(/before the start/);
    expect(rangeProblem('', '')).toMatch(/Pick a start/);
  });
  test('addDaysYmd and median', () => {
    expect(addDaysYmd('2026-11-10', -59)).toBe('2026-09-12');
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01');
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([null, undefined, 5])).toBe(5);
    expect(median([])).toBeNull();
  });
  test('formatters always show units or a dash, never NaN / undefined', () => {
    expect(fmtInr(1500)).toBe('₹1,500');
    expect(fmtInr(1234567)).toBe('₹12,34,567');       // Indian digit grouping
    expect(fmtInr(null)).toBe('—');
    expect(fmtPct(66.7)).toBe('66.7%');
    expect(fmtPct(undefined)).toBe('—');
    expect(fmtNum(6.84, ' km')).toBe('6.8 km');
    expect(fmtDelta(0.5)).toBe('+0.5');
    expect(fmtDelta(-3.24)).toBe('-3.2');
    expect(fmtDelta(0)).toBe('0');
    expect(fmtDelta(null)).toBe('—');
    expect(fmtIstTime('2026-11-09T04:00:00Z')).toBe('09:30');
    expect(fmtIstTime(null)).toBe('—');
    expect(fmtDay('2026-11-09')).toBe('09 Nov');
    expect(fmtDay(null)).toBe('—');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// The hub
// ══════════════════════════════════════════════════════════════════════════

test('the reports hub lists the six new reports with a sentence each', async ({ page }) => {
  await open(page, '/dashboard/ffm-reports', {});
  for (const [title, href] of [
    ['Rep Activity Comparison', 'rep-activity'], ['Beat Compliance', 'beat-compliance'], ['Outlet Visit Gaps', 'outlet-visit-gaps'],
    ['Time & Travel', 'time-and-travel'], ['Geo-fence Exceptions', 'geo-exceptions'], ['Supervisor Teams', 'supervisor-teams'],
  ]) {
    const card = page.locator(`a[href="/dashboard/ffm-reports/${href}"]`);
    await expect(card).toBeVisible({ timeout: 45_000 });
    await expect(card).toContainText(title);
  }
  // the original reports are still there
  for (const href of ['attendance-summary', 'visit-coverage', 'hours-idle', 'builder']) await expect(page.locator(`a[href="/dashboard/ffm-reports/${href}"]`)).toBeVisible();
});

// ══════════════════════════════════════════════════════════════════════════
// Rep Activity Comparison
// ══════════════════════════════════════════════════════════════════════════

test.describe('Rep Activity Comparison', () => {
  const answers = { 'analytics/ffm/reports/rep-activity': () => REP_ACTIVITY };

  test('renders a row per rep with the counts, the ratios and the team median', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/rep-activity', answers);
    await expect(page.getByRole('heading', { name: 'Rep Activity Comparison' })).toBeVisible({ timeout: 45_000 });
    const table = page.getByTestId('rep-activity-table');
    for (const h of ['Rep', 'Planned calls', 'Adherence %', 'Calls / day', 'Productive %', 'Revenue (₹)', 'AOV (₹)', 'Km / visit', 'On site (min)']) {
      await expect(table.getByRole('button', { name: h, exact: true })).toBeVisible();
    }
    const asha = table.getByRole('row', { name: /Asha/ });
    await expect(asha).toContainText('₹1,500');
    await expect(asha).toContainText('66.7%');
    await expect(asha).toContainText('09:15');
    await expect(table.getByRole('row', { name: /Bala/ })).toContainText('₹800');
    await expect(table.getByRole('row', { name: /Team median/ })).toContainText('63.4%');
    await expect(page.getByText('Reps in view')).toBeVisible();
    await expect(page.getByText(/not a score|not a ranking/i).first()).toBeVisible();
  });

  test('"vs median" columns show the difference to the median basis', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/rep-activity', answers);
    const asha = page.getByTestId('rep-activity-table').getByRole('row', { name: /Asha/ });
    await expect(asha).toContainText('+0.2');     // calls/day 1.5 vs median 1.3
    await expect(asha).toContainText('-3.4');     // adherence 60 vs 63.4
  });

  test('changing the range refetches with the new from / to', async ({ page }) => {
    const seen = await open(page, '/dashboard/ffm-reports/rep-activity', answers);
    await expect.poll(() => calls(seen, 'rep-activity').length).toBeGreaterThanOrEqual(1);
    const before = calls(seen, 'rep-activity').length;
    await page.getByRole('tab', { name: 'This week' }).click();
    await expect.poll(() => calls(seen, 'rep-activity').length).toBeGreaterThan(before);
    const last = calls(seen, 'rep-activity').at(-1)!.q;
    expect(last.get('to')).toBe(TODAY);
    expect(last.get('from')).toBe(addDaysYmd(TODAY, -6));
  });

  test('CSV has every column on screen plus the median row', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/rep-activity', answers);
    await expect(page.getByTestId('rep-activity-table')).toContainText('Asha', { timeout: 45_000 });
    const csv = await csvOfDownload(page, () => page.getByRole('button', { name: /Export CSV/ }).click());
    const [header, asha, bala, median] = csv.split('\n');
    for (const col of ['Rep', 'Planned calls', 'Visited', 'Adherence %', 'Adherence vs median (pp)', 'Calls / day', 'Calls / day vs median', 'Productive %', 'Revenue (₹)', 'AOV (₹)', 'Km / visit', 'On site (min)', 'First call (IST)', 'Last call (IST)', 'Avg hours / day']) {
      expect(header).toContain(col);
    }
    expect(asha.startsWith('Asha,5,3,60,')).toBe(true);
    expect(asha).toContain(',1500,750,');
    expect(bala.startsWith('Bala,3,2,')).toBe(true);
    expect(median.startsWith('Team median')).toBe(true);
    expect(median).toContain('63.4');
  });

  test('an empty range shows a plain message and disables the export', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/rep-activity', { 'analytics/ffm/reports/rep-activity': () => ({ from: TODAY, to: TODAY, reps_in_view: 0, rows: [], totals: null, median: null }) });
    await expect(page.getByText('No field activity in the selected range.')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('button', { name: /Export CSV/ })).toBeDisabled();
  });

  test('a failed load shows the error with a Retry that asks again', async ({ page }) => {
    // Dev mode runs effects twice, so the failure must last until the user presses Retry (not just the first request).
    let broken = true;
    const seen = await open(page, '/dashboard/ffm-reports/rep-activity', { 'analytics/ffm/reports/rep-activity': () => (broken ? failing(400, 'The report is unavailable') : REP_ACTIVITY) });
    await expect(page.getByRole('alert').filter({ hasText: /unavailable/i })).toBeVisible({ timeout: 45_000 });
    const before = calls(seen, 'rep-activity').length;
    broken = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('rep-activity-table')).toContainText('Asha');
    expect(calls(seen, 'rep-activity').length).toBeGreaterThan(before);
  });

  test('a range over 62 days is refused before any request is sent', async ({ page }) => {
    const seen = await open(page, '/dashboard/ffm-reports/rep-activity', answers);
    await expect(page.getByTestId('rep-activity-table')).toBeVisible({ timeout: 45_000 });
    const before = calls(seen, 'rep-activity').length;
    await page.getByLabel('From').fill(addDaysYmd(TODAY, -90));
    await expect(page.getByRole('alert').filter({ hasText: /at most 62 days/ })).toBeVisible();
    expect(calls(seen, 'rep-activity').length).toBe(before);
  });

  test('no sideways page scroll at 390 px (the table scrolls inside its own box)', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/rep-activity', answers, { width: 390 });
    await expect(page.getByTestId('rep-activity-table')).toContainText('Asha', { timeout: 45_000 });
    await noSidewaysScroll(page);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Beat Compliance
// ══════════════════════════════════════════════════════════════════════════

test.describe('Beat Compliance', () => {
  const answers = { 'analytics/ffm/reports/beat-compliance': () => BEAT };

  test('shows the weekly table and a per-rep table with one column per week', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/beat-compliance', answers);
    await expect(page.getByRole('heading', { name: 'Beat Compliance' })).toBeVisible({ timeout: 45_000 });
    const weeks = page.getByTestId('beat-week-table');
    await expect(weeks.getByRole('row', { name: /2026-W46/ })).toContainText('57.1%');
    await expect(weeks.getByRole('row', { name: /2026-W45/ })).toContainText('50%');
    const reps = page.getByTestId('beat-rep-table');
    await expect(reps.getByRole('button', { name: '2026-W45 %', exact: true })).toBeVisible();
    await expect(reps.getByRole('button', { name: '2026-W46 %', exact: true })).toBeVisible();
    await expect(reps.getByRole('button', { name: 'Plan days with no visit', exact: true })).toBeVisible();
    const chitra = reps.getByRole('row', { name: /Chitra/ });
    await expect(chitra).toContainText('33.3%');
    await expect(chitra).toContainText('0%');            // her W45 week: planned, none visited
    await expect(reps.getByRole('row', { name: /All reps/ })).toContainText('54.5%');
  });

  test('choosing a rep refetches with user_id, and the dropdown keeps every rep', async ({ page }) => {
    const seen = await open(page, '/dashboard/ffm-reports/beat-compliance', answers);
    await expect(page.getByTestId('beat-rep-table')).toContainText('Asha', { timeout: 45_000 });
    await expect(page.getByLabel('Rep', { exact: true })).toContainText('Bala');
    await page.getByLabel('Rep', { exact: true }).selectOption({ label: 'Bala' });
    await expect.poll(() => calls(seen, 'beat-compliance').at(-1)?.q.get('user_id')).toBe('r2');
    await expect(page.getByLabel('Rep', { exact: true })).toContainText('Chitra');
  });

  test('CSV holds the per-rep table (with week columns) and the weekly totals', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/beat-compliance', answers);
    await expect(page.getByTestId('beat-rep-table')).toContainText('Asha', { timeout: 45_000 });
    const csv = await csvOfDownload(page, () => page.getByRole('button', { name: /Export CSV/ }).click());
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Rep,Planned calls,Visited,Missed,Adherence %,Plan days,Plan days with no visit,2026-W45 %,2026-W46 %');
    expect(lines[1]).toBe('Asha,5,3,2,60,2,0,50,66.7');
    expect(lines[2]).toBe('Chitra,3,1,2,33.3,2,1,0,50');
    expect(lines[3].startsWith('All reps,11,6,5,54.5')).toBe(true);
    expect(csv).toContain('Weekly totals');
    expect(csv).toContain('2026-W46,2026-11-09,7,4,3,57.1,3');
  });

  test('empty range', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/beat-compliance', { 'analytics/ffm/reports/beat-compliance': () => ({ from: TODAY, to: TODAY, weeks: [], reps: [], totals: null, median_adherence_pct: null, rep_options: [] }) });
    await expect(page.getByText('No route plans in the selected range.').first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('button', { name: /Export CSV/ })).toBeDisabled();
  });

  test('no sideways page scroll at 390 px', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/beat-compliance', answers, { width: 390 });
    await expect(page.getByTestId('beat-rep-table')).toContainText('Asha', { timeout: 45_000 });
    await noSidewaysScroll(page);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Time & Travel
// ══════════════════════════════════════════════════════════════════════════

test.describe('Time & Travel', () => {
  const answers = { 'analytics/ffm/reports/time-and-travel': () => TIME_TRAVEL };

  test('renders distance, calls, time on site, first / last call and the on-site share (blank when unknown)', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/time-and-travel', answers);
    await expect(page.getByRole('heading', { name: 'Time & Travel' })).toBeVisible({ timeout: 45_000 });
    const table = page.getByTestId('time-travel-table');
    for (const h of ['Km / visit', 'On site (min)', 'First call (IST)', 'Last call (IST)', 'Day span (h)', 'Worked (h)', 'On-site share %']) {
      await expect(table.getByRole('button', { name: h, exact: true })).toBeVisible();
    }
    await expect(table.getByRole('row', { name: /Asha/ })).toContainText('5.9%');
    await expect(table.getByRole('row', { name: /Chitra/ })).toContainText('—');
    await expect(table.getByRole('row', { name: /Team median/ })).toContainText('7.9');
    await expect(page.getByText('29.5 km')).toBeVisible();
  });

  test('range change refetches; CSV carries the columns and the median row', async ({ page }) => {
    const seen = await open(page, '/dashboard/ffm-reports/time-and-travel', answers);
    await expect(page.getByTestId('time-travel-table')).toContainText('Asha', { timeout: 45_000 });
    const before = calls(seen, 'time-and-travel').length;
    await page.getByRole('tab', { name: '14 days' }).click();
    await page.getByRole('tab', { name: 'This week' }).click();
    await expect.poll(() => calls(seen, 'time-and-travel').length).toBeGreaterThan(before);
    const csv = await csvOfDownload(page, () => page.getByRole('button', { name: /Export CSV/ }).click());
    const [header, asha, chitra, median] = csv.split('\n');
    for (const col of ['Km / visit', 'On site (min)', 'First call (IST)', 'Last call (IST)', 'Day span (h)', 'Worked (h)', 'On-site share %']) expect(header).toContain(col);
    expect(asha.startsWith('Asha,2,20.5,10.3,3,6.8,3,18.3,0.9,09:15,09:53,0.6,3,15.5,5.9')).toBe(true);
    expect(chitra.endsWith(',0,')).toBe(true);                         // unknown share = empty cell, not 0
    expect(median.startsWith('Team median')).toBe(true);
  });

  test('empty and 390 px', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/time-and-travel', answers, { width: 390 });
    await expect(page.getByTestId('time-travel-table')).toContainText('Asha', { timeout: 45_000 });
    await noSidewaysScroll(page);
    const p2 = await page.context().newPage();
    await open(p2, '/dashboard/ffm-reports/time-and-travel', { 'analytics/ffm/reports/time-and-travel': () => ({ from: TODAY, to: TODAY, rows: [], totals: null, median: null }) });
    await expect(p2.getByText('No visits or attendance in the selected range.')).toBeVisible({ timeout: 45_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Outlet Visit Gaps
// ══════════════════════════════════════════════════════════════════════════

test.describe('Outlet Visit Gaps', () => {
  const answers = { 'analytics/ffm/reports/outlet-visit-gaps': () => GAPS };

  test('lists outlets with days since the last visit; never-visited outlets say so', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/outlet-visit-gaps', answers);
    await expect(page.getByRole('heading', { name: 'Outlet Visit Gaps' })).toBeVisible({ timeout: 45_000 });
    const table = page.getByTestId('outlet-gaps-table');
    await expect(table.getByRole('row', { name: /Annapurna Foods/ })).toContainText('Not visited in window');
    const lakshmi = table.getByRole('row', { name: /Lakshmi Traders/ });
    await expect(lakshmi).toContainText('Chennai');
    await expect(lakshmi).toContainText('51');
    await expect(lakshmi).toContainText('₹300');
    await expect(page.getByText('Not visited in window').first()).toBeVisible();
    // default window = the last 60 days
    await expect(page.getByLabel('From')).toHaveValue(addDaysYmd(TODAY, -59));
  });

  test('the rep and "not visited for" filters refetch with user_id and min_days', async ({ page }) => {
    const seen = await open(page, '/dashboard/ffm-reports/outlet-visit-gaps', answers);
    await expect(page.getByTestId('outlet-gaps-table')).toContainText('Lakshmi Traders', { timeout: 45_000 });
    await page.getByLabel('Rep', { exact: true }).selectOption({ label: 'Bala' });
    await expect.poll(() => calls(seen, 'outlet-visit-gaps').at(-1)?.q.get('user_id')).toBe('r2');
    await page.getByLabel('Not visited for').selectOption('30');
    await expect.poll(() => calls(seen, 'outlet-visit-gaps').at(-1)?.q.get('min_days')).toBe('30');
    expect(calls(seen, 'outlet-visit-gaps').at(-1)!.q.get('limit')).toBe('500');
  });

  test('CSV has the status and the same columns as the table', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/outlet-visit-gaps', answers);
    await expect(page.getByTestId('outlet-gaps-table')).toContainText('Lakshmi Traders', { timeout: 45_000 });
    const csv = await csvOfDownload(page, () => page.getByRole('button', { name: /Export CSV/ }).click());
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Outlet,City,Planned most by,Planned calls,Visited calls,Status,Last visit,Days since last visit,Last order,Orders,Revenue (₹)');
    expect(lines[1]).toBe('Annapurna Foods,,Asha,2,0,Not visited in window,,,,0,0');
    expect(lines[2]).toBe('Lakshmi Traders,Chennai,Asha,1,1,Visited,2026-09-20,51,2026-10-05,1,300');
    expect(lines).toHaveLength(4);
  });

  test('says when only the first rows are shown', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/outlet-visit-gaps', { 'analytics/ffm/reports/outlet-visit-gaps': () => ({ ...GAPS, total: 812 }) });
    await expect(page.getByText(/Showing the first 3 of 812 outlets/)).toBeVisible({ timeout: 45_000 });
  });

  test('empty and 390 px', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/outlet-visit-gaps', answers, { width: 390 });
    await expect(page.getByTestId('outlet-gaps-table')).toContainText('Lakshmi Traders', { timeout: 45_000 });
    await noSidewaysScroll(page);
    const p2 = await page.context().newPage();
    await open(p2, '/dashboard/ffm-reports/outlet-visit-gaps', { 'analytics/ffm/reports/outlet-visit-gaps': () => ({ ...GAPS, total: 0, rows: [], summary: null }) });
    await expect(p2.getByText('No outlets match the selected range and filters.')).toBeVisible({ timeout: 45_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Geo-fence Exceptions
// ══════════════════════════════════════════════════════════════════════════

test.describe('Geo-fence Exceptions', () => {
  const answers = { 'analytics/ffm/reports/geo-exceptions': () => GEO };

  test('a per-rep table with alert counts and the list of check-ins outside the geofence', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/geo-exceptions', answers);
    await expect(page.getByRole('heading', { name: 'Geo-fence Exceptions' })).toBeVisible({ timeout: 45_000 });
    const by = page.getByTestId('geo-summary-table');
    await expect(by.getByRole('row', { name: /Asha/ })).toContainText('2');           // mock-location alerts
    await expect(by.getByRole('row', { name: /Chitra/ })).toContainText('100%');
    const list = page.getByTestId('geo-rows-table');
    const bala = list.getByRole('row', { name: /Bala/ });
    await expect(bala).toContainText('Shree Stores');
    await expect(bala).toContainText('250');
    await expect(bala).toContainText('150');
    await expect(bala).toContainText('11:00');                                          // 05:30Z = 11:00 IST
    await expect(page.getByText(/question for the rep|not as proof/i).first()).toBeVisible();
  });

  test('rep and distance filters refetch with user_id and min_distance_m', async ({ page }) => {
    const seen = await open(page, '/dashboard/ffm-reports/geo-exceptions', answers);
    await expect(page.getByTestId('geo-rows-table')).toContainText('Shree Stores', { timeout: 45_000 });
    await page.getByLabel('Rep', { exact: true }).selectOption({ label: 'Chitra' });
    await expect.poll(() => calls(seen, 'geo-exceptions').at(-1)?.q.get('user_id')).toBe('r3');
    await page.getByLabel('Distance from outlet').selectOption('250');
    await expect.poll(() => calls(seen, 'geo-exceptions').at(-1)?.q.get('min_distance_m')).toBe('250');
  });

  test('CSV holds both tables', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/geo-exceptions', answers);
    await expect(page.getByTestId('geo-rows-table')).toContainText('Shree Stores', { timeout: 45_000 });
    const csv = await csvOfDownload(page, () => page.getByRole('button', { name: /Export CSV/ }).click());
    expect(csv).toContain('Rep,Check-ins,Outside geofence,Outside %,Furthest (m),Mock-location alerts,VPN alerts,GPS jumps flagged');
    expect(csv).toContain('Asha,3,0,0,0,2,1,0');
    expect(csv).toContain('Check-ins outside the geofence');
    expect(csv).toContain('Rep,Outlet,Beat,Date,Check-in (IST),Distance (m),Geofence (m),Over by (m)');
    expect(csv).toContain('Bala,Shree Stores,Beat-B,2026-11-09,11:00,250,100,150');
  });

  test('empty and 390 px', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/geo-exceptions', answers, { width: 390 });
    await expect(page.getByTestId('geo-rows-table')).toContainText('Shree Stores', { timeout: 45_000 });
    await noSidewaysScroll(page);
    const p2 = await page.context().newPage();
    await open(p2, '/dashboard/ffm-reports/geo-exceptions', { 'analytics/ffm/reports/geo-exceptions': () => ({ from: TODAY, to: TODAY, total: 0, rows: [], summary: [], rep_options: [] }) });
    await expect(p2.getByText('No check-ins outside the geofence in the selected range.')).toBeVisible({ timeout: 45_000 });
    await expect(p2.getByRole('button', { name: /Export CSV/ })).toBeDisabled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Supervisor Teams
// ══════════════════════════════════════════════════════════════════════════

test.describe('Supervisor Teams', () => {
  const answers = { 'analytics/ffm/reports/supervisor-teams': () => SUPERVISORS };

  test('one row per supervisor with per-rep measures and the median team', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/supervisor-teams', answers);
    await expect(page.getByRole('heading', { name: 'Supervisor Teams' })).toBeVisible({ timeout: 45_000 });
    const table = page.getByTestId('supervisor-table');
    const meera = table.getByRole('row', { name: /Meera/ });
    await expect(meera).toContainText('62.5%');
    await expect(meera).toContainText('₹2,300');
    await expect(meera).toContainText('₹1,150');
    await expect(table.getByRole('row', { name: /Median team/ })).toContainText('47.9%');
    await expect(page.getByText(/not to rank supervisors/i)).toBeVisible();
  });

  test('range change refetches; CSV has the columns and the median team row', async ({ page }) => {
    const seen = await open(page, '/dashboard/ffm-reports/supervisor-teams', answers);
    await expect(page.getByTestId('supervisor-table')).toContainText('Meera', { timeout: 45_000 });
    const before = calls(seen, 'supervisor-teams').length;
    await page.getByRole('tab', { name: 'This week' }).click();
    await expect.poll(() => calls(seen, 'supervisor-teams').length).toBeGreaterThan(before);
    const csv = await csvOfDownload(page, () => page.getByRole('button', { name: /Export CSV/ }).click());
    const [header, meera, ravi, median] = csv.split('\n');
    expect(header).toBe('Supervisor,Reps,Reps visiting,Planned calls,Visited,Adherence %,Productive %,Calls / rep-day,Orders,Revenue (₹),Revenue / rep (₹),Days present');
    expect(meera).toBe('Meera,2,2,8,5,62.5,60,1.3,3,2300,1150,5');
    expect(ravi.startsWith('Ravi,1,1,3,1,33.3')).toBe(true);
    expect(median.startsWith('Median team')).toBe(true);
  });

  test('empty and 390 px', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/supervisor-teams', answers, { width: 390 });
    await expect(page.getByTestId('supervisor-table')).toContainText('Meera', { timeout: 45_000 });
    await noSidewaysScroll(page);
    const p2 = await page.context().newPage();
    await open(p2, '/dashboard/ffm-reports/supervisor-teams', { 'analytics/ffm/reports/supervisor-teams': () => ({ from: TODAY, to: TODAY, reps_in_view: 0, rows: [], median: null }) });
    await expect(p2.getByText('No supervised reps with activity in the selected range.')).toBeVisible({ timeout: 45_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Extra data points on the existing reports
// ══════════════════════════════════════════════════════════════════════════

test.describe('Attendance Summary: extra columns', () => {
  const SUMMARY = {
    from: TODAY, to: TODAY, working_days: 10,
    rows: [
      { user_id: 'r1', name: 'Asha Menon', working_days: 10, present: 8, late: 2, half_day: 0, on_leave: 1, absent: 1 },
      { user_id: 'r2', name: 'Ravi Kumar', working_days: 10, present: 9, late: 0, half_day: 1, on_leave: 0, absent: 0 },
    ],
  };
  const EXTRAS = {
    from: TODAY, to: TODAY, median: null,
    rows: [{ user_id: 'r1', days_present: 8, avg_checkin_time: '09:15', avg_checkin_min: 555, avg_checkout_time: '17:30', avg_checkout_min: 1050, total_hours: 62.5, hours_days: 8, avg_hours: 7.8, missed_checkouts: 1, regularised_days: 2 }],
  };
  const answers = { 'attendance/summary': () => SUMMARY, 'analytics/ffm/reports/attendance-extras': () => EXTRAS };

  test('adds average check-in / check-out, hours, days with no check-out and regularised days, joined by user', async ({ page }) => {
    const seen = await open(page, '/dashboard/ffm-reports/attendance-summary', answers);
    await expect(page.getByRole('heading', { name: 'Attendance Summary' })).toBeVisible({ timeout: 45_000 });
    const asha = page.getByRole('row', { name: /Asha Menon/ });
    await expect(asha).toContainText('09:15');
    await expect(asha).toContainText('17:30');
    await expect(asha).toContainText('7.8');
    await expect(asha).toContainText('62.5');
    // a rep with no extras row reads as dashes, and the original columns are untouched
    const ravi = page.getByRole('row', { name: /Ravi Kumar/ });
    await expect(ravi).toContainText('—');
    await expect(ravi).toContainText('90%');
    for (const h of ['Avg check-in', 'Avg check-out', 'Avg hours / day', 'Total hours', 'Days, no check-out', 'Regularised']) await expect(page.getByRole('button', { name: h, exact: true })).toBeVisible();
    // same window as the summary: this month so far
    expect(calls(seen, 'attendance-extras').at(-1)!.q.get('from')).toBe(`${TODAY.slice(0, 7)}-01`);
    expect(calls(seen, 'attendance-extras').at(-1)!.q.get('to')).toBe(TODAY);
  });

  test('CSV has the original columns first, then the new ones', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/attendance-summary', answers);
    await expect(page.getByRole('row', { name: /Asha Menon/ })).toBeVisible({ timeout: 45_000 });
    const csv = await csvOfDownload(page, () => page.getByRole('button', { name: /Export CSV/ }).click());
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Name,Working Days,Present,Late,Half Day,Leave,Absent,Attendance %,Avg Check-in (IST),Avg Check-out (IST),Avg Hours/Day,Total Hours,Days With No Check-out,Regularised Days');
    expect(lines.find((l) => l.startsWith('Asha Menon'))).toBe('Asha Menon,10,8,2,0,1,1,80,09:15,17:30,7.8,62.5,1,2');
    expect(lines.find((l) => l.startsWith('Ravi Kumar'))).toBe('Ravi Kumar,10,9,0,1,0,0,90,,,,,,');
  });

  test('if the extras call fails the summary still renders and says so', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/attendance-summary', { 'attendance/summary': () => SUMMARY, 'analytics/ffm/reports/attendance-extras': () => failing(403, 'Module not enabled') });
    await expect(page.getByRole('row', { name: /Asha Menon/ })).toContainText('80%', { timeout: 45_000 });
    await expect(page.getByText(/could not be loaded for this range/)).toBeVisible();
  });

  test('no sideways page scroll at 390 px', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/attendance-summary', answers, { width: 390 });
    await expect(page.getByRole('row', { name: /Asha Menon/ })).toBeVisible({ timeout: 45_000 });
    await noSidewaysScroll(page);
  });
});

test.describe('Visit Coverage: real endpoint, range, by rep', () => {
  const COVERAGE = {
    from: TODAY, to: TODAY, universe: 4, covered: 3, coverage_pct: 75, never_visited: 1,
    by_city: [{ city: 'Chennai', universe: 2, covered: 2 }, { city: 'Madurai', universe: 1, covered: 1 }, { city: 'No city on record', universe: 1, covered: 0 }],
    by_rep: [
      { fe_id: 'r1', fe_name: 'Asha', universe: 4, covered: 2, gap: 2, coverage_pct: 50 },
      { fe_id: 'r2', fe_name: 'Bala', universe: 2, covered: 2, gap: 0, coverage_pct: 100 },
    ],
  };
  const answers = { 'analytics/ffm/reports/visit-coverage': () => COVERAGE };

  test('reads the report endpoint (not /analytics/outlet-coverage) and shows the by-rep table', async ({ page }) => {
    const seen = await open(page, '/dashboard/ffm-reports/visit-coverage', answers);
    await expect(page.getByRole('heading', { name: 'Visit Coverage' })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('75%').first()).toBeVisible();
    await expect(page.getByRole('row', { name: /Madurai/ })).toContainText('100%');
    const reps = page.getByTestId('coverage-rep-table');
    await expect(reps.getByRole('row', { name: /Asha/ })).toContainText('50%');
    expect(calls(seen, '/analytics/outlet-coverage')).toHaveLength(0);
    expect(calls(seen, 'reports/visit-coverage').at(-1)!.q.get('from')).toBe(`${TODAY.slice(0, 7)}-01`);
  });

  test('changing the range refetches; CSV has the city table and the rep table', async ({ page }) => {
    const seen = await open(page, '/dashboard/ffm-reports/visit-coverage', answers);
    await expect(page.getByTestId('coverage-rep-table')).toContainText('Asha', { timeout: 45_000 });
    const before = calls(seen, 'reports/visit-coverage').length;
    await page.getByRole('tab', { name: 'This week' }).click();
    await expect.poll(() => calls(seen, 'reports/visit-coverage').length).toBeGreaterThan(before);
    const csv = await csvOfDownload(page, () => page.getByRole('button', { name: /Export CSV/ }).click());
    expect(csv).toContain('City,Universe,Covered,Gap,Coverage %');
    expect(csv).toContain('Chennai,2,2,0,100');
    expect(csv).toContain('Rep,Universe,Covered,Gap,Coverage %');
    expect(csv).toContain('Asha,4,2,2,50');
  });

  test('a tenant with nothing planned gets zeros and an empty-table message, not a crash', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/visit-coverage', { 'analytics/ffm/reports/visit-coverage': () => ({ from: TODAY, to: TODAY, universe: 0, covered: 0, coverage_pct: 0, never_visited: 0, by_city: [], by_rep: [] }) });
    await expect(page.getByText('No planned outlets in the selected range.')).toBeVisible({ timeout: 45_000 });
  });

  test('no sideways page scroll at 390 px', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/visit-coverage', answers, { width: 390 });
    await expect(page.getByTestId('coverage-rep-table')).toContainText('Asha', { timeout: 45_000 });
    await noSidewaysScroll(page);
  });
});

test.describe('Hours & Idle: visits, time on site, km', () => {
  const TEAM = [
    { id: 'att-1', user_id: 'r1', name: 'Asha', checkin_at: `${TODAY}T03:30:00Z`, checkout_at: `${TODAY}T12:00:00Z`, total_hours: 8.5, users: { name: 'Asha', employee_id: 'E-1' } },
    { id: 'att-2', user_id: 'r2', name: 'Bala', checkin_at: `${TODAY}T04:30:00Z`, checkout_at: null, total_hours: 4, users: { name: 'Bala', employee_id: 'E-2' } },
  ];
  const TT = { from: TODAY, to: TODAY, rows: [{ fe_id: 'r1', fe_name: 'Asha', visited_stops: 6, onsite_hours: 2.5, onsite_share_pct: 29.4, km_total: 31.2 }], totals: null, median: null };
  const answers = { 'attendance/team': () => TEAM, 'analytics/ffm/reports/time-and-travel': () => TT };

  test('adds check-in / check-out, visits, on-site hours, on-site share and km, joined by user', async ({ page }) => {
    const seen = await open(page, '/dashboard/ffm-reports/hours-idle', answers);
    await expect(page.getByRole('heading', { name: /Hours/ })).toBeVisible({ timeout: 45_000 });
    const asha = page.getByRole('row', { name: /Asha/ });
    await expect(asha).toContainText('09:00');            // 03:30Z
    await expect(asha).toContainText('17:30');            // 12:00Z
    await expect(asha).toContainText('29.4%');
    await expect(asha).toContainText('31.2');
    await expect(page.getByRole('row', { name: /Bala/ })).toContainText('—');
    const tt = calls(seen, 'time-and-travel').at(-1)!.q;
    expect(tt.get('from')).toBe(TODAY);
    expect(tt.get('to')).toBe(TODAY);
  });

  test('CSV carries the new columns; a failed extras call leaves the report working', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/hours-idle', answers);
    await expect(page.getByRole('row', { name: /Asha/ })).toBeVisible({ timeout: 45_000 });
    const csv = await csvOfDownload(page, () => page.getByRole('button', { name: /Export CSV/ }).click());
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Name,Employee ID,Working hours,Shift hours,Idle hours,Utilisation %,Check-in (IST),Check-out (IST),Visits,On site (h),On-site share %,Km');
    expect(lines.find((l) => l.startsWith('Asha'))).toBe('Asha,E-1,8.50,8,0.00,100,09:00,17:30,6,2.5,29.4,31.2');

    const p2 = await page.context().newPage();
    await open(p2, '/dashboard/ffm-reports/hours-idle', { 'attendance/team': () => TEAM, 'analytics/ffm/reports/time-and-travel': () => failing(400, 'nope') });
    await expect(p2.getByRole('row', { name: /Asha/ })).toContainText('—', { timeout: 45_000 });
  });

  test('no sideways page scroll at 390 px', async ({ page }) => {
    await open(page, '/dashboard/ffm-reports/hours-idle', answers, { width: 390 });
    await expect(page.getByRole('row', { name: /Asha/ })).toBeVisible({ timeout: 45_000 });
    await noSidewaysScroll(page);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Demo tenant
// ══════════════════════════════════════════════════════════════════════════

test.describe('demo tenant (client-side mocks)', () => {
  async function demo(page: Page, path: string) {
    await page.goto('/login');
    await page.getByPlaceholder('you@company.com').fill('demo@kinematic.com');
    await page.getByPlaceholder('Enter your password').fill('demo1234');
    await page.getByRole('button', { name: /Sign In/ }).click();
    await page.waitForURL('**/dashboard', { timeout: 30_000 });
    await page.goto(path);
  }
  for (const [path, heading, testId] of [
    ['/dashboard/ffm-reports/rep-activity', 'Rep Activity Comparison', 'rep-activity-table'],
    ['/dashboard/ffm-reports/beat-compliance', 'Beat Compliance', 'beat-rep-table'],
    ['/dashboard/ffm-reports/time-and-travel', 'Time & Travel', 'time-travel-table'],
    ['/dashboard/ffm-reports/outlet-visit-gaps', 'Outlet Visit Gaps', 'outlet-gaps-table'],
    ['/dashboard/ffm-reports/geo-exceptions', 'Geo-fence Exceptions', 'geo-rows-table'],
    ['/dashboard/ffm-reports/supervisor-teams', 'Supervisor Teams', 'supervisor-table'],
  ] as const) {
    test(`${heading} fills with demo rows`, async ({ page }) => {
      await demo(page, path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 45_000 });
      await expect(page.getByTestId(testId).getByRole('row').nth(1)).toBeVisible();
      expect(await page.getByTestId(testId).getByRole('row').count()).toBeGreaterThan(2);
    });
  }
  test('Visit Coverage and Attendance Summary still fill for the demo account', async ({ page }) => {
    await demo(page, '/dashboard/ffm-reports/visit-coverage');
    await expect(page.getByTestId('coverage-rep-table')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('row', { name: /Bangalore/ })).toBeVisible();
    await page.goto('/dashboard/ffm-reports/attendance-summary');
    await expect(page.getByRole('button', { name: 'Avg check-in', exact: true })).toBeVisible({ timeout: 45_000 });
  });
});
