/**
 * Client wrapper for /api/v1/crm/verified-senders and
 * /api/v1/crm/email-alerts. Mirrors the route shapes in the backend.
 */
import api from './api';

export interface VerifiedSender {
  id: string;
  email: string;
  display_name: string | null;
  verified_at: string | null;
  is_default: boolean;
  created_at: string;
}

export interface EmailAlert {
  id: string;
  name: string;
  template_id: string | null;
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  cc_emails: string[] | null;
  bcc_emails: string[] | null;
  scheduled_at: string | null;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  sent_at: string | null;
  recipients_total: number;
  recipients_sent: number;
  recipients_failed: number;
  created_at: string;
  error: string | null;
}

export interface CreateAlertInput {
  name: string;
  template_id?: string | null;
  from_email: string;
  from_name?: string | null;
  to_emails: string[];
  cc_emails?: string[] | null;
  bcc_emails?: string[] | null;
  subject_override?: string | null;
  body_override?: string | null;
  variables?: Record<string, string> | null;
  scheduled_at?: string | null;
}

const senders = '/api/v1/crm/verified-senders';
const alerts = '/api/v1/crm/email-alerts';

export const verifiedSendersApi = {
  list: (verifiedOnly = false) =>
    api.get<{ data: VerifiedSender[] }>(`${senders}${verifiedOnly ? '?verified=1' : ''}`),
  add: (email: string, display_name?: string) =>
    api.post<{ data: VerifiedSender }>(senders, { email, display_name }),
  remove: (id: string) => api.delete<void>(`${senders}/${id}`),
  setDefault: (id: string) => api.post<void>(`${senders}/${id}/default`, {}),
};

export const emailAlertsApi = {
  list: () => api.get<{ data: EmailAlert[] }>(alerts),
  get: (id: string) => api.get<{ data: EmailAlert }>(`${alerts}/${id}`),
  create: (input: CreateAlertInput) => api.post<{ data: EmailAlert }>(alerts, input),
  cancel: (id: string) => api.post<void>(`${alerts}/${id}/cancel`, {}),
  sendNow: (id: string) => api.post<void>(`${alerts}/${id}/send-now`, {}),
};
