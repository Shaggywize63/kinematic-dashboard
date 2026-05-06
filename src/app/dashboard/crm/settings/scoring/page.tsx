'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmSettings } from '../../../../../lib/crmApi';

const DEFAULTS = {
  has_company: 8,
  has_title: 5,
  has_industry: 4,
  has_phone: 4,
  has_email: 4,
  email_opens: 6,
  email_clicks: 10,
  whatsapp_replied: 12,
  meeting_booked: 15,
  pricing_page_visit: 8,
  demo_requested: 18,
  source_referral: 10,
  source_website: 6,
  source_event: 8,
  source_cold_outbound: 2,
  recent_activity_7d: 8,
  no_activity_30d: -10,
  unsubscribed: -25,
};

const GRADE_THRESHOLDS = { A: 75, B: 55, C: 35 };

const FIELD_GROUPS: Array<{ title: string; desc: string; keys: string[] }> = [
  { title: 'Demographic / Firmographic', desc: 'Profile completeness signals fit with your ICP.', keys: ['has_company', 'has_title', 'has_industry', 'has_phone', 'has_email'] },
  { title: 'Engagement', desc: 'How actively the lead has interacted.', keys: ['email_opens', 'email_clicks', 'whatsapp_replied', 'meeting_booked'] },
  { title: 'Intent', desc: 'Explicit buying signals.', keys: ['pricing_page_visit', 'demo_requested'] },
  { title: 'Source Quality', desc: 'Higher-intent channels score better.', keys: ['source_referral', 'source_website', 'source_event', 'source_cold_outbound'] },
  { title: 'Recency / Decay', desc: 'Recent activity boosts; long silence penalises. Negative values reduce score.', keys: ['recent_activity_7d', 'no_activity_30d', 'unsubscribed'] },
];

const FIELD_LABELS: Record<string, string> = {
  has_company: 'Company filled',
  has_title: 'Job title filled',
  has_industry: 'Industry filled',
  has_phone: 'Phone provided',
  has_email: 'Email provided',
  email_opens: 'Per email opened',
  email_clicks: 'Per email link clicked',
  whatsapp_replied: 'Replied on WhatsApp',
  meeting_booked: 'Meeting booked',
  pricing_page_visit: 'Visited pricing page',
  demo_requested: 'Requested a demo',
  source_referral: 'Source: referral',
  source_website: 'Source: website',
  source_event: 'Source: event/conference',
  source_cold_outbound: 'Source: cold outbound',
  recent_activity_7d: 'Activity in last 7 days',
  no_activity_30d: 'No activity in 30+ days',
  unsubscribed: 'Unsubscribed from emails',
};

export default function ScoringSettingsPage() {
  const [weights, setWeights] = useState<Record<string, number>>(DEFAULTS);
  const [thresholds, setThresholds] = useState(GRADE_THRESHOLDS);
  // Display labels for any criteria the user adds at runtime, stored
  // alongside weights inside crm_settings.config.scoring.
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rawConfig, setRawConfig] = useState<Record<string, unknown>>({});
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  // Inline "Add Custom Criterion" form state.
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newWeight, setNewWeight] = useState<string>('5');

  const load = async () => {
    try {
      const r = await crmSettings.get();
      const allConfig = ((r.data?.config || {}) as Record<string, unknown>);
      setRawConfig(allConfig);
      const cfg = ((allConfig.scoring || {}) as any);
      if (cfg.weights && Object.keys(cfg.weights).length > 0) {
        setWeights({ ...DEFAULTS, ...cfg.weights });
      }
      if (cfg.grade_thresholds) {
        setThresholds({ ...GRADE_THRESHOLDS, ...cfg.grade_thresholds });
      }
      if (cfg.custom_labels && typeof cfg.custom_labels === 'object') {
        setCustomLabels(cfg.custom_labels as Record<string, string>);
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to load scoring settings');
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await crmSettings.update({
        config: {
          ...rawConfig,
          scoring: { weights, grade_thresholds: thresholds, custom_labels: customLabels },
        },
      });
      setRawConfig((prev) => ({ ...prev, scoring: { weights, grade_thresholds: thresholds, custom_labels: customLabels } }));
      setLastSaved(new Date().toLocaleTimeString());
      toast.success('Scoring model saved successfully');
    } catch (e: any) {
      toast.error(e.message || 'Save failed — check API connection');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!window.confirm('Reset scoring to default weights? Unsaved changes will be lost.')) return;
    setWeights({ ...DEFAULTS });
    setThresholds({ ...GRADE_THRESHOLDS });
    toast.success('Reset to defaults — click Save to apply');
  };

  const setW = (k: string, v: number) => setWeights((w) => ({ ...w, [k]: v }));
  const setT = (k: keyof typeof GRADE_THRESHOLDS, v: number) => setThresholds((t) => ({ ...t, [k]: v }));

  // Slug a label into a stable, snake_case weight key. Falls back to the
  // explicit `newKey` if the user typed one.
  const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const addCustom = () => {
    const label = newLabel.trim();
    const explicit = newKey.trim();
    const k = explicit ? slugify(explicit) : slugify(label);
    if (!label) { toast.error('Label is required'); return; }
    if (!k) { toast.error('Provide a slug or label that contains letters'); return; }
    if (weights[k] !== undefined || (DEFAULTS as Record<string, number>)[k] !== undefined) {
      toast.error(`Key "${k}" already exists — pick another`); return;
    }
    const w = Number(newWeight);
    if (Number.isNaN(w)) { toast.error('Weight must be numeric'); return; }
    setWeights((cur) => ({ ...cur, [k]: w }));
    setCustomLabels((m) => ({ ...m, [k]: label }));
    setNewKey(''); setNewLabel(''); setNewWeight('5');
    toast.success('Criterion added — click Save Model to persist');
  };

  const removeCustom = (k: string) => {
    setWeights((cur) => { const next = { ...cur }; delete next[k]; return next; });
    setCustomLabels((m) => { const next = { ...m }; delete next[k]; return next; });
  };

  // Anything in `weights` that isn't in DEFAULTS is treated as user-added.
  const customKeys = Object.keys(weights).filter((k) => (DEFAULTS as Record<string, number>)[k] === undefined);

  const maxScore = Object.values(weights).filter((v) => v > 0).reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Lead Scoring Model</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, lineHeight: 1.5 }}>
          Each signal contributes weight toward a 0–100 lead score. Defaults follow HubSpot/Salesforce/Marketo conventions.
          Negative weights penalise. Max achievable score with current weights: <strong>{maxScore}</strong>.
        </div>
        {lastSaved && (
          <div style={{ fontSize: 11, color: '#10b981', marginBottom: 8 }}>Last saved at {lastSaved}</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={saving || !loaded} style={btnPrimary}>
            {saving ? 'Saving…' : 'Save Model'}
          </button>
          <button onClick={reset} disabled={!loaded} style={btnGhost}>Reset to Defaults</button>
          <button onClick={load} disabled={!loaded} style={btnGhost}>Reload</button>
        </div>
        {!loaded && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>Loading settings…</div>}
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Grade Thresholds</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Score buckets: A (hot) ≥ <strong>{thresholds.A}</strong> · B (warm) ≥ <strong>{thresholds.B}</strong> · C (lukewarm) ≥ <strong>{thresholds.C}</strong> · D (cold) below.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {(['A', 'B', 'C'] as const).map((g) => (
            <label key={g} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Min for Grade {g}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={thresholds[g]}
                onChange={(e) => setT(g, Number(e.target.value) || 0)}
                style={input}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Custom criteria — user-added rows live here. The "+ Add" form is
          inline so adding a criterion is a single interaction. */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Custom Criteria</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>Add your own scoring signals (e.g. industry-specific or campaign-specific). Negative weights penalise.</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px auto', gap: 8, alignItems: 'end', marginBottom: 14, padding: 10, background: 'var(--s3)', borderRadius: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Label</span>
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Visited TMT page" style={input} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Key (optional)</span>
            <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="auto from label" style={input} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Weight</span>
            <input type="number" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} style={input} />
          </label>
          <button onClick={addCustom} type="button" style={{ ...btnPrimary, padding: '8px 14px' }}>+ Add</button>
        </div>

        {customKeys.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: 12, background: 'var(--s3)', borderRadius: 8 }}>
            No custom criteria yet. Add one above to extend the scoring model.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {customKeys.map((k) => {
              const v = weights[k] ?? 0;
              const label = customLabels[k] || k;
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--s3)', borderRadius: 8, border: `1px solid ${v < 0 ? 'rgba(239,68,68,0.3)' : v > 10 ? 'rgba(16,185,129,0.3)' : 'transparent'}` }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{k}</div>
                  </span>
                  <input
                    type="number"
                    step={1}
                    value={v}
                    onChange={(e) => setW(k, Number(e.target.value))}
                    style={{ ...input, width: 70, textAlign: 'right', color: v < 0 ? '#ef4444' : v > 10 ? '#10b981' : 'var(--text)' }}
                  />
                  <button type="button" onClick={() => removeCustom(k)} title="Remove" aria-label="Remove" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>×</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {FIELD_GROUPS.map((grp) => (
        <div key={grp.title} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{grp.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>{grp.desc}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {grp.keys.map((k) => {
              const v = weights[k] ?? 0;
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--s3)', borderRadius: 8, border: `1px solid ${v < 0 ? 'rgba(239,68,68,0.3)' : v > 10 ? 'rgba(16,185,129,0.3)' : 'transparent'}` }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{FIELD_LABELS[k] || k}</span>
                  <input
                    type="number"
                    step={1}
                    value={v}
                    onChange={(e) => setW(k, Number(e.target.value))}
                    style={{ ...input, width: 70, textAlign: 'right', color: v < 0 ? '#ef4444' : v > 10 ? '#10b981' : 'var(--text)' }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const input: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
