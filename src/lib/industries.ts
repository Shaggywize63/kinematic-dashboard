// Spark & Ray industry configuration: the single source for every industry dropdown, colour dot / badge, map
// marker + legend + filter and the dependent Sub-industry control. The admin edits the list on Settings ->
// Industries (stored whole in crm_settings.config.industries as [{ name, color "#RRGGBB", sub_industries }]);
// a missing / empty / malformed list means the built-in seven below. Everything above `useIndustries` is pure and
// total (nothing throws whatever the backend or a form hands in) and has no React / API dependency.
import { useEffect, useState } from 'react';

export interface IndustryDef { name: string; color: string; sub_industries: string[] }

/** "Other / unknown": the explicit "Other" choice, a blank industry, or anything that is not in the list. */
export const INDUSTRY_UNKNOWN_COLOR = '#6B7280';
/** Sentinel the leads/geo endpoint reads as "leads without an industry". */
export const NO_INDUSTRY = '__none__';

// Backend limits (industriesConfigSchema) — the settings page validates against the same numbers.
export const MAX_INDUSTRIES = 60;
export const MAX_INDUSTRY_NAME = 60;
export const MAX_SUB_INDUSTRIES = 60;
export const MAX_SUB_INDUSTRY_NAME = 60;

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** The built-in industries (used when the org has not configured its own). */
export const DEFAULT_INDUSTRIES: readonly IndustryDef[] = [
  { name: 'Manufacturing', color: '#2563EB', sub_industries: [] },
  { name: 'Automotive', color: '#DC2626', sub_industries: [] },
  { name: 'Pharma & Healthcare', color: '#16A34A', sub_industries: [] },
  { name: 'Food & Beverage', color: '#F59E0B', sub_industries: [] },
  { name: 'Construction & Infrastructure', color: '#7C3AED', sub_industries: [] },
  { name: 'Power & Energy', color: '#0891B2', sub_industries: [] },
  { name: 'Other', color: INDUSTRY_UNKNOWN_COLOR, sub_industries: [] },
];

/** A fresh, mutable copy of the defaults. */
export function defaultIndustries(): IndustryDef[] {
  return DEFAULT_INDUSTRIES.map((d) => ({ ...d, sub_industries: [...d.sub_industries] }));
}

const norm = (s: unknown): string => (typeof s === 'string' ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '');

/** `config.industries` out of a GET /crm/settings payload (the `data` object); undefined when absent. */
export function extractIndustries(settingsData: unknown): unknown {
  return (settingsData as { config?: { industries?: unknown } } | null | undefined)?.config?.industries;
}

/**
 * The effective industry list. Accepts the GET /crm/settings `data` object (`{ config: { industries } }`) or the
 * raw array itself. Malformed rows (no name, duplicate name) are dropped; a bad colour falls back to grey; a
 * missing / empty / non-array list gives the built-in defaults. Always a fresh array.
 */
export function resolveIndustries(settingsData: unknown): IndustryDef[] {
  const raw = Array.isArray(settingsData) ? settingsData : extractIndustries(settingsData);
  if (!Array.isArray(raw)) return defaultIndustries();
  const out: IndustryDef[] = [];
  const seen = new Set<string>();
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    const o = it as { name?: unknown; color?: unknown; sub_industries?: unknown };
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const key = norm(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const color = typeof o.color === 'string' && HEX_COLOR.test(o.color.trim()) ? o.color.trim().toUpperCase() : INDUSTRY_UNKNOWN_COLOR;
    const subs: string[] = [];
    const subSeen = new Set<string>();
    if (Array.isArray(o.sub_industries)) {
      for (const s of o.sub_industries) {
        const v = typeof s === 'string' ? s.trim() : '';
        const k = norm(v);
        if (!v || subSeen.has(k)) continue;
        subSeen.add(k);
        subs.push(v);
      }
    }
    out.push({ name, color, sub_industries: subs });
  }
  return out.length > 0 ? out : defaultIndustries();
}

/** The colour for an industry name: case- and whitespace-insensitive match on the list, else grey. Never throws. */
export function industryColor(list: readonly IndustryDef[] | null | undefined, name?: string | null): string {
  const k = norm(name);
  if (!k) return INDUSTRY_UNKNOWN_COLOR;
  const hit = (list ?? DEFAULT_INDUSTRIES).find((d) => norm(d.name) === k);
  return hit && HEX_COLOR.test(hit.color) ? hit.color : INDUSTRY_UNKNOWN_COLOR;
}

/**
 * Dropdown options: the list's names in order, plus the current value appended when it is non-blank and not an
 * exact option — so a legacy / free-text industry stays selectable and is never silently lost on the next save.
 */
export function industryOptions(list: readonly IndustryDef[] | null | undefined, current?: string | null): string[] {
  const options = (list ?? DEFAULT_INDUSTRIES).map((d) => d.name);
  if (typeof current === 'string' && current.trim() !== '' && !options.includes(current)) options.push(current);
  return options;
}

/** The sub-industries configured for an industry (case/whitespace-insensitive name match); [] when none / unknown. */
export function subIndustriesFor(list: readonly IndustryDef[] | null | undefined, name?: string | null): string[] {
  const k = norm(name);
  if (!k) return [];
  const hit = (list ?? DEFAULT_INDUSTRIES).find((d) => norm(d.name) === k);
  return hit ? [...hit.sub_industries] : [];
}

/**
 * Sub-industry dropdown options for the chosen industry: its configured sub-industries, plus the current value
 * appended when it is not one of them (so a stored value stays selectable). [] means "no dropdown — free text".
 */
export function subIndustryOptions(list: readonly IndustryDef[] | null | undefined, industry?: string | null, current?: string | null): string[] {
  const subs = subIndustriesFor(list, industry);
  if (subs.length === 0) return [];
  if (typeof current === 'string' && current.trim() !== '' && !subs.includes(current)) subs.push(current);
  return subs;
}

/**
 * Should the saved Sub-industry be cleared when the Industry changes from `from` to `to`? Yes when the new
 * industry lists sub-industries and the value is not one of them, or when the value was one of the OLD industry's
 * listed sub-industries (picked from its dropdown) and the new industry does not list it. A free-text value under
 * an industry with no list is kept.
 */
export function clearSubIndustryOnChange(list: readonly IndustryDef[] | null | undefined, from: string | null | undefined, to: string | null | undefined, sub: unknown): boolean {
  if (typeof sub !== 'string' || sub.trim() === '') return false;
  const k = norm(sub);
  const inNew = subIndustriesFor(list, to).some((x) => norm(x) === k);
  if (inNew) return false;
  if (subIndustriesFor(list, to).length > 0) return true;
  return subIndustriesFor(list, from).some((x) => norm(x) === k);
}

export interface IndustryLegendRow { value: string; label: string; color: string }

/** Legend / filter rows for the dashboard map: the configured industries plus "No industry" (grey). */
export function industryLegend(list: readonly IndustryDef[] | null | undefined): IndustryLegendRow[] {
  return [
    ...(list ?? DEFAULT_INDUSTRIES).map((d) => ({ value: d.name, label: d.name, color: industryColor(list, d.name) })),
    { value: NO_INDUSTRY, label: 'No industry', color: INDUSTRY_UNKNOWN_COLOR },
  ];
}

/** The Settings -> Industries payload for `config.industries`: trimmed names, upper-case hex, plain strings. */
export function buildIndustriesConfig(list: readonly IndustryDef[]): IndustryDef[] {
  return list.map((d) => ({
    name: d.name.trim(),
    color: d.color.trim().toUpperCase(),
    sub_industries: d.sub_industries.map((s) => s.trim()).filter(Boolean),
  }));
}

/** Client-side validation matching the backend (unique names case-insensitively, non-blank, valid colours...). Returns messages; [] = valid. */
export function validateIndustries(list: readonly IndustryDef[]): string[] {
  const errs: string[] = [];
  if (list.length === 0) errs.push('Add at least one industry, or reset to the defaults.');
  if (list.length > MAX_INDUSTRIES) errs.push(`At most ${MAX_INDUSTRIES} industries.`);
  const seen = new Map<string, number>();
  list.forEach((d, i) => {
    const row = `Industry ${i + 1}`;
    const name = d.name.trim();
    if (!name) errs.push(`${row}: name is required.`);
    else {
      if (name.length > MAX_INDUSTRY_NAME) errs.push(`${row}: name must be ${MAX_INDUSTRY_NAME} characters or fewer.`);
      const k = norm(name);
      if (seen.has(k)) errs.push(`Duplicate industry name "${name}".`);
      seen.set(k, i);
    }
    if (!HEX_COLOR.test(d.color.trim())) errs.push(`${name || row}: colour must be a #RRGGBB hex value.`);
    if (d.sub_industries.length > MAX_SUB_INDUSTRIES) errs.push(`${name || row}: at most ${MAX_SUB_INDUSTRIES} sub-industries.`);
    const subSeen = new Set<string>();
    for (const s of d.sub_industries) {
      const v = s.trim();
      if (!v) { errs.push(`${name || row}: sub-industries cannot be blank.`); continue; }
      if (v.length > MAX_SUB_INDUSTRY_NAME) errs.push(`${name || row}: sub-industry "${v}" is longer than ${MAX_SUB_INDUSTRY_NAME} characters.`);
      const k = norm(v);
      if (subSeen.has(k)) errs.push(`${name || row}: duplicate sub-industry "${v}".`);
      subSeen.add(k);
    }
  });
  return errs;
}

/** Move the item at `index` by `delta` (-1 up / +1 down); returns a new array, or the same order if out of range. */
export function moveIndustry<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  const next = [...list];
  if (index < 0 || index >= next.length || to < 0 || to >= next.length) return next;
  const [it] = next.splice(index, 1);
  next.splice(to, 0, it);
  return next;
}

// ── Cached loader + hook ────────────────────────────────────────────────────
// One GET /crm/settings per client per page-load, shared by every dropdown / badge / map on the page. The cache
// is keyed by the effective client id (so switching client never shows another tenant's list) and cleared by
// `invalidateIndustries()` (called by the Settings -> Industries page after a save / reset).

let cacheKey: string | null = null;
let cacheList: IndustryDef[] | null = null;
let inflight: { key: string; p: Promise<IndustryDef[]> } | null = null;
const listeners = new Set<() => void>();

async function currentKey(): Promise<string> {
  try {
    const { effectiveClientId } = await import('./b2bClient');
    return effectiveClientId() || '__org__';
  } catch { return '__org__'; }
}

/** Drop the cached list and tell every mounted `useIndustries()` to re-read. */
export function invalidateIndustries(): void {
  cacheKey = null; cacheList = null; inflight = null;
  listeners.forEach((l) => l());
}

/** Load (once, cached) the effective industry list; falls back to the defaults on any failure (not cached). */
export async function loadIndustries(): Promise<IndustryDef[]> {
  const key = await currentKey();
  if (cacheList && cacheKey === key) return cacheList;
  if (inflight && inflight.key === key) return inflight.p;
  const p = (async () => {
    try {
      const { crmSettings } = await import('./crmApi');
      const s = await crmSettings.get();
      const list = resolveIndustries(s?.data);
      if (inflight && inflight.key === key) { cacheKey = key; cacheList = list; }
      return list;
    } catch { return defaultIndustries(); }
    finally { if (inflight && inflight.key === key) inflight = null; }
  })();
  inflight = { key, p };
  return p;
}

/**
 * The effective industry list for the current client. Starts from the cached list (or the defaults) and updates
 * when the settings load / are invalidated. `enabled=false` never fetches (non-Spark tenants).
 */
export function useIndustries(enabled = true): { industries: IndustryDef[]; loaded: boolean } {
  const [state, setState] = useState<{ industries: IndustryDef[]; loaded: boolean }>(() => ({ industries: cacheList ?? defaultIndustries(), loaded: !!cacheList || !enabled }));
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    const run = () => { loadIndustries().then((l) => { if (!off) setState({ industries: l, loaded: true }); }); };
    run();
    listeners.add(run);
    return () => { off = true; listeners.delete(run); };
  }, [enabled]);
  return state;
}
