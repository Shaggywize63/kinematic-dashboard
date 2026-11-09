// Types for the pay-run checks. The checks read a pay run's payslips and compare them with the previous month's run of
// the same entity. They only ever produce findings for a person to look at. They never change a payslip or stop a run.

import type { Id, Month } from '../types';
import type { Confidence } from '../rules';

export type CheckKind =
  | 'net_swing' | 'headcount' | 'duplicate_bank' | 'status_pay' | 'invalid_pay'
  | 'min_wage' | 'pf_base' | 'esi_base' | 'missing_bank' | 'missing_uan';

export type FindingSeverity = 'high' | 'warning' | 'info';

export interface FindingFact { label: string; value: string }

export interface Finding {
  /** Stable across recomputes of the same run (kind plus who it is about), so a review can find it again. */
  id: string;
  kind: CheckKind;
  severity: FindingSeverity;
  /** Everyone the finding is about. The first one is the main person. */
  employeeIds: Id[];
  month: Month;
  title: string;
  /** Plain sentences, each with the numbers it rests on. */
  lines: string[];
  /** A few figures to show next to the sentences. */
  facts: FindingFact[];
  /** Set when the figure rests on a table that may be out of date (minimum wage, PF or ESI ceiling). */
  confidence?: Confidence;
  /** Changes when the numbers behind the finding change. A review only counts while the signature is the same. */
  signature: string;
}

export interface CheckInfo { kind: CheckKind; label: string; looksAt: string }
export interface CheckCoverage extends CheckInfo {
  /** How many things the check looked at (payslips, pairs of payslips, bank accounts ...). */
  examined: number;
  unit: string;
  found: number;
  /** Anything worth saying about the check on this run, for example why it was skipped. */
  note?: string;
}

export interface PayCheckResult {
  runId: Id;
  entityId: Id;
  month: Month;
  /** False when the run has no payslips yet (a draft that was never computed). */
  computed: boolean;
  prevRunId?: Id;
  prevMonth?: Month;
  payslips: number;
  prevPayslips: number;
  findings: Finding[];
  coverage: CheckCoverage[];
}

export type ReviewState = 'open' | 'reviewed' | 'changed';
