// Everything the Learning tabs need, worked out once per data change from the core database and the learning state.

import type { Employee, HrmsDb, Id } from '../../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import type { Assignment, AssignmentStatus, Course, LearningState } from '../../../../lib/hrms/people/types';
import {
  audienceText, coverageBy, currentAssignments, eligibleFor, expiringCertificates, isLearner, missingAssignments, overallCoverage, overdueItems, progressPct, requiredFor, statusOf,
} from '../../../../lib/hrms/people/learningEngine';

export interface AssignmentRow { id: string; a: Assignment; e: Employee; c: Course; status: AssignmentStatus; pct: number }

export function buildLearningView(db: HrmsDb, st: LearningState) {
  const today = PREVIEW_TODAY;
  const emp = new Map(db.employees.map((e) => [e.id, e]));
  const course = new Map(st.courses.map((c) => [c.id, c]));
  const dep = new Map(db.departments.map((d) => [d.id, d.name]));
  const des = new Map(db.designations.map((d) => [d.id, d.name]));
  const loc = new Map(db.locations.map((l) => [l.id, l.name]));
  const names = { dep: (id: Id) => dep.get(id) ?? id, des: (id: Id) => des.get(id) ?? id, loc: (id: Id) => loc.get(id) ?? id };
  const learners = db.employees.filter(isLearner);

  const rows: AssignmentRow[] = currentAssignments(st.assignments)
    .map((a) => ({ a, e: emp.get(a.employeeId), c: course.get(a.courseId) }))
    .filter((x): x is { a: Assignment; e: Employee; c: Course } => !!x.e && !!x.c && isLearner(x.e))
    .map(({ a, e, c }) => ({ id: a.id, a, e, c, status: statusOf(a, today), pct: progressPct(c, a) }))
    .sort((x, y) => x.e.id.localeCompare(y.e.id, undefined, { numeric: true }) || x.c.title.localeCompare(y.c.title));

  const byDept = coverageBy('department', st.courses, db.employees, st.assignments, st.certificates, today, names.dep);
  const byLoc = coverageBy('location', st.courses, db.employees, st.assignments, st.certificates, today, names.loc);
  const overall = overallCoverage(byDept);
  const overdue = overdueItems(st.courses, db.employees, st.assignments, today);
  const expiring = expiringCertificates(st.courses, db.employees, st.assignments, st.certificates, today);
  const missing = missingAssignments(st.courses, db.employees, st.assignments);

  const courseStats = new Map(st.courses.map((c) => {
    const req = c.mandatory ? requiredFor(c, db.employees) : eligibleFor(c, db.employees);
    const mine = rows.filter((r) => r.c.id === c.id);
    return [c.id, { audience: req.length, assigned: mine.length, done: mine.filter((r) => r.status === 'completed').length, overdue: mine.filter((r) => r.status === 'overdue').length }];
  }));

  return {
    today, emp, course, names, learners, rows, byDept, byLoc, overall, overdue, expiring, missing, courseStats,
    audienceOf: (c: Course) => audienceText(c.audience, names),
    open: rows.filter((r) => r.status !== 'completed').length,
  };
}
export type LearningView = ReturnType<typeof buildLearningView>;

export const STATUS_LABEL: Record<AssignmentStatus, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', overdue: 'Overdue' };
export const STATUS_TONE_MAP: Record<AssignmentStatus, 'neutral' | 'info' | 'ok' | 'red'> = { not_started: 'neutral', in_progress: 'info', completed: 'ok', overdue: 'red' };
