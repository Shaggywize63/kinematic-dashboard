'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { crmDeals } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { Deal } from '../../../../../types/crm';
import { downloadCsv } from '../../../../../lib/exportCsv';

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
}

export default function StuckDealsPage() {
  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState<number>(14);

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

        const now = Date.now();
        const out: DealRow[] = [];
        for (const d of deals) {
          const status = (d as any).status as string;
          if (status === 'won' || status === 'lost') continue;
          const since = (d as any).stage_changed_at || (d as any).updated_at || (d as any).created_at;
          if (!since) continue;
          const days = Math.floor((now - new Date(since).getTime()) / 86_400_000);
          if (days < threshold) continue;
          out.push({
            id: (d as any).id,
            name: (d as any).name || 'Untitled',
            owner_name: (d as any).owner_id ? (nameById.get((d as any).owner_id) || 'Unknown') : 'Unassigned',
            stage_name: (d as any).stage_name || '—',
            status,
            amount: Number((d as any).amount || 0),
            days_stuck: days,
            last_activity_at: (d as any).next_action_at || (d as any).updated_at || null,
          });
        }
        out.sort((a, b) => b.days_stuck - a.days_stuck);
        setRows(out);
      } catch (e: any) { toast.error(e.message || 'Load failed'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [threshold]);

  const totalValue = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);

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
      </div>

      {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div> : rows.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 12 }}>Nothing stuck longer than {threshold} days. Healthy pipeline.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>Deal</th>
                <th style={th}>Owner</th>
                <th style={th}>Stage</th>
                <th style={thNum}>Amount</th>
                <th style={thNum}>Days Stuck</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td style={td}><Link href={`/dashboard/crm/deals/${d.id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>{d.name}</Link></td>
                  <td style={td}>{d.owner_name}</td>
                  <td style={td}>{d.stage_name}</td>
                  <td style={tdNum}>{inr(d.amount)}</td>
                  <td style={{ ...tdNum, color: d.days_stuck > 30 ? '#ef4444' : 'var(--text)', fontWeight: 700 }}>{d.days_stuck}d</td>
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
