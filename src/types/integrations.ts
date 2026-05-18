/**
 * Lead-source integration types — mirrors the backend's
 * crm_lead_source_integrations + crm_lead_inbound_events tables.
 *
 * Kept in its own file rather than crammed into types/crm.ts so the
 * integration feature stays self-contained.
 */

export type IntegrationProvider =
  | 'web_form'
  | 'generic_webhook'
  | 'meta_lead_ads'
  | 'google_ads'
  | 'zoho';

export type IntegrationStatus = 'pending' | 'active' | 'error' | 'disabled';

export interface Integration {
  id: string;
  org_id: string;
  provider: IntegrationProvider;
  label: string;
  source_id: string | null;
  status: IntegrationStatus;
  config: Record<string, unknown>;
  last_synced_at: string | null;
  last_error: string | null;
  last_event_count: number;
  created_at: string;
  updated_at: string;
  /** Only returned on the immediate-after-create response — admin must
   *  copy it before closing the success modal. Subsequent GETs strip it. */
  webhook_secret?: string;
  /** Convenience: full URL the admin pastes into the provider's webhook
   *  field (e.g. Meta App dashboard). Constructed server-side from
   *  API_PUBLIC_URL + provider slug + integration id + ?key=. */
  webhook_url?: string;
  /** The crm_lead_sources row the server auto-created and linked at
   *  integration-create time, so admins can see how inbound leads will
   *  appear in reports. */
  source?: { id: string; name: string };
}

export interface InboundEvent {
  id: string;
  received_at: string;
  provider: string;
  signature_ok: boolean | null;
  processed_at: string | null;
  lead_id: string | null;
  was_dedup: boolean | null;
  error: string | null;
}
