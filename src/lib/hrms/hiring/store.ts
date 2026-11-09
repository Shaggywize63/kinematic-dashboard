'use client';
// The Talent area store and every action that changes it. Pages read `hiringStore.use()` and call these functions only.
// Each action re-checks its rules (stage moves, approved headcount, review locking, minimum group sizes) so the UI cannot
// bypass them. Converting a candidate also writes to the core database, through the same lifecycle action the Lifecycle page uses.

import { createAreaStore } from '../areaStore';
import { getDb } from '../db';
import { ACTOR, updateEmployee } from '../actions';
import { startOnboarding } from '../lifecycleActions';
import { PREVIEW_TODAY } from '../seed';
import { addDays, diffDays, fmtMonth } from '../format';
import { monthEnd } from '../rules';
import { checkEmail, checkMobile } from '../validators';
import { uid } from '../types';
import type { Gender, HrmsDb } from '../types';
import { makeHiringSeed } from './seed';
import type {
  Candidate, CompetencyRating, Goal, HiringState, Id, ISODate, Month, Offer, Opening, PlanLine, RejectCode, Review, ReviewForm, Role, Scenario, Source, Stage,
} from './types';
import { FY_END, headcountOn, headcountRoom, isLive, seatsLeft, validateOffer, validateOpening, validateScenario, validateScorecard, canMove, type RoomCheck } from './engines';
import {
  applyDraft, applyMove, applyProgress, submitReviewForm, validateFeedbackRequest, validateGoal,
} from './perfEngines';
import { PERF_COMPETENCIES } from './types';

export const hiringStore = createAreaStore<HiringState>('hiring', 1, makeHiringSeed);

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });
const today = (): ISODate => PREVIEW_TODAY;

// ═════════════════════════════ helpers for the screens ═════════════════════════════
/** The approved-headcount check for one opening, with the names filled in. */
export function openingRoom(state: HiringState, db: HrmsDb, o: Opening): RoomCheck {
  return headcountRoom(
    o,
    { plan: state.plan, employees: db.employees, openings: state.openings, fyEnd: FY_END },
    {
      department: db.departments.find((d) => d.id === o.departmentId)?.name ?? 'this department',
      location: db.locations.find((l) => l.id === o.locationId)?.name ?? 'this location',
      fyEndLabel: fmtMonth(FY_END),
    },
  );
}

// ═════════════════════════════ openings ═════════════════════════════
export interface OpeningInput {
  id?: Id; title: string; departmentId: Id; locationId: Id; designationId: Id; headcount: number; bandMin: number; bandMax: number; hiringManagerId: Id;
}

export function saveOpening(input: OpeningInput): Result<Id> {
  const state = hiringStore.get();
  const db = getDb();
  const existing = input.id ? state.openings.find((o) => o.id === input.id) : undefined;
  if (input.id && !existing) return fail('That opening no longer exists.');
  if (existing?.status === 'filled') return fail('A filled opening cannot be edited.');
  const errs = validateOpening({ ...input, filled: existing?.filled ?? 0 }).errors;
  if (errs.length) return fail(errs[0]!);
  const id = existing?.id ?? uid('open');
  const next: Opening = existing
    ? { ...existing, ...pick(input) }
    : { id, ...pick(input), filled: 0, status: 'draft', createdOn: today(), approvals: [] };
  // A live opening cannot grow past what the plan approves.
  if (existing && isLive(existing)) {
    const room = openingRoom(state, db, next);
    if (!room.ok) return fail(room.message);
  }
  hiringStore.mutate((d) => {
    const i = d.openings.findIndex((o) => o.id === id);
    if (i >= 0) d.openings[i] = next; else d.openings.push(next);
  });
  return ok(id);
}
const pick = (i: OpeningInput) => ({ title: i.title.trim(), departmentId: i.departmentId, locationId: i.locationId, designationId: i.designationId, headcount: i.headcount, bandMin: i.bandMin, bandMax: i.bandMax, hiringManagerId: i.hiringManagerId });

export function deleteOpening(id: Id): Result {
  const s = hiringStore.get();
  const o = s.openings.find((x) => x.id === id);
  if (!o) return fail('That opening no longer exists.');
  if (o.status !== 'draft') return fail('Only a draft can be deleted. Put a live opening on hold instead.');
  if (s.candidates.some((c) => c.openingId === id)) return fail('This opening has candidates, so it cannot be deleted.');
  hiringStore.mutate((d) => { d.openings = d.openings.filter((x) => x.id !== id); });
  return ok(undefined);
}

export function submitOpening(id: Id, note?: string): Result {
  const o = hiringStore.get().openings.find((x) => x.id === id);
  if (!o) return fail('That opening no longer exists.');
  if (o.status !== 'draft') return fail('Only a draft can be sent for approval.');
  const errs = validateOpening(o).errors;
  if (errs.length) return fail(errs[0]!);
  hiringStore.mutate((d) => {
    const x = d.openings.find((y) => y.id === id)!;
    x.status = 'pending_approval';
    x.approvals.push({ id: uid('ap'), decision: 'submitted', by: ACTOR, on: today(), note: note?.trim() || undefined });
  });
  return ok(undefined);
}

/** HR approves or rejects. Approving goes live, and is refused when the plan does not approve that many seats. */
export function decideOpening(id: Id, decision: 'approve' | 'reject', note: string): Result {
  const state = hiringStore.get();
  const o = state.openings.find((x) => x.id === id);
  if (!o) return fail('That opening no longer exists.');
  if (o.status !== 'pending_approval') return fail('This opening is not waiting for approval.');
  if (decision === 'reject') {
    if (note.trim().length < 5) return fail('Say why you are rejecting it, in a few words. The hiring manager will see this.');
  } else {
    const room = openingRoom(state, getDb(), o);
    if (!room.ok) return fail(`Cannot go live. ${room.message}`);
  }
  hiringStore.mutate((d) => {
    const x = d.openings.find((y) => y.id === id)!;
    if (decision === 'approve') { x.status = 'open'; x.openedOn = today(); }
    else x.status = 'draft';
    x.approvals.push({ id: uid('ap'), decision: decision === 'approve' ? 'approved' : 'rejected', by: ACTOR, on: today(), note: note.trim() || undefined });
  });
  return ok(undefined);
}

export function holdOpening(id: Id, reason: string): Result {
  const o = hiringStore.get().openings.find((x) => x.id === id);
  if (!o) return fail('That opening no longer exists.');
  if (o.status !== 'open') return fail('Only an open opening can be put on hold.');
  if (reason.trim().length < 5) return fail('Give a reason for the hold, in a few words.');
  hiringStore.mutate((d) => {
    const x = d.openings.find((y) => y.id === id)!;
    x.status = 'on_hold'; x.holdReason = reason.trim();
    x.approvals.push({ id: uid('ap'), decision: 'held', by: ACTOR, on: today(), note: reason.trim() });
  });
  return ok(undefined);
}
export function resumeOpening(id: Id): Result {
  const state = hiringStore.get();
  const o = state.openings.find((x) => x.id === id);
  if (!o) return fail('That opening no longer exists.');
  if (o.status !== 'on_hold') return fail('This opening is not on hold.');
  const room = openingRoom(state, getDb(), o);
  if (!room.ok) return fail(`Cannot resume. ${room.message}`);
  hiringStore.mutate((d) => {
    const x = d.openings.find((y) => y.id === id)!;
    x.status = 'open'; x.holdReason = undefined;
    x.approvals.push({ id: uid('ap'), decision: 'resumed', by: ACTOR, on: today() });
  });
  return ok(undefined);
}

// ═════════════════════════════ candidates ═════════════════════════════
export interface CandidateInput { openingId: Id; name: string; email: string; mobile: string; source: Source; experienceYears: number; expectedCtc: number; noticeDays: number }

export function addCandidate(i: CandidateInput): Result<Id> {
  const state = hiringStore.get();
  const o = state.openings.find((x) => x.id === i.openingId);
  if (!o) return fail('Choose an opening.');
  if (o.status !== 'open') return fail(o.status === 'on_hold' ? 'This opening is on hold. Resume it before adding candidates.' : 'Candidates can be added only to an open opening.');
  const name = i.name.trim().replace(/\s+/g, ' ');
  if (name.split(' ').length < 2 || !/^[A-Za-z][A-Za-z .'-]*$/.test(name)) return fail('Enter the first and last name, letters only.');
  const em = checkEmail(i.email); if (!em.ok) return fail(em.message);
  const mo = checkMobile(i.mobile); if (!mo.ok) return fail(mo.message);
  if (state.candidates.some((c) => c.openingId === i.openingId && c.email.toLowerCase() === i.email.trim().toLowerCase())) return fail('This email is already on this opening.');
  if (!(i.experienceYears >= 0 && i.experienceYears <= 50)) return fail('Experience is 0 to 50 years.');
  if (!(i.expectedCtc > 0)) return fail('Enter the expected annual CTC in rupees.');
  if (!(i.noticeDays >= 0 && i.noticeDays <= 180)) return fail('Notice period is 0 to 180 days.');
  const id = uid('cand');
  const c: Candidate = {
    id, openingId: i.openingId, name, email: i.email.trim(), mobile: i.mobile.replace(/[\s-]/g, '').replace(/^\+?91/, ''), source: i.source, appliedOn: today(),
    experienceYears: i.experienceYears, expectedCtc: i.expectedCtc, noticeDays: i.noticeDays, stage: 'applied', notes: '',
    history: [{ from: null, to: 'applied', on: today(), by: ACTOR }], scorecards: [],
  };
  hiringStore.mutate((d) => { d.candidates.push(c); });
  return ok(id);
}

export function moveCandidate(id: Id, to: Stage, reason?: RejectCode, note?: string): Result {
  const c = hiringStore.get().candidates.find((x) => x.id === id);
  if (!c) return fail('That candidate no longer exists.');
  const chk = canMove(c, to);
  if (!chk.ok) return fail(chk.reason ?? 'That move is not allowed.');
  if (to === 'rejected' && !reason) return fail('Choose a reason code before rejecting. It keeps the process fair and reviewable.');
  hiringStore.mutate((d) => {
    const x = d.candidates.find((y) => y.id === id)!;
    x.history.push({ from: x.stage, to, on: today(), by: ACTOR, reason: to === 'rejected' ? reason : undefined, note: note?.trim() || undefined });
    x.stage = to;
    x.rejectReason = to === 'rejected' ? reason : undefined;
  });
  return ok(undefined);
}

export function setCandidateNotes(id: Id, notes: string): Result {
  if (!hiringStore.get().candidates.some((x) => x.id === id)) return fail('That candidate no longer exists.');
  hiringStore.mutate((d) => { d.candidates.find((y) => y.id === id)!.notes = notes; });
  return ok(undefined);
}

export function addScorecard(candidateId: Id, input: { round: string; interviewerId: Id; ratings: CompetencyRating[]; summary?: string }): Result {
  const c = hiringStore.get().candidates.find((x) => x.id === candidateId);
  if (!c) return fail('That candidate no longer exists.');
  if (c.convertedEmployeeId) return fail('This person is already an employee.');
  const errs = validateScorecard(input);
  if (errs.length) return fail(errs[0]!);
  hiringStore.mutate((d) => {
    d.candidates.find((y) => y.id === candidateId)!.scorecards.push({
      id: uid('sc'), round: input.round, interviewerId: input.interviewerId, on: today(),
      ratings: input.ratings.map((r) => ({ competency: r.competency, rating: r.rating, comment: r.comment?.trim() || undefined })), summary: input.summary?.trim() || undefined,
    });
  });
  return ok(undefined);
}
export function removeScorecard(candidateId: Id, scorecardId: Id): Result {
  hiringStore.mutate((d) => { const c = d.candidates.find((y) => y.id === candidateId); if (c) c.scorecards = c.scorecards.filter((s) => s.id !== scorecardId); });
  return ok(undefined);
}

// ── offers ──
export function saveOffer(candidateId: Id, input: { ctc: number; joiningDate: ISODate; structureId: Id }): Result {
  const state = hiringStore.get();
  const c = state.candidates.find((x) => x.id === candidateId);
  if (!c) return fail('That candidate no longer exists.');
  if (c.offer && (c.offer.status === 'accepted' || c.offer.status === 'declined')) return fail('This offer is closed, so it cannot be changed.');
  if (c.stage === 'rejected') return fail('Reopen the candidate before making an offer.');
  const o = state.openings.find((x) => x.id === c.openingId);
  const v = validateOffer(input, o, today());
  if (v.errors.length) return fail(v.errors[0]!);
  hiringStore.mutate((d) => {
    const x = d.candidates.find((y) => y.id === candidateId)!;
    x.offer = { ctc: Math.round(input.ctc), joiningDate: input.joiningDate, structureId: input.structureId, status: 'draft' };
  });
  return ok(undefined);
}
/** SIMULATION: marks the offer as extended. No letter, e-mail or e-signature is sent by this preview. */
export function extendOffer(candidateId: Id): Result {
  const c = hiringStore.get().candidates.find((x) => x.id === candidateId);
  if (!c?.offer) return fail('Save the offer first.');
  if (c.offer.status !== 'draft') return fail('This offer is already extended.');
  hiringStore.mutate((d) => {
    const x = d.candidates.find((y) => y.id === candidateId)!;
    x.offer!.status = 'extended'; x.offer!.extendedOn = today();
    if (x.stage !== 'offer') { x.history.push({ from: x.stage, to: 'offer', on: today(), by: ACTOR }); x.stage = 'offer'; x.rejectReason = undefined; }
  });
  return ok(undefined);
}
export function decideOffer(candidateId: Id, decision: 'accepted' | 'declined'): Result {
  const c = hiringStore.get().candidates.find((x) => x.id === candidateId);
  if (!c?.offer || c.offer.status !== 'extended') return fail('Only an extended offer can be accepted or declined.');
  hiringStore.mutate((d) => {
    const x = d.candidates.find((y) => y.id === candidateId)!;
    x.offer!.status = decision; x.offer!.decidedOn = today();
    if (decision === 'accepted') {
      x.history.push({ from: x.stage, to: 'hired', on: today(), by: ACTOR, note: 'Offer accepted' });
      x.stage = 'hired';
    } else {
      x.history.push({ from: x.stage, to: 'rejected', on: today(), by: ACTOR, reason: 'withdrew', note: 'Offer declined by the candidate' });
      x.stage = 'rejected'; x.rejectReason = 'withdrew';
    }
  });
  return ok(undefined);
}

export interface ConvertInput { dob: ISODate; gender: Gender }
/**
 * Accepted offer to employee. Creates the employee (status onboarding) and the joining checklist through startOnboarding, the
 * same call the Lifecycle page's New joiner uses, then sets the salary structure and CTC from the offer and fills one seat.
 */
export function convertToEmployee(candidateId: Id, input: ConvertInput): Result<{ employeeId: Id; onboardingId: Id }> {
  const state = hiringStore.get();
  const db = getDb();
  const c = state.candidates.find((x) => x.id === candidateId);
  if (!c) return fail('That candidate no longer exists.');
  if (c.convertedEmployeeId) return fail('Already converted to an employee.');
  if (c.stage !== 'hired' || c.offer?.status !== 'accepted') return fail('Only a candidate with an accepted offer can be converted.');
  const o = state.openings.find((x) => x.id === c.openingId);
  if (!o) return fail('The opening no longer exists.');
  if (seatsLeft(o) < 1) return fail('Every seat on this opening is already filled.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dob)) return fail('Enter the date of birth.');
  if (input.dob >= today()) return fail('Date of birth must be in the past.');
  if (diffDays(input.dob, c.offer.joiningDate) < 15 * 365) return fail('The person must be at least 15 on the joining date.');
  if (diffDays(input.dob, today()) > 100 * 366) return fail('Check the year of birth.');
  if (!['male', 'female', 'other'].includes(input.gender)) return fail('Choose a gender for the employee record.');
  if (db.employees.some((e) => e.email.toLowerCase() === c.email.toLowerCase())) return fail('An employee with this email already exists.');
  const parts = c.name.split(' ');
  try {
    const { employee, onboarding } = startOnboarding({
      firstName: parts[0]!, lastName: parts.slice(1).join(' '), gender: input.gender, dob: input.dob, email: c.email, mobile: c.mobile,
      locationId: o.locationId, departmentId: o.departmentId, designationId: o.designationId, employmentType: 'permanent', joinDate: c.offer.joiningDate,
      probationMonths: 6, noticeDays: 30, annualCtc: c.offer.ctc,
    });
    updateEmployee(employee.id, { structureId: c.offer.structureId, annualCtc: c.offer.ctc });
    hiringStore.mutate((d) => {
      d.candidates.find((y) => y.id === candidateId)!.convertedEmployeeId = employee.id;
      const x = d.openings.find((y) => y.id === o.id)!;
      x.filled += 1;
      if (x.filled >= x.headcount) {
        x.status = 'filled'; x.closedOn = today(); x.holdReason = undefined;
        x.approvals.push({ id: uid('ap'), decision: 'filled', by: ACTOR, on: today(), note: `${c.name} joined the last seat.` });
      }
    });
    return ok({ employeeId: employee.id, onboardingId: onboarding.id });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not create the employee.');
  }
}

// ═════════════════════════════ workforce plan ═════════════════════════════
export function savePlanCells(changes: { lineId: string; month: Month; value: number }[]): Result {
  if (changes.some((c) => !Number.isInteger(c.value) || c.value < 0 || c.value > 999)) return fail('Planned headcount is a whole number from 0 to 999.');
  hiringStore.mutate((d) => {
    for (const ch of changes) { const l = d.plan.lines.find((x) => x.id === ch.lineId); if (l) l.months[ch.month] = ch.value; }
  });
  return ok(undefined);
}
export function addPlanLine(departmentId: Id, locationId: Id): Result<string> {
  const s = hiringStore.get();
  const id = `${departmentId}|${locationId}`;
  if (s.plan.lines.some((l) => l.id === id)) return fail('The plan already has a line for this department and location.');
  const db = getDb();
  // Start from the people who are there or joining, so a new line does not begin as a gap.
  const months: Record<Month, number> = {};
  for (const m of Object.keys(s.plan.lines[0]?.months ?? {})) months[m] = headcountOn(db.employees, monthEnd(m), { departmentId, locationId }, true);
  const line: PlanLine = { id, departmentId, locationId, months };
  hiringStore.mutate((d) => { d.plan.lines.push(line); });
  return ok(id);
}
export function setAvgCtc(departmentId: Id, value: number): Result {
  if (!(value >= 100_000 && value <= 20_000_000)) return fail('Average CTC: between ₹1 lakh and ₹2 crore a year.');
  hiringStore.mutate((d) => { d.plan.avgCtc[departmentId] = Math.round(value); });
  return ok(undefined);
}
export function setOpenStartMonth(m: Month): void { hiringStore.mutate((d) => { d.openStartMonth = m; }); }

export function saveScenario(input: Omit<Scenario, 'id' | 'builtIn'> & { id?: Id }): Result<Id> {
  const errs = validateScenario(input);
  if (errs.length) return fail(errs[0]!);
  const s = hiringStore.get();
  const existing = input.id ? s.scenarios.find((x) => x.id === input.id) : undefined;
  const id = existing?.id ?? uid('scn');
  const next: Scenario = { id, builtIn: existing?.builtIn ?? false, name: input.name.trim(), hiresPerMonth: input.hiresPerMonth, attritionPct: input.attritionPct, avgCtc: Math.round(input.avgCtc), note: input.note?.trim() || undefined };
  hiringStore.mutate((d) => { const i = d.scenarios.findIndex((x) => x.id === id); if (i >= 0) d.scenarios[i] = next; else d.scenarios.push(next); });
  return ok(id);
}
export function deleteScenario(id: Id): Result {
  const x = hiringStore.get().scenarios.find((y) => y.id === id);
  if (!x) return fail('That scenario no longer exists.');
  if (x.builtIn) return fail('The three starting scenarios stay. Edit their numbers instead.');
  hiringStore.mutate((d) => { d.scenarios = d.scenarios.filter((y) => y.id !== id); });
  return ok(undefined);
}

// ═════════════════════════════ performance: cycle and goals ═════════════════════════════
/** Saves the dates of every stage together, so stages can be moved past each other in one go. Stages must run in order without overlap. */
export function saveCycleDates(dates: Record<string, { start: ISODate; end: ISODate }>): Result {
  const stages = hiringStore.get().cycle.stages;
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]!;
    const d = dates[s.key];
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.start) || !/^\d{4}-\d{2}-\d{2}$/.test(d.end)) return fail(`Choose both dates for ${s.label}.`);
    if (d.end < d.start) return fail(`${s.label}: the end date cannot be before the start date.`);
    const prev = stages[i - 1];
    if (prev && d.start < dates[prev.key]!.end) return fail(`${s.label} cannot start before ${prev.label} ends.`);
  }
  hiringStore.mutate((d) => { for (const s of d.cycle.stages) { s.start = dates[s.key]!.start; s.end = dates[s.key]!.end; } });
  return ok(undefined);
}
/** SIMULATION: records that a reminder was meant to go out. This preview sends no e-mail or message. */
export function logReminder(departmentId?: Id): void {
  hiringStore.mutate((d) => { d.cycle.reminders.unshift({ on: today(), departmentId, by: ACTOR }); });
}

export function saveGoal(input: Omit<Goal, 'id' | 'updates'> & { id?: Id }): Result<Id> {
  const errs = validateGoal(input);
  if (errs.length) return fail(errs[0]!);
  const s = hiringStore.get();
  const existing = input.id ? s.goals.find((g) => g.id === input.id) : undefined;
  const id = existing?.id ?? uid('goal');
  const next: Goal = {
    id, employeeId: input.employeeId, title: input.title.trim(), weight: input.weight, startDate: input.startDate, dueDate: input.dueDate, note: input.note?.trim() || undefined,
    keyResults: input.keyResults.map((k) => ({ ...k, id: k.id || uid('kr'), title: k.title.trim() })), updates: existing?.updates ?? [],
  };
  hiringStore.mutate((d) => { const i = d.goals.findIndex((g) => g.id === id); if (i >= 0) d.goals[i] = next; else d.goals.push(next); });
  return ok(id);
}
export function deleteGoal(id: Id): Result {
  hiringStore.mutate((d) => { d.goals = d.goals.filter((g) => g.id !== id); });
  return ok(undefined);
}
export function addProgress(goalId: Id, krId: Id, value: number, comment: string): Result {
  const g = hiringStore.get().goals.find((x) => x.id === goalId);
  if (!g) return fail('That goal no longer exists.');
  const r = applyProgress(g, krId, value, comment, today(), ACTOR, uid('up'));
  if (!r.ok) return fail(r.error);
  hiringStore.mutate((d) => { const i = d.goals.findIndex((x) => x.id === goalId); d.goals[i] = r.goal; });
  return ok(undefined);
}

// ═════════════════════════════ performance: reviews ═════════════════════════════
function withReview(id: Id, fn: (r: Review) => Result<Review>): Result {
  const r = hiringStore.get().reviews.find((x) => x.id === id);
  if (!r) return fail('That review no longer exists.');
  const out = fn(r);
  if (!out.ok) return out as Result;
  const next = out.value;
  hiringStore.mutate((d) => { const i = d.reviews.findIndex((x) => x.id === id); d.reviews[i] = next; });
  return ok(undefined);
}
const wrap = (x: { ok: true; review: Review } | { ok: false; error: string }): Result<Review> => (x.ok ? ok(x.review) : fail(x.error));

export function saveReviewDraft(id: Id, which: 'self' | 'manager', role: Role, patch: Partial<Pick<ReviewForm, 'ratings' | 'strengths' | 'development' | 'overall'>>): Result {
  return withReview(id, (r) => wrap(applyDraft(r, which, role, patch)));
}
export function submitReview(id: Id, which: 'self' | 'manager', role: Role): Result {
  return withReview(id, (r) => wrap(submitReviewForm(r, which, role, today())));
}

export function requestFeedback(reviewId: Id, reviewerIds: Id[]): Result {
  return withReview(reviewId, (r) => {
    const fresh = reviewerIds.filter((x) => !r.feedback.some((f) => f.reviewerId === x));
    const err = validateFeedbackRequest(r.feedback, fresh, r.employeeId);
    if (err) return fail(err);
    return ok({ ...r, feedback: [...r.feedback, ...fresh.map((reviewerId) => ({ id: uid('fb'), reviewerId, requestedOn: today(), status: 'requested' as const }))] });
  });
}
/** SIMULATION of the peer's own screen: in the real product each peer answers from their own login. */
export function respondFeedback(reviewId: Id, requestId: Id, ratings: Record<string, number>, comment: string): Result {
  return withReview(reviewId, (r) => {
    const req = r.feedback.find((f) => f.id === requestId);
    if (!req) return fail('That request no longer exists.');
    if (req.status === 'submitted') return fail('This feedback is already submitted and locked.');
    const missing = PERF_COMPETENCIES.filter((c) => !(ratings[c] >= 1 && ratings[c] <= 5));
    if (missing.length) return fail(`Rate every competency (${missing.join(', ')} not rated).`);
    return ok({ ...r, feedback: r.feedback.map((f) => (f.id === requestId ? { ...f, status: 'submitted' as const, ratings, comment: comment.trim() || undefined, submittedOn: today() } : f)) });
  });
}

export function moveRating(reviewId: Id, to: number, reason: string): Result {
  return withReview(reviewId, (r) => wrap(applyMove(r, to, reason, ACTOR, today(), uid('mv'))));
}

// ═════════════════════════════ 1:1s ═════════════════════════════
function withThread(id: Id, fn: (t: HiringState['threads'][number]) => void): Result {
  if (!hiringStore.get().threads.some((t) => t.id === id)) return fail('That 1:1 no longer exists.');
  hiringStore.mutate((d) => { fn(d.threads.find((t) => t.id === id)!); });
  return ok(undefined);
}
export function addNote(threadId: Id, authorRole: 'manager' | 'report', text: string, isPrivate: boolean): Result {
  if (!text.trim()) return fail('Write the note first.');
  return withThread(threadId, (t) => { t.notes.unshift({ id: uid('n'), on: today(), authorRole, text: text.trim(), private: isPrivate }); });
}
export function addActionItem(threadId: Id, input: { text: string; owner: 'manager' | 'report'; due?: ISODate }): Result {
  if (!input.text.trim()) return fail('Write the action first.');
  return withThread(threadId, (t) => { t.actions.push({ id: uid('a'), text: input.text.trim(), owner: input.owner, due: input.due || undefined, status: 'open', createdOn: today() }); });
}
export function setActionStatus(threadId: Id, actionId: Id, status: 'open' | 'in_progress' | 'done'): Result {
  return withThread(threadId, (t) => { const a = t.actions.find((x) => x.id === actionId); if (a) a.status = status; });
}
export function setNextOn(threadId: Id, date: ISODate): Result {
  if (date && date < today()) return fail('The next 1:1 cannot be in the past.');
  return withThread(threadId, (t) => { t.nextOn = date || undefined; });
}
export function startThread(managerId: Id, reportId: Id, cadence: 'weekly' | 'fortnightly' | 'monthly'): Result<Id> {
  if (managerId === reportId) return fail('A person cannot hold a 1:1 with themselves.');
  if (hiringStore.get().threads.some((t) => t.managerId === managerId && t.reportId === reportId)) return fail('These two already have a 1:1 thread.');
  const id = uid('oo');
  hiringStore.mutate((d) => { d.threads.push({ id, managerId, reportId, cadence, nextOn: addDays(today(), cadence === 'weekly' ? 7 : cadence === 'fortnightly' ? 14 : 30), notes: [], actions: [] }); });
  return ok(id);
}
