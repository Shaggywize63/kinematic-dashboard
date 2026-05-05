'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmPipelines, crmDeals } from '../../../../lib/crmApi';
import type { Pipeline, Deal } from '../../../../types/crm';
import DealKanban from '../../../../components/crm/DealKanban';

export default function PipelinePage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string>('');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await crmPipelines.list();
        setPipelines(r.data || []);
        const def = (r.data || []).find((p) => p.is_default) || (r.data || [])[0];
        if (def) setPipelineId(def.id);
      } catch (e: any) { toast.error(e.message || 'Failed to load pipelines'); }
    })();
  }, []);

  useEffect(() => {
    if (!pipelineId) return;
    (async () => {
      setLoading(true);
      try {
        const r = await crmDeals.list({ pipeline_id: pipelineId, status: 'open' });
        setDeals(r.data || []);
      } catch (e: any) { toast.error(e.message || 'Failed to load deals'); } finally { setLoading(false); }
    })();
  }, [pipelineId]);

  const current = pipelines.find((p) => p.id === pipelineId);
  const stages = current?.stages || [];

  return (
    <div>
      <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Visualise open deals across every stage of your sales process. Drag cards to advance deals, spot bottlenecks at a glance, and act on AI-suggested next actions to keep every opportunity moving towards close.
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
          {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{deals.length} open deals</div>
      </div>
      {loading ? (
        <div style={{ color: 'var(--text-dim)', padding: 24 }}>Loading kanban...</div>
      ) : (
        <DealKanban stages={stages} initialDeals={deals} />
      )}
    </div>
  );
}
