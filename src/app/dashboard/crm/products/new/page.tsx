'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmProducts, crmProductCategories } from '../../../../../lib/crmApi';
import type { ProductCategory } from '../../../../../types/crm';

export default function NewProductPage() {
  const router = useRouter();
  const [cats, setCats] = useState<ProductCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    sku: '', name: '', description: '', category_id: '', unit: 'each',
    price: '', currency: 'INR', tax_rate_pct: '18', hsn_code: '', image_url: '', is_active: true,
  });

  useEffect(() => {
    (async () => {
      try { const r = await crmProductCategories.list(); setCats(r.data || []); }
      catch (e: any) { toast.error(e.message || 'Failed to load categories'); }
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await crmProducts.create({
        sku: form.sku,
        name: form.name,
        description: form.description || undefined,
        category_id: form.category_id || undefined,
        unit: form.unit || 'each',
        price: form.price ? Number(form.price) : 0,
        currency: form.currency || 'INR',
        tax_rate_pct: form.tax_rate_pct ? Number(form.tax_rate_pct) : 0,
        hsn_code: form.hsn_code || undefined,
        image_url: form.image_url || undefined,
        is_active: form.is_active,
      } as any);
      toast.success('Product created');
      router.push(`/dashboard/crm/products/${r.data.id}`);
    } catch (err: any) { toast.error(err.message || 'Create failed'); setBusy(false); }
  };

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 760 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>New Product</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Field label="SKU"><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required style={input} /></Field>
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={input} /></Field>
        <Field label="Category">
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} style={input}>
            <option value="">— None —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Unit"><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={input} /></Field>
        <Field label="Price (INR)"><input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={input} /></Field>
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
