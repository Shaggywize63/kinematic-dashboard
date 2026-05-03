'use client';

import { useEffect, useRef } from 'react';
import { getSupabase } from '../lib/supabase';

/**
 * Subscribe the supervisor view to live `public.attendance` changes (INSERT
 * / UPDATE) for the caller's org. On any event, fires the supplied
 * `onChange` callback — typically the page's existing `load()` so the row
 * gets merged through the regular state pipeline (with all enrichments).
 *
 * Falls back to a no-op if NEXT_PUBLIC_SUPABASE_ANON_KEY isn't configured
 * — the page's existing 15s visible-tab poll continues to work.
 */
export function useRealtimeAttendance(onChange: () => void): void {
  // Latest ref so the callback can change without resubscribing.
  const cb = useRef(onChange);
  useEffect(() => { cb.current = onChange; }, [onChange]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    // Single channel covers attendance + breaks; postgres_changes events
    // are filtered by RLS on the server, so we only get rows the JWT can read.
    const channel = sb
      .channel('attendance-team-view')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => { cb.current(); })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'breaks' },
        () => { cb.current(); })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, []);
}
