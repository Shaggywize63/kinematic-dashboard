// Support tickets (Help & Support / Support inbox). A client company raises tickets from the dashboard (or WhatsApp /
// the app); the platform operator works every customer's tickets from the same page. Contract: /api/v1/support.

import api from './api';

export type TicketStatus =
  | 'open' | 'triaged' | 'in_progress' | 'waiting_on_customer' | 'release_pending'
  | 'resolved' | 'closed' | 'rejected';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
/** The ticket's type: what the customer is asking for. */
export type TicketCategory =
  | 'how_to' | 'issue' | 'bug' | 'change_request' | 'new_module'
  | 'data_correction' | 'billing' | 'access_request' | 'training' | 'other';
/** Where the customer hit it. A ticket may name more than one. */
export type TicketPlatform = 'web' | 'android' | 'ios' | 'whatsapp' | 'other';
/** Which part of the product it is about. */
export type TicketArea =
  | 'crm' | 'attendance' | 'distribution' | 'orders' | 'hrms' | 'payroll' | 'reports'
  | 'dashboard' | 'mobile_app' | 'whatsapp_kini' | 'admin_settings' | 'integrations' | 'billing' | 'other';
export type TicketChannel = 'whatsapp' | 'dashboard' | 'app';

export interface Ticket {
  id: string;
  /** Human reference, e.g. "KM-5001". */
  ref: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  platforms: TicketPlatform[];
  area: TicketArea | null;
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
  /** When the team first replied — what SLA reporting measures. */
  first_response_at: string | null;
  /** How the customer rated the handling, 1–5, once the ticket finished. */
  csat_rating: number | null;
  csat_comment: string | null;
  csat_at: string | null;
}

export interface TicketEvent {
  id: string;
  ticket_id: string;
  kind: 'created' | 'status' | 'comment' | 'feedback';
  author_type: 'customer' | 'team' | 'system';
  author_name: string | null;
  from_status: TicketStatus | null;
  to_status: TicketStatus | null;
  body: string | null;
  created_at: string;
}

/** What happened on each channel after an operator update / reply. */
export interface CustomerNotified {
  whatsapp: 'sent' | 'template' | 'skipped' | 'failed';
  note?: string;
  email?: 'sent' | 'skipped' | 'failed';
  email_note?: string;
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
  platforms?: TicketPlatform[];
  area?: TicketArea | null;
}

export interface TicketPatch {
  status?: TicketStatus;
  priority?: TicketPriority;
  note?: string;
  /** Triage fields — operators only; the server rejects them from a customer. */
  category?: TicketCategory;
  platforms?: TicketPlatform[];
  area?: TicketArea | null;
}

/** Narrows the list and the tab counts together. */
export interface TicketFilters {
  category?: TicketCategory | '';
  platform?: TicketPlatform | '';
  area?: TicketArea | '';
}

// Field limits enforced by the server; checked client-side first so the form can say what is wrong.
export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 150;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 5000;

export const ACTIVE_STATUSES: readonly TicketStatus[] = ['open', 'triaged', 'in_progress', 'waiting_on_customer', 'release_pending'];
export const ALL_STATUSES: readonly TicketStatus[] = [
  'open', 'triaged', 'in_progress', 'waiting_on_customer', 'release_pending', 'resolved', 'closed', 'rejected',
];
export const PRIORITIES: readonly TicketPriority[] = ['low', 'normal', 'high', 'urgent'];

/** Form order: what customers pick most, first. The keys are the server's category values. */
export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  issue: "Something isn't working",
  bug: 'Bug (a defect in the product)',
  how_to: 'How-to question',
  change_request: 'Change request (change how something works)',
  new_module: 'New module / feature request',
  data_correction: 'Data looks wrong',
  access_request: 'Access / user request',
  billing: 'Billing',
  training: 'Training',
  other: 'Other',
};
/** Short category names for list rows. */
export const CATEGORY_SHORT: Record<TicketCategory, string> = {
  issue: 'Issue', bug: 'Bug', how_to: 'How-to', change_request: 'Change request', new_module: 'New module',
  data_correction: 'Data', access_request: 'Access', billing: 'Billing', training: 'Training', other: 'Other',
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as TicketCategory[];

export const PLATFORM_LABEL: Record<TicketPlatform, string> = {
  web: 'Web', android: 'Android', ios: 'iOS', whatsapp: 'WhatsApp', other: 'Other',
};
export const PLATFORMS = Object.keys(PLATFORM_LABEL) as TicketPlatform[];

/** Generic Kinematic modules — a client's own taxonomy belongs in custom fields, not here. */
export const AREA_LABEL: Record<TicketArea, string> = {
  crm: 'CRM', attendance: 'Attendance', distribution: 'Distribution', orders: 'Orders', hrms: 'HRMS',
  payroll: 'Payroll', reports: 'Reports', dashboard: 'Dashboard', mobile_app: 'Mobile app',
  whatsapp_kini: 'WhatsApp / KINI', admin_settings: 'Admin & settings', integrations: 'Integrations',
  billing: 'Billing', other: 'Other',
};
export const AREAS = Object.keys(AREA_LABEL) as TicketArea[];

export const PRIORITY_LABEL: Record<TicketPriority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

/** What each star means, so a rating reads as words and not just a count. */
export const CSAT_LABEL: Record<number, string> = {
  1: 'Poor', 2: 'Not great', 3: 'Okay', 4: 'Good', 5: 'Excellent',
};
export const CSAT_MAX = 5;
export const CSAT_COMMENT_MAX = 2000;

export interface TicketFeedback {
  rating: number;
  comment?: string;
}
export const CHANNEL_LABEL: Record<TicketChannel, string> = { whatsapp: 'WhatsApp', dashboard: 'Dashboard', app: 'App' };

/** "Web, Android" — the platforms on a ticket, or a dash. */
export const platformsLabel = (p: TicketPlatform[] | null | undefined): string =>
  (p ?? []).map((x) => PLATFORM_LABEL[x] ?? x).join(', ') || '—';

/** Status names; "waiting on customer" reads as "waiting on you" to the customer themselves. */
export function statusLabel(s: TicketStatus | null | undefined, isOperator: boolean): string {
  switch (s) {
    case 'open': return 'Open';
    case 'triaged': return isOperator ? 'Triaged' : 'Logged';
    case 'in_progress': return 'In progress';
    case 'waiting_on_customer': return isOperator ? 'Waiting on customer' : 'Waiting on you';
    case 'release_pending': return isOperator ? 'Release pending' : 'Fix ready';
    case 'resolved': return 'Resolved';
    case 'closed': return 'Closed';
    case 'rejected': return isOperator ? 'Rejected' : 'Not planned';
    default: return '—';
  }
}

export const isDone = (s: TicketStatus) => s === 'resolved' || s === 'closed' || s === 'rejected';

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
  async list(status: StatusFilter, q?: string, filters?: TicketFilters): Promise<TicketList> {
    const qs = new URLSearchParams({ status });
    if (q && q.trim()) qs.set('q', q.trim());
    if (filters?.category) qs.set('category', filters.category);
    if (filters?.platform) qs.set('platform', filters.platform);
    if (filters?.area) qs.set('area', filters.area);
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
  /** How the customer rates a finished ticket. Re-submittable: they may change their mind. */
  async feedback(id: string, body: TicketFeedback): Promise<TicketThread> {
    return normaliseThread(unwrap<TicketThread>(await api.post(`${BASE}/${encodeURIComponent(id)}/feedback`, body)));
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
