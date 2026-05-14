'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmDeals, crmPipelines, crmProducts } from '../../../../../lib/crmApi';
import type { Pipeline, Product } from '../../../../../types/crm';
import ClientScopeField from '../../../../../components/ClientScopeField';

// useSearchParams() forces a Suspense boundary on Next 14. The inner
// component reads ?pipeline_id= so the Pipeline page's "+ New Deal" CTA
// can preselect the pipeline.

export default function NewDealPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: 'var(--text-dim)' }}>Loading…</div>}>
      <NewDealPageInner />
    </Suspense>
  );
}

function NewDealPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialPipelineId = sp.get('pipeline_id') ?? '';
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  // Catalog of weight-based products. Picking one lets the user enter volume
  // in kilograms and we auto-compute amount as: volume_kg / weight_kg × price.
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({
    name: '', amount: '', volume_kg: '', product_id: '',
    pipeline_id: initialPipelineId, stage_id: '', expected_close_date: '',
    client_id: '',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, pr] = await Promise.allSettled([crmPipelines.list(), crmProducts.list()]);
        if (p.status === 'fulfilled') {
          const data = p.value.data || [];
          setPipelines(data);
          const def = data.find((x) => x.id === initialPipelineId) || data.find((x) => x.is_default) || data[0];
          if (def) setForm((f) => ({ ...f, pipeline_id: def.id, stage_id: def.stages?.[0]?.id || '' }));
        }
        if (pr.status === 'fulfilled') {
          // Only weight-based products are useful for the volume calculator.
          const list = (pr.value.data || []).filter((x: any) => x.is_active !== false && x.weight_kg && x.price);
          setProducts(list as Product[]);
        }
      } catch (e: any) { toast.error(e.message || 'Failed to load pipelines'); }
    })();
  }, [initialPipelineId]);

  // Picked product → derive ₹/kg so the volume input drives amount.
  const pricePerKg = useMemo(() => {
    const p = products.find((x) => x.id === form.product_id);
    if (!p || !p.weight_kg || !p.price) return 0;
    return Number(p.price) / Number(p.weight_kg);
  }, [products, form.product_id]);

  const onVolumeChange = (val: string) => {
    setForm((f) => {
      const next = { ...f, volume_kg: val };
      if (pricePerKg > 0 && val !== '') {
        const v = Number(val);
        if (!Number.isNaN(v)) next.amount = String(Math.round(v * pricePerKg));
      }
      return next;
    });
  };
  const onAmountChange = (val: string) => {
    setForm((f) => {
      const next = { ...f, amount: val };
      if (pricePerKg > 0 && val !== '') {
        const a = Number(val);
        if (!Number.isNaN(a)) next.volume_kg = (a / pricePerKg).toFixed(2);
      }
      return next;
    });
  };
  const onProductChange = (id: string) => {
    setForm((f) => {
      const next = { ...f, product_id: id };
      // Re-derive amount from the existing volume against the new product's rate.
      const p = products.find((x) => x.id === id);
      if (p?.weight_kg && p?.price && f.volume_kg !== '') {
        const ppk = Number(p.price) / Number(p.weight_kg);
        const v = Number(f.volume_kg);
        if (!Number.isNaN(v)) next.amount = String(Math.round(v * ppk));
      }
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await crmDeals.create({
        name: form.name,
        amount: form.amount ? Number(form.amount) : null,
        pipeline_id: form.pipeline_id,
        stage_id: form.stage_id,
        expected_close_date: form.expected_close_date || null,
        // Stamp the active client (picker or super-admin selection); backend
        // honours this for super_admin / org admins, ignores for JWT-pinned users.
        client_id: form.client_id || undefined,
      } as any);
      toast.success('Deal created');
      router.push(`/dashboard/crm/deals/${r.data.id}`);
    } catch (err: any) { toast.error(err.message || 'Create failed'); setBusy(false); }
  };

  const currentPipeline = pipelines.find((p) => p.id === form.pipeline_id);
  const stages = currentPipeline?.stages || [];
  const selectedProduct = products.find((p) => p.id === form.product_id);

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 760 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>New Deal</h2>
      <ClientScopeField value={form.client_id} onChange={(id) => setForm({ ...form, client_id: id })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={input} /></Field>

        {/* Product + Volume — when a product is picked the user enters a
            volume in kg and amount auto-fills from product price/weight. */}
        <Field label="Product (optional)">
          <select value={form.product_id} onChange={(e) => onProductChange(e.target.value)} style={input}>
            <option value="">— None —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} (₹{Number(p.price).toFixed(0)}/unit · {p.weight_kg} kg)</option>)}
          </select>
        </Field>
        {selectedProduct && (
          <Field label="Volume (kg)">
            <input type="number" step="0.01" value={form.volume_kg} onChange={(e) => onVolumeChange(e.target.value)} placeholder="e.g. 12500" style={input} />
          </Field>
        )}

        <Field label="Amount (INR)"><input type="number" step="0.01" value={form.amount} onChange={(e) => onAmountChange(e.target.value)} style={input} /></Field>
        <Field label="Pipeline"><select value={form.pipeline_id} onChange={(e) => { const p = pipelines.find((pp) => pp.id === e.target.value); setForm({ ...form, pipeline_id: e.target.value, stage_id: p?.stages?.[0]?.id || '' }); }} style={input}>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Stage"><select value={form.stage_id} onChange={(e) => setForm({ ...form, stage_id: e.target.value })} style={input}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Close Date"><input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} style={input} /></Field>
      </div>

      {selectedProduct && pricePerKg > 0 && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text-dim)' }}>
          {selectedProduct.name}: <strong style={{ color: 'var(--text)' }}>₹{pricePerKg.toFixed(2)}/kg</strong> (₹{Math.round(pricePerKg * 1000).toLocaleString('en-IN')}/tonne) · editing volume auto-fills amount and vice versa.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={btnGhost}>Cancel</button>
        <button type="submit" disabled={busy} style={btnPrimary}>{busy ? 'Saving...' : 'Create'}</button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
