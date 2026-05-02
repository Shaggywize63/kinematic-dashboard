'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, StatCard, Row, Pill, Th, Td, inr, fmtDate } from '../../../../components/distribution/Atoms';

export default function LedgerPage() {
  const [outletId, setOutletId] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [ageing, setAgeing] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (outletId) params.outlet_id = outletId;
      const [l, a]: any = await Promise.all([api.getLedger(params), api.getAgeing()]);
      setEntries((l?.data?.entries) || l?.entries || []);
      setAgeing(a?.data || a);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader title="Ledger" subtitle="Double-entry. Outlet running balance never crosses credit limit without admin override." />

      {ageing && (
        <Row style={{ marginBottom: 22 }}>
          <StatCard label="Total outstanding" value={inr(ageing.total_outstanding)} accent="var(--primary)" />
          <StatCard label="0-30 days" value={inr(ageing.buckets?.['0_30'] || 0)} />
          <StatCard label="31-60 days" value={inr(ageing.buckets?.['31_60'] || 0)} />
          <StatCard label="61-90 days" value={inr(ageing.buckets?.['61_90'] || 0)} />
          <StatCard label="90+ days" value={inr(ageing.buckets?.['90_plus'] || 0)} accent={ageing.buckets?.['90_plus'] > 0 ? 'var(--primary)' : undefined} />
        </Row>
      )}

      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <input value={outletId} onChange={(e) => setOutletId(e.target.value)} placeholder="Filter by outlet UUID"
            style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }} />
          <button onClick={load} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Apply</button>
        </div>
      </Card>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>Posted</Th><Th>Type</Th><Th>Reference</Th><Th style={{ textAlign: 'right' }}>DR</Th><Th style={{ textAlign: 'right' }}>CR</Th><Th style={{ textAlign: 'right' }}>Running</Th><Th>Notes</Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              entries.map((e) => (
                <tr key={e.id}>
                  <Td>{fmtDate(e.posted_at)}</Td>
                  <Td><Pill color={e.entry_type === 'invoice' ? 'amber' : e.entry_type === 'payment' ? 'green' : e.entry_type === 'credit_note' ? 'blue' : 'gray'}>{e.entry_type}</Pill></Td>
                  <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{e.ref_table}/{e.ref_id?.slice(0, 8)}…</Td>
                  <Td style={{ textAlign: 'right', color: Number(e.dr) > 0 ? 'var(--primary)' : 'var(--text-dim)' }}>{Number(e.dr) > 0 ? inr(e.dr) : '—'}</Td>
                  <Td style={{ textAlign: 'right', color: Number(e.cr) > 0 ? 'var(--green)' : 'var(--text-dim)' }}>{Number(e.cr) > 0 ? inr(e.cr) : '—'}</Td>
                  <Td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{inr(e.running_balance)}</Td>
                  <Td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{e.notes || '—'}</Td>
                </tr>
              ))}
            {!loading && !entries.length && <tr><Td colSpan={7 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No entries.</Td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
