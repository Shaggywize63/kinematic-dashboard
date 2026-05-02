'use client';
import { useEffect, useState } from 'react';
import api from '../../../lib/api';
import { Card, Row, StatCard, PageHeader, Pill, Th, Td, inr, fmtDate, statusColor } from '../../../components/distribution/Atoms';

export default function DistributionOverview() {
  const [orders, setOrders] = useState<any[]>([]);
  const [distributors, setDistributors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [o, d] = await Promise.all([
          api.getDistOrders({ limit: '20' }) as any,
          api.getDistributors() as any,
        ]);
        setOrders(o?.data || o || []);
        setDistributors(d?.data || d || []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => (o.placed_at || '').startsWith(today));
  const gmvToday = todayOrders.reduce((s, o) => s + Number(o.grand_total || 0), 0);
  const gmvAll = orders.reduce((s, o) => s + Number(o.grand_total || 0), 0);
  const placed = orders.filter((o) => o.status === 'placed').length;
  const invoiced = orders.filter((o) => ['invoiced', 'partially_invoiced'].includes(o.status)).length;
  const activeDist = distributors.filter((d) => d.is_active !== false).length;

  return (
    <div>
      <PageHeader title="Distribution Overview" subtitle="Order to outlet, one trail." />
      <Row style={{ marginBottom: 22 }}>
        <StatCard label="GMV Today" value={inr(gmvToday)} hint={`${todayOrders.length} orders`} />
        <StatCard label="GMV (last 50)" value={inr(gmvAll)} hint={`${orders.length} orders`} />
        <StatCard label="Pending approval" value={placed} accent={placed ? 'var(--primary)' : undefined} />
        <StatCard label="Invoiced" value={invoiced} />
        <StatCard label="Active distributors" value={activeDist} />
      </Row>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Recent orders</div>
          <a href="/dashboard/distribution/orders" style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 700 }}>View all →</a>
        </div>
        {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading…</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th>Order #</Th><Th>Outlet</Th><Th>Salesman</Th><Th>Placed</Th><Th>Status</Th><Th style={{ textAlign: 'right' }}>Amount</Th>
            </tr></thead>
            <tbody>
              {orders.slice(0, 10).map((o) => (
                <tr key={o.id}>
                  <Td><a href={`/dashboard/distribution/orders/${o.id}`} style={{ color: 'var(--text)', fontWeight: 700 }}>{o.order_no}</a></Td>
                  <Td>{o.outlet_id?.slice(0, 8)}…</Td>
                  <Td>{o.salesman_id?.slice(0, 8) || '—'}</Td>
                  <Td>{fmtDate(o.placed_at)}</Td>
                  <Td><Pill color={statusColor(o.status)}>{o.status}</Pill></Td>
                  <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(o.grand_total)}</Td>
                </tr>
              ))}
              {!orders.length && <tr><Td style={{ textAlign: 'center', color: 'var(--text-dim)' }} ><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr>}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
