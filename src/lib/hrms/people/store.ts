'use client';
// The people area's store. Pages read `peopleStore.use()` (null until mounted) and change data only through the action
// files next to this one, so the later swap to API calls touches those files.

import { createAreaStore } from '../areaStore';
import { uid } from '../types';
import type { LogEntry, PeopleState } from './types';
import { makePeopleSeed } from './seed';

export const peopleStore = createAreaStore<PeopleState>('people', 1, makePeopleSeed);

/** A log row. The time is the real moment of the change (an audit stamp), never used for business logic. */
export const logRow = (by: string, action: string, detail?: string): LogEntry => ({ id: uid('log'), at: new Date().toISOString(), by, action, detail });
