'use client';
import { useCallback, useEffect, useState } from 'react';
import { getStoredUser } from './auth';
import { crmListViewPrefs, type ListViewEntity } from './crmAnalyticsExtApi';

// 'kanban' is a valid value the backend can store (crmListViewPrefs /
// crm_list_view_prefs.config.mode) for forward-compat with a future board
// view, but no UI offers it yet — isMode() below still only accepts the
// two modes ViewCustomizer actually renders, falling back to 'table' for
// anything else (including a 'kanban' value saved by a future client).
export type ViewMode = 'table' | 'cards';

export interface ViewPrefs {
  hidden: string[];
  mode: ViewMode;
}

const DEFAULT_PREFS: ViewPrefs = { hidden: [], mode: 'table' };

/** Entities the backend actually persists prefs for (see Kinematic's crm.routes.ts /list-view-prefs). */
const SYNCED_ENTITIES = new Set<string>(['leads', 'deals', 'accounts', 'contacts', 'activities']);

function storageKey(entity: string, userId: string | null): string {
  return `kinematic_view_prefs:${entity}:${userId ?? 'anon'}`;
}

function isMode(v: unknown): v is ViewMode {
  return v === 'table' || v === 'cards';
}

function readUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return getStoredUser()?.id ?? null;
  } catch {
    return null;
  }
}

function read(entity: string, userId: string | null): ViewPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(storageKey(entity, userId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      hidden: Array.isArray(parsed?.hidden) ? parsed.hidden.filter((k: unknown) => typeof k === 'string') : [],
      mode: isMode(parsed?.mode) ? parsed.mode : 'table',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function write(entity: string, userId: string | null, prefs: ViewPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(entity, userId), JSON.stringify(prefs));
  } catch {}
}

/**
 * Per-user view preferences (hidden columns + table/cards/kanban mode) for a
 * CRM list page. Reads instantly from a localStorage cache keyed by user id
 * (no flash on load), then reconciles against the backend
 * (`crmListViewPrefs`, Kinematic's `crm_list_view_prefs` table) so a user's
 * choice follows them across browsers and devices — unlike the old
 * per-browser, per-client-only cache this replaces. Every mutation is
 * written to the local cache immediately and synced to the backend in the
 * background.
 */
export function useViewPrefs(entity: string): {
  prefs: ViewPrefs;
  setHidden: (next: string[]) => void;
  toggleHidden: (key: string) => void;
  setMode: (mode: ViewMode) => void;
  reset: () => void;
} {
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<ViewPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    const uid = readUserId();
    setUserId(uid);
    setPrefs(read(entity, uid));

    if (!SYNCED_ENTITIES.has(entity)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await crmListViewPrefs.get(entity as ListViewEntity);
        const server = res?.data;
        if (cancelled || !server) return;
        const next: ViewPrefs = {
          hidden: Array.isArray(server.hidden) ? server.hidden.filter((k) => typeof k === 'string') : [],
          mode: isMode(server.mode) ? server.mode : 'table',
        };
        setPrefs(next);
        write(entity, uid, next);
      } catch {
        // Offline or the request failed — keep showing the local cache; try again next load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entity]);

  // A change saved from another tab (same user, same browser) shows up here too.
  useEffect(() => {
    const key = storageKey(entity, userId);
    const handler = (e: StorageEvent) => {
      if (e.key !== key) return;
      setPrefs(read(entity, userId));
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [entity, userId]);

  const persist = useCallback((next: ViewPrefs) => {
    setPrefs(next);
    write(entity, userId, next);
    if (SYNCED_ENTITIES.has(entity)) {
      crmListViewPrefs.save(entity as ListViewEntity, next).catch(() => {});
    }
  }, [entity, userId]);

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
