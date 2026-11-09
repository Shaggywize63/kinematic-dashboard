// Site kiosk punch rules. Pure functions: no React, no storage, no network.
//
// A kiosk is a shared tablet at a gate. Nobody carries a phone, so a person types their employee number and a PIN,
// and punches IN or OUT. The rules below decide what happens to each punch. They never reject a real person at the
// gate: a doubtful punch is recorded and flagged for HR, except an accidental double tap, which is ignored.
// No biometrics are involved anywhere. "Face match" on the kiosk is a simulated step.

import type { Employee, HrmsDb, ISODate, Shift } from '../types';
import { addDays, diffDays, fmtDate, fullName } from '../format';
import type { KioskData, KioskException, KioskRules, Punch, PunchDirection, PunchFlag, PinLock } from './types';

export const SITE_LOCATION_ID = 'loc_mum'; // Bhiwandi Warehouse in the sample company
export const DEFAULT_RULES: KioskRules = {
  duplicateWindowMin: 2, maxPinTries: 3, lockoutMin: 15, earlyWindowMin: 60, lateWindowMin: 120, retentionDays: 30,
};

// ───────────────────────────── time helpers ─────────────────────────────
/** Minutes since a fixed origin: one number that orders any two moments, across midnight. */
export const toAbs = (date: ISODate, minute: number): number => diffDays('2000-01-01', date) * 1440 + minute;
export const parseHm = (hm: string): number => { const [h, m] = hm.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
export const fmtHm = (minute: number): string => {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const fmtHms = (minute: number, seconds: number): string => `${fmtHm(minute)}:${String(seconds).padStart(2, '0')}`;
/** Date and minute of day for an absolute minute. */
export function fromAbs(abs: number): { date: ISODate; minute: number } {
  const days = Math.floor(abs / 1440);
  return { date: addDays('2000-01-01', days), minute: abs - days * 1440 };
}

export interface ShiftTimes { start: string; end: string; graceMinutes: number }
/** A shift that starts on `date`. A night shift ends the next morning. */
export function shiftSpan(s: Pick<ShiftTimes, 'start' | 'end'>, date: ISODate): { startAbs: number; endAbs: number } {
  const st = parseHm(s.start);
  const en = parseHm(s.end);
  return { startAbs: toAbs(date, st), endAbs: toAbs(date, en) + (en <= st ? 1440 : 0) };
}

/** Which day's shift a moment belongs to, if any: the one whose window (early margin to late margin) holds it. */
export function matchShiftDate(s: ShiftTimes, rules: KioskRules, abs: number, nearDate: ISODate): ISODate | null {
  const candidates = [addDays(nearDate, -1), nearDate, addDays(nearDate, 1)];
  const hits = candidates.filter((d) => {
    const { startAbs, endAbs } = shiftSpan(s, d);
    return abs >= startAbs - rules.earlyWindowMin && abs <= endAbs + rules.lateWindowMin;
  });
  if (!hits.length) return null;
  // Two windows can overlap for a short gap; the nearer start wins.
  return hits.sort((a, b) => Math.abs(shiftSpan(s, a).startAbs - abs) - Math.abs(shiftSpan(s, b).startAbs - abs))[0]!;
}

// ───────────────────────────── roster ─────────────────────────────
export interface DayPlan { shift?: Shift; off: boolean; rostered: boolean }
/** The shift a person works on a date: from the weekly roster when there is a row for that week, else their default shift. */
export function planFor(db: HrmsDb, e: Employee, date: ISODate): DayPlan {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const offset = (dow + 6) % 7; // Monday = 0
  const weekStart = addDays(date, -offset);
  const row = db.roster.find((r) => r.employeeId === e.id && r.weekStart === weekStart);
  const cell = row?.days[offset];
  if (row && cell === 'off') return { off: true, rostered: true };
  const shiftId = row && cell ? cell : e.shiftId;
  return { shift: db.shifts.find((s) => s.id === shiftId), off: false, rostered: !!row };
}

/** People who use this kiosk: staff at the site who are working. */
export function kioskPeople(db: HrmsDb): Employee[] {
  return db.employees.filter((e) => e.locationId === SITE_LOCATION_ID && (e.status === 'active' || e.status === 'on_notice'));
}
export const lastDigits = (e: Pick<Employee, 'code'>, n = 4): string => e.code.replace(/\D/g, '').slice(-n);

// ───────────────────────────── the punch rules ─────────────────────────────
export interface PunchContext {
  rules: KioskRules;
  now: { date: ISODate; minute: number };
  direction: PunchDirection;
  shift?: ShiftTimes;
  rosterOff?: boolean;
  last?: { date: ISODate; minute: number; direction: PunchDirection };   // the person's last counted punch
}
export interface PunchOutcome {
  result: 'accepted' | 'flagged' | 'ignored';
  flags: PunchFlag[];
  headline: string;
  message: string;
  shiftDate?: ISODate;
  lateBy?: number;              // minutes after the shift start, only when beyond grace
}

const dirWord = (d: PunchDirection) => (d === 'in' ? 'IN' : 'OUT');

export function evaluatePunch(c: PunchContext): PunchOutcome {
  const nowAbs = toAbs(c.now.date, c.now.minute);
  const word = dirWord(c.direction);
  const at = fmtHm(c.now.minute);

  // 1. Double tap: ignored, with a message.
  if (c.last) {
    const gap = nowAbs - toAbs(c.last.date, c.last.minute);
    if (gap >= 0 && gap < c.rules.duplicateWindowMin) {
      return {
        result: 'ignored', flags: ['duplicate'], headline: 'Already recorded',
        message: `Your ${dirWord(c.last.direction)} at ${fmtHm(c.last.minute)} is already recorded. A second punch within ${c.rules.duplicateWindowMin} minutes is ignored.`,
      };
    }
  }

  const flags: PunchFlag[] = [];
  const notes: string[] = [];

  // 2. Sequence: IN twice, or OUT with no IN.
  if (c.direction === 'in' && c.last?.direction === 'in') {
    flags.push('double_in');
    notes.push(`Your last punch was an IN at ${fmtHm(c.last.minute)}${c.last.date !== c.now.date ? ` on ${fmtDate(c.last.date)}` : ''} with no OUT after it.`);
  }
  if (c.direction === 'out' && (!c.last || c.last.direction === 'out')) {
    flags.push('out_without_in');
    notes.push(c.last ? `Your last punch was an OUT at ${fmtHm(c.last.minute)}, so there is no IN to close.` : 'There is no IN before this OUT.');
  }

  // 3. Shift window, weekly off and lateness.
  let shiftDate: ISODate | undefined;
  let lateBy: number | undefined;
  if (c.rosterOff) {
    flags.push('weekly_off');
    notes.push('The roster has you off today.');
  } else if (c.shift) {
    const d = matchShiftDate(c.shift, c.rules, nowAbs, c.now.date);
    if (!d) {
      flags.push('outside_shift');
      notes.push(`${at} is outside your shift (${c.shift.start} to ${c.shift.end}).`);
    } else {
      shiftDate = d;
      if (c.direction === 'in' && !flags.includes('double_in')) {
        const startAbs = shiftSpan(c.shift, d).startAbs;
        const late = nowAbs - startAbs;
        if (late > c.shift.graceMinutes) { flags.push('late'); lateBy = late; }
      }
    }
  }

  const needsReview = flags.some((f) => f !== 'late');
  const lateNote = lateBy ? `You are ${lateBy} minutes after the shift start (grace is ${c.shift?.graceMinutes} minutes).` : '';
  if (needsReview) {
    return { result: 'flagged', flags, shiftDate, lateBy, headline: `${word} recorded, HR will review`, message: `${word} recorded at ${at}. ${notes.join(' ')} Your supervisor or HR will look at it.` };
  }
  return { result: 'accepted', flags, shiftDate, lateBy, headline: `Punched ${word} at ${at}`, message: lateNote ? `Recorded. ${lateNote}` : c.direction === 'in' ? 'Recorded. Have a good shift.' : 'Recorded. Thank you, travel safe.' };
}

// ───────────────────────────── PIN and lockout ─────────────────────────────
export interface PinResult { ok: boolean; locked: boolean; lock: PinLock; message: string }

/** One PIN attempt. Wrong PINs count; the third in a row locks the person for the lockout time. */
export function checkPin(lock: PinLock | undefined, rules: KioskRules, nowAbs: number, entered: string, actual: string | undefined): PinResult {
  let l: PinLock = { tries: lock?.tries ?? 0, lockedUntil: lock?.lockedUntil };
  if (l.lockedUntil != null) {
    if (nowAbs < l.lockedUntil) {
      const left = l.lockedUntil - nowAbs;
      return { ok: false, locked: true, lock: l, message: `Too many wrong PINs. Try again in ${left} ${left === 1 ? 'minute' : 'minutes'}, or ask your supervisor.` };
    }
    l = { tries: 0 }; // the lockout has run out
  }
  if (!actual) return { ok: false, locked: false, lock: l, message: 'No PIN is set for you yet. Ask your supervisor or HR.' };
  if (entered === actual) return { ok: true, locked: false, lock: { tries: 0 }, message: 'PIN accepted.' };
  const tries = l.tries + 1;
  if (tries >= rules.maxPinTries) {
    return { ok: false, locked: true, lock: { tries, lockedUntil: nowAbs + rules.lockoutMin }, message: `Wrong PIN. That was try ${tries} of ${rules.maxPinTries}. You are locked for ${rules.lockoutMin} minutes. Ask your supervisor.` };
  }
  const left = rules.maxPinTries - tries;
  return { ok: false, locked: false, lock: { tries }, message: `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.` };
}

// ───────────────────────────── missing OUT sweep ─────────────────────────────
export interface MissingOut { employeeId: string; date: ISODate; punchId: string; detail: string; key: string }

/** People whose last punch is an IN and whose shift ended long enough ago that an OUT should exist. */
export function findMissingOuts(db: HrmsDb, kiosk: KioskData, nowAbs: number): MissingOut[] {
  const out: MissingOut[] = [];
  for (const e of kioskPeople(db)) {
    const mine = counted(kiosk.punches.filter((p) => p.employeeId === e.id));
    const last = mine[mine.length - 1];
    if (!last || last.direction !== 'in') continue;
    const inAbs = toAbs(last.date, last.minute);
    const plan = planFor(db, e, last.date);
    const shift = plan.shift ?? db.shifts.find((s) => s.id === e.shiftId);
    let endAbs: number;
    let endText: string;
    if (shift) {
      const d = matchShiftDate(shift, kiosk.rules, inAbs, last.date) ?? last.date;
      endAbs = shiftSpan(shift, d).endAbs;
      endText = `${fmtHm(parseHm(shift.end))} on ${fmtDate(fromAbs(endAbs).date)}`;
    } else { endAbs = inAbs + 12 * 60; endText = 'twelve hours later'; }
    if (nowAbs > endAbs + kiosk.rules.lateWindowMin) {
      out.push({
        employeeId: e.id, date: last.date, punchId: last.id, key: `missing_out:${e.id}:${last.date}`,
        detail: `${fullName(e)}: IN at ${fmtHm(last.minute)} on ${fmtDate(last.date)} and no OUT by the shift end (${endText}).`,
      });
    }
  }
  return out;
}

/** Punches that count towards a person's sequence: everything except ignored double taps, oldest first. */
export function counted(punches: Punch[]): Punch[] {
  return punches.filter((p) => p.result !== 'ignored').sort((a, b) => toAbs(a.date, a.minute) - toAbs(b.date, b.minute) || a.id.localeCompare(b.id));
}

// ───────────────────────────── today's board ─────────────────────────────
export type BoardStatus = 'in' | 'done' | 'expected' | 'late_not_in' | 'off' | 'missing_out';
export interface BoardRow {
  employee: Employee;
  plan: DayPlan;
  status: BoardStatus;
  firstIn?: Punch;
  lastOut?: Punch;
  lateBy?: number;              // minutes after the shift start for a late IN today, or for a person not in yet
  detail: string;
}

const STATUS_ORDER: Record<BoardStatus, number> = { missing_out: 0, late_not_in: 1, in: 2, expected: 3, done: 4, off: 5 };

export function buildBoard(db: HrmsDb, kiosk: KioskData, today: ISODate, nowMin: number): BoardRow[] {
  const nowAbs = toAbs(today, nowMin);
  const rows: BoardRow[] = kioskPeople(db).map((e) => {
    const plan = planFor(db, e, today);
    const mine = counted(kiosk.punches.filter((p) => p.employeeId === e.id));
    const last = mine[mine.length - 1];
    const shift = plan.shift;
    const todays = shift ? matchedToday(mine, shift, kiosk.rules, today) : [];
    const firstIn = todays.find((p) => p.direction === 'in');
    const lastOut = [...todays].reverse().find((p) => p.direction === 'out');
    const base = { employee: e, plan, firstIn, lastOut };

    if (last?.direction === 'in') {
      const stale = findMissingOuts(db, kiosk, nowAbs).some((m) => m.employeeId === e.id);
      if (stale) return { ...base, status: 'missing_out' as const, detail: `IN at ${fmtHm(last.minute)} on ${fmtDate(last.date)}, no OUT yet` };
      const late = last.flags.includes('late') ? lateMinutes(shift, last, kiosk.rules) : undefined;
      return { ...base, status: 'in' as const, lateBy: late, detail: `In since ${fmtHm(last.minute)}${late ? `, ${late} min after start` : ''}` };
    }
    if (plan.off) return { ...base, status: 'off' as const, detail: 'Weekly off' };
    if (!shift) return { ...base, status: 'expected' as const, detail: 'No shift set' };
    const { startAbs } = shiftSpan(shift, today);
    if (firstIn && lastOut) return { ...base, status: 'done' as const, detail: `${fmtHm(firstIn.minute)} to ${fmtHm(lastOut.minute)}` };
    if (nowAbs > startAbs + shift.graceMinutes) {
      const late = nowAbs - startAbs;
      return { ...base, status: 'late_not_in' as const, lateBy: late, detail: `Due at ${shift.start}, not punched in (${late} min after start)` };
    }
    return { ...base, status: 'expected' as const, detail: `Due at ${shift.start}` };
  });
  return rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || fullName(a.employee).localeCompare(fullName(b.employee)));
}

function matchedToday(mine: Punch[], shift: ShiftTimes, rules: KioskRules, today: ISODate): Punch[] {
  return mine.filter((p) => matchShiftDate(shift, rules, toAbs(p.date, p.minute), p.date) === today);
}
function lateMinutes(shift: ShiftTimes | undefined, p: Punch, rules: KioskRules): number | undefined {
  if (!shift) return undefined;
  const d = matchShiftDate(shift, rules, toAbs(p.date, p.minute), p.date);
  if (!d) return undefined;
  const late = toAbs(p.date, p.minute) - shiftSpan(shift, d).startAbs;
  return late > shift.graceMinutes ? late : undefined;
}

// ───────────────────────────── exceptions from a punch ─────────────────────────────
export function exceptionFromPunch(p: Punch, name: string): Omit<KioskException, 'id'> | null {
  const flag = (['double_in', 'out_without_in', 'outside_shift', 'weekly_off'] as const).find((f) => p.flags.includes(f));
  if (!flag) return null;
  const word = p.direction === 'in' ? 'IN' : 'OUT';
  const detail = {
    double_in: `${name}: IN at ${fmtHm(p.minute)} with no OUT after the earlier IN.`,
    out_without_in: `${name}: OUT at ${fmtHm(p.minute)} with no IN before it.`,
    outside_shift: `${name}: ${word} at ${fmtHm(p.minute)} is outside the shift window.`,
    weekly_off: `${name}: ${word} at ${fmtHm(p.minute)} on a rostered weekly off.`,
  }[flag];
  return { key: `${flag}:${p.employeeId}:${p.date}:${p.minute}`, kind: flag, employeeId: p.employeeId, date: p.date, detail, punchId: p.id, status: 'open' };
}

export const EXCEPTION_LABEL: Record<KioskException['kind'], string> = {
  double_in: 'IN twice without OUT', out_without_in: 'OUT without IN', outside_shift: 'Outside shift window', weekly_off: 'Punch on a weekly off', missing_out: 'Missing OUT',
};
export const FLAG_LABEL: Record<PunchFlag, string> = {
  double_in: 'IN twice', out_without_in: 'OUT without IN', outside_shift: 'Outside shift', weekly_off: 'Weekly off', late: 'Late', duplicate: 'Double tap',
};

/** Where a device stands: online means it was seen on the preview day within the last 15 minutes. */
export function deviceOnline(d: { lastSeenDate: ISODate; lastSeenMin: number; status: string }, today: ISODate, nowMin: number): boolean {
  return d.status === 'active' && toAbs(today, nowMin) - toAbs(d.lastSeenDate, d.lastSeenMin) <= 15;
}

/** Minutes left on a PIN lockout, or 0 when the person is not locked. */
export function lockRemaining(lock: PinLock | undefined, nowAbs: number): number {
  return lock?.lockedUntil != null && nowAbs < lock.lockedUntil ? lock.lockedUntil - nowAbs : 0;
}
