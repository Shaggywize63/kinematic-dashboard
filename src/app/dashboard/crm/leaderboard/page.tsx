'use client';
/**
 * Sales Leaderboard — ranks reps by won deals over MTD/QTD/YTD/Custom.
 *
 * UX notes:
 *  - The primary-metric toggle (Count vs Revenue) is persisted to
 *    localStorage under `crm.leaderboard.metric` so a manager who prefers
 *    revenue doesn't have to re-pick it every visit.
 *  - The period selector mirrors the existing /reports tooling but is
 *    self-contained (we don't reuse the global DateRangePicker store
 *    because leaderboard's MTD/QTD/YTD presets are tighter than the global
 *    7d/30d/90d set).
 *  - Top-3 ranks get medal emojis, the rest are plain numerals — tasteful,
 *    not gamified.
 *  - We always show both Count and Revenue columns; the toggle just
 *    re-sorts and highlights the primary one.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmLeaderboard, type LeaderboardMetric, type LeaderboardPeriod, type LeaderboardResponse } from '../../../../lib/crmLeaderboardApi';
import { formatINR, formatINRCompact } from '../../../../lib/formatCurrency';

const METRIC_KEY = 'crm.leaderboard.metric';
const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'mtd', label: 'MTD' },
  { value: 'qtd', label: 'QTD' },
  { value: 'ytd', label: 'YTD' },
  { value: 'custom', label: 'Custom' },
];

function rankBadge(idx: number): { label: string; color: string; bg: string } {
  if (idx === 0) return { label: '🥇', color: '#fff', bg: 'linear-gradient(135deg,#facc15,#f59e0b)' };
  if (idx === 1) return { label: '🥈', color: '#fff', bg: 'linear-gradient(135deg,#cbd5e1,#94a3b8)' };
  if (idx === 2) return { label: '🥉', color: '#fff', bg: 'linear-gradient(135deg,#fb923c,#c2410c)' };
  return { label: String(idx + 1), color: 'var(--text)', bg: 'var(--s3)' };
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
  if (url) {
    return <img src={url} alt={name} width={32} height={32} style={{ borderRadius: '50%', objectFit: 'cover', display: 'block' }} />;
  }
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 700, color: '#fff',
      background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    }}>
      {initials}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{
          background: 'var(--s3)',
          borderRadius: 10,
          height: 56,
          opacity: 0.5,
          animation: 'pulse 1.4s ease-in-out infinite',
        }} />
      ))}
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 0.7 } }`}</style>
    </div>
  );
}

export default function LeaderboardPage() {
  const [metric, setMetric] = useState<LeaderboardMetric>('count');
  const [period, setPeriod] = useState<LeaderboardPeriod>('mtd');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Hydrate the persisted metric on mount. We do this in an effect (not in
  // useState's initialiser) so SSR markup stays stable and we don't tripping
  // Next's hydration mismatch warning on the toggle button.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(METRIC_KEY);
      if (saved === 'count' || saved === 'revenue') setMetric(saved);
    } catch { /* ignore */ }
  }, []);

  const persistMetric = useCallback((m: LeaderboardMetric) => {
    setMetric(m);
    try { window.localStorage.setItem(METRIC_KEY, m); } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (period === 'custom' && (!from || !to)) {
        setLoading(false);
        return; // wait for both dates before firing
      }
      const res = await crmLeaderboard.get({ metric, period, from: period === 'custom' ? from : undefined, to: period === 'custom' ? to : undefined });
      // Backend wraps in {success, data}; the inner response itself has
      // {metric, period, rows}.
      setData(res.data);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load leaderboard');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [metric, period, from, to]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const totalCount = useMemo(() => rows.reduce((s, r) => s + r.count, 0), [rows]);
  const totalRevenue = useMemo(() => rows.reduce((s, r) => s + r.revenue, 0), [rows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>🏆 Sales Leaderboard</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
            Top reps by closed-won {metric === 'revenue' ? 'revenue' : 'deal count'}
            {data?.period ? ` — ${data.period.from} → ${data.period.to}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {/* Metric toggle */}
          <div style={{ display: 'inline-flex', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
            {(['count', 'revenue'] as const).map(m => (
              <button
                key={m}
                onClick={() => persistMetric(m)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 7,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: metric === m ? '#fff' : 'var(--text-dim)',
                  background: metric === m ? 'var(--primary)' : 'transparent',
                }}
              >
                {m === 'count' ? 'Count' : 'Revenue'}
              </button>
            ))}
          </div>
          {/* Period segmented */}
          <div style={{ display: 'inline-flex', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 7,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: period === p.value ? '#fff' : 'var(--text-dim)',
                  background: period === p.value ? 'var(--primary)' : 'transparent',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom range inputs */}
      {period === 'custom' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13 }} />
          </label>
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Reps on board</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{rows.length}</div>
        </div>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total wins</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{totalCount}</div>
        </div>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total revenue</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{formatINRCompact(totalRevenue)}</div>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 4, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 14 }}><LoadingSkeleton /></div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>📊</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>No won deals in this window</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Try a wider period or check your client scope filter.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--s3)' }}>
                  <th style={th()}>Rank</th>
                  <th style={{ ...th(), textAlign: 'left' }}>Rep</th>
                  <th style={th(metric === 'count')}>Deals won</th>
                  <th style={th(metric === 'revenue')}>Revenue</th>
                  <th style={th()}>Avg deal</th>
                  <th style={th()}>Win rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const badge = rankBadge(i);
                  return (
                    <tr key={r.user_id ?? `unassigned-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={td()}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: 32, height: 32, padding: '0 8px',
                          borderRadius: 8,
                          background: badge.bg,
                          color: badge.color,
                          fontWeight: 800,
                          fontSize: 14,
                        }}>{badge.label}</div>
                      </td>
                      <td style={td()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar url={r.avatar_url} name={r.full_name} />
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>{r.full_name}</div>
                            {r.email && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={td(metric === 'count')}>{r.count}</td>
                      <td style={td(metric === 'revenue')}>{formatINR(r.revenue)}</td>
                      <td style={td()}>{formatINRCompact(r.avg_deal_size)}</td>
                      <td style={td()}>{Math.round(r.win_rate * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function th(primary: boolean = false): React.CSSProperties {
  return {
    padding: '10px 12px',
    fontSize: 11,
    fontWeight: 700,
    color: primary ? 'var(--primary)' : 'var(--text-dim)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'right',
  };
}
function td(primary: boolean = false): React.CSSProperties {
  return {
    padding: '12px',
    fontSize: 13,
    fontWeight: primary ? 800 : 500,
    color: primary ? 'var(--primary)' : 'var(--text)',
    textAlign: 'right',
  };
}
