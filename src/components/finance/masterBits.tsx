'use client';
// Small shared helpers for the Finance customer / item / payment screens
// (radio + checkbox controls, a rupee input, the list-fetch hook and label maps).

import { ReactNode, useCallback, useEffect, useId, useRef, useState, InputHTMLAttributes, forwardRef } from 'react';
import { Button, Input, T, labelStyle, requiredMark } from '../ui';
import { GstTreatment, PaymentMode } from '../../lib/financeApi';
import { errMsg } from './ui';

// ── label maps ──────────────────────────────────────────────────────────────
export const GST_TREATMENTS: Array<{ value: GstTreatment; label: string }> = [
  { value: 'registered_regular', label: 'Registered Business - Regular' },
  { value: 'registered_composition', label: 'Registered Business - Composition' },
  { value: 'unregistered', label: 'Unregistered Business' },
  { value: 'consumer', label: 'Consumer' },
  { value: 'overseas', label: 'Overseas' },
  { value: 'sez', label: 'Special Economic Zone (SEZ)' },
];
export const gstTreatmentLabel = (v?: string | null): string => GST_TREATMENTS.find((t) => t.value === v)?.label ?? (v ? String(v) : '—');
export const isRegisteredTreatment = (v?: string | null) => v === 'registered_regular' || v === 'registered_composition' || v === 'sez';

export const PAYMENT_TERMS: Array<{ days: number; label: string }> = [
  { days: 0, label: 'Due on Receipt' }, { days: 7, label: 'Net 7' }, { days: 15, label: 'Net 15' },
  { days: 30, label: 'Net 30' }, { days: 45, label: 'Net 45' }, { days: 60, label: 'Net 60' },
];
export const paymentTermsLabel = (d?: number | null): string => {
  if (d === null || d === undefined) return '—';
  return PAYMENT_TERMS.find((t) => t.days === d)?.label ?? `Net ${d}`;
};

export const PAYMENT_MODES: Array<{ value: PaymentMode; label: string }> = [
  { value: 'cash', label: 'Cash' }, { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' }, { value: 'card', label: 'Card' }, { value: 'other', label: 'Other' },
];
export const paymentModeLabel = (m?: string | null): string => PAYMENT_MODES.find((x) => x.value === m)?.label ?? (m ? String(m) : '—');

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── list fetching ───────────────────────────────────────────────────────────
/**
 * Runs `fn` whenever any value in `deps` changes (or `reload()` is called) and ignores
 * responses that arrive out of order. Pass every filter / page / sort in `deps`.
 */
export function useRemote<D>(fn: () => Promise<D>, deps: unknown[]): { data: D | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<D | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    fnRef.current()
      .then((d) => { if (id === seq.current) { setData(d); setError(null); } })
      .catch((e) => { if (id === seq.current) setError(errMsg(e, 'Could not load data')); })
      .finally(() => { if (id === seq.current) setLoading(false); });
    return () => { seq.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

/** Current page that snaps back to 1 whenever `filterKey` (all filters joined) changes. */
export function usePage(filterKey: string): [number, (p: number) => void] {
  const [s, setS] = useState({ key: filterKey, page: 1 });
  const page = s.key === filterKey ? s.page : 1;
  return [page, (p: number) => setS({ key: filterKey, page: p })];
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: T.radius.md, background: T.redWash, color: T.red, fontSize: 13.5 }}>
      <span>{message}</span>
      {onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

// ── controls ────────────────────────────────────────────────────────────────
export function RadioGroup<V extends string>({ legend, value, onChange, options, required, disabled, hint, error }: {
  legend: ReactNode; value: V; onChange: (v: V) => void; options: Array<{ value: V; label: ReactNode }>;
  required?: boolean; disabled?: boolean; hint?: ReactNode; error?: ReactNode;
}) {
  const name = useId();
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ ...labelStyle, padding: 0, marginBottom: 8 }}>{legend}{required && requiredMark}</legend>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', minHeight: 36, alignItems: 'center' }}>
        {options.map((o) => (
          <label key={o.value} style={{ display: 'inline-flex', gap: 7, alignItems: 'center', fontSize: 14, color: T.text, cursor: disabled ? 'not-allowed' : 'pointer' }}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={disabled}
              onChange={() => onChange(o.value)} style={{ accentColor: 'var(--red)', margin: 0, width: 16, height: 16 }} />
            {o.label}
          </label>
        ))}
      </div>
      {error ? <div style={{ fontSize: 12, color: T.red, marginTop: 6 }}>{error}</div>
        : hint ? <div style={{ fontSize: 12, color: T.mute, marginTop: 6 }}>{hint}</div> : null}
    </fieldset>
  );
}

export function CheckBox({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: T.text, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: 'var(--red)', margin: '3px 0 0', width: 16, height: 16 }} />
      <span>{label}{hint && <span style={{ display: 'block', fontSize: 12, color: T.mute, marginTop: 2 }}>{hint}</span>}</span>
    </label>
  );
}

/** Number input with a ₹ prefix. */
export const RupeeInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function RupeeInput({ style, ...rest }, ref) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <span aria-hidden style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.mute, fontSize: 14, pointerEvents: 'none' }}>₹</span>
      <Input ref={ref} type="number" inputMode="decimal" min={0} step="0.01" style={{ paddingLeft: 26, ...style }} {...rest} />
    </div>
  );
});

export function Prose({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.5 }}>{children}</div>;
}
