'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { crmProducts } from '../../../lib/crmApi';
import { arr, normalizeFormSerialInput } from '../../../lib/sparkAccounts';
import type { Activity, Product } from '../../../types/crm';
import UserSearchSelect, { type UserOption } from '../shared/UserSearchSelect';
import { Select, T } from '../../ui';

// Spark & Ray (connected-B2B) activity controls: several assignees (the first is the Primary), the products the
// customer is interested in (from the shared catalogue) and the filled-form serial. Only rendered for that client.

export type ProductOption = { id: string; name: string };

/** The shared product catalogue (~13 rows), loaded once when `enabled`. Never throws; an empty list on failure. */
export function useProductCatalogue(enabled: boolean): ProductOption[] {
  const [rows, setRows] = useState<ProductOption[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    crmProducts.list({ limit: 200 })
      .then((r) => {
        if (off) return;
        setRows(arr<Product>(r?.data).filter((p) => p && p.is_active !== false).map((p) => ({ id: p.id, name: p.name })));
      })
      .catch(() => { if (!off) setRows([]); });
    return () => { off = true; };
  }, [enabled]);
  return rows;
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', padding: '3px 6px 3px 10px',
  borderRadius: 999, border: `1px solid ${T.border}`, background: 'var(--s3)', color: T.text, fontSize: 12.5, fontWeight: 600,
};
const xBtn: React.CSSProperties = {
  background: 'transparent', border: 0, padding: 2, color: T.dim, cursor: 'pointer', display: 'inline-flex', borderRadius: 999,
};

export function AssigneeChips({ users, value, onChange }: { users: UserOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name || 'User';
  const remaining = users.filter((u) => !value.includes(u.id));
  const promote = (id: string) => onChange([id, ...value.filter((x) => x !== id)]);
  return (
    <div data-testid="assignee-picker" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {value.map((id, i) => (
            <span key={id} data-testid="assignee-chip" style={chipStyle}>
              {nameOf(id)}
              {i === 0 ? (
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 999, background: T.okWash, color: T.ok }}>Primary</span>
              ) : (
                <button type="button" onClick={() => promote(id)} title="Make primary" style={{ ...xBtn, fontSize: 10, fontWeight: 700, padding: '1px 6px', border: `1px solid ${T.border}` }}>Make primary</button>
              )}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== id))} aria-label={`Remove ${nameOf(id)}`} style={xBtn}><X size={13} strokeWidth={2} /></button>
            </span>
          ))}
        </div>
      )}
      {value.length < 20 && (
        <UserSearchSelect
          options={remaining}
          value=""
          onChange={(id) => { if (id && !value.includes(id)) onChange([...value, id]); }}
          placeholder={value.length ? 'Add another team member…' : 'Search team member…'}
          emptyLabel="Pick someone"
        />
      )}
    </div>
  );
}

export function ProductChips({ products, value, onChange }: { products: ProductOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name || 'Product';
  const remaining = products.filter((p) => !value.includes(p.id));
  return (
    <div data-testid="product-picker" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {value.map((id) => (
            <span key={id} data-testid="product-chip" style={chipStyle}>
              {nameOf(id)}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== id))} aria-label={`Remove ${nameOf(id)}`} style={xBtn}><X size={13} strokeWidth={2} /></button>
            </span>
          ))}
        </div>
      )}
      <Select
        aria-label="Add product"
        value=""
        onChange={(e) => { const id = e.target.value; if (id && !value.includes(id)) onChange([...value, id]); }}
        disabled={remaining.length === 0}
      >
        <option value="">{remaining.length === 0 ? (products.length ? 'All products added' : 'No products in the catalogue') : 'Add a product…'}</option>
        {remaining.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
    </div>
  );
}

export function FormSerialInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input
        aria-label="Form serial"
        value={value}
        onChange={(e) => onChange(normalizeFormSerialInput(e.target.value))}
        placeholder="e.g. SRPR2627-12"
        autoComplete="off"
        spellCheck={false}
        className="km-input"
        data-invalid={error ? 'true' : undefined}
        style={{ height: 36, boxSizing: 'border-box', width: '100%', background: 'var(--field)', border: `1px solid ${error ? T.red : T.border}`, color: T.text, padding: '0 11px', borderRadius: 6, fontSize: 14, fontFamily: T.mono, outline: 'none' }}
      />
      {error && <div role="alert" data-testid="form-serial-error" style={{ fontSize: 12, color: T.red }}>{error}</div>}
    </div>
  );
}

/** Assignee / product / form-serial chips on an activity card or timeline row. Renders nothing for non-Spark rows. */
export function SparkActivityMeta({ a, style }: { a: Pick<Activity, 'assignees' | 'products' | 'form_ref_no'>; style?: React.CSSProperties }) {
  const assignees = arr<{ id: string; name: string }>(a.assignees);
  const products = arr<{ id: string; name: string }>(a.products);
  const ref = (a.form_ref_no ?? '').toString().trim();
  if (!assignees.length && !products.length && !ref) return null;
  const pill = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap' });
  return (
    <div data-testid="spark-activity-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6, ...style }}>
      {assignees.map((u, i) => (
        <span key={u.id || i} style={pill('var(--s3)', T.text)} title={i === 0 ? 'Primary assignee' : 'Assignee'}>
          {u.name}{i === 0 && assignees.length > 1 ? ' · primary' : ''}
        </span>
      ))}
      {products.map((p, i) => <span key={p.id || i} style={pill(T.infoWash, T.info)} title="Product interested">{p.name}</span>)}
      {ref && <span style={{ ...pill(T.okWash, T.ok), fontFamily: T.mono }} title="Form serial">{ref}</span>}
    </div>
  );
}
