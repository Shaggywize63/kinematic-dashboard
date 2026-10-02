'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Footprints, MapPin, RefreshCw } from 'lucide-react';
import crmApi, { type MarketingVisit } from '../../../../lib/crmApi';
import { useAuth } from '../../../../hooks/useAuth';
import { canViewFieldVisits } from '../../../../lib/clientFeatures';

type StatusFilter = 'all' | 'planned' | 'completed';

/** A marketing visit is "completed" when either the activity status or the
 *  metadata visit phase says so; otherwise it's still in progress. */
function isCompleted(v: MarketingVisit): boolean {
  return v.status === 'completed' || v.metadata?.visit?.phase === 'completed';
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Human duration between start and end; blank while in progress. */
function fmtDuration(startIso?: string | null, endIso?: string | null): string {
  if (!startIso || !endIso) return '—';
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return '—';
  const sec = Math.round((b - a) / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function mapsLink(lat?: number | null, lng?: number | null): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function FieldVisitsPage() {
  const { user } = useAuth();
  const allowed = canViewFieldVisits(user as any);

  const [visits, setVisits] = useState<MarketingVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await crmApi.marketingVisits.list(status === 'all' ? undefined : { status });
      setVisits(res.data || []);
    } catch (e: any) {
      setError(e?.message || 'Could not load field visits');
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    void load();
  }, [allowed, load]);

  const counts = useMemo(() => {
    const total = visits.length;
    const completed = visits.filter(isCompleted).length;
    return { total, completed, inProgress: total - completed };
  }, [visits]);

  if (!allowed) {
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Field Visits</h3>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 8 }}>
          This view is available for tenants running the ad-hoc Marketing Visit flow.
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h3 style={{ color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Footprints size={18} /> Field Visits
          </h3>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, maxWidth: 640 }}>
            Ad-hoc Marketing Visits captured from the mobile app — each GPS Start→End tied to a lead.
            Showing the most recent {visits.length ? `${visits.length} ` : ''}visits.
          </div>
        </div>
        <Link href="/dashboard/crm/reports/field-visits" style={{ color: 'var(--primary)', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Field-executive rollup →
        </Link>
      </div>

      {/* Summary tiles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Tile label="Total" value={counts.total} highlight />
        <Tile label="In Progress" value={counts.inProgress} />
        <Tile label="Completed" value={counts.completed} />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        {(['all', 'planned', 'completed'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: status === s ? 'var(--primary)' : 'var(--s3)',
              color: status === s ? '#fff' : 'var(--text-dim)',
            }}
          >
            {s === 'all' ? 'All' : s === 'planned' ? 'In Progress' : 'Completed'}
          </button>
        ))}
        <button
          onClick={() => void load()}
          disabled={loading}
          title="Refresh"
          style={{
            padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, marginLeft: 'auto',
            border: '1px solid var(--border)', cursor: loading ? 'default' : 'pointer',
            background: 'var(--s3)', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <RefreshCw size={13} /> {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div style={{ color: 'var(--primary)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {/* Table */}
      {loading && visits.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Loading field visits…</div>
      ) : visits.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
          No marketing visits captured yet. Visits logged from the mobile app will appear here.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                {['Lead', 'Field Executive', 'Status', 'Started', 'Ended', 'Duration', 'Location', 'Purpose', 'Outcome / Notes'].map((h) => (
                  <th key={h} style={{
                    position: 'sticky', top: 0, textAlign: 'left', whiteSpace: 'nowrap', padding: '9px 12px',
                    background: 'var(--s3)', color: 'var(--text)', fontWeight: 700, borderBottom: '1px solid var(--border)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => {
                const done = isCompleted(v);
                const visit = v.metadata?.visit || {};
                const feName = v.assigned_to_name || v.owner_name || 'Unassigned';
                const leadLabel = v.lead_name || (v.subject ? v.subject.replace(/^Marketing Visit\s*—\s*/, '') : 'Lead');
                const startMap = mapsLink(visit.start_lat, visit.start_lng);
                const endMap = mapsLink(visit.end_lat, visit.end_lng);
                const notes = v.outcome || v.body || '';
                return (
                  <tr key={v.id}>
                    <td style={cell}>
                      {v.lead_id ? (
                        <Link href={`/dashboard/crm/leads/${v.lead_id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
                          {leadLabel}
                        </Link>
                      ) : <span style={{ fontWeight: 600, color: 'var(--text)' }}>{leadLabel}</span>}
                      {v.lead_phone ? <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>{v.lead_phone}</div> : null}
                    </td>
                    <td style={{ ...cell, color: 'var(--text)' }}>{feName}</td>
                    <td style={cell}>
                      <span style={{
                        display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: done ? 'rgba(10,138,78,0.14)' : 'rgba(234,159,0,0.16)',
                        color: done ? '#0A8A4E' : '#B9770B',
                      }}>{done ? 'Completed' : 'In Progress'}</span>
                    </td>
                    <td style={{ ...cell, color: 'var(--text)' }}>{fmtDateTime(visit.started_at)}</td>
                    <td style={{ ...cell, color: 'var(--text)' }}>{done ? fmtDateTime(visit.ended_at) : '—'}</td>
                    <td style={{ ...cell, color: 'var(--text)' }}>{fmtDuration(visit.started_at, visit.ended_at)}</td>
                    <td style={cell}>
                      {startMap || endMap ? (
                        <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                          {startMap && <a href={startMap} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={12} />Start</a>}
                          {endMap && <a href={endMap} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={12} />End</a>}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ ...cell, color: 'var(--text)', maxWidth: 200, whiteSpace: 'normal' }}>{visit.purpose || '—'}</td>
                    <td style={{ ...cell, color: 'var(--text-dim)', maxWidth: 280, whiteSpace: 'normal' }}>{notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const cell: CSSProperties = {
  padding: '9px 12px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', verticalAlign: 'top',
};

function Tile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? 'var(--primary)' : 'var(--s3)',
      border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', minWidth: 96,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: highlight ? 'rgba(255,255,255,0.85)' : 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: highlight ? '#fff' : 'var(--text)', marginTop: 2 }}>{value.toLocaleString('en-IN')}</div>
    </div>
  );
}
