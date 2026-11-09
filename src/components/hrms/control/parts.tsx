'use client';
// Small pieces shared by the four control pages: layout helpers, a confirm dialog, a checkbox row, the confidence badge that also
// says "not tagged", and a before/after bar chart drawn in SVG.

import { useId, type CSSProperties, type ReactNode } from 'react';
import { Badge, Button, ConfidenceBadge, Modal, T } from '../ui';
import type { Confidence } from '../../../lib/hrms/rules';

export function Stack({ children, gap = 18, style }: { children: ReactNode; gap?: number; style?: CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>;
}
export function Muted({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.5, ...style }}>{children}</div>;
}
export function Row({ children, gap = 10, style }: { children: ReactNode; gap?: number; style?: CSSProperties }) {
  return <div style={{ display: 'flex', gap, flexWrap: 'wrap', alignItems: 'center', ...style }}>{children}</div>;
}

/** The confidence tag for a figure. A figure that rules.ts holds without a tag says so instead of looking verified. */
export function Conf({ level }: { level?: Confidence }) {
  if (level) return <ConfidenceBadge level={level} />;
  return <span title="rules.ts has no confidence tag for this figure, so it is not claimed as verified."><Badge tone="neutral">Not tagged</Badge></span>;
}

/** Marks anything that is worked out here and not a real transaction. */
export function SimulationBadge({ children = 'Simulation' }: { children?: ReactNode }) {
  return <Badge tone="info" mono>{children}</Badge>;
}

export function CheckRow({ checked, onChange, children, disabled, testId }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean; testId?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, fontSize: 13.5, color: T.text, cursor: disabled ? 'not-allowed' : 'pointer', minWidth: 0 }}>
      <input type="checkbox" data-testid={testId} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--info)', flex: '0 0 auto', cursor: 'inherit' }} />
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </label>
  );
}

export function ConfirmModal({ title, children, confirmLabel, danger, onConfirm, onClose }: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} width={460}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      )}>
      <div style={{ fontSize: 14, color: T.dim, lineHeight: 1.55 }}>{children}</div>
    </Modal>
  );
}

/** A labelled block with a one-line explanation, used for the "how to read this" notes. */
export function Callout({ title, children, tone = 'neutral', testId }: { title: ReactNode; children: ReactNode; tone?: 'neutral' | 'info' | 'warn'; testId?: string }) {
  const bg = tone === 'warn' ? T.warnWash : tone === 'info' ? T.infoWash : T.raised;
  return (
    <div data-testid={testId} style={{ background: bg, borderRadius: T.radius.md, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{title}</div>
      <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

// ───────────────────────────── bar chart ─────────────────────────────
export interface BarRow { key: string; label: string; a: number; b: number; format?: (n: number) => string; note?: ReactNode }

/**
 * Two bars per row (A above B), drawn in SVG. Each row has its own scale starting at zero, so the two bars in a row can be compared
 * honestly; bars in different rows are not comparable and the numbers are printed beside them. Negative values draw to the left of
 * a zero line. Text is HTML so it stays readable at phone width.
 */
export function BarCompare({ rows, aLabel, bLabel, format, testId, caption }: {
  rows: BarRow[]; aLabel: string; bLabel: string; format: (n: number) => string; testId?: string; caption: string;
}) {
  const id = useId();
  return (
    <figure data-testid={testId} aria-label={caption} style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <figcaption style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: T.dim }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 12, height: 8, borderRadius: 2, background: 'var(--dim)', display: 'inline-block' }} />{aLabel}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 12, height: 8, borderRadius: 2, background: 'var(--info)', display: 'inline-block' }} />{bLabel}</span>
      </figcaption>
      {rows.map((r) => {
        const f = r.format ?? format;
        const lo = Math.min(0, r.a, r.b);
        const hi = Math.max(0, r.a, r.b);
        const range = hi - lo || 1;
        const x = (v: number) => ((v - lo) / range) * 100;
        const bar = (v: number, y: number, fill: string) => {
          const x0 = x(0); const xv = x(v);
          const left = Math.min(x0, xv); const w = Math.abs(xv - x0);
          return <rect x={left} y={y} width={v === 0 ? 0 : Math.max(w, 0.6)} height={7} rx={0} style={{ fill }} />;
        };
        return (
          <div key={r.key} data-testid={`${testId ?? 'bars'}-${r.key}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: T.text }}>{r.label}</span>
              <span style={{ color: T.dim, fontVariantNumeric: 'tabular-nums' }}>{f(r.a)} to {f(r.b)}{r.note ? <> · {r.note}</> : null}</span>
            </div>
            <svg role="img" aria-labelledby={`${id}-${r.key}`} width="100%" height={18} viewBox="0 0 100 18" preserveAspectRatio="none" style={{ display: 'block' }}>
              <title id={`${id}-${r.key}`}>{`${r.label}: ${aLabel} ${f(r.a)}, ${bLabel} ${f(r.b)}`}</title>
              <rect x={0} y={0} width={100} height={18} rx={0} style={{ fill: 'var(--s3)' }} />
              {bar(r.a, 1.5, 'var(--dim)')}
              {bar(r.b, 9.5, 'var(--info)')}
              {lo < 0 && <line x1={x(0)} x2={x(0)} y1={0} y2={18} strokeWidth={0.6} vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--text)' }} />}
            </svg>
          </div>
        );
      })}
    </figure>
  );
}

export const signedInr = (n: number, fmt: (x: number) => string): string => `${n > 0 ? '+' : n < 0 ? '-' : ''}${fmt(Math.abs(n))}`;
