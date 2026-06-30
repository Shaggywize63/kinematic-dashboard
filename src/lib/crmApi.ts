import api, { resolveApiUrl } from './api';
import type {
  Lead, Contact, Account, Deal, DealContact, DealHistoryEntry,
  Pipeline, Stage, Activity, Note, Task,
  EmailTemplate, EmailLog,
  LeadSource, AssignmentRule, Territory, Automation, CustomField,
  ImportJob, LeadScore, NextBestAction, WinProbability,
  AnalyticsSummary, FunnelPoint, PipelineValuePoint, WinRatePoint, ForecastPoint,
  TeamPerformanceRow, LeadTrackerPayload, TeamDailyCard,
  ActivityHeatPoint, SourceROIRow, ScoreDistributionPoint, StateCount,
  KiniContext, KiniCard, UpdateSuggestion,
  CrmSettings, BusinessType,
  CrmState, CrmCity,
  Product, ProductCategory, DealLineItem,
  WhatsappTemplate, WhatsappLog,
} from '../types/crm';
import type { Integration, InboundEvent, IntegrationProvider } from '../types/integrations';

type Wrapped<T> = { success: boolean; data: T; pagination?: Pagination };
export interface DateRangeParams { from?: string; to?: string }

// Activity list filter views — match the backend `view` param on
// GET /crm/activities. 'overdue' / 'upcoming' / 'completed' apply
// date-based predicates on top of the existing type/status/owner
// filters. 'all' (or undefined) is the default = no extra constraint.
export type ActivityView = 'all' | 'overdue' | 'upcoming' | 'completed' | 'undated';

// Server pagination shape — returned alongside `data` on list endpoints
// that opt into pagination (currently /crm/leads + /crm/deals). Callers
// that ignore it continue to work — only the explicit `pagination`
// readers need to know it exists.
export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

function qs(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return '';
  const filtered = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)] as [string, string]);
  if (!filtered.length) return '';
  return '?' + new URLSearchParams(Object.fromEntries(filtered)).toString();
}

function crud<T, C = Partial<T>>(base: string) {
  return {
    list: (params?: Record<string, string | number | boolean | undefined | null>) =>
      api.get<Wrapped<T[]>>(`${base}${qs(params)}`),
    get: (id: string) => api.get<Wrapped<T>>(`${base}/${id}`),
    create: (body: C) => api.post<Wrapped<T>>(base, body),
    update: (id: string, body: Partial<C>) => api.patch<Wrapped<T>>(`${base}/${id}`, body),
    remove: (id: string) => api.delete<Wrapped<{ success: true }>>(`${base}/${id}`),
  };
}

const BASE = '/api/v1/crm';

export const crmLeads = {
  ...crud<Lead>(`${BASE}/leads`),
  score: (id: string) => api.post<Wrapped<LeadScore>>(`${BASE}/leads/${id}/score`, {}),
  scoreHistory: (id: string) => api.get<Wrapped<LeadScore[]>>(`${BASE}/leads/${id}/score-history`),
  activities: (id: string) => api.get<Wrapped<Activity[]>>(`${BASE}/leads/${id}/activities`),
  deals: (id: string) => api.get<Wrapped<Deal[]>>(`${BASE}/leads/${id}/deals`),
  // All geo-tagged leads (up to 5000) for the dashboard map — bypasses the
  // 200-row list cap. City is auto-attached by the api client.
  geo: () => api.get<Wrapped<Array<{ id: string; first_name?: string | null; last_name?: string | null; city?: string | null; state?: string | null; status?: string | null; latitude?: number | null; longitude?: number | null; score?: number | null; score_grade?: 'A' | 'B' | 'C' | 'D' | null }>>>(`${BASE}/leads/geo`),
  convert: (
    id: string,
    body: { create_account?: boolean; create_deal?: boolean; deal_name?: string; deal_amount?: number; account_id?: string }
  ) =>
    api.post<Wrapped<{ account_id?: string; contact_id?: string; deal_id?: string }>>(
      `${BASE}/leads/${id}/convert`,
      body
    ),
  bulkAssign: (body: { lead_ids: string[]; owner_id?: string; territory_id?: string }) =>
    api.post<Wrapped<{ updated: number }>>(`${BASE}/leads/bulk-assign`, body),
  // Bulk lat/long backfill for existing leads. Each row matches one lead by
  // id -> email -> phone (server-side, org-scoped).
  bulkCoordinates: (body: { rows: Array<{ id?: string; email?: string; phone?: string; latitude: number; longitude: number }> }) =>
    api.post<Wrapped<{ updated: number; skipped: number; errors: Array<{ row: number; reason: string }> }>>(
      `${BASE}/leads/bulk-coordinates`, body),
  // Lifecycle: disqualify with a reason and reopen.
  // Disqualify routes through the existing PATCH so the server's status-transition
  // audit + disqualified_at stamping (lead lifecycle Step 1) fires uniformly.
  disqualify: (id: string, body: { status: 'unqualified' | 'lost'; lost_reason?: string }) =>
    api.patch<Wrapped<Lead>>(`${BASE}/leads/${id}`, body),
  // Dedicated POST so the crm_lead_history row carries field='reopened' as a single
  // canonical event — reports can WHERE field='reopened' to attribute reactivations.
  reopen: (id: string, body?: { reason?: string }) =>
    api.post<Wrapped<Lead>>(`${BASE}/leads/${id}/reopen`, body || {}),
  // Append-only Updates timeline. The denormalised `latest_update` columns
  // on `crm_leads` keep the list-view column fast; this endpoint is for the
  // full per-lead history rendered on the detail page.
  updates: (id: string, params?: { limit?: number }) =>
    api.get<Wrapped<LeadUpdate[]>>(`${BASE}/leads/${id}/updates${qs(params)}`),
  addUpdate: (id: string, body: { body: string }) =>
    api.post<Wrapped<LeadUpdate>>(`${BASE}/leads/${id}/updates`, body),
  // Edit (author-only) / delete (author or admin) a single timeline entry.
  editUpdate: (id: string, updateId: string, body: { body: string }) =>
    api.patch<Wrapped<LeadUpdate>>(`${BASE}/leads/${id}/updates/${updateId}`, body),
  deleteUpdate: (id: string, updateId: string) =>
    api.delete<Wrapped<{ deleted: true }>>(`${BASE}/leads/${id}/updates/${updateId}`),
};

// Inline type for the lead Updates timeline — kept local since it's only
// consumed by this API surface + the LeadUpdatesTimeline component. If the
// shape gets shared with mobile clients we'll promote it to types/crm.ts.
export interface LeadUpdate {
  id: string;
  lead_id: string;
  org_id: string;
  client_id: string | null;
  author_id: string;
  author_name?: string | null;
  body: string;
  created_at: string;
}

export const crmContacts = {
  ...crud<Contact>(`${BASE}/contacts`),
  activities: (id: string) => api.get<Wrapped<Activity[]>>(`${BASE}/contacts/${id}/activities`),
  deals: (id: string) => api.get<Wrapped<Deal[]>>(`${BASE}/contacts/${id}/deals`),
  notes: (id: string) => api.get<Wrapped<Note[]>>(`${BASE}/contacts/${id}/notes`),
  emails: (id: string) => api.get<Wrapped<EmailLog[]>>(`${BASE}/contacts/${id}/emails`),
};

export const crmAccounts = {
  ...crud<Account>(`${BASE}/accounts`),
  contacts: (id: string) => api.get<Wrapped<Contact[]>>(`${BASE}/accounts/${id}/contacts`),
  deals: (id: string) => api.get<Wrapped<Deal[]>>(`${BASE}/accounts/${id}/deals`),
  activities: (id: string) => api.get<Wrapped<Activity[]>>(`${BASE}/accounts/${id}/activities`),
  notes: (id: string) => api.get<Wrapped<Note[]>>(`${BASE}/accounts/${id}/notes`),
  summarize: (id: string) => api.post<Wrapped<{ text: string }>>(`${BASE}/accounts/${id}/summarize`, {}),
};

export const crmDeals = {
  ...crud<Deal>(`${BASE}/deals`),
  moveStage: (id: string, body: { stage_id: string; reason?: string }) =>
    api.post<Wrapped<Deal>>(`${BASE}/deals/${id}/move-stage`, body),
  win: (id: string, body?: { close_date?: string; reason?: string }) =>
    api.post<Wrapped<Deal>>(`${BASE}/deals/${id}/win`, body || {}),
  lose: (id: string, body?: { reason?: string; competitor?: string }) =>
    api.post<Wrapped<Deal>>(`${BASE}/deals/${id}/lose`, body || {}),
  setWinProbability: (id: string, body: { probability: number }) =>
    api.post<Wrapped<Deal>>(`${BASE}/deals/${id}/win-probability`, body),
  setNextAction: (id: string, body: { action: string; due_at?: string }) =>
    api.post<Wrapped<Deal>>(`${BASE}/deals/${id}/next-action`, body),
  history: (id: string) => api.get<Wrapped<DealHistoryEntry[]>>(`${BASE}/deals/${id}/history`),
  activities: (id: string) => api.get<Wrapped<Activity[]>>(`${BASE}/deals/${id}/activities`),
  contacts: (id: string) => api.get<Wrapped<DealContact[]>>(`${BASE}/deals/${id}/contacts`),
  notes: (id: string) => api.get<Wrapped<Note[]>>(`${BASE}/deals/${id}/notes`),
  listLineItems: (dealId: string) =>
    api.get<Wrapped<DealLineItem[]>>(`${BASE}/deals/${dealId}/line-items`),
  addLineItem: (dealId: string, body: Partial<DealLineItem> & { product_id?: string | null; quantity: number }) =>
    api.post<Wrapped<DealLineItem>>(`${BASE}/deals/${dealId}/line-items`, body),
};

export const crmLineItems = {
  update: (id: string, body: Partial<DealLineItem>) =>
    api.patch<Wrapped<DealLineItem>>(`${BASE}/line-items/${id}`, body),
  remove: (id: string) =>
    api.delete<Wrapped<{ success: true }>>(`${BASE}/line-items/${id}`),
};

export const crmPipelines = crud<Pipeline>(`${BASE}/pipelines`);
export const crmStages = crud<Stage>(`${BASE}/stages`);

export interface ActivitySummary {
  total: number;
  overdue: number;
  upcoming: number;
  completed: number;
  // Rows with no due_at AND no completed_at — surfaces the "missing"
  // bucket so view-axis tiles can be a true partition of total.
  undated: number;
  by_status: {
    open: number;
    in_progress: number;
    cancelled: number;
    completed: number;
    // NULL or legacy status — surfaces rows whose status was never
    // set so reps can find and fix them.
    unset: number;
  };
}
export const crmActivities = {
  ...crud<Activity>(`${BASE}/activities`),
  calendar: (params: { from: string; to: string }) =>
    api.get<Wrapped<Activity[]>>(`${BASE}/activities/calendar${qs(params)}`),
  // Head-count summary that uses the same scope as the list. Tiles on
  // the activities page sum to total because each count is run
  // server-side instead of `.length` on the current page.
  summary: (params: Record<string, string | number | undefined> = {}) =>
    api.get<Wrapped<ActivitySummary>>(`${BASE}/activities/summary${qs(params)}`),
};

// Per-FE / per-hierarchy-level daily lead targets. Managers read/set.
export interface TargetsState {
  default_target: number;
  per_level: Array<{ hierarchy_level_id: string; target_value: number }>;
  per_user: Array<{ user_id: string; target_value: number }>;
}
export interface MyTarget { metric: string; period: string; target: number; achieved: number; }
export type LeaderboardPeriod = 'today' | 'week' | 'month';
export interface LeaderboardEntry {
  user_id: string; name: string; city: string | null;
  leads: number; target: number; pct: number | null;
}
export interface Leaderboard {
  period: LeaderboardPeriod;
  days: number;
  generated_at: string;
  stats: {
    participants: number;
    total_leads: number;
    average_leads: number;
    meeting_target: number;
    target_participants: number;
    top_performer: { name: string; leads: number } | null;
    lowest_performer: { name: string; leads: number } | null;
  };
  entries: LeaderboardEntry[];
  role_id?: string | null;
}
// ── Home aggregator ─────────────────────────────────────────────────
// Composes today's target + near-to-close leads + top 3 next-best
// actions (with reasoning) + today's activity stats + productivity
// tips into one payload so the Home page is a single round-trip.
export interface HomeNextAction {
  lead_id: string;
  lead_name: string;
  action: 'call' | 'whatsapp' | 'follow_up' | 'qualify' | 'meeting' | 'create_deal' | 'nurture';
  label: string;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
  deeplink_path: string;
  score: number | null;
  score_grade: string | null;
}
export interface HomeNearLead {
  id: string;
  name: string;
  score: number | null;
  score_grade: string | null;
  lifecycle_stage: string | null;
  status: string | null;
  last_activity_at: string | null;
  days_since_touch: number | null;
  reason: string;
}
export interface HomePayload {
  today_target: {
    has_target: boolean;
    achieved: number;
    target: number;
    progress_pct: number;
    remaining: number;
    headline: string;
  };
  near_to_close: HomeNearLead[];
  next_actions: HomeNextAction[];
  today_activity: {
    total: number;
    by_type: Record<string, number>;
    last_activity_at: string | null;
  };
  productivity_tips: string[];
}
export const crmHome = {
  get: () => api.get<Wrapped<HomePayload>>(`${BASE}/home`),
};

export const crmTargets = {
  get: () => api.get<Wrapped<TargetsState>>(`${BASE}/targets`),
  mine: () => api.get<Wrapped<MyTarget>>(`${BASE}/targets/me`),
  set: (body: { user_id?: string | null; hierarchy_level_id?: string | null; target_value: number; all?: boolean }) =>
    api.put<Wrapped<unknown>>(`${BASE}/targets`, body),
  leaderboard: (period: LeaderboardPeriod = 'today') =>
    api.get<Wrapped<Leaderboard>>(`${BASE}/targets/leaderboard${qs({ period })}`),
  // Hierarchy roles to choose from (org_roles), used by the leaderboard role picker.
  levels: () => api.get<Wrapped<Array<{ id: string; name: string }>>>(`${BASE}/targets/levels`),
  getLeaderboardRole: () => api.get<Wrapped<{ role_id: string | null }>>(`${BASE}/targets/leaderboard-role`),
  setLeaderboardRole: (role_id: string | null) =>
    api.put<Wrapped<{ role_id: string | null }>>(`${BASE}/targets/leaderboard-role`, { role_id }),
};

export const crmNotes = crud<Note>(`${BASE}/notes`);
export const crmTasks = crud<Task>(`${BASE}/tasks`);
export const crmEmailTemplates = crud<EmailTemplate>(`${BASE}/email-templates`);
export const crmEmails = crud<EmailLog>(`${BASE}/emails`);
export const crmLeadSources = crud<LeadSource>(`${BASE}/lead-sources`);
export const crmAssignmentRules = crud<AssignmentRule>(`${BASE}/assignment-rules`);
export const crmTerritories = crud<Territory>(`${BASE}/territories`);
export const crmAutomations = crud<Automation>(`${BASE}/automations`);
export const crmCustomFields = crud<CustomField>(`${BASE}/custom-fields`);

// People Directory — per-client address book sitting alongside contacts.
// Same CRUD shape as the other CRM lookups, plus /bulk-import + /export
// + an adjacent /people-directory-types catalog the admin can extend
// (Dealer / Engineer / Architect / …) without a code change.
export interface PeopleDirectoryEntry {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  type?: string | null;
  city?: string | null;
  // Tenant-supplied identifier (employee id, dealer code, etc.).
  // Tata Tiscon writes it on every person to roll up their reports.
  code?: string | null;
  created_at?: string;
  updated_at?: string;
}
export interface PeopleDirectoryType {
  id?: string;
  name: string;
  is_active?: boolean;
  position?: number;
  created_at?: string;
}
export const crmPeopleDirectory = {
  ...crud<PeopleDirectoryEntry>(`${BASE}/people-directory`),
  bulkImport: (body: {
    rows: Array<Omit<PeopleDirectoryEntry, 'id' | 'created_at' | 'updated_at'>>;
    on_duplicate: 'skip' | 'update';
  }) =>
    api.post<Wrapped<{ added: number; updated: number; skipped: number; total: number }>>(
      `${BASE}/people-directory/bulk-import`, body,
    ),
  // CSV export uses the same scope + filter as the list endpoint and
  // returns raw text. Resolves via the api client's text-bypass branch
  // (Content-Type: text/csv), which we surface to the page via
  // window.open(...) instead.
  exportUrl: (q?: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(q || {})) if (v) qs.set(k, v);
    return `${BASE}/people-directory/export${qs.toString() ? `?${qs.toString()}` : ''}`;
  },
};
export const crmPeopleDirectoryTypes = crud<PeopleDirectoryType>(`${BASE}/people-directory-types`);

// Lookup search — powers the new "linked record" custom-field picker.
// Returns up to 50 (id, label, raw) tuples from the chosen target
// table, optionally filtered by the admin-configured condition list.
export interface LookupHit { id: string; label: string; raw: Record<string, unknown> }
export const crmLookup = {
  search: (params: { target: string; q?: string; filter?: Array<{ field: string; op: string; value: unknown }>; ids?: string[] }) => {
    const qs = new URLSearchParams();
    qs.set('target', params.target);
    if (params.q) qs.set('q', params.q);
    if (params.filter && params.filter.length) qs.set('filter', JSON.stringify(params.filter));
    // Resolve-by-ids mode — the backend skips the per-user city/district
    // gate when `ids` is set so label hydration works for rows the
    // viewer can read but whose dealer/block is outside their effective
    // cities (e.g. a reassigned lead).
    if (params.ids && params.ids.length) qs.set('ids', params.ids.join(','));
    return api.get<Wrapped<LookupHit[]>>(`${BASE}/lookup/search?${qs.toString()}`);
  },
};

// Phase 2: Products + WhatsApp
export const crmProductCategories = crud<ProductCategory>(`${BASE}/product-categories`);
export const crmProducts = crud<Product>(`${BASE}/products`);
export const crmWhatsappTemplates = crud<WhatsappTemplate>(`${BASE}/whatsapp-templates`);

export const crmWhatsapp = {
  send: (body: {
    to: string;
    body_text?: string;
    template_id?: string | null;
    template_variables?: Record<string, string>;
    media_url?: string;
    media_type?: 'image' | 'document' | 'audio' | 'video' | 'sticker';
    lead_id?: string | null;
    contact_id?: string | null;
    deal_id?: string | null;
  }) => api.post<Wrapped<{ id: string }>>(`${BASE}/whatsapp/send`, body),
  logs: (params?: Record<string, string | number | boolean | undefined | null>) =>
    api.get<Wrapped<WhatsappLog[]>>(`${BASE}/whatsapp/logs${qs(params)}`),
};

// Phase 3: States + Cities
export const crmStatesApi = {
  ...crud<CrmState>(`${BASE}/states`),
  cities: (id: string) => api.get<Wrapped<CrmCity[]>>(`${BASE}/states/${id}/cities`),
  seedIndian: () => api.post<Wrapped<{ states: number; cities: number }>>(`${BASE}/states/seed-indian`, {}),
};

export const crmCitiesApi = crud<CrmCity>(`${BASE}/cities`);

export const crmImport = {
  upload: (formData: FormData) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
    const orgRaw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
    const orgId = orgRaw ? (JSON.parse(orgRaw)?.org_id ?? null) : null;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (orgId) headers['X-Org-Id'] = orgId;
    return fetch(`${resolveApiUrl()}${BASE}/import/upload`, {
      method: 'POST',
      body: formData,
      headers,
    }).then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || d.message || 'Upload failed');
      return d as Wrapped<ImportJob>;
    });
  },
  preview: (body: { job_id: string; mapping: Record<string, string> }) =>
    api.post<Wrapped<{ job: ImportJob; sample: Array<Record<string, unknown>> }>>(
      `${BASE}/import/preview`,
      body
    ),
  commit: (body: { job_id: string }) =>
    api.post<Wrapped<ImportJob>>(`${BASE}/import/commit`, body),
  getJob: (id: string) => api.get<Wrapped<ImportJob>>(`${BASE}/import/jobs/${id}`),
  listJobs: () => api.get<Wrapped<ImportJob[]>>(`${BASE}/import/jobs`),
};

// Activity bulk import — same three-stage shape as crmImport above,
// but pointed at the /import/activities/* endpoints so the backend
// can use the activity-specific resolver (lead/contact/deal/account
// by id, email, or phone) instead of the lead dedup orchestrator.
export const crmActivityImport = {
  upload: (formData: FormData) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
    const orgRaw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
    const orgId = orgRaw ? (JSON.parse(orgRaw)?.org_id ?? null) : null;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (orgId) headers['X-Org-Id'] = orgId;
    return fetch(`${resolveApiUrl()}${BASE}/import/activities/upload`, {
      method: 'POST',
      body: formData,
      headers,
    }).then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || d.message || 'Upload failed');
      return d as Wrapped<ImportJob>;
    });
  },
  preview: (body: { job_id: string; mapping: Record<string, string> }) =>
    api.post<Wrapped<{ mapped_sample: Array<Record<string, unknown>>; warnings: Array<{ row: number; reason: string }> }>>(
      `${BASE}/import/activities/preview`,
      body,
    ),
  commit: (body: { job_id: string }) =>
    api.post<Wrapped<ImportJob>>(`${BASE}/import/activities/commit`, body),
  getJob: (id: string) => api.get<Wrapped<ImportJob>>(`${BASE}/import/activities/jobs/${id}`),
  listJobs: () => api.get<Wrapped<ImportJob[]>>(`${BASE}/import/activities/jobs`),
};

export const crmAnalytics = {
  // `unit` swaps every monetary aggregation in the response from rupees to
  // kg derived from line items × product weight. Counts, win rate, and lead
  // score distribution are unit-independent.
  dashboardSummary: (range?: DateRangeParams, unit: 'inr' | 'weight' = 'inr') =>
    api.get<Wrapped<AnalyticsSummary>>(`${BASE}/analytics/dashboard-summary${qs({ ...range, unit })}`),
  dashboardComplete: (range?: DateRangeParams, unit: 'inr' | 'weight' = 'inr') =>
    api.get<Wrapped<{
      summary: AnalyticsSummary;
      funnel: FunnelPoint[];
      pipelineValue: PipelineValuePoint[];
      winRate: WinRatePoint[];
      forecast: ForecastPoint[];
      leadScoreDistribution: ScoreDistributionPoint[];
      unit?: 'inr' | 'weight';
    }>>(`${BASE}/analytics/dashboard-complete${qs({ ...range, unit })}`),
  pipelineValue: (range?: DateRangeParams, unit: 'inr' | 'weight' = 'inr') =>
    api.get<Wrapped<PipelineValuePoint[]>>(`${BASE}/analytics/pipeline-value${qs({ ...range, unit })}`),
  funnel: (range?: DateRangeParams) =>
    api.get<Wrapped<FunnelPoint[]>>(`${BASE}/analytics/funnel${qs({ ...range })}`),
  winRate: (by: 'rep' | 'source' | 'stage' = 'rep', range?: DateRangeParams) =>
    api.get<Wrapped<WinRatePoint[]>>(`${BASE}/analytics/win-rate${qs({ by, ...range })}`),
  // Per-rep KPI roll-up across the caller's hierarchy subtree. Drives
  // the "Team Performance" report — sticky-Total row + per-rep rows.
  teamPerformance: (range?: DateRangeParams) =>
    api.get<Wrapped<{
      total: TeamPerformanceRow;
      rows: TeamPerformanceRow[];
    }>>(`${BASE}/analytics/team-performance${qs({ ...range })}`),
  // Monthly new-lead bar chart + today/week/month summaries for the
  // caller's hierarchy subtree.
  leadTracker: (months = 6) =>
    api.get<Wrapped<LeadTrackerPayload>>(`${BASE}/analytics/lead-tracker${qs({ months })}`),
  // One card per rep for a chosen day — attendance check-in, today's
  // visits achieved vs scheduled, and leads added.
  teamDaily: (date?: string) =>
    api.get<Wrapped<TeamDailyCard[]>>(`${BASE}/analytics/team-daily${qs({ date })}`),
  salesCycle: (range?: DateRangeParams) =>
    api.get<Wrapped<Array<{ stage: string; avg_days: number }>>>(`${BASE}/analytics/sales-cycle${qs({ ...range })}`),
  forecast: (period: 'month' | 'quarter' = 'quarter', range?: DateRangeParams, unit: 'inr' | 'weight' = 'inr') =>
    api.get<Wrapped<ForecastPoint[]>>(`${BASE}/analytics/forecast${qs({ period, ...range, unit })}`),
  activityHeatmap: () =>
    api.get<Wrapped<ActivityHeatPoint[]>>(`${BASE}/analytics/activity-heatmap`),
  leadSourceRoi: () =>
    api.get<Wrapped<SourceROIRow[]>>(`${BASE}/analytics/lead-source-roi`),
  leadScoreDistribution: (range?: DateRangeParams) =>
    api.get<Wrapped<ScoreDistributionPoint[]>>(`${BASE}/analytics/lead-score-distribution${qs({ ...range })}`),
  byState: () => api.get<Wrapped<StateCount[]>>(`${BASE}/analytics/by-state`),
};

export const crmAi = {
  scoreLead: (id: string) => api.post<Wrapped<LeadScore>>(`${BASE}/ai/score-lead/${id}`, {}),
  draftReply: (body: { lead_id?: string; deal_id?: string; thread?: string; tone?: string; goal?: string }) =>
    api.post<Wrapped<{ subject: string; body_html: string; body_text: string }>>(
      `${BASE}/ai/draft-reply`,
      body
    ),
  // Purpose-built email TEMPLATE generator (KINI AI Generate). Returns a
  // ready-to-edit template with {{placeholders}} and detected variables.
  draftEmailTemplate: (body: { goal: string; tone?: string; audience?: string; language?: string }) =>
    api.post<Wrapped<{ name: string; subject: string; body_html: string; body_text: string; variables: string[]; category: string }>>(
      `${BASE}/ai/draft-email-template`,
      body
    ),
  nextBestAction: (dealId: string) =>
    api.post<Wrapped<NextBestAction>>(`${BASE}/ai/next-best-action/${dealId}`, {}),
  // Lead variant — mounted at a more-specific path so the deal route
  // (/:dealId) and the lead route (/lead/:leadId) don't collide.
  nextBestActionLead: (leadId: string) =>
    api.post<Wrapped<NextBestAction>>(`${BASE}/ai/next-best-action/lead/${leadId}`, {}),
  winProbability: (dealId: string) =>
    api.post<Wrapped<WinProbability>>(`${BASE}/ai/win-probability/${dealId}`, {}),
  summarizeAccount: (id: string) =>
    api.post<Wrapped<{ summary: string; highlights: string[] }>>(`${BASE}/ai/summarize/account/${id}`, {}),
  summarizeDeal: (id: string) =>
    api.post<Wrapped<{ summary: string; highlights: string[] }>>(`${BASE}/ai/summarize/deal/${id}`, {}),
  chat: (body: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    system?: string;
    context?: KiniContext;
  }) =>
    api.post<Wrapped<{ text: string; cards?: KiniCard[] }>>(`${BASE}/ai/chat`, body),
  // Inline ✨ Suggest on the lead-update box. Single-shot helper — does NOT
  // count against the monthly KINI chat quota.
  suggestFromUpdate: (body: { lead_id: string; draft: string }) =>
    api.post<Wrapped<UpdateSuggestion>>(`${BASE}/ai/suggest-from-update`, body),
};

export const crmSettings = {
  get: () => api.get<Wrapped<CrmSettings>>(`${BASE}/settings`),
  update: (body: { config?: Record<string, unknown>; business_type?: BusinessType }) =>
    api.patch<Wrapped<CrmSettings>>(`${BASE}/settings`, body),
  seedDefaults: () => api.post<Wrapped<{ seeded: number }>>(`${BASE}/settings/seed-defaults`, {}),
};

// ── Scheduled report digests ─────────────────────────────────────────────────
export type DigestFrequency = 'daily' | 'weekly' | 'monthly';
export interface ReportSchedule {
  id: string;
  name: string;
  report_key: string;
  config?: Record<string, unknown> | null;
  frequency: DigestFrequency;
  send_hour: number;
  day_of_week?: number | null;
  day_of_month?: number | null;
  to_emails: string[];
  is_active: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
  created_at?: string;
}
export type ReportScheduleInput = Omit<ReportSchedule, 'id' | 'last_run_at' | 'next_run_at' | 'created_at'>;

export const crmReportSchedules = {
  catalog: () => api.get<Wrapped<Array<{ key: string; label: string }>>>(`${BASE}/report-schedules/catalog`),
  list: () => api.get<Wrapped<ReportSchedule[]>>(`${BASE}/report-schedules`),
  create: (body: Partial<ReportScheduleInput>) => api.post<Wrapped<ReportSchedule>>(`${BASE}/report-schedules`, body),
  update: (id: string, body: Partial<ReportScheduleInput>) => api.patch<Wrapped<ReportSchedule>>(`${BASE}/report-schedules/${id}`, body),
  remove: (id: string) => api.delete<Wrapped<{ success: true }>>(`${BASE}/report-schedules/${id}`),
  runNow: (id: string) => api.post<Wrapped<{ sent: number; recipients: number }>>(`${BASE}/report-schedules/${id}/run-now`, {}),
};

// ── Lead-source integrations (admin) ─────────────────────────────────────────────
// Note: integrations live at /api/v1/integrations (not under /crm) on
// the backend because the public webhook ingestion routes need to be
// mounted before the auth catch-all. The dashboard surfaces them as a
// CRM Settings child page anyway — the URL doesn't need to match.
const INTEGRATIONS_BASE = '/api/v1/integrations';

export const crmIntegrations = {
  list: () => api.get<Wrapped<Integration[]>>(INTEGRATIONS_BASE),
  get: (id: string) => api.get<Wrapped<Integration>>(`${INTEGRATIONS_BASE}/${id}`),
  create: (body: {
    provider: IntegrationProvider;
    label?: string;
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
  }) => api.post<Wrapped<Integration>>(INTEGRATIONS_BASE, body),
  update: (id: string, body: {
    label?: string;
    status?: string;
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
  }) => api.patch<Wrapped<Integration>>(`${INTEGRATIONS_BASE}/${id}`, body),
  remove: (id: string) => api.delete<Wrapped<{ success: true }>>(`${INTEGRATIONS_BASE}/${id}`),
  test: (id: string) => api.post<Wrapped<{ ok: boolean; status: string }>>(`${INTEGRATIONS_BASE}/${id}/test`, {}),
  events: (id: string, limit: number = 50) =>
    api.get<Wrapped<InboundEvent[]>>(`${INTEGRATIONS_BASE}/${id}/events?limit=${limit}`),
};

const crmApi = {
  leads: crmLeads, contacts: crmContacts, accounts: crmAccounts, deals: crmDeals,
  lineItems: crmLineItems, pipelines: crmPipelines, stages: crmStages,
  activities: crmActivities, notes: crmNotes, tasks: crmTasks,
  emailTemplates: crmEmailTemplates, emails: crmEmails,
  leadSources: crmLeadSources, assignmentRules: crmAssignmentRules,
  territories: crmTerritories, automations: crmAutomations,
  customFields: crmCustomFields,
  productCategories: crmProductCategories, products: crmProducts,
  whatsappTemplates: crmWhatsappTemplates, whatsapp: crmWhatsapp,
  locations: crmStatesApi, cities: crmCitiesApi,
  import: crmImport, analytics: crmAnalytics, ai: crmAi, settings: crmSettings,
  integrations: crmIntegrations,
};

export default crmApi;
