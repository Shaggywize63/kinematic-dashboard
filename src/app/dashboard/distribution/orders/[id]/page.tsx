'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '../../../../../lib/api';
import { Card, PageHeader, Pill, Btn, Th, Td, inr, fmtDate, statusColor } from '../../../../../components/distribution/Atoms';

export default function OrderDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try { const r: any = await api.getDistOrder(id); setOrder(r?.data || r); } catch (e: any) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { if (id) load(); }, [id]);

  const approve = async () => { setBusy(true); try { await api.approveDistOrder(id); await load(); } catch (e: any) { setErr(e.message); } setBusy(false); };
  const cancel = async () => {
    const reason = prompt('Cancel reason?'); if (reason === null) return;
    setBusy(true); try { await api.cancelDistOrder(id, reason || ''); await load(); } catch (e: any) { setErr(e.message); } setBusy(false);
  };

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading…</div>;
  if (!order) return <div style={{ color: 'var(--primary)' }}>{err || 'Order not found'}</div>;

  const items = order.order_items || order.items || [];
  const canApprove = order.status === 'placed';
  const canCancel = !['invoiced', 'partially_invoiced', 'cancelled'].includes(order.status);

  return (
    <div>
      <PageHeader
        title={`Order ${order.order_no}`}
        subtitle={fmtDate(order.placed_at)}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="/dashboard/distribution/orders" style={{ color: 'var(--text-dim)', fontSize: 13 }}>← All orders</a>
            {canApprove && <Btn onClick={approve} disabled={busy}>Approve</Btn>}
            {order.status === 'approved' && (
              <a href={`/dashboard/distribution/invoices?order_id=${order.id}`}>
                <Btn>Issue invoice →</Btn>
              </a>
            )}
            {canCancel && <Btn variant="danger" onClick={cancel} disabled={busy}>Cancel</Btn>}
          </div>
        }
      />

      {/* Cross-links */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: 'var(--text-dim)' }}>Linked to:</span>
          <a href={`/dashboard/distribution/distributors/${order.distributor_id}`} style={{ color: 'var(--primary)', fontWeight: 700 }}>Distributor →</a>
          <span style={{ color: 'var(--text-dim)' }}>·</span>
          <a href={`/dashboard/distribution/payments?outlet_id=${order.outlet_id}`} style={{ color: 'var(--primary)', fontWeight: 700 }}>Outlet payments →</a>
          <span style={{ color: 'var(--text-dim)' }}>·</span>
          <a href={`/dashboard/distribution/ledger?outlet_id=${order.outlet_id}`} style={{ color: 'var(--primary)', fontWeight: 700 }}>Outlet ledger →</a>
          {['invoiced', 'partially_invoiced'].includes(order.status) && (
            <>
              <span style={{ color: 'var(--text-dim)' }}>·</span>
              <a href={`/dashboard/distribution/invoices?order_id=${order.id}`} style={{ color: 'var(--primary)', fontWeight: 700 }}>Invoice →</a>
            </>
          )}
        </div>
      </Card>

      {err && <Card style={{ marginBottom: 16, borderColor: 'var(--primary)' }}><div style={{ color: 'var(--primary)' }}>{err}</div></Card>}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 22 }}>
        <Card>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Line items</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th>SKU</Th><Th>Qty</Th><Th style={{ textAlign: 'right' }}>Unit</Th><Th style={{ textAlign: 'right' }}>Taxable</Th><Th>GST</Th><Th style={{ textAlign: 'right' }}>Total</Th></tr></thead>
            <tbody>
              {items.map((it: any, i: number) => (
                <tr key={it.id || i}>
                  <Td>
                    <div style={{ fontWeight: 700 }}>{it.sku_name || it.sku_id?.slice(0, 8) + '…'}</div>
                    {it.is_free_good && <Pill color="amber">FREE</Pill>}
                  </Td>
                  <Td>{it.qty} {it.uom}</Td>
                  <Td style={{ textAlign: 'right' }}>{inr(it.unit_price)}</Td>
                  <Td style={{ textAlign: 'right' }}>{inr(it.taxable_value)}</Td>
                  <Td>{it.gst_rate}%</Td>
                  <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(it.total)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Status</div>
            <Pill color={statusColor(order.status)}>{order.status}</Pill>
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>Outlet: {order.outlet_id?.slice(0, 8)}…</div>
              <div>Distributor: {order.distributor_id?.slice(0, 8)}…</div>
              <div>Salesman: {order.salesman_id?.slice(0, 8)}…</div>
              <div>Geofence: {order.geofence_passed === false ? <Pill color="red">{order.geofence_distance_m}m off</Pill> : <Pill color="green">in fence</Pill>}</div>
              <div>Place of supply: {order.place_of_supply || '—'}</div>
              <div>Price list v{order.price_list_version}</div>
            </div>
          </Card>

          <Card>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Tax breakdown</div>
            <Row k="Subtotal" v={inr(order.subtotal)} />
            <Row k="Discount" v={`- ${inr(order.discount_total)}`} />
            <Row k="Scheme" v={`- ${inr(order.scheme_total)}`} />
            <Row k="Taxable" v={inr(order.taxable_value)} />
            <Row k="CGST" v={inr(order.cgst)} />
            <Row k="SGST" v={inr(order.sgst)} />
            <Row k="IGST" v={inr(order.igst)} />
            <Row k="Cess" v={inr(order.cess)} />
            <Row k="Round off" v={inr(order.round_off)} />
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
              <span>Grand total</span><span>{inr(order.grand_total)}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: 'var(--text-dim)' }}><span>{k}</span><span style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{v}</span></div>;
}
