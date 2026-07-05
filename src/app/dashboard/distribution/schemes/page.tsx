'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, fmtDate } from '../../../../components/distribution/Atoms';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';

const TYPES = ['QPS', 'SLAB_DISCOUNT', 'BXGY', 'VALUE_DISCOUNT'];

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
  const [form, setForm] = useState({
    code: '', name: '', type: 'QPS', priority: '100', stackable: false,
    valid_from: '', valid_to: '',
    rules: '{\n  "target_sku_id": "<sku-uuid>",\n  "slabs": [{"min_qty":12,"free_qty":1}]\n}',
    targeting: '{\n  "customer_classes": ["GT"]\n}',
  });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const { sorted, sort, toggle } = useTableSort<any>(items, schemeVal, { key: 'code', dir: 'asc' });

  const load = async () => { try { const r: any = await api.getSchemes(); setItems(r?.data || r || []); } catch {} setLoading(false); };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const body: any = {
        code: form.code, name: form.name, type: form.type,
        priority: parseInt(form.priority) || 100, stackable: form.stackable,
        rules: JSON.parse(form.rules), targeting: JSON.parse(form.targeting),
      };
      if (form.valid_from) body.valid_from = form.valid_from;
      if (form.valid_to) body.valid_to = form.valid_to;
      await api.createScheme(body);
      setShowForm(false); await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader title="Schemes" subtitle="QPS · Slab discounts · BxGy · Value discounts. Versioned, server-authoritative." right={<Btn onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ New Scheme'}</Btn>} />

      {showForm && (
        <Card style={{ marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'end' }}>
            <Field label="Code" value={form.code} onChange={(v) => setForm({ ...form, code: v.toUpperCase() })} />
            <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <SelectField label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={TYPES} />
            <Field label="Priority" value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} />
            <Field label="Valid from" value={form.valid_from} onChange={(v) => setForm({ ...form, valid_from: v })} />
            <Field label="Valid to" value={form.valid_to} onChange={(v) => setForm({ ...form, valid_to: v })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <input type="checkbox" checked={form.stackable} onChange={(e) => setForm({ ...form, stackable: e.target.checked })} /> Stackable
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <JsonField label="Targeting (JSON)" value={form.targeting} onChange={(v) => setForm({ ...form, targeting: v })} />
            <JsonField label="Rules (JSON)" value={form.rules} onChange={(v) => setForm({ ...form, rules: v })} />
          </div>
          {err && <div style={{ marginTop: 10, color: 'var(--primary)', fontSize: 12 }}>{err}</div>}
          <div style={{ marginTop: 12 }}>
            <Btn disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Create new version'}</Btn>
          </div>
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
            <Th />
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              sorted.map((s) => (
                <tr key={s.id}>
                  <Td style={{ fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}><a href={`/dashboard/distribution/schemes/${s.id}`} style={{ color: 'var(--primary)' }}>{s.code}</a></Td>
                  <Td><a href={`/dashboard/distribution/schemes/${s.id}`} style={{ color: 'var(--text)' }}>{s.name}</a></Td>
                  <Td><Pill color="blue">{s.type}</Pill></Td>
                  <Td>{s.priority}</Td>
                  <Td style={{ fontSize: 12 }}>{fmtDate(s.valid_from)} → {s.valid_to ? fmtDate(s.valid_to) : '∞'}</Td>
                  <Td style={{ fontFamily: 'JetBrains Mono, monospace' }}>v{s.version}</Td>
                  <Td><Pill color={s.is_active ? 'green' : 'gray'}>{s.is_active ? 'active' : 'retired'}</Pill></Td>
                  <Td>{s.is_active && <Btn variant="ghost" onClick={async () => { if (confirm('Deactivate scheme?')) { await api.updateScheme(s.id, {}); /* PATCH not used for deactivate */ const r: any = await fetch(`/api/v1/distribution/schemes/${s.id}/deactivate`, { method: 'POST' }); await load(); } }}>Retire</Btn>}</Td>
                </tr>
              ))}
            {!loading && !items.length && <tr><Td colSpan={8 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No schemes yet.</Td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div><div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div><input value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }} /></div>;
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return <div><div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div><select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}>{options.map((o) => <option key={o}>{o}</option>)}</select></div>;
}
function JsonField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div><div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={6} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'JetBrains Mono, monospace' }} /></div>;
}
