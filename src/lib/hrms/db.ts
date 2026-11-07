'use client';
// Preview data store. The HRMS backend does not exist yet, so the module runs against a seeded copy of the
// data kept in localStorage (per browser). Pages read it with useHrmsDb() and change it through actions.ts.
// When the API lands, this file and actions.ts are the only things that swap: the pages keep the same shapes.

import { useSyncExternalStore } from 'react';
import type { HrmsDb } from './types';
import { SEED_VERSION, makeSeed } from './seed';

const KEY = 'kinematic_hrms_preview_v3';
let current: HrmsDb | null = null;
const listeners = new Set<() => void>();

function persist(db: HrmsDb) {
  try { window.localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked: the in-memory copy still works */ }
}

function ensure(): HrmsDb {
  if (current) return current;
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as HrmsDb;
      if (parsed?.version === SEED_VERSION) { current = parsed; return current; }
    }
  } catch { /* corrupt or unavailable: fall through to a fresh seed */ }
  current = makeSeed();
  if (typeof window !== 'undefined') persist(current);
  return current;
}

export function getDb(): HrmsDb { return ensure(); }

/** Apply a change. The function gets a deep copy to mutate; subscribers re-render once it returns. */
export function mutate(fn: (db: HrmsDb) => void): void {
  const next = structuredClone(ensure());
  fn(next);
  current = next;
  persist(next);
  listeners.forEach((l) => l());
}

export function resetDb(): void {
  current = makeSeed();
  persist(current);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { current = null; l(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(l); window.removeEventListener('storage', onStorage); };
}

/** The whole preview database, or null during server render and the first client paint. */
export function useHrmsDb(): HrmsDb | null {
  return useSyncExternalStore(subscribe, ensure, () => null);
}
