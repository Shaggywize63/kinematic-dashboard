/**
 * Response types + defensive normalisers for the Lead Management "plus"
 * widgets and reports. Pure (no network, no React): the API client in
 * crmAnalyticsExtApi.ts re-exports everything here, and the unit tests import
 * this file directly.
 *
 * One endpoint feeds both a Lead Analytics widget and its report page, so the
 * numbers on a tile and on the report always agree. Every response is read
 * defensively: a demo tenant or an older backend that answers with an empty
 * list must render the "no data" state, not crash.
 */

export interface SourcePerformanceRow {
  source_id: string | null; source: string; leads: number; qualified: number; converted: number; lost: number; unqualified: number; open: number;
  qualified_pct: number | null; conversion_pct: number | null; share_of_leads_pct: number | null; avg_days_to_convert: number | null; avg_score: number | null;
  won_value: number; revenue_per_lead: number | null; cost_per_lead: number; total_cost: number; cost_per_converted: number | null;
}
export interface SourcePerformance { rows: SourcePerformanceRow[]; totals: SourcePerformanceRow; from?: string; to?: string }

export interface FollowupRow {
  owner_id: string | null; owner: string; due: number; on_time: number; late: number; overdue: number; upcoming: number; done_untimed: number;
  compliance_pct: number | null; avg_days_late: number | null; avg_days_overdue: number | null;
}
export interface FollowupTrendPoint { week: string; due: number; on_time: number; late: number; overdue: number; upcoming: number; compliance_pct: number | null }
export interface FollowupCompliance { rows: FollowupRow[]; totals: FollowupRow; trend: FollowupTrendPoint[]; from?: string; to?: string }

export interface WorkloadRow {
  owner_id: string | null; owner: string; open_leads: number; share_of_open_pct: number | null; new_leads: number; never_touched: number;
  idle_7d: number; idle_14d: number; idle_30d: number; avg_open_age_days: number | null; overdue_followups: number;
  first_touch_leads: number; median_first_touch_minutes: number | null; sla_breach_pct: number | null;
}
export interface OwnerWorkload { rows: WorkloadRow[]; totals: WorkloadRow; sla_minutes: number; from?: string; to?: string }

export interface StageVelocityRow {
  stage_id: string; stage: string; position: number; stage_type: string; deals_entered: number; completed_stays: number;
  avg_days: number | null; median_days: number | null; max_days: number | null; current_deals: number; current_value: number;
  avg_current_age_days: number | null; slow_current_deals: number;
}
export interface StageVelocity {
  pipeline_id: string | null; pipelines: Array<{ id: string; name: string; is_default?: boolean }>; rows: StageVelocityRow[];
  totals: { open_deals: number; open_value: number; typical_days_through_open_stages: number | null };
}

export interface ActivityMixRow {
  owner_id: string | null; owner: string; total: number; calls: number; emails: number; meetings: number; site_visits: number; tasks: number; notes: number;
  messages: number; other: number; completed: number; completion_pct: number | null; calls_with_outcome: number; calls_connected: number;
  connect_rate_pct: number | null; active_days: number; avg_per_active_day: number | null;
}
export interface ActivityMix {
  rows: ActivityMixRow[]; totals: ActivityMixRow; by_type: Array<{ type: string; count: number }>;
  by_week: Array<{ week: string; total: number; calls: number; completed: number }>; from?: string; to?: string;
}

export interface ConversionTimeGroup { key: string; label: string; converted: number; avg_days: number | null; median_days: number | null }
export interface ConversionTime {
  totals: { converted: number; avg_days: number | null; median_days: number | null; p90_days: number | null; fastest_days: number | null; slowest_days: number | null };
  buckets: Array<{ bucket: string; count: number }>; by_owner: ConversionTimeGroup[]; by_source: ConversionTimeGroup[]; by_month: ConversionTimeGroup[];
  from?: string; to?: string;
}

export interface WeightedPipelineRow { stage_id: string; stage: string; position: number; deals: number; value: number; weighted_value: number; avg_deal_size: number | null; avg_age_days: number | null; past_close_date: number }
export interface WeightedPipeline {
  rows: WeightedPipelineRow[];
  totals: { deals: number; value: number; weighted_value: number; weighted_pct_of_value: number | null; past_close_date: number; past_close_value: number };
}

export interface DealSizeRow { bucket: string; deals: number; won: number; lost: number; open: number; value: number; win_rate_pct: number | null }
export interface DealSizeDistribution {
  rows: DealSizeRow[];
  totals: { deals: number; with_amount: number; avg_amount: number | null; median_amount: number | null; largest_amount: number | null };
  from?: string; to?: string;
}

export interface WinRateTrendRow { month: string; won: number; lost: number; closed: number; win_rate_pct: number | null; won_value: number; lost_value: number }
export interface WinRateTrend { rows: WinRateTrendRow[]; totals: { won: number; lost: number; closed: number; win_rate_pct: number | null }; months: number }

export interface CallTrendRow { week: string; calls: number; with_outcome: number; connected: number; connect_rate_pct: number | null }
export interface CallConnectTrend { rows: CallTrendRow[]; totals: { calls: number; with_outcome: number; connected: number; connect_rate_pct: number | null }; weeks: number }

export interface RecyclingRow { month: string; moved_to_lost: number; reopened: number }
export interface LeadRecycling { rows: RecyclingRow[]; totals: { moved_to_lost: number; reopened: number; distinct_leads_reopened: number; converted_after_reopen: number }; months: number }

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = <T extends object>(v: unknown, fallback: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? { ...fallback, ...(v as T) } : fallback);

const ZERO_SOURCE: SourcePerformanceRow = { source_id: null, source: 'All sources', leads: 0, qualified: 0, converted: 0, lost: 0, unqualified: 0, open: 0, qualified_pct: null, conversion_pct: null, share_of_leads_pct: null, avg_days_to_convert: null, avg_score: null, won_value: 0, revenue_per_lead: null, cost_per_lead: 0, total_cost: 0, cost_per_converted: null };
const ZERO_FOLLOWUP: FollowupRow = { owner_id: null, owner: 'Everyone', due: 0, on_time: 0, late: 0, overdue: 0, upcoming: 0, done_untimed: 0, compliance_pct: null, avg_days_late: null, avg_days_overdue: null };
const ZERO_WORKLOAD: WorkloadRow = { owner_id: null, owner: 'Everyone', open_leads: 0, share_of_open_pct: null, new_leads: 0, never_touched: 0, idle_7d: 0, idle_14d: 0, idle_30d: 0, avg_open_age_days: null, overdue_followups: 0, first_touch_leads: 0, median_first_touch_minutes: null, sla_breach_pct: null };
const ZERO_MIX: ActivityMixRow = { owner_id: null, owner: 'Everyone', total: 0, calls: 0, emails: 0, meetings: 0, site_visits: 0, tasks: 0, notes: 0, messages: 0, other: 0, completed: 0, completion_pct: null, calls_with_outcome: 0, calls_connected: 0, connect_rate_pct: null, active_days: 0, avg_per_active_day: null };

export const normaliseSourcePerformance = (d: unknown): SourcePerformance => {
  const o = (d ?? {}) as Partial<SourcePerformance>;
  return { rows: arr<SourcePerformanceRow>(o.rows), totals: obj(o.totals, ZERO_SOURCE), from: o.from, to: o.to };
};
export const normaliseFollowup = (d: unknown): FollowupCompliance => {
  const o = (d ?? {}) as Partial<FollowupCompliance>;
  return { rows: arr<FollowupRow>(o.rows), totals: obj(o.totals, ZERO_FOLLOWUP), trend: arr<FollowupTrendPoint>(o.trend), from: o.from, to: o.to };
};
export const normaliseWorkload = (d: unknown): OwnerWorkload => {
  const o = (d ?? {}) as Partial<OwnerWorkload>;
  return { rows: arr<WorkloadRow>(o.rows), totals: obj(o.totals, ZERO_WORKLOAD), sla_minutes: typeof o.sla_minutes === 'number' ? o.sla_minutes : 60, from: o.from, to: o.to };
};
export const normaliseStageVelocity = (d: unknown): StageVelocity => {
  const o = (d ?? {}) as Partial<StageVelocity>;
  return {
    pipeline_id: o.pipeline_id ?? null, pipelines: arr(o.pipelines), rows: arr<StageVelocityRow>(o.rows),
    totals: obj(o.totals, { open_deals: 0, open_value: 0, typical_days_through_open_stages: null }),
  };
};
export const normaliseActivityMix = (d: unknown): ActivityMix => {
  const o = (d ?? {}) as Partial<ActivityMix>;
  return { rows: arr<ActivityMixRow>(o.rows), totals: obj(o.totals, ZERO_MIX), by_type: arr(o.by_type), by_week: arr(o.by_week), from: o.from, to: o.to };
};
export const normaliseConversionTime = (d: unknown): ConversionTime => {
  const o = (d ?? {}) as Partial<ConversionTime>;
  return {
    totals: obj(o.totals, { converted: 0, avg_days: null, median_days: null, p90_days: null, fastest_days: null, slowest_days: null }),
    buckets: arr(o.buckets), by_owner: arr(o.by_owner), by_source: arr(o.by_source), by_month: arr(o.by_month), from: o.from, to: o.to,
  };
};
export const normaliseWeightedPipeline = (d: unknown): WeightedPipeline => {
  const o = (d ?? {}) as Partial<WeightedPipeline>;
  return { rows: arr(o.rows), totals: obj(o.totals, { deals: 0, value: 0, weighted_value: 0, weighted_pct_of_value: null, past_close_date: 0, past_close_value: 0 }) };
};
export const normaliseDealSize = (d: unknown): DealSizeDistribution => {
  const o = (d ?? {}) as Partial<DealSizeDistribution>;
  return { rows: arr(o.rows), totals: obj(o.totals, { deals: 0, with_amount: 0, avg_amount: null, median_amount: null, largest_amount: null }), from: o.from, to: o.to };
};
export const normaliseWinRateTrend = (d: unknown): WinRateTrend => {
  const o = (d ?? {}) as Partial<WinRateTrend>;
  return { rows: arr(o.rows), totals: obj(o.totals, { won: 0, lost: 0, closed: 0, win_rate_pct: null }), months: o.months ?? 6 };
};
export const normaliseCallTrend = (d: unknown): CallConnectTrend => {
  const o = (d ?? {}) as Partial<CallConnectTrend>;
  return { rows: arr(o.rows), totals: obj(o.totals, { calls: 0, with_outcome: 0, connected: 0, connect_rate_pct: null }), weeks: o.weeks ?? 8 };
};
export const normaliseRecycling = (d: unknown): LeadRecycling => {
  const o = (d ?? {}) as Partial<LeadRecycling>;
  return { rows: arr(o.rows), totals: obj(o.totals, { moved_to_lost: 0, reopened: 0, distinct_leads_reopened: 0, converted_after_reopen: 0 }), months: o.months ?? 6 };
};

