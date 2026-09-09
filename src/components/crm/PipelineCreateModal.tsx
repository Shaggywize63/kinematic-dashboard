'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { crmPipelines, crmStages } from '../../lib/crmApi';
import Modal from './shared/Modal';
import { Button, Field, IconButton, Input, Select, T, eyebrowStyle, labelStyle, requiredMark, type Tone } from '../ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (pipelineId: string) => void;
  isFirstPipeline: boolean;
}

type DraftStage = {
  id: string;            // local-only id for React keys
  name: string;
  stage_type: 'open' | 'won' | 'lost';
  probability: number;   // 0-1
};

const DEFAULT_STAGES: DraftStage[] = [
  { id: 's1', name: 'Discovery',      stage_type: 'open', probability: 0.20 },
  { id: 's2', name: 'Qualification',  stage_type: 'open', probability: 0.40 },
  { id: 's3', name: 'Proposal',       stage_type: 'open', probability: 0.60 },
  { id: 's4', name: 'Negotiation',    stage_type: 'open', probability: 0.80 },
  { id: 's5', name: 'Closed Won',     stage_type: 'won',  probability: 1.00 },
  { id: 's6', name: 'Closed Lost',    stage_type: 'lost', probability: 0.00 },
];

let _tmpKey = 100;
const newKey = () => `s${_tmpKey++}`;

// Per-stage-type semantic colour. Used as a left-edge accent on each draft
// row so reps can see at a glance which rows are open / won / lost.
const TYPE_COLOR: Record<DraftStage['stage_type'], string> = {
  open: T.info,
  won: T.ok,
  lost: T.red,
};
const TYPE_TONE: Record<DraftStage['stage_type'], Tone> = { open: 'info', won: 'ok', lost: 'red' };

/**
 * Create-pipeline modal that builds the pipeline AND its stages in one
 * round-trip from the user's perspective. Replaces the old "type a name →
 * pipeline exists with zero stages → go to Settings to add stages" flow.
 */
export default function PipelineCreateModal({ open, onClose, onCreated, isFirstPipeline }: Props) {
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(isFirstPipeline);
  const [stages, setStages] = useState<DraftStage[]>(() => DEFAULT_STAGES.map((s) => ({ ...s })));
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const updateStage = (id: string, patch: Partial<DraftStage>) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const removeStage = (id: string) => {
    setStages((prev) => prev.filter((s) => s.id !== id));
  };
  const moveStage = (id: string, dir: -1 | 1) => {
    setStages((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const addStage = (type: 'open' | 'won' | 'lost' = 'open') => {
    setStages((prev) => [
      ...prev,
      { id: newKey(), name: '', stage_type: type, probability: type === 'won' ? 1 : type === 'lost' ? 0 : 0.5 },
    ]);
  };

  const submit = async () => {
    if (!name.trim()) return toast.error('Pipeline name is required');
    const cleanStages = stages.filter((s) => s.name.trim().length > 0);
    if (cleanStages.length === 0) return toast.error('Add at least one stage');
    if (!cleanStages.some((s) => s.stage_type === 'open')) {
      return toast.error('At least one stage must be type "open" so deals can start somewhere');
    }
    setSaving(true);
    try {
      const r = await crmPipelines.create({ name: name.trim(), is_default: isDefault } as any);
      const pipelineId = r.data?.id;
      if (!pipelineId) throw new Error('Pipeline created but no id returned');

      for (let i = 0; i < cleanStages.length; i++) {
        const s = cleanStages[i];
        await crmStages.create({
          pipeline_id: pipelineId,
          name: s.name.trim(),
          position: i,
          stage_type: s.stage_type,
          probability: s.probability,
        } as any);
      }

      toast.success(`Pipeline "${name.trim()}" created with ${cleanStages.length} stages`);
      onCreated(pipelineId);
      setName('');
      setStages(DEFAULT_STAGES.map((s) => ({ ...s })));
    } catch (e: any) {
      toast.error(e.message || 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const namedCount = stages.filter((s) => s.name.trim()).length;
  // Compact controls inside the stage grid.
  const cell: React.CSSProperties = { height: 32, fontSize: 13 };
  const cols = '28px minmax(160px, 1fr) 110px 90px 96px';

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title="New pipeline"
      subtitle="Define the name and its stages in one go."
      width={760}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" variant="primary" onClick={submit} disabled={saving || !name.trim()}>
            {saving ? 'Creating…' : `Create pipeline · ${namedCount} stage${namedCount === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Pipeline name" required htmlFor="pipeline-name">
          <Input id="pipeline-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Enterprise Sales, B2B TMT, Channel Partners" autoFocus />
        </Field>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: T.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} style={{ width: 16, height: 16 }} />
          Set as default pipeline — new deals land here unless told otherwise
        </label>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
            <span style={labelStyle}>Stages{requiredMark}</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Button type="button" size="sm" variant="ghost" onClick={() => addStage('open')} icon={<Plus size={14} strokeWidth={2} />}>Open stage</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => addStage('won')}  icon={<Plus size={14} strokeWidth={2} />} style={{ color: T.ok }}>Won</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => addStage('lost')} icon={<Plus size={14} strokeWidth={2} />} style={{ color: T.red }}>Lost</Button>
            </div>
          </div>
          <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, overflowX: 'auto' }}>
            <div style={{ minWidth: 540 }}>
              <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '8px 10px', ...eyebrowStyle, background: T.raised, borderBottom: `1px solid ${T.border}` }}>
                <span>#</span><span>Name</span><span>Type</span><span>Win %</span><span />
              </div>
              {stages.map((s, i) => (
                <div key={s.id} style={{
                  display: 'grid', gridTemplateColumns: cols, gap: 8,
                  padding: '6px 10px', alignItems: 'center',
                  borderTop: i === 0 ? 0 : `1px solid ${T.border}`,
                  boxShadow: `inset 3px 0 0 ${TYPE_COLOR[s.stage_type]}`,
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.mute }}>{String(i + 1).padStart(2, '0')}</span>
                  <Input value={s.name} onChange={(e) => updateStage(s.id, { name: e.target.value })} placeholder="Stage name" style={cell} aria-label={`Stage ${i + 1} name`} />
                  <Select value={s.stage_type} onChange={(e) => updateStage(s.id, { stage_type: e.target.value as any })} style={{ ...cell, color: TYPE_COLOR[s.stage_type], fontWeight: 500 }} aria-label={`Stage ${i + 1} type`}>
                    <option value="open">Open</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </Select>
                  <Input type="number" min={0} max={100} step={5} value={Math.round((s.probability || 0) * 100)}
                    onChange={(e) => updateStage(s.id, { probability: Math.max(0, Math.min(100, Number(e.target.value))) / 100 })}
                    style={{ ...cell, textAlign: 'right', fontFamily: T.mono, fontSize: 12.5 }} aria-label={`Stage ${i + 1} win probability`} />
                  <div style={{ display: 'flex', gap: 0, justifyContent: 'flex-end' }}>
                    <IconButton label="Move up" onClick={() => moveStage(s.id, -1)} disabled={i === 0} style={{ width: 28, height: 28 }}><ArrowUp size={14} strokeWidth={1.8} /></IconButton>
                    <IconButton label="Move down" onClick={() => moveStage(s.id, 1)} disabled={i === stages.length - 1} style={{ width: 28, height: 28 }}><ArrowDown size={14} strokeWidth={1.8} /></IconButton>
                    <IconButton label="Remove stage" onClick={() => removeStage(s.id)} style={{ width: 28, height: 28, color: T.red }}><X size={14} strokeWidth={1.8} /></IconButton>
                  </div>
                </div>
              ))}
              {stages.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: T.mute, fontSize: 12.5 }}>No stages yet — add at least one open + one closed.</div>}
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: T.dim, marginTop: 8, lineHeight: 1.5 }}>
            <span style={{ color: TYPE_COLOR.open }}>Open</span> stages live in the pipeline (Discovery, Qualification…);
            <span style={{ color: TYPE_COLOR.won, marginLeft: 4 }}>Won</span> marks a sale;
            <span style={{ color: TYPE_COLOR.lost, marginLeft: 4 }}>Lost</span> is a closed-lost terminus.
            Win % is the default probability when a deal enters the stage; KINI AI overrides it per deal as activity flows in.
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Keep the tone map referenced so the semantic badge colours stay in one place
// should the stage rows grow a type pill later.
void TYPE_TONE;
