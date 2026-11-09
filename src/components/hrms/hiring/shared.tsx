'use client';
// Small pieces shared by the Recruitment, Workforce planning and Performance screens.

import { useState, type CSSProperties, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Modal, Note, T, type Tone } from '../ui';
import { fullName } from '../../../lib/hrms/format';
import type { HrmsDb } from '../../../lib/hrms/types';
import type { OpeningStatus } from '../../../lib/hrms/hiring/types';
import type { Result } from '../../../lib/hrms/hiring/store';

export { toast };

// ───────────────────────────── lookups ─────────────────────────────
export const empName = (db: HrmsDb, id?: string): string => { const e = db.employees.find((x) => x.id === id); return e ? fullName(e) : '—'; };
export const deptName = (db: HrmsDb, id?: string): string => db.departments.find((d) => d.id === id)?.name ?? '—';
export const locName = (db: HrmsDb, id?: string): string => db.locations.find((l) => l.id === id)?.name ?? '—';
export const desName = (db: HrmsDb, id?: string): string => db.designations.find((d) => d.id === id)?.name ?? '—';

export const OPENING_TONE: Record<OpeningStatus, Tone> = { draft: 'neutral', pending_approval: 'warn', open: 'ok', on_hold: 'info', filled: 'neutral' };

/** Runs a store action and tells the person what happened. Returns true when it worked. */
export function report<T>(r: Result<T>, success?: string): boolean {
  if (r.ok) { if (success) toast.success(success); return true; }
  toast.error(r.error);
  return false;
}

// ───────────────────────────── layout bits ─────────────────────────────
export const subtle: CSSProperties = { fontSize: 12.5, color: T.dim, lineHeight: 1.5 };
export const mono: CSSProperties = { fontFamily: T.mono, fontVariantNumeric: 'tabular-nums' };

export function Row({ children, gap = 10, wrap = true, style }: { children: ReactNode; gap?: number; wrap?: boolean; style?: CSSProperties }) {
  return <div style={{ display: 'flex', gap, flexWrap: wrap ? 'wrap' : 'nowrap', alignItems: 'center', ...style }}>{children}</div>;
}

/** A line of plain text under a card title. */
export function Lead({ children }: { children: ReactNode }) {
  return <p style={{ margin: '-6px 0 14px', fontSize: 13, color: T.dim, lineHeight: 1.55, maxWidth: 760 }}>{children}</p>;
}

/** The "how this works" line each page keeps in view, so the rules are not hidden in a help page. */
export function Principle({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} style={{ display: 'flex', gap: 12, padding: '12px 14px', border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.info}`, borderRadius: T.radius.md, background: T.card }}>
      <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.55 }}><b style={{ color: T.text }}>{title}</b> {children}</div>
    </div>
  );
}

export function Simulation({ children }: { children: ReactNode }) {
  return <Row gap={8} wrap={false} style={{ alignItems: 'flex-start' }}><Badge tone="warn">SIMULATION</Badge><span style={{ ...subtle, flex: 1 }}>{children}</span></Row>;
}

// ───────────────────────────── ratings ─────────────────────────────
/** 1 to 5 as five radio buttons, so it works with a keyboard and a screen reader. */
export function RatingInput({ label, value, onChange, disabled, labels }: { label: string; value?: number; onChange?: (n: number) => void; disabled?: boolean; labels?: Record<number, string> }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value === n;
        return (
          <button key={n} type="button" role="radio" aria-checked={on} aria-label={`${label}: ${n} of 5${labels?.[n] ? `, ${labels[n]}` : ''}`} title={labels?.[n] ?? String(n)}
            disabled={disabled || !onChange} onClick={() => onChange?.(n)}
            style={{
              width: 34, height: 34, borderRadius: T.radius.sm, fontFamily: T.mono, fontSize: 13, fontWeight: 600,
              border: `1px solid ${on ? T.info : T.border}`, background: on ? T.infoWash : T.field, color: on ? T.info : T.dim,
              cursor: disabled || !onChange ? 'default' : 'pointer', opacity: disabled && !on ? 0.55 : 1,
            }}>{n}</button>
        );
      })}
    </div>
  );
}

/** A read-only rating shown as "4 / 5" with a thin bar. */
export function RatingValue({ value, max = 5 }: { value?: number | null; max?: number }) {
  if (value == null) return <span style={{ color: T.mute }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ ...mono, fontWeight: 600, color: T.text }}>{Number.isInteger(value) ? value : value.toFixed(1)}</span>
      <span aria-hidden style={{ width: 44, height: 4, borderRadius: 4, background: T.raised, overflow: 'hidden' }}><span style={{ display: 'block', width: `${(value / max) * 100}%`, height: '100%', background: 'var(--hv-1)' }} /></span>
    </span>
  );
}

// ───────────────────────────── dialogs ─────────────────────────────
/** A small confirmation or reason prompt: asks for text, and keeps the Confirm button off until it is long enough. */
export function ReasonDialog({ title, intro, label, confirmLabel, minLength = 5, danger, optional, onConfirm, onClose, extra }: {
  title: string; intro?: ReactNode; label: string; confirmLabel: string; minLength?: number; danger?: boolean; optional?: boolean;
  onConfirm: (text: string) => string | null | void; onClose: () => void; extra?: ReactNode;
}) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const need = optional ? 0 : minLength;
  const go = () => { const e = onConfirm(text); if (e) setErr(e); };
  return (
    <Modal title={title} width={480} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} disabled={text.trim().length < need} onClick={go}>{confirmLabel}</Button></>}>
      {intro && <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>{intro}</div>}
      {extra}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: T.dim }}>
        {label}{!optional && <span style={{ color: T.mute }}>At least {minLength} characters.</span>}
        <textarea className="km-input" value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} rows={3}
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: T.radius.sm, border: `1px solid ${T.border}`, background: T.field, color: T.text, fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }} />
      </label>
      {err && <Note tone="red">{err}</Note>}
    </Modal>
  );
}

export { Button, Modal, Note };
