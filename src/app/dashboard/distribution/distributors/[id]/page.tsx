'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '../../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, StatCard, Row, inr, fmtDate, statusColor } from '../../../../../components/distribution/Atoms';
import { stateName } from '../../../../../lib/india';

export default function DistributorDetail() {
  const params = useParams();
  const id = params?.id as string;

  const [dist, setDist] = useState<any | null>(null);
  const [billing, setBilling] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [d, b, o, i]: any = await Promise.all([
          api.getDistributor(id),
          api.getDistributorBilling(id).catch(() => null),
          api.getDistOrders({ distributor_id: id, limit: '10' }),
          api.getInvoices({ distributor_id: id }),
        ]);
        setDist(d?.data || d);
        setBilling(b?.data || b);
        setOrders(o?.data || o || []);
        setInvoices(i?.data || i || []);
      } catch {}
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading…</div>;
  if (!dist) return <div style={{ color: 'var(--primary)' }}>Distributor not found</div>;

  const used = Number(dist.current_outstanding || 0);
  const limit = Number(dist.credit_limit || 0);
  const utilPct = limit ? Math.round((used / limit) * 100) : 0;

  return (
    <div>
      <PageHeader
        title={dist.name}
        subtitle={`${dist.code} · ${dist.customer_class || '—'} · ${dist.region || '—'}`}
        right={<a href="/dashboard/distribution/distributors" style={{ color: 'var(--text-dim)', fontSize: 13 }}>← All distributors</a>}
      />

      <Row style={{ marginBottom: 22 }}>
        <StatCard label="GSTIN"          value={<span style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace' }}>{dist.gstin || '—'}</span>} />
        <StatCard label="State"          value={dist.state_code ? `${dist.state_code} · ${stateName(dist.state_code) || ''}` : '—'} />
        <StatCard label="Credit Limit"   value={inr(limit)} hint={limit ? `${utilPct}% used` : undefined} />
        <StatCard label="Outstanding"    value={inr(used)} accent={limit && used > limit * 0.8 ? 'var(--primary)' : undefined} />
        <StatCard label="Payment Terms"  value={`${dist.payment_terms_days || 0}d`} />
        <StatCard label="Status"         value={<Pill color={dist.is_active ? 'green' : 'gray'}>{dist.is_active ? 'active' : 'inactive'}</Pill>} />
      </Row>

      {billing && (
        <Card style={{ marginBottom: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Billing summary</div>
          <Row>
            <StatCard label="Open orders"   value={billing.open_orders || 0} />
            <StatCard label="Invoiced"      value={billing.invoiced || 0} />
            <StatCard label="Cancelled"     value={billing.cancelled || 0} />
            <StatCard label="0–30d"         value={inr(billing.ageing?.['0_30'] || 0)} />
            <StatCard label="31–60d"        value={inr(billing.ageing?.['31_60'] || 0)} />
            <StatCard label="61–90d"        value={inr(billing.ageing?.['61_90'] || 0)} />
            <StatCard label="90+ days"      value={inr(billing.ageing?.['90_plus'] || 0)} accent={(billing.ageing?.['90_plus'] || 0) > 0 ? 'var(--primary)' : undefined} />
          </Row>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Recent orders</div>
            <a href={`/dashboard/distribution/orders?distributor_id=${id}`} style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700 }}>All orders →</a>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th>Order</Th><Th>Status</Th><Th style={{ textAlign: 'right' }}>Amount</Th></tr></thead>
            <tbody>
              {orders.length ? orders.map((o) => (
                <tr key={o.id}>
                  <Td><a href={`/dashboard/distribution/orders/${o.id}`} style={{ color: 'var(--text)', fontWeight: 700 }}>{o.order_no}</a></Td>
                  <Td><Pill color={statusColor(o.status)}>{o.status}</Pill></Td>
                  <Td style={{ textAlign: 'right' }}>{inr(o.grand_total)}</Td>
                </tr>
              )) : <tr><Td colSpan={3 as any} style={{ color: 'var(--text-dim)', textAlign: 'center' }}>No orders yet</Td></tr>}
            </tbody>
          </table>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Recent invoices</div>
            <a href={`/dashboard/distribution/invoices?distributor_id=${id}`} style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700 }}>All invoices →</a>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th>Invoice</Th><Th>Issued</Th><Th style={{ textAlign: 'right' }}>Amount</Th></tr></thead>
            <tbody>
              {invoices.length ? invoices.slice(0, 8).map((iv) => (
                <tr key={iv.id}>
                  <Td><a href={`/dashboard/distribution/invoices/${iv.id}`} style={{ color: 'var(--text)', fontWeight: 700 }}>{iv.invoice_no}</a></Td>
                  <Td style={{ fontSize: 12 }}>{fmtDate(iv.issued_at)}</Td>
                  <Td style={{ textAlign: 'right' }}>{inr(iv.grand_total)}</Td>
                </tr>
              )) : <tr><Td colSpan={3 as any} style={{ color: 'var(--text-dim)', textAlign: 'center' }}>No invoices yet</Td></tr>}
            </tbody>
          </table>
        </Card>
      </div>

      <div style={{ marginTop: 22, display: 'flex', gap: 8 }}>
        <a href={`/dashboard/distribution/ledger?distributor_id=${id}`}>
          <Btn variant="ghost">Open ledger</Btn>
        </a>
        <a href={`/dashboard/distribution/payments?distributor_id=${id}`}>
          <Btn variant="ghost">Payments</Btn>
        </a>
      </div>
    </div>
  );
}
