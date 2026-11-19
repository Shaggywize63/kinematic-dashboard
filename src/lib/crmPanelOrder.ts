'use client';
import { useCallback, useEffect, useState } from 'react';
import { getStoredUser } from './auth';
import { crmPanelPrefs, type PanelPage } from './crmAnalyticsExtApi';

function storageKey(page: string, userId: string | null): string {
  return `kinematic_panel_order:${page}:${userId ?? 'anon'}`;
}

function readUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return getStoredUser()?.id ?? null;
  } catch {
    return null;
  }
}

function read(page: string, userId: string | null): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(page, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k: unknown): k is string => typeof k === 'string') : null;
  } catch {
    return null;
  }
}

function write(page: string, userId: string | null, order: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(page, userId), JSON.stringify(order));
  } catch {}
}

/**
 * Per-user panel order for a CRM detail page (`crm_panel_prefs` via
 * `crmPanelPrefs`). `defaultOrder` is the page's own built-in panel
 * sequence (panel ids the page defines, not server data) — the returned
 * `order` always includes every id from `defaultOrder`: the user's saved
 * ones first in their chosen sequence, then any id missing from what they
 * saved (never reordered yet, or added to the page after they last saved)
 * appended in the page's own default order. Callers render whichever of
 * these ids they currently have a panel for and ignore the rest, so a
 * stale/renamed id in a save just drops out.
 */
export function usePanelOrder(page: PanelPage, defaultOrder: string[]): {
  order: string[];
  setOrder: (next: string[]) => void;
} {
  const [userId, setUserId] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[] | null>(null);

  useEffect(() => {
    const uid = readUserId();
    setUserId(uid);
    setSaved(read(page, uid));

    let cancelled = false;
    (async () => {
      try {
        const res = await crmPanelPrefs.get(page);
        const serverOrder = res?.data?.order;
        if (cancelled || !Array.isArray(serverOrder) || serverOrder.length === 0) return;
        setSaved(serverOrder);
        write(page, uid, serverOrder);
      } catch {
        // Offline or the request failed — keep showing the local cache.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const merged = !saved || saved.length === 0
    ? defaultOrder
    : [...saved.filter((id) => defaultOrder.includes(id)), ...defaultOrder.filter((id) => !saved.includes(id))];

  const setOrder = useCallback((next: string[]) => {
    setSaved(next);
    write(page, userId, next);
    crmPanelPrefs.save(page, { order: next }).catch(() => {});
  }, [page, userId]);

  return { order: merged, setOrder };
}
