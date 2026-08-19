'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, StatCard, inr } from '../../../../components/distribution/Atoms';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';

const val = (r: any, k: string): unknown => {
  switch (k) {
    case 'distributor': return r.distributor_name;
    case 'outstanding': return Number(r.outstanding);
    case 'util': return r.credit_utilization_pct == null ? -1 : Number(r.credit_utilization_pct);
    case 'oldest': return Number(r.oldest_due_days);
    case 'b90': return Number(r.ageing?.['90_plus'] || 0);
    default: return r[k];
  }
};

export default function ReceivablesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await api.getDistributorAgeing();
      setData(r?.data || r || null);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows: any[] = data?.rows || [];
  const summary = data?.summary || { outstanding: 0, ageing: {}, over_limit: 0 };
  const { sorted, sort, toggle } = useTableSort<any>(rows, val, { key: 'outstanding', dir: 'desc' });
  const { pageItems, bar } = usePagination(sorted);

  const ag = summary.ageing || {};
  const utilColor = (pct: number | null) => pct == null ? 'var(--text-dim)' : pct > 100 ? 'var(--primary)' : pct > 80 ? 'var(--accent)' : 'var(--green)';

  return (
    <div>
      <PageHeader title="Distributor Receivables & Ageing" subtitle="Outstanding dues per distributor, aged by invoice date (cleared payments applied FIFO), with credit-limit utilisation." />

      {/* Summary */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <StatCard label="Total outstanding" value={inr(Number(summary.outstanding || 0))} accent="var(--primary)" />
        <StatCard label="0–30 days" value={inr(Number(ag['0_30'] || 0))} accent="var(--green)" />
        <StatCard label="31–60 days" value={inr(Number(ag['31_60'] || 0))} />
        <StatCard label="61–90 days" value={inr(Number(ag['61_90'] || 0))} accent="var(--accent)" />
        <StatCard label="90+ days" value={inr(Number(ag['90_plus'] || 0))} accent="var(--primary)" />
        <StatCard label="Over credit limit" value={summary.over_limit || 0} accent={summary.over_limit ? 'var(--primary)' : undefined} />
      </div>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr>
              <Th><SortLabel label="Distributor" sortKey="distributor" sort={sort} onToggle={toggle} /></Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="Outstanding" sortKey="outstanding" sort={sort} onToggle={toggle} align="right" /></Th>
              <Th style={{ textAlign: 'right' }}>0–30</Th>
              <Th style={{ textAlign: 'right' }}>31–60</Th>
              <Th style={{ textAlign: 'right' }}>61–90</Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="90+" sortKey="b90" sort={sort} onToggle={toggle} align="right" /></Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="Oldest" sortKey="oldest" sort={sort} onToggle={toggle} align="right" /></Th>
              <Th style={{ textAlign: 'right' }}><SortLabel label="Credit use" sortKey="util" sort={sort} onToggle={toggle} align="right" /></Th>
              <Th>Status</Th>
            </tr></thead>
            <tbody>
              {loading ? <tr><Td>Loading…</Td><Td /><Td /><Td /><Td /><Td /><Td /><Td /><Td /></tr> :
                pageItems.map((r) => (
                  <tr key={r.distributor_id} style={r.over_limit ? { background: 'rgba(224,30,44,0.06)' } : undefined}>
                    <Td style={{ fontWeight: 700 }}>{r.distributor_name}{r.region ? <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 12 }}> · {r.region}</span> : null}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(Number(r.outstanding))}</Td>
                    <Td style={{ textAlign: 'right', fontSize: 12 }}>{inr(Number(r.ageing?.['0_30'] || 0))}</Td>
                    <Td style={{ textAlign: 'right', fontSize: 12 }}>{inr(Number(r.ageing?.['31_60'] || 0))}</Td>
                    <Td style={{ textAlign: 'right', fontSize: 12, color: Number(r.ageing?.['61_90']) > 0 ? 'var(--accent)' : undefined }}>{inr(Number(r.ageing?.['61_90'] || 0))}</Td>
                    <Td style={{ textAlign: 'right', fontSize: 12, fontWeight: Number(r.ageing?.['90_plus']) > 0 ? 700 : 400, color: Number(r.ageing?.['90_plus']) > 0 ? 'var(--primary)' : undefined }}>{inr(Number(r.ageing?.['90_plus'] || 0))}</Td>
                    <Td style={{ textAlign: 'right', fontSize: 12 }}>{r.oldest_due_days > 0 ? `${r.oldest_due_days}d` : '—'}</Td>
                    <Td style={{ textAlign: 'right', fontSize: 12, color: utilColor(r.credit_utilization_pct) }}>{r.credit_utilization_pct == null ? '—' : `${r.credit_utilization_pct}%`}</Td>
                    <Td>{r.over_limit ? <Pill color="red">Over limit</Pill> : r.credit_utilization_pct != null && r.credit_utilization_pct > 80 ? <Pill color="amber">Near limit</Pill> : <Pill color="green">OK</Pill>}</Td>
                  </tr>
                ))}
              {!loading && !rows.length && <tr><Td colSpan={9 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No outstanding receivables.</Td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {rows.length > 0 && bar}

      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
        Ageing applies each distributor&apos;s cleared payments to its oldest invoices first; the unpaid remainder of every invoice is bucketed by its own age. Credit use = outstanding ÷ credit limit.
      </div>
    </div>
  );
}
