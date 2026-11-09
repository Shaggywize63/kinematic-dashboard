'use client';
// Small blocks shared by the assistant, policies and org chart screens.

import { CSSProperties, ReactNode, useEffect, useState } from 'react';
import { Badge, Button, T } from '../ui';

/** Banner that says, in plain words, that what follows is a simulation. */
export function SimNote({ testid, title = 'SIMULATION', children }: { testid?: string; title?: string; children: ReactNode }) {
  return (
    <div role="note" data-testid={testid} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderRadius: T.radius.md, background: T.warnWash, color: T.text, fontSize: 13, lineHeight: 1.5, border: `1px solid ${T.border}` }}>
      <Badge tone="warn" mono style={{ flexShrink: 0, marginTop: 1 }}>{title}</Badge>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** A chip that sends a quick reply or runs a small action. */
export function QuickChip({ children, onClick, disabled, testid }: { children: ReactNode; onClick: () => void; disabled?: boolean; testid?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testid} style={{
      border: `1px solid ${T.borderStrong}`, background: T.card, color: T.text, borderRadius: 999, padding: '6px 12px', fontFamily: 'inherit', fontSize: 13,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, minHeight: 32, lineHeight: 1.2,
    }}>{children}</button>
  );
}

/** A read-only chip, for "records read" lists. */
export function InfoChip({ children, testid }: { children: ReactNode; testid?: string }) {
  return <span data-testid={testid} style={{ display: 'inline-flex', alignItems: 'center', background: T.raised, color: T.dim, borderRadius: 999, padding: '3px 10px', fontSize: 12.5, lineHeight: 1.3 }}>{children}</span>;
}

/** Copy text to the clipboard. Falls back to a hidden textarea where the clipboard API is blocked. */
export function CopyButton({ text, label, testid }: { text: string; label: string; testid?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1600); return () => clearTimeout(t); }, [done]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* nothing more to try */ }
      document.body.removeChild(ta);
    }
    setDone(true);
  };
  return <Button size="sm" onClick={copy} aria-label={label} data-testid={testid}>{done ? 'Copied' : 'Copy'}</Button>;
}

export function CodeBlock({ children, testid, maxHeight = 320 }: { children: string; testid?: string; maxHeight?: number }) {
  return (
    <pre data-testid={testid} tabIndex={0} style={{
      margin: 0, padding: 12, borderRadius: T.radius.md, background: T.panel, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.mono, fontSize: 12.5,
      lineHeight: 1.5, overflow: 'auto', maxHeight, whiteSpace: 'pre', maxWidth: '100%',
    }}>{children}</pre>
  );
}

/** Tiny labelled field wrapper for native controls used outside the form kit. */
export function Labelled({ label, htmlFor, children, style }: { label: string; htmlFor: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...style }}>
      <label htmlFor={htmlFor} style={{ fontSize: 12.5, fontWeight: 500, color: T.dim }}>{label}</label>
      {children}
    </div>
  );
}

/** Reads one query parameter after mount (never during render, so server and client output agree). */
export function useQueryParam(name: string): string | null {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => { setV(new URLSearchParams(window.location.search).get(name)); }, [name]);
  return v;
}

export const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const textAreaStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.field, borderRadius: T.radius.sm, padding: '9px 11px', fontSize: 14,
  color: T.text, fontFamily: 'inherit', lineHeight: 1.45, resize: 'vertical',
};

/**
 * A row of stat tiles that sits two or more to a line on a phone. The global mobile rule turns every inline `repeat(...)`
 * or `fr` grid into one column below 1024px, so a wrapping flex row is used here instead.
 */
export function Tiles({ children, min = 150 }: { children: ReactNode; min?: number }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {items.map((c, i) => <div key={i} style={{ flex: `1 1 ${min}px`, minWidth: 0 }}>{c}</div>)}
    </div>
  );
}
