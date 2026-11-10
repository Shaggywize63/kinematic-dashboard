/**
 * Demo-tenant data for the Lead Management "plus" widgets and reports, and the
 * extra data points on the existing CRM reports.
 *
 * Demo accounts never reach the backend: demoMocks.ts calls
 * `demoCrmReportsPlus(path, query, ctx)` first and serves whatever it returns.
 * Everything here is deterministic (no randomness) so screenshots and tests are
 * stable. Derived figures use the same formulas as the backend, so totals equal
 * the sum of the rows and every rate matches its counts.
 *
 * The date window of a request is ignored: the demo answers the same data for
 * any range, which is enough to show every column, chart and empty-safe path.
 */
import { mockLeadTracker, mockTeamPerformance } from './demoExtrasSeed';

type Q = { get(name: string): string | null };
export interface DemoPlusCtx {
  users: Array<{ id: string; name: string }>;
  leads: Parameters<typeof mockLeadTracker>[0];
  sources?: Array<{ id?: string; name?: string }>;
  base: { winRate?: unknown; salesCycle?: unknown; forecast?: unknown; sourceRoi?: unknown };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number): number | null => (b > 0 ? r1((a / b) * 100) : null);
const DAY = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const mondayOf = (ms: number) => {
  const d = new Date(ms); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1));
  return d.getTime();
};
const monthKeys = (n: number): string[] => {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1)).toISOString().slice(0, 7));
};
const weekKeys = (n: number): string[] => {
  const mon = mondayOf(Date.now());
  return Array.from({ length: n }, (_, i) => ymd(mon - (n - 1 - i) * 7 * DAY));
};

const FALLBACK_REPS = ['Arjun Sharma', 'Priya Patel', 'Rahul Verma', 'Sneha Rao', 'Amit Singh'];
const repsOf = (ctx: DemoPlusCtx): Array<{ id: string | null; name: string }> => {
  const u = ctx.users.filter((x) => x?.name).slice(0, 5).map((x) => ({ id: x.id, name: x.name }));
  return u.length ? u : FALLBACK_REPS.map((name, i) => ({ id: `demo-rep-${i}`, name }));
};

// ── 1. Lead source performance ──────────────────────────────────────────────
function sourcePerformance(ctx: DemoPlusCtx) {
  const names = (ctx.sources ?? []).map((s) => s.name).filter(Boolean).slice(0, 6) as string[];
  const srcs = names.length >= 3 ? names : ['Website form', 'Referral', 'Field visit', 'WhatsApp', 'Trade show', 'Cold call'];
  const base = [
    { leads: 48, conv: 11, qual: 19, lost: 9, unq: 6, days: 14.2, score: 63, won: 3_450_000, cpl: 120 },
    { leads: 36, conv: 11, qual: 17, lost: 5, unq: 3, days: 9.8, score: 71, won: 4_120_000, cpl: 0 },
    { leads: 29, conv: 5, qual: 10, lost: 8, unq: 4, days: 18.5, score: 55, won: 1_640_000, cpl: 40 },
    { leads: 22, conv: 3, qual: 7, lost: 6, unq: 3, days: 21.0, score: 49, won: 910_000, cpl: 250 },
    { leads: 15, conv: 3, qual: 6, lost: 2, unq: 1, days: 12.3, score: 66, won: 1_080_000, cpl: 30 },
    { leads: 11, conv: 1, qual: 3, lost: 4, unq: 2, days: 27.0, score: 41, won: 260_000, cpl: 60 },
  ];
  const total = base.reduce((s, b) => s + b.leads, 0);
  const rows = srcs.map((source, i) => {
    const b = base[i % base.length];
    const open = Math.max(0, b.leads - b.conv - b.lost - b.unq);
    const cost = b.leads * b.cpl;
    return {
      source_id: `demo-src-${i}`, source, leads: b.leads, qualified: b.qual, converted: b.conv, lost: b.lost, unqualified: b.unq, open,
      qualified_pct: pct(b.qual, b.leads), conversion_pct: pct(b.conv, b.leads), share_of_leads_pct: pct(b.leads, total),
      avg_days_to_convert: b.days, avg_score: b.score, won_value: b.won, revenue_per_lead: Math.round(b.won / b.leads),
      cost_per_lead: b.cpl, total_cost: cost, cost_per_converted: b.conv > 0 && cost > 0 ? Math.round(cost / b.conv) : null,
    };
  });
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const conv = sum('converted');
  const cost = sum('total_cost');
  const totals = {
    source_id: null, source: 'All sources', leads: sum('leads'), qualified: sum('qualified'), converted: conv, lost: sum('lost'),
    unqualified: sum('unqualified'), open: sum('open'), qualified_pct: pct(sum('qualified'), sum('leads')), conversion_pct: pct(conv, sum('leads')),
    share_of_leads_pct: 100, avg_days_to_convert: r1(rows.reduce((s, r) => s + r.avg_days_to_convert * r.converted, 0) / Math.max(1, conv)),
    avg_score: r1(rows.reduce((s, r) => s + r.avg_score * r.leads, 0) / Math.max(1, sum('leads'))),
    won_value: sum('won_value'), revenue_per_lead: Math.round(sum('won_value') / Math.max(1, sum('leads'))),
    cost_per_lead: Math.round(cost / Math.max(1, sum('leads'))), total_cost: cost, cost_per_converted: conv > 0 && cost > 0 ? Math.round(cost / conv) : null,
  };
  return { rows, totals };
}

// ── 2. Follow-up compliance ─────────────────────────────────────────────────
function followupCompliance(ctx: DemoPlusCtx) {
  const reps = repsOf(ctx);
  const seed = [
    { on: 31, late: 6, over: 3, up: 4, un: 1 }, { on: 26, late: 7, over: 2, up: 3, un: 0 }, { on: 18, late: 8, over: 6, up: 2, un: 1 },
    { on: 15, late: 5, over: 5, up: 2, un: 0 }, { on: 9, late: 6, over: 4, up: 1, un: 0 },
  ];
  const mk = (id: string | null, owner: string, b: (typeof seed)[number]) => {
    const due = b.on + b.late + b.over + b.up + b.un;
    return {
      owner_id: id, owner, due, on_time: b.on, late: b.late, overdue: b.over, upcoming: b.up, done_untimed: b.un,
      compliance_pct: pct(b.on, b.on + b.late + b.over), avg_days_late: r1(0.8 + b.late * 0.18), avg_days_overdue: b.over ? r1(2.4 + b.over * 0.6) : null,
    };
  };
  const rows = reps.map((u, i) => mk(u.id, u.name, seed[i % seed.length]));
  const acc = rows.reduce((a, r) => ({ on: a.on + r.on_time, late: a.late + r.late, over: a.over + r.overdue, up: a.up + r.upcoming, un: a.un + r.done_untimed }), { on: 0, late: 0, over: 0, up: 0, un: 0 });
  const trend = weekKeys(5).map((week, i) => {
    const on = 16 + i * 2, late = 5 - (i % 3), over = i === 4 ? 0 : 3 + (i % 2), up = i === 4 ? 14 : 0;
    return { week, due: on + late + over + up, on_time: on, late, overdue: over, upcoming: up, compliance_pct: pct(on, on + late + over) };
  });
  return { rows, totals: { ...mk(null, 'Everyone', acc), owner: 'Everyone' }, trend };
}

// ── 3. Owner workload & SLA ─────────────────────────────────────────────────
function ownerWorkload(ctx: DemoPlusCtx) {
  const reps = repsOf(ctx);
  const seed = [
    { open: 34, nw: 12, never: 3, i7: 9, i14: 5, i30: 2, age: 21.4, over: 4, touch: 38, ft: 11, br: 2 },
    { open: 29, nw: 10, never: 2, i7: 7, i14: 4, i30: 1, age: 18.2, over: 2, touch: 22, ft: 9, br: 1 },
    { open: 41, nw: 14, never: 6, i7: 15, i14: 9, i30: 4, age: 29.8, over: 7, touch: 95, ft: 12, br: 6 },
    { open: 22, nw: 8, never: 1, i7: 4, i14: 2, i30: 0, age: 14.1, over: 1, touch: 31, ft: 8, br: 1 },
    { open: 27, nw: 9, never: 4, i7: 8, i14: 6, i30: 3, age: 26.5, over: 5, touch: 140, ft: 7, br: 4 },
  ];
  const toRow = (id: string | null, owner: string, b: (typeof seed)[number], totalOpen: number) => ({
    owner_id: id, owner, open_leads: b.open, share_of_open_pct: pct(b.open, totalOpen), new_leads: b.nw, never_touched: b.never,
    idle_7d: b.i7, idle_14d: b.i14, idle_30d: b.i30, avg_open_age_days: b.age, overdue_followups: b.over,
    first_touch_leads: b.ft, median_first_touch_minutes: b.touch, sla_breach_pct: pct(b.br, b.ft),
  });
  const unassigned = { open: 6, nw: 3, never: 6, i7: 4, i14: 3, i30: 2, age: 33.0, over: 0, touch: 0, ft: 0, br: 0 };
  const list = [...reps.map((u, i) => ({ id: u.id, name: u.name, b: seed[i % seed.length] })), { id: null, name: 'Unassigned', b: unassigned }];
  const totalOpen = list.reduce((s, x) => s + x.b.open, 0);
  const rows = list.map((x) => ({ ...toRow(x.id, x.name, x.b, totalOpen), ...(x.id === null ? { median_first_touch_minutes: null, sla_breach_pct: null } : {}) }));
  const sum = (k: 'open' | 'nw' | 'never' | 'i7' | 'i14' | 'i30' | 'over' | 'ft' | 'br') => list.reduce((s, x) => s + x.b[k], 0);
  const totals = {
    owner_id: null, owner: 'Everyone', open_leads: totalOpen, share_of_open_pct: 100, new_leads: sum('nw'), never_touched: sum('never'),
    idle_7d: sum('i7'), idle_14d: sum('i14'), idle_30d: sum('i30'), avg_open_age_days: r1(list.reduce((s, x) => s + x.b.age * x.b.open, 0) / totalOpen),
    overdue_followups: sum('over'), first_touch_leads: sum('ft'), median_first_touch_minutes: 52, sla_breach_pct: pct(sum('br'), sum('ft')),
  };
  return { rows, totals, sla_minutes: 60 };
}

// ── 4. Stage velocity ───────────────────────────────────────────────────────
function stageVelocity() {
  const mk = (i: number, stage: string, type: string, o: Record<string, number | null>) => ({
    stage_id: `demo-stg-${i + 1}`, stage, position: i, stage_type: type, deals_entered: 0, completed_stays: 0, avg_days: null, median_days: null, max_days: null,
    current_deals: 0, current_value: 0, avg_current_age_days: null, slow_current_deals: 0, ...o,
  });
  const rows = [
    mk(0, 'Discovery', 'open', { deals_entered: 58, completed_stays: 44, avg_days: 6.2, median_days: 5, max_days: 21, current_deals: 11, current_value: 2_650_000, avg_current_age_days: 7.4, slow_current_deals: 2 }),
    mk(1, 'Qualification', 'open', { deals_entered: 44, completed_stays: 31, avg_days: 9.8, median_days: 8, max_days: 34, current_deals: 9, current_value: 3_120_000, avg_current_age_days: 11.6, slow_current_deals: 2 }),
    mk(2, 'Proposal', 'open', { deals_entered: 31, completed_stays: 19, avg_days: 12.4, median_days: 10, max_days: 41, current_deals: 8, current_value: 4_980_000, avg_current_age_days: 16.1, slow_current_deals: 3 }),
    mk(3, 'Negotiation', 'open', { deals_entered: 19, completed_stays: 11, avg_days: 7.1, median_days: 6, max_days: 19, current_deals: 5, current_value: 3_340_000, avg_current_age_days: 8.8, slow_current_deals: 0 }),
    mk(4, 'Closed Won', 'won', { deals_entered: 11 }),
    mk(5, 'Closed Lost', 'lost', { deals_entered: 8 }),
  ];
  return {
    pipeline_id: 'demo-pipe', pipelines: [{ id: 'demo-pipe', name: 'Sales Pipeline', is_default: true }], rows,
    totals: { open_deals: 33, open_value: 14_090_000, typical_days_through_open_stages: 35.5 },
  };
}

// ── 5. Activity mix ─────────────────────────────────────────────────────────
function activityMix(ctx: DemoPlusCtx) {
  const reps = repsOf(ctx);
  const seed = [
    { call: 64, email: 22, meeting: 14, site: 9, task: 18, note: 11, msg: 21, done: 118, wo: 52, conn: 31, days: 21 },
    { call: 51, email: 30, meeting: 12, site: 5, task: 14, note: 9, msg: 26, done: 104, wo: 44, conn: 26, days: 20 },
    { call: 72, email: 12, meeting: 9, site: 16, task: 20, note: 8, msg: 14, done: 99, wo: 60, conn: 29, days: 19 },
    { call: 38, email: 18, meeting: 16, site: 11, task: 12, note: 14, msg: 9, done: 92, wo: 30, conn: 21, days: 18 },
    { call: 45, email: 9, meeting: 7, site: 6, task: 11, note: 6, msg: 18, done: 61, wo: 33, conn: 14, days: 15 },
  ];
  type S = (typeof seed)[number];
  const toRow = (id: string | null, owner: string, b: S) => {
    const total = b.call + b.email + b.meeting + b.site + b.task + b.note + b.msg;
    return {
      owner_id: id, owner, total, calls: b.call, emails: b.email, meetings: b.meeting, site_visits: b.site, tasks: b.task, notes: b.note, messages: b.msg, other: 0,
      completed: b.done, completion_pct: pct(b.done, total), calls_with_outcome: b.wo, calls_connected: b.conn, connect_rate_pct: pct(b.conn, b.wo),
      active_days: b.days, avg_per_active_day: r1(total / b.days),
    };
  };
  const rows = reps.map((u, i) => toRow(u.id, u.name, seed[i % seed.length]));
  const t = rows.reduce((a, r) => ({
    call: a.call + r.calls, email: a.email + r.emails, meeting: a.meeting + r.meetings, site: a.site + r.site_visits, task: a.task + r.tasks,
    note: a.note + r.notes, msg: a.msg + r.messages, done: a.done + r.completed, wo: a.wo + r.calls_with_outcome, conn: a.conn + r.calls_connected, days: Math.max(a.days, r.active_days),
  }), { call: 0, email: 0, meeting: 0, site: 0, task: 0, note: 0, msg: 0, done: 0, wo: 0, conn: 0, days: 0 });
  const totals = toRow(null, 'Everyone', t);
  const by_type = [
    { type: 'Calls', count: t.call }, { type: 'SMS / WhatsApp', count: t.msg }, { type: 'Tasks', count: t.task }, { type: 'Emails', count: t.email },
    { type: 'Meetings', count: t.meeting }, { type: 'Notes', count: t.note }, { type: 'Site visits', count: t.site },
  ].sort((a, b) => b.count - a.count);
  const by_week = weekKeys(5).map((week, i) => ({ week, total: 96 + i * 7, calls: 46 + i * 3, completed: 71 + i * 5 }));
  return { rows, totals, by_type, by_week };
}

// ── 6. Lead conversion time ─────────────────────────────────────────────────
function conversionTime(ctx: DemoPlusCtx) {
  const reps = repsOf(ctx);
  const counts = [4, 9, 14, 11, 8, 4, 1];
  const labels = ['<1d', '1–3d', '4–7d', '8–14d', '15–30d', '31–60d', '60d+'];
  const owners = reps.map((u, i) => ({ key: u.id ?? `o${i}`, label: u.name, converted: [14, 12, 9, 8, 8][i % 5], avg_days: [11.2, 9.1, 17.6, 13.4, 15.8][i % 5], median_days: [8.5, 7, 14, 10, 12][i % 5] }));
  const srcNames = ['Referral', 'Website form', 'Field visit', 'WhatsApp'];
  const by_source = srcNames.map((label, i) => ({ key: `s${i}`, label, converted: [16, 14, 10, 5][i], avg_days: [9.2, 12.8, 17.4, 11.1][i], median_days: [7, 10, 14, 9][i] }));
  const by_month = monthKeys(4).map((key, i) => ({ key, label: key, converted: [9, 12, 11, 14][i], avg_days: [14.8, 13.2, 12.5, 12.9][i], median_days: [11, 10, 9, 10][i] }));
  return {
    totals: { converted: counts.reduce((s, c) => s + c, 0), avg_days: 12.7, median_days: 10, p90_days: 29, fastest_days: 0.4, slowest_days: 74 },
    buckets: labels.map((bucket, i) => ({ bucket, count: counts[i] })), by_owner: owners, by_source, by_month,
  };
}

// ── 7. Weighted pipeline ────────────────────────────────────────────────────
function weightedPipeline() {
  const rows = [
    { stage_id: 'demo-stg-1', stage: 'Discovery', position: 0, deals: 11, value: 2_650_000, weighted_value: 265_000, avg_deal_size: 240_909, avg_age_days: 7.4, past_close_date: 1 },
    { stage_id: 'demo-stg-2', stage: 'Qualification', position: 1, deals: 9, value: 3_120_000, weighted_value: 780_000, avg_deal_size: 346_667, avg_age_days: 11.6, past_close_date: 1 },
    { stage_id: 'demo-stg-3', stage: 'Proposal', position: 2, deals: 8, value: 4_980_000, weighted_value: 2_490_000, avg_deal_size: 622_500, avg_age_days: 16.1, past_close_date: 2 },
    { stage_id: 'demo-stg-4', stage: 'Negotiation', position: 3, deals: 5, value: 3_340_000, weighted_value: 2_505_000, avg_deal_size: 668_000, avg_age_days: 8.8, past_close_date: 0 },
  ];
  const value = rows.reduce((s, r) => s + r.value, 0);
  const weighted = rows.reduce((s, r) => s + r.weighted_value, 0);
  return { rows, totals: { deals: 33, value, weighted_value: weighted, weighted_pct_of_value: pct(weighted, value), past_close_date: 4, past_close_value: 1_350_000 } };
}

// ── 8. Deal size distribution ───────────────────────────────────────────────
function dealSize() {
  const b = [
    { bucket: 'Under ₹10K', deals: 6, won: 2, lost: 3, open: 1, value: 38_000 },
    { bucket: '₹10K–50K', deals: 19, won: 6, lost: 5, open: 8, value: 610_000 },
    { bucket: '₹50K–1L', deals: 17, won: 5, lost: 4, open: 8, value: 1_250_000 },
    { bucket: '₹1L–5L', deals: 22, won: 6, lost: 5, open: 11, value: 4_420_000 },
    { bucket: '₹5L–10L', deals: 8, won: 2, lost: 1, open: 5, value: 5_100_000 },
    { bucket: '₹10L+', deals: 4, won: 1, lost: 1, open: 2, value: 5_800_000 },
  ].map((x) => ({ ...x, win_rate_pct: pct(x.won, x.won + x.lost) }));
  return { rows: b, totals: { deals: 76, with_amount: 76, avg_amount: 214_000, median_amount: 96_000, largest_amount: 3_400_000 } };
}

// ── 9. Win-rate trend ───────────────────────────────────────────────────────
function winRateTrend() {
  const won = [4, 6, 5, 7, 6, 8], lost = [5, 6, 4, 6, 4, 5];
  const rows = monthKeys(6).map((month, i) => ({
    month, won: won[i], lost: lost[i], closed: won[i] + lost[i], win_rate_pct: pct(won[i], won[i] + lost[i]),
    won_value: won[i] * 410_000, lost_value: lost[i] * 280_000,
  }));
  const w = won.reduce((s, x) => s + x, 0), l = lost.reduce((s, x) => s + x, 0);
  return { rows, totals: { won: w, lost: l, closed: w + l, win_rate_pct: pct(w, w + l) }, months: 6 };
}

// ── 10. Call connect trend ──────────────────────────────────────────────────
function callTrend() {
  const calls = [58, 63, 71, 66, 74, 79, 72, 81], withO = [41, 46, 55, 50, 58, 63, 57, 66], conn = [14, 17, 22, 19, 24, 27, 23, 29];
  const rows = weekKeys(8).map((week, i) => ({ week, calls: calls[i], with_outcome: withO[i], connected: conn[i], connect_rate_pct: pct(conn[i], withO[i]) }));
  const c = calls.reduce((s, x) => s + x, 0), w = withO.reduce((s, x) => s + x, 0), k = conn.reduce((s, x) => s + x, 0);
  return { rows, totals: { calls: c, with_outcome: w, connected: k, connect_rate_pct: pct(k, w) }, weeks: 8 };
}

// ── 11. Lead recycling ──────────────────────────────────────────────────────
function recycling() {
  const lost = [12, 15, 11, 14, 13, 16], re = [3, 4, 2, 5, 4, 6];
  const rows = monthKeys(6).map((month, i) => ({ month, moved_to_lost: lost[i], reopened: re[i] }));
  return {
    rows, totals: { moved_to_lost: lost.reduce((s, x) => s + x, 0), reopened: re.reduce((s, x) => s + x, 0), distinct_leads_reopened: 21, converted_after_reopen: 4 }, months: 6,
  };
}

// ── Existing reports, with their extra data points ──────────────────────────
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Team Performance: the existing demo rows + the follow-through / previous-period columns. The existing mock
 *  writes its rates as 0-100 while the page (and the API) use 0-1 fractions, so they are normalised here. */
function teamPerformance(ctx: DemoPlusCtx) {
  const base = mockTeamPerformance(ctx.users.map((u) => ({ id: u.id, name: u.name })) as Parameters<typeof mockTeamPerformance>[0]);
  const frac = (v: unknown) => (typeof v === 'number' && v > 1 ? +(v / 100).toFixed(4) : v);
  const extend = (r: Row, i: number): Row => {
    const open = Number(r.open_pipeline_value ?? 0);
    return {
      ...r, qualified_rate: frac(r.qualified_rate), converted_rate: frac(r.converted_rate), conversion_rate: frac(r.conversion_rate),
      lost_value: Math.round((Number(r.lost_count ?? 0) * Number(r.avg_deal_size ?? 0)) * 0.6),
      weighted_pipeline_value: Math.round(open * 0.42),
      overdue_followups: 1 + ((i * 3) % 6), untouched_open_leads: (i * 2) % 5, idle_leads_14d: 2 + ((i * 5) % 7),
      calls_period: 22 + ((i * 11) % 30), meetings_period: 3 + ((i * 3) % 9),
      new_leads_prev_period: Math.max(0, Number(r.new_leads_period ?? 0) + (i % 2 ? 3 : -2)),
      won_count_prev_period: Math.max(0, Number(r.won_count ?? 0) + (i % 2 ? -1 : 1)),
      won_value_prev_period: Math.round(Number(r.won_value ?? 0) * (i % 2 ? 1.15 : 0.82)),
    };
  };
  const rows = base.rows.map(extend);
  const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const total = extend(base.total as unknown as Row, 0);
  for (const k of ['lost_value', 'weighted_pipeline_value', 'overdue_followups', 'untouched_open_leads', 'idle_leads_14d', 'calls_period', 'meetings_period',
    'new_leads_prev_period', 'won_count_prev_period', 'won_value_prev_period']) total[k] = sum(k);
  return { total, rows };
}

/** Lead Tracker: existing demo payload + monthly conversion, previous periods and per-source conversion. */
function leadTracker(ctx: DemoPlusCtx) {
  const p = mockLeadTracker(ctx.leads) as unknown as Row;
  const monthly = (p.monthly as Array<{ key: string; count: number }>) ?? [];
  const prev = (label: string, cur: Row, factor: number) => {
    const nl = Math.max(0, Math.round(cur.new_leads * factor));
    const conv = Math.min(nl, Math.round(cur.converted * factor));
    return { label, from: cur.from, to: cur.to, new_leads: nl, converted: conv, conversion_rate: nl ? conv / nl : 0 };
  };
  const frac = (x: Row) => ({ ...x, conversion_rate: typeof x.conversion_rate === 'number' && x.conversion_rate > 1 ? x.conversion_rate / 100 : x.conversion_rate });
  const today = frac(p.period_today), week = frac(p.period_week), month = frac(p.period_month);
  return {
    ...p, period_today: today, period_week: week, period_month: month,
    monthly_detail: monthly.map((m, i) => { const conv = Math.round(m.count * (0.11 + (i % 3) * 0.03)); return { key: m.key, new_leads: m.count, converted: conv, conversion_rate: m.count ? conv / m.count : 0 }; }),
    previous_today: prev('Yesterday (same time)', today, 1.3),
    previous_week: prev('Last week (same days)', week, 0.85),
    previous_month: prev('Last month (same days)', month, 1.1),
    source_detail: ((p.source_breakdown as Array<{ name: string; count: number }>) ?? []).map((s, i) => { const conv = Math.round(s.count * (0.28 - i * 0.04)); return { name: s.name, count: s.count, converted: conv, conversion_rate: s.count ? conv / s.count : 0 }; }),
  };
}

/** Win/Loss: existing demo rows + value columns, derived from the counts. */
function winRate(ctx: DemoPlusCtx, by: string) {
  const rows = (Array.isArray(ctx.base.winRate) ? ctx.base.winRate : []) as Row[];
  return rows.map((r, i) => {
    const wonValue = Math.round(Number(r.won ?? 0) * (300_000 + i * 35_000));
    const lostValue = Math.round(Number(r.lost ?? 0) * (210_000 + i * 20_000));
    return {
      ...r, open: 2 + (i % 4), won_value: wonValue, lost_value: lostValue,
      avg_won_deal: r.won ? Math.round(wonValue / r.won) : 0, value_win_rate: wonValue + lostValue > 0 ? wonValue / (wonValue + lostValue) : 0,
      ...(by === 'source' ? { total: Number(r.won ?? 0) + Number(r.lost ?? 0) } : {}),
    };
  });
}

function salesCycle(ctx: DemoPlusCtx) {
  const rows = (Array.isArray(ctx.base.salesCycle) ? ctx.base.salesCycle : []) as Row[];
  return rows.map((r, i) => {
    const avg = Number(r.avg_days ?? 0);
    return { ...r, deals: 4 + ((i * 3) % 7), median_days: Math.max(1, Math.round(avg * 0.9)), fastest_days: Math.max(1, Math.round(avg * 0.35)), slowest_days: Math.round(avg * 1.9) };
  });
}

function forecast(ctx: DemoPlusCtx) {
  const rows = (Array.isArray(ctx.base.forecast) ? ctx.base.forecast : []) as Row[];
  return rows.map((r, i) => ({
    ...r, open_deals: 3 + ((i * 2) % 6), won_deals: 1 + (i % 3), avg_probability: 38 + ((i * 7) % 30),
    expected_total: Math.round(Number(r.closed ?? 0) + Number(r.committed ?? 0)),
  }));
}

function sourceRoi(ctx: DemoPlusCtx) {
  const rows = (Array.isArray(ctx.base.sourceRoi) ? ctx.base.sourceRoi : []) as Row[];
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  return rows.map((r) => {
    const leads = Number(r.leads ?? 0), deals = Number(r.deals ?? 0), revenue = Number(r.revenue ?? 0), cost = Number(r.cost ?? 0);
    return {
      ...r, qualified: Math.min(leads, deals + Math.round(leads * 0.25)), lead_to_deal_pct: leads ? r1((deals / leads) * 100) : null,
      avg_deal_value: deals ? Math.round(revenue / deals) : null, revenue_per_lead: leads ? Math.round(revenue / leads) : null,
      cost_per_lead: leads ? Math.round(cost / leads) : 0, cost_per_deal: deals && cost ? Math.round(cost / deals) : null,
      revenue_share_pct: totalRevenue ? r1((revenue / totalRevenue) * 100) : null,
    };
  });
}

/**
 * Answer a demo request for one of the plus endpoints (or an existing report that
 * gained columns). Returns undefined for any other path so the caller falls
 * through to its normal handlers.
 */
export function demoCrmReportsPlus(path: string, query: Q, ctx: DemoPlusCtx): unknown | undefined {
  switch (path) {
    case '/crm/analytics/source-performance':     return sourcePerformance(ctx);
    case '/crm/analytics/followup-compliance':    return followupCompliance(ctx);
    case '/crm/analytics/owner-workload':         return ownerWorkload(ctx);
    case '/crm/analytics/stage-velocity':         return stageVelocity();
    case '/crm/analytics/activity-mix':           return activityMix(ctx);
    case '/crm/analytics/conversion-time':        return conversionTime(ctx);
    case '/crm/analytics/weighted-pipeline':      return weightedPipeline();
    case '/crm/analytics/deal-size-distribution': return dealSize();
    case '/crm/analytics/win-rate-trend':         return winRateTrend();
    case '/crm/analytics/call-connect-trend':     return callTrend();
    case '/crm/analytics/lead-recycling':         return recycling();
    case '/crm/analytics/team-performance':       return teamPerformance(ctx);
    case '/crm/analytics/lead-tracker':           return leadTracker(ctx);
    case '/crm/analytics/win-rate':               return ctx.base.winRate ? winRate(ctx, query.get('by') || 'rep') : undefined;
    case '/crm/analytics/sales-cycle':            return ctx.base.salesCycle ? salesCycle(ctx) : undefined;
    case '/crm/analytics/forecast':               return ctx.base.forecast ? forecast(ctx) : undefined;
    case '/crm/analytics/lead-source-roi':        return ctx.base.sourceRoi ? sourceRoi(ctx) : undefined;
    default: return undefined;
  }
}
