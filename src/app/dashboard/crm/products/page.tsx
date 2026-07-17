'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmProducts, crmProductCategories } from '../../../../lib/crmApi';
import { formatINR } from '../../../../lib/formatCurrency';
import type { Product, ProductCategory } from '../../../../types/crm';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';

export default function ProductsListPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [cats, setCats] = useState<ProductCategory[]>([]);
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState<string>('');
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        crmProducts.list({ q: q || undefined, category_id: catFilter || undefined }),
        crmProductCategories.list(),
      ]);
      let list = p.data || [];
      if (!showInactive) list = list.filter((it) => it.is_active);
      setItems(list);
      setCats(c.data || []);
    } catch (e: any) { toast.error(e.message || 'Failed to load products'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [q, catFilter, showInactive]);

  const handleDelete = async (p: Product) => {
    if (!confirm(`Delete product "${p.name}"? It will be removed from the list.`)) return;
    try {
      await crmProducts.remove(p.id);
      toast.success('Product deleted');
      setItems((prev) => prev.filter((it) => it.id !== p.id));
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };

  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700 };
  const catName = (id?: string | null) => cats.find((c) => c.id === id)?.name ?? '—';

  // Type-aware client-side column sorting. Raw values per column (price, weight,
  // price/tonne and tax as numbers; category by its resolved name; Active bool).
  const productVal = useCallback((p: Product, key: string): unknown => {
    const w = p.weight_kg ?? 0;
    switch (key) {
      case 'sku': return p.sku;
      case 'name': return p.name;
      case 'category': return cats.find((c) => c.id === p.category_id)?.name ?? '';
      case 'price': return Number(p.price);
      case 'weight': return w;
      case 'per_tonne': return w > 0 ? Math.round((Number(p.price) / w) * 1000) : null;
      case 'tax': return p.tax_rate_pct ?? 0;
      case 'hsn': return p.hsn_code;
      case 'active': return p.is_active;
      default: return (p as unknown as Record<string, unknown>)[key];
    }
  }, [cats]);
  const { sorted, sort, toggle } = useTableSort<Product>(items, productVal, { key: null, dir: 'asc' });
  const { pageItems: pagedProducts, bar } = usePagination(sorted);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/dashboard/crm/products/categories" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>Categories</Link>
          <Link href="/dashboard/crm/products/new"
            style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ New Product</Link>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder="Search SKU, name..." value={q} onChange={(e) => setQ(e.target.value)}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 220 }} />
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-dim)' }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
          </label>
      </div>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}><SortLabel label="SKU" sortKey="sku" sort={sort} onToggle={toggle} /></th>
            <th style={th}><SortLabel label="Name" sortKey="name" sort={sort} onToggle={toggle} /></th>
            <th style={th}><SortLabel label="Category" sortKey="category" sort={sort} onToggle={toggle} /></th>
            <th style={th}><SortLabel label="Price" sortKey="price" sort={sort} onToggle={toggle} /></th>
            <th style={th}><SortLabel label="Weight" sortKey="weight" sort={sort} onToggle={toggle} /></th>
            <th style={th}><SortLabel label="Price/tonne" sortKey="per_tonne" sort={sort} onToggle={toggle} /></th>
            <th style={th}><SortLabel label="Tax %" sortKey="tax" sort={sort} onToggle={toggle} /></th>
            <th style={th}><SortLabel label="HSN" sortKey="hsn" sort={sort} onToggle={toggle} /></th>
            <th style={th}><SortLabel label="Active" sortKey="active" sort={sort} onToggle={toggle} /></th>
            <th style={{ ...th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No products yet.</td></tr>}
            {pagedProducts.map((p) => {
              const w = p.weight_kg ?? 0;
              const perTonne = w > 0 ? Math.round((Number(p.price) / w) * 1000) : null;
              return (
              <tr key={p.id}>
                <td style={td}><Link href={`/dashboard/crm/products/${p.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{p.sku}</Link></td>
                <td style={td}>{p.name}</td>
                <td style={td}>{catName(p.category_id)}</td>
                <td style={td}>{formatINR(p.price)}</td>
                <td style={td}>{w > 0 ? `${w} kg` : '—'}</td>
                <td style={td}>{perTonne != null ? formatINR(perTonne) : '—'}</td>
                <td style={td}>{p.tax_rate_pct ?? 0}%</td>
                <td style={td}>{p.hsn_code || '—'}</td>
                <td style={td}>{p.is_active ? 'Yes' : <span style={{ color: 'var(--text-dim)' }}>No</span>}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <Link href={`/dashboard/crm/products/${p.id}`} style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 12, marginRight: 12, textDecoration: 'none' }}>Edit</Link>
                  <button type="button" onClick={() => handleDelete(p)} style={{ background: 'transparent', border: '1px solid #E01E2C', color: '#E01E2C', padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Delete</button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bar}
    </div>
  );
}
