import { getRequestClientId } from './api';
import { getStoredUser } from './auth';

// The connected-B2B client (Spark & Ray). The expense clarification/account/form
// UI, the account journey / updates, multi-assignee activities, deal quotations,
// the Spark lead fields and the Form-Builder expense toggle are shown only when
// this client is the effective one; every other tenant is unchanged.
// Mirrors the backend gate in Kinematic/src/lib/b2bClients.ts.
export const SPARK_CLIENT_ID = 'c0218852-0a19-4dd0-b9fa-72f9e32ed0d8';

/**
 * The client the dashboard is effectively working as. Order matters:
 *   1. the header client-picker selection / a super-admin's "acting as" client (getRequestClientId), then
 *   2. the signed-in user's own `client_id` — a client admin is pinned to their login and has no picker.
 * Null = org-wide (a platform / org admin with no client chosen).
 */
export function effectiveClientId(): string | null {
  const picked = getRequestClientId();
  if (picked) return picked;
  try {
    const own = getStoredUser()?.client_id;
    return typeof own === 'string' && own ? own : null;
  } catch { return null; }
}

/** True when the effective client (picker / acting-as first, else the signed-in user's client) is Spark & Ray. */
export function isB2bClientActive(): boolean {
  return (effectiveClientId() || '').toLowerCase() === SPARK_CLIENT_ID;
}
