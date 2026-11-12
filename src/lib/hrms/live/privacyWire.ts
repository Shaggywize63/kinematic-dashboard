// Privacy and DPDP on the server (phase 5): the one place where the dashboard's own privacy shapes meet the HRMS privacy
// API's. Same convention as wire.ts / payrollWire.ts / timeWire.ts / lifecycleWire.ts: top-level keys are snake_case with
// null for "nothing". Dates are YYYY-MM-DD; timestamps are ISO.
//
// Pure: no I/O, no React. Three collections live here — compliance tasks, consent records and retention rules. All three
// are ordinary {id} records (POST/PUT/DELETE), diffed and synced like onboarding / exits / letters.
//
// ComplianceTask.status is DERIVED client-side (builders.ts, from due_on + filed_on against today); the server stores only
// filed_on / reference and the wire row carries NO status. complianceFromWire sets a placeholder status that the calendar
// re-derives, so the stored value never matters for what is shown.
//
// The access log is read through the EXISTING phase-1 endpoint (GET /hrms/access-log); its rows map here too
// (by_name -> byUser, as phase 1 returns it, mirroring historyFromWire's by_name -> by).

import type { AccessLogEntry, ComplianceTask, ConsentRecord, RetentionRule } from '../types';
import { arr, blankToNull, bodyFor, num, str, type Row, type Spec } from './wire';

// ───────────────────────────── enum guards (the server's CHECK columns already keep these valid) ─────────────────────────────
const COMPLIANCE_LAWS: ComplianceTask['law'][] = ['PF', 'ESI', 'PT', 'LWF', 'TDS', 'Shops', 'CLRA', 'POSH', 'Gratuity', 'Bonus'];
const RETENTION_ACTIONS: RetentionRule['action'][] = ['delete', 'anonymise'];
const pick = <T extends string>(allowed: T[], v: unknown, fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

// ───────────────────────────── compliance tasks (status is derived, never stored) ─────────────────────────────
export function complianceFromWire(r: Row): ComplianceTask {
  const filedOn = str(r.filed_on);
  return {
    id: String(r.id), name: String(r.name ?? ''), law: pick(COMPLIANCE_LAWS, r.law, 'TDS'),
    dueOn: str(r.due_on) ?? '', entityId: String(r.entity_id ?? ''), state: str(r.state),
    // The calendar always re-derives this (filed_on wins); the placeholder is only so the type is satisfied.
    status: filedOn ? 'filed' : 'upcoming', filedOn, reference: str(r.reference),
  };
}
const COMPLIANCE_SPECS: Spec[] = [
  { local: 'name', wire: 'name', nullable: false },
  { local: 'law', wire: 'law', nullable: false },
  { local: 'dueOn', wire: 'due_on', nullable: false },
  { local: 'entityId', wire: 'entity_id', nullable: false },
  { local: 'state', wire: 'state', nullable: true, out: blankToNull },
  { local: 'filedOn', wire: 'filed_on', nullable: true, out: blankToNull },
  { local: 'reference', wire: 'reference', nullable: true, out: blankToNull },
];
export const complianceCreateBody = (t: ComplianceTask): Row => ({ id: t.id, ...bodyFor(COMPLIANCE_SPECS, t as unknown as Row).body });
/**
 * The patch for a compliance task. `status` is DERIVED and never sent on the wire, but markFiled / reopen do change the local
 * status alongside filed_on. When a stored field already changed, `status` is appended to the rollback keys (not to the body),
 * so a sync that fails and rolls back restores the optimistic status too. A reconcile after success overwrites it from filed_on.
 */
export function compliancePatch(prev: ComplianceTask, next: ComplianceTask): { body: Row; keys: string[] } {
  const r = bodyFor(COMPLIANCE_SPECS, next as unknown as Row, prev as unknown as Row);
  if (r.keys.length && prev.status !== next.status && !r.keys.includes('status')) r.keys.push('status');
  return r;
}

// ───────────────────────────── consent records ─────────────────────────────
export function consentFromWire(r: Row): ConsentRecord {
  return {
    id: String(r.id), employeeId: String(r.employee_id ?? ''), purpose: String(r.purpose ?? ''),
    noticeVersion: String(r.notice_version ?? ''), grantedAt: str(r.granted_at) ?? '', withdrawnAt: str(r.withdrawn_at),
  };
}
const CONSENT_SPECS: Spec[] = [
  { local: 'employeeId', wire: 'employee_id', nullable: false },
  { local: 'purpose', wire: 'purpose', nullable: false },
  { local: 'noticeVersion', wire: 'notice_version', nullable: false },
  { local: 'grantedAt', wire: 'granted_at', nullable: false },
  { local: 'withdrawnAt', wire: 'withdrawn_at', nullable: true, out: blankToNull },
];
export const consentCreateBody = (c: ConsentRecord): Row => ({ id: c.id, ...bodyFor(CONSENT_SPECS, c as unknown as Row).body });
export const consentPatch = (prev: ConsentRecord, next: ConsentRecord) => bodyFor(CONSENT_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── retention rules ─────────────────────────────
export function retentionFromWire(r: Row): RetentionRule {
  return {
    id: String(r.id), dataset: String(r.dataset ?? ''), keepYears: num(r.keep_years) ?? 0,
    basis: String(r.basis ?? ''), action: pick(RETENTION_ACTIONS, r.action, 'delete'),
  };
}
const RETENTION_SPECS: Spec[] = [
  { local: 'dataset', wire: 'dataset', nullable: false },
  { local: 'keepYears', wire: 'keep_years', nullable: false },
  { local: 'basis', wire: 'basis', nullable: false },
  { local: 'action', wire: 'action', nullable: false },
];
export const retentionCreateBody = (r: RetentionRule): Row => ({ id: r.id, ...bodyFor(RETENTION_SPECS, r as unknown as Row).body });
export const retentionPatch = (prev: RetentionRule, next: RetentionRule) => bodyFor(RETENTION_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── the access log (existing GET /hrms/access-log, newest first) ─────────────────────────────
/** Map a server access-log row to the dashboard's AccessLogEntry. by_name is the actor; by_user_id is the fallback, as phase 1 returns it. */
export function accessLogFromWire(r: Row): AccessLogEntry {
  return {
    id: String(r.id ?? ''), at: str(r.at) ?? '', byUser: str(r.by_name) ?? str(r.by_user_id) ?? 'Unknown',
    employeeId: String(r.employee_id ?? ''), field: String(r.field ?? ''), reason: String(r.reason ?? ''),
  };
}

// ───────────────────────────── the bootstrap ─────────────────────────────
export interface PrivacyData {
  compliance: ComplianceTask[]; consents: ConsentRecord[]; retention: RetentionRule[];
  serverTime?: string;
}
export function privacyFromWire(data: Row): PrivacyData {
  return {
    compliance: arr(data.compliance_tasks).map(complianceFromWire),
    consents: arr(data.consents).map(consentFromWire),
    retention: arr(data.retention_rules).map(retentionFromWire),
    serverTime: str(data.server_time),
  };
}
