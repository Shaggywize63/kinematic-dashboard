'use client';
// The people area's store (Learning, Talent, Engagement, Timesheets). Pages read `peopleStore.use()` (null until mounted)
// and change data only through the action files next to this one.
//
// In live mode the TIMESHEETS slice (phase 9, live/timesheetsSource.ts), the LEARNING slice (phase 10,
// live/learningSource.ts) and the ENGAGEMENT slice (phase 11, live/engagementSource.ts) come from, and are saved to, the
// server; talent stays in this browser-local store. Those slices' actions never call mutate in live mode, so the local
// copies are ignored there and the live data is never written to browser storage.

import { useMemo } from 'react';
import { createAreaStore, type AreaStore } from '../areaStore';
import { isLive } from '../live/store';
import { uid } from '../types';
import type { LogEntry, PeopleState } from './types';
import { makePeopleSeed } from './seed';
import { getLiveTimesheets, useLiveTimesheetsSnapshot } from './live/timesheetsSource';
import { getLiveLearning, useLiveLearningSnapshot } from './live/learningSource';
import { getLiveEngagement, useLiveEngagementSnapshot } from './live/engagementSource';
import { getLiveTalent, useLiveTalentSnapshot } from './live/talentSource';
import { useLiveSource } from '../rewards/live/assetsSource';

const basePeopleStore = createAreaStore<PeopleState>('people', 1, makePeopleSeed);

const mergeLive = (base: PeopleState, timesheets: PeopleState['timesheets'], learning: PeopleState['learning'], engagement: PeopleState['engagement'], talent: PeopleState['talent']): PeopleState =>
  ({ ...base, timesheets, learning, engagement, talent });

/** The people state for the active source: in live mode the timesheets, learning, engagement and talent slices are the server's. */
function usePeopleState(): PeopleState | null {
  const base = basePeopleStore.use();
  const source = useLiveSource();
  const timesheets = useLiveTimesheetsSnapshot();
  const learning = useLiveLearningSnapshot();
  const engagement = useLiveEngagementSnapshot();
  const talent = useLiveTalentSnapshot();
  return useMemo(() => (base && source === 'live' ? mergeLive(base, timesheets, learning, engagement, talent) : base), [base, source, timesheets, learning, engagement, talent]);
}

export const peopleStore: AreaStore<PeopleState> = {
  name: 'people',
  get: () => (isLive() ? mergeLive(basePeopleStore.get(), getLiveTimesheets(), getLiveLearning(), getLiveEngagement(), getLiveTalent()) : basePeopleStore.get()),
  mutate: (fn) => basePeopleStore.mutate(fn),
  reset: () => basePeopleStore.reset(),
  use: usePeopleState,
};

/** A log row. The time is the real moment of the change (an audit stamp), never used for business logic. */
export const logRow = (by: string, action: string, detail?: string): LogEntry => ({ id: uid('log'), at: new Date().toISOString(), by, action, detail });
