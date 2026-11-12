'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmProducts, crmProductCategories, crmMakes, crmBrands } from '../../../../../lib/crmApi';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import type { ProductCategory, Make, Brand } from '../../../../../types/crm';

export default function NewProductPage() {
  const router = useRouter();
  const [cats, setCats] = useState<ProductCategory[]>([]);
  const [busy, setBusy] = useState(false);
  // Connected-B2B (Spark & Ray): Make / Brand selects and "Product reference" wording. Read after mount (localStorage).
  const [b2b, setB2b] = useState(false);
  const [makes, setMakes] = useState<Make[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [refError, setRefError] = useState('');
  const [form, setForm] = useState({
    sku: '', name: '', description: '', category_id: '', make_id: '', brand_id: '', unit: 'each',
    price: '', weight_kg: '', currency: 'INR', tax_rate_pct: '18', hsn_code: '', image_url: '', is_active: true,
  });

  // Derived per-kg / per-tonne pricing for weight-based goods (TMT, cement, etc.).
  // Helps the rep sanity-check a quote without doing the math by hand.
  const priceNum = Number(form.price) || 0;
  const weightNum = Number(form.weight_kg) || 0;
  const pricePerKg  = weightNum > 0 ? priceNum / weightNum : 0;
  const pricePerTon = pricePerKg * 1000;

  useEffect(() => {
    (async () => {
      try { const r = await crmProductCategories.list(); setCats(r.data || []); }
      catch (e: any) { toast.error(e.message || 'Failed to load categories'); }
    })();
  }, []);

  useEffect(() => {
    const on = isB2bClientActive();
    setB2b(on);
    if (!on) return;
    crmMakes.list().then((r) => setMakes((r.data || []).filter((m) => m.is_active))).catch(() => setMakes([]));
    crmBrands.list().then((r) => setBrands((r.data || []).filter((m) => m.is_active))).catch(() => setBrands([]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setRefError('');
    try {
      await crmProducts.create({
        sku: form.sku,
        name: form.name,
        description: form.description || undefined,
        category_id: form.category_id || undefined,
        ...(b2b ? { make_id: form.make_id || null, brand_id: form.brand_id || null } : {}),
        unit: form.unit || 'each',
        price: form.price ? Number(form.price) : 0,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : undefined,
        currency: form.currency || 'INR',
        tax_rate_pct: form.tax_rate_pct ? Number(form.tax_rate_pct) : 0,
        hsn_code: form.hsn_code || undefined,
        image_url: form.image_url || undefined,
        is_active: form.is_active,
      } as any);
      toast.success('Product created');
      // Land back on the products list so the rep can see the new row in
      // context and immediately add another if needed.
      router.push('/dashboard/crm/products');
    } catch (err: any) {
      // A repeated product reference is shown on the reference field itself.
      if (b2b && err?.status === 409) setRefError(err.message || 'A product with this reference already exists');
      else toast.error(err.message || 'Create failed');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 760 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>New Product</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Field label={b2b ? 'Product reference' : 'SKU'} error={refError}><input value={form.sku} onChange={(e) => { setForm({ ...form, sku: e.target.value }); setRefError(''); }} required aria-invalid={refError ? true : undefined} style={refError ? { ...input, borderColor: '#E01E2C' } : input} /></Field>
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={input} /></Field>
        <Field label="Category">
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} style={input}>
            <option value="">— None —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {b2b && (
          <Field label="Make">
            <select value={form.make_id} onChange={(e) => setForm({ ...form, make_id: e.target.value })} style={input}>
              <option value="">— None —</option>
              {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        )}
        {b2b && (
          <Field label="Brand">
            <select value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })} style={input}>
              <option value="">— None —</option>
              {brands.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Unit"><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={input} /></Field>
        <Field label="Price per unit (INR)"><input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={input} /></Field>
        <Field label="Weight per unit (kg)"><input type="number" step="0.001" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} placeholder="e.g. 85 (one TMT bar)" style={input} /></Field>
        <Field label="Tax %"><input type="number" step="0.01" value={form.tax_rate_pct} onChange={(e) => setForm({ ...form, tax_rate_pct: e.target.value })} style={input} /></Field>
        <Field label="HSN code"><input value={form.hsn_code} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} style={input} /></Field>
        <Field label="Image URL"><input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} style={input} /></Field>
        <Field label="Description"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} style={{ ...input, resize: 'vertical' }} /></Field>
        <Field label="Active">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Available for selection on deals
          </label>
        </Field>
      </div>
      {weightNum > 0 && priceNum > 0 && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6 }}>Derived</span>
          <span style={{ fontSize: 13, color: 'var(--text)' }}>Price/kg: <strong>₹{pricePerKg.toFixed(2)}</strong></span>
          <span style={{ fontSize: 13, color: 'var(--text)' }}>Price/tonne: <strong>₹{Math.round(pricePerTon).toLocaleString('en-IN')}</strong></span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={btnGhost}>Cancel</button>
        <button type="submit" disabled={busy} style={btnPrimary}>{busy ? 'Saving...' : 'Create'}</button>
      </div>
    </form>
  );
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      {children}
      {error && <span role="alert" data-testid="field-error" style={{ fontSize: 12, color: '#E01E2C', textTransform: 'none', fontWeight: 400 }}>{error}</span>}
    </label>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
