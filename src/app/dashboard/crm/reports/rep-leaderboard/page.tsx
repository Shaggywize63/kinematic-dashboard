'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmDeals } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { Deal } from '../../../../../types/crm';
import { downloadCsv } from '../../../../../lib/exportCsv';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { useTableSort, SortLabel } from '../../../../../lib/tableSort';

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
  // Additive columns (also exported to CSV): value view, size, ageing and slippage.
  lost_value: number;
  open_value: number;
  largest_won: number;
  win_rate_by_value: number;
  avg_open_age_days: number | null;
  past_close_date: number;
}

// Raw underlying value per sortable column (numbers stay numeric).
const repVal = (r: RepRow, key: string): unknown => {
  switch (key) {
    case 'name': return r.name;
    case 'won': return r.won;
    case 'lost': return r.lost;
    case 'open': return r.open;
    case 'win_rate': return r.win_rate;
    case 'revenue': return r.revenue;
    case 'avg_deal': return r.avg_deal;
    case 'avg_cycle_days': return r.avg_cycle_days;
    case 'lost_value': return r.lost_value;
    case 'open_value': return r.open_value;
    case 'largest_won': return r.largest_won;
    case 'win_rate_by_value': return r.win_rate_by_value;
    case 'avg_open_age_days': return r.avg_open_age_days;
    case 'past_close_date': return r.past_close_date;
    default: return undefined;
  }
};

// Sales-rep leaderboard. Aggregates crm_deals on the client side: groups
// by owner_id, computes won/lost/open counts, win rate, total won revenue,
// average deal size, and average days-to-close. No new backend endpoint —
// uses crmDeals.list() and merges in user names from /users.
export default function RepLeaderboardPage() {
  const [rows, setRows] = useState<RepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'revenue' | 'won' | 'win_rate' | 'avg_deal'>('revenue');
  // The deals list is fetched 1,000 at a time: say so when the page may be looking at part of the book.
  const [truncated, setTruncated] = useState(false);
  // Refetch when the global city picker changes — crmDeals.list is
  // city-aware via the auto-attached `?city=` query.
  const cityKey = useReportCityKey();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [dealsRes, usersRes] = await Promise.all([
          crmDeals.list({ limit: 1000 }),
          api.getUsers({ limit: '500' }) as Promise<any>,
        ]);
        if (cancelled) return;
        const deals: Deal[] = dealsRes.data || [];
        setTruncated(deals.length >= 1000);
        const today = new Date().toISOString().slice(0, 10);
        const openAges = new Map<string, number[]>();
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
              lost_value: 0, open_value: 0, largest_won: 0, win_rate_by_value: 0, avg_open_age_days: null, past_close_date: 0,
            };
            byOwner.set(key, row);
          }
          row.total++;
          const status = (d as any).status;
          const amount = Number((d as any).amount || 0);
          if (status === 'won') {
            row.won++;
            row.revenue += amount;
            if (amount > row.largest_won) row.largest_won = amount;
            const closed = (d as any).actual_close_date;
            if (closed && (d as any).created_at) {
              const days = (new Date(closed).getTime() - new Date((d as any).created_at).getTime()) / 86_400_000;
              row.avg_cycle_days = ((row.avg_cycle_days ?? 0) * (row.won - 1) + days) / row.won;
            }
          } else if (status === 'lost') {
            row.lost++;
            row.lost_value += amount;
          } else {
            row.open++;
            row.open_value += amount;
            const created = (d as any).created_at;
            if (created) {
              const ages = openAges.get(key) ?? [];
              ages.push(Math.max(0, (Date.now() - new Date(created).getTime()) / 86_400_000));
              openAges.set(key, ages);
            }
            const exp = (d as any).expected_close_date;
            if (exp && String(exp).slice(0, 10) < today) row.past_close_date++;
          }
        }
        for (const r of byOwner.values()) {
          const denom = r.won + r.lost;
          r.win_rate = denom > 0 ? (r.won / denom) * 100 : 0;
          r.avg_deal = r.won > 0 ? r.revenue / r.won : 0;
          r.win_rate_by_value = r.revenue + r.lost_value > 0 ? (r.revenue / (r.revenue + r.lost_value)) * 100 : 0;
          const ages = openAges.get(r.user_id);
          r.avg_open_age_days = ages && ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null;
        }
        setRows(Array.from(byOwner.values()));
      } catch (e: any) { toast.error(e.message || 'Load failed'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [cityKey]);

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => Number(b[sortBy]) - Number(a[sortBy]));
    return out;
  }, [rows, sortBy]);

  // Client-side column sorting layered on top of the "Sort by" dropdown order.
  // No active column by default, so the dropdown order is preserved as-is.
  const { sorted: view, sort, toggle } = useTableSort<RepRow>(sorted, repVal);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({ won: acc.won + r.won, revenue: acc.revenue + r.revenue, open: acc.open + r.open, lost: acc.lost + r.lost, lostValue: acc.lostValue + r.lost_value, openValue: acc.openValue + r.open_value }),
    { won: 0, revenue: 0, open: 0, lost: 0, lostValue: 0, openValue: 0 },
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
        <Kpi label="Open Pipeline Value" value={inr(totals.openValue)} />
        <Kpi label="Lost Value" value={inr(totals.lostValue)} />
        <Kpi label="Win Rate by Value" value={totals.revenue + totals.lostValue > 0 ? `${((totals.revenue / (totals.revenue + totals.lostValue)) * 100).toFixed(1)}%` : '—'} />
      </div>
      {truncated && (
        <div role="status" style={{ fontSize: 12, color: '#b45309', background: 'rgba(245,158,11,0.12)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          Showing the first 1,000 deals only, so these numbers may be partial. Narrow the city filter for a complete view.
        </div>
      )}

      {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div> : sorted.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 12 }}>No deals to aggregate yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}><SortLabel label="Rep" sortKey="name" sort={sort} onToggle={toggle} /></th>
                <th style={thNum}><SortLabel label="Won" sortKey="won" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Lost" sortKey="lost" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Open" sortKey="open" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Win Rate" sortKey="win_rate" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Revenue" sortKey="revenue" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Avg Deal" sortKey="avg_deal" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Avg Cycle" sortKey="avg_cycle_days" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Largest Won" sortKey="largest_won" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Lost Value" sortKey="lost_value" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Win Rate by Value" sortKey="win_rate_by_value" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Open Value" sortKey="open_value" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Avg Open Age" sortKey="avg_open_age_days" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Past Close Date" sortKey="past_close_date" sort={sort} onToggle={toggle} align="right" /></th>
              </tr>
            </thead>
            <tbody>
              {view.map((r, i) => (
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
                  <td style={tdNum}>{r.largest_won > 0 ? inr(r.largest_won) : '—'}</td>
                  <td style={tdNum}>{inr(r.lost_value)}</td>
                  <td style={tdNum}>{r.revenue + r.lost_value > 0 ? `${r.win_rate_by_value.toFixed(1)}%` : '—'}</td>
                  <td style={tdNum}>{inr(r.open_value)}</td>
                  <td style={tdNum}>{r.avg_open_age_days !== null ? `${r.avg_open_age_days.toFixed(0)}d` : '—'}</td>
                  <td style={{ ...tdNum, color: r.past_close_date > 0 ? '#ef4444' : 'var(--text)' }}>{r.past_close_date}</td>
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
