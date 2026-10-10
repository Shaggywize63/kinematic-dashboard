'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, inr, fmtDate, statusColor } from '../../../../components/distribution/Atoms';
import PrefetchLink from '../../../../components/PrefetchLink';
import StoreSelect from '../../../../components/StoreSelect';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';
import { useClient } from '../../../../context/ClientContext';
import { useDistributionNames, shortId } from '../../../../lib/useDistributionNames';

const STATUSES = ['', 'placed', 'approved', 'invoiced', 'partially_invoiced', 'cancelled'];
// The orders endpoint caps `limit` at 200 (default 50). Ask for the most it will give so a date range is not
// silently cut to the newest 50 — and say so when even that is not enough.
const LIMIT = 200;

const control: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 };
const filterLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-dim)' };

export default function OrdersPage() {
  const { selectedClientId } = useClient();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  // Server-side filters (sent to GET /distribution/orders as salesman_id / outlet_id / from / to).
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [salesmanId, setSalesmanId] = useState('');
  const [outletId, setOutletId] = useState('');
  // Name lookups: the list endpoint returns ids only.
  const names = useDistributionNames({ distributors: true, salesmen: true, outlets: true });
  const reqId = useRef(0);

  const badRange = !!fromDate && !!toDate && fromDate > toDate;

  const load = useCallback(async () => {
    const id = ++reqId.current;
    if (badRange) { setItems([]); setErr(''); setLoading(false); return; }
    setLoading(true);
    setErr('');
    const params: Record<string, string> = { limit: String(LIMIT) };
    if (status) params.status = status;
    if (salesmanId) params.salesman_id = salesmanId;
    if (outletId) params.outlet_id = outletId;
    // placed_at is a timestamp and the backend compares it as-is, so a bare date as `to` would drop that whole
    // day. Send the day's IST bounds instead (the business day is IST).
    if (fromDate) params.from = `${fromDate}T00:00:00+05:30`;
    if (toDate) params.to = `${toDate}T23:59:59.999+05:30`;
    try {
      const r: any = await api.getDistOrders(params);
      if (id !== reqId.current) return; // a newer filter change has been asked for since
      const rows = r?.data || r || [];
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      if (id !== reqId.current) return;
      setItems([]);
      setErr(e?.message || 'Failed to load orders');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [status, fromDate, toDate, salesmanId, outletId, badRange]);

  // Refetch whenever a filter — or the global client picker — changes.
  useEffect(() => { load(); }, [load, selectedClientId]);

  // A salesman / outlet picked under one client means nothing under another.
  const firstClient = useRef(true);
  useEffect(() => {
    if (firstClient.current) { firstClient.current = false; return; }
    setSalesmanId('');
    setOutletId('');
  }, [selectedClientId]);

  const { outletName, distributorName, salesmanName } = names;
  const outletLabel = useCallback((o: any) => o.outlet_name || outletName(o.outlet_id) || shortId(o.outlet_id), [outletName]);
  const distributorLabel = useCallback((o: any) => distributorName(o.distributor_id) || shortId(o.distributor_id), [distributorName]);
  const salesmanLabel = useCallback((o: any) => salesmanName(o.salesman_id) || shortId(o.salesman_id), [salesmanName]);

  const filtered = items.filter((o) => !q || (o.order_no || '').toLowerCase().includes(q.toLowerCase()));

  // Type-aware, client-side column sorting for the order list (names sort by what the cell shows).
  const orderVal = useCallback((o: any, key: string): unknown => {
    switch (key) {
      case 'order_no': return o.order_no;
      case 'outlet': return outletLabel(o);
      case 'distributor': return distributorLabel(o);
      case 'salesman': return salesmanLabel(o);
      case 'placed': return o.placed_at;
      case 'geofence': return o.geofence_passed;
      case 'status': return o.status;
      case 'amount': return Number(o.grand_total);
      default: return o[key];
    }
  }, [outletLabel, distributorLabel, salesmanLabel]);
  const { sorted, sort, toggle } = useTableSort<any>(filtered, orderVal, { key: 'placed', dir: 'desc' });
  const { pageItems: pagedOrders, bar } = usePagination(sorted);

  const anyFilter = !!(status || fromDate || toDate || salesmanId || outletId);
  const clearFilters = () => { setStatus(''); setFromDate(''); setToDate(''); setSalesmanId(''); setOutletId(''); };

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Captured by FE, dashboard or API"
        right={<a href="/dashboard/distribution/orders/new"><Btn>+ New order</Btn></a>}
      />

      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={filterLabel}>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" style={control}>
              {STATUSES.map((s) => <option key={s} value={s}>{s ? s : 'All status'}</option>)}
            </select>
          </label>
          <label style={filterLabel}>
            From
            <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} aria-label="Placed from" style={control} />
          </label>
          <label style={filterLabel}>
            To
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} aria-label="Placed to" style={control} />
          </label>
          <label style={filterLabel}>
            Salesman
            <select value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)} aria-label="Filter by salesman" style={{ ...control, minWidth: 170 }}>
              <option value="">All salesmen</option>
              {names.salesmen.filter((s) => s.active || s.id === salesmanId).sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div style={{ ...filterLabel, width: 240 }}>
            Outlet
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <StoreSelect value={outletId} onChange={(id) => setOutletId(id)} placeholder="All outlets" />
              </div>
              {outletId && <Btn variant="ghost" size="sm" title="Clear outlet filter" onClick={() => setOutletId('')}>Clear</Btn>}
            </div>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order #" aria-label="Search order number" style={{ ...control, flex: 1, minWidth: 200 }} />
          {anyFilter && <Btn variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Btn>}
        </div>
        {badRange && <div role="alert" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--red)' }}>The From date is after the To date.</div>}
      </Card>

      {err && <div role="alert" style={{ marginBottom: 14, fontSize: 13, color: 'var(--red)' }}>{err}</div>}

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
                  <Td><span title={o.outlet_id}>{outletLabel(o)}</span></Td>
                  <Td><span title={o.distributor_id}>{distributorLabel(o)}</span></Td>
                  <Td><span title={o.salesman_id}>{salesmanLabel(o)}</span></Td>
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
      {!loading && items.length >= LIMIT && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-dim)' }}>
          Showing the latest {LIMIT} matching orders — narrow the date range, salesman or outlet to see older ones.
        </div>
      )}
      {bar}
    </div>
  );
}
