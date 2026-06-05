'use client';
/**
 * Targets Leaderboard — analytics for the Targets module.
 *
 * Ranks the field force by leads created in the chosen window (today / this
 * week / this month), each user shown against their resolved target (scaled by
 * days elapsed). Header stat cards summarise total, average, top & lowest
 * performers and how many are meeting target. Manager-only data; the endpoint
 * is role-gated server-side and tenant-scoped via the active client.
 */
import { useCallback, useEffect, useState } from 'react';
import { Trophy, TrendingDown, Users, Target, RefreshCw } from 'lucide-react';
import { crmTargets, type Leaderboard, type LeaderboardPeriod } from '../../../lib/crmApi';

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

export default function TargetsLeaderboard({ embedded = false }: { embedded?: boolean }) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('today');
  const [data, setData] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which hierarchy role the board is scoped to (e.g. Consumer Champion),
  // configurable per client. Managers can change it; saving refetches.
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [roleId, setRoleId] = useState<string>('');

  // Narrow-viewport flag so the ranked rows reflow on phones (inline styles
  // can't use CSS media queries). On narrow we drop the Target column and
  // shrink the progress block to keep rows from overflowing.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const f = () => setNarrow(window.innerWidth < 640);
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  const load = useCallback(async (p: LeaderboardPeriod) => {
    setLoading(true);
    setError(null);
    try {
      const r = await crmTargets.leaderboard(p);
      setData(r?.data ?? null);
      setRoleId(r?.data?.role_id ?? '');
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  // Load the hierarchy roles once for the scope picker (manager-only surface).
  useEffect(() => {
    crmTargets.levels().then((r) => setRoles(r?.data ?? [])).catch(() => setRoles([]));
  }, []);

  const changeRole = async (id: string) => {
    setRoleId(id);
    try {
      await crmTargets.setLeaderboardRole(id || null);
      await load(period);
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Failed to set role');
    }
  };

  const s = data?.stats;

  return (
    <div style={embedded
      ? { background: 'transparent', padding: 4, height: '100%', overflowY: 'auto' }
      : { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Targets</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>Leaderboard</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            Who entered the most leads, who&apos;s behind, and how the team tracks against target.
          </div>
        </div>
        {roles.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-dim)' }} title="Which hierarchy role this leaderboard ranks">
            Role
            <select
              value={roleId}
              onChange={(e) => changeRole(e.target.value)}
              style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700 }}
            >
              <option value="">All field force</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        )}
        <div style={{ display: 'flex', gap: 6, background: 'var(--s3)', padding: 4, borderRadius: 9 }}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
                background: period === p.key ? 'var(--primary)' : 'transparent',
                color: period === p.key ? '#fff' : 'var(--text-dim)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => load(period)}
          title="Refresh"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)' }}
        >
          <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
      </div>

      {/* Summary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        <StatCard icon={<Trophy size={15} />} accent="#f59e0b" label="Top performer"
          value={s?.top_performer ? s.top_performer.name : '—'}
          sub={s?.top_performer ? `${s.top_performer.leads} leads` : 'No leads yet'} />
        <StatCard icon={<TrendingDown size={15} />} accent="#ef4444" label="Needs a nudge"
          value={s?.lowest_performer ? s.lowest_performer.name : '—'}
          sub={s?.lowest_performer ? `${s.lowest_performer.leads} leads` : '—'} />
        <StatCard icon={<Users size={15} />} accent="#3b82f6" label="Avg / person"
          value={s ? String(s.average_leads) : '—'}
          sub={s ? `${s.total_leads} leads total` : '—'} />
        <StatCard icon={<Target size={15} />} accent="#22c55e" label="Meeting target"
          value={s ? `${s.meeting_target}/${s.target_participants}` : '—'}
          sub={s ? `${s.participants} on board` : '—'} />
      </div>

      {error ? (
        <div style={{ padding: 14, borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: '#ef4444' }}>
          {error}
        </div>
      ) : loading && !data ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Loading leaderboard…</div>
      ) : !data || data.entries.length === 0 ? (
        <div style={{ padding: 28, textAlign: 'center', background: 'var(--s3)', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-dim)', fontSize: 13 }}>
          No leads entered in this period yet. Set targets in Settings → Targets and they&apos;ll show up here as the team logs leads.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Header row — Target column + progress bar collapse on narrow. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 28, textAlign: 'center' }}>#</div>
            <div style={{ flex: 1, minWidth: 0 }}>{narrow ? 'FE' : 'Field executive'}</div>
            <div style={{ width: narrow ? 44 : 56, textAlign: 'right' }}>Leads</div>
            {!narrow && <div style={{ width: 56, textAlign: 'right' }}>Target</div>}
            <div style={{ flex: narrow ? '0 0 48px' : '0 0 120px', textAlign: 'right' }}>{narrow ? '%' : 'Progress'}</div>
          </div>
          {data.entries.map((e, i) => {
            const pct = e.pct;
            const barPct = pct == null ? 0 : Math.min(100, pct);
            const hit = e.target > 0 && e.leads >= e.target;
            const barColor = e.target === 0 ? 'var(--text-dim)' : hit ? '#22c55e' : pct != null && pct >= 60 ? '#f59e0b' : '#ef4444';
            return (
              <div key={e.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 28, textAlign: 'center', fontSize: 15, fontWeight: 800, color: 'var(--text-dim)' }}>
                  {i < 3 ? MEDALS[i] : i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{e.city || '—'}</div>
                </div>
                <div style={{ width: narrow ? 44 : 56, textAlign: 'right', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{e.leads}</div>
                {!narrow && <div style={{ width: 56, textAlign: 'right', fontSize: 13, color: 'var(--text-dim)' }}>{e.target > 0 ? e.target : '—'}</div>}
                <div style={{ flex: narrow ? '0 0 48px' : '0 0 120px', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                  {!narrow && (
                    <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--s4, var(--s3))', overflow: 'hidden' }}>
                      <div style={{ width: `${barPct}%`, height: '100%', background: barColor, borderRadius: 99, transition: 'width .3s' }} />
                    </div>
                  )}
                  <div style={{ width: narrow ? 48 : 36, textAlign: 'right', fontSize: 11, fontWeight: 700, color: barColor }}>
                    {pct == null ? '—' : `${pct}%`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function StatCard({ icon, accent, label, value, sub }: { icon: React.ReactNode; accent: string; label: string; value: string; sub: string }) {
  return (
    <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: accent, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-dim)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}
