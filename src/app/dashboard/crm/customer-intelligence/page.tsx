'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmCustomerIntel } from '../../../../lib/crmApi';
import type { CustomerIntelPayload, SalesTrendsPayload, CustomerLifecycle } from '../../../../lib/crmApi';
import { istDate } from '../../../../lib/istTime';

/**
 * Customer Intelligence — pharma RFM + sales analytics (Maa Mansha Pharma).
 * Per-customer: avg order value, ordering frequency, last order, days since,
 * and a lifecycle label (new / active / declining / dormant / churned) derived
 * from the order ledger. Plus monthly sales, growth, retention, new-vs-repeat.
 * All dates IST.
 */
const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const LIFECYCLE_META: Record<CustomerLifecycle, { label: string; color: string; bg: string }> = {
  new:       { label: 'New',       color: '#2563eb', bg: '#dbeafe' },
  active:    { label: 'Active',    color: '#16a34a', bg: '#dcfce7' },
  declining: { label: 'Declining', color: '#b45309', bg: '#fef3c7' },
  dormant:   { label: 'Dormant',   color: '#9333ea', bg: '#f3e8ff' },
  churned:   { label: 'Churned',   color: '#dc2626', bg: '#fee2e2' },
};

export default function CustomerIntelligencePage() {
  const [lifecycle, setLifecycle] = useState<'' | CustomerLifecycle>('');
  const [q, setQ] = useState('');
  const [intel, setIntel] = useState<CustomerIntelPayload | null>(null);
  const [trends, setTrends] = useState<SalesTrendsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      crmCustomerIntel.list({ lifecycle: lifecycle || undefined, q: q || undefined, limit: 500 }),
      crmCustomerIntel.trends(12),
    ])
      .then(([i, t]) => { if (cancelled) return; setIntel(i.data ?? null); setTrends(t.data ?? null); })
      .catch((e: any) => { if (!cancelled) toast.error(e?.message || 'Failed to load customer intelligence'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lifecycle, q]);

  const s = intel?.summary || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Customer Intelligence</h1>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
          Ordering patterns, retention &amp; at-risk customers{intel ? ` · as of ${istDate(intel.today)} (IST)` : ''}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        {[
          { key: '', label: 'All', value: s.total_customers ?? 0, color: '#111827' },
          { key: 'new', label: 'New', value: s.new ?? 0, color: LIFECYCLE_META.new.color },
          { key: 'active', label: 'Active', value: s.active ?? 0, color: LIFECYCLE_META.active.color },
          { key: 'declining', label: 'Declining', value: s.declining ?? 0, color: LIFECYCLE_META.declining.color },
          { key: 'dormant', label: 'Dormant', value: s.dormant ?? 0, color: LIFECYCLE_META.dormant.color },
          { key: 'churned', label: 'Churned', value: s.churned ?? 0, color: LIFECYCLE_META.churned.color },
        ].map((c) => (
          <button key={c.label} onClick={() => setLifecycle(c.key as any)}
            style={{ ...card, textAlign: 'left', cursor: 'pointer', outline: lifecycle === c.key ? `2px solid ${c.color}` : 'none' }}>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color, opacity: loading ? 0.4 : 1 }}>{c.value}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Search customer…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...input, minWidth: 240 }} />
        {lifecycle && <button onClick={() => setLifecycle('')} style={{ ...input, cursor: 'pointer' }}>Clear filter ({LIFECYCLE_META[lifecycle].label})</button>}
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Customers</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 920 }}>
            <thead><tr>{['Customer', 'Status', 'Orders', 'Total Value', 'Avg Order', 'Orders/Mo', 'Last Order', 'Days Since', 'Trend'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Loading…</td></tr>
              ) : (intel?.customers ?? []).length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>No order history yet.</td></tr>
              ) : (intel?.customers ?? []).map((c) => {
                const m = LIFECYCLE_META[c.lifecycle];
                return (
                  <tr key={`${c.customer_type}:${c.customer_id}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ ...td, fontWeight: 600 }}>{c.customer_name || '—'}</td>
                    <td style={td}><span style={{ ...badge, color: m.color, background: m.bg }}>{m.label}</span></td>
                    <td style={td}>{c.orders}</td>
                    <td style={td}>{inr(c.total_value)}</td>
                    <td style={td}>{inr(c.avg_order_value)}</td>
                    <td style={td}>{c.orders_per_month}</td>
                    <td style={td}>{istDate(c.last_order_date)}</td>
                    <td style={td}>{c.days_since_last_order}d</td>
                    <td style={{ ...td, color: c.trend_pct < 0 ? '#dc2626' : c.trend_pct > 0 ? '#16a34a' : '#6b7280', fontWeight: 600 }}>
                      {c.trend_pct > 0 ? '▲' : c.trend_pct < 0 ? '▼' : '–'} {Math.abs(c.trend_pct)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Monthly sales &amp; retention</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 720 }}>
            <thead><tr>{['Month', 'Sales', 'Growth', 'Orders', 'Active', 'New', 'Repeat', 'Retention'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {(trends?.series ?? []).map((p) => (
                <tr key={p.month} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{p.month}</td>
                  <td style={td}>{inr(p.value)}</td>
                  <td style={{ ...td, color: p.growth_pct < 0 ? '#dc2626' : p.growth_pct > 0 ? '#16a34a' : '#6b7280' }}>{p.growth_pct > 0 ? '+' : ''}{p.growth_pct}%</td>
                  <td style={td}>{p.orders}</td><td style={td}>{p.active_customers}</td>
                  <td style={td}>{p.new_customers}</td><td style={td}>{p.repeat_customers}</td>
                  <td style={td}>{p.retention_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const input: React.CSSProperties = { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' };
const card: React.CSSProperties = { background: 'var(--card,#fff)', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13, color: '#111827' };
const badge: React.CSSProperties = { padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };
