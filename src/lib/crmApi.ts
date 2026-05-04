import api from './api';
import type {
  Lead,
  Contact,
  Account,
  Deal,
  DealHistoryEntry,
  Pipeline,
  Stage,
  Activity,
  Note,
  Task,
  EmailTemplate,
  EmailLog,
  LeadSource,
  AssignmentRule,
  Territory,
  Campaign,
  Automation,
  CustomField,
  ImportJob,
  LeadScore,
  NextBestAction,
  WinProbability,
  AnalyticsSummary,
  FunnelPoint,
  PipelineValuePoint,
  WinRatePoint,
  ForecastPoint,
  ActivityHeatPoint,
  SourceROIRow,
  ScoreDistributionPoint,
  KiniContext,
  KiniCard,
} from '../types/crm';

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
};

export const crmContacts = crud<Contact>(`${BASE}/contacts`);
export const crmAccounts = crud<Account>(`${BASE}/accounts`);

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
};

export const crmPipelines = crud<Pipeline>(`${BASE}/pipelines`);
export const crmStages = crud<Stage>(`${BASE}/stages`);

export const crmActivities = {
  ...crud<Activity>(`${BASE}/activities`),
  calendar: (params: { from: string; to: string }) =>
    api.get<Wrapped<Activity[]>>(`${BASE}/activities/calendar${qs(params)}`),
};

export const crmNotes = crud<Note>(`${BASE}/notes`);
export const crmTasks = crud<Task>(`${BASE}/tasks`);
export const crmEmailTemplates = crud<EmailTemplate>(`${BASE}/email-templates`);
export const crmEmails = crud<EmailLog>(`${BASE}/emails`);
export const crmLeadSources = crud<LeadSource>(`${BASE}/lead-sources`);
export const crmAssignmentRules = crud<AssignmentRule>(`${BASE}/assignment-rules`);
export const crmTerritories = crud<Territory>(`${BASE}/territories`);
export const crmCampaigns = crud<Campaign>(`${BASE}/campaigns`);
export const crmAutomations = crud<Automation>(`${BASE}/automations`);
export const crmCustomFields = crud<CustomField>(`${BASE}/custom-fields`);

export const crmImport = {
  upload: (formData: FormData) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
    const orgRaw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
    const orgId = orgRaw ? (JSON.parse(orgRaw)?.org_id ?? null) : null;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (orgId) headers['X-Org-Id'] = orgId;
    return fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${BASE}/import/upload`, {
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

export const crmAnalytics = {
  dashboardSummary: (range?: DateRangeParams) =>
    api.get<Wrapped<AnalyticsSummary>>(`${BASE}/analytics/dashboard-summary${qs(range)}`),
  pipelineValue: (range?: DateRangeParams) =>
    api.get<Wrapped<PipelineValuePoint[]>>(`${BASE}/analytics/pipeline-value${qs(range)}`),
  funnel: (range?: DateRangeParams) =>
    api.get<Wrapped<FunnelPoint[]>>(`${BASE}/analytics/funnel${qs(range)}`),
  winRate: (by: 'rep' | 'source' | 'stage' = 'rep', range?: DateRangeParams) =>
    api.get<Wrapped<WinRatePoint[]>>(`${BASE}/analytics/win-rate${qs({ by, ...range })}`),
  salesCycle: (range?: DateRangeParams) =>
    api.get<Wrapped<Array<{ stage: string; avg_days: number }>>>(`${BASE}/analytics/sales-cycle${qs(range)}`),
  forecast: (period: 'month' | 'quarter' = 'quarter', range?: DateRangeParams) =>
    api.get<Wrapped<ForecastPoint[]>>(`${BASE}/analytics/forecast${qs({ period, ...range })}`),
  activityHeatmap: () =>
    api.get<Wrapped<ActivityHeatPoint[]>>(`${BASE}/analytics/activity-heatmap`),
  leadSourceRoi: () =>
    api.get<Wrapped<SourceROIRow[]>>(`${BASE}/analytics/lead-source-roi`),
  leadScoreDistribution: (range?: DateRangeParams) =>
    api.get<Wrapped<ScoreDistributionPoint[]>>(`${BASE}/analytics/lead-score-distribution${qs(range)}`),
};

export const crmAi = {
  scoreLead: (id: string) => api.post<Wrapped<LeadScore>>(`${BASE}/ai/score-lead/${id}`, {}),
  draftReply: (body: { lead_id?: string; deal_id?: string; thread?: string; tone?: string; goal?: string }) =>
    api.post<Wrapped<{ subject: string; body_html: string; body_text: string }>>(
      `${BASE}/ai/draft-reply`,
      body
    ),
  nextBestAction: (dealId: string) =>
    api.post<Wrapped<NextBestAction>>(`${BASE}/ai/next-best-action/${dealId}`, {}),
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
  get: () => api.get<Wrapped<Record<string, unknown>>>(`${BASE}/settings`),
  update: (body: Record<string, unknown>) =>
    api.patch<Wrapped<Record<string, unknown>>>(`${BASE}/settings`, body),
  seedDefaults: () => api.post<Wrapped<{ seeded: number }>>(`${BASE}/settings/seed-defaults`, {}),
};

const crmApi = {
  leads: crmLeads,
  contacts: crmContacts,
  accounts: crmAccounts,
  deals: crmDeals,
  pipelines: crmPipelines,
  stages: crmStages,
  activities: crmActivities,
  notes: crmNotes,
  tasks: crmTasks,
  emailTemplates: crmEmailTemplates,
  emails: crmEmails,
  leadSources: crmLeadSources,
  assignmentRules: crmAssignmentRules,
  territories: crmTerritories,
  campaigns: crmCampaigns,
  automations: crmAutomations,
  customFields: crmCustomFields,
  import: crmImport,
  analytics: crmAnalytics,
  ai: crmAi,
  settings: crmSettings,
};

export default crmApi;
