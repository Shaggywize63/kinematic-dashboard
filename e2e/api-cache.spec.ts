import { test, expect } from '@playwright/test';
import {
  SwrStore, TtlCache, hashKey, LS_PREFIX, LEGACY_PREFIX, SWR_TTL_MS, MAX_ENTRY_CHARS, MAX_TOTAL_CHARS, MAX_MEMORY_ENTRIES,
  type KvStore,
} from '../src/lib/apiCache';
import { visibleInterval } from '../src/lib/visibleInterval';

/**
 * The portal froze in Safari after it had been open a while, for every account. One cause: every GET
 * response was written to localStorage under a key containing the whole login token, whatever its size,
 * and never removed unless that exact key was read again. Safari's localStorage holds roughly half of
 * Chrome's, so it filled up, and from then on large responses paid a failed synchronous write plus a sweep
 * of every localStorage key. These tests pin the bounded behaviour (pure logic — no browser needed).
 */

/** A Storage that throws like a full one, counting characters of keys + values like browsers do. */
class FakeStorage implements KvStore {
  private m = new Map<string, string>();
  ops = { set: 0, remove: 0 };
  constructor(private readonly quota: number) {}
  get length() { return this.m.size; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) {
    this.ops.set++;
    let used = 0;
    for (const [kk, vv] of this.m) if (kk !== k) used += kk.length + vv.length;
    if (used + k.length + v.length > this.quota) throw new DOMException('quota', 'QuotaExceededError');
    this.m.set(k, v);
  }
  removeItem(k: string) { this.ops.remove++; this.m.delete(k); }
  keys() { return Array.from(this.m.keys()); }
  chars() { let n = 0; for (const [k, v] of this.m) n += k.length + v.length; return n; }
}

const SAFARI_QUOTA = 2_621_440;
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, name: `Person ${i}`, note: 'x'.repeat(60) }));
const JWT = 'eyJ' + 'A'.repeat(900);

test.describe('hashKey', () => {
  test('is short, stable and never carries the login token', () => {
    const key = `${JWT}|/api/v1/crm/leads?limit=50|c:org`;
    expect(hashKey(key)).toBe(hashKey(key));
    expect(hashKey(key).length).toBeLessThanOrEqual(14);
    expect(hashKey(key)).not.toContain('AAAA');
    expect(hashKey(key + '1')).not.toBe(hashKey(key));
  });
});

test.describe('SwrStore', () => {
  test('keeps a small response and serves it back', () => {
    let now = 1_000;
    const st = new FakeStorage(SAFARI_QUOTA);
    const swr = new SwrStore(() => st, () => now);
    swr.set('k1', { data: rows(5) });
    expect(swr.get('k1')?.value).toEqual({ data: rows(5) });
    expect(swr.get('other')).toBeNull();
    expect(st.keys().every((k) => k.startsWith(LS_PREFIX))).toBe(true);
  });

  test('an answer older than the shelf life is a miss and is removed', () => {
    let now = 1_000;
    const st = new FakeStorage(SAFARI_QUOTA);
    const swr = new SwrStore(() => st, () => now);
    swr.set('k1', [1, 2, 3]);
    now += SWR_TTL_MS + 1;
    expect(swr.get('k1')).toBeNull();
    expect(st.keys()).toHaveLength(0);
  });

  test('a large response is never written, and does not leave an older smaller copy behind', () => {
    const st = new FakeStorage(SAFARI_QUOTA);
    const swr = new SwrStore(() => st);
    swr.set('list', [1]);
    expect(st.keys()).toHaveLength(1);
    swr.set('list', { data: rows(2_000) }); // ~200k chars
    expect(st.keys()).toHaveLength(0);
    expect(swr.get('list')).toBeNull();
    expect(swr.usedChars).toBe(0);
  });

  test('everything together stays inside the budget, newest kept, oldest evicted', () => {
    let now = 1_000;
    const st = new FakeStorage(SAFARI_QUOTA);
    const swr = new SwrStore(() => st, () => now);
    const body = { data: rows(300) }; // ~30k chars: under the per-entry cap
    for (let i = 0; i < 40; i++) { now += 1_000; swr.set(`k${i}`, body); }
    expect(st.chars()).toBeLessThanOrEqual(MAX_TOTAL_CHARS);
    expect(swr.usedChars).toBe(st.chars());
    expect(swr.get('k39')).not.toBeNull();
    expect(swr.get('k0')).toBeNull();
  });

  test('a full quota evicts older responses; it never wipes the store or touches other keys', () => {
    let now = 1_000;
    const st = new FakeStorage(200_000); // tiny quota, shared with the app's own keys
    st.setItem('kinematic_token', JWT);
    st.setItem('kinematic_user', JSON.stringify({ id: 1, name: 'x'.repeat(2_000) }));
    const swr = new SwrStore(() => st, () => now);
    const body = { data: rows(250) }; // ~25k chars each
    for (let i = 0; i < 12; i++) { now += 1_000; swr.set(`k${i}`, body); }
    expect(st.getItem('kinematic_token')).toBe(JWT);
    expect(st.getItem('kinematic_user')).not.toBeNull();
    expect(swr.get('k11')).not.toBeNull();     // newest survived
    expect(st.keys().filter((k) => k.startsWith(LS_PREFIX)).length).toBeGreaterThan(1); // not wiped
  });

  test('gives up quietly when storage refuses everything (private mode / quota fully used elsewhere)', () => {
    const st = new FakeStorage(10);
    const swr = new SwrStore(() => st);
    expect(() => swr.set('k', { a: 1 })).not.toThrow();
    expect(swr.get('k')).toBeNull();
  });

  test('works without any storage', () => {
    const swr = new SwrStore(() => null);
    expect(() => swr.set('k', 1)).not.toThrow();
    expect(swr.get('k')).toBeNull();
    expect(() => swr.clear()).not.toThrow();
  });

  test('first use removes what older builds left behind (huge, keyed by token) and keeps unrelated keys', () => {
    const st = new FakeStorage(SAFARI_QUOTA);
    st.setItem(`${LEGACY_PREFIX}${JWT}|/api/v1/attendance/team|c:org`, JSON.stringify({ value: rows(3_000), ts: Date.now() }));
    st.setItem(`${LEGACY_PREFIX}${JWT}|/api/v1/users|c:org`, JSON.stringify({ value: rows(500), ts: Date.now() }));
    st.setItem('kinematic_token', JWT);
    st.setItem('kinematic_theme', 'dark');
    const swr = new SwrStore(() => st);
    swr.get('anything');
    expect(st.keys().filter((k) => k.startsWith(LEGACY_PREFIX))).toHaveLength(0);
    expect(st.keys().sort()).toEqual(['kinematic_theme', 'kinematic_token']);
  });

  test('first use also drops expired entries and learns what is held', () => {
    let now = 10_000_000;
    const st = new FakeStorage(SAFARI_QUOTA);
    st.setItem(`${LS_PREFIX}old`, `${now - SWR_TTL_MS - 5}:[1]`);
    st.setItem(`${LS_PREFIX}fresh`, `${now - 1_000}:[2]`);
    st.setItem(`${LS_PREFIX}junk`, 'not-a-stamp');
    const swr = new SwrStore(() => st, () => now);
    expect(swr.usedChars).toBe(`${LS_PREFIX}fresh`.length + `${now - 1_000}:[2]`.length);
    expect(st.keys()).toEqual([`${LS_PREFIX}fresh`]);
  });

  test('expired entries are dropped as new ones arrive, not only at the next page load', () => {
    let now = 1_000;
    const st = new FakeStorage(SAFARI_QUOTA);
    const swr = new SwrStore(() => st, () => now);
    // every token refresh makes a new key for the same request
    for (let hour = 0; hour < 6; hour++) { swr.set(`token-${hour}|/api/v1/auth/me`, { id: 1 }); now += SWR_TTL_MS + 1_000; }
    expect(st.keys()).toHaveLength(1);
  });

  test('clear() removes ours only', () => {
    const st = new FakeStorage(SAFARI_QUOTA);
    st.setItem('kinematic_token', 't');
    const swr = new SwrStore(() => st);
    swr.set('a', 1); swr.set('b', 2);
    swr.clear();
    expect(st.keys()).toEqual(['kinematic_token']);
    expect(swr.usedChars).toBe(0);
  });

  test('clear() also removes responses another tab saved after this one loaded', () => {
    const st = new FakeStorage(SAFARI_QUOTA);
    const swr = new SwrStore(() => st);
    swr.get('warm');                                   // this tab has loaded and knows nothing
    st.setItem(`${LS_PREFIX}fromOtherTab`, `${Date.now()}:[1]`);
    swr.clear();
    expect(st.keys()).toEqual([]);
    expect(swr.usedChars).toBe(0);
  });

  test('a write does not sweep localStorage: one set() costs one setItem', () => {
    const st = new FakeStorage(SAFARI_QUOTA);
    const swr = new SwrStore(() => st);
    swr.get('warm'); // first-use load
    st.ops.set = 0; st.ops.remove = 0;
    swr.set('k', { a: 1 });
    expect(st.ops).toEqual({ set: 1, remove: 0 });
  });
});

test.describe('TtlCache', () => {
  test('serves live entries and drops expired ones', () => {
    const c = new TtlCache<number>();
    c.set('a', 1, 2_000, 1_000);
    expect(c.get('a', 1_500)?.value).toBe(1);
    expect(c.get('a', 2_000)).toBeUndefined();
    expect(c.size).toBe(0);
  });

  test('is capped, expired entries go first, then the oldest', () => {
    const c = new TtlCache<number>(3);
    c.set('a', 1, 1_500, 1_000);      // will be expired by the time the cache overflows
    c.set('b', 2, 99_000, 1_000);
    c.set('c', 3, 99_000, 1_000);
    c.set('d', 4, 99_000, 2_000);      // overflow at now=2000 → 'a' (expired) is the one to go
    expect(c.get('a', 2_000)).toBeUndefined();
    expect(['b', 'c', 'd'].map((k) => c.get(k, 2_000)?.value)).toEqual([2, 3, 4]);
    c.set('e', 5, 99_000, 2_000);      // nothing expired → the oldest ('b') goes
    expect(c.get('b', 2_000)).toBeUndefined();
    expect(c.size).toBe(3);
  });

  test('a long session never holds more than the cap, however many distinct requests it makes', () => {
    const c = new TtlCache<number>();
    for (let i = 0; i < 5_000; i++) c.set(`k${i}`, i, 1e12, i);
    expect(c.size).toBe(MAX_MEMORY_ENTRIES);
    expect(c.get('k4999', 5_000)?.value).toBe(4999);
  });
});

test.describe('visibleInterval', () => {
  type Listener = () => void;
  function fakeDom() {
    let state: 'visible' | 'hidden' = 'visible';
    const listeners: Listener[] = [];
    const timers = new Map<number, { fn: () => void; ms: number }>();
    let nextId = 1;
    const g = globalThis as unknown as Record<string, unknown>;
    g.document = {
      get visibilityState() { return state; },
      addEventListener: (_: string, l: Listener) => { listeners.push(l); },
      removeEventListener: (_: string, l: Listener) => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); },
    };
    g.window = {
      setInterval: (fn: () => void, ms: number) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
      clearInterval: (id: number) => { timers.delete(id); },
    };
    return {
      tick: () => timers.forEach((t) => t.fn()),
      active: () => timers.size,
      listeners: () => listeners.length,
      setState: (s: 'visible' | 'hidden') => { state = s; listeners.slice().forEach((l) => l()); },
    };
  }
  test.afterEach(() => { const g = globalThis as unknown as Record<string, unknown>; delete g.document; delete g.window; });

  test('polls while visible, stops while hidden, refreshes once on return and resumes', () => {
    const dom = fakeDom();
    let calls = 0;
    const stop = visibleInterval(() => { calls++; }, 60_000);
    dom.tick(); expect(calls).toBe(1);
    dom.setState('hidden');
    expect(dom.active()).toBe(0);
    dom.tick(); expect(calls).toBe(1);
    dom.setState('visible');
    expect(calls).toBe(2);          // caught up straight away
    expect(dom.active()).toBe(1);   // schedule resumed
    dom.tick(); expect(calls).toBe(3);
    stop();
    expect(dom.active()).toBe(0);
    expect(dom.listeners()).toBe(0);
  });

  test('starts idle when created in a hidden tab', () => {
    const dom = fakeDom();
    dom.setState('hidden');
    const stop = visibleInterval(() => {}, 1_000);
    expect(dom.active()).toBe(0);
    stop();
  });
});

// Guards the constants the behaviour above relies on.
test('limits are small enough for Safari', () => {
  expect(MAX_ENTRY_CHARS).toBeLessThan(MAX_TOTAL_CHARS);
  expect(MAX_TOTAL_CHARS).toBeLessThan(SAFARI_QUOTA / 4);
});
