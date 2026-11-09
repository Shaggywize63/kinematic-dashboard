// Pure logic for policies and POSH: who a policy applies to, acknowledgement status, publishing a version,
// a line diff between two versions, and the POSH checks. No React, no storage, no clock (today is always passed in).

import type { Employee, HrmsDb, Id, ISODate } from '../types';
import { diffDays } from '../format';
import type {
  IcCommittee, Policy, PolicyAck, PolicyReminder, PolicyRef, PolicyVersion, PoshCase, PoshNature, PoshSession, PoshStatus,
} from './types';

export const currentVersion = (p: Policy): PolicyVersion => p.versions[p.versions.length - 1]!;
export const findVersion = (p: Policy, v: string): PolicyVersion | undefined => p.versions.find((x) => x.version === v);

/** The short form the assistant answers from. */
export function policyRefs(policies: Policy[]): PolicyRef[] {
  return policies.map((p) => {
    const c = currentVersion(p);
    return { id: p.id, title: p.title, version: c.version, effectiveFrom: c.effectiveFrom, summary: p.summary, keywords: [...new Set([p.title.toLowerCase(), ...p.keywords])] };
  });
}

// ───────────────────────────── who it applies to ─────────────────────────────
/** People a policy applies to today: working or on notice, in the policy's departments. Joiners sign in their first week, not here. */
export function audienceOf(db: HrmsDb, p: Policy): Employee[] {
  return db.employees.filter((e) => (e.status === 'active' || e.status === 'on_notice')
    && (p.audience.kind === 'all' || p.audience.ids.includes(e.departmentId)));
}

export type AckStatus = 'acknowledged' | 'pending' | 'not_required';
export interface AckRow {
  employee: Employee;
  status: AckStatus;
  at?: ISODate;
  /** Days since the version was published, or since the person joined if that was later. */
  daysPending: number;
  remindersSent: number;
  lastReminder?: string;
  /** The last version of this policy that the person did acknowledge, if any. */
  previouslyAcknowledged?: string;
}

export function daysPendingFor(v: PolicyVersion, e: Employee, today: ISODate): number {
  const from = e.joinDate > v.publishedOn ? e.joinDate : v.publishedOn;
  return Math.max(0, diffDays(from, today));
}

export function ackRows(db: HrmsDb, p: Policy, acks: PolicyAck[], reminders: PolicyReminder[], today: ISODate): AckRow[] {
  const v = currentVersion(p);
  return audienceOf(db, p).map((employee) => {
    const mine = acks.filter((a) => a.policyId === p.id && a.employeeId === employee.id);
    const got = mine.find((a) => a.version === v.version);
    const rem = reminders.filter((r) => r.policyId === p.id && r.version === v.version && r.employeeId === employee.id).sort((a, b) => a.at.localeCompare(b.at));
    const prev = mine.filter((a) => a.version !== v.version).sort((a, b) => a.at.localeCompare(b.at)).pop();
    const status: AckStatus = !v.requiresAck ? 'not_required' : got ? 'acknowledged' : 'pending';
    return {
      employee, status, at: got?.at, daysPending: status === 'pending' ? daysPendingFor(v, employee, today) : 0,
      remindersSent: rem.length, lastReminder: rem[rem.length - 1]?.at, previouslyAcknowledged: prev?.version,
    };
  });
}

export interface AckSummary { total: number; acknowledged: number; pending: number; rate: number | null; avgDaysPending: number; oldestPending: number }
export function ackSummary(rows: AckRow[]): AckSummary {
  const needed = rows.filter((r) => r.status !== 'not_required');
  const pend = needed.filter((r) => r.status === 'pending');
  const acknowledged = needed.length - pend.length;
  return {
    total: rows.length, acknowledged, pending: pend.length,
    rate: needed.length ? (acknowledged / needed.length) * 100 : null,
    avgDaysPending: pend.length ? Math.round(pend.reduce((s, r) => s + r.daysPending, 0) / pend.length) : 0,
    oldestPending: pend.reduce((m, r) => Math.max(m, r.daysPending), 0),
  };
}

/** What one person still has to acknowledge, across every policy that applies to them. */
export function personView(db: HrmsDb, policies: Policy[], acks: PolicyAck[], reminders: PolicyReminder[], employeeId: Id, today: ISODate) {
  return policies.flatMap((p) => {
    const row = ackRows(db, p, acks, reminders, today).find((r) => r.employee.id === employeeId);
    return row ? [{ policy: p, version: currentVersion(p), row }] : [];
  });
}

// ───────────────────────────── publishing ─────────────────────────────
export function nextVersionLabel(p: Policy, bump: 'minor' | 'major'): string {
  const [maj, min] = currentVersion(p).version.split('.').map(Number) as [number, number];
  return bump === 'major' ? `${maj + 1}.0` : `${maj}.${(min || 0) + 1}`;
}

export interface PublishDraft { changeSummary: string; effectiveFrom: ISODate; requiresAck: boolean; text: string; bump: 'minor' | 'major' }
export function validatePublish(p: Policy, d: PublishDraft, today: ISODate): Record<string, string> {
  const err: Record<string, string> = {};
  if (d.changeSummary.trim().length < 10) err.changeSummary = 'Say what changed, in at least a short sentence.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.effectiveFrom)) err.effectiveFrom = 'Pick the date the change starts.';
  else if (d.effectiveFrom < today) err.effectiveFrom = 'The start date cannot be in the past.';
  if (d.text.trim().length < 40) err.text = 'The policy text is too short.';
  else if (d.text.trim() === currentVersion(p).text.trim()) err.text = 'The text is the same as the current version. Change something, or cancel.';
  return err;
}

/** The policy with a new current version added. The old versions are kept untouched. */
export function withNewVersion(p: Policy, d: PublishDraft, by: string, today: ISODate): Policy {
  const v: PolicyVersion = {
    version: nextVersionLabel(p, d.bump), effectiveFrom: d.effectiveFrom, publishedOn: today, publishedBy: by,
    changeSummary: d.changeSummary.trim(), requiresAck: d.requiresAck, text: d.text.replace(/\s+$/g, ''),
  };
  return { ...p, versions: [...p.versions, v] };
}

// ───────────────────────────── line diff ─────────────────────────────
export interface DiffLine { type: 'same' | 'add' | 'del'; text: string }
export interface DiffStats { added: number; removed: number; unchanged: number }

/** A plain line-by-line diff (longest common subsequence). Enough to show what a new version changed. */
export function lineDiff(a: string, b: string): DiffLine[] {
  const x = a.split('\n'); const y = b.split('\n');
  const n = x.length; const m = y.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: DiffLine[] = [];
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ type: 'same', text: x[i]! }); i++; j++; }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) { out.push({ type: 'del', text: x[i]! }); i++; }
    else { out.push({ type: 'add', text: y[j]! }); j++; }
  }
  while (i < n) out.push({ type: 'del', text: x[i++]! });
  while (j < m) out.push({ type: 'add', text: y[j++]! });
  return out;
}
export function diffStats(d: DiffLine[]): DiffStats {
  return { added: d.filter((l) => l.type === 'add').length, removed: d.filter((l) => l.type === 'del').length, unchanged: d.filter((l) => l.type === 'same').length };
}

// ───────────────────────────── POSH ─────────────────────────────
export const POSH_NATURE_LABEL: Record<PoshNature, string> = { verbal: 'Verbal conduct', written_online: 'Written or online conduct', physical: 'Physical conduct', other: 'Other' };
export const POSH_STATUS_LABEL: Record<PoshStatus, string> = { received: 'Received', inquiry: 'Under inquiry', report_submitted: 'Report submitted', closed: 'Closed' };

export function poshCounts(cases: PoshCase[]) {
  const byStatus = (Object.keys(POSH_STATUS_LABEL) as PoshStatus[]).map((s) => ({ key: s, label: POSH_STATUS_LABEL[s], count: cases.filter((c) => c.status === s).length }));
  const byNature = (Object.keys(POSH_NATURE_LABEL) as PoshNature[]).map((s) => ({ key: s, label: POSH_NATURE_LABEL[s], count: cases.filter((c) => c.nature === s).length }));
  return { byStatus, byNature, total: cases.length };
}

export interface IcCheck { id: string; label: string; ok: boolean; detail: string }
/** The Internal Committee composition, checked against what the Act is reported to ask for. The result is advice, not a legal opinion. */
export function icChecks(db: HrmsDb, c: IcCommittee, today: ISODate): IcCheck[] {
  const emp = (id?: Id) => db.employees.find((e) => e.id === id);
  const staff = c.members.filter((m) => m.role !== 'external');
  const presiding = c.members.find((m) => m.role === 'presiding');
  const pe = emp(presiding?.employeeId);
  const external = c.members.filter((m) => m.role === 'external');
  const genderOf = (m: (typeof c.members)[number]) => (m.role === 'external' ? m.gender : emp(m.employeeId)?.gender);
  const known = c.members.filter((m) => genderOf(m));
  const women = known.filter((m) => genderOf(m) === 'female').length;
  const ordinary = c.members.filter((m) => m.role === 'member');
  const left = staff.filter((m) => { const e = emp(m.employeeId); return !e || e.status === 'exited'; });
  const tenureDays = diffDays(c.constitutedOn, c.tenureEnds) + 1;
  return [
    { id: 'presiding', label: 'Presiding officer is a woman employee', ok: !!pe && pe.gender === 'female' && pe.status !== 'exited', detail: pe ? `${pe.firstName} ${pe.lastName}` : 'Not set' },
    { id: 'members', label: 'At least two other employee members', ok: ordinary.length >= 2, detail: `${ordinary.length} employee member${ordinary.length === 1 ? '' : 's'}` },
    { id: 'external', label: 'One external member', ok: external.length >= 1, detail: external.length ? (external[0]!.name ?? 'Named') : 'Not set' },
    { id: 'women', label: 'At least half the members are women', ok: known.length > 0 && women * 2 >= known.length, detail: `${women} of ${known.length}` },
    { id: 'tenure', label: 'Tenure is three years or less and not over', ok: tenureDays <= 3 * 366 && c.tenureEnds >= today, detail: `${c.constitutedOn} to ${c.tenureEnds}` },
    { id: 'present', label: 'Every employee member is still with the company', ok: left.length === 0, detail: left.length ? `${left.length} to replace` : 'All present' },
  ];
}

export function headcount(db: HrmsDb): number {
  return db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice').length;
}

export interface AnnualReportData {
  year: number;
  filed: number;
  disposed: number;
  pendingAtYearEnd: number;
  pendingOver90: number;
  sessions: number;
}
/** Figures the annual report asks for, worked out from the register. `asOn` is the day the report is read. */
export function annualReport(cases: PoshCase[], sessions: PoshSession[], year: number, asOn: ISODate): AnnualReportData {
  const y = (d?: ISODate) => (d ? Number(d.slice(0, 4)) : 0);
  const open = cases.filter((c) => c.receivedOn.slice(0, 4) <= String(year) && (c.status !== 'closed' || y(c.closedOn) > year));
  return {
    year,
    filed: cases.filter((c) => y(c.receivedOn) === year).length,
    disposed: cases.filter((c) => c.status === 'closed' && y(c.closedOn) === year).length,
    pendingAtYearEnd: open.length,
    pendingOver90: open.filter((c) => diffDays(c.receivedOn, asOn) > 90).length,
    sessions: sessions.filter((s) => y(s.date) === year).length,
  };
}

export interface TrainingCoverage { year: number; trained: number; total: number; pct: number; pending: Employee[] }
export function trainingCoverage(db: HrmsDb, sessions: PoshSession[], year: number): TrainingCoverage {
  const people = db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice');
  const seen = new Set(sessions.filter((s) => Number(s.date.slice(0, 4)) === year).flatMap((s) => s.attendees));
  const pending = people.filter((e) => !seen.has(e.id));
  return { year, trained: people.length - pending.length, total: people.length, pct: people.length ? ((people.length - pending.length) / people.length) * 100 : 0, pending };
}

/** Next case id for a year: POSH-2026-005. */
export function nextCaseId(cases: PoshCase[], year: number): string {
  const n = cases.filter((c) => c.id.startsWith(`POSH-${year}-`)).reduce((m, c) => Math.max(m, Number(c.id.split('-')[2]) || 0), 0);
  return `POSH-${year}-${String(n + 1).padStart(3, '0')}`;
}
