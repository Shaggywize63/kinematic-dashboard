'use client';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * Page title / breadcrumb for the dashboard header.
 *
 * The header derives a breadcrumb from the route + the user's own nav
 * (`deriveCrumbs`), so most pages get a correct title for free:
 *   /dashboard/crm/leads/new        → Leads › New
 *   /dashboard/crm/leads/<uuid>     → Leads › Details
 *   /dashboard/planograms/captures  → Captures
 * A page that knows a better last crumb (the lead's name, "Q3 report") sets
 * it with `usePageTitle('Rajesh Kumar')`; it replaces the derived tail while
 * the page is mounted and clears itself on unmount.
 */

export interface Crumb { label: string; href?: string }
export interface NavItemLike { href: string; label: string }
export interface NavGroupLike { label: string; items: NavItemLike[] }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENT_LABELS: Record<string, string> = {
  new: 'New', edit: 'Edit', import: 'Import', analytics: 'Analytics', settings: 'Settings',
  reports: 'Reports', history: 'History', roles: 'Roles', 'custom-fields': 'Custom fields',
  messages: 'Message log', approvals: 'Approvals', calendar: 'Calendar',
};

export function humanizeSegment(seg: string): string {
  if (!seg) return '';
  if (UUID_RE.test(seg) || (/^[0-9a-z]{16,}$/i.test(seg) && /\d/.test(seg))) return 'Details';
  if (/^\d+$/.test(seg)) return `#${seg}`;
  if (SEGMENT_LABELS[seg]) return SEGMENT_LABELS[seg];
  return seg.split('-').filter(Boolean).map((w, i) => (i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ');
}

export function deriveCrumbs(pathname: string, groups: NavGroupLike[]): Crumb[] {
  const path = (pathname || '').split('?')[0]!.replace(/\/+$/, '') || '/dashboard';
  if (path === '/dashboard') return [{ label: 'Dashboard' }];
  // Longest nav href that prefixes the path wins (so /planograms/captures beats
  // /planograms, and /crm/leads/analytics beats /crm/leads).
  let best: NavItemLike | null = null;
  for (const g of groups || []) {
    for (const it of g.items || []) {
      if (!it.href || it.href === '/dashboard') continue;
      if (path === it.href || path.startsWith(it.href + '/')) {
        if (!best || it.href.length > best.href.length) best = it;
      }
    }
  }
  if (!best) {
    const rest = path.replace(/^\/dashboard\/?/, '').split('/').filter(Boolean);
    return rest.length ? rest.map((s) => ({ label: humanizeSegment(s) })) : [{ label: 'Dashboard' }];
  }
  const tail = path.slice(best.href.length).split('/').filter(Boolean);
  const crumbs: Crumb[] = [{ label: best.label, href: tail.length ? best.href : undefined }];
  for (const seg of tail) crumbs.push({ label: humanizeSegment(seg) });
  return crumbs;
}

// ── Page-set override (last crumb) ────────────────────────────────────────
let override: string | null = null;
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
function getSnapshot() { return override; }
function getServerSnapshot() { return null; }

export function setPageTitle(title: string | null) {
  if (override === title) return;
  override = title;
  emit();
}

export function usePageTitleOverride(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Call from a page to name the current screen in the header breadcrumb. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    setPageTitle(title);
    return () => setPageTitle(null);
  }, [title]);
}
