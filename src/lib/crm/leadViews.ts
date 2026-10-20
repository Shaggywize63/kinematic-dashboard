import type { LeadFiltersValue } from '../../components/crm/LeadFilters';

/**
 * Quick views — one-tap presets for the Leads list. Each is a plain patch over
 * the page's filter state, so it composes with everything else (applied chips,
 * the Filters drawer, the export) instead of being a parallel mechanism.
 *
 * Every view maps to a filter listLeads() really applies (grade, owner,
 * unassigned, followup_due, no_activity_days, created_within_days) — a chip
 * the server ignored would silently show every lead, so a new view only
 * ships together with its backend filter.
 */
export interface QuickView {
  id: string;
  label: string;
  /** Tooltip — says exactly what the chip filters on. */
  hint: string;
  patch: Partial<LeadFiltersValue>;
  /** Needs the viewer's id (the "Mine" owner filter). */
  needsMe?: boolean;
  /**
   * An owner control like the Owner dropdown: withheld from anyone who may not assign owners
   * (clients on lead_form.owner_assignment = 'admin_only'). The unowned queue is the assigner's worklist.
   */
  needsAssign?: boolean;
}

export const QUICK_VIEWS: QuickView[] = [
  { id: 'hot', label: 'Hot leads', hint: 'Score grade A', patch: { grade: 'A' } },
  { id: 'followup', label: 'Follow-up due', hint: 'An open follow-up that is due or overdue', patch: { followupDue: true } },
  { id: 'unassigned', label: 'Unassigned', hint: 'Leads with no owner yet', patch: { unassigned: true }, needsAssign: true },
  { id: 'mine', label: 'Mine', hint: 'Leads you own', patch: {}, needsMe: true },
  { id: 'quiet', label: 'Gone quiet 7d+', hint: 'No logged activity in the last 7 days', patch: { quietDays: 7 } },
  { id: 'fresh', label: 'Added this week', hint: 'Created in the last 7 days', patch: { addedDays: 7 } },
];

/** The view's patch with the viewer's id filled in (null when it cannot be built). */
export function resolvePatch(v: QuickView, myId: string | null): Partial<LeadFiltersValue> | null {
  if (v.needsMe) return myId ? { owner: myId } : null;
  return v.patch;
}

export function isViewActive(patch: Partial<LeadFiltersValue>, f: LeadFiltersValue): boolean {
  const keys = Object.keys(patch) as Array<keyof LeadFiltersValue>;
  return keys.length > 0 && keys.every((k) => f[k] === patch[k]);
}

/** Toggle: re-tapping an active view clears exactly the keys it set. */
export function toggleView(patch: Partial<LeadFiltersValue>, f: LeadFiltersValue): LeadFiltersValue {
  if (isViewActive(patch, f)) {
    const next = { ...f };
    for (const k of Object.keys(patch) as Array<keyof LeadFiltersValue>) delete next[k];
    return next;
  }
  const next = { ...f, ...patch };
  // "Mine" (an owner) and "Unassigned" (no owner) contradict each other — picking one drops the other
  // rather than leaving a filter that can only ever match nothing.
  if (patch.owner) delete next.unassigned;
  if (patch.unassigned) delete next.owner;
  return next;
}

// ── Saved views ───────────────────────────────────────────────────────────
// Per user + per client, kept in this browser. (Sharing a view with the team
// would need a server-side store; until then a view is personal.)

export interface SavedView {
  id: string;
  name: string;
  filters: LeadFiltersValue;
  sort?: { key: string; order: 'asc' | 'desc' };
}

const MAX_SAVED = 12;

function storageKey(userId: string | null, clientId: string | null): string {
  return `kinematic_lead_views:${userId ?? 'anon'}:${clientId ?? 'org'}`;
}

export function loadSavedViews(userId: string | null, clientId: string | null): SavedView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId, clientId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v) => v && typeof v.id === 'string' && typeof v.name === 'string' && v.filters && typeof v.filters === 'object')
      .slice(0, MAX_SAVED);
  } catch {
    return [];
  }
}

export function persistSavedViews(userId: string | null, clientId: string | null, views: SavedView[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId, clientId), JSON.stringify(views.slice(0, MAX_SAVED)));
  } catch {
    /* private mode / quota — the view just won't persist */
  }
}

export const MAX_SAVED_VIEWS = MAX_SAVED;

/** A saved view never stores the free-text search — it is a transient box, not part of a "view". */
export function viewFilters(f: LeadFiltersValue): LeadFiltersValue {
  const { q: _q, ...rest } = f;
  return rest;
}

/** Order-insensitive equality over the keys that make up a view (undefined / empty values are ignored). */
export function filtersEqual(a: LeadFiltersValue, b: LeadFiltersValue): boolean {
  const norm = (f: LeadFiltersValue) => {
    const { q: _q, ...rest } = f;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(rest).sort()) {
      const v = (rest as Record<string, unknown>)[k];
      if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
      out[k] = Array.isArray(v) ? [...v].sort() : v;
    }
    return JSON.stringify(out);
  };
  return norm(a) === norm(b);
}
