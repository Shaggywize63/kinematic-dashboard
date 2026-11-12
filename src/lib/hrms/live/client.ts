// HRMS API client (phase 1: organisation and people). Thin: it builds the request, unwraps `{ success, data }` and turns
// every failure into one HrmsApiError with a plain message. The shapes are mapped in wire.ts, not here.
//
// Personal data: GETs here bypass the shared GET cache (noCache), because that cache also mirrors small responses to
// localStorage, and employee records must not be kept in browser storage.

import api from '../../api';
import {
  bootstrapFromWire, importFromWire, type ImportOutcome, type Row, type ServerData,
} from './wire';
import {
  bankFileFromWire, checksFromWire, ecrFromWire, fnfFromWire, fnfResultFromWire, payrollFromWire, runFlagFromWire, runFromWire,
  type BankFileData, type EcrData, type PayrollData, type RunFlag,
} from './payrollWire';
import { timeFromWire, type TimeData } from './timeWire';
import { lifecycleFromWire, type LifecycleData } from './lifecycleWire';
import { accessLogFromWire, privacyFromWire, type PrivacyData } from './privacyWire';
import type { FnfResult, PreRunCheck } from '../engine';
import type { AccessLogEntry, FnfCase, PayRun } from '../types';

const BASE = '/api/v1/hrms';

export type MasterKind = 'entities' | 'locations' | 'departments' | 'designations';
/** The payroll records the diff-sync saves one by one. Attendance and the payroll settings have their own calls. */
export type PayrollKind = 'structures' | 'adjustments' | 'loans' | 'fnf';
/** The time-and-leave records the diff-sync saves one by one. The roster and balances have their own two-key PUT. */
export type TimeKind = 'shifts' | 'leave-types' | 'holiday-lists';
/** The lifecycle records the diff-sync saves one by one (all ordinary {id} rows). */
export type LifecycleKind = 'onboarding' | 'exits' | 'letter-templates' | 'letters';
/** The privacy records the diff-sync saves one by one (all ordinary {id} rows). */
export type PrivacyKind = 'compliance' | 'consents' | 'retention';
/** The commands on a pay run. Each one is a call to the server whose answer replaces the run held here. */
export type RunCommand = 'compute' | 'freeze' | 'unfreeze' | 'mark-paid';

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
export const PAYROLL_NOT_READY_MESSAGE = 'Payroll storage is not set up yet on the server';
export const TIME_NOT_READY_MESSAGE = 'Time and leave storage is not set up yet on the server';
export const LIFECYCLE_NOT_READY_MESSAGE = 'Lifecycle storage is not set up yet on the server';
export const PRIVACY_NOT_READY_MESSAGE = 'Privacy storage is not set up yet on the server';

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

const PAYROLL = `${BASE}/payroll`;
const TIME = `${BASE}/time`;
const LIFECYCLE = `${BASE}/lifecycle`;
const PRIVACY = `${BASE}/privacy`;
const enc = encodeURIComponent;

/** Payroll-only trouble: a server that predates payroll answers 404 for the route, which reads the same as "not set up yet". */
function payrollError(e: unknown): HrmsApiError {
  const err = toError(e);
  if (err.notReady || err.status === 404) return new HrmsApiError(PAYROLL_NOT_READY_MESSAGE, err.status || 503, true);
  return err;
}

/** Time-only trouble: a server that predates the time tables answers 404 or 503, which both read as "not set up yet". */
function timeError(e: unknown): HrmsApiError {
  const err = toError(e);
  if (err.notReady || err.status === 404) return new HrmsApiError(TIME_NOT_READY_MESSAGE, err.status || 503, true);
  return err;
}

/** Lifecycle-only trouble: a server that predates the lifecycle tables answers 404 or 503, both reading as "not set up yet". */
function lifecycleError(e: unknown): HrmsApiError {
  const err = toError(e);
  if (err.notReady || err.status === 404) return new HrmsApiError(LIFECYCLE_NOT_READY_MESSAGE, err.status || 503, true);
  return err;
}

/** Privacy-only trouble: a server that predates the privacy tables answers 404 or 503, both reading as "not set up yet". */
function privacyError(e: unknown): HrmsApiError {
  const err = toError(e);
  if (err.notReady || err.status === 404) return new HrmsApiError(PRIVACY_NOT_READY_MESSAGE, err.status || 503, true);
  return err;
}

// Salary data: every payroll read bypasses the shared GET cache (noCache), because that cache also mirrors small responses to
// localStorage. Payslips, salary structures and bank files must never reach browser storage.
const payrollGet = <T,>(path: string): Promise<T> => call<T>(() => api.get(`${PAYROLL}${path}`, { noCache: true } as RequestInit));

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

  payroll: {
    async bootstrap(): Promise<PayrollData> {
      try {
        const data = await call<Row>(() => api.get(`${PAYROLL}/bootstrap?months=12`, { noCache: true } as RequestInit));
        return payrollFromWire(data ?? {});
      } catch (e) { throw payrollError(e); }
    },

    /** Structures, adjustments, loans and settlements: create, change and remove one record. */
    create: (kind: PayrollKind, body: Row): Promise<Row> => call<Row>(() => api.post(`${PAYROLL}/${kind}`, body)),
    update: (kind: PayrollKind, id: string, body: Row): Promise<Row> => call<Row>(() => api.put(`${PAYROLL}/${kind}/${enc(id)}`, body)),
    remove: (kind: PayrollKind, id: string): Promise<Row> => call<Row>(() => api.delete(`${PAYROLL}/${kind}/${enc(id)}`)),
    /** One attendance row per employee and month: a create and an update are the same call. */
    putAttendance: (employeeId: string, month: string, body: Row): Promise<Row> => call<Row>(() => api.put(`${PAYROLL}/attendance/${enc(employeeId)}/${enc(month)}`, body)),
    putSettings: (body: Row): Promise<Row> => call<Row>(() => api.put(`${PAYROLL}/settings/payroll`, body)),

    /** GET /runs: runs without payslips. Used to refresh the "inputs changed" flag of the runs already held. */
    async runFlags(): Promise<RunFlag[]> {
      const data = await payrollGet<unknown>('/runs').catch((e) => { throw toError(e); });
      const list = Array.isArray(data) ? data : (data as { runs?: unknown } | null)?.runs;
      return (Array.isArray(list) ? list : []).filter((x): x is Row => !!x && typeof x === 'object').map(runFlagFromWire);
    },
    async run(id: string): Promise<PayRun> { return runFromWire(await payrollGet<Row>(`/runs/${enc(id)}`).catch((e) => { throw toError(e); }) ?? {}); },
    async createRun(body: Row): Promise<PayRun> { return runFromWire(await call<Row>(() => api.post(`${PAYROLL}/runs`, body)) ?? {}); },
    async runCommand(id: string, command: RunCommand, body?: Row): Promise<PayRun> {
      return runFromWire(await call<Row>(() => api.post(`${PAYROLL}/runs/${enc(id)}/${command}`, body ?? {})) ?? {});
    },
    async checks(id: string): Promise<PreRunCheck[]> { return checksFromWire(await payrollGet<Row>(`/runs/${enc(id)}/checks`).catch((e) => { throw toError(e); }) ?? {}); },
    async ecr(id: string): Promise<EcrData> { return ecrFromWire(await payrollGet<Row>(`/runs/${enc(id)}/ecr`).catch((e) => { throw toError(e); }) ?? {}); },
    /** The bank file with full account numbers. The server records who asked for it, so call it only when the file is wanted. */
    async bankFile(id: string): Promise<BankFileData> { return bankFileFromWire(await payrollGet<Row>(`/runs/${enc(id)}/bank-file`).catch((e) => { throw toError(e); }) ?? {}); },

    async fnfCommand(id: string, command: 'approve' | 'mark-paid'): Promise<FnfCase> {
      return fnfFromWire(await call<Row>(() => api.post(`${PAYROLL}/fnf/${enc(id)}/${command}`, {})) ?? {});
    },
    async fnfCompute(id: string): Promise<FnfResult> { return fnfResultFromWire(await payrollGet<Row>(`/fnf/${enc(id)}/compute`).catch((e) => { throw toError(e); }) ?? {}); },
  },

  time: {
    async bootstrap(): Promise<TimeData> {
      try {
        const data = await call<Row>(() => api.get(`${TIME}/bootstrap`, { noCache: true } as RequestInit));
        return timeFromWire(data ?? {});
      } catch (e) { throw timeError(e); }
    },

    /** Shifts, leave types and holiday lists: create, change and remove one record. */
    create: (kind: TimeKind, body: Row): Promise<Row> => call<Row>(() => api.post(`${TIME}/${kind}`, body)),
    update: (kind: TimeKind, id: string, body: Row): Promise<Row> => call<Row>(() => api.put(`${TIME}/${kind}/${enc(id)}`, body)),
    remove: (kind: TimeKind, id: string): Promise<Row> => call<Row>(() => api.delete(`${TIME}/${kind}/${enc(id)}`)),
    /** One roster row per employee and week; a create and an update are the same PUT. */
    putRoster: (employeeId: string, weekStart: string, body: Row): Promise<Row> => call<Row>(() => api.put(`${TIME}/roster/${enc(employeeId)}/${enc(weekStart)}`, body)),
    /** One leave balance per employee and leave type; a create and an update are the same PUT. */
    putBalance: (employeeId: string, leaveTypeId: string, body: Row): Promise<Row> => call<Row>(() => api.put(`${TIME}/balances/${enc(employeeId)}/${enc(leaveTypeId)}`, body)),
  },

  lifecycle: {
    async bootstrap(): Promise<LifecycleData> {
      try {
        const data = await call<Row>(() => api.get(`${LIFECYCLE}/bootstrap`, { noCache: true } as RequestInit));
        return lifecycleFromWire(data ?? {});
      } catch (e) { throw lifecycleError(e); }
    },

    /** Onboarding cases, exit cases, letter templates and issued letters: create, change and remove one record. */
    create: (kind: LifecycleKind, body: Row): Promise<Row> => call<Row>(() => api.post(`${LIFECYCLE}/${kind}`, body)),
    update: (kind: LifecycleKind, id: string, body: Row): Promise<Row> => call<Row>(() => api.put(`${LIFECYCLE}/${kind}/${enc(id)}`, body)),
    remove: (kind: LifecycleKind, id: string): Promise<Row> => call<Row>(() => api.delete(`${LIFECYCLE}/${kind}/${enc(id)}`)),
  },

  privacy: {
    async bootstrap(): Promise<PrivacyData> {
      try {
        const data = await call<Row>(() => api.get(`${PRIVACY}/bootstrap`, { noCache: true } as RequestInit));
        return privacyFromWire(data ?? {});
      } catch (e) { throw privacyError(e); }
    },

    /** Compliance tasks, consent records and retention rules: create, change and remove one record. */
    create: (kind: PrivacyKind, body: Row): Promise<Row> => call<Row>(() => api.post(`${PRIVACY}/${kind}`, body)),
    update: (kind: PrivacyKind, id: string, body: Row): Promise<Row> => call<Row>(() => api.put(`${PRIVACY}/${kind}/${enc(id)}`, body)),
    remove: (kind: PrivacyKind, id: string): Promise<Row> => call<Row>(() => api.delete(`${PRIVACY}/${kind}/${enc(id)}`)),
  },

  /**
   * The existing phase-1 access log (GET /hrms/access-log, newest first, max 200). Sensitive: it bypasses the shared GET
   * cache (noCache) so it never reaches browser storage, like the payroll reads. Returns the dashboard's AccessLogEntry rows.
   */
  async accessLog(employeeId?: string): Promise<AccessLogEntry[]> {
    const q = employeeId ? `?employee_id=${enc(employeeId)}` : '';
    const data = await call<unknown>(() => api.get(`${BASE}/access-log${q}`, { noCache: true } as RequestInit));
    const list = Array.isArray(data) ? data : (data as { rows?: unknown; access_log?: unknown } | null)?.rows ?? (data as { access_log?: unknown } | null)?.access_log;
    return (Array.isArray(list) ? list : []).filter((x): x is Row => !!x && typeof x === 'object').map(accessLogFromWire);
  },
};
