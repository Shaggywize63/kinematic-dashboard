// Browser-side Supabase client. Used for Realtime channels (attendance team
// view, etc.) — never for arbitrary REST against tables (auth + RLS would
// permit it but we route writes through our backend so RBAC + audit_log
// + idempotency stay in one place).

'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfigForCurrentProject, getStoredProjectKey } from './projects';

let _client: SupabaseClient | null = null;
let _clientProject: string | null = null;

/**
 * Singleton Supabase client. Creates lazily on first call so SSR + bundling
 * never tries to spin up a websocket. Pulls the user's access_token from
 * localStorage and forwards it with every Realtime connection so RLS
 * SELECT policies see the right JWT (org_id, role). The URL + anon key follow
 * the current session's project (multi-project routing), and the singleton is
 * rebuilt if the project changes (e.g. logging in as a user on another project).
 */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;

  const project = getStoredProjectKey();
  if (_client && _clientProject === project) return _client;

  const { url: SUPABASE_URL, anonKey: SUPABASE_ANON } = supabaseConfigForCurrentProject();

  if (!SUPABASE_URL || !SUPABASE_ANON) {
    // No project config in env → realtime disabled. Surface a single warn so
    // the dashboard still works (falls back to polling).
    // eslint-disable-next-line no-console
    console.warn('[supabase] Supabase URL/anon key missing for project; realtime disabled');
    return null;
  }

  _clientProject = project;
  _client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });

  // Authenticate the realtime websocket with the user's access token from
  // localStorage so RLS sees the right org_id / role on the channel.
  try {
    const tok = window.localStorage.getItem('kinematic_token');
    if (tok) _client.realtime.setAuth(tok);
  } catch { /* fail-soft */ }

  return _client;
}

/**
 * Refresh the realtime auth token. Call after login / token rotation so the
 * existing client picks up the new JWT.
 */
export function refreshRealtimeAuth() {
  if (typeof window === 'undefined') return;
  const c = _client;
  if (!c) return;
  try {
    const tok = window.localStorage.getItem('kinematic_token');
    if (tok) c.realtime.setAuth(tok);
  } catch {}
}
