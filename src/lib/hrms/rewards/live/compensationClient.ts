// HRMS compensation API client (phase 8: the Compensation slice on the server). Thin, like the phase-6 assetsClient.ts and
// the phase-7 benefitsClient.ts: it builds the request, unwraps `{ success, data }` and turns every failure into one
// HrmsApiError with a plain message. Shapes are mapped in compensationWire.ts, not here.
//
// The bootstrap GET bypasses the shared GET cache (noCache), because that cache also mirrors small responses to
// localStorage; in live mode the compensation data must live in memory only, never in browser storage.

import api from '../../../api';
import { HrmsApiError } from '../../live/client';
import {
  bandFromWire, compensationBootstrapFromWire, cycleResultFromWire, perfResultFromWire, seedResultFromWire,
  type CompensationBootstrap, type PerfResult, type Row, type SeedResult,
} from './compensationWire';
import type { Band, MeritCycle } from '../types';

const BASE = '/api/v1/hrms/compensation';
export const COMPENSATION_NOT_READY_MESSAGE = 'HRMS storage is not set up yet on the server';

function toError(e: unknown): HrmsApiError {
  if (e instanceof HrmsApiError) return e;
  const err = e as { status?: unknown; message?: unknown } | null;
  const status = typeof err?.status === 'number' ? err.status : 0;
  const raw = typeof err?.message === 'string' && err.message ? err.message : '';
  if (status === 503 && /not set up/i.test(raw)) return new HrmsApiError(COMPENSATION_NOT_READY_MESSAGE, 503, true);
  if (status === 0) {
    if (/unauthorized/i.test(raw)) return new HrmsApiError('Your session has expired. Sign in again.', 401);
    if (/timed out/i.test(raw)) return new HrmsApiError('The server took too long to answer.', 0);
    return new HrmsApiError('Could not reach the server.', 0);
  }
  return new HrmsApiError(raw || `The server answered ${status}.`, status);
}

/** Compensation-only trouble on the bootstrap: a server that predates the compensation tables answers 404 for the route,
 * which reads the same as "not set up yet". A 404 on a command is a real NOT_FOUND (an unknown grade), so only the
 * bootstrap widens 404. */
function bootstrapError(e: unknown): HrmsApiError {
  const err = toError(e);
  if (err.notReady || err.status === 404) return new HrmsApiError(COMPENSATION_NOT_READY_MESSAGE, err.status || 503, true);
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

export const compensationApi = {
  async bootstrap(): Promise<CompensationBootstrap> {
    try {
      const data = await call<Row>(() => api.get(`${BASE}/bootstrap`, { noCache: true } as RequestInit));
      return compensationBootstrapFromWire(data ?? {});
    } catch (e) { throw bootstrapError(e); }
  },

  // ─── pay bands (simple records, keyed by grade) ───
  async seedBands(): Promise<SeedResult> { return seedResultFromWire(await call<Row>(() => api.post(`${BASE}/bands/seed`, {})) ?? {}); },
  async saveBand(grade: string, body: Row): Promise<Band> { return bandFromWire(await call<Row>(() => api.put(`${BASE}/bands/${enc(grade)}`, body)) ?? {}); },
  async setPublished(grade: string, body: Row): Promise<Band> { return bandFromWire(await call<Row>(() => api.put(`${BASE}/bands/${enc(grade)}/published`, body)) ?? {}); },

  // ─── performance band + the employee's reply (one row per person; each field saved on its own) ───
  async setPerf(employeeId: string, body: Row): Promise<PerfResult> { return perfResultFromWire(await call<Row>(() => api.put(`${BASE}/perf/${enc(employeeId)}`, body)) ?? {}); },
  async setPerfReply(employeeId: string, body: Row): Promise<PerfResult> { return perfResultFromWire(await call<Row>(() => api.put(`${BASE}/perf/${enc(employeeId)}/reply`, body)) ?? {}); },

  // ─── the merit cycle (a singleton; every call answers the whole cycle) ───
  async updateCycle(body: Row): Promise<MeritCycle> { return cycleResultFromWire(await call<Row>(() => api.put(`${BASE}/cycle`, body)) ?? {}); },
  async setGuideline(body: Row): Promise<MeritCycle> { return cycleResultFromWire(await call<Row>(() => api.put(`${BASE}/cycle/guidelines`, body)) ?? {}); },
  async setProposal(employeeId: string, body: Row): Promise<MeritCycle> { return cycleResultFromWire(await call<Row>(() => api.put(`${BASE}/cycle/proposals/${enc(employeeId)}`, body)) ?? {}); },
  async submit(): Promise<MeritCycle> { return cycleResultFromWire(await call<Row>(() => api.post(`${BASE}/cycle/submit`, {})) ?? {}); },
  async decide(body: Row): Promise<MeritCycle> { return cycleResultFromWire(await call<Row>(() => api.post(`${BASE}/cycle/decide`, body)) ?? {}); },
  async reopen(): Promise<MeritCycle> { return cycleResultFromWire(await call<Row>(() => api.post(`${BASE}/cycle/reopen`, {})) ?? {}); },
  async recordApplied(employeeId: string, body: Row): Promise<MeritCycle> { return cycleResultFromWire(await call<Row>(() => api.post(`${BASE}/cycle/applied/${enc(employeeId)}`, body)) ?? {}); },
};
