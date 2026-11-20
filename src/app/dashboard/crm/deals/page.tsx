'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Download, KanbanSquare, Search, Trash2, X } from 'lucide-react';
import { crmDeals, crmPipelines, type Pagination } from '../../../../lib/crmApi';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import type { Deal, Pipeline } from '../../../../types/crm';
import DealsTable, { DEAL_COLUMNS } from '../../../../components/crm/DealsTable';
import DealEditModal from '../../../../components/crm/DealEditModal';
import ViewCustomizer, { LayoutModeToggle } from '../../../../components/crm/shared/ViewCustomizer';
import { useViewPrefs } from '../../../../lib/crmViewPrefs';
import { getStoredUser, canAccess, userHasModule } from '../../../../lib/auth';
import { isKinematicTenant, isTataTiscanActive } from '../../../../lib/clientFeatures';
import api, { EXPORT_TIMEOUT_MS } from '../../../../lib/api';
import { downloadBlob } from '../../../../lib/financeFormat';
import { Button, Card, EmptyState, Input, PageHeader, Segmented, Select, T, useIsCompact } from '../../../../components/ui';
import { usePageTitle } from '../../../../lib/pageTitle';
import { formatINR, formatINRCompact } from '../../../../lib/formatCurrency';
import { useFieldHelpers } from '../../../../lib/crm/useFieldHelpers';
import MetricTiles, { type MetricTile } from '../../../../components/crm/shared/MetricTiles';
import ServerPaginationBar from '../../../../components/crm/shared/ServerPaginationBar';
import { useConfirm } from '../../../../components/ConfirmProvider';

const DEAL_DEFAULT_PAGE_SIZE = 50;

type Bucket = { count: number; value: number };
type StatusFilter = '' | 'open' | 'won' | 'lost';

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
  const confirm = useConfirm();
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
  // Debounced copy of the free-text search, sent to the backend `q` param so
  // the deals list searches the whole result set server-side (not just the
  // current page), mirroring the leads list. The live `q` still narrows the
  // current page instantly for feedback while the debounce settles.
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  // Count + value per status across every page of the current pipeline / search / date range (the summary tiles).
  const [summary, setSummary] = useState<{ open: Bucket; won: Bucket; lost: Bucket } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryTick, setSummaryTick] = useState(0);
  const { fields, loaded: fieldsLoaded } = useFieldHelpers('deal');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Inline edit — the deal currently open in the edit modal, launched from
  // the row's Edit button so a rep can edit one deal without leaving the list.
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  // CSV download — api.download carries the current (auto-renewed) token and the
  // org / client / project headers, so the tenant scope is honoured and a stale
  // session recovers instead of failing with "Invalid or expired token".
  const handleExport = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (status) qs.set('status', status);
      if (pipelineId) qs.set('pipeline_id', pipelineId);
      const blob = await api.download(
        `/api/v1/crm/deals/export${qs.toString() ? `?${qs.toString()}` : ''}`,
        { timeoutMs: EXPORT_TIMEOUT_MS },
      );
      downloadBlob(blob, `deals-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('Deals exported');
    } catch (e: any) {
      toast.error(`Export failed: ${e?.message || 'unknown error'}`);
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
        // Server-side text search (whole result set, all pages).
        if (debouncedQ) params.q = debouncedQ;
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

  // Debounce the free-text search into debouncedQ (350ms) so the server
  // isn't hit on every keystroke — same cadence as the leads list.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => { loadPipelines(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [
    range.from, range.to, view, pipelineId,
    page, pageSize, status, debouncedQ, sort.key, sort.order,
  ]);

  // The status tiles: one count-only request per status (limit 1), with exactly the list's other filters, so each
  // tile's count and value cover every page. Re-run after a delete / edit / reassign (summaryTick).
  useEffect(() => {
    let alive = true;
    const base: Record<string, string | number | undefined> = { ...range, limit: 1 };
    if (pipelineId) base.pipeline_id = pipelineId;
    if (view === 'list' && debouncedQ) base.q = debouncedQ;
    setSummaryLoading(true);
    const one = (st: 'open' | 'won' | 'lost'): Promise<Bucket> => crmDeals.list({ ...base, status: st }).then((r) => ({
      count: r.pagination?.total ?? (r.data || []).length,
      value: Number((r as unknown as { totals?: { value?: number } }).totals?.value ?? 0),
    }));
    Promise.all([one('open'), one('won'), one('lost')])
      .then(([open, won, lost]) => { if (alive) setSummary({ open, won, lost }); })
      .catch(() => { if (alive) setSummary(null); })
      .finally(() => { if (alive) setSummaryLoading(false); });
    return () => { alive = false; };
    /* eslint-disable-next-line */
  }, [range.from, range.to, pipelineId, debouncedQ, view, summaryTick]);

  // Reset to page 1 whenever the server-side filter set changes,
  // otherwise a stricter filter while on page 5 lands on an empty page.
  useEffect(() => { setPage(1); /* eslint-disable-next-line */ }, [
    range.from, range.to, status, debouncedQ, pageSize, view, sort.key, sort.order,
  ]);

  useEffect(() => {
    const user = getStoredUser();
    if (user && canAccess(user.role, ['sub_admin'])) setIsAdmin(true);
  }, []);

  const activePipeline = useMemo(() => pipelines.find((p) => p.id === pipelineId) || null, [pipelines, pipelineId]);
  const stages = useMemo(() => (activePipeline?.stages || []).slice().sort((a, b) => a.position - b.position), [activePipeline]);

  // `status` and the debounced `q` are server-side so the page+count are
  // correct across the whole result set. The live `q` additionally narrows
  // the current page instantly (same name/account match the server uses)
  // for feedback while the 350ms debounce settles.
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
    const n = selected.size;
    if (!(await confirm({
      title: `Delete ${n} deal${n > 1 ? 's' : ''}?`,
      message: 'This soft-deletes them — rows can be restored from the database if needed',
      confirmLabel: `Delete ${n > 1 ? `${n} deals` : 'deal'}`,
      confirmingLabel: 'Deleting…',
      tone: 'danger',
      irreversible: false,
    }))) return;
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
    setSummaryTick((n) => n + 1);
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

  const filtersActive = !!q || !!status || (view === 'list' && !!pipelineId);
  const clearFilters = () => {
    setQ(''); setDebouncedQ(''); setStatus('');
    if (view === 'list' && pipelineId) { setPipelineId(''); syncUrl(view, ''); }
  };
  const steel = isTataTiscanActive(getStoredUser());
  const compact = (v: number) => formatINRCompact(v);
  const deals_ = (n: number) => `${n.toLocaleString('en-IN')} ${n === 1 ? 'deal' : 'deals'}`;
  // An admin who hid the deal amount sees counts on the tiles instead of money.
  const amountHidden = fields.isHidden('amount');
  const money = (b: Bucket): Pick<MetricTile, 'value' | 'title' | 'sub'> => (amountHidden
    ? { value: b.count.toLocaleString('en-IN'), sub: b.count === 1 ? 'deal' : 'deals' }
    : { value: compact(b.value), title: formatINR(b.value), sub: deals_(b.count) });
  const tiles: MetricTile[] = (() => {
    const s = summary;
    const all: Bucket = s ? { count: s.open.count + s.won.count + s.lost.count, value: s.open.value + s.won.value + s.lost.value } : { count: 0, value: 0 };
    const closed = s ? s.won.count + s.lost.count : 0;
    // In Kanban the board is always the open deals of one pipeline, so the tiles summarise but do not filter.
    const pick = (st: StatusFilter) => (view === 'list' ? () => setStatus((cur) => (cur === st ? '' : st)) : undefined);
    const bucket = (key: 'open' | 'won' | 'lost', label: string, tone: MetricTile['tone']): MetricTile => ({
      key, label, tone, testId: `deal-tile-${key}`,
      ...(s ? money(s[key]) : { value: '—', sub: ' ' }), active: view === 'list' ? status === key : key === 'open', onSelect: pick(key),
    });
    const out: MetricTile[] = [
      { key: 'all', label: 'All deals', tone: 'neutral', testId: 'deal-tile-all', ...(s ? money(all) : { value: '—', sub: ' ' }), active: view === 'list' && status === '', onSelect: view === 'list' ? () => setStatus('') : undefined },
      bucket('open', 'Open pipeline', 'info'),
      bucket('won', 'Won', 'ok'),
      bucket('lost', 'Lost', 'red'),
      { key: 'rate', label: 'Win rate', tone: 'warn', testId: 'deal-tile-rate', value: s && closed ? `${Math.round((s.won.count / closed) * 100)}%` : '—', sub: s ? (closed ? `${s.won.count} won of ${closed} closed` : 'No closed deals yet') : ' ' },
    ];
    // Volume (kg / MT) is a steel-dealer concept (weight-priced deals — Tata / SRS, BMW, PASA). It's meaningless for
    // other tenants like Kinematic, so the tile is gated on steel-dealer status, like the volume_kg column.
    if (steel && totals && totals.volume_kg > 0) {
      out.push({
        key: 'volume', label: 'Volume', tone: 'neutral', testId: 'deal-tile-volume',
        value: totals.volume_kg >= 1000 ? `${(totals.volume_kg / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} MT` : `${Math.round(totals.volume_kg).toLocaleString('en-IN')} kg`,
        sub: 'Summed from the deals listed',
      });
    }
    return out;
  })();

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
              <>
                <LayoutModeToggle mode={dealView.prefs.mode} onSetMode={dealView.setMode} />
                <ViewCustomizer
                  entityLabel="Deals"
                  // Dealer + Volume (kg) are steel-dealer-only (Tata / BMW / SRS)
                  // columns — don't even offer them as toggles on other tenants
                  // (e.g. the Kinematic admin), matching DealsTable's render gate.
                  columns={(isTataTiscanActive(getStoredUser())
                    ? DEAL_COLUMNS
                    : DEAL_COLUMNS.filter((c) => c.key !== 'dealer' && c.key !== 'volume_kg')
                  ).filter((c) => !(fieldsLoaded && fields.isHidden(c.key))) as unknown as { key: string; label: string; locked?: boolean }[]}
                  hidden={dealView.prefs.hidden}
                  mode={dealView.prefs.mode}
                  onToggle={dealView.toggleHidden}
                  onReset={dealView.reset}
                />
              </>
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

      {/* Count + value by status across every page of the current filter; in List each tile is also the status filter. */}
      <MetricTiles tiles={tiles} loading={summaryLoading} />

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
            <div style={{ position: 'relative', width: narrow ? '100%' : 280 }}>
              <Search size={15} strokeWidth={1.8} aria-hidden style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' }} />
              <Input placeholder="Search deals..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search deals" style={{ paddingLeft: 34 }} />
            </div>
            {filtersActive && (
              <Button size="sm" variant="ghost" onClick={clearFilters} icon={<X size={14} strokeWidth={1.8} />}>Clear filters</Button>
            )}
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
              action={<Button variant="primary" href="/dashboard/crm/pipeline" icon={<KanbanSquare size={16} strokeWidth={1.8} />}>Go to Pipeline</Button>}
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
            loading={loading || !fieldsLoaded}
            fields={fields}
            filtered={filtersActive}
            onClearFilters={clearFilters}
            hiddenColumns={dealHidden}
            viewMode={dealView.prefs.mode === 'cards' ? 'cards' : 'table'}
            sort={sort}
            onSort={(key) => setSort((s) => s.key === key ? { key, order: s.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' })}
            onAssign={async (dealId, userId) => {
              await crmDeals.update(dealId, { owner_id: userId } as any);
              toast.success(userId ? 'Deal reassigned' : 'Deal unassigned');
              reload();
              setSummaryTick((n) => n + 1);
            }}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onEdit={setEditingDeal}
            onDelete={async (id) => {
              if (!(await confirm({
                title: 'Delete this deal?',
                message: 'This soft-deletes it — the row can be restored from the database if needed',
                confirmLabel: 'Delete deal',
                confirmingLabel: 'Deleting…',
                tone: 'danger',
                irreversible: false,
              }))) return;
              try {
                await crmDeals.remove(id);
                toast.success('Deal deleted');
                setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
                reload();
                setSummaryTick((n) => n + 1);
              } catch (e: any) {
                toast.error(e?.message || 'Delete failed');
              }
            }}
          />
          <ServerPaginationBar
            pagination={pagination}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            loading={loading}
            noun="deals"
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
          onSaved={() => { setEditingDeal(null); reload(); setSummaryTick((n) => n + 1); }}
        />
      )}
    </div>
  );
}
