'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { crmPipelines, crmDeals } from '../../lib/crmApi';
import type { Pipeline, Deal } from '../../types/crm';
import Modal from './shared/Modal';
import { Badge, Button, T } from '../ui';

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
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title={deal.pipeline_id ? 'Move pipeline' : 'Add to pipeline'}
      subtitle={deal.name}
      width={520}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" variant="primary" onClick={submit} disabled={busy || !selected || pipelines.length === 0 || selected === deal.pipeline_id}>
            {busy ? 'Saving…' : deal.pipeline_id ? 'Move' : 'Add'}
          </Button>
        </>
      }
    >
      {pipelines.length === 0 ? (
        <div style={{ background: T.raised, borderRadius: T.radius.md, padding: 14, fontSize: 13.5, color: T.dim }}>
          No pipelines exist yet. Create one from <span style={{ color: T.text }}>CRM → Pipelines</span> first.
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
                  padding: '10px 12px', borderRadius: T.radius.md, cursor: 'pointer',
                  background: active ? T.infoWash : T.raised,
                  border: `1px solid ${active ? T.info : 'transparent'}`,
                  transition: 'background .12s ease, border-color .12s ease',
                }}>
                <input
                  type="radio"
                  name="pipeline"
                  value={p.id}
                  checked={active}
                  onChange={() => setSelected(p.id)}
                  style={{ width: 15, height: 15, margin: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {p.name}
                    {p.is_default && <Badge tone="neutral">Default</Badge>}
                    {isCurrent && <Badge tone="red">Current</Badge>}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.dim, marginTop: 2 }}>
                    <span style={{ fontFamily: T.mono }}>{stagesCount}</span> stage{stagesCount === 1 ? '' : 's'} · <span style={{ fontFamily: T.mono }}>{openStages}</span> open
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: T.raised, borderRadius: T.radius.md, padding: '10px 12px', fontSize: 12.5, color: T.dim, marginTop: 14, lineHeight: 1.5 }}>
        <Info size={14} strokeWidth={1.6} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>The deal moves to the first <span style={{ color: T.text }}>open</span> stage of the chosen pipeline. Its win probability resets to that stage&rsquo;s default and the stage progress repaints.</span>
      </div>
    </Modal>
  );
}
