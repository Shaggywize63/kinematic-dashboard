'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crmAnalytics } from '../../../lib/crmApi';
import type { TelecallerPerfRow } from '../../../types/crm';
import { getStoredUser } from '../../../lib/auth';
import { canViewTelecallerReport } from '../../../lib/clientFeatures';

type Totals = Omit<TelecallerPerfRow, 'user_id' | 'user_name'>;

function monthToDate(): { from: string; to: string } {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(today) };
}

function todayRange(): { from: string; to: string } {
  const d = new Date().toISOString().slice(0, 10);
  return { from: d, to: d };
}

/**
 * Compact telecaller KPI strip for the CRM dashboard overview — calls, connect
 * rate, follow-ups, conversions and scheme ₹ for the current month. Shown only
 * for tenants running the telecaller flow (Rajkamal today) and renders nothing
 * otherwise, so no other tenant's dashboard changes. Links to the full
 * Telecaller Performance report.
 */
export default function TelecallerOverviewStrip() {
  const [show, setShow] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [todayCalls, setTodayCalls] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canViewTelecallerReport(getStoredUser() as any)) { setShow(false); return; }
    setShow(true);
    let cancelled = false;
    const readTotals = (r: unknown): Totals | null => {
      // Rides the shared {success,data} envelope; tolerate a bare payload too.
      const p = r as { totals?: Totals; data?: { totals?: Totals } };
      return p.data?.totals ?? p.totals ?? null;
    };
    // Month-to-date for the headline KPIs + a separate today-only pull so the
    // admin sees how many calls were logged TODAY at a glance.
    Promise.all([
      crmAnalytics.telecallerPerformance(monthToDate()).then(readTotals).catch(() => null),
      crmAnalytics.telecallerPerformance(todayRange()).then(readTotals).catch(() => null),
    ])
      .then(([month, today]) => {
        if (cancelled) return;
        setTotals(month);
        setTodayCalls(today ? today.calls : null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (!show) return null;

  const connectRate = totals && totals.calls > 0 ? Math.round((totals.connected / totals.calls) * 100) : 0;
  const items = [
    { label: 'Calls today', value: todayCalls != null ? String(todayCalls) : '—', accent: '#22C55E' },
    { label: 'Calls (month)', value: totals ? String(totals.calls) : '—', accent: '#3E9EFF' },
    { label: 'Connect Rate', value: totals ? `${connectRate}%` : '—', accent: '#06B6D4' },
    { label: 'Follow-ups', value: totals ? String(totals.follow_ups) : '—', accent: '#F59E0B' },
    { label: 'Conversions', value: totals ? String(totals.conversions) : '—', accent: '#A855F7' },
    { label: 'Scheme ₹', value: totals ? fmtInr(totals.scheme_amount) : '—', accent: '#EC4899' },
  ];

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Telecaller — this month</div>
        <Link href="/dashboard/crm/reports/telecaller-performance" style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>Full report →</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {items.map((k) => (
          <div key={k.label} style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderLeft: `3px solid ${k.accent}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{k.label}</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', marginTop: 3 }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtInr(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '₹0';
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
