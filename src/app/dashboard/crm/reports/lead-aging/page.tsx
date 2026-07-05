'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { crmLeads } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { Lead } from '../../../../../types/crm';
import { downloadCsv } from '../../../../../lib/exportCsv';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { useTableSort, SortLabel } from '../../../../../lib/tableSort';

// "Lead aging" = open lead (status not in converted/lost/unqualified)
// sorted by how long since stage_changed_at. Tells the rep who to call
// today. Complements the daily reminder push by giving managers a
// reviewable list.
const OPEN_STATUSES = ['new', 'working', 'nurturing', 'qualified'];
const PRESETS = [7, 14, 30, 60];

interface LeadRow extends Record<string, unknown> {
  id: string;
  name: string;
  owner_name: string;
  status: string;
  score: number;
  source: string;
  days_old: number;
}

// Raw underlying value per sortable column (numbers stay numeric).
const agingVal = (l: LeadRow, key: string): unknown => {
  switch (key) {
    case 'name': return l.name;
    case 'owner_name': return l.owner_name;
    case 'status': return l.status;
    case 'score': return l.score;
    case 'days_old': return l.days_old;
    default: return l[key];
  }
};

export default function LeadAgingPage() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState<number>(7);
  const cityKey = useReportCityKey();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [leadsRes, usersRes] = await Promise.all([
          crmLeads.list({ limit: 1000 }),
          api.getUsers({ limit: '500' }) as Promise<any>,
        ]);
        if (cancelled) return;
        const leads: Lead[] = leadsRes.data || [];
        const users: Array<{ id: string; name?: string; full_name?: string; email?: string }> =
          usersRes.data || usersRes || [];
        const nameById = new Map<string, string>();
        for (const u of users) nameById.set(u.id, u.name || u.full_name || u.email || 'User');

        const now = Date.now();
        const out: LeadRow[] = [];
        for (const l of leads) {
          const status = ((l as any).status as string) || '';
          if (!OPEN_STATUSES.includes(status)) continue;
          const since = (l as any).stage_changed_at || (l as any).updated_at || (l as any).created_at;
          if (!since) continue;
          const days = Math.floor((now - new Date(since).getTime()) / 86_400_000);
          if (days < threshold) continue;
          const fn = ((l as any).first_name || '').trim();
          const ln = ((l as any).last_name || '').trim();
          const name = `${fn} ${ln}`.trim() || (l as any).company || (l as any).email || 'Unnamed';
          out.push({
            id: (l as any).id,
            name,
            owner_name: (l as any).owner_id ? (nameById.get((l as any).owner_id) || 'Unknown') : 'Unassigned',
            status,
            score: Number((l as any).score || 0),
            source: (l as any).source || (l as any).source_id || '—',
            days_old: days,
          });
        }
        out.sort((a, b) => b.days_old - a.days_old);
        setRows(out);
      } catch (e: any) { toast.error(e.message || 'Load failed'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [threshold, cityKey]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.status, (map.get(r.status) || 0) + 1);
    return map;
  }, [rows]);

  // Client-side column sorting; defaults to the effect's oldest-first order.
  const { sorted, sort, toggle } = useTableSort<LeadRow>(rows, agingVal, { key: 'days_old', dir: 'desc' });

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: 'var(--text)', margin: 0 }}>Lead Aging</h3>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Open leads (new / working / nurturing / qualified) that have been stuck for {threshold}+ days.</div>
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
          <button onClick={() => downloadCsv(`lead-aging-${threshold}d`, rows)} disabled={loading || rows.length === 0} style={csvBtn}>⬇ CSV</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Kpi label="Aged leads" value={rows.length} />
        <Kpi label="New" value={byStatus.get('new') || 0} />
        <Kpi label="Working" value={byStatus.get('working') || 0} />
        <Kpi label="Nurturing" value={byStatus.get('nurturing') || 0} />
        <Kpi label="Qualified" value={byStatus.get('qualified') || 0} />
      </div>

      {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div> : rows.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 12 }}>No open leads older than {threshold} days. Reps are on top of it.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}><SortLabel label="Lead" sortKey="name" sort={sort} onToggle={toggle} /></th>
                <th style={th}><SortLabel label="Owner" sortKey="owner_name" sort={sort} onToggle={toggle} /></th>
                <th style={th}><SortLabel label="Status" sortKey="status" sort={sort} onToggle={toggle} /></th>
                <th style={thNum}><SortLabel label="Score" sortKey="score" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Days Old" sortKey="days_old" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l) => (
                <tr key={l.id}>
                  <td style={td}><Link href={`/dashboard/crm/leads/${l.id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>{l.name}</Link></td>
                  <td style={td}>{l.owner_name}</td>
                  <td style={td}><StatusBadge status={l.status} /></td>
                  <td style={tdNum}>{l.score || '—'}</td>
                  <td style={{ ...tdNum, color: l.days_old > 30 ? '#ef4444' : 'var(--text)', fontWeight: 700 }}>{l.days_old}d</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Link href={`/dashboard/crm/leads/${l.id}`} style={openBtn}>Open →</Link>
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
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: '#6366f1', working: '#f59e0b', nurturing: '#06b6d4', qualified: '#10b981',
  };
  const c = colors[status] || '#888';
  return <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4, background: `${c}22`, color: c }}>{status}</span>;
}
const csvBtn: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700 };
const openBtn: React.CSSProperties = { display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', border: '1px solid var(--primary)' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right' };
