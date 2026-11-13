// HRMS benefits API client (phase 7: the Benefits slice on the server). Thin, like lib/hrms/live/client.ts and the phase-6
// assetsClient.ts: it builds the request, unwraps `{ success, data }` and turns every failure into one HrmsApiError with a
// plain message. Shapes are mapped in benefitsWire.ts, not here.
//
// The bootstrap GET bypasses the shared GET cache (noCache), because that cache also mirrors small responses to
// localStorage; in live mode the benefits data must live in memory only, never in browser storage.

import api from '../../../api';
import { HrmsApiError } from '../../live/client';
import {
  benefitsBootstrapFromWire, claimResultFromWire, enrolmentFromWire, planFromWire, remindersResultFromWire, sendResultFromWire,
  windowResultFromWire, type BenefitsBootstrap, type Row, type SendResult,
} from './benefitsWire';
import type { Id, ISODate, Month } from '../../types';
import type { BenefitsWindow, Claim, ClaimStatus, Enrolment, Plan } from '../types';

const BASE = '/api/v1/hrms/benefits';
export const BENEFITS_NOT_READY_MESSAGE = 'HRMS storage is not set up yet on the server';

function toError(e: unknown): HrmsApiError {
  if (e instanceof HrmsApiError) return e;
  const err = e as { status?: unknown; message?: unknown } | null;
  const status = typeof err?.status === 'number' ? err.status : 0;
  const raw = typeof err?.message === 'string' && err.message ? err.message : '';
  if (status === 503 && /not set up/i.test(raw)) return new HrmsApiError(BENEFITS_NOT_READY_MESSAGE, 503, true);
  if (status === 0) {
    if (/unauthorized/i.test(raw)) return new HrmsApiError('Your session has expired. Sign in again.', 401);
    if (/timed out/i.test(raw)) return new HrmsApiError('The server took too long to answer.', 0);
    return new HrmsApiError('Could not reach the server.', 0);
  }
  return new HrmsApiError(raw || `The server answered ${status}.`, status);
}

/** Benefits-only trouble on the bootstrap: a server that predates the benefits tables answers 404 for the route, which reads
 * the same as "not set up yet". A 404 on a command is a real NOT_FOUND (an unknown claim), so only the bootstrap widens 404. */
function bootstrapError(e: unknown): HrmsApiError {
  const err = toError(e);
  if (err.notReady || err.status === 404) return new HrmsApiError(BENEFITS_NOT_READY_MESSAGE, err.status || 503, true);
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

export const benefitsApi = {
  async bootstrap(): Promise<BenefitsBootstrap> {
    try {
      const data = await call<Row>(() => api.get(`${BASE}/bootstrap`, { noCache: true } as RequestInit));
      return benefitsBootstrapFromWire(data ?? {});
    } catch (e) { throw bootstrapError(e); }
  },

  // ─── plans (simple records) ───
  async createPlan(body: Row): Promise<Plan> { return planFromWire(await call<Row>(() => api.post(`${BASE}/plans`, body)) ?? {}); },

  // ─── enrolments (simple records, upsert by employee) ───
  async submitEnrolment(body: Row): Promise<Enrolment> { return enrolmentFromWire(await call<Row>(() => api.post(`${BASE}/enrolments`, body)) ?? {}); },

  // ─── the window (part of the config singleton) ───
  async setWindow(body: Row): Promise<BenefitsWindow> { return windowResultFromWire(await call<Row>(() => api.put(`${BASE}/window`, body)) ?? {}); },
  async extendWindow(body: Row): Promise<BenefitsWindow> { return windowResultFromWire(await call<Row>(() => api.post(`${BASE}/window/extend`, body)) ?? {}); },

  // ─── reminders (part of the config singleton) ───
  async logReminders(body: Row): Promise<Record<Id, ISODate>> { return remindersResultFromWire(await call<Row>(() => api.post(`${BASE}/reminders`, body)) ?? {}); },

  // ─── claims (command style: the server returns the updated claim) ───
  async registerClaim(body: Row): Promise<Claim> { return claimResultFromWire(await call<Row>(() => api.post(`${BASE}/claims`, body)) ?? {}); },
  async moveClaim(id: string, body: Row): Promise<Claim> { return claimResultFromWire(await call<Row>(() => api.post(`${BASE}/claims/${enc(id)}/move`, body)) ?? {}); },

  // ─── send to payroll (command style: the server replaces the tagged adjustment rows and answers { removed, added, total }) ───
  async sendToPayroll(body: Row): Promise<SendResult> { return sendResultFromWire(await call<Row>(() => api.post(`${BASE}/send-to-payroll`, body)) ?? {}); },
};

export type { BenefitsWindow, Claim, ClaimStatus, Enrolment, Plan, Month };
