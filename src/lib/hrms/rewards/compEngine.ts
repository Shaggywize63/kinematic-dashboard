// Compensation: pure logic. Bands, compa-ratio, team-level aggregates with a minimum group size, merit cycle maths,
// and the employer cost of an increment. No React, no storage.

import type { Employee, HrmsDb, Id, ISODate } from '../types';
import { buildBreakup } from '../engine';
import { PF, valueOn } from '../rules';
import { fmtDate } from '../format';
import { addMonthsISO } from './assetsEngine';
import type { Band, CompaZone, Guideline, Guidelines, MeritCycle, PerfBand, Proposal } from './types';

/** Smallest group any equity or sentiment-style aggregate may describe. Below this the figure is withheld. */
export const MIN_GROUP = 5;

export const PERF_LABEL: Record<PerfBand, string> = { exceeds: 'Exceeds', meets: 'Meets', partial: 'Partly meets', below: 'Below', unrated: 'Not rated' };
export const PERF_ORDER: PerfBand[] = ['exceeds', 'meets', 'partial', 'below', 'unrated'];
export const ZONE_LABEL: Record<CompaZone, string> = { low: 'Low, under 0.90', mid: 'Middle, 0.90 to 1.10', high: 'High, over 1.10' };
export const ZONES: CompaZone[] = ['low', 'mid', 'high'];

// ───────────────────────────── bands ─────────────────────────────
/** CTC divided by the band midpoint, to two decimals. 1.00 means paid at the midpoint. */
export function compaRatio(ctc: number, mid: number): number {
  return mid > 0 ? Math.round((ctc / mid) * 100) / 100 : 0;
}
export type Position = 'below' | 'in' | 'above';
export function positionInBand(ctc: number, band: Pick<Band, 'min' | 'max'>): Position {
  return ctc < band.min ? 'below' : ctc > band.max ? 'above' : 'in';
}
export function zoneOf(compa: number): CompaZone {
  return compa < 0.9 ? 'low' : compa > 1.1 ? 'high' : 'mid';
}
/** Where a CTC sits between band min (0%) and max (100%), unclamped. */
export const bandPercent = (ctc: number, band: Pick<Band, 'min' | 'max'>): number => (band.max > band.min ? ((ctc - band.min) / (band.max - band.min)) * 100 : 0);

export function validateBand(b: Pick<Band, 'min' | 'mid' | 'max' | 'market'>): string | null {
  if (![b.min, b.mid, b.max, b.market].every((n) => Number.isFinite(n) && n > 0)) return 'Enter all four amounts as positive numbers.';
  if (!(b.min < b.mid && b.mid < b.max)) return 'The minimum must be below the midpoint, and the midpoint below the maximum.';
  if (b.max > b.min * 2.5) return 'A band wider than 2.5 times its minimum looks like a typing mistake.';
  return null;
}

export interface BandPerson {
  employee: Employee;
  grade: string;
  band: Band;
  ctc: number;
  compa: number;
  position: Position;
  zone: CompaZone;
}
/** Everyone on the books with a CTC and a graded designation, placed in their band. Leavers and joiners without CTC are left out. */
export function bandPeople(db: HrmsDb, bands: Band[]): BandPerson[] {
  const out: BandPerson[] = [];
  for (const e of db.employees) {
    if ((e.status !== 'active' && e.status !== 'on_notice') || !e.annualCtc) continue;
    const grade = db.designations.find((d) => d.id === e.designationId)?.grade;
    const band = bands.find((b) => b.grade === grade);
    if (!grade || !band) continue;
    const compa = compaRatio(e.annualCtc, band.mid);
    out.push({ employee: e, grade, band, ctc: e.annualCtc, compa, position: positionInBand(e.annualCtc, band), zone: zoneOf(compa) });
  }
  return out;
}

// ───────────────────────────── aggregates ─────────────────────────────
export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
export type GroupStat = { shown: true; n: number; median: number } | { shown: false; n: number };
/** A median that is only released for a group of at least `min` people. Smaller groups return no number at all. */
export function groupMedian(values: number[], min = MIN_GROUP): GroupStat {
  return values.length >= min ? { shown: true, n: values.length, median: median(values) } : { shown: false, n: values.length };
}

export interface EquityRow { label: string; women: GroupStat; men: GroupStat }
/** Median CTC by gender inside each grade. Each side needs its own group of 5, otherwise it is withheld. */
export function equityByGrade(people: BandPerson[], grades: string[]): EquityRow[] {
  return grades.map((g) => {
    const here = people.filter((p) => p.grade === g);
    return {
      label: g,
      women: groupMedian(here.filter((p) => p.employee.gender === 'female').map((p) => p.ctc)),
      men: groupMedian(here.filter((p) => p.employee.gender === 'male').map((p) => p.ctc)),
    };
  });
}
/** Median compa-ratio by gender across the company. Compa-ratio already adjusts for grade, so groups can be compared. */
export function compaByGender(people: BandPerson[]): { women: GroupStat; men: GroupStat } {
  return {
    women: groupMedian(people.filter((p) => p.employee.gender === 'female').map((p) => p.compa)),
    men: groupMedian(people.filter((p) => p.employee.gender === 'male').map((p) => p.compa)),
  };
}

// ───────────────────────────── merit cycle ─────────────────────────────
/** New CTC after an increment, rounded to the nearest 100 rupees so letters carry tidy numbers. */
export function newCtc(ctc: number, pct: number): number {
  return Math.round((ctc * (1 + pct / 100)) / 100) * 100;
}
/** The CTC a cycle works from: the figure before any increment issued in this cycle. */
export function baseCtcFor(e: Employee, cycle: Pick<MeritCycle, 'applied'>): number {
  return cycle.applied[e.id]?.from ?? e.annualCtc ?? 0;
}

export function guidelineFor(g: Guidelines, perf: PerfBand | undefined, compa: number): Guideline {
  return g[perf ?? 'unrated'][zoneOf(compa)];
}

export function validateGuideline(min: number, max: number): string | null {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 'Enter both numbers.';
  if (min < 0 || max > 50) return 'Use values from 0 to 50 percent.';
  if (min > max) return 'The lowest value cannot be above the highest.';
  return null;
}

export interface CycleMember { employee: Employee; included: boolean; reason?: string }
/**
 * Who is in the cycle. Sample rules: working today (not on notice), joined at least six months before the effective date,
 * and, for a fixed-term or contract role, still employed on the effective date.
 */
export function cycleMembership(db: HrmsDb, cycle: Pick<MeritCycle, 'effectiveOn'>): CycleMember[] {
  const cutoff = addMonthsISO(cycle.effectiveOn, -6);
  return db.employees.filter((e) => e.status !== 'exited').map((e) => {
    if (e.status === 'onboarding') return { employee: e, included: false, reason: 'Has not joined yet' };
    if (!e.annualCtc) return { employee: e, included: false, reason: 'No CTC on file' };
    if (e.status === 'on_notice') return { employee: e, included: false, reason: 'Serving notice' };
    if (e.joinDate > cutoff) return { employee: e, included: false, reason: `Joined after ${fmtDate(cutoff)}` };
    if (e.contractEndDate && e.contractEndDate < cycle.effectiveOn) return { employee: e, included: false, reason: `Contract ends ${fmtDate(e.contractEndDate)}, before the effective date` };
    return { employee: e, included: true };
  });
}

export interface ProposalCheck {
  guide: Guideline;
  outside: boolean;            // outside the suggested range
  needsReason: boolean;        // outside and no reason written yet
  newCtc: number;
  delta: number;
  newCompa: number;
  aboveMax: boolean;           // the new CTC passes the band maximum
}
export function checkProposal(base: number, band: Band, perf: PerfBand | undefined, guidelines: Guidelines, p: Pick<Proposal, 'pct' | 'reason'> | undefined): ProposalCheck {
  const compa = compaRatio(base, band.mid);
  const guide = guidelineFor(guidelines, perf, compa);
  const pct = p?.pct ?? 0;
  const next = newCtc(base, pct);
  return {
    guide, outside: p != null && (pct < guide.min || pct > guide.max), needsReason: p != null && (pct < guide.min || pct > guide.max) && !(p.reason ?? '').trim(),
    newCtc: next, delta: next - base, newCompa: compaRatio(next, band.mid), aboveMax: next > band.max,
  };
}

export function validatePct(text: string): { ok: true; value: number } | { ok: false; error: string } {
  const t = text.trim();
  if (!t) return { ok: false, error: 'Enter a percent.' };
  const v = Number(t);
  if (!Number.isFinite(v)) return { ok: false, error: 'Use a number.' };
  if (v < 0 || v > 50) return { ok: false, error: 'Use 0 to 50.' };
  return { ok: true, value: Math.round(v * 100) / 100 };
}

export interface MeritTotals { payroll: number; budget: number; proposed: number; remaining: number; usedPct: number; avgPct: number; people: number; withProposal: number; over: boolean }
export function meritTotals(rows: { base: number; delta: number; hasProposal: boolean }[], budgetPct: number): MeritTotals {
  const payroll = rows.reduce((s, r) => s + r.base, 0);
  const budget = Math.round((payroll * budgetPct) / 100);
  const proposed = rows.reduce((s, r) => s + r.delta, 0);
  return {
    payroll, budget, proposed, remaining: budget - proposed, usedPct: budget ? Math.round((proposed / budget) * 100) : 0,
    avgPct: payroll ? Math.round((proposed / payroll) * 10000) / 100 : 0, people: rows.length, withProposal: rows.filter((r) => r.hasProposal).length, over: proposed > budget,
  };
}

/** Why a cycle cannot go to HR for approval yet, in plain sentences. Empty means it can. */
export function submitBlockers(args: { withProposal: number; missingReasons: number; invalid?: number }): string[] {
  const out: string[] = [];
  if (args.withProposal === 0) out.push('Enter at least one proposed increment.');
  if (args.missingReasons > 0) out.push(args.missingReasons === 1 ? '1 proposal is outside the guidance and needs a reason.' : `${args.missingReasons} proposals are outside the guidance and need a reason.`);
  return out;
}

// ───────────────────────────── cost of an increment ─────────────────────────────
export interface PfImpact {
  ctcDelta: number;           // annual
  epfErDelta: number;         // annual change in the employer 12%, which sits inside CTC
  offCtcDelta: number;        // annual change in EDLI and PF admin charges, which sit outside CTC
  pfWageBefore: number;       // monthly
  pfWageAfter: number;
  atCeiling: boolean;         // PF wage was already at the ceiling, so the increment adds no PF
}
/**
 * Employer cost of raising one person's CTC, using the same salary engine as payroll.
 *   - Employer PF (12% of PF wage) is already a component of CTC in these structures, so it is part of the CTC change, not on top.
 *   - EDLI and PF admin charges are paid on the wage up to the ceiling and are NOT in CTC, so any change adds to cost.
 *   - PF wage = wages after the 50% rule, capped at the ceiling unless the person contributes on actual wages.
 * ESI and the gratuity provision are not recomputed here. The ceiling comes from rules.ts and carries its confidence tag.
 */
export function pfImpact(db: HrmsDb, e: Employee, before: number, after: number, asOn: ISODate): PfImpact | null {
  const s = db.structures.find((x) => x.id === e.structureId);
  if (!s) return null;
  const opts = { asOn, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: undefined };
  const b = buildBreakup(s, before, opts);
  const a = buildBreakup(s, after, opts);
  const ceiling = valueOn(PF.ceiling, asOn);
  const er = (w: number) => (w * PF.employerRate) / 100;
  const off = (w: number) => (Math.min(w, ceiling) * (PF.edliRate + PF.adminRate)) / 100;
  return {
    ctcDelta: after - before,
    epfErDelta: Math.round((er(a.pfWage) - er(b.pfWage)) * 12),
    offCtcDelta: Math.round((off(a.pfWage) - off(b.pfWage)) * 12),
    pfWageBefore: Math.round(b.pfWage), pfWageAfter: Math.round(a.pfWage),
    atCeiling: !e.pfOnActualWage && b.pfWage >= ceiling && a.pfWage >= ceiling,
  };
}

export interface FinanceSummary { ctcAnnual: number; epfAnnual: number; offCtcAnnual: number; totalAnnual: number; totalMonthly: number; people: number; noStructure: number }
export function financeSummary(impacts: (PfImpact | null)[], deltas: number[]): FinanceSummary {
  let epf = 0; let off = 0; let noStructure = 0;
  impacts.forEach((i) => { if (i) { epf += i.epfErDelta; off += i.offCtcDelta; } else noStructure += 1; });
  const ctc = deltas.reduce((s, d) => s + d, 0);
  const totalAnnual = ctc + off;
  return { ctcAnnual: ctc, epfAnnual: epf, offCtcAnnual: off, totalAnnual, totalMonthly: Math.round(totalAnnual / 12), people: deltas.filter((d) => d > 0).length, noStructure };
}

export const idsWithProposals = (proposals: Record<Id, Proposal>): Id[] => Object.keys(proposals);
