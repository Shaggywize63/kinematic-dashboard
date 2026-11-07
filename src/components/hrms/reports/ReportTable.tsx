'use client';
// The report table: sortable headers that are real buttons (keyboard works), a totals row, and an empty message.

import { CSSProperties, useMemo } from 'react';
import Link from 'next/link';
import { T } from '../ui';
import { computeTotals, formatCell, isNumericCol, type RCol, type ReportRow } from './reportConfig';

export type SortState = { key: string; dir: 1 | -1 } | null;

/** Sort rows by a column (numbers numerically, text with natural order). Empty values go last either way. */
export function sortRows(cols: RCol[], rows: ReportRow[], sort: SortState): ReportRow[] {
  if (!sort) return rows;
  const c = cols.find((x) => x.key === sort.key);
  if (!c) return rows;
  const k = c.sortKey ?? c.key;
  return [...rows].sort((a, b) => {
    const x = a[k]; const y = b[k];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true });
    return cmp * sort.dir;
  });
}

/** `rows` arrive already sorted (the page owns the sort so the CSV export follows the same order). */
export default function ReportTable({ cols, rows, empty, label, sort, onSort }: {
  cols: RCol[]; rows: ReportRow[]; empty: string; label: string; sort: SortState; onSort: (s: SortState) => void;
}) {
  const totals = useMemo(() => computeTotals(cols, rows), [cols, rows]);
  const sorted = rows;

  const th: CSSProperties = { padding: 0, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, borderBottom: `1px solid ${T.border}`, background: T.panel, verticalAlign: 'bottom' };
  const td: CSSProperties = { padding: '10px 14px', fontSize: 13.5, color: T.text, whiteSpace: 'nowrap', verticalAlign: 'middle' };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table aria-label={label} style={{ width: '100%', borderCollapse: 'collapse', minWidth: Math.max(520, cols.length * 96) }}>
        <thead>
          <tr>
            {cols.map((c) => {
              const on = sort?.key === c.key;
              const num = isNumericCol(c);
              return (
                <th key={c.key} scope="col" style={th} aria-sort={on ? (sort!.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => onSort(sort?.key === c.key ? (sort.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })}
                    style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', padding: '10px 14px', textAlign: num ? 'right' : 'left', display: 'flex', justifyContent: num ? 'flex-end' : 'flex-start', gap: 4, whiteSpace: 'normal', lineHeight: 1.3 }}
                    title={`Sort by ${c.label}`}>
                    {c.label}<span aria-hidden style={{ width: 10 }}>{on ? (sort!.dir === 1 ? '↑' : '↓') : ''}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={cols.length} style={{ padding: 36, textAlign: 'center', color: T.mute, fontSize: 13.5 }}>{empty}</td></tr>
          ) : sorted.map((r) => (
            <tr key={r.id} className="km-navrow">
              {cols.map((c) => {
                const text = formatCell(c, r);
                const href = c.href?.(r);
                return (
                  <td key={c.key} style={{ ...td, borderTop: `1px solid ${T.border}`, textAlign: isNumericCol(c) ? 'right' : 'left', fontVariantNumeric: isNumericCol(c) ? 'tabular-nums' : undefined, color: text === '—' ? T.mute : T.text }}>
                    {href ? <Link href={href} style={{ color: T.text, fontWeight: 600, textDecoration: 'none' }}>{text}</Link> : text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr data-testid="report-totals">
              {cols.map((c, i) => {
                const v = totals[c.key];
                const first = i === 0 && v === undefined;
                return (
                  <td key={c.key} data-total={c.key} style={{ ...td, fontWeight: 700, background: T.panel, borderTop: `2px solid ${T.borderStrong}`, textAlign: isNumericCol(c) ? 'right' : 'left', fontVariantNumeric: isNumericCol(c) ? 'tabular-nums' : undefined }}>
                    {first ? `Total (${rows.length})` : v === undefined || v === null ? '' : formatCell(c, { id: 't', [c.key]: v })}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
