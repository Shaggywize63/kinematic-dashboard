'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '../../../../../lib/api';
import { Card, PageHeader, Btn } from '../../../../../components/distribution/Atoms';

const PROMO_TYPES = ['price_off', 'free_goods', 'display', 'slotting', 'volume_rebate', 'visibility', 'other'];
const FUNDING = ['brand', 'distributor', 'shared'];
const STATUSES = ['draft', 'active', 'paused', 'closed'];

// Comma-separated text → trimmed string[] (empty entries dropped).
const csv = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);

export default function NewPromotionPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    code: '', name: '', promo_type: 'price_off', funding_source: 'brand', status: 'draft',
    objective: '', budget_amount: '', currency: 'INR', valid_from: '', valid_to: '', notes: '',
    customer_classes: '', regions: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) { setErr('Code and Name are required.'); return; }
    setBusy(true); setErr(null);
    try {
      const body: any = {
        code: form.code.trim(),
        name: form.name.trim(),
        promo_type: form.promo_type,
        funding_source: form.funding_source,
        status: form.status,
        currency: form.currency.trim() || 'INR',
      };
      if (form.objective.trim()) body.objective = form.objective.trim();
      if (form.budget_amount.trim()) body.budget_amount = Number(form.budget_amount);
      if (form.valid_from) body.valid_from = form.valid_from;
      if (form.valid_to) body.valid_to = form.valid_to;
      if (form.notes.trim()) body.notes = form.notes.trim();
      const targeting: any = {};
      if (form.customer_classes.trim()) targeting.customer_classes = csv(form.customer_classes);
      if (form.regions.trim()) targeting.regions = csv(form.regions);
      if (Object.keys(targeting).length) body.targeting = targeting;

      const r: any = await api.createPromotion(body);
      const created = r?.data || r;
      if (created?.id) router.push(`/dashboard/distribution/promotions/${created.id}`);
      else router.push('/dashboard/distribution/promotions');
    } catch (e: any) {
      setErr(e.message || 'Failed to create promotion');
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="New Trade Promotion"
        subtitle="Define a promotion — budget, funding and targeting. Claims and ROI are tracked on the detail page."
        right={<a href="/dashboard/distribution/promotions" style={{ color: 'var(--text-dim)', fontSize: 13 }}>← All promotions</a>}
      />

      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'end' }}>
          <Field label="Code *" value={form.code} onChange={(v) => set('code', v.toUpperCase())} />
          <Field label="Name *" value={form.name} onChange={(v) => set('name', v)} />
          <SelectField label="Type" value={form.promo_type} onChange={(v) => set('promo_type', v)} options={PROMO_TYPES} />
          <SelectField label="Funding source" value={form.funding_source} onChange={(v) => set('funding_source', v)} options={FUNDING} />
          <SelectField label="Status" value={form.status} onChange={(v) => set('status', v)} options={STATUSES} />
          <Field label="Budget amount" value={form.budget_amount} onChange={(v) => set('budget_amount', v)} placeholder="e.g. 500000" />
          <Field label="Currency" value={form.currency} onChange={(v) => set('currency', v.toUpperCase())} />
          <Field label="Valid from" value={form.valid_from} onChange={(v) => set('valid_from', v)} placeholder="YYYY-MM-DD" />
          <Field label="Valid to" value={form.valid_to} onChange={(v) => set('valid_to', v)} placeholder="YYYY-MM-DD" />
        </div>

        <div style={{ marginTop: 12 }}>
          <TextField label="Objective" value={form.objective} onChange={(v) => set('objective', v)} placeholder="What this promotion is meant to achieve" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <Field label="Customer classes (comma-separated)" value={form.customer_classes} onChange={(v) => set('customer_classes', v)} placeholder="GT, MT, HORECA" />
          <Field label="Regions (comma-separated)" value={form.regions} onChange={(v) => set('regions', v)} placeholder="North, West" />
        </div>

        <div style={{ marginTop: 12 }}>
          <TextField label="Notes" value={form.notes} onChange={(v) => set('notes', v)} />
        </div>

        {err && <div style={{ marginTop: 10, color: 'var(--primary)', fontSize: 12 }}>{err}</div>}
        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <Btn disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create promotion'}</Btn>
          <a href="/dashboard/distribution/promotions"><Btn variant="ghost">Cancel</Btn></a>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div><div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div><input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }} /></div>;
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return <div><div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div><select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>;
}
function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div><div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div><textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={2} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }} /></div>;
}
