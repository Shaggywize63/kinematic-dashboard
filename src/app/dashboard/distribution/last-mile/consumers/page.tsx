'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import api from '../../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, fmtDate } from '../../../../../components/distribution/Atoms';

/**
 * Consumer Registry — list + manual-entry form for
 * distribution_consumer_registrations. Each row drives a CRM lead
 * automatically (via the backend hook), so this surface is also where
 * admins seed test data before the WhatsApp webhook goes live.
 */

interface ConsumerReg {
  id: string;
  serial_id: string | null;
  serial_text: string | null;
  sku_id: string | null;
  retailer_id: string | null;
  consumer_phone: string;
  consumer_name: string | null;
  consumer_email: string | null;
  vehicle_reg: string | null;
  registered_via: string;
  cashback_amount: number | null;
  tertiary_sale_id: string | null;
  lead_id: string | null;
  registered_at: string;
}

const VIA_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'whatsapp',      label: 'WhatsApp' },
  { value: 'app',           label: 'App' },
  { value: 'dealer',        label: 'At dealer' },
  { value: 'cashback_form', label: 'Cashback form' },
  { value: 'sms',           label: 'SMS' },
  { value: 'webform',       label: 'Web form' },
];

const VIA_COLORS: Record<string, 'green' | 'amber' | 'gray'> = {
  whatsapp: 'green', app: 'green', dealer: 'amber',
  cashback_form: 'amber', sms: 'gray', webform: 'gray',
};

export default function ConsumerRegistryPage() {
  const [items, setItems] = useState<ConsumerReg[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterVia, setFilterVia] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    consumer_phone: '', consumer_name: '', consumer_email: '',
    vehicle_reg: '', serial_text: '', sku_id: '', retailer_id: '',
    registered_via: 'whatsapp', cashback_amount: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterVia) params.registered_via = filterVia;
      const r: any = await api.getConsumerRegistrations(params);
      setItems((r?.data || r || []) as ConsumerReg[]);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load registrations');
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterVia]);

  const submit = async () => {
    if (!form.consumer_phone.trim()) return toast.error('Consumer phone is required.');
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        consumer_phone: form.consumer_phone.trim(),
        registered_via: form.registered_via,
      };
      if (form.consumer_name)   body.consumer_name = form.consumer_name;
      if (form.consumer_email)  body.consumer_email = form.consumer_email;
      if (form.vehicle_reg)     body.vehicle_reg = form.vehicle_reg;
      if (form.serial_text)     body.serial_text = form.serial_text;
      if (form.sku_id)          body.sku_id = form.sku_id;
      if (form.retailer_id)     body.retailer_id = form.retailer_id;
      if (form.cashback_amount) body.cashback_amount = Number(form.cashback_amount);
      const r: any = await api.createConsumerRegistration(body);
      const reg = r?.data || r;
      toast.success(
        reg?.lead_id
          ? 'Registered — CRM lead auto-created.'
          : 'Registered. (Lead hop deferred.)'
      );
      setShowForm(false);
      setForm({
        consumer_phone: '', consumer_name: '', consumer_email: '',
        vehicle_reg: '', serial_text: '', sku_id: '', retailer_id: '',
        registered_via: 'whatsapp', cashback_amount: '',
      });
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to register consumer.');
    }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader
        title="Consumer Registry"
        subtitle="Every registration spawns a tertiary sale + a CRM lead. Phone is primary identity; vehicle reg helps on tyre / two-wheeler tenants."
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/dashboard/distribution/last-mile" style={btnLink}>← Overview</Link>
            <Btn onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Register'}</Btn>
          </div>
        }
      />

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'end' }}>
            <F label="Consumer phone *" value={form.consumer_phone} onChange={(v) => setForm({ ...form, consumer_phone: v })} />
            <F label="Consumer name"    value={form.consumer_name}  onChange={(v) => setForm({ ...form, consumer_name: v })} />
            <F label="Consumer email"   value={form.consumer_email} onChange={(v) => setForm({ ...form, consumer_email: v })} />
            <F label="Vehicle reg"      value={form.vehicle_reg}    onChange={(v) => setForm({ ...form, vehicle_reg: v })} />
            <F label="Serial / DOT"     value={form.serial_text}    onChange={(v) => setForm({ ...form, serial_text: v })} />
            <F label="SKU id (optional)" value={form.sku_id}        onChange={(v) => setForm({ ...form, sku_id: v })} />
            <F label="Retailer id"      value={form.retailer_id}    onChange={(v) => setForm({ ...form, retailer_id: v })} />
            <SF label="Channel"
              value={form.registered_via}
              onChange={(v) => setForm({ ...form, registered_via: v })}
              options={VIA_OPTIONS}
            />
            <F label="Cashback (₹)"     value={form.cashback_amount} onChange={(v) => setForm({ ...form, cashback_amount: v })} />
          </div>
          <div style={{ marginTop: 14 }}>
            <Btn disabled={busy} onClick={submit}>{busy ? 'Registering…' : 'Register'}</Btn>
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Filter</span>
          <SF
            label=""
            value={filterVia}
            onChange={setFilterVia}
            options={[{ value: '', label: 'All channels' }, ...VIA_OPTIONS]}
            small
          />
        </div>
      </Card>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>Consumer</Th>
            <Th>Phone</Th>
            <Th>Vehicle</Th>
            <Th>Serial</Th>
            <Th>Channel</Th>
            <Th>Cashback</Th>
            <Th>Lead</Th>
            <Th>Registered</Th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><Td>Loading…</Td><Td>—</Td><Td>—</Td><Td>—</Td><Td>—</Td><Td>—</Td><Td>—</Td><Td>—</Td></tr>
            ) : items.length === 0 ? (
              <tr><Td colSpan={8 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No registrations yet.</Td></tr>
            ) : (
              items.map((r) => (
                <tr key={r.id}>
                  <Td>{r.consumer_name || <span style={{ color: 'var(--text-dim)' }}>—</span>}</Td>
                  <Td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{r.consumer_phone}</Td>
                  <Td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{r.vehicle_reg || '—'}</Td>
                  <Td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{r.serial_text || '—'}</Td>
                  <Td><Pill color={VIA_COLORS[r.registered_via] || 'gray'}>{r.registered_via.replace(/_/g, ' ')}</Pill></Td>
                  <Td>{r.cashback_amount ? `₹${r.cashback_amount}` : '—'}</Td>
                  <Td>
                    {r.lead_id ? (
                      <Link href={`/dashboard/crm/leads/${r.lead_id}`} style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                        View lead ↗
                      </Link>
                    ) : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                  </Td>
                  <Td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{fmtDate(r.registered_at)}</Td>
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
