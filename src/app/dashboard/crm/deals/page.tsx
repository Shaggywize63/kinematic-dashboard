'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmDeals, crmPipelines, type Pagination } from '../../../../lib/crmApi';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import type { Deal, Pipeline } from '../../../../types/crm';
import DealsTable, { DEAL_COLUMNS } from '../../../../components/crm/DealsTable';
import ViewCustomizer from '../../../../components/crm/shared/ViewCustomizer';
import { useViewPrefs } from '../../../../lib/crmViewPrefs';
import { getStoredUser, canAccess, getStoredToken } from '../../../../lib/auth';
import { API_BASE_URL } from '../../../../lib/api';

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
    <Suspense fallback={<div style={{ color: 'var(--text-dim)' }}>Loading deals…</div>}>
      <DealsListPage />
    </Suspense>
  );
}

function DealsListPage() {
  const router = useRouter();
  const search = useSearchParams();
  const initialView: ViewMode = search.get('view') === 'kanban' ? 'kanban' : 'list';
  const initialPipelineId = search.get('pipeline_id') || '';

  const [view, setView] = useState<ViewMode>(initialView);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string>(initialPipelineId);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
      if (view === 'kanban' && pipelineId) qs.set('pipeline_id', pipelineId);
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
  const dealView = useViewPrefs('deals');
  const dealHidden = useMemo(() => new Set(dealView.prefs.hidden), [dealView.prefs.hidden]);

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
      if (!pipelineId) {
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
      }
      const r = await crmDeals.list(params);
      setDeals(r.data || []);
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
    page, pageSize, status,
  ]);

  // Reset to page 1 whenever the server-side filter set changes,
  // otherwise a stricter filter while on page 5 lands on an empty page.
  useEffect(() => { setPage(1); /* eslint-disable-next-line */ }, [
    range.from, range.to, status, pageSize, view,
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

  return (
    <div>
      <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Revenue opportunities progressing through your sales pipeline. Each deal tracks value, expected close date, and AI-powered win probability. Toggle <strong style={{ color: 'var(--text)' }}>Kanban</strong> to drag deals between stages, or stay on <strong style={{ color: 'var(--text)' }}>List</strong> for bulk edits and filters.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View toggle — segmented control */}
          <div style={{ display: 'inline-flex', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
            {(['list', 'kanban'] as ViewMode[]).map((v) => {
              const active = view === v;
              return (
                <button
                  key={v}
                  onClick={() => { setView(v); setSelected(new Set()); syncUrl(v, pipelineId); }}
                  style={{
                    background: active ? 'var(--primary)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-dim)',
                    border: 'none', padding: '6px 12px', borderRadius: 6,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                  }}>
                  {v === 'list' ? '☰ List' : '▦ Kanban'}
                </button>
              );
            })}
          </div>

          {/* Pipeline selector — only meaningful in kanban (filters by pipeline) */}
          {view === 'kanban' && pipelines.length > 0 && (
            <select
              value={pipelineId}
              onChange={(e) => { setPipelineId(e.target.value); syncUrl(view, e.target.value); }}
              style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          )}

          {view === 'list' && (
            <>
              <input placeholder="Search deals..." value={q} onChange={(e) => setQ(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 240 }} />
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
                <option value="">All</option><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option>
              </select>
            </>
          )}

          {view === 'list' && selected.size > 0 && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>· {selected.size} selected</span>
              <button
                onClick={bulkDelete}
                disabled={bulkBusy}
                style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {bulkBusy ? 'Deleting…' : `🗑 Delete ${selected.size}`}
              </button>
            </>
          )}
        </div>
        {/* Right-hand toolbar — Export CSV is always visible (admin or
            not). New Deal button removed by design — deals are created
            exclusively via the lead-conversion flow (Lead detail →
            Convert) so the deal inherits the lead's qualification,
            source, and history. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {view === 'list' && (
            <ViewCustomizer
              entityLabel="Deals"
              columns={DEAL_COLUMNS as unknown as { key: string; label: string; locked?: boolean }[]}
              hidden={dealView.prefs.hidden}
              mode={dealView.prefs.mode}
              onToggle={dealView.toggleHidden}
              onSetMode={dealView.setMode}
              onReset={dealView.reset}
            />
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            title="Download deals as CSV (respects current search / status filter)"
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: exporting ? 'wait' : 'pointer', opacity: exporting ? 0.6 : 1 }}>
            {exporting ? 'Exporting…' : '⬇ Export CSV'}
          </button>
        </div>
      </div>

      {view === 'kanban' ? (
        loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>Loading kanban…</div>
        ) : !activePipeline ? (
          <div style={{ padding: 40, textAlign: 'center', background: 'var(--s2)', border: '1px dashed var(--border)', borderRadius: 14 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No pipeline yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
              The Kanban view groups open deals by stage. Create a pipeline first.
            </div>
            <Link href="/dashboard/crm/pipeline" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Go to Pipeline →</Link>
          </div>
        ) : stages.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', background: 'var(--s2)', border: '1px dashed var(--border)', borderRadius: 14 }}>
            Pipeline “{activePipeline.name}” has no stages yet. <Link href={`/dashboard/crm/settings/stages?pipeline_id=${activePipeline.id}`} style={{ color: 'var(--primary)' }}>Add stages →</Link>
          </div>
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
            onAssign={async (dealId, userId) => {
              await crmDeals.update(dealId, { owner_id: userId } as any);
              toast.success(userId ? 'Deal reassigned' : 'Deal unassigned');
              reload();
            }}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
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
          {DEAL_PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
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
