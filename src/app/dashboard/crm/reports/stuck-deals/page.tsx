'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { crmDeals } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { Deal } from '../../../../../types/crm';
import { downloadCsv } from '../../../../../lib/exportCsv';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { useTableSort, SortLabel } from '../../../../../lib/tableSort';

// "Stuck deal" = open status (not won/lost) where the stage hasn't moved
// in N days. Pulls crm_deals, filters client-side, sorts by oldest first.
// The single most-asked-for report by sales managers — every Monday they
// want a list of deals reps need to nudge.
const PRESETS = [7, 14, 30, 60];

interface DealRow extends Record<string, unknown> {
  id: string;
  name: string;
  owner_name: string;
  stage_name: string;
  status: string;
  amount: number;
  days_stuck: number;
  last_activity_at: string | null;
  // Additive columns (also exported to CSV)
  probability: number | null;
  weighted_value: number | null;
  expected_close_date: string | null;
  past_expected_close: boolean;
  deal_age_days: number | null;
  next_action_at: string | null;
}

// Raw underlying value per sortable column (numbers stay numeric).
const stuckVal = (d: DealRow, key: string): unknown => {
  switch (key) {
    case 'name': return d.name;
    case 'owner_name': return d.owner_name;
    case 'stage_name': return d.stage_name;
    case 'amount': return d.amount;
    case 'days_stuck': return d.days_stuck;
    case 'probability': return d.probability;
    case 'weighted_value': return d.weighted_value;
    case 'expected_close_date': return d.expected_close_date;
    case 'deal_age_days': return d.deal_age_days;
    case 'next_action_at': return d.next_action_at;
    default: return d[key];
  }
};

export default function StuckDealsPage() {
  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState<number>(14);
  // The deals list is fetched 1,000 at a time: say so when the page may be looking at part of the book.
  const [truncated, setTruncated] = useState(false);
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
        const todayYmd = new Date().toISOString().slice(0, 10);
        const users: Array<{ id: string; name?: string; full_name?: string; email?: string }> =
          usersRes.data || usersRes || [];
        const nameById = new Map<string, string>();
        for (const u of users) nameById.set(u.id, u.name || u.full_name || u.email || 'User');

        const now = Date.now();
        const out: DealRow[] = [];
        for (const d of deals) {
          const status = (d as any).status as string;
          if (status === 'won' || status === 'lost') continue;
          const since = (d as any).stage_changed_at || (d as any).updated_at || (d as any).created_at;
          if (!since) continue;
          const days = Math.floor((now - new Date(since).getTime()) / 86_400_000);
          if (days < threshold) continue;
          const amountN = Number((d as any).amount || 0);
          const probN = (d as any).probability;
          const prob = typeof probN === 'number' && probN > 0 ? probN : null;
          const exp = (d as any).expected_close_date ? String((d as any).expected_close_date).slice(0, 10) : null;
          const createdAt = (d as any).created_at;
          out.push({
            id: (d as any).id,
            name: (d as any).name || 'Untitled',
            owner_name: (d as any).owner_id ? (nameById.get((d as any).owner_id) || 'Unknown') : 'Unassigned',
            stage_name: (d as any).stage_name || '—',
            status,
            amount: Number((d as any).amount || 0),
            days_stuck: days,
            last_activity_at: (d as any).next_action_at || (d as any).updated_at || null,
            probability: prob,
            weighted_value: prob === null ? null : Math.round((amountN * prob) / 100),
            expected_close_date: exp,
            past_expected_close: !!exp && exp < todayYmd,
            deal_age_days: createdAt ? Math.floor((now - new Date(createdAt).getTime()) / 86_400_000) : null,
            next_action_at: (d as any).next_action_at ? String((d as any).next_action_at).slice(0, 10) : null,
          });
        }
        out.sort((a, b) => b.days_stuck - a.days_stuck);
        setRows(out);
      } catch (e: any) { toast.error(e.message || 'Load failed'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [threshold, cityKey]);

  const totalValue = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const weightedTotal = useMemo(() => rows.reduce((s, r) => s + (r.weighted_value ?? 0), 0), [rows]);
  const pastClose = useMemo(() => rows.filter((r) => r.past_expected_close).length, [rows]);

  // Client-side column sorting; defaults to the effect's oldest-first order.
  const { sorted, sort, toggle } = useTableSort<DealRow>(rows, stuckVal, { key: 'days_stuck', dir: 'desc' });

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: 'var(--text)', margin: 0 }}>Stuck Deals</h3>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Open deals that have not changed stage in {threshold}+ days. Sorted by oldest first.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Threshold</span>
          <div style={{ display: 'inline-flex', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
            {PRESETS.map((n) => (
              <button key={n} onClick={() => setThreshold(n)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: 'none', background: threshold === n ? 'var(--primary)' : 'transparent',
                color: threshold === n ? '#fff' : 'var(--text-dim)',
              }}>{n}d</button>
            ))}
          </div>
          <button onClick={() => downloadCsv(`stuck-deals-${threshold}d`, rows)} disabled={loading || rows.length === 0} style={csvBtn}>⬇ CSV</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Kpi label="Stuck deals" value={rows.length} />
        <Kpi label="Total value" value={inr(totalValue)} />
        <Kpi label="Avg days stuck" value={rows.length ? `${Math.round(rows.reduce((s, r) => s + r.days_stuck, 0) / rows.length)}d` : '—'} />
        <Kpi label="Oldest" value={rows.length ? `${rows[0].days_stuck}d` : '—'} />
        <Kpi label="Weighted value" value={inr(weightedTotal)} />
        <Kpi label="Past expected close" value={pastClose} />
      </div>
      {truncated && (
        <div role="status" style={{ fontSize: 12, color: '#b45309', background: 'rgba(245,158,11,0.12)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          Showing the first 1,000 deals only, so this list may be partial. Narrow the city filter for a complete view.
        </div>
      )}

      {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div> : rows.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 12 }}>Nothing stuck longer than {threshold} days. Healthy pipeline.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
            <thead>
              <tr>
                <th style={th}><SortLabel label="Deal" sortKey="name" sort={sort} onToggle={toggle} /></th>
                <th style={th}><SortLabel label="Owner" sortKey="owner_name" sort={sort} onToggle={toggle} /></th>
                <th style={th}><SortLabel label="Stage" sortKey="stage_name" sort={sort} onToggle={toggle} /></th>
                <th style={thNum}><SortLabel label="Amount" sortKey="amount" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Days Stuck" sortKey="days_stuck" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Probability" sortKey="probability" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Weighted" sortKey="weighted_value" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Expected Close" sortKey="expected_close_date" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Next Action" sortKey="next_action_at" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Deal Age" sortKey="deal_age_days" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => (
                <tr key={d.id}>
                  <td style={td}><Link href={`/dashboard/crm/deals/${d.id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>{d.name}</Link></td>
                  <td style={td}>{d.owner_name}</td>
                  <td style={td}>{d.stage_name}</td>
                  <td style={tdNum}>{inr(d.amount)}</td>
                  <td style={{ ...tdNum, color: d.days_stuck > 30 ? '#ef4444' : 'var(--text)', fontWeight: 700 }}>{d.days_stuck}d</td>
                  <td style={tdNum}>{d.probability !== null ? `${d.probability}%` : '—'}</td>
                  <td style={tdNum}>{d.weighted_value !== null ? inr(d.weighted_value) : '—'}</td>
                  <td style={{ ...tdNum, color: d.past_expected_close ? '#ef4444' : 'var(--text)' }}>{d.expected_close_date ?? '—'}</td>
                  <td style={tdNum}>{d.next_action_at ?? '—'}</td>
                  <td style={tdNum}>{d.deal_age_days !== null ? `${d.deal_age_days}d` : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Link href={`/dashboard/crm/deals/${d.id}`} style={openBtn}>Open →</Link>
                  </td>
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
const csvBtn: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700 };
const openBtn: React.CSSProperties = { display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', border: '1px solid var(--primary)' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right' };
