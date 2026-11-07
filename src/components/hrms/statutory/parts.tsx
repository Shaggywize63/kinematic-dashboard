'use client';
// Small shared pieces for the Statutory and Privacy components: a plain table, a confirm dialog, a "not tagged" badge.

import { CSSProperties, ReactNode } from 'react';
import { Badge, Button, Modal, T } from '../ui';

export interface PCol<R> { key: string; label: ReactNode; align?: 'left' | 'right' | 'center'; render?: (row: R, index: number) => ReactNode; nowrap?: boolean; width?: number | string }

/** Static table with the look of DataTable but no sorting: for reference tables where the order is the content. */
export function PlainTable<R>({ columns, rows, empty, minWidth = 520, footer, caption, highlight }: {
  columns: PCol<R>[]; rows: R[]; empty?: ReactNode; minWidth?: number; footer?: ReactNode; caption?: string; highlight?: (row: R) => boolean;
}) {
  const th: CSSProperties = { padding: '9px 14px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap', background: T.panel };
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.lg, background: T.card }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth }}>
        {caption && <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{caption}</caption>}
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col" style={{ ...th, textAlign: c.align ?? 'left', width: c.width }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: 28, textAlign: 'center', color: T.mute, fontSize: 13.5 }}>{empty ?? 'Nothing here yet.'}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} style={highlight?.(r) ? { background: T.infoWash } : undefined}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: '10px 14px', fontSize: 13.5, borderTop: i === 0 ? 0 : `1px solid ${T.border}`, textAlign: c.align ?? 'left', whiteSpace: c.nowrap === false ? 'normal' : 'nowrap', color: T.text, verticalAlign: 'middle', fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : undefined }}>
                  {c.render ? c.render(r, i) : String((r as Record<string, unknown>)[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer}
      </table>
    </div>
  );
}

/** For a figure that rules.ts holds without a confidence tag (percentage rates, cess, Labour Code parameters). */
export function NotTagged() {
  return <span title="rules.ts has no confidence tag for this figure, so it is not claimed as verified."><Badge tone="neutral">Not tagged</Badge></span>;
}

/** Yes / No style confirmation for destructive or hard-to-undo actions. */
export function ConfirmModal({ title, children, confirmLabel, danger, onConfirm, onClose }: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} width={460}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} style={{ minHeight: 40 }}>{confirmLabel}</Button>
        </>
      )}>
      <div style={{ fontSize: 14, color: T.dim, lineHeight: 1.55 }}>{children}</div>
    </Modal>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.5, ...style }}>{children}</div>;
}

/** Vertical-rhythm wrapper used by every tab. */
export function Stack({ children, gap = 18 }: { children: ReactNode; gap?: number }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap }}>{children}</div>;
}
