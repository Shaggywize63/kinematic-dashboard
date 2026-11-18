'use client';
// Changes to timesheets: hours, project rows, submit, approve or return, the company limits, the project list and who
// tracks time. Each is the local sample flow in sample mode and a server call in live mode (phase 9,
// live/timesheetsSource.ts). They return a promise so the screens can await the server; sample mode resolves at once.
// The checks that need no server (a locked week, a duplicate row, a row with hours) run first in both modes, with the
// same words the server uses.

import { ACTOR, employeeName } from '../actions';
import { isLive } from '../live/store';
import { uid } from '../types';
import type { Id, ISODate } from '../types';
import { peopleStore, logRow } from './store';
import { emptyLine, isEditable, sheetId, submitCheck, sheetTotal, lineTotal } from './timesheetEngine';
import { tsToday } from './timesheetClock';
import {
  liveCreateProject, liveDecideSheet, liveSetLines, liveSetPolicy, liveSetTracked, liveSubmitSheet, liveUpdateProject,
} from './live/timesheetsSource';
import type { ProjectInput } from './live/timesheetsWire';
import type { Project, Sheet, SheetLine, TimesheetPolicy } from './types';

export type ActionResult = { ok: true } | { ok: false; error: string };
export type { ProjectInput };
const fail = (error: string): ActionResult => ({ ok: false, error });
const done = (r: ActionResult): Promise<ActionResult> => Promise.resolve(r);

function ensureSheet(sheets: Sheet[], employeeId: Id, weekStart: ISODate): Sheet {
  const id = sheetId(employeeId, weekStart);
  let s = sheets.find((x) => x.id === id);
  if (!s) { s = { id, employeeId, weekStart, lines: [], status: 'draft', trail: [] }; sheets.push(s); }
  return s;
}
const findSheet = (employeeId: Id, weekStart: ISODate) => peopleStore.get().timesheets.sheets.find((x) => x.id === sheetId(employeeId, weekStart));
const copyLines = (s?: Sheet): SheetLine[] => (s?.lines ?? []).map((l) => ({ projectId: l.projectId, hours: [...l.hours] }));

/** Set one cell. Ignored for a week that is submitted or approved: locked weeks cannot be edited. */
export function setHours(employeeId: Id, weekStart: ISODate, projectId: Id, day: number, hours: number): Promise<ActionResult> {
  const cur = findSheet(employeeId, weekStart);
  if (!isEditable(cur?.status)) return done(fail('This week is locked.'));
  if (!Number.isFinite(hours) || day < 0 || day > 6) return done(fail('Enter hours as a number.'));
  if (isLive()) {
    const lines = copyLines(cur);
    let line = lines.find((l) => l.projectId === projectId);
    if (!line) { line = emptyLine(projectId); lines.push(line); }
    line.hours[day] = hours;
    return liveSetLines(employeeId, weekStart, lines);
  }
  peopleStore.mutate((d) => {
    const s = ensureSheet(d.timesheets.sheets, employeeId, weekStart);
    let line = s.lines.find((l) => l.projectId === projectId);
    if (!line) { line = emptyLine(projectId); s.lines.push(line); }
    line.hours[day] = hours;
  });
  return done({ ok: true });
}

export function addProjectRow(employeeId: Id, weekStart: ISODate, projectId: Id): Promise<ActionResult> {
  const cur = findSheet(employeeId, weekStart);
  if (!isEditable(cur?.status)) return done(fail('This week is locked.'));
  if (cur?.lines.some((l) => l.projectId === projectId)) return done(fail('That project is already on the sheet.'));
  if (isLive()) return liveSetLines(employeeId, weekStart, [...copyLines(cur), emptyLine(projectId)], true);
  peopleStore.mutate((d) => { ensureSheet(d.timesheets.sheets, employeeId, weekStart).lines.push(emptyLine(projectId)); });
  return done({ ok: true });
}

export function removeProjectRow(employeeId: Id, weekStart: ISODate, projectId: Id): Promise<ActionResult> {
  const cur = findSheet(employeeId, weekStart);
  if (!cur || !isEditable(cur.status)) return done(fail('This week is locked.'));
  const line = cur.lines.find((l) => l.projectId === projectId);
  if (line && lineTotal(line) > 0) return done(fail('Set the hours on this row to 0 before removing it.'));
  if (isLive()) return liveSetLines(employeeId, weekStart, copyLines(cur).filter((l) => l.projectId !== projectId), true);
  peopleStore.mutate((d) => { const s = ensureSheet(d.timesheets.sheets, employeeId, weekStart); s.lines = s.lines.filter((l) => l.projectId !== projectId); });
  return done({ ok: true });
}

export function submitSheet(employeeId: Id, weekStart: ISODate): Promise<ActionResult> {
  const t = peopleStore.get().timesheets;
  const cur = t.sheets.find((x) => x.id === sheetId(employeeId, weekStart));
  if (!cur) return done(fail('Enter some hours before submitting.'));
  const check = submitCheck(cur, t.policy, tsToday());
  if (!check.ok) return done(fail(check.reasons[0]!));
  if (isLive()) return liveSubmitSheet(employeeId, weekStart);
  peopleStore.mutate((d) => {
    const s = ensureSheet(d.timesheets.sheets, employeeId, weekStart);
    s.status = 'submitted'; s.submittedOn = tsToday(); s.decidedOn = undefined; s.decidedBy = undefined; s.comment = undefined;
    s.trail.push({ at: tsToday(), by: employeeName(employeeId), action: 'Submitted' });
    d.timesheets.log.unshift(logRow(ACTOR, 'Timesheet submitted', `${employeeName(employeeId)}, week of ${weekStart}, ${sheetTotal(s)} h`));
  });
  return done({ ok: true });
}

/** Approve (locks the week) or return it with a comment. The decision is the manager's; here that is the signed-in user. */
export function decideSheet(id: string, decision: 'approved' | 'returned', comment: string): Promise<ActionResult> {
  const cur = peopleStore.get().timesheets.sheets.find((x) => x.id === id);
  if (!cur || cur.status !== 'submitted') return done(fail('Only a submitted week can be approved or returned.'));
  if (decision === 'returned' && comment.trim().length < 5) return done(fail('Say what to fix when returning a week (at least 5 characters).'));
  if (isLive()) return liveDecideSheet(cur.employeeId, cur.weekStart, decision, comment);
  peopleStore.mutate((d) => {
    const s = d.timesheets.sheets.find((x) => x.id === id)!;
    s.status = decision; s.decidedOn = tsToday(); s.decidedBy = ACTOR; s.comment = comment.trim() || undefined;
    s.trail.push({ at: tsToday(), by: ACTOR, action: decision === 'approved' ? 'Approved' : 'Returned', comment: comment.trim() || undefined });
    d.timesheets.log.unshift(logRow(ACTOR, decision === 'approved' ? 'Timesheet approved and locked' : 'Timesheet returned', `${employeeName(s.employeeId)}, week of ${s.weekStart}`));
  });
  return done({ ok: true });
}

export function setPolicy(patch: Partial<TimesheetPolicy>): Promise<ActionResult> {
  const next = { ...peopleStore.get().timesheets.policy, ...patch };
  if (!(next.maxPerDay >= 8 && next.maxPerDay <= 24)) return done(fail('The daily limit must be between 8 and 24 hours.'));
  if (!(next.weeklyCap >= 20 && next.weeklyCap <= 90)) return done(fail('The weekly cap must be between 20 and 90 hours.'));
  if (!(next.standardWeek >= 20 && next.standardWeek <= next.weeklyCap)) return done(fail('The standard week must be at least 20 hours and not above the weekly cap.'));
  if (isLive()) return liveSetPolicy(next);
  peopleStore.mutate((d) => {
    d.timesheets.policy = next;
    d.timesheets.log.unshift(logRow(ACTOR, 'Timesheet limits changed', `Daily ${next.maxPerDay} h, weekly cap ${next.weeklyCap} h, standard week ${next.standardWeek} h`));
  });
  return done({ ok: true });
}

/** Who fills a timesheet. */
export function setTracked(ids: Id[]): Promise<ActionResult> {
  const unique = [...new Set(ids)];
  if (isLive()) return liveSetTracked(unique);
  peopleStore.mutate((d) => {
    d.timesheets.trackedIds = unique;
    d.timesheets.log.unshift(logRow(ACTOR, 'Timesheet people changed', `${unique.length} ${unique.length === 1 ? 'person tracks' : 'people track'} time`));
  });
  return done({ ok: true });
}

/** The project checks both modes share (the server applies the same rules and words). */
function projectError(i: ProjectInput, projects: Project[], exceptId?: Id): string | null {
  const name = i.name.trim();
  if (!name) return 'Enter a project name';
  if (projects.some((p) => p.id !== exceptId && p.name.trim().toLowerCase() === name.toLowerCase())) return `There is already a project called ${name}.`;
  if (![i.budgetHours, i.priorHours, i.rate].every((n) => Number.isFinite(n) && n >= 0)) return 'Hours and the rate must be zero or more.';
  return null;
}

export function createProject(i: ProjectInput): Promise<ActionResult> {
  const err = projectError(i, peopleStore.get().timesheets.projects);
  if (err) return done(fail(err));
  if (isLive()) return liveCreateProject(i);
  peopleStore.mutate((d) => {
    d.timesheets.projects.push({
      id: uid('p'), name: i.name.trim(), client: i.client.trim(), kind: i.kind, billable: i.billable,
      budgetHours: i.budgetHours, priorHours: i.priorHours, sampleRate: i.billable ? i.rate : 0,
    });
    d.timesheets.log.unshift(logRow(ACTOR, 'Project added', i.name.trim()));
  });
  return done({ ok: true });
}

export function updateProject(id: Id, i: ProjectInput): Promise<ActionResult> {
  const err = projectError(i, peopleStore.get().timesheets.projects, id);
  if (err) return done(fail(err));
  if (isLive()) return liveUpdateProject(id, i);
  peopleStore.mutate((d) => {
    const p = d.timesheets.projects.find((x) => x.id === id);
    if (!p) return;
    Object.assign(p, { name: i.name.trim(), client: i.client.trim(), kind: i.kind, billable: i.billable, budgetHours: i.budgetHours, priorHours: i.priorHours, sampleRate: i.billable ? i.rate : 0 });
    if (i.archived !== undefined) { if (i.archived) p.archived = true; else delete p.archived; }
    d.timesheets.log.unshift(logRow(ACTOR, i.archived ? 'Project archived' : 'Project changed', i.name.trim()));
  });
  return done({ ok: true });
}
