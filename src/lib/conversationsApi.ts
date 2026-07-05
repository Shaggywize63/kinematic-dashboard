import api from './api';

// Typed client for the Conversation Intelligence API — the manager-facing
// "Conversation Analysis" surface. Recording happens on mobile (a Consumer
// Champion records a consented call); the backend transcribes + diarizes +
// runs the insight model, and the dashboard reads the finished analysis.
//
// Backend base path /api/v1/crm/conversations (bearer auth + X-Org-Id /
// X-Client-Id auto-attached by ./api). Every response is wrapped { success, data }.

type Wrapped<T> = { success: boolean; data: T };

const BASE = '/api/v1/crm';

function qs(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return '';
  const filtered = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)] as [string, string]);
  if (!filtered.length) return '';
  return '?' + new URLSearchParams(Object.fromEntries(filtered)).toString();
}

// ── Types ──────────────────────────────────────────────────────────────────

// A conversation moves through these states: it is `pending` while queued,
// `processing` while transcription / insight generation runs, `complete` once
// insights are ready, and `failed` if the pipeline errored. Unknown values are
// tolerated (typed as string fallback) so a new backend status never breaks
// the list.
export type ConversationStatus = 'pending' | 'processing' | 'complete' | 'failed' | string;

// Row shape returned by the manager list endpoint (denormalised for display —
// champion + lead names/city are joined server-side so the table needs no
// extra lookups).
export interface ConversationRow {
  id: string;
  status: ConversationStatus;
  created_at: string;
  duration_seconds: number | null;
  language: string | null;
  champion_name: string | null;
  employee_id: string | null;
  lead_id: string | null;
  lead_name: string | null;
  lead_city: string | null;
  intent: string | null;
  intent_score: number | null;
  sentiment: string | null;
  summary: string | null;
  // Some list responses also carry the recorder's user_id so the UI can
  // filter by champion without a second round-trip. Optional so the strict
  // shape above stays authoritative.
  user_id?: string | null;
}

// One diarized utterance — a labelled speaker turn with start/end offsets (in
// seconds) into the recording.
export interface DiarSegment {
  speaker: string;
  text: string;
  start?: number | null;
  end?: number | null;
}

// Structured analysis produced by the insight model. Every field is optional —
// a partial or early-generation record may only populate a subset.
export interface ConversationInsights {
  summary?: string;
  intent?: {
    stage?: string;
    score?: number;
    signals?: string[];
  };
  sentiment?: {
    overall?: string;
    trajectory?: string;
  };
  positives?: string[];
  improvements?: string[];
  objections?: Array<{ type?: string; handled?: boolean; note?: string }>;
  competitors?: Array<{ name?: string; context?: string }>;
  commitments?: string[];
  extracted?: {
    grade?: string;
    quantity_tonnes?: number | string;
    budget?: number | string;
    timeline?: string;
    project_stage?: string;
    decision_maker?: string;
  };
  coaching?: {
    talk_listen_ratio?: number | string;
    missed_questions?: string[];
    tips?: string[];
  };
  next_action?: string;
  draft_followup?: string;
  risk_flags?: string[];
}

// Full record returned by the detail endpoint.
export interface ConversationDetail {
  id: string;
  lead_id: string | null;
  user_id: string | null;
  status: ConversationStatus;
  transcript: string | null;
  diarization: DiarSegment[] | null;
  insights: ConversationInsights | null;
  audio_url: string | null;
  consent_captured: boolean | null;
  duration_seconds: number | null;
  language: string | null;
  created_at: string;
  // Denormalised display fields — mirror the list row so a detail opened via a
  // deep link still has names to render. Optional; the list already carries them.
  champion_name?: string | null;
  employee_id?: string | null;
  lead_name?: string | null;
  lead_city?: string | null;
}

export interface ListConversationsParams {
  limit?: number;
  // Filter to a single Consumer Champion (the recorder). Applied server-side.
  user_id?: string;
  // Free-text search (lead name / champion). Applied server-side where supported.
  q?: string;
  status?: ConversationStatus;
}

// Aggregated insight analytics for the manager charts (all server-computed from
// real analyzed calls — empty series come back empty, never fabricated).
export interface ConversationAnalytics {
  window_days: number;
  totals: {
    total: number; analyzed: number; reps: number; leads: number;
    avg_intent_score: number | null; avg_talk_pct: number | null;
    risk_calls: number; commitment_calls: number;
  };
  intent_stages: Array<{ key: string; count: number }>;
  sentiment: Array<{ key: 'positive' | 'neutral' | 'negative'; count: number }>;
  trajectory: Array<{ key: 'improved' | 'flat' | 'declined'; count: number }>;
  objections: Array<{ type: string; count: number; well: number; partially: number; poor: number }>;
  handling: { well: number; partially: number; poor: number };
  competitors: Array<{ name: string; count: number }>;
  timeline: Array<{ date: string; count: number; avg_score: number | null }>;
  reps: Array<{
    user_id: string; name: string; calls: number;
    avg_intent_score: number | null; avg_talk_pct: number | null;
    positive: number; neutral: number; negative: number;
  }>;
}

export interface AnalyticsParams {
  user_id?: string;
  city?: string;
  days?: number;
}

// ── API surface ──────────────────────────────────────────────────────────────

export const conversationsApi = {
  // Manager list — newest-first is the backend default; pass limit to widen.
  list: (params?: ListConversationsParams) =>
    api.get<Wrapped<ConversationRow[]>>(`${BASE}/conversations${qs({ limit: 100, ...params })}`),

  // Full record incl. transcript, diarization, insights + audio.
  get: (id: string) => api.get<Wrapped<ConversationDetail>>(`${BASE}/conversations/${id}`),

  // Lead-scoped list — compact history for a single lead's detail page.
  forLead: (leadId: string) =>
    api.get<Wrapped<ConversationRow[]>>(`${BASE}/leads/${leadId}/conversations`),

  // Aggregated insight analytics for the manager "Analytics" tab. `city` is
  // auto-appended by the global city scope; pass user_id / days to filter.
  analytics: (params?: AnalyticsParams) =>
    api.get<Wrapped<ConversationAnalytics>>(`${BASE}/conversations/analytics${qs({ ...params })}`),
};

// Convenience wrappers mirroring the task's named contract.
export const listConversations = (params?: ListConversationsParams) => conversationsApi.list(params);
export const getConversation = (id: string) => conversationsApi.get(id);

// ── Shared UI helpers ────────────────────────────────────────────────────────

export const CONVERSATION_STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  complete:   { bg: 'rgba(34,197,94,0.14)',  fg: '#22c55e', label: 'Complete' },
  processing: { bg: 'rgba(234,179,8,0.14)',   fg: '#eab308', label: 'Processing' },
  pending:    { bg: 'rgba(148,163,184,0.16)', fg: 'var(--text-dim)', label: 'Pending' },
  failed:     { bg: 'rgba(239,68,68,0.14)',   fg: '#ef4444', label: 'Failed' },
};

export function statusMeta(status: ConversationStatus): { bg: string; fg: string; label: string } {
  return (
    CONVERSATION_STATUS_COLORS[status] || {
      bg: 'var(--s3)',
      fg: 'var(--text-dim)',
      label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown',
    }
  );
}

// Green (positive) → amber (neutral) → red (negative) for a sentiment string.
export function sentimentColor(sentiment?: string | null): { bg: string; fg: string } {
  const s = (sentiment || '').toLowerCase();
  if (/(positive|good|warm|high|hot)/.test(s)) return { bg: 'rgba(34,197,94,0.14)', fg: '#22c55e' };
  if (/(negative|poor|cold|low|bad|angry|frustrat)/.test(s)) return { bg: 'rgba(239,68,68,0.14)', fg: '#ef4444' };
  return { bg: 'rgba(234,179,8,0.14)', fg: '#eab308' };
}

// A 0–100 intent score → colour band. Falls back to neutral when absent.
export function intentColor(score?: number | null): { bg: string; fg: string } {
  if (score == null) return { bg: 'var(--s3)', fg: 'var(--text-dim)' };
  if (score >= 70) return { bg: 'rgba(34,197,94,0.14)', fg: '#22c55e' };
  if (score >= 40) return { bg: 'rgba(234,179,8,0.14)', fg: '#eab308' };
  return { bg: 'rgba(239,68,68,0.14)', fg: '#ef4444' };
}

// Seconds → "m:ss" (or "—"). Purely presentational.
export function fmtDuration(seconds?: number | null): string {
  if (seconds == null || isNaN(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Offset seconds → "m:ss" timestamp for a diarization segment start.
export function fmtOffset(seconds?: number | null): string {
  if (seconds == null || isNaN(seconds)) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default conversationsApi;
