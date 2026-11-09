// Learning: who must take which course, where each person stands, and how well the company is covered.
// Pure functions. "Today" is always passed in (the preview uses PREVIEW_TODAY) so results never depend on the clock.

import type { Employee, Id, ISODate } from '../types';
import { addDays, diffDays } from '../format';
import type { Assignment, AssignmentStatus, Audience, Certificate, Course } from './types';

export const PASS_MARK = 70;
export const EXPIRY_WINDOW_DAYS = 60;

/** Add whole months to a date, keeping the day where it exists and otherwise using the last day of the month. */
export function addMonthsISO(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** People who can be given training: working or serving notice. Joiners are assigned on their start date, leavers are done. */
export const isLearner = (e: Employee): boolean => e.status === 'active' || e.status === 'on_notice';

export function inAudience(a: Audience, e: Pick<Employee, 'departmentId' | 'designationId' | 'locationId'>): boolean {
  return (a.departmentIds.length === 0 || a.departmentIds.includes(e.departmentId))
    && (a.designationIds.length === 0 || a.designationIds.includes(e.designationId))
    && (a.locationIds.length === 0 || a.locationIds.includes(e.locationId));
}

export const eligibleFor = (course: Course, employees: Employee[]): Employee[] => employees.filter((e) => isLearner(e) && inAudience(course.audience, e));
/** People the rule makes the course compulsory for. Empty when the course is only recommended. */
export const requiredFor = (course: Course, employees: Employee[]): Employee[] => (course.mandatory ? eligibleFor(course, employees) : []);

export function audienceText(a: Audience, names: { dep: (id: Id) => string; des: (id: Id) => string; loc: (id: Id) => string }): string {
  const parts: string[] = [];
  if (a.departmentIds.length) parts.push(a.departmentIds.map(names.dep).join(', '));
  if (a.designationIds.length) parts.push(a.designationIds.map(names.des).join(', '));
  if (a.locationIds.length) parts.push(a.locationIds.map(names.loc).join(', '));
  return parts.length ? parts.join(' · ') : 'Everyone';
}

export function statusOf(a: Assignment, today: ISODate): AssignmentStatus {
  if (a.completedOn) return 'completed';
  if (a.dueOn < today) return 'overdue';
  return a.stepsDone > 0 || a.attempts > 0 ? 'in_progress' : 'not_started';
}

/** Lessons plus the quiz make the steps; finishing the quiz is the last step. */
export function progressPct(course: Course, a: Assignment): number {
  if (a.completedOn) return 100;
  const total = course.lessons.length + 1;
  return Math.min(99, Math.round((a.stepsDone / total) * 100));
}

/** The most recent assignment for each person and course (a refresher replaces the older one). */
export function currentAssignments(assignments: Assignment[]): Assignment[] {
  const best = new Map<string, Assignment>();
  for (const a of assignments) {
    const k = `${a.employeeId}|${a.courseId}`;
    const cur = best.get(k);
    if (!cur || a.assignedOn > cur.assignedOn || (a.assignedOn === cur.assignedOn && a.id > cur.id)) best.set(k, a);
  }
  return [...best.values()];
}

export function latestCertificate(certs: Certificate[], employeeId: Id, courseId: Id): Certificate | undefined {
  let best: Certificate | undefined;
  for (const c of certs) {
    if (c.employeeId !== employeeId || c.courseId !== courseId) continue;
    if (!best || c.issuedOn > best.issuedOn || (c.issuedOn === best.issuedOn && c.id > best.id)) best = c;
  }
  return best;
}

export function certificateValid(cert: Certificate | undefined, today: ISODate): boolean {
  return !!cert && (!cert.expiresOn || cert.expiresOn >= today);
}

/** Pairs the rules require that nobody has been assigned yet. */
export function missingAssignments(courses: Course[], employees: Employee[], assignments: Assignment[]): { employeeId: Id; courseId: Id }[] {
  const have = new Set(assignments.map((a) => `${a.employeeId}|${a.courseId}`));
  const out: { employeeId: Id; courseId: Id }[] = [];
  for (const c of courses) for (const e of requiredFor(c, employees)) if (!have.has(`${e.id}|${c.id}`)) out.push({ employeeId: e.id, courseId: c.id });
  return out;
}

export interface CoverageRow { key: string; label: string; required: number; covered: number; overdue: number; pct: number }

/**
 * Mandatory-training coverage. A person-and-course pair is covered when the latest assignment is completed and its
 * certificate (if the course has a refresher) has not lapsed. Grouped by the person's department or location.
 */
export function coverageBy(
  dim: 'department' | 'location', courses: Course[], employees: Employee[], assignments: Assignment[], certs: Certificate[], today: ISODate,
  label: (id: Id) => string,
): CoverageRow[] {
  const cur = new Map(currentAssignments(assignments).map((a) => [`${a.employeeId}|${a.courseId}`, a]));
  const rows = new Map<string, CoverageRow>();
  for (const c of courses) {
    for (const e of requiredFor(c, employees)) {
      const id = dim === 'department' ? e.departmentId : e.locationId;
      const row = rows.get(id) ?? { key: id, label: label(id), required: 0, covered: 0, overdue: 0, pct: 0 };
      row.required += 1;
      const a = cur.get(`${e.id}|${c.id}`);
      if (a && statusOf(a, today) === 'completed' && certificateValid(latestCertificate(certs, e.id, c.id), today)) row.covered += 1;
      else if (a && statusOf(a, today) === 'overdue') row.overdue += 1;
      rows.set(id, row);
    }
  }
  return [...rows.values()].map((r) => ({ ...r, pct: r.required ? Math.round((r.covered / r.required) * 100) : 100 })).sort((x, y) => x.label.localeCompare(y.label));
}

export function overallCoverage(rows: CoverageRow[]): { required: number; covered: number; overdue: number; pct: number } {
  const required = rows.reduce((t, r) => t + r.required, 0);
  const covered = rows.reduce((t, r) => t + r.covered, 0);
  const overdue = rows.reduce((t, r) => t + r.overdue, 0);
  return { required, covered, overdue, pct: required ? Math.round((covered / required) * 100) : 100 };
}

export interface OverdueItem { assignment: Assignment; employee: Employee; course: Course; daysOverdue: number }
/** Latest assignments past their due date and not completed, longest overdue first. Only for mandatory courses. */
export function overdueItems(courses: Course[], employees: Employee[], assignments: Assignment[], today: ISODate): OverdueItem[] {
  const byCourse = new Map(courses.map((c) => [c.id, c]));
  const byEmp = new Map(employees.map((e) => [e.id, e]));
  const out: OverdueItem[] = [];
  for (const a of currentAssignments(assignments)) {
    const course = byCourse.get(a.courseId);
    const employee = byEmp.get(a.employeeId);
    if (!course || !employee || !isLearner(employee) || !course.mandatory) continue;
    if (statusOf(a, today) === 'overdue') out.push({ assignment: a, employee, course, daysOverdue: diffDays(a.dueOn, today) });
  }
  return out.sort((x, y) => y.daysOverdue - x.daysOverdue || x.employee.id.localeCompare(y.employee.id, undefined, { numeric: true }));
}

export interface ExpiringItem { cert: Certificate; employee: Employee; course: Course; daysLeft: number; refresherAssigned: boolean }
/** Certificates that lapse within the window (or already have), unless a newer assignment already covers the refresher. */
export function expiringCertificates(
  courses: Course[], employees: Employee[], assignments: Assignment[], certs: Certificate[], today: ISODate, windowDays = EXPIRY_WINDOW_DAYS,
): ExpiringItem[] {
  const byCourse = new Map(courses.map((c) => [c.id, c]));
  const byEmp = new Map(employees.map((e) => [e.id, e]));
  const latestAsg = new Map(currentAssignments(assignments).map((a) => [`${a.employeeId}|${a.courseId}`, a]));
  const seen = new Set<string>();
  const out: ExpiringItem[] = [];
  for (const c of [...certs].sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.id.localeCompare(a.id))) {
    const k = `${c.employeeId}|${c.courseId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const employee = byEmp.get(c.employeeId);
    const course = byCourse.get(c.courseId);
    if (!employee || !course || !isLearner(employee) || !c.expiresOn) continue;
    const daysLeft = diffDays(today, c.expiresOn);
    if (daysLeft > windowDays) continue;
    const a = latestAsg.get(k);
    const refresherAssigned = !!a && a.assignedOn > c.issuedOn && !a.completedOn;
    out.push({ cert: c, employee, course, daysLeft, refresherAssigned });
  }
  return out.sort((x, y) => x.daysLeft - y.daysLeft || x.employee.id.localeCompare(y.employee.id, undefined, { numeric: true }));
}

export interface QuizResult { correct: number; total: number; score: number; passed: boolean }
export function gradeQuiz(course: Course, answers: (number | undefined)[]): QuizResult {
  const total = course.quiz.length;
  const correct = course.quiz.reduce((t, q, i) => t + (answers[i] === q.answer ? 1 : 0), 0);
  const score = total ? Math.round((correct / total) * 100) : 0;
  return { correct, total, score, passed: score >= PASS_MARK };
}

/** CERT-2026-0007: year of issue and a running number. */
export const certificateId = (seq: number, issuedOn: ISODate): string => `CERT-${issuedOn.slice(0, 4)}-${String(seq).padStart(4, '0')}`;

export const dueDateFor = (course: Course, from: ISODate): ISODate => addDays(from, course.dueDays);

export function minutesText(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
