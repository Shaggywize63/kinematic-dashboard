/**
 * Pure helpers for judging an attendance day. All dates are plain YYYY-MM-DD IST calendar dates (the attendance
 * `date` column stores the IST day), all clock times are IST.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Convert any date/timestamp value to a plain YYYY-MM-DD string in IST.
 * Handles "2026-04-12", "2026-04-12 07:14:05.605+00" (space separator), "2026-04-12T00:00:00+00:00" and null.
 * Returns '' when the input cannot be parsed.
 */
export function toISTDate(val: unknown): string {
  if (!val) return '';
  const s = String(val).trim();
  // Already a plain YYYY-MM-DD — the DB `date` column always stores the IST calendar date, so accept it as is.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ms = new Date(s.replace(' ', 'T')).getTime();
  if (Number.isNaN(ms)) return '';
  return new Date(ms + IST_OFFSET_MS).toISOString().split('T')[0];
}

export const istTodayYmd = (nowMs = Date.now()): string => new Date(nowMs + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Minutes since IST midnight for an instant. */
export function istMinutesOfDay(ms: number): number {
  const d = new Date(ms + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD calendar date. */
export const weekdayOf = (ymd: string): number => new Date(`${ymd}T00:00:00Z`).getUTCDay();

export const addDaysYmd = (ymd: string, days: number): string => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Every date from `from` to `to`, inclusive. Empty when the range is reversed. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  if (!from || !to || from > to) return out;
  let cur = from;
  // Hard stop: a mistyped year must never build an unbounded list.
  for (let i = 0; i < 400 && cur <= to; i++) { out.push(cur); cur = addDaysYmd(cur, 1); }
  return out;
}

/** What the page needs from a client's shift rules (GET /attendance/rules). */
export interface RulesLite {
  /** False = the client never saved rules, so nothing about lateness / off days can be judged. */
  configured: boolean;
  shiftStartMin: number;
  graceMin: number;
  /** 0 = Sunday … 6 = Saturday. */
  weeklyOff: number[];
}

const toMin = (hhmm: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h >= 0 && h < 24 && mm >= 0 && mm < 60 ? h * 60 + mm : null;
};

/** Defensive parse of GET /attendance/rules; anything unexpected (an empty list, a 403 body, …) = no rules. */
export function parseRules(res: unknown): RulesLite | null {
  const r = res as { data?: unknown } | null | undefined;
  const inner = (r?.data as { data?: unknown } | undefined)?.data;
  const d = (inner && typeof inner === 'object' ? inner : r?.data ?? r) as Record<string, unknown> | null | undefined;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const rules = d.rules as Record<string, unknown> | undefined;
  if (!rules || typeof rules !== 'object') return null;
  const start = toMin(rules.shift_start);
  if (start == null) return null;
  const grace = Number(rules.grace_minutes);
  return {
    configured: d.configured === true,
    shiftStartMin: start,
    graceMin: Number.isFinite(grace) && grace >= 0 ? grace : 0,
    weeklyOff: Array.isArray(rules.weekly_off) ? (rules.weekly_off as unknown[]).filter((n): n is number => Number.isInteger(n)) : [],
  };
}

export type GapStatus = 'absent' | 'week_off' | 'not_yet';

/**
 * What a working-day gap (no attendance record) means:
 *  - a future day is not a gap at all → null (no row);
 *  - a weekly-off day is "Week off", not an absence;
 *  - TODAY, before shift start + grace, is "Not in yet", not an absence;
 *  - anything else is Absent.
 * A client without saved rules keeps the old behaviour: every past or current gap is Absent.
 */
export function gapStatus(day: string, rules: RulesLite | null, nowMs = Date.now()): GapStatus | null {
  const today = istTodayYmd(nowMs);
  if (day > today) return null;
  if (rules?.configured) {
    if (rules.weeklyOff.includes(weekdayOf(day))) return 'week_off';
    if (day === today && istMinutesOfDay(nowMs) < rules.shiftStartMin + rules.graceMin) return 'not_yet';
  }
  return 'absent';
}
