/**
 * API client for the 15 extended analytics endpoints + the per-user
 * dashboard-layout CRUD. Mirrors the shape of crmApi.ts.
 *
 * All endpoints sit under /api/v1/crm/analytics/* and /api/v1/crm/dashboard-layouts/*.
 * The legacy crmAnalytics namespace in crmApi.ts stays untouched.
 */
import api from './api';

type Wrapped<T> = { success: boolean; data: T };
export interface DateRangeParams { from?: string; to?: string }

function qs(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return '';
  const filtered = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)] as [string, string]);
  if (!filtered.length) return '';
  return '?' + new URLSearchParams(Object.fromEntries(filtered)).toString();
}

const BASE = '/api/v1/crm/analytics';
const LAYOUT_BASE = '/api/v1/crm/dashboard-layouts';

// ── Response types ───────────────────────────────────────────

export interface LeadVelocityPoint {
  month: string;
  total: number;
  qualified: number;
  mom_growth_pct: number | null;
}

export interface TimeToFirstTouch {
  avg_minutes: number;
  median_minutes: number;
  sla_breach_pct: number;
  total: number;
  breaches: number;
  sla_minutes: number;
  distribution: Array<{ bucket: string; count: number }>;
}

export interface StuckLeads {
  count_7d: number;
  count_14d: number;
  count_30d: number;
  top_owners: Array<{ owner_id: string; count: number }>;
}

export interface ReasonCount { reason: string; count: number }

export interface StageConversionRow {
  from_stage: string;
  to_stage: string;
  entered: number;
  advanced: number;
  rate: number;
}

export interface BucketCount { bucket: string; count: number }

export interface CohortRow {
  cohort_month: string;
  total: number;
  cells: Array<{ age_months: number; converted: number; rate: number }>;
}

export interface EngagementComparison {
  won: { avg: number; count: number };
  lost: { avg: number; count: number };
}

export interface ScoreBandRow {
  band: string;
  total: number;
  converted: number;
  rate: number;
}

export interface TerritoryRow {
  territory: string;
  total: number;
  converted: number;
  rate: number;
}

export interface LeadAtRisk {
  lead_id: string;
  name: string;
  score: number;
  owner_id: string | null;
  days_idle: number;
}

// ── Endpoints ────────────────────────────────────────────────

export const crmAnalyticsExt = {
  leadVelocity: (months = 6) =>
    api.get<Wrapped<LeadVelocityPoint[]>>(`${BASE}/lead-velocity${qs({ months })}`),

  timeToFirstTouch: (range?: DateRangeParams, sla_minutes = 60) =>
    api.get<Wrapped<TimeToFirstTouch>>(`${BASE}/time-to-first-touch${qs({ ...range, sla_minutes })}`),

  stuckLeads: () => api.get<Wrapped<StuckLeads>>(`${BASE}/stuck-leads`),

  lostReasons: (range?: DateRangeParams) =>
    api.get<Wrapped<ReasonCount[]>>(`${BASE}/lost-reasons${qs(range)}`),

  wonReasons: (range?: DateRangeParams) =>
    api.get<Wrapped<ReasonCount[]>>(`${BASE}/won-reasons${qs(range)}`),

  disqualificationReasons: (range?: DateRangeParams) =>
    api.get<Wrapped<ReasonCount[]>>(`${BASE}/disqualification-reasons${qs(range)}`),

  stageConversion: (pipeline_id?: string) =>
    api.get<Wrapped<StageConversionRow[]>>(`${BASE}/stage-conversion${qs({ pipeline_id })}`),

  leadAging: () => api.get<Wrapped<BucketCount[]>>(`${BASE}/lead-aging`),

  cohortConversion: (months = 6) =>
    api.get<Wrapped<CohortRow[]>>(`${BASE}/cohort-conversion${qs({ months })}`),

  engagementComparison: (range?: DateRangeParams) =>
    api.get<Wrapped<EngagementComparison>>(`${BASE}/engagement-comparison${qs(range)}`),

  daysSinceTouch: () => api.get<Wrapped<BucketCount[]>>(`${BASE}/days-since-touch`),

  scoreBandConversion: (range?: DateRangeParams) =>
    api.get<Wrapped<ScoreBandRow[]>>(`${BASE}/score-band-conversion${qs(range)}`),

  territoryConversion: (range?: DateRangeParams) =>
    api.get<Wrapped<TerritoryRow[]>>(`${BASE}/territory-conversion${qs(range)}`),

  touchpointsToResponse: (range?: DateRangeParams) =>
    api.get<Wrapped<BucketCount[]>>(`${BASE}/touchpoints-to-response${qs(range)}`),

  leadsAtRisk: (score = 60, idle_days = 14) =>
    api.get<Wrapped<LeadAtRisk[]>>(`${BASE}/leads-at-risk${qs({ score, idle_days })}`),
};

// ── Dashboard layout CRUD ────────────────────────────────────

export interface GridItem { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number }
export interface WidgetInstance {
  id: string;
  widget_type: string;
  chart_type: string;
  config?: Record<string, unknown>;
}
export interface DashboardConfig {
  widgets: WidgetInstance[];
  layouts: { lg?: GridItem[]; md?: GridItem[]; sm?: GridItem[] };
}

export type LayoutPage = 'analytics' | 'overview';

export const crmDashboardLayouts = {
  get: (page: LayoutPage) =>
    api.get<Wrapped<DashboardConfig>>(`${LAYOUT_BASE}/${page}`),
  save: (page: LayoutPage, config: DashboardConfig) =>
    api.put<Wrapped<DashboardConfig>>(`${LAYOUT_BASE}/${page}`, config),
  pinToOverview: (widget: WidgetInstance) =>
    api.post<Wrapped<DashboardConfig>>(`${LAYOUT_BASE}/overview/pin`, widget),
  removeWidget: (page: LayoutPage, widget_id: string) =>
    api.delete<Wrapped<DashboardConfig>>(`${LAYOUT_BASE}/${page}/widgets/${widget_id}`),
};
