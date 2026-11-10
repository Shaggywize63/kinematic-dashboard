/**
 * API client for the extended analytics endpoints (the original 15 widgets plus
 * the Lead Management "plus" widgets / reports) + the per-user dashboard-layout
 * CRUD. Mirrors the shape of crmApi.ts.
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

export interface LeadVelocityPoint { month: string; total: number; qualified: number; mom_growth_pct: number | null }
export interface TimeToFirstTouch { avg_minutes: number; median_minutes: number; sla_breach_pct: number; total: number; breaches: number; sla_minutes: number; distribution: Array<{ bucket: string; count: number }> }
export interface StuckLeads { count_7d: number; count_14d: number; count_30d: number; top_owners: Array<{ owner_id: string; count: number }> }
export interface ReasonCount { reason: string; count: number }
export interface StageConversionRow { from_stage: string; to_stage: string; entered: number; advanced: number; rate: number }
export interface BucketCount { bucket: string; count: number }
export interface CohortRow { cohort_month: string; total: number; cells: Array<{ age_months: number; converted: number; rate: number }> }
export interface EngagementComparison { won: { avg: number; count: number }; lost: { avg: number; count: number } }
export interface ScoreBandRow { band: string; total: number; converted: number; rate: number }
export interface TerritoryRow { territory: string; total: number; converted: number; rate: number }
export interface LeadAtRisk { lead_id: string; name: string; score: number; owner_id: string | null; days_idle: number }

// ── Market Intelligence (competitor/market signals mined from lead updates) ──
export interface IntelCompetitorShare { competitor_key: string; competitor: string; mentions: number; we_winning: number; we_losing: number; lose_rate_pct: number }
export interface IntelCompetitorPrice { competitor_key: string; competitor: string; avg_price_delta: number; samples: number }
export interface IntelSignalBreakdown { signal_type: string; count: number }
export interface IntelByCity { city: string; mentions: number; we_winning: number; we_losing: number }
export interface IntelTrendPoint { month: string; mentions: number; we_losing: number }
export interface IntelSignal { id: string; created_at: string; signal_type: string; competitor_name: string | null; stance: string | null; price_delta: number | null; city: string | null; body: string; lead_id: string | null }

// ── Endpoints ────────────────────────────────────────────────

export const crmAnalyticsExt = {
  leadVelocity: (months = 6) => api.get<Wrapped<LeadVelocityPoint[]>>(`${BASE}/lead-velocity${qs({ months })}`),
  timeToFirstTouch: (range?: DateRangeParams, sla_minutes = 60) => api.get<Wrapped<TimeToFirstTouch>>(`${BASE}/time-to-first-touch${qs({ ...range, sla_minutes })}`),
  stuckLeads: () => api.get<Wrapped<StuckLeads>>(`${BASE}/stuck-leads`),
  lostReasons: (range?: DateRangeParams) => api.get<Wrapped<ReasonCount[]>>(`${BASE}/lost-reasons${qs({ ...range })}`),
  wonReasons: (range?: DateRangeParams) => api.get<Wrapped<ReasonCount[]>>(`${BASE}/won-reasons${qs({ ...range })}`),
  disqualificationReasons: (range?: DateRangeParams) => api.get<Wrapped<ReasonCount[]>>(`${BASE}/disqualification-reasons${qs({ ...range })}`),
  stageConversion: (pipeline_id?: string) => api.get<Wrapped<StageConversionRow[]>>(`${BASE}/stage-conversion${qs({ pipeline_id })}`),
  leadAging: () => api.get<Wrapped<BucketCount[]>>(`${BASE}/lead-aging`),
  cohortConversion: (months = 6) => api.get<Wrapped<CohortRow[]>>(`${BASE}/cohort-conversion${qs({ months })}`),
  engagementComparison: (range?: DateRangeParams) => api.get<Wrapped<EngagementComparison>>(`${BASE}/engagement-comparison${qs({ ...range })}`),
  daysSinceTouch: () => api.get<Wrapped<BucketCount[]>>(`${BASE}/days-since-touch`),
  scoreBandConversion: (range?: DateRangeParams) => api.get<Wrapped<ScoreBandRow[]>>(`${BASE}/score-band-conversion${qs({ ...range })}`),
  territoryConversion: (range?: DateRangeParams) => api.get<Wrapped<TerritoryRow[]>>(`${BASE}/territory-conversion${qs({ ...range })}`),
  touchpointsToResponse: (range?: DateRangeParams) => api.get<Wrapped<BucketCount[]>>(`${BASE}/touchpoints-to-response${qs({ ...range })}`),
  leadsAtRisk: (score = 60, idle_days = 14) => api.get<Wrapped<LeadAtRisk[]>>(`${BASE}/leads-at-risk${qs({ score, idle_days })}`),
};

// Market Intelligence endpoints. City is auto-appended by api.ts (the path is
// under /crm/analytics, which is city-aware), so callers only pass the range.
export const crmMarketIntel = {
  competitorShare: (range?: DateRangeParams) => api.get<Wrapped<IntelCompetitorShare[]>>(`${BASE}/intel/competitor-share${qs({ ...range })}`),
  competitorPrice: (range?: DateRangeParams) => api.get<Wrapped<IntelCompetitorPrice[]>>(`${BASE}/intel/competitor-price${qs({ ...range })}`),
  signalBreakdown: (range?: DateRangeParams) => api.get<Wrapped<IntelSignalBreakdown[]>>(`${BASE}/intel/signal-breakdown${qs({ ...range })}`),
  byCity: (range?: DateRangeParams) => api.get<Wrapped<IntelByCity[]>>(`${BASE}/intel/by-city${qs({ ...range })}`),
  trend: (range?: DateRangeParams) => api.get<Wrapped<IntelTrendPoint[]>>(`${BASE}/intel/trend${qs({ ...range })}`),
  feed: (range?: DateRangeParams, limit = 50) => api.get<Wrapped<IntelSignal[]>>(`${BASE}/intel/feed${qs({ ...range, limit })}`),
};

// ── Lead Management "plus" widgets + reports ─────────────────
// Types + normalisers live in ./crm/crmPlusTypes (pure, unit-tested); the
// client below unwraps the `{ success, data }` envelope and normalises.
import {
  normaliseActivityMix, normaliseCallTrend, normaliseConversionTime, normaliseDealSize, normaliseFollowup, normaliseRecycling,
  normaliseSourcePerformance, normaliseStageVelocity, normaliseWeightedPipeline, normaliseWinRateTrend, normaliseWorkload,
} from './crm/crmPlusTypes';
export * from './crm/crmPlusTypes';

/** Each call resolves to the normalised payload directly (the `{success, data}` envelope is unwrapped here). */
const get = async <T,>(path: string, norm: (d: unknown) => T): Promise<T> => {
  const r = await api.get<Wrapped<unknown>>(path);
  return norm(r?.data);
};

export const crmAnalyticsPlus = {
  sourcePerformance: (range?: DateRangeParams) => get(`${BASE}/source-performance${qs({ ...range })}`, normaliseSourcePerformance),
  followupCompliance: (range?: DateRangeParams) => get(`${BASE}/followup-compliance${qs({ ...range })}`, normaliseFollowup),
  ownerWorkload: (range?: DateRangeParams, sla_minutes?: number) => get(`${BASE}/owner-workload${qs({ ...range, sla_minutes })}`, normaliseWorkload),
  stageVelocity: (pipeline_id?: string) => get(`${BASE}/stage-velocity${qs({ pipeline_id })}`, normaliseStageVelocity),
  activityMix: (range?: DateRangeParams) => get(`${BASE}/activity-mix${qs({ ...range })}`, normaliseActivityMix),
  conversionTime: (range?: DateRangeParams) => get(`${BASE}/conversion-time${qs({ ...range })}`, normaliseConversionTime),
  weightedPipeline: (pipeline_id?: string) => get(`${BASE}/weighted-pipeline${qs({ pipeline_id })}`, normaliseWeightedPipeline),
  dealSizeDistribution: (range?: DateRangeParams) => get(`${BASE}/deal-size-distribution${qs({ ...range })}`, normaliseDealSize),
  winRateTrend: (months = 6) => get(`${BASE}/win-rate-trend${qs({ months })}`, normaliseWinRateTrend),
  callConnectTrend: (weeks = 8) => get(`${BASE}/call-connect-trend${qs({ weeks })}`, normaliseCallTrend),
  leadRecycling: (months = 6) => get(`${BASE}/lead-recycling${qs({ months })}`, normaliseRecycling),
};

// ── Dashboard layout CRUD ────────────────────────────────────

export interface GridItem { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number }
export interface WidgetInstance { id: string; widget_type: string; chart_type: string; config?: Record<string, unknown> }
export interface DashboardConfig { widgets: WidgetInstance[]; layouts: { lg?: GridItem[]; md?: GridItem[]; sm?: GridItem[] } }
export type LayoutPage = 'analytics' | 'overview' | 'ffm';

/**
 * True when two layout maps are equal in the only fields that matter
 * (i/x/y/w/h per breakpoint), ignoring react-grid-layout's injected churn
 * (`moved`, `static`, `isDraggable`, …).
 *
 * This is the guard that breaks the RGL feedback loop that froze the dashboard:
 * `ResponsiveGridLayout` fires `onLayoutChange` with a fresh object on every
 * reconcile — including when nothing moved. Committing that to state churns the
 * config, the derived `layouts` prop gets a new reference, RGL reconciles again
 * and re-fires → an infinite render loop that locks the main thread ("page stops
 * responding"). It's independent of dataset size, which is why it reliably hit
 * the demo and any real account whose grid has widgets. Callers use this to skip
 * the state update when the layout is unchanged.
 */
type LayoutsShape = { lg?: GridItem[]; md?: GridItem[]; sm?: GridItem[] };
export function sameLayouts(a?: LayoutsShape | null, b?: LayoutsShape | null): boolean {
  const breakpoints = ['lg', 'md', 'sm'] as const;
  for (const bp of breakpoints) {
    const ax = a?.[bp];
    const bx = b?.[bp];
    if (!ax || !bx) {
      if (Boolean(ax) !== Boolean(bx)) return false; // one has the breakpoint, the other doesn't
      continue;
    }
    if (ax.length !== bx.length) return false;
    const byId = new Map(ax.map((it) => [it.i, it]));
    for (const it of bx) {
      const o = byId.get(it.i);
      if (!o || o.x !== it.x || o.y !== it.y || o.w !== it.w || o.h !== it.h) return false;
    }
  }
  return true;
}

export const crmDashboardLayouts = {
  get: (page: LayoutPage) => api.get<Wrapped<DashboardConfig>>(`${LAYOUT_BASE}/${page}`),
  save: (page: LayoutPage, config: DashboardConfig) => api.put<Wrapped<DashboardConfig>>(`${LAYOUT_BASE}/${page}`, config),
  pinToOverview: (widget: WidgetInstance) => api.post<Wrapped<DashboardConfig>>(`${LAYOUT_BASE}/overview/pin`, widget),
  removeWidget: (page: LayoutPage, widget_id: string) => api.delete<Wrapped<DashboardConfig>>(`${LAYOUT_BASE}/${page}/widgets/${widget_id}`),
};
