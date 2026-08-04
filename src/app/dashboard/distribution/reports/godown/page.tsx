'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '../../../../../lib/api';
import { Card, PageHeader, StatCard, Row, Th, Td, Btn } from '../../../../../components/distribution/Atoms';

const dateOnly = (s?: string | null) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; }
};

export default function GodownReport() {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<'product_add_date' | 'issued_date' | 'product_code'>('product_code');

  useEffect(() => {
    (async () => {
      try { const r: any = await api.getGodownReport(); const d = r?.data || r; setRows(d.rows || []); setSummary(d.summary || {}); } catch {}
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term
      ? rows.filter((r) => (r.product_name || '').toLowerCase().includes(term) || (r.product_code || '').toLowerCase().includes(term))
      : rows.slice();
    return list.sort((a, b) => {
      if (sortKey === 'product_code') return (a.product_code || '').localeCompare(b.product_code || '');
      return String(b[sortKey] || '').localeCompare(String(a[sortKey] || ''));
    });
  }, [rows, q, sortKey]);

  const exportCsv = () => {
    const head = ['Sl. No.', 'Product Code', 'Product Name', 'Category', 'Unit', 'Product Add Date', 'Received Qty', 'Issued Date', 'Issued Qty', 'Current Balance', 'Last Updated'];
    const lines = filtered.map((r, i) => [i + 1, r.product_code, r.product_name, r.category, r.unit, dateOnly(r.product_add_date), r.received_qty, dateOnly(r.issued_date), r.issued_qty, r.current_balance, dateOnly(r.last_updated)]);
    const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'default-godown-report.csv'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Default Godown Report"
        subtitle="Complete inbound/outbound movement history with running balance."
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="/dashboard/distribution/reports" style={{ color: 'var(--text-dim)', fontSize: 13, alignSelf: 'center' }}>← Reports</a>
            <Btn variant="ghost" onClick={() => window.print()}>Print / PDF</Btn>
            <Btn onClick={exportCsv}>Export CSV</Btn>
          </div>
        }
      />

      <Row style={{ marginBottom: 20 }}>
        <StatCard label="Total Stock Received" value={(summary.total_received || 0).toLocaleString('en-IN')} />
        <StatCard label="Total Stock Issued" value={(summary.total_issued || 0).toLocaleString('en-IN')} />
        <StatCard label="Current Available" value={(summary.current_available || 0).toLocaleString('en-IN')} accent="var(--green)" />
        <StatCard label="Products Tracked" value={summary.sku_count || 0} />
      </Row>

      <Card>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by product name or code…"
            style={{ flex: 1, minWidth: 220, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text)', fontSize: 13 }} />
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as any)}
            style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text)', fontSize: 13 }}>
            <option value="product_code">Sort: Product Code</option>
            <option value="product_add_date">Sort: Product Add Date</option>
            <option value="issued_date">Sort: Issued Date</option>
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr>
              <Th>Sl.</Th><Th>Code</Th><Th>Product</Th><Th>Category</Th><Th>Unit</Th>
              <Th>Add Date</Th><Th style={{ textAlign: 'right' }}>Received</Th>
              <Th>Issued Date</Th><Th style={{ textAlign: 'right' }}>Issued</Th>
              <Th style={{ textAlign: 'right' }}>Balance</Th><Th>Last Updated</Th>
            </tr></thead>
            <tbody>
              {loading ? <tr><Td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</Td></tr>
                : filtered.map((r, i) => (
                  <tr key={r.sku_id}>
                    <Td style={{ color: 'var(--text-dim)' }}>{i + 1}</Td>
                    <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{r.product_code}</Td>
                    <Td style={{ fontWeight: 700 }}>{r.product_name}</Td>
                    <Td>{r.category}</Td>
                    <Td>{r.unit}</Td>
                    <Td>{dateOnly(r.product_add_date)}</Td>
                    <Td style={{ textAlign: 'right' }}>{(r.received_qty || 0).toLocaleString('en-IN')}</Td>
                    <Td>{dateOnly(r.issued_date)}</Td>
                    <Td style={{ textAlign: 'right' }}>{(r.issued_qty || 0).toLocaleString('en-IN')}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--green)' }}>{(r.current_balance || 0).toLocaleString('en-IN')}</Td>
                    <Td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{dateOnly(r.last_updated)}</Td>
                  </tr>
                ))}
              {!loading && !filtered.length && <tr><Td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No stock movements.</Td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
