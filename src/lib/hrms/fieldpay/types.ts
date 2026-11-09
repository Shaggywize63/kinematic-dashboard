// Types for the field-pay screens (incentives, travel, territory, team health). The evidence they read lives in
// lib/hrms/field; what people decide about it (holds, disputes, run approvals) lives in the field store. This area
// only adds the little extra state those screens need: outlet reassignments and rest-day notes.

import type { Id, ISODate, Month } from '../types';
import type { FieldRep, IncentiveResult } from '../field/types';

/** An outlet handed from its original owner to someone else. Removed again when it goes back. */
export interface OutletMove { toRepId: Id; fromRepId: Id; at: string; by: string }

/** A note that a rest day should be given after a long run of working days. It does not change any roster. */
export interface RestNote { id: Id; employeeId: Id; date: ISODate; streakFrom: ISODate; streakTo: ISODate; note: string; at: string; by: string }

export interface FieldPayState {
  version: number;
  moves: Record<Id, OutletMove>;      // by outlet id
  restNotes: RestNote[];
  log: { at: string; by: string; action: string }[];
}

// ───────────────────────────── incentives ─────────────────────────────
export interface WhatIf {
  target: number; booked: number; attainmentPct: number;
  bandRows: { from: number; to: number | null; rate: number; revenueInBand: number; amount: number }[];
  /** Payout from the bands, before the collection gate and any clawback. */
  accrued: number;
  effectiveRate: number;
  /** The part payable now when `collectedShare` of the booked value is collected enough to pay. */
  payableNow: number;
  held: number;
  /** The next paying line above the current attainment, and how much more revenue reaches it. */
  nextEdge?: { pct: number; rate: number; moreBooked: number };
}

export interface PreviewRow {
  employeeId: Id;
  /** What goes to payroll as an incentive: the net, or 0 while HR holds it. */
  incentive: number;
  /** The net incentive that is being kept back by a hold. */
  withheld: number;
  travel: number; extraKm: number; held: boolean; heldReason?: string; clawback: number;
}
export interface PayrollPreview { month: Month; rows: PreviewRow[]; incentives: number; travel: number; people: number; heldPeople: number }
export interface PushedSummary { incentives: number; travel: number; people: number; rows: number }

// ───────────────────────────── travel ─────────────────────────────
export interface EffectiveTravelDay {
  date: ISODate; trailKm: number; odometerKm?: number; gapMin: number;
  /** What the statement pays for: the decided figure when HR decided a dispute, else the GPS distance. */
  effectiveKm: number;
  decidedKm?: number; decidedBy?: string; decidedNote?: string;
  extraKm: number; amount: number;
  disputeCandidate: boolean; proposedKm?: number; note?: string;
}
export interface EffectiveTravel {
  employeeId: Id; month: Month; vehicle: FieldRep['vehicle']; rate: number;
  days: EffectiveTravelDay[];
  gpsKm: number; effectiveKm: number; extraKm: number;
  /** The month's amount exactly as it is pushed to payroll: GPS amount plus the rounded extra for decided disputes. */
  amount: number; gpsAmount: number; extraAmount: number;
}

// ───────────────────────────── territory ─────────────────────────────
export interface CoverageResult { planned: number; visited: number; pct: number; missedIds: Id[] }
export interface OutletActivity { verified: number; total: number; lastVerified?: ISODate }
export interface OverlapView {
  a: Id; b: Id; repA: Id; repB: Id; metres: number;
  weekdayA: number; weekdayB: number;
  /** The suggested fix: move one of the two outlets to the other person, who already has more outlets around it. */
  suggestion: { moveOutletId: Id; fromRepId: Id; toRepId: Id; nearFrom: number; nearTo: number };
}

// ───────────────────────────── team health ─────────────────────────────
export interface Team { name: string; empIds: Id[]; size: number; shown: boolean }
export interface WeekSignals {
  weekStart: ISODate;             // the Monday
  from: ISODate; to: ISODate;     // clipped to the evidence window
  fullWeek: boolean;
  people: number;
  workedDays: number;
  spanDays: number;               // worked days with a known span
  longDays: number;               // span over 10 hours
  longDayShare: number | null;    // 0..1
  avgSpanH: number | null;
  eveningVisits: number;
  workingDays: number;            // person-days that were Monday to Saturday and not a holiday
  noPunchDays: number;
  noPunchPerPerson: number;
  peopleWithRest: number | null;  // full weeks only
  restCoverage: number | null;    // 0..1, full weeks only
}
export interface TeamSummary {
  people: number;
  workedDays: number; spanDays: number; longDays: number; longDayShare: number | null; avgSpanH: number | null;
  eveningVisits: number;
  noPunchByMonth: { month: Month; days: number; perPerson: number; partial: boolean }[];
  fullWeeks: number; restCoverage: number | null;
}
export interface Streak { employeeId: Id; from: ISODate; to: ISODate; days: number }

export type { IncentiveResult };
