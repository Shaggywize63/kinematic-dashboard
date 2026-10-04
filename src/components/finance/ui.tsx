'use client';
// Shared building blocks for the Finance pages.

import { CSSProperties, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Input, PageHeader, Tone, T, useIsCompact, Card } from '../ui';
import { financeApi, FinanceCustomer, DisplayStatus } from '../../lib/financeApi';
import { inr } from '../../lib/financeFormat';

export { inr };

export function errMsg(e: unknown, fallback = 'Something went wrong'): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
export const fail = (e: unknown, fallback?: string) => toast.error(errMsg(e, fallback));

export function useDebounced<V>(value: V, ms = 300): V {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Page chrome: consistent padding, title row and compact flag. */
export function FinancePage({ title, description, actions, children, maxWidth }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; maxWidth?: number;
}) {
  const narrow = useIsCompact(900);
  return (
    <div style={{ padding: narrow ? 16 : 24, display: 'flex', flexDirection: 'column', gap: 18, maxWidth, margin: maxWidth ? '0 auto' : undefined }}>
      <PageHeader title={title} description={description} actions={actions} compact={narrow} />
      {children}
    </div>
  );
}

// ── status ──────────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' }, sent: { label: 'Sent', tone: 'info' }, partially_paid: { label: 'Partially Paid', tone: 'warn' },
  paid: { label: 'Paid', tone: 'ok' }, overdue: { label: 'Overdue', tone: 'red' }, void: { label: 'Void', tone: 'neutral' },
  accepted: { label: 'Accepted', tone: 'ok' }, declined: { label: 'Declined', tone: 'red' }, expired: { label: 'Expired', tone: 'warn' },
  invoiced: { label: 'Invoiced', tone: 'ok' },
};
export function StatusPill({ status }: { status: DisplayStatus | string }) {
  const s = STATUS[status] ?? { label: String(status).replace(/_/g, ' '), tone: 'neutral' as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

// ── table ───────────────────────────────────────────────────────────────────
export interface Col<R> {
  key: string; label: ReactNode; align?: 'left' | 'right' | 'center'; width?: number | string;
  render?: (row: R) => ReactNode; sortable?: boolean; nowrap?: boolean;
}
export function DataTable<R extends { id: string }>({ columns, rows, loading, empty, onRowClick, sort, onSort }: {
  columns: Col<R>[]; rows: R[]; loading?: boolean; empty?: ReactNode; onRowClick?: (row: R) => void;
  sort?: { key: string; dir: 'asc' | 'desc' }; onSort?: (key: string) => void;
}) {
  const th: CSSProperties = { padding: '10px 14px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap', background: T.panel };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ ...th, textAlign: c.align ?? 'left', width: c.width, cursor: c.sortable ? 'pointer' : undefined }}
                onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}>
                {c.label}{sort?.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: 28, textAlign: 'center', color: T.mute, fontSize: 13 }}>Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: 36, textAlign: 'center', color: T.mute, fontSize: 13.5 }}>{empty ?? 'Nothing here yet.'}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className="km-navrow"
              style={{ cursor: onRowClick ? 'pointer' : undefined, opacity: loading ? 0.6 : 1 }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: '12px 14px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, textAlign: c.align ?? 'left', whiteSpace: c.nowrap === false ? 'normal' : 'nowrap', fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : undefined }}>
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return total ? <div style={{ padding: '10px 14px', fontSize: 12.5, color: T.mute }}>{total} {total === 1 ? 'record' : 'records'}</div> : null;
  const from = (page - 1) * limit + 1, to = Math.min(total, page * limit);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: T.mute }}>{from}–{to} of {total}</span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span style={{ fontSize: 12.5, color: T.dim }}>Page {page} of {pages}</span>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </span>
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? 'Search…'} style={{ maxWidth: 320, minWidth: 200 }} aria-label="Search" />;
}

export function Stat({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: 'red' | 'ok' | 'warn' | 'info'; hint?: ReactNode }) {
  const color = tone ? T[tone] : T.text;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: T.heading, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// ── modal ───────────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, footer, width = 520 }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: width, maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, boxShadow: 'var(--shadow-pop)' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, fontFamily: T.heading, fontWeight: 700, fontSize: 16, color: T.text }}>{title}</div>
        <div style={{ padding: 20, overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>{footer}</div>}
      </div>
    </div>
  );
}

/** Promise-style confirm built on Modal. Usage: const [ask, dialog] = useConfirm(); if (await ask({...})) … ; render {dialog}. */
export function useConfirm(): [(o: { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean }) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<{ title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const ask = useCallback((o: { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean }) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const done = (v: boolean) => { state?.resolve(v); setState(null); };
  const dialog = state ? (
    <Modal title={state.title} onClose={() => done(false)} width={440}
      footer={<><Button onClick={() => done(false)}>Cancel</Button><Button variant={state.danger ? 'danger' : 'primary'} onClick={() => done(true)}>{state.confirmLabel ?? 'Confirm'}</Button></>}>
      <div style={{ fontSize: 14, color: T.dim, lineHeight: 1.5 }}>{state.message}</div>
    </Modal>
  ) : null;
  return [ask, dialog];
}

// ── customer picker (server-side search) ────────────────────────────────────
export function CustomerPicker({ value, onChange, invalid, disabled }: {
  value: string | null; onChange: (c: FinanceCustomer | null) => void; invalid?: boolean; disabled?: boolean;
}) {
  const [selected, setSelected] = useState<FinanceCustomer | null>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<FinanceCustomer[]>([]);
  const [busy, setBusy] = useState(false);
  const q = useDebounced(text, 250);
  const box = useRef<HTMLDivElement>(null);

  // Resolve the selected customer when only an id is known (edit forms, deep links).
  useEffect(() => {
    if (!value) { setSelected(null); return; }
    if (selected?.id === value) return;
    let off = false;
    financeApi.customers.get(value).then((r) => { if (!off) setSelected(r.data); }).catch(() => undefined);
    return () => { off = true; };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    let off = false;
    setBusy(true);
    financeApi.customers.list({ q, limit: 20, status: 'active' })
      .then((r) => { if (!off) setResults(r.data); })
      .catch(() => { if (!off) setResults([]); })
      .finally(() => { if (!off) setBusy(false); });
    return () => { off = true; };
  }, [q, open]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const pick = (c: FinanceCustomer | null) => { setSelected(c); setText(''); setOpen(false); onChange(c); };

  return (
    <div ref={box} style={{ position: 'relative' }}>
      {selected && !open ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="km-input"
            style={{ flex: 1, height: 36, textAlign: 'left', padding: '0 11px', borderRadius: 6, border: `1px solid ${invalid ? T.red : T.border}`, background: T.field, color: T.text, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {selected.display_name}{selected.gstin ? <span style={{ color: T.mute }}> · {selected.gstin}</span> : null}
          </button>
          {!disabled && <Button size="sm" onClick={() => pick(null)} aria-label="Clear customer">Clear</Button>}
        </div>
      ) : (
        <Input autoFocus={open} value={text} invalid={invalid} disabled={disabled} placeholder="Select or search a customer" onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true); }} />
      )}
      {open && (
        <div style={{ position: 'absolute', zIndex: 50, top: 40, left: 0, right: 0, background: T.card, border: `1px solid ${T.borderStrong}`, borderRadius: 8, boxShadow: 'var(--shadow-pop)', maxHeight: 280, overflowY: 'auto' }}>
          {busy && results.length === 0 && <div style={{ padding: 12, fontSize: 13, color: T.mute }}>Searching…</div>}
          {!busy && results.length === 0 && <div style={{ padding: 12, fontSize: 13, color: T.mute }}>No customers found.</div>}
          {results.map((c) => (
            <button key={c.id} type="button" onClick={() => pick(c)} className="km-navrow"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 0, background: 'transparent', cursor: 'pointer', color: T.text, fontFamily: 'inherit' }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.display_name}</div>
              <div style={{ fontSize: 12, color: T.mute }}>{[c.company_name, c.email, c.gstin].filter(Boolean).join(' · ')}</div>
            </button>
          ))}
          <Link href="/dashboard/finance/customers/new" style={{ display: 'block', padding: '10px 12px', fontSize: 13, color: T.info, borderTop: `1px solid ${T.border}` }}>＋ New customer</Link>
        </div>
      )}
    </div>
  );
}

export function EmptyCard({ children }: { children: ReactNode }) {
  return <Card style={{ textAlign: 'center', color: T.mute, fontSize: 14 }} padding={36}>{children}</Card>;
}
