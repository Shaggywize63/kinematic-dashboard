import { getActingAs } from './api';
import { getStoredToken } from './auth';
import { getStoredProjectKey, DEFAULT_PROJECT } from './projects';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Auth + routing headers for the raw report-download `fetch`es, which bypass
 * api.ts's interceptors. Mirrors the api client exactly so downloads behave the
 * same as every other request:
 *
 *  - **Bearer token**: the impersonation / "Login as client" token when one is
 *    active (`getActingAs().token`), else the stored session token. Using the
 *    raw stored (master) token while the session is routed to ANOTHER Supabase
 *    project — e.g. while impersonating an SRS/Tata user in the `default`
 *    project — makes the backend verify a Kinematic token against the Tata
 *    project's keys and reject it: the "Invalid or expired token" download bug.
 *  - **X-Kinematic-Project**: routes the request to the SAME project the session
 *    is on (omitted for the default project, matching api.ts).
 *  - **X-Client-Id**: the acting-as/impersonation client wins, else the global
 *    client picker (`kinematic_selected_client`).
 */
export function reportFetchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const acting = getActingAs();

  const token = acting?.token || getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  if (typeof window === 'undefined') return headers;

  try {
    const project = getStoredProjectKey();
    if (project && project !== DEFAULT_PROJECT) headers['X-Kinematic-Project'] = project;
  } catch { /* ignore */ }

  const actingClient = acting?.client_id;
  if (actingClient && UUID_RE.test(actingClient)) {
    headers['X-Client-Id'] = actingClient;
  } else {
    try {
      const sel = window.localStorage.getItem('kinematic_selected_client');
      if (sel && UUID_RE.test(sel)) headers['X-Client-Id'] = sel;
    } catch { /* ignore */ }
  }

  return headers;
}
