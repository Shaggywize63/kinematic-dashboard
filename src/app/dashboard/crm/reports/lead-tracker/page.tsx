'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { LeadTrackerPayload } from '../../../../../types/crm';

/**
 * Lead Tracker — monthly new-lead volume bar chart + today / week /
 * month summary cards. Mirrors the mobile dashboard the Tata Tiscon
 * field force already uses; rebuilt for the web with the same shape
 * but native CSS so we don't pull in a charting library for a single
 * grouped bar chart.
 *
 * Data spans the caller's hierarchy subtree (`/auth/me` →
 * org_role_data_scope). A Consumer Champion Manager sees every CC
 * reporting to them; a Consumer Champion sees their own count.
 */

export default function LeadTrackerPage() {
  const [months, setMonths] = useState(6);
  const [data, setData] = useState<LeadTrackerPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    crmAnalytics.leadTracker(months)
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch((e: any) => toast.error(e?.message || 'Failed to load Lead Tracker'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months]);

  const maxCount = useMemo(() => {
    const counts = data?.monthly.map((p) => p.count) ?? [];
    return Math.max(1, ...counts);
  }, [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Header months={months} onChange={setMonths} />

      {/* Monthly bar chart */}
      <Card>
        <SectionLabel accent="#1e88e5">Lead Tracker</SectionLabel>
        {loading && !data ? (
          <Empty>Loading…</Empty>
        ) : !data || data.monthly.length === 0 ? (
          <Empty>No leads added in the selected window.</Empty>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, padding: '24px 12px 8px', minHeight: 220 }}>
            {data.monthly.map((p) => {
              const heightPct = (p.count / maxCount) * 100;
              return (
                <div key={p.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    {p.count.toLocaleString('en-IN')}
                  </div>
                  <div style={{ width: '100%', maxWidth: 60, height: 160, position: 'relative', background: 'transparent' }}>
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      height: `${Math.max(2, heightPct)}%`,
                      background: 'linear-gradient(to top, #88d3a8, #6bbd91)',
                      borderRadius: 4,
                      transition: 'height 200ms',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {fmtMonth(p.month)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Period summary cards — today / week / month */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <PeriodCard data={data?.period_today} accent="#1e88e5" loading={loading} />
        <PeriodCard data={data?.period_week}  accent="#7cb342" loading={loading} />
        <PeriodCard data={data?.period_month} accent="#26a69a" loading={loading} />
      </div>
    </div>
  );
}

function Header({ months, onChange }: { months: number; onChange: (m: number) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <Link href="/dashboard/crm/reports" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none' }}>← All reports</Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '6px 0 4px' }}>Lead Tracker</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          New-lead volume across your hierarchy subtree.
        </p>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
        Range
        <select
          value={months}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13 }}
        >
          {[3, 6, 12, 24].map((n) => <option key={n} value={n}>Last {n} months</option>)}
        </select>
      </label>
    </div>
  );
}

function PeriodCard({ data, accent, loading }: {
  data?: { label: string; from: string; to: string; count: number };
  accent: string;
  loading: boolean;
}) {
  return (
    <div style={{
      background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
    }}>
      <div style={{ background: accent, color: '#fff', padding: '10px 16px', fontWeight: 800, letterSpacing: 0.4, fontSize: 14 }}>
        {data ? `${data.label} · ${fmtRange(data.from, data.to)}` : '—'}
      </div>
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Stat label="Lead Tracker" value={loading || !data ? '—' : data.count.toLocaleString('en-IN')} />
        <Stat label="Visits Achieved / Scheduled" value="—" hint="Wires in once the activity-summary endpoint ships" />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
      {children}
    </div>
  );
}

function SectionLabel({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ width: 4, height: 16, background: accent, borderRadius: 2 }} />
      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {children}
      </span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '24px 0', textAlign: 'center' }}>{children}</div>;
}

function fmtMonth(ym: string): string {
  // "2026-06" → "JUN" matching the screenshot's tick labels.
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }).toUpperCase();
}

function fmtRange(fromIso: string, toIso: string): string {
  const f = new Date(fromIso);
  const t = new Date(toIso);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const same = f.toDateString() === t.toDateString();
  return same ? fmt(f) : `${fmt(f)} → ${fmt(t)}`;
}
