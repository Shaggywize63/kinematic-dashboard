import type { ApiError } from './api';

/**
 * The backend's 409 duplicate-account payload: { error, code: 'DUPLICATE_ACCOUNT', existing: { id, name } }.
 * Read defensively off the ApiError.body so a shape change can't throw. Returns the existing account, or null
 * when the error is anything else.
 */
export function duplicateAccount(err: unknown): { id: string; name: string } | null {
  const e = err as ApiError | null;
  if (!e || e.status !== 409) return null;
  const body = e.body as { code?: unknown; existing?: { id?: unknown; name?: unknown } } | null;
  if (!body || body.code !== 'DUPLICATE_ACCOUNT') return null;
  const ex = body.existing;
  const id = typeof ex?.id === 'string' ? ex.id : '';
  if (!id) return null;
  return { id, name: typeof ex?.name === 'string' ? ex.name : '' };
}
