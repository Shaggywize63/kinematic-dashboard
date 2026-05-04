'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmDeals, crmLineItems, crmProducts } from '../../lib/crmApi';
import { formatINR } from '../../lib/formatCurrency';
import type { DealLineItem, Product } from '../../types/crm';

export default function DealLineItemsPanel({ dealId, onChange }: { dealId: string; onChange?: () => void }) {
  const [items, setItems] = useState<DealLineItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ product_id: '', name: '', quantity: '1', unit_price: '', discount_pct: '0', tax_pct: '18' });

  const reload = async () => {
    setLoading(true);
    try {
      const [li, p] = await Promise.all([
        crmDeals.listLineItems(dealId),
        crmProducts.list({ is_active: true }),
      ]);
      setItems(li.data || []);
      setProducts(p.data || []);
    } catch (e: any) { toast.error(e.message || 'Failed to load line items'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [dealId]);

  const onPickProduct = (id: string) => {
    const product = products.find((p) => p.id === id);
    setDraft({
      ...draft,
      product_id: id,
      name: product?.name ?? draft.name,
      unit_price: product ? String(product.price) : draft.unit_price,
      tax_pct: product?.tax_rate_pct != null ? String(product.tax_rate_pct) : draft.tax_pct,
    });
  };

  const add = async () => {
    if (!draft.name && !draft.product_id) { toast.error('Pick a product or enter a name'); return; }
    setAdding(true);
    try {
      await crmDeals.addLineItem(dealId, {
        product_id: draft.product_id || null,
        name: draft.name || undefined,
        quantity: Number(draft.quantity || 1),
        unit_price: draft.unit_price ? Number(draft.unit_price) : undefined,
        discount_pct: draft.discount_pct ? Number(draft.discount_pct) : 0,
        tax_pct: draft.tax_pct ? Number(draft.tax_pct) : 0,
      } as any);
      setDraft({ product_id: '', name: '', quantity: '1', unit_price: '', discount_pct: '0', tax_pct: '18' });
      reload();
      onChange?.();
    } catch (err: any) { toast.error(err.message || 'Failed to add line item'); }
    finally { setAdding(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this line item?')) return;
    try { await crmLineItems.remove(id); reload(); onChange?.(); }
    catch (err: any) { toast.error(err.message || 'Failed'); }
  };

  const total = items.reduce((s, it) => s + Number(it.line_total || 0), 0);

  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s3)', fontWeight: 700 };

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Line Items</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Total: <span style={{ color: 'var(--text)', fontWeight: 700 }}>{formatINR(total)}</span></div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Item</th><th style={th}>Qty</th><th style={th}>Price</th><th style={th}>Disc %</th><th style={th}>Tax %</th><th style={th}>Total</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No line items.</td></tr>}
            {items.map((it) => (
              <tr key={it.id}>
                <td style={td}><div style={{ fontWeight: 600 }}>{it.name}</div>{it.sku && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{it.sku}</div>}</td>
                <td style={td}>{it.quantity}</td>
                <td style={td}>{formatINR(it.unit_price)}</td>
                <td style={td}>{it.discount_pct ?? 0}%</td>
                <td style={td}>{it.tax_pct ?? 0}%</td>
                <td style={td}>{formatINR(it.line_total)}</td>
                <td style={td}><button onClick={() => remove(it.id)} style={{ background: 'transparent', border: 'none', color: '#E01E2C', cursor: 'pointer', fontSize: 11 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 14, padding: 12, background: 'var(--s3)', borderRadius: 8, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
        <Field label="Product / Item">
          <select value={draft.product_id} onChange={(e) => onPickProduct(e.target.value)} style={input}>
            <option value="">Custom item…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatINR(p.price)}</option>)}
          </select>
          {!draft.product_id && (
            <input placeholder="Item name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ ...input, marginTop: 6 }} />
          )}
        </Field>
        <Field label="Qty"><input type="number" min="1" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} style={input} /></Field>
        <Field label="Price"><input type="number" step="0.01" value={draft.unit_price} onChange={(e) => setDraft({ ...draft, unit_price: e.target.value })} style={input} /></Field>
        <Field label="Disc %"><input type="number" step="0.01" value={draft.discount_pct} onChange={(e) => setDraft({ ...draft, discount_pct: e.target.value })} style={input} /></Field>
        <Field label="Tax %"><input type="number" step="0.01" value={draft.tax_pct} onChange={(e) => setDraft({ ...draft, tax_pct: e.target.value })} style={input} /></Field>
        <button onClick={add} disabled={adding} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', height: 36 }}>{adding ? '...' : 'Add'}</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12 };
