'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmDeals, crmLeads, crmTargets } from '../../../../../../lib/crmApi';
import api from '../../../../../../lib/api';
import type { Deal, Lead } from '../../../../../../types/crm';
import { useReportCityKey } from '../../../../../../components/crm/reports/ReportFilters';

// Per-salesperson drill-down (Stage 1). Management clicks a rep on the Rep
// Leaderboard / Team Performance and lands here: their won-deal sales summary,
// their monthly sales target vs achieved (from the existing rupee board), and
// every lead assigned to them with status — each lead links to its detail page
// where the Timeline tab shows the full follow-up history. No new backend: uses
// crmDeals.list, crmTargets.rupeeLeaderboard and crmLeads.list(owner_id).
interface SalesSummary {
  won: number; lost: number; open: number; revenue: number; avg_deal: number; win_rate: number;
}
interface TargetInfo { target: number | null; achieved: number; pct: number | null }

export default function SalespersonPage() {
  const params = useParams<{ userId: string }>();
  const userId = Array.isArray(params?.userId) ? params.userId[0] : (params?.userId ?? '');
  const cityKey = useReportCityKey();

  const [name, setName] = useState('Salesperson');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [target, setTarget] = useState<TargetInfo | null | 'none'>(null); // null = loading, 'none' = no target
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Names + sales summary + leads in parallel; each failure is contained so
      // one empty source never blanks the whole page.
      const [usersR, dealsR, leadsR] = await Promise.allSettled([
        api.getUsers({ limit: '500' }) as Promise<any>,
        crmDeals.list({ limit: 1000 }),
        crmLeads.list({ owner_id: userId, limit: 200 }),
      ]);
      if (cancelled) return;

      if (usersR.status === 'fulfilled') {
        const users: Array<{ id: string; name?: string; full_name?: string; email?: string }> =
          usersR.value?.data || usersR.value || [];
        const u = users.find((x) => x.id === userId);
        if (u) setName(u.name || u.full_name || u.email || 'Salesperson');
      }

      if (dealsR.status === 'fulfilled') {
        const deals: Deal[] = (dealsR.value?.data || []).filter((d: any) => (d.owner_id || '') === userId);
        const s: SalesSummary = { won: 0, lost: 0, open: 0, revenue: 0, avg_deal: 0, win_rate: 0 };
        for (const d of deals) {
          const status = (d as any).status;
          if (status === 'won') { s.won++; s.revenue += Number((d as any).amount || 0); }
          else if (status === 'lost') s.lost++;
          else s.open++;
        }
        s.avg_deal = s.won > 0 ? s.revenue / s.won : 0;
        const denom = s.won + s.lost;
        s.win_rate = denom > 0 ? (s.won / denom) * 100 : 0;
        setSummary(s);
      } else { setSummary({ won: 0, lost: 0, open: 0, revenue: 0, avg_deal: 0, win_rate: 0 }); }

      if (leadsR.status === 'fulfilled') setLeads(leadsR.value?.data || []);
      else { setLeads([]); toast.error('Could not load leads'); }

      // Target board is separate + optional (feature off for many clients) — never fail the page on it.
      try {
        const board = await crmTargets.rupeeLeaderboard('sales');
        if (cancelled) return;
        const row = (board?.data?.entries || []).find((e) => e.user_id === userId);
        setTarget(row ? { target: row.target, achieved: row.achieved, pct: row.pct } : 'none');
      } catch { if (!cancelled) setTarget('none'); }

      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, cityKey]);

  const shownLeads = useMemo(
    () => (statusFilter ? leads.filter((l) => l.status === statusFilter) : leads),
    [leads, statusFilter],
  );
  const leadStatuses = useMemo(
    () => Array.from(new Set(leads.map((l) => l.status).filter(Boolean))) as string[],
    [leads],
  );

  const pending = target && target !== 'none' && target.target != null
    ? Math.max(0, target.target - target.achieved) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/dashboard/crm/reports/rep-leaderboard" style={{ color: 'var(--text-dim)', fontSize: 13, textDecoration: 'none' }}>← Rep Leaderboard</Link>
        <h2 style={{ color: 'var(--text)', margin: 0, fontSize: 20 }}>{name}</h2>
        <Link href={`/dashboard/crm/leads?owner=${encodeURIComponent(userId)}`} style={{ marginLeft: 'auto', color: 'var(--accent, #6366f1)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          View in Leads →
        </Link>
      </div>

      {/* Sales summary — won deals */}
      <section style={card}>
        <h3 style={h3}>Sales (won deals)</h3>
        {loading && !summary ? <Muted>Loading…</Muted> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Kpi label="Revenue" value={inr(summary?.revenue || 0)} strong />
            <Kpi label="Deals Won" value={summary?.won ?? 0} />
            <Kpi label="Open Pipeline" value={summary?.open ?? 0} />
            <Kpi label="Avg Deal" value={summary?.avg_deal ? inr(summary.avg_deal) : '—'} />
            <Kpi label="Win Rate" value={`${(summary?.win_rate ?? 0).toFixed(1)}%`} />
          </div>
        )}
      </section>

      {/* Target vs actual — current month, from the rupee board */}
      <section style={card}>
        <h3 style={h3}>Monthly sales target</h3>
        {target === null ? <Muted>Loading…</Muted>
          : target === 'none' ? <Muted>No sales target set for this salesperson.</Muted>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Kpi label="Target" value={target.target != null ? inr(target.target) : '—'} />
              <Kpi label="Achieved" value={inr(target.achieved)} strong />
              <Kpi label="Pending" value={pending != null ? inr(pending) : '—'} />
              <Kpi label="Progress" value={target.pct != null ? `${target.pct.toFixed(0)}%` : '—'} />
            </div>
          )}
      </section>

      {/* Leads assigned to this salesperson */}
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <h3 style={{ ...h3, marginBottom: 0 }}>Leads ({shownLeads.length})</h3>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={sel}>
            <option value="">All statuses</option>
            {leadStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {loading && leads.length === 0 ? <Muted>Loading…</Muted>
          : shownLeads.length === 0 ? <Muted>No leads assigned.</Muted>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={th}>Lead</th>
                    <th style={th}>Company</th>
                    <th style={th}>Status</th>
                    <th style={th}>Source</th>
                    <th style={thNum}>Score</th>
                    <th style={thNum}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {shownLeads.map((l) => (
                    <tr key={l.id}>
                      <td style={td}>
                        <Link href={`/dashboard/crm/leads/${l.id}`} style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'none' }}>
                          {[l.first_name, l.last_name].filter(Boolean).join(' ') || (l as any).company || 'Lead'}
                        </Link>
                      </td>
                      <td style={{ ...td, color: 'var(--text-dim)' }}>{(l as any).company || '—'}</td>
                      <td style={td}><StatusPill status={l.status} /></td>
                      <td style={{ ...td, color: 'var(--text-dim)' }}>{(l as any).source_name || '—'}</td>
                      <td style={tdNum}>{(l as any).score ?? '—'}</td>
                      <td style={{ ...tdNum, color: 'var(--text-dim)' }}>{fmtDate((l as any).updated_at || (l as any).created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: strong ? 20 : 18, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = status === 'converted' ? '#10b981' : status === 'lost' || status === 'unqualified' ? '#ef4444'
    : status === 'qualified' ? '#6366f1' : status === 'working' ? '#f59e0b' : 'var(--text-dim)';
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: tone, border: `1px solid ${tone}`, textTransform: 'capitalize' }}>
      {status || '—'}
    </span>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 8 }}>{children}</div>;
}

function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

function inr(n: number): string {
  if (!n) return '₹0';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 };
const h3: React.CSSProperties = { color: 'var(--text)', margin: '0 0 12px' };
const sel: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right' };
