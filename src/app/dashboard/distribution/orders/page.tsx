'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, inr, fmtDate, statusColor } from '../../../../components/distribution/Atoms';
import PrefetchLink from '../../../../components/PrefetchLink';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';

const STATUSES = ['', 'placed', 'approved', 'invoiced', 'partially_invoiced', 'cancelled'];

export default function OrdersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (status) params.status = status;
    try { const r: any = await api.getDistOrders(params); setItems(r?.data || r || []); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [status]);

  const filtered = items.filter((o) => !q || (o.order_no || '').toLowerCase().includes(q.toLowerCase()));

  // Type-aware, client-side column sorting for the order list.
  const orderVal = useCallback((o: any, key: string): unknown => {
    switch (key) {
      case 'order_no': return o.order_no;
      case 'outlet': return o.outlet_name || o.outlet_id;
      case 'distributor': return o.distributor_id;
      case 'salesman': return o.salesman_id;
      case 'placed': return o.placed_at;
      case 'geofence': return o.geofence_passed;
      case 'status': return o.status;
      case 'amount': return Number(o.grand_total);
      default: return o[key];
    }
  }, []);
  const { sorted, sort, toggle } = useTableSort<any>(filtered, orderVal, { key: 'placed', dir: 'desc' });
  const { pageItems: pagedOrders, bar } = usePagination(sorted);

  return (
    <div>
      <PageHeader title="Orders" subtitle="Captured by FE, dashboard or API" />

      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s ? s : 'All status'}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order #" style={{ flex: 1, minWidth: 200, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }} />
        </div>
      </Card>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th><SortLabel label="Order #" sortKey="order_no" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Outlet" sortKey="outlet" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Distributor" sortKey="distributor" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Salesman" sortKey="salesman" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Placed" sortKey="placed" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Geofence" sortKey="geofence" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Status" sortKey="status" sort={sort} onToggle={toggle} /></Th>
            <Th style={{ textAlign: 'right' }}><SortLabel label="Amount" sortKey="amount" sort={sort} onToggle={toggle} align="right" /></Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              pagedOrders.map((o) => (
                <tr key={o.id}>
                  <Td><PrefetchLink
                        href={`/dashboard/distribution/orders/${o.id}`}
                        prefetch={() => api.getDistOrder(o.id)}
                        style={{ fontWeight: 700, color: 'var(--text)' }}>{o.order_no}</PrefetchLink></Td>
                  <Td>{(o.outlet_name || o.outlet_id?.slice(0, 8) + '…')}</Td>
                  <Td>{o.distributor_id?.slice(0, 8) || '—'}…</Td>
                  <Td>{o.salesman_id?.slice(0, 8) || '—'}…</Td>
                  <Td>{fmtDate(o.placed_at)}</Td>
                  <Td>{o.geofence_passed === false ? <Pill color="red">{o.geofence_distance_m}m</Pill> : o.geofence_passed === true ? <Pill color="green">in</Pill> : <Pill color="gray">—</Pill>}</Td>
                  <Td><Pill color={statusColor(o.status)}>{o.status}</Pill></Td>
                  <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(o.grand_total)}</Td>
                </tr>
              ))}
            {!loading && !filtered.length && <tr><Td colSpan={8 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No orders match.</Td></tr>}
          </tbody>
        </table>
      </Card>
      {bar}
    </div>
  );
}
