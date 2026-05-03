'use client';
import { useEffect, useState } from 'react';
import api from '../../../lib/api';
import { Card, Row, StatCard, PageHeader, Pill, Th, Td, inr, fmtDate, statusColor } from '../../../components/distribution/Atoms';

interface NavTile { href: string; label: string; sub: string; }
const NAV_TILES: NavTile[] = [
  { href: '/dashboard/distribution/brands',           label: 'Brands',         sub: 'GSTIN, place-of-supply' },
  { href: '/dashboard/distribution/distributors',     label: 'Distributors',   sub: 'Stockists, credit terms' },
  { href: '/dashboard/distribution/price-lists',      label: 'Price Lists',    sub: 'Versioned, by class+region' },
  { href: '/dashboard/distribution/schemes',          label: 'Schemes',        sub: 'QPS · BxGy · Slab · Value' },
  { href: '/dashboard/distribution/orders',           label: 'Orders',         sub: 'Capture → approve → invoice' },
  { href: '/dashboard/distribution/invoices',         label: 'Invoices',       sub: 'IRN, EWB, GST split' },
  { href: '/dashboard/distribution/dispatches',       label: 'Dispatches',     sub: 'Vehicle, e-way bill' },
  { href: '/dashboard/distribution/payments',         label: 'Payments',       sub: 'Cash · UPI · Cheque' },
  { href: '/dashboard/distribution/returns',          label: 'Returns',        sub: 'Photo + supervisor gate' },
  { href: '/dashboard/distribution/ledger',           label: 'Ledger',         sub: 'Double-entry, ageing' },
  { href: '/dashboard/distribution/secondary-sales',  label: 'Consumer',       sub: 'Off-take · planogram' },
  { href: '/dashboard/planograms',                    label: 'Planograms',     sub: 'On-shelf compliance' },
];

export default function DistributionOverview() {
  const [orders, setOrders] = useState<any[]>([]);
  const [distributors, setDistributors] = useState<any[]>([]);
  const [ageing, setAgeing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [o, d, a]: any = await Promise.all([
          api.getDistOrders({ limit: '50' }),
          api.getDistributors(),
          api.getAgeing().catch(() => null),
        ]);
        setOrders(o?.data || o || []);
        setDistributors(d?.data || d || []);
        setAgeing(a?.data || a || null);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => (o.placed_at || '').startsWith(today));
  const gmvToday = todayOrders.reduce((s, o) => s + Number(o.grand_total || 0), 0);
  const placed = orders.filter((o) => o.status === 'placed').length;
  const invoiced = orders.filter((o) => ['invoiced', 'partially_invoiced'].includes(o.status)).length;
  const activeDist = distributors.filter((d) => d.is_active !== false).length;

  return (
    <div>
      <PageHeader title="Distribution" subtitle="Order to outlet, one trail." />

      <Row style={{ marginBottom: 22 }}>
        <StatCard label="GMV Today"        value={inr(gmvToday)}             hint={`${todayOrders.length} orders`} />
        <StatCard label="Pending approval" value={placed}                    accent={placed ? 'var(--primary)' : undefined} />
        <StatCard label="Invoiced"         value={invoiced} />
        <StatCard label="Active distributors" value={activeDist} />
        <StatCard label="Outstanding"      value={inr(ageing?.total_outstanding || 0)} hint={ageing?.buckets?.['90_plus'] ? `₹${ageing.buckets['90_plus'].toLocaleString('en-IN')} 90+ days` : undefined} accent={(ageing?.buckets?.['90_plus'] || 0) > 0 ? 'var(--primary)' : undefined} />
      </Row>

      {/* Module navigation tiles — every sub-module of distribution + planograms */}
      <Card style={{ marginBottom: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Module shortcuts</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {NAV_TILES.map((t) => (
            <a key={t.href} href={t.href} style={{
              display: 'block', textDecoration: 'none', padding: 14, borderRadius: 10,
              background: 'var(--s2)', border: '1px solid var(--border)', transition: 'border-color 0.15s, transform 0.15s',
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{t.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{t.sub}</div>
            </a>
          ))}
        </div>
      </Card>

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
              {!orders.length && <tr><Td colSpan={6 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No orders yet.</Td></tr>}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
