'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmLeads, crmLeadSources, crmSettings, type Pagination } from '../../../../lib/crmApi';
import api, { API_BASE_URL } from '../../../../lib/api';
import { getStoredToken, getStoredUser } from '../../../../lib/auth';
import { isKinematicActive } from '../../../../lib/clientFeatures';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import type { Lead, LeadSource } from '../../../../types/crm';
import LeadsTable, { LEAD_COLUMNS } from '../../../../components/crm/LeadsTable';
import LeadEditModal from '../../../../components/crm/LeadEditModal';
import LeadFilters, { type LeadFiltersValue } from '../../../../components/crm/LeadFilters';
import ViewCustomizer from '../../../../components/crm/shared/ViewCustomizer';
import { useViewPrefs } from '../../../../lib/crmViewPrefs';

type UserOption = { id: string; name: string };

// Page-size options shown in the per-page selector. 200 is the
// server's `listLeadsWithCount` cap so larger values silently clamp.
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 50;

/**
 * Phone-width viewport flag. Per kinematic-dashboard/CLAUDE.md the
 * dashboard uses a `narrow` / `isCompact` JS flag for responsiveness
 * instead of CSS media queries (because every style on this page is
 * inline). Breakpoint matches "phone or smaller" — at 640 px the
 * toolbar row (ViewCustomizer · Export · Import · + New Lead) wraps
 * onto multiple lines and the New Lead CTA can end up below the page
 * header where reps don't see it.
 */
function useIsCompact(breakpoint = 640): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const check = () => setV(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return v;
}

export default function LeadsListPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [filters, setFilters] = useState<LeadFiltersValue>({});
  // Debounced copy of the free-text search, sent to the backend so a search
  // (incl. phone number) finds matches on ANY page — not just the loaded one.
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // Inline edit — the lead currently open in the edit modal, launched from
  // the row's Edit button so a rep can edit one record without leaving the list.
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [isB2C, setIsB2C] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Elapsed seconds for the export progress UI. Server caps at 10k rows so the
  // upper bound on duration is bounded but variable (10–40s depending on
  // tenant size + custom-field hydration). Reps were reporting "export is
  // broken" when really the request just took 25s with no visible feedback.
  const [exportElapsed, setExportElapsed] = useState(0);
  // Disables the bulk-delete button + selection while the soft-delete
  // loop is running so a user can't double-click or change selection
  // mid-flight. Mirrors the same flag on the deals list page.
  const [bulkBusy, setBulkBusy] = useState(false);
  // Server-side pagination. `page` is 1-indexed. `pagination` is the
  // metadata returned by the backend (total/totalPages/hasNext/hasPrev)
  // — null while loading and on the very first render before the first
  // response lands.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  // Server-side sort. `recent` (default) keeps the latest-update-first order;
  // every other key maps to a backend column via ?sort=&order=.
  // Default sort: the Kinematic tenant asked for "Date added (newest)" as the
  // resting order; every other client keeps the "most recent activity" default.
  const [sort, setSort] = useState<{ key: string; order: 'asc' | 'desc' }>(() =>
    isKinematicActive(getStoredUser()) ? { key: 'created', order: 'desc' } : { key: 'recent', order: 'desc' },
  );
  const view = useViewPrefs('leads');
  const hiddenSet = useMemo(() => new Set(view.prefs.hidden), [view.prefs.hidden]);
  // Phone-width flag — drives the floating "+ New Lead" CTA below.
  const isCompact = useIsCompact();

  // CSV download — calls the backend export endpoint with the same
  // server-side filters the list is already using, then triggers a
  // browser download from the returned blob. Tenant + city scope is
  // enforced server-side so the export can never leak rows the user
  // isn't allowed to see.
  //
  // Filter parity (see CLAUDE.md golden rule #6): every list-side filter
  // MUST be forwarded to /export, otherwise picking "Status: working +
  // Owner: Nandan" on the list and clicking Export silently returns the
  // full org-wide CSV. Reps were reporting this as "export not working"
  // — they were filtering, exporting, and getting tens of thousands of
  // rows they couldn't reconcile against the on-screen view.
  const handleExport = async () => {
    setExporting(true);
    setExportElapsed(0);
    const startedAt = Date.now();
    const ticker = window.setInterval(() => {
      setExportElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    try {
      const qs = new URLSearchParams();
      if (range.from)         qs.set('from', range.from);
      if (range.to)           qs.set('to',   range.to);
      if (filters.state)      qs.set('state',     filters.state);
      if (filters.city)       qs.set('city',      filters.city);
      if (filters.district)   qs.set('district',  filters.district);
      if (filters.block)      qs.set('block',     filters.block);
      // The list-side filters that were silently dropped before:
      if (filters.status)     qs.set('status',      filters.status);
      if (filters.source)     qs.set('source_id',   filters.source);
      if (filters.owner)      qs.set('owner_id',    filters.owner);
      if (filters.grade)      qs.set('score_grade', filters.grade);
      if (debouncedQ)         qs.set('q',           debouncedQ);
      // Demo-account short-circuit — raw fetch() bypasses api.ts's
      // demo intercept, so we'd otherwise hit the real backend with a
      // demo token and 401. Build the CSV from the in-memory rows
      // instead so the demo flow demonstrates the export without
      // talking to the network.
      const demoEmail = (() => {
        try { const raw = window.localStorage.getItem('kinematic_user'); return raw ? (JSON.parse(raw)?.email || '').toLowerCase() : ''; } catch { return ''; }
      })();
      if (demoEmail === 'demo@kinematic.com') {
        const rows = filtered;
        const header = ['First Name','Last Name','Email','Phone','Company','Title','State','City','Status','Score','Source','Owner','Created At'];
        const escape = (v: unknown): string => {
          if (v === null || v === undefined) return '';
          const s = String(v);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const body = rows.map((l: any) => [
          l.first_name, l.last_name, l.email, l.phone, l.company, l.title,
          l.state, l.city, l.status, l.score,
          (sources.find((s: any) => s.id === l.source_id) as any)?.name || '',
          (l.owner_name || ''),
          l.created_at,
        ].map(escape).join(',')).join('\n');
        const csv = `${header.join(',')}\n${body}\n`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl; a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(objUrl);
        toast.success('Leads exported (demo)');
        setExporting(false);
        return;
      }
      const url = `${API_BASE_URL}/api/v1/crm/leads/export${qs.toString() ? `?${qs.toString()}` : ''}`;
      const token = getStoredToken();
      // Forward both Authorization AND X-Client-Id. The raw fetch
      // bypasses api.ts so the active client picker has to be attached
      // manually — without it a super_admin's export ignores the
      // current tenant selection and returns every client's leads.
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      try {
        const sel = window.localStorage.getItem('kinematic_selected_client');
        if (sel && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sel)) {
          headers['X-Client-Id'] = sel;
        }
      } catch { /* ignore */ }
      const res = await fetch(url, { headers });
      if (!res.ok) {
        // Pull the backend's {success:false, error, code} body so the
        // toast surfaces "Validation failed: ..." / "Forbidden: ..."
        // instead of a bare "Export failed (HTTP 403)". Best-effort —
        // if the body isn't JSON (e.g. proxy 502 returns HTML), fall
        // back to the status code.
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.clone().json();
          if (body?.error && typeof body.error === 'string') detail = body.error;
        } catch { /* not JSON */ }
        throw new Error(`Export failed: ${detail}`);
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      toast.success('Leads exported');
    } catch (e: any) {
      toast.error(e.message || 'Export failed');
    } finally {
      window.clearInterval(ticker);
      setExporting(false);
      setExportElapsed(0);
    }
  };
  const assignMenuRef = useRef<HTMLDivElement>(null);
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));

  const reload = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: pageSize };
      if (range.from)      params.from     = range.from;
      if (range.to)        params.to       = range.to;
      // All known filters are now server-side so the row count and
      // page math match the *filtered* result, not the org-wide one.
      // Only `q` (free-text search) stays client-side as "find within
      // page" — it's responsive while typing and the backend's q-OR
      // search would force a page reload on every keystroke.
      if (filters.state)    params.state     = filters.state;
      if (filters.city)     params.city      = filters.city;
      if (filters.district) params.district  = filters.district;
      if (filters.block)    params.block     = filters.block;
      if (filters.status)   params.status    = filters.status;
      if (filters.source)   params.source_id = filters.source;
      if (filters.owner)    params.owner_id  = filters.owner;
      if (filters.grade)    params.score_grade = filters.grade;
      // Free-text search (name / email / phone / company) — server-side so it
      // matches across all pages. Debounced to avoid a refetch per keystroke.
      if (debouncedQ)       params.q          = debouncedQ;
      if (sort.key !== 'recent') { params.sort = sort.key; params.order = sort.order; }
      const [l, s] = await Promise.allSettled([crmLeads.list(params), crmLeadSources.list()]);
      if (l.status === 'fulfilled') {
        setLeads(l.value.data || []);
        // `pagination` may be undefined when the backend hasn't been
        // updated yet — keep the existing UI working by inferring a
        // single page from the row count in that case.
        setPagination(l.value.pagination ?? {
          total: (l.value.data || []).length,
          page: 1,
          limit: pageSize,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        });
      }
      if (s.status === 'fulfilled') setSources(s.value.data || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  // Reload on filter / range / page / page-size change. Server-side
  // pagination means changing the row-count'd filter set must also
  // reset to page 1, or we'd request page 5 of a 3-page result and
  // get nothing.
  // Debounce the free-text search into debouncedQ (350ms) so the server
  // refetch fires once the user pauses typing, not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ((filters.q || '').trim()), 350);
    return () => clearTimeout(t);
  }, [filters.q]);

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [
    range.from, range.to,
    filters.state, filters.city, filters.district, filters.block,
    filters.status, filters.source, filters.owner, filters.grade,
    debouncedQ,
    page, pageSize, sort.key, sort.order,
  ]);

  // Load the user list up front so the Owner filter dropdown is populated
  // (loadUsers also backs the bulk-assign menu; it's a no-op once loaded).
  useEffect(() => { loadUsers(); /* eslint-disable-next-line */ }, []);

  // Reset to page 1 whenever any server-side filter changes. Without
  // this, picking a stricter filter while on page 5 would render an
  // empty page until the user manually clicks "first".
  useEffect(() => { setPage(1); /* eslint-disable-next-line */ }, [
    range.from, range.to,
    filters.state, filters.city, filters.district, filters.block,
    filters.status, filters.source, filters.owner, filters.grade,
    debouncedQ,
    pageSize, sort.key, sort.order,
  ]);

  useEffect(() => {
    crmSettings.get().then((r) => {
      if (r.data?.business_type === 'b2c') setIsB2C(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!showAssignMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (assignMenuRef.current && !assignMenuRef.current.contains(e.target as Node)) setShowAssignMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAssignMenu]);

  // Status/source/owner/grade are applied server-side (see params in
  // reload()) so they're already absent from `leads`. Only `q` stays
  // client-side as "find within the current page" — keeps typing snappy
  // and means we don't page-reset on every keystroke.
  const filtered = useMemo(() => {
    const q = (filters.q || '').toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      `${l.full_name || ''} ${l.first_name || ''} ${l.last_name || ''} ${l.email || ''} ${l.phone || ''} ${l.company || ''}`.toLowerCase().includes(q)
    );
  }, [leads, filters.q]);

  const toggle = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelected((s) => filtered.every((l) => s.has(l.id)) ? new Set() : new Set(filtered.map((l) => l.id)));
  };

  const bulkAssignToMe = async () => {
    const userRaw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
    const parsed = userRaw ? (() => { try { return JSON.parse(userRaw); } catch { return null; } })() : null;
    const userId = parsed?.id || parsed?.user_id || parsed?.userId;
    if (!userId) return toast.error('Could not determine your user ID');
    try {
      await crmLeads.bulkAssign({ lead_ids: Array.from(selected), owner_id: userId });
      toast.success(`Assigned ${selected.size} leads to you`);
      setSelected(new Set());
      reload();
    } catch (e: any) { toast.error(e.message || 'Bulk assign failed'); }
  };

  const loadUsers = async () => {
    if (users.length > 0 || usersLoading) return;
    setUsersLoading(true);
    try {
      const r = await api.getUsers({ scope: 'assignable' }) as any;
      const list: UserOption[] = (r.data || r || []).map((u: any) => ({
        id: u.id,
        name: u.name || u.full_name || u.email || 'User',
      }));
      setUsers(list);
    } catch { setUsers([]); } finally { setUsersLoading(false); }
  };

  const bulkAssignTo = async (userId: string, userName: string) => {
    try {
      await crmLeads.bulkAssign({ lead_ids: Array.from(selected), owner_id: userId });
      toast.success(`Assigned ${selected.size} leads to ${userName}`);
      setSelected(new Set());
      setShowAssignMenu(false);
      reload();
    } catch (e: any) { toast.error(e.message || 'Bulk assign failed'); }
  };

  // Soft-delete the selected leads. There's no backend bulk endpoint
  // yet (the deals list page uses the same client-side loop) so we
  // sequence single DELETEs through crmLeads.remove. Each call sets
  // deleted_at server-side; rows can be restored from the DB if
  // needed. Errors are counted, not aborted on, so partial successes
  // are surfaced honestly in the toast.
  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(
      `Delete ${selected.size} lead${selected.size > 1 ? 's' : ''}? This soft-deletes them — rows can be restored from the database if needed.`,
    )) return;
    setBulkBusy(true);
    let ok = 0, failed = 0;
    for (const id of Array.from(selected)) {
      try { await crmLeads.remove(id); ok++; } catch { failed++; }
    }
    setBulkBusy(false);
    setSelected(new Set());
    if (failed === 0) toast.success(`Deleted ${ok} lead${ok > 1 ? 's' : ''}`);
    else toast.error(`Deleted ${ok}, ${failed} failed`);
    reload();
  };

  return (
    <div>
      {/* Keyframes for the Export CSV button's indeterminate progress bar. */}
      <style jsx global>{`
        @keyframes kn-export-progress {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
      <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Track and nurture potential customers before they become deals. Use AI scoring to prioritise hot leads, qualify them with your team, and convert top prospects to contacts, accounts, and deals in one click. Bulk-import from CSV or capture individually.
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Row count: server's total matches all current filters
              (state/city/district/block/status/source/owner/grade).
              `filtered.length` is the subset visible on this page after
              the client-side q (text-search) filter. */}
          <span style={{ fontSize: 13, color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Highlighted total — the headline number for the leads page. */}
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 12px', whiteSpace: 'nowrap' }}>
              {(pagination ? pagination.total : filtered.length).toLocaleString()} leads
            </span>
            {filters.q && pagination && filtered.length !== leads.length && (
              <span style={{ color: 'var(--text)' }}>
                · {filtered.length} match “{filters.q}” on this page
              </span>
            )}
          </span>
          {(filters.state || filters.city || filters.district || filters.block) && (
            <span style={{ fontSize: 11, color: 'var(--primary)', background: 'var(--s3)', padding: '3px 8px', borderRadius: 6 }}>
              📍 {[filters.block, filters.district, filters.city, filters.state].filter(Boolean).join(' › ')}
            </span>
          )}
          {selected.size > 0 && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>• {selected.size} selected</span>
              <button
                onClick={bulkAssignToMe}
                disabled={bulkBusy}
                style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: bulkBusy ? 'not-allowed' : 'pointer', opacity: bulkBusy ? 0.6 : 1 }}
              >
                Assign to me
              </button>
              <div ref={assignMenuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => { setShowAssignMenu((m) => !m); loadUsers(); }}
                  disabled={bulkBusy}
                  style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: bulkBusy ? 'not-allowed' : 'pointer', opacity: bulkBusy ? 0.6 : 1 }}
                >
                  Assign to...
                </button>
                {showAssignMenu && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 200, minWidth: 180, maxHeight: 220, overflowY: 'auto' }}>
                    {usersLoading && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)' }}>Loading users...</div>}
                    {!usersLoading && users.length === 0 && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)' }}>No users found</div>}
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => bulkAssignTo(u.id, u.name)}
                        style={{ width: '100%', display: 'block', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontSize: 13 }}
                      >
                        {u.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={bulkDelete}
                disabled={bulkBusy}
                title="Soft-delete the selected leads"
                style={{ background: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: bulkBusy ? 'not-allowed' : 'pointer', opacity: bulkBusy ? 0.6 : 1 }}
              >
                {bulkBusy ? 'Deleting…' : `🗑 Delete ${selected.size}`}
              </button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ViewCustomizer
            entityLabel="Leads"
            columns={LEAD_COLUMNS as unknown as { key: string; label: string; locked?: boolean }[]}
            hidden={view.prefs.hidden}
            mode={view.prefs.mode}
            onToggle={view.toggleHidden}
            onSetMode={view.setMode}
            onReset={view.reset}
          />
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            title="Download leads as CSV (current filters apply)"
            style={{
              position: 'relative',
              background: 'var(--s3)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: exporting ? 'wait' : 'pointer',
              opacity: exporting ? 0.85 : 1,
              overflow: 'hidden',
              minWidth: exporting ? 200 : 'auto',
            }}
          >
            {/* Indeterminate progress bar — the server doesn't stream per-row
                counts, so we can't show real %. The bar pulses left-to-right
                while elapsed seconds tick up next to the label. Tells the rep
                "still working" without lying about progress. */}
            {exporting && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: '40%',
                  background: 'var(--primary)',
                  opacity: 0.25,
                  animation: 'kn-export-progress 1.4s ease-in-out infinite',
                }}
              />
            )}
            <span style={{ position: 'relative' }}>
              {exporting
                ? `Exporting… ${exportElapsed}s`
                : '⬇ Export CSV'}
            </span>
          </button>
          <Link href="/dashboard/crm/leads/import" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Import</Link>
          <Link href="/dashboard/crm/leads/new" style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ New Lead</Link>
        </div>
      </div>
      <LeadFilters value={filters} onChange={setFilters} sources={sources.map((s) => ({ id: s.id, name: s.name }))} owners={users} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 2px' }}>
        <span style={{ fontSize: 12, color: 'var(--textSec)', fontWeight: 600 }}>Sort by</span>
        <select
          value={`${sort.key}:${sort.order}`}
          onChange={(e) => { const [key, order] = e.target.value.split(':'); setSort({ key, order: order as 'asc' | 'desc' }); }}
          style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <option value="recent:desc">Most recent activity</option>
          <option value="created:desc">Date added (newest)</option>
          <option value="created:asc">Date added (oldest)</option>
          <option value="name:asc">Name (A–Z)</option>
          <option value="name:desc">Name (Z–A)</option>
          <option value="company:asc">Company (A–Z)</option>
          <option value="score:desc">Score (high–low)</option>
          <option value="score:asc">Score (low–high)</option>
          <option value="updated:desc">Last updated</option>
          <option value="status:asc">Status</option>
        </select>
      </div>
      <LeadsTable
        leads={filtered}
        selected={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
        loading={loading}
        isB2C={isB2C}
        hiddenColumns={hiddenSet}
        viewMode={view.prefs.mode}
        sort={sort}
        // Header click: switch to this column asc, or flip asc↔desc if it's
        // already the active sort. Feeds the same server-side `sort` state the
        // "Sort by" dropdown uses, so both stay in lock-step and refetch.
        onSort={(key) => setSort((s) => s.key === key ? { key, order: s.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' })}
        onAssign={async (leadId, userId) => {
          await crmLeads.update(leadId, { owner_id: userId } as any);
          toast.success(userId ? 'Lead reassigned' : 'Lead unassigned');
          reload();
        }}
        onEdit={setEditingLead}
      />
      <PaginationBar
        pagination={pagination}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        loading={loading}
      />
      {/* Phone-only floating "+ New Lead" CTA. The toolbar version is
          still rendered above for desktop / tablet, but on a 360-560 px
          screen the 5-button cluster wraps onto multiple lines and the
          New Lead button can land off-screen below the page header.
          A sticky FAB at the bottom-right guarantees the primary
          action is always one tap away regardless of scroll position. */}
      {isCompact && (
        <Link
          href="/dashboard/crm/leads/new"
          aria-label="New lead"
          style={{
            position: 'fixed',
            right: 18,
            bottom: 84,
            zIndex: 50,
            background: 'var(--primary)',
            color: '#fff',
            width: 56,
            height: 56,
            borderRadius: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 700,
            lineHeight: 1,
            textDecoration: 'none',
            boxShadow: '0 12px 28px -8px rgba(208, 30, 44, 0.55), 0 2px 6px rgba(0,0,0,0.2)',
          }}
        >
          +
        </Link>
      )}

      {/* Inline edit modal — reuses the same override-aware LeadEditModal the
          detail page uses. On save we refetch so the list reflects the edit. */}
      {editingLead && (
        <LeadEditModal
          lead={editingLead}
          open={!!editingLead}
          onClose={() => setEditingLead(null)}
          onSaved={() => { setEditingLead(null); reload(); }}
        />
      )}
    </div>
  );
}

/**
 * Pagination footer: page-size picker on the left, current-page
 * indicator + first/prev/next/last + jump-to-page on the right.
 * Renders even when pagination is null so the layout doesn't jump on
 * the very first render — controls are just disabled.
 */
function PaginationBar({
  pagination, pageSize, onPageChange, onPageSizeChange, loading,
}: {
  pagination: Pagination | null;
  pageSize: number;
  onPageChange: (n: number) => void;
  onPageSizeChange: (n: number) => void;
  loading: boolean;
}) {
  const p = pagination;
  const totalPages = p?.totalPages ?? 1;
  const currentPage = p?.page ?? 1;
  const total = p?.total ?? 0;
  const start = total === 0 ? 0 : (currentPage - 1) * (p?.limit ?? pageSize) + 1;
  const end = Math.min(currentPage * (p?.limit ?? pageSize), total);

  const disabled = loading || !p;
  const canPrev = !!p?.hasPrev && !disabled;
  const canNext = !!p?.hasNext && !disabled;

  const btn = (active: boolean): React.CSSProperties => ({
    background: 'var(--s3)', border: '1px solid var(--border)', color: active ? 'var(--text)' : 'var(--text-dim)',
    padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: active ? 'pointer' : 'not-allowed', opacity: active ? 1 : 0.5, minWidth: 32,
  });

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 14, padding: '10px 14px', background: 'var(--s2)',
      border: '1px solid var(--border)', borderRadius: 10,
      flexWrap: 'wrap', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-dim)' }}>
        <span>Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          disabled={disabled}
          style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}
        >
          {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span>
          {total === 0 ? 'No results' : `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" onClick={() => onPageChange(1)} disabled={!canPrev} style={btn(canPrev)} title="First page">«</button>
        <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={!canPrev} style={btn(canPrev)} title="Previous page">‹</button>
        <span style={{ fontSize: 12, color: 'var(--text)', padding: '0 8px' }}>
          Page <strong>{currentPage}</strong> of {totalPages}
        </span>
        <button type="button" onClick={() => onPageChange(currentPage + 1)} disabled={!canNext} style={btn(canNext)} title="Next page">›</button>
        <button type="button" onClick={() => onPageChange(totalPages)} disabled={!canNext} style={btn(canNext)} title="Last page">»</button>
      </div>
    </div>
  );
}
