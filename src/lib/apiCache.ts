/**
 * Caches behind `api.get()`.
 *
 * Two layers, both bounded so a dashboard tab can stay open all day:
 *
 *  - `TtlCache`  — in-memory responses for a minute or so. Expired entries are dropped as new ones arrive
 *                  and the count is capped; before, nothing was ever removed, so every page, filter,
 *                  and (because the key contained the login token) every token refresh added entries
 *                  that stayed for the life of the tab.
 *  - `SwrStore`  — last-known responses in localStorage so a reload can paint instantly while fresh data
 *                  loads. localStorage is synchronous and small (Safari allows about half of what Chrome
 *                  does), so only small responses are kept, under a fixed total budget; the oldest are
 *                  evicted first and a full quota never wipes the lot. Before, every response was written
 *                  whatever its size, under a key that contained the whole JWT, and never removed unless
 *                  that exact key was read again — storage filled up, and from then on every large
 *                  response paid a failed write plus a synchronous sweep of all of localStorage.
 */

/** The slice of the Storage interface used here (so tests can pass a fake). */
export interface KvStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Entries written by older builds: keyed by the raw JWT + URL, unbounded. Removed on first use. */
export const LEGACY_PREFIX = 'kapi:';
export const LS_PREFIX = 'kapi2:';
/** How long a persisted response may still be shown while fresh data loads. */
export const SWR_TTL_MS = 5 * 60_000;
/** A response larger than this (characters, key included) is never persisted. */
export const MAX_ENTRY_CHARS = 48_000;
/** All persisted responses together. Safari's whole localStorage is ~2.6M characters. */
export const MAX_TOTAL_CHARS = 360_000;
/** In-memory entries kept at once. */
export const MAX_MEMORY_ENTRIES = 80;

/** 64-bit string hash (cyrb53) → short base-36 id, so storage keys never carry the login token. */
export function hashKey(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

interface MemEntry<V> { value: V; expiry: number }

export class TtlCache<V> {
  private readonly entries = new Map<string, MemEntry<V>>();

  constructor(private readonly max: number = MAX_MEMORY_ENTRIES) {}

  get size(): number { return this.entries.size; }

  /** The live entry for `key`, or undefined (an expired entry is dropped on the way). */
  get(key: string, now: number = Date.now()): MemEntry<V> | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expiry <= now) { this.entries.delete(key); return undefined; }
    return e;
  }

  set(key: string, value: V, expiry: number, now: number = Date.now()): void {
    this.entries.delete(key); // re-insert so insertion order is age order
    this.entries.set(key, { value, expiry });
    if (this.entries.size <= this.max) return;
    for (const [k, e] of this.entries) if (e.expiry <= now) this.entries.delete(k);
    for (const k of this.entries.keys()) {
      if (this.entries.size <= this.max) break;
      this.entries.delete(k);
    }
  }

  clear(): void { this.entries.clear(); }
}

interface Meta { ts: number; size: number }

/** Stored value layout: `<savedAtMs>:<json>` — so age and size are known without parsing the json. */
function splitStamp(raw: string): { ts: number; json: string } | null {
  const sep = raw.indexOf(':');
  if (sep < 1) return null;
  const ts = Number(raw.slice(0, sep));
  return Number.isFinite(ts) ? { ts, json: raw.slice(sep + 1) } : null;
}

export class SwrStore {
  private index: Map<string, Meta> | null = null; // storage key → meta, oldest first
  private total = 0;

  constructor(
    private readonly getStore: () => KvStore | null,
    private readonly now: () => number = Date.now,
  ) {}

  /** Characters currently held (for tests / diagnostics). */
  get usedChars(): number { this.load(); return this.total; }

  get(fullKey: string): { value: unknown; ts: number } | null {
    const s = this.getStore();
    if (!s) return null;
    this.load();
    const k = LS_PREFIX + hashKey(fullKey);
    try {
      const raw = s.getItem(k);
      if (raw == null) return null;
      const parts = splitStamp(raw);
      if (!parts || this.now() - parts.ts > SWR_TTL_MS) { this.drop(k, true); return null; }
      return { value: JSON.parse(parts.json), ts: parts.ts };
    } catch {
      this.drop(k, true);
      return null;
    }
  }

  set(fullKey: string, value: unknown): void {
    const s = this.getStore();
    if (!s) return;
    let json: string | undefined;
    try { json = JSON.stringify(value); } catch { return; }
    if (json === undefined) return;
    this.load();
    const k = LS_PREFIX + hashKey(fullKey);
    const ts = this.now();
    const raw = `${ts}:${json}`;
    const size = k.length + raw.length;
    const old = this.index!.get(k);
    if (old) { this.index!.delete(k); this.total -= old.size; } // overwritten below
    // Entries are kept oldest first, so anything past its shelf life is at the front: let it go now rather
    // than only at the next page load (a tab can stay open for days, and each token refresh makes new keys).
    for (const [key, m] of this.index!) {
      if (ts - m.ts <= SWR_TTL_MS) break;
      this.drop(key);
    }
    if (size > MAX_ENTRY_CHARS) {
      // Too big to keep — and an older, smaller answer for the same request must not outlive it.
      try { s.removeItem(k); } catch { /* ignore */ }
      return;
    }
    this.evictTo(MAX_TOTAL_CHARS - size);
    try {
      s.setItem(k, raw);
    } catch {
      // Out of quota (it is shared with the rest of the app and with other tabs): give back the older
      // half of what we hold and try once more. Never wipe everything.
      this.evictTo(Math.floor(this.total / 2));
      try { s.setItem(k, raw); } catch { try { s.removeItem(k); } catch { /* ignore */ } return; }
    }
    this.index!.set(k, { ts, size });
    this.total += size;
  }

  /**
   * Forget every persisted response (called after any write to the server). Scans storage rather than
   * trusting the index: another tab may have saved responses we never saw, and a reload here must not be
   * served one from before this change.
   */
  clear(): void {
    const s = this.getStore();
    if (!s) return;
    try {
      const mine: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && (k.startsWith(LS_PREFIX) || k.startsWith(LEGACY_PREFIX))) mine.push(k);
      }
      for (const k of mine) s.removeItem(k);
    } catch { /* ignore */ }
    this.index = new Map();
    this.total = 0;
  }

  /** First use: drop what older builds left behind and anything expired, and learn what is held. */
  private load(): void {
    if (this.index) return;
    this.index = new Map();
    this.total = 0;
    const s = this.getStore();
    if (!s) return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k) keys.push(k); }
      const live: Array<[string, Meta]> = [];
      for (const k of keys) {
        if (k.startsWith(LEGACY_PREFIX)) { s.removeItem(k); continue; }
        if (!k.startsWith(LS_PREFIX)) continue;
        const raw = s.getItem(k);
        const parts = raw == null ? null : splitStamp(raw);
        if (!parts || this.now() - parts.ts > SWR_TTL_MS) { s.removeItem(k); continue; }
        live.push([k, { ts: parts.ts, size: k.length + raw!.length }]);
      }
      live.sort((a, b) => a[1].ts - b[1].ts);
      for (const [k, m] of live) { this.index.set(k, m); this.total += m.size; }
      this.evictTo(MAX_TOTAL_CHARS);
    } catch { /* storage unavailable — run without persistence */ }
  }

  /** Remove one entry. An entry we never indexed (another tab wrote it) is only removed when `force`d. */
  private drop(k: string, force = false): void {
    const m = this.index?.get(k);
    if (m) { this.index!.delete(k); this.total -= m.size; }
    if (m || force) { try { this.getStore()?.removeItem(k); } catch { /* ignore */ } }
  }

  /** Remove the oldest entries until at most `limit` characters remain. */
  private evictTo(limit: number): void {
    for (const k of Array.from(this.index!.keys())) {
      if (this.total <= limit) break;
      this.drop(k);
    }
  }
}
