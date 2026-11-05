'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Account, Product } from '../../../types/crm';
import { arr, grandTotal, lineTotal, type DealLineDraft } from '../../../lib/sparkAccounts';
import { formatINR } from '../../../lib/formatCurrency';
import { Button, Select, T, inputStyle } from '../../ui';

let seq = 0;
export const newDealLine = (): DealLineDraft => ({ key: `ln-${Date.now()}-${seq++}`, product_id: '', name: '', quantity: '1', unit_price: '' });

/**
 * Spark & Ray deal product lines: add / remove rows, pick a catalogue product to prefill name + price (both stay
 * editable), live line totals and a grand total. The server recomputes the deal amount from these lines.
 */
export function DealItemsEditor({ lines, onChange, products, narrow }: {
  lines: DealLineDraft[];
  onChange: (next: DealLineDraft[]) => void;
  products: Product[];
  narrow?: boolean;
}) {
  const patch = (key: string, p: Partial<DealLineDraft>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const pick = (key: string, productId: string) => {
    const prod = arr<Product>(products).find((x) => x.id === productId);
    if (!prod) { patch(key, { product_id: '' }); return; }
    patch(key, { product_id: prod.id, name: prod.name, unit_price: String(Number(prod.price) || 0) });
  };
  const cell: React.CSSProperties = { ...inputStyle, height: 34 };
  return (
    <div data-testid="deal-items" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lines.length === 0 && <div style={{ fontSize: 12, color: T.dim }}>No product lines yet. Add the products quoted to the customer.</div>}
      {lines.map((l, i) => (
        <div
          key={l.key}
          data-testid="deal-item-row"
          style={{
            display: 'grid', gap: 8, alignItems: 'center', padding: 8, background: 'var(--s3)', border: `1px solid ${T.border}`, borderRadius: 8,
            gridTemplateColumns: narrow ? '1fr 1fr' : 'minmax(150px, 1.3fr) minmax(140px, 1.4fr) 80px 110px 110px 34px',
          }}
        >
          <Select aria-label={`Line ${i + 1} product`} value={l.product_id} onChange={(e) => pick(l.key, e.target.value)} style={{ height: 34, gridColumn: narrow ? '1 / -1' : undefined }}>
            <option value="">Custom item</option>
            {arr<Product>(products).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <input aria-label={`Line ${i + 1} name`} placeholder="Item name" value={l.name} onChange={(e) => patch(l.key, { name: e.target.value })} className="km-input" style={{ ...cell, gridColumn: narrow ? '1 / -1' : undefined }} />
          <input aria-label={`Line ${i + 1} quantity`} type="number" min="0" step="any" placeholder="Qty" value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} className="km-input" style={cell} />
          <input aria-label={`Line ${i + 1} unit price`} type="number" min="0" step="any" placeholder="Unit price" value={l.unit_price} onChange={(e) => patch(l.key, { unit_price: e.target.value })} className="km-input" style={cell} />
          <div data-testid="deal-item-total" style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 650, color: T.text, textAlign: narrow ? 'left' : 'right', whiteSpace: 'nowrap' }}>{formatINR(lineTotal(l))}</div>
          <button type="button" onClick={() => onChange(lines.filter((x) => x.key !== l.key))} aria-label={`Remove line ${i + 1}`} title="Remove line" style={{ background: 'transparent', border: 0, color: T.dim, cursor: 'pointer', display: 'inline-flex', justifyContent: 'center' }}><Trash2 size={16} strokeWidth={1.8} /></button>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={() => onChange([...lines, newDealLine()])} icon={<Plus size={14} strokeWidth={2} />}>Add line</Button>
        <div style={{ fontSize: 13, color: T.dim }}>Total <strong data-testid="deal-items-grand-total" style={{ color: T.text, fontFamily: T.mono, fontSize: 15 }}>{formatINR(grandTotal(lines))}</strong></div>
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
