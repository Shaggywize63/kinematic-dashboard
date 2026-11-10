'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { TeamPerformanceRow } from '../../../../../types/crm';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { useTableSort, SortLabel } from '../../../../../lib/tableSort';
import { downloadCsv } from '../../../../../lib/exportCsv';
import { fmtChange, changeTone } from '../../../../../lib/crm/plusFormat';

// The report API now also returns follow-through and previous-period columns.
// They are optional so an older backend (or demo data without them) still renders.
type Extras = {
  lost_value: number; weighted_pipeline_value: number; overdue_followups: number; untouched_open_leads: number; idle_leads_14d: number;
  calls_period: number; meetings_period: number;
  new_leads_prev_period: number | null; won_count_prev_period: number | null; won_value_prev_period: number | null;
};
type PerfRow = TeamPerformanceRow & Partial<Extras>;

// Raw underlying value per sortable column — sort keys match the row field
// names, so this passthrough yields numbers as numbers and the last-activity
// ISO string for chronological sorting. The two "vs previous" columns sort by
// the change between the period and the one before it.
const teamVal = (r: PerfRow, key: string): unknown => {
  if (key === 'new_leads_change') return changeValue(r.new_leads_period, r.new_leads_prev_period);
  if (key === 'won_value_change') return changeValue(r.won_value, r.won_value_prev_period);
  return (r as unknown as Record<string, unknown>)[key];
};
function changeValue(cur: number, prev: number | null | undefined): number | null {
  if (prev === null || prev === undefined) return null;
  return prev === 0 ? (cur === 0 ? 0 : null) : (cur - prev) / Math.abs(prev);
}

/** Follow-through & trend columns: one definition drives the header, the cell and the CSV. */
const EXTRA_COLS: Array<{ key: string; label: string; csv: (r: PerfRow) => string | number | null; cell: (r: PerfRow) => React.ReactNode; tone?: (r: PerfRow) => string | undefined }> = [
  { key: 'overdue_followups', label: 'Overdue Follow-ups', csv: (r) => r.overdue_followups ?? null, cell: (r) => r.overdue_followups ?? '—', tone: (r) => ((r.overdue_followups ?? 0) > 0 ? '#ef4444' : undefined) },
  { key: 'untouched_open_leads', label: 'Untouched Open Leads', csv: (r) => r.untouched_open_leads ?? null, cell: (r) => r.untouched_open_leads ?? '—' },
  { key: 'idle_leads_14d', label: 'Idle 14d+ Leads', csv: (r) => r.idle_leads_14d ?? null, cell: (r) => r.idle_leads_14d ?? '—' },
  { key: 'calls_period', label: 'Calls (range)', csv: (r) => r.calls_period ?? null, cell: (r) => r.calls_period ?? '—' },
  { key: 'meetings_period', label: 'Meetings (range)', csv: (r) => r.meetings_period ?? null, cell: (r) => r.meetings_period ?? '—' },
  { key: 'lost_value', label: 'Lost Value', csv: (r) => r.lost_value ?? null, cell: (r) => (r.lost_value === undefined ? '—' : fmtNum(r.lost_value)) },
  { key: 'weighted_pipeline_value', label: 'Weighted Pipeline', csv: (r) => r.weighted_pipeline_value ?? null, cell: (r) => (r.weighted_pipeline_value === undefined ? '—' : fmtNum(r.weighted_pipeline_value)) },
  { key: 'new_leads_change', label: 'New Leads vs Prev Period', csv: (r) => r.new_leads_prev_period ?? null, cell: (r) => fmtChange(r.new_leads_period, r.new_leads_prev_period), tone: (r) => toneColor(changeTone(r.new_leads_period, r.new_leads_prev_period)) },
  { key: 'won_value_change', label: 'Won Value vs Prev Period', csv: (r) => r.won_value_prev_period ?? null, cell: (r) => fmtChange(r.won_value, r.won_value_prev_period), tone: (r) => toneColor(changeTone(r.won_value, r.won_value_prev_period)) },
];
/** Whole-percent change vs the previous period for the CSV (a number, blank when there is nothing to compare). */
function pctChange(cur: number, prev: number | null | undefined): number | string {
  const v = changeValue(cur, prev);
  return v === null ? '' : Math.round(v * 1000) / 10;
}
const toneColor = (t: 'good' | 'bad' | 'flat') => (t === 'good' ? '#10b981' : t === 'bad' ? '#ef4444' : undefined);
const COLSPAN = 22 + EXTRA_COLS.length;

/** CSV: every column on screen, raw numbers; the two "vs previous" columns export the previous-period value they compare against. */
function csvRows(rows: PerfRow[]): Array<Record<string, string | number>> {
  return rows.map((r) => {
    const o: Record<string, string | number> = {
      Rep: r.name, 'Total Leads': r.total_leads_owned, 'New Today': r.new_leads_today, 'New This Week': r.new_leads_week, 'New This Month': r.new_leads_month,
      'New In Range': r.new_leads_period, Qualified: r.qualified_count, Converted: r.converted_count, Lost: r.lost_leads_count,
      'Won Count': r.won_count, 'Won Value (INR)': r.won_value, 'Lost Count': r.lost_count, Open: r.open_count, 'Pipeline Value (INR)': r.open_pipeline_value,
      'Conversion %': Math.round(r.conversion_rate * 1000) / 10, 'Avg Deal Size (INR)': Math.round(r.avg_deal_size), 'Sales Cycle (d)': Math.round(r.avg_sales_cycle_days),
      'Avg Ageing (d)': Math.round(r.avg_ageing_days), 'Oldest Open (d)': Math.round(r.oldest_open_lead_days),
      'Activities Done': r.activities_completed_period, 'Activities Total': r.activities_total_period,
      'Last Activity': r.last_activity_at ?? '', 'Avg Lead Score': Math.round(r.avg_lead_score),
    };
    for (const c of EXTRA_COLS) {
      if (c.key === 'new_leads_change') {
        o['New Leads Prev Period'] = r.new_leads_prev_period ?? '';
        o['New Leads vs Prev Period (%)'] = pctChange(r.new_leads_period, r.new_leads_prev_period);
      } else if (c.key === 'won_value_change') {
        o['Won Value Prev Period (INR)'] = r.won_value_prev_period ?? '';
        o['Won Value vs Prev Period (%)'] = pctChange(r.won_value, r.won_value_prev_period);
      } else {
        o[c.label] = c.csv(r) ?? '';
      }
    }
    return o;
  });
}

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
  const [total, setTotal] = useState<PerfRow | null>(null);
  const [rows, setRows] = useState<PerfRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Subscribe to the global city picker so changing it triggers a
  // refetch — api.ts already appends `?city=` to the request, but
  // without this key in the dep array the old payload would linger.
  const cityKey = useReportCityKey();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    crmAnalytics.teamPerformance(range)
      .then((r) => {
        if (cancelled) return;
        // The /analytics/team-performance endpoint returns the payload
        // directly (no `{ success, data }` envelope), so we read top-level.
        const payload = (r as unknown as { total?: TeamPerformanceRow; rows?: TeamPerformanceRow[]; data?: { total?: TeamPerformanceRow; rows?: TeamPerformanceRow[] } });
        const tot = payload.total ?? payload.data?.total ?? null;
        const rs  = payload.rows  ?? payload.data?.rows  ?? [];
        setTotal(tot);
        setRows(rs);
      })
      .catch((e: any) => toast.error(e?.message || 'Failed to load team performance'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to, cityKey]);

  // Client-side column sorting for the per-rep rows. The pinned Total row is
  // rendered separately and stays out of the sorted set. No active column by
  // default, so the backend order is preserved.
  const { sorted, sort, toggle } = useTableSort<PerfRow>(rows, teamVal);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Header range={range} onChange={setRange} canExport={!loading && rows.length > 0} onExport={() => downloadCsv('team-performance', csvRows(total ? [...sorted, total] : sorted))} />
      <KpiStrip total={total} loading={loading} />
      <TableCard title="Team Wise — Detailed">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1700 + EXTRA_COLS.length * 130 }}>
            <thead>
              {/* Top header row — section grouping (Lead Funnel / Deals / Ops) */}
              <tr style={{ background: 'var(--s1)' }}>
                <Th rowSpan={2} sticky><SortLabel label="Rep" sortKey="name" sort={sort} onToggle={toggle} /></Th>
                <Th colSpan={8} group="#3E9EFF">Lead Funnel</Th>
                <Th colSpan={8} group="#10B981">Deal Performance</Th>
                <Th colSpan={5} group="#F59E0B">Operational Health</Th>
                <Th colSpan={EXTRA_COLS.length} group="#EC4899">Follow-through &amp; Trend</Th>
              </tr>
              <tr style={{ background: 'var(--s2)' }}>
                <Th align="right"><SortLabel label="Total Leads" sortKey="total_leads_owned" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="New Today" sortKey="new_leads_today" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="New This Week" sortKey="new_leads_week" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="New This Month" sortKey="new_leads_month" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="New In Range" sortKey="new_leads_period" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Qualified" sortKey="qualified_count" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Converted" sortKey="converted_count" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Lost" sortKey="lost_leads_count" sort={sort} onToggle={toggle} align="right" /></Th>

                <Th align="right"><SortLabel label="Won Count" sortKey="won_count" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Won Value" sortKey="won_value" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Lost Count" sortKey="lost_count" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Open" sortKey="open_count" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Pipeline Value" sortKey="open_pipeline_value" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Conversion" sortKey="conversion_rate" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Avg Deal Size" sortKey="avg_deal_size" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Sales Cycle (d)" sortKey="avg_sales_cycle_days" sort={sort} onToggle={toggle} align="right" /></Th>

                <Th align="right"><SortLabel label="Avg Ageing (d)" sortKey="avg_ageing_days" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Oldest Open (d)" sortKey="oldest_open_lead_days" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Activities Done" sortKey="activities_completed_period" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Last Activity" sortKey="last_activity_at" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Avg Lead Score" sortKey="avg_lead_score" sort={sort} onToggle={toggle} align="right" /></Th>

                {EXTRA_COLS.map((c) => (
                  <Th key={c.key} align="right"><SortLabel label={c.label} sortKey={c.key} sort={sort} onToggle={toggle} align="right" /></Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {total && <Row r={total} sticky />}
              {loading && rows.length === 0 && (
                <tr><Td colSpan={COLSPAN} center dim>Loading…</Td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><Td colSpan={COLSPAN} center dim>No team data for the selected window.</Td></tr>
              )}
              {sorted.map((r) => <Row key={r.user_id ?? r.name} r={r} />)}
            </tbody>
          </table>
        </div>
      </TableCard>
    </div>
  );
}

// ── Header + range filter ──────────────────────────────────────────

function Header({ range, onChange, canExport, onExport }: { range: { from: string; to: string }; onChange: (r: { from: string; to: string }) => void; canExport: boolean; onExport: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <Link href="/dashboard/crm/reports" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none' }}>← All reports</Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '6px 0 4px' }}>Team Performance</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          Per-rep KPI roll-up across your hierarchy subtree.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <DateInput label="From" value={range.from} onChange={(v) => onChange({ ...range, from: v })} />
        <DateInput label="To"   value={range.to}   onChange={(v) => onChange({ ...range, to: v })} />
        <button onClick={onExport} disabled={!canExport} aria-label="Download CSV"
          style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: canExport ? 'pointer' : 'not-allowed', fontWeight: 700, height: 36, opacity: canExport ? 1 : 0.55 }}>⬇ CSV</button>
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

function KpiStrip({ total, loading }: { total: PerfRow | null; loading: boolean }) {
  const items = useMemo(() => [
    { label: 'Won Value',          value: total ? fmtNum(total.won_value) : '—',                accent: '#3E9EFF' },
    { label: 'Pipeline Value',     value: total ? fmtNum(total.open_pipeline_value) : '—',     accent: '#10B981' },
    { label: 'Conversion Rate',    value: total ? fmtPercent(total.conversion_rate) : '—',     accent: '#F59E0B' },
    { label: 'Avg Sales Cycle',    value: total ? `${total.avg_sales_cycle_days.toFixed(0)}d` : '—', accent: '#06B6D4' },
    { label: 'Avg Lead Ageing',    value: total ? `${total.avg_ageing_days.toFixed(0)}d` : '—',  accent: '#EF4444' },
    { label: 'New Leads (range)',  value: total ? String(total.new_leads_period) : '—',         accent: '#A855F7' },
    { label: 'Activities Done',    value: total ? String(total.activities_completed_period) : '—', accent: '#EC4899' },
    { label: 'Avg Lead Score',     value: total ? total.avg_lead_score.toFixed(0) : '—',         accent: '#8B5CF6' },
    { label: 'Weighted Pipeline',  value: total && total.weighted_pipeline_value !== undefined ? fmtNum(total.weighted_pipeline_value) : '—', accent: '#14B8A6' },
    { label: 'Overdue Follow-ups', value: total && total.overdue_followups !== undefined ? String(total.overdue_followups) : '—', accent: '#F43F5E' },
    { label: 'Won Value vs Prev',  value: total ? fmtChange(total.won_value, total.won_value_prev_period) : '—', accent: '#22C55E' },
  ], [total]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
      {items.map((k) => (
        <div key={k.label} data-testid="tp-kpi" style={{
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

function Row({ r, sticky }: { r: PerfRow; sticky?: boolean }) {
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

      {EXTRA_COLS.map((c) => <Td key={c.key} align="right" tone={c.tone?.(r)}>{c.cell(r)}</Td>)}
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
