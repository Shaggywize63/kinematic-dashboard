'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { LeadTrackerPayload, LeadTrackerBucket } from '../../../../../types/crm';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { useLeadFieldGate } from '../../../../../lib/crm/useLeadFieldGate';
import { downloadCsv } from '../../../../../lib/exportCsv';
import { fmtChange, changeTone, monthLabel } from '../../../../../lib/crm/plusFormat';

// The API now also returns monthly conversion, like-for-like previous periods and
// per-source conversion. Optional, so an older backend or demo data still renders.
type PeriodSummary = { label: string; from: string; to: string; new_leads: number; converted: number; conversion_rate: number };
type TrackerPlus = LeadTrackerPayload & {
  monthly_detail?: Array<{ key: string; new_leads: number; converted: number; conversion_rate: number }>;
  previous_today?: PeriodSummary; previous_week?: PeriodSummary; previous_month?: PeriodSummary;
  source_detail?: Array<{ name: string; count: number; converted: number; conversion_rate: number }>;
};

/**
 * Lead Tracker — rich rollup of the lead funnel across the caller's
 * hierarchy subtree.
 *
 * Sections:
 *   1. Three KPI cards — Today / This week / This month, each carrying
 *      new + converted + conversion rate.
 *   2. Monthly bar chart (last N months).
 *   3. Weekly + Daily sparklines (last 12 weeks, 30 days).
 *   4. Status mix donut (new / working / qualified / converted /
 *      unqualified / lost).
 *   5. Source + City top-5 breakdowns (City is a built-in lead field: hidden
 *      when the admin hides it; Source shows how many of its leads converted).
 *   6. Open-lead ageing distribution (0-7d / 8-30d / 31-90d / 90+d).
 *   7. Period cards compare with the same point one period earlier; monthly
 *      conversion table; one CSV with every block above.
 */

export default function LeadTrackerPage() {
  const [months, setMonths] = useState(6);
  const [data, setData] = useState<TrackerPlus | null>(null);
  const gate = useLeadFieldGate();
  const cityHidden = gate.didLoad && gate.isHidden('city');
  const sourceHidden = gate.didLoad && gate.isHidden('source_id');
  const [loading, setLoading] = useState(true);
  // Global city picker — refetch when it changes (api.ts attaches it
  // to the GET, but the response is cached per-key so we need the
  // city in the dep list to bust stale data).
  const cityKey = useReportCityKey();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    crmAnalytics.leadTracker(months)
      .then((r) => {
        if (cancelled) return;
        // Endpoint returns the payload directly (no `{ success, data }`
        // envelope), so unwrap defensively.
        const payload = (r as unknown as TrackerPlus & { data?: TrackerPlus });
        setData(payload.data ?? payload);
      })
      .catch((e: any) => toast.error(e?.message || 'Failed to load Lead Tracker'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months, cityKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Header months={months} onChange={setMonths} canExport={!loading && !!data} onExport={() => data && downloadCsv('lead-tracker', trackerCsv(data, cityHidden || !gate.didLoad, sourceHidden || !gate.didLoad))} />

      {/* Period summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <PeriodCard data={data?.period_today} prev={data?.previous_today} accent="#1e88e5" loading={loading} />
        <PeriodCard data={data?.period_week}  prev={data?.previous_week}  accent="#7cb342" loading={loading} />
        <PeriodCard data={data?.period_month} prev={data?.previous_month} accent="#26a69a" loading={loading} />
      </div>

      {/* Monthly bar chart */}
      <Card>
        <SectionLabel accent="#1e88e5">Monthly new-lead volume</SectionLabel>
        {loading && !data ? <Empty>Loading…</Empty>
          : !data || data.monthly.length === 0 ? <Empty>No leads added in the selected window.</Empty>
          : <BarChart data={data.monthly} formatTick={fmtMonthShort} />}
        {data?.monthly_detail && data.monthly_detail.length > 0 && <MonthlyTable rows={data.monthly_detail} />}
      </Card>

      {/* Weekly + Daily */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: 12 }}>
        <Card>
          <SectionLabel accent="#7cb342">Last 12 weeks</SectionLabel>
          {!data || data.weekly.length === 0 ? <Empty>—</Empty>
            : <Sparkline data={data.weekly} accent="#7cb342" />}
        </Card>
        <Card>
          <SectionLabel accent="#26a69a">Last 30 days</SectionLabel>
          {!data || data.daily.length === 0 ? <Empty>—</Empty>
            : <Sparkline data={data.daily} accent="#26a69a" />}
        </Card>
      </div>

      {/* Status mix + ageing distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <Card>
          <SectionLabel accent="#A855F7">Lead status mix</SectionLabel>
          {!data ? <Empty>—</Empty>
            : <StatusBars status={data.status_breakdown} />}
        </Card>
        <Card>
          <SectionLabel accent="#EF4444">Open lead ageing</SectionLabel>
          {!data ? <Empty>—</Empty>
            : <BucketBars buckets={data.ageing_distribution} />}
        </Card>
      </div>

      {/* Source + City breakdowns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {/* Source and City are built-in lead fields: wait for the admin's settings, and drop the card when hidden. */}
        {gate.didLoad && !sourceHidden && (
          <Card>
            <SectionLabel accent="#3E9EFF">Top sources</SectionLabel>
            {!data || data.source_breakdown.length === 0 ? <Empty>—</Empty>
              : <RankedList items={data.source_breakdown} detail={data.source_detail} />}
          </Card>
        )}
        {gate.didLoad && !cityHidden && (
          <Card>
            <SectionLabel accent="#F59E0B">Top cities</SectionLabel>
            {!data || data.city_breakdown.length === 0 ? <Empty>—</Empty>
              : <RankedList items={data.city_breakdown} />}
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────

function Header({ months, onChange, canExport, onExport }: { months: number; onChange: (m: number) => void; canExport: boolean; onExport: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <Link href="/dashboard/crm/reports" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none' }}>← All reports</Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '6px 0 4px' }}>Lead Tracker</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          New-lead volume + funnel mix across your hierarchy subtree.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
          Range
          <select value={months} onChange={(e) => onChange(Number(e.target.value))}
            style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13 }}>
            {[3, 6, 12, 24].map((n) => <option key={n} value={n}>Last {n} months</option>)}
          </select>
        </label>
        <button onClick={onExport} disabled={!canExport} aria-label="Download CSV"
          style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: canExport ? 'pointer' : 'not-allowed', fontWeight: 700, height: 36, opacity: canExport ? 1 : 0.55 }}>⬇ CSV</button>
      </div>
    </div>
  );
}

// ── Period card ────────────────────────────────────────────────────

function PeriodCard({ data, prev, accent, loading }: {
  data?: PeriodSummary;
  prev?: PeriodSummary;
  accent: string;
  loading: boolean;
}) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ background: accent, color: '#fff', padding: '10px 16px', fontWeight: 800, letterSpacing: 0.4, fontSize: 14 }}>
        {data ? `${data.label} · ${fmtRange(data.from, data.to)}` : '—'}
      </div>
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <Stat label="New" value={loading || !data ? '—' : String(data.new_leads)} />
        <Stat label="Converted" value={loading || !data ? '—' : String(data.converted)} />
        <Stat label="Conversion" value={loading || !data ? '—' : `${(data.conversion_rate * 100).toFixed(1)}%`} />
      </div>
      {!loading && data && prev && (
        <div data-testid="period-compare" style={{ padding: '0 16px 14px', fontSize: 12, color: 'var(--text-dim)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>{prev.label}: <strong style={{ color: 'var(--text)' }}>{prev.new_leads}</strong> new, <strong style={{ color: 'var(--text)' }}>{prev.converted}</strong> converted</span>
          <span style={{ color: changeColor(changeTone(data.new_leads, prev.new_leads)), fontWeight: 700 }}>New leads {fmtChange(data.new_leads, prev.new_leads)}</span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ── Charts ─────────────────────────────────────────────────────────

function BarChart({ data, formatTick }: { data: LeadTrackerBucket[]; formatTick: (k: string) => string }) {
  const max = Math.max(1, ...data.map((b) => b.count));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, padding: '24px 12px 8px', minHeight: 240 }}>
      {data.map((p) => {
        const heightPct = (p.count / max) * 100;
        return (
          <div key={p.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{p.count.toLocaleString('en-IN')}</div>
            <div style={{ width: '100%', maxWidth: 60, height: 180, position: 'relative' }}>
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: `${Math.max(2, heightPct)}%`,
                background: 'linear-gradient(to top, #88d3a8, #6bbd91)',
                borderRadius: 4, transition: 'height 200ms',
              }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              {formatTick(p.key)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ data, accent }: { data: LeadTrackerBucket[]; accent: string }) {
  const max = Math.max(1, ...data.map((b) => b.count));
  const total = data.reduce((a, b) => a + b.count, 0);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
        {data.map((b) => (
          <div key={b.key} style={{
            flex: 1, background: accent, opacity: 0.4 + (b.count / max) * 0.6,
            height: `${(b.count / max) * 100}%`, minHeight: 2, borderRadius: 2,
          }} title={`${b.key}: ${b.count}`} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
        Total: <strong style={{ color: 'var(--text)' }}>{total.toLocaleString('en-IN')}</strong>
      </div>
    </div>
  );
}

function StatusBars({ status }: { status: Record<string, number> }) {
  const COLORS: Record<string, string> = {
    new: '#3E9EFF', working: '#F59E0B', qualified: '#10B981',
    converted: '#22C55E', unqualified: '#94A3B8', lost: '#EF4444',
  };
  const order = ['new', 'working', 'qualified', 'converted', 'unqualified', 'lost'];
  const max = Math.max(1, ...Object.values(status));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {order.map((k) => (
        <div key={k}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ textTransform: 'capitalize', color: 'var(--text)', fontWeight: 600 }}>{k}</span>
            <span style={{ color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace' }}>{status[k] ?? 0}</span>
          </div>
          <div style={{ background: 'var(--s3)', borderRadius: 4, height: 8 }}>
            <div style={{ background: COLORS[k], width: `${((status[k] ?? 0) / max) * 100}%`, height: '100%', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BucketBars({ buckets }: { buckets: { bucket: string; count: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {buckets.map((b) => (
        <div key={b.bucket}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{b.bucket}</span>
            <span style={{ color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace' }}>{b.count}</span>
          </div>
          <div style={{ background: 'var(--s3)', borderRadius: 4, height: 8 }}>
            <div style={{ background: '#EF4444', width: `${(b.count / max) * 100}%`, height: '100%', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RankedList({ items, detail }: { items: { name: string; count: number }[]; detail?: Array<{ name: string; count: number; converted: number; conversion_rate: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map((i, idx) => {
        const d = detail?.find((x) => x.name === i.name);
        return (
        <div key={i.name + idx}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, gap: 8 }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>
              <span style={{ color: 'var(--text-dim)', marginRight: 6 }}>#{idx + 1}</span>{i.name}
            </span>
            <span style={{ color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace', textAlign: 'right' }}>
              {i.count}{d ? ` · ${d.converted} converted (${(d.conversion_rate * 100).toFixed(1)}%)` : ''}
            </span>
          </div>
          <div style={{ background: 'var(--s3)', borderRadius: 4, height: 6 }}>
            <div style={{ background: 'var(--primary)', width: `${(i.count / max) * 100}%`, height: '100%', borderRadius: 4 }} />
          </div>
        </div>
        );
      })}
    </div>
  );
}

const changeColor = (t: 'good' | 'bad' | 'flat') => (t === 'good' ? '#10b981' : t === 'bad' ? '#ef4444' : 'var(--text-dim)');

/** Leads created each month and how many of those have converted so far (a cohort view, so recent months are still maturing). */
function MonthlyTable({ rows }: { rows: Array<{ key: string; new_leads: number; converted: number; conversion_rate: number }> }) {
  const th: React.CSSProperties = { textAlign: 'right', padding: '6px 10px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
  const td: React.CSSProperties = { textAlign: 'right', padding: '6px 10px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace' };
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ overflowX: 'auto' }}>
        <table data-testid="monthly-detail" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
          <thead><tr><th style={{ ...th, textAlign: 'left' }}>Month</th><th style={th}>New leads</th><th style={th}>Converted so far</th><th style={th}>Conversion %</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit' }}>{monthLabel(r.key)}</td>
                <td style={td}>{r.new_leads}</td><td style={td}>{r.converted}</td><td style={td}>{(r.conversion_rate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 6 }}>Converted so far = leads created that month that are Converted now, so recent months are still maturing.</div>
    </div>
  );
}

/** One CSV with every block on the page: Section, Item, Leads, Converted, Conversion %. */
function trackerCsv(d: TrackerPlus, hideCities: boolean, hideSources: boolean): Array<Record<string, string | number>> {
  const out: Array<Record<string, string | number>> = [];
  const add = (Section: string, Item: string, Leads: number, Converted?: number, rate?: number) =>
    out.push({ Section, Item, Leads, Converted: Converted ?? '', 'Conversion %': rate === undefined ? '' : Math.round(rate * 1000) / 10 });
  for (const p of [d.period_today, d.period_week, d.period_month, d.previous_today, d.previous_week, d.previous_month]) {
    if (p) add('Period summary', p.label, p.new_leads, p.converted, p.conversion_rate);
  }
  for (const m of d.monthly_detail ?? d.monthly.map((b) => ({ key: b.key, new_leads: b.count, converted: undefined as number | undefined, conversion_rate: undefined as number | undefined }))) {
    add('Monthly', m.key, m.new_leads, m.converted, m.conversion_rate);
  }
  for (const b of d.weekly) add('Weekly', b.key, b.count);
  for (const b of d.daily) add('Daily', b.key, b.count);
  for (const [k, v] of Object.entries(d.status_breakdown)) add('Status mix', k, v);
  for (const b of d.ageing_distribution) add('Open lead ageing', b.bucket, b.count);
  if (!hideSources) {
    for (const s of d.source_breakdown) {
      const x = d.source_detail?.find((y) => y.name === s.name);
      add('Top sources', s.name, s.count, x?.converted, x?.conversion_rate);
    }
  }
  if (!hideCities) for (const c of d.city_breakdown) add('Top cities', c.name, c.count);
  return out;
}

// ── Atoms ──────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>{children}</div>;
}
function SectionLabel({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ width: 4, height: 16, background: accent, borderRadius: 2 }} />
      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</span>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '24px 0', textAlign: 'center' }}>{children}</div>;
}

// ── Formatters ─────────────────────────────────────────────────────

function fmtMonthShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }).toUpperCase();
}
function fmtRange(fromIso: string, toIso: string): string {
  const f = new Date(fromIso); const t = new Date(toIso);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return f.toDateString() === t.toDateString() ? fmt(f) : `${fmt(f)} → ${fmt(t)}`;
}
