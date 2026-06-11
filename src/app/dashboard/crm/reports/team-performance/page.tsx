'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { TeamPerformanceRow } from '../../../../../types/crm';

/**
 * Team Performance — comprehensive per-rep KPI roll-up across the
 * caller's hierarchy subtree. Now carries 20+ metrics so a manager
 * can audit funnel quality, sales velocity, and operational hygiene
 * from a single screen.
 *
 * Columns are grouped under three sticky section headers:
 *   1. Lead Funnel        (lead activity over today/week/month/period)
 *   2. Deal Performance   (win/loss/pipeline/cycle)
 *   3. Operational Health (ageing, oldest open, activity count, score)
 *
 * The Total row is sticky at the top so a manager always sees the
 * bottom line before scrolling per-rep detail.
 */

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const past = new Date(today);
  past.setDate(today.getDate() - 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(past), to: iso(today) };
}

export default function TeamPerformancePage() {
  const [range, setRange] = useState(defaultRange);
  const [total, setTotal] = useState<TeamPerformanceRow | null>(null);
  const [rows, setRows] = useState<TeamPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    crmAnalytics.teamPerformance(range)
      .then((r) => {
        if (cancelled) return;
        setTotal(r.data?.total ?? null);
        setRows(r.data?.rows ?? []);
      })
      .catch((e: any) => toast.error(e?.message || 'Failed to load team performance'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Header range={range} onChange={setRange} />
      <KpiStrip total={total} loading={loading} />
      <TableCard title="Team Wise — Detailed">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1700 }}>
            <thead>
              {/* Top header row — section grouping (Lead Funnel / Deals / Ops) */}
              <tr style={{ background: 'var(--s1)' }}>
                <Th rowSpan={2} sticky>Rep</Th>
                <Th colSpan={8} group="#3E9EFF">Lead Funnel</Th>
                <Th colSpan={8} group="#10B981">Deal Performance</Th>
                <Th colSpan={5} group="#F59E0B">Operational Health</Th>
              </tr>
              <tr style={{ background: 'var(--s2)' }}>
                <Th align="right">Total Leads</Th>
                <Th align="right">New Today</Th>
                <Th align="right">New This Week</Th>
                <Th align="right">New This Month</Th>
                <Th align="right">New In Range</Th>
                <Th align="right">Qualified</Th>
                <Th align="right">Converted</Th>
                <Th align="right">Lost</Th>

                <Th align="right">Won Count</Th>
                <Th align="right">Won Value</Th>
                <Th align="right">Lost Count</Th>
                <Th align="right">Open</Th>
                <Th align="right">Pipeline Value</Th>
                <Th align="right">Conversion</Th>
                <Th align="right">Avg Deal Size</Th>
                <Th align="right">Sales Cycle (d)</Th>

                <Th align="right">Avg Ageing (d)</Th>
                <Th align="right">Oldest Open (d)</Th>
                <Th align="right">Activities Done</Th>
                <Th align="right">Last Activity</Th>
                <Th align="right">Avg Lead Score</Th>
              </tr>
            </thead>
            <tbody>
              {total && <Row r={total} sticky />}
              {loading && rows.length === 0 && (
                <tr><Td colSpan={22} center dim>Loading…</Td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><Td colSpan={22} center dim>No team data for the selected window.</Td></tr>
              )}
              {rows.map((r) => <Row key={r.user_id ?? r.name} r={r} />)}
            </tbody>
          </table>
        </div>
      </TableCard>
    </div>
  );
}

// ── Header + range filter ──────────────────────────────────────────

function Header({ range, onChange }: { range: { from: string; to: string }; onChange: (r: { from: string; to: string }) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <Link href="/dashboard/crm/reports" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none' }}>← All reports</Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '6px 0 4px' }}>Team Performance</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          Per-rep KPI roll-up across your hierarchy subtree.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <DateInput label="From" value={range.from} onChange={(v) => onChange({ ...range, from: v })} />
        <DateInput label="To"   value={range.to}   onChange={(v) => onChange({ ...range, to: v })} />
      </div>
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13 }} />
    </label>
  );
}

// ── KPI strip ──────────────────────────────────────────────────────

function KpiStrip({ total, loading }: { total: TeamPerformanceRow | null; loading: boolean }) {
  const items = useMemo(() => [
    { label: 'Won Value',          value: total ? fmtNum(total.won_value) : '—',                accent: '#3E9EFF' },
    { label: 'Pipeline Value',     value: total ? fmtNum(total.open_pipeline_value) : '—',     accent: '#10B981' },
    { label: 'Conversion Rate',    value: total ? fmtPercent(total.conversion_rate) : '—',     accent: '#F59E0B' },
    { label: 'Avg Sales Cycle',    value: total ? `${total.avg_sales_cycle_days.toFixed(0)}d` : '—', accent: '#06B6D4' },
    { label: 'Avg Lead Ageing',    value: total ? `${total.avg_ageing_days.toFixed(0)}d` : '—',  accent: '#EF4444' },
    { label: 'New Leads (range)',  value: total ? String(total.new_leads_period) : '—',         accent: '#A855F7' },
    { label: 'Activities Done',    value: total ? String(total.activities_completed_period) : '—', accent: '#EC4899' },
    { label: 'Avg Lead Score',     value: total ? total.avg_lead_score.toFixed(0) : '—',         accent: '#8B5CF6' },
  ], [total]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
      {items.map((k) => (
        <div key={k.label} style={{
          background: 'var(--s2)', border: '1px solid var(--border)', borderLeft: `3px solid ${k.accent}`,
          borderRadius: 12, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {k.label}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{loading ? '—' : k.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Table atoms ────────────────────────────────────────────────────

function TableCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', background: '#1e88e5', color: '#fff', fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 13 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ r, sticky }: { r: TeamPerformanceRow; sticky?: boolean }) {
  const ageingTone = r.avg_ageing_days >= 60 ? '#ef4444' : r.avg_ageing_days >= 30 ? '#f59e0b' : '#10b981';
  const conversionTone = r.conversion_rate >= 0.25 ? '#10b981' : r.conversion_rate >= 0.10 ? '#f59e0b' : '#ef4444';
  const bg = sticky ? 'var(--s1)' : 'transparent';
  const weight = sticky ? 800 : 600;
  return (
    <tr style={{ background: bg, fontWeight: weight }}>
      <Td sticky bold>{r.name}</Td>
      <Td align="right">{r.total_leads_owned}</Td>
      <Td align="right">{r.new_leads_today}</Td>
      <Td align="right">{r.new_leads_week}</Td>
      <Td align="right">{r.new_leads_month}</Td>
      <Td align="right">{r.new_leads_period}</Td>
      <Td align="right">{r.qualified_count}</Td>
      <Td align="right" tone="#10b981">{r.converted_count}</Td>
      <Td align="right" tone="#ef4444">{r.lost_leads_count}</Td>

      <Td align="right">{r.won_count}</Td>
      <Td align="right" bold>{fmtNum(r.won_value)}</Td>
      <Td align="right">{r.lost_count}</Td>
      <Td align="right">{r.open_count}</Td>
      <Td align="right">{fmtNum(r.open_pipeline_value)}</Td>
      <Td align="right" tone={conversionTone} bold>{fmtPercent(r.conversion_rate)}</Td>
      <Td align="right">{fmtNum(r.avg_deal_size)}</Td>
      <Td align="right">{r.avg_sales_cycle_days > 0 ? r.avg_sales_cycle_days.toFixed(0) : '—'}</Td>

      <Td align="right" tone={ageingTone} bold>{r.avg_ageing_days.toFixed(0)}</Td>
      <Td align="right">{r.oldest_open_lead_days.toFixed(0)}</Td>
      <Td align="right">{r.activities_completed_period}/{r.activities_total_period}</Td>
      <Td align="right" dim>{fmtRelative(r.last_activity_at)}</Td>
      <Td align="right">{r.avg_lead_score > 0 ? r.avg_lead_score.toFixed(0) : '—'}</Td>
    </tr>
  );
}

function Th({ children, align, sticky, rowSpan, colSpan, group }: {
  children: React.ReactNode;
  align?: 'right'; sticky?: boolean;
  rowSpan?: number; colSpan?: number;
  group?: string;
}) {
  return (
    <th rowSpan={rowSpan} colSpan={colSpan} style={{
      padding: '10px 14px', fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
      textTransform: 'uppercase', textAlign: align ?? (group ? 'center' : 'left'),
      borderBottom: '1px solid var(--border)',
      borderRight: '1px solid var(--border)',
      color: group ? '#fff' : 'var(--text-dim)',
      background: group ?? undefined,
      position: sticky ? 'sticky' : undefined,
      left: sticky ? 0 : undefined,
      zIndex: sticky ? 2 : undefined,
      whiteSpace: 'nowrap',
    }}>{children}</th>
  );
}

function Td({ children, align, sticky, bold, tone, dim, center, colSpan }: {
  children: React.ReactNode;
  align?: 'right'; sticky?: boolean; bold?: boolean;
  tone?: string; dim?: boolean; center?: boolean;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} style={{
      padding: '11px 14px', fontSize: 13,
      color: tone ?? (dim ? 'var(--text-dim)' : 'var(--text)'),
      fontWeight: bold ? 700 : undefined,
      textAlign: center ? 'center' : (align ?? 'left'),
      borderBottom: '1px solid var(--border)',
      borderRight: '1px solid var(--border)',
      position: sticky ? 'sticky' : undefined,
      left: sticky ? 0 : undefined,
      background: sticky ? 'var(--s2)' : undefined,
      zIndex: sticky ? 1 : undefined,
      whiteSpace: 'nowrap',
      fontFamily: align === 'right' ? 'ui-monospace, monospace' : undefined,
    }}>{children}</td>
  );
}

// ── Formatters ─────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1_00_000)    return `${(n / 1_00_000).toFixed(2)}L`;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function fmtPercent(r: number): string {
  if (!Number.isFinite(r)) return '—';
  return `${(r * 100).toFixed(1)}%`;
}
function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  const days = Math.round(mins / 1440);
  return `${days}d ago`;
}
