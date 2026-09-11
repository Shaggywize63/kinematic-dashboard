'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../../lib/api';

/**
 * Route Deviations — off-route visits for the org (module route_deviation).
 * A visit is off-route when the rep checked in FURTHER from the planned outlet
 * than its geofence allowed (checkin_distance_m > geofence_radius_m). This is
 * the visible surface for the backend deviation-alert scan.
 *
 * Note: this flags a check-in logged away from ITS planned outlet — it does NOT
 * penalise a rep for taking a different physical path or for covering extra
 * outlets along the way (those simply aren't planned-stop mismatches).
 */

type Deviation = {
  outlet_id: string;
  rep_name: string;
  plan_date: string | null;
  territory_label: string | null;
  store_name: string | null;
  distance_m: number;
  geofence_radius_m: number;
  checkin_at: string | null;
  alerted_at: string | null;
};

const C = {
  bg: 'var(--bg)', s2: 'var(--s2)', s3: 'var(--s3)', text: 'var(--text)',
  sec: 'var(--textSec)', tert: 'var(--textTert)', border: 'var(--border)',
  red: '#E01E2C', amber: '#F5A623',
};

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '—';
const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

export default function RouteDeviationsPage() {
  const [date, setDate] = useState(istToday());
  const [rows, setRows] = useState<Deviation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get<{ data?: Deviation[] } | Deviation[]>(`/api/v1/route-plans/deviations?date=${date}`);
      const data = (Array.isArray(r) ? r : r?.data) ?? [];
      setRows(data as Deviation[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load deviations');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--heading, inherit)', fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>Route Deviations</h1>
          <p style={{ fontSize: 13, color: C.sec, margin: '4px 0 0' }}>
            Visits where the rep checked in outside the planned outlet&apos;s geofence.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13 }} />
          <button onClick={load} disabled={loading}
            style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', color: C.text, fontSize: 13, cursor: loading ? 'default' : 'pointer' }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ margin: '12px 0', fontSize: 13, color: C.red, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px' }}>{error}</div>
      )}

      <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: C.s2 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: C.tert, background: C.s3 }}>
                {['Rep', 'Planned outlet', 'Distance off', 'Geofence', 'Checked in', 'Alerted'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '28px 14px', color: C.tert, textAlign: 'center' }}>No off-route visits for this date.</td></tr>
              )}
              {rows.map((d) => (
                <tr key={d.outlet_id} style={{ borderTop: `1px solid ${C.border}`, color: C.text }}>
                  <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                    {d.rep_name}{d.territory_label ? <span style={{ color: C.tert }}> · {d.territory_label}</span> : null}
                  </td>
                  <td style={{ padding: '11px 14px' }}>{d.store_name ?? '—'}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 700, color: C.red, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDist(d.distance_m)}</td>
                  <td style={{ padding: '11px 14px', color: C.sec, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDist(d.geofence_radius_m)}</td>
                  <td style={{ padding: '11px 14px', color: C.sec, whiteSpace: 'nowrap' }}>{fmtTime(d.checkin_at)}</td>
                  <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                    {d.alerted_at
                      ? <span style={{ color: C.amber }}>Supervisor alerted</span>
                      : <span style={{ color: C.tert }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
