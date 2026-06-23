'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { LeadTrackerPayload, LeadTrackerBucket } from '../../../../../types/crm';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';

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
 *   5. Source + City top-5 breakdowns.
 *   6. Open-lead ageing distribution (0-7d / 8-30d / 31-90d / 90+d).
 */

export default function LeadTrackerPage() {
  const [months, setMonths] = useState(6);
  const [data, setData] = useState<LeadTrackerPayload | null>(null);
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
        const payload = (r as unknown as LeadTrackerPayload & { data?: LeadTrackerPayload });
        setData(payload.data ?? payload);
      })
      .catch((e: any) => toast.error(e?.message || 'Failed to load Lead Tracker'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months, cityKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Header months={months} onChange={setMonths} />

      {/* Period summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <PeriodCard data={data?.period_today} accent="#1e88e5" loading={loading} />
        <PeriodCard data={data?.period_week}  accent="#7cb342" loading={loading} />
        <PeriodCard data={data?.period_month} accent="#26a69a" loading={loading} />
      </div>

      {/* Monthly bar chart */}
      <Card>
        <SectionLabel accent="#1e88e5">Monthly new-lead volume</SectionLabel>
        {loading && !data ? <Empty>Loading…</Empty>
          : !data || data.monthly.length === 0 ? <Empty>No leads added in the selected window.</Empty>
          : <BarChart data={data.monthly} formatTick={fmtMonthShort} />}
      </Card>

      {/* Weekly + Daily */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
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
        <Card>
          <SectionLabel accent="#3E9EFF">Top sources</SectionLabel>
          {!data || data.source_breakdown.length === 0 ? <Empty>—</Empty>
            : <RankedList items={data.source_breakdown} />}
        </Card>
        <Card>
          <SectionLabel accent="#F59E0B">Top cities</SectionLabel>
          {!data || data.city_breakdown.length === 0 ? <Empty>—</Empty>
            : <RankedList items={data.city_breakdown} />}
        </Card>
      </div>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────

function Header({ months, onChange }: { months: number; onChange: (m: number) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <Link href="/dashboard/crm/reports" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none' }}>← All reports</Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '6px 0 4px' }}>Lead Tracker</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          New-lead volume + funnel mix across your hierarchy subtree.
        </p>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
        Range
        <select value={months} onChange={(e) => onChange(Number(e.target.value))}
          style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13 }}>
          {[3, 6, 12, 24].map((n) => <option key={n} value={n}>Last {n} months</option>)}
        </select>
      </label>
    </div>
  );
}

// ── Period card ────────────────────────────────────────────────────

function PeriodCard({ data, accent, loading }: {
  data?: { label: string; from: string; to: string; new_leads: number; converted: number; conversion_rate: number };
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

function RankedList({ items }: { items: { name: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map((i, idx) => (
        <div key={i.name + idx}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>
              <span style={{ color: 'var(--text-dim)', marginRight: 6 }}>#{idx + 1}</span>{i.name}
            </span>
            <span style={{ color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace' }}>{i.count}</span>
          </div>
          <div style={{ background: 'var(--s3)', borderRadius: 4, height: 6 }}>
            <div style={{ background: 'var(--primary)', width: `${(i.count / max) * 100}%`, height: '100%', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
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
