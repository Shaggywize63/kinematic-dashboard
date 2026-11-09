'use client';
// Small pieces shared by the four workforce pages.

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Badge, Button, Card, CardTitle, Modal, T } from '../ui';
import { Field, Textarea } from '../../ui';
import type { WageRequest } from '../../../lib/hrms/workforce/types';

/** A card with a title row. */
export function Panel({ title, right, children, testId, padding = 18, style }: { title: ReactNode; right?: ReactNode; children: ReactNode; testId?: string; padding?: number; style?: CSSProperties }) {
  return (
    <Card padding={padding} style={style}>
      <div data-testid={testId}>
        <CardTitle right={right}>{title}</CardTitle>
        {children}
      </div>
    </Card>
  );
}

/** Marks anything that stands in for an outside system. */
export function SimBadge({ children = 'Simulation' }: { children?: ReactNode }) {
  return <Badge tone="warn" mono>{children}</Badge>;
}

export function ErrorLine({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <div role="alert" style={{ fontSize: 12.5, color: T.red }}>{children}</div>;
}

export const muted: CSSProperties = { fontSize: 12.5, color: T.dim, lineHeight: 1.5 };
export const strong: CSSProperties = { fontWeight: 600, color: T.text };
export const cardList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
export const twoCol = (narrow: boolean, min = 320): CSSProperties => ({ display: 'grid', gridTemplateColumns: narrow ? '1fr' : `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 14, alignItems: 'start' });

/** A thin bordered block inside a card, for a row of content such as one proof or one request. */
export function Row({ children, tone, style, testId, status }: { children: ReactNode; tone?: 'red' | 'warn' | 'ok'; style?: CSSProperties; testId?: string; status?: string }) {
  const bg = tone === 'red' ? T.redWash : tone === 'warn' ? T.warnWash : tone === 'ok' ? T.okWash : T.panel;
  return (
    <div data-testid={testId} data-status={status} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '10px 12px', background: bg, minWidth: 0, ...style }}>{children}</div>
  );
}

export const TONE_FOR_RISK = { low: 'ok', medium: 'warn', high: 'red' } as const;

/** Three segments that fill up with the level. Always shown with the level written next to it. */
export function RiskMeter({ level, label }: { level: 'low' | 'medium' | 'high'; label?: string }) {
  const n = level === 'low' ? 1 : level === 'medium' ? 2 : 3;
  const color = level === 'low' ? T.ok : level === 'medium' ? T.warn : T.red;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} data-testid="risk-meter" data-level={level}>
      <span aria-hidden style={{ display: 'inline-flex', gap: 3 }}>
        {[1, 2, 3].map((i) => <span key={i} style={{ width: 22, height: 8, borderRadius: 4, background: i <= n ? color : T.rule }} />)}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color }}>{label ?? `${level[0]!.toUpperCase()}${level.slice(1)} risk`}</span>
    </div>
  );
}

/**
 * A dialog that asks for a written reason (and optionally a second note) before something happens that a person
 * should be able to look back on: a hold, a rejection, a decline, an accepted mismatch. `onSubmit` returns an error
 * message to show, or null when it worked.
 */
export function ReasonModal({ title, intro, label, placeholder, confirmLabel, danger, second, onSubmit, onClose, width = 520 }: {
  title: string; intro?: ReactNode; label: string; placeholder?: string; confirmLabel: string; danger?: boolean;
  second?: { label: string; placeholder?: string };
  onSubmit: (text: string, second: string) => string | null; onClose: () => void; width?: number;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => { const err = onSubmit(text, other); if (err) setError(err); else onClose(); };
  return (
    <Modal title={title} width={width} onClose={onClose}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={submit}>{confirmLabel}</Button>
        </>
      )}>
      {intro && <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>{intro}</div>}
      <Field label={label} htmlFor={`${id}-t`} error={error}>
        <Textarea id={`${id}-t`} value={text} placeholder={placeholder} invalid={!!error} onChange={(e) => { setText(e.target.value); setError(null); }} />
      </Field>
      {second && (
        <Field label={second.label} htmlFor={`${id}-s`}>
          <Textarea id={`${id}-s`} value={other} placeholder={second.placeholder} style={{ minHeight: 64 }} onChange={(e) => setOther(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}

export const REQUEST_TONE: Record<WageRequest['status'], 'warn' | 'ok' | 'red' | 'neutral'> = { pending: 'warn', approved: 'ok', declined: 'red', cancelled: 'neutral', settled: 'neutral' };
export const REQUEST_WORD: Record<WageRequest['status'], string> = { pending: 'Waiting', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled', settled: 'Recovered' };

/** A column header for a column of buttons: read out by screen readers, takes no room. Not absolutely positioned, so it can never widen the page. */
export function ActionsHeader() {
  return <span style={{ display: 'inline-block', width: 1, height: 1, overflow: 'hidden', whiteSpace: 'nowrap', verticalAlign: 'top' }}>Actions</span>;
}
