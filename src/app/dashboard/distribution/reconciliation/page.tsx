'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, StatCard } from '../../../../components/distribution/Atoms';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';

const FLAG_META: Record<string, { color: 'gray' | 'green' | 'red' | 'amber' | 'blue'; label: string }> = {
  overstock:  { color: 'red',   label: 'Overstock' },
  drawdown:   { color: 'blue',  label: 'Drawdown' },
  healthy:    { color: 'green', label: 'Healthy' },
  no_primary: { color: 'amber', label: 'No sell-in' },
  idle:       { color: 'gray',  label: 'Idle' },
};
function Flag({ flag }: { flag: string }) {
  const m = FLAG_META[flag] || FLAG_META.idle;
  return <Pill color={m.color}>{m.label}</Pill>;
}
const daysAgoISO = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ReconciliationPage() {
  const [distributors, setDistributors] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState(daysAgoISO(90));
  const [to, setTo] = useState(todayISO());
  const [dist, setDist] = useState('');
  const [view, setView] = useState<'distributor' | 'sku'>('distributor');

  useEffect(() => {
    api.getDistributors().then((r: any) => setDistributors(r?.data || r || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to };
      if (dist) params.distributor_id = dist;
      const r: any = await api.getReconciliation(params);
      setData(r?.data || r || null);
    } catch { /* ignore */ }
    setLoading(false);
  }, [from, to, dist]);
  useEffect(() => { load(); }, [load]);

  const summary = data?.summary || {};
  const distRows: any[] = useMemo(() => data?.by_distributor || [], [data]);
  const skuRows: any[] = useMemo(() => data?.rows || [], [data]);

  const distVal = (r: any, k: string): unknown => (k === 'distributor' ? r.distributor_name : r[k]);
  const skuVal = (r: any, k: string): unknown => {
    switch (k) { case 'distributor': return r.distributor_name; case 'sku': return r.sku_name; default: return r[k]; }
  };
  const dSort = useTableSort<any>(distRows, distVal, { key: 'primary', dir: 'desc' });
  const sSort = useTableSort<any>(skuRows, skuVal, { key: 'primary_qty', dir: 'desc' });
  const dPage = usePagination(dSort.sorted);
  const sPage = usePagination(sSort.sorted);

  const selStyle: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };
  const stFmt = (v: any) => (v == null ? '—' : `${v}×`);

  return (
    <div>
      <PageHeader title="Primary ↔ Secondary Reconciliation" subtitle="Sell-in (company → distributor) vs sell-out (distributor → retailer) with on-hand, per distributor and SKU. Flags overstock and drawdown." />

      {/* Summary */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <StatCard label="Primary (sell-in)" value={Number(summary.primary || 0).toLocaleString('en-IN')} />
        <StatCard label="Secondary (sell-out)" value={Number(summary.secondary || 0).toLocaleString('en-IN')} accent="var(--green)" />
        <StatCard label="Variance" value={Number(summary.variance || 0).toLocaleString('en-IN')} accent={Number(summary.variance) > 0 ? 'var(--primary)' : 'var(--accent)'} hint={Number(summary.variance) > 0 ? 'building at distributor' : 'drawing down'} />
        <StatCard label="Sell-through" value={summary.sell_through != null ? `${summary.sell_through}×` : '—'} />
      </div>

      {/* Filters + view toggle */}
      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div><div style={labelStyle}>From</div><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={selStyle} /></div>
          <div><div style={labelStyle}>To</div><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={selStyle} /></div>
          <div><div style={labelStyle}>Distributor</div>
            <select value={dist} onChange={(e) => setDist(e.target.value)} style={{ ...selStyle, minWidth: 200 }}>
              <option value="">All distributors</option>{distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'inline-flex', gap: 4, background: 'var(--s2)', borderRadius: 10, padding: 3 }}>
            <Btn variant={view === 'distributor' ? 'primary' : 'ghost'} onClick={() => setView('distributor')}>By distributor</Btn>
            <Btn variant={view === 'sku' ? 'primary' : 'ghost'} onClick={() => setView('sku')}>By SKU</Btn>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card style={{ marginBottom: 22 }}>
        {view === 'distributor' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th><SortLabel label="Distributor" sortKey="distributor" sort={dSort.sort} onToggle={dSort.toggle} /></Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="Primary" sortKey="primary" sort={dSort.sort} onToggle={dSort.toggle} align="right" /></Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="Secondary" sortKey="secondary" sort={dSort.sort} onToggle={dSort.toggle} align="right" /></Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="On-hand" sortKey="on_hand" sort={dSort.sort} onToggle={dSort.toggle} align="right" /></Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="Variance" sortKey="variance" sort={dSort.sort} onToggle={dSort.toggle} align="right" /></Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="Sell-through" sortKey="sell_through" sort={dSort.sort} onToggle={dSort.toggle} align="right" /></Th>
              <Th>Health</Th>
            </tr></thead>
            <tbody>
              {loading ? <tr><Td>Loading…</Td><Td /><Td /><Td /><Td /><Td /><Td /></tr> :
                dPage.pageItems.map((r) => (
                  <tr key={r.distributor_id}>
                    <Td style={{ fontWeight: 700 }}>{r.distributor_name}<span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 12 }}> · {r.skus} SKU{r.skus === 1 ? '' : 's'}</span></Td>
                    <Td style={{ textAlign: 'right' }}>{Number(r.primary).toLocaleString('en-IN')}</Td>
                    <Td style={{ textAlign: 'right', color: 'var(--green)' }}>{Number(r.secondary).toLocaleString('en-IN')}</Td>
                    <Td style={{ textAlign: 'right' }}>{Number(r.on_hand).toLocaleString('en-IN')}</Td>
                    <Td style={{ textAlign: 'right', color: r.variance > 0 ? 'var(--primary)' : 'var(--accent)' }}>{Number(r.variance).toLocaleString('en-IN')}</Td>
                    <Td style={{ textAlign: 'right' }}>{stFmt(r.sell_through)}</Td>
                    <Td><Flag flag={r.flag} /></Td>
                  </tr>
                ))}
              {!loading && !distRows.length && <tr><Td colSpan={7 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No sell-in / sell-out in this period.</Td></tr>}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th><SortLabel label="Distributor" sortKey="distributor" sort={sSort.sort} onToggle={sSort.toggle} /></Th>
              <Th><SortLabel label="SKU" sortKey="sku" sort={sSort.sort} onToggle={sSort.toggle} /></Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="Primary" sortKey="primary_qty" sort={sSort.sort} onToggle={sSort.toggle} align="right" /></Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="Secondary" sortKey="secondary_qty" sort={sSort.sort} onToggle={sSort.toggle} align="right" /></Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="On-hand" sortKey="on_hand" sort={sSort.sort} onToggle={sSort.toggle} align="right" /></Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="Variance" sortKey="variance" sort={sSort.sort} onToggle={sSort.toggle} align="right" /></Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="Sell-through" sortKey="sell_through" sort={sSort.sort} onToggle={sSort.toggle} align="right" /></Th>
              <Th>Health</Th>
            </tr></thead>
            <tbody>
              {loading ? <tr><Td>Loading…</Td><Td /><Td /><Td /><Td /><Td /><Td /><Td /></tr> :
                sPage.pageItems.map((r) => (
                  <tr key={`${r.distributor_id}|${r.sku_id}`}>
                    <Td>{r.distributor_name}</Td>
                    <Td style={{ fontWeight: 700 }}>{r.sku_name}{r.sku_code ? <span style={{ color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 400, fontSize: 12 }}> · {r.sku_code}</span> : null}</Td>
                    <Td style={{ textAlign: 'right' }}>{Number(r.primary_qty).toLocaleString('en-IN')}</Td>
                    <Td style={{ textAlign: 'right', color: 'var(--green)' }}>{Number(r.secondary_qty).toLocaleString('en-IN')}</Td>
                    <Td style={{ textAlign: 'right' }}>{Number(r.on_hand).toLocaleString('en-IN')}</Td>
                    <Td style={{ textAlign: 'right', color: r.variance > 0 ? 'var(--primary)' : 'var(--accent)' }}>{Number(r.variance).toLocaleString('en-IN')}</Td>
                    <Td style={{ textAlign: 'right' }}>{stFmt(r.sell_through)}</Td>
                    <Td><Flag flag={r.flag} /></Td>
                  </tr>
                ))}
              {!loading && !skuRows.length && <tr><Td colSpan={8 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No sell-in / sell-out in this period.</Td></tr>}
            </tbody>
          </table>
        )}
      </Card>
      {view === 'distributor' ? (distRows.length > 0 && dPage.bar) : (skuRows.length > 0 && sPage.bar)}

      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
        Primary = invoices (company → distributor). Secondary = orders (distributor → retailer). Variance = primary − secondary (positive builds distributor stock). Sell-through = secondary ÷ primary — under 0.6× flags overstock, over 1.3× flags drawdown.
      </div>
    </div>
  );
}
