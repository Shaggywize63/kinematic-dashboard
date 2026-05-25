'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmSettings } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';

// Defaults differ by business type. B2B leans firmographic + intent;
// B2C leans demographic + engagement / recency. Both profiles drop the
// email-open / email-click / pricing-page signals — Kinematic doesn't
// integrate inbound email yet, and there's no website tracking, so
// those weights would never fire. Instead WhatsApp, calls and physical
// site visits dominate, matching how field-force reps actually engage.
// The shapes are identical so the UI can flip between profiles without
// resetting.
const DEFAULTS_B2B: Record<string, number> = {
  // Firmographic completeness
  has_company: 6,
  has_title: 4,
  has_industry: 4,
  has_phone: 6,
  has_email: 2,
  has_address: 4,
  // WhatsApp engagement — primary inbound channel
  whatsapp_sent: 3,
  whatsapp_replied: 14,
  // Call engagement
  call_completed: 8,
  meeting_booked: 12,
  // Physical site / outlet visits — strongest B2B intent for FF reps
  site_visit_completed: 16,
  repeat_site_visit: 10,
  // Explicit intent signals
  demo_requested: 12,
  quote_requested: 12,
  sample_requested: 10,
  // Source mix
  source_referral: 10,
  source_walk_in: 8,
  source_event: 7,
  source_whatsapp_inbound: 8,
  source_cold_outbound: 2,
  // Recency / decay
  recent_activity_7d: 6,
  no_activity_30d: -10,
  opted_out: -25,
};

const DEFAULTS_B2C: Record<string, number> = {
  // Demographic completeness — phone + city + DOB drive B2C fit.
  has_company: 0,
  has_title: 0,
  has_industry: 0,
  has_phone: 10,
  has_email: 2,
  has_address: 5,
  // WhatsApp engagement — even more dominant than B2B
  whatsapp_sent: 3,
  whatsapp_replied: 16,
  // Call engagement
  call_completed: 8,
  meeting_booked: 8,
  // Physical store visits — strongest B2C buy signal
  site_visit_completed: 18,
  repeat_site_visit: 12,
  // Explicit intent
  demo_requested: 8,
  quote_requested: 10,
  sample_requested: 8,
  // Source mix — walk-in and referral dominate
  source_referral: 12,
  source_walk_in: 12,
  source_event: 8,
  source_whatsapp_inbound: 10,
  source_cold_outbound: 1,
  // Recency / decay — B2C buyers cool off faster
  recent_activity_7d: 8,
  no_activity_30d: -15,
  opted_out: -25,
};

// Legacy keys that older saved configs may carry. We strip them on load
// so they don't inflate the total/100 banner with weights that have
// no UI representation anymore.
const LEGACY_KEYS = new Set([
  'email_opens',
  'email_clicks',
  'pricing_page_visit',
  'unsubscribed', // renamed to opted_out
  'source_website', // no website tracking — covered by source_whatsapp_inbound / source_walk_in
]);

const GRADE_THRESHOLDS = { A: 75, B: 55, C: 35 };

const FIELD_GROUPS: Array<{ title: string; desc: string; keys: string[] }> = [
  { title: 'Profile Completeness', desc: 'Demographic / firmographic fields filled in. Tunes ICP match.', keys: ['has_company', 'has_title', 'has_industry', 'has_phone', 'has_email', 'has_address'] },
  { title: 'WhatsApp Engagement', desc: 'WhatsApp is the primary engagement channel. Two-way replies score higher than outbound-only.', keys: ['whatsapp_sent', 'whatsapp_replied'] },
  { title: 'Calls & Meetings', desc: 'Connected phone calls and booked meetings — confirmed verbal contact.', keys: ['call_completed', 'meeting_booked'] },
  { title: 'Site Visits', desc: 'Physical visits to the outlet / customer site. Repeat visits are a strong intent signal.', keys: ['site_visit_completed', 'repeat_site_visit'] },
  { title: 'Explicit Intent', desc: 'Demos, quotes, and samples requested — the lead is comparing.', keys: ['demo_requested', 'quote_requested', 'sample_requested'] },
  { title: 'Source Quality', desc: 'Higher-intent acquisition channels score better.', keys: ['source_referral', 'source_walk_in', 'source_event', 'source_whatsapp_inbound', 'source_cold_outbound'] },
  { title: 'Recency / Decay', desc: 'Recent activity boosts; long silence and opt-outs penalise. Negative values reduce the score.', keys: ['recent_activity_7d', 'no_activity_30d', 'opted_out'] },
];

const FIELD_LABELS: Record<string, string> = {
  has_company: 'Company filled',
  has_title: 'Job title filled',
  has_industry: 'Industry filled',
  has_phone: 'Phone provided',
  has_email: 'Email provided',
  has_address: 'Address filled (for visits)',
  whatsapp_sent: 'WhatsApp sent to lead',
  whatsapp_replied: 'Replied on WhatsApp',
  call_completed: 'Call answered / completed',
  meeting_booked: 'Meeting booked',
  site_visit_completed: 'Site / outlet visit completed',
  repeat_site_visit: 'Repeat site visit (2nd+)',
  demo_requested: 'Demo requested',
  quote_requested: 'Quote / pricing requested',
  sample_requested: 'Sample requested',
  source_referral: 'Source: referral',
  source_walk_in: 'Source: walk-in',
  source_event: 'Source: event / trade show',
  source_whatsapp_inbound: 'Source: inbound WhatsApp',
  source_cold_outbound: 'Source: cold outbound',
  recent_activity_7d: 'Activity in last 7 days',
  no_activity_30d: 'No activity in 30+ days',
  opted_out: 'Opted out of contact',
};

type Profile = {
  weights: Record<string, number>;
  grade_thresholds: typeof GRADE_THRESHOLDS;
  custom_labels: Record<string, string>;
};

const emptyProfile = (defaults: Record<string, number>): Profile => ({
  weights: { ...defaults },
  grade_thresholds: { ...GRADE_THRESHOLDS },
  custom_labels: {},
});

export default function ScoringSettingsPage() {
  const [businessType, setBusinessType] = useState<'b2b' | 'b2c'>('b2b');
  const [b2b, setB2b] = useState<Profile>(emptyProfile(DEFAULTS_B2B));
  const [b2c, setB2c] = useState<Profile>(emptyProfile(DEFAULTS_B2C));
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rawConfig, setRawConfig] = useState<Record<string, unknown>>({});
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  // Active client scope — read from localStorage so we can label "you're
  // editing scoring for <client>" instead of having a duplicate picker.
  const [scope, setScope] = useState<{ id: string | null; name: string }>({ id: null, name: 'Organisation default' });
  // Inline "Add Custom Criterion" form state (per active tab).
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newWeight, setNewWeight] = useState<string>('5');

  const active = businessType === 'b2b' ? b2b : b2c;
  const setActive = businessType === 'b2b' ? setB2b : setB2c;
  const defaults = businessType === 'b2b' ? DEFAULTS_B2B : DEFAULTS_B2C;

  // Read the global client scope from localStorage and label it. Backend
  // already keys crm_settings by (org_id, client_id) and the dashboard
  // auto-attaches the X-Client-Id header from the same source, so we
  // don't need a second picker here — we just surface which client the
  // saved profile belongs to.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined') return;
      const sel = window.localStorage.getItem('kinematic_selected_client');
      if (!sel) { setScope({ id: null, name: 'Organisation default (all clients)' }); return; }
      try {
        const r = await api.get<any>('/api/v1/clients');
        const list = Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : []);
        const match = list.find((c: any) => c.id === sel);
        setScope({ id: sel, name: match?.name || 'Selected client' });
      } catch {
        setScope({ id: sel, name: 'Selected client' });
      }
    })();
  }, []);

  const load = async () => {
    try {
      const r = await crmSettings.get();
      const allConfig = ((r.data?.config || {}) as Record<string, unknown>);
      setRawConfig(allConfig);
      const cfg = ((allConfig.scoring || {}) as any);

      // Strip retired keys so the new defaults aren't shadowed by stale
      // saved weights (e.g. email_opens carrying a 6 from the old model
      // would inflate the total banner with no UI representation).
      const sanitise = (w: Record<string, number>) => {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(w || {})) {
          if (LEGACY_KEYS.has(k)) continue;
          out[k] = v;
        }
        return out;
      };
      const sanitiseLabels = (m: Record<string, string>) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(m || {})) {
          if (LEGACY_KEYS.has(k)) continue;
          out[k] = v;
        }
        return out;
      };

      // New shape — config.scoring.b2b / b2c profiles.
      if (cfg.b2b && typeof cfg.b2b === 'object') {
        setB2b({
          weights: { ...DEFAULTS_B2B, ...sanitise(cfg.b2b.weights || {}) },
          grade_thresholds: { ...GRADE_THRESHOLDS, ...(cfg.b2b.grade_thresholds || {}) },
          custom_labels: sanitiseLabels(cfg.b2b.custom_labels || {}),
        });
      } else if (cfg.weights && Object.keys(cfg.weights).length > 0) {
        // Legacy single-profile config — promote to the b2b slot so the
        // existing scoring engine keeps reading the flat keys, and so the
        // user doesn't lose the weights they previously tuned.
        setB2b({
          weights: { ...DEFAULTS_B2B, ...sanitise(cfg.weights) },
          grade_thresholds: { ...GRADE_THRESHOLDS, ...(cfg.grade_thresholds || {}) },
          custom_labels: sanitiseLabels(cfg.custom_labels || {}),
        });
      }

      if (cfg.b2c && typeof cfg.b2c === 'object') {
        setB2c({
          weights: { ...DEFAULTS_B2C, ...sanitise(cfg.b2c.weights || {}) },
          grade_thresholds: { ...GRADE_THRESHOLDS, ...(cfg.b2c.grade_thresholds || {}) },
          custom_labels: sanitiseLabels(cfg.b2c.custom_labels || {}),
        });
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
      // Persist both profiles. We also mirror b2b's weights into the
      // legacy flat keys so the existing leadScoring service (which
      // reads scoring.weights / scoring.grade_thresholds) keeps working
      // until it learns about the b2c profile.
      const nextScoring: Record<string, unknown> = {
        b2b: { weights: b2b.weights, grade_thresholds: b2b.grade_thresholds, custom_labels: b2b.custom_labels },
        b2c: { weights: b2c.weights, grade_thresholds: b2c.grade_thresholds, custom_labels: b2c.custom_labels },
        weights: b2b.weights,
        grade_thresholds: b2b.grade_thresholds,
        custom_labels: b2b.custom_labels,
      };
      await crmSettings.update({
        config: { ...rawConfig, scoring: nextScoring },
      });
      setRawConfig((prev) => ({ ...prev, scoring: nextScoring }));
      setLastSaved(new Date().toLocaleTimeString());
      toast.success(`Scoring saved for ${scope.name}`);
    } catch (e: any) {
      toast.error(e.message || 'Save failed — check API connection');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!window.confirm(`Reset ${businessType.toUpperCase()} scoring to defaults? Unsaved changes for this profile will be lost.`)) return;
    setActive(emptyProfile(defaults));
    toast.success('Reset to defaults — click Save to apply');
  };

  const setW = (k: string, v: number) => setActive((p) => ({ ...p, weights: { ...p.weights, [k]: v } }));
  const setT = (k: keyof typeof GRADE_THRESHOLDS, v: number) => setActive((p) => ({ ...p, grade_thresholds: { ...p.grade_thresholds, [k]: v } }));
  // Built-in fields ship with a default label in FIELD_LABELS. Users can
  // override that label per-profile by writing into custom_labels[key]
  // (same map the user-added criteria live in). Empty / unchanged values
  // are stripped so the saved JSON only carries actual overrides.
  const setLabel = (k: string, v: string) => setActive((p) => {
    const next = { ...p.custom_labels };
    const isCustomKey = defaults[k] === undefined;
    const defaultLabel = isCustomKey ? '' : (FIELD_LABELS[k] || k);
    const trimmed = v;
    if (!isCustomKey && (trimmed === '' || trimmed === defaultLabel)) {
      delete next[k];
    } else {
      next[k] = trimmed;
    }
    return { ...p, custom_labels: next };
  });
  const labelFor = (k: string) => active.custom_labels[k] ?? (FIELD_LABELS[k] || k);

  const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const addCustom = () => {
    const label = newLabel.trim();
    const explicit = newKey.trim();
    const k = explicit ? slugify(explicit) : slugify(label);
    if (!label) { toast.error('Label is required'); return; }
    if (!k) { toast.error('Provide a slug or label that contains letters'); return; }
    if (active.weights[k] !== undefined || defaults[k] !== undefined) {
      toast.error(`Key "${k}" already exists in this profile — pick another`); return;
    }
    const w = Number(newWeight);
    if (Number.isNaN(w)) { toast.error('Weight must be numeric'); return; }
    setActive((p) => ({
      ...p,
      weights: { ...p.weights, [k]: w },
      custom_labels: { ...p.custom_labels, [k]: label },
    }));
    setNewKey(''); setNewLabel(''); setNewWeight('5');
    toast.success('Criterion added — click Save Model to persist');
  };

  const removeCustom = (k: string) => {
    setActive((p) => {
      const w = { ...p.weights }; delete w[k];
      const l = { ...p.custom_labels }; delete l[k];
      return { ...p, weights: w, custom_labels: l };
    });
  };

  const customKeys = useMemo(
    () => Object.keys(active.weights).filter((k) => defaults[k] === undefined),
    [active.weights, defaults],
  );

  const maxScore = useMemo(
    () => Object.values(active.weights).filter((v) => v > 0).reduce((a, b) => a + b, 0),
    [active.weights],
  );

  // Visual cue for the total/100 banner. Green when the weights distribute
  // cleanly across 100; amber when above so the rep notices the model
  // produces scores that will saturate at the engine's 100-cap.
  const totalColor = maxScore > 100 ? '#ef4444' : maxScore >= 80 ? '#10b981' : '#3E9EFF';
  const totalPct = Math.min(100, Math.max(0, (maxScore / 100) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--s2)', border: `2px solid ${totalColor}55`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: 0.6 }}>
              Total achievable score · {businessType.toUpperCase()}
            </div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 36, fontWeight: 800, color: totalColor, lineHeight: 1.1, marginTop: 4 }}>
              {maxScore}<span style={{ fontSize: 20, color: 'var(--text-dim)', fontWeight: 700, marginLeft: 4 }}>/ 100</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              {maxScore > 100
                ? `Weights overshoot 100 — the scoring engine caps every lead at 100, so the excess (${maxScore - 100}) is unreachable.`
                : maxScore < 60
                ? 'Weights sum to less than 60 — most leads will land in the C / D grade. Increase weights or add criteria.'
                : 'Weights look balanced. Negative criteria still apply on top.'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            {lastSaved && (
              <div style={{ fontSize: 11, color: '#10b981' }}>Last saved at {lastSaved}</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} disabled={saving || !loaded} style={btnPrimary}>
                {saving ? 'Saving…' : 'Save Model'}
              </button>
              <button onClick={reset} disabled={!loaded} style={btnGhost}>Reset {businessType.toUpperCase()}</button>
              <button onClick={load} disabled={!loaded} style={btnGhost}>Reload</button>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, height: 8, background: 'var(--s3)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${totalPct}%`, height: '100%', background: totalColor, transition: 'width .15s ease' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 14, lineHeight: 1.5 }}>
          Each signal below adds toward a 0–100 lead score. Defaults follow HubSpot / Salesforce / Marketo conventions
          with separate baselines for B2B (firmographic + intent) and B2C (demographic + engagement). Negative weights penalise. Labels are editable inline.
        </div>
        <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 12, padding: '8px 10px', background: 'var(--s3)', borderRadius: 8, border: '1px solid var(--border)' }}>
          Editing scoring for <strong>{scope.name}</strong>.{' '}
          {scope.id
            ? <span style={{ color: 'var(--text-dim)' }}>Switch clients via the global client picker in the header to tune another tenant.</span>
            : <span style={{ color: 'var(--text-dim)' }}>Pick a client in the global header to set per-client overrides.</span>}
        </div>
        {!loaded && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>Loading settings…</div>}
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, display: 'flex', gap: 8 }}>
        {(['b2b', 'b2c'] as const).map((bt) => {
          const isActive = businessType === bt;
          return (
            <button
              key={bt}
              type="button"
              onClick={() => setBusinessType(bt)}
              style={{
                flex: 1,
                padding: '12px 14px',
                borderRadius: 10,
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
                border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: isActive ? 'rgba(224,30,44,0.10)' : 'var(--s3)',
                color: isActive ? 'var(--primary)' : 'var(--text)',
                textAlign: 'left',
              }}
            >
              <div>{bt === 'b2b' ? 'B2B Model' : 'B2C Model'}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-dim)', marginTop: 2 }}>
                {bt === 'b2b'
                  ? 'Firmographic + intent signals dominate. Used for company-attached leads.'
                  : 'Demographic + engagement + WhatsApp dominate. Used for consumer leads.'}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Grade Thresholds — {businessType.toUpperCase()}</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Score buckets: A (hot) ≥ <strong>{active.grade_thresholds.A}</strong> · B (warm) ≥ <strong>{active.grade_thresholds.B}</strong> · C (lukewarm) ≥ <strong>{active.grade_thresholds.C}</strong> · D (cold) below.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {(['A', 'B', 'C'] as const).map((g) => (
            <label key={g} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Min for Grade {g}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={active.grade_thresholds[g]}
                onChange={(e) => setT(g, Number(e.target.value) || 0)}
                style={input}
              />
            </label>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Custom Criteria — {businessType.toUpperCase()}</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>Add your own scoring signals (e.g. industry-specific or campaign-specific). Negative weights penalise. Custom criteria live inside the active profile.</div>

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
            No custom criteria yet for this profile. Add one above to extend the {businessType.toUpperCase()} model.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {customKeys.map((k) => {
              const v = active.weights[k] ?? 0;
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--s3)', borderRadius: 8, border: `1px solid ${v < 0 ? 'rgba(239,68,68,0.3)' : v > 10 ? 'rgba(16,185,129,0.3)' : 'transparent'}` }}>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <EditableLabel
                      value={labelFor(k)}
                      onChange={(next) => setLabel(k, next)}
                      overridden
                      title="Edit custom criterion label"
                    />
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
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{grp.title} — {businessType.toUpperCase()}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>{grp.desc}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {grp.keys.map((k) => {
              const v = active.weights[k] ?? 0;
              const overridden = active.custom_labels[k] !== undefined && active.custom_labels[k] !== (FIELD_LABELS[k] || k);
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--s3)', borderRadius: 8, border: `1px solid ${v < 0 ? 'rgba(239,68,68,0.3)' : v > 10 ? 'rgba(16,185,129,0.3)' : 'transparent'}` }}>
                  <EditableLabel
                    value={labelFor(k)}
                    onChange={(next) => setLabel(k, next)}
                    overridden={overridden}
                    title={overridden ? `Default: ${FIELD_LABELS[k] || k} — clear to restore` : `Edit label for this profile`}
                  />
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

// Inline label editor — looks like a label until you hover or focus.
// The previous styling was completely invisible (transparent border, no
// outline) so users didn't realise the criterion label was editable.
// This version shows a pencil cue on hover, a soft background, and a
// proper focus ring so the affordance is obvious.
function EditableLabel(p: { value: string; onChange: (v: string) => void; overridden: boolean; title?: string }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const showBox = hover || focus;
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative' }}
    >
      <span
        aria-hidden
        style={{ fontSize: 10, color: p.overridden ? 'var(--primary)' : (showBox ? 'var(--text-dim)' : 'transparent'), transition: 'color .12s ease' }}
      >
        ✏️
      </span>
      <input
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        title={p.title}
        style={{
          flex: 1,
          minWidth: 0,
          background: showBox ? 'var(--s2)' : 'transparent',
          border: `1px solid ${focus ? 'var(--primary)' : showBox ? 'var(--border)' : 'transparent'}`,
          color: 'var(--text)',
          fontSize: 13,
          padding: '4px 8px',
          borderRadius: 6,
          outline: 'none',
          transition: 'background .12s ease, border-color .12s ease',
          ...(p.overridden && !focus ? { borderBottom: '1px dashed var(--primary)' } : {}),
        }}
      />
    </span>
  );
}
