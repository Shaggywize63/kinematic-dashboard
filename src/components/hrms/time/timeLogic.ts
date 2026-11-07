// Pure logic for the Time & leave screens: shift arithmetic, roster rule checks, overtime quarters, leave policy
// wording and holiday calendars. No React and no storage, so e2e/hrms-org-time.spec.ts tests it without a browser.

import type {
  AttendanceSummary, Employee, EmploymentType, Holiday, HolidayList, Id, ISODate, LeaveType, Month, OvertimeRule, RosterRow, Shift,
} from '../../../lib/hrms/types';
import { addDays, fmtDate } from '../../../lib/hrms/format';
import { LABOUR_CODES } from '../../../lib/hrms/rules';

export type Errors<K extends string> = Partial<Record<K, string>>;
const clean = <K extends string>(e: Errors<K>): Errors<K> => Object.fromEntries(Object.entries(e).filter(([, v]) => v)) as Errors<K>;
const trimNum = (n: number): string => String(Math.round(n * 100) / 100);
const isInt = (n: number) => Number.isInteger(n);

// ───────────────────────────── shifts ─────────────────────────────
export const toMinutes = (hhmm: string): number => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
/** The night flag is derived: a shift that ends before it starts runs past midnight. */
export const crossesMidnight = (start: string, end: string): boolean => {
  const s = toMinutes(start); const e = toMinutes(end);
  return !Number.isNaN(s) && !Number.isNaN(e) && e < s;
};
/** Minutes between start and end, rolling over midnight when the end is earlier. Zero for equal or invalid times. */
export function spanMinutes(start: string, end: string): number {
  const s = toMinutes(start); const e = toMinutes(end);
  if (Number.isNaN(s) || Number.isNaN(e) || s === e) return 0;
  return e > s ? e - s : e + 1440 - s;
}
/** Paid duration: time on duty less the unpaid break. */
export const paidMinutes = (s: Pick<Shift, 'start' | 'end' | 'breakMinutes'>): number => Math.max(0, spanMinutes(s.start, s.end) - (s.breakMinutes || 0));
export function durationText(min: number): string {
  const h = Math.floor(min / 60); const m = Math.round(min % 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export const SHIFT_COLORS: { value: string; name: string }[] = [
  { value: '#3E9EFF', name: 'Blue' }, { value: '#00C9B1', name: 'Teal' }, { value: '#FFB800', name: 'Amber' }, { value: '#9B6EFF', name: 'Violet' },
  { value: '#FF6B6B', name: 'Coral' }, { value: '#7ED957', name: 'Green' }, { value: '#FF8A3D', name: 'Orange' }, { value: '#E65CA8', name: 'Pink' },
];

export interface ShiftForm { name: string; start: string; end: string; breakMinutes: string; graceMinutes: string; fullDayHours: string; halfDayHours: string; color: string }
export const emptyShiftForm = (): ShiftForm => ({ name: '', start: '09:00', end: '18:00', breakMinutes: '60', graceMinutes: '10', fullDayHours: '8', halfDayHours: '4', color: SHIFT_COLORS[0]!.value });
export const shiftToForm = (s: Shift): ShiftForm => ({ name: s.name, start: s.start, end: s.end, breakMinutes: String(s.breakMinutes), graceMinutes: String(s.graceMinutes), fullDayHours: String(s.fullDayHours), halfDayHours: String(s.halfDayHours), color: s.color });
export const formToShift = (f: ShiftForm, id: Id): Shift => ({
  id, name: f.name.trim(), start: f.start, end: f.end, breakMinutes: Number(f.breakMinutes), graceMinutes: Number(f.graceMinutes),
  fullDayHours: Number(f.fullDayHours), halfDayHours: Number(f.halfDayHours), isNight: crossesMidnight(f.start, f.end), color: f.color,
});
const numOrNaN = (v: string) => (v.trim() === '' ? NaN : Number(v));

export function validateShift(f: ShiftForm, others: Shift[]): { errors: Errors<keyof ShiftForm>; warnings: string[] } {
  const e: Errors<keyof ShiftForm> = {};
  const warnings: string[] = [];
  const name = f.name.trim();
  if (!name) e.name = 'Shift name is required';
  else if (name.length > 40) e.name = 'Shift name is too long (40 characters at most)';
  else if (others.some((o) => o.name.trim().toLowerCase() === name.toLowerCase())) e.name = `There is already a shift called ${name}`;
  if (Number.isNaN(toMinutes(f.start))) e.start = 'Enter a start time';
  if (Number.isNaN(toMinutes(f.end))) e.end = 'Enter an end time';
  const span = spanMinutes(f.start, f.end);
  if (!e.start && !e.end && span === 0) e.end = 'Start and end cannot be the same time';
  const brk = numOrNaN(f.breakMinutes); const grace = numOrNaN(f.graceMinutes); const full = numOrNaN(f.fullDayHours); const half = numOrNaN(f.halfDayHours);
  if (Number.isNaN(brk) || !isInt(brk) || brk < 0 || brk > 240) e.breakMinutes = 'Break is 0 to 240 whole minutes';
  else if (span > 0 && brk >= span) e.breakMinutes = 'The break is as long as the whole shift';
  if (Number.isNaN(grace) || !isInt(grace) || grace < 0 || grace > 120) e.graceMinutes = 'Grace is 0 to 120 whole minutes';
  if (Number.isNaN(full) || full < 1 || full > 16) e.fullDayHours = 'Full day is 1 to 16 hours';
  else if (span > 0 && full * 60 > span) e.fullDayHours = `A full day of ${trimNum(full)} h is longer than the ${durationText(span)} on duty`;
  if (Number.isNaN(half) || half <= 0) e.halfDayHours = 'Half day must be more than 0 hours';
  else if (!Number.isNaN(full) && half >= full) e.halfDayHours = 'Half day must be less than a full day';
  if (!e.fullDayHours && !e.breakMinutes && span > 0 && !Number.isNaN(full)) {
    const paid = Math.max(0, span - brk);
    if (full * 60 > paid) warnings.push(`Paid time is ${durationText(paid)} but a full day needs ${trimNum(full)} h, so nobody on this shift can complete a full day without overtime.`);
  }
  return { errors: clean(e), warnings };
}

// ───────────────────────────── roster ─────────────────────────────
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** The stated working-time limits the roster checks. Tagged 'reported' where they are shown. */
export const MAX_WEEKLY_HOURS = 48;
export const MAX_CONSECUTIVE_DAYS = 6;

/** Monday = 0 … Sunday = 6. */
export const weekdayIndex = (d: ISODate): number => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
export const mondayOf = (d: ISODate): ISODate => addDays(d, -weekdayIndex(d));
export const weekDates = (weekStart: ISODate): ISODate[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
export function fmtWeek(weekStart: ISODate): string {
  return `${fmtDate(weekStart).replace(/ \d{4}$/, '')} to ${fmtDate(addDays(weekStart, 6))}`;
}
export const dayShort = (d: ISODate): string => fmtDate(d).replace(/ \d{4}$/, '');

export interface RowWarning { id: 'no_off' | 'streak' | 'hours' | 'consent'; text: string }
export interface RowAnalysis { hours: number; warnings: RowWarning[]; consentDays: number[] }

/**
 * Check one employee's week against the roster rules: a weekly off, no more than 6 working days in a row (counting the
 * tail of the previous week), no more than 48 scheduled hours, and consent for women on night shifts when that rule is on.
 */
export function analyseRow(row: RosterRow, prev: RosterRow | undefined, emp: Pick<Employee, 'gender'> | undefined, shiftById: Map<Id, Shift>, womenNightConsent: boolean): RowAnalysis {
  const warnings: RowWarning[] = [];
  const minutes = row.days.reduce((t, c) => t + (c === 'off' ? 0 : paidMinutes(shiftById.get(c) ?? { start: '00:00', end: '00:00', breakMinutes: 0 })), 0);
  const hours = Math.round((minutes / 60) * 100) / 100;

  const noOff = row.days.every((c) => c !== 'off');
  if (noOff) warnings.push({ id: 'no_off', text: 'No weekly off this week' });

  const longest = (days: string[], from: number): number => {
    let run = 0; let best = 0;
    days.forEach((c, i) => { run = c === 'off' ? 0 : run + 1; if (i >= from) best = Math.max(best, run); });
    return best;
  };
  const alone = longest(row.days, 0);
  const withCarry = prev ? longest([...prev.days, ...row.days], 7) : alone;
  // A full week with no off is already reported above; this one is for runs that only exceed 6 once last week's tail is counted.
  if (withCarry > MAX_CONSECUTIVE_DAYS && withCarry > alone) warnings.push({ id: 'streak', text: `${withCarry} working days in a row, counting last week` });

  if (hours > MAX_WEEKLY_HOURS) warnings.push({ id: 'hours', text: `${trimNum(hours)} scheduled hours (limit ${MAX_WEEKLY_HOURS})` });

  const consentDays: number[] = [];
  if (womenNightConsent && emp?.gender === 'female') {
    row.days.forEach((c, i) => { if (c !== 'off' && shiftById.get(c)?.isNight) consentDays.push(i); });
    if (consentDays.length) warnings.push({ id: 'consent', text: `Night shift, consent needed (${consentDays.length} day${consentDays.length === 1 ? '' : 's'})` });
  }
  return { hours, warnings, consentDays };
}

export function dayCoverage(rows: RosterRow[], dayIndex: number): { working: number; off: number } {
  const off = rows.filter((r) => r.days[dayIndex] === 'off').length;
  return { working: rows.length - off, off };
}

// ───────────────────────────── overtime ─────────────────────────────
export const OT_FLAG_PCT = 80;
export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'permanent', label: 'Permanent' }, { value: 'fixed_term', label: 'Fixed term' }, { value: 'contract', label: 'Contract' },
  { value: 'daily_wage', label: 'Daily wage' }, { value: 'intern', label: 'Intern' },
];
export const employmentLabel = (t: EmploymentType): string => EMPLOYMENT_TYPES.find((x) => x.value === t)?.label ?? t;

/** Calendar quarter containing a month, which is also the Indian financial-year quarter: Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar. */
export function quarterMonths(month: Month): Month[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = Math.floor((m - 1) / 3) * 3 + 1;
  return [0, 1, 2].map((i) => `${y}-${String(first + i).padStart(2, '0')}`);
}
export function quarterLabel(month: Month): string {
  const q = quarterMonths(month);
  const mon = (m: Month) => fmtDate(`${m}-01`).split(' ')[1];
  return `${mon(q[0]!)} to ${mon(q[2]!)} ${q[0]!.slice(0, 4)}`;
}
export const otHoursOf = (att: AttendanceSummary[], employeeId: Id, month: Month): number =>
  att.find((a) => a.employeeId === employeeId && a.month === month)?.overtimeHours ?? 0;
export const latestMonths = (att: AttendanceSummary[], n = 3): Month[] => [...new Set(att.map((a) => a.month))].sort().slice(-n);

export interface OvertimeForm { name: string; rateMultiplier: string; quarterlyCapHours: string; requiresConsent: boolean; minMinutes: string; rateDivisor: string; womenNightConsent: boolean; appliesTo: EmploymentType[] }
export const overtimeToForm = (r: OvertimeRule): OvertimeForm => ({
  name: r.name, rateMultiplier: String(r.rateMultiplier), quarterlyCapHours: String(r.quarterlyCapHours), requiresConsent: r.requiresConsent, minMinutes: String(r.minMinutes),
  rateDivisor: String(r.rateDivisor), womenNightConsent: r.womenNightConsent, appliesTo: [...r.appliesTo],
});
export const formToOvertime = (f: OvertimeForm, id: Id): OvertimeRule => ({
  id, name: f.name.trim(), rateMultiplier: Number(f.rateMultiplier), quarterlyCapHours: Number(f.quarterlyCapHours), requiresConsent: f.requiresConsent,
  minMinutes: Number(f.minMinutes), rateDivisor: f.rateDivisor === 'calendar' ? 'calendar' : (Number(f.rateDivisor) === 30 ? 30 : 26), womenNightConsent: f.womenNightConsent,
  appliesTo: [...f.appliesTo],
});
export function validateOvertime(f: OvertimeForm): { errors: Errors<keyof OvertimeForm>; warnings: Partial<Record<keyof OvertimeForm, string>> } {
  const e: Errors<keyof OvertimeForm> = {};
  const w: Partial<Record<keyof OvertimeForm, string>> = {};
  if (!f.name.trim()) e.name = 'Rule name is required';
  const mult = numOrNaN(f.rateMultiplier);
  if (Number.isNaN(mult)) e.rateMultiplier = 'Enter the pay multiplier, like 2';
  else if (mult < LABOUR_CODES.overtimeMultiplier) e.rateMultiplier = `Overtime cannot pay less than ${LABOUR_CODES.overtimeMultiplier}x the ordinary rate under the Labour Codes`;
  const cap = numOrNaN(f.quarterlyCapHours);
  if (Number.isNaN(cap) || cap <= 0) e.quarterlyCapHours = 'Enter the quarterly cap in hours';
  else if (cap > LABOUR_CODES.overtimeQuarterlyCapHours) w.quarterlyCapHours = `${trimNum(cap)} hours is above the ${LABOUR_CODES.overtimeQuarterlyCapHours} hour quarterly limit in the Labour Codes. You can save it, but check it with your adviser.`;
  const min = numOrNaN(f.minMinutes);
  if (Number.isNaN(min) || !isInt(min) || min < 0 || min > 240) e.minMinutes = 'Minimum is 0 to 240 whole minutes';
  if (f.appliesTo.length === 0) e.appliesTo = 'Choose at least one employment type';
  return { errors: clean(e), warnings: w };
}

// ───────────────────────────── leave ─────────────────────────────
export const isMaternity = (l: Pick<LeaveType, 'code' | 'name'>): boolean => /^ML$/i.test(l.code.trim()) || /maternity/i.test(l.name);
export const isCompOff = (l: Pick<LeaveType, 'code' | 'name'>): boolean => /^CO$/i.test(l.code.trim()) || /comp(ensatory)?[\s-]*off/i.test(l.name);
const COMP_RE = /lapses?\s+after\s+(\d+)\s*days?\.?/i;
/** Comp-off expiry lives in the description ("Lapses after 60 days.") because the leave model has no field for it. */
export const compOffExpiryDays = (description?: string): number | undefined => { const m = description ? COMP_RE.exec(description) : null; return m ? Number(m[1]) : undefined; };
export function withCompOffExpiry(description: string | undefined, days: number | undefined): string {
  const base = (description ?? '').trim();
  const phrase = days ? `Lapses after ${days} days.` : '';
  if (COMP_RE.test(base)) return base.replace(COMP_RE, phrase).replace(/\s{2,}/g, ' ').trim();
  return [base, phrase].filter(Boolean).join(' ');
}
export const MATERNITY_DAYS = 182; // 26 weeks

const dayWord = (n: number) => `${trimNum(n)} day${n === 1 ? '' : 's'}`;
const monthWord = (n: number) => `${n} month${n === 1 ? '' : 's'}`;

/** Plain-English summary of a leave policy, the same text the table and the editor preview show. */
export function describeLeavePolicy(l: LeaveType): string {
  const out: string[] = [];
  const a = l.accrual;
  const after = a.afterMonths > 0 ? ` after ${monthWord(a.afterMonths)}` : '';
  if (!l.paid) out.push('Unpaid: pay is reduced for each day taken and no balance is kept.');
  else if (isCompOff(l) && a.mode === 'none') {
    const exp = compOffExpiryDays(l.description);
    out.push(`Credited for work on a weekly off or a holiday.${exp ? ` Lapses after ${exp} days.` : ' No expiry is set.'}`);
  } else if (a.mode === 'none') out.push('Not accrued automatically; days are credited when approved.');
  else if (a.mode === 'monthly') out.push(`Earns ${dayWord(a.days)} a month${after}.`);
  else if (a.mode === 'yearly') out.push(`Gets ${dayWord(a.days)} a year${after}.`);
  else out.push(`Credits ${dayWord(a.days)} at once${after || ' on joining'}.`);

  const accrues = a.mode !== 'none' && l.paid;
  const cf = l.carryForward;
  if (cf.allowed) out.push(`${cf.maxDays > 0 ? `Up to ${dayWord(cf.maxDays)} carry forward` : 'All unused days carry forward'}${cf.expiryMonths > 0 ? ` for ${monthWord(cf.expiryMonths)}` : ' with no expiry'}.`);
  else if (accrues && a.mode !== 'on_joining') out.push('Unused days lapse at year end.');

  const en = l.encashment;
  if (en.allowed && en.onExit) out.push(`Up to ${dayWord(en.maxDays)} can be encashed, and on exit.`);
  else if (en.allowed) out.push(`Up to ${dayWord(en.maxDays)} can be encashed.`);
  else if (en.onExit) out.push(`Up to ${dayWord(en.maxDays)} are paid out on exit only.`);
  else if (accrues) out.push('Cannot be encashed.');

  if (l.audience === 'female') out.push('For women only.');
  if (l.audience === 'male') out.push('For men only.');
  if (!l.probationEligible) out.push('Not available during probation.');
  if (l.paid) out.push(l.includeWeeklyOffs ? 'Weekly offs and holidays inside the leave count as leave.' : 'Weekly offs and holidays inside the leave are not counted.');
  if (l.maxConsecutiveDays) out.push(`At most ${dayWord(l.maxConsecutiveDays)} at a stretch.`);
  if (l.documentAfterDays) out.push(`A supporting document is needed after ${dayWord(l.documentAfterDays)}.`);
  return out.join(' ');
}

export interface LeaveForm {
  name: string; code: string; paid: boolean; audience: LeaveType['audience'];
  accrualMode: LeaveType['accrual']['mode']; accrualDays: string; afterMonths: string;
  cfAllowed: boolean; cfMax: string; cfExpiry: string;
  encAllowed: boolean; encMax: string; encOnExit: boolean;
  docAfter: string; maxConsecutive: string; probationEligible: boolean; includeWeeklyOffs: boolean;
  compOffDays: string; description: string;
}
export const emptyLeaveForm = (): LeaveForm => ({
  name: '', code: '', paid: true, audience: 'all', accrualMode: 'yearly', accrualDays: '0', afterMonths: '0', cfAllowed: false, cfMax: '0', cfExpiry: '0',
  encAllowed: false, encMax: '0', encOnExit: false, docAfter: '', maxConsecutive: '', probationEligible: true, includeWeeklyOffs: false, compOffDays: '', description: '',
});
export const leaveToForm = (l: LeaveType): LeaveForm => ({
  name: l.name, code: l.code, paid: l.paid, audience: l.audience, accrualMode: l.accrual.mode, accrualDays: String(l.accrual.days), afterMonths: String(l.accrual.afterMonths),
  cfAllowed: l.carryForward.allowed, cfMax: String(l.carryForward.maxDays), cfExpiry: String(l.carryForward.expiryMonths),
  encAllowed: l.encashment.allowed, encMax: String(l.encashment.maxDays), encOnExit: l.encashment.onExit,
  docAfter: l.documentAfterDays ? String(l.documentAfterDays) : '', maxConsecutive: l.maxConsecutiveDays ? String(l.maxConsecutiveDays) : '',
  probationEligible: l.probationEligible, includeWeeklyOffs: l.includeWeeklyOffs,
  compOffDays: compOffExpiryDays(l.description) ? String(compOffExpiryDays(l.description)) : '', description: l.description ?? '',
});
export function formToLeave(f: LeaveForm, id: Id): LeaveType {
  const n = (v: string) => { const x = v.trim() === '' ? 0 : Number(v); return Number.isFinite(x) ? x : 0; };
  const comp = isCompOff({ code: f.code, name: f.name });
  const description = comp ? withCompOffExpiry(f.description, n(f.compOffDays) || undefined) : f.description.trim();
  return {
    id, name: f.name.trim(), code: f.code.trim().toUpperCase(), paid: f.paid, audience: f.audience,
    accrual: { mode: f.accrualMode, days: f.accrualMode === 'none' ? 0 : n(f.accrualDays), afterMonths: f.accrualMode === 'none' ? 0 : n(f.afterMonths) },
    carryForward: { allowed: f.cfAllowed, maxDays: f.cfAllowed ? n(f.cfMax) : 0, expiryMonths: f.cfAllowed ? n(f.cfExpiry) : 0 },
    encashment: { allowed: f.encAllowed, maxDays: f.encAllowed || f.encOnExit ? n(f.encMax) : 0, onExit: f.encOnExit },
    maxConsecutiveDays: n(f.maxConsecutive) || undefined,
    documentAfterDays: n(f.docAfter) || undefined,
    probationEligible: f.probationEligible, includeWeeklyOffs: f.includeWeeklyOffs, description: description || undefined,
  };
}

export function validateLeave(f: LeaveForm, others: LeaveType[]): { errors: Errors<keyof LeaveForm>; warnings: string[] } {
  const e: Errors<keyof LeaveForm> = {};
  const warnings: string[] = [];
  const name = f.name.trim(); const code = f.code.trim().toUpperCase();
  if (!name) e.name = 'Leave type name is required';
  else if (others.some((o) => o.name.trim().toLowerCase() === name.toLowerCase())) e.name = `There is already a leave type called ${name}`;
  if (!code) e.code = 'Code is required';
  else if (!/^[A-Z0-9]{1,6}$/.test(code)) e.code = 'Code is 1 to 6 letters or digits, like EL';
  else if (others.some((o) => o.code.toUpperCase() === code)) e.code = `${code} is already used by another leave type`;
  const days = numOrNaN(f.accrualDays);
  if (f.accrualMode !== 'none') {
    if (Number.isNaN(days) || days <= 0) e.accrualDays = 'Enter how many days are credited';
    else if (f.accrualMode === 'monthly' && days > 31) e.accrualDays = 'A month cannot earn more than 31 days';
    else if (days > 366) e.accrualDays = 'That is more than a year of days';
    const after = numOrNaN(f.afterMonths);
    if (Number.isNaN(after) || !isInt(after) || after < 0 || after > 60) e.afterMonths = 'Months of service is 0 to 60';
  }
  if (f.cfAllowed) {
    const m = numOrNaN(f.cfMax); const x = numOrNaN(f.cfExpiry);
    if (Number.isNaN(m) || m < 0) e.cfMax = 'Enter 0 or more days (0 means no limit)';
    if (Number.isNaN(x) || !isInt(x) || x < 0 || x > 120) e.cfExpiry = 'Expiry is 0 to 120 months (0 means never)';
  }
  if (f.encAllowed || f.encOnExit) {
    const m = numOrNaN(f.encMax);
    if (Number.isNaN(m) || m <= 0) e.encMax = 'Enter the most days that can be encashed';
  }
  if (f.docAfter.trim()) { const d = Number(f.docAfter); if (!isInt(d) || d < 1 || d > 365) e.docAfter = 'Whole days, 1 to 365'; }
  if (f.maxConsecutive.trim()) { const d = Number(f.maxConsecutive); if (!isInt(d) || d < 1 || d > 365) e.maxConsecutive = 'Whole days, 1 to 365'; }
  const comp = isCompOff({ code, name });
  if (comp && f.compOffDays.trim()) { const d = Number(f.compOffDays); if (!isInt(d) || d < 1 || d > 365) e.compOffDays = 'Whole days, 1 to 365'; }
  if (comp && !f.compOffDays.trim()) warnings.push('No expiry is set, so compensatory offs will never lapse. Most companies use 30 to 90 days.');
  if (isMaternity({ code, name }) && f.accrualMode === 'on_joining' && !Number.isNaN(days) && days < MATERNITY_DAYS) warnings.push(`${trimNum(days)} days is below the 26 weeks (${MATERNITY_DAYS} days) the Maternity Benefit Act gives for the first two children.`);
  if (f.encAllowed && !f.paid) warnings.push('Unpaid leave normally has nothing to encash.');
  return { errors: clean(e), warnings };
}

// ───────────────────────────── holidays ─────────────────────────────
export const sortHolidays = (h: Holiday[]): Holiday[] => [...h].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
export function duplicateDates(h: Holiday[]): Set<ISODate> {
  const seen = new Map<ISODate, number>();
  h.forEach((x) => seen.set(x.date, (seen.get(x.date) ?? 0) + 1));
  return new Set([...seen].filter(([, n]) => n > 1).map(([d]) => d));
}
export function holidayCounts(h: Holiday[]): { fixed: number; optional: number; total: number; duplicates: number } {
  const optional = h.filter((x) => x.optional).length;
  return { fixed: h.length - optional, optional, total: h.length, duplicates: duplicateDates(h).size };
}
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** Same calendar day in another year; 29 Feb falls back to 28 Feb. */
export function shiftToYear(date: ISODate, year: number): ISODate {
  const [, m, d] = date.split('-');
  const md = m === '02' && d === '29' && !isLeap(year) ? '02-28' : `${m}-${d}`;
  return `${year}-${md}`;
}
export const isRealDate = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** Weeks of one month, Monday first, null where the cell belongs to the neighbouring month. */
export function monthWeeks(year: number, month: number): (ISODate | null)[][] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (ISODate | null)[] = Array.from({ length: weekdayIndex(first) }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (ISODate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export interface HolidayForm { date: string; name: string; optional: boolean }
export function validateHoliday(f: HolidayForm, list: HolidayList, editingIndex?: number): { errors: Errors<keyof HolidayForm>; warning?: string } {
  const e: Errors<keyof HolidayForm> = {};
  let warning: string | undefined;
  if (!f.date) e.date = 'Pick a date';
  else if (!isRealDate(f.date)) e.date = 'Enter a valid date';
  else if (Number(f.date.slice(0, 4)) !== list.year) e.date = `This list is for ${list.year}. Pick a date in ${list.year}`;
  if (!f.name.trim()) e.name = 'Holiday name is required';
  else if (f.name.trim().length > 60) e.name = 'Name is too long (60 characters at most)';
  if (!e.date && f.date) {
    const clash = list.holidays.filter((h, i) => i !== editingIndex && h.date === f.date);
    if (clash.length) warning = `${fmtDate(f.date)} already has ${clash.map((c) => c.name).join(', ')}. You can still save, but the date will be flagged as a duplicate.`;
  }
  return { errors: clean(e), warning };
}

export interface HolidayListForm { state: string; year: string; name: string; copyFrom: string }
export function validateHolidayList(f: HolidayListForm, lists: HolidayList[]): Errors<keyof HolidayListForm> {
  const e: Errors<keyof HolidayListForm> = {};
  const year = Number(f.year);
  if (!f.state) e.state = 'Choose a state';
  if (!isInt(year) || year < 2000 || year > 2100) e.year = 'Year is 2000 to 2100';
  if (!f.name.trim()) e.name = 'List name is required';
  else if (lists.some((l) => l.name.trim().toLowerCase() === f.name.trim().toLowerCase())) e.name = 'A list with this name exists';
  if (!e.state && !e.year && lists.some((l) => l.state === f.state && l.year === year)) e.state = `A ${f.state} list for ${year} already exists. Edit that one instead`;
  return clean(e);
}
