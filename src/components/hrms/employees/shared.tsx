'use client';
// Small pieces shared by the Employees screens: confirm dialog, unsaved-changes guard, inline "saved" notes,
// the statutory chips and the Edit / Save / Cancel bar.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge, Button, Modal, T } from '../ui';
import { MISSING_TAB, type TabKey } from './logic';

// ───────────────────────────── confirm dialog ─────────────────────────────
export function ConfirmDialog({ title, children, confirmLabel = 'Confirm', danger, onConfirm, onClose }: {
  title: string; children: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} width={460} footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} style={{ minHeight: 40 }}>{confirmLabel}</Button>
      </>
    }>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55 }}>{children}</div>
    </Modal>
  );
}

// ───────────────────────────── unsaved-changes guard ─────────────────────────────
export interface DirtyApi { report: (key: string, dirty: boolean) => void; anyDirty: () => boolean }
const DirtyCtx = createContext<DirtyApi | null>(null);

export function DirtyProvider({ children, apiRef }: { children: ReactNode; apiRef?: { current: DirtyApi | null } }) {
  const set = useRef(new Set<string>());
  const api = useMemo<DirtyApi>(() => ({
    report: (key, dirty) => { if (dirty) set.current.add(key); else set.current.delete(key); },
    anyDirty: () => set.current.size > 0,
  }), []);
  if (apiRef) apiRef.current = api;
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (api.anyDirty()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [api]);
  return <DirtyCtx.Provider value={api}>{children}</DirtyCtx.Provider>;
}
/** Tell the page that this form has unsaved edits, so switching tabs asks first. */
export function useReportDirty(key: string, dirty: boolean): void {
  const ctx = useContext(DirtyCtx);
  useEffect(() => {
    ctx?.report(key, dirty);
    return () => ctx?.report(key, false);
  }, [ctx, key, dirty]);
}

// ───────────────────────────── inline "saved" note ─────────────────────────────
export function useFlash(ms = 5000): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(''), ms);
  }, [ms]);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return [msg, flash];
}
export function Flash({ msg }: { msg: string }) {
  return <span role="status" aria-live="polite" style={{ fontSize: 13, color: T.ok, fontWeight: 600, minHeight: 18 }}>{msg}</span>;
}

// ───────────────────────────── edit bar ─────────────────────────────
export function EditBar({ editing, onEdit, onSave, onCancel, saveDisabled, flash, editLabel = 'Edit' }: {
  editing: boolean; onEdit: () => void; onSave: () => void; onCancel: () => void; saveDisabled?: boolean; flash?: string; editLabel?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {flash ? <Flash msg={flash} /> : null}
      {editing ? (
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onSave} disabled={saveDisabled} style={{ minHeight: 40 }}>Save changes</Button>
        </>
      ) : (
        <Button onClick={onEdit} style={{ minHeight: 40 }}>{editLabel}</Button>
      )}
    </div>
  );
}

/** Lists the first few validation messages above a form, so a long form does not hide the reason Save did nothing. */
export function ErrorSummary({ errors }: { errors: Record<string, string | undefined> }) {
  const list = Object.values(errors).filter(Boolean) as string[];
  if (!list.length) return null;
  return (
    <div role="alert" style={{ padding: '10px 14px', borderRadius: T.radius.md, background: T.redWash, color: T.red, fontSize: 13, lineHeight: 1.5 }}>
      <strong>{list.length === 1 ? 'Fix this before saving:' : `Fix these ${list.length} things before saving:`}</strong>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{list.slice(0, 6).map((m, i) => <li key={i}>{m}</li>)}{list.length > 6 && <li>and {list.length - 6} more</li>}</ul>
    </div>
  );
}

// ───────────────────────────── statutory chips ─────────────────────────────
export function MissingChips({ missing, max = 3 }: { missing: string[]; max?: number }) {
  if (!missing.length) return <Badge tone="ok">Complete</Badge>;
  const shown = missing.slice(0, max);
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {shown.map((m) => <Badge key={m} tone="warn" style={{ height: 20, fontSize: 11.5 }}>{m}</Badge>)}
      {missing.length > max && <Badge tone="neutral" style={{ height: 20, fontSize: 11.5 }} >{`+${missing.length - max}`}</Badge>}
    </span>
  );
}
export const tabForMissing = (label: string): TabKey => MISSING_TAB[label] ?? 'overview';

export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 style={{ margin: '4px 0 0', fontFamily: T.heading, fontSize: 13, fontWeight: 700, color: T.text }}>{children}</h3>;
}
