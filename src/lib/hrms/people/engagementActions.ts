'use client';
// Changes to engagement data: pulses, anonymous responses, recognition and exit interviews.

import { ACTOR, employeeName, logAccess } from '../actions';
import { addDays } from '../format';
import { PREVIEW_TODAY } from '../seed';
import type { Id } from '../types';
import { uid } from '../types';
import { setInterviewDone } from '../lifecycleActions';
import { peopleStore, logRow } from './store';
import { validateSurvey } from './engagementEngine';
import type { AnswerValue, ExitInterview, QType, Survey, WouldReturn } from './types';

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Send a new pulse. SIMULATION: it is logged and opened here, and nothing is emailed or messaged. */
export function sendPulse(title: string, questions: { text: string; type: QType }[]): { ok: true; survey: Survey } | { ok: false; errors: string[] } {
  const errors = validateSurvey(title, questions);
  if (errors.length) return { ok: false, errors };
  const survey: Survey = {
    id: uid('sv'), title: title.trim(), sentOn: PREVIEW_TODAY, closesOn: addDays(PREVIEW_TODAY, 14), status: 'open',
    questions: questions.map((q, i) => ({ id: `q${i + 1}`, type: q.type, text: q.text.trim() })),
  };
  peopleStore.mutate((d) => {
    d.engagement.surveys.push(survey);
    d.engagement.log.unshift(logRow(ACTOR, 'Pulse sent (simulation, nothing was emailed)', survey.title));
  });
  return { ok: true, survey };
}

export function closeSurvey(surveyId: Id): void {
  peopleStore.mutate((d) => {
    const s = d.engagement.surveys.find((x) => x.id === surveyId);
    if (!s || s.status === 'closed') return;
    s.status = 'closed';
    d.engagement.log.unshift(logRow(ACTOR, 'Pulse closed', s.title));
  });
}

/**
 * Add an anonymous response (the "take the survey" demo). Only the team is kept: no person, no time, nothing else.
 * Answers are cleaned to the question type, so a rating is always 1 to 5.
 */
export function submitResponse(surveyId: Id, teamId: Id, answers: Record<Id, AnswerValue | undefined>): ActionResult {
  const s = peopleStore.get().engagement.surveys.find((x) => x.id === surveyId);
  if (!s) return { ok: false, error: 'Unknown pulse.' };
  if (s.status !== 'open') return { ok: false, error: 'This pulse is closed.' };
  const clean: Record<Id, AnswerValue> = {};
  for (const q of s.questions) {
    const v = answers[q.id];
    if (q.type === 'rating' && typeof v === 'number' && v >= 1 && v <= 5) clean[q.id] = Math.round(v);
    else if (q.type === 'yesno' && typeof v === 'boolean') clean[q.id] = v;
    else if (q.type === 'text' && typeof v === 'string' && v.trim()) clean[q.id] = v.trim().slice(0, 400);
  }
  if (Object.keys(clean).length === 0) return { ok: false, error: 'Answer at least one question.' };
  peopleStore.mutate((d) => { d.engagement.responses.push({ id: uid('r'), surveyId, teamId, answers: clean }); });
  return { ok: true };
}

export function giveKudos(toId: Id, valueId: Id, message: string): ActionResult {
  if (!toId) return { ok: false, error: 'Pick who you are thanking.' };
  if (!valueId) return { ok: false, error: 'Pick the value this shows.' };
  if (message.trim().length < 10) return { ok: false, error: 'Say what they did, in at least 10 characters.' };
  peopleStore.mutate((d) => {
    d.engagement.kudos.unshift({ id: uid('k'), fromName: ACTOR, toId, valueId, message: message.trim(), on: PREVIEW_TODAY });
    d.engagement.log.unshift(logRow(ACTOR, 'Recognition posted', employeeName(toId)));
  });
  return { ok: true };
}

export interface ExitInterviewInput { exitId: Id; employeeId: Id; label: string; reasons: string[]; wouldReturn: WouldReturn | ''; text: string }
export function completeExitInterview(input: ExitInterviewInput): ActionResult {
  if (input.reasons.length === 0) return { ok: false, error: 'Pick at least one reason.' };
  if (input.reasons.length > 3) return { ok: false, error: 'Pick up to three reasons.' };
  if (!input.wouldReturn) return { ok: false, error: 'Say whether they would consider returning.' };
  const e = peopleStore.get().engagement;
  if (e.exitInterviews.some((i) => i.exitId === input.exitId)) return { ok: false, error: 'This interview is already complete.' };
  const row: ExitInterview = {
    id: uid('ei'), exitId: input.exitId, employeeId: input.employeeId, label: input.label, completedOn: PREVIEW_TODAY,
    reasons: input.reasons, wouldReturn: input.wouldReturn, text: input.text.trim(), by: ACTOR,
  };
  peopleStore.mutate((d) => {
    d.engagement.exitInterviews.push(row);
    d.engagement.log.unshift(logRow(ACTOR, 'Exit interview completed', 'HR record'));
  });
  setInterviewDone(input.exitId, true);
  return { ok: true };
}

/** Individual exit answers are HR-only. Opening one is written to the same access log the privacy page reads. */
export function logExitRecordOpened(employeeId: Id | undefined): void {
  if (employeeId) logAccess(employeeId, 'Exit interview answers', 'HR review of the exit record');
  peopleStore.mutate((d) => { d.engagement.log.unshift(logRow(ACTOR, 'Exit interview record opened', employeeId ? employeeName(employeeId) : 'Earlier leaver')); });
}
