/**
 * Small PURE helpers shared by the FFM report pages (no React, no imports) so the
 * CSV, range and formatting rules can be unit-tested on their own.
 */

/** Longest range the report endpoints accept (inclusive days). */
export const MAX_RANGE_DAYS = 62;

export type CsvCell = string | number | boolean | null | undefined;

/**
 * One CSV field. Numbers and booleans are written as-is; text is quoted when it holds a comma, quote or
 * line break, and a leading = + - @ is prefixed with an apostrophe so a name typed as a formula never runs
 * when the file is opened in a spreadsheet.
 */
export function csvCell(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(cells: CsvCell[]): string {
  return cells.map(csvCell).join(',');
}

export interface CsvColumn<T> {
  label: string;
  /** The value written to the file (and the one the column sorts on unless `sortValue` is given). */
  csv: (row: T) => CsvCell;
}

/** Header + one line per row, in the order and with the columns the table shows. */
export function toCsv<T>(columns: Array<CsvColumn<T>>, rows: T[]): string {
  return [csvLine(columns.map((c) => c.label)), ...rows.map((r) => csvLine(columns.map((c) => c.csv(r))))].join('\n');
}

/** Download text as a UTF-8 CSV file (browser only). */
export function downloadCsv(filename: string, text: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 'YYYY-MM-DD' shifted by whole days (calendar arithmetic, no time-zone drift). */
export function addDaysYmd(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Inclusive number of days between two YYYY-MM-DD dates (0 when either is empty or to < from). */
export function daysInRange(from: string, to: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) return 0;
  const d = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(d) && d >= 0 ? d + 1 : 0;
}

/** A friendly reason a from/to pair cannot be sent, or null when it is fine. */
export function rangeProblem(from: string, to: string): string | null {
  if (!from || !to) return 'Pick a start and an end date.';
  if (to < from) return 'The end date is before the start date.';
  if (daysInRange(from, to) > MAX_RANGE_DAYS) return `Pick at most ${MAX_RANGE_DAYS} days at a time.`;
  return null;
}

/** Median of the finite numbers; null when there are none. */
export function median(xs: Array<number | null | undefined>): number | null {
  const a = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

// ── formatting (units always shown by the column label or the suffix) ─────

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

export const dash = '—';
export const fmtInt = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? dash : inr.format(v));
export const fmtInr = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? dash : `₹${inr.format(v)}`);
export const fmtNum = (v: number | null | undefined, unit = ''): string => (v == null || !Number.isFinite(v) ? dash : `${num1.format(v)}${unit}`);
export const fmtPct = (v: number | null | undefined): string => fmtNum(v, '%');
/** Signed difference to a basis, e.g. "+0.5" / "-3.2" / "0". */
export function fmtDelta(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return dash;
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return r > 0 ? `+${r}` : String(r);
}
/** 'YYYY-MM-DD' -> '09 Nov' (no time-zone shift: the string is a calendar date). */
export function fmtDay(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return dash;
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}
/** ISO instant -> 'HH:MM' in IST. */
export function fmtIstTime(iso: string | null | undefined): string {
  if (!iso) return dash;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return dash;
  const d = new Date(ms + 330 * 60_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
