'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Download, Loader2, Plus, RefreshCw, Search, SlidersHorizontal, Upload } from 'lucide-react';
import { crmLeads, crmLeadSources, crmSettings, type Pagination } from '../../../../lib/crmApi';
import api, { EXPORT_TIMEOUT_MS, getRequestClientId } from '../../../../lib/api';
import { downloadBlob } from '../../../../lib/financeFormat';
import { getStoredUser } from '../../../../lib/auth';
import { useLeadOwnerAccess } from '../../../../lib/leadOwnerAccess';
import { isTataTiscon, canViewTelecallerReport } from '../../../../lib/clientFeatures';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../../../lib/crmFieldOverrides';
import { activeFilterCount, leadFilterParams, type ApprovalFilter } from '../../../../lib/crm/leadListParams';
import {
  filtersEqual, isViewActive, loadSavedViews, MAX_SAVED_VIEWS, persistSavedViews, QUICK_VIEWS, resolvePatch, toggleView, viewFilters,
  type SavedView,
} from '../../../../lib/crm/leadViews';
import type { Lead, LeadSource } from '../../../../types/crm';
import LeadsTable, { LEAD_COLUMNS } from '../../../../components/crm/LeadsTable';
import LeadEditModal from '../../../../components/crm/LeadEditModal';
import { STATUS_OPTIONS, type LeadFiltersValue } from '../../../../components/crm/LeadFilters';
import { extractLeadStatuses, type LeadStatusOption } from '../../../../lib/crmLeadStatuses';
import SmartFilterBar from '../../../../components/crm/SmartFilterBar';
import ViewCustomizer from '../../../../components/crm/shared/ViewCustomizer';
import LeadsPipeline, { type PipelineTab } from '../../../../components/crm/leads/LeadsPipeline';
import LeadQuickViews, { type QuickViewChip } from '../../../../components/crm/leads/LeadQuickViews';
import LeadFilterChips, { buildAppliedChips } from '../../../../components/crm/leads/LeadFilterChips';
import LeadFilterDrawer from '../../../../components/crm/leads/LeadFilterDrawer';
import LeadBulkBar from '../../../../components/crm/leads/LeadBulkBar';
import LeadPreviewPanel from '../../../../components/crm/leads/LeadPreviewPanel';
import LeadCardStack from '../../../../components/crm/leads/LeadCardStack';
import ScoreBreakdownModal from '../../../../components/crm/leads/ScoreBreakdownModal';
import { LeadsFirstRun, LeadsNoResults } from '../../../../components/crm/leads/LeadsStates';
import { useViewPrefs } from '../../../../lib/crmViewPrefs';
import { usePageTitle } from '../../../../lib/pageTitle';
import { Badge, Button, Card, IconButton, Input, PageHeader, Segmented, Select, T, buttonStyle, useIsCompact } from '../../../../components/ui';

type UserOption = { id: string; name: string };

// Page-size options shown in the per-page selector. 200 is the
// server's `listLeadsWithCount` cap so larger values silently clamp.
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 50;

// Dot / bar colour per built-in status in the pipeline strip. A per-client
// custom status set brings its own colour; anything else falls back to dim.
const STATUS_COLOR: Record<string, string> = {
  new: T.info, working: T.warn, qualified: T.ok, converted: T.ok, unqualified: T.mute, lost: T.red,
};

export default function LeadsListPage() {
  usePageTitle('Leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [filters, setFilters] = useState<LeadFiltersValue>({});
  // Per-client custom lead-status set for the status filter. Null = built-ins.
  const [leadStatuses, setLeadStatuses] = useState<LeadStatusOption[] | null>(null);
  // Manager approval quick-filter: '' = all, 'pending' = awaiting sign-off,
  // 'rejected' = declined. Applied server-side via ?approval_status.
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('');
  // Debounced copy of the free-text search, sent to the backend so a search
  // (incl. phone number) finds matches on ANY page — not just the loaded one.
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // Inline edit — the lead currently open in the edit modal, launched from
  // the row's Edit button so a rep can edit one record without leaving the list.
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [isB2C, setIsB2C] = useState(false);
  // Built-in field overrides (Settings → Custom Fields). The table / preview /
  // cards gate every built-in column through these; the rows wait for the first
  // settings read so a field the admin hid never flashes.
  const [overrides, setOverrides] = useState<FieldOverrides>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // Quick preview + score breakdown + filters drawer.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [scoreLead, setScoreLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Telecaller phase 3 — per-campaign section switcher (Rajkamal only). null =
  // "All"; otherwise a campaign custom-field value sent as ?campaign= so the
  // list becomes that campaign's section. All three sections are views of the
  // same shared lead set (the lead profile links a customer across campaigns).
  const campaignSections = canViewTelecallerReport(getStoredUser());
  const [campaignSection, setCampaignSection] = useState<string | null>(null);
  // Clients that set lead_form.owner_assignment='admin_only' let only an admin choose an owner: no "Assign to me" /
  // "Assign to…" on a selection, no inline owner picker on a row (the owner column is plain text for everyone else)
  // and no Owner filter in the filter bar.
  const ownerAccess = useLeadOwnerAccess();
  // With the Owner filter gone for this viewer, a value left in it (an owner, or "unassigned only") must not keep narrowing the list.
  useEffect(() => {
    if (ownerAccess.ready && !ownerAccess.canAssign) setFilters((f) => (f.owner || f.unassigned ? { ...f, owner: undefined, unassigned: undefined } : f));
  }, [ownerAccess.ready, ownerAccess.canAssign]);
  // AI Smart Filters
  const [smartQuery, setSmartQuery] = useState('');
  const [smartParams, setSmartParams] = useState<Record<string, string>>({});
  const [smartExplain, setSmartExplain] = useState('');
  const [smartLoading, setSmartLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  // "Update all scores" — recomputes every non-terminal lead's AI score. Admin-
  // only + org-wide, so gate the button to real admins. ByteBack runs every user
  // on the generic `sub_admin` preset and separates rank by org-role data_scope,
  // so a field exec ('own') or team manager ('team') must NOT see it even though
  // their preset role is admin-tier — mirror the backend gate exactly.
  const [rescoring, setRescoring] = useState(false);
  const canRescoreAll = useMemo(() => {
    const u = getStoredUser();
    const role = (u?.role || '').toLowerCase();
    const scope = u?.org_role_data_scope; // 'own' | 'team' | 'all' | null (null ≈ all)
    const isAdminTier = ['super_admin', 'admin', 'sub_admin'].includes(role);
    return isAdminTier && scope !== 'own' && scope !== 'team';
  }, []);
  const handleRescoreAll = async () => {
    if (rescoring) return;
    setRescoring(true);
    try {
      await crmLeads.rescoreAll();
      toast.success('Refreshing all lead scores — this runs in the background and may take a few minutes. Reload to see updated scores.');
      // Give the detached sweep a head start, then refetch so early scores show.
      setTimeout(() => { reload(); }, 8000);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 409) toast.error('A score refresh is already running. Please wait for it to finish.');
      else if (status === 403) toast.error('Only admins can refresh all lead scores.');
      else toast.error(e?.response?.data?.error || e?.message || 'Failed to refresh scores');
    } finally {
      setRescoring(false);
    }
  };
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
  // Default sort: "Date added (newest)" is the resting order for everyone —
  // a freshly captured lead should surface at the top. Only the steel-dealer
  // tenants (Tata / BMW) keep the older "most recent activity" default, since
  // their reps work an aging pipeline rather than a fresh-lead queue.
  // (Detected via isTataTiscon on the JWT client_id, so it holds whatever the
  // client picker is set to; the Kinematic super-admin — org-level, client_id
  // null — falls through to newest-added, which is what the earlier
  // org-id-based check missed.)
  const [sort, setSort] = useState<{ key: string; order: 'asc' | 'desc' }>(() =>
    isTataTiscon(getStoredUser()) ? { key: 'recent', order: 'desc' } : { key: 'created', order: 'desc' },
  );
  const view = useViewPrefs('leads');
  const hiddenSet = useMemo(() => new Set(view.prefs.hidden), [view.prefs.hidden]);
  // Phone-width flag — drives the card stack and the floating "+ New Lead"
  // CTA below. At 640px the header action cluster wraps and the New Lead
  // button can end up below the fold, so a sticky FAB keeps the primary
  // action one tap away.
  const isCompact = useIsCompact(640);
  // Tablet-and-below flag for the header / toolbar wrapping.
  const narrow = useIsCompact(900);
  // Below this width the preview panel slides over the list instead of docking beside it.
  const overlayPreview = useIsCompact(1440);
  const useStack = isCompact || view.prefs.mode === 'cards';
  const datePreset = useCrmDateRange((s) => s.preset);
  const setDatePreset = useCrmDateRange((s) => s.setPreset);
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));

  const myId = useMemo(() => getStoredUser()?.id ?? null, []);

  // Statuses offered by the pipeline strip, the drawer and the applied chips.
  const statusOptions = useMemo(
    () => (leadStatuses && leadStatuses.length ? leadStatuses : STATUS_OPTIONS) as Array<{ value: string; label: string; color?: string }>,
    [leadStatuses],
  );
  const fieldHelpers = useMemo(() => buildFieldHelpers(overrides, 'lead', isB2C ? 'b2c' : 'b2b'), [overrides, isB2C]);

  // ONE param set, three consumers: the list fetch, the pipeline / view counters and the CSV
  // export. Keyed on the filter VALUES (not object identity) so unrelated re-renders don't refetch.
  const filtersKey = JSON.stringify({ ...filters, q: undefined });
  const baseParams = useMemo(() => {
    const p: Record<string, string | number> = leadFilterParams(filters, { q: debouncedQ, approval: approvalFilter, campaign: campaignSection });
    if (range.from) p.from = range.from;
    if (range.to)   p.to   = range.to;
    // AI Smart Filter params (plain-English → validated filters) win over the manual
    // controls — the NL query is the active intent. They cover extra keys the manual UI
    // doesn't expose (score_gte/lte, is_b2c, status_in, created_within_days,
    // not_contacted_days, …). Server applies + scopes.
    Object.assign(p, smartParams);
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, debouncedQ, approvalFilter, campaignSection, range.from, range.to, smartParams]);

  // CSV download — calls the backend export endpoint with the same
  // server-side filters the list is already using, then triggers a
  // browser download from the returned blob. Tenant + city scope is
  // enforced server-side so the export can never leak rows the user
  // isn't allowed to see.
  //
  // Filter parity (see CLAUDE.md golden rule #6): the export sends EXACTLY the
  // list's params (same builder), otherwise picking "Status: working + Owner:
  // Nandan" on the list and clicking Export silently returns the full org-wide
  // CSV. Reps were reporting this as "export not working" — they were filtering,
  // exporting, and getting tens of thousands of rows they couldn't reconcile
  // against the on-screen view.
  const handleExport = async () => {
    setExporting(true);
    setExportElapsed(0);
    const startedAt = Date.now();
    const ticker = window.setInterval(() => {
      setExportElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    try {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(baseParams)) if (v !== undefined && v !== '') qs.set(k, String(v));
      if (sort.key !== 'recent') { qs.set('sort', sort.key); qs.set('order', sort.order); }
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
      // Through api.download — NOT a hand-rolled fetch. It sends the CURRENT token
      // (renewing it on a 401), the org / client / X-Kinematic-Project headers and
      // surfaces the backend's {error} text. The old raw fetch sent no project header,
      // so a Kinematic-project tenant's export was verified against the wrong database
      // and always failed with "Invalid or expired token". The long timeout is for a
      // 10k-row export; a stuck one aborts instead of counting up forever.
      const blob = await api.download(
        `/api/v1/crm/leads/export${qs.toString() ? `?${qs.toString()}` : ''}`,
        { timeoutMs: EXPORT_TIMEOUT_MS },
      );
      downloadBlob(blob, `leads-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('Leads exported');
    } catch (e: any) {
      const msg = e?.isTimeout
        ? 'Export timed out — try narrowing the date range or filters and export again.'
        : `Export failed: ${e?.message || 'unknown error'}`;
      toast.error(msg);
    } finally {
      window.clearInterval(ticker);
      setExporting(false);
      setExportElapsed(0);
    }
  };

  const reload = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: pageSize, ...baseParams };
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

  // Debounce the free-text search into debouncedQ (350ms) so the server
  // refetch fires once the user pauses typing, not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ((filters.q || '').trim()), 350);
    return () => clearTimeout(t);
  }, [filters.q]);

  // Reload on filter / range / page / page-size / sort change. Server-side
  // pagination means changing the row-count'd filter set must also
  // reset to page 1, or we'd request page 5 of a 3-page result and
  // get nothing.
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [baseParams, page, pageSize, sort.key, sort.order]);
  useEffect(() => { setPage(1); /* eslint-disable-next-line */ }, [baseParams, pageSize, sort.key, sort.order]);

  // Load the user list up front so the Owner filter + chip names are populated
  // (loadUsers also backs the bulk-assign popover; it's a no-op once loaded).
  useEffect(() => { loadUsers(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    crmSettings.get().then((r) => {
      if (r.data?.business_type === 'b2c') setIsB2C(true);
      setLeadStatuses(extractLeadStatuses(r.data));
      setOverrides(extractFieldOverrides(r.data));
    }).catch(() => {}).finally(() => setSettingsLoaded(true));
  }, []);

  // ── Pipeline + quick-view counters ────────────────────────────────────
  // One cheap `limit=1` query per status card / view chip, all honouring every
  // OTHER active filter (so the cards add up to "All"). They only refetch when
  // the non-status filters change — not on paging, sorting or a status pick.
  const [counts, setCounts] = useState<{ all: number | null; status: Record<string, number>; views: Record<string, number> }>({ all: null, status: {}, views: {} });
  const viewDefs = useMemo(
    () => QUICK_VIEWS
      .filter((v) => !((v.needsMe || v.needsAssign) && !(ownerAccess.ready && ownerAccess.canAssign)))
      .map((v) => ({ v, patch: resolvePatch(v, myId) }))
      .filter((x): x is { v: typeof x.v; patch: NonNullable<typeof x.patch> } => !!x.patch),
    [ownerAccess.ready, ownerAccess.canAssign, myId],
  );
  const statusValues = useMemo(() => statusOptions.map((o) => o.value), [statusOptions]);
  const countsKey = JSON.stringify([
    (() => { const { status_in: _s, status: _t, ...rest } = baseParams as Record<string, string | number>; return rest; })(),
    statusValues,
    viewDefs.map((d) => d.patch),
  ]);
  useEffect(() => {
    let cancelled = false;
    const { status_in: _s, status: _t, ...base } = baseParams as Record<string, string | number>;
    const total = (p: Record<string, string | number>) =>
      crmLeads.list({ ...p, limit: 1 }).then((r) => r.pagination?.total ?? (r.data?.length ?? 0));
    const smartRest = (() => { const { status_in: _a, status: _b, ...rest } = smartParams; return rest; })();
    total(base).then((n) => { if (!cancelled) setCounts((c) => ({ ...c, all: n })); }).catch(() => {});
    for (const v of statusValues) {
      total({ ...base, status: v }).then((n) => { if (!cancelled) setCounts((c) => ({ ...c, status: { ...c.status, [v]: n } })); }).catch(() => {});
    }
    for (const { v, patch } of viewDefs) {
      const p: Record<string, string | number> = {
        ...leadFilterParams({ ...filters, status: undefined, ...patch }, { q: debouncedQ, approval: approvalFilter, campaign: campaignSection }),
      };
      if (range.from) p.from = range.from;
      if (range.to) p.to = range.to;
      Object.assign(p, smartRest);
      total(p).then((n) => { if (!cancelled) setCounts((c) => ({ ...c, views: { ...c.views, [v.id]: n } })); }).catch(() => {});
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsKey]);

  // ── Saved views (per user + client, this browser) ─────────────────────
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  useEffect(() => { setSavedViews(loadSavedViews(myId, getRequestClientId())); }, [myId]);
  const saveView = (name: string) => {
    const v: SavedView = { id: `v_${Date.now().toString(36)}`, name, filters: viewFilters(filters), sort };
    const next = [...savedViews, v];
    setSavedViews(next);
    persistSavedViews(myId, getRequestClientId(), next);
    toast.success(`Saved view “${name}”`);
  };
  const removeView = (id: string) => {
    const next = savedViews.filter((v) => v.id !== id);
    setSavedViews(next);
    persistSavedViews(myId, getRequestClientId(), next);
  };
  const applyView = (v: SavedView) => {
    if (filtersEqual(v.filters, filters)) { setFilters((f) => ({ q: f.q })); return; }
    setFilters((f) => ({ ...v.filters, q: f.q }));
    if (v.sort) setSort(v.sort);
  };

  // Status/source/owner/grade are applied server-side (see baseParams) so
  // they're already absent from `leads`. Only `q` stays client-side as "find
  // within the current page" — keeps typing snappy and means we don't
  // page-reset on every keystroke.
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
    if (!ownerAccess.canAssign) return;
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
    if (!ownerAccess.canAssign) return;
    try {
      await crmLeads.bulkAssign({ lead_ids: Array.from(selected), owner_id: userId });
      toast.success(`Assigned ${selected.size} leads to ${userName}`);
      setSelected(new Set());
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

  // Row count: server's total matches all current filters. `filtered.length`
  // is the subset visible on this page after the client-side q (text-search) filter.
  const totalCount = pagination ? pagination.total : filtered.length;
  // Manager approval quick-filter. Only shown when approval is actually in
  // use — some non-approved lead is present, or the filter is already
  // active. The workflow is opt-in per org (off by default), so tenants
  // that haven't enabled it have every lead 'approved' and never see this
  // control: their leads page is unchanged.
  const showApproval = approvalFilter !== '' || leads.some((l) => (l.approval_status ?? 'approved') !== 'approved');

  // ── Pipeline strip ────────────────────────────────────────────────────
  const tabs: PipelineTab[] = [
    { value: null, label: 'All', count: counts.all, color: T.info },
    ...statusOptions.map((o) => ({ value: o.value, label: o.label, count: counts.status[o.value] ?? null, color: o.color || STATUS_COLOR[o.value] || T.dim })),
  ];
  const activeTab = filters.status?.length === 1 ? filters.status[0] : null;

  // ── Quick views ───────────────────────────────────────────────────────
  const viewChips: QuickViewChip[] = [
    ...viewDefs.map(({ v, patch }) => ({
      id: v.id,
      label: v.label,
      title: v.hint,
      count: counts.views[v.id] ?? null,
      active: isViewActive(patch, filters),
      onClick: () => setFilters((f) => toggleView(patch, f)),
    })),
    ...savedViews.map((sv) => ({
      id: sv.id,
      label: sv.name,
      active: filtersEqual(sv.filters, filters),
      onClick: () => applyView(sv),
      onRemove: () => removeView(sv.id),
    })),
  ];

  // ── Applied chips + empty states ──────────────────────────────────────
  const appliedChips = buildAppliedChips({
    filters,
    onChange: setFilters,
    statusLabel: (v) => statusOptions.find((o) => o.value === v)?.label ?? v,
    sourceName: (id) => sources.find((s) => s.id === id)?.name ?? 'Selected source',
    ownerName: (id) => users.find((u) => u.id === id)?.name ?? 'Selected user',
    showOwner: ownerAccess.canAssign,
  });
  const smartActive = Object.keys(smartParams).length > 0;
  const filtersActive = appliedChips.length > 0 || !!debouncedQ || !!approvalFilter || smartActive;
  const clearAll = () => { setFilters({}); setApprovalFilter(''); clearSmartFilter(); };
  const emptyState = !loading && totalCount === 0 && !filtersActive && !campaignSection && datePreset === 'all'
    ? <LeadsFirstRun />
    : (
      <LeadsNoResults
        chips={appliedChips}
        search={debouncedQ}
        onClearAll={filtersActive ? clearAll : undefined}
        onWidenDates={datePreset !== 'all' ? () => setDatePreset('all') : undefined}
      />
    );

  const previewLead = useMemo(() => (previewId ? leads.find((l) => l.id === previewId) ?? null : null), [previewId, leads]);
  const showPreview = !!previewLead && !useStack;
  const dockPreview = showPreview && !overlayPreview;
  const nFilters = activeFilterCount(filters);

  // On a phone the secondary actions collapse to icons (the header can't wrap them — it sizes to its
  // content and would clip "New lead"); desktop / tablet keep the labelled buttons.
  const iconBtn: React.CSSProperties = { width: 34, padding: 0 };
  const headerActions = (
    <>
      {/* Update all scores — recomputes every non-terminal lead's AI score
          (org-wide, or the selected client when a city scope is active). Admin
          only; runs detached server-side. */}
      {canRescoreAll && (
        <Button
          type="button"
          onClick={handleRescoreAll}
          disabled={rescoring}
          title="Recompute the AI score for every open lead in view"
          aria-label={isCompact ? 'Update scores' : undefined}
          icon={<RefreshCw size={16} strokeWidth={1.8} style={rescoring ? { animation: 'spin 0.8s linear infinite' } : undefined} />}
          style={{ cursor: rescoring ? 'wait' : undefined, ...(isCompact ? iconBtn : {}) }}
        >
          {isCompact ? null : rescoring ? 'Starting…' : 'Update scores'}
        </Button>
      )}
      {/* Export — the server doesn't stream per-row counts, so the button
          shows a spinner + elapsed seconds to say "still working" without
          lying about progress. */}
      <Button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        title="Download leads as CSV (current filters apply)"
        aria-label={isCompact ? 'Export' : undefined}
        icon={exporting ? <Loader2 size={16} strokeWidth={1.8} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Download size={16} strokeWidth={1.8} />}
        style={{ cursor: exporting ? 'wait' : undefined, ...(isCompact ? iconBtn : {}) }}
      >
        {isCompact ? null : exporting ? <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>Exporting… {exportElapsed}s</span> : 'Export'}
      </Button>
      {isCompact ? (
        <Link href="/dashboard/crm/leads/import" aria-label="Import" title="Import leads" className="km-btn" data-variant="secondary" style={{ ...buttonStyle('secondary', 'md'), ...iconBtn }}>
          <Upload size={16} strokeWidth={1.8} />
        </Link>
      ) : (
        <Button href="/dashboard/crm/leads/import" icon={<Upload size={16} strokeWidth={1.8} />}>Import</Button>
      )}
      <Button href="/dashboard/crm/leads/new" variant="primary" icon={<Plus size={16} strokeWidth={2} />}>New lead</Button>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            Leads
            <Badge mono style={{ fontSize: 11.5 }}>{totalCount.toLocaleString()} leads</Badge>
          </span>
        }
        description="Track and qualify prospects, then convert the best ones to contacts, accounts and deals."
        actions={headerActions}
        compact={narrow}
      />

      {campaignSections && (
        /* Telecaller phase 3 — campaign sections. Each is a view of the same
           shared lead set (filtered by the lead's campaign tag); a lead opened
           from any section shows its full cross-campaign call history. */
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Segmented
            value={campaignSection ?? ''}
            onChange={(v: string) => setCampaignSection(v || null)}
            options={[
              { value: '', label: 'All campaigns' },
              { value: 'General Calls', label: 'General' },
              { value: 'App & DigiGold', label: 'App & DigiGold' },
              { value: 'After-Sales', label: 'After-Sales' },
            ]}
          />
        </div>
      )}

      <LeadsPipeline
        tabs={tabs}
        active={activeTab}
        allActive={!filters.status?.length}
        onSelect={(v) => setFilters((f) => ({ ...f, status: v ? [v] : undefined }))}
      />

      <LeadQuickViews chips={viewChips} />

      {/* Toolbar — one wrapping row: KINI smart filter, free-text search, the
          Filters drawer trigger, the approval toggle, the sort order and the
          column customiser. The smart-filter chips / "Interpreted as" line sit
          under the KINI box. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <SmartFilterBar
          query={smartQuery}
          setQuery={setSmartQuery}
          onRun={runSmartFilter}
          onClear={clearSmartFilter}
          loading={smartLoading}
          explanation={smartExplain}
          params={smartParams}
        />
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={15} strokeWidth={1.8} aria-hidden style={{ position: 'absolute', left: 11, top: 10.5, color: T.mute, pointerEvents: 'none' }} />
          <Input
            value={filters.q || ''}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value || undefined }))}
            placeholder="Search name, email, company..."
            aria-label="Search leads"
            style={{ paddingLeft: 33 }}
          />
        </div>
        <Button
          onClick={() => setDrawerOpen(true)}
          aria-haspopup="dialog"
          icon={<SlidersHorizontal size={15} strokeWidth={1.8} />}
          style={{ height: 36 }}
        >
          Filters
          {nFilters > 0 && (
            <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: T.info, color: '#fff', fontFamily: T.mono, fontSize: 10.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{nFilters}</span>
          )}
        </Button>
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
        <ViewCustomizer
          entityLabel="Leads"
          columns={LEAD_COLUMNS as unknown as { key: string; label: string; locked?: boolean }[]}
          hidden={view.prefs.hidden}
          mode={view.prefs.mode}
          onToggle={view.toggleHidden}
          onSetMode={view.setMode}
          onReset={view.reset}
        />
      </div>

      <LeadFilterChips chips={appliedChips} onClearAll={clearAll} />

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {useStack ? (
              <LeadCardStack
                leads={filtered}
                selected={selected}
                onToggle={toggle}
                loading={loading || !settingsLoaded}
                isB2C={isB2C}
                statusOptions={leadStatuses}
                fieldHelpers={settingsLoaded ? fieldHelpers : undefined}
                onEdit={setEditingLead}
                emptyState={emptyState}
              />
            ) : (
              <LeadsTable
                leads={filtered}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
                loading={loading || !settingsLoaded}
                isB2C={isB2C}
                hiddenColumns={hiddenSet}
                statusOptions={leadStatuses}
                sort={sort}
                // Header click: switch to this column asc, or flip asc↔desc if it's
                // already the active sort. Feeds the same server-side `sort` state the
                // "Sort by" dropdown uses, so both stay in lock-step and refetch.
                onSort={(key) => setSort((s) => s.key === key ? { key, order: s.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' })}
                onAssign={ownerAccess.canAssign ? async (leadId, userId) => {
                  await crmLeads.update(leadId, { owner_id: userId } as any);
                  toast.success(userId ? 'Lead reassigned' : 'Lead unassigned');
                  reload();
                } : undefined}
                onEdit={setEditingLead}
                onPreview={(l) => setPreviewId((cur) => (cur === l.id ? null : l.id))}
                previewId={showPreview ? previewId : null}
                onScoreClick={setScoreLead}
                slim={dockPreview}
                fieldHelpers={settingsLoaded ? fieldHelpers : undefined}
                emptyState={emptyState}
                onApprove={async (leadId, decision) => {
                  try {
                    await crmLeads.decideApproval(leadId, { decision });
                    toast.success(decision === 'approved' ? 'Lead approved' : 'Lead rejected');
                    reload();
                  } catch (e: any) {
                    toast.error(e?.message || 'Could not update approval');
                  }
                }}
                onToggleImportant={async (lead) => {
                  const next = !((lead.custom_fields as { __important?: unknown } | null | undefined)?.__important);
                  // Optimistic: flip __important on the local row so the star updates
                  // immediately, then persist. Revert if the API call fails.
                  const patch = (rows: Lead[]) => rows.map((r) => r.id === lead.id
                    ? { ...r, custom_fields: { ...(r.custom_fields || {}), __important: next } }
                    : r);
                  const unpatch = (rows: Lead[]) => rows.map((r) => {
                    if (r.id !== lead.id) return r;
                    const cf = { ...(r.custom_fields || {}) } as Record<string, unknown>;
                    if (next) delete cf.__important; else cf.__important = true;
                    return { ...r, custom_fields: cf };
                  });
                  setLeads(patch);
                  try {
                    await crmLeads.setImportant(lead.id, next);
                    toast.success(next ? 'Marked important' : 'Removed important');
                  } catch (e: any) {
                    setLeads(unpatch);
                    toast.error(e?.message || 'Could not update lead');
                  }
                }}
              />
            )}
            <PaginationBar
              pagination={pagination}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              loading={loading}
            />
          </Card>
        </div>

        {dockPreview && previewLead && (
          <LeadPreviewPanel
            lead={previewLead}
            mode="dock"
            isB2C={isB2C}
            statusOptions={leadStatuses}
            fieldHelpers={settingsLoaded ? fieldHelpers : undefined}
            onClose={() => setPreviewId(null)}
            onEdit={setEditingLead}
            onOpenScore={setScoreLead}
          />
        )}
      </div>

      {showPreview && !dockPreview && previewLead && (
        <>
          <div onClick={() => setPreviewId(null)} aria-hidden style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.35)', zIndex: 1000 }} />
          <LeadPreviewPanel
            lead={previewLead}
            mode="overlay"
            isB2C={isB2C}
            statusOptions={leadStatuses}
            fieldHelpers={settingsLoaded ? fieldHelpers : undefined}
            onClose={() => setPreviewId(null)}
            onEdit={setEditingLead}
            onOpenScore={setScoreLead}
          />
        </>
      )}

      <LeadBulkBar
        count={selected.size}
        canAssign={ownerAccess.canAssign}
        busy={bulkBusy}
        users={users}
        usersLoading={usersLoading}
        myId={myId}
        onLoadUsers={loadUsers}
        onAssignToMe={bulkAssignToMe}
        onAssignTo={bulkAssignTo}
        onDelete={bulkDelete}
        onClear={() => setSelected(new Set())}
      />

      <LeadFilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        value={filters}
        onChange={setFilters}
        sources={sources.map((s) => ({ id: s.id, name: s.name }))}
        owners={users}
        showOwner={ownerAccess.canAssign}
        statusOptions={statusOptions}
        total={totalCount}
        loading={loading}
        onReset={clearAll}
        onSaveView={saveView}
        savedCount={savedViews.length}
        maxSaved={MAX_SAVED_VIEWS}
      />

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

      {scoreLead && <ScoreBreakdownModal lead={scoreLead} onClose={() => setScoreLead(null)} />}
    </div>
  );
}

// Page numbers to show around the current page: 1 … 4 5 6 … 20
function pageWindow(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set<number>([1, total, current - 1, current, current + 1]);
  if (current <= 3) { keep.add(2); keep.add(3); keep.add(4); }
  if (current >= total - 2) { keep.add(total - 1); keep.add(total - 2); keep.add(total - 3); }
  const nums = Array.from(keep).filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  nums.forEach((n, i) => { if (i > 0 && n - nums[i - 1] > 1) out.push('…'); out.push(n); });
  return out;
}

/**
 * Pagination footer: range + page-size picker on the left, numbered pages on
 * the right. Sits inside the table card (hairline above). Renders even when
 * pagination is null so the layout doesn't jump on the very first render —
 * controls are just disabled.
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5, color: T.dim, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: T.mono, fontSize: 12, color: T.mute }}>
          {total === 0 ? 'No results' : <>Showing <span style={{ color: T.text }}>{start.toLocaleString()}–{end.toLocaleString()}</span> of <span style={{ color: T.text }}>{total.toLocaleString()}</span></>}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
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
        </span>
      </div>
      <nav aria-label="Pagination" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton label="Previous page" onClick={() => onPageChange(currentPage - 1)} disabled={!canPrev}><ChevronLeft size={16} strokeWidth={1.6} /></IconButton>
        {pageWindow(currentPage, totalPages).map((n, i) => n === '…'
          ? <span key={`gap${i}`} aria-hidden style={{ width: 24, textAlign: 'center', color: T.mute, fontSize: 12.5 }}>…</span>
          : (
            <button
              key={n}
              type="button"
              aria-label={`Page ${n}`}
              aria-current={n === currentPage ? 'page' : undefined}
              disabled={disabled || n === currentPage}
              onClick={() => onPageChange(n)}
              className="km-iconbtn"
              style={{
                minWidth: 30, height: 30, padding: '0 6px', borderRadius: T.radius.sm, fontFamily: T.mono, fontSize: 12.5,
                border: `1px solid ${n === currentPage ? T.borderStrong : 'transparent'}`,
                background: n === currentPage ? 'var(--s3)' : 'transparent',
                color: n === currentPage ? T.text : T.dim, fontWeight: n === currentPage ? 700 : 500,
                cursor: n === currentPage || disabled ? 'default' : 'pointer',
              }}
            >{n}</button>
          ))}
        <IconButton label="Next page" onClick={() => onPageChange(currentPage + 1)} disabled={!canNext}><ChevronRight size={16} strokeWidth={1.6} /></IconButton>
      </nav>
    </div>
  );
}
