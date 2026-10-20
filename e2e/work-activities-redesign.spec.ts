import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { groupVisits, matchPreset, placeLabel, presetRange, storeName, visitTitle, ymd } from '../src/lib/workActivities';

/**
 * Work Activities redesign: visits are named after what was filled in (never "Individual Submission"), the page
 * has at-a-glance totals, date presets, a debounced search, and a keyboard-operable accordion. The CSV / time
 * spent / detail-modal behaviour is covered by work-activities-visit-time.spec.ts.
 */
test.use({ timezoneId: 'Asia/Kolkata', locale: 'en-IN' });

// ── pure helpers ─────────────────────────────────────────────────────────────
test.describe('workActivities helpers', () => {
  test('the API placeholder and blanks mean "no store"', () => {
    for (const v of ['Individual Submission', 'individual', 'Individual Visit', '', '  ', null, undefined, '-']) expect(storeName(v as string)).toBe('');
    expect(storeName(' Reliance Fresh ')).toBe('Reliance Fresh');
  });

  const row = (id: string, o: Record<string, unknown>) => ({ id, user_id: 'u1', submitted_at: '2026-10-09T05:00:00Z', activities: { name: 'Sales Calls' }, ...o });

  test('no-store submissions are split by form, store visits by store; titles are never the placeholder', () => {
    const groups = groupVisits([
      row('a', { outlet_name: 'Individual Submission', builder_forms: { title: 'Sales Call Form' } }),
      row('b', { outlet_name: 'Individual Submission', builder_forms: { title: 'Sales Call Form' } }),
      row('c', { outlet_name: 'Individual Submission', builder_forms: { title: 'Competitor Check' } }),
      row('d', { outlet_name: 'Reliance Fresh', builder_forms: { title: 'Store Audit' } }),
      row('e', { outlet_name: 'Reliance Fresh', builder_forms: { title: 'Other Form' } }),
      row('f', { outlet_name: 'Reliance Fresh', user_id: 'u2' }),
      row('g', { outlet_name: 'Reliance Fresh', submitted_at: '2026-10-10T05:00:00Z' }),
    ]);
    expect(groups.map((g) => [visitTitle(g), g.items.length])).toEqual([
      ['Sales Call Form', 2], ['Competitor Check', 1], ['Reliance Fresh', 2], ['Reliance Fresh', 1], ['Reliance Fresh', 1],
    ]);
    expect(groups.some((g) => /individual/i.test(visitTitle(g)))).toBe(false);
  });

  test('a no-store submission with no form title falls back to its activity, then to a neutral label', () => {
    expect(visitTitle(groupVisits([row('a', { outlet_name: '' })])[0])).toBe('Sales Calls');
    expect(visitTitle(groupVisits([row('a', { outlet_name: '', activities: undefined })])[0])).toBe('Form submission');
  });

  test('sections come out ordered by activity', () => {
    const groups = groupVisits([row('a', { activities: { name: 'Store Visit' } }), row('b', { activities: { name: 'Compliance' } })]);
    expect(groups.map((g) => g.activity)).toEqual(['Compliance', 'Store Visit']);
  });

  test('place labels drop the Plus Code and the country', () => {
    expect(placeLabel('55PJ+3P Gutipara Pt.III, Assam, India')).toBe('Gutipara Pt.III, Assam');
    expect(placeLabel('MG Road')).toBe('MG Road');
    expect(placeLabel('')).toBe('');
    expect(placeLabel(null)).toBe('');
  });

  test('date presets are local calendar days and are recognised again', () => {
    const now = new Date(2026, 9, 21, 9, 0); // 21 Oct 2026, local
    expect(ymd(now)).toBe('2026-10-21');
    expect(presetRange('today', now)).toEqual({ from: '2026-10-21', to: '2026-10-21' });
    expect(presetRange('yesterday', now)).toEqual({ from: '2026-10-20', to: '2026-10-20' });
    expect(presetRange('3d', now)).toEqual({ from: '2026-10-19', to: '2026-10-21' });
    expect(presetRange('7d', now)).toEqual({ from: '2026-10-15', to: '2026-10-21' });
    expect(presetRange('30d', now)).toEqual({ from: '2026-09-22', to: '2026-10-21' });
    expect(matchPreset('2026-10-19', '2026-10-21', now)).toBe('3d');
    expect(matchPreset('2026-10-01', '2026-10-21', now)).toBeNull();
  });
});

// ── page ─────────────────────────────────────────────────────────────────────
const REP = { name: 'Bisha Sheikh', employee_id: 'B1' };
const GPS_ADDRESS = '55PJ+3P Gutipara Pt.III, Assam, India';

const sub = (id: string, extra: Record<string, unknown>) => ({
  id, user_id: 'u-bisha', users: REP, activities: { name: 'Sales Calls' }, builder_forms: { id: 'bf1', title: 'Sales Call Form' },
  outlet_name: 'Individual Submission', address: GPS_ADDRESS, submitted_at: '2026-10-20T05:30:00Z', ...extra,
});

const ROWS = [
  // Twelve standalone submissions of one form by one rep on one day -> one visit with a "show all".
  ...Array.from({ length: 12 }, (_, i) => sub(`s${i}`, {
    submitted_at: `2026-10-20T0${(i % 8) + 1}:15:00Z`,
    check_in_at: i === 0 ? '2026-10-20T04:30:00Z' : null, check_out_at: i === 0 ? '2026-10-20T04:50:00Z' : null, duration_minutes: i === 0 ? 20 : null,
  })),
  // A different form on the same day is its own visit.
  sub('c1', { builder_forms: { id: 'bf2', title: 'Competitor Check' } }),
  // A real store visit by another rep.
  { id: 'r1', user_id: 'u-asha', users: { name: 'Asha Menon' }, activities: { name: 'Store Visit' }, builder_forms: { id: 'bf3', title: 'Store Audit' },
    outlet_name: 'Reliance Fresh', address: 'MG Road, Bengaluru', submitted_at: '2026-10-20T06:00:00Z',
    check_in_at: '2026-10-20T05:30:00Z', check_out_at: '2026-10-20T06:05:00Z', duration_minutes: 35 },
];

interface Req { path: string; query: URLSearchParams }

async function setup(page: Page, o: { rows?: unknown[]; total?: number } = {}) {
  const seen: Req[] = [];
  const rows = o.rows ?? ROWS;
  await page.clock.setFixedTime(new Date('2026-10-21T06:00:00Z')); // 21 Oct 2026, 11:30 IST
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      const u = new URL(url);
      if (method !== 'GET') return false;
      seen.push({ path: u.pathname, query: u.searchParams });
      if (u.pathname === '/api/v1/forms/admin/submissions') {
        await route.fulfill({ json: { success: true, data: { data: rows, pagination: { page: 1, limit: 50, total: o.total ?? rows.length } } } });
        return true;
      }
      const one = u.pathname.match(/^\/api\/v1\/forms\/submissions\/([^/]+)$/);
      if (one) {
        await route.fulfill({ json: { success: true, data: rows.find((r) => (r as { id: string }).id === one[1]) ?? {} } });
        return true;
      }
      return false;
    },
  });
  return seen;
}

const listCalls = (seen: Req[]) => seen.filter((r) => r.path === '/api/v1/forms/admin/submissions' && r.query.get('include_responses') !== 'true');

test.describe('Work Activities — redesign', () => {
  test('no visit is called "Individual Submission": standalone forms are named after the form, tagged "No store linked"', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/work-activities');
    await expect(page.getByText('Reliance Fresh')).toBeVisible({ timeout: 60_000 });

    await expect(page.getByText(/individual/i)).toHaveCount(0);
    await expect(page.getByText('Sales Call Form').first()).toBeVisible();
    await expect(page.getByText('Competitor Check').first()).toBeVisible();
    // Two standalone visits (one per form) are tagged; the store visit is not.
    await expect(page.getByText('No store linked')).toHaveCount(2);
    // The long geocoded address is shortened to a place label; the full text stays as the tooltip.
    await expect(page.getByText('Gutipara Pt.III, Assam', { exact: true }).first()).toBeVisible();
    await expect(page.locator('[title="55PJ+3P Gutipara Pt.III, Assam, India"]').first()).toBeAttached();
  });

  test('the at-a-glance tiles count submissions, visits, reps and time on visits', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/work-activities');
    await expect(page.getByText('Reliance Fresh')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('wa-sum-submissions')).toHaveText('14');
    await expect(page.getByTestId('wa-sum-visits')).toHaveText('3');
    await expect(page.getByTestId('wa-sum-reps')).toHaveText('2');
    await expect(page.getByTestId('wa-sum-time')).toHaveText('55m'); // 20 + 35, only the timed forms
  });

  test('activities become sections with their own counts', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/work-activities');
    await expect(page.getByText('Reliance Fresh')).toBeVisible({ timeout: 60_000 });
    const sales = page.getByRole('region', { name: 'Sales Calls' });
    await expect(sales).toContainText('2 visits · 13 forms');
    await expect(page.getByRole('region', { name: 'Store Visit' })).toContainText('1 visit · 1 form');
  });

  test('a big visit shows 8 rows with a "show all" toggle; the card opens by keyboard', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/work-activities');
    await expect(page.getByText('Reliance Fresh')).toBeVisible({ timeout: 60_000 });

    const head = page.getByRole('button', { name: /Sales Call Form/ }).first();
    await expect(head).toHaveAttribute('aria-expanded', 'false');
    await head.focus();
    await page.keyboard.press('Enter');
    await expect(head).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'View data' })).toHaveCount(8);

    await page.getByRole('button', { name: 'Show all 12 submissions' }).click();
    await expect(page.getByRole('button', { name: 'View data' })).toHaveCount(12);
    await page.getByRole('button', { name: 'Show fewer' }).click();
    await expect(page.getByRole('button', { name: 'View data' })).toHaveCount(8);

    // Only one visit is open at a time.
    await page.getByText('Reliance Fresh').click();
    await expect(head).toHaveAttribute('aria-expanded', 'false');
  });

  test('date presets refetch for that window; "Reset filters" restores the default', async ({ page }) => {
    const seen = await setup(page);
    await page.goto('/dashboard/work-activities');
    await expect(page.getByText('Reliance Fresh')).toBeVisible({ timeout: 60_000 });

    // Default: last 3 days, i.e. 19 -> 21 Oct. (date_to is never earlier than the picked end day; the page's
    // existing dateToInclusive() nudge decides whether it is the 21st or the 22nd, depending on the viewer's time zone.)
    const first = listCalls(seen).at(-1)!.query;
    expect(first.get('date_from')).toBe('2026-10-19');
    expect(first.get('date_to')! >= '2026-10-21').toBe(true);
    await expect(page.getByRole('button', { name: 'Last 3 days' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Reset filters' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Today' }).click();
    await expect.poll(() => listCalls(seen).at(-1)!.query.get('date_from')).toBe('2026-10-21');
    expect(listCalls(seen).at(-1)!.query.get('date_to')! >= '2026-10-21').toBe(true);
    await expect(page.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Reset filters' }).first().click();
    await expect.poll(() => listCalls(seen).at(-1)!.query.get('date_from')).toBe('2026-10-19');
    await expect(page.getByRole('button', { name: 'Last 3 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('typing in the search box sends one request after a pause, not one per keystroke', async ({ page }) => {
    const seen = await setup(page);
    await page.goto('/dashboard/work-activities');
    await expect(page.getByText('Reliance Fresh')).toBeVisible({ timeout: 60_000 });
    const before = listCalls(seen).length;

    await page.getByLabel('Search store').pressSequentially('Reliance', { delay: 40 });
    await expect.poll(() => listCalls(seen).at(-1)!.query.get('search')).toBe('Reliance');
    expect(listCalls(seen).length - before).toBe(1);
    // …and it shows up as a removable chip.
    await page.getByRole('button', { name: 'Remove filter: Store: Reliance' }).click();
    await expect.poll(() => listCalls(seen).at(-1)!.query.get('search')).toBe('');
  });

  test('no matches: a clear empty state with a way back', async ({ page }) => {
    await setup(page, { rows: [] });
    await page.goto('/dashboard/work-activities');
    await expect(page.getByText('No visits found')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Reset filters' }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download Report' })).toBeDisabled();
  });

  test('the detail dialog names the store ("No store linked" when none) and closes with Escape', async ({ page }) => {
    await setup(page);
    await page.goto('/dashboard/work-activities');
    await expect(page.getByText('Reliance Fresh')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /Sales Call Form/ }).first().click();
    await page.getByRole('button', { name: 'View data' }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Submission Details');
    await expect(dialog).toContainText('No store linked');
    await expect(dialog).not.toContainText(/individual/i);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('on a phone nothing overflows sideways and the visit stats wrap under the title', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page);
    await page.goto('/dashboard/work-activities');
    await expect(page.getByText('Reliance Fresh')).toBeVisible({ timeout: 60_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByText('Reliance Fresh').click();
    const after = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(after).toBeLessThanOrEqual(0);
    await page.screenshot({ path: '/tmp/claude-0/qa-dash/wa/phone.png', fullPage: false });
  });
});
