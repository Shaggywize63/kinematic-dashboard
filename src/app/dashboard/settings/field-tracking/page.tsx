'use client';
/**
 * Field Tracking settings.
 *
 * Single picker today — the FE location-ping cadence. Backed by
 * org_settings.location_ping_interval_seconds via
 * /api/v1/org-settings/location-ping-interval.
 *
 * Lives at /dashboard/settings/field-tracking. Standalone page so we
 * don't have to touch the 60KB main settings page; a card-style link
 * can be added there in a follow-up.
 */
import { useState, useEffect } from 'react';
import api from '../../../../lib/api';

const C = {
  bg: 'var(--bg)', s1: 'var(--s1)', s2: 'var(--s2)', s3: 'var(--s3)',
  border: 'var(--border)',
  white: 'var(--text)', gray: 'var(--text-dim)', grayd: 'var(--text-dim)',
  red: 'var(--primary)', green: 'var(--green)', blue: 'var(--accent)',
  yellow: '#FFB800',
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
  {
    seconds: 300,
    label: '5 min',
    desc: 'Finest detail · heaviest battery cost. Best for high-stakes routes (security, cash handling).',
    accent: '#FFB800',
  },
  {
    seconds: 600,
    label: '10 min',
    desc: 'Recommended · industry standard. Sharp enough trail for supervision, light on battery.',
    accent: 'var(--green)',
  },
  {
    seconds: 900,
    label: '15 min',
    desc: 'Sparsest trail · lightest battery. Use for low-density routes or older devices.',
    accent: 'var(--accent)',
  },
];

export default function FieldTrackingSettingsPage() {
  const [current, setCurrent] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<CadenceResponse>('/api/v1/org-settings/location-ping-interval')
      .then((r) => {
        if (cancelled) return;
        const v = r.data?.location_ping_interval_seconds ?? 600;
        setCurrent(v);
        setSelected(v);
        setUpdatedAt(r.data?.updated_at ?? null);
      })
      .catch((e: Error) => {
        if (!cancelled) setStatus({ kind: 'err', msg: e?.message || 'Failed to load setting' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (selected === null || selected === current) return;
    setSaving(true);
    setStatus(null);
    try {
      const r = await api.patch<SaveResponse>(
        '/api/v1/org-settings/location-ping-interval',
        { value: selected }
      );
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
    <div style={{ padding: 24, fontFamily: "'DM Sans',sans-serif", maxWidth: 900 }}>
      <div style={{ marginBottom: 22 }}>
        <div
          style={{
            fontSize: 11,
            color: C.gray,
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          Settings · Field Force
        </div>
        <div
          style={{
            fontFamily: "'Syne',sans-serif",
            fontSize: 26,
            fontWeight: 800,
            color: C.white,
            letterSpacing: '-0.3px',
          }}
        >
          Field Tracking
        </div>
        <div style={{ fontSize: 13, color: C.gray, marginTop: 5 }}>
          How often each FE&apos;s phone reports its GPS location to the dashboard.
        </div>
      </div>

      {/* Cadence card */}
      <div
        style={{
          background: C.s2,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 22,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: C.gray,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          LOCATION PING CADENCE
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.white, marginBottom: 4 }}>
          Heartbeat interval
        </div>
        <div style={{ fontSize: 12, color: C.gray, marginBottom: 18, lineHeight: 1.5 }}>
          Lower = sharper movement trail but more battery drain. The Android
          app applies the new cadence on the FE&apos;s next login or{' '}
          <code style={{ background: C.s3, padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>
            /auth/me
          </code>{' '}
          refresh — typically within an hour.
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: C.gray, padding: '24px 0', textAlign: 'center' }}>
            Loading current cadence…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {OPTIONS.map((o) => {
              const isSelected = selected === o.seconds;
              const isCurrent = current === o.seconds;
              return (
                <button
                  key={o.seconds}
                  onClick={() => setSelected(o.seconds)}
                  style={{
                    background: isSelected ? `${C.red}14` : C.s3,
                    border: `1.5px solid ${isSelected ? C.red : C.border}`,
                    borderRadius: 12,
                    padding: '16px 14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color .12s, background .12s',
                    fontFamily: 'inherit',
                    color: 'inherit',
                    minHeight: 110,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        color: isSelected ? C.red : C.white,
                        fontFamily: "'Syne',sans-serif",
                      }}
                    >
                      {o.label}
                    </div>
                    {isCurrent && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: C.green,
                          background: 'rgba(0,217,126,0.13)',
                          padding: '2px 7px',
                          borderRadius: 5,
                          letterSpacing: 0.5,
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.gray, lineHeight: 1.45 }}>
                    {o.desc}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {updatedAt && (
          <div style={{ fontSize: 11, color: C.grayd, marginTop: 14 }}>
            Last updated {new Date(updatedAt).toLocaleString()}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginTop: 20,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={save}
            disabled={!dirty || saving}
            style={{
              background: dirty ? C.red : C.s3,
              border: 'none',
              color: dirty ? '#fff' : C.gray,
              padding: '11px 24px',
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              cursor: dirty && !saving ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1,
              transition: 'background .12s, opacity .12s',
            }}
          >
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
          </button>
          {status && (
            <div
              style={{
                fontSize: 12,
                color: status.kind === 'ok' ? C.green : C.red,
                flex: 1,
              }}
            >
              {status.kind === 'ok' ? '✓' : '⚠️'} {status.msg}
            </div>
          )}
        </div>
      </div>

      {/* Help footer */}
      <div
        style={{
          marginTop: 18,
          padding: 16,
          background: C.s2,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          fontSize: 12,
          color: C.gray,
          lineHeight: 1.65,
        }}
      >
        <div style={{ color: C.white, fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
          How this works
        </div>
        FEs check in via the Kinematic Android app; a foreground service
        then pings their GPS at this cadence as long as they&apos;re
        checked in. Each ping lands as a row in the{' '}
        <code style={{ background: C.s3, padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>
          work_activity
        </code>{' '}
        table with{' '}
        <code style={{ background: C.s3, padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>
          activity_type=HEARTBEAT
        </code>
        , which feeds the day-long trail polyline on the Live Tracking
        page and the downloadable CSV.
        <div style={{ marginTop: 10 }}>
          The new value reaches devices via the{' '}
          <code style={{ background: C.s3, padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>
            /auth/me
          </code>{' '}
          payload — most FEs call it on app launch and after every token
          refresh, so the change propagates inside an hour. Currently
          checked-in FEs continue at the old cadence until they sign in
          again or restart the app.
        </div>
        <div style={{ marginTop: 10, color: C.yellow }}>
          ⚠️ iOS users continue to ping every 5 min while the app is in
          the foreground only. Background iOS support is deferred until
          the team is on a paid Apple Developer Program account.
        </div>
      </div>
    </div>
  );
}
