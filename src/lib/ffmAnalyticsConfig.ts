/**
 * Field Force Management analytics — widget catalog + API client + datasets.
 *
 * Mirrors the structure of CRM lead analytics (src/lib/crm/widgetCatalog.ts +
 * crmAnalyticsExtApi.ts) but for the field-force surface: beat adherence,
 * outlet coverage, productive calls, AOV, new outlets, visit duration, etc.
 *
 * 28 preset widgets (16 original + 12 added: trends, outlet recency / frequency,
 * per-rep comparisons, geo-fence exceptions, attendance hours, outlet churn) + a
 * custom-chart builder driven by FFM_CUSTOM_DATASETS. Each preset can switch chart
 * types in-place (Bar → Line → Donut etc.) without rebuilding.
 */
import api from './api';
import type { ChartType } from './crm/widgetCatalog';
import { enrichFfmRows } from '../components/ffm/analytics/ffmDerive';

type Wrapped<T> = { success: boolean; data: T };

const BASE = '/api/v1/analytics/ffm';

// ── Response shapes (one row type per dataset) ─────────────────────────

export interface BeatAdherenceRow      { fe_id: string; fe_name: string; planned: number; visited: number; adherence_pct: number }
export interface OutletCoverageRow     { fe_id: string; fe_name: string; universe: number; visited_mtd: number; coverage_pct: number }
export interface FrequencyComplianceRow{ outlet_type: string; due_visits: number; on_time: number; compliance_pct: number }
export interface ProductiveCallsRow    { fe_id: string; fe_name: string; visits: number; productive: number; productive_pct: number }
export interface StrikeRateRow         { fe_id: string; fe_name: string; visits: number; orders: number; strike_pct: number }
export interface AovPoint              { week: string; aov_inr: number; orders: number; revenue_inr?: number }
export interface NewOutletsRow         { fe_id: string; fe_name: string; new_outlet_count: number }
export interface VisitDurationBucket   { bucket: string; visit_count: number }
export interface IdleHeatmapCell       { fe_name: string; hour: number; idle_min: number }
export interface DistancePoint         { day: string; km_total: number; reps?: number }
export interface OffRouteRow           { outlet_name: string; fe_name: string; distance_km: number; planned_beat: string; visited_at: string }
export interface PunctualityRow        { fe_id: string; fe_name: string; on_time: number; late: number; absent: number }
export interface StuckFeRow            { fe_id: string; fe_name: string; days_since_last_activity: number; last_visit_at: string | null }
export interface SecurityViolationRow  { fe_id: string; fe_name: string; mock_location: number; vpn_detected: number; violation_count: number }
export interface FormCompletionRow     { fe_id: string; fe_name: string; required: number; submitted: number; completion_pct: number }
export interface TopPerformerRow       { fe_id: string; fe_name: string; revenue_inr: number; orders: number; outlets_covered: number }
// Added widgets (same `analytics` module gate as the originals).
export interface BeatAdherenceTrendPoint { week: string; week_start: string; planned: number; visited: number; missed: number; adherence_pct: number; active_reps: number }
export interface OutletBucketRow       { bucket: string; outlets: number; share_pct: number }
export interface ProductiveTrendPoint  { week: string; week_start: string; visits: number; productive_visits: number; productive_pct: number }
export interface RepBasketRow          { fe_id: string; fe_name: string; orders: number; revenue_inr: number; aov_inr: number; active_days: number; orders_per_day: number; vs_team_aov_pct: number }
export interface CallsPerDayRow        { fe_id: string; fe_name: string; visit_days: number; visits: number; calls_per_day: number; team_median: number; vs_median: number }
export interface DwellTimeRow          { fe_id: string; fe_name: string; timed_visits: number; avg_dwell_min: number; avg_planned_min: number; under_2min_pct: number }
export interface VisitHourRow          { hour: number; hour_label: string; visits: number; share_pct: number }
export interface TravelEfficiencyRow   { fe_id: string; fe_name: string; km_total: number; visits: number; km_per_visit: number; active_days: number; km_per_day: number }
export interface GeoExceptionWidgetRow { fe_id: string; fe_name: string; checkins: number; outside_geofence: number; outside_pct: number; max_distance_m: number }
export interface AttendanceHoursRow    { fe_id: string; fe_name: string; days_present: number; avg_hours: number; avg_checkin_time: string; avg_checkin_min: number; missed_checkouts: number }
export interface OutletChurnRow        { segment: string; outlets: number; revenue_last_30d_inr: number; revenue_prior_30d_inr: number }
// Phase B — beat_productivity module (off by default).
export interface TlsdPoint             { day: string; lines: number; orders: number; lines_per_order: number }
export interface UniqueOutletsRow      { fe_id: string; fe_name: string; unique_outlets: number; productive_outlets: number; productive_outlet_pct: number }

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
  // Added widgets.
  beatAdherenceTrend:() => api.get<Wrapped<BeatAdherenceTrendPoint[]>>(`${BASE}/beat-adherence-trend`),
  outletRecency:     () => api.get<Wrapped<OutletBucketRow[]>>(`${BASE}/outlet-recency`),
  visitFrequency:    () => api.get<Wrapped<OutletBucketRow[]>>(`${BASE}/visit-frequency`),
  productiveTrend:   () => api.get<Wrapped<ProductiveTrendPoint[]>>(`${BASE}/productive-trend`),
  repBasket:         () => api.get<Wrapped<RepBasketRow[]>>(`${BASE}/rep-basket`),
  callsPerDay:       () => api.get<Wrapped<CallsPerDayRow[]>>(`${BASE}/calls-per-day`),
  dwellTime:         () => api.get<Wrapped<DwellTimeRow[]>>(`${BASE}/dwell-time`),
  visitHours:        () => api.get<Wrapped<VisitHourRow[]>>(`${BASE}/visit-hours`),
  travelEfficiency:  () => api.get<Wrapped<TravelEfficiencyRow[]>>(`${BASE}/travel-efficiency`),
  geoExceptions:     () => api.get<Wrapped<GeoExceptionWidgetRow[]>>(`${BASE}/geo-exceptions`),
  attendanceHours:   () => api.get<Wrapped<AttendanceHoursRow[]>>(`${BASE}/attendance-hours`),
  outletChurn:       () => api.get<Wrapped<OutletChurnRow[]>>(`${BASE}/outlet-churn`),
  // Phase B — beat_productivity module (returns 403 until the client is granted it).
  tlsd:              () => api.get<Wrapped<TlsdPoint[]>>(`${BASE}/tlsd`),
  uniqueOutlets:     () => api.get<Wrapped<UniqueOutletsRow[]>>(`${BASE}/unique-outlets`),
};

// ── Widget catalog ──────────────────────────────────────────────────────

export type FfmWidgetType =
  | 'beat_adherence' | 'outlet_coverage' | 'frequency' | 'productive_calls'
  | 'strike_rate' | 'aov' | 'new_outlets' | 'visit_duration'
  | 'idle_heatmap' | 'distance' | 'off_route' | 'punctuality'
  | 'stuck_fes' | 'security_violations' | 'form_completion' | 'top_performers'
  // added
  | 'beat_adherence_trend' | 'outlet_recency' | 'visit_frequency' | 'productive_trend'
  | 'rep_basket' | 'calls_per_day' | 'dwell_time' | 'visit_hours'
  | 'travel_efficiency' | 'geo_exceptions' | 'attendance_hours' | 'outlet_churn';

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
  // ── Original widgets (descriptions state the window and formula each one really uses) ──
  { type: 'beat_adherence',     title: 'Beat Adherence',         description: 'Last 14 days, per FE: visited ÷ planned outlets from each route plan, shown with the number missed.',          category: 'Coverage',     supportedCharts: ['bar', 'horizontal-bar', 'table'],          defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'outlet_coverage',    title: 'Outlet Coverage (MTD)',  description: 'This month so far, per FE: outlets visited at least once ÷ outlets on their route plans, with the number not yet visited.', category: 'Coverage', supportedCharts: ['horizontal-bar', 'bar', 'table'],      defaultChart: 'horizontal-bar', defaultSize: { w: 6, h: 4 } },
  { type: 'frequency',          title: 'Frequency Compliance',   description: 'Last 30 days, by outlet type: planned visits that were made ÷ planned visits, with the number missed.',          category: 'Coverage',     supportedCharts: ['table', 'bar'],                            defaultChart: 'table',          defaultSize: { w: 6, h: 4 } },
  { type: 'productive_calls',   title: 'Productive Calls %',     description: 'Last 14 days, per FE: visits to an outlet where the FE booked an order ÷ all visits.',                          category: 'Quality',      supportedCharts: ['bar', 'horizontal-bar', 'table'],          defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'strike_rate',        title: 'Order Strike Rate',      description: 'Last 14 days, per FE: orders booked ÷ visits. Can pass 100% when orders are booked without a visit.',            category: 'Quality',      supportedCharts: ['bar', 'horizontal-bar', 'table'],          defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'aov',                title: 'Avg Order Value',        description: 'Weekly average order value (₹) = revenue ÷ orders, last 5 weeks, cancelled orders excluded; table adds revenue.', category: 'Quality',     supportedCharts: ['line', 'area', 'bar'],                     defaultChart: 'line',           defaultSize: { w: 6, h: 4 } },
  { type: 'new_outlets',        title: 'New Outlets (MTD)',      description: 'Outlets added to the outlet list this month that an FE has on a route plan, per FE.',                           category: 'Growth',       supportedCharts: ['bar', 'horizontal-bar', 'table'],          defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'visit_duration',     title: 'Visit Duration',         description: 'Last 14 days: visited stops by PLANNED minutes per stop (drive-by under 2 min … 30 min+). Not measured time on site; see "Time on Site".', category: 'Productivity', supportedCharts: ['bar', 'pie', 'donut'], defaultChart: 'bar',            defaultSize: { w: 4, h: 4 } },
  { type: 'idle_heatmap',       title: 'Idle Time Heatmap',      description: 'Gap between consecutive visits by hour of day per FE. Shows no data until the server derives idle gaps.',        category: 'Productivity', supportedCharts: ['table', 'heatmap'],                        defaultChart: 'table',          defaultSize: { w: 8, h: 5 } },
  { type: 'distance',           title: 'Distance Travelled',     description: 'Km per day across the force, last 14 days: actual km when recorded, otherwise the planned route km.',            category: 'Efficiency',   supportedCharts: ['line', 'area', 'bar'],                     defaultChart: 'line',           defaultSize: { w: 6, h: 4 } },
  { type: 'off_route',          title: 'Off-route Visits',       description: 'Last 14 days: check-ins made further from the outlet than its geofence radius (100 m when none is set).',       category: 'Efficiency',   supportedCharts: ['table'],                                   defaultChart: 'table',          defaultSize: { w: 8, h: 5 } },
  { type: 'punctuality',        title: 'Attendance Punctuality', description: 'This month, per FE: on-time, late and absent days (late follows the client shift rules, else after 10:00 IST); table adds punctual %.', category: 'Discipline', supportedCharts: ['bar', 'table'],                    defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'stuck_fes',          title: 'Stuck FEs',              description: 'FEs whose last booked order was 3 or more days ago: days since that order.',                                    category: 'Risk',         supportedCharts: ['table'],                                   defaultChart: 'table',          defaultSize: { w: 8, h: 5 } },
  { type: 'security_violations',title: 'Security Violations',    description: 'Last 30 days, per FE: mock-location and VPN alerts the app reported.',                                          category: 'Risk',         supportedCharts: ['bar', 'horizontal-bar', 'table'],          defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'form_completion',    title: 'Form Completion Rate',   description: 'This month, per FE: form submissions ÷ visited stops (capped at 100%), with the number missing.',                category: 'Discipline',   supportedCharts: ['bar', 'horizontal-bar', 'table'],          defaultChart: 'bar',            defaultSize: { w: 6, h: 4 } },
  { type: 'top_performers',     title: 'Top Performers',         description: 'Last 30 days, per FE: revenue (₹), orders and outlets covered; table adds average order value and share of revenue.', category: 'Growth',  supportedCharts: ['horizontal-bar', 'table'],                 defaultChart: 'horizontal-bar', defaultSize: { w: 8, h: 5 } },

  // ── Added widgets ──
  { type: 'beat_adherence_trend', title: 'Beat Adherence Trend', description: 'Weekly (Mon–Sun) over the last 8 weeks: visited ÷ planned calls × 100. A call is one outlet for one rep on one day, visited when its status is visited, completed, done or checked out. The latest week is week-to-date.', category: 'Coverage', supportedCharts: ['line', 'area', 'bar', 'table'], defaultChart: 'line', defaultSize: { w: 6, h: 4 } },
  { type: 'outlet_recency',       title: 'Days Since Last Visit', description: 'Outlets planned in the last 90 days, grouped by days since their most recent visit (0–7, 8–14, 15–30, 31–60, 61–90, never visited in the window).', category: 'Coverage', supportedCharts: ['bar', 'horizontal-bar', 'pie', 'donut', 'table'], defaultChart: 'bar', defaultSize: { w: 6, h: 4 } },
  { type: 'visit_frequency',      title: 'Visit Frequency per Outlet', description: 'Outlets planned in the last 30 days by how many visits each got (none, 1, 2, 3, 4+). One visit = one rep at the outlet on one day.', category: 'Coverage', supportedCharts: ['bar', 'pie', 'donut', 'table'], defaultChart: 'bar', defaultSize: { w: 6, h: 4 } },
  { type: 'productive_trend',     title: 'Productive Calls Trend', description: 'Weekly over the last 8 weeks: productive visits ÷ visits × 100. A visit is productive when the same rep booked a non-cancelled, non-draft order at that outlet on the visit date (IST).', category: 'Quality', supportedCharts: ['line', 'area', 'bar', 'table'], defaultChart: 'line', defaultSize: { w: 6, h: 4 } },
  { type: 'rep_basket',           title: 'Order Value by Rep', description: 'Last 30 days, per rep: orders, revenue (₹, cancelled and draft orders excluded), average order value = revenue ÷ orders, and the gap to the team average order value.', category: 'Quality', supportedCharts: ['horizontal-bar', 'bar', 'table'], defaultChart: 'horizontal-bar', defaultSize: { w: 6, h: 4 } },
  { type: 'calls_per_day',        title: 'Calls per Working Day', description: 'Last 14 days, per rep: visited calls ÷ days with at least one visit, next to the median of the reps shown. A comparison aid, not a target: beats differ in length and outlet density.', category: 'Productivity', supportedCharts: ['horizontal-bar', 'bar', 'table'], defaultChart: 'horizontal-bar', defaultSize: { w: 6, h: 4 } },
  { type: 'dwell_time',           title: 'Time on Site', description: 'Last 14 days, per rep: average minutes between check-in and check-out, only for visits that have both (up to 8 hours), beside the planned minutes. Visits without a check-out are not timed.', category: 'Productivity', supportedCharts: ['bar', 'horizontal-bar', 'table'], defaultChart: 'bar', defaultSize: { w: 6, h: 4 } },
  { type: 'visit_hours',          title: 'Visits by Hour of Day', description: 'Last 14 days: visited calls by the IST hour of check-in. Calls without a check-in time are left out.', category: 'Productivity', supportedCharts: ['bar', 'area', 'line', 'table'], defaultChart: 'bar', defaultSize: { w: 6, h: 4 } },
  { type: 'travel_efficiency',    title: 'Km per Visit', description: 'Last 14 days, per rep: route km ÷ visited calls. Km is the actual distance when recorded, otherwise the planned route distance.', category: 'Efficiency', supportedCharts: ['horizontal-bar', 'bar', 'table'], defaultChart: 'horizontal-bar', defaultSize: { w: 6, h: 4 } },
  { type: 'geo_exceptions',       title: 'Check-ins Outside Geofence', description: 'Last 14 days, per rep: check-ins made further from the outlet than its geofence radius (100 m when none is set). Often legitimate (wrong map pin, large premises): review with the rep before drawing conclusions.', category: 'Risk', supportedCharts: ['bar', 'horizontal-bar', 'table'], defaultChart: 'bar', defaultSize: { w: 6, h: 4 } },
  { type: 'attendance_hours',     title: 'Hours Worked & Check-in Time', description: 'Last 30 days, per rep: days present, average hours per day (stored hours, else check-out minus check-in), average check-in time (IST) and past days with no check-out.', category: 'Discipline', supportedCharts: ['bar', 'horizontal-bar', 'table'], defaultChart: 'bar', defaultSize: { w: 6, h: 4 } },
  { type: 'outlet_churn',         title: 'Outlets: Retained, New, Lapsed', description: 'Outlets by ordering pattern, last 30 days vs the 30 days before: retained (ordered in both), new or returning (only the last 30), lapsed (only the earlier 30). Revenue in ₹, cancelled and draft orders excluded.', category: 'Growth', supportedCharts: ['bar', 'pie', 'donut', 'table'], defaultChart: 'bar', defaultSize: { w: 6, h: 4 } },
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
      { key: 'missed',        label: 'Missed',       type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'adherence_pct' },
  { id: 'outlet_coverage', label: 'Outlet Coverage (MTD)',
    description: '% of outlet universe visited this month.',
    fields: [
      { key: 'fe_name',      label: 'FE',          type: 'string' },
      { key: 'universe',     label: 'Universe',    type: 'number' },
      { key: 'visited_mtd',  label: 'Visited MTD', type: 'number' },
      { key: 'coverage_pct', label: 'Coverage %',  type: 'number' },
      { key: 'not_visited',  label: 'Not visited', type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'coverage_pct' },
  { id: 'frequency', label: 'Frequency Compliance',
    description: 'Outlets visited at planned cadence, by outlet type.',
    fields: [
      { key: 'outlet_type',    label: 'Outlet type',  type: 'string' },
      { key: 'due_visits',     label: 'Due visits',   type: 'number' },
      { key: 'on_time',        label: 'On time',      type: 'number' },
      { key: 'compliance_pct', label: 'Compliance %', type: 'number' },
      { key: 'missed',         label: 'Missed',       type: 'number' },
    ],
    defaultX: 'outlet_type', defaultY: 'compliance_pct' },
  { id: 'productive_calls', label: 'Productive Calls %',
    description: 'Visits resulting in an order ÷ total visits.',
    fields: [
      { key: 'fe_name',        label: 'FE',           type: 'string' },
      { key: 'visits',         label: 'Visits',       type: 'number' },
      { key: 'productive',     label: 'Productive',   type: 'number' },
      { key: 'productive_pct', label: 'Productive %', type: 'number' },
      { key: 'unproductive',   label: 'Unproductive', type: 'number' },
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
      { key: 'revenue_inr', label: 'Revenue (₹)', type: 'number' },
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
      { key: 'share_pct',   label: 'Share %', type: 'number' },
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
    description: 'Km per day.',
    fields: [
      { key: 'day',      label: 'Day',      type: 'string' },
      { key: 'km_total', label: 'Km total', type: 'number' },
      { key: 'reps',     label: 'Reps travelling', type: 'number' },
      { key: 'km_per_rep', label: 'Km per rep', type: 'number' },
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
      { key: 'punctual_pct', label: 'Punctual %', type: 'number' },
      { key: 'days_total',   label: 'Days',       type: 'number' },
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
      { key: 'missing',        label: 'Missing',      type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'completion_pct' },
  { id: 'top_performers', label: 'Top Performers',
    description: 'Leaderboard by revenue / orders / outlets covered.',
    fields: [
      { key: 'fe_name',         label: 'FE',              type: 'string' },
      { key: 'revenue_inr',     label: 'Revenue (₹)',     type: 'number' },
      { key: 'orders',          label: 'Orders',          type: 'number' },
      { key: 'outlets_covered', label: 'Outlets covered', type: 'number' },
      { key: 'aov_inr',         label: 'AOV (₹)',         type: 'number' },
      { key: 'share_pct',       label: 'Revenue share %', type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'revenue_inr' },

  // ── Added datasets (same ids as the widget types) ──
  { id: 'beat_adherence_trend', label: 'Beat Adherence Trend',
    description: 'Weekly planned vs visited calls over the last 8 weeks.',
    fields: [
      { key: 'week',          label: 'Week',        type: 'string' },
      { key: 'week_start',    label: 'Week starts', type: 'string' },
      { key: 'planned',       label: 'Planned',     type: 'number' },
      { key: 'visited',       label: 'Visited',     type: 'number' },
      { key: 'missed',        label: 'Missed',      type: 'number' },
      { key: 'adherence_pct', label: 'Adherence %', type: 'number' },
      { key: 'active_reps',   label: 'Active reps', type: 'number' },
    ],
    defaultX: 'week', defaultY: 'adherence_pct' },
  { id: 'outlet_recency', label: 'Days Since Last Visit',
    description: 'Outlets planned in the last 90 days, by days since their last visit.',
    fields: [
      { key: 'bucket',    label: 'Days since last visit', type: 'string' },
      { key: 'outlets',   label: 'Outlets',               type: 'number' },
      { key: 'share_pct', label: 'Share %',               type: 'number' },
    ],
    defaultX: 'bucket', defaultY: 'outlets' },
  { id: 'visit_frequency', label: 'Visit Frequency per Outlet',
    description: 'Outlets planned in the last 30 days, by number of visits.',
    fields: [
      { key: 'bucket',    label: 'Visits',   type: 'string' },
      { key: 'outlets',   label: 'Outlets',  type: 'number' },
      { key: 'share_pct', label: 'Share %',  type: 'number' },
    ],
    defaultX: 'bucket', defaultY: 'outlets' },
  { id: 'productive_trend', label: 'Productive Calls Trend',
    description: 'Weekly visits and productive visits over the last 8 weeks.',
    fields: [
      { key: 'week',              label: 'Week',              type: 'string' },
      { key: 'week_start',        label: 'Week starts',       type: 'string' },
      { key: 'visits',            label: 'Visits',            type: 'number' },
      { key: 'productive_visits', label: 'Productive visits', type: 'number' },
      { key: 'productive_pct',    label: 'Productive %',      type: 'number' },
    ],
    defaultX: 'week', defaultY: 'productive_pct' },
  { id: 'rep_basket', label: 'Order Value by Rep',
    description: 'Orders, revenue and average order value per rep, last 30 days.',
    fields: [
      { key: 'fe_name',         label: 'Rep',                     type: 'string' },
      { key: 'orders',          label: 'Orders',                  type: 'number' },
      { key: 'revenue_inr',     label: 'Revenue (₹)',             type: 'number' },
      { key: 'aov_inr',         label: 'AOV (₹)',                 type: 'number' },
      { key: 'active_days',     label: 'Days with orders',        type: 'number' },
      { key: 'orders_per_day',  label: 'Orders per day',          type: 'number' },
      { key: 'vs_team_aov_pct', label: 'AOV vs team average %',   type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'aov_inr' },
  { id: 'calls_per_day', label: 'Calls per Working Day',
    description: 'Visited calls per active day per rep, with the median of the reps shown.',
    fields: [
      { key: 'fe_name',       label: 'Rep',            type: 'string' },
      { key: 'visit_days',    label: 'Days visiting',  type: 'number' },
      { key: 'visits',        label: 'Visits',         type: 'number' },
      { key: 'calls_per_day', label: 'Calls per day',  type: 'number' },
      { key: 'team_median',   label: 'Median calls/day', type: 'number' },
      { key: 'vs_median',     label: 'vs median',      type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'calls_per_day' },
  { id: 'dwell_time', label: 'Time on Site',
    description: 'Average minutes between check-in and check-out per rep, last 14 days.',
    fields: [
      { key: 'fe_name',         label: 'Rep',                 type: 'string' },
      { key: 'timed_visits',    label: 'Timed visits',        type: 'number' },
      { key: 'avg_dwell_min',   label: 'Avg on site (min)',   type: 'number' },
      { key: 'avg_planned_min', label: 'Avg planned (min)',   type: 'number' },
      { key: 'under_2min_pct',  label: 'Under 2 min %',       type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'avg_dwell_min' },
  { id: 'visit_hours', label: 'Visits by Hour of Day',
    description: 'Visited calls by IST hour of check-in, last 14 days.',
    fields: [
      { key: 'hour_label', label: 'Hour',     type: 'string' },
      { key: 'hour',       label: 'Hour (0-23)', type: 'number' },
      { key: 'visits',     label: 'Visits',   type: 'number' },
      { key: 'share_pct',  label: 'Share %',  type: 'number' },
    ],
    defaultX: 'hour_label', defaultY: 'visits' },
  { id: 'travel_efficiency', label: 'Km per Visit',
    description: 'Route km, visits and km per visit per rep, last 14 days.',
    fields: [
      { key: 'fe_name',      label: 'Rep',          type: 'string' },
      { key: 'km_total',     label: 'Km total',     type: 'number' },
      { key: 'visits',       label: 'Visits',       type: 'number' },
      { key: 'km_per_visit', label: 'Km per visit', type: 'number' },
      { key: 'active_days',  label: 'Days visiting', type: 'number' },
      { key: 'km_per_day',   label: 'Km per day',   type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'km_per_visit' },
  { id: 'geo_exceptions', label: 'Check-ins Outside Geofence',
    description: 'Check-ins further from the outlet than its geofence, per rep, last 14 days.',
    fields: [
      { key: 'fe_name',          label: 'Rep',                type: 'string' },
      { key: 'checkins',         label: 'Check-ins',          type: 'number' },
      { key: 'outside_geofence', label: 'Outside geofence',   type: 'number' },
      { key: 'outside_pct',      label: 'Outside %',          type: 'number' },
      { key: 'max_distance_m',   label: 'Furthest (m)',       type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'outside_geofence' },
  { id: 'attendance_hours', label: 'Hours Worked & Check-in Time',
    description: 'Days present, average hours and average check-in time per rep, last 30 days.',
    fields: [
      { key: 'fe_name',          label: 'Rep',                     type: 'string' },
      { key: 'days_present',     label: 'Days present',            type: 'number' },
      { key: 'avg_hours',        label: 'Avg hours / day',         type: 'number' },
      { key: 'avg_checkin_time', label: 'Avg check-in (IST)',      type: 'string' },
      { key: 'avg_checkin_min',  label: 'Avg check-in (min after midnight)', type: 'number' },
      { key: 'missed_checkouts', label: 'Days with no check-out',  type: 'number' },
    ],
    defaultX: 'fe_name', defaultY: 'avg_hours' },
  { id: 'outlet_churn', label: 'Outlets: Retained, New, Lapsed',
    description: 'Outlets by ordering pattern, last 30 days vs the 30 days before.',
    fields: [
      { key: 'segment',               label: 'Segment',                   type: 'string' },
      { key: 'outlets',               label: 'Outlets',                   type: 'number' },
      { key: 'revenue_last_30d_inr',  label: 'Revenue, last 30 days (₹)', type: 'number' },
      { key: 'revenue_prior_30d_inr', label: 'Revenue, prior 30 days (₹)', type: 'number' },
    ],
    defaultX: 'segment', defaultY: 'outlets' },
];

export const ffmDatasetById = (id: string): FfmCustomDataset | undefined =>
  FFM_CUSTOM_DATASETS.find(d => d.id === id);

// Dispatch a dataset id → the underlying row array. Dataset ids match
// FfmWidgetType strings, so this also serves as the fetch helper for the
// preset widgets — keeping a single source of truth.
export async function fetchFfmDataset(id: string): Promise<unknown[]> {
  return enrichFfmRows(id, await fetchRaw(id));
}

const rows = (r: { data?: unknown } | undefined): unknown[] => ((r?.data as unknown as unknown[]) ?? []);

async function fetchRaw(id: string): Promise<unknown[]> {
  switch (id) {
    case 'beat_adherence':      return rows(await ffmAnalytics.beatAdherence());
    case 'outlet_coverage':     return rows(await ffmAnalytics.outletCoverage());
    case 'frequency':           return rows(await ffmAnalytics.frequency());
    case 'productive_calls':    return rows(await ffmAnalytics.productiveCalls());
    case 'strike_rate':         return rows(await ffmAnalytics.strikeRate());
    case 'aov':                 return rows(await ffmAnalytics.aov());
    case 'new_outlets':         return rows(await ffmAnalytics.newOutlets());
    case 'visit_duration':      return rows(await ffmAnalytics.visitDuration());
    case 'idle_heatmap':        return rows(await ffmAnalytics.idleHeatmap());
    case 'distance':            return rows(await ffmAnalytics.distance());
    case 'off_route':           return rows(await ffmAnalytics.offRoute());
    case 'punctuality':         return rows(await ffmAnalytics.punctuality());
    case 'stuck_fes':           return rows(await ffmAnalytics.stuckFes());
    case 'security_violations': return rows(await ffmAnalytics.securityViolations());
    case 'form_completion':     return rows(await ffmAnalytics.formCompletion());
    case 'top_performers':      return rows(await ffmAnalytics.topPerformers());
    case 'beat_adherence_trend':return rows(await ffmAnalytics.beatAdherenceTrend());
    case 'outlet_recency':      return rows(await ffmAnalytics.outletRecency());
    case 'visit_frequency':     return rows(await ffmAnalytics.visitFrequency());
    case 'productive_trend':    return rows(await ffmAnalytics.productiveTrend());
    case 'rep_basket':          return rows(await ffmAnalytics.repBasket());
    case 'calls_per_day':       return rows(await ffmAnalytics.callsPerDay());
    case 'dwell_time':          return rows(await ffmAnalytics.dwellTime());
    case 'visit_hours':         return rows(await ffmAnalytics.visitHours());
    case 'travel_efficiency':   return rows(await ffmAnalytics.travelEfficiency());
    case 'geo_exceptions':      return rows(await ffmAnalytics.geoExceptions());
    case 'attendance_hours':    return rows(await ffmAnalytics.attendanceHours());
    case 'outlet_churn':        return rows(await ffmAnalytics.outletChurn());
    default: throw new Error(`Unknown FFM dataset: ${id}`);
  }
}
