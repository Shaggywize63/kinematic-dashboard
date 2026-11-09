'use client';
// Changes to learning data: lessons, quizzes and certificates, assignments, reminders, and the "mandatory for" rules.

import { ACTOR, employeeName } from '../actions';
import { addDays } from '../format';
import { PREVIEW_TODAY } from '../seed';
import type { Employee, Id } from '../types';
import { uid } from '../types';
import { peopleStore, logRow } from './store';
import { addMonthsISO, certificateId, currentAssignments, dueDateFor, gradeQuiz, latestCertificate, missingAssignments, type QuizResult } from './learningEngine';
import type { Assignment, Audience, Certificate } from './types';

const courseTitle = (id: Id): string => peopleStore.get().learning.courses.find((c) => c.id === id)?.title ?? id;

/** Finish the next lesson. The quiz opens after the last lesson. */
export function completeLesson(assignmentId: Id): void {
  peopleStore.mutate((d) => {
    const a = d.learning.assignments.find((x) => x.id === assignmentId);
    const course = a && d.learning.courses.find((c) => c.id === a.courseId);
    if (!a || !course || a.completedOn) return;
    if (a.stepsDone < course.lessons.length) a.stepsDone += 1;
  });
}

/** Mark the answers. A pass of 70% or more completes the course and issues a (mock) certificate. */
export function submitQuiz(assignmentId: Id, answers: (number | undefined)[]): { result: QuizResult; certificateId?: string } | null {
  const st = peopleStore.get().learning;
  const a = st.assignments.find((x) => x.id === assignmentId);
  const course = a && st.courses.find((c) => c.id === a.courseId);
  if (!a || !course || a.completedOn || a.stepsDone < course.lessons.length) return null;
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
  return { result, certificateId: issued };
}


export interface AssignOutcome { created: number; skipped: number }
/** Give a course to people by hand. Anyone who already has it open is skipped. */
export function assignCourse(courseId: Id, employeeIds: Id[], dueOn?: string): AssignOutcome {
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
  return { created, skipped };
}

/** Create the assignments the rules call for and nobody has made yet. */
export function syncRuleAssignments(employees: Employee[]): number {
  const st = peopleStore.get().learning;
  const missing = missingAssignments(st.courses, employees, st.assignments);
  if (!missing.length) return 0;
  peopleStore.mutate((d) => {
    for (const m of missing) {
      const course = d.learning.courses.find((c) => c.id === m.courseId)!;
      d.learning.assignments.push({ id: uid('asg'), employeeId: m.employeeId, courseId: m.courseId, assignedOn: PREVIEW_TODAY, dueOn: dueDateFor(course, PREVIEW_TODAY), source: 'rule', stepsDone: 0, attempts: 0 });
    }
    d.learning.log.unshift(logRow(ACTOR, 'Rules applied', `${missing.length} assignment${missing.length === 1 ? '' : 's'} created`));
  });
  return missing.length;
}

/** Log a reminder. Nothing is sent: the preview has no mail or message service. */
export function sendReminder(assignmentId: Id): void {
  peopleStore.mutate((d) => {
    const a = d.learning.assignments.find((x) => x.id === assignmentId);
    if (!a) return;
    d.learning.reminders.unshift({ id: uid('rem'), on: PREVIEW_TODAY, by: ACTOR, employeeId: a.employeeId, courseId: a.courseId, assignmentId });
    d.learning.log.unshift(logRow(ACTOR, 'Reminder logged (not sent)', `${employeeName(a.employeeId)}: ${courseTitle(a.courseId)}`));
  });
}

/** Start a refresher for a certificate that is about to lapse. Due when the certificate lapses, or in 14 days if it already has. */
export function assignRefresher(certId: string): boolean {
  const st = peopleStore.get().learning;
  const cert = st.certificates.find((c) => c.id === certId);
  const course = cert && st.courses.find((c) => c.id === cert.courseId);
  if (!cert || !course) return false;
  const cur = currentAssignments(st.assignments).find((a) => a.employeeId === cert.employeeId && a.courseId === cert.courseId);
  if (cur && !cur.completedOn) return false;
  if (latestCertificate(st.certificates, cert.employeeId, cert.courseId)?.id !== cert.id) return false;
  const dueOn = cert.expiresOn && cert.expiresOn > PREVIEW_TODAY ? cert.expiresOn : addDays(PREVIEW_TODAY, 14);
  peopleStore.mutate((d) => {
    const asg: Assignment = { id: uid('asg'), employeeId: cert.employeeId, courseId: cert.courseId, assignedOn: PREVIEW_TODAY, dueOn, source: 'refresher', stepsDone: 0, attempts: 0 };
    d.learning.assignments.push(asg);
    d.learning.log.unshift(logRow(ACTOR, 'Refresher assigned', `${employeeName(cert.employeeId)}: ${course.title}`));
  });
  return true;
}

export interface CourseRulePatch { mandatory: boolean; audience: Audience; refresherMonths: number }
/** Change who a course is mandatory for. Existing assignments stay; "Apply rules" creates the new ones. */
export function updateCourseRules(courseId: Id, patch: CourseRulePatch): void {
  peopleStore.mutate((d) => {
    const c = d.learning.courses.find((x) => x.id === courseId);
    if (!c) return;
    c.mandatory = patch.mandatory;
    c.audience = patch.audience;
    c.refresherMonths = Math.max(0, Math.round(patch.refresherMonths));
    d.learning.log.unshift(logRow(ACTOR, 'Course rules changed', c.title));
  });
}
