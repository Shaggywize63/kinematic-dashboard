// Pay-run checks: pure logic over the pay runs in the core database. No React, no storage.
//
// What it does: takes one run (say November) and the previous month's run of the same entity, and looks for things a
// person who is about to freeze the run would want to see: a net pay that jumped, someone who dropped out, two people
// sharing a bank account, a payslip that does not match the person's status, pay under the minimum wage, odd PF or ESI
// bases, missing bank or UAN details.
//
// What it does not do: it never changes a payslip and never blocks a run. A finding is a question for a person.
// Every finding carries the numbers behind it in plain sentences so the person can disagree with it.

import type { Adjustment, Employee, HrmsDb, Id, Month, PayRun, Payslip, PayslipLine } from '../types';
import { ESI, MIN_WAGES, PF, monthEnd, monthStart, rowOn } from '../rules';
import { addMonths, fmtDate, fmtMonth, fullName, inr } from '../format';
import { checkAccount, checkIfsc, maskAccount } from '../validators';
import type { CheckCoverage, CheckInfo, CheckKind, Finding, FindingFact, FindingSeverity, PayCheckResult, ReviewState } from './types';

export const PAYCHECK_RULES = {
  /** A net pay move of more than this share against the previous run gets a finding. */
  swingPct: 25,
  /** At or above this move the finding is "high" when nothing recorded explains it. */
  highSwingPct: 50,
  /** Recorded causes (adjustments, loans, loss of pay, overtime, salary change) must cover this much of the move to count as explaining it. */
  explainedShare: 0.6,
  /** Below this share the causes are said to explain almost none of the move. */
  partlyShare: 0.2,
  /** One-time pay worth at least this many months of usual gross is called large, and the amount is worth a second look. */
  largeOneTimeTimesGross: 1,
  /** Rupees of rounding allowed when a deduction is compared with its formula. */
  roundingRupees: 1,
};

const R = PAYCHECK_RULES;

export const CHECK_INFO: CheckInfo[] = [
  { kind: 'net_swing', label: 'Net pay swing', looksAt: `Net pay that moved by more than ${R.swingPct}% against the previous run, and whether a one-time payment, loan or advance, loss of pay, overtime or a salary change explains it.` },
  { kind: 'headcount', label: 'Who is in the run', looksAt: 'People paid last month who are missing now, and people who are new this month, unless the data shows they left or joined.' },
  { kind: 'duplicate_bank', label: 'Shared bank account', looksAt: 'The same bank account number on two employees in the run.' },
  { kind: 'status_pay', label: 'Pay and employment status', looksAt: 'Someone paid before joining or after leaving, a part-month joiner paid for the whole month, a leaver whose last day falls in the run, and F&F that may pay the same days twice.' },
  { kind: 'invalid_pay', label: 'Impossible payslips', looksAt: 'Zero or negative net pay, and loss-of-pay days that do not fit the days in the month.' },
  { kind: 'min_wage', label: 'Minimum wage', looksAt: 'Fixed monthly pay below the sample minimum wage for the state (lowest category). The table is a sample, so this is advisory.' },
  { kind: 'pf_base', label: 'PF base', looksAt: 'PF wage above the ceiling for someone not on the higher-wage option, PF that is not 12% of its base, PF base above the wages, and PF deducted or missing against membership.' },
  { kind: 'esi_base', label: 'ESI base', looksAt: 'ESI deducted when gross is above the ESI ceiling, or not deducted when gross is within it.' },
  { kind: 'missing_bank', label: 'Bank details', looksAt: 'Employees paid by bank transfer with no bank account, or with an account number or IFSC that does not look valid.' },
  { kind: 'missing_uan', label: 'UAN for PF', looksAt: 'Employees with PF deducted who have no UAN, or whose UAN is not yet linked to Aadhaar (the ECR row would be blocked).' },
];
const INFO_BY_KIND = new Map(CHECK_INFO.map((c) => [c.kind, c]));
const KIND_ORDER = new Map(CHECK_INFO.map((c, i) => [c.kind, i]));
export const checkLabel = (k: CheckKind): string => INFO_BY_KIND.get(k)?.label ?? k;

// ───────────────────────────── which runs ─────────────────────────────
/** Regular runs of one entity, newest month first. */
export function regularRuns(db: HrmsDb, entityId: Id): PayRun[] {
  return db.payRuns.filter((r) => r.entityId === entityId && r.type === 'regular').sort((a, b) => b.month.localeCompare(a.month));
}
/** The latest earlier regular run of the same entity that has payslips. */
export function previousRegularRun(db: HrmsDb, run: PayRun): PayRun | undefined {
  return db.payRuns
    .filter((r) => r.id !== run.id && r.entityId === run.entityId && r.type === 'regular' && r.month < run.month && r.payslips.length > 0)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
}
/**
 * The month "Prepare a draft" works on: the month after the latest frozen or paid regular run of the entity, or
 * `fallback` when there is none. If a draft for that month already exists it is recomputed, not duplicated.
 */
export function draftTarget(db: HrmsDb, entityId: Id, fallback: Month): { month: Month; existing?: PayRun; after?: PayRun } {
  const closed = regularRuns(db, entityId).find((r) => r.status === 'frozen' || r.status === 'paid');
  const month = closed ? addMonths(closed.month, 1) : fallback;
  return { month, existing: db.payRuns.find((r) => r.entityId === entityId && r.type === 'regular' && r.month === month), after: closed };
}

// ───────────────────────────── payslip arithmetic ─────────────────────────────
const ONE_TIME = ['ARREAR', 'BONUS', 'INCENTIVE'];
const sumCodes = (lines: PayslipLine[], codes: string[]): number => lines.filter((l) => codes.includes(l.code)).reduce((s, l) => s + l.amount, 0);
const oneTimePay = (s: Payslip): number => sumCodes(s.earnings, ONE_TIME) + sumCodes(s.reimbursements, ['REIMB']);
const oneTimeNames = (s: Payslip): string[] => [...s.earnings.filter((l) => ONE_TIME.includes(l.code)), ...s.reimbursements.filter((l) => l.code === 'REIMB')].map((l) => `${l.name} ${inr(l.amount)}`);
const overtimePay = (s: Payslip): number => sumCodes(s.earnings, ['OT']);
const recurringEarned = (s: Payslip): number => s.earnings.filter((l) => !ONE_TIME.includes(l.code) && l.code !== 'OT').reduce((t, l) => t + l.amount, 0);
const paidShare = (s: Payslip): number => (s.daysInMonth ? s.paidDays / s.daysInMonth : 1);
/** Fixed monthly pay at full attendance, backed out of what was earned. */
const fixedMonthly = (s: Payslip): number => (paidShare(s) > 0 ? recurringEarned(s) / paidShare(s) : recurringEarned(s));
const manualDeductions = (s: Payslip): number => sumCodes(s.deductions, ['LOAN', 'DED']);
const pctText = (n: number): string => `${Math.abs(n) >= 100 ? Math.round(Math.abs(n)) : Math.abs(n).toFixed(1).replace(/\.0$/, '')}%`;

// ───────────────────────────── the net pay swing ─────────────────────────────
export interface SwingCause { key: 'one_time' | 'one_time_gone' | 'lop' | 'salary' | 'overtime' | 'loan'; label: string; effect: number }
export interface SwingAnalysis {
  delta: number; pct: number | null; causes: SwingCause[];
  /** Share of the move covered by causes that point the same way as the move, 0 to 1. */
  share: number;
  verdict: 'explained' | 'partly' | 'unexplained';
  oneTimeNow: number; usualGross: number; large: boolean;
}

/** Why did net pay move between two payslips of the same person? Pure, so tests can feed it anything. */
export function analyseSwing(prev: Payslip, cur: Payslip): SwingAnalysis {
  const delta = cur.net - prev.net;
  const pct = prev.net > 0 ? (delta / prev.net) * 100 : null;
  const causes: SwingCause[] = [];

  const oneNow = oneTimePay(cur), onePrev = oneTimePay(prev);
  if (oneNow !== onePrev) {
    const names = oneNow > 0 ? oneTimeNames(cur) : [];
    const prevNames = onePrev > 0 ? oneTimeNames(prev) : [];
    if (oneNow > onePrev) causes.push({ key: 'one_time', label: `One-time pay this month: ${names.join(', ')}`, effect: oneNow - onePrev });
    else causes.push({ key: 'one_time_gone', label: `One-time pay in ${fmtMonth(prev.month)} (${prevNames.join(', ')}) does not repeat${oneNow ? `; this month's one-time pay is ${inr(oneNow)}` : ''}`, effect: oneNow - onePrev });
  }

  const fp = fixedMonthly(prev), fc = fixedMonthly(cur);
  const salaryEffect = (fc - fp) * paidShare(cur);
  const lopEffect = fp * (paidShare(cur) - paidShare(prev));
  if (Math.abs(fc - fp) > Math.max(2, fp * 0.005)) causes.push({ key: 'salary', label: `Fixed pay changed from ${inr(fp)} to ${inr(fc)} a month (salary, structure or CTC)`, effect: salaryEffect });
  if (cur.lopDays !== prev.lopDays) causes.push({ key: 'lop', label: `Loss of pay went from ${prev.lopDays} to ${cur.lopDays} days`, effect: lopEffect });

  const ot = overtimePay(cur) - overtimePay(prev);
  if (ot !== 0) causes.push({ key: 'overtime', label: `Overtime pay went from ${inr(overtimePay(prev))} (${prev.overtimeHours}h) to ${inr(overtimePay(cur))} (${cur.overtimeHours}h)`, effect: ot });

  const loan = manualDeductions(cur) - manualDeductions(prev);
  if (loan !== 0) causes.push({ key: 'loan', label: `Loan, advance or other deductions went from ${inr(manualDeductions(prev))} to ${inr(manualDeductions(cur))}`, effect: -loan });

  const dir = Math.sign(delta);
  const covered = causes.reduce((s, c) => s + Math.max(0, c.effect * dir), 0);
  const share = delta === 0 ? 1 : Math.min(1, covered / Math.abs(delta));
  const verdict: SwingAnalysis['verdict'] = share >= R.explainedShare ? 'explained' : share >= R.partlyShare ? 'partly' : 'unexplained';
  const usualGross = fc;
  return { delta, pct, causes, share, verdict, oneTimeNow: oneNow, usualGross, large: oneNow > 0 && usualGross > 0 && oneNow >= R.largeOneTimeTimesGross * usualGross };
}

// ───────────────────────────── the checks ─────────────────────────────
const sevRank: Record<FindingSeverity, number> = { high: 0, warning: 1, info: 2 };
const worst = (a: FindingSeverity, b: FindingSeverity): FindingSeverity => (sevRank[a] <= sevRank[b] ? a : b);

export function runPayChecks(db: HrmsDb, run: PayRun): PayCheckResult {
  const prev = previousRegularRun(db, run);
  const empById = new Map<Id, Employee>(db.employees.map((e) => [e.id, e]));
  const nameOf = (id: Id): string => { const e = empById.get(id); return e ? fullName(e) : id; };
  const slips = run.payslips;
  const prevSlips = prev?.payslips ?? [];
  const month = run.month;
  // A draft that was never computed has no payslips to check. Say so instead of reporting everyone as missing.
  if (slips.length === 0) {
    return { runId: run.id, entityId: run.entityId, month, computed: false, prevRunId: prev?.id, prevMonth: prev?.month, payslips: 0, prevPayslips: prevSlips.length, findings: [], coverage: [] };
  }
  const start = monthStart(month), end = monthEnd(month);
  const findings: Finding[] = [];
  const notes = new Map<CheckKind, string>();
  const examined = new Map<CheckKind, { n: number; unit: string }>();
  const add = (f: Omit<Finding, 'month'>) => findings.push({ ...f, month });
  const see = (kind: CheckKind, n: number, unit: string) => examined.set(kind, { n, unit });

  // 1. Net pay swing against the previous run.
  if (prev) {
    const prevById = new Map(prevSlips.map((s) => [s.employeeId, s]));
    let compared = 0, explainedQuietly = 0;
    for (const cur of slips) {
      const p = prevById.get(cur.employeeId);
      if (!p) continue;
      compared++;
      const a = analyseSwing(p, cur);
      const big = a.pct == null ? cur.net !== p.net : Math.abs(a.pct) > R.swingPct;
      if (!big) continue;
      const name = nameOf(cur.employeeId);
      const dirWord = a.delta >= 0 ? 'up' : 'down';
      const pctWord = a.pct == null ? 'from nothing' : pctText(a.pct);
      let severity: FindingSeverity;
      if (a.verdict === 'unexplained') severity = a.pct != null && Math.abs(a.pct) >= R.highSwingPct ? 'high' : 'warning';
      else if (a.verdict === 'partly') severity = 'warning';
      else severity = a.large ? 'warning' : 'info';
      const lines = [
        `Net pay was ${inr(p.net)} in ${fmtMonth(p.month)} and is ${inr(cur.net)} in ${fmtMonth(cur.month)}: ${dirWord} ${inr(Math.abs(a.delta))}${a.pct == null ? '' : ` (${pctWord})`}. This check looks at moves of more than ${R.swingPct}%.`,
        ...a.causes.map((c) => `${c.label}: about ${inr(Math.abs(c.effect))} ${c.effect >= 0 ? 'more' : 'less'} in net pay.`),
      ];
      if (a.verdict === 'explained') lines.push(`What is recorded covers about ${Math.round(a.share * 100)}% of the move, so it is explained. The amounts are rough, since tax and PF change the exact figure. Make sure those entries are right.`);
      else if (a.verdict === 'partly') lines.push(`What is recorded covers only about ${Math.round(a.share * 100)}% of the move. Something else changed too.`);
      else lines.push('Nothing recorded explains it: no one-time payment, no change in loan or advance, loss of pay, overtime or salary. Open the payslips and compare the lines.');
      if (a.large) lines.push(`The one-time pay of ${inr(a.oneTimeNow)} is ${(a.oneTimeNow / a.usualGross).toFixed(1).replace(/\.0$/, '')} times the usual monthly pay of ${inr(a.usualGross)}. Check the amount was typed correctly.`);
      if (a.verdict === 'explained' && !a.large) explainedQuietly++;
      add({
        id: `net_swing:${cur.employeeId}`, kind: 'net_swing', severity, employeeIds: [cur.employeeId],
        title: `${name}: net pay ${dirWord} ${a.pct == null ? 'from nothing' : pctWord} on ${fmtMonth(p.month)}`,
        lines,
        facts: [
          { label: `Net, ${fmtMonth(p.month)}`, value: inr(p.net) }, { label: `Net, ${fmtMonth(cur.month)}`, value: inr(cur.net) },
          { label: 'Change', value: `${a.delta >= 0 ? '+' : '-'}${inr(Math.abs(a.delta))}` }, { label: 'Share explained', value: `${Math.round(a.share * 100)}%` },
        ],
        signature: `swing|${p.net}|${cur.net}|${a.verdict}|${a.causes.map((c) => `${c.key}:${Math.round(c.effect)}`).join(',')}`,
      });
    }
    see('net_swing', compared, `payslips compared with ${fmtMonth(prev.month)}`);
    notes.set('net_swing', explainedQuietly ? `${explainedQuietly} of the findings are explained by recorded items and listed for information.` : '');
  } else {
    see('net_swing', 0, 'payslips');
    notes.set('net_swing', 'Skipped: there is no earlier run of this entity to compare with.');
  }

  // 2. Who is in the run.
  if (prev) {
    const curIds = new Set(slips.map((s) => s.employeeId));
    const prevIds = new Set(prevSlips.map((s) => s.employeeId));
    let explained = 0;
    for (const p of prevSlips) {
      if (curIds.has(p.employeeId)) continue;
      const e = empById.get(p.employeeId);
      const name = nameOf(p.employeeId);
      if (e && ((e.lastWorkingDate && e.lastWorkingDate < start) || e.status === 'exited')) { explained++; continue; }
      if (e && e.entityId !== run.entityId) { explained++; continue; }
      const why = !e ? 'The employee no longer exists in the system.'
        : (!e.structureId || !e.annualCtc) ? 'They have no salary structure or CTC on file, and a payslip cannot be made without both.'
          : `They are ${e.status === 'on_notice' ? 'on notice' : e.status}, have a structure and a CTC, and no last working day before ${fmtDate(start)}, yet no payslip was made.`;
      add({
        id: `headcount:${p.employeeId}`, kind: 'headcount', severity: 'warning', employeeIds: [p.employeeId],
        title: `${name} was paid in ${fmtMonth(prev.month)} but is not in this run`,
        lines: [`${name} got ${inr(p.net)} net in ${fmtMonth(prev.month)}. There is no payslip for ${fmtMonth(month)}.`, why, 'Nothing in the data says they left or moved to another entity.'],
        facts: [{ label: `Net, ${fmtMonth(prev.month)}`, value: inr(p.net) }, { label: 'Status', value: e ? e.status.replace('_', ' ') : 'not found' }],
        signature: `gone|${p.net}|${e?.status ?? 'none'}|${e?.structureId ?? ''}|${e?.annualCtc ?? 0}`,
      });
    }
    for (const s of slips) {
      if (prevIds.has(s.employeeId)) continue;
      const e = empById.get(s.employeeId);
      const name = nameOf(s.employeeId);
      if (e && e.joinDate > monthEnd(prev.month)) { explained++; continue; }
      add({
        id: `headcount:${s.employeeId}`, kind: 'headcount', severity: 'warning', employeeIds: [s.employeeId],
        title: `${name} is new in this run but joined before ${fmtMonth(prev.month)} ended`,
        lines: [`${name} is paid ${inr(s.net)} net in ${fmtMonth(month)} and has no payslip in ${fmtMonth(prev.month)}.`, `Their joining date is ${e ? fmtDate(e.joinDate) : 'not on file'}, which is not a reason for missing last month's run.`, 'Check whether they were left out last month, or moved here from another entity.'],
        facts: [{ label: `Net, ${fmtMonth(month)}`, value: inr(s.net) }, { label: 'Joined', value: e ? fmtDate(e.joinDate) : '—' }],
        signature: `new|${s.net}|${e?.joinDate ?? ''}`,
      });
    }
    see('headcount', new Set([...curIds, ...prevIds]).size, 'people');
    notes.set('headcount', explained ? `${explained} ${explained === 1 ? 'person is' : 'people are'} missing or new for a reason in the data (left, moved entity or joined), so no finding.` : '');
  } else {
    see('headcount', 0, 'people');
    notes.set('headcount', 'Skipped: there is no earlier run of this entity to compare with.');
  }

  // 3. The same bank account on two employees.
  {
    const byAcct = new Map<string, Employee[]>();
    let accounts = 0;
    for (const s of slips) {
      const e = empById.get(s.employeeId);
      const n = e?.bank?.accountNumber?.replace(/\s+/g, '');
      if (!e || !n) continue;
      accounts++;
      byAcct.set(n, [...(byAcct.get(n) ?? []), e]);
    }
    for (const [num, list] of byAcct) {
      if (list.length < 2) continue;
      const sameIfsc = new Set(list.map((e) => (e.bank?.ifsc ?? '').toUpperCase())).size === 1;
      const ids = list.map((e) => e.id).sort();
      const nets = list.map((e) => slips.find((s) => s.employeeId === e.id)?.net ?? 0);
      add({
        id: `duplicate_bank:${ids.join('+')}`, kind: 'duplicate_bank', severity: sameIfsc ? 'high' : 'warning', employeeIds: list.map((e) => e.id),
        title: `${list.map(fullName).join(' and ')} share one bank account`,
        lines: [
          `Account ${maskAccount(num)} is on file for ${list.map((e) => `${fullName(e)} (${e.code})`).join(' and ')}.`,
          `This run pays ${list.map((e, i) => `${fullName(e)} ${inr(nets[i])}`).join(' and ')} into it.`,
          sameIfsc ? 'The branch code (IFSC) is the same too, so it is the same account.' : 'The IFSC differs, so this may be a coincidence of numbers at two banks. Check the cancelled cheques.',
          'A joint account, a spouse or a parent can be a good reason. A person should confirm before the file goes to the bank.',
        ],
        facts: [{ label: 'Account', value: maskAccount(num) }, { label: 'People', value: String(list.length) }],
        signature: `bank|${ids.join('+')}|${num.slice(-4)}|${sameIfsc}`,
      });
    }
    see('duplicate_bank', accounts, 'bank accounts');
  }

  // 4. Pay against employment status.
  for (const s of slips) {
    const e = empById.get(s.employeeId);
    if (!e) continue;
    const name = fullName(e);
    const lines: string[] = [];
    let sev: FindingSeverity = 'info';
    const bump = (v: FindingSeverity) => { sev = worst(sev, v); };
    if (e.status === 'onboarding' || e.joinDate > end) {
      lines.push(`${name} joins on ${fmtDate(e.joinDate)}${e.status === 'onboarding' ? ' and is still onboarding' : ''}, yet is paid ${inr(s.net)} for ${fmtMonth(month)}.`);
      bump('high');
    }
    if (e.lastWorkingDate && e.lastWorkingDate < start) {
      lines.push(`${name} left on ${fmtDate(e.lastWorkingDate)}, before this month, yet is paid ${inr(s.net)}.`);
      bump('high');
    } else if (e.status === 'exited' && !e.lastWorkingDate) {
      lines.push(`${name} is marked as exited but has no last working day, so it is not clear whether ${fmtMonth(month)} should be paid.`);
      bump('warning');
    }
    if (e.joinDate >= start && e.joinDate <= end && s.paidDays >= s.daysInMonth && e.status !== 'onboarding') {
      lines.push(`${name} joined on ${fmtDate(e.joinDate)} but is paid for ${s.paidDays} of ${s.daysInMonth} days. Days before joining are not cut unless they are entered as loss of pay.`);
      bump('warning');
    }
    if (e.lastWorkingDate && e.lastWorkingDate >= start && e.lastWorkingDate <= end) {
      const fnfs = db.fnfCases.filter((c) => c.employeeId === e.id && c.lastWorkingDate.slice(0, 7) === month);
      const stub = e.lastWorkingDate < end && s.paidDays >= s.daysInMonth;
      if (fnfs.length) {
        const c = fnfs[0]!;
        lines.push(`${name}'s last working day is ${fmtDate(e.lastWorkingDate)}. This run pays ${s.paidDays} of ${s.daysInMonth} days, and the F&F settlement (${c.status}) also pays salary up to the last working day. The same days may be paid twice.`);
        bump('warning');
      } else {
        lines.push(`${name}'s last working day is ${fmtDate(e.lastWorkingDate)}, inside this run. No F&F settlement exists yet. Create one, and decide whether this run pays the month in full or only up to the last day.`);
        bump(stub ? 'warning' : 'info');
      }
      if (stub) lines.push(`The payslip pays all ${s.daysInMonth} days, but the last working day is ${fmtDate(e.lastWorkingDate)}.`);
    } else if (e.status === 'on_notice' && !e.lastWorkingDate) {
      lines.push(`${name} is on notice but no last working day is recorded, so F&F and the final payslip cannot be planned.`);
      bump('info');
    }
    if (!lines.length) continue;
    const facts: FindingFact[] = [{ label: 'Status', value: e.status.replace('_', ' ') }, { label: 'Joined', value: fmtDate(e.joinDate) }, { label: 'Last day', value: fmtDate(e.lastWorkingDate) }, { label: 'Paid days', value: `${s.paidDays} of ${s.daysInMonth}` }];
    add({ id: `status_pay:${e.id}`, kind: 'status_pay', severity: sev, employeeIds: [e.id], title: `${name}: pay does not line up with status`, lines, facts, signature: `status|${e.status}|${e.joinDate}|${e.lastWorkingDate ?? ''}|${s.paidDays}|${s.net}` });
  }
  see('status_pay', slips.length, 'payslips');

  // 5. Impossible payslips.
  for (const s of slips) {
    const name = nameOf(s.employeeId);
    const lines: string[] = [];
    let sev: FindingSeverity = 'warning';
    if (s.net <= 0) { lines.push(`Net pay is ${inr(s.net)}. Deductions of ${inr(s.totalDeductions)} are as large as or larger than pay.`); sev = 'high'; }
    if (s.lopDays > s.daysInMonth) { lines.push(`${s.lopDays} loss-of-pay days against ${s.daysInMonth} days in ${fmtMonth(month)}.`); sev = 'high'; }
    if (s.lopDays < 0 || s.paidDays < 0) { lines.push(`Loss of pay ${s.lopDays} days and paid days ${s.paidDays}: a count below zero cannot be right.`); sev = 'high'; }
    else if (s.paidDays + s.lopDays !== s.daysInMonth && s.lopDays <= s.daysInMonth) lines.push(`Paid days (${s.paidDays}) plus loss-of-pay days (${s.lopDays}) do not make the ${s.daysInMonth} days of ${fmtMonth(month)}.`);
    if (!lines.length) continue;
    add({
      id: `invalid_pay:${s.employeeId}`, kind: 'invalid_pay', severity: sev, employeeIds: [s.employeeId], title: `${name}: payslip does not hold together`, lines,
      facts: [{ label: 'Net', value: inr(s.net) }, { label: 'Paid days', value: String(s.paidDays) }, { label: 'LOP days', value: String(s.lopDays) }, { label: 'Days in month', value: String(s.daysInMonth) }],
      signature: `invalid|${s.net}|${s.paidDays}|${s.lopDays}|${s.daysInMonth}`,
    });
  }
  see('invalid_pay', slips.length, 'payslips');

  // 6. Minimum wage (advisory: the table in rules.ts is a sample).
  {
    let looked = 0, noTable = 0;
    for (const s of slips) {
      const e = empById.get(s.employeeId);
      if (!e || e.employmentType === 'intern') continue;
      const state = db.locations.find((l) => l.id === e.locationId)?.state ?? '';
      const row = MIN_WAGES.find((m) => m.state === state && m.skill === 'unskilled');
      if (!row) { noTable++; continue; }
      looked++;
      const fixed = Math.round(fixedMonthly(s));
      if (fixed >= row.monthly) continue;
      add({
        id: `min_wage:${e.id}`, kind: 'min_wage', severity: 'warning', employeeIds: [e.id], confidence: row.confidence,
        title: `${fullName(e)}: fixed pay ${inr(fixed)} is below the sample minimum wage`,
        lines: [
          `${fullName(e)}'s fixed pay is ${inr(fixed)} a month at full attendance (one-time pay and overtime left out).`,
          `The sample minimum wage for ${state} (${row.zone}, ${row.skill.replace('_', '-')}, the lowest category, as of ${fmtDate(row.asOn)}) is ${inr(row.monthly)}.`,
          'The minimum wage table in this preview is a sample and changes by state, zone and skill. Confirm the notified figure with your advisor before acting on this.',
        ],
        facts: [{ label: 'Fixed pay', value: inr(fixed) }, { label: 'Sample minimum', value: inr(row.monthly) }, { label: 'State', value: state }],
        signature: `minwage|${fixed}|${row.monthly}`,
      });
    }
    see('min_wage', looked, 'payslips');
    if (noTable) notes.set('min_wage', `${noTable} ${noTable === 1 ? 'payslip was' : 'payslips were'} not checked: the sample table has no figure for their state.`);
  }

  // 7. PF base.
  {
    const ceilingRow = rowOn(PF.ceiling, end);
    const ceiling = ceilingRow.value;
    let looked = 0;
    for (const s of slips) {
      const e = empById.get(s.employeeId);
      if (!e) continue;
      const pf = sumCodes(s.deductions, ['PF']);
      const base = s.wages.pfWage;
      if (!e.pfMember && pf === 0 && base === 0) continue;
      looked++;
      const lines: string[] = [];
      let sev: FindingSeverity = 'warning';
      if (!e.pfMember && (pf > 0 || base > 0)) lines.push(`${fullName(e)} is not a PF member, yet PF of ${inr(pf)} is deducted on a base of ${inr(base)}.`);
      if (e.pfMember && base > 0 && pf === 0) lines.push(`${fullName(e)} is a PF member with a PF base of ${inr(base)}, but no PF is deducted.`);
      if (e.pfMember && base > ceiling && !e.pfOnActualWage) { lines.push(`The PF base is ${inr(base)}, above the ${inr(ceiling)} ceiling, and ${fullName(e)} is not on the higher-wage option.`); sev = 'high'; }
      if (e.pfMember && pf > 0 && Math.abs(pf - Math.round((base * PF.employeeRate) / 100)) > R.roundingRupees) lines.push(`PF deducted is ${inr(pf)}, but ${PF.employeeRate}% of the base ${inr(base)} is ${inr(Math.round((base * PF.employeeRate) / 100))}.`);
      if (e.pfMember && base > s.wages.codeWages + R.roundingRupees) lines.push(`The PF base ${inr(base)} is more than the wages of ${inr(s.wages.codeWages)} it is meant to come from.`);
      if (!lines.length) continue;
      add({
        id: `pf_base:${e.id}`, kind: 'pf_base', severity: sev, employeeIds: [e.id], confidence: ceilingRow.confidence,
        title: `${fullName(e)}: PF base needs a look`,
        lines: [...lines, `The PF ceiling of ${inr(ceiling)} is a ${ceilingRow.confidence} figure in this preview. Confirm it with your advisor.`],
        facts: [{ label: 'PF base', value: inr(base) }, { label: 'PF deducted', value: inr(pf) }, { label: 'Ceiling', value: inr(ceiling) }, { label: 'Higher-wage option', value: e.pfOnActualWage ? 'yes' : 'no' }],
        signature: `pf|${base}|${pf}|${e.pfMember}|${e.pfOnActualWage}|${s.wages.codeWages}`,
      });
    }
    see('pf_base', looked, 'payslips with PF');
  }

  // 8. ESI base.
  {
    const ceilingRow = rowOn(ESI.ceiling, end);
    const ceiling = ceilingRow.value;
    let looked = 0;
    for (const s of slips) {
      const e = empById.get(s.employeeId);
      if (!e) continue;
      looked++;
      const esi = sumCodes(s.deductions, ['ESI']);
      const grossForEsi = s.gross - sumCodes(s.earnings, ['OT']);
      const lines: string[] = [];
      if (esi > 0 && grossForEsi > ceiling) lines.push(`ESI of ${inr(esi)} is deducted, but gross pay of ${inr(grossForEsi)} (overtime left out) is above the ${inr(ceiling)} ESI ceiling. ESIC's contribution-period rule can keep someone in who crossed the ceiling part-way, so confirm that is the case.`);
      if (esi === 0 && grossForEsi > 0 && grossForEsi <= ceiling) lines.push(`Gross pay of ${inr(grossForEsi)} is within the ${inr(ceiling)} ESI ceiling, but no ESI is deducted.`);
      if (esi > 0 && !e.esicIp && grossForEsi <= ceiling) lines.push(`ESI is deducted but ${fullName(e)} has no ESIC number on file.`);
      if (!lines.length) continue;
      add({
        id: `esi_base:${e.id}`, kind: 'esi_base', severity: 'warning', employeeIds: [e.id], confidence: ceilingRow.confidence,
        title: `${fullName(e)}: ESI base needs a look`,
        lines: [...lines, `The ESI ceiling of ${inr(ceiling)} is a ${ceilingRow.confidence} figure in this preview. Confirm it with your advisor.`],
        facts: [{ label: 'Gross', value: inr(grossForEsi) }, { label: 'ESI deducted', value: inr(esi) }, { label: 'Ceiling', value: inr(ceiling) }],
        signature: `esi|${grossForEsi}|${esi}|${!!e.esicIp}`,
      });
    }
    see('esi_base', looked, 'payslips');
  }

  // 9. Bank details for people paid by bank.
  {
    let looked = 0;
    for (const s of slips) {
      const e = empById.get(s.employeeId);
      if (!e || e.payMode !== 'bank') continue;
      looked++;
      const lines: string[] = [];
      if (!e.bank) lines.push(`${fullName(e)} is set to be paid by bank transfer but has no bank account on file. The bank file will skip ${inr(s.net)}.`);
      else {
        if (!checkAccount(e.bank.accountNumber).ok) lines.push(`The account number ${maskAccount(e.bank.accountNumber)} does not look valid (9 to 18 digits).`);
        if (!checkIfsc(e.bank.ifsc).ok) lines.push(`The IFSC ${e.bank.ifsc || '(empty)'} does not look valid.`);
      }
      if (!lines.length) continue;
      add({
        id: `missing_bank:${e.id}`, kind: 'missing_bank', severity: 'warning', employeeIds: [e.id], title: `${fullName(e)}: bank details need fixing`,
        lines: [...lines, 'Add the details from a cancelled cheque or pay another way, before the bank file is made.'],
        facts: [{ label: 'Net due', value: inr(s.net) }, { label: 'Pay mode', value: e.payMode }, { label: 'Account', value: e.bank ? maskAccount(e.bank.accountNumber) : 'none' }],
        signature: `bank|${s.net}|${e.bank ? `${e.bank.accountNumber.slice(-4)}${e.bank.ifsc}` : 'none'}`,
      });
    }
    see('missing_bank', looked, 'payslips paid by bank');
  }

  // 10. UAN where PF is deducted.
  {
    let looked = 0;
    for (const s of slips) {
      const e = empById.get(s.employeeId);
      if (!e || sumCodes(s.deductions, ['PF']) === 0) continue;
      looked++;
      if (!e.uan) {
        add({
          id: `missing_uan:${e.id}`, kind: 'missing_uan', severity: 'warning', employeeIds: [e.id], title: `${fullName(e)}: PF is deducted but there is no UAN`,
          lines: [`${inr(sumCodes(s.deductions, ['PF']))} of PF is deducted from ${fullName(e)}, who has no UAN on file.`, 'The ECR row cannot be made without a UAN. Get the existing UAN from the employee, or generate one.'],
          facts: [{ label: 'PF deducted', value: inr(sumCodes(s.deductions, ['PF'])) }, { label: 'UAN', value: 'none' }],
          signature: `uan|none|${sumCodes(s.deductions, ['PF'])}`,
        });
      } else if (e.uanStatus !== 'aadhaar_seeded') {
        add({
          id: `missing_uan:${e.id}`, kind: 'missing_uan', severity: 'info', employeeIds: [e.id], title: `${fullName(e)}: UAN is not linked to Aadhaar yet`,
          lines: [`${fullName(e)} has a UAN, but its status is "${e.uanStatus.replace(/_/g, ' ')}", not linked to Aadhaar.`, 'The ECR row will be blocked until the link is done.'],
          facts: [{ label: 'PF deducted', value: inr(sumCodes(s.deductions, ['PF'])) }, { label: 'UAN status', value: e.uanStatus.replace(/_/g, ' ') }],
          signature: `uan|${e.uanStatus}|${sumCodes(s.deductions, ['PF'])}`,
        });
      }
    }
    see('missing_uan', looked, 'payslips with PF');
  }

  findings.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || (KIND_ORDER.get(a.kind) ?? 0) - (KIND_ORDER.get(b.kind) ?? 0) || a.title.localeCompare(b.title));
  const coverage: CheckCoverage[] = CHECK_INFO.map((c) => ({
    ...c, examined: examined.get(c.kind)?.n ?? 0, unit: examined.get(c.kind)?.unit ?? 'payslips', found: findings.filter((f) => f.kind === c.kind).length, note: notes.get(c.kind) || undefined,
  }));
  return {
    runId: run.id, entityId: run.entityId, month, computed: slips.length > 0, prevRunId: prev?.id, prevMonth: prev?.month,
    payslips: slips.length, prevPayslips: prevSlips.length, findings, coverage,
  };
}

// ───────────────────────────── reviews ─────────────────────────────
export interface StoredReview { by: string; at: string; note: string; signature: string }
/** A review counts only while the numbers behind the finding are the ones the reviewer saw. */
export function reviewState(review: StoredReview | undefined, finding: Pick<Finding, 'signature'>): ReviewState {
  if (!review) return 'open';
  return review.signature === finding.signature ? 'reviewed' : 'changed';
}
export const reviewKey = (entityId: Id, month: Month, findingId: string): string => `${entityId}|${month}|${findingId}`;

export function summarise(findings: Finding[], reviews: Record<string, StoredReview>, entityId: Id, month: Month) {
  const states = findings.map((f) => reviewState(reviews[reviewKey(entityId, month, f.id)], f));
  return {
    total: findings.length,
    needLook: findings.filter((f) => f.severity !== 'info').length,
    info: findings.filter((f) => f.severity === 'info').length,
    reviewed: states.filter((s) => s === 'reviewed').length,
    changed: states.filter((s) => s === 'changed').length,
  };
}

/** Adjustments of the run's month that touch the person, for a short note next to a finding. */
export function adjustmentsFor(db: HrmsDb, employeeId: Id, month: Month): Adjustment[] {
  return db.adjustments.filter((a) => a.employeeId === employeeId && a.month === month);
}
