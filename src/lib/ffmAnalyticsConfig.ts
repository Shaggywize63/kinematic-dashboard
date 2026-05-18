/**
 * Field Force Management analytics — widget catalog + API client + datasets.
 *
 * Mirrors the structure of CRM lead analytics (src/lib/crm/widgetCatalog.ts +
 * crmAnalyticsExtApi.ts) but for the field-force surface: beat adherence,
 * outlet coverage, productive calls, AOV, new outlets, visit duration, etc.
 *
 * 16 preset widgets + a custom-chart builder driven by FFM_CUSTOM_DATASETS.
 * Each preset can switch chart types in-place (Bar → Line → Donut etc.)
 * without rebuilding.
 */
import api from './api';
import type { ChartType } from './crm/widgetCatalog';

type Wrapped<T> = { success: boolean; data: T };

const BASE = '/api/v1/analytics/ffm';

// ── Response shapes (one row type per dataset) ─────────────────────────

export interface BeatAdherenceRow      { fe_id: string; fe_name: string; planned: number; visited: number; adherence_pct: number }
export interface OutletCoverageRow     { fe_id: string; fe_name: string; universe: number; visited_mtd: number; coverage_pct: number }
export interface FrequencyComplianceRow{ outlet_type: string; due_visits: number; on_time: number; compliance_pct: number }
export interface ProductiveCallsRow    { fe_id: string; fe_name: string; visits: number; productive: number; productive_pct: number }
export interface StrikeRateRow         { fe_id: string; fe_name: string; visits: number; orders: number; strike_pct: number }
export interface AovPoint              { week: string; aov_inr: number; orders: number }
export interface NewOutletsRow         { fe_id: string; fe_name: string; new_outlet_count: number }
export interface VisitDurationBucket   { bucket: string; visit_count: number }
export interface IdleHeatmapCell       { fe_name: string; hour: number; idle_min: number }
export interface DistancePoint         { day: string; km_total: number; co2_kg: number }
export interface OffRouteRow           { outlet_name: string; fe_name: string; distance_km: number; planned_beat: string; visited_at: string }
export interface PunctualityRow        { fe_id: string; fe_name: string; on_time: number; late: number; absent: number }
export interface StuckFeRow            { fe_id: string; fe_name: string; days_since_last_activity: number; last_visit_at: string | null }
export interface SecurityViolationRow  { fe_id: string; fe_name: string; mock_location: number; vpn_detected: number; violation_count: number }
export interface FormCompletionRow     { fe_id: string; fe_name: string; required: number; submitted: number; completion_pct: number }
export interface TopPerformerRow       { fe_id: string; fe_name: string; revenue_inr: number; orders: number; outlets_covered: number }

// ── Endpoints ───────────────────────────────────────────────────────────

export const ffmAnalytics = {
  beatAdherence:     () => api.get<Wrapped<BeatAdherenceRow[]>>(`${BASE}/beat-adherence`),
  outletCoverage:    () => api.get<Wrapped<OutletCoverageRow[]>>(`${BASE}/outlet-coverage`),
  frequency:         () => api.get<Wrapped<FrequencyComplianceRow[]>>(`${BASE}/frequency-compliance`),
  productiveCalls:   () => api.get<Wrapped<ProductiveCallsRow[]>>(`${BASE}/productive-calls`),
  strikeRate:        () => api.get<Wrapped<StrikeRateRow[]>>(`${BASE}/order-strike-rate`),
  aov:               () => api.get<Wrapped<AovPoint[]>>(`${BASE}/aov`),
  newOutlets:        () => api.get<Wrapped<NewOutletsRow[]>>(`${BASE}/new-outlets`),
  visitDuration:     () => api.get<Wrapped<VisitDurationBucket[]>>(`${BASE}/visit-duration`),
  idleHeatmap:       () => api.get<Wrapped<IdleHeatmapCell[]>>(`${BASE}/idle-heatmap`),
  distance:          () => api.get<Wrapped<DistancePoint[]>>(`${BASE}/distance-travelled`),
  offRoute:          () => api.get<Wrapped<OffRouteRow[]>>(`${BASE}/off-route`),
  punctuality:       () => api.get<Wrapped<PunctualityRow[]>>(`${BASE}/attendance-punctuality`),
  stuckFes:          () => api.get<Wrapped<StuckFeRow[]>>(`${BASE}/stuck-fes`),
  securityViolations:() => api.get<Wrapped<SecurityViolationRow[]>>(`${BASE}/security-violations`),
  formCompletion:    () => api.get<Wrapped<FormCompletionRow[]>>(`${BASE}/form-completion`),
  topPerformers:     () => api.get<Wrapped<TopPerformerRow[]>>(`${BASE}/top-performers`),
};

// ── Widget catalog ──────────────────────────────────────────────────────

export type FfmWidgetType =
  | 'beat_adherence' | 'outlet_coverage' | 'frequency' | 'productive_calls'
  | 'strike_rate' | 'aov' | 'new_outlets' | 'visit_duration'
  | 'idle_heatmap' | 'distance' | 'off_route' | 'punctuality'
  | 'stuck_fes' | 'security_violations' | 'form_completion' | 'top_performers';

export type FfmCategory = 'Coverage' | 'Quality' | 'Productivity' | 'Efficiency' | 'Discipline' | 'Risk' | 'Growth';

export interface FfmWidgetMeta {
  type: FfmWidgetType;
  title: string;
  description: string;
  category: FfmCategory;
  supportedCharts: ChartType[];
  defaultChart: ChartType;
  defaultSize: { w: number; h: number };
}

export const FFM_WIDGET_CATALOG: FfmWidgetMeta[] = [
  { type: 'beat_adherence',     title: 'Beat Adherence',         description: '% of planned outlets actually visited per FE today.',         category: 'Coverage',     supportedCharts: ['bar', 'horizontal-bar', 'table'],          defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'outlet_coverage',    title: 'Outlet Coverage (MTD)',  description: '% of universe visited at least once this month.',             category: 'Coverage',     supportedCharts: ['horizontal-bar', 'bar', 'table'],          defaultChart: 'horizontal-bar', defaultSize: { w: 6, h: 4 } },
  { type: 'frequency',          title: 'Frequency Compliance',   description: 'Outlets visited at the planned cadence by outlet type.',      category: 'Coverage',     supportedCharts: ['table', 'bar'],                            defaultChart: 'table',          defaultSize: { w: 6, h: 4 } },
  { type: 'productive_calls',   title: 'Productive Calls %',     description: 'Visits resulting in an order ÷ total visits.',           category: 'Quality',      supportedCharts: ['bar', 'horizontal-bar', 'table'],          defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'strike_rate',        title: 'Order Strike Rate',      description: 'Per FE, % of visits that produced an order.',                 category: 'Quality',      supportedCharts: ['bar', 'horizontal-bar', 'table'],          defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'aov',                title: 'Avg Order Value',        description: 'Weekly AOV (₹) across the field force.',                 category: 'Quality',      supportedCharts: ['line', 'area', 'bar'],                     defaultChart: 'line',           defaultSize: { w: 6, h: 4 } },
  { type: 'new_outlets',        title: 'New Outlets (MTD)',      description: 'FEs adding fresh retailers to their beat this month.',        category: 'Growth',       supportedCharts: ['bar', 'horizontal-bar', 'table'],          defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'visit_duration',     title: 'Visit Duration',         description: 'Time spent per outlet (drive-by < 2m vs 5-20m vs 30m+).',      category: 'Productivity', supportedCharts: ['bar', 'pie', 'donut'],                     defaultChart: 'bar',            defaultSize: { w: 4, h: 4 } },
  { type: 'idle_heatmap',       title: 'Idle Time Heatmap',      description: 'Gap between consecutive visits, by hour-of-day per FE.',      category: 'Productivity', supportedCharts: ['table', 'heatmap'],                        defaultChart: 'table',          defaultSize: { w: 8, h: 5 } },
  { type: 'distance',           title: 'Distance Travelled',     description: 'Km per day across the force, with CO₂ equivalent.',      category: 'Efficiency',   supportedCharts: ['line', 'area', 'bar'],                     defaultChart: 'line',           defaultSize: { w: 6, h: 4 } },
  { type: 'off_route',          title: 'Off-route Visits',       description: 'Visits outside planned beat — errands / exceptions.',    category: 'Efficiency',   supportedCharts: ['table'],                                   defaultChart: 'table',          defaultSize: { w: 8, h: 5 } },
  { type: 'punctuality',        title: 'Attendance Punctuality', description: 'On-time / late / absent counts per FE.',                      category: 'Discipline',   supportedCharts: ['bar', 'table'],                            defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'stuck_fes',          title: 'Stuck FEs',              description: 'FEs with declining activity over the last 7-14 days.',        category: 'Risk',         supportedCharts: ['table'],                                   defaultChart: 'table',          defaultSize: { w: 8, h: 5 } },
  { type: 'security_violations',title: 'Security Violations',    description: 'MOCK_LOCATION / VPN_DETECTED counts per FE.',                 category: 'Risk',         supportedCharts: ['bar', 'horizontal-bar', 'table'],          defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'form_completion',    title: 'Form Completion Rate',   description: '% of mandatory forms submitted per visit per FE.',            category: 'Discipline',   supportedCharts: ['bar', 'horizontal-bar', 'table'],          defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'top_performers',     title: 'Top Performers',         description: 'Leaderboard by revenue / orders / outlets covered.',          category: 'Growth',       supportedCharts: ['horizontal-bar', 'table'],                 defaultChart: 'horizontal-bar', defaultSize: { w: 8, h: 5 } },
];

export const ffmWidgetByType = (type: string): FfmWidgetMeta | undefined =>
  FFM_WIDGET_CATALOG.find(w => w.type === type);

// ── Custom-chart dataset registry ──────────────────────────────────────
//
// One entry per FFM endpoint. The builder UI lets users pick:
//   - a dataset (id)
//   - an X axis field (any field)
//   - a Y axis field (numeric for non-table charts)
//   - a chart type
// and saves a WidgetInstance with widget_type='ffm_custom' + config.
// The renderer in FfmAnalyticsSection reads config.{data_source,x_field,
// y_field,label} and dispatches to the shared chart helpers.
//
// Dataset ids deliberately match FfmWidgetType strings so a single fetch
// helper (fetchFfmDataset) covers both preset widgets and custom charts.

export interface FfmDatasetField {
  key: string;
  label: string;
  type: 'string' | 'number';
}

export interface FfmCustomDataset {
  id: string;
  label: string;
  description: string;
  fields: FfmDatasetField[];
  defaultX: string;
  defaultY: string;
}

export const FFM_CUSTOM_DATASETS: FfmCustomDataset[] = [
  { id: 'beat_adherence', label: 'Beat Adherence',
    description: 'Planned vs visited outlets per FE today.',
    fields: [
      { key: 'fe_name',       label: 'FE',           type: 'string' },
      { key: 'planned',       label: 'Planned',      type: 'number' },
      { key: 'visited',       label: 'Visited',      type: 'number' },
      { key: 'adherence_pct', label: 'Adherence %',  type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'adherence_pct' },
  { id: 'outlet_coverage', label: 'Outlet Coverage (MTD)',
    description: '% of outlet universe visited this month.',
    fields: [
      { key: 'fe_name',      label: 'FE',          type: 'string' },
      { key: 'universe',     label: 'Universe',    type: 'number' },
      { key: 'visited_mtd',  label: 'Visited MTD', type: 'number' },
      { key: 'coverage_pct', label: 'Coverage %',  type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'coverage_pct' },
  { id: 'frequency', label: 'Frequency Compliance',
    description: 'Outlets visited at planned cadence, by outlet type.',
    fields: [
      { key: 'outlet_type',    label: 'Outlet type',  type: 'string' },
      { key: 'due_visits',     label: 'Due visits',   type: 'number' },
      { key: 'on_time',        label: 'On time',      type: 'number' },
      { key: 'compliance_pct', label: 'Compliance %', type: 'number' },
    ],
    defaultX: 'outlet_type', defaultY: 'compliance_pct' },
  { id: 'productive_calls', label: 'Productive Calls %',
    description: 'Visits resulting in an order ÷ total visits.',
    fields: [
      { key: 'fe_name',        label: 'FE',           type: 'string' },
      { key: 'visits',         label: 'Visits',       type: 'number' },
      { key: 'productive',     label: 'Productive',   type: 'number' },
      { key: 'productive_pct', label: 'Productive %', type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'productive_pct' },
  { id: 'strike_rate', label: 'Order Strike Rate',
    description: 'Per FE, % of visits that produced an order.',
    fields: [
      { key: 'fe_name',    label: 'FE',        type: 'string' },
      { key: 'visits',     label: 'Visits',    type: 'number' },
      { key: 'orders',     label: 'Orders',    type: 'number' },
      { key: 'strike_pct', label: 'Strike %',  type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'strike_pct' },
  { id: 'aov', label: 'Average Order Value',
    description: 'Weekly AOV (₹) and order count across the field force.',
    fields: [
      { key: 'week',    label: 'Week',    type: 'string' },
      { key: 'aov_inr', label: 'AOV (₹)', type: 'number' },
      { key: 'orders',  label: 'Orders',  type: 'number' },
    ],
    defaultX: 'week', defaultY: 'aov_inr' },
  { id: 'new_outlets', label: 'New Outlets (MTD)',
    description: 'FEs adding fresh retailers to their beat this month.',
    fields: [
      { key: 'fe_name',          label: 'FE',          type: 'string' },
      { key: 'new_outlet_count', label: 'New outlets', type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'new_outlet_count' },
  { id: 'visit_duration', label: 'Visit Duration',
    description: 'Time spent per outlet by duration bucket.',
    fields: [
      { key: 'bucket',      label: 'Bucket',  type: 'string' },
      { key: 'visit_count', label: 'Visits',  type: 'number' },
    ],
    defaultX: 'bucket', defaultY: 'visit_count' },
  { id: 'idle_heatmap', label: 'Idle Time by Hour',
    description: 'Idle minutes per FE per hour-of-day.',
    fields: [
      { key: 'fe_name',  label: 'FE',       type: 'string' },
      { key: 'hour',     label: 'Hour',     type: 'number' },
      { key: 'idle_min', label: 'Idle min', type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'idle_min' },
  { id: 'distance', label: 'Distance Travelled',
    description: 'Km per day with CO₂ equivalent.',
    fields: [
      { key: 'day',      label: 'Day',      type: 'string' },
      { key: 'km_total', label: 'Km total', type: 'number' },
      { key: 'co2_kg',   label: 'CO₂ kg',   type: 'number' },
    ],
    defaultX: 'day', defaultY: 'km_total' },
  { id: 'off_route', label: 'Off-route Visits',
    description: 'Visits outside the planned beat.',
    fields: [
      { key: 'outlet_name',  label: 'Outlet',        type: 'string' },
      { key: 'fe_name',      label: 'FE',            type: 'string' },
      { key: 'planned_beat', label: 'Planned beat',  type: 'string' },
      { key: 'distance_km',  label: 'Distance (km)', type: 'number' },
      { key: 'visited_at',   label: 'Visited at',    type: 'string' },
    ],
    defaultX: 'outlet_name', defaultY: 'distance_km' },
  { id: 'punctuality', label: 'Attendance Punctuality',
    description: 'On-time / late / absent counts per FE.',
    fields: [
      { key: 'fe_name', label: 'FE',      type: 'string' },
      { key: 'on_time', label: 'On time', type: 'number' },
      { key: 'late',    label: 'Late',    type: 'number' },
      { key: 'absent',  label: 'Absent',  type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'on_time' },
  { id: 'stuck_fes', label: 'Stuck FEs',
    description: 'FEs with declining activity over the last 7-14 days.',
    fields: [
      { key: 'fe_name',                  label: 'FE',         type: 'string' },
      { key: 'days_since_last_activity', label: 'Days idle',  type: 'number' },
      { key: 'last_visit_at',            label: 'Last visit', type: 'string' },
    ],
    defaultX: 'fe_name', defaultY: 'days_since_last_activity' },
  { id: 'security_violations', label: 'Security Violations',
    description: 'MOCK_LOCATION / VPN_DETECTED counts per FE.',
    fields: [
      { key: 'fe_name',         label: 'FE',       type: 'string' },
      { key: 'mock_location',   label: 'Mock loc', type: 'number' },
      { key: 'vpn_detected',    label: 'VPN',      type: 'number' },
      { key: 'violation_count', label: 'Total',    type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'violation_count' },
  { id: 'form_completion', label: 'Form Completion Rate',
    description: '% of mandatory forms submitted per visit per FE.',
    fields: [
      { key: 'fe_name',        label: 'FE',           type: 'string' },
      { key: 'required',       label: 'Required',     type: 'number' },
      { key: 'submitted',      label: 'Submitted',    type: 'number' },
      { key: 'completion_pct', label: 'Completion %', type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'completion_pct' },
  { id: 'top_performers', label: 'Top Performers',
    description: 'Leaderboard by revenue / orders / outlets covered.',
    fields: [
      { key: 'fe_name',         label: 'FE',              type: 'string' },
      { key: 'revenue_inr',     label: 'Revenue (₹)',     type: 'number' },
      { key: 'orders',          label: 'Orders',          type: 'number' },
      { key: 'outlets_covered', label: 'Outlets covered', type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'revenue_inr' },
];

export const ffmDatasetById = (id: string): FfmCustomDataset | undefined =>
  FFM_CUSTOM_DATASETS.find(d => d.id === id);

// Dispatch a dataset id → the underlying row array. Dataset ids match
// FfmWidgetType strings, so this also serves as the fetch helper for the
// preset widgets — keeping a single source of truth.
export async function fetchFfmDataset(id: string): Promise<unknown[]> {
  switch (id) {
    case 'beat_adherence':      return ((await ffmAnalytics.beatAdherence()).data      as unknown as unknown[]) ?? [];
    case 'outlet_coverage':     return ((await ffmAnalytics.outletCoverage()).data     as unknown as unknown[]) ?? [];
    case 'frequency':           return ((await ffmAnalytics.frequency()).data          as unknown as unknown[]) ?? [];
    case 'productive_calls':    return ((await ffmAnalytics.productiveCalls()).data    as unknown as unknown[]) ?? [];
    case 'strike_rate':         return ((await ffmAnalytics.strikeRate()).data         as unknown as unknown[]) ?? [];
    case 'aov':                 return ((await ffmAnalytics.aov()).data                as unknown as unknown[]) ?? [];
    case 'new_outlets':         return ((await ffmAnalytics.newOutlets()).data         as unknown as unknown[]) ?? [];
    case 'visit_duration':      return ((await ffmAnalytics.visitDuration()).data      as unknown as unknown[]) ?? [];
    case 'idle_heatmap':        return ((await ffmAnalytics.idleHeatmap()).data        as unknown as unknown[]) ?? [];
    case 'distance':            return ((await ffmAnalytics.distance()).data           as unknown as unknown[]) ?? [];
    case 'off_route':           return ((await ffmAnalytics.offRoute()).data           as unknown as unknown[]) ?? [];
    case 'punctuality':         return ((await ffmAnalytics.punctuality()).data        as unknown as unknown[]) ?? [];
    case 'stuck_fes':           return ((await ffmAnalytics.stuckFes()).data           as unknown as unknown[]) ?? [];
    case 'security_violations': return ((await ffmAnalytics.securityViolations()).data as unknown as unknown[]) ?? [];
    case 'form_completion':     return ((await ffmAnalytics.formCompletion()).data     as unknown as unknown[]) ?? [];
    case 'top_performers':      return ((await ffmAnalytics.topPerformers()).data      as unknown as unknown[]) ?? [];
    default: throw new Error(`Unknown FFM dataset: ${id}`);
  }
}
