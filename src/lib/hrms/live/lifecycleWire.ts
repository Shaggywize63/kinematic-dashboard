// Lifecycle and letters on the server (phase 4): the one place where the dashboard's own lifecycle shapes meet the HRMS
// lifecycle API's. Same convention as wire.ts / payrollWire.ts / timeWire.ts: top-level keys are snake_case with null for
// "nothing"; nested objects and arrays (an onboarding case's tasks, an exit's clearance and assets) pass through in the
// dashboard's own camelCase shape. Dates are YYYY-MM-DD.
//
// Pure: no I/O, no React. Four collections live here — onboarding cases, exit cases, letter templates and issued letters.
// All four are ordinary {id} records (POST/PUT/DELETE), diffed and synced like people / structures / shifts. The nested
// arrays are sent whole whenever any item inside changes, exactly as a leave type's accrual object is.

import type {
  ChecklistTask, ClearanceItem, ExitCase, IssuedLetter, LetterTemplate, LetterType, OnboardingCase,
} from '../types';
import { arr, blankToNull, bodyFor, bool, dropUndefined, str, type Row, type Spec } from './wire';

// ───────────────────────────── enum guards (the server's CHECK columns already keep these valid) ─────────────────────────────
const ONBOARDING_STAGES: OnboardingCase['stage'][] = ['offer', 'documents', 'registration', 'assets', 'induction', 'done'];
const EXIT_STAGES: ExitCase['stage'][] = ['notice', 'clearance', 'settlement', 'closed'];
const EXIT_REASONS: ExitCase['reason'][] = ['resignation', 'termination', 'end_of_contract', 'retirement', 'absconding'];
const LETTER_TYPES: LetterType[] = ['offer', 'appointment', 'confirmation', 'increment', 'relieving', 'experience', 'warning'];
const pick = <T extends string>(allowed: T[], v: unknown, fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** A nested array sent whole: each item passes through in the dashboard's camelCase shape, with undefined keys dropped. */
const itemsOut = (v: unknown): Row[] => (Array.isArray(v) ? v.map((x) => dropUndefined(x as Row)) : []);

// ───────────────────────────── onboarding cases ─────────────────────────────
function taskFromWire(t: Row): ChecklistTask {
  return { id: String(t.id ?? ''), label: String(t.label ?? ''), owner: String(t.owner ?? ''), done: bool(t.done), dueOn: str(t.dueOn) };
}
export function onboardingFromWire(r: Row): OnboardingCase {
  return {
    id: String(r.id), employeeId: str(r.employee_id), name: String(r.name ?? ''), role: String(r.role ?? ''),
    joinDate: str(r.join_date) ?? '', stage: pick(ONBOARDING_STAGES, r.stage, 'offer'), tasks: arr(r.tasks).map(taskFromWire),
  };
}
const ONBOARDING_SPECS: Spec[] = [
  { local: 'employeeId', wire: 'employee_id', nullable: true, out: blankToNull },
  { local: 'name', wire: 'name', nullable: false },
  { local: 'role', wire: 'role', nullable: false },
  { local: 'joinDate', wire: 'join_date', nullable: false },
  { local: 'stage', wire: 'stage', nullable: false },
  { local: 'tasks', wire: 'tasks', nullable: false, out: itemsOut },
];
export const onboardingCreateBody = (c: OnboardingCase): Row => ({ id: c.id, ...bodyFor(ONBOARDING_SPECS, c as unknown as Row).body });
export const onboardingPatch = (prev: OnboardingCase, next: OnboardingCase) => bodyFor(ONBOARDING_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── exit cases ─────────────────────────────
function clearanceFromWire(c: Row): ClearanceItem {
  return { id: String(c.id ?? ''), department: String(c.department ?? ''), owner: String(c.owner ?? ''), done: bool(c.done), remarks: str(c.remarks) };
}
function assetFromWire(a: Row): ExitCase['assets'][number] {
  return { id: String(a.id ?? ''), name: String(a.name ?? ''), returned: bool(a.returned) };
}
export function exitFromWire(r: Row): ExitCase {
  return {
    id: String(r.id), employeeId: String(r.employee_id ?? ''), reason: pick(EXIT_REASONS, r.reason, 'resignation'),
    resignationDate: str(r.resignation_date) ?? '', lastWorkingDate: str(r.last_working_date) ?? '', noticeWaived: bool(r.notice_waived),
    stage: pick(EXIT_STAGES, r.stage, 'notice'), clearance: arr(r.clearance).map(clearanceFromWire), assets: arr(r.assets).map(assetFromWire),
    interviewDone: bool(r.interview_done),
  };
}
const EXIT_SPECS: Spec[] = [
  { local: 'employeeId', wire: 'employee_id', nullable: false },
  { local: 'reason', wire: 'reason', nullable: false },
  { local: 'resignationDate', wire: 'resignation_date', nullable: false },
  { local: 'lastWorkingDate', wire: 'last_working_date', nullable: false },
  { local: 'noticeWaived', wire: 'notice_waived', nullable: false, out: (v) => !!v },
  { local: 'stage', wire: 'stage', nullable: false },
  { local: 'clearance', wire: 'clearance', nullable: false, out: itemsOut },
  { local: 'assets', wire: 'assets', nullable: false, out: itemsOut },
  { local: 'interviewDone', wire: 'interview_done', nullable: false, out: (v) => !!v },
];
export const exitCreateBody = (c: ExitCase): Row => ({ id: c.id, ...bodyFor(EXIT_SPECS, c as unknown as Row).body });
export const exitPatch = (prev: ExitCase, next: ExitCase) => bodyFor(EXIT_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── letter templates ─────────────────────────────
export function letterTemplateFromWire(r: Row): LetterTemplate {
  return { id: String(r.id), type: pick(LETTER_TYPES, r.type, 'offer'), name: String(r.name ?? ''), body: String(r.body ?? '') };
}
const LETTER_TEMPLATE_SPECS: Spec[] = [
  { local: 'type', wire: 'type', nullable: false },
  { local: 'name', wire: 'name', nullable: false },
  { local: 'body', wire: 'body', nullable: false, emptyOk: true },
];
export const letterTemplateCreateBody = (t: LetterTemplate): Row => ({ id: t.id, ...bodyFor(LETTER_TEMPLATE_SPECS, t as unknown as Row).body });
export const letterTemplatePatch = (prev: LetterTemplate, next: LetterTemplate) => bodyFor(LETTER_TEMPLATE_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── issued letters ─────────────────────────────
export function issuedLetterFromWire(r: Row): IssuedLetter {
  return {
    id: String(r.id), employeeId: String(r.employee_id ?? ''), templateId: str(r.template_id) ?? '', type: pick(LETTER_TYPES, r.type, 'offer'),
    issuedOn: str(r.issued_on) ?? '', body: String(r.body ?? ''), signed: bool(r.signed),
  };
}
const ISSUED_LETTER_SPECS: Spec[] = [
  { local: 'employeeId', wire: 'employee_id', nullable: false },
  { local: 'templateId', wire: 'template_id', nullable: true, out: blankToNull },
  { local: 'type', wire: 'type', nullable: false },
  { local: 'issuedOn', wire: 'issued_on', nullable: false },
  { local: 'body', wire: 'body', nullable: false },
  { local: 'signed', wire: 'signed', nullable: false, out: (v) => !!v },
];
export const issuedLetterCreateBody = (l: IssuedLetter): Row => ({ id: l.id, ...bodyFor(ISSUED_LETTER_SPECS, l as unknown as Row).body });
export const issuedLetterPatch = (prev: IssuedLetter, next: IssuedLetter) => bodyFor(ISSUED_LETTER_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── the bootstrap ─────────────────────────────
export interface LifecycleData {
  onboarding: OnboardingCase[]; exits: ExitCase[]; letterTemplates: LetterTemplate[]; letters: IssuedLetter[];
  serverTime?: string;
}
export function lifecycleFromWire(data: Row): LifecycleData {
  return {
    onboarding: arr(data.onboarding_cases).map(onboardingFromWire),
    exits: arr(data.exit_cases).map(exitFromWire),
    letterTemplates: arr(data.letter_templates).map(letterTemplateFromWire),
    letters: arr(data.issued_letters).map(issuedLetterFromWire),
    serverTime: str(data.server_time),
  };
}
