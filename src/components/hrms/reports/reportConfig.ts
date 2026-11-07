// Config-driven reports. Each report is one entry in REPORTS: its filters, columns, how to build rows from the sample
// data (or the payroll engine), an optional chart and a hub headline. The page and the hub only read this map, so a new
// report is one more entry. Statutory statements reuse the builders the Statutory page downloads from, so the numbers match.

import type { Employee, HrmsDb, Month, PayRun, Payslip } from '../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { addMonths, fmtDate, fmtMonth, fullName, inr, inrShort, num } from '../../../lib/hrms/format';
import { buildBankFile } from '../../../lib/hrms/engine';
import { monthEnd, monthStart } from '../../../lib/hrms/rules';
import { maskAccount, maskPan } from '../../../lib/hrms/validators';
import {
  PREVIEW_MONTH, deptName, entityName, employeeOf, esiRows, latestRunMonth, lineAmount, locationName, pfRows, ptRows, runsFor, sumBy, tdsRows,
} from '../statutory/builders';
import { buildBreakup } from '../../../lib/hrms/engine';

export type ColType = 'text' | 'money' | 'number' | 'decimal' | 'percent' | 'date';
export type Raw = string | number | null;
export interface ReportRow { id: string; employeeId?: string; [k: string]: Raw | undefined }
export type ReportGroup = 'Headcount and people' | 'Payroll' | 'Statutory' | 'Attendance and leave';
export const REPORT_GROUPS: ReportGroup[] = ['Headcount and people', 'Payroll', 'Statutory', 'Attendance and leave'];
export type FilterKey = 'month' | 'entity' | 'department' | 'location';
export interface Filters { month: string; entity: string; department: string; location: string }
export const ALL = 'all';

export interface RCol {
  key: string; label: string; type?: ColType;
  total?: 'sum' | ((rows: ReportRow[]) => Raw);
  sortKey?: string;
  /** Shown on screen instead of the raw value (masking). The CSV keeps the raw value. */
  display?: (v: Raw, row: ReportRow) => string;
  href?: (row: ReportRow) => string | null;
}
export interface ChartSpec { title: string; x: string; series: { key: string; label: string }[]; type: ColType; horizontal?: boolean }

export interface ReportDef {
  name: string; title: string; group: ReportGroup; description: string;
  filters: FilterKey[];
  monthKind?: 'run' | 'prev' | 'current';
  monthAll?: boolean;
  monthHelp?: string;
  columns: (db: HrmsDb) => RCol[];
  rows: (db: HrmsDb, f: Filters) => ReportRow[];
  empty?: (db: HrmsDb, f: Filters) => string;
  notes?: (db: HrmsDb, f: Filters, rows: ReportRow[]) => string[];
  chart?: ChartSpec;
  peek: (rows: ReportRow[]) => string;
  /** Exporting writes an access-log row for each employee, because the file holds a sensitive field in full. */
  exportLog?: string;
}

// ───────────────────────────────── helpers ─────────────────────────────────
const inHeadcount = (e: Employee) => e.status === 'active' || e.status === 'on_notice';
const matchEmp = (e: Employee | undefined, f: Filters): e is Employee =>
  !!e && (f.entity === ALL || e.entityId === f.entity) && (f.department === ALL || e.departmentId === f.department) && (f.location === ALL || e.locationId === f.location);
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const r1 = (n: number) => Math.round(n * 10) / 10;
const cmpCode = (a: ReportRow, b: ReportRow) => String(a.code ?? '').localeCompare(String(b.code ?? ''));

export function defaultMonth(db: HrmsDb, def: ReportDef): Month {
  return def.monthKind === 'run' ? latestRunMonth(db) : def.monthKind === 'current' ? PREVIEW_MONTH : addMonths(PREVIEW_MONTH, -1);
}
export const defaultFilters = (db: HrmsDb, def: ReportDef): Filters => ({ month: defaultMonth(db, def), entity: ALL, department: ALL, location: ALL });

const personCols = (): RCol[] => [
  { key: 'code', label: 'Code' },
  { key: 'name', label: 'Name', href: (r) => (r.employeeId ? `/dashboard/hrms/employees/${r.employeeId}` : null) },
  { key: 'department', label: 'Department' },
];
const person = (db: HrmsDb, e: Employee) => ({ employeeId: e.id, code: e.code, name: fullName(e), department: deptName(db, e.departmentId) });

/** Payslips of the runs of a month that belong to employees matching the filters. */
function slipsFor(db: HrmsDb, f: Filters, statuses?: PayRun['status'][]): { run: PayRun; slip: Payslip; emp: Employee }[] {
  const out: { run: PayRun; slip: Payslip; emp: Employee }[] = [];
  for (const run of runsFor(db, f.month, f.entity, statuses)) for (const slip of run.payslips) {
    const emp = employeeOf(db, slip.employeeId);
    if (matchEmp(emp, f)) out.push({ run, slip, emp });
  }
  return out;
}
const runNotes = (db: HrmsDb, f: Filters, statuses?: PayRun['status'][]): string[] => {
  const runs = runsFor(db, f.month, f.entity, statuses);
  const notes = runs.map((r) => `${entityName(db, r.entityId)}, ${fmtMonth(r.month)}: ${r.status} run, ${r.payslips.length} payslips.`);
  if (runs.some((r) => r.status === 'computed')) notes.push('A computed run is not frozen, so these figures can still change.');
  return notes;
};
const noRun = (db: HrmsDb, f: Filters) => `There is no pay run with payslips for ${fmtMonth(f.month)}. Compute one in Payroll, then come back.`;

// ───────────────────────────────── headcount ─────────────────────────────────
const headcountBy = (db: HrmsDb, f: Filters, keyOf: (e: Employee) => string, label: (id: string) => string, extra?: (e: Employee) => Record<string, Raw>) => {
  const emps = db.employees.filter((e) => inHeadcount(e) && matchEmp(e, f));
  const ids = [...new Set(emps.map(keyOf))];
  const total = emps.length;
  return ids.map((id): ReportRow => {
    const here = emps.filter((e) => keyOf(e) === id);
    return {
      id, label: label(id), headcount: here.length, notice: here.filter((e) => e.status === 'on_notice').length,
      women: here.filter((e) => e.gender === 'female').length, men: here.filter((e) => e.gender !== 'female').length,
      share: total ? (here.length / total) * 100 : 0,
      ...(extra ? extra(here[0]!) : {}),
    };
  }).sort((a, b) => Number(b.headcount) - Number(a.headcount) || String(a.label).localeCompare(String(b.label)));
};
const headcountTotals = { share: (rows: ReportRow[]) => (rows.length ? 100 : null) };

// ───────────────────────────────── attrition ─────────────────────────────────
const asOnFor = (m: Month) => { const end = monthEnd(m); return end > PREVIEW_TODAY ? PREVIEW_TODAY : end; };
const headOn = (db: HrmsDb, f: Filters, asOn: string) =>
  db.employees.filter((e) => matchEmp(e, f) && e.status !== 'onboarding' && e.joinDate <= asOn && (!e.lastWorkingDate || e.lastWorkingDate > asOn)).length;

function attritionRows(db: HrmsDb, f: Filters): ReportRow[] {
  const rows: ReportRow[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = addMonths(f.month, -i);
    const asOn = asOnFor(m);
    const opening = headOn(db, f, monthEnd(addMonths(m, -1)));
    const closing = headOn(db, f, asOn);
    const joiners = db.employees.filter((e) => matchEmp(e, f) && e.status !== 'onboarding' && e.joinDate >= monthStart(m) && e.joinDate <= asOn).length;
    const leavers = db.employees.filter((e) => matchEmp(e, f) && e.lastWorkingDate && e.lastWorkingDate >= monthStart(m) && e.lastWorkingDate <= asOn).length;
    const avg = (opening + closing) / 2;
    rows.push({ id: m, month: m, label: `${SHORT[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`, opening, joiners, leavers, closing, attrition: avg ? r1((leavers / avg) * 100) : 0 });
  }
  return rows;
}

// ───────────────────────────────── the reports ─────────────────────────────────
const money = (key: string, label: string, extra: Partial<RCol> = {}): RCol => ({ key, label, type: 'money', total: 'sum', ...extra });
const count = (key: string, label: string, extra: Partial<RCol> = {}): RCol => ({ key, label, type: 'number', total: 'sum', ...extra });

const BANDS = [0, 300000, 500000, 800000, 1200000, 2000000, Infinity];
const bandLabel = (i: number) => (i === 0 ? `Below ${inrShort(BANDS[1]!)}` : i === BANDS.length - 2 ? `${inrShort(BANDS[i]!)} and above` : `${inrShort(BANDS[i]!)} to ${inrShort(BANDS[i + 1]!)}`);

export const REPORTS: ReportDef[] = [
  // ── Headcount and people ──
  {
    name: 'headcount-department', title: 'Headcount by department', group: 'Headcount and people', filters: ['entity', 'location'],
    description: 'Active employees and those serving notice in each department, with the gender split.',
    columns: () => [
      { key: 'label', label: 'Department' }, count('headcount', 'Headcount'), count('notice', 'On notice'), count('women', 'Women'), count('men', 'Men and others'),
      { key: 'share', label: 'Share', type: 'percent', total: headcountTotals.share },
    ],
    rows: (db, f) => headcountBy(db, f, (e) => e.departmentId, (id) => deptName(db, id)),
    chart: { title: 'Headcount by department', x: 'label', series: [{ key: 'headcount', label: 'Headcount' }], type: 'number', horizontal: true },
    peek: (rows) => `${sumBy(rows, (r) => Number(r.headcount))} in headcount`,
  },
  {
    name: 'headcount-location', title: 'Headcount by location', group: 'Headcount and people', filters: ['entity', 'department'],
    description: 'Active employees and those serving notice at each office or site.',
    columns: () => [
      { key: 'label', label: 'Location' }, { key: 'entityName', label: 'Legal entity' }, { key: 'state', label: 'State' },
      count('headcount', 'Headcount'), count('notice', 'On notice'), count('women', 'Women'), count('men', 'Men and others'),
      { key: 'share', label: 'Share', type: 'percent', total: headcountTotals.share },
    ],
    rows: (db, f) => headcountBy(db, f, (e) => e.locationId, (id) => locationName(db, id), (e) => ({
      entityName: entityName(db, e.entityId), state: db.locations.find((l) => l.id === e.locationId)?.state ?? '—',
    })),
    chart: { title: 'Headcount by location', x: 'label', series: [{ key: 'headcount', label: 'Headcount' }], type: 'number', horizontal: true },
    peek: (rows) => `${rows.length} locations`,
  },
  {
    name: 'joiners-leavers', title: 'Joiners and leavers', group: 'Headcount and people', filters: ['month', 'entity', 'department', 'location'], monthKind: 'current', monthAll: true,
    description: 'Who joined and who left in a month, or in the last 12 months. Joining and leaving dates in the future are marked as scheduled.',
    columns: () => [
      { key: 'on', label: 'Date', type: 'date' }, { key: 'event', label: 'Event' }, ...personCols().slice(0, 2),
      { key: 'department', label: 'Department' }, { key: 'location', label: 'Location' }, { key: 'detail', label: 'Detail' },
    ],
    rows: (db, f) => {
      const from = f.month === ALL ? monthStart(addMonths(PREVIEW_MONTH, -11)) : monthStart(f.month);
      const to = f.month === ALL ? monthEnd(PREVIEW_MONTH) : monthEnd(f.month);
      const out: ReportRow[] = [];
      for (const e of db.employees) {
        if (!matchEmp(e, f)) continue;
        if (e.joinDate >= from && e.joinDate <= to) out.push({ id: `j:${e.id}`, ...person(db, e), on: e.joinDate, event: 'Joiner', location: locationName(db, e.locationId), detail: e.joinDate > PREVIEW_TODAY ? 'Scheduled' : 'Joined' });
        if (e.lastWorkingDate && e.lastWorkingDate >= from && e.lastWorkingDate <= to) {
          const ex = db.exits.find((x) => x.employeeId === e.id);
          out.push({ id: `l:${e.id}`, ...person(db, e), on: e.lastWorkingDate, event: 'Leaver', location: locationName(db, e.locationId), detail: `${e.lastWorkingDate > PREVIEW_TODAY ? 'Scheduled' : 'Left'}${ex ? `, ${ex.reason.replace(/_/g, ' ')}` : ''}` });
        }
      }
      return out.sort((a, b) => String(a.on).localeCompare(String(b.on)) || cmpCode(a, b));
    },
    empty: () => 'Nobody joined or left in this period.',
    peek: (rows) => `${rows.filter((r) => r.event === 'Joiner').length} joiners, ${rows.filter((r) => r.event === 'Leaver').length} leavers`,
  },
  {
    name: 'attrition', title: 'Attrition, trailing 12 months', group: 'Headcount and people', filters: ['month', 'entity', 'department', 'location'], monthKind: 'prev',
    monthHelp: 'The 12 months ending in',
    description: 'Joiners, leavers and closing headcount for each of the 12 months, with attrition as leavers over average headcount.',
    columns: () => [
      { key: 'month', label: 'Month', sortKey: 'sortMonth' },
      { key: 'opening', label: 'Opening headcount', type: 'number', total: (rows) => (rows[0]?.opening as number) ?? null },
      count('joiners', 'Joiners'), count('leavers', 'Leavers'),
      { key: 'closing', label: 'Closing headcount', type: 'number', total: (rows) => (rows[rows.length - 1]?.closing as number) ?? null },
      {
        key: 'attrition', label: 'Attrition', type: 'percent', total: (rows) => {
          const avg = rows.length ? rows.reduce((t, r) => t + (Number(r.opening) + Number(r.closing)) / 2, 0) / rows.length : 0;
          return avg ? r1((sumBy(rows, (r) => Number(r.leavers)) / avg) * 100) : 0;
        },
      },
    ],
    rows: (db, f) => attritionRows(db, f).map((r) => ({ ...r, month: fmtMonth(String(r.month)), sortMonth: String(r.id) })),
    chart: { title: 'Joiners and leavers by month', x: 'label', series: [{ key: 'joiners', label: 'Joiners' }, { key: 'leavers', label: 'Leavers' }], type: 'number' },
    notes: () => ['Attrition for a month is leavers divided by the average of opening and closing headcount. The total row uses the 12-month average headcount.', 'Someone serving notice counts as headcount until their last working day.'],
    peek: (rows) => `${rows.length ? rows[rows.length - 1]!.closing : 0} people at the end`,
  },
  {
    name: 'birthdays-anniversaries', title: 'Birthdays and work anniversaries', group: 'Headcount and people', filters: ['month', 'entity', 'department', 'location'], monthKind: 'current',
    description: 'Birthdays and joining anniversaries falling in a month. Only the day and month of a birthday are shown, never the year.',
    columns: () => [
      { key: 'on', label: 'On', sortKey: 'sort' }, { key: 'event', label: 'Event' }, ...personCols().slice(0, 2),
      { key: 'department', label: 'Department' }, { key: 'detail', label: 'Detail' },
    ],
    rows: (db, f) => {
      const mo = Number(f.month.slice(5, 7));
      const year = Number(f.month.slice(0, 4));
      const out: ReportRow[] = [];
      for (const e of db.employees) {
        if (!inHeadcount(e) || !matchEmp(e, f)) continue;
        const dobM = Number(e.dob.slice(5, 7)); const dobD = Number(e.dob.slice(8, 10));
        if (dobM === mo) out.push({ id: `b:${e.id}`, ...person(db, e), on: `${dobD} ${SHORT[mo - 1]}`, sort: dobD, event: 'Birthday', detail: 'Day and month only' });
        const jM = Number(e.joinDate.slice(5, 7)); const jD = Number(e.joinDate.slice(8, 10));
        const years = year - Number(e.joinDate.slice(0, 4));
        if (jM === mo && years >= 1) out.push({ id: `a:${e.id}`, ...person(db, e), on: `${jD} ${SHORT[mo - 1]}`, sort: jD, event: 'Work anniversary', detail: `${years} ${years === 1 ? 'year' : 'years'}` });
      }
      return out.sort((a, b) => Number(a.sort) - Number(b.sort) || cmpCode(a, b));
    },
    empty: () => 'No birthdays or anniversaries in this month.',
    peek: (rows) => `${rows.filter((r) => r.event === 'Birthday').length} birthdays, ${rows.filter((r) => r.event !== 'Birthday').length} anniversaries`,
  },

  // ── Payroll ──
  {
    name: 'salary-register', title: 'Salary register', group: 'Payroll', filters: ['month', 'entity', 'department', 'location'], monthKind: 'run',
    description: 'Gross pay, deductions, net pay and employer cost for each employee in a pay run.',
    columns: (db) => [
      ...personCols(), count('paidDays', 'Paid days'), money('gross', 'Gross'), money('pf', 'PF'), money('esi', 'ESI'), money('pt', 'Professional tax'), money('tds', 'TDS'),
      money('otherDed', 'LWF and other'), money('deductions', 'Total deductions'), money('net', 'Net pay'), money('employerCost', 'Employer cost'),
    ],
    rows: (db, f) => slipsFor(db, f).map(({ slip: s, emp }): ReportRow => {
      const pf = lineAmount(s.deductions, 'PF'); const esi = lineAmount(s.deductions, 'ESI'); const pt = lineAmount(s.deductions, 'PT'); const tds = lineAmount(s.deductions, 'TDS');
      return { id: s.id, ...person(db, emp), paidDays: s.paidDays, gross: s.gross, pf, esi, pt, tds, otherDed: s.totalDeductions - pf - esi - pt - tds, deductions: s.totalDeductions, net: s.net, employerCost: s.employerCost };
    }).sort(cmpCode),
    empty: noRun, notes: (db, f) => runNotes(db, f),
    peek: (rows) => `Net ${inr(sumBy(rows, (r) => Number(r.net)))}`,
  },
  {
    name: 'payroll-cost-department', title: 'Payroll cost by department', group: 'Payroll', filters: ['month', 'entity', 'location'], monthKind: 'run',
    description: 'What each department costs in a pay run: gross pay, employer contributions and the total employer cost.',
    columns: () => [
      { key: 'label', label: 'Department' }, count('headcount', 'Employees'), money('gross', 'Gross pay'), money('contrib', 'Employer contributions'), money('cost', 'Employer cost'),
      { key: 'avg', label: 'Cost per employee', type: 'money', total: (rows) => { const h = sumBy(rows, (r) => Number(r.headcount)); return h ? Math.round(sumBy(rows, (r) => Number(r.cost)) / h) : null; } },
      { key: 'share', label: 'Share of cost', type: 'percent', total: (rows) => (rows.length ? 100 : null) },
    ],
    rows: (db, f) => {
      const all = slipsFor(db, f);
      const total = sumBy(all, (x) => x.slip.employerCost);
      const ids = [...new Set(all.map((x) => x.emp.departmentId))];
      return ids.map((id): ReportRow => {
        const here = all.filter((x) => x.emp.departmentId === id);
        const cost = sumBy(here, (x) => x.slip.employerCost);
        return { id, label: deptName(db, id), headcount: here.length, gross: sumBy(here, (x) => x.slip.gross), contrib: sumBy(here, (x) => sumBy(x.slip.employer, (l) => l.amount)), cost, avg: Math.round(cost / here.length), share: total ? (cost / total) * 100 : 0 };
      }).sort((a, b) => Number(b.cost) - Number(a.cost));
    },
    chart: { title: 'Employer cost by department', x: 'label', series: [{ key: 'cost', label: 'Employer cost' }], type: 'money', horizontal: true },
    empty: noRun, notes: (db, f) => runNotes(db, f),
    peek: (rows) => `${inr(sumBy(rows, (r) => Number(r.cost)))} employer cost`,
  },
  {
    name: 'ctc-bands', title: 'CTC distribution', group: 'Payroll', filters: ['entity', 'department', 'location'],
    description: 'How many employees fall in each band of annual cost to company, with the total and average for the band.',
    columns: () => [
      { key: 'label', label: 'CTC band', sortKey: 'order' }, count('employees', 'Employees'), { key: 'share', label: 'Share', type: 'percent', total: (rows) => (rows.length ? 100 : null) },
      money('total', 'Total annual CTC'), { key: 'avg', label: 'Average CTC', type: 'money', total: (rows) => { const n = sumBy(rows, (r) => Number(r.employees)); return n ? Math.round(sumBy(rows, (r) => Number(r.total)) / n) : null; } },
    ],
    rows: (db, f) => {
      const emps = db.employees.filter((e) => inHeadcount(e) && matchEmp(e, f) && (e.annualCtc ?? 0) > 0);
      return BANDS.slice(0, -1).map((lo, i): ReportRow => {
        const hi = BANDS[i + 1]!;
        const here = emps.filter((e) => e.annualCtc! >= lo && e.annualCtc! < hi);
        const total = sumBy(here, (e) => e.annualCtc!);
        return { id: `band${i}`, order: i, label: bandLabel(i), employees: here.length, share: emps.length ? (here.length / emps.length) * 100 : 0, total, avg: here.length ? Math.round(total / here.length) : null };
      });
    },
    chart: { title: 'Employees by CTC band', x: 'label', series: [{ key: 'employees', label: 'Employees' }], type: 'number' },
    notes: () => ['Employees without a CTC on file (for example new joiners still onboarding) are left out.'],
    peek: (rows) => `${sumBy(rows, (r) => Number(r.employees))} employees in ${rows.filter((r) => Number(r.employees) > 0).length} bands`,
  },
  {
    name: 'bank-advice', title: 'Bank advice', group: 'Payroll', filters: ['month', 'entity', 'department', 'location'], monthKind: 'run', exportLog: 'Bank account (bank advice export)',
    description: 'The salary transfer list for a frozen or paid run: who gets what, to which account.',
    columns: (db) => [
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Name', href: (r) => (r.employeeId ? `/dashboard/hrms/employees/${r.employeeId}` : null) },
      { key: 'account', label: 'Account number', display: (v) => (v ? maskAccount(String(v)) : '—') }, { key: 'ifsc', label: 'IFSC' }, { key: 'bank', label: 'Bank' },
      money('amount', 'Amount'), { key: 'narration', label: 'Narration' },
    ],
    rows: (db, f) => {
      const out: ReportRow[] = [];
      for (const run of runsFor(db, f.month, f.entity, ['frozen', 'paid'])) {
        const file = buildBankFile(db, run);
        for (const r of file.rows) {
          const e = db.employees.find((x) => x.code === r[0]);
          if (!matchEmp(e, f)) continue;
          out.push({ id: `${run.id}:${r[0]}`, employeeId: e.id, code: r[0]!, name: r[1]!, account: r[2]!, ifsc: r[3]!, bank: r[4]!, amount: Number(r[5]), narration: r[6]! });
        }
      }
      return out.sort(cmpCode);
    },
    empty: (db, f) => (runsFor(db, f.month, f.entity, ['computed']).length ? `The ${fmtMonth(f.month)} run is computed but not frozen. Freeze it before a bank advice is produced.` : noRun(db, f)),
    notes: (db, f) => {
      const skipped = runsFor(db, f.month, f.entity, ['frozen', 'paid']).flatMap((run) => buildBankFile(db, run).skipped.map((s) => `${employeeOf(db, s.employeeId) ? fullName(employeeOf(db, s.employeeId)!) : s.employeeId} is left out: ${s.reason}.`));
      return [...skipped, 'Account numbers are masked on screen. The CSV holds them in full, so exporting writes an access-log entry for each employee.'];
    },
    peek: (rows) => `${rows.length} transfers, ${inr(sumBy(rows, (r) => Number(r.amount)))}`,
  },

  // ── Statutory ──
  {
    name: 'pf-statement', title: 'PF statement', group: 'Statutory', filters: ['month', 'entity', 'department', 'location'], monthKind: 'run',
    description: 'Provident fund wages and contributions for each member, with the ECR status of the row.',
    columns: (db) => [
      { key: 'code', label: 'Code' }, { key: 'uan', label: 'UAN' }, { key: 'name', label: 'Name', href: (r) => (r.employeeId ? `/dashboard/hrms/employees/${r.employeeId}` : null) },
      money('pfWage', 'PF wage'), money('employee', 'Employee PF'), money('epf', 'Employer EPF'), money('eps', 'Employer EPS'), money('edli', 'EDLI'), money('admin', 'Admin charges'), { key: 'ecr', label: 'ECR' },
    ],
    rows: (db, f) => runsFor(db, f.month, f.entity).flatMap((run) => pfRows(db, run).filter((r) => { const e = db.employees.find((x) => x.code === r.code); return matchEmp(e, f); })
      .map((r): ReportRow => ({ id: r.id, employeeId: db.employees.find((x) => x.code === r.code)?.id, code: r.code, uan: r.uan || '—', name: r.name, pfWage: r.pfWage, employee: r.employee, epf: r.epf, eps: r.eps, edli: r.edli, admin: r.admin, ecr: r.ecr }))).sort(cmpCode),
    empty: noRun, notes: (db, f, rows) => [...runNotes(db, f), ...(rows.some((r) => r.ecr !== 'In ECR') ? [`${rows.filter((r) => r.ecr !== 'In ECR').length} rows are blocked from the ECR until the UAN is fixed.`] : [])],
    peek: (rows) => `Employee ${inr(sumBy(rows, (r) => Number(r.employee)))}`,
  },
  {
    name: 'esi-statement', title: 'ESI statement', group: 'Statutory', filters: ['month', 'entity', 'department', 'location'], monthKind: 'run',
    description: 'ESI wages and contributions for employees whose gross is within the ESI ceiling.',
    columns: (db) => [
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Name', href: (r) => (r.employeeId ? `/dashboard/hrms/employees/${r.employeeId}` : null) }, { key: 'esic', label: 'ESIC number' },
      count('days', 'Paid days'), money('gross', 'Gross'), money('esiWage', 'ESI wage'), money('employee', 'Employee share'), money('employer', 'Employer share'), money('total', 'Total'),
    ],
    rows: (db, f) => runsFor(db, f.month, f.entity).flatMap((run) => esiRows(db, run).filter((r) => matchEmp(db.employees.find((x) => x.code === r.code), f))
      .map((r): ReportRow => ({ id: r.id, employeeId: db.employees.find((x) => x.code === r.code)?.id, code: r.code, name: r.name, esic: r.esic || '—', days: r.days, gross: r.gross, esiWage: r.esiWage, employee: r.employee, employer: r.employer, total: r.total }))).sort(cmpCode),
    empty: (db, f) => (runsFor(db, f.month, f.entity).length ? 'No employee is within the ESI ceiling in this run.' : noRun(db, f)), notes: (db, f) => runNotes(db, f),
    peek: (rows) => `${rows.length} covered, ${inr(sumBy(rows, (r) => Number(r.total)))}`,
  },
  {
    name: 'pt-statement', title: 'Professional tax statement', group: 'Statutory', filters: ['month', 'entity', 'department', 'location'], monthKind: 'run',
    description: 'Professional tax deducted from each employee, by state.',
    columns: (db) => [
      { key: 'state', label: 'State' }, { key: 'code', label: 'Code' }, { key: 'name', label: 'Name', href: (r) => (r.employeeId ? `/dashboard/hrms/employees/${r.employeeId}` : null) },
      { key: 'gender', label: 'Gender' }, money('gross', 'Gross'), money('pt', 'Professional tax'),
    ],
    rows: (db, f) => runsFor(db, f.month, f.entity).flatMap((run) => ptRows(db, run).filter((r) => matchEmp(db.employees.find((x) => x.code === r.code), f))
      .map((r): ReportRow => ({ id: r.id, employeeId: db.employees.find((x) => x.code === r.code)?.id, state: r.state, code: r.code, name: r.name, gender: r.gender, gross: r.gross, pt: r.pt }))),
    empty: (db, f) => (runsFor(db, f.month, f.entity).length ? 'No professional tax was deducted in this run.' : noRun(db, f)), notes: (db, f) => runNotes(db, f),
    peek: (rows) => `${inr(sumBy(rows, (r) => Number(r.pt)))} in ${new Set(rows.map((r) => r.state)).size} states`,
  },
  {
    name: 'tds-statement', title: 'TDS statement', group: 'Statutory', filters: ['month', 'entity', 'department', 'location'], monthKind: 'run', exportLog: 'PAN (TDS statement export)',
    description: 'Gross pay, taxable earnings and tax deducted for each employee: the working for the quarterly TDS return (Form 138).',
    columns: (db) => [
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Name', href: (r) => (r.employeeId ? `/dashboard/hrms/employees/${r.employeeId}` : null) },
      { key: 'pan', label: 'PAN', display: (v) => (v ? maskPan(String(v)) : 'Missing') }, { key: 'regime', label: 'Regime' }, money('gross', 'Gross'), money('taxable', 'Taxable earnings'), money('tds', 'TDS'),
    ],
    rows: (db, f) => runsFor(db, f.month, f.entity).flatMap((run) => tdsRows(db, run).filter((r) => matchEmp(db.employees.find((x) => x.code === r.code), f))
      .map((r): ReportRow => ({ id: r.id, employeeId: db.employees.find((x) => x.code === r.code)?.id, code: r.code, name: r.name, pan: r.pan, regime: r.regime === 'new' ? 'New' : 'Old', gross: r.gross, taxable: r.taxable, tds: r.tds }))).sort(cmpCode),
    empty: noRun,
    notes: (db, f, rows) => [...runNotes(db, f), ...(rows.some((r) => !r.pan) ? [`${rows.filter((r) => !r.pan).length} employees have no PAN, so tax goes at the higher rate.`] : []), 'PAN is masked on screen. The CSV holds it in full, so exporting writes an access-log entry for each employee.'],
    peek: (rows) => `${inr(sumBy(rows, (r) => Number(r.tds)))} TDS`,
  },

  // ── Attendance and leave ──
  {
    name: 'attendance-muster', title: 'Attendance muster', group: 'Attendance and leave', filters: ['month', 'entity', 'department', 'location'], monthKind: 'prev',
    description: 'Present days, leave, weekly offs, holidays and loss of pay for every employee in a month.',
    columns: (db) => [
      ...personCols(), count('days', 'Days in month'), count('present', 'Present'), count('leave', 'Paid leave'), count('wo', 'Weekly off'), count('holidays', 'Holidays'), count('lop', 'Loss of pay'),
      count('paid', 'Paid days'), { key: 'locked', label: 'Locked' },
    ],
    rows: (db, f) => db.attendance.filter((a) => a.month === f.month).flatMap((a): ReportRow[] => {
      const e = employeeOf(db, a.employeeId);
      if (!matchEmp(e, f)) return [];
      return [{ id: `${a.employeeId}:${a.month}`, ...person(db, e), days: a.daysInMonth, present: a.presentDays, leave: a.paidLeaveDays, wo: a.weeklyOffs, holidays: a.holidays, lop: a.lopDays, paid: a.daysInMonth - a.lopDays, locked: a.locked ? 'Yes' : 'No' }];
    }).sort(cmpCode),
    empty: (db, f) => `There is no attendance summary for ${fmtMonth(f.month)}.`,
    notes: (db, f, rows) => (rows.some((r) => r.locked === 'No') ? [`${fmtMonth(f.month)} is still open: ${rows.filter((r) => r.locked === 'No').length} summaries are not locked, so days can still change.`] : []),
    peek: (rows) => `${rows.length} employees, ${sumBy(rows, (r) => Number(r.lop))} LOP days`,
  },
  {
    name: 'lop-report', title: 'Loss of pay', group: 'Attendance and leave', filters: ['month', 'entity', 'department', 'location'], monthKind: 'prev',
    description: 'Employees with unpaid days in a month and the estimated pay cut for those days.',
    columns: (db) => [...personCols(), count('lop', 'Loss of pay days'), money('monthly', 'Gross for a full month'), money('cut', 'Estimated pay cut'), { key: 'locked', label: 'Month locked' }],
    rows: (db, f) => db.attendance.filter((a) => a.month === f.month && a.lopDays > 0).flatMap((a): ReportRow[] => {
      const e = employeeOf(db, a.employeeId);
      if (!matchEmp(e, f)) return [];
      const structure = db.structures.find((s) => s.id === e.structureId);
      const gross = structure && e.annualCtc ? buildBreakup(structure, e.annualCtc, { asOn: monthEnd(a.month), pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides }).monthlyGross : 0;
      return [{ id: `${a.employeeId}:${a.month}`, ...person(db, e), lop: a.lopDays, monthly: gross, cut: Math.round((gross / a.daysInMonth) * a.lopDays), locked: a.locked ? 'Yes' : 'No' }];
    }).sort((a, b) => Number(b.lop) - Number(a.lop) || cmpCode(a, b)),
    empty: (db, f) => `Nobody has loss of pay in ${fmtMonth(f.month)}.`,
    notes: () => ['The estimate is gross for a full month divided by the days in the month, times the loss of pay days. The payslip may differ because only some components reduce with loss of pay.'],
    peek: (rows) => `${rows.length} employees, ${sumBy(rows, (r) => Number(r.lop))} days`,
  },
  {
    name: 'leave-balance', title: 'Leave balance', group: 'Attendance and leave', filters: ['entity', 'department', 'location'],
    description: 'Leave left for each employee by type, as on the preview date: opening plus accrued, less taken, encashed and lapsed.',
    columns: (db) => [...personCols(), ...db.leaveTypes.filter((t) => db.leaveBalances.some((b) => b.leaveTypeId === t.id)).map((t): RCol => ({ key: `lt_${t.id}`, label: t.name, type: 'decimal', total: 'sum' }))],
    rows: (db, f) => db.employees.filter((e) => inHeadcount(e) && matchEmp(e, f)).map((e): ReportRow => {
      const row: ReportRow = { id: e.id, ...person(db, e) };
      for (const t of db.leaveTypes) {
        const b = db.leaveBalances.find((x) => x.employeeId === e.id && x.leaveTypeId === t.id);
        if (b) row[`lt_${t.id}`] = b.opening + b.accrued - b.taken - b.encashed - b.lapsed;
      }
      return row;
    }).sort(cmpCode),
    empty: () => 'No leave balances for these filters.',
    notes: () => [`Balances are as on ${fmtDate(PREVIEW_TODAY)}.`],
    peek: (rows) => `${rows.length} employees`,
  },
  {
    name: 'overtime', title: 'Overtime', group: 'Attendance and leave', filters: ['month', 'entity', 'department', 'location'], monthKind: 'prev',
    description: 'Overtime hours in a month, the pay for them once the run is frozen, and the hours used against the quarterly cap.',
    columns: (db) => [
      ...personCols(), { key: 'shift', label: 'Shift' }, { key: 'hours', label: 'Overtime hours', type: 'decimal', total: 'sum' }, money('pay', 'Overtime pay'),
      { key: 'qtd', label: 'Hours this quarter', type: 'decimal' }, { key: 'cap', label: 'Quarterly cap', type: 'number' }, { key: 'used', label: 'Cap used', type: 'percent' },
    ],
    rows: (db, f) => {
      const rule = db.overtimeRules[0];
      return db.attendance.filter((a) => a.month === f.month && a.overtimeHours > 0).flatMap((a): ReportRow[] => {
        const e = employeeOf(db, a.employeeId);
        if (!matchEmp(e, f)) return [];
        const q = (m: string) => `${m.slice(0, 4)}-${Math.ceil(Number(m.slice(5, 7)) / 3)}`;
        const qtd = sumBy(db.attendance.filter((x) => x.employeeId === e.id && q(x.month) === q(a.month) && x.month <= a.month), (x) => x.overtimeHours);
        const slip = runsFor(db, a.month, e.entityId, ['frozen', 'paid']).flatMap((r) => r.payslips).find((s) => s.employeeId === e.id);
        const cap = rule?.quarterlyCapHours ?? 0;
        return [{ id: `${e.id}:${a.month}`, ...person(db, e), shift: db.shifts.find((s) => s.id === e.shiftId)?.name ?? '—', hours: a.overtimeHours, pay: slip ? slip.earnings.find((l) => l.code === 'OT')?.amount ?? 0 : null, qtd, cap, used: cap ? r1((qtd / cap) * 100) : null }];
      }).sort((a, b) => Number(b.hours) - Number(a.hours) || cmpCode(a, b));
    },
    empty: (db, f) => `No overtime was logged in ${fmtMonth(f.month)}.`,
    chart: { title: 'Overtime hours', x: 'name', series: [{ key: 'hours', label: 'Overtime hours' }], type: 'decimal', horizontal: true },
    notes: () => ['Overtime pay is shown once the month’s run is frozen. The cap is the quarterly limit in the overtime rule, counted over the calendar quarter.'],
    peek: (rows) => `${sumBy(rows, (r) => Number(r.hours))} hours`,
  },
  {
    name: 'document-completeness', title: 'Document completeness', group: 'Attendance and leave', filters: ['entity', 'department', 'location'],
    description: 'How many of each employee’s mandatory documents are uploaded or verified, and which are still missing.',
    columns: (db) => [
      ...personCols(), { key: 'status', label: 'Status' }, count('required', 'Mandatory'), count('present', 'Uploaded or verified'), count('missingCount', 'Missing'),
      { key: 'pct', label: 'Complete', type: 'percent', total: (rows) => { const req = sumBy(rows, (r) => Number(r.required)); return req ? r1((sumBy(rows, (r) => Number(r.present)) / req) * 100) : null; } },
      { key: 'missing', label: 'Missing documents' },
    ],
    rows: (db, f) => db.employees.filter((e) => e.status !== 'exited' && matchEmp(e, f)).map((e): ReportRow => {
      const req = e.documents.filter((d) => d.mandatory);
      const miss = req.filter((d) => d.status !== 'verified' && d.status !== 'uploaded');
      return { id: e.id, ...person(db, e), status: e.status.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()), required: req.length, present: req.length - miss.length, missingCount: miss.length, pct: req.length ? r1(((req.length - miss.length) / req.length) * 100) : 100, missing: miss.map((d) => d.name).join('; ') };
    }).sort((a, b) => Number(a.pct) - Number(b.pct) || cmpCode(a, b)),
    empty: () => 'No employees for these filters.',
    peek: (rows) => `${rows.filter((r) => Number(r.missingCount) > 0).length} with gaps`,
  },
];

export const reportDef = (name: string): ReportDef | undefined => REPORTS.find((r) => r.name === name);

// ───────────────────────────── formatting and totals ─────────────────────────────
export function formatCell(col: RCol, row: ReportRow): string {
  const v = row[col.key] as Raw | undefined;
  if (col.display) return col.display(v ?? null, row);
  if (v === null || v === undefined || v === '') return '—';
  switch (col.type) {
    case 'money': return inr(Number(v));
    case 'number': return num(Number(v));
    case 'decimal': return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 });
    case 'percent': return `${Number(v).toFixed(1)}%`;
    case 'date': return fmtDate(String(v));
    default: return String(v);
  }
}
export const isNumericCol = (c: RCol) => c.type === 'money' || c.type === 'number' || c.type === 'decimal' || c.type === 'percent';

export function computeTotals(cols: RCol[], rows: ReportRow[]): Record<string, Raw> | null {
  if (!rows.length || !cols.some((c) => c.total)) return null;
  const out: Record<string, Raw> = {};
  for (const c of cols) {
    if (!c.total) continue;
    out[c.key] = c.total === 'sum' ? Math.round(rows.reduce((t, r) => t + (Number(r[c.key]) || 0), 0) * 100) / 100 : c.total(rows);
  }
  return out;
}

/** Raw value for the CSV: numbers stay numbers, dates stay ISO. */
export function csvValue(col: RCol, row: ReportRow): string | number {
  const v = row[col.key] as Raw | undefined;
  return v === null || v === undefined ? '' : v;
}
