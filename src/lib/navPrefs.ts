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

/**
 * How the whole left menu is laid out. A per-user choice:
 *  - 'workspace' (default) — the current switcher: a dropdown scopes the menu
 *    to one area, so only that area's pages show.
 *  - 'classic' — every section expanded at once, full labels (the traditional
 *    full sidebar).
 *  - 'rail' — a narrow icon-only rail of every section, one click per page.
 */
export type NavLayout = 'workspace' | 'classic' | 'rail';
export const NAV_LAYOUTS: NavLayout[] = ['workspace', 'classic', 'rail'];
export const DEFAULT_NAV_LAYOUT: NavLayout = 'workspace';
const isNavLayout = (v: unknown): v is NavLayout => NAV_LAYOUTS.includes(v as NavLayout);

export interface NavPrefs {
  /** Ordered section labels. */
  sectionOrder: string[];
  /** section label → ordered item hrefs within that section. */
  itemOrder: Record<string, string[]>;
  /** Pinned item hrefs, shown in a Pinned shortcut list above the workspace,
   *  visible whatever area the user is in. Optional so older callers that build
   *  a `{ sectionOrder, itemOrder }` (e.g. the menu customiser) still type-check;
   *  the layout preserves it across those saves. */
  pinned?: string[];
  /** The chosen menu layout. Optional for the same back-compat reason as
   *  `pinned`; absent means the default ('workspace'). */
  layout?: NavLayout;
}

export const EMPTY_NAV_PREFS: NavPrefs = { sectionOrder: [], itemOrder: {}, pinned: [], layout: DEFAULT_NAV_LAYOUT };

/** Dispatched after any save so EVERY useNavPrefs instance in the SAME tab
 *  re-reads. The native `storage` event only fires in OTHER tabs, so without
 *  this a change made on the Settings page (same document as the dashboard
 *  shell) would not reach the live sidebar until a reload. */
const NAV_PREFS_EVENT = 'kinematic:nav-prefs';

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
    const pinned = Array.isArray(parsed?.pinned)
      ? parsed.pinned.filter((s: unknown) => typeof s === 'string')
      : [];
    const layout = isNavLayout(parsed?.layout) ? parsed.layout : DEFAULT_NAV_LAYOUT;
    return { sectionOrder, itemOrder, pinned, layout };
  } catch {
    return EMPTY_NAV_PREFS;
  }
}

function write(userId: string | null, prefs: NavPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch { /* ignore quota / disabled storage */ }
  // Notify same-tab listeners (the native `storage` event only reaches other tabs).
  try { window.dispatchEvent(new CustomEvent(NAV_PREFS_EVENT, { detail: { userId } })); }
  catch { /* ignore */ }
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
    // Keep in sync across tabs (native storage event) AND within this tab (our
    // custom event), so a change on the Settings page reaches the live sidebar.
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(userId)) setPrefs(read(userId));
    };
    const onSameTab = (e: Event) => {
      const uid = (e as CustomEvent<{ userId: string | null }>).detail?.userId;
      if (uid === undefined || uid === userId) setPrefs(read(userId));
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(NAV_PREFS_EVENT, onSameTab as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(NAV_PREFS_EVENT, onSameTab as EventListener);
    };
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
