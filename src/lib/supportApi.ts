// Support tickets (Help & Support / Support inbox). A client company raises tickets from the dashboard (or WhatsApp /
// the app); the platform operator works every customer's tickets from the same page. Contract: /api/v1/support.

import api from './api';

export type TicketStatus = 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketCategory = 'how_to' | 'bug' | 'data' | 'billing' | 'feature_request' | 'other';
export type TicketChannel = 'whatsapp' | 'dashboard' | 'app';

export interface Ticket {
  id: string;
  /** Human reference, e.g. "KM-5001". */
  ref: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  subject: string;
  description: string;
  channel: TicketChannel;
  org_id: string | null;
  org_name: string | null;
  project_key: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  raised_by_user_id: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface TicketEvent {
  id: string;
  ticket_id: string;
  kind: 'created' | 'status' | 'comment';
  author_type: 'customer' | 'team' | 'system';
  author_name: string | null;
  from_status: TicketStatus | null;
  to_status: TicketStatus | null;
  body: string | null;
  created_at: string;
}

/** What happened to the WhatsApp message to the customer after an operator update / reply. */
export interface CustomerNotified {
  whatsapp: 'sent' | 'template' | 'skipped' | 'failed';
  note?: string;
}

/** `active` = open + in progress + waiting on customer (the server's default). */
export type StatusFilter = TicketStatus | 'active' | 'all';

export interface TicketList {
  tickets: Ticket[];
  is_operator: boolean;
  counts: Partial<Record<TicketStatus, number>>;
}

export interface TicketThread {
  ticket: Ticket;
  /** Oldest first. */
  events: TicketEvent[];
  customer_notified?: CustomerNotified;
}

export interface NewTicket {
  subject: string;
  description: string;
  category?: TicketCategory;
  priority?: TicketPriority;
}

export interface TicketPatch {
  status?: TicketStatus;
  priority?: TicketPriority;
  note?: string;
}

// Field limits enforced by the server; checked client-side first so the form can say what is wrong.
export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 150;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 5000;

export const ACTIVE_STATUSES: readonly TicketStatus[] = ['open', 'in_progress', 'waiting_on_customer'];
export const ALL_STATUSES: readonly TicketStatus[] = ['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'];
export const PRIORITIES: readonly TicketPriority[] = ['low', 'normal', 'high', 'urgent'];

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  how_to: 'How-to question',
  bug: "Something's not working (bug)",
  data: 'Data looks wrong',
  billing: 'Billing',
  feature_request: 'Feature request',
  other: 'Other',
};
/** Short category names for list rows. */
export const CATEGORY_SHORT: Record<TicketCategory, string> = {
  how_to: 'How-to', bug: 'Bug', data: 'Data', billing: 'Billing', feature_request: 'Feature request', other: 'Other',
};
export const PRIORITY_LABEL: Record<TicketPriority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
export const CHANNEL_LABEL: Record<TicketChannel, string> = { whatsapp: 'WhatsApp', dashboard: 'Dashboard', app: 'App' };

/** Status names; "waiting on customer" reads as "waiting on you" to the customer themselves. */
export function statusLabel(s: TicketStatus | null | undefined, isOperator: boolean): string {
  switch (s) {
    case 'open': return 'Open';
    case 'in_progress': return 'In progress';
    case 'waiting_on_customer': return isOperator ? 'Waiting on customer' : 'Waiting on you';
    case 'resolved': return 'Resolved';
    case 'closed': return 'Closed';
    default: return '—';
  }
}

export const isDone = (s: TicketStatus) => s === 'resolved' || s === 'closed';

/**
 * The message to show for a failed support call. The server answers errors as `{ success: false, error: "<message>" }`
 * (400 / 403 / 404); the api client already lifts that string into the thrown Error's message, and an axios-style
 * `response.data.error` (string or `{ message }`) is read too, the same way other pages do.
 */
export function supportError(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { error?: unknown } }; message?: unknown } | null;
  const body = err?.response?.data?.error;
  if (typeof body === 'string' && body) return body;
  if (body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string') return (body as { message: string }).message;
  if (typeof err?.message === 'string' && err.message && err.message !== 'Request failed') return err.message;
  return fallback;
}

/** `{ success, data }` → data; anything else as it is. */
const unwrap = <T,>(r: unknown): T => {
  const o = r as { data?: T } | null;
  return (o && typeof o === 'object' && 'data' in o ? o.data : r) as T;
};
// Ticket state changes from both sides; never serve a list or thread from the GET cache.
const FRESH = { noCache: true } as RequestInit;
const BASE = '/api/v1/support/tickets';

export const supportApi = {
  async list(status: StatusFilter, q?: string): Promise<TicketList> {
    const qs = new URLSearchParams({ status });
    if (q && q.trim()) qs.set('q', q.trim());
    const d = unwrap<Partial<TicketList>>(await api.get(`${BASE}?${qs.toString()}`, FRESH)) || {};
    return {
      tickets: Array.isArray(d.tickets) ? d.tickets : [],
      is_operator: !!d.is_operator,
      counts: d.counts && typeof d.counts === 'object' ? d.counts : {},
    };
  },
  async create(body: NewTicket): Promise<Ticket> {
    return unwrap<Ticket>(await api.post(BASE, body));
  },
  async get(id: string): Promise<TicketThread> {
    return normaliseThread(unwrap<TicketThread>(await api.get(`${BASE}/${encodeURIComponent(id)}`, FRESH)));
  },
  async comment(id: string, body: string): Promise<TicketThread> {
    return normaliseThread(unwrap<TicketThread>(await api.post(`${BASE}/${encodeURIComponent(id)}/comments`, { body })));
  },
  async update(id: string, patch: TicketPatch): Promise<TicketThread> {
    return normaliseThread(unwrap<TicketThread>(await api.patch(`${BASE}/${encodeURIComponent(id)}`, patch)));
  },
};

function normaliseThread(t: TicketThread): TicketThread {
  return { ...t, events: Array.isArray(t?.events) ? t.events : [] };
}
