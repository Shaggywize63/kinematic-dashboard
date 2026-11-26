// HRMS engagement API client (phase 11: the Engagement slice on the server). Thin, like the learning client: it builds the
// request, unwraps `{ success, data }` and turns every failure into one HrmsApiError with a plain message. Shapes are mapped
// in engagementWire.ts, not here.
//
// The bootstrap GET bypasses the shared GET cache (noCache), because that cache also mirrors small responses to
// localStorage; in live mode the engagement data must live in memory only, never in browser storage.

import api from '../../../api';
import { HrmsApiError } from '../../live/client';
import {
  engagementBootstrapFromWire, exitInterviewFromWire, kudosFromWire, logFromWire, responseFromWire, surveyFromWire,
  type EngagementBootstrap, type Row,
} from './engagementWire';
import type { ExitInterview, Kudos, LogEntry, Survey, SurveyResponse } from '../types';

const BASE = '/api/v1/hrms/engagement';
export const ENGAGEMENT_NOT_READY_MESSAGE = 'HRMS storage is not set up yet on the server';

function toError(e: unknown): HrmsApiError {
  if (e instanceof HrmsApiError) return e;
  const err = e as { status?: unknown; message?: unknown } | null;
  const status = typeof err?.status === 'number' ? err.status : 0;
  const raw = typeof err?.message === 'string' && err.message ? err.message : '';
  if (status === 503 && /not set up/i.test(raw)) return new HrmsApiError(ENGAGEMENT_NOT_READY_MESSAGE, 503, true);
  if (status === 0) {
    if (/unauthorized/i.test(raw)) return new HrmsApiError('Your session has expired. Sign in again.', 401);
    if (/timed out/i.test(raw)) return new HrmsApiError('The server took too long to answer.', 0);
    return new HrmsApiError('Could not reach the server.', 0);
  }
  return new HrmsApiError(raw || `The server answered ${status}.`, status);
}

/** On the bootstrap only, a 404 (a server that predates the engagement tables) reads as "not set up yet". */
function bootstrapError(e: unknown): HrmsApiError {
  const err = toError(e);
  if (err.notReady || err.status === 404) return new HrmsApiError(ENGAGEMENT_NOT_READY_MESSAGE, err.status || 503, true);
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

export const engagementApi = {
  async bootstrap(): Promise<EngagementBootstrap> {
    try {
      const data = await call<Row>(() => api.get(`${BASE}/bootstrap`, { noCache: true } as RequestInit));
      return engagementBootstrapFromWire(data ?? {});
    } catch (e) { throw bootstrapError(e); }
  },
  async sendPulse(body: Row): Promise<Survey> { return surveyFromWire((await call<Row>(() => api.post(`${BASE}/surveys`, body))) ?? {}); },
  async closeSurvey(surveyId: string): Promise<Survey> { return surveyFromWire((await call<Row>(() => api.post(`${BASE}/surveys/${enc(surveyId)}/close`, {}))) ?? {}); },
  async submitResponse(surveyId: string, body: Row): Promise<SurveyResponse> { return responseFromWire((await call<Row>(() => api.post(`${BASE}/surveys/${enc(surveyId)}/responses`, body))) ?? {}); },
  async giveKudos(body: Row): Promise<Kudos> { return kudosFromWire((await call<Row>(() => api.post(`${BASE}/kudos`, body))) ?? {}); },
  async completeExit(body: Row): Promise<ExitInterview> { return exitInterviewFromWire((await call<Row>(() => api.post(`${BASE}/exit-interviews`, body))) ?? {}); },
  async openExit(body: Row): Promise<LogEntry | null> {
    const d = (await call<Row>(() => api.post(`${BASE}/exit-interviews/opened`, body))) ?? {};
    return d && d.id ? logFromWire(d) : null;
  },
};
