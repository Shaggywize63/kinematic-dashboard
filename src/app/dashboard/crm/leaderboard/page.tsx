'use client';
import { useEffect, useState } from 'react';
import { getStoredUser } from '../../../../lib/auth';
import api from '../../../../lib/api';

const ALLOWED_ROLES = ['super_admin', 'sub_admin', 'client', 'admin', 'main_admin'];

function normalizeRole(r: string) {
  return (r || '').toLowerCase().trim().replace(/-/g, '_');
}

type Period = 'mtd' | 'qtd' | 'ytd';
type Metric = 'count' | 'revenue';

interface Pipeline { id: string; name: string; }
interface Stage    { id: string; name: string; }
interface Rep {
  rank: number; user_id: string; full_name: string; avatar_url?: string;
  email: string; count: number; revenue: number; avg_deal_size: number; win_rate: number;
}

const MEDAL: Record<number, { bg: string; fg: string; label: string }> = {
  1: { bg: 'rgba(255,215,0,0.12)',  fg: '#FFD700', label: '#1' },
  2: { bg: 'rgba(192,192,192,0.12)', fg: '#C0C0C0', label: '#2' },
  3: { bg: 'rgba(205,127,50,0.12)', fg: '#CD7F32', label: '#3' },
};

function initials(name: string) {
  const parts = name.trim().split(' ');
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
}

export default function SalesLeaderboardPage() {
  const user = getStoredUser();
  const role = normalizeRole(user?.role || '');
  const allowed = ALLOWED_ROLES.some(r => role === r) ||
    role.includes('admin') ||
    role.includes('client');

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages,    setStages]    = useState<Stage[]>([]);
  const [reps,      setReps]      = useState<Rep[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [pipelineId, setPipelineId] = useState('');
  const [stageId,    setStageId]   = useState('');
  const [period,  setPeriod]  = useState<Period>('mtd');
  const [metric,  setMetric]  = useState<Metric>('count');

  // Load pipelines
  useEffect(() => {
    if (!allowed) return;
    api.get('/api/v1/crm/pipelines').then((r: any) => {
      setPipelines(Array.isArray(r) ? r : (r?.data ?? []));
    }).catch(() => {});
  }, [allowed]);

  // Load stages when pipeline changes
  useEffect(() => {
    setStageId('');
    setStages([]);
    if (!pipelineId) return;
    api.get(`/api/v1/crm/pipelines/${pipelineId}/stages`).then((r: any) => {
      setStages(Array.isArray(r) ? r : (r?.data ?? []));
    }).catch(() => {});
  }, [pipelineId]);

  // Load leaderboard
  useEffect(() => {
    if (!allowed) return;
    const params = new URLSearchParams({ metric, period });
    if (pipelineId) params.set('pipeline_id', pipelineId);
    if (stageId)    params.set('stage_id',    stageId);
    setLoading(true);
    api.get(`/api/v1/crm/leaderboard?${params.toString()}`).then((r: any) => {
      setReps(Array.isArray(r) ? r : (r?.data ?? []));
    }).catch(() => { setReps([]); }).finally(() => setLoading(false));
  }, [allowed, metric, period, pipelineId, stageId]);

  if (!allowed) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
        You don&apos;t have permission to view the leaderboard.
      </div>
    );
  }

  const INR = (n: number) =>
    n >= 1e7 ? `₹${(n / 1e7).toFixed(2)}Cr`
    : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L`
    : `₹${n.toLocaleString('en-IN')}`;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: 'var(--text)' }}>Sales Leaderboard</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '4px 0 0' }}>
          Top-performing reps by deals won and revenue generated.
        </p>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20,
        background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px',
      }}>
        {/* Pipeline picker */}
        <select
          value={pipelineId}
          onChange={e => setPipelineId(e.target.value)}
          style={sel}
        >
          <option value="">All Pipelines</option>
          {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {/* Stage picker */}
        <select
          value={stageId}
          onChange={e => setStageId(e.target.value)}
          style={sel}
          disabled={!pipelineId}
        >
          <option value="">All Stages</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Period toggle */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--s3)', borderRadius: 8, padding: 3 }}>
          {(['mtd', 'qtd', 'ytd'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '6px 13px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: period === p ? 'var(--primary)' : 'transparent',
              color: period === p ? '#fff' : 'var(--text-dim)',
            }}>
              {p.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Metric toggle */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--s3)', borderRadius: 8, padding: 3 }}>
          <button onClick={() => setMetric('count')} style={{
            padding: '6px 13px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 700,
            background: metric === 'count' ? 'var(--primary)' : 'transparent',
            color: metric === 'count' ? '#fff' : 'var(--text-dim)',
          }}># Deals Won</button>
          <button onClick={() => setMetric('revenue')} style={{
            padding: '6px 13px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 700,
            background: metric === 'revenue' ? 'var(--primary)' : 'transparent',
            color: metric === 'revenue' ? '#fff' : 'var(--text-dim)',
          }}>Revenue</button>
        </div>
      </div>

      {/* Leaderboard list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>Loading…</div>
        )}
        {!loading && reps.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
            No data for the selected filters.
          </div>
        )}
        {!loading && reps.map((rep) => {
          const medal = MEDAL[rep.rank];
          return (
            <div key={rep.user_id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: medal ? medal.bg : 'var(--s2)',
              border: `1px solid ${medal ? medal.fg + '40' : 'var(--border)'}`,
              borderRadius: 12, padding: '14px 18px',
            }}>
              {/* Rank */}
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: medal ? medal.fg + '22' : 'var(--s3)',
                border: `1px solid ${medal ? medal.fg + '55' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, color: medal ? medal.fg : 'var(--text-dim)',
              }}>
                #{rep.rank}
              </div>

              {/* Avatar */}
              <div style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                background: medal ? medal.fg + '28' : 'var(--s3)',
                border: `1px solid ${medal ? medal.fg + '55' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 800, color: medal ? medal.fg : 'var(--text)',
                overflow: 'hidden',
              }}>
                {rep.avatar_url
                  ? <img src={rep.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials(rep.full_name).toUpperCase()
                }
              </div>

              {/* Name + email */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {rep.full_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {rep.email}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 20, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Stat label="Deals Won" value={String(rep.count)} accent={medal?.fg} />
                <Stat label="Revenue" value={INR(rep.revenue)} accent={medal?.fg} />
                <Stat label="Win Rate" value={`${rep.win_rate.toFixed(1)}%`} accent={medal?.fg} />
                <Stat label="Avg Deal" value={INR(rep.avg_deal_size)} accent={medal?.fg} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ textAlign: 'right', minWidth: 70 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: accent ?? 'var(--text)', lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

const sel: React.CSSProperties = {
  background: 'var(--s3)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '7px 12px',
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
};
