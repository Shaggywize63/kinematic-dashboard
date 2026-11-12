// HRMS assets API client (phase 6: the asset register on the server). Thin, like lib/hrms/live/client.ts: it builds the
// request, unwraps `{ success, data }` and turns every failure into one HrmsApiError with a plain message. Shapes are mapped
// in assetsWire.ts, not here.
//
// The bootstrap GET bypasses the shared GET cache (noCache), because that cache also mirrors small responses to localStorage;
// in live mode the register must live in memory only, never in browser storage.

import api from '../../../api';
import { HrmsApiError } from '../../live/client';
import { assetsBootstrapFromWire, commandResultFromWire, type AssetsBootstrap, type CommandResult, type Row } from './assetsWire';

const BASE = '/api/v1/hrms/assets';
export const ASSETS_NOT_READY_MESSAGE = 'HRMS storage is not set up yet on the server';

function toError(e: unknown): HrmsApiError {
  if (e instanceof HrmsApiError) return e;
  const err = e as { status?: unknown; message?: unknown } | null;
  const status = typeof err?.status === 'number' ? err.status : 0;
  const raw = typeof err?.message === 'string' && err.message ? err.message : '';
  if (status === 503 && /not set up/i.test(raw)) return new HrmsApiError(ASSETS_NOT_READY_MESSAGE, 503, true);
  if (status === 0) {
    if (/unauthorized/i.test(raw)) return new HrmsApiError('Your session has expired. Sign in again.', 401);
    if (/timed out/i.test(raw)) return new HrmsApiError('The server took too long to answer.', 0);
    return new HrmsApiError('Could not reach the server.', 0);
  }
  return new HrmsApiError(raw || `The server answered ${status}.`, status);
}

/** Assets-only trouble on the bootstrap: a server that predates the assets tables answers 404 for the route, which reads the
 * same as "not set up yet". A 404 on a command is a real NOT_FOUND (an unknown asset), so only the bootstrap widens 404. */
function bootstrapError(e: unknown): HrmsApiError {
  const err = toError(e);
  if (err.notReady || err.status === 404) return new HrmsApiError(ASSETS_NOT_READY_MESSAGE, err.status || 503, true);
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

export const assetsApi = {
  async bootstrap(): Promise<AssetsBootstrap> {
    try {
      const data = await call<Row>(() => api.get(`${BASE}/bootstrap`, { noCache: true } as RequestInit));
      return assetsBootstrapFromWire(data ?? {});
    } catch (e) { throw bootstrapError(e); }
  },

  /** POST /assets (addAsset). Returns the created asset and its `purchased` event. */
  async create(body: Row): Promise<CommandResult> {
    return commandResultFromWire(await call<Row>(() => api.post(BASE, body)) ?? {});
  },

  /** One command on an asset (issue, return, transfer, repair-out, repair-back, lost, retire). Returns the updated asset and
   * the appended event. A refused transition throws an HrmsApiError carrying the server's plain reason. */
  async command(id: string, command: string, body: Row): Promise<CommandResult> {
    return commandResultFromWire(await call<Row>(() => api.post(`${BASE}/${enc(id)}/${command}`, body)) ?? {});
  },
};
