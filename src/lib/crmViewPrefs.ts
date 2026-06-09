'use client';
import { useCallback, useEffect, useState } from 'react';

export type ViewMode = 'table' | 'cards';

export interface ViewPrefs {
  hidden: string[];
  mode: ViewMode;
}

const DEFAULT_PREFS: ViewPrefs = { hidden: [], mode: 'table' };

function storageKey(entity: string, clientId: string | null): string {
  return `kinematic_view_prefs:${entity}:${clientId ?? 'default'}`;
}

function readClient(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem('kinematic_selected_client');
  } catch {
    return null;
  }
}

function read(entity: string, clientId: string | null): ViewPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(storageKey(entity, clientId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      hidden: Array.isArray(parsed?.hidden) ? parsed.hidden.filter((k: unknown) => typeof k === 'string') : [],
      mode: parsed?.mode === 'cards' ? 'cards' : 'table',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function write(entity: string, clientId: string | null, prefs: ViewPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(entity, clientId), JSON.stringify(prefs));
  } catch {}
}

/**
 * Per-entity, per-client view preferences (hidden columns + table/card mode).
 * Each client_id gets its own slot so multi-tenant operators don't get
 * stuck with another tenant's layout when they switch clients.
 */
export function useViewPrefs(entity: string): {
  prefs: ViewPrefs;
  setHidden: (next: string[]) => void;
  toggleHidden: (key: string) => void;
  setMode: (mode: ViewMode) => void;
  reset: () => void;
} {
  const [clientId, setClientId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<ViewPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    const cid = readClient();
    setClientId(cid);
    setPrefs(read(entity, cid));
  }, [entity]);

  // React to client switches made in the global header.
  useEffect(() => {
    const handler = () => {
      const cid = readClient();
      setClientId(cid);
      setPrefs(read(entity, cid));
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [entity]);

  const persist = useCallback((next: ViewPrefs) => {
    setPrefs(next);
    write(entity, clientId, next);
  }, [entity, clientId]);

  const setHidden = useCallback((next: string[]) => persist({ ...prefs, hidden: next }), [persist, prefs]);
  const toggleHidden = useCallback((key: string) => {
    const set = new Set(prefs.hidden);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    persist({ ...prefs, hidden: Array.from(set) });
  }, [persist, prefs]);
  const setMode = useCallback((mode: ViewMode) => persist({ ...prefs, mode }), [persist, prefs]);
  const reset = useCallback(() => persist(DEFAULT_PREFS), [persist]);

  return { prefs, setHidden, toggleHidden, setMode, reset };
}
