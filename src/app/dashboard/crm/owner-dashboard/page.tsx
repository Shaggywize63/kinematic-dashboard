'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmDesk, crmCustomerIntel } from '../../../../lib/crmApi';
import type { DeskDaySummary, DeskProductivity, CustomerIntelPayload, SalesTrendsPayload } from '../../../../lib/crmApi';
import { istToday, istDate } from '../../../../lib/istTime';

/**
 * Owner Dashboard — the single pharma command view (Maa Mansha Pharma).
 * Blends today's desk-calling performance, customer intelligence (retention /
 * at-risk), monthly sales, and desk-operator productivity, with deep links into
 * the existing MR field-force dashboards (live GPS, beat productivity, visits).
 * All dates IST.
 */
const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function OwnerDashboardPage() {
  const [desk, setDesk] = useState<DeskDaySummary | null>(null);
  const [prod, setProd] = useState<DeskProductivity | null>(null);
  const [intel, setIntel] = useState<CustomerIntelPayload | null>(null);
  const [trends, setTrends] = useState<SalesTrendsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const today = istToday();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      crmDesk.summary(today),
      crmDesk.productivity({}),
      crmCustomerIntel.list({ limit: 1 }),
      crmCustomerIntel.trends(6),
    ])
      .then(([d, p, i, t]) => { if (cancelled) return; setDesk(d.data ?? null); setProd(p.data ?? null); setIntel(i.data ?? null); setTrends(t.data ?? null); })
      .catch((e: any) => { if (!cancelled) toast.error(e?.message || 'Failed to load owner dashboard'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [today]);

  const s = intel?.summary || {};
  const thisMonth = trends?.series?.[trends.series.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Owner Dashboard</h1>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>Business at a glance · {istDate(today)} (IST)</p>
      </div>

      <Group title="Today — Desk Calling">
        <Kpi label="Customers Assigned" value={desk?.assigned ?? 0} loading={loading} />
        <Kpi label="Called" value={desk?.called ?? 0} loading={loading} />
        <Kpi label="Orders Taken" value={desk?.order_taken ?? 0} color="#16a34a" loading={loading} />
        <Kpi label="Orders Pending" value={desk?.order_pending ?? 0} color="#b45309" loading={loading} />
        <Kpi label="No Order" value={desk?.no_order ?? 0} color="#6b7280" loading={loading} />
        <Kpi label="Order Value" value={inr(desk?.orders_value ?? 0)} color="#2563eb" loading={loading} />
      </Group>

      <Group title="Customers">
        <Kpi label="Total" value={s.total_customers ?? 0} loading={loading} />
        <Kpi label="Active" value={s.active ?? 0} color="#16a34a" loading={loading} />
        <Kpi label="New" value={s.new ?? 0} color="#2563eb" loading={loading} />
        <Kpi label="Declining" value={s.declining ?? 0} color="#b45309" loading={loading} />
        <Kpi label="Dormant" value={s.dormant ?? 0} color="#9333ea" loading={loading} />
        <Kpi label="Churned" value={s.churned ?? 0} color="#dc2626" loading={loading} />
      </Group>

      <Group title={`This Month — Sales${thisMonth ? ` (${thisMonth.month})` : ''}`}>
        <Kpi label="Sales" value={inr(thisMonth?.value ?? 0)} color="#16a34a" loading={loading} />
        <Kpi label="Growth" value={`${(thisMonth?.growth_pct ?? 0) > 0 ? '+' : ''}${thisMonth?.growth_pct ?? 0}%`} color={(thisMonth?.growth_pct ?? 0) < 0 ? '#dc2626' : '#16a34a'} loading={loading} />
        <Kpi label="Orders" value={thisMonth?.orders ?? 0} loading={loading} />
        <Kpi label="Active Customers" value={thisMonth?.active_customers ?? 0} loading={loading} />
        <Kpi label="New Customers" value={thisMonth?.new_customers ?? 0} color="#2563eb" loading={loading} />
        <Kpi label="Retention" value={`${thisMonth?.retention_pct ?? 0}%`} color="#2563eb" loading={loading} />
      </Group>

      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Top desk operators (last 30 days)</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 620 }}>
            <thead><tr>{['Operator', 'Called', 'Connect %', 'Orders', 'Order Value'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {(prod?.operators ?? []).slice(0, 8).map((o) => (
                <tr key={o.operator_id || 'unassigned'} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{o.operator_name}</td>
                  <td style={td}>{o.called}</td><td style={td}>{o.connect_rate}%</td>
                  <td style={td}>{o.order_taken}</td><td style={td}>{inr(o.orders_value)}</td>
                </tr>
              ))}
              {(!prod || prod.operators.length === 0) && <tr><td colSpan={5} style={{ padding: 18, textAlign: 'center', color: '#6b7280' }}>No desk activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>MR field force</h2>
        <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 13 }}>Live GPS, beat productivity and visit activity for the medical reps.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { href: '/dashboard/live-tracking', label: '📍 Live GPS Tracking' },
            { href: '/dashboard/beat-productivity', label: '📈 Beat Productivity' },
            { href: '/dashboard/field-executives', label: '🧑‍⚕️ MR Performance' },
            { href: '/dashboard/visit-logs', label: '📝 Visit Logs' },
            { href: '/dashboard/crm/calling-desk/reports', label: '☎️ Desk Reports' },
            { href: '/dashboard/crm/customer-intelligence', label: '🧠 Customer Intelligence' },
          ].map((l) => (
            <Link key={l.href} href={l.href} style={{ ...tile }}>{l.label}</Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px', color: '#374151' }}>{title}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>{children}</div>
    </div>
  );
}
function Kpi({ label, value, color, loading }: { label: string; value: React.ReactNode; color?: string; loading?: boolean }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || '#111827', opacity: loading ? 0.4 : 1 }}>{value}</div>
    </div>
  );
}

const card: React.CSSProperties = { background: 'var(--card,#fff)', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13, color: '#111827' };
const tile: React.CSSProperties = { padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, fontWeight: 600, color: '#111827', textDecoration: 'none' };
