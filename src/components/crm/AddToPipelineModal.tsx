'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmPipelines, crmDeals } from '../../lib/crmApi';
import type { Pipeline, Deal } from '../../types/crm';

interface Props {
  deal: Deal;
  pipelines: Pipeline[];
  open: boolean;
  onClose: () => void;
  onUpdated: (updated: Deal) => void;
}

/**
 * Reassign a deal to a pipeline (or attach one if it currently has none).
 * Used by the "Add to pipeline" button on the deal detail page when:
 *   - The deal was created without a pipeline_id (rare but possible via
 *     the legacy convert flow before client_id stamping).
 *   - The rep wants to move the deal between two parallel pipelines
 *     (e.g. promoting an SMB deal into the Enterprise pipeline).
 *
 * On submit, PATCH /deals/:id with { pipeline_id, stage_id } so the
 * deal lands on the first OPEN stage of the new pipeline. The deal
 * detail page reloads and re-fetches the stage list so the breadcrumb
 * path repaints.
 */
export default function AddToPipelineModal({ deal, pipelines, open, onClose, onUpdated }: Props) {
  const [selected, setSelected] = useState<string>(deal.pipeline_id || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setSelected(deal.pipeline_id || '');
  }, [open, deal.pipeline_id]);

  if (!open) return null;

  const submit = async () => {
    if (!selected) return toast.error('Pick a pipeline');
    const p = pipelines.find((x) => x.id === selected);
    if (!p) return toast.error('Pipeline not found');
    const firstOpen = (p.stages || []).slice().sort((a, b) => a.position - b.position).find((s) => s.stage_type === 'open');
    if (!firstOpen) return toast.error(`Pipeline "${p.name}" has no open stages — add one before assigning deals.`);

    setBusy(true);
    try {
      const r = await crmDeals.update(deal.id, { pipeline_id: selected, stage_id: firstOpen.id } as any);
      toast.success(deal.pipeline_id ? `Moved to ${p.name}` : `Added to ${p.name}`);
      onUpdated(r.data);
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: 480, maxWidth: '100%' }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>{deal.pipeline_id ? 'Move pipeline' : 'Add to pipeline'}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{deal.name}</div>
        </div>

        {pipelines.length === 0 ? (
          <div style={{ background: 'var(--s3)', borderRadius: 8, padding: 14, fontSize: 13, color: 'var(--text-dim)' }}>
            No pipelines exist yet. Create one from <strong style={{ color: 'var(--text)' }}>CRM → Pipeline</strong> first.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
            {pipelines.map((p) => {
              const stagesCount = (p.stages || []).length;
              const openStages = (p.stages || []).filter((s) => s.stage_type === 'open').length;
              const active = selected === p.id;
              const isCurrent = deal.pipeline_id === p.id;
              return (
                <label key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: 12, borderRadius: 10, cursor: 'pointer',
                    background: active ? 'rgba(224,30,44,0.12)' : 'var(--s3)',
                    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                  }}>
                  <input
                    type="radio"
                    name="pipeline"
                    value={p.id}
                    checked={active}
                    onChange={() => setSelected(p.id)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {p.name}
                      {p.is_default && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'var(--s4)', color: 'var(--text-dim)', fontWeight: 800, letterSpacing: 0.4 }}>DEFAULT</span>}
                      {isCurrent && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'var(--primary)', color: '#fff', fontWeight: 800, letterSpacing: 0.4 }}>CURRENT</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{stagesCount} stage{stagesCount === 1 ? '' : 's'} · {openStages} open</div>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div style={{ background: 'var(--s3)', borderRadius: 8, padding: 10, fontSize: 11, color: 'var(--text-dim)', marginTop: 14, lineHeight: 1.5 }}>
          The deal will move to the first <strong style={{ color: 'var(--text)' }}>open</strong> stage of the chosen pipeline. Its win probability resets to that stage&rsquo;s default and the breadcrumb path repaints below.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} disabled={busy} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={busy || !selected || pipelines.length === 0 || selected === deal.pipeline_id}
            style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: (busy || !selected || selected === deal.pipeline_id) ? 0.6 : 1 }}>
            {busy ? 'Saving…' : deal.pipeline_id ? 'Move' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
