// Talent: skills against role needs, succession bench strength and the 9-box. Pure functions.
// Nothing here predicts what a person will do or feel. Risk of a vacancy is described with plain facts only.

import type { Employee, Id, ISODate } from '../types';
import { diffDays, fmtDate, tenure } from '../format';
import type { CriticalRole, NineLevel, Placement, Rating, Readiness, SkillLevel } from './types';

export const MIN_GROUP = 5;

export const LEVEL_LABEL: Record<number, string> = { 0: 'Not assessed', 1: 'Aware', 2: 'Working', 3: 'Proficient', 4: 'Expert' };
export const LEVEL_HELP: Record<number, string> = {
  0: 'No assessment yet',
  1: 'Knows the basics, needs guidance',
  2: 'Works with some support',
  3: 'Works independently',
  4: 'Teaches and sets the standard',
};

export const ratingKey = (employeeId: Id, skillId: Id): string => `${employeeId}|${skillId}`;
export const levelOf = (ratings: Record<string, Rating>, employeeId: Id, skillId: Id): SkillLevel => ratings[ratingKey(employeeId, skillId)]?.level ?? 0;

export interface Gap { skillId: Id; required: number; actual: number; short: number }
/** Skills the person's role needs at a level they have not reached. */
export function gapsFor(e: Pick<Employee, 'id' | 'designationId'>, ratings: Record<string, Rating>, requirements: Record<Id, Record<Id, number>>): Gap[] {
  const need = requirements[e.designationId] ?? {};
  return Object.entries(need)
    .map(([skillId, required]) => ({ skillId, required, actual: levelOf(ratings, e.id, skillId), short: required - levelOf(ratings, e.id, skillId) }))
    .filter((g) => g.short > 0)
    .sort((a, b) => b.short - a.short || a.skillId.localeCompare(b.skillId));
}

/** A rating of 3 or 4 is a claim that needs evidence: a short note saying what the assessor saw. */
export function validateRating(level: number, note: string): string | null {
  if (!Number.isInteger(level) || level < 0 || level > 4) return 'Pick a level from 0 to 4.';
  if (level >= 3 && note.trim().length < 8) return 'Level 3 and 4 need an evidence note: what did the assessor see?';
  return null;
}

export interface SkillHolder { employee: Employee; level: SkillLevel; rating?: Rating }
/** Everyone with the skill at or above a level, highest level first, then by name. */
export function whoHas(employees: Employee[], ratings: Record<string, Rating>, skillId: Id, minLevel: number): SkillHolder[] {
  return employees
    .map((employee) => ({ employee, level: levelOf(ratings, employee.id, skillId), rating: ratings[ratingKey(employee.id, skillId)] }))
    .filter((h) => h.level >= minLevel && h.level > 0)
    .sort((a, b) => b.level - a.level || `${a.employee.firstName} ${a.employee.lastName}`.localeCompare(`${b.employee.firstName} ${b.employee.lastName}`));
}

// ───────────────────────────── succession ─────────────────────────────
export const READINESS_LABEL: Record<Readiness, string> = { now: 'Ready now', '1-2y': 'Ready in 1 to 2 years', '3y+': 'Ready in 3+ years' };
export const READINESS_ORDER: Readiness[] = ['now', '1-2y', '3y+'];

export type BenchStatus = 'red' | 'amber' | 'green';
export interface Bench { status: BenchStatus; label: string; readyNow: number; total: number }
/** Bench strength straight from the data: no successor is red, successors but nobody ready now is amber, anyone ready now is green. */
export function benchStrength(role: Pick<CriticalRole, 'successors'>): Bench {
  const total = role.successors.length;
  const readyNow = role.successors.filter((s) => s.readiness === 'now').length;
  if (total === 0) return { status: 'red', label: 'No successor named', readyNow, total };
  if (readyNow === 0) return { status: 'amber', label: 'Nobody ready now', readyNow, total };
  return { status: 'green', label: `${readyNow} ready now`, readyNow, total };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Age in whole years on a date. */
export function ageOn(dob: ISODate, today: ISODate): number {
  return Math.floor(tenure(dob, today).totalMonths / 12);
}

/**
 * The facts behind "what happens if this person leaves": notice period, time in role, serving notice, contract end and
 * years to the company retirement age. Facts only, no estimate of anyone's intentions.
 */
export function vacancyFacts(role: CriticalRole, incumbent: Employee | undefined, today: ISODate): string[] {
  if (!incumbent) return ['The incumbent is not in the employee list.'];
  const facts: string[] = [];
  facts.push(`Notice period is ${plural(incumbent.noticeDays, 'day')}.`);
  const t = tenure(role.roleSince, today);
  facts.push(`In this role for ${t.years ? plural(t.years, 'year') : ''}${t.years && t.months ? ' ' : ''}${t.months || !t.years ? plural(t.months, 'month') : ''}.`);
  if (incumbent.status === 'on_notice') facts.push(`Serving notice. Last working day ${fmtDate(incumbent.lastWorkingDate)}.`);
  if (incumbent.contractEndDate) facts.push(`Contract ends ${fmtDate(incumbent.contractEndDate)} (${plural(Math.max(0, diffDays(today, incumbent.contractEndDate)), 'day')} away).`);
  const age = ageOn(incumbent.dob, today);
  const toRetire = role.retirementAge - age;
  facts.push(toRetire <= 5 ? `Reaches the company retirement age of ${role.retirementAge} in ${plural(Math.max(0, toRetire), 'year')}.` : `${plural(toRetire, 'year')} to the company retirement age of ${role.retirementAge}.`);
  return facts;
}

// ───────────────────────────── 9-box ─────────────────────────────
export const PERF_LABEL: Record<NineLevel, string> = { 1: 'Below the role\'s expectations', 2: 'Meets expectations', 3: 'Exceeds expectations' };
export const POT_LABEL: Record<NineLevel, string> = { 1: 'Best in the current role', 2: 'Could grow one level', 3: 'Could grow two levels or more' };
/** Short prompts for a talent conversation. They describe a conversation to have, not a verdict on the person. */
export const BOX_NAME: Record<string, string> = {
  '1-3': 'Early talent', '2-3': 'Growth talent', '3-3': 'Future leader',
  '1-2': 'Needs a clearer fit', '2-2': 'Core contributor', '3-2': 'Strong performer',
  '1-1': 'Support or move', '2-1': 'Solid in role', '3-1': 'Expert in role',
};
export const boxKey = (performance: number, potential: number): string => `${performance}-${potential}`;

export interface NineBoxSummary {
  groupSize: number;
  placed: number;
  /** True when the group is under the minimum size: counts are shown, names never are. */
  smallGroup: boolean;
  /** Count per box, keyed `${performance}-${potential}`. No names, in every case. */
  counts: Record<string, number>;
}
export function nineBoxSummary(group: Employee[], placements: Record<Id, Placement>): NineBoxSummary {
  const counts: Record<string, number> = {};
  for (const p of [1, 2, 3]) for (const q of [1, 2, 3]) counts[boxKey(p, q)] = 0;
  let placed = 0;
  for (const e of group) {
    const pl = placements[e.id];
    if (!pl) continue;
    counts[boxKey(pl.performance, pl.potential)] += 1;
    placed += 1;
  }
  return { groupSize: group.length, placed, smallGroup: group.length < MIN_GROUP, counts };
}

export interface NineBoxReview { cells: Record<string, Employee[]>; unplaced: Employee[] }
/** The talent-review (HR) view: the same grid with names. Only the review screen calls this. */
export function nineBoxReview(group: Employee[], placements: Record<Id, Placement>): NineBoxReview {
  const cells: Record<string, Employee[]> = {};
  for (const p of [1, 2, 3]) for (const q of [1, 2, 3]) cells[boxKey(p, q)] = [];
  const unplaced: Employee[] = [];
  for (const e of group) {
    const pl = placements[e.id];
    if (!pl) unplaced.push(e); else cells[boxKey(pl.performance, pl.potential)]!.push(e);
  }
  return { cells, unplaced };
}
