/**
 * Pure formatting + CSV helpers shared by the Lead Management "plus" widgets
 * and report pages. Nothing here touches React, the DOM or the network, so the
 * logic is covered by plain unit tests (e2e/crm-widgets-plus.spec.ts).
 *
 * Conventions (so every figure carries its unit):
 *   - money is INR, compact in Indian units: ₹1.2K, ₹3.4L (lakh), ₹5.6Cr (crore);
 *   - percentages are already 0-100 numbers from the API and print as "12.3%";
 *   - missing values print as an em dash, never as 0.
 */

export const DASH = '—';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** 1,23,456 style integer. */
export function fmtInt(v: unknown): string {
  const n = num(v);
  return n === null ? DASH : Math.round(n).toLocaleString('en-IN');
}

/** Rupees, compact: ₹950, ₹1.2K, ₹3.4L, ₹5.6Cr. */
export function fmtInr(v: unknown): string {
  const n = num(v);
  if (n === null) return DASH;
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const trim = (x: number, d: number) => String(parseFloat(x.toFixed(d)));
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7, 2)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5, 2)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3, 1)}K`;
  return `${sign}₹${Math.round(a)}`;
}

/** 12.3% — `digits` decimals, trailing zero trimmed. */
export function fmtPct(v: unknown, digits = 1): string {
  const n = num(v);
  return n === null ? DASH : `${parseFloat(n.toFixed(digits))}%`;
}

/** 4.5 d — one decimal at most. */
export function fmtDays(v: unknown): string {
  const n = num(v);
  return n === null ? DASH : `${parseFloat(n.toFixed(1))} d`;
}

/** Minutes as "<1m", "45m", "2h 35m", "1d 3h". */
export function fmtMinutes(v: unknown): string {
  const n = num(v);
  if (n === null) return DASH;
  if (n < 1) return '<1m';
  if (n < 60) return `${Math.round(n)}m`;
  if (n < 1440) {
    const h = Math.floor(n / 60);
    const m = Math.round(n - h * 60);
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(n / 1440);
  const h = Math.round((n - d * 1440) / 60);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

// Month names are fixed (not toLocaleString) so labels never vary with the runtime's ICU data ("Sep" vs "Sept").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-09" -> "9 Nov". Anything else is returned unchanged. */
export function weekLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return ymd;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

/** "2026-10" -> "Oct 2026". Anything else is returned unchanged. */
export function monthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return ym;
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Whole-number change between two periods as "+12%" / "-8%" / "new" / "—"; null when there is nothing to compare. */
export function fmtChange(current: unknown, previous: unknown): string {
  const c = num(current);
  const p = num(previous);
  if (c === null || p === null) return DASH;
  if (p === 0) return c === 0 ? '0%' : 'new';
  const pct = Math.round(((c - p) / Math.abs(p)) * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

/** Direction of a change for colouring: higher-is-better by default. */
export function changeTone(current: unknown, previous: unknown, higherIsBetter = true): 'good' | 'bad' | 'flat' {
  const c = num(current);
  const p = num(previous);
  if (c === null || p === null || c === p) return 'flat';
  return (c > p) === higherIsBetter ? 'good' : 'bad';
}

// ── Tables + CSV ─────────────────────────────────────────────────────────────

export interface Column<T> {
  /** Header shown on screen and used as the CSV header. */
  label: string;
  /** Raw value (number | string | null) used for sorting and the CSV. */
  value: (row: T) => string | number | null | undefined;
  /** Optional on-screen rendering of the value (units, compact money). Defaults to the raw value. */
  display?: (row: T) => string;
  numeric?: boolean;
}

/** The text shown in a table cell. */
export function cellText<T>(col: Column<T>, row: T): string {
  if (col.display) return col.display(row);
  const v = col.value(row);
  return v === null || v === undefined || v === '' ? DASH : String(v);
}

/**
 * Rows for the shared CSV downloader: one object per row keyed by the column
 * LABEL, holding the RAW value (not the compact on-screen text), so a
 * spreadsheet can sum and sort it. A column on screen is always a column here.
 */
export function columnsToCsvRows<T>(columns: Array<Column<T>>, rows: T[]): Array<Record<string, string | number>> {
  return rows.map((r) => {
    const out: Record<string, string | number> = {};
    for (const c of columns) {
      const v = c.value(r);
      out[c.label] = v === null || v === undefined ? '' : v;
    }
    return out;
  });
}

/** Today as YYYY-MM-DD (UTC), the same date the shared downloader stamps in file names. */
export const isoToday = (): string => new Date().toISOString().slice(0, 10);

/** A YYYY-MM-DD `days` before today. */
export function isoDaysAgo(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
