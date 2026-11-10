'use client';
/**
 * Shared building blocks for the FFM report pages (Rep Activity, Beat Compliance, Time & Travel,
 * Outlet Visit Gaps, Geo-fence Exceptions, Supervisor Teams) and the extra columns on the older ones.
 *
 * A table is described ONCE as a list of columns (label, how to show a cell, what to sort on, what to
 * write to the CSV). The same list drives the on-screen table and the CSV, so an export can never drift
 * from what the page shows. Inline styles with the dashboard's CSS variables; responsive without media
 * queries (flex-wrap + auto-fit grids; wide tables scroll inside their own container, never the page).
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTableSort, SortLabel } from '../../../lib/tableSort';
import { RangePresetPicker } from '../../attendance/RangePresets';
import { downloadCsv, rangeProblem, toCsv, type CsvCell, type CsvColumn } from './reportUtils';

// ── data loading ──────────────────────────────────────────────────────────

export interface LoadState<T> { data: T | null; loading: boolean; error: string | null }

/**
 * Run `load` whenever `deps` change (and `enabled`), ignoring answers that arrive after a newer request
 * was sent. `reload()` re-runs it (the Retry button).
 */
export function useReportData<T>(load: () => Promise<T>, deps: unknown[], enabled = true): LoadState<T> & { reload: () => void } {
  const [state, setState] = useState<LoadState<T>>({ data: null, loading: enabled, error: null });
  const [tick, setTick] = useState(0);
  const reqId = useRef(0);
  useEffect(() => {
    if (!enabled) { setState({ data: null, loading: false, error: null }); return; }
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((d) => { if (id === reqId.current) setState({ data: d, loading: false, error: null }); })
      .catch((e: unknown) => {
        if (id === reqId.current) setState({ data: null, loading: false, error: (e as Error)?.message || 'Failed to load' });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Keep the last non-empty rep list so the dropdown does not collapse while a filtered answer is loading. */
export function useRepOptions(incoming: Array<{ id: string; name: string }> | undefined): Array<{ id: string; name: string }> {
  const [opts, setOpts] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => { if (incoming && incoming.length) setOpts(incoming); }, [incoming]);
  return opts;
}

// ── layout pieces ─────────────────────────────────────────────────────────

export function ReportHeader({ title, intro, onExport, exportDisabled, exportLabel = 'Export CSV' }: {
  title: string; intro: ReactNode; onExport?: () => void; exportDisabled?: boolean; exportLabel?: string;
}) {
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{title}</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{intro}</p>
      </div>
      {onExport && (
        <button
          type="button" onClick={onExport} disabled={exportDisabled}
          style={{
            background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 700,
            cursor: exportDisabled ? 'not-allowed' : 'pointer', fontSize: 13, opacity: exportDisabled ? 0.6 : 1,
          }}
        >
          ⬇ {exportLabel}
        </button>
      )}
    </header>
  );
}

export const card: CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12 };

/** The filter card: date range presets plus any extra controls the page passes in. */
export function FilterCard({ idPrefix, from, to, onRange, children }: {
  idPrefix: string; from: string; to: string; onRange: (from: string, to: string) => void; children?: ReactNode;
}) {
  const problem = rangeProblem(from, to);
  return (
    <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <RangePresetPicker from={from} to={to} onChange={onRange} idPrefix={idPrefix} />
      {children && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>{children}</div>}
      {problem && <div role="alert" style={{ fontSize: 12, color: '#ef4444' }}>{problem}</div>}
    </div>
  );
}

/** A labelled native select (testable by label, works with the keyboard and on phones). */
export function FilterSelect({ id, label, value, onChange, options }: {
  id: string; label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: '1 1 180px', maxWidth: 320 }}>
      <label htmlFor={id} style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-dim)' }}>{label}</label>
      <select
        id={id} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s1)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', minWidth: 0 }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>{children}</div>;
}

export function Stat({ label, value, accent, hint, testId }: { label: string; value: ReactNode; accent?: string; hint?: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} style={{ ...card, borderRadius: 10, padding: 12, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? 'var(--text)', marginTop: 4, wordBreak: 'break-word' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/** A short note under a table: how the numbers are computed, what the comparison basis is. */
export function Notes({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, padding: '0 2px' }}>{children}</div>;
}

export function StatusBox({ loading, error, onRetry, children }: { loading: boolean; error: string | null; onRetry?: () => void; children: ReactNode }) {
  if (error) {
    return (
      <div role="alert" style={{ ...card, padding: 16, color: '#ef4444', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{error}</span>
        {onRetry && <button type="button" onClick={onRetry} style={{ background: 'var(--s3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Retry</button>}
      </div>
    );
  }
  if (loading) return <div style={{ ...card, padding: 24, color: 'var(--text-dim)', textAlign: 'center' }}>Loading…</div>;
  return <>{children}</>;
}

// ── tables ────────────────────────────────────────────────────────────────

export interface Col<T> extends CsvColumn<T> {
  key: string;
  align?: 'left' | 'right';
  /** How the cell looks (default: the csv value). */
  cell?: (row: T) => ReactNode;
  /** What the column sorts on (default: the csv value). */
  sort?: (row: T) => unknown;
  /** Narrow, dim helper text shown under the header label (units, basis). */
  hint?: string;
}

const thStyle = (align?: 'left' | 'right'): CSSProperties => ({ padding: '10px 12px', textAlign: align ?? 'left', fontWeight: 700, whiteSpace: 'nowrap' });
const tdStyle = (align?: 'left' | 'right'): CSSProperties => ({ padding: '10px 12px', textAlign: align ?? 'left', color: 'var(--text)', whiteSpace: 'nowrap' });

/**
 * Sortable table in a self-scrolling container. `footer` rows (e.g. "Team median") render under the body
 * and are NOT sorted. `minWidth` keeps the columns readable on a phone: the container scrolls, the page does not.
 */
export function DataTable<T>({ cols, rows, rowKey, empty, initialSort, footer, minWidth = 720, testId }: {
  cols: Array<Col<T>>; rows: T[]; rowKey: (r: T) => string; empty: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' }; footer?: ReactNode; minWidth?: number; testId?: string;
}) {
  const accessor = useCallback((r: T, key: string): unknown => {
    const c = cols.find((x) => x.key === key);
    return c ? (c.sort ? c.sort(r) : c.csv(r)) : undefined;
  }, [cols]);
  const { sorted, sort, toggle } = useTableSort<T>(rows, accessor, initialSort ?? { key: null, dir: 'asc' });
  return (
    <div data-testid={testId} style={{ ...card, overflowX: 'auto', maxWidth: '100%' }}>
      <table style={{ width: '100%', minWidth, borderCollapse: 'collapse', fontSize: 13 }}>
        <thead style={{ background: 'var(--s3)', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          <tr>
            {cols.map((c) => (
              <th key={c.key} style={thStyle(c.align)} title={c.hint}>
                <SortLabel label={c.label} sortKey={c.key} sort={sort} onToggle={toggle} align={c.align} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={cols.length} style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', whiteSpace: 'normal' }}>{empty}</td></tr>
          ) : sorted.map((r) => (
            <tr key={rowKey(r)} style={{ borderTop: '1px solid var(--border)' }}>
              {cols.map((c) => <td key={c.key} style={tdStyle(c.align)}>{c.cell ? c.cell(r) : String(c.csv(r) ?? '—')}</td>)}
            </tr>
          ))}
          {footer}
        </tbody>
      </table>
    </div>
  );
}

/** A "Team median" style footer row: pass the text per column key; others stay empty. */
export function FooterRow<T>({ cols, label, values }: { cols: Array<Col<T>>; label: string; values: Record<string, ReactNode> }) {
  return (
    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--s3)', fontWeight: 700 }}>
      {cols.map((c, i) => (
        <td key={c.key} style={tdStyle(c.align)}>{i === 0 ? label : values[c.key] ?? ''}</td>
      ))}
    </tr>
  );
}

/** Build the CSV text of a table's columns over its (sorted-as-shown is not required) rows, plus optional footer lines. */
export function csvOf<T>(cols: Array<Col<T>>, rows: T[], footer?: Record<string, CsvCell>, footerLabel = 'Team median'): string {
  const body = toCsv(cols, rows);
  if (!footer) return body;
  const line = cols.map((c, i) => (i === 0 ? footerLabel : footer[c.key] ?? '')).map((v) => (v === null || v === undefined ? '' : String(v))).join(',');
  return `${body}\n${line}`;
}

export { downloadCsv };

/** A small neutral pill (never red/green: these are comparisons, not verdicts). */
export function Pill({ children, title }: { children: ReactNode; title?: string }) {
  return <span title={title} style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 99, padding: '1px 8px' }}>{children}</span>;
}
