'use client';
// The people area's store (Learning, Talent, Engagement, Timesheets). Pages read `peopleStore.use()` (null until mounted)
// and change data only through the action files next to this one.
//
// In live mode the TIMESHEETS slice comes from, and is saved to, the server (phase 9, live/timesheetsSource.ts); the other
// slices stay in this browser-local store. Timesheet actions never call mutate in live mode, so the local timesheets slice
// is ignored there and the live data is never written to browser storage.

import { useMemo } from 'react';
import { createAreaStore, type AreaStore } from '../areaStore';
import { isLive } from '../live/store';
import { uid } from '../types';
import type { LogEntry, PeopleState } from './types';
import { makePeopleSeed } from './seed';
import { getLiveTimesheets, useLiveTimesheetsSnapshot } from './live/timesheetsSource';
import { useLiveSource } from '../rewards/live/assetsSource';

const basePeopleStore = createAreaStore<PeopleState>('people', 1, makePeopleSeed);

const mergeLive = (base: PeopleState, timesheets: PeopleState['timesheets']): PeopleState => ({ ...base, timesheets });

/** The people state for the active source: in live mode the timesheets slice is the server's. */
function usePeopleState(): PeopleState | null {
  const base = basePeopleStore.use();
  const source = useLiveSource();
  const timesheets = useLiveTimesheetsSnapshot();
  return useMemo(() => (base && source === 'live' ? mergeLive(base, timesheets) : base), [base, source, timesheets]);
}

export const peopleStore: AreaStore<PeopleState> = {
  name: 'people',
  get: () => (isLive() ? mergeLive(basePeopleStore.get(), getLiveTimesheets()) : basePeopleStore.get()),
  mutate: (fn) => basePeopleStore.mutate(fn),
  reset: () => basePeopleStore.reset(),
  use: usePeopleState,
};

/** A log row. The time is the real moment of the change (an audit stamp), never used for business logic. */
export const logRow = (by: string, action: string, detail?: string): LogEntry => ({ id: uid('log'), at: new Date().toISOString(), by, action, detail });
