import type { Lead } from '../../../types/crm';

// Step 1 added these columns server-side but the shared Lead type doesn't carry
// them yet. Read defensively without forcing a global type change.
export type LifecycleLead = Lead & {
  lost_reason?: string | null;
  disqualified_at?: string | null;
  /** Stamped server-side on insert. Drives the edit gate. */
  created_by?: string | null;
  last_activity_at?: string | null;
  latest_update?: string | null;
  latest_update_at?: string | null;
  score_breakdown?: unknown;
};

export type UserOption = { id: string; name: string };

export type LeadTab = 'overview' | 'timeline' | 'deals' | 'insights';
