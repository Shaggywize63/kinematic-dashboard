'use client';
/**
 * CRM Reminder Thresholds settings page.
 *
 * Lives at /dashboard/settings/crm-reminders. Lets admins tune the
 * four cadences that drive public.crm_send_reminders without touching
 * SQL. Backend enforces 1..60 day bounds on each field; the UI mirrors
 * that with `min`/`max` on the number inputs.
 *
 * Standalone page (not jammed into the giant settings/page.tsx)
 * because it's role-specific and benefits from its own URL for
 * deep-linking from a future "Notification preferences" section.
 */
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';

const C = {
  bg: 'var(--bg)', s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)',
  text: 'var(--text)', gray: 'var(--textSec)',
  red: '#E01E2C', green: '#00D97E',
};

type Thresholds = {
  stagnant_days: number;
  escalation_l2_days: number;
  deal_closing_days: number;
  deal_overdue_escalation_days: number;
};

type GetResponse = {
  success: boolean;
  data: {
    thresholds: Thresholds;
    defaults: Thresholds;
    bounds: { min: number; max: number };
    updated_at: string | null;
  };
};

type SaveResponse = {
  success: boolean;
  data: { thresholds: Thresholds; updated_at: string; note: string };
};

const FIELDS: Array<{
  key: keyof Thresholds;
  label: string;
  helper: string;
}> = [
  {
    key: 'stagnant_days',
    label: 'Lead stagnation reminder',
    helper: 'Days a lead can sit without activity before pinging its owner. Also the threshold at which the owner\'s supervisor gets an escalation.',
  },
  {
    key: 'escalation_l2_days',
    label: 'L2 escalation (grandboss)',
    helper: 'Days before the supervisor\'s supervisor is also notified. Must be ≥ stagnation threshold.',
  },
  {
    key: 'deal_closing_days',
    label: 'Deal closing warning',
    helper: 'Days before a deal\'s expected close date when its owner gets a "confirm or extend" nudge.',
  },
  {
    key: 'deal_overdue_escalation_days',
    label: 'Overdue deal escalation',
    helper: 'Days a deal can sit past its close date before the supervisor is notified.',
  },
];

export default function CrmReminderThresholdsPage() {
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [defaults, setDefaults] = useState<Thresholds | null>(null);
  const [bounds, setBounds] = useState<{ min: number; max: number } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [original, setOriginal] = useState<Thresholds | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<GetResponse>('/api/v1/org-settings/crm-reminder-thresholds')
      .then((r) => {
        if (cancelled) return;
        setThresholds(r.data.thresholds);
        setOriginal(r.data.thresholds);
        setDefaults(r.data.defaults);
        setBounds(r.data.bounds);
        setUpdatedAt(r.data.updated_at);
      })
      .catch((e: Error) => { if (!cancelled) setStatus({ kind: 'err', msg: e?.message || 'Load failed' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const dirty = thresholds && original &&
    (FIELDS.some((f) => thresholds[f.key] !== original[f.key]));

  const save = async () => {
    if (!thresholds) return;
    setSaving(true);
    setStatus(null);
    try {
      const r = await api.patch<SaveResponse>('/api/v1/org-settings/crm-reminder-thresholds', thresholds);
      setThresholds(r.data.thresholds);
      setOriginal(r.data.thresholds);
      setUpdatedAt(r.data.updated_at);
      setStatus({ kind: 'ok', msg: r.data.note });
    } catch (e) {
      setStatus({ kind: 'err', msg: (e as Error)?.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    if (!defaults) return;
    setThresholds({ ...defaults });
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.text, paddingBottom: 40 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, margin: 0 }}>
          CRM reminder cadence
        </h1>
        <p style={{ color: C.gray, fontSize: 13, marginTop: 4 }}>
          Tune when leads, deals, and tasks ping their owners and managers. Changes apply on the next daily run (09:30 IST).
        </p>
      </div>

      <div style={{
        background: C.s2,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: 32,
      }}>
        {loading ? (
          <div style={{ fontSize: 13, color: C.gray, padding: '24px 0', textAlign: 'center' }}>
            Loading current thresholds…
          </div>
        ) : !thresholds || !bounds ? (
          <div style={{ fontSize: 13, color: C.red, padding: '24px 0', textAlign: 'center' }}>
            Could not load thresholds.
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
              {FIELDS.map((f) => (
                <div key={f.key} style={{
                  background: C.s3,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: 20,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: C.gray,
                    textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8,
                  }}>
                    {f.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                    <input
                      type="number"
                      min={bounds.min}
                      max={bounds.max}
                      value={thresholds[f.key]}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setThresholds((p) => p ? { ...p, [f.key]: Number.isFinite(v) ? v : p[f.key] } : p);
                      }}
                      style={{
                        flex: '0 0 100px',
                        background: C.s4,
                        border: `1.5px solid ${C.border}`,
                        padding: '10px 14px',
                        borderRadius: 8,
                        color: C.text,
                        fontSize: 18,
                        fontFamily: "'Syne', sans-serif",
                        fontWeight: 800,
                        outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: 13, color: C.gray, fontWeight: 600 }}>days</span>
                    {defaults && thresholds[f.key] !== defaults[f.key] && (
                      <span style={{ fontSize: 10, color: C.gray, marginLeft: 'auto' }}>
                        default: {defaults[f.key]}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.gray, lineHeight: 1.5 }}>
                    {f.helper}
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}`,
            }}>
              <button
                onClick={save}
                disabled={!dirty || saving}
                style={{
                  background: dirty ? C.red : C.s4,
                  border: 'none',
                  color: dirty ? '#fff' : C.gray,
                  padding: '10px 24px',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: dirty && !saving ? 'pointer' : 'not-allowed',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : (dirty ? 'Save thresholds' : 'No changes')}
              </button>
              <button
                onClick={resetToDefaults}
                disabled={saving}
                style={{
                  background: 'transparent',
                  border: `1px solid ${C.border}`,
                  color: C.gray,
                  padding: '10px 18px',
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                Reset to defaults
              </button>
              {updatedAt && !dirty && (
                <span style={{ fontSize: 11, color: C.gray }}>
                  Last updated {new Date(updatedAt).toLocaleString()}
                </span>
              )}
              {status && (
                <span style={{
                  fontSize: 12,
                  color: status.kind === 'ok' ? C.green : C.red,
                  flex: 1,
                  minWidth: 200,
                }}>
                  {status.kind === 'ok' ? '✓' : '⚠️'} {status.msg}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
