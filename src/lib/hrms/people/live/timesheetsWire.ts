// The one place where the dashboard's Timesheet shapes (camelCase, optional fields) meet the HRMS timesheets API's
// (snake_case top-level keys, null for "nothing"; a sheet's lines and trail pass through in the dashboard's camelCase
// shape). Mirrors the rewards live wires: nothing else in the app knows the wire names, dates are YYYY-MM-DD.
//
// Phase 9: the Timesheets slice of the people area moves to the server — projects, one sheet per person per week, the
// company limits and who tracks time. Learning, talent and engagement stay local.

import { arr, isObj, num, str, UUID_RE, type Row } from '../../live/wire';
import type { Id, ISODate } from '../../types';
import { sheetId } from '../timesheetEngine';
import type { Project, Sheet, SheetLine, SheetStatus, SheetTrail, TimesheetPolicy } from '../types';

export type { Row };

const STATUSES = new Set<SheetStatus>(['draft', 'submitted', 'approved', 'returned']);
const asStatus = (v: unknown): SheetStatus => (STATUSES.has(v as SheetStatus) ? (v as SheetStatus) : 'draft');

export function projectFromWire(r: Row): Project {
  const p: Project = {
    id: String(r.id ?? ''), name: String(r.name ?? ''), client: String(r.client ?? ''), kind: r.kind === 'internal' ? 'internal' : 'client',
    billable: r.billable === true, budgetHours: num(r.budget_hours) ?? 0, priorHours: num(r.prior_hours) ?? 0, sampleRate: num(r.rate) ?? 0,
  };
  if (r.archived === true) p.archived = true;
  return p;
}

const linesFromWire = (v: unknown): SheetLine[] =>
  arr(v).map((l) => ({ projectId: String(l.projectId ?? ''), hours: Array.from({ length: 7 }, (_, i) => num(Array.isArray(l.hours) ? l.hours[i] : 0) ?? 0) }));

const trailFromWire = (v: unknown): SheetTrail[] =>
  arr(v).map((t) => { const e: SheetTrail = { at: str(t.at) ?? '', by: String(t.by ?? ''), action: String(t.action ?? '') }; const c = str(t.comment); if (c) e.comment = c; return e; });

/** A week, keyed the dashboard's way (employee|week): the server's own row id is not kept. */
export function sheetFromWire(r: Row): Sheet {
  const employeeId = String(r.employee_id ?? '');
  const weekStart = str(r.week_start) ?? '';
  const s: Sheet = { id: sheetId(employeeId, weekStart), employeeId, weekStart, lines: linesFromWire(r.lines), status: asStatus(r.status), trail: trailFromWire(r.trail) };
  const submittedOn = str(r.submitted_on); if (submittedOn) s.submittedOn = submittedOn;
  const decidedOn = str(r.decided_on); if (decidedOn) s.decidedOn = decidedOn;
  const decidedBy = str(r.decided_by); if (decidedBy) s.decidedBy = decidedBy;
  const comment = str(r.comment); if (comment) s.comment = comment;
  return s;
}

export function policyFromWire(v: unknown): TimesheetPolicy {
  const p = isObj(v) ? v : {};
  return { maxPerDay: num(p.max_per_day) ?? 12, weeklyCap: num(p.weekly_cap) ?? 60, standardWeek: num(p.standard_week) ?? 40 };
}

export interface ConfigResult { policy: TimesheetPolicy; trackedIds: Id[] }
export const configFromWire = (r: Row): ConfigResult => ({ policy: policyFromWire(r.policy), trackedIds: (Array.isArray(r.tracked_ids) ? r.tracked_ids : []).map(String) });

export interface TimesheetsBootstrap { policy: TimesheetPolicy; trackedIds: Id[]; projects: Project[]; sheets: Sheet[]; today?: ISODate; serverTime?: string }
export function timesheetsBootstrapFromWire(data: Row): TimesheetsBootstrap {
  return {
    ...configFromWire(data),
    projects: arr(data.projects).map(projectFromWire),
    sheets: arr(data.sheets).map(sheetFromWire),
    today: str(data.today),
    serverTime: str(data.server_time),
  };
}

// ───────────────────────────── to the wire ─────────────────────────────
export interface ProjectInput { name: string; client: string; kind: 'client' | 'internal'; billable: boolean; budgetHours: number; priorHours: number; rate: number; archived?: boolean }

/** Body for POST /timesheets/projects. A client UUID makes the create idempotent. */
export function projectCreateBody(i: ProjectInput, id?: string): Row {
  const body: Row = {
    name: i.name.trim(), client: i.client.trim(), kind: i.kind, billable: i.billable,
    budget_hours: i.budgetHours, prior_hours: i.priorHours, rate: i.billable ? i.rate : 0,
  };
  if (id && UUID_RE.test(id)) body.id = id;
  return body;
}
/** Body for PUT /timesheets/projects/:id: the whole editable record (and the archive flag when given). */
export function projectUpdateBody(i: ProjectInput): Row {
  const body = projectCreateBody(i);
  if (i.archived !== undefined) body.archived = i.archived;
  return body;
}
export const policyBody = (p: TimesheetPolicy): Row => ({ max_per_day: p.maxPerDay, weekly_cap: p.weeklyCap, standard_week: p.standardWeek });
export const trackedBody = (ids: Id[]): Row => ({ employee_ids: [...new Set(ids)] });
export const linesBody = (lines: SheetLine[]): Row => ({ lines: lines.map((l) => ({ projectId: l.projectId, hours: Array.from({ length: 7 }, (_, i) => Number(l.hours[i]) || 0) })) });
export const decideBody = (decision: 'approved' | 'returned', comment: string): Row => ({ decision, comment: comment.trim() });
