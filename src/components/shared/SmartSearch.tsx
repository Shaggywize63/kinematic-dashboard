'use client';

/**
 * SmartSearch — the global ⌘/Ctrl-K command palette.
 *
 * One box that searches the whole system: it hits the unified
 * GET /api/v1/crm/search endpoint (org/client/city/hierarchy scoped server-side)
 * for records, matches the user's own nav for "jump to page", remembers recent
 * picks, and — for hard or no-result queries — hands off to KINI AI (the
 * agentic assistant) via the app-wide `km-open-ai` event.
 *
 * Styling mirrors components/crm/shared/Modal.tsx (theme CSS-vars, top-anchored,
 * Escape + scroll-lock + backdrop-click) so it flips light/dark automatically.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchApi, type SearchResultGroup } from '../../lib/crmApi';

type NavItemLike = { href: string; label: string; icon?: string };
type NavGroupLike = { label: string; items: NavItemLike[] };

interface Props {
  open: boolean;
  onClose: () => void;
  navGroups: NavGroupLike[];
  userId?: string;
}

// ── Route + icon maps ────────────────────────────────────────────────
// How each result type deep-links. Entities with a detail page open it;
// modal-only entities (activities, people) open their list surface.
const ENTITY_ROUTE: Record<string, (id: string) => string> = {
  lead: (id) => `/dashboard/crm/leads/${id}`,
  deal: (id) => `/dashboard/crm/deals/${id}`,
  contact: (id) => `/dashboard/crm/contacts/${id}`,
  account: (id) => `/dashboard/crm/accounts/${id}`,
  product: (id) => `/dashboard/crm/products/${id}`,
  activity: () => `/dashboard/crm/activities`,
  person: () => `/dashboard/crm/people-directory`,
};

const SEARCH_ICON = 'M21 21l-4.3-4.3 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z';
const CHEVRON = 'M9 18l6-6-6-6';
const SPARKLE = 'M12 3l1.9 5.5L19.5 10l-5.6 1.5L12 17l-1.9-5.5L4.5 10l5.6-1.5z';
const TYPE_ICON: Record<string, string> = {
  lead: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  contact: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  person: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  deal: 'M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2',
  account: 'M3 21h18 M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17 M9 9h1 M9 13h1 M14 9h1 M14 13h1',
  activity: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  product: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96 12 12l8.73-5.04 M12 22.08V12',
};

function Glyph({ d, size = 18, color }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
      strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      {d.split(' M ').map((seg, i) => <path key={i} d={i === 0 ? seg : `M ${seg}`} />)}
    </svg>
  );
}

// ── Recent picks (localStorage per user) ─────────────────────────────
interface RecentEntry { key: string; label: string; sub?: string; type?: string; id?: string; href?: string }
const RECENT_KEY = (uid?: string) => `kinematic_recent_search:${uid || 'anon'}`;
function loadRecent(uid?: string): RecentEntry[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY(uid)) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function pushRecent(uid: string | undefined, e: RecentEntry) {
  try {
    const list = loadRecent(uid).filter((x) => x.key !== e.key);
    list.unshift(e);
    localStorage.setItem(RECENT_KEY(uid), JSON.stringify(list.slice(0, 6)));
  } catch { /* storage full / disabled — recents are best-effort */ }
}

// ── Flat row model ───────────────────────────────────────────────────
type Row =
  | { key: string; kind: 'nav'; label: string; sub?: string; href: string; icon?: string }
  | { key: string; kind: 'result'; label: string; sub?: string; type: string; id: string }
  | { key: string; kind: 'recent'; label: string; sub?: string; entry: RecentEntry }
  | { key: string; kind: 'kini'; label: string; query: string };
type Section = { label?: string; rows: Row[] };

function navItems(groups: NavGroupLike[]): Array<{ label: string; href: string; icon?: string; group: string }> {
  const out: Array<{ label: string; href: string; icon?: string; group: string }> = [];
  for (const g of groups || []) for (const it of g.items || []) out.push({ label: it.label, href: it.href, icon: it.icon, group: g.label });
  return out;
}

export default function SmartSearch({ open, onClose, navGroups, userId }: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [groups, setGroups] = useState<SearchResultGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allNav = useMemo(() => navItems(navGroups), [navGroups]);

  // Reset + focus each time the palette opens.
  useEffect(() => {
    if (!open) return;
    setQ(''); setDebouncedQ(''); setGroups([]); setActive(0); setLoading(false);
    setRecent(loadRecent(userId));
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open, userId]);

  // Escape + scroll-lock while open (Escape also handled on the input, this
  // covers the case where focus has moved off it).
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onEsc); document.body.style.overflow = prev; };
  }, [open, onClose]);

  // Debounce the query (matches the leads list's 300–350ms pattern).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Fetch server results. Guarded so a stale response can't overwrite a newer one.
  useEffect(() => {
    if (debouncedQ.length < 2) { setGroups([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    searchApi.query(debouncedQ)
      .then((r) => { if (!cancelled) setGroups(r.data?.groups ?? []); })
      .catch(() => { if (!cancelled) setGroups([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedQ]);

  // Build the sectioned + flat row lists.
  const sections: Section[] = useMemo(() => {
    const out: Section[] = [];
    const query = debouncedQ;
    if (!query) {
      if (recent.length) {
        out.push({ label: 'Recent', rows: recent.map((e) => ({ key: `recent:${e.key}`, kind: 'recent', label: e.label, sub: e.sub, entry: e })) });
      }
      out.push({ label: 'Jump to', rows: allNav.slice(0, 6).map((n) => ({ key: `nav:${n.href}`, kind: 'nav', label: n.label, sub: n.group, href: n.href, icon: n.icon })) });
      return out;
    }
    const ql = query.toLowerCase();
    const navMatches = allNav.filter((n) => n.label.toLowerCase().includes(ql)).slice(0, 5);
    if (navMatches.length) {
      out.push({ label: 'Pages', rows: navMatches.map((n) => ({ key: `nav:${n.href}`, kind: 'nav', label: n.label, sub: n.group, href: n.href, icon: n.icon })) });
    }
    for (const g of groups) {
      out.push({
        label: `${g.label}${g.count >= 6 ? ' · top 6' : ''}`,
        rows: g.items.map((it) => ({ key: `${g.type}:${it.id}`, kind: 'result', label: it.title, sub: it.subtitle, type: g.type, id: it.id })),
      });
    }
    // KINI hand-off is always offered (and is the sole action on zero hits).
    out.push({ rows: [{ key: 'kini', kind: 'kini', label: `Ask KINI about “${query}”`, query }] });
    return out;
  }, [debouncedQ, groups, allNav, recent]);

  const flatRows = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  // Keep the active index in range as rows change.
  useEffect(() => { setActive((i) => (i >= flatRows.length ? 0 : i)); }, [flatRows.length]);
  // Scroll the active row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const activate = (row: Row) => {
    if (row.kind === 'nav') {
      pushRecent(userId, { key: `nav:${row.href}`, label: row.label, sub: row.sub, href: row.href });
      router.push(row.href); onClose();
    } else if (row.kind === 'result') {
      const to = ENTITY_ROUTE[row.type]?.(row.id);
      if (to) { pushRecent(userId, { key: `${row.type}:${row.id}`, label: row.label, sub: row.sub, type: row.type, id: row.id }); router.push(to); onClose(); }
    } else if (row.kind === 'recent') {
      const e = row.entry;
      const to = e.href ?? (e.type && e.id ? ENTITY_ROUTE[e.type]?.(e.id) : undefined);
      if (to) { router.push(to); onClose(); }
    } else if (row.kind === 'kini') {
      window.dispatchEvent(new CustomEvent('km-open-ai', { detail: { query: row.query } }));
      onClose();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, flatRows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = flatRows[active]; if (r) activate(r); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const showEmpty = debouncedQ.length >= 2 && !loading && groups.length === 0;
  let idx = -1; // running flat index across sections

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '72px 20px 20px', overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 120px)', boxShadow: '0 24px 70px rgba(0,0,0,0.45)', overflow: 'hidden' }}
        role="dialog" aria-modal="true" aria-label="Search"
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-dim)', display: 'flex' }}><Glyph d={SEARCH_ICON} size={20} /></span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search leads, deals, contacts, accounts, activities…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 16, fontFamily: 'var(--font-inter)' }}
          />
          {loading && <Spinner />}
          <kbd style={kbdStyle}>Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', padding: 6 }}>
          {sections.map((sec, si) => (
            <div key={si} style={{ marginBottom: 2 }}>
              {sec.label && (
                <div style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-dim)' }}>{sec.label}</div>
              )}
              {sec.rows.map((row) => {
                idx += 1;
                const myIdx = idx;
                const isActive = myIdx === active;
                const kini = row.kind === 'kini';
                const iconPath = row.kind === 'nav' ? (row.icon || CHEVRON)
                  : row.kind === 'kini' ? SPARKLE
                  : row.kind === 'result' ? (TYPE_ICON[row.type] || CHEVRON)
                  : (row.entry.type ? (TYPE_ICON[row.entry.type] || CHEVRON) : CHEVRON);
                const badge = row.kind === 'result' ? row.type : row.kind === 'nav' ? 'page' : undefined;
                const accent = kini ? '#E01E2C' : 'var(--accent)';
                return (
                  <div
                    key={row.key}
                    data-idx={myIdx}
                    onMouseEnter={() => setActive(myIdx)}
                    onClick={() => activate(row)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                      background: isActive ? (kini ? 'rgba(224,30,44,0.10)' : 'var(--s3)') : 'transparent',
                      boxShadow: isActive ? `inset 3px 0 0 ${accent}` : 'none',
                    }}
                  >
                    <span style={{ color: isActive ? accent : (kini ? '#E01E2C' : 'var(--text-dim)'), display: 'flex' }}><Glyph d={iconPath} size={18} /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, color: kini ? '#E01E2C' : 'var(--text)', fontWeight: kini ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.label}</div>
                      {row.sub && <div style={{ fontSize: 12.5, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sub}</div>}
                    </div>
                    {badge && <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-dim)', background: 'var(--s4)', padding: '2px 7px', borderRadius: 6 }}>{badge}</span>}
                  </div>
                );
              })}
            </div>
          ))}

          {showEmpty && (
            <div style={{ padding: '18px 14px 8px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              No records match “{debouncedQ}”. Try KINI below — it can answer questions and dig deeper.
            </div>
          )}
          {!debouncedQ && recent.length === 0 && (
            <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              Search across leads, deals, contacts, accounts, activities, products &amp; people — or ask KINI.
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-dim)' }}>
          <span><kbd style={kbdStyle}>↑</kbd><kbd style={kbdStyle}>↓</kbd> navigate</span>
          <span><kbd style={kbdStyle}>↵</kbd> open</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, color: '#E01E2C', fontWeight: 600 }}>
            <Glyph d={SPARKLE} size={13} color="#E01E2C" /> KINI AI fallback
          </span>
        </div>
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains)', fontSize: 10.5, color: 'var(--text-dim)',
  background: 'var(--s4)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 5px', marginRight: 3,
};

function Spinner() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden style={{ animation: 'spin 0.7s linear infinite' }}>
      <circle cx="12" cy="12" r="9" stroke="var(--border-l)" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </svg>
  );
}
