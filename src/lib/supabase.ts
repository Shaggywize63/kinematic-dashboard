// Browser-side Supabase client. Used for Realtime channels (attendance team
// view, etc.) — never for arbitrary REST against tables (auth + RLS would
// permit it but we route writes through our backend so RBAC + audit_log
// + idempotency stay in one place).

'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://lnvxqjqfsxvtjvbzphou.supabase.co';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let _client: SupabaseClient | null = null;

/**
 * Singleton Supabase client. Creates lazily on first call so SSR + bundling
 * never tries to spin up a websocket. Pulls the user's access_token from
 * localStorage and forwards it with every Realtime connection so RLS
 * SELECT policies see the right JWT (org_id, role).
 */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (_client) return _client;

  if (!SUPABASE_ANON) {
    // No anon key in env → realtime disabled. Surface a single warn so the
    // dashboard still works (falls back to polling).
    // eslint-disable-next-line no-console
    console.warn('[supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY missing; realtime disabled');
    return null;
  }

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
