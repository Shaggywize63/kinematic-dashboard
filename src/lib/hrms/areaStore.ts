'use client';
// Small persisted stores for the HRMS preview, one per feature area. The core database (db.ts) holds the people,
// payroll and compliance data. Each newer area (recruitment, performance, incentives ...) keeps its own sample data
// and its own changes in a store made here, so areas never edit each other's files and "Reset sample data" can
// clear all of them. When the backend lands, each store's `mutate` calls become one API call per action.

import { useSyncExternalStore } from 'react';

export const AREA_KEY_PREFIX = 'kinematic_hrms_area_';

export interface AreaStore<T> {
  readonly name: string;
  /** Current data (loads or seeds on first use). */
  get(): T;
  /** Apply a change. The function gets a deep copy to mutate; subscribers re-render once it returns. */
  mutate(fn: (draft: T) => void): void;
  /** Back to the seed. */
  reset(): void;
  /** React hook: the data, or null during server render and the first client paint (same as useHrmsDb). */
  use(): T | null;
}

const registry = new Set<AreaStore<unknown>>();

/**
 * `version` is part of the storage key: bump it when the seed shape changes and old browser copies are ignored.
 * `seed` must be deterministic (no Math.random / Date.now) so screenshots and tests are stable.
 */
export function createAreaStore<T>(name: string, version: number, seed: () => T): AreaStore<T> {
  const key = `${AREA_KEY_PREFIX}${name}_v${version}`;
  let current: T | null = null;
  const listeners = new Set<() => void>();

  const persist = (d: T) => { try { window.localStorage.setItem(key, JSON.stringify(d)); } catch { /* full or blocked: memory copy still works */ } };

  function ensure(): T {
    if (current) return current;
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      if (raw) { current = JSON.parse(raw) as T; return current; }
    } catch { /* corrupt or unavailable: fall through to a fresh seed */ }
    current = seed();
    if (typeof window !== 'undefined') persist(current);
    return current;
  }

  const store: AreaStore<T> = {
    name,
    get: ensure,
    mutate(fn) {
      const next = structuredClone(ensure());
      fn(next);
      current = next;
      persist(next);
      listeners.forEach((l) => l());
    },
    reset() {
      current = seed();
      persist(current);
      listeners.forEach((l) => l());
    },
    use() {
      return useSyncExternalStore(
        (l) => {
          listeners.add(l);
          const onStorage = (e: StorageEvent) => { if (e.key === key) { current = null; l(); } };
          window.addEventListener('storage', onStorage);
          return () => { listeners.delete(l); window.removeEventListener('storage', onStorage); };
        },
        ensure,
        () => null,
      );
    },
  };
  registry.add(store as AreaStore<unknown>);
  return store;
}

/** Clear every area store, loaded or not. Used by "Reset sample data". */
export function resetAllAreaStores(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(AREA_KEY_PREFIX)) stale.push(k);
    }
    stale.forEach((k) => window.localStorage.removeItem(k));
  } catch { /* nothing to clear */ }
  registry.forEach((s) => s.reset());
}

/** Deterministic pseudo-random numbers for seeds (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
