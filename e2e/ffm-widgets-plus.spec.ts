import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { FFM_WIDGET_CATALOG, FFM_CUSTOM_DATASETS, ffmDatasetById, ffmWidgetByType } from '../src/lib/ffmAnalyticsConfig';
import { enrichFfmRows } from '../src/components/ffm/analytics/ffmDerive';

/**
 * Field Force analytics widgets (plus): twelve added widgets in the "Add widget" picker, each with an endpoint, a
 * renderer for every chart type it advertises, a custom-chart dataset and a demo mock; plus the extra measures on the
 * original widgets (derived in ffmDerive.ts) and the guarantee that saved layouts keep working.
 *
 * Pure checks run without a browser; the rest drive /dashboard/analytics (where the FFM grid lives) against an
 * intercepted API and assert on what renders and what is SAVED.
 */

const FFM = '/api/v1/analytics/ffm/';
const LAYOUT = '/api/v1/crm/dashboard-layouts/ffm';

const NEW_TYPES = [
  'beat_adherence_trend', 'outlet_recency', 'visit_frequency', 'productive_trend', 'rep_basket', 'calls_per_day',
  'dwell_time', 'visit_hours', 'travel_efficiency', 'geo_exceptions', 'attendance_hours', 'outlet_churn',
] as const;
const OLD_TYPES = [
  'beat_adherence', 'outlet_coverage', 'frequency', 'productive_calls', 'strike_rate', 'aov', 'new_outlets', 'visit_duration',
  'idle_heatmap', 'distance', 'off_route', 'punctuality', 'stuck_fes', 'security_violations', 'form_completion', 'top_performers',
] as const;

/** endpoint -> one mocked row set, and what the table view of that widget must show for it. */
const DATA: Record<string, { endpoint: string; rows: unknown[]; header: string; cell: string }> = {
  beat_adherence_trend: { endpoint: 'beat-adherence-trend', header: 'Adherence %', cell: '57.1',
    rows: [{ week: '2026-W45', week_start: '2026-11-02', planned: 4, visited: 2, missed: 2, adherence_pct: 50, active_reps: 3 }, { week: '2026-W46', week_start: '2026-11-09', planned: 7, visited: 4, missed: 3, adherence_pct: 57.1, active_reps: 3 }] },
  outlet_recency: { endpoint: 'outlet-recency', header: 'Days since last visit', cell: '31–60 days',
    rows: [{ bucket: '0–7 days', outlets: 3, share_pct: 60 }, { bucket: '31–60 days', outlets: 1, share_pct: 20 }, { bucket: 'Not visited', outlets: 1, share_pct: 20 }] },
  visit_frequency: { endpoint: 'visit-frequency', header: 'Visits', cell: '2 visits',
    rows: [{ bucket: 'Not visited', outlets: 1, share_pct: 25 }, { bucket: '2 visits', outlets: 3, share_pct: 75 }] },
  productive_trend: { endpoint: 'productive-trend', header: 'Productive visits', cell: '100',
    rows: [{ week: '2026-W45', week_start: '2026-11-02', visits: 2, productive_visits: 0, productive_pct: 0 }, { week: '2026-W46', week_start: '2026-11-09', visits: 4, productive_visits: 4, productive_pct: 100 }] },
  rep_basket: { endpoint: 'rep-basket', header: 'AOV vs team %', cell: '6.7',
    rows: [{ fe_id: 'r1', fe_name: 'Asha', orders: 2, revenue_inr: 1500, aov_inr: 750, active_days: 1, orders_per_day: 2, vs_team_aov_pct: 0 }, { fe_id: 'r2', fe_name: 'Bala', orders: 1, revenue_inr: 800, aov_inr: 800, active_days: 1, orders_per_day: 1, vs_team_aov_pct: 6.7 }] },
  calls_per_day: { endpoint: 'calls-per-day', header: 'Median calls / day', cell: '1.5',
    rows: [{ fe_id: 'r1', fe_name: 'Asha', visit_days: 2, visits: 3, calls_per_day: 1.5, team_median: 1, vs_median: 0.5 }, { fe_id: 'r2', fe_name: 'Bala', visit_days: 2, visits: 2, calls_per_day: 1, team_median: 1, vs_median: 0 }] },
  dwell_time: { endpoint: 'dwell-time', header: 'Avg on site (min)', cell: '18.3',
    rows: [{ fe_id: 'r1', fe_name: 'Asha', timed_visits: 3, avg_dwell_min: 18.3, avg_planned_min: 15, under_2min_pct: 0 }] },
  visit_hours: { endpoint: 'visit-hours', header: 'Hour (IST)', cell: '09:00',
    rows: [{ hour: 9, hour_label: '09:00', visits: 3, share_pct: 50 }, { hour: 10, hour_label: '10:00', visits: 3, share_pct: 50 }] },
  travel_efficiency: { endpoint: 'travel-efficiency', header: 'Km / visit', cell: '20.5',
    rows: [{ fe_id: 'r1', fe_name: 'Asha', km_total: 20.5, visits: 3, km_per_visit: 6.8, active_days: 2, km_per_day: 10.3 }] },
  geo_exceptions: { endpoint: 'geo-exceptions', header: 'Outside geofence', cell: '250',
    rows: [{ fe_id: 'r2', fe_name: 'Bala', checkins: 2, outside_geofence: 2, outside_pct: 100, max_distance_m: 250 }] },
  attendance_hours: { endpoint: 'attendance-hours', header: 'Avg check-in (IST)', cell: '09:15',
    rows: [{ fe_id: 'r1', fe_name: 'Asha', days_present: 3, avg_hours: 7.8, avg_checkin_time: '09:15', avg_checkin_min: 555, missed_checkouts: 1 }] },
  outlet_churn: { endpoint: 'outlet-churn', header: 'Revenue, last 30 days (₹)', cell: 'Lapsed (earlier 30 days only)',
    rows: [{ segment: 'Retained (ordered in both)', outlets: 1, revenue_last_30d_inr: 500, revenue_prior_30d_inr: 200 }, { segment: 'Lapsed (earlier 30 days only)', outlets: 1, revenue_last_30d_inr: 0, revenue_prior_30d_inr: 300 }] },
};

// ══════════════════════════════════════════════════════════════════════════
// Pure checks
// ══════════════════════════════════════════════════════════════════════════

test.describe('widget catalogue and datasets (no browser)', () => {
  test('every original widget is still there, in the same slot, and the twelve new ones are added after them', () => {
    const types = FFM_WIDGET_CATALOG.map((w) => w.type);
    expect(types.slice(0, 16)).toEqual([...OLD_TYPES]);
    expect(types.slice(16)).toEqual([...NEW_TYPES]);
    expect(new Set(types).size).toBe(types.length);
  });
  test('each widget has a dataset with the same id, so the same widget can be built in the chart builder', () => {
    for (const w of FFM_WIDGET_CATALOG) expect(ffmDatasetById(w.type), w.type).toBeTruthy();
    expect(FFM_CUSTOM_DATASETS.length).toBe(FFM_WIDGET_CATALOG.length);
  });
  test('a dataset\'s default X / Y exist in its fields and Y is numeric; every field is labelled and typed', () => {
    for (const d of FFM_CUSTOM_DATASETS) {
      const keys = d.fields.map((f) => f.key);
      expect(keys, d.id).toContain(d.defaultX);
      expect(keys, d.id).toContain(d.defaultY);
      expect(d.fields.find((f) => f.key === d.defaultY)!.type, d.id).toBe('number');
      expect(new Set(keys).size, d.id).toBe(keys.length);
      for (const f of d.fields) { expect(f.label.length, `${d.id}.${f.key}`).toBeGreaterThan(0); expect(['string', 'number']).toContain(f.type); }
    }
  });
  test('catalogue entries are complete: default chart is supported, size fits the 12-column grid, description states how it is computed', () => {
    for (const w of FFM_WIDGET_CATALOG) {
      expect(w.supportedCharts, w.type).toContain(w.defaultChart);
      expect(w.defaultSize.w, w.type).toBeLessThanOrEqual(12);
      expect(w.defaultSize.h, w.type).toBeGreaterThanOrEqual(3);
      expect(w.description.length, w.type).toBeGreaterThan(40);
    }
    for (const t of NEW_TYPES) {
      const w = ffmWidgetByType(t)!;
      expect(w.title.length).toBeGreaterThan(5);
      expect(w.supportedCharts).toContain('table');
      // a window or formula is always stated (days / weeks / ÷)
      expect(w.description, t).toMatch(/last|week|÷|day/i);
    }
  });
  test('the two honest-label rules: the estimate-style widgets say so', () => {
    expect(ffmWidgetByType('visit_duration')!.description).toMatch(/PLANNED/);
    expect(ffmWidgetByType('geo_exceptions')!.description).toMatch(/legitimate|review with the rep/i);
    expect(ffmWidgetByType('calls_per_day')!.description).toMatch(/not a target|comparison aid/i);
    expect(ffmWidgetByType('dwell_time')!.description).toMatch(/not timed/i);
  });
});

test.describe('enrichFfmRows: the extra measures on the original widgets (no browser)', () => {
  test('missed / not visited / unproductive / missing are counts that never go below zero', () => {
    expect(enrichFfmRows('beat_adherence', [{ planned: 12, visited: 9 }, { planned: 3, visited: 5 }])).toEqual([{ planned: 12, visited: 9, missed: 3 }, { planned: 3, visited: 5, missed: 0 }]);
    expect(enrichFfmRows('outlet_coverage', [{ universe: 80, visited_mtd: 50 }])).toEqual([{ universe: 80, visited_mtd: 50, not_visited: 30 }]);
    expect(enrichFfmRows('frequency', [{ due_visits: 240, on_time: 198 }])).toEqual([{ due_visits: 240, on_time: 198, missed: 42 }]);
    expect(enrichFfmRows('productive_calls', [{ visits: 40, productive: 22 }])).toEqual([{ visits: 40, productive: 22, unproductive: 18 }]);
    expect(enrichFfmRows('form_completion', [{ required: 24, submitted: 20 }, { required: 5, submitted: 9 }])).toEqual([{ required: 24, submitted: 20, missing: 4 }, { required: 5, submitted: 9, missing: 0 }]);
  });
  test('aov keeps the backend revenue and falls back to average x orders for an older backend', () => {
    expect(enrichFfmRows('aov', [{ week: 'W1', aov_inr: 1600, orders: 5, revenue_inr: 8000 }])).toEqual([{ week: 'W1', aov_inr: 1600, orders: 5, revenue_inr: 8000 }]);
    expect(enrichFfmRows('aov', [{ week: 'W1', aov_inr: 1600, orders: 5 }])).toEqual([{ week: 'W1', aov_inr: 1600, orders: 5, revenue_inr: 8000 }]);
  });
  test('distance: km per rep only when the backend says how many reps travelled', () => {
    expect(enrichFfmRows('distance', [{ day: 'd1', km_total: 24.5, reps: 4 }])).toEqual([{ day: 'd1', km_total: 24.5, reps: 4, km_per_rep: 6.1 }]);   // 6.125 -> 6.1
    expect(enrichFfmRows('distance', [{ day: 'd1', km_total: 24.5 }])).toEqual([{ day: 'd1', km_total: 24.5, reps: null, km_per_rep: null }]);
    expect(enrichFfmRows('distance', [{ day: 'd1', km_total: 0, reps: 0 }])).toEqual([{ day: 'd1', km_total: 0, reps: 0, km_per_rep: null }]);
  });
  test('punctuality: punctual % is on-time over days present, not over absent days', () => {
    expect(enrichFfmRows('punctuality', [{ on_time: 15, late: 5, absent: 3 }])).toEqual([{ on_time: 15, late: 5, absent: 3, days_total: 23, punctual_pct: 75 }]);
    expect(enrichFfmRows('punctuality', [{ on_time: 0, late: 0, absent: 4 }])).toEqual([{ on_time: 0, late: 0, absent: 4, days_total: 4, punctual_pct: 0 }]);
  });
  test('top performers: AOV and share of revenue across the rows shown', () => {
    const rows = enrichFfmRows('top_performers', [{ revenue_inr: 600000, orders: 120 }, { revenue_inr: 200000, orders: 0 }]) as Array<Record<string, number>>;
    expect(rows[0]).toMatchObject({ aov_inr: 5000, share_pct: 75 });
    expect(rows[1]).toMatchObject({ aov_inr: 0, share_pct: 25 });
  });
  test('visit duration: share of visits per bucket', () => {
    const rows = enrichFfmRows('visit_duration', [{ bucket: 'a', visit_count: 1 }, { bucket: 'b', visit_count: 3 }]) as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.share_pct)).toEqual([25, 75]);
  });
  test('sparse or odd rows never produce NaN, and datasets with nothing to derive pass through untouched', () => {
    const out = enrichFfmRows('beat_adherence', [{}, { planned: 'x', visited: null }]) as Array<Record<string, unknown>>;
    expect(out.map((r) => r.missed)).toEqual([0, 0]);
    expect(enrichFfmRows('top_performers', [])).toEqual([]);
    expect(enrichFfmRows('not_a_dataset', [{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(enrichFfmRows('stuck_fes', [{ fe_name: 'A' }])).toEqual([{ fe_name: 'A' }]);
    expect(enrichFfmRows('beat_adherence', undefined as unknown as unknown[])).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// In the browser
// ══════════════════════════════════════════════════════════════════════════

interface Saved { body: { widgets: Array<{ widget_type: string; chart_type: string; config?: Record<string, unknown> }>; layouts: unknown } }

/** Open /dashboard/analytics with a stored layout; every FFM endpoint answers from `answers` (default: empty). */
async function openAnalytics(page: Page, o: { layout?: unknown; answers?: Record<string, unknown | { __status: number; body: unknown }>; width?: number } = {}) {
  const saved: Saved[] = [];
  const hits: string[] = [];
  if (o.width) await page.setViewportSize({ width: o.width, height: 900 });
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route: Route, url, method) => {
      const u = new URL(url);
      if (u.pathname === LAYOUT) {
        if (method === 'PUT') { saved.push({ body: route.request().postDataJSON() }); await route.fulfill({ json: { success: true, data: {} } }); return true; }
        if (method === 'GET') { await route.fulfill({ json: { success: true, data: o.layout ?? null } }); return true; }
      }
      if (method === 'GET' && u.pathname.startsWith(FFM)) {
        const sub = u.pathname.slice(FFM.length);
        hits.push(sub);
        const a = o.answers?.[sub];
        if (a && typeof a === 'object' && '__status' in (a as object)) { const r = a as { __status: number; body: unknown }; await route.fulfill({ status: r.__status, json: r.body }); return true; }
        await route.fulfill({ json: { success: true, data: a ?? [] } });
        return true;
      }
      return false;
    },
  });
  await page.goto('/dashboard/analytics');
  await expect(page.getByText('Field Force Analytics', { exact: true })).toBeVisible({ timeout: 60_000 });
  return { saved, hits };
}

const layoutOf = (types: Array<{ type: string; chart: string }>) => ({
  widgets: types.map((t, i) => ({ id: `w${i + 1}`, widget_type: t.type, chart_type: t.chart })),
  layouts: {
    lg: types.map((_, i) => ({ i: `w${i + 1}`, x: (i % 2) * 6, y: Math.floor(i / 2) * 5, w: 6, h: 5 })),
    md: types.map((_, i) => ({ i: `w${i + 1}`, x: 0, y: i * 5, w: 8, h: 5 })),
    sm: types.map((_, i) => ({ i: `w${i + 1}`, x: 0, y: i * 5, w: 2, h: 5 })),
  },
});
const answersFor = (types: readonly string[]) => Object.fromEntries(types.map((t) => [DATA[t].endpoint, DATA[t].rows]));
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A header cell of a widget table by its exact text (header cells read as plain cells in the accessibility tree here). */
const th = (w: Locator, label: string) => w.locator('th').filter({ hasText: new RegExp(`^\\s*${esc(label)}\\s*$`) });
/** One grid tile (react-grid-layout wraps every widget in .react-grid-item) by its exact title. */
const tile = (page: Page, title: string) => page.locator('.react-grid-item').filter({ has: page.getByText(title, { exact: true }) });

test.describe('the Add widget picker', () => {
  test('lists the twelve new widgets with their plain-language descriptions, grouped by category', async ({ page }) => {
    await openAnalytics(page, { layout: layoutOf([{ type: 'beat_adherence', chart: 'bar' }]) });
    await page.getByRole('button', { name: /Add widget/ }).click();
    for (const t of NEW_TYPES) {
      const meta = ffmWidgetByType(t)!;
      const card = page.getByRole('button', { name: new RegExp(`^${meta.title.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}`) });
      await expect(card, t).toBeVisible();
      await expect(card, t).toContainText(meta.description.slice(0, 40));
    }
    await expect(page.getByText('Add FFM widget')).toBeVisible();
    // 28 widgets listed; the one already on the grid is marked Added
    await expect(page.getByText('ADDED', { exact: true })).toHaveCount(1);
  });

  test('adding a new widget puts it on the grid, renders its data, and saves the new widget_type to the layout', async ({ page }) => {
    const { saved } = await openAnalytics(page, { layout: layoutOf([{ type: 'beat_adherence', chart: 'bar' }]), answers: { 'outlet-recency': DATA.outlet_recency.rows } });
    await page.getByRole('button', { name: /Add widget/ }).click();
    await page.getByRole('button', { name: /^Days Since Last Visit/ }).click();
    await expect(page.getByText('Added Days Since Last Visit')).toBeVisible();
    const t = tile(page, 'Days Since Last Visit');
    await expect(t.locator('.recharts-surface').first()).toBeVisible({ timeout: 20_000 });       // default chart: bar
    await expect.poll(() => saved.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const last = saved.at(-1)!.body;
    expect(last.widgets.map((w) => w.widget_type)).toEqual(['beat_adherence', 'outlet_recency']);
    expect(last.widgets[1].chart_type).toBe('bar');
  });

  test('an already-added widget cannot be added twice', async ({ page }) => {
    await openAnalytics(page, { layout: layoutOf([{ type: 'dwell_time', chart: 'bar' }]) });
    await page.getByRole('button', { name: /Add widget/ }).click();
    await expect(page.getByRole('button', { name: /^Time on Site/ })).toBeDisabled();
  });
});

test.describe('each new widget renders its data in a table view', () => {
  for (const t of NEW_TYPES) {
    test(`${ffmWidgetByType(t)!.title}`, async ({ page }) => {
      const d = DATA[t];
      await openAnalytics(page, { layout: layoutOf([{ type: t, chart: 'table' }]), answers: { [d.endpoint]: d.rows } });
      const w = tile(page, ffmWidgetByType(t)!.title);
      await expect(th(w, d.header)).toBeVisible({ timeout: 30_000 });
      await expect(w.getByRole('cell', { name: d.cell, exact: true }).first()).toBeVisible();
    });
  }
});

test.describe('every chart type a new widget advertises renders', () => {
  for (const t of NEW_TYPES) {
    const meta = ffmWidgetByType(t)!;
    for (const chart of meta.supportedCharts.filter((c) => c !== 'table')) {
      test(`${meta.title} as ${chart}`, async ({ page }) => {
        const d = DATA[t];
        await openAnalytics(page, { layout: layoutOf([{ type: t, chart }]), answers: { [d.endpoint]: d.rows } });
        const w = tile(page, meta.title);
        await expect(w.locator('.recharts-surface').first()).toBeVisible({ timeout: 30_000 });
        await expect(w.getByText(/Load failed|Unsupported data shape|Unknown widget/)).toHaveCount(0);
      });
    }
  }
});

test.describe('states and stability', () => {
  test('a widget with no data says so instead of drawing an empty chart', async ({ page }) => {
    await openAnalytics(page, { layout: layoutOf([{ type: 'calls_per_day', chart: 'horizontal-bar' }]), answers: { 'calls-per-day': [] } });
    await expect(tile(page, 'Calls per Working Day').getByText('No data yet')).toBeVisible({ timeout: 30_000 });
  });

  test('a failing endpoint shows its message in that tile only; the other tile still renders', async ({ page }) => {
    await openAnalytics(page, {
      layout: layoutOf([{ type: 'dwell_time', chart: 'table' }, { type: 'travel_efficiency', chart: 'table' }]),
      answers: { 'dwell-time': { __status: 400, body: { success: false, error: 'Not available for this account' } }, 'travel-efficiency': DATA.travel_efficiency.rows },
    });
    await expect(tile(page, 'Time on Site').getByText(/Not available for this account/)).toBeVisible({ timeout: 30_000 });
    await expect(tile(page, 'Km per Visit').getByRole('cell', { name: 'Asha' })).toBeVisible();
  });

  test('the chart type can be switched from the tile menu and the choice is saved', async ({ page }) => {
    const { saved } = await openAnalytics(page, { layout: layoutOf([{ type: 'rep_basket', chart: 'horizontal-bar' }]), answers: { 'rep-basket': DATA.rep_basket.rows } });
    const w = tile(page, 'Order Value by Rep');
    await expect(w.locator('.recharts-surface').first()).toBeVisible({ timeout: 30_000 });
    await w.getByLabel('Widget options').click();
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(th(w, 'AOV vs team %')).toBeVisible();
    await expect.poll(() => saved.at(-1)?.body.widgets[0].chart_type, { timeout: 15_000 }).toBe('table');
  });

  test('saved layouts keep working: old widget types, a custom chart on a new dataset and an unknown type side by side', async ({ page }) => {
    const layout = layoutOf([{ type: 'beat_adherence', chart: 'table' }, { type: 'ffm_custom', chart: 'bar' }, { type: 'retired_widget', chart: 'bar' }]);
    (layout.widgets[1] as Record<string, unknown>).config = { data_source: 'dwell_time', x_field: 'fe_name', y_field: 'avg_dwell_min', label: 'My dwell chart' };
    await openAnalytics(page, {
      layout,
      answers: { 'beat-adherence': [{ fe_id: 'r1', fe_name: 'Asha', planned: 12, visited: 9, adherence_pct: 75 }], 'dwell-time': DATA.dwell_time.rows },
    });
    await expect(tile(page, 'Beat Adherence').getByRole('cell', { name: 'Asha' })).toBeVisible({ timeout: 30_000 });
    await expect(tile(page, 'My dwell chart').locator('.recharts-surface').first()).toBeVisible();
    await expect(page.getByText('Unknown widget')).toBeVisible();
  });

  test('original widgets gain the missing measure: Beat Adherence shows Missed = planned - visited', async ({ page }) => {
    await openAnalytics(page, {
      layout: layoutOf([{ type: 'beat_adherence', chart: 'table' }, { type: 'top_performers', chart: 'table' }]),
      answers: {
        'beat-adherence': [{ fe_id: 'r1', fe_name: 'Asha', planned: 12, visited: 9, adherence_pct: 75 }],
        'top-performers': [{ fe_id: 'r1', fe_name: 'Asha', revenue_inr: 600000, orders: 120, outlets_covered: 40 }, { fe_id: 'r2', fe_name: 'Bala', revenue_inr: 200000, orders: 50, outlets_covered: 20 }],
      },
    });
    const ba = tile(page, 'Beat Adherence');
    await expect(th(ba, 'Missed')).toBeVisible({ timeout: 30_000 });
    await expect(ba.getByRole('row', { name: /Asha/ })).toContainText('3');
    const tp = tile(page, 'Top Performers');
    await expect(tp.getByRole('row', { name: /Asha/ })).toContainText('5000');         // AOV = 600000 / 120
    await expect(tp.getByRole('row', { name: /Asha/ })).toContainText('75');           // 600000 of 800000
  });

  test('the custom chart builder offers the new datasets with labelled fields', async ({ page }) => {
    await openAnalytics(page, { layout: layoutOf([{ type: 'beat_adherence', chart: 'bar' }]) });
    await page.getByRole('button', { name: /Build chart/ }).click();
    // the builder's labels are not wired to their selects, so find the data-source select by its options
    const source = page.locator('select:has(option[value="beat_adherence"])');
    for (const id of NEW_TYPES) await expect(source.locator(`option[value="${id}"]`), id).toHaveCount(1);
    await source.selectOption('geo_exceptions');
    await expect(page.getByPlaceholder(/Strike rate by FE/)).toHaveValue('Check-ins Outside Geofence');
  });

  test('the grid does not push the page sideways at 390 px', async ({ page }) => {
    await openAnalytics(page, { width: 390, layout: layoutOf([{ type: 'beat_adherence_trend', chart: 'line' }, { type: 'rep_basket', chart: 'table' }]), answers: answersFor(['beat_adherence_trend', 'rep_basket']) });
    await expect(th(tile(page, 'Order Value by Rep'), 'AOV (₹)')).toBeVisible({ timeout: 30_000 });
    const box = await page.getByText('Field Force Analytics', { exact: true }).locator('xpath=ancestor::div[contains(@style,"border-radius: 14px")][1]').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  });
});

test.describe('demo tenant (client-side mocks)', () => {
  test('a demo account can add a new widget and sees demo figures', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@company.com').fill('demo@kinematic.com');
    await page.getByPlaceholder('Enter your password').fill('demo1234');
    await page.getByRole('button', { name: /Sign In/ }).click();
    await page.waitForURL('**/dashboard', { timeout: 30_000 });
    await page.goto('/dashboard/analytics');
    await expect(page.getByText('Field Force Analytics', { exact: true })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /Add widget/ }).click();
    await page.getByRole('button', { name: /^Time on Site/ }).click();
    const t = tile(page, 'Time on Site');
    await expect(t.locator('.recharts-surface').first()).toBeVisible({ timeout: 30_000 });
    await t.getByLabel('Widget options').click();
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(th(t, 'Avg on site (min)')).toBeVisible();
    expect(await t.getByRole('row').count()).toBeGreaterThan(3);
  });
});
