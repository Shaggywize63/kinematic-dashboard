'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmProducts, crmProductCategories } from '../../../../../lib/crmApi';
import type { Product, ProductCategory } from '../../../../../types/crm';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [cats, setCats] = useState<ProductCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const [p, c] = await Promise.all([crmProducts.get(id), crmProductCategories.list()]);
        setProduct(p.data); setCats(c.data || []);
      } catch (e: any) { toast.error(e.message || 'Load failed'); } finally { setLoading(false); }
    })();
  }, [id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setBusy(true);
    try {
      const r = await crmProducts.update(product.id, {
        sku: product.sku, name: product.name, description: product.description,
        category_id: product.category_id, unit: product.unit, price: Number(product.price),
        currency: product.currency, tax_rate_pct: Number(product.tax_rate_pct ?? 0),
        hsn_code: product.hsn_code, image_url: product.image_url, is_active: product.is_active,
      } as any);
      setProduct(r.data);
      toast.success('Product saved');
    } catch (err: any) { toast.error(err.message || 'Save failed'); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!product) return;
    if (!confirm(`Delete product "${product.name}"?`)) return;
    try {
      await crmProducts.remove(product.id);
      toast.success('Deleted');
      router.push('/dashboard/crm/products');
    } catch (err: any) { toast.error(err.message || 'Delete failed'); }
  };

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;
  if (!product) return <div style={{ color: 'var(--text-dim)' }}>Product not found.</div>;

  return (
    <form onSubmit={save} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text)' }}>{product.name}</h2>
        <button type="button" onClick={remove} style={{ background: 'transparent', border: '1px solid #E01E2C', color: '#E01E2C', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Delete</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Field label="SKU"><input value={product.sku} onChange={(e) => setProduct({ ...product, sku: e.target.value })} required style={input} /></Field>
        <Field label="Name"><input value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} required style={input} /></Field>
        <Field label="Category">
          <select value={product.category_id ?? ''} onChange={(e) => setProduct({ ...product, category_id: e.target.value || null })} style={input}>
            <option value="">— None —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Unit"><input value={product.unit ?? 'each'} onChange={(e) => setProduct({ ...product, unit: e.target.value })} style={input} /></Field>
        <Field label="Price (INR)"><input type="number" step="0.01" value={product.price} onChange={(e) => setProduct({ ...product, price: Number(e.target.value) })} style={input} /></Field>
        <Field label="Tax %"><input type="number" step="0.01" value={product.tax_rate_pct ?? 0} onChange={(e) => setProduct({ ...product, tax_rate_pct: Number(e.target.value) })} style={input} /></Field>
        <Field label="HSN code"><input value={product.hsn_code ?? ''} onChange={(e) => setProduct({ ...product, hsn_code: e.target.value })} style={input} /></Field>
        <Field label="Image URL"><input value={product.image_url ?? ''} onChange={(e) => setProduct({ ...product, image_url: e.target.value })} style={input} /></Field>
        <Field label="Description"><textarea value={product.description ?? ''} onChange={(e) => setProduct({ ...product, description: e.target.value })} rows={3} style={{ ...input, resize: 'vertical' }} /></Field>
        <Field label="Active">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" checked={product.is_active} onChange={(e) => setProduct({ ...product, is_active: e.target.checked })} /> Available for selection on deals
          </label>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={btnGhost}>Back</button>
        <button type="submit" disabled={busy} style={btnPrimary}>{busy ? 'Saving...' : 'Save'}</button>
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
