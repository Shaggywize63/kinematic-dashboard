'use client';
// Small blocks shared by the three pages in this folder (visit attendance, integrity checks, pay-run checks).

import { ReactNode } from 'react';
import Link from 'next/link';
import { Textarea, buttonStyle, type ButtonVariant } from '../../ui';
import { Badge, T, type Tone } from '../ui';

/** A link that looks like a button and keeps an accessible name of its own. */
export function LinkButton({ href, children, label, variant = 'secondary', size = 'sm', style }: {
  href: string; children: ReactNode; label?: string; variant?: ButtonVariant; size?: 'sm' | 'md'; style?: React.CSSProperties;
}) {
  return <Link href={href} aria-label={label} className="km-btn" data-variant={variant} style={{ ...buttonStyle(variant, size), textDecoration: 'none', ...style }}>{children}</Link>;
}

/** A person's name that opens their profile. */
export function PersonLink({ id, name }: { id: string; name: string }) {
  return <Link href={`/dashboard/hrms/employees/${id}`} style={{ color: T.text, fontWeight: 600, textDecoration: 'none', borderBottom: `1px dotted ${T.mute}` }}>{name}</Link>;
}

/** Small label and value pairs in a row. */
export function Facts({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
      {items.map((f, i) => (
        <div key={i} style={{ minWidth: 0 }}>
          <dt style={{ fontSize: 11.5, color: T.mute }}>{f.label}</dt>
          <dd style={{ margin: 0, fontSize: 13.5, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A labelled box inside a modal or card. */
export function Block({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 13.5, fontWeight: 700, color: T.text }}>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Bullets({ items, tone }: { items: ReactNode[]; tone?: 'dim' }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, lineHeight: 1.5, color: tone === 'dim' ? T.dim : T.text }}>
      {items.map((x, i) => <li key={i}>{x}</li>)}
    </ul>
  );
}

export const SEVERITY_TONE: Record<'high' | 'warning' | 'info', Tone> = { high: 'red', warning: 'warn', info: 'info' };
export const SEVERITY_LABEL: Record<'high' | 'warning' | 'info', string> = { high: 'High', warning: 'Warning', info: 'For information' };
export function SeverityBadge({ severity }: { severity: 'high' | 'warning' | 'info' }) {
  return <Badge tone={SEVERITY_TONE[severity]} dot>{SEVERITY_LABEL[severity]}</Badge>;
}

/** A note box with a label and a counter, used wherever a decision needs a reason. */
export function NoteField({ id, label, value, onChange, placeholder, hint, required, rows = 3, maxLength = 400 }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: ReactNode; required?: boolean; rows?: number; maxLength?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 12.5, fontWeight: 500, color: T.dim }}>{label}{required && <span style={{ color: T.red }}> *</span>}</label>
      <Textarea id={id} rows={rows} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {hint && <div style={{ fontSize: 12, color: T.mute }}>{hint}</div>}
    </div>
  );
}

/** Stat-like tiles are in ui.tsx; this is the compact version used for the by-severity and by-status rows. */
export function MiniStat({ label, value, tone, testId }: { label: string; value: ReactNode; tone?: Tone; testId?: string }) {
  const color = tone === 'red' ? T.red : tone === 'warn' ? T.warn : tone === 'ok' ? T.ok : tone === 'info' ? T.info : T.text;
  return (
    <div data-testid={testId} style={{ border: `1px solid ${T.border}`, background: T.card, borderRadius: T.radius.md, padding: '10px 14px', minWidth: 0, flex: '1 1 104px' }}>
      <div style={{ fontSize: 12, color: T.dim }}>{label}</div>
      <div style={{ fontFamily: T.heading, fontSize: 22, fontWeight: 700, color, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
