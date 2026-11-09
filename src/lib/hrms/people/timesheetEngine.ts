// Timesheets: week maths, validation, totals, billable split, budget and utilisation. Pure functions.
// Utilisation is billable hours divided by the standard week (policy), per person or for a whole team.
// The screens show a person's own figure to that person and their manager only, and show teams as aggregates.

import type { Employee, Id, ISODate } from '../types';
import { addDays, diffDays, fmtDate } from '../format';
import type { Project, Sheet, SheetLine, SheetStatus, TimesheetPolicy } from './types';
import type { Team } from './teams';

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const sheetId = (employeeId: Id, weekStart: ISODate): string => `${employeeId}|${weekStart}`;

/** Monday of the week containing a date. */
export function weekStartOf(d: ISODate): ISODate {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 Sunday
  return addDays(d, -((dow + 6) % 7));
}
export const weekDates = (weekStart: ISODate): ISODate[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
export const weekLabel = (weekStart: ISODate): string => `${fmtDate(weekStart).replace(/ \d{4}$/, '')} to ${fmtDate(addDays(weekStart, 6))}`;

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export const emptyLine = (projectId: Id): SheetLine => ({ projectId, hours: [0, 0, 0, 0, 0, 0, 0] });

export const lineTotal = (l: SheetLine): number => round2(l.hours.reduce((t, h) => t + (Number.isFinite(h) ? h : 0), 0));
export const sheetTotal = (s: Pick<Sheet, 'lines'>): number => round2(s.lines.reduce((t, l) => t + lineTotal(l), 0));
export const dayTotals = (s: Pick<Sheet, 'lines'>): number[] => Array.from({ length: 7 }, (_, d) => round2(s.lines.reduce((t, l) => t + (Number.isFinite(l.hours[d]) ? l.hours[d]! : 0), 0)));

export function billableHours(s: Pick<Sheet, 'lines'>, projects: Project[]): number {
  const billable = new Set(projects.filter((p) => p.billable).map((p) => p.id));
  return round2(s.lines.filter((l) => billable.has(l.projectId)).reduce((t, l) => t + lineTotal(l), 0));
}

/** A week can be edited while it is a draft or has been returned. Submitted and approved weeks are locked. */
export const isEditable = (status: SheetStatus | undefined): boolean => status === undefined || status === 'draft' || status === 'returned';

export interface SheetIssue { level: 'error' | 'warn'; day?: number; message: string }

export function validateSheet(sheet: Pick<Sheet, 'lines' | 'weekStart'>, policy: TimesheetPolicy, today: ISODate): SheetIssue[] {
  const issues: SheetIssue[] = [];
  const dates = weekDates(sheet.weekStart);
  const days = dayTotals(sheet);
  sheet.lines.forEach((l) => l.hours.forEach((h, d) => {
    if (!Number.isFinite(h) || h < 0) issues.push({ level: 'error', day: d, message: `${DAY_LABELS[d]}: hours must be a number from 0.` });
    else if (h > 0 && Math.abs(h * 4 - Math.round(h * 4)) > 1e-9) issues.push({ level: 'error', day: d, message: `${DAY_LABELS[d]}: use steps of 0.25 hour.` });
    else if (h > 0 && dates[d]! > today) issues.push({ level: 'error', day: d, message: `${DAY_LABELS[d]}: ${fmtDate(dates[d])} has not happened yet.` });
  }));
  days.forEach((t, d) => { if (t > policy.maxPerDay) issues.push({ level: 'error', day: d, message: `${DAY_LABELS[d]}: ${t} hours is above the ${policy.maxPerDay} hour daily limit.` }); });
  const total = sheetTotal(sheet);
  if (total > policy.weeklyCap) issues.push({ level: 'warn', message: `${total} hours is over the weekly cap of ${policy.weeklyCap}. The approver will see this flag.` });
  return issues;
}

export function submitCheck(sheet: Pick<Sheet, 'lines' | 'weekStart' | 'status'>, policy: TimesheetPolicy, today: ISODate): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!isEditable(sheet.status)) reasons.push(sheet.status === 'approved' ? 'This week is approved and locked.' : 'This week is already with the approver.');
  if (sheetTotal(sheet) <= 0) reasons.push('Enter some hours before submitting.');
  for (const i of validateSheet(sheet, policy, today)) if (i.level === 'error') reasons.push(i.message);
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export const overCap = (sheet: Pick<Sheet, 'lines'>, policy: TimesheetPolicy): boolean => sheetTotal(sheet) > policy.weeklyCap;

/** Billable share of the standard week. A person's own figure; shown to them and their manager only. */
export function utilisationPct(billable: number, weeks: number, people: number, policy: TimesheetPolicy): number {
  const capacity = policy.standardWeek * weeks * people;
  return capacity ? Math.round((billable / capacity) * 100) : 0;
}

export type Include = 'all' | 'approved';
export function inPeriod(sheets: Sheet[], weeks: ISODate[], include: Include): Sheet[] {
  return sheets.filter((s) => weeks.includes(s.weekStart) && (include === 'all' || s.status === 'approved'));
}

export interface TeamUtil { team: Team; people: number; billable: number; total: number; pct: number }
export function teamUtilisation(sheets: Sheet[], employees: Employee[], trackedIds: Id[], teams: Team[], projects: Project[], policy: TimesheetPolicy, weeks: ISODate[], include: Include): TeamUtil[] {
  const used = inPeriod(sheets, weeks, include);
  return teams
    .map((team) => {
      const members = employees.filter((e) => trackedIds.includes(e.id) && team.departmentIds.includes(e.departmentId));
      const ids = new Set(members.map((m) => m.id));
      const mine = used.filter((s) => ids.has(s.employeeId));
      const billable = round2(mine.reduce((t, s) => t + billableHours(s, projects), 0));
      const total = round2(mine.reduce((t, s) => t + sheetTotal(s), 0));
      return { team, people: members.length, billable, total, pct: utilisationPct(billable, weeks.length, members.length, policy) };
    })
    .filter((r) => r.people > 0);
}

export interface BillableWeek { weekStart: ISODate; billable: number; nonBillable: number }
export function billableSplit(sheets: Sheet[], projects: Project[], weeks: ISODate[], include: Include): BillableWeek[] {
  return weeks.map((weekStart) => {
    let billable = 0; let total = 0;
    for (const s of inPeriod(sheets, [weekStart], include)) { billable += billableHours(s, projects); total += sheetTotal(s); }
    return { weekStart, billable: round2(billable), nonBillable: round2(total - billable) };
  });
}

export interface ProjectRow {
  project: Project;
  byPerson: Record<Id, number>;
  period: number;
  /** Everything logged to date: the sample's earlier hours plus all weeks in the data. */
  toDate: number;
  budgetPct: number;
  value: number;
}
export function projectRows(sheets: Sheet[], projects: Project[], weeks: ISODate[], include: Include): ProjectRow[] {
  const inRange = inPeriod(sheets, weeks, include);
  const everything = sheets.filter((s) => include === 'all' || s.status === 'approved');
  return projects.map((project) => {
    const byPerson: Record<Id, number> = {};
    let period = 0;
    for (const s of inRange) for (const l of s.lines) if (l.projectId === project.id) { const t = lineTotal(l); byPerson[s.employeeId] = round2((byPerson[s.employeeId] ?? 0) + t); period += t; }
    let more = 0;
    for (const s of everything) for (const l of s.lines) if (l.projectId === project.id) more += lineTotal(l);
    const toDate = round2(project.priorHours + more);
    return { project, byPerson, period: round2(period), toDate, budgetPct: project.budgetHours ? Math.round((toDate / project.budgetHours) * 100) : 0, value: project.billable ? Math.round(period * project.sampleRate) : 0 };
  });
}

export const EXPORT_HEADER = ['Week starting', 'Employee code', 'Employee', 'Project', 'Client', 'Billable', ...DAY_LABELS, 'Total hours', 'Approved by', 'Approved on'];
/** One row per project line of every approved week. Drafts, submitted and returned weeks are never exported. */
export function approvedExportRows(sheets: Sheet[], employees: Employee[], projects: Project[]): (string | number)[][] {
  const emp = new Map(employees.map((e) => [e.id, e]));
  const prj = new Map(projects.map((p) => [p.id, p]));
  return sheets
    .filter((s) => s.status === 'approved')
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true }))
    .flatMap((s) => s.lines.filter((l) => lineTotal(l) > 0).map((l) => {
      const e = emp.get(s.employeeId); const p = prj.get(l.projectId);
      return [s.weekStart, e?.code ?? s.employeeId, e ? `${e.firstName} ${e.lastName}` : s.employeeId, p?.name ?? l.projectId, p?.client ?? '', p?.billable ? 'Yes' : 'No', ...l.hours, lineTotal(l), s.decidedBy ?? '', s.decidedOn ?? ''];
    }));
}

export const daysSince = (a: ISODate, b: ISODate): number => diffDays(a, b);
