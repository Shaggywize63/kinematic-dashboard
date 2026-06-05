import api, { resolveApiUrl } from './api';
import type {
  Lead, Contact, Account, Deal, DealContact, DealHistoryEntry,
  Pipeline, Stage, Activity, Note, Task,
  EmailTemplate, EmailLog,
  LeadSource, AssignmentRule, Territory, Automation, CustomField,
  ImportJob, LeadScore, NextBestAction, WinProbability,
  AnalyticsSummary, FunnelPoint, PipelineValuePoint, WinRatePoint, ForecastPoint,
  ActivityHeatPoint, SourceROIRow, ScoreDistributionPoint, StateCount,
  KiniContext, KiniCard,
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
export type ActivityView = 'all' | 'overdue' | 'upcoming' | 'completed';

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

export const crmActivities = {
  ...crud<Activity>(`${BASE}/activities`),
  calendar: (params: { from: string; to: string }) =>
    api.get<Wrapped<Activity[]>>(`${BASE}/activities/calendar${qs(params)}`),
};

// Per-FE / per-hierarchy-level daily lead targets. Managers read/set.
export interface TargetsState {
  default_target: number;
  per_level: Array<{ hierarchy_level_id: string; target_value: number }>;
  per_user: Array<{ user_id: string; target_value: number }>;
}
export interface MyTarget { metric: string; period: string; target: number; achieved: number; }
export const crmTargets = {
  get: () => api.get<Wrapped<TargetsState>>(`${BASE}/targets`),
  mine: () => api.get<Wrapped<MyTarget>>(`${BASE}/targets/me`),
  set: (body: { user_id?: string | null; hierarchy_level_id?: string | null; target_value: number; all?: boolean }) =>
    api.put<Wrapped<unknown>>(`${BASE}/targets`, body),
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
};

export const crmSettings = {
  get: () => api.get<Wrapped<CrmSettings>>(`${BASE}/settings`),
  update: (body: { config?: Record<string, unknown>; business_type?: BusinessType }) =>
    api.patch<Wrapped<CrmSettings>>(`${BASE}/settings`, body),
  seedDefaults: () => api.post<Wrapped<{ seeded: number }>>(`${BASE}/settings/seed-defaults`, {}),
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
