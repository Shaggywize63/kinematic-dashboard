import api from './api';

// Typed client for the KINI website-chatbot conversations surface.
//
// The public marketing site (kinematicapp.com) runs the KINI chatbot; each
// conversation + any lead it captures is stored by the backend and surfaced
// here so the team can read exactly what visitors asked and how KINI replied.
//
// Backend base path /api/v1/crm/web-chats (bearer auth + X-Org-Id auto-attached
// by ./api). These endpoints return their payload directly (not { success, data }).

const BASE = '/api/v1/crm/web-chats';

function qs(params?: Record<string, string | number | undefined | null>): string {
  if (!params) return '';
  const filtered = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)] as [string, string]);
  if (!filtered.length) return '';
  return '?' + new URLSearchParams(Object.fromEntries(filtered)).toString();
}

export type WebChatStatus = 'active' | 'lead_captured' | 'closed' | string;

export interface WebChatTurn {
  role: 'visitor' | 'kini';
  content: string;
  ts?: string;
}

// Row shape for the list table (denormalised for display).
export interface WebChatRow {
  id: string;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  visitor_company: string | null;
  interest: string | null;
  page_path: string | null;
  page_title: string | null;
  status: WebChatStatus;
  message_count: number;
  lead_id: string | null;
  last_seen_at: string;
  created_at: string;
}

// Full session detail (list row + transcript + attribution).
export interface WebChatDetail extends WebChatRow {
  team_size: string | null;
  city: string | null;
  preferred_time: string | null;
  page_url: string | null;
  referrer_url: string | null;
  landing_page: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  transcript: WebChatTurn[];
  lead_created_at: string | null;
  user_agent: string | null;
  first_seen_at: string;
  updated_at: string;
}

export interface WebChatListResult {
  rows: WebChatRow[];
  total: number;
}

export const webChatsApi = {
  async list(params?: { limit?: number; offset?: number; search?: string }): Promise<WebChatListResult> {
    // Normalise defensively: during a backend rollout (or if the endpoint ever
    // returns an unexpected shape) `rows` could be absent — always hand callers
    // a real array so `rows.length` / `rows.map` can't throw.
    // noCache: this is a live admin view. The default GET path is
    // stale-while-revalidate backed by localStorage, so a page that first
    // loaded while the table was empty would keep showing that stale empty
    // list (revalidating only in the background). Always fetch fresh.
    const raw = await api.get<unknown>(`${BASE}${qs(params)}`, { noCache: true } as RequestInit);
    const p = unwrap(raw) as Partial<WebChatListResult> | undefined;
    return {
      rows: Array.isArray(p?.rows) ? p!.rows! : [],
      total: typeof p?.total === 'number' ? p!.total! : 0,
    };
  },
  async get(id: string): Promise<WebChatDetail> {
    const raw = await api.get<unknown>(`${BASE}/${id}`, { noCache: true } as RequestInit);
    return unwrap(raw) as WebChatDetail;
  },
};

// The CRM API router wraps every response as `{ success: true, data: <body> }`.
// Unwrap that envelope (tolerating an already-unwrapped body) so callers get
// the real payload regardless of shape.
function unwrap(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>) && 'success' in (raw as Record<string, unknown>)) {
    return (raw as { data: unknown }).data;
  }
  return raw;
}

// ── Display helpers ─────────────────────────────────────────────────────────

export const webChatStatusMeta: Record<string, { label: string; bg: string; fg: string }> = {
  active:        { label: 'Active',   bg: 'rgba(59,130,246,0.14)', fg: '#3B82F6' },
  lead_captured: { label: 'Lead',     bg: 'rgba(10,138,78,0.14)',  fg: '#0A8A4E' },
  closed:        { label: 'Closed',   bg: 'rgba(107,114,128,0.14)', fg: '#6B7280' },
};

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
