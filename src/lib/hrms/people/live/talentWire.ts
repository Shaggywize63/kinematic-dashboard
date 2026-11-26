// The one place where the dashboard's Talent shapes (camelCase, maps keyed by id) meet the HRMS talent API's (snake_case
// top-level keys; requirements as designationId -> skillKey -> level, ratings keyed `${employeeId}|${skillId}`, placements
// keyed by employeeId). Mirrors the other live wires: nothing else in the app knows the wire names; dates are YYYY-MM-DD.
//
// Phase 12: the Talent slice of the people area moves to the server: the skills catalogue, the required level per
// designation, each person's ratings, the critical roles with their succession bench and change history, and the 9-box
// placements. It is the last People-area slice to move; the server seeds a populated demo on first load.

import { arr, isObj, str, type Row } from '../../live/wire';
import type { ISODate } from '../../types';
import type {
  CriticalRole, LogEntry, NineLevel, Placement, Rating, Readiness, Skill, SkillLevel, Successor, SuccessionChange,
} from '../types';

export type { Row };

const READINESS = new Set<Readiness>(['now', '1-2y', '3y+']);
const readiness = (v: unknown): Readiness => (READINESS.has(v as Readiness) ? (v as Readiness) : '1-2y');
const KINDS = new Set(['added', 'removed', 'readiness']);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []);
const clampLevel = (n: number): SkillLevel => (Math.max(0, Math.min(4, Math.round(n))) as SkillLevel);
const nine = (n: number): NineLevel => (n === 1 || n === 3 ? n : 2);
const numOr = (v: unknown, d: number): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// ───────────────────────────── reads (wire -> dashboard) ─────────────────────────────
export const skillFromWire = (r: Row): Skill => ({ id: String(r.id ?? ''), name: String(r.name ?? ''), group: String(r.group ?? ''), blurb: String(r.blurb ?? '') });

/** requirements: { designationId: { skillKey: level } } — coerce every level to a number. */
export function requirementsFromWire(v: unknown): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  if (!isObj(v)) return out;
  for (const [desig, skills] of Object.entries(v)) {
    if (!isObj(skills)) continue;
    const inner: Record<string, number> = {};
    for (const [skill, level] of Object.entries(skills)) inner[skill] = numOr(level, 0);
    out[desig] = inner;
  }
  return out;
}

export const ratingValueFromWire = (v: Row): Rating => ({ level: clampLevel(numOr(v.level, 0)), note: String(v.note ?? ''), by: String(v.by ?? ''), on: str(v.on) ?? '' });
/** ratings: { `${employeeId}|${skillId}`: Rating }. */
export function ratingsFromWire(v: unknown): Record<string, Rating> {
  const out: Record<string, Rating> = {};
  if (!isObj(v)) return out;
  for (const [k, raw] of Object.entries(v)) if (isObj(raw)) out[k] = ratingValueFromWire(raw);
  return out;
}

export const successorFromWire = (r: Row): Successor => ({ employeeId: String(r.employee_id ?? ''), readiness: readiness(r.readiness), actions: strs(r.actions), addedOn: str(r.added_on) ?? '' });

export function changeFromWire(r: Row): SuccessionChange {
  const c: SuccessionChange = {
    id: String(r.id ?? ''), on: str(r.on) ?? '', by: String(r.by ?? ''),
    kind: (KINDS.has(String(r.kind)) ? String(r.kind) : 'added') as SuccessionChange['kind'],
    employeeId: String(r.employee_id ?? ''), reason: String(r.reason ?? ''),
  };
  const from = str(r.from); if (from) c.from = from;
  const to = str(r.to); if (to) c.to = to;
  return c;
}

export function roleFromWire(r: Row): CriticalRole {
  return {
    id: String(r.id ?? ''), title: String(r.title ?? ''), departmentId: String(r.department_id ?? ''), locationId: String(r.location_id ?? ''),
    incumbentId: String(r.incumbent_id ?? ''), roleSince: str(r.role_since) ?? '', retirementAge: numOr(r.retirement_age, 60), why: String(r.why ?? ''),
    successors: arr(r.successors).map(successorFromWire), history: arr(r.history).map(changeFromWire),
  };
}

export const placementValueFromWire = (v: Row): Placement => ({
  employeeId: String(v.employee_id ?? ''), performance: nine(numOr(v.performance, 2)), potential: nine(numOr(v.potential, 2)), rationale: String(v.rationale ?? ''), by: String(v.by ?? ''), on: str(v.on) ?? '',
});
/** placements: { employeeId: Placement }. */
export function placementsFromWire(v: unknown): Record<string, Placement> {
  const out: Record<string, Placement> = {};
  if (!isObj(v)) return out;
  for (const [k, raw] of Object.entries(v)) if (isObj(raw)) out[k] = placementValueFromWire(raw);
  return out;
}

export function logFromWire(r: Row): LogEntry {
  const e: LogEntry = { id: String(r.id ?? ''), at: str(r.at) ?? '', by: String(r.by ?? ''), action: String(r.action ?? '') };
  const d = str(r.detail); if (d) e.detail = d;
  return e;
}

export interface TalentBootstrap {
  skills: Skill[];
  requirements: Record<string, Record<string, number>>;
  ratings: Record<string, Rating>;
  roles: CriticalRole[];
  placements: Record<string, Placement>;
  cycle: string;
  log: LogEntry[];
  today?: ISODate;
}
export function talentBootstrapFromWire(data: Row): TalentBootstrap {
  return {
    skills: arr(data.skills).map(skillFromWire),
    requirements: requirementsFromWire(data.requirements),
    ratings: ratingsFromWire(data.ratings),
    roles: arr(data.roles).map(roleFromWire),
    placements: placementsFromWire(data.placements),
    cycle: String(data.cycle ?? ''),
    log: arr(data.log).map(logFromWire),
    today: str(data.today),
  };
}

/** The server's answer to a rating change: the key + the new value (null when cleared). */
export interface RatingResult { employeeId: string; skillId: string; rating: Rating | null }
export const ratingResultFromWire = (r: Row): RatingResult => ({
  employeeId: String(r.employee_id ?? ''), skillId: String(r.skill_id ?? ''), rating: isObj(r.rating) ? ratingValueFromWire(r.rating) : null,
});

// ───────────────────────────── request bodies ─────────────────────────────
export const ratingBody = (employeeId: string, skillId: string, level: number, note: string, assessor?: string): Row =>
  ({ employee_id: employeeId, skill_id: skillId, level, note, ...(assessor ? { assessor } : {}) });
export const addSuccessorBody = (employeeId: string, readinessV: Readiness, actions: string[], reason: string): Row =>
  ({ employee_id: employeeId, readiness: readinessV, actions: actions.map((a) => a.trim()).filter(Boolean), reason });
export const successorRefBody = (employeeId: string, reason: string): Row => ({ employee_id: employeeId, reason });
export const readinessBody = (employeeId: string, readinessV: Readiness, reason: string): Row => ({ employee_id: employeeId, readiness: readinessV, reason });
export const placementBody = (employeeId: string, performance: NineLevel, potential: NineLevel, rationale: string): Row => ({ employee_id: employeeId, performance, potential, rationale });
export const clearPlacementBody = (employeeId: string): Row => ({ employee_id: employeeId });
export const reviewOpenedBody = (group: string): Row => (group ? { group } : {});
