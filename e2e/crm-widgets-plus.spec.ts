import { test, expect, type Page } from '@playwright/test';
import {
  ACTIVITY_MIX, CALL_TREND, CONVERSION_TIME, DEAL_SIZE, FOLLOWUP_COMPLIANCE, LEAD_RECYCLING, OWNER_WORKLOAD, SOURCE_PERFORMANCE,
  STAGE_VELOCITY, WEIGHTED_PIPELINE, WIN_RATE_TREND, pageScrollsSideways, serve, settingsWith,
} from './crm-plus-fixtures';
import { CUSTOM_DATASETS, WIDGET_CATALOG, datasetById, widgetByType, type ChartType } from '../src/lib/crm/widgetCatalog';
import { PLUS_WIDGET_TYPES, datasetRows, plusWidgetView } from '../src/components/crm/analytics/plusWidgetViews';
import {
  normaliseActivityMix, normaliseCallTrend, normaliseConversionTime, normaliseDealSize, normaliseFollowup, normaliseRecycling,
  normaliseSourcePerformance, normaliseStageVelocity, normaliseWeightedPipeline, normaliseWinRateTrend, normaliseWorkload,
} from '../src/lib/crm/crmPlusTypes';
import {
  DASH, changeTone, columnsToCsvRows, fmtChange, fmtDays, fmtInr, fmtInt, fmtMinutes, fmtPct, isoDaysAgo, monthLabel, weekLabel,
} from '../src/lib/crm/plusFormat';
import { GATED_FIELDS_BY_SURFACE, blockedBy, isLeadFieldHidden, surfaceOf } from '../src/lib/crm/leadFieldGate';
import { weekdayRows } from '../src/lib/crm/heatmapRollup';

/**
 * Lead Management "plus" widgets: the catalogue, the picker, the renderer for every chart type each widget advertises,
 * the custom-chart datasets, empty / error states, the built-in-field gate, and the helpers behind all of it.
 * The first half is pure logic (no browser); the second half drives /dashboard/crm/leads/analytics against a mocked API.
 */

const NEW_TYPES = [
  'lead_source_performance', 'followup_compliance', 'owner_workload', 'stage_velocity', 'activity_mix', 'lead_conversion_time',
  'weighted_pipeline', 'deal_size_distribution', 'win_rate_trend', 'call_connect_trend', 'lead_recycling',
] as const;

/** widget type -> the payload its endpoint returns in the fixtures */
const FIXTURE_BY_TYPE: Record<string, unknown> = {
  lead_source_performance: SOURCE_PERFORMANCE, followup_compliance: FOLLOWUP_COMPLIANCE, owner_workload: OWNER_WORKLOAD, stage_velocity: STAGE_VELOCITY,
  activity_mix: ACTIVITY_MIX, lead_conversion_time: CONVERSION_TIME, weighted_pipeline: WEIGHTED_PIPELINE, deal_size_distribution: DEAL_SIZE,
  win_rate_trend: WIN_RATE_TREND, call_connect_trend: CALL_TREND, lead_recycling: LEAD_RECYCLING,
};
/** custom dataset id -> the payload of the endpoint it reads */
const FIXTURE_BY_DATASET: Record<string, unknown> = {
  source_performance: SOURCE_PERFORMANCE, followup_compliance_by_owner: FOLLOWUP_COMPLIANCE, followup_compliance_trend: FOLLOWUP_COMPLIANCE,
  owner_workload: OWNER_WORKLOAD, stage_velocity: STAGE_VELOCITY, activity_mix_by_type: ACTIVITY_MIX, activity_mix_by_owner: ACTIVITY_MIX,
  activity_mix_by_week: ACTIVITY_MIX, conversion_time_buckets: CONVERSION_TIME, conversion_time_by_owner: CONVERSION_TIME,
  conversion_time_by_source: CONVERSION_TIME, weighted_pipeline: WEIGHTED_PIPELINE, deal_size_distribution: DEAL_SIZE, win_rate_trend: WIN_RATE_TREND,
  call_connect_trend: CALL_TREND, lead_recycling: LEAD_RECYCLING,
};
const NEW_DATASETS = Object.keys(FIXTURE_BY_DATASET);
const KIND_FOR_CHART: Record<ChartType, string> = {
  number: 'number', table: 'table', bar: 'bar', 'horizontal-bar': 'hbar', line: 'line', area: 'area', pie: 'pie', donut: 'pie', heatmap: 'heatmap',
};

// ═══════════════════════════════════════════════════════════════════════════
// Pure logic
// ═══════════════════════════════════════════════════════════════════════════

test.describe('formatters (units on every number)', () => {
  test('money is INR in Indian compact units', () => {
    expect([950, 1200, 350000, 12500000, 0, -1500, null, undefined, Number.NaN].map(fmtInr)).toEqual(['₹950', '₹1.2K', '₹3.5L', '₹1.25Cr', '₹0', '-₹1.5K', DASH, DASH, DASH]);
  });
  test('percent, days, minutes, integers', () => {
    expect([12.34, 50, 0, null].map((v) => fmtPct(v))).toEqual(['12.3%', '50%', '0%', DASH]);
    expect([4.5, 12, 0, null].map(fmtDays)).toEqual(['4.5 d', '12 d', '0 d', DASH]);
    expect([0.4, 45, 155, 120, 1500, 1440, null].map(fmtMinutes)).toEqual(['<1m', '45m', '2h 35m', '2h', '1d 1h', '1d', DASH]);
    expect([1234567, 12, null].map(fmtInt)).toEqual(['12,34,567', '12', DASH]);
  });
  test('week and month labels', () => {
    expect(weekLabel('2026-11-09')).toBe('9 Nov');
    expect(monthLabel('2026-10')).toBe('Oct 2026');
    expect(weekLabel('soon')).toBe('soon');
    expect(monthLabel('soon')).toBe('soon');
  });
  test('period-over-period change and its tone', () => {
    expect([fmtChange(12, 10), fmtChange(8, 10), fmtChange(10, 10), fmtChange(5, 0), fmtChange(0, 0), fmtChange(null, 3), fmtChange(3, null)]).toEqual(['+20%', '-20%', '0%', 'new', '0%', DASH, DASH]);
    expect([changeTone(12, 10), changeTone(8, 10), changeTone(10, 10), changeTone(12, 10, false), changeTone(null, 1)]).toEqual(['good', 'bad', 'flat', 'bad', 'flat']);
  });
  test('isoDaysAgo is YYYY-MM-DD', () => {
    expect(isoDaysAgo(10, new Date('2026-11-10T12:00:00Z'))).toBe('2026-10-31');
  });
  test('the CSV rows carry the on-screen labels and the RAW values', () => {
    const cols = [
      { label: 'Source', value: (r: { s: string; v: number | null }) => r.s },
      { label: 'Won value (INR)', value: (r: { s: string; v: number | null }) => r.v, display: (r: { s: string; v: number | null }) => fmtInr(r.v), numeric: true },
    ];
    expect(columnsToCsvRows(cols, [{ s: 'Web', v: 350000 }, { s: 'Ref', v: null }])).toEqual([{ Source: 'Web', 'Won value (INR)': 350000 }, { Source: 'Ref', 'Won value (INR)': '' }]);
  });
});

test.describe('response normalisers are total: junk in, sane out', () => {
  const junk: unknown[] = [undefined, null, 'x', 5, [], { rows: 'bad', totals: 'bad' }, { rows: null }];
  const all = [normaliseSourcePerformance, normaliseFollowup, normaliseWorkload, normaliseStageVelocity, normaliseActivityMix, normaliseConversionTime,
    normaliseWeightedPipeline, normaliseDealSize, normaliseWinRateTrend, normaliseCallTrend, normaliseRecycling];
  for (const norm of all) {
    test(norm.name, () => {
      for (const j of junk) {
        const out = norm(j) as Record<string, any>;
        expect(typeof out).toBe('object');
        expect(out.totals).toBeTruthy();
        for (const k of ['rows', 'buckets', 'by_type', 'trend', 'pipelines']) if (k in out) expect(Array.isArray(out[k])).toBe(true);
      }
    });
  }
  test('a real payload passes through untouched', () => {
    expect(normaliseSourcePerformance(SOURCE_PERFORMANCE).rows).toHaveLength(2);
    expect(normaliseSourcePerformance(SOURCE_PERFORMANCE).totals.leads).toBe(60);
    expect(normaliseWorkload(OWNER_WORKLOAD).sla_minutes).toBe(60);
    expect(normaliseStageVelocity(STAGE_VELOCITY).pipelines).toHaveLength(2);
  });
});

test.describe('catalogue integrity', () => {
  test('every new widget is registered once, additively, with an endpoint and a plus view', () => {
    const types = WIDGET_CATALOG.map((w) => w.type);
    expect(new Set(types).size).toBe(types.length);
    for (const t of NEW_TYPES) {
      expect(types).toContain(t);
      expect(PLUS_WIDGET_TYPES.has(t)).toBe(true);
    }
    expect(PLUS_WIDGET_TYPES.size).toBe(NEW_TYPES.length);
  });

  test('the original widget types are all still there (saved layouts keep working)', () => {
    for (const t of ['lead_velocity', 'time_to_first_touch', 'stuck_leads', 'lost_reasons', 'won_reasons', 'disqualification_reasons', 'stage_conversion', 'lead_aging', 'cohort_conversion',
      'engagement_comparison', 'days_since_touch', 'score_band_conversion', 'territory_conversion', 'touchpoints_to_response', 'leads_at_risk', 'leads_geo_heatmap', 'targets_leaderboard']) {
      expect(widgetByType(t), t).toBeTruthy();
    }
    expect(widgetByType('lead_velocity')).toMatchObject({ endpoint: '/analytics/lead-velocity', defaultChart: 'line' });
  });

  for (const t of NEW_TYPES) {
    test(`${t}: metadata`, () => {
      const w = widgetByType(t)!;
      expect(w.endpoint).toMatch(/^\/analytics\/[a-z-]+$/);
      expect(w.supportedCharts.length).toBeGreaterThanOrEqual(3);
      expect(w.supportedCharts).toContain(w.defaultChart);
      expect(w.defaultSize.w).toBeGreaterThanOrEqual(4);
      expect(w.defaultSize.h).toBeGreaterThanOrEqual(3);
      // plain, definition-bearing, honest: no invented benchmarks
      expect(w.description.length).toBeGreaterThanOrEqual(80);
      expect(w.description.length).toBeLessThanOrEqual(420);
      expect(w.description).not.toMatch(/industry|benchmark|best-in-class|typical for/i);
    });
  }

  test('the descriptions state how the headline numbers are computed', () => {
    expect(widgetByType('lead_source_performance')!.description).toContain('Conversion % = converted leads ÷ leads from that source');
    expect(widgetByType('followup_compliance')!.description).toContain('On-time % = on time ÷ (on time + late + overdue)');
    expect(widgetByType('weighted_pipeline')!.description).toContain('Weighted = amount × probability');
    expect(widgetByType('weighted_pipeline')!.description).toMatch(/estimate/);
    expect(widgetByType('call_connect_trend')!.description).toContain('Connect % = calls whose outcome starts with "Connected" ÷ calls with an outcome recorded');
    expect(widgetByType('win_rate_trend')!.description).toContain('Win % by month');
    expect(widgetByType('stage_velocity')!.description).toMatch(/stage-change history/);
    expect(widgetByType('lead_conversion_time')!.description).toMatch(/median/);
  });
});

test.describe('custom-chart datasets', () => {
  test('the new datasets are registered, labelled, typed and have valid defaults', () => {
    const ids = CUSTOM_DATASETS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of NEW_DATASETS) {
      const d = datasetById(id)!;
      expect(d, id).toBeTruthy();
      expect(d.label.length).toBeGreaterThan(3);
      expect(d.description.length).toBeGreaterThan(10);
      const keys = d.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toContain(d.defaultX);
      expect(keys).toContain(d.defaultY);
      expect(d.fields.find((f) => f.key === d.defaultY)!.type).toBe('number');
      expect(d.fields.some((f) => f.type === 'string')).toBe(true);
    }
  });

  test('the original datasets are untouched', () => {
    for (const id of ['lead_velocity', 'lost_reasons', 'stage_conversion', 'territory_conversion', 'leads_at_risk', 'stuck_leads_top_owners']) expect(datasetById(id), id).toBeTruthy();
  });

  for (const id of NEW_DATASETS) {
    test(`${id}: every declared field is present in the rows the chart plots`, () => {
      const rows = datasetRows(id, FIXTURE_BY_DATASET[id]);
      expect(rows.length, 'rows').toBeGreaterThan(0);
      const d = datasetById(id)!;
      for (const f of d.fields) {
        for (const r of rows) {
          expect(f.key in r, `${id}.${f.key}`).toBe(true);
          const v = (r as Record<string, unknown>)[f.key];
          if (f.type === 'string') expect(typeof v).toBe('string');
          else expect(v === null || typeof v === 'number').toBe(true);
        }
      }
    });
  }

  test('an unknown dataset id, or an empty payload, plots nothing', () => {
    expect(datasetRows('nope', SOURCE_PERFORMANCE)).toEqual([]);
    for (const id of NEW_DATASETS) expect(datasetRows(id, null)).toEqual([]);
  });
});

test.describe('plusWidgetView: every advertised chart renders, and sparse data is a clean empty state', () => {
  for (const t of NEW_TYPES) {
    const w = widgetByType(t)!;
    for (const chart of w.supportedCharts) {
      test(`${t} as ${chart}`, () => {
        const v = plusWidgetView(t, chart, FIXTURE_BY_TYPE[t]);
        expect(v.kind, JSON.stringify(v).slice(0, 200)).toBe(KIND_FOR_CHART[chart]);
        if (v.kind === 'pie') expect(v.donut).toBe(chart === 'donut');
        if (v.kind === 'table') {
          expect(v.rows.length).toBeGreaterThan(0);
          for (const r of v.rows) for (const cell of Object.values(r)) expect(['string', 'number']).toContain(typeof cell);
        }
        if (v.kind === 'bar' || v.kind === 'line' || v.kind === 'area') {
          expect(v.keys.length).toBeGreaterThan(0);
          for (const row of v.data) for (const k of v.keys) expect(k in row, k).toBe(true);
        }
        if (v.kind === 'hbar' || v.kind === 'pie') for (const d of v.data) { expect(typeof d.name).toBe('string'); expect(Number.isFinite(d.value)).toBe(true); }
        if (v.kind === 'number') { expect(v.main.length).toBeGreaterThan(0); expect(v.sub.length).toBeGreaterThan(0); }
      });
      test(`${t} as ${chart}: empty / junk data -> empty state, never a throw`, () => {
        for (const data of [undefined, null, {}, [], 'x', { rows: [], totals: {} }]) {
          const v = plusWidgetView(t, chart, data);
          expect(v.kind).toBe('empty');
          if (v.kind === 'empty') expect(v.label.length).toBeGreaterThan(5);
        }
      });
    }
  }

  test('headline values and units', () => {
    expect(plusWidgetView('followup_compliance', 'number', FOLLOWUP_COMPLIANCE)).toEqual({ kind: 'number', main: '66.7%', sub: '10 on time · 3 late · 2 overdue (18 due)' });
    expect(plusWidgetView('weighted_pipeline', 'number', WEIGHTED_PIPELINE)).toEqual({ kind: 'number', main: '₹1.4L', sub: 'weighted · of ₹3.5L open (40%) · 4 deals' });
    expect(plusWidgetView('lead_conversion_time', 'number', CONVERSION_TIME)).toEqual({ kind: 'number', main: '4.5 d', sub: 'median · average 14.6 d · 90% within 49 d · 4 leads' });
    expect(plusWidgetView('call_connect_trend', 'number', CALL_TREND)).toEqual({ kind: 'number', main: '50%', sub: '2 of 4 calls with an outcome connected · 6 calls' });
    expect(plusWidgetView('lead_recycling', 'number', LEAD_RECYCLING)).toEqual({ kind: 'number', main: '2', sub: 'leads reopened · 2 distinct · 1 converted since · 2 moved to lost' });
  });

  test('the source table shows rates with %, money in INR, and a dash for nothing', () => {
    const v = plusWidgetView('lead_source_performance', 'table', SOURCE_PERFORMANCE);
    expect(v.kind === 'table' && v.rows[0]).toMatchObject({ Source: 'Website', Leads: 40, Converted: 10, 'Conversion %': '25%', 'Avg days to convert': '12.5 d', 'Won value': '₹3.5L' });
    const noAvg = JSON.parse(JSON.stringify(SOURCE_PERFORMANCE));
    noAvg.rows[1].avg_days_to_convert = null;
    const v2 = plusWidgetView('lead_source_performance', 'table', noAvg);
    expect(v2.kind === 'table' && v2.rows[1]['Avg days to convert']).toBe(DASH);
  });

  test('a month with no closed deals is a gap in the win-rate line, not a zero', () => {
    const v = plusWidgetView('win_rate_trend', 'line', WIN_RATE_TREND);
    expect(v.kind === 'line' && v.data.map((d) => d['Win rate %'])).toEqual([100, 66.7, null]);
    expect(v.kind === 'line' && v.data[0].name).toBe('Sep 2026');
  });

  test('the money charts format their axes as INR, the % charts as %, the day charts as days', () => {
    const w = plusWidgetView('weighted_pipeline', 'bar', WEIGHTED_PIPELINE);
    expect(w.kind === 'bar' && w.format).toBe('inr');
    expect(plusWidgetView('win_rate_trend', 'line', WIN_RATE_TREND)).toMatchObject({ format: 'pct' });
    expect(plusWidgetView('stage_velocity', 'bar', STAGE_VELOCITY)).toMatchObject({ format: 'days' });
  });

  test('stage velocity charts only the open stages', () => {
    const v = plusWidgetView('stage_velocity', 'bar', STAGE_VELOCITY);
    expect(v.kind === 'bar' && v.data.map((d) => d.name)).toEqual(['Lead', 'Proposal']);
  });

  test('a call-connect number with no recorded outcomes says so instead of showing 0%', () => {
    const none = { rows: CALL_TREND.rows, totals: { calls: 6, with_outcome: 0, connected: 0, connect_rate_pct: null }, weeks: 3 };
    expect(plusWidgetView('call_connect_trend', 'number', none)).toEqual({ kind: 'number', main: DASH, sub: 'No call outcomes recorded yet · 6 calls' });
  });
});

test.describe('built-in lead field gate', () => {
  test('hidden universally, or for either lead type, counts as hidden', () => {
    expect(isLeadFieldHidden({}, 'city')).toBe(false);
    expect(isLeadFieldHidden(undefined, 'city')).toBe(false);
    expect(isLeadFieldHidden({ 'lead.city': { hidden: true } }, 'city')).toBe(true);
    expect(isLeadFieldHidden({ 'lead.city@b2c': { hidden: true } }, 'city')).toBe(true);
    expect(isLeadFieldHidden({ 'lead.city@b2b': { hidden: true } }, 'city')).toBe(true);
    expect(isLeadFieldHidden({ 'lead.city': { hidden: false } }, 'city')).toBe(false);
    expect(isLeadFieldHidden({ 'deal.city': { hidden: true } }, 'city')).toBe(false); // another entity
    expect(isLeadFieldHidden({ 'lead.state': { hidden: true } }, 'city')).toBe(false);
  });
  test('each surface lists the built-in fields it groups by', () => {
    expect(GATED_FIELDS_BY_SURFACE.territory_conversion).toEqual(['state', 'city']);
    expect(blockedBy({ 'lead.state': { hidden: true } }, 'territory_conversion')).toEqual(['state']);
    expect(blockedBy({ 'lead.city': { hidden: true }, 'lead.state': { hidden: true } }, 'territory_conversion')).toEqual(['state', 'city']);
    expect(blockedBy({ 'lead.source_id': { hidden: true } }, 'lead_source_performance')).toEqual(['source_id']);
    expect(blockedBy({ 'lead.owner_id': { hidden: true } }, 'owner_workload')).toEqual(['owner_id']);
    expect(blockedBy({ 'lead.owner_id': { hidden: true } }, 'lead_source_performance')).toEqual([]);
    expect(blockedBy({ 'lead.city': { hidden: true } }, 'activity_mix')).toEqual([]); // activity based: no lead field exposed
    expect(blockedBy({}, 'nonexistent')).toEqual([]);
  });
  test('a custom chart is gated by its dataset, a preset by its type', () => {
    expect(surfaceOf('custom', 'source_performance')).toBe('dataset:source_performance');
    expect(surfaceOf('lead_source_performance')).toBe('lead_source_performance');
    expect(blockedBy({ 'lead.source_id': { hidden: true } }, surfaceOf('custom', 'conversion_time_by_source'))).toEqual(['source_id']);
  });
});

test.describe('weekday roll-up for the Activity Heatmap report', () => {
  test('sums by weekday (Monday first), with share, average per day and the busiest hour', () => {
    // 2026-11-09 is a Monday, 2026-11-10 a Tuesday, 2026-11-16 a Monday.
    const grid = [
      { date: '2026-11-09', hour: 9, count: 4 }, { date: '2026-11-09', hour: 10, count: 6 },
      { date: '2026-11-10', hour: 9, count: 2 }, { date: '2026-11-10', hour: 10, count: 0 },
      { date: '2026-11-16', hour: 9, count: 0 }, { date: '2026-11-16', hour: 10, count: 0 },
    ];
    const rows = weekdayRows(grid);
    expect(rows.map((r) => r.weekday)).toEqual(['Monday', 'Tuesday']);
    expect(rows[0]).toMatchObject({ activities: 10, share_pct: 83.3, days_in_window: 2, avg_per_day: 5, busiest_hour: '10:00' });
    expect(rows[1]).toMatchObject({ activities: 2, share_pct: 16.7, days_in_window: 1, avg_per_day: 2, busiest_hour: '09:00' });
  });
  test('an empty grid is no rows; Sunday sorts last', () => {
    expect(weekdayRows([])).toEqual([]);
    const rows = weekdayRows([{ date: '2026-11-08', hour: 1, count: 1 }, { date: '2026-11-09', hour: 1, count: 1 }]);
    expect(rows.map((r) => r.weekday)).toEqual(['Monday', 'Sunday']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// In the browser: /dashboard/crm/leads/analytics
// ═══════════════════════════════════════════════════════════════════════════

const ANALYTICS = '/dashboard/crm/leads/analytics';
const tile = (page: Page, type: string) => page.locator(`[data-widget-type="${type}"]`);
const widgetsFor = (types: readonly string[], chartOf: (t: string) => string = (t) => widgetByType(t)!.defaultChart) =>
  types.map((t) => ({ id: `w-${t}`, widget_type: t, chart_type: chartOf(t) }));
const layoutFor = (types: readonly string[], chartOf?: (t: string) => string) => ({ widgets: widgetsFor(types, chartOf) });

test.describe('Lead Analytics page: the picker', () => {
  test('lists every new widget with its definition, and adding one renders it and saves the layout', async ({ page }) => {
    const served = await serve(page);
    await page.goto(ANALYTICS);
    await page.getByRole('button', { name: 'Add widget' }).first().click();
    await expect(page.getByText('Add analytics widget')).toBeVisible();
    for (const t of NEW_TYPES) {
      const w = widgetByType(t)!;
      await expect(page.getByText(w.title, { exact: true }), w.title).toBeVisible();
    }
    await expect(page.getByText('Conversion % = converted leads ÷ leads from that source', { exact: false })).toBeVisible();

    await page.getByText('Lead Source Performance', { exact: true }).click();
    const t = tile(page, 'lead_source_performance');
    await expect(t).toBeVisible();
    await expect(t.getByRole('cell', { name: 'Website', exact: true })).toBeVisible();
    await expect(t.getByRole('cell', { name: '25%', exact: true })).toBeVisible();
    await expect(t.getByRole('cell', { name: '₹3.5L', exact: true })).toBeVisible();
    await expect.poll(() => served.layoutSaves.length, { timeout: 8000 }).toBeGreaterThan(0);
    expect(served.layoutSaves.at(-1)!.widgets).toContainEqual(expect.objectContaining({ widget_type: 'lead_source_performance', chart_type: 'table' }));
  });

  test('an added widget shows "Added" in the picker and cannot be added twice', async ({ page }) => {
    await serve(page, { layout: layoutFor(['activity_mix']) });
    await page.goto(ANALYTICS);
    await expect(tile(page, 'activity_mix')).toBeVisible();
    await page.getByRole('button', { name: 'Add widget' }).first().click();
    const card = page.getByRole('button', { name: /Activity Mix/ });
    await expect(card).toBeDisabled();
    await expect(card).toContainText('ADDED');
  });
});

test.describe('Lead Analytics page: every widget in every chart type', () => {
  test('each new widget renders its default chart from the mocked response (no error, no "unsupported")', async ({ page }) => {
    await serve(page, { layout: layoutFor(NEW_TYPES) });
    await page.goto(ANALYTICS);
    for (const t of NEW_TYPES) {
      const el = tile(page, t);
      await expect(el, t).toBeVisible();
      await expect(el.getByText(/Unsupported|Load failed|Unknown widget|Not recognised/i), t).toHaveCount(0);
      await expect(el.locator('table, .recharts-surface, .recharts-responsive-container').first(), t).toBeVisible();
    }
  });

  for (const t of NEW_TYPES) {
    test(`${t}: switching through every advertised chart type draws it`, async ({ page }) => {
      await serve(page, { layout: layoutFor([t]) });
      await page.goto(ANALYTICS);
      const el = tile(page, t);
      await expect(el).toBeVisible();
      const w = widgetByType(t)!;
      const LABEL: Record<string, string> = { number: 'Number', bar: 'Bar', line: 'Line', area: 'Area', pie: 'Pie', donut: 'Donut', 'horizontal-bar': 'H-Bar', table: 'Table' };
      for (const chart of w.supportedCharts) {
        await el.getByRole('button', { name: 'Widget options' }).click();
        await el.getByRole('button', { name: LABEL[chart], exact: true }).click();
        await expect(el.getByText(/Unsupported|Load failed|Unknown/i)).toHaveCount(0);
        if (chart === 'table') await expect(el.locator('table')).toBeVisible();
        else if (chart === 'number') await expect(el.locator('table, .recharts-surface')).toHaveCount(0);
        else await expect(el.locator('.recharts-surface').first()).toBeVisible();
      }
    });
  }

  test('the number tiles show their headline with units', async ({ page }) => {
    await serve(page, {
      layout: layoutFor(['followup_compliance', 'weighted_pipeline', 'lead_conversion_time', 'call_connect_trend', 'lead_recycling'], () => 'number'),
    });
    await page.goto(ANALYTICS);
    await expect(tile(page, 'followup_compliance')).toContainText('66.7%');
    await expect(tile(page, 'followup_compliance')).toContainText('10 on time · 3 late · 2 overdue (18 due)');
    await expect(tile(page, 'weighted_pipeline')).toContainText('₹1.4L');
    await expect(tile(page, 'lead_conversion_time')).toContainText('4.5 d');
    await expect(tile(page, 'call_connect_trend')).toContainText('50%');
    await expect(tile(page, 'lead_recycling')).toContainText('leads reopened');
  });
});

test.describe('Lead Analytics page: empty and failing data', () => {
  const EMPTY: Array<[string, string]> = [
    ['lead_source_performance', 'No leads in the last 90 days'],
    ['followup_compliance', 'No follow-ups fell due in the last 30 days'],
    ['owner_workload', 'No open leads'],
    ['stage_velocity', 'No stage history yet'],
    ['activity_mix', 'No activities logged in the last 30 days'],
    ['lead_conversion_time', 'No leads converted in the last 90 days'],
    ['weighted_pipeline', 'No open deals'],
    ['deal_size_distribution', 'No deals created in the last 180 days'],
    ['win_rate_trend', 'No deals closed in this period'],
    ['call_connect_trend', 'No calls logged in the last 8 weeks'],
    ['lead_recycling', 'No leads moved to or from Lost in this period'],
  ];

  test('an org with nothing gets a clean "no data" state in every tile', async ({ page }) => {
    const empty: Record<string, unknown> = {};
    for (const name of Object.keys({ 'source-performance': 1, 'followup-compliance': 1, 'owner-workload': 1, 'stage-velocity': 1, 'activity-mix': 1, 'conversion-time': 1, 'weighted-pipeline': 1, 'deal-size-distribution': 1, 'win-rate-trend': 1, 'call-connect-trend': 1, 'lead-recycling': 1 })) empty[name] = {};
    await serve(page, { payloads: empty, layout: layoutFor(NEW_TYPES) });
    await page.goto(ANALYTICS);
    for (const [type, label] of EMPTY) await expect(tile(page, type).getByText(label), type).toBeVisible();
  });

  test('a backend that answers with an empty list (the demo shape) is also a clean empty state', async ({ page }) => {
    const empty: Record<string, unknown> = {};
    for (const t of NEW_TYPES) empty[widgetByType(t)!.endpoint.replace('/analytics/', '')] = [];
    await serve(page, { payloads: empty, layout: layoutFor(NEW_TYPES) });
    await page.goto(ANALYTICS);
    for (const [type, label] of EMPTY) await expect(tile(page, type).getByText(label), type).toBeVisible();
  });

  test('one failing endpoint shows an error in its own tile only', async ({ page }) => {
    const served = await serve(page, { layout: layoutFor(['activity_mix', 'owner_workload']) });
    served.fail('activity-mix', 500);
    await page.goto(ANALYTICS);
    await expect(tile(page, 'activity_mix').locator('.recharts-surface')).toHaveCount(0);
    await expect(tile(page, 'activity_mix').getByText(/Boom|failed|error/i)).toBeVisible();
    await expect(tile(page, 'owner_workload').locator('.recharts-surface').first()).toBeVisible();
  });
});

test.describe('Lead Analytics page: custom charts over the new datasets', () => {
  test('the builder offers every new dataset, and a chart built on one renders and saves', async ({ page }) => {
    const served = await serve(page);
    await page.goto(ANALYTICS);
    await page.getByRole('button', { name: 'Build chart' }).first().click();
    const source = page.getByText('Data source', { exact: true }).locator('xpath=..').locator('select');
    const options = await source.locator('option').allTextContents();
    for (const id of NEW_DATASETS) expect(options, id).toContain(datasetById(id)!.label);

    await source.selectOption('owner_workload');
    await expect(page.getByText('Per owner: open leads, idle leads, overdue follow-ups and first-touch speed.')).toBeVisible();
    await page.getByRole('button', { name: 'Horizontal Bar' }).click();
    await page.getByRole('button', { name: 'Add chart' }).click();

    const custom = tile(page, 'custom');
    await expect(custom).toBeVisible();
    await expect(custom.locator('.recharts-surface').first()).toBeVisible();
    await expect.poll(() => served.layoutSaves.length, { timeout: 8000 }).toBeGreaterThan(0);
    expect(served.layoutSaves.at(-1)!.widgets).toContainEqual(expect.objectContaining({
      widget_type: 'custom', chart_type: 'horizontal-bar', config: expect.objectContaining({ data_source: 'owner_workload', x_field: 'owner', y_field: 'open_leads' }),
    }));
    expect(served.requests.some((r) => r.includes('/crm/analytics/owner-workload'))).toBe(true);
  });

  test('a saved custom chart on a new dataset renders as a table too', async ({ page }) => {
    await serve(page, { layout: { widgets: [{ id: 'c1', widget_type: 'custom', chart_type: 'table', config: { data_source: 'conversion_time_by_source', x_field: 'source', y_field: 'median_days', label: 'Days by source' } }] } });
    await page.goto(ANALYTICS);
    const el = tile(page, 'custom');
    await expect(el.getByText('Days by source')).toBeVisible();
    await expect(el.getByRole('cell', { name: 'Website', exact: true })).toBeVisible();
    await expect(el.getByRole('cell', { name: '49', exact: true })).toBeVisible();
  });
});

test.describe('Lead Analytics page: built-in field overrides', () => {
  test('a hidden city (or state) withholds the Territory widget, and a custom chart on it, once settings load', async ({ page }) => {
    await serve(page, {
      settings: settingsWith({ 'lead.city': { hidden: true } }),
      layout: { widgets: [
        { id: 't1', widget_type: 'territory_conversion', chart_type: 'table' },
        { id: 'c1', widget_type: 'custom', chart_type: 'bar', config: { data_source: 'territory_conversion', x_field: 'territory', y_field: 'total', label: 'Territories' } },
        { id: 'a1', widget_type: 'activity_mix', chart_type: 'donut' },
      ] },
      payloads: { 'territory-conversion': [{ territory: 'Mumbai', total: 5, converted: 1, rate: 20 }] },
    });
    await page.goto(ANALYTICS);
    await expect(tile(page, 'territory_conversion').getByText(/Hidden: an admin turned off the City field/)).toBeVisible();
    await expect(tile(page, 'territory_conversion').getByText('Mumbai')).toHaveCount(0);
    await expect(tile(page, 'custom').getByText(/Hidden: an admin turned off the/)).toBeVisible();
    // widgets that expose no built-in lead field are unaffected
    await expect(tile(page, 'activity_mix').locator('.recharts-surface').first()).toBeVisible();
  });

  test('with nothing hidden the Territory widget shows its rows', async ({ page }) => {
    await serve(page, {
      settings: settingsWith({}),
      layout: { widgets: [{ id: 't1', widget_type: 'territory_conversion', chart_type: 'table' }] },
      payloads: { 'territory-conversion': [{ territory: 'Mumbai', total: 5, converted: 1, rate: 20 }] },
    });
    await page.goto(ANALYTICS);
    await expect(tile(page, 'territory_conversion').getByRole('cell', { name: 'Mumbai' })).toBeVisible();
  });

  test('a hidden lead source withholds Lead Source Performance; a hidden owner withholds Owner Workload', async ({ page }) => {
    await serve(page, {
      settings: settingsWith({ 'lead.source_id': { hidden: true }, 'lead.owner_id@b2c': { hidden: true } }),
      layout: layoutFor(['lead_source_performance', 'owner_workload', 'stage_velocity']),
    });
    await page.goto(ANALYTICS);
    await expect(tile(page, 'lead_source_performance').getByText(/Hidden: an admin turned off the Lead source field/)).toBeVisible();
    await expect(tile(page, 'owner_workload').getByText(/Hidden: an admin turned off the Owner field/)).toBeVisible();
    await expect(tile(page, 'stage_velocity').locator('.recharts-surface').first()).toBeVisible();
  });

  test('a relabelled field is named the way the admin named it', async ({ page }) => {
    await serve(page, {
      settings: settingsWith({ 'lead.source_id': { hidden: true, label: 'Channel' } }),
      layout: layoutFor(['lead_source_performance']),
    });
    await page.goto(ANALYTICS);
    await expect(tile(page, 'lead_source_performance').getByText(/Hidden: an admin turned off the Channel field/)).toBeVisible();
  });
});

test.describe('Lead Analytics page: phone width', () => {
  test('the page does not scroll sideways at 390px with every new widget on it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await serve(page, { layout: layoutFor(NEW_TYPES) });
    await page.goto(ANALYTICS);
    for (const t of NEW_TYPES) await expect(tile(page, t)).toBeVisible();
    expect(await pageScrollsSideways(page)).toBe(false);
  });
});
