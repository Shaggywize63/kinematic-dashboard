'use client';
// Shared building blocks for the HRMS pages. Built on the dashboard kit (components/ui) so light and dark follow
// the same tokens; inline styles only, responsive through useIsCompact, no media queries.

import { CSSProperties, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Avatar, Badge, Button, Card, EmptyState, Eyebrow, PageHeader, T, useIsCompact, type Tone } from '../ui';
import type { Employee } from '../../lib/hrms/types';
import { fullName } from '../../lib/hrms/format';
import type { Confidence } from '../../lib/hrms/rules';

export { Avatar, Badge, Button, Card, EmptyState, Eyebrow, T, useIsCompact };
export type { Tone };

/** Page chrome: padding, title row, compact flag. */
export function HrmsPage({ title, description, actions, children, maxWidth, eyebrow }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; maxWidth?: number; eyebrow?: ReactNode;
}) {
  const narrow = useIsCompact(900);
  return (
    <div style={{ padding: narrow ? 16 : 24, display: 'flex', flexDirection: 'column', gap: 18, maxWidth, margin: maxWidth ? '0 auto' : undefined }}>
      <PageHeader title={title} description={description} actions={actions} compact={narrow} eyebrow={eyebrow} />
      {children}
    </div>
  );
}

export function Loading() {
  return <div style={{ padding: 24, color: T.dim, fontSize: 13.5 }}>Loading the sample data…</div>;
}

/** Headline number with a label and an optional hint. */
export function Stat({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; href?: string }) {
  const color = tone === 'red' ? T.red : tone === 'warn' ? T.warn : tone === 'ok' ? T.ok : tone === 'info' ? T.info : T.text;
  const body = (
    <Card padding={16} style={{ height: '100%' }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ fontFamily: T.heading, fontSize: 26, fontWeight: 700, color, marginTop: 6, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint && <div style={{ fontSize: 12.5, color: T.dim, marginTop: 6 }}>{hint}</div>}
    </Card>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{body}</Link> : body;
}

export function StatGrid({ children, min = 190 }: { children: ReactNode; min?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap: 12 }}>{children}</div>;
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{children}</h2>
      {right}
    </div>
  );
}

// ───────────────────────────── tabs ─────────────────────────────
/** Reads and writes ?tab= without useSearchParams (which would force a Suspense boundary on every page). */
export function useTabParam<K extends string>(keys: readonly K[], fallback: K): [K, (k: K) => void] {
  const [tab, setTab] = useState<K>(fallback);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as K | null;
    if (t && keys.includes(t)) setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = useCallback((k: K) => {
    setTab(k);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', k);
    window.history.replaceState(null, '', url.toString());
  }, []);
  return [tab, set];
}

export function TabBar<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: ReactNode; count?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${T.border}`, overflowX: 'auto' }}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.key)} style={{
            border: 0, background: 'transparent', padding: '10px 14px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: on ? 700 : 500, cursor: 'pointer',
            color: on ? T.text : T.dim, borderBottom: `2px solid ${on ? T.red : 'transparent'}`, marginBottom: -1, whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {t.label}
            {t.count != null && <span style={{ fontSize: 11.5, background: T.raised, color: T.dim, borderRadius: 999, padding: '1px 7px', fontVariantNumeric: 'tabular-nums' }}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────────── modal ─────────────────────────────
export function Modal({ title, onClose, children, footer, width = 560 }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,14,26,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1}
        style={{ width: '100%', maxWidth: width, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, outline: 'none', boxShadow: '0 24px 60px -20px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
          <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 16, fontWeight: 700, color: T.text }}>{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} style={{ border: 0, background: 'transparent', color: T.dim, fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: 4 }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: `1px solid ${T.border}`, flexWrap: 'wrap' }}>{footer}</div>}
      </div>
    </div>
  );
}

// ───────────────────────────── table ─────────────────────────────
export interface Col<R> { key: string; label: ReactNode; align?: 'left' | 'right' | 'center'; width?: number | string; render?: (row: R) => ReactNode; sortValue?: (row: R) => string | number; nowrap?: boolean }

export function DataTable<R extends { id: string }>({ columns, rows, empty, onRowClick, minWidth = 640, footer }: {
  columns: Col<R>[]; rows: R[]; empty?: ReactNode; onRowClick?: (row: R) => void; minWidth?: number; footer?: ReactNode;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sorted = (() => {
    if (!sort) return rows;
    const c = columns.find((x) => x.key === sort.key);
    if (!c?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const x = c.sortValue!(a); const y = c.sortValue!(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  })();
  const th: CSSProperties = { padding: '10px 14px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap', background: T.panel };
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.lg, background: T.card }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ ...th, textAlign: c.align ?? 'left', width: c.width, cursor: c.sortValue ? 'pointer' : undefined }}
                aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                onClick={c.sortValue ? () => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 })) : undefined}>
                {c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: 36, textAlign: 'center', color: T.mute, fontSize: 13.5 }}>{empty ?? 'Nothing here yet.'}</td></tr>
          ) : sorted.map((r) => (
            <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className="km-navrow" style={{ cursor: onRowClick ? 'pointer' : undefined }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: '11px 14px', fontSize: 13.5, borderTop: `1px solid ${T.border}`, textAlign: c.align ?? 'left', whiteSpace: c.nowrap ? 'nowrap' : undefined, color: T.text, verticalAlign: 'middle' }}>
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}
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

// ───────────────────────────── small pieces ─────────────────────────────
export function EmployeeCell({ e, sub, href = true }: { e: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'code'>; sub?: ReactNode; href?: boolean }) {
  const inner = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <Avatar name={fullName(e)} size={30} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(e)}</div>
        <div style={{ fontSize: 12, color: T.mute, fontFamily: T.mono }}>{sub ?? e.code}</div>
      </div>
    </div>
  );
  return href ? <Link href={`/dashboard/hrms/employees/${e.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : inner;
}

export function ProgressBar({ pct, tone = 'ok', height = 6 }: { pct: number; tone?: Tone; height?: number }) {
  const c = tone === 'red' ? T.red : tone === 'warn' ? T.warn : tone === 'info' ? T.info : T.ok;
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} style={{ height, borderRadius: height, background: T.raised, overflow: 'hidden', minWidth: 60 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: c, borderRadius: height }} />
    </div>
  );
}

export function KeyValue({ rows, columns = 2 }: { rows: { label: ReactNode; value: ReactNode }[]; columns?: number }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${Math.floor(560 / columns)}px, 100%), 1fr))`, gap: '12px 24px' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ minWidth: 0 }}>
          <dt style={{ fontSize: 12, color: T.mute, marginBottom: 2 }}>{r.label}</dt>
          <dd style={{ margin: 0, fontSize: 14, color: T.text, overflowWrap: 'anywhere' }}>{r.value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tag that tells people how far a statutory figure can be trusted. */
export function ConfidenceBadge({ level }: { level: Confidence }) {
  const m = { verified: { t: 'ok' as Tone, l: 'Verified' }, reported: { t: 'warn' as Tone, l: 'Reported, confirm' }, indicative: { t: 'red' as Tone, l: 'Sample, confirm' } }[level];
  return <Badge tone={m.t}>{m.l}</Badge>;
}

export const STATUS_TONE: Record<string, Tone> = {
  active: 'ok', onboarding: 'info', on_notice: 'warn', exited: 'neutral',
  draft: 'neutral', computed: 'info', frozen: 'warn', paid: 'ok',
  filed: 'ok', upcoming: 'neutral', due_soon: 'warn', overdue: 'red',
  verified: 'ok', uploaded: 'info', pending: 'warn', rejected: 'red',
  blocker: 'red', warning: 'warn', info: 'info',
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>{label ?? status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}</Badge>;
}

export function SearchBox({ value, onChange, placeholder = 'Search', width = 260 }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number }) {
  return (
    <input type="search" aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="km-input"
      style={{ height: 36, width: '100%', maxWidth: width, padding: '0 12px', borderRadius: T.radius.md, border: `1px solid ${T.border}`, background: T.field, color: T.text, fontFamily: 'inherit', fontSize: 14 }} />
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>;
}

export function Note({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const bg = tone === 'warn' ? T.warnWash : tone === 'red' ? T.redWash : tone === 'ok' ? T.okWash : T.infoWash;
  const fg = tone === 'warn' ? T.warn : tone === 'red' ? T.red : tone === 'ok' ? T.ok : T.info;
  return <div role="note" style={{ padding: '10px 14px', borderRadius: T.radius.md, background: bg, color: fg, fontSize: 13, lineHeight: 1.5 }}>{children}</div>;
}

// ───────────────────────────── downloads ─────────────────────────────
export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
export function downloadRows(filename: string, header: string[], rows: (string | number | null | undefined)[][]): void {
  const esc = (v: unknown) => { const s = v == null ? '' : String(v).replace(/"/g, '""'); return /[",\n]/.test(s) ? `"${s}"` : s; };
  downloadText(filename.endsWith('.csv') ? filename : `${filename}.csv`, [header, ...rows].map((r) => r.map(esc).join(',')).join('\n'), 'text/csv;charset=utf-8');
}

/** Month picker options for the last `back` months and the next `fwd`. */
export function monthOptions(current: string, back = 12, fwd = 1): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const [y, m] = current.split('-').map(Number);
  for (let i = -back; i <= fwd; i++) {
    const d = new Date(Date.UTC(y!, m! - 1 + i, 1));
    const v = d.toISOString().slice(0, 7);
    out.push({ value: v, label: d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) });
  }
  return out.reverse();
}
