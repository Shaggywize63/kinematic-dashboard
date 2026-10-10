import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { demoLogin, mockApi, seedSession, SEED_USER } from './utils';
import { FAKE_MAPS } from './fakeMaps';
import { buildTimeline, readDailyReport, timelinePlaces } from '../src/lib/travelReport';

/**
 * Field Force → "Daily Travel Report" (/dashboard/travel-report), backed by GET /api/v1/attendance/daily-report/team
 * (the Team table) and GET /api/v1/attendance/daily-report?date=&user_id= (one person's day).
 *
 * Everything runs against an intercepted API and the stand-in Maps SDK (e2e/fakeMaps.ts, whose geocoder answers
 * "80 Feet Road, Koramangala, Bengaluru" for every point and records each lookup). Pinned here: the team table and
 * its CSV, the employee day's time-ordered timeline, place names that never block the rows, the numbered map
 * markers, the timeline CSV, the print button + print stylesheet, the empty / error states and the demo mode.
 */

test.use({ timezoneId: 'Asia/Kolkata', locale: 'en-IN' });

const DATE = '2026-10-08';
const at = (hhmm: string, date = DATE) => `${date}T${hhmm}:00+05:30`;
const NAME = '80 Feet Road, Koramangala, Bengaluru'; // what the stand-in geocoder returns for any point

// ── Fixtures ────────────────────────────────────────────────────────────────
const TEAM = [
  { user_id: 'u-ravi', name: 'Ravi Kumar', employee_id: 'E-2', checkin_at: at('08:55'), checkout_at: null, total_hours: null,
    mode: 'car', label: 'Car', total_km: 5, visits: 1, visit_minutes: 18, halts: 0, halt_minutes: 0 },
  { user_id: 'u-asha', name: 'Asha Menon', employee_id: 'E-1', checkin_at: at('09:12'), checkout_at: at('18:05'), total_hours: 8.88,
    mode: 'own_bike', label: 'Own Bike', total_km: 23.4, visits: 3, visit_minutes: 54, halts: 2, halt_minutes: 41 },
  { user_id: 'u-evil', name: '=HYPERLINK("http://x")', employee_id: null, checkin_at: at('10:00'), checkout_at: at('17:00'), total_hours: 7,
    mode: null, label: null, total_km: 0, visits: 0, visit_minutes: 0, halts: 0, halt_minutes: 0 },
];

const leg = (index: number, km: number, method: string, from: any, to: any) => ({ index, km, method, from, to });
const P = {
  home: { lat: 13.0, lng: 80.1 },
  visit1: { lat: 13.05, lng: 80.2 }, visit1Out: { lat: 13.0502, lng: 80.2002 },
  halt: { lat: 13.07, lng: 80.23 },
  visit2: { lat: 13.09, lng: 80.25 }, visit2Out: { lat: 13.0902, lng: 80.2502 },
};
const ROUTE = Array.from({ length: 12 }, (_, i) => ({ lat: 13 + i * 0.01, lng: 80.1 + i * 0.015, at: at(`${String(9 + i).padStart(2, '0')}:00`) }));

/** A full field day. Lists are deliberately NOT in time order (visits newest-first) — the page must sort them. */
const DAY = {
  date: DATE,
  user: { id: 'u-asha', name: 'Asha Menon', employee_id: 'E-1', role: 'field_executive' },
  shift: { attendance_id: 'att-1', checkin_at: at('09:12'), checkout_at: at('18:05'), total_hours: 8.88, in_progress: false },
  transport: { mode: 'own_bike', label: 'Own Bike' },
  travel: {
    total_km: 23.4, method: 'mixed',
    legs: [
      leg(0, 9.1, 'gps_trail', { kind: 'checkin', at: at('09:12'), ...P.home, label: 'Check-in' }, { kind: 'form_checkin', at: at('10:05'), ...P.visit1, label: 'Customer Visit' }),
      leg(1, 6.3, 'gps_trail', { kind: 'form_checkout', at: at('10:23'), ...P.visit1Out, label: 'Customer Visit' }, { kind: 'form_checkin', at: at('14:10'), ...P.visit2, label: 'Dealer Visit' }),
      leg(2, 8, 'straight_line', { kind: 'form_checkout', at: at('14:30'), ...P.visit2Out, label: 'Dealer Visit' }, { kind: 'checkout', at: at('18:05'), ...P.home, label: 'Check-out' }),
    ],
  },
  visits: [
    { submission_id: 's2', label: 'Dealer Visit', arrival_at: at('14:10'), departure_at: at('14:30'), minutes: 20, ...P.visit2 },
    { submission_id: 's1', label: 'Customer Visit', arrival_at: at('10:05'), departure_at: at('10:23'), minutes: 18, ...P.visit1 },
  ],
  halts: [{ index: 0, start_at: at('12:30'), end_at: at('12:52'), minutes: 22, ...P.halt, points: 6 }],
  route: { points: ROUTE, thinned: true },
  summary: { visits: 2, visit_minutes: 38, halts: 1, halt_minutes: 22, total_km: 23.4 },
};
const NO_ATTENDANCE = {
  date: DATE, user: DAY.user, shift: { attendance_id: null, checkin_at: null, checkout_at: null, total_hours: null, in_progress: false },
  transport: { mode: null, label: null }, travel: { total_km: 0, method: 'none', legs: [] }, visits: [], halts: [],
  route: { points: [], thinned: false }, summary: { visits: 0, visit_minutes: 0, halts: 0, halt_minutes: 0, total_km: 0 },
};

/** The timeline the page should show, worked out from the same fixture (independent of the page's own render). */
const EXPECTED_KINDS = ['checkin', 'travel', 'visit', 'travel', 'halt', 'visit', 'travel', 'checkout'];

interface Fake {
  team: (q: URLSearchParams, n: number) => { status?: number; body: unknown };
  day: (q: URLSearchParams, n: number) => { status?: number; body: unknown };
  teamCalls: URLSearchParams[];
  dayCalls: URLSearchParams[];
}

async function setup(page: Page, f: Partial<Pick<Fake, 'team' | 'day'>> = {}, opts: { maps?: boolean; afterMaps?: string } = {}) {
  const fake: Fake = {
    team: () => ({ body: { success: true, data: { date: DATE, rows: TEAM } } }),
    day: () => ({ body: { success: true, data: DAY } }),
    teamCalls: [], dayCalls: [], ...f,
  };
  if (opts.maps !== false) await page.addInitScript(FAKE_MAPS);
  if (opts.afterMaps) await page.addInitScript(opts.afterMaps); // order matters: this one patches the SDK installed above
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      if (method !== 'GET') return false;
      const x = new URL(url);
      if (x.pathname === '/api/v1/attendance/daily-report/team') {
        fake.teamCalls.push(x.searchParams);
        const r = fake.team(x.searchParams, fake.teamCalls.length);
        await route.fulfill({ status: r.status ?? 200, json: r.body });
        return true;
      }
      if (x.pathname === '/api/v1/attendance/daily-report') {
        fake.dayCalls.push(x.searchParams);
        const r = fake.day(x.searchParams, fake.dayCalls.length);
        await route.fulfill({ status: r.status ?? 200, json: r.body });
        return true;
      }
      return false;
    },
  });
  return fake;
}

const gm = <T,>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>;
const rows = (page: Page) => page.getByTestId('timeline-row');
const kinds = (page: Page) => rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
/** A small CSV reader: quoted fields, "" escapes, \n rows. */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}
async function downloadOf(page: Page, click: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: download.suggestedFilename(), csv: parseCsv(readFileSync((await download.path())!, 'utf8')) };
}
const openDay = async (page: Page) => {
  await page.goto(`/dashboard/travel-report?date=${DATE}&user_id=u-asha`);
  await expect(rows(page).first()).toBeVisible({ timeout: 60_000 });
};

test.describe('Daily Travel Report — Team table', () => {
  test('lists everyone who checked in that day, with shift, mode, km, visits and halts', async ({ page }) => {
    const fake = await setup(page);
    await page.goto(`/dashboard/travel-report?date=${DATE}`);
    await expect(page.getByTestId('team-row').first()).toBeVisible({ timeout: 60_000 });

    expect(fake.teamCalls).toHaveLength(1);
    expect(fake.teamCalls[0].get('date')).toBe(DATE);
    expect(fake.dayCalls).toHaveLength(0); // the day view is not fetched until a row is opened

    const asha = page.getByTestId('team-row').filter({ hasText: 'Asha Menon' });
    await expect(asha).toContainText('E-1');
    await expect(asha).toContainText(/09:12\s*am/i);
    await expect(asha).toContainText(/06:05\s*pm/i);
    await expect(asha).toContainText('Own Bike');
    await expect(asha).toContainText('23.4 km');
    await expect(asha.getByRole('cell').nth(5)).toContainText('3'); // visits
    await expect(asha.getByRole('cell').nth(5)).toContainText('54m');
    await expect(asha.getByRole('cell').nth(6)).toContainText('2'); // halts
    await expect(asha.getByRole('cell').nth(6)).toContainText('41m');

    // Still on shift: no check-out time, just a dash. No mode recorded: a dash too.
    const ravi = page.getByTestId('team-row').filter({ hasText: 'Ravi Kumar' });
    await expect(ravi.getByRole('cell').nth(2)).toHaveText('—');
    await expect(ravi).toContainText('Car');
    await expect(page.getByTestId('team-row').filter({ hasText: 'HYPERLINK' }).getByRole('cell').nth(3)).toHaveText('—');
  });

  test('sorts by name first and by a column when its header is clicked', async ({ page }) => {
    await setup(page);
    await page.goto(`/dashboard/travel-report?date=${DATE}`);
    const names = () => page.getByTestId('team-row').evaluateAll((els) => els.map((e) => e.querySelector('button span')?.textContent));
    await expect(page.getByTestId('team-row')).toHaveCount(3, { timeout: 60_000 });
    const byName = await names();
    expect(byName.indexOf('Asha Menon')).toBeLessThan(byName.indexOf('Ravi Kumar'));

    await page.getByRole('button', { name: /^Distance/ }).click(); // ascending: least first
    expect(await names()).toEqual(['=HYPERLINK("http://x")', 'Ravi Kumar', 'Asha Menon']);
    await page.getByRole('button', { name: /^Distance/ }).click(); // descending
    expect((await names())[0]).toBe('Asha Menon');
  });

  test('changing the date asks for that date and keeps it in the URL', async ({ page }) => {
    const fake = await setup(page);
    await page.goto(`/dashboard/travel-report?date=${DATE}`);
    await expect(page.getByTestId('team-row')).toHaveCount(3, { timeout: 60_000 });

    await page.getByLabel('Date', { exact: true }).fill('2026-10-07');
    await expect.poll(() => fake.teamCalls.map((c) => c.get('date'))).toEqual([DATE, '2026-10-07']);
    await expect(page).toHaveURL(/date=2026-10-07/);
  });

  test('with no date in the URL it asks for today (IST)', async ({ page }) => {
    const fake = await setup(page);
    await page.goto('/dashboard/travel-report');
    await expect.poll(() => fake.teamCalls.length).toBeGreaterThan(0);
    expect(fake.teamCalls[0].get('date')).toBe(new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10));
  });

  test('"Export CSV" downloads the table as shown, with formula-looking names defused', async ({ page }) => {
    await setup(page);
    await page.goto(`/dashboard/travel-report?date=${DATE}`);
    await expect(page.getByTestId('team-row')).toHaveCount(3, { timeout: 60_000 });

    const { name, csv } = await downloadOf(page, () => page.getByRole('button', { name: 'Export CSV' }).click());
    expect(name).toMatch(new RegExp(`^daily-travel-team-${DATE}-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
    expect(csv[0]).toEqual([
      'Employee', 'Employee ID', 'Date', 'Check-in', 'Check-out', 'Hours', 'Mode of transport', 'Distance (km)',
      'Visits', 'Visit minutes', 'Halts', 'Halt minutes',
    ]);
    const body = csv.slice(1).filter((r) => r.length > 1);
    expect(body).toHaveLength(3);
    const asha = body.find((r) => r[0] === 'Asha Menon')!;
    expect(asha).toEqual(['Asha Menon', 'E-1', DATE, `${DATE} 09:12`, `${DATE} 18:05`, '8.88', 'Own Bike', '23.4', '3', '54', '2', '41']);
    const ravi = body.find((r) => r[0] === 'Ravi Kumar')!;
    expect(ravi.slice(3, 7)).toEqual([`${DATE} 08:55`, '', '', 'Car']); // still on shift: no check-out, no hours
    expect(body.some((r) => r[0] === `'=HYPERLINK("http://x")`)).toBe(true); // would otherwise run as a formula
  });

  test('nobody checked in: a plain empty state and nothing to export', async ({ page }) => {
    await setup(page, { team: () => ({ body: { success: true, data: { date: DATE, rows: [] } } }) });
    await page.goto(`/dashboard/travel-report?date=${DATE}`);
    await expect(page.getByText('No one checked in on 08 Oct 2026')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });

  test('a failed load says so, and refresh loads it', async ({ page }) => {
    const fake = await setup(page, {
      team: (_q, n) => (n === 1 ? { status: 500, body: { success: false, error: 'report unavailable' } } : { body: { success: true, data: { date: DATE, rows: TEAM } } }),
    });
    await page.goto(`/dashboard/travel-report?date=${DATE}`);
    await expect(page.getByRole('alert').filter({ hasText: 'report unavailable' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Refresh team report' }).click();
    await expect(page.getByTestId('team-row')).toHaveCount(3);
    expect(fake.teamCalls).toHaveLength(2);
  });

  test('a row opens that person\'s day (user_id + date in the request and the URL); "All employees" goes back', async ({ page }) => {
    const fake = await setup(page);
    await page.goto(`/dashboard/travel-report?date=${DATE}`);
    await page.getByTestId('team-row').filter({ hasText: 'Asha Menon' }).click();

    await expect(rows(page).first()).toBeVisible({ timeout: 60_000 });
    expect(fake.dayCalls).toHaveLength(1);
    expect(fake.dayCalls[0].get('date')).toBe(DATE);
    expect(fake.dayCalls[0].get('user_id')).toBe('u-asha');
    await expect(page).toHaveURL(/user_id=u-asha/);
    await expect(page.getByTestId('day-identity')).toContainText('Asha Menon');

    await page.getByRole('button', { name: 'All employees' }).click();
    await expect(page.getByTestId('team-row')).toHaveCount(3);
    await expect(page).not.toHaveURL(/user_id=/);
  });
});

test.describe('Daily Travel Report — Employee day', () => {
  test('summary tiles carry the day\'s totals, mode and shift', async ({ page }) => {
    await setup(page);
    await openDay(page);
    await expect(page.getByTestId('tile-km-value')).toHaveText('23.4 km');
    await expect(page.getByTestId('tile-km')).toContainText('3 legs');
    await expect(page.getByTestId('tile-mode-value')).toHaveText('Own Bike');
    await expect(page.getByTestId('tile-visits-value')).toHaveText('2');
    await expect(page.getByTestId('tile-visits')).toContainText('38m at customers');
    await expect(page.getByTestId('tile-halts-value')).toHaveText('1');
    await expect(page.getByTestId('tile-halts')).toContainText('22m halted');
    await expect(page.getByTestId('tile-shift-value')).toContainText(/09:12\s*am\s*–\s*06:05\s*pm/i);
    await expect(page.getByTestId('tile-shift')).toContainText('8h 53m');
  });

  test('the timeline interleaves check-in, legs, visits, halts and check-out in the order they started', async ({ page }) => {
    await setup(page);
    await openDay(page);

    // The fixture lists visits newest-first; the page must not trust that.
    expect(await kinds(page)).toEqual(EXPECTED_KINDS);

    const r = rows(page);
    await expect(r.nth(0)).toContainText(/09:12\s*am/i);
    await expect(r.nth(1)).toContainText('Check-in → Customer Visit');
    await expect(r.nth(1)).toContainText('9.1 km');
    await expect(r.nth(2)).toContainText('Customer Visit');
    await expect(r.nth(2)).toContainText(/10:05\s*am\s*–\s*10:23\s*am/i);
    await expect(r.nth(2)).toContainText('18m');
    await expect(r.nth(3)).toContainText('6.3 km');
    // The halt sits INSIDE the 10:23 – 14:10 leg: it is listed after the leg's row, before the next visit.
    await expect(r.nth(4)).toContainText(/12:30\s*pm\s*–\s*12:52\s*pm/i);
    await expect(r.nth(4)).toContainText('22m');
    await expect(r.nth(5)).toContainText('Dealer Visit');
    await expect(r.nth(5)).toContainText('20m');
    await expect(r.nth(6)).toContainText('8 km');
    await expect(r.nth(6)).toContainText('straight line'); // a leg with no GPS trail says so
    await expect(r.nth(7)).toContainText(/06:05\s*pm/i);

    // Visits and halts carry the number their map marker has (one count, in time order).
    await expect(r.nth(2).getByLabel(/^Stop \d/)).toHaveAttribute('aria-label', 'Stop 1');
    await expect(r.nth(4).getByLabel(/^Stop \d/)).toHaveAttribute('aria-label', 'Stop 2');
    await expect(r.nth(5).getByLabel(/^Stop \d/)).toHaveAttribute('aria-label', 'Stop 3');
    await expect(r.nth(0).getByLabel(/^Stop \d/)).toHaveCount(0);
  });

  test('the same ordering holds in the pure timeline builder (any order in, time order out)', async () => {
    const shuffled = { ...DAY, visits: [...DAY.visits].reverse(), halts: [...DAY.halts] };
    const items = buildTimeline(readDailyReport({ success: true, data: shuffled })!);
    expect(items.map((i) => i.kind)).toEqual(EXPECTED_KINDS);
    expect(items.map((i) => i.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(items.map((i) => i.marker)).toEqual([null, null, 1, null, 2, 3, null, null]);
  });

  test('the map draws the route and numbered markers for visits and halts, with dots for check-in / check-out', async ({ page }) => {
    await setup(page);
    await openDay(page);
    await expect.poll(() => gm<number>(page, 'window.__gm.markers.filter(m => !m.removed).length')).toBe(5);

    const labelled = await gm<Array<{ n: string; title: string }>>(page,
      `window.__gm.markers.filter(m => !m.removed && m.o.label).map(m => ({ n: m.o.label.text, title: m.o.title })).sort((a, b) => a.n - b.n)`);
    expect(labelled).toEqual([
      { n: '1', title: '1. Visit — Customer Visit' },
      { n: '2', title: '2. Halt' },
      { n: '3', title: '3. Visit — Dealer Visit' },
    ]);
    const dots = await gm<string[]>(page, `window.__gm.markers.filter(m => !m.removed && !m.o.label).map(m => m.o.title).sort()`);
    expect(dots).toEqual(['Check-in', 'Check-out']);

    // The route: the soft line + the crisp line, both through every GPS point the API sent.
    expect(await gm<number>(page, 'window.__gm.polylines.filter(p => !p.removed).length')).toBe(2);
    expect(await gm<number>(page, 'window.__gm.polylines.filter(p => !p.removed)[1].o.path.length')).toBe(ROUTE.length);
    await expect(page.getByText(`Route drawn from ${ROUTE.length} GPS points (thinned for display)`)).toBeVisible();

    // A marker opens a popup with its times and duration.
    await page.evaluate(`window.__gm.markers.find(m => m.o.label && m.o.label.text === '2').fire('click')`);
    const html = await gm<string>(page, 'window.__gm.info.content');
    expect(html).toContain('2. Halt');
    expect(html).toMatch(/12:30\s*pm\s*–\s*12:52\s*pm/i);
    expect(html).toContain('22m');
  });

  test('place names fill in without blocking: coordinates first, the name when the lookup answers, one lookup per coordinate', async ({ page }) => {
    // Hold every reverse-geocode until the test lets go.
    await setup(page, {}, { afterMaps: `(() => {
      const G = window.google.maps.Geocoder, orig = G.prototype.geocode;
      let release; const gate = new Promise((r) => { release = r; });
      window.__releaseGeocode = release;
      G.prototype.geocode = async function (a) { await gate; return orig.call(this, a); };
    })();` });
    await openDay(page);

    // All eight rows and their coordinates are on screen while no name has arrived. (A row only looks its name
    // up once it has been scrolled into view, so bring the visit row up first.)
    await expect(rows(page)).toHaveCount(8);
    await rows(page).nth(2).scrollIntoViewIfNeeded();
    await expect(rows(page).nth(2).getByTestId('place')).toContainText('13.0500, 80.2000');
    await expect(page.getByText(NAME)).toHaveCount(0);

    await page.evaluate('window.__releaseGeocode()');
    await expect(rows(page).nth(2).getByTestId('place')).toContainText(NAME);
    await expect(rows(page).nth(2).getByTestId('place')).toContainText('13.0500, 80.2000'); // the coordinates stay under the name

    // Resolve every row (the CSV export does), then count the lookups: one per distinct ~11 m cell, not per row.
    const distinct = timelinePlaces(buildTimeline(readDailyReport(DAY)!)).length;
    expect(distinct).toBeLessThan(2 * 8); // the fixture really does repeat points (check-in = check-out = home, …)
    await downloadOf(page, () => page.getByRole('button', { name: 'Export CSV' }).click());
    expect(await gm<number>(page, 'window.__gm.geocodes.length')).toBe(distinct);
  });

  test('"Export CSV" writes the timeline rows in order, with place names and coordinates', async ({ page }) => {
    await setup(page);
    await openDay(page);
    const { name, csv } = await downloadOf(page, () => page.getByRole('button', { name: 'Export CSV' }).click());

    expect(name).toMatch(new RegExp(`^daily-travel-asha-menon-${DATE}-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
    expect(csv[0]).toEqual(['#', 'Date', 'Employee', 'Employee ID', 'Event', 'Start', 'End', 'Minutes', 'Distance (km)', 'Details', 'Place', 'Latitude', 'Longitude']);
    const body = csv.slice(1).filter((r) => r.length > 1);
    expect(body.map((r) => r[4])).toEqual(['Check-in', 'Travel', 'Visit', 'Travel', 'Halt', 'Visit', 'Travel', 'Check-out']);
    expect(body.map((r) => r[0])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);

    expect(body[0]).toEqual(['1', DATE, 'Asha Menon', 'E-1', 'Check-in', `${DATE} 09:12`, '', '', '', '', NAME, '13', '80.1']);
    expect(body[1].slice(4, 10)).toEqual(['Travel', `${DATE} 09:12`, `${DATE} 10:05`, '', '9.1', 'Check-in → Customer Visit']);
    expect(body[1][10]).toBe(`${NAME} → ${NAME}`);
    expect(body[2]).toEqual(['3', DATE, 'Asha Menon', 'E-1', 'Visit', `${DATE} 10:05`, `${DATE} 10:23`, '18', '', 'Customer Visit', NAME, '13.05', '80.2']);
    expect(body[4]).toEqual(['5', DATE, 'Asha Menon', 'E-1', 'Halt', `${DATE} 12:30`, `${DATE} 12:52`, '22', '', '6 GPS pings', NAME, '13.07', '80.23']);
    expect(body[6].slice(4, 10)).toEqual(['Travel', `${DATE} 14:30`, `${DATE} 18:05`, '', '8', 'Dealer Visit → Check-out · straight line']);
  });

  test('"Print / Save as PDF" names every row first, then calls window.print()', async ({ page }) => {
    // Record what the page looks like at the moment print() is called.
    await page.addInitScript(`window.__prints = []; window.print = () => {
      window.__prints.push({
        title: document.title,
        places: Array.from(document.querySelectorAll('[data-testid="place"]')).map((e) => e.textContent),
      });
    };`);
    await setup(page);
    await openDay(page);
    await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeEnabled();
    expect(await gm<number>(page, 'window.__prints.length')).toBe(0);

    await page.getByRole('button', { name: 'Print / Save as PDF' }).click();
    await expect.poll(() => gm<number>(page, 'window.__prints.length')).toBe(1);

    const printed = await gm<{ title: string; places: string[] }>(page, 'window.__prints[0]');
    expect(printed.title).toBe(`Daily Travel Report - Asha Menon - ${DATE}`);
    // 11 point cells (check-in, 3 legs × 2 ends, 2 visits + 1 halt, check-out); every one already carries its name.
    expect(printed.places).toHaveLength(11);
    for (const p of printed.places) expect(p).toContain('Koramangala');
    await expect(page.locator('.tr-printonly')).toContainText('Generated'); // print-only: not shown on screen
  });

  test('the print stylesheet leaves only the report: no sidebar, no controls', async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await openDay(page);
    await expect(page.locator('aside').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeVisible();

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('aside').first()).toBeHidden();
    await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'All employees' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Daily Travel Report' })).toBeVisible();
    await expect(page.getByTestId('tile-km')).toBeVisible();
    await expect(rows(page).first()).toBeVisible();
    // Dark theme or not, the ink prints dark on white.
    expect(await page.locator('.tr-print-root').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  });

  test('a day with no attendance says so; nothing to export or print', async ({ page }) => {
    await setup(page, { day: () => ({ body: { success: true, data: NO_ATTENDANCE } }) });
    await page.goto(`/dashboard/travel-report?date=${DATE}&user_id=u-asha`);
    await expect(page.getByText('No attendance on 08 Oct 2026')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('timeline')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeDisabled();
  });

  test('an open shift: the last leg runs to "now" and the shift says in progress', async ({ page }) => {
    const open = {
      ...DAY, visits: [], halts: [], route: { points: [], thinned: false },
      shift: { ...DAY.shift, checkout_at: null, total_hours: null, in_progress: true },
      travel: { total_km: 4.2, method: 'gps_trail', legs: [leg(0, 4.2, 'gps_trail', { kind: 'checkin', at: at('09:12'), ...P.home, label: 'Check-in' }, { kind: 'now', at: at('11:30'), lat: 13.02, lng: 80.12, label: 'Now' })] },
      summary: { visits: 0, visit_minutes: 0, halts: 0, halt_minutes: 0, total_km: 4.2 },
    };
    await setup(page, { day: () => ({ body: { success: true, data: open } }) });
    await openDay(page);
    expect(await kinds(page)).toEqual(['checkin', 'travel']);
    await expect(rows(page).nth(1)).toContainText('– now');
    await expect(page.getByTestId('tile-shift-value')).toContainText('– now');
    await expect(page.getByTestId('day-identity')).toContainText('In progress');
    // No GPS trail: the stops are joined by straight lines instead, and the page says so.
    await expect(page.getByText('No GPS trail for this day — the stops are joined by straight lines.')).toBeVisible();
  });

  test('a failed load says so and Retry loads the day; a rep without access gets the server\'s message', async ({ page }) => {
    const fake = await setup(page, {
      day: (_q, n) => (n === 1 ? { status: 403, body: { success: false, error: 'You can only view your own report' } } : { body: { success: true, data: DAY } }),
    });
    await page.goto(`/dashboard/travel-report?date=${DATE}&user_id=u-asha`);
    await expect(page.getByRole('alert').filter({ hasText: 'You can only view your own report' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('alert').getByRole('button', { name: 'Retry' }).click();
    await expect(rows(page)).toHaveCount(8);
    expect(fake.dayCalls).toHaveLength(2);
  });

  test('changing the date on the day view asks for that day for the same person', async ({ page }) => {
    const fake = await setup(page);
    await openDay(page);
    await page.getByLabel('Date', { exact: true }).fill('2026-10-07');
    await expect.poll(() => fake.dayCalls.map((c) => `${c.get('user_id')}@${c.get('date')}`)).toEqual([`u-asha@${DATE}`, 'u-asha@2026-10-07']);
  });

  test('without the Maps SDK the map says so and the timeline still works', async ({ page }) => {
    await setup(page, {}, { maps: false });
    await openDay(page);
    await expect(page.getByTestId('route-map').getByText(/Map unavailable/)).toBeVisible();
    expect(await kinds(page)).toEqual(EXPECTED_KINDS);
    await expect(rows(page).nth(2).getByTestId('place')).toContainText('13.0500, 80.2000'); // coordinates when no name can be had
  });

  test('narrow screen: no sideways page scroll, tiles stack, the timeline scrolls inside its card', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page);
    await openDay(page);
    await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const tile = await page.getByTestId('tile-km').boundingBox();
    expect(tile!.width).toBeLessThanOrEqual(390);
  });
});

test.describe('Daily Travel Report — navigation and demo mode', () => {
  /** A client-bound admin who owns only the given modules (the nav is gated per module). */
  async function asClientWith(page: Page, modules: string[]) {
    const user = { ...SEED_USER, id: 'e2e-fe-admin', client_id: 'e2e-client-1', role: 'sub_admin', enabled_modules: modules, enabled_packages: ['field_force'] };
    await seedSession(page, user);
    await mockApi(page, { me: { success: true, data: user } });
    await page.setViewportSize({ width: 1280, height: 900 });
  }

  test('Field Force lists "Daily Travel Report" next to Attendance when the attendance module is granted', async ({ page }) => {
    await asClientWith(page, ['attendance', 'live_tracking']);
    await page.goto('/dashboard/travel-report');
    await expect(page.getByRole('link', { name: 'Daily Travel Report' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: 'Attendance', exact: true })).toBeVisible();
  });

  test('without the attendance module the entry is not offered (it shares that module\'s grant)', async ({ page }) => {
    await asClientWith(page, ['live_tracking']);
    await page.goto('/dashboard/live-tracking');
    await expect(page.getByRole('link', { name: 'Live Trailing' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: 'Daily Travel Report' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Attendance', exact: true })).toHaveCount(0);
  });

  test('demo mode serves a team and a full day (no network)', async ({ page }) => {
    await page.addInitScript(FAKE_MAPS);
    await demoLogin(page);
    await page.goto('/dashboard/travel-report');
    await expect(page.getByTestId('team-row').first()).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('team-row').first().click();
    await expect(page.getByTestId('tile-km-value')).toHaveText('23.6 km', { timeout: 30_000 });
    expect(await kinds(page)).toEqual(EXPECTED_KINDS);
    await expect.poll(() => gm<number>(page, 'window.__gm.markers.filter(m => !m.removed && m.o.label).length')).toBe(3);
  });
});
