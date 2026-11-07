'use client';
// Small blocks shared by the payroll screens.

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, ConfidenceBadge, Modal, T } from '../ui';
import { Input, buttonStyle, type ButtonVariant } from '../../ui';
import type { LawRow } from './logic';
import type { ActionResult } from '../../../lib/hrms/payrollActions';

/** Show the result of an action as a toast. Returns true when it worked. */
export function report(r: ActionResult, success?: string): boolean {
  if (r.ok) { if (success) toast.success(success); return true; }
  toast.error(r.error);
  return false;
}

/**
 * Number input that keeps what you type in a draft and only writes to the store on blur or Enter, so a half-typed
 * "1." never reaches the data. `onCommit` returns an error message to show, or null when the value was accepted.
 */
export function NumberCell({ value, onCommit, label, disabled, width = 78 }: {
  value: number; onCommit: (n: number) => string | null; label: string; disabled?: boolean; width?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setDraft(String(value)); setErr(null); }, [value]);
  const commit = () => {
    if (draft.trim() === String(value)) { setErr(null); return; }
    const n = Number(draft);
    if (draft.trim() === '' || Number.isNaN(n)) { setErr('Enter a number'); return; }
    setErr(onCommit(n));
  };
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <Input aria-label={label} inputMode="decimal" value={draft} disabled={disabled} invalid={!!err} aria-invalid={!!err}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(String(value)); setErr(null); } }}
        style={{ width, height: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
      {err && <span role="alert" style={{ fontSize: 11.5, color: T.red, maxWidth: 170, lineHeight: 1.3 }}>{err}</span>}
    </div>
  );
}

/** Confirmation dialog for destructive or irreversible actions. */
export function ConfirmModal({ title, children, confirmLabel, onConfirm, onClose, danger, disabled }: {
  title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void; danger?: boolean; disabled?: boolean;
}) {
  return (
    <Modal title={title} onClose={onClose} width={480}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} disabled={disabled} onClick={onConfirm} style={{ minHeight: 40 }}>{confirmLabel}</Button>
      </>}>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55 }}>{children}</div>
    </Modal>
  );
}

/** Scoped print rules: only the element with this class prints, in ink on white, like the finance report viewer. */
export function PrintStyle({ rootClass }: { rootClass: string }) {
  const css = `
@page { size: A4 portrait; margin: 12mm; }
@media print {
  body * { visibility: hidden !important; transition: none !important; }
  .${rootClass}, .${rootClass} * { visibility: visible !important; }
  .${rootClass} { position: absolute !important; left: 0; top: 0; width: 100% !important; max-width: none !important; min-width: 0 !important; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  aside, main > header { display: none !important; }
  .hr-noprint { display: none !important; }
}`;
  return <style>{css}</style>;
}

/** Table of the statutory parameters a figure rests on, each with how far it can be trusted. */
export function LawBasisTable({ rows }: { rows: LawRow[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr>
            {['Parameter', 'Value used', 'Confidence'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, borderBottom: `1px solid ${T.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td style={{ padding: '9px 10px', fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}`, fontWeight: 600 }}>{r.label}</td>
              <td style={{ padding: '9px 10px', fontSize: 13, color: T.dim, borderBottom: `1px solid ${T.border}` }}>
                {r.value}
                {r.source && <div style={{ fontSize: 11.5, color: T.mute }}>{r.source}</div>}
              </td>
              <td style={{ padding: '9px 10px', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}><ConfidenceBadge level={r.confidence} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const money: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', textAlign: 'right' };

/** Entity id to name lookups used by several lists. */
export function entityName(db: { entities: { id: string; name: string }[] }, id: string): string {
  return db.entities.find((e) => e.id === id)?.name ?? '—';
}

export const inputRow: React.CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' };

/** Primary actions get a roomier hit target than the default 34px button. */
export const bigBtn: React.CSSProperties = { height: 44, padding: '0 20px', fontSize: 14 };

/** A link that looks like a button and, unlike Button with href, keeps an accessible name of its own. */
export function LinkButton({ href, children, label, variant = 'secondary', style }: { href: string; children: ReactNode; label?: string; variant?: ButtonVariant; style?: React.CSSProperties }) {
  return <Link href={href} aria-label={label} className="km-btn" data-variant={variant} style={{ ...buttonStyle(variant, 'sm'), ...style }}>{children}</Link>;
}
