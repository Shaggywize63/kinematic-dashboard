// Time and leave on the server (phase 3): the one place where the dashboard's own Time & Leave shapes meet the HRMS
// time API's. Same convention as wire.ts / payrollWire.ts: top-level keys are snake_case with null for "nothing";
// nested objects (a leave type's accrual / carryForward / encashment, a holiday list's holidays, a roster row's days)
// pass through in the dashboard's own camelCase shape. Numbers are JSON numbers (a numeric string is accepted too).
//
// Pure: no I/O, no React. Five collections live here — shifts, the weekly roster, leave types, holiday lists and leave
// balances. Shifts, leave types and holiday lists are ordinary {id} records (POST/PUT/DELETE). The roster row (keyed by
// employee + week) and the leave balance (keyed by employee + leave type) carry no id of their own in the dashboard, so,
// like attendance, they are upserted with a PUT on a path that names the two keys.

import type { Holiday, HolidayList, LeaveBalance, LeaveType, RosterCell, RosterRow, Shift } from '../types';
import { arr, blankToNull, bodyFor, bool, dropUndefined, isObj, num, same, str, type Row, type Spec } from './wire';

// ───────────────────────────── shifts ─────────────────────────────
export function shiftFromWire(r: Row): Shift {
  return {
    id: String(r.id), name: String(r.name ?? ''), start: str(r.start) ?? '', end: str(r.end) ?? '',
    breakMinutes: num(r.break_minutes) ?? 0, graceMinutes: num(r.grace_minutes) ?? 0,
    fullDayHours: num(r.full_day_hours) ?? 0, halfDayHours: num(r.half_day_hours) ?? 0,
    isNight: bool(r.is_night), color: str(r.color) ?? '#3E9EFF',
  };
}
// "end" is a reserved word in SQL (the column is quoted) but an ordinary JSON key on the wire.
const SHIFT_SPECS: Spec[] = [
  { local: 'name', wire: 'name', nullable: false },
  { local: 'start', wire: 'start', nullable: false },
  { local: 'end', wire: 'end', nullable: false },
  { local: 'breakMinutes', wire: 'break_minutes', nullable: false },
  { local: 'graceMinutes', wire: 'grace_minutes', nullable: false },
  { local: 'fullDayHours', wire: 'full_day_hours', nullable: false },
  { local: 'halfDayHours', wire: 'half_day_hours', nullable: false },
  { local: 'isNight', wire: 'is_night', nullable: false, out: (v) => !!v },
  { local: 'color', wire: 'color', nullable: false },
];
export const shiftCreateBody = (s: Shift): Row => ({ id: s.id, ...bodyFor(SHIFT_SPECS, s as unknown as Row).body });
export const shiftPatch = (prev: Shift, next: Shift) => bodyFor(SHIFT_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── leave types (policies) ─────────────────────────────
const ACCRUAL_MODES: LeaveType['accrual']['mode'][] = ['none', 'monthly', 'yearly', 'on_joining'];
const AUDIENCES: LeaveType['audience'][] = ['all', 'female', 'male'];

function accrualFromWire(v: unknown): LeaveType['accrual'] {
  const a = isObj(v) ? v : {};
  return { mode: ACCRUAL_MODES.includes(a.mode as LeaveType['accrual']['mode']) ? (a.mode as LeaveType['accrual']['mode']) : 'none', days: num(a.days) ?? 0, afterMonths: num(a.afterMonths) ?? 0 };
}
function carryForwardFromWire(v: unknown): LeaveType['carryForward'] {
  const c = isObj(v) ? v : {};
  return { allowed: bool(c.allowed), maxDays: num(c.maxDays) ?? 0, expiryMonths: num(c.expiryMonths) ?? 0 };
}
function encashmentFromWire(v: unknown): LeaveType['encashment'] {
  const e = isObj(v) ? v : {};
  return { allowed: bool(e.allowed), maxDays: num(e.maxDays) ?? 0, onExit: bool(e.onExit) };
}

export function leaveTypeFromWire(r: Row): LeaveType {
  return {
    id: String(r.id), name: String(r.name ?? ''), code: String(r.code ?? ''), paid: bool(r.paid),
    audience: AUDIENCES.includes(r.audience as LeaveType['audience']) ? (r.audience as LeaveType['audience']) : 'all',
    accrual: accrualFromWire(r.accrual), carryForward: carryForwardFromWire(r.carry_forward), encashment: encashmentFromWire(r.encashment),
    maxConsecutiveDays: num(r.max_consecutive_days), documentAfterDays: num(r.document_after_days),
    probationEligible: bool(r.probation_eligible), includeWeeklyOffs: bool(r.include_weekly_offs), description: str(r.description),
  };
}

// The three nested objects keep the dashboard's camelCase inner keys exactly; they are sent whole whenever any inner value changed.
const objOut = (v: unknown) => (isObj(v) ? dropUndefined(v) : v);
const LEAVE_TYPE_SPECS: Spec[] = [
  { local: 'name', wire: 'name', nullable: false },
  { local: 'code', wire: 'code', nullable: false },
  { local: 'paid', wire: 'paid', nullable: false },
  { local: 'audience', wire: 'audience', nullable: false },
  { local: 'accrual', wire: 'accrual', nullable: false, out: objOut },
  { local: 'carryForward', wire: 'carry_forward', nullable: false, out: objOut },
  { local: 'encashment', wire: 'encashment', nullable: false, out: objOut },
  { local: 'maxConsecutiveDays', wire: 'max_consecutive_days', nullable: true },
  { local: 'documentAfterDays', wire: 'document_after_days', nullable: true },
  { local: 'probationEligible', wire: 'probation_eligible', nullable: false },
  { local: 'includeWeeklyOffs', wire: 'include_weekly_offs', nullable: false },
  { local: 'description', wire: 'description', nullable: true, out: blankToNull },
];
export const leaveTypeCreateBody = (l: LeaveType): Row => ({ id: l.id, ...bodyFor(LEAVE_TYPE_SPECS, l as unknown as Row).body });
export const leaveTypePatch = (prev: LeaveType, next: LeaveType) => bodyFor(LEAVE_TYPE_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── holiday lists ─────────────────────────────
function holidayFromWire(h: Row): Holiday {
  return { date: str(h.date) ?? '', name: String(h.name ?? ''), optional: bool(h.optional) };
}
export function holidayListFromWire(r: Row): HolidayList {
  return { id: String(r.id), name: String(r.name ?? ''), state: String(r.state ?? ''), year: num(r.year) ?? 0, holidays: arr(r.holidays).map(holidayFromWire) };
}
const holidaysOut = (v: unknown) => (Array.isArray(v) ? v.map((h) => { const o = h as Row; return { date: str(o.date) ?? '', name: String(o.name ?? ''), optional: !!o.optional }; }) : []);
const HOLIDAY_LIST_SPECS: Spec[] = [
  { local: 'name', wire: 'name', nullable: false },
  { local: 'state', wire: 'state', nullable: false },
  { local: 'year', wire: 'year', nullable: false },
  { local: 'holidays', wire: 'holidays', nullable: false, out: holidaysOut },
];
export const holidayListCreateBody = (h: HolidayList): Row => ({ id: h.id, ...bodyFor(HOLIDAY_LIST_SPECS, h as unknown as Row).body });
export const holidayListPatch = (prev: HolidayList, next: HolidayList) => bodyFor(HOLIDAY_LIST_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── the weekly roster (one row per employee + week) ─────────────────────────────
function rosterDays(v: unknown): RosterCell[] {
  return Array.isArray(v) ? v.map((c) => (c === 'off' ? 'off' : String(c))) : [];
}
export function rosterFromWire(r: Row): RosterRow {
  return { employeeId: String(r.employee_id ?? ''), weekStart: str(r.week_start) ?? '', days: rosterDays(r.days) };
}
/** The key of a roster row: one per employee and week; the dashboard's row carries no id of its own. */
export const rosterKey = (r: { employeeId: string; weekStart: string }): string => `${r.employeeId}:${r.weekStart}`;
/** Body for PUT /time/roster/:employeeId/:weekStart (the employee and week are in the path). Only `days` travels. */
export function rosterBody(next: RosterRow, prev?: RosterRow): { body: Row; keys: string[] } {
  if (prev && same(prev.days, next.days)) return { body: {}, keys: [] };
  return { body: { days: next.days.map((c) => (c === 'off' ? 'off' : String(c))) }, keys: ['days'] };
}

// ───────────────────────────── leave balances (one row per employee + leave type) ─────────────────────────────
export function leaveBalanceFromWire(r: Row): LeaveBalance {
  return {
    employeeId: String(r.employee_id ?? ''), leaveTypeId: String(r.leave_type_id ?? ''),
    opening: num(r.opening) ?? 0, accrued: num(r.accrued) ?? 0, taken: num(r.taken) ?? 0, encashed: num(r.encashed) ?? 0, lapsed: num(r.lapsed) ?? 0,
  };
}
export const leaveBalanceKey = (b: { employeeId: string; leaveTypeId: string }): string => `${b.employeeId}:${b.leaveTypeId}`;
const LEAVE_BALANCE_SPECS: Spec[] = [
  { local: 'opening', wire: 'opening', nullable: false },
  { local: 'accrued', wire: 'accrued', nullable: false },
  { local: 'taken', wire: 'taken', nullable: false },
  { local: 'encashed', wire: 'encashed', nullable: false },
  { local: 'lapsed', wire: 'lapsed', nullable: false },
];
/** Body for PUT /time/balances/:employeeId/:leaveTypeId (the employee and leave type are in the path). Without `prev`, every number. */
export const leaveBalanceBody = (next: LeaveBalance, prev?: LeaveBalance) => bodyFor(LEAVE_BALANCE_SPECS, next as unknown as Row, prev as unknown as Row | undefined);

// ───────────────────────────── the bootstrap ─────────────────────────────
export interface TimeData {
  shifts: Shift[]; roster: RosterRow[]; leaveTypes: LeaveType[]; holidayLists: HolidayList[]; leaveBalances: LeaveBalance[];
  serverTime?: string;
}
export function timeFromWire(data: Row): TimeData {
  return {
    shifts: arr(data.shifts).map(shiftFromWire),
    roster: arr(data.roster).map(rosterFromWire),
    leaveTypes: arr(data.leave_types).map(leaveTypeFromWire),
    holidayLists: arr(data.holiday_lists).map(holidayListFromWire),
    leaveBalances: arr(data.leave_balances).map(leaveBalanceFromWire),
    serverTime: str(data.server_time),
  };
}
