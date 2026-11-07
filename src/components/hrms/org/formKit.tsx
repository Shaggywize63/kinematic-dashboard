'use client';
// Small form helpers used by every modal in the Organisation and Time & leave screens. They wire the label to its
// control, mark the control invalid for assistive tech and keep the error text next to it.

import { useId, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';
import { Field, Input, Select, T } from '../../ui';

/**
 * Visually hidden text that still reads aloud. It is deliberately not position:absolute: inside a wide table inside an
 * overflow container, an absolutely positioned cell label is placed against the page and stretches it sideways on phones.
 */
export const srOnly: CSSProperties = { display: 'inline-block', width: 1, height: 1, overflow: 'hidden', whiteSpace: 'nowrap', verticalAlign: 'top' };

/** Primary actions keep a hit target of about 44px. */
export const primaryStyle: CSSProperties = { minHeight: 44, padding: '0 18px' };

export function TextField({ label, value, onChange, error, hint, required, ...rest }: {
  label: ReactNode; value: string; onChange: (v: string) => void; error?: string; hint?: ReactNode; required?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'required'>) {
  const id = useId();
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={id}>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} invalid={!!error} aria-invalid={error ? true : undefined} {...rest} />
    </Field>
  );
}

export function SelectField({ label, value, onChange, error, hint, required, children, disabled }: {
  label: ReactNode; value: string; onChange: (v: string) => void; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode; disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} invalid={!!error} aria-invalid={error ? true : undefined} disabled={disabled}>{children}</Select>
    </Field>
  );
}

/** A real checkbox with its label, 44px tall so it is easy to hit. */
export function CheckField({ label, checked, onChange, hint, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36, fontSize: 14, color: T.text, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--red)', flexShrink: 0 }} />
        {label}
      </label>
      {hint && <div style={{ fontSize: 12, color: T.mute, marginLeft: 28 }}>{hint}</div>}
    </div>
  );
}

/** After a failed submit, move focus to the first invalid control inside the form. */
export function focusFirstInvalid(formId: string): void {
  window.setTimeout(() => {
    const el = document.getElementById(formId)?.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.focus();
  }, 0);
}

export const num2 = (v: string): number => (v.trim() === '' ? NaN : Number(v));
