// HRMS timesheets API client (phase 9: the Timesheets slice on the server). Thin, like the rewards clients: it builds the
// request, unwraps `{ success, data }` and turns every failure into one HrmsApiError with a plain message. Shapes are mapped
// in timesheetsWire.ts, not here.
//
// The bootstrap GET bypasses the shared GET cache (noCache), because that cache also mirrors small responses to
// localStorage; in live mode the timesheet data must live in memory only, never in browser storage.

import api from '../../../api';
import { HrmsApiError } from '../../live/client';
import {
  configFromWire, projectFromWire, sheetFromWire, timesheetsBootstrapFromWire, type ConfigResult, type Row, type TimesheetsBootstrap,
} from './timesheetsWire';
import type { Project, Sheet } from '../types';

const BASE = '/api/v1/hrms/timesheets';
export const TIMESHEETS_NOT_READY_MESSAGE = 'HRMS storage is not set up yet on the server';

function toError(e: unknown): HrmsApiError {
  if (e instanceof HrmsApiError) return e;
  const err = e as { status?: unknown; message?: unknown } | null;
  const status = typeof err?.status === 'number' ? err.status : 0;
  const raw = typeof err?.message === 'string' && err.message ? err.message : '';
  if (status === 503 && /not set up/i.test(raw)) return new HrmsApiError(TIMESHEETS_NOT_READY_MESSAGE, 503, true);
  if (status === 0) {
    if (/unauthorized/i.test(raw)) return new HrmsApiError('Your session has expired. Sign in again.', 401);
    if (/timed out/i.test(raw)) return new HrmsApiError('The server took too long to answer.', 0);
    return new HrmsApiError('Could not reach the server.', 0);
  }
  return new HrmsApiError(raw || `The server answered ${status}.`, status);
}

/** On the bootstrap only, a 404 (a server that predates the timesheet tables) reads as "not set up yet". */
function bootstrapError(e: unknown): HrmsApiError {
  const err = toError(e);
  if (err.notReady || err.status === 404) return new HrmsApiError(TIMESHEETS_NOT_READY_MESSAGE, err.status || 503, true);
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
const sheetPath = (employeeId: string, weekStart: string) => `${BASE}/sheets/${enc(employeeId)}/${enc(weekStart)}`;

export const timesheetsApi = {
  async bootstrap(): Promise<TimesheetsBootstrap> {
    try {
      const data = await call<Row>(() => api.get(`${BASE}/bootstrap`, { noCache: true } as RequestInit));
      return timesheetsBootstrapFromWire(data ?? {});
    } catch (e) { throw bootstrapError(e); }
  },
  async createProject(body: Row): Promise<Project> { return projectFromWire(await call<Row>(() => api.post(`${BASE}/projects`, body)) ?? {}); },
  async updateProject(id: string, body: Row): Promise<Project> { return projectFromWire(await call<Row>(() => api.put(`${BASE}/projects/${enc(id)}`, body)) ?? {}); },
  async setPolicy(body: Row): Promise<ConfigResult> { return configFromWire(await call<Row>(() => api.put(`${BASE}/policy`, body)) ?? {}); },
  async setTracked(body: Row): Promise<ConfigResult> { return configFromWire(await call<Row>(() => api.put(`${BASE}/tracked`, body)) ?? {}); },
  async saveLines(employeeId: string, weekStart: string, body: Row): Promise<Sheet> { return sheetFromWire(await call<Row>(() => api.put(sheetPath(employeeId, weekStart), body)) ?? {}); },
  async submit(employeeId: string, weekStart: string): Promise<Sheet> { return sheetFromWire(await call<Row>(() => api.post(`${sheetPath(employeeId, weekStart)}/submit`, {})) ?? {}); },
  async decide(employeeId: string, weekStart: string, body: Row): Promise<Sheet> { return sheetFromWire(await call<Row>(() => api.post(`${sheetPath(employeeId, weekStart)}/decide`, body)) ?? {}); },
};
