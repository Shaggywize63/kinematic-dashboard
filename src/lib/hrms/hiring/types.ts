// Types for the Talent area: Recruitment, Workforce planning and Performance. One area store holds all three so a
// plan can drive an opening and an opening can show up in the plan. Dates are ISO strings; "today" is PREVIEW_TODAY.
// None of this is a decision engine: ratings, scorecards and scenarios inform people, they never decide for them.

import type { Gender, Id, ISODate, Month } from '../types';

// ───────────────────────────── recruitment ─────────────────────────────
export const STAGES = ['applied', 'screen', 'interview', 'offer', 'hired', 'rejected'] as const;
export type Stage = (typeof STAGES)[number];
export const FUNNEL_STAGES = ['applied', 'screen', 'interview', 'offer', 'hired'] as const;
export const STAGE_LABEL: Record<Stage, string> = { applied: 'Applied', screen: 'Screen', interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected' };

export const SOURCES = ['referral', 'job_board', 'agency', 'campus', 'linkedin'] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<Source, string> = { referral: 'Referral', job_board: 'Job board', agency: 'Agency', campus: 'Campus', linkedin: 'LinkedIn' };

/** Reject reasons are about the role and the process only. Nothing here can be a proxy for age, gender or background. */
export const REJECT_REASONS = [
  { code: 'skills_gap', label: 'Skills do not match the role' },
  { code: 'experience_gap', label: 'Experience below what the role needs' },
  { code: 'compensation', label: 'Expected pay is outside the band' },
  { code: 'notice_period', label: 'Notice period too long for this opening' },
  { code: 'withdrew', label: 'Candidate withdrew' },
  { code: 'no_response', label: 'No response from the candidate' },
  { code: 'role_closed', label: 'Opening closed or put on hold' },
  { code: 'failed_checks', label: 'Did not clear reference or document checks' },
] as const;
export type RejectCode = (typeof REJECT_REASONS)[number]['code'];
export const rejectLabel = (c?: RejectCode): string => REJECT_REASONS.find((r) => r.code === c)?.label ?? '—';

export type OpeningStatus = 'draft' | 'pending_approval' | 'open' | 'on_hold' | 'filled';
export const OPENING_STATUS_LABEL: Record<OpeningStatus, string> = { draft: 'Draft', pending_approval: 'Pending approval', open: 'Open', on_hold: 'On hold', filled: 'Filled' };

export interface ApprovalEntry { id: Id; decision: 'submitted' | 'approved' | 'rejected' | 'held' | 'resumed' | 'filled'; by: string; on: ISODate; note?: string }

export interface Opening {
  id: Id;
  title: string;
  departmentId: Id;
  locationId: Id;
  designationId: Id;
  headcount: number;
  filled: number;
  bandMin: number;             // annual CTC, rupees
  bandMax: number;
  hiringManagerId: Id;
  status: OpeningStatus;
  createdOn: ISODate;
  openedOn?: ISODate;          // the day it went live
  closedOn?: ISODate;          // the day the last seat was filled
  holdReason?: string;
  approvals: ApprovalEntry[];
}

export interface StageMove { from: Stage | null; to: Stage; on: ISODate; by: string; reason?: RejectCode; note?: string }

export const COMPETENCIES = ['Role knowledge', 'Problem solving', 'Communication', 'Ownership', 'Teamwork', 'Learning agility'] as const;
export const ROUNDS = ['Phone screen', 'Role / technical round', 'Manager round', 'HR round'] as const;
export interface CompetencyRating { competency: string; rating: number; comment?: string }
export interface Scorecard { id: Id; round: string; interviewerId: Id; on: ISODate; ratings: CompetencyRating[]; summary?: string }

export type OfferStatus = 'draft' | 'extended' | 'accepted' | 'declined';
export interface Offer { ctc: number; joiningDate: ISODate; structureId: Id; status: OfferStatus; extendedOn?: ISODate; decidedOn?: ISODate }

/** No photo, date of birth, age or gender is kept on a candidate. The conversion form asks for the last two only when a person joins. */
export interface Candidate {
  id: Id;
  openingId: Id;
  name: string;
  email: string;
  mobile: string;
  source: Source;
  appliedOn: ISODate;
  experienceYears: number;
  expectedCtc: number;
  noticeDays: number;
  stage: Stage;
  notes: string;
  history: StageMove[];
  scorecards: Scorecard[];
  offer?: Offer;
  rejectReason?: RejectCode;
  convertedEmployeeId?: Id;
}

// ───────────────────────────── workforce planning ─────────────────────────────
export interface PlanLine { id: string; departmentId: Id; locationId: Id; months: Record<Month, number> }
export interface HiringPlan { lines: PlanLine[]; avgCtc: Record<Id, number> }   // avgCtc: planned annual CTC per head, by department
export interface Scenario { id: Id; name: string; builtIn: boolean; hiresPerMonth: number; attritionPct: number; avgCtc: number; note?: string }

// ───────────────────────────── performance ─────────────────────────────
export type CycleStageKey = 'goals' | 'self' | 'manager' | 'calibration' | 'results';
export interface CycleStage { key: CycleStageKey; label: string; start: ISODate; end: ISODate; blurb: string }
export interface Cycle { id: Id; name: string; periodFrom: ISODate; periodTo: ISODate; stages: CycleStage[]; reminders: { on: ISODate; departmentId?: Id; by: string }[] }

export type KrUnit = 'count' | '₹' | '%' | 'days';
export interface KeyResult { id: Id; title: string; unit: KrUnit; start: number; target: number; current: number; weight: number }
export interface ProgressUpdate { id: Id; krId: Id; on: ISODate; value: number; comment: string; by: string }
export interface Goal { id: Id; employeeId: Id; title: string; weight: number; startDate: ISODate; dueDate: ISODate; keyResults: KeyResult[]; updates: ProgressUpdate[]; note?: string }

export const PERF_COMPETENCIES = ['Delivery', 'Quality of work', 'Collaboration', 'Ownership', 'Learning and growth'] as const;
export const RATING_LABEL: Record<number, string> = { 1: 'Needs improvement', 2: 'Partly meets', 3: 'Meets expectations', 4: 'Exceeds', 5: 'Outstanding' };
export interface ReviewForm { ratings: Record<string, number>; strengths: string; development: string; overall?: number; submittedOn?: ISODate }
export interface FeedbackRequest { id: Id; reviewerId: Id; requestedOn: ISODate; status: 'requested' | 'submitted'; ratings?: Record<string, number>; comment?: string; submittedOn?: ISODate }
export interface CalibrationMove { id: Id; from: number; to: number; reason: string; by: string; on: ISODate }
export interface Review { id: Id; employeeId: Id; managerId: Id; self: ReviewForm; manager: ReviewForm; feedback: FeedbackRequest[]; moves: CalibrationMove[] }

export interface OneNote { id: Id; on: ISODate; authorRole: 'manager' | 'report'; text: string; private: boolean }
export interface ActionItem { id: Id; text: string; owner: 'manager' | 'report'; due?: ISODate; status: 'open' | 'in_progress' | 'done'; createdOn: ISODate }
export interface OneThread { id: Id; managerId: Id; reportId: Id; cadence: 'weekly' | 'fortnightly' | 'monthly'; nextOn?: ISODate; notes: OneNote[]; actions: ActionItem[] }

// ───────────────────────────── the store ─────────────────────────────
export interface HiringState {
  version: 1;
  openings: Opening[];
  candidates: Candidate[];
  plan: HiringPlan;
  openStartMonth: Month;      // budget assumption: month in which open positions start to cost money
  scenarios: Scenario[];
  cycle: Cycle;
  goals: Goal[];
  reviews: Review[];
  threads: OneThread[];
}

export type Role = 'hr' | 'manager' | 'employee';
export type { Gender, Id, ISODate, Month };
