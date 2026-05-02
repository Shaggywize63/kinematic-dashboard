'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, fmtDate } from '../../../../components/distribution/Atoms';

export default function SecondarySalesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ outlet_id: '', sku_id: '', qty: '', period_start: '', period_end: '', source: 'manual', notes: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  const load = async () => { try { const r: any = await api.getSecondarySales(); setItems(r?.data || r || []); } catch {} setLoading(false); };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api.createSecondarySale({ ...form, qty: parseInt(form.qty) });
      setShowForm(false); setForm({ outlet_id: '', sku_id: '', qty: '', period_start: '', period_end: '', source: 'manual', notes: '' });
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader
        title="Consumer · Secondary Sales"
        subtitle="On-shelf, in-hand. Off-take captured per outlet × SKU × period; joins planogram compliance."
        right={<Btn onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Capture'}</Btn>}
      />

      {showForm && (
        <Card style={{ marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'end' }}>
            <Field label="Outlet ID" value={form.outlet_id} onChange={(v) => setForm({ ...form, outlet_id: v })} />
            <Field label="SKU ID" value={form.sku_id} onChange={(v) => setForm({ ...form, sku_id: v })} />
            <Field label="Qty" value={form.qty} onChange={(v) => setForm({ ...form, qty: v })} />
            <SelectField label="Source" value={form.source} onChange={(v) => setForm({ ...form, source: v })} options={['manual', 'estimated', 'qr']} />
            <Field label="Period start" value={form.period_start} onChange={(v) => setForm({ ...form, period_start: v })} />
            <Field label="Period end" value={form.period_end} onChange={(v) => setForm({ ...form, period_end: v })} />
            <div style={{ gridColumn: 'span 2' }}><Field label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} /></div>
          </div>
          {err && <div style={{ marginTop: 10, color: 'var(--primary)', fontSize: 12 }}>{err}</div>}
          <div style={{ marginTop: 12 }}><Btn disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Capture'}</Btn></div>
        </Card>
      )}

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>Outlet</Th><Th>SKU</Th><Th>Period</Th><Th>Qty</Th><Th>Source</Th><Th>Captured</Th><Th>Notes</Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              items.map((s) => (
                <tr key={s.id}>
                  <Td>{s.outlet_id?.slice(0, 8)}…</Td>
                  <Td>{s.sku_id?.slice(0, 8)}…</Td>
                  <Td style={{ fontSize: 12 }}>{s.period_start} → {s.period_end}</Td>
                  <Td style={{ fontWeight: 700 }}>{s.qty}</Td>
                  <Td><Pill color={s.source === 'qr' ? 'green' : s.source === 'estimated' ? 'amber' : 'gray'}>{s.source}</Pill></Td>
                  <Td>{fmtDate(s.created_at)}</Td>
                  <Td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.notes || '—'}</Td>
                </tr>
              ))}
            {!loading && !items.length && <tr><Td colSpan={7 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No captures yet.</Td></tr>}
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
