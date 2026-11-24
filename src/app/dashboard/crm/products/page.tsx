'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { FolderTree, Package, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { IconTile, InlineIcon } from '../../../../components/ui/PageIcon';
import { TOOLBAR_BTN_MIN_WIDTH } from '../../../../components/ui';
import { CrmToolbarRight } from '../../../../components/crm/layout/CrmPageToolbar';
import { crmCustomFields, crmProducts, crmProductCategories } from '../../../../lib/crmApi';
import { formatINR } from '../../../../lib/formatCurrency';
import { isB2bClientActive } from '../../../../lib/b2bClient';
import type { CustomField, Product, ProductCategory } from '../../../../types/crm';
import ProductImportModal from '../../../../components/crm/ProductImportModal';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';
import { useConfirm } from '../../../../components/ConfirmProvider';

export default function ProductsListPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [cats, setCats] = useState<ProductCategory[]>([]);
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState<string>('');
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  // Connected-B2B (Spark & Ray) only: a free-text Make column and "Reference" wording instead of
  // Category/Weight/Tax/HSN columns. No Brand / Category for Spark. `null` until read after mount, so other
  // clients load exactly as before. The spreadsheet import (below) is NOT part of this — ProductImportModal and
  // POST /crm/products/bulk are plain tenant-scoped CRUD with no B2B-specific behaviour, so every client gets it.
  const [b2b, setB2b] = useState<boolean | null>(null);
  useEffect(() => { setB2b(isB2bClientActive()); }, []);
  const [importing, setImporting] = useState(false);
  // The client's OWN product columns (Settings -> Custom Fields, entity "product"), shown after the built-ins
  // so an imported value is visible on the list and not only on the detail page. Hidden ones are left out.
  const [customCols, setCustomCols] = useState<CustomField[]>([]);
  const confirm = useConfirm();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await crmCustomFields.list({ entity_type: 'product' });
        if (alive) {
          setCustomCols((r.data || []).filter((f) => f.hidden !== true)
            .slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
        }
      } catch { if (alive) setCustomCols([]); }
    })();
    return () => { alive = false; };
  }, []);

  const reload = async () => {
    if (b2b === null) return;
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        // Category filters only non-B2B tenants (Spark products carry no category).
        crmProducts.list({ q: q || undefined, ...(b2b ? {} : { category_id: catFilter || undefined }) }),
        crmProductCategories.list(),
      ]);
      let list = p.data || [];
      if (!showInactive) list = list.filter((it) => it.is_active);
      setItems(list);
      setCats(c.data || []);
    } catch (e: any) { toast.error(e.message || 'Failed to load products'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [q, catFilter, showInactive, b2b]);

  const handleDelete = async (p: Product) => {
    const ok = await confirm({
      title: 'Delete this product?',
      message: 'It will be removed from the list.',
      itemName: p.name,
      confirmLabel: 'Delete product',
    });
    if (!ok) return;
    try {
      await crmProducts.remove(p.id);
      toast.success('Product deleted');
      setItems((prev) => prev.filter((it) => it.id !== p.id));
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };

  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700 };
  const colCount = (b2b ? 6 : 10) + customCols.length;
  const catName = (id?: string | null) => cats.find((c) => c.id === id)?.name ?? '—';

  /** One of the client's own values as list text, formatted by the column's type. */
  const showCustom = (f: CustomField, v: unknown): string => {
    if (v === undefined || v === null || v === '') return '—';
    if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (f.field_type === 'currency' && typeof v === 'number') return formatINR(v);
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  // Type-aware client-side column sorting. Raw values per column (price, weight,
  // price/tonne and tax as numbers; category by its resolved name; Active bool).
  const productVal = useCallback((p: Product, key: string): unknown => {
    const w = p.weight_kg ?? 0;
    switch (key) {
      case 'sku': return p.sku;
      case 'make': return p.make ?? p.make_name ?? '';
      case 'name': return p.name;
      case 'category': return cats.find((c) => c.id === p.category_id)?.name ?? '';
      case 'price': return Number(p.price);
      case 'weight': return w;
      case 'per_tonne': return w > 0 ? Math.round((Number(p.price) / w) * 1000) : null;
      case 'tax': return p.tax_rate_pct ?? 0;
      case 'hsn': return p.hsn_code;
      case 'active': return p.is_active;
      default: {
        // cf:<field_key> sorts on the stored value, so a number column sorts numerically.
        if (key.startsWith('cf:')) {
          const v = (p.custom_fields ?? {})[key.slice(3)];
          return Array.isArray(v) ? v.join(', ') : (v ?? null);
        }
        return (p as unknown as Record<string, unknown>)[key];
      }
    }
  }, [cats]);
  const { sorted, sort, toggle } = useTableSort<Product>(items, productVal, { key: null, dir: 'asc' });
  const { pageItems: pagedProducts, bar } = usePagination(sorted);

  return (
    <div>
      <CrmToolbarRight>
        <Link href="/dashboard/crm/products/categories" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: TOOLBAR_BTN_MIN_WIDTH.md }}><InlineIcon icon={FolderTree} />Categories</Link>
        <button type="button" onClick={() => setImporting(true)}
          style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: TOOLBAR_BTN_MIN_WIDTH.md }}><InlineIcon icon={Upload} />Import from file</button>
        <Link href="/dashboard/crm/products/new"
          style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: TOOLBAR_BTN_MIN_WIDTH.md }}><InlineIcon icon={Plus} />New Product</Link>
      </CrmToolbarRight>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder={b2b ? 'Search reference, name...' : 'Search SKU, name...'} aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 220 }} />
          {!b2b && (
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
              style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
              <option value="">All categories</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-dim)' }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
          </label>
      </div>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}><SortLabel label={b2b ? 'Reference' : 'SKU'} sortKey="sku" sort={sort} onToggle={toggle} /></th>
            <th style={th}><SortLabel label="Name" sortKey="name" sort={sort} onToggle={toggle} /></th>
            {b2b && <th style={th}><SortLabel label="Make" sortKey="make" sort={sort} onToggle={toggle} /></th>}
            {!b2b && <th style={th}><SortLabel label="Category" sortKey="category" sort={sort} onToggle={toggle} /></th>}
            <th style={th}><SortLabel label="Price" sortKey="price" sort={sort} onToggle={toggle} /></th>
            {!b2b && <th style={th}><SortLabel label="Weight" sortKey="weight" sort={sort} onToggle={toggle} /></th>}
            {!b2b && <th style={th}><SortLabel label="Price/tonne" sortKey="per_tonne" sort={sort} onToggle={toggle} /></th>}
            {!b2b && <th style={th}><SortLabel label="Tax %" sortKey="tax" sort={sort} onToggle={toggle} /></th>}
            {!b2b && <th style={th}><SortLabel label="HSN" sortKey="hsn" sort={sort} onToggle={toggle} /></th>}
            <th style={th}><SortLabel label="Active" sortKey="active" sort={sort} onToggle={toggle} /></th>
            {customCols.map((f) => (
              <th key={f.id} style={th} data-testid="product-custom-col">
                <SortLabel label={f.label} sortKey={`cf:${f.field_key}`} sort={sort} onToggle={toggle} />
              </th>
            ))}
            <th style={{ ...th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}><IconTile icon={Package} size={40} iconSize={20} style={{ display: 'flex', margin: '8px auto' }} />No products yet.</td></tr>}
            {pagedProducts.map((p) => {
              const w = p.weight_kg ?? 0;
              const perTonne = w > 0 ? Math.round((Number(p.price) / w) * 1000) : null;
              return (
              <tr key={p.id}>
                <td style={td}><Link href={`/dashboard/crm/products/${p.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{p.sku}</Link></td>
                <td style={td}>{p.name}</td>
                {b2b && <td style={td}>{p.make || p.make_name || '—'}</td>}
                {!b2b && <td style={td}>{catName(p.category_id)}</td>}
                <td style={td}>{formatINR(p.price)}</td>
                {!b2b && <td style={td}>{w > 0 ? `${w} kg` : '—'}</td>}
                {!b2b && <td style={td}>{perTonne != null ? formatINR(perTonne) : '—'}</td>}
                {!b2b && <td style={td}>{p.tax_rate_pct ?? 0}%</td>}
                {!b2b && <td style={td}>{p.hsn_code || '—'}</td>}
                <td style={td}>{p.is_active ? 'Yes' : <span style={{ color: 'var(--text-dim)' }}>No</span>}</td>
                {customCols.map((f) => <td key={f.id} style={td}>{showCustom(f, (p.custom_fields ?? {})[f.field_key])}</td>)}
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <Link href={`/dashboard/crm/products/${p.id}`} style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 12, marginRight: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}><InlineIcon icon={Pencil} size={13} />Edit</Link>
                  <button type="button" onClick={() => handleDelete(p)} style={{ background: 'transparent', border: '1px solid #E01E2C', color: '#E01E2C', padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}><InlineIcon icon={Trash2} size={13} />Delete</button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bar}
      {importing && (
        <ProductImportModal
          onClose={() => setImporting(false)}
          onImported={() => { reload(); }}
        />
      )}
    </div>
  );
}
