'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { crmLeads, crmSettings } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { Lead } from '../../../../../types/crm';
import { resolveStages, type StageDef } from '../../../../../lib/leadStages';
import { downloadCsv } from '../../../../../lib/exportCsv';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { useTableSort, SortLabel } from '../../../../../lib/tableSort';
import { useLeadFieldGate } from '../../../../../lib/crm/useLeadFieldGate';

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
  // Additive columns (also exported to CSV)
  days_since_touch: number | null;
  never_touched: boolean;
  created_on: string;
}

// Raw underlying value per sortable column (numbers stay numeric).
const agingVal = (l: LeadRow, key: string): unknown => {
  switch (key) {
    case 'name': return l.name;
    case 'owner_name': return l.owner_name;
    case 'status': return l.status;
    case 'score': return l.score;
    case 'days_old': return l.days_old;
    case 'days_since_touch': return l.days_since_touch;
    case 'created_on': return l.created_on;
    case 'source': return l.source;
    default: return l[key];
  }
};

export default function LeadAgingPage() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState<number>(7);
  // The leads list is fetched 1,000 at a time: say so when the page may be looking at part of the book.
  const [truncated, setTruncated] = useState(false);
  const cityKey = useReportCityKey();
  // Source is a built-in lead field: wait for the admin's settings, and drop the column when it is hidden.
  const gate = useLeadFieldGate();
  const sourceHidden = gate.didLoad && gate.isHidden('source_id');
  // The client's own lead pipeline stages (Settings → Lead Stages). "Open" here
  // means a stage of kind `open` — so a custom-stage tenant's own open stages
  // age correctly. Null `openStages` keeps the built-in behaviour (OPEN_STATUSES
  // + the fixed per-status KPIs) for tenants that saved no custom set.
  const [stages, setStages] = useState<{ stages: StageDef[]; custom: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    crmSettings.get().then((r) => { if (!cancelled) setStages(resolveStages(r.data)); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const openStages = stages?.custom ? stages.stages.filter((s) => s.kind === 'open') : null;
  const stageColor = (status: string): string | undefined => stages?.custom ? stages.stages.find((s) => s.value === status)?.color : undefined;
  const openLabel = openStages ? openStages.map((s) => s.label).join(' / ') : 'new / working / nurturing / qualified';

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
        setTruncated(leads.length >= 1000);
        const users: Array<{ id: string; name?: string; full_name?: string; email?: string }> =
          usersRes.data || usersRes || [];
        const nameById = new Map<string, string>();
        for (const u of users) nameById.set(u.id, u.name || u.full_name || u.email || 'User');

        // Custom-stage tenants age their own open stages; everyone else keeps
        // the built-in open set.
        const openStatuses = stages?.custom ? stages.stages.filter((s) => s.kind === 'open').map((s) => s.value) : OPEN_STATUSES;
        const now = Date.now();
        const out: LeadRow[] = [];
        for (const l of leads) {
          const status = ((l as any).status as string) || '';
          if (!openStatuses.includes(status)) continue;
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
            source: (l as any).source_name || (l as any).source || '—',
            days_old: days,
            days_since_touch: (l as any).last_activity_at ? Math.floor((now - new Date((l as any).last_activity_at).getTime()) / 86_400_000) : null,
            never_touched: !(l as any).last_activity_at,
            created_on: String((l as any).created_at || '').slice(0, 10),
          });
        }
        out.sort((a, b) => b.days_old - a.days_old);
        setRows(out);
      } catch (e: any) { toast.error(e.message || 'Load failed'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, cityKey, stages]);

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
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Open leads ({openLabel}) that have been stuck for {threshold}+ days.</div>
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
          <button onClick={() => downloadCsv(`lead-aging-${threshold}d`, sourceHidden || !gate.didLoad ? rows.map(({ source: _s, ...rest }) => rest) : rows)} disabled={loading || rows.length === 0} style={csvBtn}>⬇ CSV</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Kpi label="Aged leads" value={rows.length} />
        {openStages ? (
          openStages.map((s) => <Kpi key={s.value} label={s.label} value={byStatus.get(s.value) || 0} />)
        ) : (
          <>
            <Kpi label="New" value={byStatus.get('new') || 0} />
            <Kpi label="Working" value={byStatus.get('working') || 0} />
            <Kpi label="Nurturing" value={byStatus.get('nurturing') || 0} />
            <Kpi label="Qualified" value={byStatus.get('qualified') || 0} />
          </>
        )}
        <Kpi label="Never touched" value={rows.filter((r) => r.never_touched).length} />
        <Kpi label="Avg days old" value={rows.length ? `${Math.round(rows.reduce((s, r) => s + r.days_old, 0) / rows.length)}d` : '—'} />
      </div>
      {truncated && (
        <div role="status" style={{ fontSize: 12, color: '#b45309', background: 'rgba(245,158,11,0.12)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          Showing the first 1,000 leads only, so this list may be partial. Narrow the city filter for a complete view.
        </div>
      )}

      {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div> : rows.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 12 }}>No open leads older than {threshold} days. Reps are on top of it.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 780 }}>
            <thead>
              <tr>
                <th style={th}><SortLabel label="Lead" sortKey="name" sort={sort} onToggle={toggle} /></th>
                <th style={th}><SortLabel label="Owner" sortKey="owner_name" sort={sort} onToggle={toggle} /></th>
                <th style={th}><SortLabel label="Status" sortKey="status" sort={sort} onToggle={toggle} /></th>
                <th style={thNum}><SortLabel label="Score" sortKey="score" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Days Old" sortKey="days_old" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Last Touch" sortKey="days_since_touch" sort={sort} onToggle={toggle} align="right" /></th>
                <th style={thNum}><SortLabel label="Created" sortKey="created_on" sort={sort} onToggle={toggle} align="right" /></th>
                {gate.didLoad && !sourceHidden && <th style={th}><SortLabel label={gate.labelFor('source_id', 'Source')} sortKey="source" sort={sort} onToggle={toggle} /></th>}
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l) => (
                <tr key={l.id}>
                  <td style={td}><Link href={`/dashboard/crm/leads/${l.id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>{l.name}</Link></td>
                  <td style={td}>{l.owner_name}</td>
                  <td style={td}><StatusBadge status={l.status} color={stageColor(l.status)} /></td>
                  <td style={tdNum}>{l.score || '—'}</td>
                  <td style={{ ...tdNum, color: l.days_old > 30 ? '#ef4444' : 'var(--text)', fontWeight: 700 }}>{l.days_old}d</td>
                  <td style={tdNum}>{l.never_touched ? 'Never' : l.days_since_touch === 0 ? 'Today' : `${l.days_since_touch}d ago`}</td>
                  <td style={tdNum}>{l.created_on || '—'}</td>
                  {gate.didLoad && !sourceHidden && <td style={td}>{l.source}</td>}
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
function StatusBadge({ status, color }: { status: string; color?: string }) {
  const colors: Record<string, string> = {
    new: '#6366f1', working: '#f59e0b', nurturing: '#06b6d4', qualified: '#10b981',
  };
  const c = color || colors[status] || '#888';
  return <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4, background: `${c}22`, color: c }}>{status}</span>;
}
const csvBtn: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700 };
const openBtn: React.CSSProperties = { display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', border: '1px solid var(--primary)' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right' };
