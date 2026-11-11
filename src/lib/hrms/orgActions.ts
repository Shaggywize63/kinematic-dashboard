'use client';
// Changes for the Organisation and Time & leave screens that the generic upsert/remove in actions.ts cannot express:
// registrations live inside a legal entity, and roster rows are created on demand per employee per week.

import { getDb, mutate, newId } from './db';
import type { HolidayList, HrmsDb, Id, ISODate, LeaveType, Registration, RosterCell, RosterRow, Shift } from './types';
import { addDays } from './format';
import { makeSeed } from './seed';

// ───────────── organisation ─────────────
/** Add a registration to an entity, or replace the one with the same id. */
export function saveRegistration(entityId: Id, reg: Registration): void {
  mutate((db) => {
    const ent = db.entities.find((e) => e.id === entityId);
    if (!ent) return;
    const i = ent.registrations.findIndex((r) => r.id === reg.id);
    if (i >= 0) ent.registrations[i] = reg; else ent.registrations.push(reg);
  });
}
export function removeRegistration(entityId: Id, regId: Id): void {
  mutate((db) => {
    const ent = db.entities.find((e) => e.id === entityId);
    if (ent) ent.registrations = ent.registrations.filter((r) => r.id !== regId);
  });
}

// ───────────── time and leave: the standard set ─────────────
export type TimeSetResult = { ok: true } | { ok: false; error: string };

/**
 * The shifts, leave policies and a holiday list the sample company uses, as new rows with fresh ids. A new organisation (live
 * mode) starts with none of these; this is a sensible, editable start, mirroring payroll's "Add the standard structures".
 * Anything already there under the same name / code / (state, year) is left alone. New ids are UUIDs in live mode (via newId).
 */
export function addStandardTimeSet(): TimeSetResult {
  const db = getDb();
  const seed = makeSeed();
  const haveShift = new Set(db.shifts.map((s) => s.name.trim().toLowerCase()));
  const haveLeave = new Set(db.leaveTypes.map((l) => l.code.trim().toUpperCase()));
  const haveHol = new Set(db.holidayLists.map((h) => `${h.state}|${h.year}`));
  const shifts: Shift[] = seed.shifts.filter((s) => !haveShift.has(s.name.trim().toLowerCase())).map((s) => ({ ...s, id: newId('sh') }));
  const leaveTypes: LeaveType[] = seed.leaveTypes.filter((l) => !haveLeave.has(l.code.trim().toUpperCase()))
    .map((l) => ({ ...l, id: newId('lv'), accrual: { ...l.accrual }, carryForward: { ...l.carryForward }, encashment: { ...l.encashment } }));
  const firstList = seed.holidayLists[0];
  const holidayLists: HolidayList[] = firstList && !haveHol.has(`${firstList.state}|${firstList.year}`)
    ? [{ ...firstList, id: newId('hol'), holidays: firstList.holidays.map((h) => ({ ...h })) }] : [];
  if (!shifts.length && !leaveTypes.length && !holidayLists.length) return { ok: false, error: 'The standard set is already there.' };
  mutate((db) => {
    for (const s of shifts) db.shifts.push(s);
    for (const l of leaveTypes) db.leaveTypes.push(l);
    for (const h of holidayLists) db.holidayLists.push(h);
  });
  return { ok: true };
}

// ───────────── roster ─────────────
/** The default week for someone with no roster row yet: their own shift Monday to Saturday, Sunday off. */
export function defaultWeek(db: HrmsDb, employeeId: Id): RosterCell[] {
  const emp = db.employees.find((e) => e.id === employeeId);
  const shift = emp?.shiftId && db.shifts.some((s) => s.id === emp.shiftId) ? emp.shiftId : db.shifts[0]?.id ?? 'off';
  return Array.from({ length: 7 }, (_, d) => (d === 6 ? 'off' : shift));
}

function rowFor(db: HrmsDb, employeeId: Id, weekStart: ISODate): RosterRow {
  let row = db.roster.find((r) => r.employeeId === employeeId && r.weekStart === weekStart);
  if (!row) {
    row = { employeeId, weekStart, days: defaultWeek(db, employeeId) };
    db.roster.push(row);
  }
  return row;
}

/** Set one day of one employee's week. The row is created first when the employee is not on that week's roster yet. */
export function setRosterCell(employeeId: Id, weekStart: ISODate, dayIndex: number, cell: RosterCell): void {
  mutate((db) => { rowFor(db, employeeId, weekStart).days[dayIndex] = cell; });
}

/** Give every listed employee a roster row for the week (default pattern). Existing rows are left alone. Returns how many were added. */
export function addToRoster(weekStart: ISODate, employeeIds: Id[]): number {
  let added = 0;
  mutate((db) => {
    for (const id of employeeIds) {
      if (db.roster.some((r) => r.employeeId === id && r.weekStart === weekStart)) continue;
      rowFor(db, id, weekStart);
      added++;
    }
  });
  return added;
}

/** Copy the previous week's rows onto `weekStart`, replacing that week's row for each employee copied. Returns how many rows were written. */
export function copyRosterFromPreviousWeek(weekStart: ISODate): number {
  let n = 0;
  mutate((db) => {
    const from = addDays(weekStart, -7);
    const source = db.roster.filter((r) => r.weekStart === from);
    for (const src of source) {
      const existing = db.roster.find((r) => r.employeeId === src.employeeId && r.weekStart === weekStart);
      if (existing) existing.days = [...src.days];
      else db.roster.push({ employeeId: src.employeeId, weekStart, days: [...src.days] });
      n++;
    }
  });
  return n;
}
