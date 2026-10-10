/**
 * Check-in / check-out / time spent for one form submission (Work Activities, Submissions).
 *
 * Only REAL values are ever shown: a form that was submitted with no check-in or check-out has none, and the page
 * says "—" rather than borrowing `submitted_at`. Pure functions, no imports, so they can be unit-tested directly.
 *
 * `duration_minutes` is what the server stores (round((out − in) / 60 s), empty when the pair is missing, out
 * before in, or longer than 24 h). Rows saved before that column was filled in have both times but no duration,
 * so the same arithmetic is repeated here as a fallback.
 */

export interface VisitFields {
  check_in_at?: string | null;
  check_out_at?: string | null;
  duration_minutes?: number | string | null;
}

/** A visit longer than this is not a visit (forgotten check-out); the server stores no duration for it either. */
export const MAX_VISIT_MINUTES = 24 * 60;

/** Epoch ms of a timestamp, or null when absent / unreadable. Also reads Postgres' "2026-10-10 09:05:00+00". */
export function stampMs(v?: string | null): number | null {
  if (!v) return null;
  let s = String(v).trim().replace(' ', 'T');
  if (/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?[+-]\d{2}$/.test(s)) s += ':00'; // "+00" is not a valid ISO offset for Date
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Whole minutes spent on a form, or null when it cannot be known. */
export function visitMinutes(f: VisitFields): number | null {
  const stored = f.duration_minutes == null || f.duration_minutes === '' ? NaN : Number(f.duration_minutes);
  // A stored 0 is not trusted (older app builds wrote 0 for "unknown"): the times decide below.
  if (Number.isFinite(stored) && stored > 0 && stored <= MAX_VISIT_MINUTES) return Math.round(stored);
  const a = stampMs(f.check_in_at);
  const b = stampMs(f.check_out_at);
  if (a == null || b == null || b < a) return null;
  const m = Math.round((b - a) / 60000);
  return m <= MAX_VISIT_MINUTES ? m : null;
}

/** "18m", "1h 5m", "<1m" (checked out within the first half minute), "—" when unknown. */
export function fmtMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—';
  if (min <= 0) return '<1m';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Total time over a group of forms. `total` is null when none of them has a time; `counted` is how many did. */
export function sumMinutes(rows: VisitFields[]): { total: number | null; counted: number } {
  let total = 0;
  let counted = 0;
  for (const r of rows) {
    const m = visitMinutes(r);
    if (m != null) { total += m; counted++; }
  }
  return { total: counted ? total : null, counted };
}

/** The earliest real check-in in a group (the original string), or null. */
export function earliestCheckIn(rows: VisitFields[]): string | null {
  let best: { ms: number; raw: string } | null = null;
  for (const r of rows) {
    const ms = stampMs(r.check_in_at);
    if (ms != null && (!best || ms < best.ms)) best = { ms, raw: String(r.check_in_at) };
  }
  return best ? best.raw : null;
}

/** The latest real check-out in a group (the original string), or null. */
export function latestCheckOut(rows: VisitFields[]): string | null {
  let best: { ms: number; raw: string } | null = null;
  for (const r of rows) {
    const ms = stampMs(r.check_out_at);
    if (ms != null && (!best || ms > best.ms)) best = { ms, raw: String(r.check_out_at) };
  }
  return best ? best.raw : null;
}

/** "09:05 AM" in the viewer's time zone, "—" when absent. */
export function fmtClock(v?: string | null): string {
  const ms = stampMs(v);
  return ms == null ? '—' : new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** "10 Oct, 09:05 AM" in the viewer's time zone, "—" when absent. */
export function fmtStamp(v?: string | null): string {
  const ms = stampMs(v);
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}, ${fmtClock(v)}`;
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** "2026-10-10 09:05" in the viewer's time zone — spreadsheets read it as a date-time. "" when absent (never a made-up time). */
export function csvStamp(v?: string | null): string {
  const ms = stampMs(v);
  if (ms == null) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** A "lat,lng" text: the stored one, else built from a latitude / longitude pair, else "". Never "undefined,undefined". */
export function gpsText(gps?: string | null, lat?: unknown, lng?: unknown): string {
  const g = typeof gps === 'string' ? gps.trim() : '';
  if (g) return g;
  if (lat == null || lng == null || lat === '' || lng === '') return '';
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) ? `${a},${b}` : '';
}
