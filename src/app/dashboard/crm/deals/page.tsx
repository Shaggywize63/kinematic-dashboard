'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmDeals, crmPipelines } from '../../../../lib/crmApi';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import type { Deal, Pipeline } from '../../../../types/crm';
import DealsTable from '../../../../components/crm/DealsTable';
import { getStoredUser, canAccess } from '../../../../lib/auth';

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
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));

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
      const r = view === 'kanban' && pipelineId
        ? await crmDeals.list({ ...range, pipeline_id: pipelineId, status: 'open', limit: 500 })
        : await crmDeals.list(range);
      setDeals(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadPipelines(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [range.from, range.to, view, pipelineId]);

  useEffect(() => {
    const user = getStoredUser();
    if (user && canAccess(user.role, ['sub_admin'])) setIsAdmin(true);
  }, []);

  const activePipeline = useMemo(() => pipelines.find((p) => p.id === pipelineId) || null, [pipelines, pipelineId]);
  const stages = useMemo(() => (activePipeline?.stages || []).slice().sort((a, b) => a.position - b.position), [activePipeline]);

  const filtered = deals.filter((d) => {
    if (q && !`${d.name} ${d.account_name || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (status && d.status !== status) return false;
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

          {isAdmin && view === 'list' && selected.size > 0 && (
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
        <Link href="/dashboard/crm/deals/new" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ New Deal</Link>
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
        <DealsTable
          deals={filtered}
          loading={loading}
          onAssign={async (dealId, userId) => {
            await crmDeals.update(dealId, { owner_id: userId } as any);
            toast.success(userId ? 'Deal reassigned' : 'Deal unassigned');
            reload();
          }}
          selected={isAdmin ? selected : undefined}
          onToggle={isAdmin ? toggle : undefined}
          onToggleAll={isAdmin ? toggleAll : undefined}
        />
      )}
    </div>
  );
}
