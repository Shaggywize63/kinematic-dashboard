'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '../../../../../lib/api';
import { Card, PageHeader, Pill, Btn, Th, Td, inr, fmtDate, statusColor } from '../../../../../components/distribution/Atoms';

export default function InvoiceDetail() {
  const params = useParams();
  const id = params?.id as string;
  const [inv, setInv] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try { const r: any = await api.getInvoice(id); setInv(r?.data || r); } catch (e: any) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { if (id) load(); }, [id]);

  const cancel = async () => {
    const r = prompt('Cancel reason?'); if (r === null) return;
    try { await api.cancelInvoice(id, r); await load(); } catch (e: any) { alert(e.message); }
  };

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading…</div>;
  if (!inv) return <div style={{ color: 'var(--primary)' }}>{err || 'Invoice not found'}</div>;

  const items = inv.invoice_items || [];
  const eway = Number(inv.grand_total) > 50000;
  const canCancel = inv.status === 'issued';

  return (
    <div>
      <PageHeader
        title={`Invoice ${inv.invoice_no}`}
        subtitle={fmtDate(inv.issued_at)}
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/dashboard/distribution/invoices" style={{ color: 'var(--text-dim)', fontSize: 13, alignSelf: 'center' }}>← All invoices</a>
            {canCancel && <Btn variant="danger" onClick={cancel}>Cancel invoice</Btn>}
          </div>
        }
      />

      {/* Cross-links: back to order, forward to dispatch + payments */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: 'var(--text-dim)' }}>Source:</span>
          <a href={`/dashboard/distribution/orders/${inv.order_id}`} style={{ color: 'var(--primary)', fontWeight: 700 }}>Order →</a>
          <span style={{ color: 'var(--text-dim)' }}>·</span>
          <a href={`/dashboard/distribution/distributors/${inv.distributor_id}`} style={{ color: 'var(--primary)', fontWeight: 700 }}>Distributor →</a>
          <span style={{ color: 'var(--text-dim)' }}>·</span>
          <a href={`/dashboard/distribution/payments?outlet_id=${inv.outlet_id}`} style={{ color: 'var(--primary)', fontWeight: 700 }}>Outlet payments →</a>
          <span style={{ color: 'var(--text-dim)' }}>·</span>
          <a href={`/dashboard/distribution/ledger?outlet_id=${inv.outlet_id}`} style={{ color: 'var(--primary)', fontWeight: 700 }}>Outlet ledger →</a>
          {inv.dispatch_id && <>
            <span style={{ color: 'var(--text-dim)' }}>·</span>
            <a href={`/dashboard/distribution/dispatches`} style={{ color: 'var(--primary)', fontWeight: 700 }}>Dispatch {inv.dispatch_id?.slice(0, 8)}…</a>
          </>}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 22 }}>
        <Card>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Line items</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th>SKU</Th><Th>HSN</Th><Th>Qty</Th><Th style={{ textAlign: 'right' }}>Unit</Th><Th style={{ textAlign: 'right' }}>Taxable</Th><Th>GST</Th><Th style={{ textAlign: 'right' }}>Total</Th>
            </tr></thead>
            <tbody>
              {items.map((it: any) => (
                <tr key={it.id}>
                  <Td>
                    <div style={{ fontWeight: 700 }}>{it.sku_name || it.sku_id?.slice(0, 8) + '…'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{it.sku_code}</div>
                    {it.is_free_good && <Pill color="amber">FREE</Pill>}
                  </Td>
                  <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{it.hsn_code || '—'}</Td>
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
            <Pill color={statusColor(inv.status)}>{inv.status}</Pill>
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>IRN: <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>{inv.irn ? inv.irn.slice(0, 24) + '…' : <Pill color="amber">pending</Pill>}</span></div>
              <div>EWB: {inv.eway_bill_no ? <Pill color="green">{inv.eway_bill_no}</Pill> : (eway ? <Pill color="red">required</Pill> : <Pill color="gray">not needed</Pill>)}</div>
              <div>Place of supply: {inv.place_of_supply || '—'}</div>
              <div>Reverse charge: {inv.is_reverse_charge ? 'yes' : 'no'}</div>
              {inv.cancelled_at && <div>Cancelled: {fmtDate(inv.cancelled_at)}</div>}
              {inv.cancel_reason && <div>Reason: {inv.cancel_reason}</div>}
            </div>
          </Card>

          <Card>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Tax breakdown</div>
            <Row k="Subtotal"     v={inr(inv.subtotal)} />
            <Row k="Discount"     v={`- ${inr(inv.discount_total)}`} />
            <Row k="Scheme"       v={`- ${inr(inv.scheme_total)}`} />
            <Row k="Taxable"      v={inr(inv.taxable_value)} />
            <Row k="CGST"         v={inr(inv.cgst)} />
            <Row k="SGST"         v={inr(inv.sgst)} />
            <Row k="IGST"         v={inr(inv.igst)} />
            <Row k="Cess"         v={inr(inv.cess)} />
            <Row k="Round off"    v={inr(inv.round_off)} />
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
              <span>Grand total</span><span>{inr(inv.grand_total)}</span>
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
