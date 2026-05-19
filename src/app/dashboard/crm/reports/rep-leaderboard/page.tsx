'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmDeals } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { Deal } from '../../../../../types/crm';
import { downloadCsv } from '../../../../../lib/exportCsv';

interface RepRow {
  user_id: string;
  name: string;
  total: number;
  won: number;
  lost: number;
  open: number;
  win_rate: number;
  revenue: number;
  avg_deal: number;
  avg_cycle_days: number | null;
}

// Sales-rep leaderboard. Aggregates crm_deals on the client side: groups
// by owner_id, computes won/lost/open counts, win rate, total won revenue,
// average deal size, and average days-to-close. No new backend endpoint —
// uses crmDeals.list() and merges in user names from /users.
export default function RepLeaderboardPage() {
  const [rows, setRows] = useState<RepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'revenue' | 'won' | 'win_rate' | 'avg_deal'>('revenue');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dealsRes, usersRes] = await Promise.all([
          crmDeals.list({ limit: 1000 }),
          api.getUsers({ limit: '500' }) as Promise<any>,
        ]);
        if (cancelled) return;
        const deals: Deal[] = dealsRes.data || [];
        const users: Array<{ id: string; name?: string; full_name?: string; email?: string }> =
          usersRes.data || usersRes || [];
        const nameById = new Map<string, string>();
        for (const u of users) nameById.set(u.id, u.name || u.full_name || u.email || 'User');

        const byOwner = new Map<string, RepRow>();
        for (const d of deals) {
          const ownerId = (d as any).owner_id || 'unassigned';
          const key = ownerId;
          let row = byOwner.get(key);
          if (!row) {
            row = {
              user_id: key,
              name: ownerId === 'unassigned' ? 'Unassigned' : (nameById.get(ownerId) || 'Unknown'),
              total: 0, won: 0, lost: 0, open: 0,
              win_rate: 0, revenue: 0, avg_deal: 0, avg_cycle_days: null,
            };
            byOwner.set(key, row);
          }
          row.total++;
          const status = (d as any).status;
          const amount = Number((d as any).amount || 0);
          if (status === 'won') {
            row.won++;
            row.revenue += amount;
            const closed = (d as any).actual_close_date;
            if (closed && (d as any).created_at) {
              const days = (new Date(closed).getTime() - new Date((d as any).created_at).getTime()) / 86_400_000;
              row.avg_cycle_days = ((row.avg_cycle_days ?? 0) * (row.won - 1) + days) / row.won;
            }
          } else if (status === 'lost') {
            row.lost++;
          } else {
            row.open++;
          }
        }
        for (const r of byOwner.values()) {
          const denom = r.won + r.lost;
          r.win_rate = denom > 0 ? (r.won / denom) * 100 : 0;
          r.avg_deal = r.won > 0 ? r.revenue / r.won : 0;
        }
        setRows(Array.from(byOwner.values()));
      } catch (e: any) { toast.error(e.message || 'Load failed'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => Number(b[sortBy]) - Number(a[sortBy]));
    return out;
  }, [rows, sortBy]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({ won: acc.won + r.won, revenue: acc.revenue + r.revenue, open: acc.open + r.open }),
    { won: 0, revenue: 0, open: 0 },
  ), [rows]);

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Rep Leaderboard</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Sort by</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={sel}>
            <option value="revenue">Revenue</option>
            <option value="won">Deals Won</option>
            <option value="win_rate">Win Rate</option>
            <option value="avg_deal">Avg Deal Size</option>
          </select>
          <button onClick={() => downloadCsv('rep-leaderboard', sorted as any)} disabled={loading || sorted.length === 0} style={csvBtn}>⬇ CSV</button>
        </div>
      </div>

      {/* Headline KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Kpi label="Reps Active" value={rows.filter((r) => r.total > 0).length} />
        <Kpi label="Total Deals Won" value={totals.won} />
        <Kpi label="Total Revenue" value={inr(totals.revenue)} />
        <Kpi label="Open Pipeline (count)" value={totals.open} />
      </div>

      {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div> : sorted.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 12 }}>No deals to aggregate yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Rep</th>
                <th style={thNum}>Won</th>
                <th style={thNum}>Lost</th>
                <th style={thNum}>Open</th>
                <th style={thNum}>Win Rate</th>
                <th style={thNum}>Revenue</th>
                <th style={thNum}>Avg Deal</th>
                <th style={thNum}>Avg Cycle</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.user_id}>
                  <td style={{ ...td, color: 'var(--text-dim)' }}>{i + 1}</td>
                  <td style={td}>{r.name}</td>
                  <td style={tdNum}>{r.won}</td>
                  <td style={tdNum}>{r.lost}</td>
                  <td style={tdNum}>{r.open}</td>
                  <td style={tdNum}>{r.win_rate.toFixed(1)}%</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: 'var(--text)' }}>{inr(r.revenue)}</td>
                  <td style={tdNum}>{r.avg_deal > 0 ? inr(r.avg_deal) : '—'}</td>
                  <td style={tdNum}>{r.avg_cycle_days !== null ? `${r.avg_cycle_days.toFixed(0)}d` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function inr(n: number): string {
  if (!n) return '₹0';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

const sel: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13 };
const csvBtn: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right' };
