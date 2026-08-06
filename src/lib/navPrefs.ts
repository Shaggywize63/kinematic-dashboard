'use client';
import { useCallback, useEffect, useState } from 'react';

/**
 * Per-user sidebar customisation: the order of nav sections and the order of
 * items within each section. Stored in localStorage keyed by the signed-in
 * user's id (mirrors crmViewPrefs' per-scope slots) so two people sharing a
 * browser profile don't inherit each other's layout.
 *
 * The stored order is a *hint*, applied on top of whatever sections/items the
 * user is actually entitled to see (entitlement filtering still runs first in
 * the layout). New items/sections the user gains later append after the
 * remembered ones; items/sections they lose are simply skipped. That keeps a
 * saved order stable across releases without ever hiding something.
 */

export interface NavPrefs {
  /** Ordered section labels. */
  sectionOrder: string[];
  /** section label → ordered item hrefs within that section. */
  itemOrder: Record<string, string[]>;
}

export const EMPTY_NAV_PREFS: NavPrefs = { sectionOrder: [], itemOrder: {} };

function storageKey(userId: string | null): string {
  return `kinematic_nav_prefs:${userId ?? 'anon'}`;
}

function read(userId: string | null): NavPrefs {
  if (typeof window === 'undefined') return EMPTY_NAV_PREFS;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return EMPTY_NAV_PREFS;
    const parsed = JSON.parse(raw);
    const sectionOrder = Array.isArray(parsed?.sectionOrder)
      ? parsed.sectionOrder.filter((s: unknown) => typeof s === 'string')
      : [];
    const itemOrder: Record<string, string[]> = {};
    if (parsed?.itemOrder && typeof parsed.itemOrder === 'object') {
      for (const [k, v] of Object.entries(parsed.itemOrder)) {
        if (Array.isArray(v)) itemOrder[k] = v.filter((x) => typeof x === 'string') as string[];
      }
    }
    return { sectionOrder, itemOrder };
  } catch {
    return EMPTY_NAV_PREFS;
  }
}

function write(userId: string | null, prefs: NavPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch { /* ignore quota / disabled storage */ }
}

/** Stable reorder: items named in `order` come first in that order; anything
 *  not named keeps its original relative position, appended after. Never drops
 *  or duplicates an element. */
function stableApply<T>(items: T[], order: string[], keyOf: (t: T) => string): T[] {
  if (!order.length) return items;
  const rank = new Map(order.map((k, i) => [k, i]));
  const seen = new Set<string>();
  const named: T[] = [];
  const rest: T[] = [];
  for (const it of items) {
    const k = keyOf(it);
    if (rank.has(k) && !seen.has(k)) { named.push(it); seen.add(k); }
    else rest.push(it);
  }
  named.sort((a, b) => (rank.get(keyOf(a))! - rank.get(keyOf(b))!));
  return [...named, ...rest];
}

/**
 * Apply a user's saved order to the (already entitlement-filtered) nav groups.
 * Generic over the group/item shape so the layout can pass its own objects.
 */
export function applyNavOrder<
  I extends { href: string },
  G extends { label: string; items: I[] },
>(groups: G[], prefs: NavPrefs): G[] {
  const orderedGroups = stableApply(groups, prefs.sectionOrder, (g) => g.label);
  return orderedGroups.map((g) => {
    const order = prefs.itemOrder[g.label];
    if (!order || !order.length) return g;
    return { ...g, items: stableApply(g.items, order, (i) => i.href) };
  });
}

/**
 * Hook: load + persist the current user's nav prefs. `userId` should be the
 * signed-in user's id (null before it resolves — we key on 'anon' then and
 * re-read once it arrives).
 */
export function useNavPrefs(userId: string | null): {
  prefs: NavPrefs;
  save: (next: NavPrefs) => void;
  reset: () => void;
} {
  const [prefs, setPrefs] = useState<NavPrefs>(EMPTY_NAV_PREFS);

  useEffect(() => {
    setPrefs(read(userId));
    // Keep in sync across tabs.
    const handler = (e: StorageEvent) => {
      if (e.key === storageKey(userId)) setPrefs(read(userId));
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [userId]);

  const save = useCallback((next: NavPrefs) => {
    setPrefs(next);
    write(userId, next);
  }, [userId]);

  const reset = useCallback(() => {
    setPrefs(EMPTY_NAV_PREFS);
    write(userId, EMPTY_NAV_PREFS);
  }, [userId]);

  return { prefs, save, reset };
}
