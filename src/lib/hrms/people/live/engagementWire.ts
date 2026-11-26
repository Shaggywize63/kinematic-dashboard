// The one place where the dashboard's Engagement shapes (camelCase, optional fields) meet the HRMS engagement API's
// (snake_case top-level keys, null for "nothing"; a survey's questions and a response's answers pass through in the
// dashboard's own shapes). Mirrors the other live wires: nothing else in the app knows the wire names, dates are YYYY-MM-DD.
//
// Phase 11: the Engagement slice of the people area moves to the server: pulses and their anonymous team-level responses,
// the recognition values and the kudos posted against them, the completed exit interviews and the activity log. Talent
// stays local.

import { arr, isObj, str, type Row } from '../../live/wire';
import type { ISODate } from '../../types';
import type { AnswerValue, CompanyValue, ExitInterview, Kudos, LogEntry, QType, Survey, SurveyQuestion, SurveyResponse, WouldReturn } from '../types';

export type { Row };

const Q_TYPES = new Set<QType>(['rating', 'yesno', 'text']);
const qType = (v: unknown): QType => (Q_TYPES.has(v as QType) ? (v as QType) : 'text');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []);
const RETURNS = new Set<WouldReturn>(['yes', 'maybe', 'no']);

/** One answer: a rating (number), a yes/no (boolean) or a comment (string). Anything else for a key is dropped. */
function answersFromWire(v: unknown): Record<string, AnswerValue> {
  if (!isObj(v)) return {};
  const out: Record<string, AnswerValue> = {};
  for (const [k, raw] of Object.entries(v)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) out[k] = raw;
    else if (typeof raw === 'boolean') out[k] = raw;
    else if (typeof raw === 'string' && raw !== '') out[k] = raw;
  }
  return out;
}

export const valueFromWire = (r: Row): CompanyValue => ({ id: String(r.id ?? ''), name: String(r.name ?? ''), blurb: String(r.blurb ?? '') });

export function surveyFromWire(r: Row): Survey {
  return {
    id: String(r.id ?? ''),
    title: String(r.title ?? ''),
    sentOn: str(r.sent_on) ?? '',
    closesOn: str(r.closes_on) ?? '',
    status: r.status === 'closed' ? 'closed' : 'open',
    questions: arr(r.questions).map((q, i): SurveyQuestion => ({ id: String(q.id ?? `q${i + 1}`), text: String(q.text ?? ''), type: qType(q.type) })),
  };
}

export const responseFromWire = (r: Row): SurveyResponse => ({
  id: String(r.id ?? ''), surveyId: String(r.survey_id ?? ''), teamId: String(r.team_id ?? ''), answers: answersFromWire(r.answers),
});

export const kudosFromWire = (r: Row): Kudos => ({
  id: String(r.id ?? ''), fromName: String(r.from_name ?? ''), toId: String(r.to_id ?? ''), valueId: String(r.value_id ?? ''), message: String(r.message ?? ''), on: str(r.on) ?? '',
});

export function exitInterviewFromWire(r: Row): ExitInterview {
  const e: ExitInterview = {
    id: String(r.id ?? ''),
    label: String(r.label ?? ''),
    completedOn: str(r.completed_on) ?? '',
    reasons: strs(r.reasons),
    wouldReturn: RETURNS.has(r.would_return as WouldReturn) ? (r.would_return as WouldReturn) : 'maybe',
    text: String(r.text ?? ''),
    by: String(r.by ?? ''),
  };
  const exitId = str(r.exit_id); if (exitId) e.exitId = exitId;
  const employeeId = str(r.employee_id); if (employeeId) e.employeeId = employeeId;
  return e;
}

export function logFromWire(r: Row): LogEntry {
  const e: LogEntry = { id: String(r.id ?? ''), at: str(r.at) ?? '', by: String(r.by ?? ''), action: String(r.action ?? '') };
  const d = str(r.detail); if (d) e.detail = d;
  return e;
}

export interface EngagementBootstrap {
  values: CompanyValue[];
  surveys: Survey[];
  responses: SurveyResponse[];
  kudos: Kudos[];
  exitInterviews: ExitInterview[];
  log: LogEntry[];
  today?: ISODate;
}
export function engagementBootstrapFromWire(data: Row): EngagementBootstrap {
  return {
    values: arr(data.values).map(valueFromWire),
    surveys: arr(data.surveys).map(surveyFromWire),
    responses: arr(data.responses).map(responseFromWire),
    kudos: arr(data.kudos).map(kudosFromWire),
    exitInterviews: arr(data.exit_interviews).map(exitInterviewFromWire),
    log: arr(data.log).map(logFromWire),
    today: str(data.today),
  };
}

// ───────────────────────────── request bodies ─────────────────────────────
export const pulseBody = (title: string, questions: { text: string; type: QType }[]): Row => ({
  title, questions: questions.map((q) => ({ text: q.text, type: q.type })),
});
export const responseBody = (teamId: string, answers: Record<string, AnswerValue | undefined>): Row => {
  const clean: Record<string, AnswerValue> = {};
  for (const [k, v] of Object.entries(answers)) if (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v !== '')) clean[k] = v;
  return { team_id: teamId, answers: clean };
};
export const kudosBody = (toId: string, valueId: string, message: string): Row => ({ to_id: toId, value_id: valueId, message });
export interface ExitBody { exitId?: string; employeeId?: string; label?: string; reasons: string[]; wouldReturn: WouldReturn; text?: string }
export const exitBody = (i: ExitBody): Row => ({
  ...(i.exitId ? { exit_id: i.exitId } : {}),
  ...(i.employeeId ? { employee_id: i.employeeId } : {}),
  ...(i.label ? { label: i.label } : {}),
  reasons: strs(i.reasons),
  would_return: i.wouldReturn,
  ...(i.text ? { text: i.text } : {}),
});
export const openExitBody = (employeeId?: string): Row => (employeeId ? { employee_id: employeeId } : {});
