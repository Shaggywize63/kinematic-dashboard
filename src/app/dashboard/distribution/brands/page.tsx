'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, fmtDate } from '../../../../components/distribution/Atoms';

export default function BrandsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', gstin: '', state_code: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try { const r: any = await api.getBrands(); setItems(r?.data || r || []); } catch {} setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const body: any = { name: form.name, code: form.code };
      if (form.gstin) body.gstin = form.gstin;
      if (form.state_code) body.state_code = form.state_code;
      await api.createBrand(body);
      setShowForm(false); setForm({ name: '', code: '', gstin: '', state_code: '' });
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader title="Brands" subtitle="Brand identities with GSTIN and place-of-supply" right={<Btn onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Add Brand'}</Btn>} />

      {showForm && (
        <Card style={{ marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px auto', gap: 12, alignItems: 'end' }}>
            <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Code" value={form.code} onChange={(v) => setForm({ ...form, code: v.toUpperCase() })} />
            <Field label="GSTIN" value={form.gstin} onChange={(v) => setForm({ ...form, gstin: v.toUpperCase() })} />
            <Field label="State" value={form.state_code} onChange={(v) => setForm({ ...form, state_code: v })} />
            <Btn disabled={busy || !form.name || !form.code} onClick={submit}>{busy ? 'Saving…' : 'Create'}</Btn>
          </div>
          {err && <div style={{ marginTop: 10, color: 'var(--primary)', fontSize: 12 }}>{err}</div>}
        </Card>
      )}

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>Brand</Th><Th>Code</Th><Th>GSTIN</Th><Th>State</Th><Th>Status</Th><Th>Created</Th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr>
            ) : items.map((b) => (
              <tr key={b.id}>
                <Td style={{ fontWeight: 700 }}>{b.name}</Td>
                <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{b.code}</Td>
                <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{b.gstin || '—'}</Td>
                <Td>{b.state_code || '—'}</Td>
                <Td><Pill color={b.is_active ? 'green' : 'gray'}>{b.is_active ? 'active' : 'inactive'}</Pill></Td>
                <Td>{fmtDate(b.created_at)}</Td>
              </tr>
            ))}
            {!loading && !items.length && <tr><Td colSpan={6 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No brands yet.</Td></tr>}
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
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
      />
    </div>
  );
}
