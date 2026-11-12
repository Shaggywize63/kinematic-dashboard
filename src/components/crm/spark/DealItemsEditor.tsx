'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Account, Brand, Make, Product } from '../../../types/crm';
import { crmBrands, crmMakes } from '../../../lib/crmApi';
import {
  arr, dealLineErrors, grandTotal, hasAnyOrderValue, isMacBrand, lineTotal, macFunnelError, orderedTotal, type DealLineDraft,
} from '../../../lib/sparkAccounts';
import { formatINR } from '../../../lib/formatCurrency';
import { Button, Select, T, inputStyle } from '../../ui';

let seq = 0;
export const newDealLine = (): DealLineDraft => ({
  key: `ln-${Date.now()}-${seq++}`, product_id: '', name: '', quantity: '1', unit_price: '', make_id: '', brand_id: '', funnel_ref: '', order_value: '',
});

/** The product select label: "reference · name" (the reference is the product sku), or just the name when it has none. */
export const productOptionLabel = (p: Pick<Product, 'name' | 'sku'>): string => (p.sku ? `${p.sku} \u00b7 ${p.name}` : p.name);

/** The active makes and brands for the row pickers, loaded once. A failure (tables not set up yet) leaves them empty. */
export function useMakesBrands(): { makes: Make[]; brands: Brand[] } {
  const [makes, setMakes] = useState<Make[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  useEffect(() => {
    let off = false;
    crmMakes.list({ is_active: true }).then((r) => { if (!off) setMakes(arr<Make>(r?.data)); }).catch(() => { if (!off) setMakes([]); });
    crmBrands.list({ is_active: true }).then((r) => { if (!off) setBrands(arr<Brand>(r?.data)); }).catch(() => { if (!off) setBrands([]); });
    return () => { off = true; };
  }, []);
  return { makes, brands };
}

/**
 * Spark & Ray deal product lines: add / remove rows, pick a catalogue product to prefill name + price + make + brand
 * (all stay editable), a MAC funnel reference (required for brand MAC), an optional order value, live line totals and
 * Quoted / Ordered totals. The server recomputes the deal amount from these lines.
 */
export function DealItemsEditor({ lines, onChange, products, narrow }: {
  lines: DealLineDraft[];
  onChange: (next: DealLineDraft[]) => void;
  products: Product[];
  narrow?: boolean;
}) {
  const { makes, brands } = useMakesBrands();
  const patch = (key: string, p: Partial<DealLineDraft>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const brandNameOf = (l: DealLineDraft): string => (l.brand_id ? (brands.find((b) => b.id === l.brand_id)?.name ?? l.brand_name ?? '') : '');
  // Keep each row's stored brand / make name in step with the loaded lists, so the parent's save check (which only
  // sees the rows) applies the MAC rule to the same name the editor shows.
  const linesRef = useRef(lines);
  linesRef.current = lines;
  useEffect(() => {
    let changed = false;
    const next = linesRef.current.map((l) => {
      const bn = l.brand_id ? (brands.find((b) => b.id === l.brand_id)?.name ?? l.brand_name ?? '') : '';
      const mn = l.make_id ? (makes.find((m) => m.id === l.make_id)?.name ?? l.make_name ?? '') : '';
      if ((l.brand_name ?? '') === bn && (l.make_name ?? '') === mn) return l;
      changed = true;
      return { ...l, brand_name: bn, make_name: mn };
    });
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands, makes, lines]);

  const pick = (key: string, productId: string) => {
    const prod = arr<Product>(products).find((x) => x.id === productId);
    if (!prod) { patch(key, { product_id: '' }); return; }
    patch(key, {
      product_id: prod.id, name: prod.name, unit_price: String(Number(prod.price) || 0),
      // Make and brand come from the product when it has them; otherwise whatever the rep chose stays.
      ...(prod.make_id ? { make_id: prod.make_id, make_name: prod.make_name ?? '' } : {}),
      ...(prod.brand_id ? { brand_id: prod.brand_id, brand_name: prod.brand_name ?? '' } : {}),
    });
  };
  const errors = dealLineErrors(lines, brandNameOf);
  const cell: React.CSSProperties = { ...inputStyle, height: 34 };
  const cap: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', color: T.dim, marginBottom: 3, display: 'flex', gap: 4 };
  const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', minWidth: 0 };
  const showOrdered = hasAnyOrderValue(lines);
  return (
    <div data-testid="deal-items" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lines.length === 0 && <div style={{ fontSize: 12, color: T.dim }}>No product lines yet. Add the products quoted to the customer.</div>}
      {lines.map((l, i) => {
        const mac = isMacBrand(brandNameOf(l));
        const macErr = macFunnelError(l, brandNameOf(l));
        const err = errors[l.key];
        const brandOptions = arr<Brand>(brands);
        const makeOptions = arr<Make>(makes);
        return (
          <div
            key={l.key}
            data-testid="deal-item-row"
            style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8, background: 'var(--s3)', border: `1px solid ${T.border}`, borderRadius: 8 }}
          >
            <div style={{ display: 'grid', gap: 8, alignItems: 'center', gridTemplateColumns: narrow ? '1fr 1fr' : 'minmax(170px, 1.4fr) minmax(140px, 1.3fr) 80px 110px 110px 34px' }}>
              <Select aria-label={`Line ${i + 1} product`} value={l.product_id} onChange={(e) => pick(l.key, e.target.value)} style={{ height: 34, gridColumn: narrow ? '1 / -1' : undefined }}>
                <option value="">Custom item</option>
                {arr<Product>(products).map((p) => <option key={p.id} value={p.id}>{productOptionLabel(p)}</option>)}
              </Select>
              <input aria-label={`Line ${i + 1} name`} placeholder="Item name" value={l.name} onChange={(e) => patch(l.key, { name: e.target.value })} className="km-input" style={{ ...cell, gridColumn: narrow ? '1 / -1' : undefined }} />
              <input aria-label={`Line ${i + 1} quantity`} type="number" min="0" step="any" placeholder="Qty" value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} className="km-input" style={cell} />
              <input aria-label={`Line ${i + 1} unit price`} type="number" min="0" step="any" placeholder="Unit price" value={l.unit_price} onChange={(e) => patch(l.key, { unit_price: e.target.value })} className="km-input" style={cell} />
              <div data-testid="deal-item-total" title="Quoted value (qty x unit price)" style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 650, color: T.text, textAlign: narrow ? 'left' : 'right', whiteSpace: 'nowrap' }}>{formatINR(lineTotal(l))}</div>
              <button type="button" onClick={() => onChange(lines.filter((x) => x.key !== l.key))} aria-label={`Remove line ${i + 1}`} title="Remove line" style={{ background: 'transparent', border: 0, color: T.dim, cursor: 'pointer', display: 'inline-flex', justifyContent: 'center' }}><Trash2 size={16} strokeWidth={1.8} /></button>
            </div>
            <div data-testid="deal-item-extras" style={{ display: 'grid', gap: 8, alignItems: 'start', gridTemplateColumns: narrow ? '1fr 1fr' : 'repeat(4, minmax(120px, 1fr))' }}>
              <div style={col}>
                <span style={cap}>Make</span>
                <Select aria-label={`Line ${i + 1} make`} value={l.make_id ?? ''} onChange={(e) => patch(l.key, { make_id: e.target.value, make_name: makeOptions.find((m) => m.id === e.target.value)?.name ?? '' })} style={{ height: 34 }}>
                  <option value="">None</option>
                  {l.make_id && !makeOptions.some((m) => m.id === l.make_id) && <option value={l.make_id}>{l.make_name || 'Make'}</option>}
                  {makeOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </div>
              <div style={col}>
                <span style={cap}>Brand</span>
                <Select aria-label={`Line ${i + 1} brand`} value={l.brand_id ?? ''} onChange={(e) => patch(l.key, { brand_id: e.target.value, brand_name: brandOptions.find((b) => b.id === e.target.value)?.name ?? '' })} style={{ height: 34 }}>
                  <option value="">None</option>
                  {l.brand_id && !brandOptions.some((b) => b.id === l.brand_id) && <option value={l.brand_id}>{l.brand_name || 'Brand'}</option>}
                  {brandOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </div>
              <div style={col}>
                <span style={cap}>
                  <span>MAC funnel reference</span>
                  {mac && <span data-testid="funnel-required" title="Required for MAC products" style={{ color: T.red }}>*</span>}
                </span>
                <input
                  aria-label={`Line ${i + 1} funnel reference`} aria-required={mac || undefined} aria-invalid={macErr ? true : undefined}
                  placeholder={mac ? 'Required for MAC' : 'Optional'} value={l.funnel_ref ?? ''} onChange={(e) => patch(l.key, { funnel_ref: e.target.value })}
                  className="km-input" data-invalid={macErr ? 'true' : undefined} style={{ ...cell, ...(macErr ? { borderColor: T.red } : {}) }}
                />
              </div>
              <div style={col}>
                <span style={cap}>Order value</span>
                <input aria-label={`Line ${i + 1} order value`} type="number" min="0" step="any" placeholder="Optional" value={l.order_value ?? ''} onChange={(e) => patch(l.key, { order_value: e.target.value })} className="km-input" style={cell} />
              </div>
            </div>
            {err && <div role="alert" data-testid="deal-item-error" style={{ fontSize: 12, color: T.red }}>{err}</div>}
          </div>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={() => onChange([...lines, newDealLine()])} icon={<Plus size={14} strokeWidth={2} />}>Add line</Button>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: T.dim }}>
          <span>Quoted <strong data-testid="deal-items-grand-total" style={{ color: T.text, fontFamily: T.mono, fontSize: 15 }}>{formatINR(grandTotal(lines))}</strong></span>
          {showOrdered && <span>Ordered <strong data-testid="deal-items-ordered-total" style={{ color: T.text, fontFamily: T.mono, fontSize: 15 }}>{formatINR(orderedTotal(lines))}</strong></span>}
        </div>
      </div>
    </div>
  );
}

/** Searchable single-select over the account list (type to filter; pick to set; × to clear). */
export function AccountPicker({ accounts, value, onChange, placeholder = 'Search customers…', ariaLabel = 'Customer', disabled }: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Accessible name of the box and its clear button ("Customer" on deals, "Account" on contacts). */
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = arr<Account>(accounts).find((a) => a.id === value);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const needle = q.trim().toLowerCase();
  const filtered = arr<Account>(accounts).filter((a) => !needle || (a.name || '').toLowerCase().includes(needle)).slice(0, 50);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        aria-label={ariaLabel}
        disabled={disabled}
        value={open ? q : (selected?.name || '')}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setQ(''); setOpen(true); }}
        placeholder={placeholder}
        autoComplete="off"
        className="km-input"
        style={{ ...inputStyle, paddingRight: selected ? 30 : 11 }}
      />
      {selected && !open && !disabled && (
        <button type="button" onClick={() => onChange('')} aria-label={`Clear ${ariaLabel.toLowerCase()}`} title="Clear" style={{ position: 'absolute', right: 6, top: 6, background: 'transparent', border: 0, color: T.dim, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
      )}
      {open && (
        <div role="listbox" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30, background: 'var(--card)', border: `1px solid ${T.border}`, borderRadius: 8, maxHeight: 220, overflowY: 'auto', boxShadow: 'var(--shadow-pop)', padding: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 13, color: T.dim }}>No customers match.</div>
          ) : filtered.map((a) => (
            <div
              key={a.id}
              role="option"
              aria-selected={a.id === value}
              onMouseDown={() => { onChange(a.id); setQ(''); setOpen(false); }}
              className="km-navrow"
              style={{ padding: '0 8px', height: 32, display: 'flex', alignItems: 'center', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: T.text, fontWeight: a.id === value ? 600 : 500, background: a.id === value ? 'var(--s3)' : 'transparent' }}
            >
              {a.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
