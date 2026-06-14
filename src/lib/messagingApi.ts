/**
 * Client wrapper for /api/v1/messaging — inbox, team chat, @mentions,
 * web-push subscription. Mirrors the shape returned by the Express
 * handlers in src/routes/messaging.routes.ts on the backend.
 */
import api from './api';

export interface ScopedUser {
  id: string;
  full_name: string | null;
  email: string;
  city_names: string[];
}

export interface ThreadMember {
  id: string;
  name: string;
}

export interface ThreadRow {
  id: string;
  kind: 'dm' | 'team';
  name: string | null;
  // "John Doe" for DMs, the team title (or member-name fallback) for
  // team chats. Server-side hydrated so the FE doesn't have to resolve
  // member uuids to names.
  display_name: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  member_ids: string[];
  members: ThreadMember[];
  created_at: string;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_name?: string;
  body: string;
  language: string | null;
  created_at: string;
}

const base = '/api/v1/messaging';

export const messagingApi = {
  searchMentions: (q: string) =>
    api.get<{ data: ScopedUser[] }>(`${base}/mentions/search?q=${encodeURIComponent(q)}`),

  listThreads: () =>
    api.get<{ data: ThreadRow[] }>(`${base}/threads`),

  createDm: (other_user_id: string) =>
    api.post<{ data: { id: string } }>(`${base}/threads/dm`, { other_user_id }),

  createTeam: (name: string, member_ids: string[]) =>
    api.post<{ data: { id: string } }>(`${base}/threads/team`, { name, member_ids }),

  listMessages: (threadId: string, limit = 100) =>
    api.get<{ data: MessageRow[] }>(`${base}/threads/${threadId}/messages?limit=${limit}`),

  sendMessage: (threadId: string, body: string, language?: string) =>
    api.post<{ data: MessageRow }>(`${base}/threads/${threadId}/messages`, { body, language }),

  markRead: (threadId: string) =>
    api.post<void>(`${base}/threads/${threadId}/read`, {}),

  getVapidPublicKey: () =>
    api.get<{ data: { publicKey: string | null } }>(`${base}/push/vapid-public-key`),

  subscribePush: (endpoint: string, keys: { p256dh: string; auth: string }, user_agent?: string) =>
    api.post<{ ok: true }>(`${base}/push/subscribe`, { endpoint, keys, user_agent }),

  unsubscribePush: (endpoint: string) =>
    api.delete<void>(`${base}/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`),

  auditMessages: (since?: string) =>
    api.get<{ data: AuditMessageRow[] }>(`${base}/audit/messages${since ? `?since=${encodeURIComponent(since)}` : ''}`),

  auditMentions: () =>
    api.get<{ data: AuditMentionRow[] }>(`${base}/audit/mentions`),

  // Full conversation drill-down — super-admin only. Returns the thread
  // metadata + every message hydrated with sender names.
  auditThread: (id: string) =>
    api.get<{ data: AuditThreadDetail }>(`${base}/audit/threads/${id}`),
};

export interface AuditMessageRow {
  id: string;
  org_id: string;
  org_name: string | null;
  thread_id: string;
  thread_title: string | null;
  thread_kind: 'dm' | 'team' | null;
  sender_id: string;
  sender_name: string | null;
  body: string;
  language: string | null;
  created_at: string;
}

export interface AuditMentionRow {
  id: string;
  org_id: string;
  org_name: string | null;
  source_kind: 'lead_update' | 'activity' | 'message';
  source_id: string;
  mentioner_id: string;
  mentioner_name: string | null;
  mentioned_user_id: string;
  mentioned_name: string | null;
  created_at: string;
}

export interface AuditThreadDetail {
  id: string;
  org_id: string;
  org_name: string | null;
  kind: 'dm' | 'team';
  title: string;
  name: string | null;
  members: ThreadMember[];
  created_at: string | null;
  last_message_at: string | null;
  messages: Array<{
    id: string;
    sender_id: string;
    sender_name: string;
    body: string;
    language: string | null;
    created_at: string;
  }>;
}
