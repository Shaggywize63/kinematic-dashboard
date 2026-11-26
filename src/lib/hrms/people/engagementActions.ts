'use client';
// Changes to engagement data: pulses, anonymous responses, recognition and exit interviews. Each is the local sample flow
// in sample mode and a server call in live mode (phase 11, live/engagementSource.ts). They return a promise so the screens
// can await the server; sample mode resolves at once. The checks that need no server run first in both modes, with the same
// words the server uses. Reads use peopleStore.get(), which is the live engagement data in live mode.

import { ACTOR, employeeName, logAccess } from '../actions';
import { addDays } from '../format';
import { PREVIEW_TODAY } from '../seed';
import { isLive } from '../live/store';
import type { Id } from '../types';
import { uid } from '../types';
import { setInterviewDone } from '../lifecycleActions';
import { peopleStore, logRow } from './store';
import { validateSurvey } from './engagementEngine';
import { liveCloseSurvey, liveCompleteExit, liveGiveKudos, liveOpenExit, liveSendPulse, liveSubmitResponse } from './live/engagementSource';
import type { AnswerValue, ExitInterview, QType, Survey, WouldReturn } from './types';

export type ActionResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const done = <T>(r: T): Promise<T> => Promise.resolve(r);

export type PulseOutcome = { ok: true; survey: Survey } | { ok: false; errors: string[] };
/** Send a new pulse. SIMULATION: it is logged and opened here, and nothing is emailed or messaged. */
export async function sendPulse(title: string, questions: { text: string; type: QType }[]): Promise<PulseOutcome> {
  const errors = validateSurvey(title, questions);
  if (errors.length) return { ok: false, errors };
  if (isLive()) {
    const r = await liveSendPulse(title, questions);
    return r.ok ? { ok: true, survey: r.survey } : { ok: false, errors: [r.error] };
  }
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

export function closeSurvey(surveyId: Id): Promise<ActionResult> {
  const s = peopleStore.get().engagement.surveys.find((x) => x.id === surveyId);
  if (!s) return done(fail('Unknown pulse.'));
  if (s.status === 'closed') return done({ ok: true });
  if (isLive()) return liveCloseSurvey(surveyId);
  peopleStore.mutate((d) => {
    const x = d.engagement.surveys.find((y) => y.id === surveyId);
    if (!x || x.status === 'closed') return;
    x.status = 'closed';
    d.engagement.log.unshift(logRow(ACTOR, 'Pulse closed', x.title));
  });
  return done({ ok: true });
}

/**
 * Add an anonymous response (the "take the survey" demo). Only the team is kept: no person, no time, nothing else.
 * Answers are cleaned to the question type, so a rating is always 1 to 5.
 */
export function submitResponse(surveyId: Id, teamId: Id, answers: Record<Id, AnswerValue | undefined>): Promise<ActionResult> {
  const s = peopleStore.get().engagement.surveys.find((x) => x.id === surveyId);
  if (!s) return done(fail('Unknown pulse.'));
  if (s.status !== 'open') return done(fail('This pulse is closed.'));
  if (isLive()) return liveSubmitResponse(surveyId, teamId, answers);
  const clean: Record<Id, AnswerValue> = {};
  for (const q of s.questions) {
    const v = answers[q.id];
    if (q.type === 'rating' && typeof v === 'number' && v >= 1 && v <= 5) clean[q.id] = Math.round(v);
    else if (q.type === 'yesno' && typeof v === 'boolean') clean[q.id] = v;
    else if (q.type === 'text' && typeof v === 'string' && v.trim()) clean[q.id] = v.trim().slice(0, 400);
  }
  if (Object.keys(clean).length === 0) return done(fail('Answer at least one question.'));
  peopleStore.mutate((d) => { d.engagement.responses.push({ id: uid('r'), surveyId, teamId, answers: clean }); });
  return done({ ok: true });
}

export function giveKudos(toId: Id, valueId: Id, message: string): Promise<ActionResult> {
  if (!toId) return done(fail('Pick who you are thanking.'));
  if (!valueId) return done(fail('Pick the value this shows.'));
  if (message.trim().length < 10) return done(fail('Say what they did, in at least 10 characters.'));
  if (isLive()) return liveGiveKudos(toId, valueId, message);
  peopleStore.mutate((d) => {
    d.engagement.kudos.unshift({ id: uid('k'), fromName: ACTOR, toId, valueId, message: message.trim(), on: PREVIEW_TODAY });
    d.engagement.log.unshift(logRow(ACTOR, 'Recognition posted', employeeName(toId)));
  });
  return done({ ok: true });
}

export interface ExitInterviewInput { exitId: Id; employeeId: Id; label: string; reasons: string[]; wouldReturn: WouldReturn | ''; text: string }
export async function completeExitInterview(input: ExitInterviewInput): Promise<ActionResult> {
  if (input.reasons.length === 0) return fail('Pick at least one reason.');
  if (input.reasons.length > 3) return fail('Pick up to three reasons.');
  if (!input.wouldReturn) return fail('Say whether they would consider returning.');
  const e = peopleStore.get().engagement;
  if (e.exitInterviews.some((i) => i.exitId === input.exitId)) return fail('This interview is already complete.');
  if (isLive()) {
    const r = await liveCompleteExit({ exitId: input.exitId, employeeId: input.employeeId, label: input.label, reasons: input.reasons, wouldReturn: input.wouldReturn, text: input.text });
    if (!r.ok) return fail(r.error);
    setInterviewDone(input.exitId, true);   // keep the lifecycle exit's flag in step (lifecycle is on the server too)
    return { ok: true };
  }
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
  if (isLive()) { void liveOpenExit(employeeId); return; }
  peopleStore.mutate((d) => { d.engagement.log.unshift(logRow(ACTOR, 'Exit interview record opened', employeeId ? employeeName(employeeId) : 'Earlier leaver')); });
}
