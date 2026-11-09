// Data shapes for the "control" area of the HRMS preview: the what-if simulator, the rule radar, the compliance
// autopilot and the monitoring ledger. These are the things people save (scenarios, radar decisions, filing evidence,
// monitoring switches). The people and payroll data stay in the core database; nothing here copies it.

import type { Id, ISODate, Month } from '../types';

// ───────────────────────────── simulator ─────────────────────────────
export type ScenarioType = 'increment' | 'hiring' | 'structure' | 'statutory';
export type IncrementScope = 'all' | 'department' | 'location' | 'grade';

export interface IncrementInput { type: 'increment'; percent: number; scope: IncrementScope; scopeValue: string; fromMonth: Month }
export interface HiringInput { type: 'hiring'; count: number; designationId: Id; annualCtc: number; locationId: Id; structureId: Id; fromMonth: Month }
export interface StructureInput { type: 'structure'; structureId: Id; basicPct: number; pfOnActual: boolean; fromMonth: Month }
export interface StatutoryInput { type: 'statutory'; rule: 'pf_ceiling' | 'esi_ceiling'; value: number; fromMonth: Month }
export type ScenarioInput = IncrementInput | HiringInput | StructureInput | StatutoryInput;

/** Only the inputs are saved. The numbers are worked out again from the current sample data whenever they are shown. */
export interface SavedScenario { id: Id; name: string; note?: string; input: ScenarioInput; savedAt: string; savedBy: string }

// ───────────────────────────── rule radar ─────────────────────────────
export type RadarStatus = 'new' | 'acknowledged' | 'applied' | 'not_applicable';
export interface RadarState { status: RadarStatus; note: string; by: string; at: string; taskId?: Id }

// ───────────────────────────── autopilot ─────────────────────────────
export interface FilingEvidence {
  by: string;
  at: string;
  /** What was attached. The preview records the names only; it does not store the files. */
  attachments: string[];
  note?: string;
}

// ───────────────────────────── monitoring ledger ─────────────────────────────
export type MonitoringStatus = 'on' | 'off' | 'blocked' | 'considering';
export type CoverageKind = 'field_staff' | 'all_staff' | 'location';
export type LegalBasis = 'consent' | 'employment';

export interface MonitoringRow {
  id: Id;
  name: string;
  /** Plain-language description of what is collected. Also used word for word in the employee notice. */
  collects: string;
  coverage: { kind: CoverageKind; locationId?: Id; label: string };
  purpose: string;
  legalBasis: LegalBasis;
  /** The purpose text of the consent record in the core database, when consent is the basis. */
  consentPurpose?: string;
  visibleTo: string[];
  retentionDays: number;
  /** Id of the matching rule in the core retention table, if there is one. It sets the policy window. */
  retentionRuleId?: Id;
  /** Why a retention longer than the policy window is kept. Writing one down clears the retention flag. */
  retentionReason?: string;
  status: MonitoringStatus;
  reviewedOn: ISODate;
  reviewer?: string;
  blockedReason?: string;
}

export interface MonitoringLogEntry { id: Id; at: string; by: string; rowId: Id; rowName: string; action: string; detail?: string }
export interface ConsentRequest { id: Id; rowId: Id; employeeId: Id; requestedOn: ISODate }

// ───────────────────────────── the store ─────────────────────────────
export interface ControlState {
  version: 1;
  scenarios: SavedScenario[];
  radar: Record<string, RadarState>;
  autopilot: {
    /** `${taskId}|${checkId}` → ticked. Only for checks a person has to confirm by hand. */
    manual: Record<string, boolean>;
    evidence: Record<Id, FilingEvidence>;
  };
  monitoring: {
    rows: MonitoringRow[];
    log: MonitoringLogEntry[];
    consentRequests: ConsentRequest[];
  };
}
