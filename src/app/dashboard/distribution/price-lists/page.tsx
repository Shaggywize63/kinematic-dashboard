'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, fmtDate } from '../../../../components/distribution/Atoms';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';

// Type-aware column sorting for the price-list table (raw values per key).
const priceListVal = (pl: any, key: string): unknown => {
  switch (key) {
    case 'name': return pl.name;
    case 'customer_class': return pl.customer_class;
    case 'region': return pl.region;
    case 'version': return pl.version;
    case 'valid_from': return pl.valid_from;
    case 'is_active': return pl.is_active;
    case 'item_count': return pl.item_count;
    default: return pl[key];
  }
};

export default function PriceListsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', customer_class: 'GT', region: 'ALL' });
  const [busy, setBusy] = useState(false);
  const { sorted, sort, toggle } = useTableSort<any>(items, priceListVal, { key: 'name', dir: 'asc' });

  const load = async () => {
    try { const r: any = await api.getPriceLists(); setItems(r?.data || r || []); } catch {} setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setBusy(true);
    try { await api.createPriceList(form); setShowForm(false); setForm({ name: '', customer_class: 'GT', region: 'ALL' }); await load(); } catch {}
    setBusy(false);
  };

  const activate = async (id: string) => {
    if (!confirm('Activate this price list? Any current active list for the same class+region will be deactivated.')) return;
    await api.activatePriceList(id); await load();
  };

  return (
    <div>
      <PageHeader title="Price Lists" subtitle="Versioned by customer class + region" right={<Btn onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ New Version'}</Btn>} />

      {showForm && (
        <Card style={{ marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <SelectField label="Customer Class" value={form.customer_class} onChange={(v) => setForm({ ...form, customer_class: v })} options={['MT', 'GT', 'HoReCa', 'Pharma', 'Wholesale']} />
            <Field label="Region" value={form.region} onChange={(v) => setForm({ ...form, region: v })} />
            <Btn disabled={busy || !form.name} onClick={submit}>{busy ? 'Saving…' : 'Create'}</Btn>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 12 }}>Tip: New price lists start <b>inactive</b> with auto-bumped version. Add items, then click Activate.</div>
        </Card>
      )}

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th><SortLabel label="Name" sortKey="name" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Class" sortKey="customer_class" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Region" sortKey="region" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Version" sortKey="version" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Valid From" sortKey="valid_from" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Status" sortKey="is_active" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Items" sortKey="item_count" sort={sort} onToggle={toggle} /></Th>
            <Th />
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              sorted.map((pl) => (
                <tr key={pl.id}>
                  <Td style={{ fontWeight: 700 }}><a href={`/dashboard/distribution/price-lists/${pl.id}`} style={{ color: 'var(--primary)' }}>{pl.name}</a></Td>
                  <Td>{pl.customer_class}</Td>
                  <Td>{pl.region}</Td>
                  <Td style={{ fontFamily: 'JetBrains Mono, monospace' }}>v{pl.version}</Td>
                  <Td>{fmtDate(pl.valid_from)}</Td>
                  <Td><Pill color={pl.is_active ? 'green' : 'gray'}>{pl.is_active ? 'active' : 'draft'}</Pill></Td>
                  <Td>{pl.item_count ?? '—'}</Td>
                  <Td>{!pl.is_active && <Btn variant="ghost" onClick={() => activate(pl.id)}>Activate</Btn>}</Td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
