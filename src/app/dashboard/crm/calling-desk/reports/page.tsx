'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmDesk } from '../../../../../lib/crmApi';
import type { DeskReport, DeskProductivity } from '../../../../../lib/crmApi';
import { istToday, istDate } from '../../../../../lib/istTime';

/**
 * Calling Desk — Reports. Daily / weekly / monthly calling performance
 * (assigned, connected, orders, pending, no-order, order value), customer-wise
 * order values, and per-operator desk productivity. All dates IST.
 */
const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function defaultRange() {
  const to = istToday();
  const from = new Date(new Date(`${to}T00:00:00Z`).getTime() - 29 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

export default function CallingDeskReportsPage() {
  const [range, setRange] = useState(defaultRange);
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [report, setReport] = useState<DeskReport | null>(null);
  const [prod, setProd] = useState<DeskProductivity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      crmDesk.report({ ...range, granularity }),
      crmDesk.productivity(range),
    ])
      .then(([r, p]) => { if (cancelled) return; setReport(r.data ?? null); setProd(p.data ?? null); })
      .catch((e: any) => { if (!cancelled) toast.error(e?.message || 'Failed to load reports'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to, granularity]);

  const t = report?.totals;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Calling Desk — Reports</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{istDate(range.from)} – {istDate(range.to)} (IST)</p>
        </div>
        <Link href="/dashboard/crm/calling-desk" style={{ ...btn, background: '#fff', color: 'var(--primary,#2563eb)', textDecoration: 'none' }}>← Back to Desk</Link>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} style={input} />
        <span style={{ color: '#9ca3af' }}>→</span>
        <input type="date" value={range.to} max={istToday()} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} style={input} />
        <select value={granularity} onChange={(e) => setGranularity(e.target.value as any)} style={input}>
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {[
          { label: 'Assigned', value: t?.assigned ?? 0 },
          { label: 'Connected', value: t?.connected ?? 0, color: '#2563eb' },
          { label: 'Orders', value: t?.order_taken ?? 0, color: '#16a34a' },
          { label: 'Pending', value: t?.order_pending ?? 0, color: '#b45309' },
          { label: 'No Order', value: t?.no_order ?? 0, color: '#6b7280' },
          { label: 'Order Value', value: inr(t?.orders_value ?? 0), color: '#16a34a' },
        ].map((c) => (
          <div key={c.label} style={card}>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: (c as any).color || '#111827', opacity: loading ? 0.4 : 1 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <Section title={`${granularity === 'day' ? 'Daily' : granularity === 'week' ? 'Weekly' : 'Monthly'} trend`}>
        <Table head={['Period', 'Assigned', 'Connected', 'Order Taken', 'Pending', 'No Order', 'Order Value']}>
          {(report?.series ?? []).map((b) => (
            <tr key={b.bucket} style={row}>
              <td style={td}>{granularity === 'month' ? b.bucket : istDate(b.bucket)}</td>
              <td style={td}>{b.assigned}</td><td style={td}>{b.connected}</td>
              <td style={td}>{b.order_taken}</td><td style={td}>{b.order_pending}</td>
              <td style={td}>{b.no_order}</td><td style={td}>{inr(b.orders_value)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Operator productivity">
        <Table head={['Operator', 'Assigned', 'Called', 'Connect %', 'Orders', 'Order %', 'Order Value']}>
          {(prod?.operators ?? []).map((o) => (
            <tr key={o.operator_id || 'unassigned'} style={row}>
              <td style={{ ...td, fontWeight: 600 }}>{o.operator_name}</td>
              <td style={td}>{o.assigned}</td><td style={td}>{o.called}</td>
              <td style={td}>{o.connect_rate}%</td><td style={td}>{o.order_taken}</td>
              <td style={td}>{o.order_rate}%</td><td style={td}>{inr(o.orders_value)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Customer-wise orders">
        <Table head={['Customer', 'Calls', 'Orders', 'Order Value']}>
          {(report?.customers ?? []).slice(0, 200).map((c) => (
            <tr key={`${c.customer_type}:${c.customer_id}`} style={row}>
              <td style={{ ...td, fontWeight: 600 }}>{c.customer_name || '—'}</td>
              <td style={td}>{c.calls}</td><td style={td}>{c.orders}</td><td style={td}>{inr(c.orders_value)}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={card}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>{title}</h2>
      <div style={{ overflowX: 'auto' }}>{children}</div>
    </div>
  );
}
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 640 }}>
      <thead><tr>{head.map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  );
}

const input: React.CSSProperties = { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' };
const btn: React.CSSProperties = { padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const card: React.CSSProperties = { background: 'var(--card,#fff)', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13, color: '#111827' };
const row: React.CSSProperties = { borderTop: '1px solid #f1f5f9' };
