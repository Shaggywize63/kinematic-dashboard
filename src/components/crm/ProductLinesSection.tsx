'use client';
import { useEffect, useMemo, useState } from 'react';
import { crmProducts } from '../../lib/crmApi';
import type { Product } from '../../types/crm';

/**
 * Multi-row "Products of Interest" editor for the lead form. Renders the
 * four product-line custom fields (Product Interested / Quantity / Unit /
 * Estimated Amount) as a single row, with an "Add product" button so the
 * rep can capture multiple SKUs against one lead.
 *
 * Estimated Amount auto-computes from the picked product:
 *
 *   amount = (product.price / product.weight_kg) * (quantity × unitFactor)
 *
 * where unitFactor is 1000 for tonne and 1 for kg. The result is rounded
 * to 2 decimals.
 *
 * State shape — stored under custom_fields.product_lines as an array of
 * { product_id, quantity, measuring_unit, estimated_amount }. To keep
 * legacy reports / exports / mobile reading the single-field shape
 * working, we also mirror row 0 onto the original four keys and sum the
 * line totals into estimated_amount. When `product_lines` doesn't exist
 * yet (older lead) we seed row 0 from those four fields.
 */

// The four product-line custom-field keys the lead form drives via this
// component. Exported so CustomFieldsSection can drop them from its
// generic grid (we render them here instead).
export const PRODUCT_LINE_KEYS = [
  'product_interested',
  'quantity',
  'measuring_unit',
  'estimated_amount',
] as const;

type ProductLine = {
  product_id?: string | null;
  quantity?: number | string | null;
  measuring_unit?: string | null;
  estimated_amount?: number | null;
};

interface Props {
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

// Round half-away-from-zero to 2dp without floating-point fuzz.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function asNumber(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

export default function ProductLinesSection({ values, onChange }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // Narrow-viewport flag — the row reflows to a stacked layout on
  // phones because four inputs side-by-side don't fit < 720px.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const f = () => setNarrow(window.innerWidth < 720);
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  useEffect(() => {
    let cancel = false;
    crmProducts.list().then((r) => {
      if (cancel) return;
      const list = (r.data || []).filter((p) => p.is_active !== false);
      setProducts(list);
    }).catch(() => { /* leave empty — picker shows "No products" */ })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, []);

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  // Per-row formula: amount = (price / weight_kg) × quantity × unit factor.
  // Returns 0 when any input is missing / non-positive so the row reads
  // as "not yet estimable" rather than NaN.
  const computeAmount = (line: ProductLine): number => {
    const id = line.product_id || '';
    if (!id) return 0;
    const p = productMap.get(id);
    if (!p) return 0;
    const price = asNumber(p.price);
    const weight = asNumber(p.weight_kg);
    const qty = asNumber(line.quantity);
    if (price <= 0 || weight <= 0 || qty <= 0) return 0;
    const unit = String(line.measuring_unit ?? '').trim().toLowerCase();
    const factor = unit === 'tonne' ? 1000 : 1;
    return round2((price / weight) * (qty * factor));
  };

  // Current row list — pulled from `product_lines` if present, otherwise
  // seeded as one row from the legacy single-field shape so existing
  // leads don't lose data on first render.
  const lines: ProductLine[] = useMemo(() => {
    const arr = values.product_lines;
    if (Array.isArray(arr) && arr.length > 0) return arr as ProductLine[];
    const legacyId = typeof values.product_interested === 'string' ? values.product_interested : null;
    const legacyQty = values.quantity as number | string | null | undefined;
    const legacyUnit = typeof values.measuring_unit === 'string' ? values.measuring_unit : null;
    const legacyAmt = typeof values.estimated_amount === 'number' ? values.estimated_amount : null;
    return [{
      product_id: legacyId,
      quantity: legacyQty ?? null,
      measuring_unit: legacyUnit,
      estimated_amount: legacyAmt,
    }];
  }, [values]);

  // Whenever the rows are written back, mirror row 0 onto the legacy
  // single-field keys (back-compat with reports / mobile readers) and
  // store the sum of all line amounts on `estimated_amount` so the
  // top-line number reflects the full basket.
  const writeLines = (next: ProductLine[]) => {
    const head = next[0] ?? {};
    const totalAmount = next.reduce((sum, l) => sum + asNumber(l.estimated_amount), 0);
    onChange({
      ...values,
      product_lines: next,
      product_interested: head.product_id ?? null,
      quantity: head.quantity ?? null,
      measuring_unit: head.measuring_unit ?? null,
      estimated_amount: totalAmount > 0 ? round2(totalAmount) : null,
    });
  };

  const updateLine = (idx: number, patch: Partial<ProductLine>) => {
    const next = lines.map((l, i) => {
      if (i !== idx) return l;
      const merged: ProductLine = { ...l, ...patch };
      merged.estimated_amount = computeAmount(merged);
      return merged;
    });
    writeLines(next);
  };

  const addLine = () => writeLines([...lines, { product_id: null, quantity: null, measuring_unit: null, estimated_amount: null }]);
  const removeLine = (idx: number) => {
    if (lines.length <= 1) {
      // Don't remove the last row — clear it instead so the rep can't end
      // up in a state with zero rows but legacy keys still populated.
      writeLines([{ product_id: null, quantity: null, measuring_unit: null, estimated_amount: null }]);
      return;
    }
    writeLines(lines.filter((_, i) => i !== idx));
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
    padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4, display: 'block',
  };

  // Sum strip — surfaces the total across rows so the rep sees the
  // basket value at a glance without scrolling row-by-row.
  const total = lines.reduce((s, l) => s + asNumber(l.estimated_amount), 0);

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Products of Interest</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
            Pick a product and quantity; the estimated amount calculates automatically from price ÷ weight × quantity.
          </div>
        </div>
        {total > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Basket total: <strong style={{ color: 'var(--text)' }}>₹{total.toLocaleString('en-IN')}</strong>
          </div>
        )}
      </div>

      {lines.map((line, idx) => (
        <div
          key={idx}
          style={{
            display: 'grid',
            // Phones: stack each field on its own line. Desktop: four
            // columns + a remove button. Grid template chosen so the
            // wider Product column doesn't squeeze the smaller numerics.
            gridTemplateColumns: narrow ? '1fr' : 'minmax(180px, 2fr) minmax(90px, 1fr) minmax(110px, 1fr) minmax(130px, 1.2fr) 32px',
            gap: 10,
            alignItems: 'end',
            marginBottom: idx === lines.length - 1 ? 4 : 10,
            paddingBottom: lines.length > 1 && idx < lines.length - 1 ? 10 : 0,
            borderBottom: lines.length > 1 && idx < lines.length - 1 ? '1px dashed var(--border)' : 'none',
          }}
        >
          <div>
            {(idx === 0 || narrow) && <label style={labelStyle}>Product Interested</label>}
            <select
              value={line.product_id ?? ''}
              onChange={(e) => updateLine(idx, { product_id: e.target.value || null })}
              style={inputStyle}
              disabled={loading}
            >
              <option value="">{loading ? 'Loading…' : (products.length === 0 ? 'No products' : '— Choose a product —')}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.sku ? ` (${p.sku})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            {(idx === 0 || narrow) && <label style={labelStyle}>Quantity</label>}
            <input
              type="number"
              min={0}
              step="0.01"
              value={line.quantity == null ? '' : String(line.quantity)}
              onChange={(e) => updateLine(idx, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="0"
              style={inputStyle}
            />
          </div>
          <div>
            {(idx === 0 || narrow) && <label style={labelStyle}>Measuring Unit</label>}
            <select
              value={line.measuring_unit ?? ''}
              onChange={(e) => updateLine(idx, { measuring_unit: e.target.value || null })}
              style={inputStyle}
            >
              <option value="">—</option>
              <option value="Kg">Kg</option>
              <option value="Tonne">Tonne</option>
            </select>
          </div>
          <div>
            {(idx === 0 || narrow) && <label style={labelStyle}>Estimated Amount</label>}
            <input
              type="text"
              readOnly
              value={line.estimated_amount ? `₹${asNumber(line.estimated_amount).toLocaleString('en-IN')}` : ''}
              placeholder="Auto"
              style={{ ...inputStyle, background: 'var(--s2)', color: 'var(--text-dim)' }}
            />
          </div>
          {/* Remove-row button. Disabled-look on the last row to signal
              that the row will be cleared (not deleted) — the form
              always needs at least one product slot. */}
          {!narrow && (
            <button
              type="button"
              onClick={() => removeLine(idx)}
              title={lines.length > 1 ? 'Remove this product' : 'Clear this row'}
              style={{
                background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)',
                width: 32, height: 36, borderRadius: 8, cursor: 'pointer', fontSize: 18, lineHeight: 1,
              }}
            >×</button>
          )}
          {narrow && lines.length > 1 && (
            <button
              type="button"
              onClick={() => removeLine(idx)}
              style={{
                background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)',
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, marginTop: 4,
              }}
            >Remove product</button>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addLine}
        style={{
          background: 'var(--s3)', border: '1px dashed var(--border)', color: 'var(--text)',
          padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
          cursor: 'pointer', marginTop: 10,
        }}
      >
        + Add another product
      </button>
    </div>
  );
}
