// Monitoring ledger. Pure functions: who a monitoring practice covers, whether they have given consent, whether it is kept too long,
// the plain-language notice an employee would read, and the checks before something can be switched on.
//
// Ethics rules built in: a blocked practice cannot be switched on from here; switching one on needs a purpose, a retention period and a
// named reviewer; nothing in this file ranks or scores a person.

import type { Employee, HrmsDb, Id, ISODate } from '../types';
import { fmtDate } from '../format';
import { PREVIEW_TODAY } from '../seed';
import type { MonitoringRow, MonitoringStatus } from './types';

/** Designations that work in the field. The sample company's field staff are the team leads, area sales executives and field executives. */
export const FIELD_DESIGNATIONS = ['des_tl', 'des_ase', 'des_fe'];
/** Used when the core retention table has no rule for a practice: monitoring data is kept 90 days unless a reason is written down. */
export const DEFAULT_WINDOW_DAYS = 90;
export const STATUS_LABEL: Record<MonitoringStatus, string> = { on: 'On', off: 'Off', blocked: 'Blocked', considering: 'Considering' };

const isLive = (e: Employee) => e.status === 'active' || e.status === 'on_notice';

export function coveredPeople(db: HrmsDb, row: Pick<MonitoringRow, 'coverage'>): Employee[] {
  const live = db.employees.filter(isLive);
  if (row.coverage.kind === 'field_staff') return live.filter((e) => FIELD_DESIGNATIONS.includes(e.designationId));
  if (row.coverage.kind === 'location') return live.filter((e) => e.locationId === row.coverage.locationId);
  return live;
}

// ───────────────────────────── consent ─────────────────────────────
export interface ConsentCoverage {
  /** True when consent is the stated basis and a consent purpose is linked. */
  applicable: boolean;
  purpose?: string;
  covered: number;
  withConsent: number;
  missing: { employee: Employee; reason: 'never' | 'withdrawn'; since?: string }[];
}

export function consentCoverage(db: HrmsDb, row: MonitoringRow): ConsentCoverage {
  const people = coveredPeople(db, row);
  if (row.legalBasis !== 'consent' || !row.consentPurpose) return { applicable: false, covered: people.length, withConsent: 0, missing: [] };
  const missing: ConsentCoverage['missing'] = [];
  let ok = 0;
  for (const e of people) {
    const mine = db.consents.filter((c) => c.employeeId === e.id && c.purpose === row.consentPurpose);
    if (mine.some((c) => !c.withdrawnAt)) { ok += 1; continue; }
    const withdrawn = mine.filter((c) => c.withdrawnAt).sort((a, b) => (b.withdrawnAt ?? '').localeCompare(a.withdrawnAt ?? ''))[0];
    missing.push(withdrawn ? { employee: e, reason: 'withdrawn', since: withdrawn.withdrawnAt!.slice(0, 10) } : { employee: e, reason: 'never' });
  }
  return { applicable: true, purpose: row.consentPurpose, covered: people.length, withConsent: ok, missing };
}

// ───────────────────────────── retention ─────────────────────────────
export function retentionText(days: number): string {
  if (!days || days <= 0) return 'Not set';
  if (days === 365) return '1 year';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** The longest this practice should keep data: the matching rule in the core retention table, else the default window. */
export function policyWindow(db: HrmsDb, row: Pick<MonitoringRow, 'retentionRuleId'>): { days: number; source: string } {
  const rule = row.retentionRuleId ? db.retention.find((r) => r.id === row.retentionRuleId) : undefined;
  if (rule) return { days: Math.ceil(rule.keepYears * 365), source: `Retention rule "${rule.dataset}" on the Privacy page` };
  return { days: DEFAULT_WINDOW_DAYS, source: `Default window of ${DEFAULT_WINDOW_DAYS} days for monitoring data` };
}

export interface RetentionFlag { row: MonitoringRow; windowDays: number; source: string; overBy: number; action: string }

/** Practices that are on, or being considered, whose retention is longer than the window and has no reason written down. */
export function retentionFlags(db: HrmsDb, rows: MonitoringRow[]): RetentionFlag[] {
  const out: RetentionFlag[] = [];
  for (const row of rows) {
    if (row.status !== 'on' && row.status !== 'considering') continue;
    const w = policyWindow(db, row);
    if (row.retentionDays <= w.days || row.retentionReason) continue;
    out.push({ row, windowDays: w.days, source: w.source, overBy: row.retentionDays - w.days, action: `Shorten to ${retentionText(w.days)}, or write down why ${retentionText(row.retentionDays)} is needed.` });
  }
  return out;
}

// ───────────────────────────── switching on ─────────────────────────────
export interface TurnOnInput { purpose: string; retentionDays: number; reviewer: string }
export function validateTurnOn(input: TurnOnInput): Record<string, string> {
  const err: Record<string, string> = {};
  if (input.purpose.trim().length < 15) err.purpose = 'Say in a full sentence why this is needed (at least 15 characters).';
  if (!Number.isInteger(input.retentionDays) || input.retentionDays < 1 || input.retentionDays > 3650) err.retentionDays = 'Enter a whole number of days from 1 to 3650.';
  if (!input.reviewer.trim()) err.reviewer = 'Name the person who will review this.';
  return err;
}
export const canTurnOn = (row: Pick<MonitoringRow, 'status'>): boolean => row.status === 'off' || row.status === 'considering';

export function monitoringCounts(rows: MonitoringRow[]): Record<MonitoringStatus, number> {
  const out: Record<MonitoringStatus, number> = { on: 0, off: 0, blocked: 0, considering: 0 };
  for (const r of rows) out[r.status] += 1;
  return out;
}

// ───────────────────────────── employee notice ─────────────────────────────
const BASIS_TEXT: Record<MonitoringRow['legalBasis'], string> = {
  consent: 'You have agreed to this, and you can take your agreement back at any time.',
  employment: 'It is needed to do your job and to pay you correctly.',
};

/** A plain-language notice generated from the ledger. English only; have your advisor read it before it is shared. */
export function noticeText(rows: MonitoringRow[], today: ISODate = PREVIEW_TODAY): string {
  const on = rows.filter((r) => r.status === 'on');
  const considering = rows.filter((r) => r.status === 'considering');
  const not = rows.filter((r) => r.status === 'off' || r.status === 'blocked');
  const lines: string[] = ['How we use technology to see how work is done', `Last updated: ${fmtDate(today)}`, ''];
  lines.push(on.length ? 'What we collect' : 'We do not collect anything through monitoring tools at the moment.');
  on.forEach((r, i) => {
    lines.push(
      `${i + 1}. ${r.name}`,
      `   What: ${r.collects}`,
      `   Who it covers: ${r.coverage.label}`,
      `   Why: ${r.purpose}`,
      `   Who can see it: ${r.visibleTo.length ? r.visibleTo.join('; ') : 'No one'}`,
      `   How long we keep it: ${retentionText(r.retentionDays)}, then it is deleted`,
      `   Basis: ${BASIS_TEXT[r.legalBasis]}`,
      '',
    );
  });
  if (not.length) {
    lines.push('What we do not do');
    for (const r of not) lines.push(`- ${r.name}: ${r.status === 'blocked' ? 'we do not do this and we do not offer it.' : 'we do not do this.'}`);
    lines.push('');
  }
  if (considering.length) {
    lines.push('What we are thinking about');
    for (const r of considering) lines.push(`- ${r.name}. If we decide to go ahead, we will update this notice before it starts.`);
    lines.push('');
  }
  lines.push(
    'Our promises',
    '- We collect the least that does the job.',
    '- We tell you what we collect and why. This notice is that.',
    '- We keep it for a short time.',
    '- We never use it to rank or score people.',
    '',
    'If you have a question or a concern, talk to the People team.',
  );
  return lines.join('\n');
}

export const personHref = (id: Id) => `/dashboard/hrms/employees/${id}`;
