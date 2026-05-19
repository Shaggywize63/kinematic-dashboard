'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { crmPipelines, crmStages } from '../../lib/crmApi';

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

// Per-stage-type colour palette. Used by the "+ Open / + Won / + Lost"
// add buttons (so each kind reads visually distinct) and as a left-edge
// accent on each stage row in the draft list (so reps can see at a
// glance which rows are open / won / lost).
const TYPE_COLOR: Record<DraftStage['stage_type'], string> = {
  open: '#3E9EFF',   // blue — same as the current-stage chevron
  won: '#10b981',    // green
  lost: '#ef4444',   // red
};

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

  // Per-type add button — colours so reps can find Won/Lost without reading.
  const addBtn = (type: 'open' | 'won' | 'lost', label: string): React.CSSProperties => ({
    background: 'transparent',
    border: `1px solid ${TYPE_COLOR[type]}`,
    color: TYPE_COLOR[type],
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
    letterSpacing: 0.3,
    whiteSpace: 'nowrap',
  });

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, width: 720, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6, marginBottom: 4 }}>New Pipeline</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Define name + stages in one go</div>
          </div>
          <button onClick={onClose} disabled={saving} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={lblCss}>Pipeline name <span style={{ color: '#ef4444' }}>*</span></span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Enterprise Sales, B2B TMT, Channel Partners" style={inputCss} />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Set as default pipeline (new deals land here unless told otherwise)
          </label>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
              <span style={lblCss}>Stages <span style={{ color: '#ef4444' }}>*</span></span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => addStage('open')} style={addBtn('open', '+ Open')}>+ Open stage</button>
                <button type="button" onClick={() => addStage('won')}  style={addBtn('won', '+ Won')}>+ Won</button>
                <button type="button" onClick={() => addStage('lost')} style={addBtn('lost', '+ Lost')}>+ Lost</button>
              </div>
            </div>
            <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 110px 100px 70px', gap: 8, padding: '4px 8px', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, minWidth: 540 }}>
                <span>#</span><span>Name</span><span>Type</span><span>Win %</span><span></span>
              </div>
              {stages.map((s, i) => (
                <div key={s.id} style={{
                  display: 'grid', gridTemplateColumns: '24px 1fr 110px 100px 70px', gap: 8,
                  padding: '6px 8px', alignItems: 'center', borderTop: '1px solid var(--border)',
                  borderLeft: `3px solid ${TYPE_COLOR[s.stage_type]}`,
                  background: `${TYPE_COLOR[s.stage_type]}08`,
                  minWidth: 540,
                }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700 }}>{i + 1}</span>
                  <input value={s.name} onChange={(e) => updateStage(s.id, { name: e.target.value })} placeholder="Stage name" style={{ ...inputCss, padding: '6px 10px' }} />
                  <select value={s.stage_type} onChange={(e) => updateStage(s.id, { stage_type: e.target.value as any })}
                    style={{
                      ...inputCss, padding: '6px 8px',
                      color: TYPE_COLOR[s.stage_type], fontWeight: 700,
                      borderColor: TYPE_COLOR[s.stage_type],
                    }}>
                    <option value="open">open</option>
                    <option value="won">won</option>
                    <option value="lost">lost</option>
                  </select>
                  <input type="number" min={0} max={100} step={5} value={Math.round((s.probability || 0) * 100)}
                    onChange={(e) => updateStage(s.id, { probability: Math.max(0, Math.min(100, Number(e.target.value))) / 100 })}
                    style={{ ...inputCss, padding: '6px 8px', textAlign: 'right' }} />
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => moveStage(s.id, -1)} disabled={i === 0} style={miniBtn}>↑</button>
                    <button type="button" onClick={() => moveStage(s.id, 1)} disabled={i === stages.length - 1} style={miniBtn}>↓</button>
                    <button type="button" onClick={() => removeStage(s.id)} style={{ ...miniBtn, color: '#ef4444', borderColor: '#ef4444' }}>×</button>
                  </div>
                </div>
              ))}
              {stages.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>No stages yet — add at least one open + one closed.</div>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.5 }}>
              <strong style={{ color: TYPE_COLOR.open }}>Open</strong> stages live in the pipeline (Discovery, Qualification…).
              <strong style={{ color: TYPE_COLOR.won, marginLeft: 6 }}>Won</strong> marks a sale;
              <strong style={{ color: TYPE_COLOR.lost, marginLeft: 6 }}>Lost</strong> is a closed-lost terminus.
              Win% is the default win probability when a deal enters this stage; KINI AI overrides it per-deal as activity flows in.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button onClick={onClose} disabled={saving} style={btnSecondary}>Cancel</button>
            <button onClick={submit} disabled={saving || !name.trim()} style={btnPrimary}>
              {saving ? 'Creating…' : `Create pipeline + ${stages.filter((s) => s.name.trim()).length} stage${stages.filter((s) => s.name.trim()).length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const lblCss: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.4 };
const inputCss: React.CSSProperties = { background: 'var(--s4)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer' };
const miniBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '2px 6px', borderRadius: 4, fontSize: 11, cursor: 'pointer', minWidth: 22 };
