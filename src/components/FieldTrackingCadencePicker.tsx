'use client';
/**
 * Field Tracking cadence picker — embedded in the main Settings page's
 * "Operational Environment" section. Self-contained component: owns its
 * own state, fetches the current cadence on mount, saves via PATCH.
 *
 * Why a component (not inline JSX): the parent settings page is ~60KB
 * already; pulling this into a separate file keeps the diff small and
 * makes the picker independently testable.
 */
import { useState, useEffect } from 'react';
import api from '../lib/api';

const C = {
  s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)',
  white: 'var(--text)', gray: 'var(--text-dim)',
  red: '#E01E2C', green: '#00D97E', yellow: '#FFB800',
};

type CadenceResponse = {
  success: boolean;
  data: {
    location_ping_interval_seconds: number;
    updated_at: string | null;
    allowed_values: number[];
  };
};

type SaveResponse = {
  success: boolean;
  data: {
    location_ping_interval_seconds: number;
    updated_at: string;
    note: string;
  };
};

const OPTIONS = [
  { seconds: 300, label: '5 min',  desc: 'Finest detail · heaviest battery' },
  { seconds: 600, label: '10 min', desc: 'Recommended · industry standard' },
  { seconds: 900, label: '15 min', desc: 'Lightest battery · sparser trail' },
];

export default function FieldTrackingCadencePicker() {
  const [current, setCurrent] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<CadenceResponse>('/api/v1/org-settings/location-ping-interval')
      .then((r) => {
        if (cancelled) return;
        const v = r.data?.location_ping_interval_seconds ?? 600;
        setCurrent(v);
        setSelected(v);
        setUpdatedAt(r.data?.updated_at ?? null);
      })
      .catch((e: Error) => { if (!cancelled) setStatus({ kind: 'err', msg: e?.message || 'Load failed' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    if (selected === null || selected === current) return;
    setSaving(true);
    setStatus(null);
    try {
      const r = await api.patch<SaveResponse>('/api/v1/org-settings/location-ping-interval', { value: selected });
      setCurrent(r.data.location_ping_interval_seconds);
      setUpdatedAt(r.data.updated_at);
      setStatus({ kind: 'ok', msg: r.data.note });
    } catch (e) {
      setStatus({ kind: 'err', msg: (e as Error)?.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const dirty = selected !== null && selected !== current;

  return (
    <div style={{
      background: C.s3,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 24,
      marginTop: 16,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div>
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: C.gray,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            marginBottom: 4,
          }}>
            Location Ping Cadence
          </div>
          <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.5 }}>
            How often FE phones report GPS. Lower = sharper trail · more battery drain. Changes propagate via /auth/me on next FE login.
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: C.gray, padding: '16px 0', textAlign: 'center' }}>
          Loading current cadence…
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 14,
        }}>
          {OPTIONS.map((o) => {
            const isSelected = selected === o.seconds;
            const isCurrent = current === o.seconds;
            return (
              <button
                key={o.seconds}
                onClick={() => setSelected(o.seconds)}
                style={{
                  background: isSelected ? `${C.red}14` : C.s4,
                  border: `1.5px solid ${isSelected ? C.red : C.border}`,
                  borderRadius: 10,
                  padding: '14px 12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color .12s, background .12s',
                  fontFamily: 'inherit',
                  color: 'inherit',
                  minHeight: 92,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: 18,
                    fontWeight: 800,
                    color: isSelected ? C.red : C.white,
                  }}>
                    {o.label}
                  </div>
                  {isCurrent && (
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: C.green,
                      background: 'rgba(0,217,126,0.13)',
                      padding: '2px 6px',
                      borderRadius: 5,
                      letterSpacing: 0.5,
                    }}>
                      ACTIVE
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.gray, lineHeight: 1.4 }}>{o.desc}</div>
              </button>
            );
          })}
        </div>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{
            background: dirty ? C.red : C.s4,
            border: 'none',
            color: dirty ? '#fff' : C.gray,
            padding: '8px 18px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 12,
            cursor: dirty && !saving ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : (dirty ? 'Save cadence' : 'No changes')}
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

      <div style={{
        marginTop: 14,
        padding: '10px 12px',
        background: 'rgba(255,184,0,0.08)',
        border: `1px solid rgba(255,184,0,0.25)`,
        borderRadius: 8,
        fontSize: 11,
        color: C.gray,
        lineHeight: 1.5,
      }}>
        ⚠️ iOS users continue to ping every 5 min in the foreground only. Background iOS support is deferred until the team is on a paid Apple Developer Program account.
      </div>
    </div>
  );
}
