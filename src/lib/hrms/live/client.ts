// HRMS API client (phase 1: organisation and people). Thin: it builds the request, unwraps `{ success, data }` and turns
// every failure into one HrmsApiError with a plain message. The shapes are mapped in wire.ts, not here.
//
// Personal data: GETs here bypass the shared GET cache (noCache), because that cache also mirrors small responses to
// localStorage, and employee records must not be kept in browser storage.

import api from '../../api';
import {
  bootstrapFromWire, importFromWire, type ImportOutcome, type Row, type ServerData,
} from './wire';

const BASE = '/api/v1/hrms';

export type MasterKind = 'entities' | 'locations' | 'departments' | 'designations';

export class HrmsApiError extends Error {
  status: number;
  /** The server answered that the HRMS tables are not there yet (migration not applied). */
  notReady: boolean;
  constructor(message: string, status: number, notReady = false) {
    super(message);
    this.name = 'HrmsApiError';
    this.status = status;
    this.notReady = notReady;
  }
}

export const NOT_READY_MESSAGE = 'HRMS storage is not set up yet on the server';

function toError(e: unknown): HrmsApiError {
  if (e instanceof HrmsApiError) return e;
  const err = e as { status?: unknown; message?: unknown } | null;
  const status = typeof err?.status === 'number' ? err.status : 0;
  const raw = typeof err?.message === 'string' && err.message ? err.message : '';
  // The server's 503 for missing tables is JSON ({ code: 'HRMS_NOT_READY', error: 'HRMS storage is not set up yet' }); the shared
  // client keeps only the message and the status, so match on the message. A bare gateway 503 is not "not set up".
  if (status === 503 && /not set up/i.test(raw)) return new HrmsApiError(NOT_READY_MESSAGE, 503, true);
  if (status === 0) {
    if (/unauthorized/i.test(raw)) return new HrmsApiError('Your session has expired. Sign in again.', 401);
    if (/timed out/i.test(raw)) return new HrmsApiError('The server took too long to answer.', 0);
    return new HrmsApiError('Could not reach the server.', 0);
  }
  return new HrmsApiError(raw || `The server answered ${status}.`, status);
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

export const hrmsApi = {
  async bootstrap(): Promise<ServerData> {
    const data = await call<Row>(() => api.get(`${BASE}/bootstrap`, { noCache: true } as RequestInit));
    return bootstrapFromWire(data ?? {});
  },

  create: (kind: MasterKind | 'employees', body: Row): Promise<Row> => call<Row>(() => api.post(`${BASE}/${kind}`, body)),
  update: (kind: MasterKind | 'employees', id: string, body: Row): Promise<Row> => call<Row>(() => api.put(`${BASE}/${kind}/${id}`, body)),
  remove: (kind: MasterKind | 'employees', id: string): Promise<Row> => call<Row>(() => api.delete(`${BASE}/${kind}/${id}`)),

  addDocument: (employeeId: string, body: Row): Promise<Row> => call<Row>(() => api.post(`${BASE}/employees/${employeeId}/documents`, body)),
  updateDocument: (employeeId: string, docId: string, body: Row): Promise<Row> => call<Row>(() => api.put(`${BASE}/employees/${employeeId}/documents/${docId}`, body)),
  removeDocument: (employeeId: string, docId: string): Promise<Row> => call<Row>(() => api.delete(`${BASE}/employees/${employeeId}/documents/${docId}`)),

  /** One reason-gated read of a sensitive value. The server writes who, when and why to its access log before it answers. */
  reveal: (employeeId: string, field: 'pan' | 'bank' | 'aadhaar', reason: string): Promise<{ field: string; value: unknown }> =>
    call(() => api.post(`${BASE}/employees/${employeeId}/reveal`, { field, reason })),

  async importEmployees(rows: Row[], dryRun = false): Promise<ImportOutcome> {
    const data = await call<Row>(() => api.post(`${BASE}/employees/import`, { rows, dry_run: dryRun }));
    return importFromWire(data ?? {});
  },
};
