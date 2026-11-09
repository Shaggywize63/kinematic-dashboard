// Small text helpers for the assistant engine: normalising, months, dates and names. Pure, no storage, no clock
// (every date is worked out from the `today` argument, never from new Date()).

import type { Employee, HrmsDb, ISODate, Month } from '../types';
import { addDays } from '../format';

/** Lower-case, straighten quotes, drop punctuation that carries no meaning, squeeze spaces. Keeps digits, - and /. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/'s\b/g, '')
    .replace(/[^a-z0-9ऀ-෿/\-:\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTH_WORDS: [RegExp, number][] = [
  [/\bjan(?:uary)?\b/, 1], [/\bfeb(?:ruary)?\b/, 2], [/\bmar(?:ch)?\b/, 3], [/\bapr(?:il)?\b/, 4], [/\bmay\b(?! i\b| we\b| you\b| be\b| not\b)/, 5],
  [/\bjun(?:e)?\b/, 6], [/\bjul(?:y)?\b/, 7], [/\baug(?:ust)?\b/, 8], [/\bsep(?:t(?:ember)?)?\b/, 9], [/\boct(?:ober)?\b/, 10],
  [/\bnov(?:ember)?\b/, 11], [/\bdec(?:ember)?\b/, 12],
];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthNum = (w: string): number => {
  const k = w.slice(0, 3);
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(k) + 1;
};
const pad = (n: number) => String(n).padStart(2, '0');

export function addMonthsTo(m: Month, delta: number): Month {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * A month named in the text: "october", "oct 2026", "last month", "pichle mahine", "this month".
 * A bare month name means the nearest one to today in the direction given by `prefer`.
 */
export function parseMonth(norm: string, today: ISODate, prefer: 'past' | 'future' = 'past'): Month | null {
  const cur = today.slice(0, 7);
  if (/\b(last|previous|prev|pichle|pichhle|pichla|pichhla|pichle wale)\s+(month|mahine|mahina|maheene|mahine ki|mahine ka)\b/.test(norm) || /\bpichle (mahine|maheene)\b/.test(norm)) return addMonthsTo(cur, -1);
  if (/\b(next|agle|agla|aglay)\s+(month|mahine|mahina|maheene)\b/.test(norm)) return addMonthsTo(cur, 1);
  if (/\b(this|current|is|iss|ish)\s+(month|mahine|mahina|maheene)\b/.test(norm)) return cur;
  const yearMatch = /\b(20\d{2})\b/.exec(norm);
  for (const [re, n] of MONTH_WORDS) {
    if (!re.test(norm)) continue;
    // "12 nov" is a date, not a month request; the caller decides. Here the month number is all we want.
    let year: number;
    if (yearMatch) year = Number(yearMatch[1]);
    else {
      const [cy, cm] = cur.split('-').map(Number) as [number, number];
      if (prefer === 'past') year = n <= cm ? cy : cy - 1;
      else year = n >= cm ? cy : cy + 1;
    }
    return `${year}-${pad(n)}`;
  }
  return null;
}

const WEEKDAYS: [RegExp, number][] = [
  [/\b(sunday|sun|ravivar|raviwar|itwar|itvar)\b/, 0], [/\b(monday|mon|somvar|somwar|somvaar)\b/, 1], [/\b(tuesday|tue|tues|mangalvar|mangalwar|mangalvaar)\b/, 2],
  [/\b(wednesday|wed|budhvar|budhwar|budhvaar)\b/, 3], [/\b(thursday|thu|thur|thurs|guruvar|guruwar|veervar|brihaspativar)\b/, 4], [/\b(friday|fri|shukravar|shukrawar|shukravaar)\b/, 5],
  [/\b(saturday|sat|shanivar|shaniwar|shanivaar)\b/, 6],
];
export const weekdayOf = (d: ISODate): number => new Date(`${d}T00:00:00Z`).getUTCDay();
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Tue 10 Nov 2026" */
export function dayLabel(d: ISODate): string {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return `${WEEKDAY_SHORT[weekdayOf(d)]} ${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, ek: 1, two: 2, do: 2, three: 3, teen: 3, tin: 3, four: 4, char: 4, chaar: 4, five: 5, paanch: 5, panch: 5, six: 6, chhe: 6, che: 6, seven: 7, saat: 7, sat: 7,
  eight: 8, aath: 8, nine: 9, nau: 9, ten: 10, das: 10,
};

export interface ParsedDates {
  /** Dates found in the text, in the order they appear. */
  dates: ISODate[];
  from?: ISODate;
  to?: ISODate;
  /** "for 3 days": how many days, when the end date was not given. */
  days?: number;
  half: boolean;
  /** True when the text had a connecting word like "to" / "se" / "tak" between two dates. */
  range: boolean;
}

function validDate(y: number, m: number, d: number): ISODate | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return new Date(`${iso}T00:00:00Z`).getUTCMonth() + 1 === m ? iso : null;
}

/** Pull dates, a range, a day count and a half-day marker out of a request like "10 nov to 12 nov" or "kal, half day". */
export function parseDates(norm: string, today: ISODate): ParsedDates {
  const found: { at: number; iso: ISODate }[] = [];
  const used: [number, number][] = [];
  const take = (re: RegExp, make: (m: RegExpExecArray) => ISODate | null) => {
    const g = new RegExp(re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(norm))) {
      const start = m.index; const end = start + m[0].length;
      if (used.some(([a, b]) => start < b && end > a)) continue;
      const iso = make(m);
      if (iso) { found.push({ at: start, iso }); used.push([start, end]); }
    }
  };
  const [ty] = today.split('-').map(Number) as [number];
  // 2026-11-12
  take(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/, (m) => validDate(Number(m[1]), Number(m[2]), Number(m[3])));
  // 12/11 or 12-11-2026 (day first, as in India)
  take(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/, (m) => {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : ty;
    return validDate(y, Number(m[2]), Number(m[1]));
  });
  // 12 nov, 12th november 2026
  take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH_RE}\\b(?:\\s+(20\\d{2}))?`), (m) => validDate(m[3] ? Number(m[3]) : ty, monthNum(m[2]!), Number(m[1])));
  // nov 12, november 12th
  take(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s+(20\\d{2}))?`), (m) => validDate(m[3] ? Number(m[3]) : ty, monthNum(m[1]!), Number(m[2])));
  // today, tomorrow, the day after
  take(/\b(day after tomorrow|overmorrow|parso|parson)\b/, () => addDays(today, 2));
  take(/\b(tomorrow|tmrw|tomorow|tommorow|kal)\b/, () => addDays(today, 1));
  take(/\b(yesterday)\b/, () => addDays(today, -1));
  take(/\b(today|aaj)\b/, () => today);
  // weekday names (next occurrence after today)
  for (const [re, wd] of WEEKDAYS) {
    take(re, () => {
      let d = addDays(today, 1);
      for (let i = 0; i < 7 && weekdayOf(d) !== wd; i++) d = addDays(d, 1);
      return d;
    });
  }
  found.sort((a, b) => a.at - b.at);
  const dates = found.map((f) => f.iso);

  const half = /\b(half[ -]?day|halfday|aadha din|adha din|aadhe din|half leave|first half|second half)\b/.test(norm);
  let days: number | undefined;
  const dm = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|ek|do|teen|tin|char|chaar|paanch|panch|chhe|che|saat|aath|nau|das)\s*(?:days?|din|dino|diwas)\b/.exec(norm);
  if (dm) { const raw = dm[1]!; days = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw]; }
  const range = dates.length >= 2 && /\b(to|se|tak|till|until|through|thru|and|aur)\b|\d\s*-\s*\d|\d\s*-\s*[a-z]/.test(norm);

  const out: ParsedDates = { dates, half, range, days };
  if (dates.length) {
    out.from = dates[0];
    if (dates.length >= 2) {
      const sorted = [...dates].sort();
      out.from = sorted[0]; out.to = sorted[sorted.length - 1];
    }
  }
  // "12 to 14 nov": the first number has no month. Give it the month of the second date.
  if (dates.length === 1) {
    const m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:to|se|-|tak|till|until)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH_RE}\\b`).exec(norm);
    if (m) {
      const mo = monthNum(m[3]!);
      const a = validDate(ty, mo, Number(m[1])); const b = validDate(ty, mo, Number(m[2]));
      if (a && b) { out.dates = [a, b]; out.from = a < b ? a : b; out.to = a < b ? b : a; out.range = true; }
    }
  }
  return out;
}

// ───────────────────────────── names ─────────────────────────────
// A last name on its own is only used when it cannot be mistaken for a common word.
const NOT_A_NAME = new Set(['more', 'ali']);

/** People named in the text. First name, full name or (unusual) last name, whole words only. */
export function findPeople(db: HrmsDb, norm: string): { matched: Employee[]; ambiguous: string[] } {
  const words = new Set(norm.split(/[\s/:-]+/).filter(Boolean));
  const byToken = new Map<string, Employee[]>();
  const add = (tok: string, e: Employee) => { if (tok.length < 3) return; const l = byToken.get(tok) ?? []; l.push(e); byToken.set(tok, l); };
  for (const e of db.employees) {
    add(e.firstName.toLowerCase(), e);
    const last = e.lastName.toLowerCase();
    if (!NOT_A_NAME.has(last)) add(last, e);
  }
  const hit = new Map<string, Employee>();
  const ambiguous: string[] = [];
  for (const [tok, list] of byToken) {
    if (!words.has(tok)) continue;
    if (list.length > 1) { if (!ambiguous.includes(tok)) ambiguous.push(tok); continue; }
    hit.set(list[0]!.id, list[0]!);
  }
  // "Farhan Ali": both words point at the same person. If the full name is present, ignore the other words.
  const matched = [...hit.values()];
  // Drop an ambiguous token when a full name in the text already settles it.
  const settled = ambiguous.filter((tok) => !matched.some((e) => e.firstName.toLowerCase() === tok || e.lastName.toLowerCase() === tok));
  return { matched, ambiguous: settled };
}
