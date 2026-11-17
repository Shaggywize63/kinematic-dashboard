// "Today" and the week range for the Timesheets screens. Sample mode keeps the preview's fixed day and its four seeded
// weeks, so the sample stays deterministic. Live mode uses the server's date in India (from the bootstrap), so the current
// week and the "has not happened yet" check match what the server enforces, and the weeks on record.

import { isLive } from '../live/store';
import { addDays } from '../format';
import { PREVIEW_TODAY } from '../seed';
import type { ISODate } from '../types';
import { weekStartOf } from './timesheetEngine';
import { FIRST_WEEK, SEED_WEEKS } from './seedTimesheets';
import { getLiveTimesheetsToday } from './live/timesheetsSource';
import type { TimesheetState } from './types';

/** How far back a live week picker reaches when there are no older weeks on record. */
const LIVE_LOOKBACK_WEEKS = 8;

export const tsToday = (): ISODate => (isLive() ? getLiveTimesheetsToday() ?? PREVIEW_TODAY : PREVIEW_TODAY);
export const tsCurrentWeek = (): ISODate => weekStartOf(tsToday());

/** The earliest week the week picker offers. */
export function tsFirstWeek(ts: TimesheetState): ISODate {
  if (!isLive()) return FIRST_WEEK;
  const floor = addDays(tsCurrentWeek(), -7 * LIVE_LOOKBACK_WEEKS);
  const earliest = ts.sheets.reduce<ISODate | null>((m, s) => (!m || s.weekStart < m ? s.weekStart : m), null);
  return earliest && earliest < floor ? earliest : floor;
}

/** The weeks the project view summarises: the seeded four in sample mode; the last four up to this week in live mode. */
export function tsPeriodWeeks(): ISODate[] {
  if (!isLive()) return SEED_WEEKS;
  const cur = tsCurrentWeek();
  return [addDays(cur, -21), addDays(cur, -14), addDays(cur, -7), cur];
}
