// Types for the Rewards area: Assets, Benefits and Compensation. One area store holds all three (store.ts).
// Nothing here duplicates the core model: people, CTC, exits and letters stay in the core database and are read
// through useHrmsDb(); this area keeps only its own records and the decisions people make on them.

import type { Id, ISODate, Month } from '../types';

// ─────────────────────────────── assets ───────────────────────────────
export type AssetType = 'laptop' | 'phone' | 'sim' | 'vehicle' | 'id_card' | 'uniform' | 'tool';
export type AssetStatus = 'in_stock' | 'issued' | 'in_repair' | 'lost' | 'retired';
export type AssetCondition = 'new' | 'good' | 'fair' | 'poor' | 'damaged';

export interface Asset {
  id: Id;
  tag: string;                 // AST-LAP-001
  type: AssetType;
  make: string;
  model: string;
  serial: string;              // fictional
  purchaseDate: ISODate;
  cost: number;                // rupees, at purchase
  warrantyEnd: ISODate | null;
  condition: AssetCondition;
  status: AssetStatus;
  holderId?: Id;               // current holder when status is 'issued'
}

export type AssetEventKind = 'purchased' | 'issued' | 'returned' | 'transferred' | 'repair_out' | 'repair_back' | 'lost' | 'retired';

/** One line of an asset's history. The list is append-only: no action edits or deletes an event. */
export interface AssetEvent {
  id: Id;
  assetId: Id;
  on: ISODate;
  kind: AssetEventKind;
  fromId?: Id;                 // person who gave it up (return, transfer, lost)
  toId?: Id;                   // person who received it (issue, transfer)
  condition?: AssetCondition;  // condition recorded at the time
  status: AssetStatus;         // status of the asset after this event, so history can be replayed
  ack?: boolean;               // the recipient acknowledged receipt in working condition
  note?: string;
  by: string;
}

export interface AssetsState { items: Asset[]; events: AssetEvent[] }

// ─────────────────────────────── benefits ───────────────────────────────
export type PlanKind = 'health' | 'accident' | 'meal' | 'nps' | 'flex';
export type Relation = 'spouse' | 'child' | 'parent';

export interface PlanTier {
  id: string;
  label: string;
  sumInsured?: number;
  /** Health and accident: annual premium per covered person, by relation. */
  annualPremium?: Partial<Record<'self' | Relation, number>>;
  /** Meal coupons: face value per month. */
  monthlyAmount?: number;
  /** NPS: percent of monthly basic moved into the pension account. */
  pctOfBasic?: number;
}

export interface DependantRules {
  maxSpouse: number;
  maxChildren: number;
  childMaxAge: number;
  maxParents: number;
  parentMaxAge: number;
}

export interface Plan {
  id: Id;
  kind: PlanKind;
  name: string;
  summary: string;
  provider: string;                // fictional
  auto: boolean;                   // everyone is covered, no choice to make
  tiers: PlanTier[];
  /** Percent of the premium the company pays. 'self' is the employee; the rest are dependants by relation. */
  employerSharePct: Partial<Record<'self' | Relation, number>>;
  dependants?: DependantRules;
  flexMonthly?: number;            // flexible allowance: monthly budget
  baskets?: { id: string; label: string }[];
  taxNote: string;                 // always shown with an `indicative` badge
  coverStart: ISODate;
  renewsOn: ISODate;
}

export interface Dependant { id: Id; name: string; relation: Relation; dob: ISODate }  // never an ID number

export interface Enrolment {
  employeeId: Id;
  status: 'enrolled' | 'waived';
  submittedOn: ISODate;
  by: string;
  healthTier?: string;
  dependants: Dependant[];
  mealTier?: string;
  npsTier?: string;
  flex: Record<string, number>;    // basket id → monthly rupees
}

export interface BenefitsWindow {
  opensOn: ISODate;
  closesOn: ISODate;
  extensions: { on: ISODate; days: number; reason: string; by: string }[];
}

export type ClaimStatus = 'submitted' | 'in_review' | 'query' | 'approved' | 'settled' | 'rejected';
export interface Claim {
  id: Id;
  ref: string;                     // TPA reference
  employeeId: Id;
  patient: string;                 // 'Self' or the dependant's name
  relation: 'self' | Relation;
  kind: 'cashless' | 'reimbursement';
  hospital: string;
  claimed: number;
  approved?: number;
  filedOn: ISODate;
  closedOn?: ISODate;              // set when settled or rejected
  status: ClaimStatus;
  rejectionReason?: string;
  trail: { on: ISODate; status: ClaimStatus; note?: string; by: string }[];
}

export interface BenefitsState {
  plans: Plan[];
  window: BenefitsWindow;
  enrolments: Enrolment[];
  reminders: Record<Id, ISODate>;  // employeeId → date a reminder was logged (a simulation, nothing is sent)
  claims: Claim[];
  sent: Record<Month, { on: ISODate; rows: number; total: number; by: string }>;
}

// ─────────────────────────────── compensation ───────────────────────────────
export type PerfBand = 'exceeds' | 'meets' | 'partial' | 'below' | 'unrated';
export type CompaZone = 'low' | 'mid' | 'high';

export interface Band {
  grade: string;
  min: number;
  mid: number;
  max: number;
  market: number;                  // sample market median, always shown as `indicative`
  published: boolean;              // visible in the employee view
}

export interface Guideline { min: number; max: number }   // percent range
export type Guidelines = Record<PerfBand, Record<CompaZone, Guideline>>;

export interface Proposal { pct: number; reason?: string; by: string; on: ISODate }

export interface MeritCycle {
  id: Id;
  name: string;
  effectiveOn: ISODate;
  budgetPct: number;               // percent of the annual CTC of everyone in the cycle
  status: 'draft' | 'submitted' | 'approved' | 'returned';
  decision?: { by: string; on: ISODate; note?: string };
  guidelines: Guidelines;
  proposals: Record<Id, Proposal>;
  applied: Record<Id, { on: ISODate; from: number; to: number; letterId: Id; by: string }>;
}

export interface PerfNote { evidence: string; reply?: string }

export interface CompState {
  bands: Band[];
  perf: Record<Id, PerfBand>;      // our own simple band per person; the performance module is not connected
  perfNotes: Record<Id, PerfNote>;
  cycle: MeritCycle;
}

// ─────────────────────────────── the store ───────────────────────────────
export interface LogEntry { on: ISODate; by: string; area: 'assets' | 'benefits' | 'compensation'; action: string }

export interface RewardsState {
  version: 1;
  assets: AssetsState;
  benefits: BenefitsState;
  comp: CompState;
  log: LogEntry[];
}
