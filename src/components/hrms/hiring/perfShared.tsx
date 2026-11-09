'use client';
// Helpers used by more than one Performance tab.

import { Badge, T } from '../ui';
import { inrShort } from '../../../lib/hrms/format';
import type { HrmsDb } from '../../../lib/hrms/types';
import type { HiringState, KrUnit } from '../../../lib/hrms/hiring/types';
import { GOAL_STATUS_LABEL, type GoalStatus } from '../../../lib/hrms/hiring/perfEngines';

export const STATUS_TONE: Record<GoalStatus, 'ok' | 'info' | 'warn' | 'red' | 'neutral'> = { done: 'ok', on_track: 'ok', at_risk: 'warn', behind: 'red', not_started: 'neutral' };
export const StatusPill = ({ s }: { s: GoalStatus }) => <Badge tone={STATUS_TONE[s]} dot>{GOAL_STATUS_LABEL[s]}</Badge>;

export function fmtVal(v: number, unit: KrUnit): string {
  if (unit === '₹') return inrShort(v);
  if (unit === '%') return `${Math.round(v * 10) / 10}%`;
  if (unit === 'days') return `${Math.round(v * 10) / 10} days`;
  return String(Math.round(v * 10) / 10);
}

/** People in the review cycle, with their department. Department comes from the core employee record. */
export function participants(db: HrmsDb, st: HiringState) {
  return st.reviews.map((r) => {
    const e = db.employees.find((x) => x.id === r.employeeId);
    return { review: r, employee: e, departmentId: e?.departmentId ?? '' };
  }).filter((p) => !!p.employee);
}

/** A progress bar with a tick for how much of the time has passed, so "behind the clock" can be seen at a glance. */
export function ProgressWithClock({ progress, elapsed, tone }: { progress: number; elapsed: number; tone: 'ok' | 'warn' | 'red' | 'neutral' | 'info' }) {
  const color = tone === 'red' ? T.red : tone === 'warn' ? T.warn : tone === 'info' ? T.info : T.ok;
  return (
    <div style={{ position: 'relative', height: 8, borderRadius: 8, background: T.raised }} role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress ${Math.round(progress)}%, time elapsed ${Math.round(elapsed)}%`}>
      <div style={{ width: `${progress}%`, height: '100%', borderRadius: 8, background: color }} />
      <div title={`${Math.round(elapsed)}% of the time has passed`} style={{ position: 'absolute', left: `calc(${elapsed}% - 1px)`, top: -3, width: 2, height: 14, background: T.text, opacity: 0.55, borderRadius: 1 }} />
    </div>
  );
}
