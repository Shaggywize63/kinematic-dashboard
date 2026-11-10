/**
 * Typed client for the FFM report endpoints (backend: ffm-analytics-plus.controller.ts,
 * mounted at /api/v1/analytics/ffm/reports/*). Every call takes an inclusive IST date
 * range (YYYY-MM-DD, at most 62 days) plus the endpoint's own filters, and is sent
 * with noCache so a changed filter or a fresh day never reads a stale answer.
 */
import api from '../../../lib/api';

type Wrapped<T> = { success: boolean; data: T };
const BASE = '/api/v1/analytics/ffm/reports';

export interface RangeParams { from?: string; to?: string }

function qs(p: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}
const get = <T,>(path: string, p: Record<string, string | number | null | undefined>) =>
  api.get<Wrapped<T>>(`${BASE}${path}${qs(p)}`, { noCache: true } as RequestInit);

export interface RepOption { id: string; name: string }

// ── rep activity ──────────────────────────────────────────────────────────
export interface RepActivityRow {
  fe_id: string; fe_name: string;
  planned_stops: number; visited_stops: number; missed_stops: number; adherence_pct: number;
  plan_days: number; active_days: number; zero_visit_days: number;
  productive_visits: number; productive_pct: number;
  orders: number; revenue_inr: number; aov_inr: number; order_days: number; orders_per_day: number;
  calls_per_day: number; km_total: number; km_per_visit: number; km_per_day: number;
  timed_visits: number; avg_dwell_min: number | null; avg_planned_min: number | null; under_2min_pct: number | null;
  onsite_hours: number; first_call_time: string | null; last_call_time: string | null; avg_span_hours: number | null;
  checkins: number; outside_geofence: number; outside_pct: number; max_distance_m: number;
  days_present: number; avg_hours: number | null; total_hours: number; avg_checkin_time: string | null; missed_checkouts: number;
}
export interface RepActivityPayload {
  from: string; to: string; reps_in_view: number; rows: RepActivityRow[];
  totals: {
    planned_stops: number; visited_stops: number; adherence_pct: number; productive_visits: number; productive_pct: number;
    orders: number; revenue_inr: number; aov_inr: number; km_total: number; km_per_visit: number;
  } | null;
  median: {
    calls_per_day: number | null; adherence_pct: number | null; productive_pct: number | null;
    aov_inr: number | null; avg_dwell_min: number | null; km_per_visit: number | null;
  } | null;
}

// ── beat compliance ───────────────────────────────────────────────────────
export interface BeatWeek { week: string; week_start: string; planned: number; visited: number; missed: number; adherence_pct: number; active_reps: number }
export interface BeatRep {
  fe_id: string; fe_name: string; plans: number; planned: number; visited: number; missed: number; adherence_pct: number;
  plan_days: number; zero_visit_days: number; by_week: Record<string, number | null>;
}
export interface BeatCompliancePayload {
  from: string; to: string; weeks: BeatWeek[]; reps: BeatRep[];
  totals: { planned: number; visited: number; missed: number; adherence_pct: number; plan_days: number; zero_visit_days: number } | null;
  median_adherence_pct: number | null; rep_options: RepOption[];
}

// ── time and travel ───────────────────────────────────────────────────────
export interface TimeTravelRow {
  fe_id: string; fe_name: string; active_days: number; km_total: number; km_per_day: number; visited_stops: number; km_per_visit: number;
  timed_visits: number; avg_dwell_min: number | null; onsite_hours: number; onsite_min: number;
  first_call_time: string | null; last_call_time: string | null; avg_span_hours: number | null;
  days_present: number; worked_hours: number; onsite_share_pct: number | null;
}
export interface TimeTravelPayload {
  from: string; to: string; rows: TimeTravelRow[];
  totals: { km_total: number; visited_stops: number; onsite_hours: number; worked_hours: number } | null;
  median: { km_per_visit: number | null; avg_dwell_min: number | null; avg_span_hours: number | null; onsite_share_pct: number | null } | null;
}

// ── outlet visit gaps ─────────────────────────────────────────────────────
export interface OutletGapRow {
  store_id: string; outlet_name: string; city: string | null; rep_id: string | null; rep_name: string | null;
  planned_calls: number; visited_calls: number; last_visit_date: string | null; days_since_last_visit: number | null;
  last_order_date: string | null; orders: number; revenue_inr: number;
}
export interface OutletGapsPayload {
  from: string; to: string; as_of: string; total: number; rows: OutletGapRow[];
  summary: { outlets: number; never_visited: number; visited: number; avg_days_since_last_visit: number | null } | null;
  rep_options: RepOption[];
}

// ── geo exceptions ────────────────────────────────────────────────────────
export interface GeoRow {
  fe_id: string; fe_name: string; outlet_name: string; beat: string; visited_at: string | null; day: string;
  distance_m: number; geofence_m: number; over_by_m: number;
}
export interface GeoSummaryRow {
  fe_id: string; fe_name: string; checkins: number; outside_geofence: number; outside_pct: number; max_distance_m: number;
  mock_location: number; vpn_detected: number; suspect_pings: number;
}
export interface GeoPayload { from: string; to: string; total: number; rows: GeoRow[]; summary: GeoSummaryRow[]; rep_options: RepOption[] }

// ── supervisor teams ──────────────────────────────────────────────────────
export interface SupervisorRow {
  supervisor_id: string | null; supervisor_name: string; reps: number; active_reps: number;
  planned_stops: number; visited_stops: number; adherence_pct: number; productive_visits: number; productive_pct: number;
  active_rep_days: number; calls_per_rep_day: number; orders: number; revenue_inr: number; revenue_per_rep_inr: number; days_present: number;
}
export interface SupervisorPayload {
  from: string; to: string; reps_in_view: number; rows: SupervisorRow[];
  median: { adherence_pct: number | null; productive_pct: number | null; calls_per_rep_day: number | null; revenue_per_rep_inr: number | null } | null;
}

// ── extras for existing reports ───────────────────────────────────────────
export interface AttendanceExtraRow {
  user_id: string; days_present: number; avg_checkin_time: string | null; avg_checkin_min: number | null;
  avg_checkout_time: string | null; avg_checkout_min: number | null; total_hours: number; hours_days: number;
  avg_hours: number | null; missed_checkouts: number; regularised_days: number;
}
export interface AttendanceExtrasPayload { from: string; to: string; rows: AttendanceExtraRow[]; median: { avg_hours: number | null; avg_checkin_min: number | null } | null }

export interface VisitCoveragePayload {
  from?: string; to?: string; universe: number; covered: number; coverage_pct: number; never_visited?: number;
  by_city?: Array<{ city: string; universe: number; covered: number }>;
  by_rep?: Array<{ fe_id: string; fe_name: string; universe: number; covered: number; gap: number; coverage_pct: number }>;
}

export const ffmReports = {
  repActivity: (p: RangeParams) => get<RepActivityPayload>('/rep-activity', { from: p.from, to: p.to }),
  beatCompliance: (p: RangeParams & { user_id?: string }) => get<BeatCompliancePayload>('/beat-compliance', { from: p.from, to: p.to, user_id: p.user_id }),
  timeAndTravel: (p: RangeParams) => get<TimeTravelPayload>('/time-and-travel', { from: p.from, to: p.to }),
  outletVisitGaps: (p: RangeParams & { user_id?: string; min_days?: number; limit?: number }) =>
    get<OutletGapsPayload>('/outlet-visit-gaps', { from: p.from, to: p.to, user_id: p.user_id, min_days: p.min_days || undefined, limit: p.limit }),
  geoExceptions: (p: RangeParams & { user_id?: string; min_distance_m?: number }) =>
    get<GeoPayload>('/geo-exceptions', { from: p.from, to: p.to, user_id: p.user_id, min_distance_m: p.min_distance_m || undefined }),
  supervisorTeams: (p: RangeParams) => get<SupervisorPayload>('/supervisor-teams', { from: p.from, to: p.to }),
  attendanceExtras: (p: RangeParams) => get<AttendanceExtrasPayload>('/attendance-extras', { from: p.from, to: p.to }),
  visitCoverage: (p: RangeParams) => get<VisitCoveragePayload>('/visit-coverage', { from: p.from, to: p.to }),
};
