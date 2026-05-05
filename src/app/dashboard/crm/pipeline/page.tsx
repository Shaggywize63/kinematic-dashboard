'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmPipelines, crmDeals } from '../../../../lib/crmApi';
import type { Pipeline, Deal } from '../../../../types/crm';
import DealKanban from '../../../../components/crm/DealKanban';

export default function PipelinePage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string>('');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPipeline, setShowAddPipeline] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const loadPipelines = async () => {
    try {
      const r = await crmPipelines.list();
      setPipelines(r.data || []);
      if (!pipelineId) {
        const def = (r.data || []).find((p) => p.is_default) || (r.data || [])[0];
        if (def) setPipelineId(def.id);
      }
    } catch (e: any) { toast.error(e.message || 'Failed to load pipelines'); }
  };

  useEffect(() => { loadPipelines(); }, []);

  useEffect(() => {
    if (!pipelineId) return;
    (async () => {
      setLoading(true);
      try {
        const r = await crmDeals.list({ pipeline_id: pipelineId, status: 'open' });
        setDeals(r.data || []);
      } catch (e: any) { toast.error(e.message || 'Failed to load deals'); }
      finally { setLoading(false); }
    })();
  }, [pipelineId]);

  const addPipeline = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const r = await crmPipelines.create({ name: newName.trim(), is_default: pipelines.length === 0 } as any);
      toast.success(`Pipeline "${newName.trim()}" created`);
      setNewName('');
      setShowAddPipeline(false);
      await loadPipelines();
      if (r.data?.id) setPipelineId(r.data.id);
    } catch (e: any) { toast.error(e.message || 'Create failed'); }
    finally { setAdding(false); }
  };

  const current = pipelines.find((p) => p.id === pipelineId);
  const stages = current?.stages || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}
          >
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (default)' : ''}</option>)}
          </select>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{deals.length} open deal{deals.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowAddPipeline(!showAddPipeline)}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 13px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
          >
            {showAddPipeline ? '✕' : '+ New Pipeline'}
          </button>
          <Link
            href="/dashboard/crm/settings/pipelines"
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '7px 13px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
          >
            Manage Pipelines
          </Link>
        </div>
      </div>

      {showAddPipeline && (
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 14, display: 'flex', gap: 8 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPipeline()}
            placeholder="New pipeline name (e.g. Enterprise Sales)"
            style={{ flex: 1, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}
          />
          <button onClick={addPipeline} disabled={adding} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            {adding ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

      {pipelines.length === 0 && !loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No pipelines yet</div>
          <div style={{ fontSize: 13 }}>Create a pipeline above to start tracking deals through stages.</div>
        </div>
      ) : loading ? (
        <div style={{ color: 'var(--text-dim)', padding: 24 }}>Loading kanban…</div>
      ) : stages.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No stages in this pipeline</div>
          <div style={{ fontSize: 13 }}>
            Go to <Link href="/dashboard/crm/settings/stages" style={{ color: 'var(--primary)' }}>Settings → Stages</Link> to add stages.
          </div>
        </div>
      ) : (
        <DealKanban stages={stages} initialDeals={deals} />
      )}
    </div>
  );
}
