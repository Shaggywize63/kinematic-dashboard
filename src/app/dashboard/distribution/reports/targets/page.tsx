'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '../../../../../lib/api';
import { Card, PageHeader, StatCard, Row, Th, Td, Btn, Pill } from '../../../../../components/distribution/Atoms';

const QUARTERS = ['Q1-2026', 'Q2-2026', 'Q3-2026', 'Q4-2026'];
const statusPill = (s: string) => s === 'Exceeded' ? 'green' : s === 'Achieved' ? 'blue' : 'amber';

export default function TargetsReport() {
  const [quarter, setQuarter] = useState('Q3-2026');
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try { const r: any = await api.getTargetReport({ quarter }); const d = r?.data || r; if (alive) { setRows(d.rows || []); setSummary(d.summary || {}); } } catch {}
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [quarter]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((r) => (r.shop_name || '').toLowerCase().includes(t) || (r.product || '').toLowerCase().includes(t) || (r.salesman || '').toLowerCase().includes(t)) : rows;
  }, [rows, q]);

  const exportCsv = () => {
    const head = ['Salesman', 'Beat', 'Shop Name', 'Quarter', 'Product', 'Target Qty', 'Sold Qty', 'Balance Qty', 'Achievement %', 'Status'];
    const lines = filtered.map((r) => [r.salesman, r.beat, r.shop_name, r.quarter, r.product, r.target_qty, r.sold_qty, r.balance_qty, r.achievement_pct + '%', r.status]);
    const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `shop-sku-targets-${quarter}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Quarterly Sales Targets"
        subtitle="Shop-wise, SKU-wise targets vs. auto-captured actual sales."
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="/dashboard/distribution/reports" style={{ color: 'var(--text-dim)', fontSize: 13, alignSelf: 'center' }}>← Reports</a>
            <Btn variant="ghost" onClick={() => window.print()}>Print / PDF</Btn>
            <Btn onClick={exportCsv}>Export CSV</Btn>
          </div>
        }
      />

      <Row style={{ marginBottom: 20 }}>
        <StatCard label="Total Targets" value={summary.total || 0} />
        <StatCard label="Pending" value={summary.pending || 0} accent="#F59E0B" />
        <StatCard label="Achieved" value={summary.achieved || 0} accent="var(--accent)" />
        <StatCard label="Exceeded" value={summary.exceeded || 0} accent="var(--green)" />
      </Row>

      <Card>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text)', fontSize: 13, fontWeight: 700 }}>
            {QUARTERS.map((qr) => <option key={qr} value={qr}>{qr}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shop, product or salesman…"
            style={{ flex: 1, minWidth: 220, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text)', fontSize: 13 }} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead><tr>
              <Th>Salesman</Th><Th>Beat</Th><Th>Shop Name</Th><Th>Product</Th>
              <Th style={{ textAlign: 'right' }}>Target</Th><Th style={{ textAlign: 'right' }}>Sold</Th>
              <Th style={{ textAlign: 'right' }}>Balance</Th><Th style={{ textAlign: 'right' }}>Achievement</Th><Th>Status</Th>
            </tr></thead>
            <tbody>
              {loading ? <tr><Td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</Td></tr>
                : filtered.map((r, i) => (
                  <tr key={i}>
                    <Td style={{ fontWeight: 700 }}>{r.salesman}</Td>
                    <Td>{r.beat}</Td>
                    <Td>{r.shop_name}</Td>
                    <Td>{r.product}</Td>
                    <Td style={{ textAlign: 'right' }}>{r.target_qty}</Td>
                    <Td style={{ textAlign: 'right' }}>{r.sold_qty}</Td>
                    <Td style={{ textAlign: 'right', color: r.balance_qty < 0 ? 'var(--green)' : 'var(--text)' }}>{r.balance_qty}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{r.achievement_pct}%</Td>
                    <Td><Pill color={statusPill(r.status)}>{r.status}</Pill></Td>
                  </tr>
                ))}
              {!loading && !filtered.length && <tr><Td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No targets set for {quarter}.</Td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
