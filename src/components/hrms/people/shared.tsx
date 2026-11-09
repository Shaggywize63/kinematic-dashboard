'use client';
// Small pieces shared by the four people pages: layout helpers, a form modal, a simulation tag and plain SVG/CSS charts.

import { CSSProperties, ReactNode, useId, useState } from 'react';
import { Badge, Button, Modal, T } from '../ui';
import type { Employee } from '../../../lib/hrms/types';
import { fullName } from '../../../lib/hrms/format';
import type { LogEntry } from '../../../lib/hrms/people/types';

export function Stack({ children, gap = 16, style }: { children: ReactNode; gap?: number; style?: CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>;
}
export function Muted({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.5, ...style }}>{children}</div>;
}
export function Row({ children, gap = 10, style }: { children: ReactNode; gap?: number; style?: CSSProperties }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap, flexWrap: 'wrap', ...style }}>{children}</div>;
}
export function SimulationBadge({ children = 'Simulation' }: { children?: ReactNode }) {
  return <Badge tone="info" mono>{children}</Badge>;
}

/** Look up people by id once per render. */
export const indexById = <R extends { id: string }>(rows: R[]): Map<string, R> => new Map(rows.map((r) => [r.id, r]));
export const nameOf = (m: Map<string, Employee>, id: string | undefined): string => { const e = id ? m.get(id) : undefined; return e ? fullName(e) : '—'; };

/** A dialog with a form body, an inline error line and a confirm button that only closes when the action succeeds. */
export function FormModal({ title, children, confirmLabel, onConfirm, onClose, width = 520, disabled, danger }: {
  title: string; children: ReactNode; confirmLabel: string; onConfirm: () => string | null; onClose: () => void; width?: number; disabled?: boolean; danger?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const errId = useId();
  return (
    <Modal title={title} onClose={onClose} width={width}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={disabled} aria-describedby={error ? errId : undefined}
            onClick={() => { const e = onConfirm(); if (e) setError(e); else onClose(); }}>{confirmLabel}</Button>
        </>
      )}>
      {children}
      {error && <div id={errId} role="alert" style={{ fontSize: 13, color: T.red }}>{error}</div>}
    </Modal>
  );
}

/** The dashboard styles every table header cell as a small mono eyebrow. Row headers hold names, so they opt out. */
export const ROW_TH: CSSProperties = { fontFamily: 'inherit', textTransform: 'none', letterSpacing: 'normal' };

export const selectStyle: CSSProperties = { height: 36, borderRadius: T.radius.sm, border: `1px solid ${T.border}`, background: T.field, color: T.text, fontFamily: 'inherit', fontSize: 14, padding: '0 10px' };

/** Colours for the charts below. Dark is the dashboard default; the light set applies under data-theme="light". */
export function VizStyle() {
  const css = `
.px-viz { --px-1:#3987e5; --px-2:#d95926; --px-3:#199e70; --px-4:#9085e9; }
[data-theme="light"] .px-viz { --px-1:#2a78d6; --px-2:#eb6834; --px-3:#1baf7a; --px-4:#6250d6; }
.px-viz text { font-family: inherit; }
`;
  return <style>{css}</style>;
}
export const SERIES = ['var(--px-1)', 'var(--px-2)', 'var(--px-3)', 'var(--px-4)'];

export const toneFor = (pct: number): 'ok' | 'warn' | 'red' => (pct >= 90 ? 'ok' : pct >= 70 ? 'warn' : 'red');
const toneColor = { ok: T.ok, warn: T.warn, red: T.red } as const;

/** Horizontal bars for a percentage per group, with the count behind each. Status colour plus a text label, never colour alone. */
export function CoverageBars({ rows, label }: { rows: { key: string; label: string; pct: number; covered: number; required: number; overdue: number }[]; label: string }) {
  return (
    <div role="list" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r) => {
        const tone = toneFor(r.pct);
        return (
          <div key={r.key} role="listitem" data-testid={`cov-${r.key}`} title={`${r.label}: ${r.covered} of ${r.required} covered, ${r.overdue} overdue`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: T.text }}>{r.label}</span>
              <span style={{ color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                <b style={{ color: toneColor[tone] }}>{r.pct}%</b> · {r.covered} of {r.required}{r.overdue ? ` · ${r.overdue} overdue` : ''}
              </span>
            </div>
            <div style={{ height: 10, background: T.raised, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${r.pct}%`, height: '100%', background: toneColor[tone], borderRadius: 4 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The latest changes people made on a page: what, to whom, by whom. Newest first. The audit time is left out on purpose,
 *  because the preview runs on a fixed "today" and a real clock time next to it would only confuse. */
export function ActivityList({ entries, limit = 6, testId }: { entries: LogEntry[]; limit?: number; testId?: string }) {
  if (entries.length === 0) return <Muted>No changes yet. What you change on this page is listed here.</Muted>;
  return (
    <ul data-testid={testId} style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13, color: T.dim, lineHeight: 1.7 }}>
      {entries.slice(0, limit).map((l) => <li key={l.id}>{l.action}{l.detail ? `: ${l.detail}` : ''} <span style={{ color: T.mute }}>({l.by})</span></li>)}
    </ul>
  );
}
