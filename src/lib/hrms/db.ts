'use client';
// HRMS data store, the one seam between the pages and where the data lives. Pages read it with useHrmsDb() and change it
// through actions.ts; they never know which source is active.
//
//  - Sample (the default): a seeded copy of the data kept in this browser's localStorage. No API call is ever made.
//  - Live: people and organisation come from, and are saved to, the server (see ./live/store.ts). mutate() then applies the
//    change at once, diffs it and sends the calls; the rest of the module stays on browser-local data.

import { useSyncExternalStore } from 'react';
import type { HrmsDb } from './types';
import { uid } from './types';
import { SEED_VERSION, makeSeed } from './seed';
import { getLiveDb, isLive, isLiveReady, liveMutate, randomUuid, subscribeLive } from './live/store';

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

export function getDb(): HrmsDb { return isLive() ? getLiveDb() : ensure(); }

/** Apply a change. The function gets a deep copy to mutate; subscribers re-render once it returns. In live mode the change is also sent to the server. */
export function mutate(fn: (db: HrmsDb) => void): void {
  if (isLive()) { liveMutate(fn); return; }
  const next = structuredClone(ensure());
  fn(next);
  current = next;
  persist(next);
  listeners.forEach((l) => l());
}

/** Back to the sample seed. It never does anything in live mode: that data lives on the server and a browser button must not wipe it. */
export function resetDb(): void {
  if (isLive()) return;
  current = makeSeed();
  persist(current);
  listeners.forEach((l) => l());
}

/** An id for a new row: a UUID in live mode (the server only accepts those), the usual short sample id otherwise. */
export const newId = (prefix: string): string => (isLive() ? randomUuid() : uid(prefix));

function subscribe(l: () => void): () => void {
  listeners.add(l);
  const offLive = subscribeLive(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { current = null; l(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(l); offLive(); window.removeEventListener('storage', onStorage); };
}

function snapshot(): HrmsDb | null {
  if (isLive()) return isLiveReady() ? getLiveDb() : null;
  return ensure();
}

/** The whole database for the active source, or null during server render, the first client paint, and while live data is loading. */
export function useHrmsDb(): HrmsDb | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
