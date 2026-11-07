'use client';
// Small pieces shared by the Lifecycle tabs: stacked dialogs, a confirm dialog, a commit-on-blur input,
// a checkbox row with a proper hit target, and a reader for one-shot ?query flags.

import { useCallback, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Button, Modal, T } from '../ui';
import { Input } from '../../ui';

// ───────────────────────────── dialogs ─────────────────────────────
// Modal listens for Escape on the window and refocuses its container whenever its onClose prop changes.
// This wrapper keeps onClose stable, and lets only the top-most open dialog react, so Escape on a
// confirmation does not also close the dialog underneath it.
const stack: string[] = [];

export function Dialog({ onClose, ...rest }: ComponentProps<typeof Modal>) {
  const id = useId();
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    stack.push(id);
    return () => { const i = stack.indexOf(id); if (i >= 0) stack.splice(i, 1); };
  }, [id]);
  const stable = useCallback(() => { if (stack[stack.length - 1] === id) latest.current(); }, [id]);
  return <Modal {...rest} onClose={stable} />;
}

export function ConfirmDialog({ title, children, confirmLabel, danger, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Dialog title={title} width={460} onClose={onCancel}
      footer={(
        <>
          <Button onClick={onCancel} style={{ height: 40 }}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} style={{ height: 40 }}>{confirmLabel}</Button>
        </>
      )}>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </Dialog>
  );
}

// ───────────────────────────── inputs ─────────────────────────────
/** Text input that keeps its own draft and writes to the store on blur or Enter, not on every keystroke. */
export function CommitInput({ value, onCommit, label, placeholder, width }: { value: string; onCommit: (v: string) => void; label: string; placeholder?: string; width?: number | string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <Input aria-label={label} placeholder={placeholder} value={draft} style={{ width: width ?? '100%' }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft.trim()); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

/** A checkbox and its label as one 44px-high target. */
export function CheckRow({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 13.5, color: T.text, cursor: disabled ? 'not-allowed' : 'pointer', flex: 1, minWidth: 0 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--info)', flex: '0 0 auto', cursor: 'inherit' }} />
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </label>
  );
}

/** Small icon-free remove button with an accessible name. */
export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      style={{ width: 44, height: 44, flex: '0 0 44px', border: 0, background: 'transparent', color: T.mute, fontSize: 20, lineHeight: 1, cursor: 'pointer', borderRadius: T.radius.sm }}>
      ×
    </button>
  );
}

// ───────────────────────────── helpers ─────────────────────────────
export const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Reads a query flag once on mount (for links such as ?new=1), removes it from the address bar, and reports it. */
export function useOneShotParam(name: string, onValue: (v: string) => void): void {
  const cb = useRef(onValue);
  cb.current = onValue;
  useEffect(() => {
    const url = new URL(window.location.href);
    const v = url.searchParams.get(name);
    if (v == null) return;
    url.searchParams.delete(name);
    window.history.replaceState(null, '', url.toString());
    cb.current(v);
  }, [name]);
}

export const sectionTitle = { margin: 0, fontFamily: T.heading, fontSize: 14, fontWeight: 700, color: T.text } as const;
