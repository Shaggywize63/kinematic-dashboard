// Data model for the "people" area of the HRMS preview: learning, talent and succession, engagement, timesheets.
// Employees, departments, locations and exits come from the core database (lib/hrms/types.ts). Everything in this
// file is the area's own sample data and the changes people make to it, kept in one area store (store.ts).

import type { Id, ISODate } from '../types';

export interface LogEntry { id: string; at: string; by: string; action: string; detail?: string }

// ─────────────────────────────── learning ───────────────────────────────
export type CourseCategory = 'compliance' | 'skill';
export type CourseMode = 'self_paced' | 'classroom';

/** "Mandatory for": each list that is empty means everyone on that dimension; a filled list must contain the person's value. */
export interface Audience { departmentIds: Id[]; designationIds: Id[]; locationIds: Id[] }
export interface Lesson { title: string; body: string }
export interface QuizQuestion { q: string; options: string[]; answer: number }

export interface Course {
  id: Id;
  code: string;
  title: string;
  category: CourseCategory;
  mode: CourseMode;
  durationMin: number;
  summary: string;
  mandatory: boolean;
  audience: Audience;
  /** Months after which the certificate lapses and a refresher is needed. 0 means a one-off course. */
  refresherMonths: number;
  /** Days a person gets from the day the course is assigned. */
  dueDays: number;
  owner: string;
  lessons: Lesson[];
  quiz: QuizQuestion[];
}

export type AssignmentSource = 'rule' | 'manual' | 'refresher';
export interface Assignment {
  id: Id;
  employeeId: Id;
  courseId: Id;
  assignedOn: ISODate;
  dueOn: ISODate;
  source: AssignmentSource;
  /** Lessons finished so far. The quiz is the last step. */
  stepsDone: number;
  attempts: number;
  completedOn?: ISODate;
  score?: number;
  certificateId?: string;
}
export type AssignmentStatus = 'not_started' | 'in_progress' | 'completed' | 'overdue';

export interface Certificate {
  id: string;
  assignmentId: Id;
  employeeId: Id;
  courseId: Id;
  issuedOn: ISODate;
  expiresOn?: ISODate;
  score: number;
}
export interface ReminderEntry { id: Id; on: ISODate; by: string; employeeId: Id; courseId: Id; assignmentId: Id }

export interface LearningState {
  courses: Course[];
  assignments: Assignment[];
  certificates: Certificate[];
  reminders: ReminderEntry[];
  certSeq: number;
  log: LogEntry[];
}

// ─────────────────────────────── talent ───────────────────────────────
export interface Skill { id: Id; name: string; group: string; blurb: string }
export type SkillLevel = 0 | 1 | 2 | 3 | 4;
export interface Rating { level: SkillLevel; note: string; by: string; on: ISODate }

export type Readiness = 'now' | '1-2y' | '3y+';
export interface Successor { employeeId: Id; readiness: Readiness; actions: string[]; addedOn: ISODate }
export interface SuccessionChange { id: Id; on: ISODate; by: string; kind: 'added' | 'removed' | 'readiness'; employeeId: Id; from?: string; to?: string; reason: string }
export interface CriticalRole {
  id: Id;
  title: string;
  departmentId: Id;
  locationId: Id;
  incumbentId: Id;
  /** When the incumbent started in this role (the core record keeps only the join date). */
  roleSince: ISODate;
  /** Company retirement age for the role, used only for a factual "years to retirement age" line. */
  retirementAge: number;
  why: string;
  successors: Successor[];
  history: SuccessionChange[];
}

export type NineLevel = 1 | 2 | 3;
export interface Placement { employeeId: Id; performance: NineLevel; potential: NineLevel; rationale: string; by: string; on: ISODate }

export interface TalentState {
  skills: Skill[];
  /** Required level per skill, by designation id. */
  requirements: Record<Id, Record<Id, number>>;
  /** Keyed `${employeeId}|${skillId}`. A missing key means not assessed yet (shown as 0). */
  ratings: Record<string, Rating>;
  roles: CriticalRole[];
  placements: Record<Id, Placement>;
  cycle: string;
  log: LogEntry[];
}

// ─────────────────────────────── engagement ───────────────────────────────
export type QType = 'rating' | 'yesno' | 'text';
export interface SurveyQuestion { id: Id; text: string; type: QType }
export interface Survey { id: Id; title: string; sentOn: ISODate; closesOn: ISODate; status: 'open' | 'closed'; questions: SurveyQuestion[] }
export type AnswerValue = number | boolean | string;
/** A response never carries a person, a timestamp or any other attribute. Only the team, which the aggregate needs. */
export interface SurveyResponse { id: Id; surveyId: Id; teamId: Id; answers: Record<Id, AnswerValue> }

export interface CompanyValue { id: Id; name: string; blurb: string }
export interface Kudos { id: Id; fromName: string; toId: Id; valueId: Id; message: string; on: ISODate }

export type WouldReturn = 'yes' | 'maybe' | 'no';
export interface ExitInterview {
  id: Id;
  /** Set when the interview belongs to a case in the core exits list. */
  exitId?: Id;
  employeeId?: Id;
  /** What the HR record shows for an earlier leaver who is not in the sample employee list. */
  label: string;
  completedOn: ISODate;
  reasons: string[];
  wouldReturn: WouldReturn;
  text: string;
  by: string;
}

export interface EngagementState {
  surveys: Survey[];
  responses: SurveyResponse[];
  values: CompanyValue[];
  kudos: Kudos[];
  exitInterviews: ExitInterview[];
  log: LogEntry[];
}

// ─────────────────────────────── timesheets ───────────────────────────────
export interface Project {
  id: Id;
  name: string;
  client: string;
  kind: 'client' | 'internal';
  billable: boolean;
  budgetHours: number;
  /** Hours logged before the first week in this sample (so the budget bar is not empty). */
  priorHours: number;
  /** Sample billing rate in rupees per hour. Not a real rate card. */
  sampleRate: number;
}
export interface SheetLine { projectId: Id; hours: number[] }
export type SheetStatus = 'draft' | 'submitted' | 'approved' | 'returned';
export interface SheetTrail { at: ISODate; by: string; action: string; comment?: string }
export interface Sheet {
  id: string;
  employeeId: Id;
  weekStart: ISODate;
  lines: SheetLine[];
  status: SheetStatus;
  submittedOn?: ISODate;
  decidedOn?: ISODate;
  decidedBy?: string;
  comment?: string;
  trail: SheetTrail[];
}
export interface TimesheetPolicy { maxPerDay: number; weeklyCap: number; standardWeek: number }
export interface TimesheetState {
  policy: TimesheetPolicy;
  projects: Project[];
  trackedIds: Id[];
  sheets: Sheet[];
  log: LogEntry[];
}

// ─────────────────────────────── the whole area ───────────────────────────────
export interface PeopleState {
  learning: LearningState;
  talent: TalentState;
  engagement: EngagementState;
  timesheets: TimesheetState;
}
