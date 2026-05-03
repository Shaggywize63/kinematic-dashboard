'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, inr, fmtDate, statusColor } from '../../../../components/distribution/Atoms';

export default function InvoicesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderId, setOrderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try { const r: any = await api.getInvoices(); setItems(r?.data || r || []); } catch {} setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const issue = async () => {
    setBusy(true); setErr(null);
    try { await api.issueInvoice(orderId); setOrderId(''); await load(); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Issued from approved orders. IRN-ready, e-way bill aware." />

      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Issue from order ID</div>
            <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="approved order UUID"
              style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'JetBrains Mono, monospace' }} />
          </div>
          <Btn onClick={issue} disabled={busy || !orderId}>{busy ? 'Issuing…' : 'Issue invoice'}</Btn>
        </div>
        {err && <div style={{ marginTop: 10, color: 'var(--primary)', fontSize: 12 }}>{err}</div>}
      </Card>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>Invoice #</Th><Th>IRN</Th><Th>Outlet</Th><Th>Issued</Th><Th>EWB</Th><Th>Status</Th><Th style={{ textAlign: 'right' }}>Amount</Th><Th />
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              items.map((inv) => (
                <tr key={inv.id}>
                  <Td style={{ fontWeight: 700 }}><a href={`/dashboard/distribution/invoices/${inv.id}`} style={{ color: 'var(--text)' }}>{inv.invoice_no}</a></Td>
                  <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{inv.irn ? inv.irn.slice(0, 12) + '…' : <Pill color="amber">pending</Pill>}</Td>
                  <Td>{inv.outlet_id?.slice(0, 8)}…</Td>
                  <Td>{fmtDate(inv.issued_at)}</Td>
                  <Td>{inv.eway_bill_no ? <Pill color="green">{inv.eway_bill_no}</Pill> : (inv.grand_total > 50000 ? <Pill color="red">required</Pill> : <Pill color="gray">—</Pill>)}</Td>
                  <Td><Pill color={statusColor(inv.status)}>{inv.status}</Pill></Td>
                  <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(inv.grand_total)}</Td>
                  <Td>{inv.status === 'issued' && <Btn variant="danger" onClick={async () => {
                    const r = prompt('Cancel reason?'); if (r === null) return;
                    await api.cancelInvoice(inv.id, r); await load();
                  }}>Cancel</Btn>}</Td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
