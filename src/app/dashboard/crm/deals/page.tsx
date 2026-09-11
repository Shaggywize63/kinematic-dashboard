'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Download, KanbanSquare, Trash2 } from 'lucide-react';
import { crmDeals, crmPipelines, type Pagination } from '../../../../lib/crmApi';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import type { Deal, Pipeline } from '../../../../types/crm';
import DealsTable, { DEAL_COLUMNS } from '../../../../components/crm/DealsTable';
import DealEditModal from '../../../../components/crm/DealEditModal';
import ViewCustomizer from '../../../../components/crm/shared/ViewCustomizer';
import { useViewPrefs } from '../../../../lib/crmViewPrefs';
import { getStoredUser, canAccess, getStoredToken, userHasModule } from '../../../../lib/auth';
import { isKinematicTenant, isTataTiscanActive } from '../../../../lib/clientFeatures';
import { API_BASE_URL } from '../../../../lib/api';
import { Button, Card, EmptyState, Eyebrow, IconButton, Input, PageHeader, Segmented, Select, T, useIsCompact } from '../../../../components/ui';
import { usePageTitle } from '../../../../lib/pageTitle';

const DEAL_PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const DEAL_DEFAULT_PAGE_SIZE = 50;

// Lazy-load the kanban: dnd-kit + canvas-confetti are heavy and unused in
// the default list view.
const DealKanban = dynamic(() => import('../../../../components/crm/DealKanban'), { ssr: false });

type ViewMode = 'list' | 'kanban';

// Next.js requires useSearchParams() to be wrapped in a Suspense boundary
// for static prerendering. The page-level default export wraps the real
// component in <Suspense> so the build stays static-friendly.
export default function DealsListPageWrapper() {
  return (
    <Suspense fallback={<div style={{ color: T.dim, fontSize: 13.5 }}>Loading deals…</div>}>
      <DealsListPage />
    </Suspense>
  );
}

function DealsListPage() {
  const router = useRouter();
  const search = useSearchParams();
  usePageTitle('Deals');
  const narrow = useIsCompact(900);
  const initialView: ViewMode = search.get('view') === 'kanban' ? 'kanban' : 'list';
  const initialPipelineId = search.get('pipeline_id') || '';

  const [view, setView] = useState<ViewMode>(initialView);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string>(initialPipelineId);
  const [deals, setDeals] = useState<Deal[]>([]);
  // Value + volume summed across the whole filtered set (all pages), from
  // the backend `totals` field — accurate regardless of pagination.
  const [totals, setTotals] = useState<{ value: number; volume_kg: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Inline edit — the deal currently open in the edit modal, launched from
  // the row's Edit button so a rep can edit one deal without leaving the list.
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  // CSV download — mirrors the activities + leads export flows: raw
  // fetch() to the backend, blob the response, click a synthesised
  // anchor. Forward the auth bearer and the X-Client-Id picker so
  // super_admin's tenant scope is honoured during the export.
  const handleExport = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (status) qs.set('status', status);
      if (pipelineId) qs.set('pipeline_id', pipelineId);
      const url = `${API_BASE_URL}/api/v1/crm/deals/export${qs.toString() ? `?${qs.toString()}` : ''}`;
      const token = getStoredToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      try {
        const sel = window.localStorage.getItem('kinematic_selected_client');
        if (sel && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sel)) {
          headers['X-Client-Id'] = sel;
        }
      } catch { /* ignore */ }
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `deals-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      toast.success('Deals exported');
    } catch (e: any) {
      toast.error(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));
  // Pagination only applies to the list view — kanban needs every open
  // deal in scope, so it stays on the existing limit=500 single-shot fetch.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEAL_DEFAULT_PAGE_SIZE);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  // Server-side sort for the list view. Empty key = backend default order
  // (expected_close_date). A header click sets a real crm_deals column.
  // Kinematic tenant defaults deals to "Date added (newest)" (created_at desc);
  // other clients keep the backend default order (expected close ascending).
  // isKinematicTenant so the tenant's org-level super-admin (client_id null)
  // gets it too, not only sessions with the Kinematic client picked.
  const [sort, setSort] = useState<{ key: string; order: 'asc' | 'desc' }>(() =>
    isKinematicTenant(getStoredUser()) ? { key: 'created', order: 'desc' } : { key: '', order: 'asc' },
  );
  const dealView = useViewPrefs('deals');
  const dealHidden = useMemo(() => new Set(dealView.prefs.hidden), [dealView.prefs.hidden]);
  // The pipeline to fall back to when entering Kanban without an explicit pick —
  // Kanban must render a concrete pipeline's stage columns.
  const defaultPipelineId = useMemo(
    () => pipelines.find((p) => p.is_default)?.id || pipelines[0]?.id || '',
    [pipelines],
  );

  // Sync URL when the user toggles view / picks pipeline so the link is
  // shareable and a browser refresh keeps the mode.
  const syncUrl = (nextView: ViewMode, nextPipelineId: string) => {
    const params = new URLSearchParams();
    if (nextView === 'kanban') params.set('view', 'kanban');
    if (nextPipelineId) params.set('pipeline_id', nextPipelineId);
    const qs = params.toString();
    router.replace(qs ? `/dashboard/crm/deals?${qs}` : '/dashboard/crm/deals', { scroll: false });
  };

  const loadPipelines = async () => {
    try {
      const r = await crmPipelines.list();
      const list = r.data || [];
      setPipelines(list);
      // Only auto-pick a pipeline when starting in Kanban (it needs a concrete
      // pipeline to render stage columns). List view defaults to "All pipelines"
      // so it keeps showing every deal until the user opts into a filter.
      if (!pipelineId && view === 'kanban') {
        const def = list.find((p) => p.is_default) || list[0];
        if (def) setPipelineId(def.id);
      }
    } catch (e: any) { /* non-fatal — kanban will show an empty state */ }
  };

  const reload = async () => {
    setLoading(true);
    try {
      // Kanban: still single-shot, all open deals in the pipeline (the
      // board only renders open deals across stages). List: paginate.
      // `status` is server-side so swapping Open/Won/Lost re-counts
      // the total correctly, not just filters the current page.
      const params: Record<string, string | number | undefined> = { ...range };
      if (view === 'kanban' && pipelineId) {
        params.pipeline_id = pipelineId;
        params.status = 'open';
        params.limit = 500;
      } else {
        params.page = page;
        params.limit = pageSize;
        if (status) params.status = status;
        if (pipelineId) params.pipeline_id = pipelineId;
        // Server-side sort — only in list view; kanban keeps its own order.
        if (sort.key) { params.sort = sort.key; params.order = sort.order; }
      }
      const r = await crmDeals.list(params);
      setDeals(r.data || []);
      setTotals((r as unknown as { totals?: { value: number; volume_kg: number } }).totals ?? null);
      // Kanban ignores pagination metadata.
      if (view === 'list') {
        setPagination(r.pagination ?? {
          total: (r.data || []).length,
          page: 1,
          limit: pageSize,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        });
      } else {
        setPagination(null);
      }
    } catch (e: any) { toast.error(e.message || 'Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadPipelines(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [
    range.from, range.to, view, pipelineId,
    page, pageSize, status, sort.key, sort.order,
  ]);

  // Reset to page 1 whenever the server-side filter set changes,
  // otherwise a stricter filter while on page 5 lands on an empty page.
  useEffect(() => { setPage(1); /* eslint-disable-next-line */ }, [
    range.from, range.to, status, pageSize, view, sort.key, sort.order,
  ]);

  useEffect(() => {
    const user = getStoredUser();
    if (user && canAccess(user.role, ['sub_admin'])) setIsAdmin(true);
  }, []);

  const activePipeline = useMemo(() => pipelines.find((p) => p.id === pipelineId) || null, [pipelines, pipelineId]);
  const stages = useMemo(() => (activePipeline?.stages || []).slice().sort((a, b) => a.position - b.position), [activePipeline]);

  // `status` is now server-side so the page+count are correct. `q`
  // (text search) stays client-side as "find within this page" — the
  // dashboard doesn't reload on every keystroke.
  const filtered = deals.filter((d) => {
    if (q && !`${d.name} ${d.account_name || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const toggle = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelected((s) => filtered.every((d) => s.has(d.id)) ? new Set() : new Set(filtered.map((d) => d.id)));
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} deal${selected.size > 1 ? 's' : ''}? This soft-deletes them and they can be restored from the database if needed.`)) return;
    setBulkBusy(true);
    let ok = 0, failed = 0;
    for (const id of Array.from(selected)) {
      try { await crmDeals.remove(id); ok++; } catch { failed++; }
    }
    setBulkBusy(false);
    setSelected(new Set());
    if (failed === 0) toast.success(`Deleted ${ok} deal${ok > 1 ? 's' : ''}`);
    else toast.error(`Deleted ${ok}, ${failed} failed`);
    reload();
  };

  const switchView = (v: ViewMode) => {
    // Kanban needs a concrete pipeline; if none is picked (List
    // default = "All"), fall back to the default pipeline.
    const nextPid = v === 'kanban' && !pipelineId ? defaultPipelineId : pipelineId;
    setView(v);
    if (nextPid !== pipelineId) setPipelineId(nextPid);
    setSelected(new Set());
    syncUrl(v, nextPid);
  };

  const statusLabel = status ? status[0]!.toUpperCase() + status.slice(1) : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* New Deal button intentionally absent — deals are created
          exclusively via the lead-conversion flow (Lead detail → Convert)
          so the deal inherits the lead's qualification, source, and history. */}
      <PageHeader
        title="Deals"
        description="Revenue opportunities moving through your pipeline. Kanban drags deals between stages; List is for filters, sorting and bulk edits."
        compact={narrow}
        actions={
          <>
            {view === 'list' && (
              <ViewCustomizer
                entityLabel="Deals"
                // Dealer + Volume (kg) are steel-dealer-only (Tata / BMW / SRS)
                // columns — don't even offer them as toggles on other tenants
                // (e.g. the Kinematic admin), matching DealsTable's render gate.
                columns={(isTataTiscanActive(getStoredUser())
                  ? DEAL_COLUMNS
                  : DEAL_COLUMNS.filter((c) => c.key !== 'dealer' && c.key !== 'volume_kg')
                ) as unknown as { key: string; label: string; locked?: boolean }[]}
                hidden={dealView.prefs.hidden}
                mode={dealView.prefs.mode}
                onToggle={dealView.toggleHidden}
                onSetMode={dealView.setMode}
                onReset={dealView.reset}
              />
            )}
            {/* Export CSV is always visible (admin or not). */}
            <Button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              title="Download deals as CSV (respects current search / status filter)"
              icon={<Download size={16} strokeWidth={1.6} />}
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </>
        }
      />

      {/* Total value + volume across the current filter (all pages). */}
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(auto-fit, minmax(220px, 280px))', gap: 12 }}>
        <Card padding={16}>
          <Eyebrow>Total deal value{statusLabel ? ` · ${statusLabel}` : ''}</Eyebrow>
          <div style={{ fontFamily: T.heading, fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', color: T.text, lineHeight: 1.15, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
            {totals ? `₹${Math.round(totals.value).toLocaleString('en-IN')}` : '—'}
          </div>
          <div style={{ fontSize: 12.5, color: T.dim, marginTop: 4 }}>{pagination?.total != null && view === 'list' ? `${pagination.total.toLocaleString('en-IN')} deal${pagination.total === 1 ? '' : 's'} in scope` : 'Across every page of the current filter'}</div>
        </Card>
        {/* Volume (kg / MT) is a steel-dealer concept (weight-priced deals —
            Tata / SRS, BMW, PASA). It's meaningless for other tenants like
            Kinematic, so gate the tile on steel-dealer status — the same way
            as the volume_kg column above. (The backend also sums volume_kg to
            0 for non-steel tenants, so this is belt-and-suspenders.) */}
        {isTataTiscanActive(getStoredUser()) && !!(totals && totals.volume_kg > 0) && (
          <Card padding={16}>
            <Eyebrow>Total volume</Eyebrow>
            <div style={{ fontFamily: T.heading, fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', color: T.text, lineHeight: 1.15, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
              {totals.volume_kg >= 1000
                ? `${(totals.volume_kg / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} MT`
                : `${Math.round(totals.volume_kg).toLocaleString('en-IN')} kg`}
            </div>
            <div style={{ fontSize: 12.5, color: T.dim, marginTop: 4 }}>Summed from each deal&apos;s volume</div>
          </Card>
        )}
      </div>

      {/* Toolbar — view switch, pipeline, search, status, bulk actions. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Segmented<ViewMode>
          value={view}
          onChange={switchView}
          options={[{ value: 'list', label: 'List' }, { value: 'kanban', label: 'Kanban' }]}
        />

        {/* Pipeline selector — in Kanban it picks the board; in List it
            filters the deals (with an "All pipelines" escape hatch). */}
        {pipelines.length > 0 && (
          <div style={{ width: narrow ? '100%' : 220 }}>
            <Select
              value={pipelineId}
              aria-label="Pipeline"
              onChange={(e) => { setPipelineId(e.target.value); syncUrl(view, e.target.value); }}
            >
              {view === 'list' && <option value="">All pipelines</option>}
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.is_default ? ' (default)' : ''}
                </option>
              ))}
            </Select>
          </div>
        )}

        {view === 'list' && (
          <>
            <Input placeholder="Search deals..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search deals" style={{ width: narrow ? '100%' : 260 }} />
            <div style={{ width: narrow ? '100%' : 140 }}>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">All statuses</option><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option>
              </Select>
            </div>
          </>
        )}

        {view === 'list' && selected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: narrow ? 0 : 'auto' }}>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.dim }}>{selected.size} selected</span>
            <Button variant="danger" size="sm" onClick={bulkDelete} disabled={bulkBusy} icon={<Trash2 size={14} strokeWidth={1.8} />}>
              {bulkBusy ? 'Deleting…' : `Delete ${selected.size}`}
            </Button>
          </div>
        )}
      </div>

      {view === 'kanban' ? (
        loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: T.dim, fontSize: 13.5 }}>Loading kanban…</div>
        ) : !activePipeline ? (
          <Card padding={0}>
            <EmptyState
              icon={<KanbanSquare size={20} strokeWidth={1.6} />}
              title="No pipeline yet"
              description="The Kanban view groups open deals by stage. Create a pipeline first."
              action={<Button variant="primary" href="/dashboard/crm/pipeline">Go to Pipeline</Button>}
            />
          </Card>
        ) : stages.length === 0 ? (
          <Card padding={0}>
            <EmptyState
              icon={<KanbanSquare size={20} strokeWidth={1.6} />}
              title={`“${activePipeline.name}” has no stages yet`}
              description="Add at least one open stage before deals can be placed on the board."
              action={userHasModule(getStoredUser(), 'crm_settings')
                ? <Button href={`/dashboard/crm/settings/stages?pipeline_id=${activePipeline.id}`}>Add stages</Button>
                : undefined}
            />
          </Card>
        ) : (
          <DealKanban stages={stages} initialDeals={filtered} />
        )
      ) : (
        <>
          <DealsTable
            deals={filtered}
            loading={loading}
            hiddenColumns={dealHidden}
            viewMode={dealView.prefs.mode}
            sort={sort}
            onSort={(key) => setSort((s) => s.key === key ? { key, order: s.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' })}
            onAssign={async (dealId, userId) => {
              await crmDeals.update(dealId, { owner_id: userId } as any);
              toast.success(userId ? 'Deal reassigned' : 'Deal unassigned');
              reload();
            }}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onEdit={setEditingDeal}
            onDelete={async (id) => {
              if (!window.confirm('Delete this deal? It will be soft-deleted and can be restored from the database if needed.')) return;
              try {
                await crmDeals.remove(id);
                toast.success('Deal deleted');
                setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
                reload();
              } catch (e: any) {
                toast.error(e?.message || 'Delete failed');
              }
            }}
          />
          <DealsPaginationBar
            pagination={pagination}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            loading={loading}
          />
        </>
      )}

      {/* Inline edit modal — reuses the same override-aware DealEditModal the
          detail page uses. Stages come from the active pipeline. On save we
          refetch so the list reflects the edit. */}
      {editingDeal && (
        <DealEditModal
          deal={editingDeal}
          stages={stages}
          open={!!editingDeal}
          onClose={() => setEditingDeal(null)}
          onSaved={() => { setEditingDeal(null); reload(); }}
        />
      )}
    </div>
  );
}

function DealsPaginationBar({
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: -8, padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: T.dim }}>
        <span>Rows per page</span>
        <div style={{ width: 84 }}>
          <Select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={disabled}
            aria-label="Rows per page"
            style={{ height: 30, fontSize: 12.5, padding: '0 8px', paddingRight: 28 }}
          >
            {DEAL_PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 12, color: T.mute, fontVariantNumeric: 'tabular-nums' }}>
          {total === 0 ? 'No results' : `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton label="First page" onClick={() => onPageChange(1)} disabled={!canPrev}><ChevronFirst size={16} strokeWidth={1.6} /></IconButton>
        <IconButton label="Previous page" onClick={() => onPageChange(currentPage - 1)} disabled={!canPrev}><ChevronLeft size={16} strokeWidth={1.6} /></IconButton>
        <span style={{ fontFamily: T.mono, fontSize: 12, color: T.dim, padding: '0 10px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {currentPage} / {totalPages}
        </span>
        <IconButton label="Next page" onClick={() => onPageChange(currentPage + 1)} disabled={!canNext}><ChevronRight size={16} strokeWidth={1.6} /></IconButton>
        <IconButton label="Last page" onClick={() => onPageChange(totalPages)} disabled={!canNext}><ChevronLast size={16} strokeWidth={1.6} /></IconButton>
      </div>
    </div>
  );
}
