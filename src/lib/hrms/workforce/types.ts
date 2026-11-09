// Workforce area: contract labour, wage access, site kiosk and verified onboarding.
// One persisted store (`workforce`) holds the sample data and the changes people make. People and pay come from the
// core HRMS database (employees, roster, loans, attendance); only what is new lives here.

import type { EmploymentType, ISODate, Id, Month } from '../types';

// ───────────────────────────── contract labour ─────────────────────────────
export type Skill = 'unskilled' | 'semi_skilled' | 'skilled';

export interface Contractor {
  id: Id;
  name: string;
  licenceNo: string;
  licenceFrom: ISODate;
  licenceTo: ISODate;
  site: string;
  locationId: Id;              // the core location (its legal entity holds the contract labour registration)
  state: string;               // minimum wages are looked up by this state
  pfCode: string;
  esiCode: string;
  monthlyInvoice: number;      // rupees, the usual monthly bill
  contact: string;
}

/** A worker the contractor deployed. Wage and days are kept per month (the contractor's payroll as reported to us). */
export interface ContractWorker {
  id: Id;
  contractorId: Id;
  name: string;
  skill: Skill;
  days: Record<Month, number>;       // days present
  wagePaid: Record<Month, number>;   // rupees actually paid, as per the wage proof
}

/** A contract worker who is also in the core HRMS records (employmentType 'contract'). */
export interface CoreAssignment { employeeId: Id; contractorId: Id; skill: Skill }

export interface ContractInvoice { id: Id; contractorId: Id; month: Month; amount: number; headcount: number; reference: string }

export type ProofKind = 'wage_payment' | 'pf_challan' | 'esi_challan' | 'wage_register' | 'attendance_register' | 'licence_copy';
export type ProofStatus = 'received' | 'missing' | 'rejected';
export interface Proof {
  id: Id;
  contractorId: Id;
  month: Month;
  kind: ProofKind;
  status: ProofStatus;
  fileName?: string;
  uploadedOn?: ISODate;
  verifiedBy?: string;
  verifiedOn?: ISODate;
  rejectReason?: string;
}

export interface InvoiceDecision {
  id: Id;                       // `${contractorId}:${month}`
  contractorId: Id;
  month: Month;
  decision: 'cleared' | 'hold';
  reason: string;
  contractorReply?: string;
  by: string;
  on: ISODate;
  advisory: 'hold' | 'review' | 'clear'; // what the engine advised at the time, so an override is visible later
}

export interface ContractData {
  contractors: Contractor[];
  workers: ContractWorker[];
  coreAssignments: CoreAssignment[];
  invoices: ContractInvoice[];
  proofs: Proof[];
  decisions: InvoiceDecision[];
}

// ───────────────────────────── wage access ─────────────────────────────
export interface WagePolicy {
  maxSharePct: number;          // share of the earned salary that can be drawn
  monthlyRequestLimit: number;
  fee: number;                  // flat rupees per request
  minTenureMonths: number;
  eligibleTypes: EmploymentType[];
  minAmount: number;            // smallest request
}

export type WageRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled' | 'settled';
export interface WageRequest {
  id: Id;
  employeeId: Id;
  month: Month;                 // the month whose salary is being drawn from
  amount: number;
  fee: number;
  status: WageRequestStatus;
  requestedOn: ISODate;
  note?: string;
  decidedBy?: string;
  decidedOn?: ISODate;
  reason?: string;              // decline reason, or a remark on approval
  loanId?: Id;                  // the core advance created on approval
  recoverIn?: Month;            // payroll month that recovers it
}

export interface WageData { policy: WagePolicy; requests: WageRequest[] }

// ───────────────────────────── site kiosk ─────────────────────────────
export interface KioskDevice {
  id: Id;
  name: string;
  location: string;
  status: 'active' | 'disabled';
  lastSeenDate: ISODate;
  lastSeenMin: number;          // minutes since midnight
  addedOn: ISODate;
}

export type PunchDirection = 'in' | 'out';
export type PunchFlag = 'double_in' | 'out_without_in' | 'outside_shift' | 'weekly_off' | 'late' | 'duplicate';
export interface Punch {
  id: Id;
  employeeId: Id;
  date: ISODate;
  minute: number;               // minutes since midnight
  direction: PunchDirection;
  deviceId: Id;
  result: 'accepted' | 'flagged' | 'ignored';
  flags: PunchFlag[];
  source: 'kiosk' | 'correction';
  note?: string;
}

export type KioskExceptionKind = 'double_in' | 'out_without_in' | 'outside_shift' | 'weekly_off' | 'missing_out';
export interface KioskException {
  id: Id;
  key: string;                  // dedupe key, so a sweep never raises the same thing twice
  kind: KioskExceptionKind;
  employeeId: Id;
  date: ISODate;
  detail: string;
  punchId?: Id;
  status: 'open' | 'resolved';
  resolvedBy?: string;
  resolvedOn?: ISODate;
  resolution?: string;
}

export interface KioskRules {
  duplicateWindowMin: number;   // a second punch inside this many minutes is ignored
  maxPinTries: number;
  lockoutMin: number;
  earlyWindowMin: number;       // punching this long before the shift starts is normal
  lateWindowMin: number;        // and this long after it ends
  retentionDays: number;
}

export interface PinLock { tries: number; lockedUntil?: number } // lockedUntil is an absolute minute, see kioskEngine.toAbs

export interface KioskData {
  clockMin: number;             // preview clock: minutes since midnight on the preview day
  rules: KioskRules;
  devices: KioskDevice[];
  pins: Record<Id, string>;
  locks: Record<Id, PinLock>;
  punches: Punch[];
  exceptions: KioskException[];
}

// ───────────────────────────── verified onboarding ─────────────────────────────
export type StepKey = 'pan' | 'aadhaar' | 'bank' | 'uan' | 'education' | 'employer';
export type StepStatus = 'not_started' | 'in_progress' | 'verified' | 'mismatch' | 'failed';

export interface StepRecord {
  status: StepStatus;
  evidence?: string;
  ranAt?: ISODate;
  ranBy?: string;
  runs: number;
  consentAt?: ISODate;
  /** Both sides of a name or date mismatch, shown side by side. */
  compare?: { label: string; ours: string; theirs: string };
  accepted?: { reason: string; by: string; on: ISODate };
  correction?: { note: string; by: string; on: ISODate };
}

export interface VerifyInputs {
  pan: string;
  bankAccount: string;
  ifsc: string;
  accountHolder: string;
  uan: string;                  // blank means "generate one"
  degree: string;
  institution: string;
  gradYear: string;
  employerName: string;
  employerFrom: ISODate | '';
  employerTo: ISODate | '';
  employerEmail: string;
}

export interface VerifyCase {
  id: Id;
  employeeId?: Id;              // the core employee, when one exists
  name: string;                 // as written on the offer letter
  role: string;
  joinDate: ISODate;
  aadhaarLast4?: string;        // the only part of the Aadhaar number ever kept
  inputs: VerifyInputs;
  steps: Record<StepKey, StepRecord>;
  /** Values the registry returned that the core record needs when the person is cleared. */
  results: { bankName?: string; uan?: string; uanStatus?: 'generated' | 'activated' | 'aadhaar_seeded' };
  cleared?: { by: string; on: ISODate; wroteToEmployee: boolean };
}

export interface VerifyData { cases: VerifyCase[] }

// ───────────────────────────── the whole store ─────────────────────────────
export interface WorkforceData {
  contract: ContractData;
  wage: WageData;
  kiosk: KioskData;
  verify: VerifyData;
}
