'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, inr } from '../../../../components/distribution/Atoms';

export default function DistributorsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', gstin: '', state_code: '', credit_limit: '0', payment_terms_days: '0', region: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try { const r: any = await api.getDistributors(); setItems(r?.data || r || []); } catch {} setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const body: any = {
        name: form.name, code: form.code,
        credit_limit: Number(form.credit_limit) || 0,
        payment_terms_days: parseInt(form.payment_terms_days) || 0,
      };
      if (form.gstin) body.gstin = form.gstin;
      if (form.state_code) body.state_code = form.state_code;
      if (form.region) body.region = form.region;
      await api.createDistributor(body);
      setShowForm(false); setForm({ name: '', code: '', gstin: '', state_code: '', credit_limit: '0', payment_terms_days: '0', region: '' });
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader title="Distributors" subtitle="Stockists, distributors, wholesalers" right={<Btn onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Add Distributor'}</Btn>} />

      {showForm && (
        <Card style={{ marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'end' }}>
            <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Code" value={form.code} onChange={(v) => setForm({ ...form, code: v.toUpperCase() })} />
            <Field label="GSTIN" value={form.gstin} onChange={(v) => setForm({ ...form, gstin: v.toUpperCase() })} />
            <Field label="State Code" value={form.state_code} onChange={(v) => setForm({ ...form, state_code: v })} />
            <Field label="Region" value={form.region} onChange={(v) => setForm({ ...form, region: v })} />
            <Field label="Credit Limit (₹)" value={form.credit_limit} onChange={(v) => setForm({ ...form, credit_limit: v })} />
            <Field label="Payment Terms (days)" value={form.payment_terms_days} onChange={(v) => setForm({ ...form, payment_terms_days: v })} />
            <Btn disabled={busy || !form.name || !form.code} onClick={submit}>{busy ? 'Saving…' : 'Create'}</Btn>
          </div>
          {err && <div style={{ marginTop: 10, color: 'var(--primary)', fontSize: 12 }}>{err}</div>}
        </Card>
      )}

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>Distributor</Th><Th>Code</Th><Th>GSTIN</Th><Th>Region</Th><Th>Class</Th><Th style={{ textAlign: 'right' }}>Credit Limit</Th><Th style={{ textAlign: 'right' }}>Outstanding</Th><Th>Status</Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              items.map((d) => (
                <tr key={d.id}>
                  <Td style={{ fontWeight: 700 }}><a href={`/dashboard/distribution/distributors/${d.id}`} style={{ color: 'var(--text)' }}>{d.name}</a></Td>
                  <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{d.code}</Td>
                  <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{d.gstin || '—'}</Td>
                  <Td>{d.region || '—'}</Td>
                  <Td>{d.customer_class || '—'}</Td>
                  <Td style={{ textAlign: 'right' }}>{inr(d.credit_limit)}</Td>
                  <Td style={{ textAlign: 'right' }}>{inr(d.current_outstanding || 0)}</Td>
                  <Td><Pill color={d.is_active ? 'green' : 'gray'}>{d.is_active ? 'active' : 'inactive'}</Pill></Td>
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
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
      />
    </div>
  );
}
