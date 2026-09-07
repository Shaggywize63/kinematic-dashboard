'use client';
/**
 * SchemeBuilder — a plain-language scheme editor for distribution promotions.
 *
 * Replaces the old raw-JSON `targeting` / `rules` textareas with friendly
 * controls a non-technical trade-marketing user can operate: SKU pickers,
 * add/remove slab rows, buy→get selectors, and outlet / customer-class
 * targeting chips. It assembles exactly the same `targeting` + `rules` JSON
 * the scheme engine (src/services/scheme-engine.ts) reads, so nothing on the
 * backend changes.
 *
 * The four scheme types and the JSON each produces:
 *   QPS            { target_sku_id, slabs:[{min_qty, free_qty, free_sku_id?}] }
 *   SLAB_DISCOUNT  { sku_ids:[], slabs:[{min_qty, percent}] }
 *   BXGY           { buy_sku, buy_qty, get_sku, get_qty, max_per_order }
 *   VALUE_DISCOUNT { min_value, percent? | flat_amount? }
 *
 * `schemeToText()` renders the same data back as a human sentence for the
 * detail view, and `fromScheme()` reverses a saved scheme into builder state
 * so "Edit → save" creates a clean new version.
 */
import { useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import { inr } from './Atoms';

export const SCHEME_TYPES = ['QPS', 'SLAB_DISCOUNT', 'BXGY', 'VALUE_DISCOUNT'] as const;
export type SchemeType = (typeof SCHEME_TYPES)[number];

export const SCHEME_TYPE_LABEL: Record<SchemeType, string> = {
  QPS: 'Buy quantity → free goods (QPS)',
  SLAB_DISCOUNT: 'Quantity slabs → % discount',
  BXGY: 'Buy X → get Y free (BxGy)',
  VALUE_DISCOUNT: 'Cart value → discount',
};

const CUSTOMER_CLASSES = ['GT', 'MT', 'HoReCa', 'Pharma', 'Wholesale'];

export interface SkuOpt { id: string; name: string; sku_code?: string | null }
export interface OutletOpt { id: string; name: string }

// ── Builder state ────────────────────────────────────────────────────────────
export interface BuilderState {
  code: string;
  name: string;
  type: SchemeType;
  priority: string;
  stackable: boolean;
  valid_from: string;
  valid_to: string;
  // targeting
  customer_classes: string[];
  outlet_ids: string[];
  // rules (kept per-type; only the active type's fields are serialised)
  qps_target: string;
  qps_slabs: Array<{ min_qty: string; free_qty: string; free_sku_id: string }>;
  slab_skus: string[];
  slab_slabs: Array<{ min_qty: string; percent: string }>;
  bxgy_buy: string; bxgy_buy_qty: string; bxgy_get: string; bxgy_get_qty: string; bxgy_max: string;
  val_min: string; val_mode: 'percent' | 'flat'; val_percent: string; val_flat: string;
}

export function emptyState(): BuilderState {
  return {
    code: '', name: '', type: 'QPS', priority: '100', stackable: false, valid_from: '', valid_to: '',
    customer_classes: [], outlet_ids: [],
    qps_target: '', qps_slabs: [{ min_qty: '12', free_qty: '1', free_sku_id: '' }],
    slab_skus: [], slab_slabs: [{ min_qty: '10', percent: '5' }],
    bxgy_buy: '', bxgy_buy_qty: '1', bxgy_get: '', bxgy_get_qty: '1', bxgy_max: '',
    val_min: '', val_mode: 'percent', val_percent: '5', val_flat: '',
  };
}

/** Reverse a saved scheme row into builder state so it can be edited → new version. */
export function fromScheme(s: any): BuilderState {
  const st = emptyState();
  st.code = s.code || ''; st.name = s.name || ''; st.type = (s.type as SchemeType) || 'QPS';
  st.priority = String(s.priority ?? 100); st.stackable = !!s.stackable;
  st.valid_from = (s.valid_from || '').slice(0, 10); st.valid_to = (s.valid_to || '').slice(0, 10);
  const t = s.targeting || {}; const r = s.rules || {};
  st.customer_classes = Array.isArray(t.customer_classes) ? t.customer_classes.map(String) : [];
  st.outlet_ids = Array.isArray(t.outlet_ids) ? t.outlet_ids.map(String) : [];
  if (s.type === 'QPS') {
    st.qps_target = r.target_sku_id || '';
    st.qps_slabs = (r.slabs || []).map((x: any) => ({ min_qty: String(x.min_qty ?? ''), free_qty: String(x.free_qty ?? ''), free_sku_id: x.free_sku_id || '' }));
    if (!st.qps_slabs.length) st.qps_slabs = emptyState().qps_slabs;
  } else if (s.type === 'SLAB_DISCOUNT') {
    st.slab_skus = Array.isArray(r.sku_ids) ? r.sku_ids.map(String) : [];
    st.slab_slabs = (r.slabs || []).map((x: any) => ({ min_qty: String(x.min_qty ?? ''), percent: String(x.percent ?? '') }));
    if (!st.slab_slabs.length) st.slab_slabs = emptyState().slab_slabs;
  } else if (s.type === 'BXGY') {
    st.bxgy_buy = r.buy_sku || ''; st.bxgy_buy_qty = String(r.buy_qty ?? 1);
    st.bxgy_get = r.get_sku || ''; st.bxgy_get_qty = String(r.get_qty ?? 1);
    st.bxgy_max = r.max_per_order != null ? String(r.max_per_order) : '';
  } else if (s.type === 'VALUE_DISCOUNT') {
    st.val_min = String(r.min_value ?? '');
    if (Number(r.flat_amount) > 0) { st.val_mode = 'flat'; st.val_flat = String(r.flat_amount); }
    else { st.val_mode = 'percent'; st.val_percent = String(r.percent ?? ''); }
  }
  return st;
}

/** Assemble the { targeting, rules } payload the backend/engine expect. */
function buildTargeting(s: BuilderState): Record<string, unknown> {
  const t: Record<string, unknown> = {};
  if (s.customer_classes.length) t.customer_classes = s.customer_classes;
  if (s.outlet_ids.length) t.outlet_ids = s.outlet_ids;
  return t;
}
const n = (v: string) => Number(v || 0);
function buildRules(s: BuilderState): Record<string, unknown> {
  switch (s.type) {
    case 'QPS':
      return {
        target_sku_id: s.qps_target,
        slabs: s.qps_slabs.filter((x) => x.min_qty && x.free_qty).map((x) => ({
          min_qty: n(x.min_qty), free_qty: n(x.free_qty), ...(x.free_sku_id ? { free_sku_id: x.free_sku_id } : {}),
        })),
      };
    case 'SLAB_DISCOUNT':
      return {
        ...(s.slab_skus.length ? { sku_ids: s.slab_skus } : {}),
        slabs: s.slab_slabs.filter((x) => x.min_qty && x.percent).map((x) => ({ min_qty: n(x.min_qty), percent: n(x.percent) })),
      };
    case 'BXGY':
      return {
        buy_sku: s.bxgy_buy, buy_qty: n(s.bxgy_buy_qty), get_sku: s.bxgy_get, get_qty: n(s.bxgy_get_qty),
        ...(s.bxgy_max ? { max_per_order: n(s.bxgy_max) } : {}),
      };
    case 'VALUE_DISCOUNT':
      return {
        min_value: n(s.val_min),
        ...(s.val_mode === 'percent' ? { percent: n(s.val_percent) } : { flat_amount: n(s.val_flat) }),
      };
  }
}

/** Validate the active type's rules; returns an error string or null. */
function validate(s: BuilderState): string | null {
  if (!s.code.trim()) return 'Enter a scheme code.';
  if (!s.name.trim()) return 'Enter a scheme name.';
  if (s.type === 'QPS') {
    if (!s.qps_target) return 'Pick the target SKU the customer must buy.';
    if (!s.qps_slabs.some((x) => n(x.min_qty) > 0 && n(x.free_qty) > 0)) return 'Add at least one slab (buy quantity → free quantity).';
  }
  if (s.type === 'SLAB_DISCOUNT' && !s.slab_slabs.some((x) => n(x.min_qty) > 0 && n(x.percent) > 0)) return 'Add at least one slab (minimum quantity → discount %).';
  if (s.type === 'BXGY') {
    if (!s.bxgy_buy || !s.bxgy_get) return 'Pick both the buy SKU and the free SKU.';
    if (n(s.bxgy_buy_qty) <= 0 || n(s.bxgy_get_qty) <= 0) return 'Buy quantity and free quantity must be greater than zero.';
  }
  if (s.type === 'VALUE_DISCOUNT') {
    if (n(s.val_min) <= 0) return 'Enter the minimum cart value.';
    if (s.val_mode === 'percent' && n(s.val_percent) <= 0) return 'Enter the discount percentage.';
    if (s.val_mode === 'flat' && n(s.val_flat) <= 0) return 'Enter the flat discount amount.';
  }
  return null;
}

// ── Human-readable summary (used by the detail view) ─────────────────────────
export function schemeToText(s: any, skuName: (id: string) => string): string {
  const r = s.rules || {};
  if (s.type === 'QPS') {
    const tgt = skuName(r.target_sku_id);
    const slabs = (r.slabs || []).map((x: any) => `buy ${x.min_qty} → get ${x.free_qty} ${x.free_sku_id ? skuName(x.free_sku_id) : tgt} free`);
    return `On ${tgt}: ${slabs.join('; ') || 'no slabs'}.`;
  }
  if (s.type === 'SLAB_DISCOUNT') {
    const on = (r.sku_ids || []).length ? (r.sku_ids || []).map(skuName).join(', ') : 'all cart items';
    const slabs = (r.slabs || []).map((x: any) => `${x.min_qty}+ units → ${x.percent}% off`);
    return `On ${on}: ${slabs.join('; ') || 'no slabs'}.`;
  }
  if (s.type === 'BXGY') {
    return `Buy ${r.buy_qty} × ${skuName(r.buy_sku)} → get ${r.get_qty} × ${skuName(r.get_sku)} free${r.max_per_order ? ` (max ${r.max_per_order} sets/order)` : ''}.`;
  }
  if (s.type === 'VALUE_DISCOUNT') {
    const cut = Number(r.flat_amount) > 0 ? inr(Number(r.flat_amount)) : `${r.percent}%`;
    return `Cart value ≥ ${inr(Number(r.min_value || 0))} → ${cut} off.`;
  }
  return '—';
}

export function targetingToText(s: any, outletName: (id: string) => string): string {
  const t = s.targeting || {};
  const parts: string[] = [];
  if (Array.isArray(t.customer_classes) && t.customer_classes.length) parts.push(`Customer types: ${t.customer_classes.join(', ')}`);
  if (Array.isArray(t.outlet_ids) && t.outlet_ids.length) parts.push(`${t.outlet_ids.length} specific outlet${t.outlet_ids.length === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : 'All outlets and customer types';
}

// ── Small styled primitives (CSS-var driven, theme-safe) ─────────────────────
const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' };
const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div style={labelStyle}>{label}</div>{children}</div>;
}
function TextInput({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
}

/** Searchable single-SKU select. */
function SkuPicker({ skus, value, onChange, placeholder = 'Select a SKU' }: { skus: SkuOpt[]; value: string; onChange: (id: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const sel = skus.find((x) => x.id === value);
  const ql = q.trim().toLowerCase();
  const filtered = ql ? skus.filter((x) => (x.name || '').toLowerCase().includes(ql) || (x.sku_code || '').toLowerCase().includes(ql)) : skus;
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...inputStyle, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: sel ? 'var(--text)' : 'var(--text-dim)' }}>{sel ? (sel.name || sel.sku_code) : placeholder}</span>
        <span style={{ color: 'var(--text-dim)' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--s3, var(--s2))', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 280, overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU…" style={{ ...inputStyle, borderRadius: 0, borderWidth: '0 0 1px 0', position: 'sticky', top: 0 }} />
          {filtered.length === 0 ? <div style={{ padding: 10, fontSize: 12, color: 'var(--text-dim)' }}>No SKUs match.</div> :
            filtered.slice(0, 80).map((x) => (
              <div key={x.id} onClick={() => { onChange(x.id); setOpen(false); setQ(''); }}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
                {x.name || x.sku_code}{x.sku_code && x.name ? <span style={{ color: 'var(--text-dim)', fontSize: 11 }}> · {x.sku_code}</span> : null}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/** Multi-select chips (SKUs or outlets). */
function MultiPicker({ options, values, onChange, placeholder }: { options: Array<{ id: string; label: string }>; values: string[]; onChange: (ids: string[]) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const filtered = ql ? options.filter((o) => o.label.toLowerCase().includes(ql)) : options;
  const toggle = (id: string) => onChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
  const labelOf = (id: string) => options.find((o) => o.id === id)?.label || id;
  return (
    <div>
      {values.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {values.map((id) => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--s3, var(--s2))', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px', fontSize: 12, color: 'var(--text)' }}>
              {labelOf(id)}<span onClick={() => toggle(id)} style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>✕</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...inputStyle, textAlign: 'left', cursor: 'pointer', color: 'var(--text-dim)' }}>{placeholder}</button>
        {open && (
          <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--s3, var(--s2))', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 260, overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" style={{ ...inputStyle, borderRadius: 0, borderWidth: '0 0 1px 0', position: 'sticky', top: 0 }} />
            {filtered.length === 0 ? <div style={{ padding: 10, fontSize: 12, color: 'var(--text-dim)' }}>Nothing matches.</div> :
              filtered.slice(0, 120).map((o) => (
                <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={values.includes(o.id)} onChange={() => toggle(o.id)} /> {o.label}
                </label>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClassChips({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const toggle = (c: string) => onChange(values.includes(c) ? values.filter((x) => x !== c) : [...values, c]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {CUSTOMER_CLASSES.map((c) => {
        const on = values.includes(c);
        return (
          <button key={c} type="button" onClick={() => toggle(c)}
            style={{ padding: '6px 14px', borderRadius: 999, fontSize: 13, cursor: 'pointer', border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary)' : 'transparent', color: on ? '#fff' : 'var(--text)' }}>
            {c}
          </button>
        );
      })}
    </div>
  );
}

const rowBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-dim)', cursor: 'pointer', padding: '6px 10px', fontSize: 12 };

// ── The builder ──────────────────────────────────────────────────────────────
export default function SchemeBuilder({ initial, onCancel, onSaved }: { initial?: BuilderState; onCancel: () => void; onSaved: () => void }) {
  const [s, setS] = useState<BuilderState>(initial || emptyState());
  const [skus, setSkus] = useState<SkuOpt[]>([]);
  const [outlets, setOutlets] = useState<OutletOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof BuilderState>(k: K, v: BuilderState[K]) => setS((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      try { const r: any = await api.getSkus(); const rows = (r?.data ?? r ?? []) as any[]; setSkus(rows.map((x) => ({ id: x.id, name: x.name, sku_code: x.sku_code }))); } catch { /* picker degrades */ }
      try { const r: any = await api.getStores(); const rows = (r?.data ?? r ?? []) as any[]; setOutlets(rows.map((x) => ({ id: x.id, name: x.name || x.store_name || x.id }))); } catch { /* optional */ }
    })();
  }, []);

  const skuOpts = useMemo(() => skus.map((x) => ({ id: x.id, label: x.name || x.sku_code || x.id })), [skus]);
  const outletOpts = useMemo(() => outlets.map((x) => ({ id: x.id, label: x.name })), [outlets]);

  const submit = async () => {
    const v = validate(s);
    if (v) { setErr(v); return; }
    setBusy(true); setErr(null);
    try {
      const body: any = {
        code: s.code.trim().toUpperCase(), name: s.name.trim(), type: s.type,
        priority: parseInt(s.priority) || 100, stackable: s.stackable,
        targeting: buildTargeting(s), rules: buildRules(s),
      };
      if (s.valid_from) body.valid_from = s.valid_from;
      if (s.valid_to) body.valid_to = s.valid_to;
      await api.createScheme(body);
      onSaved();
    } catch (e: any) { setErr(e?.message || 'Could not save the scheme.'); }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Basics */}
      <section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Labeled label="Scheme code"><TextInput value={s.code} onChange={(v) => set('code', v.toUpperCase())} placeholder="DIWALI-QPS" /></Labeled>
          <Labeled label="Name"><TextInput value={s.name} onChange={(v) => set('name', v)} placeholder="Diwali carton offer" /></Labeled>
          <Labeled label="Offer type">
            <select value={s.type} onChange={(e) => set('type', e.target.value as SchemeType)} style={inputStyle}>
              {SCHEME_TYPES.map((t) => <option key={t} value={t}>{SCHEME_TYPE_LABEL[t]}</option>)}
            </select>
          </Labeled>
          <Labeled label="Priority (lower runs first)"><TextInput value={s.priority} onChange={(v) => set('priority', v.replace(/[^0-9]/g, ''))} /></Labeled>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12, alignItems: 'end' }}>
          <Labeled label="Valid from"><TextInput type="date" value={s.valid_from} onChange={(v) => set('valid_from', v)} /></Labeled>
          <Labeled label="Valid to (optional)"><TextInput type="date" value={s.valid_to} onChange={(v) => set('valid_to', v)} /></Labeled>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
            <input type="checkbox" checked={s.stackable} onChange={(e) => set('stackable', e.target.checked)} /> Can combine with other schemes
          </label>
        </div>
      </section>

      {/* Rules — type specific */}
      <section style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>What the offer gives</div>

        {s.type === 'QPS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Labeled label="Customer must buy this SKU"><SkuPicker skus={skus} value={s.qps_target} onChange={(v) => set('qps_target', v)} /></Labeled>
            <div>
              <div style={labelStyle}>Slabs — buy this many, get this many free</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {s.qps_slabs.map((row, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 8, alignItems: 'center' }}>
                    <TextInput value={row.min_qty} onChange={(v) => set('qps_slabs', s.qps_slabs.map((x, j) => j === i ? { ...x, min_qty: v.replace(/[^0-9]/g, '') } : x))} placeholder="Buy qty" />
                    <TextInput value={row.free_qty} onChange={(v) => set('qps_slabs', s.qps_slabs.map((x, j) => j === i ? { ...x, free_qty: v.replace(/[^0-9]/g, '') } : x))} placeholder="Free qty" />
                    <SkuPicker skus={skus} value={row.free_sku_id} onChange={(v) => set('qps_slabs', s.qps_slabs.map((x, j) => j === i ? { ...x, free_sku_id: v } : x))} placeholder="Free SKU (same as bought if blank)" />
                    <button type="button" style={rowBtn} onClick={() => set('qps_slabs', s.qps_slabs.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                ))}
              </div>
              <button type="button" style={{ ...rowBtn, marginTop: 8 }} onClick={() => set('qps_slabs', [...s.qps_slabs, { min_qty: '', free_qty: '', free_sku_id: '' }])}>+ Add slab</button>
            </div>
          </div>
        )}

        {s.type === 'SLAB_DISCOUNT' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Labeled label="Applies to (leave empty for every item in the cart)"><MultiPicker options={skuOpts} values={s.slab_skus} onChange={(v) => set('slab_skus', v)} placeholder="+ Pick specific SKUs" /></Labeled>
            <div>
              <div style={labelStyle}>Slabs — minimum quantity → discount %</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {s.slab_slabs.map((row, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                    <TextInput value={row.min_qty} onChange={(v) => set('slab_slabs', s.slab_slabs.map((x, j) => j === i ? { ...x, min_qty: v.replace(/[^0-9]/g, '') } : x))} placeholder="Min qty" />
                    <TextInput value={row.percent} onChange={(v) => set('slab_slabs', s.slab_slabs.map((x, j) => j === i ? { ...x, percent: v.replace(/[^0-9.]/g, '') } : x))} placeholder="Discount %" />
                    <button type="button" style={rowBtn} onClick={() => set('slab_slabs', s.slab_slabs.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                ))}
              </div>
              <button type="button" style={{ ...rowBtn, marginTop: 8 }} onClick={() => set('slab_slabs', [...s.slab_slabs, { min_qty: '', percent: '' }])}>+ Add slab</button>
            </div>
          </div>
        )}

        {s.type === 'BXGY' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Labeled label="Buy this SKU"><SkuPicker skus={skus} value={s.bxgy_buy} onChange={(v) => set('bxgy_buy', v)} /></Labeled>
            <Labeled label="Buy quantity"><TextInput value={s.bxgy_buy_qty} onChange={(v) => set('bxgy_buy_qty', v.replace(/[^0-9]/g, ''))} /></Labeled>
            <Labeled label="Give this SKU free"><SkuPicker skus={skus} value={s.bxgy_get} onChange={(v) => set('bxgy_get', v)} /></Labeled>
            <Labeled label="Free quantity"><TextInput value={s.bxgy_get_qty} onChange={(v) => set('bxgy_get_qty', v.replace(/[^0-9]/g, ''))} /></Labeled>
            <Labeled label="Max free sets per order (optional)"><TextInput value={s.bxgy_max} onChange={(v) => set('bxgy_max', v.replace(/[^0-9]/g, ''))} placeholder="No limit" /></Labeled>
          </div>
        )}

        {s.type === 'VALUE_DISCOUNT' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Labeled label="Minimum cart value (₹)"><TextInput value={s.val_min} onChange={(v) => set('val_min', v.replace(/[^0-9.]/g, ''))} placeholder="10000" /></Labeled>
              <Labeled label="Discount type">
                <select value={s.val_mode} onChange={(e) => set('val_mode', e.target.value as 'percent' | 'flat')} style={inputStyle}>
                  <option value="percent">Percentage of cart</option>
                  <option value="flat">Flat amount</option>
                </select>
              </Labeled>
            </div>
            {s.val_mode === 'percent'
              ? <Labeled label="Discount %"><TextInput value={s.val_percent} onChange={(v) => set('val_percent', v.replace(/[^0-9.]/g, ''))} placeholder="5" /></Labeled>
              : <Labeled label="Flat discount (₹)"><TextInput value={s.val_flat} onChange={(v) => set('val_flat', v.replace(/[^0-9.]/g, ''))} placeholder="500" /></Labeled>}
          </div>
        )}
      </section>

      {/* Targeting */}
      <section style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>Who gets it</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>Leave both empty to apply to every outlet and customer type.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Labeled label="Customer types"><ClassChips values={s.customer_classes} onChange={(v) => set('customer_classes', v)} /></Labeled>
          <Labeled label="Specific outlets (optional)"><MultiPicker options={outletOpts} values={s.outlet_ids} onChange={(v) => set('outlet_ids', v)} placeholder="+ Pick specific outlets" /></Labeled>
        </div>
      </section>

      {err && <div style={{ color: 'var(--primary)', fontSize: 13 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <button type="button" onClick={submit} disabled={busy} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Saving…' : 'Save scheme'}
        </button>
        <button type="button" onClick={onCancel} style={{ background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 20px', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}
