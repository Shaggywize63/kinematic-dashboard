// Field-force evidence model for the HRMS preview. This is the data the USP screens read: where people were
// (visits, GPS trail, odometer), what they claimed (expenses), what they sold (deals), and what HR decided about it.
// Evidence is generated deterministically (evidence.ts) and never edited. Decisions live in the field store (store.ts).

import type { Id, ISODate, Month } from '../types';

export interface GeoPoint { lat: number; lng: number }

export interface FieldRep {
  employeeId: Id;
  city: 'Delhi' | 'Bengaluru';
  territoryId: Id;
  vehicle: 'bike' | 'car' | 'public';
  deviceId: string;
  /** Has the rep acknowledged the incentive plan in writing? Clawbacks need this contractual basis. */
  planAcknowledged: boolean;
  isTeamLead?: boolean;
}

export interface Territory { id: Id; name: string; city: string; ownerId: Id; potentialPerMonth: number; centre: GeoPoint }
export interface Beat { id: Id; name: string; territoryId: Id; repId: Id; weekday: 1 | 2 | 3 | 4 | 5 | 6; outletIds: Id[] }
export interface Outlet {
  id: Id; name: string; type: 'retail' | 'distributor' | 'dealer' | 'site'; area: string; pos: GeoPoint;
  beatId: Id; territoryId: Id; repId: Id; tier: 'A' | 'B' | 'C';
}

export interface Visit {
  id: Id; employeeId: Id; outletId: Id; date: ISODate;
  start: string; end: string;               // HH:mm
  pos: GeoPoint;                            // where the phone was at check-in
  distanceFromOutletM: number;
  photo: boolean;
  /** Geo-fenced (within 150 m of the outlet) AND photo AND at least 5 minutes on site. */
  verified: boolean;
  orderValue: number;
}

export interface Punch {
  employeeId: Id; date: ISODate;
  in?: string; out?: string;                // HH:mm, a missing one is a missed punch
  inPos?: GeoPoint; outPos?: GeoPoint;
  deviceId: string;
  source: 'app';
}

export interface TrailPoint { t: string; pos: GeoPoint }
export interface TrailDay {
  employeeId: Id; date: ISODate; points: TrailPoint[];
  km: number;                               // along the trail, great-circle between points
  /** Longest stretch with no GPS fix, in minutes (phone off, battery, no signal). */
  longestGapMin: number;
}
export interface OdometerDay { employeeId: Id; date: ISODate; startKm: number; endKm: number; photoStart: boolean; photoEnd: boolean }

export type ClaimCategory = 'fuel' | 'toll' | 'meal' | 'parking' | 'lodging' | 'taxi';
export interface ExpenseClaim {
  id: Id; employeeId: Id; date: ISODate; category: ClaimCategory; amount: number;
  receiptHash?: string;                     // fingerprint of the receipt image; the same one twice is a duplicate
  vendor?: string;
}

export interface Deal {
  id: Id; employeeId: Id; customer: string; product: string; value: number;
  closedOn: ISODate; status: 'won' | 'cancelled' | 'returned';
  cancelledOn?: ISODate;
  collectedPct: number;                     // share of the invoice value already collected
  kind: 'new' | 'repeat' | 'upsell';
}

export interface Target { employeeId: Id; month: Month; revenue: number; visits: number; newOutlets: number }

export interface IncentivePlan {
  id: Id; name: string; effectiveFrom: ISODate;
  /** Marginal bands on attainment (% of revenue target). `to: null` means no upper limit. */
  bands: { from: number; to: number | null; rate: number }[];
  minCollectionPct: number;                 // a deal pays out only when collected at least this much
  clawbackWindowDays: number;
  /** Company policy, not statutory. Clawback needs the rep to have acknowledged the plan. */
  note: string;
}

export interface TravelPolicy {
  ratePerKm: Record<'bike' | 'car', number>;
  /** What a day's fuel receipt is expected to cost per km of trail. A claim far above this is flagged. */
  fuelRatePerKm: Record<'bike' | 'car', number>;
  disputeThresholdPct: number;
  source: string;
}

export interface FieldEvidence {
  reps: FieldRep[];
  territories: Territory[];
  beats: Beat[];
  outlets: Outlet[];
  visits: Visit[];
  punches: Punch[];
  trails: TrailDay[];
  odometer: OdometerDay[];
  claims: ExpenseClaim[];
  deals: Deal[];
  targets: Target[];
  plan: IncentivePlan;
  travel: TravelPolicy;
  holidays: ISODate[];
  /** First and last date the evidence covers. */
  from: ISODate;
  to: ISODate;
}

// ───────────────────────────── derived (engines.ts) ─────────────────────────────
export interface DayEvidence {
  employeeId: Id; date: ISODate;
  punch?: Punch;
  visits: Visit[];
  verifiedVisits: Visit[];
  firstVisitStart?: string; lastVisitEnd?: string;
  spanMin: number;                          // first verified visit start to last verified visit end
  trailKm: number; trailGapMin: number;
  odometerKm?: number;
  claims: ExpenseClaim[];
  isWorkingDay: boolean;
}

export type RegularisationVerdict = 'auto_approve' | 'needs_review' | 'no_evidence' | 'not_needed';
export interface RegularisationSuggestion {
  employeeId: Id; date: ISODate;
  verdict: RegularisationVerdict;
  suggestedIn?: string; suggestedOut?: string;
  reasons: string[];
  evidence: { verifiedVisits: number; spanMin: number; trailKm: number };
}

export type FlagType = 'impossible_travel' | 'punch_visit_mismatch' | 'fuel_route_mismatch' | 'receipt_reuse' | 'odometer_mismatch' | 'device_shared';
export type Severity = 'info' | 'warning' | 'high';
export interface IntegrityFlag {
  id: Id;                                   // deterministic: type:employeeId:date
  type: FlagType; severity: Severity;
  employeeId: Id; involves: Id[];           // everyone the flag touches (colleague on a shared device, duplicate receipt ...)
  date: ISODate;
  title: string;
  evidence: string[];                       // plain sentences, each checkable against the data
  suggestion: string;
}

export interface IncentiveLine {
  dealId: Id; customer: string; value: number; counted: number; rate: number; amount: number;
  status: 'paid_now' | 'held_collection' | 'excluded';
  why: string;
}
export interface IncentiveResult {
  employeeId: Id; month: Month;
  target: number; achieved: number; attainmentPct: number;
  lines: IncentiveLine[];
  bandRows: { from: number; to: number | null; rate: number; revenueInBand: number; amount: number }[];
  gross: number;                            // before clawbacks
  clawbacks: { dealId: Id; customer: string; amount: number; allowed: boolean; why: string }[];
  clawbackTotal: number;
  net: number;
  heldTotal: number;
  explanation: string[];                    // plain sentences the rep can read
}

export interface TravelDay {
  date: ISODate; trailKm: number; odometerKm?: number; gapMin: number;
  /** What the system pays by default: the GPS distance. */
  payableKm: number;
  /** What the person's odometer says, when it differs from the trail by more than the dispute threshold AND a GPS gap explains it. */
  proposedKm?: number;
  amount: number;
  /** The person is probably under-paid because the phone lost GPS. They can dispute; HR decides. */
  disputeCandidate: boolean;
  note?: string;
}
export interface TravelResult {
  employeeId: Id; month: Month; vehicle: FieldRep['vehicle'];
  days: TravelDay[]; payableKm: number; amount: number; disputeCandidates: number;
}
