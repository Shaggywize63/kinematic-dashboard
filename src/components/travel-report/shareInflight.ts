/**
 * One request per key at a time: a second caller that arrives while the first is still in flight (React's dev
 * double-mount, a quick refresh click) shares its answer instead of asking the server again. Cleared as soon as
 * it settles, so the next refresh always asks afresh.
 */
const inflight = new Map<string, Promise<unknown>>();

export function shareInflight<T>(key: string, start: () => Promise<T>): Promise<T> {
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = start().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}
