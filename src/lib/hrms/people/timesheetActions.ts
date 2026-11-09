'use client';
// Changes to timesheets: hours, project rows, submit, approve or return, and the company limits.

import { ACTOR, employeeName } from '../actions';
import { PREVIEW_TODAY } from '../seed';
import type { Id, ISODate } from '../types';
import { peopleStore, logRow } from './store';
import { emptyLine, isEditable, sheetId, submitCheck, sheetTotal } from './timesheetEngine';
import type { Sheet, TimesheetPolicy } from './types';

export type ActionResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): ActionResult => ({ ok: false, error });

function ensureSheet(sheets: Sheet[], employeeId: Id, weekStart: ISODate): Sheet {
  const id = sheetId(employeeId, weekStart);
  let s = sheets.find((x) => x.id === id);
  if (!s) { s = { id, employeeId, weekStart, lines: [], status: 'draft', trail: [] }; sheets.push(s); }
  return s;
}

/** Set one cell. Ignored for a week that is submitted or approved: locked weeks cannot be edited. */
export function setHours(employeeId: Id, weekStart: ISODate, projectId: Id, day: number, hours: number): ActionResult {
  const cur = peopleStore.get().timesheets.sheets.find((x) => x.id === sheetId(employeeId, weekStart));
  if (!isEditable(cur?.status)) return fail('This week is locked.');
  if (!Number.isFinite(hours) || day < 0 || day > 6) return fail('Enter hours as a number.');
  peopleStore.mutate((d) => {
    const s = ensureSheet(d.timesheets.sheets, employeeId, weekStart);
    let line = s.lines.find((l) => l.projectId === projectId);
    if (!line) { line = emptyLine(projectId); s.lines.push(line); }
    line.hours[day] = hours;
  });
  return { ok: true };
}

export function addProjectRow(employeeId: Id, weekStart: ISODate, projectId: Id): ActionResult {
  const cur = peopleStore.get().timesheets.sheets.find((x) => x.id === sheetId(employeeId, weekStart));
  if (!isEditable(cur?.status)) return fail('This week is locked.');
  if (cur?.lines.some((l) => l.projectId === projectId)) return fail('That project is already on the sheet.');
  peopleStore.mutate((d) => { ensureSheet(d.timesheets.sheets, employeeId, weekStart).lines.push(emptyLine(projectId)); });
  return { ok: true };
}

export function removeProjectRow(employeeId: Id, weekStart: ISODate, projectId: Id): ActionResult {
  const cur = peopleStore.get().timesheets.sheets.find((x) => x.id === sheetId(employeeId, weekStart));
  if (!cur || !isEditable(cur.status)) return fail('This week is locked.');
  const line = cur.lines.find((l) => l.projectId === projectId);
  if (line && line.hours.some((h) => h > 0)) return fail('Set the hours on this row to 0 before removing it.');
  peopleStore.mutate((d) => { const s = ensureSheet(d.timesheets.sheets, employeeId, weekStart); s.lines = s.lines.filter((l) => l.projectId !== projectId); });
  return { ok: true };
}

export function submitSheet(employeeId: Id, weekStart: ISODate): ActionResult {
  const t = peopleStore.get().timesheets;
  const cur = t.sheets.find((x) => x.id === sheetId(employeeId, weekStart));
  if (!cur) return fail('Enter some hours before submitting.');
  const check = submitCheck(cur, t.policy, PREVIEW_TODAY);
  if (!check.ok) return fail(check.reasons[0]!);
  peopleStore.mutate((d) => {
    const s = ensureSheet(d.timesheets.sheets, employeeId, weekStart);
    s.status = 'submitted'; s.submittedOn = PREVIEW_TODAY; s.decidedOn = undefined; s.decidedBy = undefined; s.comment = undefined;
    s.trail.push({ at: PREVIEW_TODAY, by: employeeName(employeeId), action: 'Submitted' });
    d.timesheets.log.unshift(logRow(ACTOR, 'Timesheet submitted', `${employeeName(employeeId)}, week of ${weekStart}, ${sheetTotal(s)} h`));
  });
  return { ok: true };
}

/** Approve (locks the week) or return it with a comment. The decision is the manager's; here that is the signed-in preview user. */
export function decideSheet(id: string, decision: 'approved' | 'returned', comment: string): ActionResult {
  const cur = peopleStore.get().timesheets.sheets.find((x) => x.id === id);
  if (!cur || cur.status !== 'submitted') return fail('Only a submitted week can be approved or returned.');
  if (decision === 'returned' && comment.trim().length < 5) return fail('Say what to fix when returning a week (at least 5 characters).');
  peopleStore.mutate((d) => {
    const s = d.timesheets.sheets.find((x) => x.id === id)!;
    s.status = decision; s.decidedOn = PREVIEW_TODAY; s.decidedBy = ACTOR; s.comment = comment.trim() || undefined;
    s.trail.push({ at: PREVIEW_TODAY, by: ACTOR, action: decision === 'approved' ? 'Approved' : 'Returned', comment: comment.trim() || undefined });
    d.timesheets.log.unshift(logRow(ACTOR, decision === 'approved' ? 'Timesheet approved and locked' : 'Timesheet returned', `${employeeName(s.employeeId)}, week of ${s.weekStart}`));
  });
  return { ok: true };
}

export function setPolicy(patch: Partial<TimesheetPolicy>): ActionResult {
  const next = { ...peopleStore.get().timesheets.policy, ...patch };
  if (!(next.maxPerDay >= 8 && next.maxPerDay <= 24)) return fail('The daily limit must be between 8 and 24 hours.');
  if (!(next.weeklyCap >= 20 && next.weeklyCap <= 90)) return fail('The weekly cap must be between 20 and 90 hours.');
  if (!(next.standardWeek >= 20 && next.standardWeek <= next.weeklyCap)) return fail('The standard week must be at least 20 hours and not above the weekly cap.');
  peopleStore.mutate((d) => {
    d.timesheets.policy = next;
    d.timesheets.log.unshift(logRow(ACTOR, 'Timesheet limits changed', `Daily ${next.maxPerDay} h, weekly cap ${next.weeklyCap} h, standard week ${next.standardWeek} h`));
  });
  return { ok: true };
}
