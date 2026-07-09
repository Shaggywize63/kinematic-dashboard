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
  list(params?: { limit?: number; offset?: number; search?: string }): Promise<WebChatListResult> {
    return api.get<WebChatListResult>(`${BASE}${qs(params)}`);
  },
  get(id: string): Promise<WebChatDetail> {
    return api.get<WebChatDetail>(`${BASE}/${id}`);
  },
};

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
