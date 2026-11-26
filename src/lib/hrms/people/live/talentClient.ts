// HRMS talent API client (phase 12: the Talent slice on the server). Thin, like the engagement client: it builds the
// request, unwraps `{ success, data }` and turns every failure into one HrmsApiError with a plain message. Shapes are
// mapped in talentWire.ts, not here.
//
// The bootstrap GET bypasses the shared GET cache (noCache), because that cache also mirrors small responses to
// localStorage; in live mode the talent data must live in memory only, never in browser storage.

import api from '../../../api';
import { HrmsApiError } from '../../live/client';
import {
  logFromWire, placementValueFromWire, ratingResultFromWire, roleFromWire, talentBootstrapFromWire,
  type RatingResult, type Row, type TalentBootstrap,
} from './talentWire';
import type { CriticalRole, LogEntry, Placement } from '../types';

const BASE = '/api/v1/hrms/talent';
export const TALENT_NOT_READY_MESSAGE = 'HRMS storage is not set up yet on the server';

function toError(e: unknown): HrmsApiError {
  if (e instanceof HrmsApiError) return e;
  const err = e as { status?: unknown; message?: unknown } | null;
  const status = typeof err?.status === 'number' ? err.status : 0;
  const raw = typeof err?.message === 'string' && err.message ? err.message : '';
  if (status === 503 && /not set up/i.test(raw)) return new HrmsApiError(TALENT_NOT_READY_MESSAGE, 503, true);
  if (status === 0) {
    if (/unauthorized/i.test(raw)) return new HrmsApiError('Your session has expired. Sign in again.', 401);
    if (/timed out/i.test(raw)) return new HrmsApiError('The server took too long to answer.', 0);
    return new HrmsApiError('Could not reach the server.', 0);
  }
  return new HrmsApiError(raw || `The server answered ${status}.`, status);
}

/** On the bootstrap only, a 404 (a server that predates the talent tables) reads as "not set up yet". */
function bootstrapError(e: unknown): HrmsApiError {
  const err = toError(e);
  if (err.notReady || err.status === 404) return new HrmsApiError(TALENT_NOT_READY_MESSAGE, err.status || 503, true);
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

export interface ClearResult { employeeId: string; cleared: boolean }

export const talentApi = {
  async bootstrap(): Promise<TalentBootstrap> {
    try {
      const data = await call<Row>(() => api.get(`${BASE}/bootstrap`, { noCache: true } as RequestInit));
      return talentBootstrapFromWire(data ?? {});
    } catch (e) { throw bootstrapError(e); }
  },
  async setRating(body: Row): Promise<RatingResult> { return ratingResultFromWire((await call<Row>(() => api.post(`${BASE}/ratings`, body))) ?? {}); },
  async addSuccessor(roleId: string, body: Row): Promise<CriticalRole> { return roleFromWire((await call<Row>(() => api.post(`${BASE}/roles/${enc(roleId)}/successors`, body))) ?? {}); },
  async removeSuccessor(roleId: string, body: Row): Promise<CriticalRole> { return roleFromWire((await call<Row>(() => api.post(`${BASE}/roles/${enc(roleId)}/successors/remove`, body))) ?? {}); },
  async setReadiness(roleId: string, body: Row): Promise<CriticalRole> { return roleFromWire((await call<Row>(() => api.post(`${BASE}/roles/${enc(roleId)}/successors/readiness`, body))) ?? {}); },
  async placeEmployee(body: Row): Promise<Placement> { return placementValueFromWire((await call<Row>(() => api.post(`${BASE}/placements`, body))) ?? {}); },
  async clearPlacement(body: Row): Promise<ClearResult> {
    const d = (await call<Row>(() => api.post(`${BASE}/placements/remove`, body))) ?? {};
    return { employeeId: String(d.employee_id ?? ''), cleared: !!d.cleared };
  },
  async reviewOpened(body: Row): Promise<LogEntry | null> {
    const d = (await call<Row>(() => api.post(`${BASE}/review-opened`, body))) ?? {};
    return d && d.id ? logFromWire(d) : null;
  },
};
