'use client';
// Small pieces shared by the Assets, Benefits and Compensation screens. Built on the HRMS kit; nothing here duplicates it.

import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button, ConfidenceBadge, Modal, Note, T } from '../ui';
import { fmtDate } from '../../../lib/hrms/format';
import { Input } from '../../ui';
import type { Result } from '../../../lib/hrms/rewards/store';

/** Shows a toast for an action result and returns whether it worked. */
export function report(r: Result<object>, ok: string): boolean {
  if (r.ok) { toast.success(ok); return true; }
  toast.error(r.error);
  return false;
}

/** A sample or advisory figure: the badge plus a plain line. */
export function AdvisorNote({ children, label = 'Confirm with your advisor.' }: { children: ReactNode; label?: string }) {
  return (
    <div role="note" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderRadius: T.radius.md, background: T.warnWash, color: T.text, fontSize: 13, lineHeight: 1.5 }}>
      <span style={{ flex: '0 0 auto', marginTop: 1 }}><ConfidenceBadge level="indicative" /></span>
      <span style={{ minWidth: 0 }}>{children} <b>{label}</b></span>
    </div>
  );
}

export function ConfirmModal({ title, children, confirmLabel, onConfirm, onClose, disabled, disabledReason, danger, width = 520 }: {
  title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void; disabled?: boolean; disabledReason?: string; danger?: boolean; width?: number;
}) {
  return (
    <Modal title={title} onClose={onClose} width={width}
      footer={(
        <>
          {disabled && disabledReason && <span style={{ flex: 1, minWidth: 180, fontSize: 12.5, color: T.dim, alignSelf: 'center' }}>{disabledReason}</span>}
          <Button style={{ height: 40 }} onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} style={{ height: 40 }} disabled={disabled} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      )}>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </Modal>
  );
}

/** A checkbox and its label as one 44px target. */
export function CheckRow({ checked, onChange, children, disabled, testId }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean; testId?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44, padding: '8px 0', fontSize: 13.5, color: T.text, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <input type="checkbox" data-testid={testId} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--info)', flex: '0 0 auto', marginTop: 1, cursor: 'inherit' }} />
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </label>
  );
}

/** Number input that keeps a text draft and writes on blur or Enter, so typing "12." or clearing the box is not fought. */
export function CommitNumber({ value, onCommit, label, width = 90, suffix, min, max, disabled, testId, placeholder, invalid }: {
  value: number | null; onCommit: (v: number | null, raw: string) => void; label: string; width?: number | string; suffix?: string; min?: number; max?: number; disabled?: boolean; testId?: string; placeholder?: string; invalid?: boolean;
}) {
  const show = value == null ? '' : String(value);
  const [draft, setDraft] = useState(show);
  useEffect(() => { setDraft(show); }, [show]);
  const commit = () => {
    const t = draft.trim();
    if (t === show) return;
    if (t === '') { onCommit(null, t); setDraft(show); return; }
    const n = Number(t);
    onCommit(Number.isFinite(n) ? n : null, t);
    setDraft(show);   // a refused value snaps back; an accepted one arrives through `value` and the effect above
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Input aria-label={label} data-testid={testId} inputMode="decimal" min={min} max={max} disabled={disabled} placeholder={placeholder} invalid={invalid} value={draft}
        style={{ width, textAlign: 'right', height: 34 }}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      {suffix && <span style={{ fontSize: 13, color: T.dim }}>{suffix}</span>}
    </span>
  );
}

/** Horizontal bar rows for a few labelled values. Pure CSS, reads in both themes. */
export function BarRows({ rows, format, testId }: { rows: { key: string; label: string; value: number; sub?: string }[]; format: (n: number) => string; testId?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 150px) minmax(0, 1fr) auto', gap: 10, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: T.text, overflowWrap: 'anywhere' }}>{r.label}</span>
          <span style={{ height: 10, borderRadius: 6, background: T.raised, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(r.value / max) * 100}%`, background: 'var(--info)', borderRadius: 6 }} />
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums', color: T.text, whiteSpace: 'nowrap', minWidth: 150, textAlign: 'right' }}>{format(r.value)}{r.sub && <span style={{ color: T.mute }}> · {r.sub}</span>}</span>
        </div>
      ))}
    </div>
  );
}

export const SimulationNote = ({ children }: { children: ReactNode }) => <Note tone="info"><b>Simulation.</b> {children}</Note>;

export const sectionTitle = { margin: 0, fontFamily: T.heading, fontSize: 14, fontWeight: 700, color: T.text } as const;

export const Stack = ({ children, gap = 16 }: { children: ReactNode; gap?: number }) => <div style={{ display: 'flex', flexDirection: 'column', gap }}>{children}</div>;
export const Muted = ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.5, ...style }}>{children}</div>;

/** Text input that keeps a draft and writes on blur or Enter. */
export function CommitText({ value, onCommit, label, placeholder, width = '100%', invalid, disabled, testId }: {
  value: string; onCommit: (v: string) => void; label: string; placeholder?: string; width?: number | string; invalid?: boolean; disabled?: boolean; testId?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <Input aria-label={label} data-testid={testId} placeholder={placeholder} invalid={invalid} disabled={disabled} value={draft} style={{ width, height: 34 }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft.trim() !== value.trim()) onCommit(draft.trim()); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

/** The latest changes made in one area of the Rewards store, newest first. */
export function ActivityLog({ log, area, limit = 8 }: { log: { on: string; by: string; area: string; action: string }[]; area: 'assets' | 'benefits' | 'compensation'; limit?: number }) {
  const mine = log.filter((l) => l.area === area).slice(0, limit);
  return (
    <section data-testid="activity-log" style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.lg, background: T.card, padding: 16 }}>
      <h2 style={{ ...sectionTitle, marginBottom: 8 }}>Recent changes</h2>
      {mine.length === 0 ? <Muted>Nothing has been changed in this browser yet. Every change you make is listed here.</Muted> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {mine.map((l, i) => (
            <li key={i} style={{ display: 'flex', gap: 12, padding: '7px 0', borderTop: i ? `1px solid ${T.border}` : 0, fontSize: 13 }}>
              <span style={{ color: T.dim, flex: '0 0 92px' }}>{fmtDate(l.on)}</span><span style={{ flex: '1 1 0', minWidth: 0, overflowWrap: 'anywhere' }}>{l.action} <span style={{ color: T.mute }}>· {l.by}</span></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
