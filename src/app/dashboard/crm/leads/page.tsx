'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Loader2, MapPin, Plus, Trash2, Upload, UserCheck, UserPlus } from 'lucide-react';
import { crmLeads, crmLeadSources, crmSettings, type Pagination } from '../../../../lib/crmApi';
import api, { API_BASE_URL } from '../../../../lib/api';
import { getStoredToken, getStoredUser } from '../../../../lib/auth';
import { isKinematicTenant } from '../../../../lib/clientFeatures';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import type { Lead, LeadSource } from '../../../../types/crm';
import LeadsTable, { LEAD_COLUMNS } from '../../../../components/crm/LeadsTable';
import LeadEditModal from '../../../../components/crm/LeadEditModal';
import LeadFilters, { type LeadFiltersValue } from '../../../../components/crm/LeadFilters';
import SmartFilterBar from '../../../../components/crm/SmartFilterBar';
import ViewCustomizer from '../../../../components/crm/shared/ViewCustomizer';
import { useViewPrefs } from '../../../../lib/crmViewPrefs';
import { usePageTitle } from '../../../../lib/pageTitle';
import { Badge, Button, Card, IconButton, PageHeader, Segmented, Select, T, useIsCompact } from '../../../../components/ui';

type UserOption = { id: string; name: string };

// Page-size options shown in the per-page selector. 200 is the
// server's `listLeadsWithCount` cap so larger values silently clamp.
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 50;

export default function LeadsListPage() {
  usePageTitle('Leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [filters, setFilters] = useState<LeadFiltersValue>({});
  // Manager approval quick-filter: '' = all, 'pending' = awaiting sign-off,
  // 'rejected' = declined. Applied server-side via ?approval_status.
  const [approvalFilter, setApprovalFilter] = useState<'' | 'pending' | 'rejected'>('');
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
  // AI Smart Filters
  const [smartQuery, setSmartQuery] = useState('');
  const [smartParams, setSmartParams] = useState<Record<string, string>>({});
  const [smartExplain, setSmartExplain] = useState('');
  const [smartLoading, setSmartLoading] = useState(false);
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
  // isKinematicTenant (not isKinematicActive) so the tenant's super-admin —
  // client_id null, org-level — gets it too, regardless of the client picker.
  const [sort, setSort] = useState<{ key: string; order: 'asc' | 'desc' }>(() =>
    isKinematicTenant(getStoredUser()) ? { key: 'created', order: 'desc' } : { key: 'recent', order: 'desc' },
  );
  const view = useViewPrefs('leads');
  const hiddenSet = useMemo(() => new Set(view.prefs.hidden), [view.prefs.hidden]);
  // Phone-width flag — drives the floating "+ New Lead" CTA below. At 640px
  // the header action cluster wraps and the New Lead button can end up
  // below the fold, so a sticky FAB keeps the primary action one tap away.
  const isCompact = useIsCompact(640);
  // Tablet-and-below flag for the header / toolbar wrapping.
  const narrow = useIsCompact(900);

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
      if (approvalFilter)     qs.set('approval_status', approvalFilter);
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
      // Abort a stuck export instead of spinning forever. Without this the
      // fetch has no timeout, so a hung backend export left the button counting
      // ("Exporting… 64s…") with no error. 3 min is generous for a 10k-row cap.
      const ctrl = new AbortController();
      const abortTimer = window.setTimeout(() => ctrl.abort(), 180_000);
      let res: Response;
      try {
        res = await fetch(url, { headers, signal: ctrl.signal });
      } finally {
        window.clearTimeout(abortTimer);
      }
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
      const msg = e?.name === 'AbortError'
        ? 'Export timed out — try narrowing the date range or filters and export again.'
        : (e?.message || 'Export failed');
      toast.error(msg);
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
      if (approvalFilter)   params.approval_status = approvalFilter;
      if (filters.source)   params.source_id = filters.source;
      if (filters.owner)    params.owner_id  = filters.owner;
      if (filters.grade)    params.score_grade = filters.grade;
      // Free-text search (name / email / phone / company) — server-side so it
      // matches across all pages. Debounced to avoid a refetch per keystroke.
      if (debouncedQ)       params.q          = debouncedQ;
      if (sort.key !== 'recent') { params.sort = sort.key; params.order = sort.order; }
      // AI Smart Filter params (plain-English → validated filters) win over the
      // manual controls — the NL query is the active intent. They cover extra
      // keys the manual UI doesn't expose (score_gte/lte, is_b2c, status_in,
      // created_within_days, not_contacted_days, …). Server applies + scopes.
      Object.assign(params, smartParams);
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

  // AI Smart Filters: plain-English → validated filter params (server-side),
  // applied on top of the normal list fetch. `mine` is resolved to owner_id by
  // the backend, so no client identity needed.
  const runSmartFilter = async (explicit?: string) => {
    // `explicit` lets an example chip fill-and-run in one tap without waiting
    // for the smartQuery state to flush (setState is async).
    if (explicit !== undefined) setSmartQuery(explicit);
    const q = (explicit ?? smartQuery).trim();
    if (!q) { setSmartParams({}); setSmartExplain(''); return; }
    setSmartLoading(true);
    try {
      const r = await crmLeads.smartFilter(q);
      const p = (r.data?.params || {}) as Record<string, string>;
      setSmartParams(p);
      setSmartExplain(r.data?.explanation || '');
      if (Object.keys(p).length === 0) toast('No specific filters detected — showing all leads.');
    } catch (e: any) {
      toast.error(e.message || 'Smart filter failed');
    } finally { setSmartLoading(false); }
  };
  const clearSmartFilter = () => { setSmartQuery(''); setSmartParams({}); setSmartExplain(''); };

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
    filters.status, approvalFilter, filters.source, filters.owner, filters.grade,
    debouncedQ,
    page, pageSize, sort.key, sort.order,
    smartParams,
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
    filters.status, approvalFilter, filters.source, filters.owner, filters.grade,
    debouncedQ,
    pageSize, sort.key, sort.order,
    smartParams,
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

  // Row count: server's total matches all current filters
  // (state/city/district/block/status/source/owner/grade).
  // `filtered.length` is the subset visible on this page after
  // the client-side q (text-search) filter.
  const totalCount = pagination ? pagination.total : filtered.length;
  const locationCrumb = [filters.block, filters.district, filters.city, filters.state].filter(Boolean).join(' › ');
  // Manager approval quick-filter. Only shown when approval is actually in
  // use — some non-approved lead is present, or the filter is already
  // active. The workflow is opt-in per org (off by default), so tenants
  // that haven't enabled it have every lead 'approved' and never see this
  // control: their leads page is unchanged.
  const showApproval = approvalFilter !== '' || leads.some((l) => (l.approval_status ?? 'approved') !== 'approved');

  const headerActions = (
    <>
      <ViewCustomizer
        entityLabel="Leads"
        columns={LEAD_COLUMNS as unknown as { key: string; label: string; locked?: boolean }[]}
        hidden={view.prefs.hidden}
        mode={view.prefs.mode}
        onToggle={view.toggleHidden}
        onSetMode={view.setMode}
        onReset={view.reset}
      />
      {/* Export — the server doesn't stream per-row counts, so the button
          shows a spinner + elapsed seconds to say "still working" without
          lying about progress. */}
      <Button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        title="Download leads as CSV (current filters apply)"
        icon={exporting ? <Loader2 size={16} strokeWidth={1.8} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Download size={16} strokeWidth={1.8} />}
        style={{ cursor: exporting ? 'wait' : undefined }}
      >
        {exporting ? <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>Exporting… {exportElapsed}s</span> : 'Export'}
      </Button>
      <Button href="/dashboard/crm/leads/import" icon={<Upload size={16} strokeWidth={1.8} />}>Import</Button>
      <Button href="/dashboard/crm/leads/new" variant="primary" icon={<Plus size={16} strokeWidth={2} />}>New lead</Button>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            Leads
            <Badge mono style={{ fontSize: 11.5 }}>{totalCount.toLocaleString()} leads</Badge>
          </span>
        }
        description="Track and qualify prospects, then convert the best ones to contacts, accounts and deals."
        actions={headerActions}
        compact={narrow}
      />

      {/* Toolbar — one wrapping row: KINI smart filter, free-text search, the
          server-side selects, and the sort order. The smart-filter chips /
          "Interpreted as" line drop to their own line below (order: 10). */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <SmartFilterBar
          query={smartQuery}
          setQuery={setSmartQuery}
          onRun={runSmartFilter}
          onClear={clearSmartFilter}
          loading={smartLoading}
          explanation={smartExplain}
          params={smartParams}
        />
        <LeadFilters value={filters} onChange={setFilters} sources={sources.map((s) => ({ id: s.id, name: s.name }))} owners={users} />
        {showApproval && (
          <Segmented
            value={approvalFilter}
            onChange={setApprovalFilter}
            options={[
              { value: '', label: 'All' },
              { value: 'pending', label: 'Pending approval' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
        )}
        <div style={{ flex: '0 1 200px', minWidth: 170 }}>
          <Select
            aria-label="Sort by"
            title="Sort by"
            value={`${sort.key}:${sort.order}`}
            onChange={(e) => { const [key, order] = e.target.value.split(':'); setSort({ key, order: order as 'asc' | 'desc' }); }}
          >
            <option value="recent:desc">Sort: Most recent activity</option>
            <option value="created:desc">Sort: Date added (newest)</option>
            <option value="created:asc">Sort: Date added (oldest)</option>
            <option value="name:asc">Sort: Name (A–Z)</option>
            <option value="name:desc">Sort: Name (Z–A)</option>
            <option value="company:asc">Sort: Company (A–Z)</option>
            <option value="score:desc">Sort: Score (high–low)</option>
            <option value="score:asc">Sort: Score (low–high)</option>
            <option value="updated:desc">Sort: Last updated</option>
            <option value="status:asc">Sort: Status</option>
          </Select>
        </div>
      </div>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        {/* Context strip — only when there's something to say: a client-side
            search narrowing the page, an active location scope, or a
            selection with bulk actions. */}
        {(selected.size > 0 || locationCrumb || (filters.q && pagination && filtered.length !== leads.length)) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 16px', borderBottom: `1px solid ${T.border}`, background: 'var(--s3)', minHeight: 48 }}>
            {selected.size > 0 ? (
              <>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>
                  <span style={{ fontFamily: T.mono }}>{selected.size}</span> selected
                </span>
                <Button size="sm" onClick={bulkAssignToMe} disabled={bulkBusy} icon={<UserCheck size={14} strokeWidth={1.8} />}>Assign to me</Button>
                <div ref={assignMenuRef} style={{ position: 'relative' }}>
                  <Button size="sm" onClick={() => { setShowAssignMenu((m) => !m); loadUsers(); }} disabled={bulkBusy} icon={<UserPlus size={14} strokeWidth={1.8} />}>Assign to…</Button>
                  {showAssignMenu && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius.md, boxShadow: 'var(--shadow-pop)', zIndex: 200, minWidth: 200, maxHeight: 240, overflowY: 'auto', padding: 4 }}>
                      {usersLoading && <div style={{ padding: '8px 10px', fontSize: 12.5, color: T.dim }}>Loading users…</div>}
                      {!usersLoading && users.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12.5, color: T.dim }}>No users found</div>}
                      {users.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => bulkAssignTo(u.id, u.name)}
                          className="km-navrow"
                          style={{ width: '100%', display: 'block', padding: '7px 10px', background: 'transparent', border: 'none', borderRadius: 6, color: T.text, textAlign: 'left', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}
                        >
                          {u.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button size="sm" variant="danger" onClick={bulkDelete} disabled={bulkBusy} title="Soft-delete the selected leads" icon={<Trash2 size={14} strokeWidth={1.8} />}>
                  {bulkBusy ? 'Deleting…' : `Delete ${selected.size}`}
                </Button>
              </>
            ) : (
              <span style={{ fontSize: 12.5, color: T.dim, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {filters.q && pagination && filtered.length !== leads.length && (
                  <span><span style={{ fontFamily: T.mono, color: T.text }}>{filtered.length}</span> match “{filters.q}” on this page</span>
                )}
                {locationCrumb && (
                  <Badge tone="info" style={{ gap: 5 }}><MapPin size={12} strokeWidth={1.8} />{locationCrumb}</Badge>
                )}
              </span>
            )}
          </div>
        )}
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
          onApprove={async (leadId, decision) => {
            try {
              await crmLeads.decideApproval(leadId, { decision });
              toast.success(decision === 'approved' ? 'Lead approved' : 'Lead rejected');
              reload();
            } catch (e: any) {
              toast.error(e?.message || 'Could not update approval');
            }
          }}
        />
        <PaginationBar
          pagination={pagination}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          loading={loading}
        />
      </Card>

      {/* Phone-only floating "New lead" CTA. The header version is still
          rendered above for desktop / tablet, but on a 360-560 px screen the
          action cluster wraps onto multiple lines and the New Lead button can
          land off-screen. A sticky FAB at the bottom-right guarantees the
          primary action is always one tap away regardless of scroll position. */}
      {isCompact && (
        <Link
          href="/dashboard/crm/leads/new"
          aria-label="New lead"
          style={{
            position: 'fixed', right: 18, bottom: 84, zIndex: 50,
            background: T.red, color: '#FFFFFF', width: 52, height: 52, borderRadius: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
            boxShadow: '0 12px 28px -8px rgba(208, 30, 44, 0.55), 0 2px 6px rgba(0,0,0,0.2)',
          }}
        >
          <Plus size={24} strokeWidth={2} />
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
 * indicator + first/prev/next/last on the right. Sits inside the table
 * card (hairline above). Renders even when pagination is null so the
 * layout doesn't jump on the very first render — controls are just
 * disabled.
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

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: `1px solid ${T.border}`, flexWrap: 'wrap', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: T.dim }}>
        <span>Rows per page</span>
        <div style={{ width: 84 }}>
          <Select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={disabled}
            style={{ height: 30, fontSize: 12.5, paddingLeft: 9 }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 12, color: T.mute }}>
          {total === 0 ? 'No results' : `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton label="First page" onClick={() => onPageChange(1)} disabled={!canPrev}><ChevronsLeft size={16} strokeWidth={1.6} /></IconButton>
        <IconButton label="Previous page" onClick={() => onPageChange(currentPage - 1)} disabled={!canPrev}><ChevronLeft size={16} strokeWidth={1.6} /></IconButton>
        <span style={{ fontSize: 12.5, color: T.dim, padding: '0 8px', fontFamily: T.mono }}>
          <span style={{ color: T.text }}>{currentPage}</span> / {totalPages}
        </span>
        <IconButton label="Next page" onClick={() => onPageChange(currentPage + 1)} disabled={!canNext}><ChevronRight size={16} strokeWidth={1.6} /></IconButton>
        <IconButton label="Last page" onClick={() => onPageChange(totalPages)} disabled={!canNext}><ChevronsRight size={16} strokeWidth={1.6} /></IconButton>
      </div>
    </div>
  );
}
