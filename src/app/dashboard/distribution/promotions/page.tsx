'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, fmtDate, inr } from '../../../../components/distribution/Atoms';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';

const PROMO_TYPES = ['price_off', 'free_goods', 'display', 'slotting', 'volume_rebate', 'visibility', 'other'];
const STATUSES = ['draft', 'active', 'paused', 'closed'];

function promoStatusColor(status: string): 'gray' | 'green' | 'red' | 'amber' | 'blue' {
  switch ((status || '').toLowerCase()) {
    case 'active': return 'green';
    case 'paused': return 'amber';
    case 'closed': return 'blue';
    default: return 'gray'; // draft
  }
}

// Type-aware column sorting for the promotions table (raw values per key).
const promoVal = (p: any, key: string): unknown => {
  switch (key) {
    case 'code': return p.code;
    case 'name': return p.name;
    case 'promo_type': return p.promo_type;
    case 'status': return p.status;
    case 'funding_source': return p.funding_source;
    case 'budget': return p.budget_amount;
    case 'validity': return p.valid_from;
    default: return p[key];
  }
};

export default function PromotionsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [promoType, setPromoType] = useState('');
  const { sorted, sort, toggle } = useTableSort<any>(items, promoVal, { key: 'code', dir: 'asc' });
  const { pageItems, bar } = usePagination(sorted);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      if (promoType) params.promo_type = promoType;
      const r: any = await api.getPromotions(Object.keys(params).length ? params : undefined);
      setItems(r?.data || r || []);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, promoType]);

  const selStyle: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 };

  return (
    <div>
      <PageHeader
        title="Trade Promotions"
        subtitle="Price-off · Free goods · Display · Slotting · Volume rebate. Budgets, claims & ROI."
        right={<a href="/dashboard/distribution/promotions/new"><Btn>+ New Promotion</Btn></a>}
      />

      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={selStyle}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Type</div>
            <select value={promoType} onChange={(e) => setPromoType(e.target.value)} style={selStyle}>
              <option value="">All types</option>
              {PROMO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th><SortLabel label="Code" sortKey="code" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Name" sortKey="name" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Type" sortKey="promo_type" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Status" sortKey="status" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Funding" sortKey="funding_source" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Budget" sortKey="budget" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Validity" sortKey="validity" sort={sort} onToggle={toggle} /></Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              pageItems.map((p) => (
                <tr key={p.id}>
                  <Td style={{ fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}><a href={`/dashboard/distribution/promotions/${p.id}`} style={{ color: 'var(--primary)' }}>{p.code}</a></Td>
                  <Td><a href={`/dashboard/distribution/promotions/${p.id}`} style={{ color: 'var(--text)' }}>{p.name}</a></Td>
                  <Td>{p.promo_type ? <Pill color="blue">{p.promo_type}</Pill> : '—'}</Td>
                  <Td><Pill color={promoStatusColor(p.status)}>{p.status || 'draft'}</Pill></Td>
                  <Td>{p.funding_source || '—'}</Td>
                  <Td>{p.budget_amount != null ? inr(p.budget_amount) : '—'}</Td>
                  <Td style={{ fontSize: 12 }}>{p.valid_from ? fmtDate(p.valid_from) : '—'} → {p.valid_to ? fmtDate(p.valid_to) : '∞'}</Td>
                </tr>
              ))}
            {!loading && !items.length && <tr><Td colSpan={7 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No promotions yet.</Td></tr>}
          </tbody>
        </table>
      </Card>
      {bar}
    </div>
  );
}
