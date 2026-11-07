// Logic behind the Privacy page: retention sentences and purge dates, the request clock, the readiness checklist.
// Pure functions; the components only render what these return.

import type { HrmsDb, ISODate, RetentionRule } from '../../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { addDays, diffDays, fmtDate, fmtMonth } from '../../../../lib/hrms/format';
import { monthEnd } from '../../../../lib/hrms/rules';

// ───────────────────────────────── retention ─────────────────────────────────
/** 0.25 → "90 days", 0.08 → "30 days", 8 → "8 years", 1.5 → "1.5 years". Under a year the figure is in days. */
export function durationText(keepYears: number): string {
  if (keepYears >= 1) {
    const y = Math.round(keepYears * 100) / 100;
    return `${y} ${y === 1 ? 'year' : 'years'}`;
  }
  let days = Math.round(keepYears * 360);
  if (days >= 20) days = Math.round(days / 5) * 5; // 0.08 years reads as 30 days, 0.25 as 90 days
  return `${Math.max(1, days)} ${days === 1 ? 'day' : 'days'}`;
}

/** "After 90 days the location trail is deleted." */
export function retentionSentence(rule: Pick<RetentionRule, 'dataset' | 'keepYears' | 'action'>): string {
  const bare = rule.dataset.replace(/\s*\(.*?\)\s*/g, ' ').trim().replace(/^the\s+/i, '');
  const lower = bare.charAt(0).toLowerCase() + bare.slice(1);
  const last = lower.split(/\s+/).pop() ?? '';
  const plural = / and /.test(lower) || (/s$/.test(last) && !/ss$/.test(last));
  const verb = rule.action === 'delete' ? 'deleted' : 'anonymised';
  return `After ${durationText(rule.keepYears)} the ${lower} ${plural ? 'are' : 'is'} ${verb}.`;
}

export interface PurgeIllustration { anchorLabel: string; anchor: ISODate; purgeOn: ISODate; daysTo: number }

/** Where the illustration starts counting from, taken from the sample data when the dataset has a natural date. */
export function purgeIllustration(db: HrmsDb, rule: RetentionRule): PurgeIllustration {
  const d = rule.dataset.toLowerCase();
  let anchor: ISODate = PREVIEW_TODAY;
  let anchorLabel = 'a record created today';
  if (/salary|payslip/.test(d)) {
    const runs = db.payRuns.filter((r) => r.payslips.length).map((r) => r.month).sort();
    if (runs[0]) { anchor = monthEnd(runs[0]); anchorLabel = `the oldest pay run in the sample (${fmtMonth(runs[0])}), counted from the end of its month`; }
  } else if (/attendance|muster/.test(d)) {
    const ms = db.attendance.map((a) => a.month).sort();
    if (ms[0]) { anchor = monthEnd(ms[0]); anchorLabel = `the oldest attendance month in the sample (${fmtMonth(ms[0])}), counted from the end of that month`; }
  } else if (/face/.test(d)) {
    const exits = db.employees.filter((e) => e.status === 'exited' && e.lastWorkingDate).map((e) => e.lastWorkingDate!).sort();
    if (exits[0]) { anchor = exits[0]; anchorLabel = `the earliest exit in the sample (last working day ${fmtDate(exits[0])})`; }
  }
  const purgeOn = addDays(anchor, Math.round(rule.keepYears * 365));
  return { anchorLabel, anchor, purgeOn, daysTo: diffDays(PREVIEW_TODAY, purgeOn) };
}

// ───────────────────────────────── requests ─────────────────────────────────
export type DsrType = 'access' | 'correction' | 'erasure';
export type DsrStatus = 'received' | 'in_review' | 'done' | 'rejected';
export interface Dsr { id: string; type: DsrType; employeeId: string; details: string; receivedOn: ISODate; status: DsrStatus; closedOn?: ISODate; note?: string }

export const DSR_DAYS = 30;
export const DSR_LABEL: Record<DsrType, string> = { access: 'Access', correction: 'Correction', erasure: 'Erasure' };
export const DSR_STATUS_LABEL: Record<DsrStatus, string> = { received: 'Received', in_review: 'In review', done: 'Done', rejected: 'Rejected' };

export const dsrDue = (r: Dsr): ISODate => addDays(r.receivedOn, DSR_DAYS);
export const dsrOpen = (r: Dsr) => r.status === 'received' || r.status === 'in_review';
/** Days left on the clock (negative when overdue). Closed requests have no clock. */
export const dsrDaysLeft = (r: Dsr): number => diffDays(PREVIEW_TODAY, dsrDue(r));

export function seedRequests(db: HrmsDb): Dsr[] {
  const has = (id: string) => db.employees.some((e) => e.id === id);
  const items: Dsr[] = [
    { id: 'dsr_1', type: 'access', employeeId: 'emp_5', details: 'Asked for a copy of the personal data held about her, including attendance and location records.', receivedOn: '2026-10-20', status: 'in_review' },
    { id: 'dsr_2', type: 'correction', employeeId: 'emp_7', details: 'The name on the bank record does not match the bank passbook.', receivedOn: '2026-10-05', status: 'received' },
    { id: 'dsr_3', type: 'erasure', employeeId: 'emp_23', details: 'Left in September and asked for her face template and location trail to be erased.', receivedOn: '2026-09-28', status: 'done', closedOn: '2026-10-15', note: 'Face template and location trail removed. Payroll records kept because tax rules require them.' },
  ];
  return items.filter((r) => has(r.employeeId));
}

// ───────────────────────────────── readiness ─────────────────────────────────
export type ReadyStatus = 'in_place' | 'partial' | 'not_built';
export interface ReadyItem { key: string; title: string; status: ReadyStatus; detail: string }
export const READY_LABEL: Record<ReadyStatus, string> = { in_place: 'In place', partial: 'Partly', not_built: 'Not built' };

/** The first provisions and the core duties, as reported. Both need confirming with counsel. */
export const DPDP_DATES = { firstProvisions: '2026-11-13', coreDuties: '2027-05-13' } as const;

export function readinessItems(db: HrmsDb): ReadyItem[] {
  const versions = [...new Set(db.consents.map((c) => c.noticeVersion))].sort();
  const purposes = new Set(db.consents.map((c) => c.purpose));
  const active = db.employees.filter((e) => e.status === 'active');
  const covered = active.filter((e) => db.consents.some((c) => c.employeeId === e.id));
  const withdrawn = db.consents.filter((c) => c.withdrawnAt).length;
  const allCovered = active.length > 0 && covered.length === active.length;
  return [
    {
      key: 'notice', title: 'Privacy notice', status: versions.length ? 'partial' : 'not_built',
      detail: versions.length
        ? `Consents point to notice versions ${versions.join(' and ')}. The notice text itself is not stored in the preview, so only the version trail exists.`
        : 'No notice version is recorded against any consent.',
    },
    {
      key: 'consent', title: 'Consent ledger', status: db.consents.length === 0 ? 'not_built' : allCovered ? 'in_place' : 'partial',
      detail: `${db.consents.length} records across ${purposes.size} purposes, ${withdrawn} withdrawn. ${covered.length} of ${active.length} active employees have at least one consent on record.`,
    },
    {
      key: 'retention', title: 'Retention rules', status: db.retention.length ? 'partial' : 'not_built',
      detail: `${db.retention.length} rules define how long each dataset is kept. Nothing is deleted or anonymised automatically in the preview.`,
    },
    {
      key: 'erasure', title: 'Erasure and correction', status: 'partial',
      detail: 'Requests can be logged and tracked on a 30-day clock, but they are held in this browser tab only and the preview erases nothing.',
    },
    {
      key: 'breach', title: 'Breach log', status: 'not_built',
      detail: 'There is no breach register in the data model yet: no record of incidents, who was told, or when.',
    },
    {
      key: 'access', title: 'Access logs', status: db.accessLog.length ? 'in_place' : 'partial',
      detail: `${db.accessLog.length} entries. Revealing a sensitive field in Employees, or exporting a file that holds one in full, writes a row here.`,
    },
  ];
}
