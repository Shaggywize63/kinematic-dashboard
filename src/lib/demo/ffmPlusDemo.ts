/**
 * Demo-tenant answers for the added FFM analytics widgets and report endpoints
 * (GET /analytics/ffm/<widget> and /analytics/ffm/reports/<report>).
 *
 * Registered with one line in demoMocks.ts. Deterministic (index-based, no Math.random) so a
 * demo walkthrough and the e2e specs always see the same figures, and consistent with the real
 * endpoints' row shapes and arithmetic: ratios are derived from the counts beside them, a report's
 * totals are the sum of its rows, and the date range / rep / distance filters really filter.
 * Reps come from the demo team (ids fe1, fe2 … as the attendance mocks use) so a rep is one person everywhere.
 */

type Row = Record<string, unknown>;
interface DemoUser { id: string; name: string; role?: string }
export interface FfmPlusDemoCtx { outletCoverage?: { data?: Row } | null; users?: DemoUser[] | null }

const FALLBACK_REPS: DemoUser[] = [
  { id: 'fe1', name: 'Arjun Sharma' }, { id: 'fe2', name: 'Priya Patel' }, { id: 'fe3', name: 'Rahul Verma' }, { id: 'fe4', name: 'Sneha Rao' },
  { id: 'fe5', name: 'Vikram Reddy' }, { id: 'fe6', name: 'Anjali Singh' }, { id: 'fe7', name: 'Kavita Rao' }, { id: 'fe8', name: 'Manish Iyer' },
];
const SUPERVISORS = [{ id: 'sup1', name: 'Meera Nair' }, { id: 'sup2', name: 'Ravi Menon' }, { id: 'sup3', name: 'Neha Kapoor' }];
const OUTLET_NAMES = [
  'Shree Krishna Stores', 'Bansal Provision', 'Saraswati Kirana', 'MK Modern Grocers', 'Annapurna Foods', 'Lakshmi Traders',
  'Gupta General Store', 'Sai Supermart', 'Balaji Wholesale', 'Om Sai Provision', 'Metro Mart', 'New India Stores',
];
const CITIES = ['Bangalore', 'Mumbai', 'Delhi', 'Chennai', 'Pune', 'Hyderabad'];

const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (n: number, d: number) => (d > 0 ? r1((n / d) * 100) : 0);
const wrap = (data: unknown) => ({ success: true, data });
const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysIn = (from: string, to: string) => Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;

function weekStart(ymd: string) { const d = new Date(`${ymd}T00:00:00Z`); return addDays(ymd, -((d.getUTCDay() + 6) % 7)); }
function weekLabel(ymd: string) {
  const t = new Date(`${ymd}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
  const ft = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const wk = 1 + Math.round(((t.getTime() - ft.getTime()) / 86_400_000 - 3 + ((ft.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function roster(ctx?: FfmPlusDemoCtx): Array<DemoUser & { sup: { id: string; name: string } }> {
  const fromCtx = (ctx?.users || []).filter((u) => /executive|supervisor/i.test(u.role || '')).slice(0, 8);
  const base = fromCtx.length >= 3 ? fromCtx : FALLBACK_REPS;
  return base.map((u, i) => ({ ...u, sup: SUPERVISORS[i % SUPERVISORS.length] }));
}

/** One rep's activity for a window of `days` calendar days (about 6 in 7 are working days). */
function repRow(u: DemoUser & { sup: { id: string; name: string } }, i: number, days: number) {
  const work = Math.max(1, Math.round((days * 6) / 7));
  const activeDays = Math.max(1, work - (i % 3));
  const planned = work * (11 + (i % 4));
  const visited = Math.min(planned, Math.round(planned * (0.78 + (i % 5) * 0.04)));
  const productive = Math.round(visited * (0.5 + (i % 4) * 0.07));
  const orders = Math.round(productive * 1.1);
  const revenue = orders * (3200 + i * 260);
  const km = r1(activeDays * (34 + (i % 5) * 6));
  const timed = Math.round(visited * 0.7);
  const avgDwell = r1(14 + (i % 6) * 3.5);
  const checkins = Math.round(visited * 0.9);
  const outside = Math.round(checkins * ((i % 4) * 0.03));
  const presentDays = Math.min(work, activeDays + 1);
  const avgHours = r1(7.2 + (i % 5) * 0.4);
  const first = 540 + (i % 4) * 12;
  const last = 1020 - (i % 3) * 20;
  return {
    fe_id: u.id, fe_name: u.name, supervisor_id: u.sup.id,
    planned_stops: planned, visited_stops: visited, missed_stops: planned - visited, adherence_pct: pct(visited, planned),
    plan_days: work, active_days: activeDays, zero_visit_days: work - activeDays,
    productive_visits: productive, productive_pct: pct(productive, visited),
    orders, revenue_inr: revenue, aov_inr: orders ? Math.round(revenue / orders) : 0, order_days: Math.min(activeDays, orders), orders_per_day: r1(orders / Math.max(1, Math.min(activeDays, orders))),
    calls_per_day: r1(visited / activeDays), km_total: km, km_per_visit: visited ? r1(km / visited) : 0, km_per_day: r1(km / activeDays),
    timed_visits: timed, avg_dwell_min: avgDwell, avg_planned_min: 15, under_2min_pct: r1((i % 3) * 4), onsite_min: r1(timed * avgDwell), onsite_hours: r1((timed * avgDwell) / 60),
    first_call_min: first, first_call_time: hhmm(first), last_call_min: last - 60, last_call_time: hhmm(last - 60), avg_span_hours: r1((last - 60 - first) / 60),
    checkins, outside_geofence: outside, outside_pct: pct(outside, checkins), max_distance_m: outside ? 180 + i * 35 : 0,
    days_present: presentDays, avg_hours: avgHours, total_hours: r1(avgHours * presentDays), avg_checkin_time: hhmm(first - 15), missed_checkouts: i % 4 === 3 ? 1 : 0,
  };
}

const median = (xs: number[]) => { const a = xs.slice().sort((p, q) => p - q); if (!a.length) return null; const m = Math.floor(a.length / 2); return r1(a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2); };
type RepRow = ReturnType<typeof repRow>;
const sum = (rows: RepRow[], f: (r: RepRow) => number) => rows.reduce((s, r) => s + f(r), 0);

function range(query: URLSearchParams, defaultDays: number) {
  const today = istToday();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.get('from') || '') ? (query.get('from') as string) : addDays(today, -(defaultDays - 1));
  const toRaw = /^\d{4}-\d{2}-\d{2}$/.test(query.get('to') || '') ? (query.get('to') as string) : today;
  const to = toRaw > today ? today : toRaw;
  return { from, to, days: daysIn(from, to) };
}

/** `undefined` when the path is not one of the added FFM endpoints. */
export function matchFfmPlusDemo(path: string, query: URLSearchParams, ctx?: FfmPlusDemoCtx): { success: boolean; data: unknown } | undefined {
  const P = '/analytics/ffm/';
  if (!path.startsWith(P)) return undefined;
  const sub = path.slice(P.length);
  const reps = roster(ctx);
  const today = istToday();

  // ── widgets ─────────────────────────────────────────────────────────────
  const weeks8 = Array.from({ length: 8 }, (_, k) => addDays(weekStart(today), -7 * (7 - k)));
  switch (sub) {
    case 'beat-adherence-trend':
      return wrap(weeks8.map((ws, k) => {
        const planned = 640 + (k % 3) * 24 - (k === 7 ? 380 : 0);          // the latest week is week-to-date
        const visited = Math.round(planned * (0.74 + k * 0.015));
        return { week: weekLabel(ws), week_start: ws, planned, visited, missed: planned - visited, adherence_pct: pct(visited, planned), active_reps: reps.length };
      }));
    case 'outlet-recency': {
      const counts = [212, 96, 74, 58, 31, 24];
      const labels = ['0–7 days', '8–14 days', '15–30 days', '31–60 days', '61–90 days', 'Not visited'];
      const total = counts.reduce((s, c) => s + c, 0);
      return wrap(labels.map((b, i) => ({ bucket: b, outlets: counts[i], share_pct: pct(counts[i], total) })));
    }
    case 'visit-frequency': {
      const counts = [38, 112, 164, 96, 58];
      const labels = ['Not visited', '1 visit', '2 visits', '3 visits', '4+ visits'];
      const total = counts.reduce((s, c) => s + c, 0);
      return wrap(labels.map((b, i) => ({ bucket: b, outlets: counts[i], share_pct: pct(counts[i], total) })));
    }
    case 'productive-trend':
      return wrap(weeks8.map((ws, k) => {
        const visits = 480 + (k % 3) * 20 - (k === 7 ? 280 : 0);
        const productive = Math.round(visits * (0.52 + k * 0.012));
        return { week: weekLabel(ws), week_start: ws, visits, productive_visits: productive, productive_pct: pct(productive, visits) };
      }));
    case 'rep-basket': {
      const rows = reps.map((u, i) => repRow(u, i, 30));
      const teamAov = sum(rows, (r) => r.revenue_inr) / Math.max(1, sum(rows, (r) => r.orders));
      return wrap(rows.map((r) => ({
        fe_id: r.fe_id, fe_name: r.fe_name, orders: r.orders, revenue_inr: r.revenue_inr, aov_inr: r.aov_inr, active_days: r.order_days,
        orders_per_day: r.orders_per_day, vs_team_aov_pct: teamAov ? r1((r.aov_inr / teamAov - 1) * 100) : 0,
      })).sort((a, b) => b.revenue_inr - a.revenue_inr));
    }
    case 'calls-per-day': {
      const rows = reps.map((u, i) => repRow(u, i, 14));
      const m = median(rows.map((r) => r.calls_per_day)) ?? 0;
      return wrap(rows.map((r) => ({ fe_id: r.fe_id, fe_name: r.fe_name, visit_days: r.active_days, visits: r.visited_stops, calls_per_day: r.calls_per_day, team_median: m, vs_median: r1(r.calls_per_day - m) }))
        .sort((a, b) => b.calls_per_day - a.calls_per_day));
    }
    case 'dwell-time':
      return wrap(reps.map((u, i) => repRow(u, i, 14)).map((r) => ({
        fe_id: r.fe_id, fe_name: r.fe_name, timed_visits: r.timed_visits, avg_dwell_min: r.avg_dwell_min, avg_planned_min: r.avg_planned_min, under_2min_pct: r.under_2min_pct,
      })).sort((a, b) => b.avg_dwell_min - a.avg_dwell_min));
    case 'visit-hours': {
      const visits = [14, 58, 96, 88, 61, 47, 72, 80, 64, 38, 17];
      const total = visits.reduce((s, v) => s + v, 0);
      return wrap(visits.map((v, k) => ({ hour: 9 + k, hour_label: `${String(9 + k).padStart(2, '0')}:00`, visits: v, share_pct: pct(v, total) })));
    }
    case 'travel-efficiency':
      return wrap(reps.map((u, i) => repRow(u, i, 14)).map((r) => ({
        fe_id: r.fe_id, fe_name: r.fe_name, km_total: r.km_total, visits: r.visited_stops, km_per_visit: r.km_per_visit, active_days: r.active_days, km_per_day: r.km_per_day,
      })).sort((a, b) => b.km_total - a.km_total));
    case 'geo-exceptions':
      return wrap(reps.map((u, i) => repRow(u, i, 14)).map((r) => ({
        fe_id: r.fe_id, fe_name: r.fe_name, checkins: r.checkins, outside_geofence: r.outside_geofence, outside_pct: r.outside_pct, max_distance_m: r.max_distance_m,
      })).sort((a, b) => b.outside_geofence - a.outside_geofence || b.outside_pct - a.outside_pct));
    case 'attendance-hours':
      return wrap(reps.map((u, i) => repRow(u, i, 30)).map((r) => ({
        fe_id: r.fe_id, fe_name: r.fe_name, days_present: r.days_present, avg_hours: r.avg_hours, avg_checkin_time: r.avg_checkin_time ?? '—',
        avg_checkin_min: r.first_call_min - 15, missed_checkouts: r.missed_checkouts,
      })).sort((a, b) => b.days_present - a.days_present));
    case 'outlet-churn':
      return wrap([
        { segment: 'Retained (ordered in both)', outlets: 318, revenue_last_30d_inr: 2480000, revenue_prior_30d_inr: 2310000 },
        { segment: 'New or returning (last 30 days only)', outlets: 74, revenue_last_30d_inr: 410000, revenue_prior_30d_inr: 0 },
        { segment: 'Lapsed (earlier 30 days only)', outlets: 52, revenue_last_30d_inr: 0, revenue_prior_30d_inr: 330000 },
      ]);
    default:
      break;
  }

  // ── reports ─────────────────────────────────────────────────────────────
  if (!sub.startsWith('reports/')) return undefined;
  const report = sub.slice('reports/'.length);
  const repOptions = reps.map((u) => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name));

  if (report === 'rep-activity') {
    const { from, to, days } = range(query, 14);
    const rows = reps.map((u, i) => repRow(u, i, days)).sort((a, b) => a.fe_name.localeCompare(b.fe_name));
    const planned = sum(rows, (r) => r.planned_stops); const visited = sum(rows, (r) => r.visited_stops);
    const productive = sum(rows, (r) => r.productive_visits); const orders = sum(rows, (r) => r.orders);
    const revenue = sum(rows, (r) => r.revenue_inr); const km = sum(rows, (r) => r.km_total);
    return wrap({
      from, to, reps_in_view: rows.length, rows,
      totals: { planned_stops: planned, visited_stops: visited, adherence_pct: pct(visited, planned), productive_visits: productive, productive_pct: pct(productive, visited), orders, revenue_inr: revenue, aov_inr: orders ? Math.round(revenue / orders) : 0, km_total: r1(km), km_per_visit: visited ? r1(km / visited) : 0 },
      median: {
        calls_per_day: median(rows.map((r) => r.calls_per_day)), adherence_pct: median(rows.map((r) => r.adherence_pct)), productive_pct: median(rows.map((r) => r.productive_pct)),
        aov_inr: median(rows.map((r) => r.aov_inr)), avg_dwell_min: median(rows.map((r) => r.avg_dwell_min)), km_per_visit: median(rows.map((r) => r.km_per_visit)),
      },
    });
  }

  if (report === 'beat-compliance') {
    const { from, to, days } = range(query, 28);
    const only = query.get('user_id');
    const subset = reps.filter((u) => !only || u.id === only);
    const ws: string[] = [];
    for (let d = weekStart(from); d <= to; d = addDays(d, 7)) ws.push(d);
    const perRep = subset.map((u) => {
      const i = reps.findIndex((x) => x.id === u.id);
      const by_week: Record<string, number | null> = {}; let planned = 0; let visited = 0;
      const weekCells = ws.map((w, k) => {
        const p = 60 + ((i + k) % 4) * 4; const v = Math.round(p * (0.72 + ((i + k) % 5) * 0.05));
        by_week[w] = pct(v, p); planned += p; visited += v; return { w, p, v };
      });
      const planDays = Math.max(1, Math.round((days * 6) / 7));
      return { fe_id: u.id, fe_name: u.name, plans: planDays, planned, visited, missed: planned - visited, adherence_pct: pct(visited, planned), plan_days: planDays, zero_visit_days: i % 4 === 3 ? 1 : 0, by_week, weekCells };
    }).sort((a, b) => a.fe_name.localeCompare(b.fe_name));
    const weeks = ws.map((w, k) => {
      const planned = perRep.reduce((s, r) => s + r.weekCells[k].p, 0); const visited = perRep.reduce((s, r) => s + r.weekCells[k].v, 0);
      return { week: weekLabel(w), week_start: w, planned, visited, missed: planned - visited, adherence_pct: pct(visited, planned), active_reps: perRep.length };
    });
    const planned = perRep.reduce((s, r) => s + r.planned, 0);
    const visited = perRep.reduce((s, r) => s + r.visited, 0);
    return wrap({
      from, to, weeks, reps: perRep.map(({ weekCells: _w, ...r }) => r),
      totals: { planned, visited, missed: planned - visited, adherence_pct: pct(visited, planned), plan_days: perRep.reduce((s, r) => s + r.plan_days, 0), zero_visit_days: perRep.reduce((s, r) => s + r.zero_visit_days, 0) },
      median_adherence_pct: median(perRep.map((r) => r.adherence_pct)), rep_options: repOptions,
    });
  }

  if (report === 'time-and-travel') {
    const { from, to, days } = range(query, 14);
    const rows = reps.map((u, i) => repRow(u, i, days)).sort((a, b) => a.fe_name.localeCompare(b.fe_name)).map((r) => ({
      fe_id: r.fe_id, fe_name: r.fe_name, active_days: r.active_days, km_total: r.km_total, km_per_day: r.km_per_day, visited_stops: r.visited_stops, km_per_visit: r.km_per_visit,
      timed_visits: r.timed_visits, avg_dwell_min: r.avg_dwell_min, onsite_hours: r.onsite_hours, onsite_min: r.onsite_min, first_call_time: r.first_call_time, last_call_time: r.last_call_time,
      avg_span_hours: r.avg_span_hours, days_present: r.days_present, worked_hours: r.total_hours, onsite_share_pct: r.total_hours > 0 ? pct(r.onsite_min / 60, r.total_hours) : null,
    }));
    return wrap({
      from, to, rows,
      totals: { km_total: r1(rows.reduce((s, r) => s + r.km_total, 0)), visited_stops: rows.reduce((s, r) => s + r.visited_stops, 0), onsite_hours: r1(rows.reduce((s, r) => s + r.onsite_min, 0) / 60), worked_hours: r1(rows.reduce((s, r) => s + r.worked_hours, 0)) },
      median: { km_per_visit: median(rows.map((r) => r.km_per_visit)), avg_dwell_min: median(rows.map((r) => r.avg_dwell_min)), avg_span_hours: median(rows.map((r) => r.avg_span_hours)), onsite_share_pct: median(rows.map((r) => r.onsite_share_pct ?? NaN).filter(Number.isFinite)) },
    });
  }

  if (report === 'outlet-visit-gaps') {
    const { from, to } = range(query, 60);
    const only = query.get('user_id'); const minDays = num(query.get('min_days'), 0); const limit = Math.max(1, Math.min(1000, num(query.get('limit'), 200)));
    const all = Array.from({ length: 36 }, (_, k) => {
      const rep = reps[k % reps.length];
      const days = k % 9 === 4 ? null : (k * 7) % 58;                         // some outlets were never visited in the window
      const planned = 2 + (k % 4);
      const visited = days === null ? 0 : Math.max(1, planned - (k % 3));
      const orders = days === null ? 0 : (k % 5);
      return {
        store_id: `store-${k + 1}`, outlet_name: `${OUTLET_NAMES[k % OUTLET_NAMES.length]} ${k >= OUTLET_NAMES.length ? `#${Math.floor(k / OUTLET_NAMES.length) + 1}` : ''}`.trim(),
        city: CITIES[k % CITIES.length], rep_id: rep.id, rep_name: rep.name, planned_calls: planned, visited_calls: visited,
        last_visit_date: days === null ? null : addDays(to, -days), days_since_last_visit: days,
        last_order_date: orders ? addDays(to, -(days ?? 0) - (k % 4)) : null, orders, revenue_inr: orders * (2400 + k * 90),
      };
    }).filter((r) => (!only || r.rep_id === only) && (r.days_since_last_visit === null || r.days_since_last_visit >= minDays));
    const key = (d: number | null) => (d === null ? 1e9 : d);
    all.sort((a, b) => key(b.days_since_last_visit) - key(a.days_since_last_visit) || b.planned_calls - a.planned_calls);
    const seen = all.filter((r) => r.days_since_last_visit !== null);
    return wrap({
      from, to, as_of: to, total: all.length, rows: all.slice(0, limit),
      summary: { outlets: all.length, never_visited: all.length - seen.length, visited: seen.length, avg_days_since_last_visit: seen.length ? r1(seen.reduce((s, r) => s + (r.days_since_last_visit as number), 0) / seen.length) : null },
      rep_options: repOptions,
    });
  }

  if (report === 'geo-exceptions') {
    const { from, to, days } = range(query, 14);
    const only = query.get('user_id'); const minDist = num(query.get('min_distance_m'), 0);
    const subset = reps.filter((u) => !only || u.id === only);
    const summary = subset.map((u) => {
      const i = reps.findIndex((x) => x.id === u.id); const r = repRow(u, i, days);
      return { fe_id: u.id, fe_name: u.name, checkins: r.checkins, outside_geofence: r.outside_geofence, outside_pct: r.outside_pct, max_distance_m: r.max_distance_m, mock_location: i === 2 ? 2 : 0, vpn_detected: i === 5 ? 1 : 0, suspect_pings: i === 2 ? 3 : 0 };
    }).sort((a, b) => b.outside_geofence - a.outside_geofence || b.outside_pct - a.outside_pct);
    const rows: Row[] = [];
    for (const s of summary) {
      const i = reps.findIndex((x) => x.id === s.fe_id);
      for (let k = 0; k < Math.min(s.outside_geofence, 4); k++) {
        const geo = k % 2 ? 50 : 100; const dist = geo + 60 + ((i * 37 + k * 53) % 420);
        const day = addDays(to, -((i + k * 3) % Math.max(1, days)));
        rows.push({ fe_id: s.fe_id, fe_name: s.fe_name, outlet_name: OUTLET_NAMES[(i + k) % OUTLET_NAMES.length], beat: `Beat-${String.fromCharCode(65 + (i % 4))}${(k % 3) + 1}`, visited_at: `${day}T0${4 + (k % 4)}:15:00Z`, day, distance_m: dist, geofence_m: geo, over_by_m: dist - geo });
      }
    }
    const filtered = rows.filter((r) => num(r.distance_m, 0) >= minDist).sort((a, b) => num(b.distance_m, 0) - num(a.distance_m, 0));
    return wrap({ from, to, total: filtered.length, rows: filtered, summary, rep_options: repOptions });
  }

  if (report === 'supervisor-teams') {
    const { from, to, days } = range(query, 14);
    const rows = reps.map((u, i) => repRow(u, i, days));
    const teams = SUPERVISORS.map((sp) => {
      const g = rows.filter((r) => r.supervisor_id === sp.id);
      if (!g.length) return null;
      const planned = sum(g, (r) => r.planned_stops); const visited = sum(g, (r) => r.visited_stops); const productive = sum(g, (r) => r.productive_visits);
      const repDays = sum(g, (r) => r.active_days); const revenue = sum(g, (r) => r.revenue_inr);
      return {
        supervisor_id: sp.id, supervisor_name: sp.name, reps: g.length, active_reps: g.filter((r) => r.visited_stops > 0).length, planned_stops: planned, visited_stops: visited, adherence_pct: pct(visited, planned),
        productive_visits: productive, productive_pct: pct(productive, visited), active_rep_days: repDays, calls_per_rep_day: repDays ? r1(visited / repDays) : 0, orders: sum(g, (r) => r.orders), revenue_inr: revenue,
        revenue_per_rep_inr: Math.round(revenue / g.length), days_present: sum(g, (r) => r.days_present),
      };
    }).filter((t): t is NonNullable<typeof t> => !!t).sort((a, b) => b.visited_stops - a.visited_stops);
    return wrap({
      from, to, reps_in_view: rows.length, rows: teams,
      median: { adherence_pct: median(teams.map((t) => t.adherence_pct)), productive_pct: median(teams.map((t) => t.productive_pct)), calls_per_rep_day: median(teams.map((t) => t.calls_per_rep_day)), revenue_per_rep_inr: median(teams.map((t) => t.revenue_per_rep_inr)) },
    });
  }

  if (report === 'attendance-extras') {
    const { from, to, days } = range(query, 14);
    const users = (ctx?.users && ctx.users.length ? ctx.users : FALLBACK_REPS).slice(0, 12);
    const rows = users.map((u, i) => {
      const work = Math.max(1, Math.round((days * 6) / 7)); const present = Math.max(1, work - (i % 3)); const avgH = r1(7.2 + (i % 5) * 0.4);
      const inMin = 525 + (i % 4) * 12; const outMin = inMin + Math.round(avgH * 60);
      return { user_id: u.id, days_present: present, avg_checkin_min: inMin, avg_checkin_time: hhmm(inMin), avg_checkout_min: outMin, avg_checkout_time: hhmm(outMin), total_hours: r1(avgH * present), hours_days: present, avg_hours: avgH, missed_checkouts: i % 4 === 3 ? 1 : 0, regularised_days: i % 5 === 2 ? 1 : 0 };
    });
    return wrap({ from, to, rows, median: { avg_hours: median(rows.map((r) => r.avg_hours)), avg_checkin_min: median(rows.map((r) => r.avg_checkin_min)) } });
  }

  if (report === 'visit-coverage') {
    const { from, to, days } = range(query, Number(today.slice(8, 10)));
    const base = (ctx?.outletCoverage?.data || {}) as Row;
    const scale = Math.min(1, days / 30);                                      // a short window plans and covers fewer outlets
    const byCity = ((base.by_city as Array<{ city: string; universe: number; covered: number }>) || CITIES.map((c, i) => ({ city: c, universe: 200 - i * 20, covered: 140 - i * 15 })))
      .map((c) => ({ city: c.city, universe: Math.max(1, Math.round(c.universe * scale)), covered: Math.round(c.covered * scale) }));
    const universe = byCity.reduce((s, c) => s + c.universe, 0); const covered = byCity.reduce((s, c) => s + c.covered, 0);
    const byRep = reps.map((u, i) => { const un = Math.max(1, Math.round((universe / reps.length) * (0.9 + (i % 3) * 0.1))); const cv = Math.min(un, Math.round(un * (0.55 + (i % 5) * 0.08))); return { fe_id: u.id, fe_name: u.name, universe: un, covered: cv, gap: un - cv, coverage_pct: pct(cv, un) }; }).sort((a, b) => a.fe_name.localeCompare(b.fe_name));
    return wrap({ from, to, universe, covered, coverage_pct: pct(covered, universe), never_visited: universe - covered, by_city: byCity, by_rep: byRep });
  }

  return undefined;
}
