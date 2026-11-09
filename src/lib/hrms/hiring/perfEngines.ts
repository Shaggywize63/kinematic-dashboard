// Pure logic for Performance: goals, reviews, 360 feedback, calibration, 1:1s. No React, no storage, no clock.
// Two rules are enforced here (and the store only calls these functions), so the screen cannot bypass them:
//   - the employee sees what the manager wrote only after the manager submits;
//   - nothing about a person's rating is shown to a group smaller than five, and 360 answers appear only at three or more.
// Ratings never change pay. Nothing in this file touches compensation.

import type { ActionItem, CalibrationMove, CycleStage, FeedbackRequest, Goal, Id, ISODate, KeyResult, OneNote, ProgressUpdate, Review, ReviewForm, Role } from './types';
import { PERF_COMPETENCIES } from './types';
import { diffDays } from '../format';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

export const MIN_TEAM = 5;        // smallest group whose rating distribution may be shown
export const MIN_FEEDBACK = 3;    // 360 answers are shown only when at least this many people have responded

// ═════════════════════════════ goals ═════════════════════════════
/** Progress of one key result, 0 to 100. Works for "lower is better" too, because start and target carry the direction. */
export function krProgress(kr: Pick<KeyResult, 'start' | 'target' | 'current'>): number {
  const span = kr.target - kr.start;
  if (span === 0) return kr.current >= kr.target ? 100 : 0;
  return r1(clamp(((kr.current - kr.start) / span) * 100, 0, 100));
}
/** Weighted average of the key results. */
export function goalProgress(g: Pick<Goal, 'keyResults'>): number {
  const total = g.keyResults.reduce((s, k) => s + k.weight, 0);
  if (!total) return 0;
  return r1(g.keyResults.reduce((s, k) => s + krProgress(k) * k.weight, 0) / total);
}
/** Share of the goal's period that has passed on `today`, 0 to 100. */
export function timeElapsed(g: Pick<Goal, 'startDate' | 'dueDate'>, today: ISODate): number {
  const span = diffDays(g.startDate, g.dueDate);
  if (span <= 0) return today >= g.dueDate ? 100 : 0;
  return r1(clamp((diffDays(g.startDate, today) / span) * 100, 0, 100));
}

export type GoalStatus = 'done' | 'on_track' | 'at_risk' | 'behind' | 'not_started';
export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = { done: 'Done', on_track: 'On track', at_risk: 'At risk', behind: 'Behind', not_started: 'Not started' };
/** Gap in points between progress and time elapsed that moves a goal from on track to at risk, and from at risk to behind. */
export const STATUS_BANDS = { atRisk: 10, behind: 25 };

export function statusFor(progress: number, elapsed: number): GoalStatus {
  if (progress >= 100) return 'done';
  const gap = elapsed - progress;       // positive = behind the clock
  if (gap > STATUS_BANDS.behind) return 'behind';
  if (gap > STATUS_BANDS.atRisk) return 'at_risk';
  return 'on_track';
}
export function goalStatus(g: Goal, today: ISODate): { progress: number; elapsed: number; status: GoalStatus } {
  const progress = goalProgress(g);
  if (today < g.startDate) return { progress, elapsed: 0, status: 'not_started' };
  const elapsed = timeElapsed(g, today);
  return { progress, elapsed, status: statusFor(progress, elapsed) };
}

/** A person's overall progress across their goals, weighted by goal weight. */
export function personProgress(goals: Goal[]): number {
  const total = goals.reduce((s, g) => s + g.weight, 0);
  if (!total) return 0;
  return r1(goals.reduce((s, g) => s + goalProgress(g) * g.weight, 0) / total);
}
export const weightTotal = (goals: Pick<Goal, 'weight'>[]): number => goals.reduce((s, g) => s + g.weight, 0);

export interface Rollup { managerId: Id; people: number; withGoals: number; progress: number; counts: Record<GoalStatus, number> }
/** Team roll-up: goals of everyone who reports to a manager, by status, with the average of their overall progress. */
export function teamRollups(goals: Goal[], reports: Record<Id, Id>, today: ISODate): Rollup[] {
  const byManager = new Map<Id, Id[]>();
  for (const [emp, mgr] of Object.entries(reports)) byManager.set(mgr, [...(byManager.get(mgr) ?? []), emp]);
  return [...byManager.entries()].map(([managerId, people]) => {
    const counts: Record<GoalStatus, number> = { done: 0, on_track: 0, at_risk: 0, behind: 0, not_started: 0 };
    const progresses: number[] = [];
    for (const p of people) {
      const gs = goals.filter((g) => g.employeeId === p);
      if (!gs.length) continue;
      progresses.push(personProgress(gs));
      for (const g of gs) counts[goalStatus(g, today).status] += 1;
    }
    return { managerId, people: people.length, withGoals: progresses.length, progress: progresses.length ? r1(progresses.reduce((s, x) => s + x, 0) / progresses.length) : 0, counts };
  }).sort((a, b) => b.people - a.people);
}

export function validateGoal(g: Pick<Goal, 'title' | 'weight' | 'startDate' | 'dueDate' | 'keyResults'>): string[] {
  const e: string[] = [];
  if (!g.title.trim()) e.push('Write the objective.');
  if (!Number.isFinite(g.weight) || g.weight < 1 || g.weight > 100) e.push('Weight is a number from 1 to 100.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(g.dueDate)) e.push('Choose a start and a due date.');
  else if (g.dueDate <= g.startDate) e.push('The due date must be after the start date.');
  if (g.keyResults.length === 0) e.push('Add at least one key result.');
  g.keyResults.forEach((k, i) => {
    const n = i + 1;
    if (!k.title.trim()) e.push(`Key result ${n}: write what will be measured.`);
    if (![k.start, k.target, k.current].every(Number.isFinite)) e.push(`Key result ${n}: start, target and current must be numbers.`);
    else if (k.start === k.target) e.push(`Key result ${n}: the target must differ from the start.`);
    if (!Number.isFinite(k.weight) || k.weight <= 0) e.push(`Key result ${n}: weight must be above zero.`);
  });
  return e;
}

/** Records a progress update: sets the key result's current value and keeps the comment. Returns a new goal. */
export function applyProgress(g: Goal, krId: Id, value: number, comment: string, on: ISODate, by: string, id: Id): { ok: true; goal: Goal } | { ok: false; error: string } {
  const kr = g.keyResults.find((k) => k.id === krId);
  if (!kr) return { ok: false, error: 'That key result no longer exists.' };
  if (!Number.isFinite(value)) return { ok: false, error: 'Enter the new value as a number.' };
  if (!comment.trim()) return { ok: false, error: 'Add a short comment so the number has context.' };
  const upd: ProgressUpdate = { id, krId, on, value, comment: comment.trim(), by };
  return { ok: true, goal: { ...g, keyResults: g.keyResults.map((k) => (k.id === krId ? { ...k, current: value } : k)), updates: [upd, ...g.updates] } };
}

// ═════════════════════════════ reviews: visibility and locking ═════════════════════════════
export const isSubmitted = (f: ReviewForm): boolean => !!f.submittedOn;

/** Who may read the self review: HR and the employee always; the manager once it is submitted. */
export function canSeeSelf(r: Review, role: Role): boolean {
  return role !== 'manager' || isSubmitted(r.self);
}
/** Who may read the manager's review: HR and the manager always; the employee only after the manager submits. */
export function canSeeManagerReview(r: Review, role: Role): boolean {
  return role !== 'employee' || isSubmitted(r.manager);
}
/** A form is editable only by its author and only until it is submitted. */
export function canEditForm(r: Review, which: 'self' | 'manager', role: Role): boolean {
  if (which === 'self') return role === 'employee' && !isSubmitted(r.self);
  return role === 'manager' && !isSubmitted(r.manager);
}

export function submitProblems(f: ReviewForm): string[] {
  const p: string[] = [];
  const missing = PERF_COMPETENCIES.filter((c) => !(f.ratings[c] >= 1 && f.ratings[c] <= 5));
  if (missing.length) p.push(`Rate every competency (${missing.join(', ')} not rated).`);
  if (!f.strengths.trim()) p.push('Write at least one strength.');
  if (!f.development.trim()) p.push('Write at least one area to develop.');
  if (!(f.overall != null && f.overall >= 1 && f.overall <= 5)) p.push('Choose the overall rating.');
  return p;
}

type FormResult = { ok: true; review: Review } | { ok: false; error: string };
export function applyDraft(r: Review, which: 'self' | 'manager', role: Role, patch: Partial<Pick<ReviewForm, 'ratings' | 'strengths' | 'development' | 'overall'>>): FormResult {
  if (!canEditForm(r, which, role)) return { ok: false, error: isSubmitted(r[which]) ? 'This review is submitted and locked.' : 'Only the author can edit this review.' };
  return { ok: true, review: { ...r, [which]: { ...r[which], ...patch, ratings: { ...r[which].ratings, ...(patch.ratings ?? {}) } } } };
}
export function submitReviewForm(r: Review, which: 'self' | 'manager', role: Role, on: ISODate): FormResult {
  if (!canEditForm(r, which, role)) return { ok: false, error: isSubmitted(r[which]) ? 'This review is already submitted.' : 'Only the author can submit this review.' };
  const problems = submitProblems(r[which]);
  if (problems.length) return { ok: false, error: problems.join(' ') };
  return { ok: true, review: { ...r, [which]: { ...r[which], submittedOn: on } } };
}

// ═════════════════════════════ 360 feedback ═════════════════════════════
export interface FeedbackSummary {
  requested: number; responded: number; visible: boolean; remaining: number;
  averages: { competency: string; average: number }[];
  comments: string[];
}
/** Anonymous aggregate. Below MIN_FEEDBACK responses nothing is returned but the counts, so a single answer can never be read. */
export function feedbackSummary(reqs: FeedbackRequest[]): FeedbackSummary {
  const done = reqs.filter((x) => x.status === 'submitted' && x.ratings);
  const visible = done.length >= MIN_FEEDBACK;
  const base = { requested: reqs.length, responded: done.length, visible, remaining: Math.max(0, MIN_FEEDBACK - done.length) };
  if (!visible) return { ...base, averages: [], comments: [] };
  const averages = PERF_COMPETENCIES.map((c) => {
    const vals = done.map((d) => d.ratings![c]).filter((v): v is number => typeof v === 'number');
    return { competency: c, average: vals.length ? r1(vals.reduce((s, v) => s + v, 0) / vals.length) : 0 };
  });
  // sorted by text, not by who answered first, so the order says nothing about the person
  const comments = done.map((d) => (d.comment ?? '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  return { ...base, averages, comments };
}
export function validateFeedbackRequest(existing: FeedbackRequest[], add: Id[], employeeId: Id): string | null {
  if (add.includes(employeeId)) return 'You cannot ask for feedback from the person being reviewed.';
  const total = new Set([...existing.map((x) => x.reviewerId), ...add]).size;
  if (add.length === 0) return 'Choose at least one person.';
  if (total < MIN_FEEDBACK) return `Ask at least ${MIN_FEEDBACK} people, so the answers can be shown without pointing at anyone.`;
  if (total > 8) return 'Ask 8 people at most.';
  return null;
}

// ═════════════════════════════ calibration ═════════════════════════════
/** The rating that stands: the last calibration move, otherwise the manager's submitted overall rating. */
export function finalRating(r: Review): number | undefined {
  if (r.moves.length) return r.moves[r.moves.length - 1]!.to;
  return isSubmitted(r.manager) ? r.manager.overall : undefined;
}
export function ratingDistribution(ratings: number[]): number[] {
  const out = [0, 0, 0, 0, 0];
  for (const x of ratings) if (x >= 1 && x <= 5) out[x - 1]! += 1;
  return out;
}
/** A distribution is shown only for a group of at least MIN_TEAM people, counting everyone in the group, rated or not. */
export const distributionVisible = (groupSize: number): boolean => groupSize >= MIN_TEAM;

export function validateMove(r: Review, to: number, reason: string): string | null {
  const current = finalRating(r);
  if (current == null) return 'The manager has not submitted a rating for this person yet.';
  if (!Number.isInteger(to) || to < 1 || to > 5) return 'Choose a rating from 1 to 5.';
  if (to === current) return 'That is already the rating.';
  if (reason.trim().length < 10) return 'Write the reason in a sentence (at least 10 characters). It is kept in the log.';
  return null;
}
export function applyMove(r: Review, to: number, reason: string, by: string, on: ISODate, id: Id): { ok: true; review: Review } | { ok: false; error: string } {
  const err = validateMove(r, to, reason);
  if (err) return { ok: false, error: err };
  const move: CalibrationMove = { id, from: finalRating(r)!, to, reason: reason.trim(), by, on };
  return { ok: true, review: { ...r, moves: [...r.moves, move] } };
}

// ═════════════════════════════ cycle ═════════════════════════════
export type StageState = 'done' | 'in_progress' | 'upcoming';
export function stageState(s: Pick<CycleStage, 'start' | 'end'>, today: ISODate): StageState {
  if (today > s.end) return 'done';
  if (today >= s.start) return 'in_progress';
  return 'upcoming';
}
export interface Completion { total: number; self: number; manager: number }
export function completion(reviews: Review[]): Completion {
  return { total: reviews.length, self: reviews.filter((r) => isSubmitted(r.self)).length, manager: reviews.filter((r) => isSubmitted(r.manager)).length };
}

// ═════════════════════════════ 1:1s ═════════════════════════════
/** Private notes are for their author alone. HR sees shared notes only, and is told how many private ones exist. */
export function visibleNotes(notes: OneNote[], role: Role): OneNote[] {
  return notes.filter((n) => !n.private || (role === 'manager' && n.authorRole === 'manager') || (role === 'employee' && n.authorRole === 'report'));
}
export const hiddenNoteCount = (notes: OneNote[], role: Role): number => notes.length - visibleNotes(notes, role).length;
export const isOverdue = (a: ActionItem, today: ISODate): boolean => a.status !== 'done' && !!a.due && a.due < today;
