'use client';
import { useEffect, useState } from 'react';
import api from '../../../../../lib/api';
import { Card, PageHeader, StatCard, Row, Th, Td, Btn } from '../../../../../components/distribution/Atoms';

const inr = (v: number) => '₹' + Math.round(v || 0).toLocaleString('en-IN');
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1))); };
const inputStyle = { padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text)', fontSize: 13 } as const;

interface Line {
  client_id: string | null; name: string;
  orders: number; order_value: number; invoices: number; invoice_value: number;
  collected: number; collected_by_mode: Record<string, number>; returns: number; return_value: number;
}

export default function CompanyReport() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(iso(new Date()));
  const [lines, setLines] = useState<Line[]>([]);
  const [total, setTotal] = useState<Omit<Line, 'client_id' | 'name'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Refetches whenever the date range changes.
  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    (async () => {
      try {
        const r: any = await api.getCompanyReport({ from, to });
        const d = r?.data || r;
        if (!live) return;
        setLines(d.companies || []); setTotal(d.total || null);
      } catch (e: any) {
        if (live) setError(e?.message || 'Could not load the report');
      }
      if (live) setLoading(false);
    })();
    return () => { live = false; };
  }, [from, to]);

  const exportCsv = () => {
    const head = ['Company', 'Orders', 'Order Value', 'Invoices', 'Invoice Value', 'Collected', 'Returns', 'Return Value'];
    const rows = [...lines, ...(total ? [{ name: 'All companies', ...total } as any] : [])]
      .map((l) => [l.name, l.orders, l.order_value, l.invoices, l.invoice_value, l.collected, l.returns, l.return_value]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `company-summary-${from}-to-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const right = { textAlign: 'right' as const };
  return (
    <div>
      <PageHeader
        title="Company-wise Summary"
        subtitle="Each company's orders, invoices, collections and returns for the period, with a consolidated total."
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <a href="/dashboard/distribution/reports" style={{ color: 'var(--text-dim)', fontSize: 13 }}>← Reports</a>
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} style={inputStyle} />
            <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} style={inputStyle} />
            <Btn variant="ghost" onClick={() => window.print()}>Print / PDF</Btn>
            <Btn onClick={exportCsv}>Export CSV</Btn>
          </div>
        }
      />

      {total && (
        <Row style={{ marginBottom: 20 }}>
          <StatCard label="Orders (all companies)" value={inr(total.order_value)} hint={`${total.orders} orders`} />
          <StatCard label="Invoiced" value={inr(total.invoice_value)} hint={`${total.invoices} invoices`} />
          <StatCard label="Collected" value={inr(total.collected)} accent="var(--green)" />
          <StatCard label="Returns" value={inr(total.return_value)} hint={`${total.returns} returns`} />
        </Row>
      )}

      <Card>
        {error && <div style={{ color: 'var(--red)', marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {loading ? <div style={{ padding: 24, color: 'var(--text-dim)' }}>Loading…</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead><tr>
                <Th>Company</Th><Th style={right}>Orders</Th><Th style={right}>Order value</Th>
                <Th style={right}>Invoices</Th><Th style={right}>Invoice value</Th>
                <Th style={right}>Collected</Th><Th style={right}>Returns</Th>
              </tr></thead>
              <tbody>
                {lines.length === 0 && <tr><Td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No activity in this period.</Td></tr>}
                {lines.map((l) => (
                  <tr key={l.client_id || 'none'}>
                    <Td>{l.name}</Td><Td style={right}>{l.orders}</Td><Td style={right}>{inr(l.order_value)}</Td>
                    <Td style={right}>{l.invoices}</Td><Td style={right}>{inr(l.invoice_value)}</Td>
                    <Td style={right}>{inr(l.collected)}</Td><Td style={right}>{inr(l.return_value)}</Td>
                  </tr>
                ))}
                {total && lines.length > 0 && (
                  <tr style={{ fontWeight: 700 }}>
                    <Td>All companies</Td><Td style={right}>{total.orders}</Td><Td style={right}>{inr(total.order_value)}</Td>
                    <Td style={right}>{total.invoices}</Td><Td style={right}>{inr(total.invoice_value)}</Td>
                    <Td style={right}>{inr(total.collected)}</Td><Td style={right}>{inr(total.return_value)}</Td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
