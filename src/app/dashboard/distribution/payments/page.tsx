'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, inr, fmtDate, statusColor } from '../../../../components/distribution/Atoms';

const MODES = ['', 'cash', 'upi', 'cheque', 'credit_adjustment'];

export default function PaymentsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('');
  const [status, setStatus] = useState('');

  const load = async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (mode) params.mode = mode;
    if (status) params.status = status;
    try { const r: any = await api.getDistPayments(params); setItems(r?.data || r || []); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [mode, status]);

  return (
    <div>
      <PageHeader title="Payments" subtitle="Cash, UPI, cheque (image-required), credit adjustment" />

      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}>
            {MODES.map((m) => <option key={m} value={m}>{m || 'All modes'}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}>
            <option value="">All status</option><option value="pending">pending</option><option value="cleared">cleared</option><option value="bounced">bounced</option><option value="cancelled">cancelled</option>
          </select>
        </div>
      </Card>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>Payment #</Th><Th>Outlet</Th><Th>Mode</Th><Th>Reference</Th><Th>Received</Th><Th>Status</Th><Th style={{ textAlign: 'right' }}>Amount</Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              items.map((p) => (
                <tr key={p.id}>
                  <Td style={{ fontWeight: 700 }}>{p.payment_no}</Td>
                  <Td>{p.outlet_id?.slice(0, 8)}…</Td>
                  <Td><Pill color={p.mode === 'cheque' ? 'amber' : p.mode === 'upi' ? 'blue' : 'gray'}>{p.mode}</Pill></Td>
                  <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{p.reference || (p.cheque_image_url ? 'cheque img' : '—')}</Td>
                  <Td>{fmtDate(p.received_at)}</Td>
                  <Td><Pill color={statusColor(p.status)}>{p.status}</Pill></Td>
                  <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(p.amount)}</Td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
