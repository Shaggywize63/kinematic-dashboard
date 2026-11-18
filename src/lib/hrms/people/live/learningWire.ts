// The one place where the dashboard's Learning shapes (camelCase, optional fields) meet the HRMS learning API's
// (snake_case top-level keys, null for "nothing"; a course's audience, lessons and quiz pass through in the dashboard's
// camelCase shape). Mirrors the other live wires: nothing else in the app knows the wire names, dates are YYYY-MM-DD.
//
// Phase 10: the Learning slice of the people area moves to the server: the catalogue, assignments, certificates,
// reminders and the activity log. Talent and engagement stay local.

import { arr, isObj, num, str, type Row } from '../../live/wire';
import type { ISODate } from '../../types';
import type { Assignment, AssignmentSource, Audience, Certificate, Course, Lesson, LogEntry, QuizQuestion, ReminderEntry } from '../types';
import type { QuizResult } from '../learningEngine';

export type { Row };

const ids = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x !== ''))] : []);
const int = (v: unknown, d = 0): number => { const n = num(v); return n === undefined ? d : Math.round(n); };

export function audienceFromWire(v: unknown): Audience {
  const o = isObj(v) ? v : {};
  return { departmentIds: ids(o.departmentIds), designationIds: ids(o.designationIds), locationIds: ids(o.locationIds) };
}

export function courseFromWire(r: Row): Course {
  return {
    id: String(r.id ?? ''),
    code: String(r.code ?? ''),
    title: String(r.title ?? ''),
    category: r.category === 'skill' ? 'skill' : 'compliance',
    mode: r.mode === 'classroom' ? 'classroom' : 'self_paced',
    durationMin: int(r.duration_min, 30),
    summary: String(r.summary ?? ''),
    mandatory: r.mandatory === true,
    audience: audienceFromWire(r.audience),
    refresherMonths: int(r.refresher_months),
    dueDays: int(r.due_days, 30),
    owner: String(r.owner ?? ''),
    lessons: arr(r.lessons).map((l): Lesson => ({ title: String(l.title ?? ''), body: String(l.body ?? '') })),
    quiz: arr(r.quiz).map((q): QuizQuestion => ({ q: String(q.q ?? ''), options: Array.isArray(q.options) ? q.options.map(String) : [], answer: int(q.answer) })),
  };
}

const SOURCES = new Set<AssignmentSource>(['rule', 'manual', 'refresher']);
export function assignmentFromWire(r: Row): Assignment {
  const a: Assignment = {
    id: String(r.id ?? ''),
    employeeId: String(r.employee_id ?? ''),
    courseId: String(r.course_id ?? ''),
    assignedOn: str(r.assigned_on) ?? '',
    dueOn: str(r.due_on) ?? '',
    source: SOURCES.has(r.source as AssignmentSource) ? (r.source as AssignmentSource) : 'manual',
    stepsDone: int(r.steps_done),
    attempts: int(r.attempts),
  };
  const completedOn = str(r.completed_on); if (completedOn) a.completedOn = completedOn;
  const score = num(r.score); if (score !== undefined) a.score = Math.round(score);
  const cert = str(r.certificate_id); if (cert) a.certificateId = cert;
  return a;
}

/** A certificate; its id IS the printed number (CERT-2026-0007), as on the dashboard. */
export function certificateFromWire(r: Row): Certificate {
  const c: Certificate = {
    id: String(r.id ?? ''),
    assignmentId: String(r.assignment_id ?? ''),
    employeeId: String(r.employee_id ?? ''),
    courseId: String(r.course_id ?? ''),
    issuedOn: str(r.issued_on) ?? '',
    score: int(r.score),
  };
  const expires = str(r.expires_on); if (expires) c.expiresOn = expires;
  return c;
}

export const reminderFromWire = (r: Row): ReminderEntry => ({
  id: String(r.id ?? ''), on: str(r.on) ?? '', by: String(r.by ?? ''), employeeId: String(r.employee_id ?? ''), courseId: String(r.course_id ?? ''), assignmentId: String(r.assignment_id ?? ''),
});

export function logFromWire(r: Row): LogEntry {
  const e: LogEntry = { id: String(r.id ?? ''), at: str(r.at) ?? '', by: String(r.by ?? ''), action: String(r.action ?? '') };
  const d = str(r.detail); if (d) e.detail = d;
  return e;
}

export interface LearningBootstrap {
  courses: Course[];
  assignments: Assignment[];
  certificates: Certificate[];
  reminders: ReminderEntry[];
  log: LogEntry[];
  today?: ISODate;
}
export function learningBootstrapFromWire(data: Row): LearningBootstrap {
  return {
    courses: arr(data.courses).map(courseFromWire),
    assignments: arr(data.assignments).map(assignmentFromWire),
    certificates: arr(data.certificates).map(certificateFromWire),
    reminders: arr(data.reminders).map(reminderFromWire),
    log: arr(data.log).map(logFromWire),
    today: str(data.today),
  };
}

export interface QuizAnswer { result: QuizResult; assignment: Assignment; certificate: Certificate | null }
export function quizAnswerFromWire(r: Row): QuizAnswer {
  const res = isObj(r.result) ? r.result : {};
  return {
    result: { correct: int(res.correct), total: int(res.total), score: int(res.score), passed: res.passed === true },
    assignment: assignmentFromWire(isObj(r.assignment) ? r.assignment : {}),
    certificate: isObj(r.certificate) ? certificateFromWire(r.certificate) : null,
  };
}

// ───────────────────────────── request bodies ─────────────────────────────
export const rulesBody = (p: { mandatory: boolean; audience: Audience; refresherMonths: number }): Row => ({
  mandatory: p.mandatory,
  audience: { departmentIds: ids(p.audience.departmentIds), designationIds: ids(p.audience.designationIds), locationIds: ids(p.audience.locationIds) },
  refresher_months: p.refresherMonths,
});
export const assignBody = (employeeIds: string[], dueOn?: ISODate): Row => ({ employee_ids: ids(employeeIds), ...(dueOn ? { due_on: dueOn } : {}) });
export const lessonBody = (stepsDone: number): Row => ({ steps_done: stepsDone });
export const quizBody = (answers: (number | undefined)[]): Row => ({ answers: answers.map((a) => (typeof a === 'number' ? a : null)) });
