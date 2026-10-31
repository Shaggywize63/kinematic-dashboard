import { getRequestClientId } from './api';

// The connected-B2B client (Spark & Ray). The expense clarification/account/form
// UI and the Form-Builder expense toggle are shown only when this client is the
// one the dashboard is currently scoped to; every other tenant is unchanged.
// Mirrors the backend gate in Kinematic/src/lib/b2bClients.ts.
export const SPARK_CLIENT_ID = 'c0218852-0a19-4dd0-b9fa-72f9e32ed0d8';

/** True when the dashboard is currently scoped to the connected-B2B client. */
export function isB2bClientActive(): boolean {
  return (getRequestClientId() || '').toLowerCase() === SPARK_CLIENT_ID;
}
