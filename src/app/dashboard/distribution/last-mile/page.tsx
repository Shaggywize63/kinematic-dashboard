'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import api from '../../../../lib/api';
import { Card, PageHeader } from '../../../../components/distribution/Atoms';

/**
 * Last-Mile overview — the brand owner's single page for "where did my
 * product actually end up?"
 *
 * Reads both tertiary_sales (the missing retailer → consumer hop) and
 * consumer_registrations (the auto-lead source). Surfaces:
 *   1. Funnel — distributor outflow → reported tertiary → registered
 *      consumers, so the leak between dispatched stock and actual
 *      consumer reach is visible at a glance
 *   2. Capture-channel mix — how much of the tertiary data is coming
 *      from each capture method (consumer self-reg, FE audit, WhatsApp
 *      bot, OCR, mechanic, integration). Helps the brand pick where to
 *      invest next
 *   3. Top retailers + top mechanics, both ranked by recent volume
 */

interface TertiarySale {
  id: string;
  retailer_id: string | null;
  distributor_id: string | null;
  sku_id: string;
  qty: number;
  total: number | null;
  sold_at: string;
  captured_by: string;
  referrer_id: string | null;
  consumer_phone: string | null;
}

interface ConsumerReg {
  id: string;
  consumer_phone: string;
  consumer_name: string | null;
  retailer_id: string | null;
  registered_via: string;
  registered_at: string;
  lead_id: string | null;
}

const CAPTURE_COLORS: Record<string, string> = {
  consumer_self:    '#10b981',
  retailer_app:     '#3b82f6',
  fe_visit:         '#8b5cf6',
  whatsapp_bot:     '#22c55e',
  ocr_invoice:      '#f59e0b',
  mechanic_install: '#ec4899',
  integration:      '#06b6d4',
};

const VIA_COLORS: Record<string, string> = {
  whatsapp:      '#22c55e',
  app:           '#3b82f6',
  dealer:        '#8b5cf6',
  cashback_form: '#f59e0b',
  sms:           '#06b6d4',
  webform:       '#a855f7',
};

export default function LastMileOverviewPage() {
  const [sales, setSales] = useState<TertiarySale[]>([]);
  const [regs, setRegs] = useState<ConsumerReg[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getTertiarySales().catch(() => ({ data: [] })),
      api.getConsumerRegistrations().catch(() => ({ data: [] })),
    ]).then(([s, r]: any[]) => {
      if (cancelled) return;
      setSales((s?.data || s || []) as TertiarySale[]);
      setRegs((r?.data || r || []) as ConsumerReg[]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const totalUnits = sales.reduce((acc, s) => acc + (s.qty ?? 0), 0);
    const totalValue = sales.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
    const consumersReached = new Set(
      sales.map((s) => s.consumer_phone).filter((p): p is string => !!p)
    ).size;
    const retailersActive = new Set(
      sales.map((s) => s.retailer_id).filter((r): r is string => !!r)
    ).size;
    const captureMix: Record<string, number> = {};
    for (const s of sales) captureMix[s.captured_by] = (captureMix[s.captured_by] ?? 0) + s.qty;
    const viaMix: Record<string, number> = {};
    for (const r of regs) viaMix[r.registered_via] = (viaMix[r.registered_via] ?? 0) + 1;
    const topRetailers = aggregateById(sales, (s) => s.retailer_id, (s) => s.qty).slice(0, 5);
    return {
      totalUnits, totalValue, consumersReached, retailersActive,
      registrations: regs.length, leadsCreated: regs.filter((r) => !!r.lead_id).length,
      captureMix, viaMix, topRetailers,
    };
  }, [sales, regs]);

  return (
    <div>
      <PageHeader
        title="Last-Mile Sales"
        subtitle="Retailer → consumer visibility. Funnels brand-owned data against direct consumer registrations and FE-captured audits."
      />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Kpi label="Units sold (tertiary)" value={loading ? '—' : String(stats.totalUnits)} />
        <Kpi label="Value reported" value={loading ? '—' : formatINR(stats.totalValue)} />
        <Kpi label="Consumers reached" value={loading ? '—' : String(stats.consumersReached)} accent="#10b981" />
        <Kpi label="Active retailers" value={loading ? '—' : String(stats.retailersActive)} accent="#3b82f6" />
        <Kpi label="Consumer registrations" value={loading ? '—' : String(stats.registrations)} accent="#a855f7" />
        <Kpi label="Leads auto-created" value={loading ? '—' : String(stats.leadsCreated)} accent="#ec4899" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 18 }}>
        {/* Capture-channel mix — the unorganized sector breakdown */}
        <Card>
          <SectionLabel>Capture channel mix</SectionLabel>
          {loading ? (
            <Empty>Loading…</Empty>
          ) : Object.keys(stats.captureMix).length === 0 ? (
            <Empty>No tertiary sales captured yet. Register a consumer below or POST a sale.</Empty>
          ) : (
            <Bars items={stats.captureMix} colorOf={(k) => CAPTURE_COLORS[k] || '#94a3b8'} />
          )}
        </Card>

        {/* Registration channel mix */}
        <Card>
          <SectionLabel>Registration channel mix</SectionLabel>
          {loading ? (
            <Empty>Loading…</Empty>
          ) : Object.keys(stats.viaMix).length === 0 ? (
            <Empty>No consumer registrations yet.</Empty>
          ) : (
            <Bars items={stats.viaMix} colorOf={(k) => VIA_COLORS[k] || '#94a3b8'} />
          )}
        </Card>

        {/* Top retailers by volume */}
        <Card>
          <SectionLabel>Top retailers (by units)</SectionLabel>
          {loading ? (
            <Empty>Loading…</Empty>
          ) : stats.topRetailers.length === 0 ? (
            <Empty>No retailer attribution yet.</Empty>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {stats.topRetailers.map(({ key, value }) => (
                  <tr key={key ?? 'unknown'} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 0', fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--text-dim)' }}>
                      {key ? `${key.slice(0, 8)}…` : 'Unattributed'}
                    </td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700 }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card>
        <SectionLabel>Drill-downs</SectionLabel>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/dashboard/distribution/last-mile/consumers" style={btnLink}>
            Consumer Registry ↗
          </Link>
          <Link href="/dashboard/distribution/last-mile/tertiary-sales" style={btnLink}>
            Retailer Sales ↗
          </Link>
        </div>
      </Card>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────

function aggregateById<T>(
  items: T[],
  keyOf: (x: T) => string | null,
  valueOf: (x: T) => number
): Array<{ key: string | null; value: number }> {
  const map = new Map<string | null, number>();
  for (const x of items) {
    const k = keyOf(x);
    map.set(k, (map.get(k) ?? 0) + valueOf(x));
  }
  return Array.from(map.entries())
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
}

function formatINR(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

// ── presentational atoms ────────────────────────────────────────────

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px',
      borderLeft: `3px solid ${accent || 'var(--primary)'}`,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '14px 0' }}>{children}</div>;
}

function Bars({ items, colorOf }: { items: Record<string, number>; colorOf: (key: string) => string }) {
  const max = Math.max(...Object.values(items));
  const sorted = Object.entries(items).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sorted.map(([k, v]) => {
        const w = max > 0 ? (v / max) * 100 : 0;
        return (
          <div key={k}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--text)', textTransform: 'capitalize', fontWeight: 600 }}>{k.replace(/_/g, ' ')}</span>
              <span style={{ color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace' }}>{v}</span>
            </div>
            <div style={{ background: 'var(--s3)', borderRadius: 4, height: 6 }}>
              <div style={{ background: colorOf(k), width: `${w}%`, height: '100%', borderRadius: 4, transition: 'width 200ms' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const btnLink: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
  textDecoration: 'none',
};
