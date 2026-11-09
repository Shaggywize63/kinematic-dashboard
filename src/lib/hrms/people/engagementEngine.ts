// Engagement: team-level pulse results, recognition counts and exit-interview themes. Pure functions.
// The rules live here, not in the screens, so they are tested and cannot be bypassed by a page:
//  - a result is shown only for a group with at least MIN_RESPONSES answers;
//  - a comment never carries any attribute of the person who wrote it, and names, contacts and places are removed;
//  - exit-interview themes appear only once MIN_INTERVIEWS interviews are complete.
// There is no per-person result anywhere: a response does not even store who wrote it.

import type { Employee, Id } from '../types';
import { teamOf, type Team } from './teams';
import type { AnswerValue, ExitInterview, Kudos, Survey, SurveyQuestion, SurveyResponse } from './types';

export const MIN_RESPONSES = 5;
export const MIN_INTERVIEWS = 5;
export const NOT_ENOUGH = 'Not enough responses to show';
export const COMPANY = 'company';

export function responsesIn(responses: SurveyResponse[], surveyId: Id, teamId: Id | typeof COMPANY): SurveyResponse[] {
  return responses.filter((r) => r.surveyId === surveyId && (teamId === COMPANY || r.teamId === teamId));
}

const isRating = (v: AnswerValue | undefined): v is number => typeof v === 'number' && v >= 1 && v <= 5;

export interface RatingResult { type: 'rating'; n: number; shown: boolean; avg?: number; dist?: number[] }
export interface YesNoResult { type: 'yesno'; n: number; shown: boolean; yesPct?: number }
export interface TextResult { type: 'text'; n: number; shown: boolean; comments: string[] }
export type QuestionResult = RatingResult | YesNoResult | TextResult;

/** Words and patterns that point to a person: e-mail, phone numbers, and any extra terms given (names, sites). */
export function redactComment(text: string, terms: string[] = []): string {
  let out = text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[removed]').replace(/\+?\d(?:[\s-]?\d){6,}/g, '[removed]');
  const clean = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 3))].sort((a, b) => b.length - a.length);
  for (const t of clean) out = out.replace(new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '[removed]');
  return out.replace(/\s+/g, ' ').trim();
}

/** Stable order that does not follow the order people answered in, so a comment cannot be tied to a time of submission. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function questionResult(q: SurveyQuestion, group: SurveyResponse[], redactTerms: string[] = []): QuestionResult {
  if (q.type === 'rating') {
    const vals = group.map((r) => r.answers[q.id]).filter(isRating);
    const shown = vals.length >= MIN_RESPONSES;
    if (!shown) return { type: 'rating', n: vals.length, shown };
    const dist = [1, 2, 3, 4, 5].map((k) => vals.filter((v) => v === k).length);
    return { type: 'rating', n: vals.length, shown, avg: vals.reduce((t, v) => t + v, 0) / vals.length, dist };
  }
  if (q.type === 'yesno') {
    const vals = group.map((r) => r.answers[q.id]).filter((v): v is boolean => typeof v === 'boolean');
    const shown = vals.length >= MIN_RESPONSES;
    return shown ? { type: 'yesno', n: vals.length, shown, yesPct: Math.round((vals.filter(Boolean).length / vals.length) * 100) } : { type: 'yesno', n: vals.length, shown };
  }
  // Free text: the group must have enough responses overall, not just enough comments, before any comment is shown.
  const shown = group.length >= MIN_RESPONSES;
  if (!shown) return { type: 'text', n: group.length, shown, comments: [] };
  const comments = group
    .map((r) => r.answers[q.id])
    .filter((v): v is string => typeof v === 'string')
    .map((t) => redactComment(t, redactTerms))
    .filter((t) => t.length >= 3)
    .sort((a, b) => hash(a) - hash(b) || a.localeCompare(b));
  return { type: 'text', n: group.length, shown, comments };
}

/** Engagement index: the average of all rating answers in the group, 1 to 5. Null below the minimum group size. */
export function engagementIndex(survey: Survey, group: SurveyResponse[]): { index: number | null; n: number } {
  const ratingQs = survey.questions.filter((q) => q.type === 'rating');
  const vals: number[] = [];
  for (const r of group) for (const q of ratingQs) { const v = r.answers[q.id]; if (isRating(v)) vals.push(v); }
  if (group.length < MIN_RESPONSES || vals.length < MIN_RESPONSES) return { index: null, n: group.length };
  return { index: vals.reduce((t, v) => t + v, 0) / vals.length, n: group.length };
}

export interface TrendPoint { surveyId: Id; label: string; index: number | null; n: number }
export interface TrendSeries { id: Id | typeof COMPANY; name: string; points: TrendPoint[] }
/** The last `count` pulses, oldest first, one series for the company and one per team. Hidden points are null. */
export function trendSeries(surveys: Survey[], responses: SurveyResponse[], teams: Team[], count = 4): TrendSeries[] {
  const last = [...surveys].sort((a, b) => a.sentOn.localeCompare(b.sentOn)).slice(-count);
  const make = (id: Id | typeof COMPANY, name: string): TrendSeries => ({
    id, name,
    points: last.map((s) => { const r = engagementIndex(s, responsesIn(responses, s.id, id)); return { surveyId: s.id, label: s.title.replace(/ pulse$/i, ''), index: r.index, n: r.n }; }),
  });
  return [make(COMPANY, 'Whole company'), ...teams.map((t) => make(t.id, t.name))];
}

export interface Highlight { scope: string; question: string; from: number; to: number; delta: number; nNow: number; nBefore: number; direction: 'improved' | 'declined' }
/** Rating questions that moved by at least `minDelta` between the last two pulses, for groups shown in both. */
export function highlights(surveys: Survey[], responses: SurveyResponse[], teams: Team[], minDelta = 0.2): Highlight[] {
  const sorted = [...surveys].sort((a, b) => a.sentOn.localeCompare(b.sentOn));
  if (sorted.length < 2) return [];
  const now = sorted[sorted.length - 1]!;
  const before = sorted[sorted.length - 2]!;
  const out: Highlight[] = [];
  const scopes: { id: Id | typeof COMPANY; name: string }[] = [{ id: COMPANY, name: 'Whole company' }, ...teams.map((t) => ({ id: t.id, name: t.name }))];
  for (const q of now.questions.filter((x) => x.type === 'rating')) {
    const qBefore = before.questions.find((x) => x.id === q.id && x.type === 'rating');
    if (!qBefore) continue;
    for (const sc of scopes) {
      const a = questionResult(qBefore, responsesIn(responses, before.id, sc.id));
      const b = questionResult(q, responsesIn(responses, now.id, sc.id));
      if (a.type !== 'rating' || b.type !== 'rating' || !a.shown || !b.shown) continue;
      const delta = (b.avg ?? 0) - (a.avg ?? 0);
      if (Math.abs(delta) < minDelta) continue;
      out.push({ scope: sc.name, question: q.text, from: a.avg ?? 0, to: b.avg ?? 0, delta, nNow: b.n, nBefore: a.n, direction: delta > 0 ? 'improved' : 'declined' });
    }
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

/** Validate a survey a person is building. Returns a list of plain-language problems. */
export function validateSurvey(title: string, questions: { text: string; type: string }[]): string[] {
  const problems: string[] = [];
  if (title.trim().length < 3) problems.push('Give the pulse a name.');
  if (questions.length === 0) problems.push('Add at least one question.');
  if (questions.length > 5) problems.push('A pulse has at most 5 questions.');
  questions.forEach((q, i) => { if (q.text.trim().length < 5) problems.push(`Question ${i + 1} needs some text.`); });
  return problems;
}

// ───────────────────────────── recognition ─────────────────────────────
export interface MonthCounts { month: string; label: string; counts: Record<Id, number>; total: number }
/** Recognitions received per team per month, in a fixed team order. Never sorted by count and never by person. */
export function kudosByMonth(kudos: Kudos[], employees: Employee[], teams: Team[], months: string[]): MonthCounts[] {
  const byId = new Map(employees.map((e) => [e.id, e]));
  return months.map((month) => {
    const counts: Record<Id, number> = Object.fromEntries(teams.map((t) => [t.id, 0]));
    let total = 0;
    for (const k of kudos) {
      if (k.on.slice(0, 7) !== month) continue;
      const e = byId.get(k.toId);
      const t = e ? teamOf(e) : undefined;
      total += 1;
      if (t) counts[t.id] = (counts[t.id] ?? 0) + 1;
    }
    return { month, label: month, counts, total };
  });
}

// ───────────────────────────── exit interviews ─────────────────────────────
export const EXIT_REASONS = [
  'Better pay elsewhere', 'Career growth', 'Manager relationship', 'Workload or hours', 'Relocation', 'Further studies',
  'Health or family', 'Role not as expected', 'Company direction', 'Other',
] as const;

export interface ExitThemes {
  completed: number;
  shown: boolean;
  reasons: { reason: string; count: number; pct: number }[];
  wouldReturn: Record<'yes' | 'maybe' | 'no', number>;
}
export function exitThemes(interviews: ExitInterview[]): ExitThemes {
  const completed = interviews.length;
  const wouldReturn = { yes: 0, maybe: 0, no: 0 };
  if (completed < MIN_INTERVIEWS) return { completed, shown: false, reasons: [], wouldReturn };
  const counts = new Map<string, number>();
  for (const i of interviews) {
    wouldReturn[i.wouldReturn] += 1;
    for (const r of new Set(i.reasons)) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const reasons = [...counts.entries()].map(([reason, count]) => ({ reason, count, pct: Math.round((count / completed) * 100) })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  return { completed, shown: true, reasons, wouldReturn };
}
