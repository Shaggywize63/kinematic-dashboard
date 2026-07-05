'use client';
/**
 * Reusable, type-aware column sorting for any list/table in the dashboard.
 *
 * Works with real <table> headers AND the grid-based "tables" this app uses —
 * `useTableSort` does the sorting; `<SortLabel>` is a markup-agnostic clickable
 * header label (drop it inside a <th> or a <div>). Three-state per column:
 * ascending → descending → unsorted (back to the natural order).
 *
 * The comparator is type-aware and needs no per-column config:
 *   • numbers compare numerically; booleans false→true;
 *   • numeric-looking strings ("42", "9,540", "55%") compare numerically;
 *   • ISO / d-m-y date strings compare chronologically;
 *   • everything else is locale, case-insensitive, natural ("Item 2" < "Item 10").
 *   • null / undefined / "" always sort LAST, in both directions.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

export type SortDir = 'asc' | 'desc';
export interface SortState { key: string | null; dir: SortDir }

const NUMERIC_RE = /^[-+]?[\d][\d.,\s]*%?$/;
const DATEISH_RE = /\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/;

/** Type-aware compare. Empty values always sort last (returned before the dir multiplier is applied by the caller — so we bias them positive here and the caller must NOT flip them). */
export function compareValues(a: unknown, b: unknown): number {
  const ae = a == null || a === '';
  const be = b == null || b === '';
  if (ae && be) return 0;
  if (ae) return 1;   // handled as "after" — see stableSort which keeps empties last both ways
  if (be) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);

  const as = String(a), bs = String(b);
  if (NUMERIC_RE.test(as.trim()) && NUMERIC_RE.test(bs.trim())) {
    const af = parseFloat(as.replace(/[,\s%]/g, '')), bf = parseFloat(bs.replace(/[,\s%]/g, ''));
    if (!Number.isNaN(af) && !Number.isNaN(bf)) return af - bf;
  }
  if (DATEISH_RE.test(as) && DATEISH_RE.test(bs)) {
    const ad = Date.parse(as), bd = Date.parse(bs);
    if (!Number.isNaN(ad) && !Number.isNaN(bd)) return ad - bd;
  }
  return as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' });
}

type Accessor<T> = (row: T, key: string) => unknown;
const defaultAccessor = <T,>(row: T, key: string): unknown => (row as Record<string, unknown>)[key];

/**
 * Sort `rows` by the active column. Returns the sorted array plus the current
 * state and a 3-state `toggle`. Empty values stay last regardless of direction.
 */
export function useTableSort<T>(rows: T[], accessor: Accessor<T> = defaultAccessor, initial: SortState = { key: null, dir: 'asc' }) {
  const [sort, setSort] = useState<SortState>(initial);

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const key = sort.key;
    const mul = sort.dir === 'asc' ? 1 : -1;
    return rows
      .map((r, i) => [r, i] as const)
      .sort((x, y) => {
        const av = accessor(x[0], key), bv = accessor(y[0], key);
        const aE = av == null || av === '', bE = bv == null || bv === '';
        if (aE || bE) {                      // empties pinned last in BOTH directions
          if (aE && bE) return x[1] - y[1];
          return aE ? 1 : -1;
        }
        const c = compareValues(av, bv);
        return c !== 0 ? c * mul : x[1] - y[1]; // stable
      })
      .map(([r]) => r);
  }, [rows, sort, accessor]);

  const toggle = (key: string) =>
    setSort((s) => (s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }));

  return { sorted, sort, toggle };
}

/** Clickable, accessible header label with an asc/desc/idle indicator. Put it
 *  inside a <th> or a grid <div> — it doesn't render the cell itself. */
export function SortLabel({ label, sortKey, sort, onToggle, align = 'left', style }: {
  label: ReactNode; sortKey: string; sort: SortState; onToggle: (k: string) => void;
  align?: 'left' | 'right' | 'center'; style?: CSSProperties;
}) {
  const dir = sort.key === sortKey ? sort.dir : null;
  return (
    <span
      role="button"
      tabIndex={0}
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
      onClick={() => onToggle(sortKey)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(sortKey); } }}
      title="Sort"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none',
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        color: dir ? 'var(--accent, #6366F1)' : 'inherit', ...style,
      }}
    >
      {label}
      <span aria-hidden style={{ fontSize: 9, lineHeight: 1, opacity: dir ? 1 : 0.4 }}>
        {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '⇅'}
      </span>
    </span>
  );
}
