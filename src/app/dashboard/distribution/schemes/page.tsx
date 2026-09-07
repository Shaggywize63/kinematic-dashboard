'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, fmtDate } from '../../../../components/distribution/Atoms';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';
import SchemeBuilder from '../../../../components/distribution/SchemeBuilder';

// Type-aware column sorting for the schemes table (raw values per key).
const schemeVal = (s: any, key: string): unknown => {
  switch (key) {
    case 'code': return s.code;
    case 'name': return s.name;
    case 'type': return s.type;
    case 'priority': return s.priority;
    case 'validity': return s.valid_from;
    case 'version': return s.version;
    case 'is_active': return s.is_active;
    default: return s[key];
  }
};

export default function SchemesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { sorted, sort, toggle } = useTableSort<any>(items, schemeVal, { key: 'code', dir: 'asc' });
  const { pageItems: pagedSchemes, bar } = usePagination(sorted);

  const load = async () => { try { const r: any = await api.getSchemes(); setItems(r?.data || r || []); } catch {} setLoading(false); };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader
        title="Schemes"
        subtitle="Trade offers — buy-to-get free goods, quantity-slab discounts, buy-X-get-Y, and cart-value discounts. Versioned and applied automatically at order time."
        right={<Btn onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ New Scheme'}</Btn>}
      />

      {showForm && (
        <Card style={{ marginBottom: 22 }}>
          <SchemeBuilder onCancel={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
        </Card>
      )}

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th><SortLabel label="Code" sortKey="code" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Name" sortKey="name" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Type" sortKey="type" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Priority" sortKey="priority" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Validity" sortKey="validity" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Version" sortKey="version" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Status" sortKey="is_active" sort={sort} onToggle={toggle} /></Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              pagedSchemes.map((s) => (
                <tr key={s.id}>
                  <Td style={{ fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}><a href={`/dashboard/distribution/schemes/${s.id}`} style={{ color: 'var(--primary)' }}>{s.code}</a></Td>
                  <Td><a href={`/dashboard/distribution/schemes/${s.id}`} style={{ color: 'var(--text)' }}>{s.name}</a></Td>
                  <Td><Pill color="blue">{s.type}</Pill></Td>
                  <Td>{s.priority}</Td>
                  <Td style={{ fontSize: 12 }}>{fmtDate(s.valid_from)} → {s.valid_to ? fmtDate(s.valid_to) : '∞'}</Td>
                  <Td style={{ fontFamily: 'JetBrains Mono, monospace' }}>v{s.version}</Td>
                  <Td><Pill color={s.is_active ? 'green' : 'gray'}>{s.is_active ? 'active' : 'retired'}</Pill></Td>
                </tr>
              ))}
            {!loading && !items.length && <tr><Td colSpan={7 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No schemes yet.</Td></tr>}
          </tbody>
        </table>
      </Card>
      {bar}
    </div>
  );
}
