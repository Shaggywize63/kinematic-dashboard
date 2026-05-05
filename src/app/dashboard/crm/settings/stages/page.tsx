'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmStages, crmPipelines } from '../../../../../lib/crmApi';
import type { Stage, Pipeline } from '../../../../../types/crm';

const STAGE_TYPES = [
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

export default function StagesSettings() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // create form
  const [pipelineId, setPipelineId] = useState('');
  const [name, setName] = useState('');
  const [stageType, setStageType] = useState<'open' | 'won' | 'lost'>('open');
  const [probability, setProbability] = useState(50);
  const [color, setColor] = useState(COLORS[0]);
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.allSettled([crmStages.list(), crmPipelines.list()]);
      if (s.status === 'fulfilled') setStages(s.value.data || []);
      if (p.status === 'fulfilled') {
        const pl = p.value.data || [];
        setPipelines(pl);
        if (!pipelineId && pl.length > 0) setPipelineId((pl.find((x) => x.is_default) || pl[0]).id);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const create = async () => {
    if (!name.trim()) return toast.error('Stage name is required');
    if (!pipelineId) return toast.error('Select a pipeline');
    setCreating(true);
    try {
      const existing = stages.filter((s) => (s as any).pipeline_id === pipelineId);
      await crmStages.create({
        pipeline_id: pipelineId,
        name: name.trim(),
        stage_type: stageType,
        probability,
        color,
        position: existing.length,
      } as any);
      toast.success(`Stage "${name.trim()}" added`);
      setName(''); setProbability(50); setColor(COLORS[0]);
      reload();
    } catch (e: any) { toast.error(e.message || 'Create failed'); }
    finally { setCreating(false); }
  };

  const remove = async (s: Stage) => {
    if (!window.confirm(`Delete stage "${s.name}"? Deals in this stage will lose their stage assignment.`)) return;
    setBusy((b) => ({ ...b, [s.id]: true }));
    try {
      await crmStages.remove(s.id);
      toast.success('Stage deleted');
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy((b) => ({ ...b, [s.id]: false })); }
  };

  const selectedPipelineStages = stages.filter((s) => (s as any).pipeline_id === pipelineId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Create form */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Add Stage to Pipeline</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 8 }}>
          <label style={fieldWrap}>
            <span style={fieldLabel}>Pipeline</span>
            <select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} style={input}>
              <option value="">— Select pipeline —</option>
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (default)' : ''}</option>)}
            </select>
          </label>
          <label style={fieldWrap}>
            <span style={fieldLabel}>Stage Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="e.g. Discovery" style={input} />
          </label>
          <label style={fieldWrap}>
            <span style={fieldLabel}>Type</span>
            <select value={stageType} onChange={(e) => setStageType(e.target.value as any)} style={input}>
              {STAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label style={fieldWrap}>
            <span style={fieldLabel}>Win Probability %</span>
            <input type="number" min={0} max={100} value={probability} onChange={(e) => setProbability(Number(e.target.value))} style={input} />
          </label>
          <label style={fieldWrap}>
            <span style={fieldLabel}>Color</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 4 }}>
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--text)' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
              ))}
            </div>
          </label>
        </div>
        <button onClick={create} disabled={creating || !pipelineId || !name.trim()} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: (!pipelineId || !name.trim()) ? 0.5 : 1 }}>
          {creating ? 'Adding…' : '+ Add Stage'}
        </button>
      </div>

      {/* Stage list */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Stages</div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {pipelines.map((p) => (
              <button key={p.id} onClick={() => setPipelineId(p.id)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: '1px solid var(--border)', cursor: 'pointer', background: pipelineId === p.id ? 'var(--primary)' : 'transparent', color: pipelineId === p.id ? '#fff' : 'var(--text-dim)' }}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div> : selectedPipelineStages.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No stages yet for this pipeline. Add one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedPipelineStages
              .sort((a, b) => ((a as any).position ?? 0) - ((b as any).position ?? 0))
              .map((s) => (
                <div key={s.id} style={{ padding: '10px 12px', background: 'var(--s3)', borderRadius: 8, fontSize: 13, color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderLeft: `4px solid ${(s as any).color || 'var(--primary)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase', background: s.stage_type === 'won' ? 'rgba(16,185,129,0.12)' : s.stage_type === 'lost' ? 'rgba(239,68,68,0.10)' : 'var(--s2)', color: s.stage_type === 'won' ? '#10b981' : s.stage_type === 'lost' ? '#ef4444' : 'var(--text-dim)' }}>{s.stage_type}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.probability ?? (s as any).default_probability ?? 0}%</span>
                    <button onClick={() => remove(s)} disabled={!!busy[s.id]} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '3px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', opacity: busy[s.id] ? 0.5 : 1 }}>
                      {busy[s.id] ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box' };
const fieldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const fieldLabel: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
