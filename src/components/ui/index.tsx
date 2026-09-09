'use client';
import { forwardRef, type CSSProperties, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import Link from 'next/link';

/**
 * Shared UI primitives for the redesigned dashboard. Inline-style objects
 * (matching the codebase convention) built on the tokens in globals.css so
 * every control flips light/dark from one place. Pages compose these instead
 * of re-declaring `background: var(--s3); border: 1px solid …` by hand.
 *
 * Density follows the design-system sheet: 36px inputs, 34px buttons, 6/8/12
 * radii, Inter 14 for controls, JetBrains Mono for eyebrows and numbers.
 */

// ── Tokens (CSS variables defined in globals.css) ─────────────────────────
export const T = {
  canvas: 'var(--canvas)',
  panel: 'var(--panel)',
  card: 'var(--card)',
  field: 'var(--field)',
  raised: 'var(--s3)',
  rule: 'var(--s4)',
  border: 'var(--border)',
  borderStrong: 'var(--border-l)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  mute: 'var(--mute)',
  red: 'var(--red)',
  redWash: 'var(--red-w)',
  info: 'var(--info)',
  infoWash: 'var(--info-w)',
  ok: 'var(--ok)',
  okWash: 'var(--ok-w)',
  warn: 'var(--warn)',
  warnWash: 'var(--warn-w)',
  ring: 'var(--ring)',
  mono: 'var(--font-jetbrains)',
  heading: 'var(--font-manrope)',
  radius: { sm: 6, md: 8, lg: 12, pill: 999 },
} as const;

export const eyebrowStyle: CSSProperties = {
  fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: T.mute, fontWeight: 500,
};

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...eyebrowStyle, ...style }}>{children}</div>;
}

// ── Button ────────────────────────────────────────────────────────────────
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export function buttonStyle(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', disabled = false): CSSProperties {
  const base: CSSProperties = {
    height: size === 'sm' ? 30 : 34,
    padding: size === 'sm' ? '0 10px' : '0 14px',
    borderRadius: T.radius.sm,
    fontSize: size === 'sm' ? 12.5 : 13.5,
    fontWeight: 600,
    fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    whiteSpace: 'nowrap',
    lineHeight: 1,
    transition: 'background .12s ease, border-color .12s ease, color .12s ease, box-shadow .12s ease',
  };
  switch (variant) {
    case 'primary': return { ...base, background: T.red, color: '#FFFFFF' };
    case 'danger': return { ...base, background: T.redWash, color: T.red, borderColor: 'transparent' };
    case 'ghost': return { ...base, background: 'transparent', color: T.dim };
    default: return { ...base, background: T.card, borderColor: T.borderStrong, color: T.text };
  }
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  href?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, href, style, children, disabled, type = 'button', ...rest }, ref,
) {
  const s = { ...buttonStyle(variant, size, !!disabled), ...style };
  if (href && !disabled) {
    return (
      <Link href={href} className="km-btn" data-variant={variant} style={s}>
        {icon}{children}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className="km-btn" data-variant={variant} disabled={disabled} style={s} {...rest}>
      {icon}{children}
    </button>
  );
});

/** 32px square icon-only button used in the header and row actions. */
export function IconButton({ label, style, children, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="km-iconbtn"
      style={{
        width: 32, height: 32, padding: 0, borderRadius: T.radius.sm, flexShrink: 0,
        background: active ? 'var(--s3)' : 'transparent', border: '1px solid transparent',
        color: active ? T.text : T.dim, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
        transition: 'background .12s ease, color .12s ease',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── Inputs ────────────────────────────────────────────────────────────────
export const inputStyle: CSSProperties = {
  height: 36, width: '100%', boxSizing: 'border-box',
  border: `1px solid ${T.border}`, background: T.field, borderRadius: T.radius.sm,
  padding: '0 11px', fontSize: 14, color: T.text, fontFamily: 'inherit', outline: 'none',
  transition: 'border-color .12s ease, box-shadow .12s ease',
};

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { style, invalid, ...rest }, ref,
) {
  return <input ref={ref} className="km-input" data-invalid={invalid ? 'true' : undefined} style={{ ...inputStyle, ...style }} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { style, invalid, children, ...rest }, ref,
) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <select ref={ref} className="km-input" data-invalid={invalid ? 'true' : undefined}
        style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none', paddingRight: 32, cursor: 'pointer', ...style }} {...rest}>
        {children}
      </select>
      <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' }}>
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { style, invalid, ...rest }, ref,
) {
  return <textarea ref={ref} className="km-input" data-invalid={invalid ? 'true' : undefined}
    style={{ ...inputStyle, height: 'auto', minHeight: 84, padding: '9px 11px', resize: 'vertical', lineHeight: 1.45, ...style }} {...rest} />;
});

/** Label + control + hint/error, stacked with 6px gaps. */
export function Field({ label, required, hint, error, children, style, htmlFor }: {
  label?: ReactNode; required?: boolean; hint?: ReactNode; error?: ReactNode; children: ReactNode; style?: CSSProperties; htmlFor?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...style }}>
      {label != null && (
        <label htmlFor={htmlFor} style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, display: 'flex', gap: 4, alignItems: 'center' }}>
          {label}{required && <span style={{ color: T.red }}>*</span>}
        </label>
      )}
      {children}
      {error ? <div style={{ fontSize: 12, color: T.red }}>{error}</div>
        : hint ? <div style={{ fontSize: 12, color: T.mute }}>{hint}</div> : null}
    </div>
  );
}

// ── Surfaces ──────────────────────────────────────────────────────────────
export const cardStyle: CSSProperties = {
  background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius.lg,
};

export function Card({ children, style, padding = 20, className }: { children: ReactNode; style?: CSSProperties; padding?: number | string; className?: string }) {
  return <div className={className} style={{ ...cardStyle, padding, ...style }}>{children}</div>;
}

/** Section inside a form/card: mono eyebrow + one-line hint, then content. */
export function Section({ eyebrow, hint, children, first, style }: { eyebrow: ReactNode; hint?: ReactNode; children: ReactNode; first?: boolean; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: first ? '0 0 22px' : '22px 0', borderTop: first ? 0 : `1px solid ${T.border}`, ...style }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        {hint && <div style={{ fontSize: 13, color: T.dim }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** Two-column responsive form grid (single column when `narrow`). */
export function FormGrid({ children, narrow, columns = 2, style }: { children: ReactNode; narrow?: boolean; columns?: number; style?: CSSProperties }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : `repeat(${columns}, minmax(0, 1fr))`, gap: '16px 20px', ...style }}>
      {children}
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────
export function PageHeader({ title, description, actions, eyebrow, style, compact }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; style?: CSSProperties; compact?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: compact ? 'wrap' : 'nowrap', ...style }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="km-page-title" style={{ margin: 0, fontFamily: T.heading, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2, color: T.text }}>{title}</h1>
        {description && <div style={{ fontSize: 13.5, color: T.dim }}>{description}</div>}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

// ── Badges / chips ────────────────────────────────────────────────────────
export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'red';
const TONE: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--s3)', fg: T.dim },
  info: { bg: T.infoWash, fg: T.info },
  ok: { bg: T.okWash, fg: T.ok },
  warn: { bg: T.warnWash, fg: T.warn },
  red: { bg: T.redWash, fg: T.red },
};

export function Badge({ tone = 'neutral', children, dot, style, mono }: { tone?: Tone; children: ReactNode; dot?: boolean; style?: CSSProperties; mono?: boolean }) {
  const c = TONE[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 8px', borderRadius: T.radius.pill,
      background: c.bg, color: c.fg, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
      fontFamily: mono ? T.mono : 'inherit', ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor' }} />}
      {children}
    </span>
  );
}

/** Header-style scope chip: outlined pill with an icon + label + chevron. */
export function Chip({ children, icon, active, onClick, style, title, chevron = true }: {
  children: ReactNode; icon?: ReactNode; active?: boolean; onClick?: () => void; style?: CSSProperties; title?: string; chevron?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} title={title} className="km-chip" style={{
      height: 28, padding: '0 10px', borderRadius: T.radius.pill, border: `1px solid ${T.border}`,
      background: T.card, fontSize: 12.5, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6,
      color: active ? T.text : T.dim, cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit', whiteSpace: 'nowrap',
      ...style,
    }}>
      {icon}
      {children}
      {chevron && (
        <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ color: T.mute }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      )}
    </button>
  );
}

/** Segmented control (e.g. B2B / B2C). */
export function Segmented<V extends string>({ value, onChange, options, style }: {
  value: V; onChange: (v: V) => void; options: Array<{ value: V; label: ReactNode }>; style?: CSSProperties;
}) {
  return (
    <div role="tablist" style={{ display: 'inline-flex', padding: 3, background: 'var(--s3)', borderRadius: T.radius.md, gap: 2, ...style }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.value)} style={{
            height: 28, padding: '0 12px', borderRadius: T.radius.sm, border: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
            background: on ? T.card : 'transparent', color: on ? T.text : T.dim, cursor: 'pointer',
            boxShadow: on ? '0 1px 2px rgba(10,14,26,.12)' : 'none', transition: 'background .12s ease, color .12s ease',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

/** Empty state block for lists. */
export function EmptyState({ icon, title, description, action, style }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '48px 24px', textAlign: 'center', color: T.dim, ...style }}>
      {icon && <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--s3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.mute, marginBottom: 4 }}>{icon}</div>}
      <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</div>
      {description && <div style={{ fontSize: 13, maxWidth: 420 }}>{description}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

/** Initials avatar (falls back to the first letter). */
export function Avatar({ name, size = 28, src, style }: { name?: string; size?: number; src?: string; style?: CSSProperties }) {
  const initials = (name || 'U').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || 'U';
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name || ''} style={{ width: size, height: size, borderRadius: 999, objectFit: 'cover', flexShrink: 0, ...style }} />;
  }
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0, background: 'var(--s4)', color: T.text,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.heading,
      fontSize: Math.round(size * 0.4), fontWeight: 700, letterSpacing: '-0.01em', ...style,
    }}>{initials}</span>
  );
}
