'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import api from '../../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, fmtDate } from '../../../../../components/distribution/Atoms';

/**
 * Retailer Sales (tertiary) — list + manual capture form for
 * distribution_tertiary_sales. Manual entry exists primarily for back-
 * office reconciliation (an FE phones in a sale, an admin keys it).
 * Most rows will arrive via the consumer_registrations hook or the
 * forthcoming WhatsApp webhook.
 */

interface TertiarySale {
  id: string;
  retailer_id: string | null;
  distributor_id: string | null;
  sku_id: string;
  serial_id: string | null;
  consumer_phone: string | null;
  consumer_name: string | null;
  vehicle_reg: string | null;
  qty: number;
  unit_price: number | null;
  total: number | null;
  sold_at: string;
  captured_by: string;
  referrer_id: string | null;
  notes: string | null;
}

const CAPTURE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'consumer_self',     label: 'Consumer self' },
  { value: 'retailer_app',      label: 'Retailer app' },
  { value: 'fe_visit',          label: 'FE visit' },
  { value: 'whatsapp_bot',      label: 'WhatsApp bot' },
  { value: 'ocr_invoice',       label: 'OCR invoice' },
  { value: 'mechanic_install',  label: 'Mechanic install' },
  { value: 'integration',       label: 'Integration' },
];

const CAPTURE_COLORS: Record<string, 'green' | 'amber' | 'gray'> = {
  consumer_self: 'green',
  retailer_app: 'green',
  fe_visit: 'amber',
  whatsapp_bot: 'green',
  ocr_invoice: 'amber',
  mechanic_install: 'amber',
  integration: 'gray',
};

export default function TertiarySalesPage() {
  const [items, setItems] = useState<TertiarySale[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterCapture, setFilterCapture] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    retailer_id: '', distributor_id: '', sku_id: '', serial_id: '',
    consumer_phone: '', consumer_name: '', vehicle_reg: '',
    qty: '1', unit_price: '', discount: '',
    captured_by: 'fe_visit', referrer_id: '', notes: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterCapture) params.captured_by = filterCapture;
      const r: any = await api.getTertiarySales(params);
      setItems((r?.data || r || []) as TertiarySale[]);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load sales');
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterCapture]);

  const submit = async () => {
    if (!form.sku_id.trim()) return toast.error('SKU id is required.');
    const qty = parseInt(form.qty || '1', 10);
    if (!qty || qty < 1) return toast.error('Qty must be 1 or more.');
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        sku_id: form.sku_id.trim(),
        qty,
        captured_by: form.captured_by,
      };
      if (form.retailer_id)    body.retailer_id = form.retailer_id;
      if (form.distributor_id) body.distributor_id = form.distributor_id;
      if (form.serial_id)      body.serial_id = form.serial_id;
      if (form.consumer_phone) body.consumer_phone = form.consumer_phone;
      if (form.consumer_name)  body.consumer_name = form.consumer_name;
      if (form.vehicle_reg)    body.vehicle_reg = form.vehicle_reg;
      if (form.unit_price)     body.unit_price = Number(form.unit_price);
      if (form.discount)       body.discount = Number(form.discount);
      if (form.referrer_id)    body.referrer_id = form.referrer_id;
      if (form.notes)          body.notes = form.notes;
      await api.createTertiarySale(body);
      toast.success('Tertiary sale captured.');
      setShowForm(false);
      setForm({
        retailer_id: '', distributor_id: '', sku_id: '', serial_id: '',
        consumer_phone: '', consumer_name: '', vehicle_reg: '',
        qty: '1', unit_price: '', discount: '',
        captured_by: 'fe_visit', referrer_id: '', notes: '',
      });
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to capture sale.');
    }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader
        title="Retailer Sales (Tertiary)"
        subtitle="Per-unit retailer → consumer sales. Captured across organized + unorganized channels — every row is tagged with how it arrived."
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/dashboard/distribution/last-mile" style={btnLink}>← Overview</Link>
            <Btn onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Capture'}</Btn>
          </div>
        }
      />

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'end' }}>
            <F label="SKU id *"          value={form.sku_id}          onChange={(v) => setForm({ ...form, sku_id: v })} />
            <F label="Qty *"             value={form.qty}             onChange={(v) => setForm({ ...form, qty: v })} />
            <SF label="Captured by *"    value={form.captured_by}     onChange={(v) => setForm({ ...form, captured_by: v })} options={CAPTURE_OPTIONS} />
            <F label="Retailer id"       value={form.retailer_id}     onChange={(v) => setForm({ ...form, retailer_id: v })} />
            <F label="Distributor id"    value={form.distributor_id}  onChange={(v) => setForm({ ...form, distributor_id: v })} />
            <F label="Serial id"         value={form.serial_id}       onChange={(v) => setForm({ ...form, serial_id: v })} />
            <F label="Consumer phone"    value={form.consumer_phone}  onChange={(v) => setForm({ ...form, consumer_phone: v })} />
            <F label="Consumer name"     value={form.consumer_name}   onChange={(v) => setForm({ ...form, consumer_name: v })} />
            <F label="Vehicle reg"       value={form.vehicle_reg}     onChange={(v) => setForm({ ...form, vehicle_reg: v })} />
            <F label="Unit price (₹)"    value={form.unit_price}      onChange={(v) => setForm({ ...form, unit_price: v })} />
            <F label="Discount (₹)"      value={form.discount}        onChange={(v) => setForm({ ...form, discount: v })} />
            <F label="Referrer (mechanic / fitter id)" value={form.referrer_id} onChange={(v) => setForm({ ...form, referrer_id: v })} />
            <div style={{ gridColumn: 'span 3' }}>
              <F label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <Btn disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Capture'}</Btn>
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Filter</span>
          <SF
            label=""
            value={filterCapture}
            onChange={setFilterCapture}
            options={[{ value: '', label: 'All channels' }, ...CAPTURE_OPTIONS]}
            small
          />
        </div>
      </Card>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>Sold</Th>
            <Th>Retailer</Th>
            <Th>SKU</Th>
            <Th>Qty</Th>
            <Th>Value</Th>
            <Th>Consumer</Th>
            <Th>Vehicle</Th>
            <Th>Captured</Th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><Td>Loading…</Td><Td>—</Td><Td>—</Td><Td>—</Td><Td>—</Td><Td>—</Td><Td>—</Td><Td>—</Td></tr>
            ) : items.length === 0 ? (
              <tr><Td colSpan={8 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No tertiary sales captured yet.</Td></tr>
            ) : (
              items.map((s) => (
                <tr key={s.id}>
                  <Td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{fmtDate(s.sold_at)}</Td>
                  <Td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{s.retailer_id ? `${s.retailer_id.slice(0, 8)}…` : '—'}</Td>
                  <Td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{s.sku_id.slice(0, 8)}…</Td>
                  <Td style={{ fontWeight: 700 }}>{s.qty}</Td>
                  <Td>{s.total != null ? `₹${Number(s.total).toLocaleString('en-IN')}` : '—'}</Td>
                  <Td>
                    <div>{s.consumer_name || <span style={{ color: 'var(--text-dim)' }}>—</span>}</div>
                    {s.consumer_phone && <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace' }}>{s.consumer_phone}</div>}
                  </Td>
                  <Td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{s.vehicle_reg || '—'}</Td>
                  <Td><Pill color={CAPTURE_COLORS[s.captured_by] || 'gray'}>{s.captured_by.replace(/_/g, ' ')}</Pill></Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function F({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)',
                 borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
    </div>
  );
}

function SF({ label, value, onChange, options, small }: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>; small?: boolean;
}) {
  return (
    <div>
      {label && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: small ? 220 : '100%', background: 'var(--s2)', border: '1px solid var(--border)',
                 borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

const btnLink: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
};
