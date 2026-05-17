/**
 * Field Force Management analytics — widget catalog + API client + datasets.
 *
 * Mirrors the structure of CRM lead analytics (src/lib/crm/widgetCatalog.ts +
 * crmAnalyticsExtApi.ts) but for the field-force surface: beat adherence,
 * outlet coverage, productive calls, AOV, new outlets, visit duration, etc.
 *
 * 16 preset widgets — no custom-chart builder on FFM yet (deferred to v2).
 * The chart-type switcher per widget is still wired so users can flip
 * Bar → Line → Donut etc. without rebuilding.
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
