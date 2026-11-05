'use client';
import { useEffect, useSyncExternalStore } from 'react';
import api, { getRequestClientId } from './api';

/**
 * Activity types = the built-ins + every custom type an admin added in
 * Settings -> Activity Types, served by GET /api/v1/crm/activity-types.
 * One shared, lightly cached store feeds every picker / filter / icon / label
 * on the dashboard so a new custom type (e.g. "Industry Visit") shows up
 * everywhere without a hard-coded list. A row whose type is missing from the
 * list still renders: the slug is prettified (`industry_visit` -> `Industry Visit`).
 */
export interface ActivityTypeMeta {
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  position: number;
  is_system: boolean;
  is_active: boolean;
}

/** Fallback used until the API answers (or when it fails). Meeting first: the most-filtered type for field reps. */
export const BUILTIN_ACTIVITY_TYPES: ActivityTypeMeta[] = [
  ['meeting', 'Meeting', '📅'], ['call', 'Call', '📞'], ['email', 'Email', '✉️'], ['task', 'Task', '✅'],
  ['note', 'Note', '📝'], ['sms', 'SMS', '💬'], ['whatsapp', 'WhatsApp', '💬'],
].map(([slug, name, icon], i) => ({ slug, name, icon, color: null, position: i, is_system: true, is_active: true }));

const BUILTIN_SLUGS = new Set(BUILTIN_ACTIVITY_TYPES.map((t) => t.slug));

/** `industry_visit` / `industry-visit` -> `Industry Visit`. */
export function prettifySlug(slug: string | null | undefined): string {
  const s = String(slug ?? '').trim();
  if (!s) return '';
  return s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

type Raw = { slug?: string; name?: string; icon?: string | null; color?: string | null; position?: number; is_system?: boolean; is_active?: boolean; id?: string };

/** Normalise the endpoint payload (array, or `{data: []}`); [] when unusable so callers fall back to the built-ins. */
export function normalizeActivityTypes(payload: unknown): ActivityTypeMeta[] {
  const rows: Raw[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown } | null)?.data) ? ((payload as { data: Raw[] }).data) : [];
  const out: ActivityTypeMeta[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const slug = String(r?.slug ?? '').trim();
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    out.push({
      slug,
      name: String(r.name ?? '').trim() || prettifySlug(slug),
      icon: r.icon || null,
      color: r.color || null,
      position: typeof r.position === 'number' ? r.position : i,
      is_system: r.is_system ?? String(r.id ?? '').startsWith('builtin:'),
      is_active: r.is_active !== false,
    });
  });
  return out.sort((a, b) => a.position - b.position);
}

// ── shared store ────────────────────────────────────────────────────────────
const STALE_MS = 20_000;
let current: ActivityTypeMeta[] = BUILTIN_ACTIVITY_TYPES;
let loadedAt = 0;
let loadedFor = '';
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function refresh(force = false): Promise<void> {
  const scope = getRequestClientId() || '';
  // Custom types are per client: a different picker selection means a different list.
  if (scope !== loadedFor) { loadedAt = 0; if (loadedFor) { current = BUILTIN_ACTIVITY_TYPES; emit(); } loadedFor = scope; }
  if (inflight) return inflight;
  if (!force && loadedAt && Date.now() - loadedAt < STALE_MS) return Promise.resolve();
  inflight = api
    .get<unknown>('/api/v1/crm/activity-types', { noCache: true } as RequestInit & { noCache?: boolean })
    .then((r) => {
      const list = normalizeActivityTypes(r);
      loadedAt = Date.now();
      // Keep the built-ins even if the server somehow omits them, so existing rows always resolve.
      const merged = [...list];
      BUILTIN_ACTIVITY_TYPES.forEach((b) => { if (list.length && !merged.some((m) => m.slug === b.slug)) merged.push({ ...b, position: 1000 + b.position }); });
      current = merged.length ? merged : BUILTIN_ACTIVITY_TYPES;
      emit();
    })
    .catch(() => { /* keep whatever we have (built-ins) */ })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Call after creating / editing / deleting a type in Settings so every picker refetches. */
export function invalidateActivityTypes(): void {
  loadedAt = 0;
  void refresh(true);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => current;

export interface ActivityTypesApi {
  /** Every known type (including inactive ones, so old rows resolve). */
  all: ActivityTypeMeta[];
  /** Types a user may pick for a new activity (active only). */
  active: ActivityTypeMeta[];
  meta: (slug: string | null | undefined) => ActivityTypeMeta | undefined;
  /** Display name; prettified slug when the type isn't in the list. */
  labelFor: (slug: string | null | undefined) => string;
  isBuiltin: (slug: string | null | undefined) => boolean;
}

export function activityTypesApi(all: ActivityTypeMeta[]): ActivityTypesApi {
  const bySlug = new Map(all.map((t) => [t.slug, t]));
  return {
    all,
    active: all.filter((t) => t.is_active),
    meta: (slug) => (slug ? bySlug.get(slug) : undefined),
    labelFor: (slug) => (slug ? bySlug.get(slug)?.name || prettifySlug(slug) : ''),
    isBuiltin: (slug) => !!slug && BUILTIN_SLUGS.has(slug),
  };
}

/** Subscribe to the shared activity-type list (built-ins + custom). Triggers a (de-duplicated) refresh on mount. */
export function useActivityTypes(): ActivityTypesApi {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => { void refresh(false); }, []);
  return activityTypesApi(all);
}

/** Test hook: reset the shared store. */
export function __resetActivityTypesForTests(): void { current = BUILTIN_ACTIVITY_TYPES; loadedAt = 0; loadedFor = ''; inflight = null; }
