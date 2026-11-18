'use client';
// The people area's store (Learning, Talent, Engagement, Timesheets). Pages read `peopleStore.use()` (null until mounted)
// and change data only through the action files next to this one.
//
// In live mode the TIMESHEETS slice (phase 9, live/timesheetsSource.ts) and the LEARNING slice (phase 10,
// live/learningSource.ts) come from, and are saved to, the server; talent and engagement stay in this browser-local store.
// Timesheet and learning actions never call mutate in live mode, so the local copies of those slices are ignored there
// and the live data is never written to browser storage.

import { useMemo } from 'react';
import { createAreaStore, type AreaStore } from '../areaStore';
import { isLive } from '../live/store';
import { uid } from '../types';
import type { LogEntry, PeopleState } from './types';
import { makePeopleSeed } from './seed';
import { getLiveTimesheets, useLiveTimesheetsSnapshot } from './live/timesheetsSource';
import { getLiveLearning, useLiveLearningSnapshot } from './live/learningSource';
import { useLiveSource } from '../rewards/live/assetsSource';

const basePeopleStore = createAreaStore<PeopleState>('people', 1, makePeopleSeed);

const mergeLive = (base: PeopleState, timesheets: PeopleState['timesheets'], learning: PeopleState['learning']): PeopleState => ({ ...base, timesheets, learning });

/** The people state for the active source: in live mode the timesheets and learning slices are the server's. */
function usePeopleState(): PeopleState | null {
  const base = basePeopleStore.use();
  const source = useLiveSource();
  const timesheets = useLiveTimesheetsSnapshot();
  const learning = useLiveLearningSnapshot();
  return useMemo(() => (base && source === 'live' ? mergeLive(base, timesheets, learning) : base), [base, source, timesheets, learning]);
}

export const peopleStore: AreaStore<PeopleState> = {
  name: 'people',
  get: () => (isLive() ? mergeLive(basePeopleStore.get(), getLiveTimesheets(), getLiveLearning()) : basePeopleStore.get()),
  mutate: (fn) => basePeopleStore.mutate(fn),
  reset: () => basePeopleStore.reset(),
  use: usePeopleState,
};

/** A log row. The time is the real moment of the change (an audit stamp), never used for business logic. */
export const logRow = (by: string, action: string, detail?: string): LogEntry => ({ id: uid('log'), at: new Date().toISOString(), by, action, detail });
