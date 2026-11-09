// Pure helpers for the Visit attendance page (proof-of-work attendance). No React, no storage: the specs import this
// file directly. It sits on top of the field engines (lib/hrms/field/engines.ts) and never changes the evidence.

import type { Id, ISODate, Month } from '../types';
import { addDays } from '../format';
import { REGULARISATION_POLICY, dayEvidence, regularisationFor } from '../field/engines';
import { toMin, weekdayOf } from '../field/evidence';
import type { FieldEvidence, RegularisationSuggestion, RegularisationVerdict, Visit } from '../field/types';
import type { RegDecision } from '../field/store';

// ───────────────────────────── what counts as a verified visit ─────────────────────────────
/** The rule evidence.ts applies when it sets `verified`. Mirrored here so the page can say it in words; a spec pins the two together. */
export const VERIFIED_VISIT_RULE = { maxDistanceM: 150, minMinutes: 5, needsPhoto: true };

/** Why a visit is not verified, in plain words. Empty when it is. */
export function visitProblems(v: Pick<Visit, 'distanceFromOutletM' | 'photo' | 'start' | 'end'>): string[] {
  const out: string[] = [];
  if (v.distanceFromOutletM > VERIFIED_VISIT_RULE.maxDistanceM) out.push(`phone was ${v.distanceFromOutletM} m from the outlet, the limit is ${VERIFIED_VISIT_RULE.maxDistanceM} m`);
  if (!v.photo) out.push('no photo was taken');
  const mins = toMin(v.end) - toMin(v.start);
  if (mins < VERIFIED_VISIT_RULE.minMinutes) out.push(`only ${mins} minute${mins === 1 ? '' : 's'} on site, ${VERIFIED_VISIT_RULE.minMinutes} are needed`);
  return out;
}

export const spanText = (min: number): string => (min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`);

// ───────────────────────────── the rule in sentences ─────────────────────────────
export function policySentences(): { rule: string[]; times: string[]; visit: string[]; advisory: string[] } {
  const P = REGULARISATION_POLICY, V = VERIFIED_VISIT_RULE;
  return {
    rule: [
      `At least ${P.minVerifiedVisits} verified visits that day.`,
      `The first verified visit starts and the last one ends at least ${P.minSpanMin / 60} hours apart.`,
      `The GPS trail shows at least ${P.minTrailKm} km of movement.`,
    ],
    times: [
      `Only the missing punch is suggested. A punch that exists is kept as it is.`,
      `Punch-in is suggested ${P.bufferMin} minutes before the first verified visit started.`,
      `Punch-out is suggested ${P.bufferMin} minutes after the last verified visit ended.`,
    ],
    visit: [
      `The phone was within ${V.maxDistanceM} m of the outlet at check-in.`,
      'A photo was taken at the outlet.',
      `The person stayed on site for at least ${V.minMinutes} minutes.`,
    ],
    advisory: [
      'No verified visit: movement alone does not prove the person worked, so no time is suggested and a manager has to decide.',
      'Some verified visits, but fewer or shorter than the rule asks: it goes to a manager as "needs review", with the evidence next to it.',
      'Even when every part of the rule is met, the system only suggests. A manager approves, and can still reject.',
    ],
  };
}

// ───────────────────────────── review lists ─────────────────────────────
export const regKey = (employeeId: Id, date: ISODate): string => `${employeeId}|${date}`;

export interface DecidedRow { s: RegularisationSuggestion; d: RegDecision }
export function partition(candidates: RegularisationSuggestion[], regs: Record<string, RegDecision>): { pending: RegularisationSuggestion[]; decided: DecidedRow[] } {
  const pending: RegularisationSuggestion[] = [];
  const decided: DecidedRow[] = [];
  for (const s of candidates) {
    const d = regs[regKey(s.employeeId, s.date)];
    if (d) decided.push({ s, d }); else pending.push(s);
  }
  return { pending, decided };
}

export function reviewStats(candidates: RegularisationSuggestion[], regs: Record<string, RegDecision>) {
  const { pending, decided } = partition(candidates, regs);
  return {
    waiting: pending.length,
    autoApprovable: pending.filter((s) => s.verdict === 'auto_approve').length,
    approved: decided.filter((x) => x.d.status === 'approved').length,
    rejected: decided.filter((x) => x.d.status === 'rejected').length,
    infoRequested: decided.filter((x) => x.d.status === 'info_requested').length,
  };
}

/** The punch times to record if the day is approved: the real punch where there is one, the suggestion where there is not. */
export function finalTimes(ev: FieldEvidence, s: Pick<RegularisationSuggestion, 'employeeId' | 'date' | 'suggestedIn' | 'suggestedOut'>): { in: string; out: string } {
  const p = ev.punches.find((x) => x.employeeId === s.employeeId && x.date === s.date);
  return { in: p?.in ?? s.suggestedIn ?? '', out: p?.out ?? s.suggestedOut ?? '' };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Error text for a pair of punch times, or null when they are fine. */
export function validateTimes(inTime: string, outTime: string): string | null {
  if (!HHMM.test(inTime)) return 'Enter the punch-in time.';
  if (!HHMM.test(outTime)) return 'Enter the punch-out time.';
  if (toMin(outTime) <= toMin(inTime)) return 'Punch-out must be after punch-in.';
  return null;
}

/** What "Approve all auto-approvable" would record, each with the times it would use. */
export function approveAllPlan(ev: FieldEvidence, pending: RegularisationSuggestion[]): { employeeId: Id; date: ISODate; in: string; out: string }[] {
  return pending.filter((s) => s.verdict === 'auto_approve').map((s) => ({ employeeId: s.employeeId, date: s.date, ...finalTimes(ev, s) }))
    .filter((x) => validateTimes(x.in, x.out) === null);
}

export const VERDICT_LABEL: Record<RegularisationVerdict, string> = {
  auto_approve: 'Meets the rule', needs_review: 'Needs a manager', no_evidence: 'No evidence', not_needed: 'Nothing to do',
};
export const DECISION_LABEL: Record<RegDecision['status'], string> = { approved: 'Approved', rejected: 'Rejected', info_requested: 'More information asked' };

// ───────────────────────────── one day, as a timeline ─────────────────────────────
export interface TimelineEntry {
  id: string;
  kind: 'punch_in' | 'punch_out' | 'visit';
  /** HH:mm, or null for a punch that is missing. */
  at: string | null;
  title: string;
  detail?: string;
  /** Visits only. */
  verified?: boolean;
  /** Visits only: 1, 2, 3 ... in the order they happened, the same numbers as on the map. */
  n?: number;
  missing?: boolean;
}

export function timelineFor(ev: FieldEvidence, employeeId: Id, date: ISODate): TimelineEntry[] {
  const d = dayEvidence(ev, employeeId, date);
  const out: TimelineEntry[] = [];
  const outletName = (v: Visit) => ev.outlets.find((o) => o.id === v.outletId)?.name ?? v.outletId;
  if (d.punch) {
    out.push(d.punch.in
      ? { id: 'in', kind: 'punch_in', at: d.punch.in, title: 'Punched in' }
      : { id: 'in', kind: 'punch_in', at: null, title: 'Punch-in is missing', missing: true });
  }
  d.visits.forEach((v, i) => {
    const problems = visitProblems(v);
    out.push({
      id: v.id, kind: 'visit', at: v.start, n: i + 1, verified: v.verified,
      title: `${outletName(v)}, ${v.start} to ${v.end}`,
      detail: v.verified
        ? `Verified: ${v.distanceFromOutletM} m from the outlet, photo taken, ${toMin(v.end) - toMin(v.start)} minutes on site.`
        : `Not verified: ${problems.join('; ') || 'one of the three conditions failed'}.`,
    });
  });
  if (d.punch) {
    out.push(d.punch.out
      ? { id: 'out', kind: 'punch_out', at: d.punch.out, title: 'Punched out' }
      : { id: 'out', kind: 'punch_out', at: null, title: 'Punch-out is missing', missing: true });
  }
  // Time order; a missing punch-in stays first and a missing punch-out last.
  const rank = (e: TimelineEntry): number => (e.at != null ? toMin(e.at) : e.kind === 'punch_in' ? -1 : 24 * 60 + 1);
  return out.sort((a, b) => rank(a) - rank(b));
}

// ───────────────────────────── the team calendar ─────────────────────────────
export type DayStatus = 'present' | 'regularised' | 'missed' | 'info' | 'rejected' | 'absent' | 'off' | 'upcoming';

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  present: 'Present, both punches', regularised: 'Regularised, approved', missed: 'Missed punch, waiting for a decision', info: 'More information asked',
  rejected: 'Rejected', absent: 'Absent, no record', off: 'Sunday or holiday', upcoming: 'Not in the evidence yet',
};
export const DAY_STATUS_GLYPH: Record<DayStatus, string> = { present: 'P', regularised: 'R', missed: '!', info: '?', rejected: 'X', absent: 'A', off: '–', upcoming: '' };

export function monthDates(month: Month): ISODate[] {
  const out: ISODate[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) out.push(d);
  return out;
}

export function dayStatus(ev: FieldEvidence, regs: Record<string, RegDecision>, employeeId: Id, date: ISODate): { status: DayStatus; label: string; candidate: RegularisationSuggestion | null } {
  const mk = (status: DayStatus, label = DAY_STATUS_LABEL[status], candidate: RegularisationSuggestion | null = null) => ({ status, label, candidate });
  if (date < ev.from || date > ev.to) return mk('upcoming');
  const punch = ev.punches.find((p) => p.employeeId === employeeId && p.date === date);
  const sunday = weekdayOf(date) === 0;
  if (!punch) {
    if (ev.holidays.includes(date)) return mk('off', 'Holiday');
    if (sunday) return mk('off', 'Sunday');
    return mk('absent');
  }
  if (punch.in && punch.out) return mk('present', sunday ? 'Present, worked on a Sunday' : DAY_STATUS_LABEL.present);
  const candidate = regularisationFor(ev, employeeId, date);
  const dec = regs[regKey(employeeId, date)];
  if (dec?.status === 'approved') return mk('regularised', DAY_STATUS_LABEL.regularised, candidate);
  if (dec?.status === 'rejected') return mk('rejected', DAY_STATUS_LABEL.rejected, candidate);
  if (dec?.status === 'info_requested') return mk('info', DAY_STATUS_LABEL.info, candidate);
  return mk('missed', DAY_STATUS_LABEL.missed, candidate);
}

export function monthCounts(ev: FieldEvidence, regs: Record<string, RegDecision>, month: Month): Record<DayStatus, number> {
  const c: Record<DayStatus, number> = { present: 0, regularised: 0, missed: 0, info: 0, rejected: 0, absent: 0, off: 0, upcoming: 0 };
  for (const r of ev.reps) for (const date of monthDates(month)) c[dayStatus(ev, regs, r.employeeId, date).status]++;
  return c;
}

/** Short description of the evidence on a day for the detail header. */
export function evidenceSummary(ev: FieldEvidence, employeeId: Id, date: ISODate): { visits: number; verified: number; spanMin: number; trailKm: number; punchIn?: string; punchOut?: string; first?: string; last?: string } {
  const d = dayEvidence(ev, employeeId, date);
  return { visits: d.visits.length, verified: d.verifiedVisits.length, spanMin: d.spanMin, trailKm: d.trailKm, punchIn: d.punch?.in, punchOut: d.punch?.out, first: d.firstVisitStart, last: d.lastVisitEnd };
}


/** The three parts of the auto-approve rule, each with what the day had and whether it was enough. */
export function ruleChecks(evidence: RegularisationSuggestion['evidence']): { label: string; actual: string; needed: string; met: boolean }[] {
  const P = REGULARISATION_POLICY;
  return [
    { label: 'Verified visits', actual: String(evidence.verifiedVisits), needed: `at least ${P.minVerifiedVisits}`, met: evidence.verifiedVisits >= P.minVerifiedVisits },
    { label: 'First to last verified visit', actual: evidence.spanMin ? spanText(evidence.spanMin) : 'none', needed: `at least ${P.minSpanMin / 60}h`, met: evidence.spanMin >= P.minSpanMin },
    { label: 'Movement on the GPS trail', actual: `${evidence.trailKm.toFixed(1)} km`, needed: `at least ${P.minTrailKm} km`, met: evidence.trailKm >= P.minTrailKm },
  ];
}
