/**
 * Mocked API payloads + helpers shared by e2e/crm-reports-plus.spec.ts and
 * e2e/crm-widgets-plus.spec.ts (the Lead Management "plus" widgets / reports).
 * Not a spec: the numbers are small and fixed so specs can assert exact values.
 */
import type { Page, Route } from '@playwright/test';
import { mockApi, seedSession } from './utils';

// ── payloads (shapes mirror the backend; see analytics-leads-plus.service.ts) ────────────────────────────────────────

const srcRow = (o: Record<string, unknown>) => ({
  source_id: null, source: 'x', leads: 0, qualified: 0, converted: 0, lost: 0, unqualified: 0, open: 0, qualified_pct: null, conversion_pct: null,
  share_of_leads_pct: null, avg_days_to_convert: null, avg_score: null, won_value: 0, revenue_per_lead: null, cost_per_lead: 0, total_cost: 0, cost_per_converted: null, ...o,
});
export const SOURCE_PERFORMANCE = {
  rows: [
    srcRow({ source_id: 's1', source: 'Website', leads: 40, qualified: 18, converted: 10, lost: 8, unqualified: 4, open: 18, qualified_pct: 45, conversion_pct: 25, share_of_leads_pct: 66.7, avg_days_to_convert: 12.5, avg_score: 62.3, won_value: 350000, revenue_per_lead: 8750, cost_per_lead: 100, total_cost: 4000, cost_per_converted: 400 }),
    srcRow({ source_id: 's2', source: 'Referral', leads: 20, qualified: 12, converted: 8, lost: 2, unqualified: 1, open: 9, qualified_pct: 60, conversion_pct: 40, share_of_leads_pct: 33.3, avg_days_to_convert: 6, avg_score: 71, won_value: 420000, revenue_per_lead: 21000, cost_per_lead: 0, total_cost: 0, cost_per_converted: null }),
  ],
  totals: srcRow({ source: 'All sources', leads: 60, qualified: 30, converted: 18, lost: 10, unqualified: 5, open: 27, qualified_pct: 50, conversion_pct: 30, share_of_leads_pct: 100, avg_days_to_convert: 9.6, avg_score: 65.2, won_value: 770000, revenue_per_lead: 12833, cost_per_lead: 67, total_cost: 4000, cost_per_converted: 222 }),
  from: '2026-08-12T00:00:00.000Z', to: '2026-11-10T23:59:59.999Z',
};

const fu = (o: Record<string, unknown>) => ({ owner_id: null, owner: 'x', due: 0, on_time: 0, late: 0, overdue: 0, upcoming: 0, done_untimed: 0, compliance_pct: null, avg_days_late: null, avg_days_overdue: null, ...o });
export const FOLLOWUP_COMPLIANCE = {
  rows: [
    fu({ owner_id: 'u1', owner: 'Asha', due: 10, on_time: 6, late: 2, overdue: 2, compliance_pct: 60, avg_days_late: 1.5, avg_days_overdue: 4.2 }),
    fu({ owner_id: 'u2', owner: 'Ravi', due: 8, on_time: 4, late: 1, overdue: 0, upcoming: 3, compliance_pct: 80, avg_days_late: 2, avg_days_overdue: null }),
  ],
  totals: fu({ owner: 'Everyone', due: 18, on_time: 10, late: 3, overdue: 2, upcoming: 3, compliance_pct: 66.7, avg_days_late: 1.7, avg_days_overdue: 4.2 }),
  trend: [
    { week: '2026-11-02', due: 12, on_time: 7, late: 2, overdue: 2, upcoming: 1, compliance_pct: 63.6 },
    { week: '2026-11-09', due: 6, on_time: 3, late: 1, overdue: 0, upcoming: 2, compliance_pct: 75 },
  ],
};

const wl = (o: Record<string, unknown>) => ({ owner_id: null, owner: 'x', open_leads: 0, share_of_open_pct: null, new_leads: 0, never_touched: 0, idle_7d: 0, idle_14d: 0, idle_30d: 0, avg_open_age_days: null, overdue_followups: 0, first_touch_leads: 0, median_first_touch_minutes: null, sla_breach_pct: null, ...o });
export const OWNER_WORKLOAD = {
  rows: [
    wl({ owner_id: 'u1', owner: 'Asha', open_leads: 30, share_of_open_pct: 60, new_leads: 9, never_touched: 3, idle_7d: 8, idle_14d: 5, idle_30d: 2, avg_open_age_days: 21.4, overdue_followups: 4, first_touch_leads: 8, median_first_touch_minutes: 95, sla_breach_pct: 25 }),
    wl({ owner_id: 'u2', owner: 'Ravi', open_leads: 20, share_of_open_pct: 40, new_leads: 6, never_touched: 1, idle_7d: 3, idle_14d: 1, idle_30d: 0, avg_open_age_days: 12, overdue_followups: 1, first_touch_leads: 6, median_first_touch_minutes: 30, sla_breach_pct: 0 }),
  ],
  totals: wl({ owner: 'Everyone', open_leads: 50, share_of_open_pct: 100, new_leads: 15, never_touched: 4, idle_7d: 11, idle_14d: 6, idle_30d: 2, avg_open_age_days: 17.5, overdue_followups: 5, first_touch_leads: 14, median_first_touch_minutes: 62, sla_breach_pct: 14.3 }),
  sla_minutes: 60,
};

const sv = (o: Record<string, unknown>) => ({ stage_id: 'x', stage: 'x', position: 0, stage_type: 'open', deals_entered: 0, completed_stays: 0, avg_days: null, median_days: null, max_days: null, current_deals: 0, current_value: 0, avg_current_age_days: null, slow_current_deals: 0, ...o });
export const STAGE_VELOCITY = {
  pipeline_id: 'p1', pipelines: [{ id: 'p1', name: 'Sales', is_default: true }, { id: 'p2', name: 'Renewals', is_default: false }],
  rows: [
    sv({ stage_id: 'a', stage: 'Lead', position: 0, deals_entered: 10, completed_stays: 8, avg_days: 6.5, median_days: 7, max_days: 10, current_deals: 2, current_value: 200000, avg_current_age_days: 9.5, slow_current_deals: 1 }),
    sv({ stage_id: 'b', stage: 'Proposal', position: 1, deals_entered: 8, completed_stays: 5, avg_days: 10, median_days: 9, max_days: 20, current_deals: 3, current_value: 450000, avg_current_age_days: 15, slow_current_deals: 0 }),
    sv({ stage_id: 'c', stage: 'Won', position: 2, stage_type: 'won', deals_entered: 4 }),
  ],
  totals: { open_deals: 5, open_value: 650000, typical_days_through_open_stages: 16.5 },
};

const mx = (o: Record<string, unknown>) => ({ owner_id: null, owner: 'x', total: 0, calls: 0, emails: 0, meetings: 0, site_visits: 0, tasks: 0, notes: 0, messages: 0, other: 0, completed: 0, completion_pct: null, calls_with_outcome: 0, calls_connected: 0, connect_rate_pct: null, active_days: 0, avg_per_active_day: null, ...o });
export const ACTIVITY_MIX = {
  rows: [
    mx({ owner_id: 'u1', owner: 'Asha', total: 50, calls: 30, emails: 10, meetings: 5, site_visits: 2, tasks: 3, completed: 40, completion_pct: 80, calls_with_outcome: 20, calls_connected: 10, connect_rate_pct: 50, active_days: 10, avg_per_active_day: 5 }),
    mx({ owner_id: 'u2', owner: 'Ravi', total: 30, calls: 10, emails: 8, meetings: 4, site_visits: 4, tasks: 2, notes: 2, completed: 15, completion_pct: 50, calls_with_outcome: 5, calls_connected: 1, connect_rate_pct: 20, active_days: 6, avg_per_active_day: 5 }),
  ],
  totals: mx({ owner: 'Everyone', total: 80, calls: 40, emails: 18, meetings: 9, site_visits: 6, tasks: 5, notes: 2, completed: 55, completion_pct: 68.8, calls_with_outcome: 25, calls_connected: 11, connect_rate_pct: 44, active_days: 12, avg_per_active_day: 6.7 }),
  by_type: [{ type: 'Calls', count: 40 }, { type: 'Emails', count: 18 }, { type: 'Meetings', count: 9 }],
  by_week: [{ week: '2026-11-02', total: 50, calls: 25, completed: 35 }, { week: '2026-11-09', total: 30, calls: 15, completed: 20 }],
};

export const CONVERSION_TIME = {
  totals: { converted: 4, avg_days: 14.6, median_days: 4.5, p90_days: 49, fastest_days: 0.5, slowest_days: 49 },
  buckets: [{ bucket: '<1d', count: 1 }, { bucket: '1–3d', count: 1 }, { bucket: '4–7d', count: 1 }, { bucket: '8–14d', count: 0 }, { bucket: '15–30d', count: 0 }, { bucket: '31–60d', count: 1 }, { bucket: '60d+', count: 0 }],
  by_owner: [{ key: 'u1', label: 'Asha', converted: 2, avg_days: 3.8, median_days: 3.8 }, { key: 'u2', label: 'Ravi', converted: 2, avg_days: 25.5, median_days: 25.5 }],
  by_source: [{ key: 's1', label: 'Website', converted: 3, avg_days: 5.2, median_days: 4 }, { key: 's2', label: 'Referral', converted: 1, avg_days: 49, median_days: 49 }],
  by_month: [{ key: '2026-10', label: '2026-10', converted: 4, avg_days: 14.6, median_days: 4.5 }],
};

export const WEIGHTED_PIPELINE = {
  rows: [
    { stage_id: 'a', stage: 'Lead', position: 0, deals: 2, value: 150000, weighted_value: 20000, avg_deal_size: 75000, avg_age_days: 9.5, past_close_date: 1 },
    { stage_id: 'b', stage: 'Proposal', position: 1, deals: 2, value: 200000, weighted_value: 120000, avg_deal_size: 100000, avg_age_days: 30, past_close_date: 0 },
  ],
  totals: { deals: 4, value: 350000, weighted_value: 140000, weighted_pct_of_value: 40, past_close_date: 1, past_close_value: 100000 },
};

export const DEAL_SIZE = {
  rows: [
    { bucket: 'Under ₹10K', deals: 1, won: 0, lost: 0, open: 1, value: 5000, win_rate_pct: null },
    { bucket: '₹10K–50K', deals: 2, won: 1, lost: 1, open: 0, value: 50000, win_rate_pct: 50 },
    { bucket: '₹1L–5L', deals: 1, won: 1, lost: 0, open: 0, value: 250000, win_rate_pct: 100 },
  ],
  totals: { deals: 4, with_amount: 4, avg_amount: 76250, median_amount: 35000, largest_amount: 250000 },
};

export const WIN_RATE_TREND = {
  rows: [
    { month: '2026-09', won: 1, lost: 0, closed: 1, win_rate_pct: 100, won_value: 100, lost_value: 0 },
    { month: '2026-10', won: 2, lost: 1, closed: 3, win_rate_pct: 66.7, won_value: 500, lost_value: 50 },
    { month: '2026-11', won: 0, lost: 0, closed: 0, win_rate_pct: null, won_value: 0, lost_value: 0 },
  ],
  totals: { won: 3, lost: 1, closed: 4, win_rate_pct: 75 }, months: 3,
};

export const CALL_TREND = {
  rows: [
    { week: '2026-10-26', calls: 2, with_outcome: 1, connected: 1, connect_rate_pct: 100 },
    { week: '2026-11-02', calls: 3, with_outcome: 3, connected: 1, connect_rate_pct: 33.3 },
    { week: '2026-11-09', calls: 1, with_outcome: 0, connected: 0, connect_rate_pct: null },
  ],
  totals: { calls: 6, with_outcome: 4, connected: 2, connect_rate_pct: 50 }, weeks: 3,
};

export const LEAD_RECYCLING = {
  rows: [{ month: '2026-10', moved_to_lost: 1, reopened: 1 }, { month: '2026-11', moved_to_lost: 1, reopened: 1 }],
  totals: { moved_to_lost: 2, reopened: 2, distinct_leads_reopened: 2, converted_after_reopen: 1 }, months: 2,
};

/** endpoint name (under /crm/analytics/) -> payload */
export const PLUS_PAYLOADS: Record<string, unknown> = {
  'source-performance': SOURCE_PERFORMANCE, 'followup-compliance': FOLLOWUP_COMPLIANCE, 'owner-workload': OWNER_WORKLOAD,
  'stage-velocity': STAGE_VELOCITY, 'activity-mix': ACTIVITY_MIX, 'conversion-time': CONVERSION_TIME, 'weighted-pipeline': WEIGHTED_PIPELINE,
  'deal-size-distribution': DEAL_SIZE, 'win-rate-trend': WIN_RATE_TREND, 'call-connect-trend': CALL_TREND, 'lead-recycling': LEAD_RECYCLING,
};

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Served {
  /** Every analytics request URL, in order. */
  requests: string[];
  /** Bodies of PUT /crm/dashboard-layouts/analytics. */
  layoutSaves: Array<Record<string, any>>;
  /** Swap what an endpoint answers from now on (undefined = back to the payload it started with). */
  set: (name: string, reply: unknown | ((u: URL) => unknown) | undefined) => void;
  /** Make an endpoint answer with an HTTP error. */
  fail: (name: string, status?: number) => void;
}

export interface ServeOptions {
  payloads?: Record<string, unknown>;
  settings?: unknown;
  layout?: { widgets: unknown[]; layouts?: Record<string, unknown> };
  user?: Record<string, unknown>;
  /** Handle any other request first (deal / lead / user lists for the older client-side reports). Return true if handled. */
  extra?: (route: Route, url: URL, method: string) => Promise<boolean> | boolean;
}

/** Seed a session and intercept the API: the plus endpoints, the dashboard layout, and CRM settings. */
export async function serve(page: Page, opts: ServeOptions = {}): Promise<Served> {
  const base: Record<string, unknown> = { ...PLUS_PAYLOADS, ...(opts.payloads ?? {}) };
  const overrides = new Map<string, unknown>();
  const failures = new Map<string, number>();
  const served: Served = {
    requests: [], layoutSaves: [],
    set: (name, reply) => { if (reply === undefined) overrides.delete(name); else overrides.set(name, reply); failures.delete(name); },
    fail: (name, status = 500) => { failures.set(name, status); },
  };
  await seedSession(page, opts.user as any);
  await mockApi(page, {
    settings: opts.settings,
    onRequest: async (route: Route, url: string, method: string) => {
      const u = new URL(url);
      if (opts.extra && (await opts.extra(route, u, method))) return true;
      const m = /\/api\/v1\/crm\/analytics\/([^/]+)$/.exec(u.pathname);
      if (m && method === 'GET') {
        served.requests.push(u.pathname + u.search);
        const name = m[1];
        if (failures.has(name)) { await route.fulfill({ status: failures.get(name)!, json: { success: false, error: 'Boom' } }); return true; }
        const has = overrides.has(name) || name in base;
        if (has) {
          const r = overrides.has(name) ? overrides.get(name) : base[name];
          await route.fulfill({ json: { success: true, data: typeof r === 'function' ? (r as (u: URL) => unknown)(u) : r } });
          return true;
        }
        return false;
      }
      if (/\/api\/v1\/crm\/dashboard-layouts\/analytics$/.test(u.pathname)) {
        if (method === 'GET') {
          await route.fulfill({ json: { success: true, data: { widgets: opts.layout?.widgets ?? [], layouts: opts.layout?.layouts ?? {} } } });
          return true;
        }
        if (method === 'PUT') {
          const body = route.request().postDataJSON();
          served.layoutSaves.push(body);
          await route.fulfill({ json: { success: true, data: body } });
          return true;
        }
      }
      return false;
    },
  });
  return served;
}

/** Settings payload with built-in field overrides (key `entity.field`). */
export const settingsWith = (overrides: Record<string, unknown>) => ({ success: true, data: { business_type: 'both', config: { field_overrides: overrides } } });

/** Read a Playwright download as text. */
export async function readDownload(download: import('@playwright/test').Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

/** Minimal CSV parser (quotes, doubled quotes, commas, newlines) for assertions. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** True when the page itself scrolls sideways (a table scrolling inside its own container does not count). */
export async function pageScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}
