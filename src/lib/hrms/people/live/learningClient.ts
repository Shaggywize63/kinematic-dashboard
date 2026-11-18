// HRMS learning API client (phase 10: the Learning slice on the server). Thin, like the timesheets client: it builds the
// request, unwraps `{ success, data }` and turns every failure into one HrmsApiError with a plain message. Shapes are mapped
// in learningWire.ts, not here.
//
// The bootstrap GET bypasses the shared GET cache (noCache), because that cache also mirrors small responses to
// localStorage; in live mode the learning data must live in memory only, never in browser storage.

import api from '../../../api';
import { HrmsApiError } from '../../live/client';
import {
  assignmentFromWire, courseFromWire, learningBootstrapFromWire, quizAnswerFromWire, reminderFromWire,
  type LearningBootstrap, type QuizAnswer, type Row,
} from './learningWire';
import type { Assignment, Course, ReminderEntry } from '../types';

const BASE = '/api/v1/hrms/learning';
export const LEARNING_NOT_READY_MESSAGE = 'HRMS storage is not set up yet on the server';

function toError(e: unknown): HrmsApiError {
  if (e instanceof HrmsApiError) return e;
  const err = e as { status?: unknown; message?: unknown } | null;
  const status = typeof err?.status === 'number' ? err.status : 0;
  const raw = typeof err?.message === 'string' && err.message ? err.message : '';
  if (status === 503 && /not set up/i.test(raw)) return new HrmsApiError(LEARNING_NOT_READY_MESSAGE, 503, true);
  if (status === 0) {
    if (/unauthorized/i.test(raw)) return new HrmsApiError('Your session has expired. Sign in again.', 401);
    if (/timed out/i.test(raw)) return new HrmsApiError('The server took too long to answer.', 0);
    return new HrmsApiError('Could not reach the server.', 0);
  }
  return new HrmsApiError(raw || `The server answered ${status}.`, status);
}

/** On the bootstrap only, a 404 (a server that predates the learning tables) reads as "not set up yet". */
function bootstrapError(e: unknown): HrmsApiError {
  const err = toError(e);
  if (err.notReady || err.status === 404) return new HrmsApiError(LEARNING_NOT_READY_MESSAGE, err.status || 503, true);
  return err;
}

async function call<T>(run: () => Promise<unknown>): Promise<T> {
  try {
    const res = await run();
    const body = res as { data?: unknown } | undefined | null;
    return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
  } catch (e) {
    throw toError(e);
  }
}

const enc = encodeURIComponent;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

export const learningApi = {
  async bootstrap(): Promise<LearningBootstrap> {
    try {
      const data = await call<Row>(() => api.get(`${BASE}/bootstrap`, { noCache: true } as RequestInit));
      return learningBootstrapFromWire(data ?? {});
    } catch (e) { throw bootstrapError(e); }
  },
  async loadLibrary(): Promise<{ added: number; courses: Course[] }> {
    const d = (await call<Row>(() => api.post(`${BASE}/library`, {}))) ?? {};
    return { added: Number(d.added) || 0, courses: rows(d.courses).map(courseFromWire) };
  },
  async setRules(courseId: string, body: Row): Promise<Course> { return courseFromWire((await call<Row>(() => api.put(`${BASE}/courses/${enc(courseId)}/rules`, body))) ?? {}); },
  async assign(courseId: string, body: Row): Promise<{ created: number; skipped: number; assignments: Assignment[] }> {
    const d = (await call<Row>(() => api.post(`${BASE}/courses/${enc(courseId)}/assign`, body))) ?? {};
    return { created: Number(d.created) || 0, skipped: Number(d.skipped) || 0, assignments: rows(d.assignments).map(assignmentFromWire) };
  },
  async applyRules(): Promise<{ created: number; assignments: Assignment[] }> {
    const d = (await call<Row>(() => api.post(`${BASE}/rules/apply`, {}))) ?? {};
    return { created: Number(d.created) || 0, assignments: rows(d.assignments).map(assignmentFromWire) };
  },
  async lesson(assignmentId: string, body: Row): Promise<Assignment> { return assignmentFromWire((await call<Row>(() => api.post(`${BASE}/assignments/${enc(assignmentId)}/lesson`, body))) ?? {}); },
  async quiz(assignmentId: string, body: Row): Promise<QuizAnswer> { return quizAnswerFromWire((await call<Row>(() => api.post(`${BASE}/assignments/${enc(assignmentId)}/quiz`, body))) ?? {}); },
  async remind(assignmentId: string): Promise<ReminderEntry> { return reminderFromWire((await call<Row>(() => api.post(`${BASE}/assignments/${enc(assignmentId)}/remind`, {}))) ?? {}); },
  async refresher(certificateNumber: string): Promise<Assignment> { return assignmentFromWire((await call<Row>(() => api.post(`${BASE}/certificates/${enc(certificateNumber)}/refresher`, {}))) ?? {}); },
};
