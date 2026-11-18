'use client';
// Changes to learning data: lessons, quizzes and certificates, assignments, reminders, and the "mandatory for" rules.
// Each is the local sample flow in sample mode and a server call in live mode (phase 10, live/learningSource.ts). They
// return a promise so the screens can await the server; sample mode resolves at once. The checks that need no server run
// first in both modes, with the same words the server uses.

import { ACTOR, employeeName } from '../actions';
import { addDays } from '../format';
import { PREVIEW_TODAY } from '../seed';
import { isLive } from '../live/store';
import type { Employee, Id } from '../types';
import { uid } from '../types';
import { peopleStore, logRow } from './store';
import { addMonthsISO, certificateId, currentAssignments, dueDateFor, gradeQuiz, latestCertificate, missingAssignments, type QuizResult } from './learningEngine';
import {
  liveApplyRules, liveAssign, liveCompleteLesson, liveLoadLibrary, liveRefresher, liveRemind, liveSetRules, liveSubmitQuiz,
} from './live/learningSource';
import type { Assignment, Audience, Certificate } from './types';

export type ActionResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const done = <T>(r: T): Promise<T> => Promise.resolve(r);
const ALREADY_DONE = 'This course is already completed.';

const courseTitle = (id: Id): string => peopleStore.get().learning.courses.find((c) => c.id === id)?.title ?? id;

/** Finish the next lesson. The quiz opens after the last lesson. */
export function completeLesson(assignmentId: Id): Promise<ActionResult> {
  const st = peopleStore.get().learning;
  const a = st.assignments.find((x) => x.id === assignmentId);
  const course = a && st.courses.find((c) => c.id === a.courseId);
  if (!a || !course) return done(fail('That assignment is not on record.'));
  if (a.completedOn) return done(fail(ALREADY_DONE));
  if (a.stepsDone >= course.lessons.length) return done(fail('Every lesson is done. The quiz is next.'));
  if (isLive()) return liveCompleteLesson(assignmentId);
  peopleStore.mutate((d) => {
    const x = d.learning.assignments.find((y) => y.id === assignmentId);
    if (x && !x.completedOn && x.stepsDone < course.lessons.length) x.stepsDone += 1;
  });
  return done({ ok: true });
}

export type QuizOutcome = { ok: true; result: QuizResult; certificateId?: string } | { ok: false; error: string };

/** Mark the answers. A pass of 70% or more completes the course and issues a certificate (marked on the server in live mode). */
export function submitQuiz(assignmentId: Id, answers: (number | undefined)[]): Promise<QuizOutcome> {
  const st = peopleStore.get().learning;
  const a = st.assignments.find((x) => x.id === assignmentId);
  const course = a && st.courses.find((c) => c.id === a.courseId);
  if (!a || !course) return done(fail('That assignment is not on record.'));
  if (a.completedOn) return done(fail(ALREADY_DONE));
  if (a.stepsDone < course.lessons.length) return done(fail('Finish the lessons before the quiz.'));
  if (course.quiz.some((_, i) => answers[i] === undefined)) return done(fail(`Answer all ${course.quiz.length} questions to submit.`));
  if (isLive()) return liveSubmitQuiz(assignmentId, answers);

  const result = gradeQuiz(course, answers);
  let issued: string | undefined;
  peopleStore.mutate((d) => {
    const asg = d.learning.assignments.find((x) => x.id === assignmentId)!;
    asg.attempts += 1;
    if (result.passed) {
      asg.completedOn = PREVIEW_TODAY;
      asg.score = result.score;
      d.learning.certSeq += 1;
      const cert: Certificate = {
        id: certificateId(d.learning.certSeq, PREVIEW_TODAY), assignmentId, employeeId: asg.employeeId, courseId: asg.courseId, issuedOn: PREVIEW_TODAY,
        expiresOn: course.refresherMonths ? addMonthsISO(PREVIEW_TODAY, course.refresherMonths) : undefined, score: result.score,
      };
      d.learning.certificates.push(cert);
      asg.certificateId = cert.id;
      issued = cert.id;
    }
    d.learning.log.unshift(logRow(ACTOR, result.passed ? 'Course completed' : 'Quiz not passed', `${employeeName(asg.employeeId)}: ${course.title}, ${result.score}%`));
  });
  return done({ ok: true, result, ...(issued ? { certificateId: issued } : {}) });
}

export type AssignOutcome = { ok: true; created: number; skipped: number } | { ok: false; error: string };
/** Give a course to people by hand. Anyone who already has it open is skipped. */
export function assignCourse(courseId: Id, employeeIds: Id[], dueOn?: string): Promise<AssignOutcome> {
  if (employeeIds.length === 0) return done(fail('Pick at least one person.'));
  if (isLive()) return liveAssign(courseId, employeeIds, dueOn);
  let created = 0; let skipped = 0;
  peopleStore.mutate((d) => {
    const course = d.learning.courses.find((c) => c.id === courseId);
    if (!course) return;
    const latest = new Map(currentAssignments(d.learning.assignments).map((a) => [`${a.employeeId}|${a.courseId}`, a]));
    for (const id of employeeIds) {
      const cur = latest.get(`${id}|${courseId}`);
      if (cur && !cur.completedOn) { skipped += 1; continue; }
      d.learning.assignments.push({ id: uid('asg'), employeeId: id, courseId, assignedOn: PREVIEW_TODAY, dueOn: dueOn || dueDateFor(course, PREVIEW_TODAY), source: 'manual', stepsDone: 0, attempts: 0 });
      created += 1;
    }
    if (created) d.learning.log.unshift(logRow(ACTOR, 'Course assigned', `${course.title} to ${created} ${created === 1 ? 'person' : 'people'}`));
  });
  return done({ ok: true, created, skipped });
}

export type RulesOutcome = { ok: true; created: number } | { ok: false; error: string };
/** Create the assignments the rules call for and nobody has made yet. In live mode the server works this out from its own records. */
export function syncRuleAssignments(employees: Employee[]): Promise<RulesOutcome> {
  if (isLive()) return liveApplyRules();
  const st = peopleStore.get().learning;
  const missing = missingAssignments(st.courses, employees, st.assignments);
  if (!missing.length) return done({ ok: true, created: 0 });
  peopleStore.mutate((d) => {
    for (const m of missing) {
      const course = d.learning.courses.find((c) => c.id === m.courseId)!;
      d.learning.assignments.push({ id: uid('asg'), employeeId: m.employeeId, courseId: m.courseId, assignedOn: PREVIEW_TODAY, dueOn: dueDateFor(course, PREVIEW_TODAY), source: 'rule', stepsDone: 0, attempts: 0 });
    }
    d.learning.log.unshift(logRow(ACTOR, 'Rules applied', `${missing.length} assignment${missing.length === 1 ? '' : 's'} created`));
  });
  return done({ ok: true, created: missing.length });
}

/** Log a reminder. Nothing is sent: there is no mail or message service behind it yet. */
export function sendReminder(assignmentId: Id): Promise<ActionResult> {
  const a = peopleStore.get().learning.assignments.find((x) => x.id === assignmentId);
  if (!a) return done(fail('That assignment is not on record.'));
  if (a.completedOn) return done(fail(ALREADY_DONE));
  if (isLive()) return liveRemind(assignmentId);
  peopleStore.mutate((d) => {
    d.learning.reminders.unshift({ id: uid('rem'), on: PREVIEW_TODAY, by: ACTOR, employeeId: a.employeeId, courseId: a.courseId, assignmentId });
    d.learning.log.unshift(logRow(ACTOR, 'Reminder logged (not sent)', `${employeeName(a.employeeId)}: ${courseTitle(a.courseId)}`));
  });
  return done({ ok: true });
}

/** Start a refresher for a certificate that is about to lapse. Due when the certificate lapses, or in 14 days if it already has. */
export function assignRefresher(certId: string): Promise<ActionResult> {
  const st = peopleStore.get().learning;
  const cert = st.certificates.find((c) => c.id === certId);
  const course = cert && st.courses.find((c) => c.id === cert.courseId);
  if (!cert || !course) return done(fail('That certificate is not on record.'));
  const cur = currentAssignments(st.assignments).find((a) => a.employeeId === cert.employeeId && a.courseId === cert.courseId);
  if (cur && !cur.completedOn) return done(fail('A refresher is already assigned.'));
  if (latestCertificate(st.certificates, cert.employeeId, cert.courseId)?.id !== cert.id) return done(fail('A newer certificate has replaced this one.'));
  if (isLive()) return liveRefresher(certId);
  const dueOn = cert.expiresOn && cert.expiresOn > PREVIEW_TODAY ? cert.expiresOn : addDays(PREVIEW_TODAY, 14);
  peopleStore.mutate((d) => {
    const asg: Assignment = { id: uid('asg'), employeeId: cert.employeeId, courseId: cert.courseId, assignedOn: PREVIEW_TODAY, dueOn, source: 'refresher', stepsDone: 0, attempts: 0 };
    d.learning.assignments.push(asg);
    d.learning.log.unshift(logRow(ACTOR, 'Refresher assigned', `${employeeName(cert.employeeId)}: ${course.title}`));
  });
  return done({ ok: true });
}

export interface CourseRulePatch { mandatory: boolean; audience: Audience; refresherMonths: number }
/** Change who a course is mandatory for. Existing assignments stay; "Apply rules" creates the new ones. */
export function updateCourseRules(courseId: Id, patch: CourseRulePatch): Promise<ActionResult> {
  const m = patch.refresherMonths;
  if (!Number.isFinite(m) || m < 0 || m > 60) return done(fail('The refresher interval is between 0 and 60 months. Use 0 for a one-off course.'));
  if (isLive()) return liveSetRules(courseId, { ...patch, refresherMonths: Math.round(m) });
  peopleStore.mutate((d) => {
    const c = d.learning.courses.find((x) => x.id === courseId);
    if (!c) return;
    c.mandatory = patch.mandatory;
    c.audience = patch.audience;
    c.refresherMonths = Math.max(0, Math.round(m));
    d.learning.log.unshift(logRow(ACTOR, 'Course rules changed', c.title));
  });
  return done({ ok: true });
}

export type LibraryOutcome = { ok: true; added: number } | { ok: false; error: string };
/** Live mode only: add the standard courses (with lessons and quizzes) the company does not have yet. */
export function loadStandardCourses(): Promise<LibraryOutcome> {
  if (!isLive()) return done(fail('The sample already has its courses.'));
  return liveLoadLibrary();
}
