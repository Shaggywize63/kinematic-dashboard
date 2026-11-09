import { test, expect, type Page } from '@playwright/test';
import { openHrms } from './hrms-utils';
import { makeSeed, PREVIEW_TODAY } from '../src/lib/hrms/seed';
import { inr } from '../src/lib/hrms/format';
import { ask, accessFor, directReports, parse, payslipAsText, releasedSlips, suggestionsFor } from '../src/lib/hrms/assist/engine';
import { addDays } from '../src/lib/hrms/format';
import { parseDates, parseMonth, findPeople, normalise } from '../src/lib/hrms/assist/nlp';
import { MCP_NEVER_EXPOSED, MCP_TOOLS, runTool, validateArgs, toolByName } from '../src/lib/hrms/assist/mcp';
import { VOICE_COVERAGE, VOICE_LANGUAGES } from '../src/lib/hrms/assist/voice';
import { MSG_TEMPLATES, renderTemplate } from '../src/lib/hrms/assist/templates';
import { seedAcks, seedLeaveRequests, seedMcpLog, seedPolicies, seedPosh, seedVacancies } from '../src/lib/hrms/assist/seed';
import {
  ackRows, ackSummary, annualReport, audienceOf, currentVersion, diffStats, icChecks, lineDiff, nextCaseId, nextVersionLabel, personView,
  policyRefs, trainingCoverage, validatePublish, withNewVersion,
} from '../src/lib/hrms/assist/policies';
import {
  BOX, buildTree, canReportTo, ancestorsOf, CSV_HEADER, gridColumns, layoutTree, orgRows, orgStats, searchIds, subtreeIds, validManagers,
} from '../src/lib/hrms/assist/orgChart';
import type { Employee } from '../src/lib/hrms/types';
import type { AssistLeaveRequest, Who } from '../src/lib/hrms/assist/types';

/**
 * HR assistant, Policies & POSH, Org chart. Two kinds of test:
 *  - pure checks of the engine, the policy logic and the org chart logic (no browser), and
 *  - browser flows on the seeded sample data, with persistence checked after a reload.
 */

const AREA = (n: string) => `kinematic_hrms_area_${n}_v1`;
const DB_KEY = 'kinematic_hrms_preview_v3';
const slow = { timeout: 60_000 };
const db = makeSeed();
const POOJA: Who = { employeeId: 'emp_7', role: 'employee' };
const ROHIT: Who = { employeeId: 'emp_4', role: 'manager' };
const TANVI: Who = { employeeId: 'emp_18', role: 'hr' };
const requests = seedLeaveRequests();
const q = (who: Who, text: string, extra: Parameters<typeof ask>[3] = {}) => ask(db, who, text, { leaveRequests: requests, ...extra });
const emp = (id: string) => db.employees.find((e) => e.id === id)!;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}
const readStore = <T,>(page: Page, key: string): Promise<T> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);
const readDb = (page: Page) => readStore<{ employees: Employee[]; accessLog: { employeeId: string; field: string }[] }>(page, DB_KEY);
const noSideScroll = async (page: Page, label: string) => {
  const over = await page.evaluate(() => {
    const main = document.querySelector('main');
    return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, main: main ? main.scrollWidth - main.clientWidth : 0 };
  });
  expect(over.doc, `${label}: page overflows by ${over.doc}px`).toBeLessThanOrEqual(1);
  expect(over.main, `${label}: main overflows by ${over.main}px`).toBeLessThanOrEqual(1);
};

test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });
test.describe.configure({ timeout: 120_000 });

// ═════════════════════════════ pure checks: the intent engine ═════════════════════════════
test.describe('assistant engine: understanding', () => {
  const intent = (who: Who, text: string) => parse(db, who, text).intent;
  const table: Record<string, [Who, string][]> = {
    leave_balance: [[POOJA, 'Mera leave balance kitna hai'], [POOJA, 'kitni chhutti bachi hai'], [POOJA, 'how many leaves do I have left'], [POOJA, 'casual leave kitni baaki hai'], [POOJA, 'leave']],
    apply_leave: [[POOJA, 'kal chhutti chahiye'], [POOJA, 'mujhe 2 din ki chhutti leni hai 10 nov se'], [POOJA, 'I need a day off on friday'], [POOJA, 'apply sick leave for tomorrow'], [POOJA, 'main kal nahi aaunga'], [POOJA, 'I will be out on 12 nov'], [POOJA, 'leave tomorrow']],
    salary_date: [[POOJA, 'salary kab aayegi'], [POOJA, 'when will my salary be credited'], [POOJA, 'tankhwah kab milegi']],
    payslip_summary: [[POOJA, 'meri salary kitni aayi'], [POOJA, 'pichle mahine ki salary'], [POOJA, 'show my payslip'], [POOJA, 'october payslip']],
    payslip_download: [[POOJA, 'salary slip chahiye'], [POOJA, 'download my payslip'], [POOJA, 'payslip pdf bhej do']],
    pf_uan: [[POOJA, 'mera pf kitna kata'], [POOJA, 'what is my UAN']],
    tax_tds: [[POOJA, 'kitna tax kata'], [POOJA, 'which tax regime am I in']],
    holidays: [[POOJA, 'holidays this month'], [POOJA, 'agli chhutti kab hai'], [POOJA, 'diwali ki chhutti hai kya'], [POOJA, 'is christmas a holiday']],
    who_manager: [[POOJA, 'mera manager kaun hai'], [POOJA, 'who do I report to']],
    my_team: [[ROHIT, 'meri team'], [ROHIT, 'show my team members']],
    shift_today: [[POOJA, 'aaj meri shift kya hai'], [POOJA, 'what time do I have to come tomorrow']],
    team_leave: [[ROHIT, 'who is on leave'], [ROHIT, 'team me kaun chhutti pe hai']],
    attendance: [[ROHIT, 'team attendance'], [POOJA, 'my attendance this month']],
    policy: [[POOJA, 'what is the travel policy'], [POOJA, 'hotel limit kitna hai'], [POOJA, 'posh policy'], [POOJA, 'can I work from home'], [POOJA, 'travel claim kaise karte hain']],
    greeting: [[POOJA, 'hi'], [POOJA, 'namaste'], [POOJA, 'hello']],
    help: [[POOJA, 'what can you do']],
    thanks: [[POOJA, 'thanks']],
    unknown: [[POOJA, 'tell me a joke'], [POOJA, 'what is the weather'], [POOJA, 'asdf qwer'], [POOJA, '']],
  };
  for (const [want, cases] of Object.entries(table)) {
    test(`reads English and Hinglish: ${want}`, () => {
      for (const [who, text] of cases) expect(intent(who, text), JSON.stringify(text)).toBe(want);
    });
  }

  test('text helpers: months, dates, names, and the clock is never read', () => {
    expect(normalise("Pooja's  Leave, Balance!")).toBe('pooja leave balance');
    expect(parseMonth('october payslip', PREVIEW_TODAY)).toBe('2026-10');
    expect(parseMonth('pichle mahine ki salary', PREVIEW_TODAY)).toBe('2026-10');
    expect(parseMonth('next month holidays', PREVIEW_TODAY)).toBe('2026-12');
    expect(parseMonth('december', PREVIEW_TODAY, 'future')).toBe('2026-12');
    expect(parseMonth('december', PREVIEW_TODAY, 'past')).toBe('2025-12');
    expect(parseMonth('may i know my balance', PREVIEW_TODAY)).toBeNull();
    const d = parseDates('10 nov to 12 nov', PREVIEW_TODAY);
    expect([d.from, d.to]).toEqual(['2026-11-10', '2026-11-12']);
    expect(parseDates('tomorrow', PREVIEW_TODAY).from).toBe('2026-11-08');
    expect(parseDates('kal', PREVIEW_TODAY).from).toBe('2026-11-08');
    expect(parseDates('parso', PREVIEW_TODAY).from).toBe('2026-11-09');
    expect(parseDates('friday', PREVIEW_TODAY).from).toBe('2026-11-13');
    expect(parseDates('12 to 14 nov', PREVIEW_TODAY).to).toBe('2026-11-14');
    expect(parseDates('2026-11-20', PREVIEW_TODAY).from).toBe('2026-11-20');
    expect(parseDates('half day on 10 nov', PREVIEW_TODAY).half).toBe(true);
    expect(parseDates('teen din', PREVIEW_TODAY).days).toBe(3);
    expect(parseDates('2 din ki chhutti', PREVIEW_TODAY).days).toBe(2);
    // The same text on another "today" gives another date: the clock is only ever the argument.
    expect(parseDates('tomorrow', '2027-01-31').from).toBe('2027-02-01');
    expect(findPeople(db, 'pooja ka leave').matched.map((e) => e.id)).toEqual(['emp_7']);
    expect(findPeople(db, 'tell me more').matched).toHaveLength(0); // "More" is a surname (Rekha More) but also a common word
    expect(findPeople(db, 'farhan ali ka leave').matched.map((e) => e.id)).toEqual(['emp_20']);
  });

  test('confidence is low when two intents are close, and every answer carries its records', () => {
    const r = q(POOJA, 'Mera leave balance kitna hai?');
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(r.usedData.length).toBeGreaterThan(0);
    for (const t of ['leave balance', 'my last payslip', 'next holiday', 'who is my manager', 'uan status', 'tax regime']) {
      const x = q(POOJA, t);
      expect(x.outcome, t).toBe('answered');
      expect(x.usedData.length, t).toBeGreaterThan(0);
      expect(x.answer.length, t).toBeGreaterThan(20);
    }
  });
});

// ═════════════════════════════ pure checks: answers and roles ═════════════════════════════
test.describe('assistant engine: answers', () => {
  test('leave balance is opening + accrued - taken, per type, for the person asking', () => {
    const rows = db.leaveBalances.filter((b) => b.employeeId === 'emp_7');
    const r = q(POOJA, 'Mera leave balance kitna hai?');
    expect(r.intent).toBe('leave_balance');
    for (const b of rows) {
      const t = db.leaveTypes.find((x) => x.id === b.leaveTypeId)!;
      const days = b.opening + b.accrued - b.taken - b.encashed - b.lapsed;
      expect(r.answer).toContain(`${t.name} (${t.code}): ${days} ${days === 1 ? 'day' : 'days'}`);
    }
    expect(r.subjectId).toBe('emp_7');
    expect(r.answer).toContain('Pooja');
  });

  test('a named leave type narrows the answer, and pending requests are shown but not taken off', () => {
    const r = q(POOJA, 'casual leave kitni baaki hai');
    expect(r.answer).toContain('Casual Leave (CL)');
    expect(r.answer).not.toContain('Sick Leave');
    const pend: AssistLeaveRequest[] = [{ ...requests[0]!, id: 'x1', employeeId: 'emp_7', status: 'pending', days: 2, leaveCode: 'CL', leaveTypeId: 'lv_cl' }];
    const r2 = ask(db, POOJA, 'leave balance', { leaveRequests: pend });
    expect(r2.answer).toContain('2 days pending approval');
    const bal = db.leaveBalances.find((b) => b.employeeId === 'emp_7' && b.leaveTypeId === 'lv_cl')!;
    expect(r2.answer).toContain(`${bal.opening + bal.accrued - bal.taken} days, 2 days pending`);
  });

  test('payslip summary matches the latest released run: gross, deductions, net', () => {
    const { slip } = releasedSlips(db, 'emp_7')[0]!;
    expect(slip.month).toBe('2026-10');
    const r = q(POOJA, 'show my payslip');
    expect(r.answer).toContain(`Gross: ${inr(slip.gross)}`);
    expect(r.answer).toContain(`Deductions: ${inr(slip.totalDeductions)}`);
    expect(r.answer).toContain(`Net pay: ${inr(slip.net)}`);
    expect(r.actions?.map((a) => a.kind)).toEqual(['download_payslip', 'open_page']);
    expect(r.sensitive).toBeUndefined();
    // "pichle mahine" = last month = October; November's run does not exist yet, and the answer says so.
    expect(q(POOJA, 'pichle mahine ki salary').answer).toContain('Oct 2026');
    const nov = q(POOJA, 'november payslip');
    expect(nov.answer).toMatch(/not released yet/);
    expect(nov.answer).toContain('Oct 2026, Sep 2026');
    expect(q(POOJA, 'payslip march').answer).toMatch(/no released payslip for Mar 2026/);
  });

  test('a plain-text payslip file carries the same numbers and no PAN, Aadhaar or bank number', () => {
    const f = payslipAsText(db, 'emp_7', '2026-10')!;
    const { slip } = releasedSlips(db, 'emp_7')[0]!;
    expect(f.filename).toBe('payslip-2026-10-pooja-verma.txt');
    expect(f.text).toContain(`Net pay: ${inr(slip.net)}`);
    const e = emp('emp_7');
    expect(f.text).not.toContain(e.pan ?? 'NOPAN');
    expect(f.text).not.toContain(e.bank?.accountNumber ?? 'NOBANK');
    expect(f.text).not.toContain(e.aadhaarLast4 ?? 'NOAADHAAR');
    expect(payslipAsText(db, 'emp_7', '2025-01')).toBeNull();
  });

  test('salary date comes from past runs and is honest that it is a pattern; a missing bank account is called out', () => {
    const r = q(POOJA, 'salary kab aayegi');
    expect(r.answer).toContain('30 Oct 2026');
    expect(r.answer).toMatch(/pattern from past runs, not a promise/);
    const sana: Who = { employeeId: 'emp_9', role: 'employee' };
    expect(emp('emp_9').bank).toBeUndefined();
    expect(q(sana, 'when will my salary be credited').answer).toMatch(/bank account is not on file/);
  });

  test('PF and UAN: Pooja has no UAN, and only the last four digits are ever shown', () => {
    const r = q(POOJA, 'what is my UAN');
    expect(emp('emp_7').uan).toBeUndefined();
    expect(r.answer).toMatch(/UAN: not on file/);
    expect(r.answer).toMatch(/cannot file your PF return/);
    const sheikh: Who = { employeeId: 'emp_6', role: 'employee' };
    const e6 = emp('emp_6');
    const r2 = q(sheikh, 'uan');
    expect(r2.answer).toContain(`ending ${e6.uan!.slice(-4)}`);
    expect(r2.answer).not.toContain(e6.uan!);
  });

  test('tax: regime on file, TDS to date from the payslips, and an honest note about what is not loaded', () => {
    const r = q(POOJA, 'tax regime and tds');
    expect(r.answer).toContain('Tax regime on file: New');
    expect(r.answer).toMatch(/not a full year to date/);
    expect(r.answer).toMatch(/not confirmed|"reported"/);
    const arvind: Who = { employeeId: 'emp_2', role: 'employee' };
    const slips = releasedSlips(db, 'emp_2').filter((s) => s.slip.month >= '2026-04');
    const tds = slips.reduce((s, x) => s + (x.slip.deductions.find((d) => d.code === 'TDS')?.amount ?? 0), 0);
    const ra = q(arvind, 'tds kitna kata');
    expect(ra.answer).toContain(`so far in FY 2026-27: ${inr(tds)} across ${slips.length} payslips`);
  });

  test('holidays come from the person\'s location list: this month and next, a named month, or just the next one', () => {
    const both = q(POOJA, 'holidays');
    expect(both.answer).toContain('This month, Nov 2026');
    expect(both.answer).toContain('Next month, Dec 2026');
    expect(both.answer).toContain('Diwali');
    expect(both.answer).toContain('Guru Nanak Jayanti (optional)');
    expect(both.answer).toContain('Christmas');
    const thisMonth = q(POOJA, 'holidays this month');
    expect(thisMonth.answer).toContain('Diwali');
    expect(thisMonth.answer).not.toContain('Christmas');
    const next = q(POOJA, 'agli chhutti kab hai');
    expect(next.answer).toContain('Diwali (tomorrow)');
    const blr: Who = { employeeId: 'emp_8', role: 'employee' };
    expect(q(blr, 'holidays this month').answer).toContain('Kannada Rajyotsava');
    expect(q(POOJA, 'holidays this month').answer).not.toContain('Kannada Rajyotsava');
    expect(q(POOJA, 'holidays december').answer).toContain('Fri 25 Dec: Christmas');
  });

  test('manager, team and shift today come from the records', () => {
    expect(q(POOJA, 'who is my manager').answer).toContain('Rohit Chauhan');
    const team = q(ROHIT, 'my team');
    expect(team.answer).toContain('direct reports (7)');
    expect(directReports(db, 'emp_4').map((e) => e.id)).not.toContain('emp_4'); // Rohit is recorded as his own manager: never his own report
    const own = q(ROHIT, 'who is my manager');
    expect(own.answer).toMatch(/reporting to yourself, which looks like a data mistake/);
    expect(q(POOJA, 'shift today').answer).toContain('General, 09:30 to 18:30');
    expect(q(POOJA, 'shift today').answer).toContain('Sat 7 Nov 2026');
  });

  test('attendance and team leave read monthly summaries and the requests made in the assistant', () => {
    const r = q(ROHIT, 'team attendance');
    expect(r.answer).toContain('Imran Sheikh');
    expect(r.answer).toContain('Nov 2026 so far');
    const leave = q(ROHIT, 'Who is on leave in my team?');
    expect(leave.answer).toContain('Karthik Subramanian: SL');
    expect(leave.answer).toContain('Farhan Ali: CL');
    expect(leave.answer).toContain('Imran Sheikh: EL');
    expect(leave.answer).toMatch(/Leave booked in other tools is not in this preview/);
    const none = ask(db, ROHIT, 'who is on leave', { leaveRequests: [] });
    expect(none.answer).toContain('No leave is booked');
    const wide = q(TANVI, 'who is on leave in next 30 days');
    expect(wide.answer).toContain('to 7 Dec 2026');
  });

  test('policies answer from the titles and summaries, point to the Policies page, and follow the supplied list', () => {
    const r = q(POOJA, 'what is the travel policy');
    expect(r.answer).toContain('Travel & expense policy, version 2.1');
    expect(r.actions?.[0]).toMatchObject({ kind: 'open_page', href: '/dashboard/hrms/policies?policy=pol_travel' });
    expect(q(POOJA, 'can I work from home').answer).toContain('Remote / field work');
    const list = q(POOJA, 'policy');
    expect(list.answer).toContain('These are the policies on file');
    for (const p of seedPolicies()) expect(list.answer).toContain(p.title);
    const custom = policyRefs([{ ...seedPolicies()[1]!, versions: [{ ...currentVersion(seedPolicies()[1]!), version: '9.0' }] }]);
    expect(ask(db, POOJA, 'travel policy', { policies: custom }).answer).toContain('version 9.0');
  });

  test('unknown questions get an honest "I don\'t know that yet", no actions and no made-up data', () => {
    for (const t of ['what is the meaning of life', 'my bonus', 'tell me a joke']) {
      const r = q(POOJA, t);
      expect(r.outcome, t).toBe('unknown');
      expect(r.intent).toBe('unknown');
      expect(r.answer).toContain("I don't know that yet");
      expect(r.answer).toMatch(/will not guess/);
      expect(r.actions).toBeUndefined();
      expect(r.usedData).toEqual([]);
      expect(r.suggestions.length).toBeGreaterThan(2);
    }
  });
});

test.describe('assistant engine: roles', () => {
  test('an employee can ask only about themselves', () => {
    for (const t of ['Rohit ka leave balance', 'Rohit ki salary kitni hai', 'team leave', 'everyone ka leave']) {
      const r = q(POOJA, t);
      expect(r.outcome, t).toBe('refused');
      expect(r.refused, t).toBeTruthy();
      expect(r.usedData, t).toEqual(['Your role (employee)']);
    }
    expect(q(POOJA, 'Rohit ka leave balance').refused).toBe('You can only ask about your own HR data.');
  });

  test('a manager sees a direct report\'s leave and attendance, never anyone\'s pay', () => {
    expect(q(ROHIT, 'Pooja ka leave balance').outcome).toBe('answered');
    expect(q(ROHIT, 'Sana ki attendance').outcome).toBe('answered');
    for (const t of ['Pooja ki salary kitni hai', 'Gaurav ka payslip', 'everyone salary', 'my team salary']) {
      const r = q(ROHIT, t);
      expect(r.outcome, t).toBe('refused');
      expect(r.refused, t).toBe('Salary of other people is not shared with managers.');
    }
    expect(q(ROHIT, 'Pooja ka UAN').refused).toBe('PF and tax details of other people are not shared with managers.');
    expect(q(ROHIT, 'Pooja ka tds').refused).toMatch(/not shared with managers/);
    // someone outside the team
    const out = q(ROHIT, 'Divya ka leave balance');
    expect(out.outcome).toBe('refused');
    expect(out.refused).toBe('Divya Menon does not report to you. Managers can ask about their own direct reports only.');
    // a manager can still read their own pay
    expect(q(ROHIT, 'my payslip').outcome).toBe('answered');
  });

  test('HR can ask about anyone; reading someone else\'s pay is flagged for the access log', () => {
    expect(q(TANVI, 'Divya ka leave balance').outcome).toBe('answered');
    const r = q(TANVI, 'Pooja ka last payslip');
    expect(r.outcome).toBe('answered');
    expect(r.answer).toContain('Pooja Verma');
    expect(r.sensitive).toEqual({ employeeId: 'emp_7', field: 'Payslip summary' });
    expect(q(TANVI, 'Pooja ka UAN').sensitive?.field).toBe('PF and UAN status');
    expect(q(TANVI, 'my payslip').sensitive).toBeUndefined();
    const all = q(TANVI, 'everyone salary');
    expect(all.outcome).toBe('needs_info');
    expect(all.answer).toMatch(/Name one person/);
  });

  test('accessFor is the one place roles are decided', () => {
    const self = accessFor(db, POOJA, { kind: 'self' }, 'pay');
    expect(self.ok && self.targets[0]!.id).toBe('emp_7');
    expect(accessFor(db, POOJA, { kind: 'person', id: 'emp_7' }, 'pay').ok).toBe(true);
    expect(accessFor(db, POOJA, { kind: 'team' }, 'general').ok).toBe(false);
    expect(accessFor(db, ROHIT, { kind: 'team' }, 'general').targets).toHaveLength(7);
    expect(accessFor(db, ROHIT, { kind: 'all' }, 'general').ok).toBe(false);
    expect(accessFor(db, TANVI, { kind: 'all' }, 'general').targets.length).toBeGreaterThan(20);
    const mcp = accessFor(db, TANVI, { kind: 'person', id: 'emp_7' }, 'pay', 'Salary', 'mcp');
    expect(mcp.ok).toBe(false);
    expect(mcp.reason).toMatch(/never exposed through MCP/);
    expect(accessFor(db, { employeeId: 'nobody', role: 'hr' }, { kind: 'self' }, 'general').ok).toBe(false);
  });

  test('two people named at once, or a role mismatch, is never guessed', () => {
    const r = q(TANVI, 'Imran Farhan leave balance');
    expect(r.outcome).toBe('needs_info');
    expect(r.answer).toMatch(/more than one person/);
    expect(suggestionsFor('manager')).toContain('Team attendance');
    expect(suggestionsFor('hr')).toContain('Pooja ka leave balance');
  });
});

// ═════════════════════════════ pure checks: applying leave ═════════════════════════════
test.describe('assistant engine: apply leave', () => {
  const draftOf = (r: ReturnType<typeof q>) => { const a = r.actions?.find((x) => x.kind === 'confirm_leave'); return a && a.kind === 'confirm_leave' ? a.draft : undefined; };

  test('prefills type, dates, days and approver, and offers Confirm and Not now', () => {
    const r = q(POOJA, 'apply leave 10 nov to 11 nov');
    const d = draftOf(r)!;
    expect(d).toMatchObject({ employeeId: 'emp_7', leaveCode: 'CL', from: '2026-11-10', to: '2026-11-11', days: 2, half: false, approverId: 'emp_4' });
    expect(r.actions?.map((a) => a.label)).toEqual(['Confirm', 'Not now']);
    expect(r.answer).toMatch(/Nothing is sent until you confirm/);
    expect(r.answer).toContain('Goes to: Rohit Chauhan');
    const bal = db.leaveBalances.find((b) => b.employeeId === 'emp_7' && b.leaveTypeId === 'lv_cl')!;
    expect(r.answer).toContain(`Balance after approval: ${bal.opening + bal.accrued - bal.taken - 2}`);
  });

  test('Sundays and public holidays are not counted, and tomorrow (Sunday and Diwali) needs no leave', () => {
    const t = q(POOJA, 'kal chhutti chahiye');
    expect(t.answer).toMatch(/Sunday and Diwali/);
    expect(draftOf(t)).toBeUndefined();
    // Thu 12 to Wed 18 Nov has one Sunday (15 Nov), so 7 calendar days count as 6.
    expect(draftOf(q(POOJA, 'apply leave 12 nov to 18 nov'))!.days).toBe(6);
  });

  test('a long break moves to earned leave; casual leave named explicitly over 3 days is not prepared', () => {
    const long = draftOf(q(POOJA, 'apply leave 12 nov to 18 nov'))!;
    expect(long.leaveCode).toBe('EL');
    const cl = q(POOJA, 'apply casual leave 12 nov to 16 nov');
    expect(draftOf(cl)).toBeUndefined();
    expect(cl.answer).toMatch(/3 days at a time/);
    expect(cl.suggestions[0]).toMatch(/^Apply earned leave from 12 Nov to 16 Nov$/);
  });

  test('past dates, overlap with an existing request, half days and low balances are handled', () => {
    expect(q(POOJA, 'apply leave for yesterday').answer).toMatch(/already in the past/);
    const mine: AssistLeaveRequest[] = [{ ...requests[0]!, id: 'm1', employeeId: 'emp_7', from: '2026-11-10', to: '2026-11-11', status: 'pending' }];
    const dupe = ask(db, POOJA, 'apply leave 11 nov', { leaveRequests: mine });
    expect(dupe.answer).toMatch(/already have a pending CL request/);
    expect(draftOf(dupe)).toBeUndefined();
    const half = draftOf(q(POOJA, 'apply leave 10 nov half day'))!;
    expect(half).toMatchObject({ days: 0.5, half: true });
    const low = structuredClone(db);
    low.leaveBalances.find((b) => b.employeeId === 'emp_7' && b.leaveTypeId === 'lv_cl')!.taken = 7.5;
    const r = ask(low, POOJA, 'apply casual leave 10 nov to 11 nov');
    expect(r.answer).toMatch(/I cannot prepare it/);
    expect(draftOf(r)).toBeUndefined();
  });

  test('no dates: it asks, and a short reply like "tomorrow" or "monday" continues the request', () => {
    const first = q(POOJA, 'apply leave');
    expect(first.outcome).toBe('needs_info');
    expect(first.intent).toBe('apply_leave');
    const next = ask(db, POOJA, 'monday', { leaveRequests: requests, prev: { intent: first.intent, slots: first.slots } });
    expect(next.intent).toBe('apply_leave');
    expect(draftOf(next)).toMatchObject({ from: '2026-11-09', to: '2026-11-09' });
    // without the context, "monday" alone is not a request
    expect(ask(db, POOJA, 'monday', { leaveRequests: requests }).outcome).toBe('unknown');
  });

  test('leave can only be asked for yourself', () => {
    const r = q(TANVI, 'apply leave for Pooja on 10 nov');
    expect(r.outcome).toBe('refused');
    expect(r.refused).toMatch(/only be requested by the person it is for/);
  });
});

// ═════════════════════════════ pure checks: MCP preview, voice and templates ═════════════════════════════
test.describe('MCP design preview', () => {
  test('six tools with valid JSON schemas, a scope for every role, and examples that validate', () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual(['get_leave_balance', 'apply_leave_draft', 'get_payslip_summary', 'list_team_leave', 'get_policy', 'get_holidays']);
    for (const t of MCP_TOOLS) {
      expect(t.inputSchema.type).toBe('object');
      expect(t.inputSchema.additionalProperties).toBe(false);
      for (const r of t.inputSchema.required ?? []) expect(Object.keys(t.inputSchema.properties)).toContain(r);
      expect(Object.keys(t.scopes).sort()).toEqual(['employee', 'hr', 'manager']);
      expect(validateArgs(t, t.example), t.name).toEqual([]);
      expect(() => JSON.parse(JSON.stringify(t.inputSchema))).not.toThrow();
    }
    expect(MCP_NEVER_EXPOSED.map((n) => n.what).join(' ')).toMatch(/Other people's pay/);
    expect(MCP_NEVER_EXPOSED.map((n) => n.what).join(' ')).toMatch(/Aadhaar/);
  });

  test('arguments are validated against the schema', () => {
    const t = toolByName('apply_leave_draft')!;
    expect(validateArgs(t, {})).toEqual(['"from" is required.']);
    expect(validateArgs(t, { from: '10/11/2026' })[0]).toMatch(/does not match the format/);
    expect(validateArgs(t, { from: '2026-11-10', leave_type: 'XX' })[0]).toMatch(/must be one of/);
    expect(validateArgs(t, { from: '2026-11-10', extra: 1 })[0]).toMatch(/not an argument/);
    expect(validateArgs(t, { from: '2026-11-10', half_day: 'yes' })[0]).toMatch(/true or false/);
    expect(validateArgs(toolByName('list_team_leave')!, { window_days: 99 })[0]).toMatch(/at most 31/);
    expect(validateArgs(toolByName('list_team_leave')!, { window_days: 1.5 })[0]).toMatch(/whole number/);
    expect(validateArgs(t, 'nope')[0]).toMatch(/JSON object/);
  });

  test('runTool uses the same engine: own balance, drafts that never submit, and role denials', () => {
    const bal = runTool(db, POOJA, 'get_leave_balance', {}, { leaveRequests: requests });
    expect(bal.outcome).toBe('ok');
    expect(bal.result.isError).toBe(false);
    expect(bal.result.content[0]!.text).toBe(q(POOJA, 'leave balance').answer);
    const draft = runTool(db, POOJA, 'apply_leave_draft', { from: '2026-11-10', to: '2026-11-11' }, { leaveRequests: requests });
    expect(draft.result.structuredContent).toMatchObject({ status: 'draft_ready', submitted: false });
    expect(draft.note).toMatch(/Nothing was submitted/);
    // employees cannot list team leave
    const team = runTool(db, POOJA, 'list_team_leave', {});
    expect(team.outcome).toBe('denied');
    expect(team.result.isError).toBe(true);
    expect(runTool(db, ROHIT, 'list_team_leave', { window_days: 7 }, { leaveRequests: requests }).outcome).toBe('ok');
    // managers cannot read pay; nobody, HR included, reads another person's pay over MCP
    expect(runTool(db, ROHIT, 'get_payslip_summary', { employee_id: 'emp_7' }).result.content[0]!.text).toBe('Salary of other people is not shared with managers.');
    const hrPay = runTool(db, TANVI, 'get_payslip_summary', { employee_id: 'emp_7' });
    expect(hrPay.outcome).toBe('denied');
    expect(hrPay.result.content[0]!.text).toMatch(/never exposed through MCP/);
    expect(runTool(db, TANVI, 'get_payslip_summary', {}).outcome).toBe('ok');
    expect(runTool(db, TANVI, 'get_leave_balance', { employee_id: 'emp_20' }).outcome).toBe('ok');
    expect(runTool(db, ROHIT, 'get_leave_balance', { employee_id: 'emp_2' }).outcome).toBe('denied');
  });

  test('policy and holiday tools, unknown tools and bad arguments', () => {
    expect(runTool(db, POOJA, 'get_policy', { topic: 'travel' }).result.content[0]!.text).toContain('Travel & expense');
    expect(runTool(db, POOJA, 'get_policy', { topic: 'zzzz' }).outcome).toBe('error');
    expect(runTool(db, POOJA, 'get_holidays', { month: '2026-12' }).result.content[0]!.text).toContain('Christmas');
    expect(runTool(db, POOJA, 'delete_everything', {}).result._meta).toEqual({ code: 'method_not_found' });
    const bad = runTool(db, POOJA, 'get_holidays', { month: 'december' });
    expect(bad.outcome).toBe('error');
    expect(bad.result._meta).toEqual({ code: 'invalid_params' });
  });

  test('the seeded audit log is consistent with what the tools would do', () => {
    const log = seedMcpLog();
    expect(log.length).toBeGreaterThanOrEqual(8);
    for (const e of log) {
      expect(toolByName(e.tool), e.id).toBeTruthy();
      if (e.tool === 'get_payslip_summary' && JSON.parse(e.args).employee_id) expect(e.outcome, e.id).toBe('denied');
    }
    expect(log.some((e) => e.outcome === 'denied')).toBe(true);
  });
});

test.describe('voice and templates', () => {
  test('six languages, three phrases each, in script with transliteration and English, all engine-checked', () => {
    expect(VOICE_LANGUAGES.map((l) => l.id).sort()).toEqual(['bn', 'hi', 'kn', 'mr', 'ta', 'te']);
    const seen = new Set<string>();
    for (const l of VOICE_LANGUAGES) {
      expect(l.utterances).toHaveLength(3);
      for (const u of l.utterances) {
        expect(u.script.length).toBeGreaterThan(5);
        expect(/[A-Za-z]/.test(u.script), `${l.id}: script text is not Latin letters`).toBe(false);
        expect(/^[A-Za-z' ?]+$/.test(u.translit), `${l.id}: transliteration is Latin only`).toBe(true);
        expect(u.english.endsWith('?')).toBe(true);
        expect(seen.has(u.script), `duplicate phrase ${u.script}`).toBe(false);
        seen.add(u.script);
      }
      const intents = l.utterances.map((u) => q(POOJA, u.engineText).intent);
      expect(intents).toEqual(['leave_balance', 'salary_date', 'holidays']);
    }
    expect(VOICE_COVERAGE).toHaveLength(6);
    for (const c of VOICE_COVERAGE) { expect(c.status).toBe('Sample only'); expect(c.speechToText).toBe('Not connected'); }
  });

  test('templates are filled from the person\'s records, with a stated sample when there is nothing to use', () => {
    const acks = seedAcks(seedPolicies(), db.employees);
    const base = { db, requests, policies: seedPolicies(), acks, reminders: [] };
    const t = (id: string) => MSG_TEMPLATES.find((x) => x.id === id)!;
    const pay = renderTemplate(t('payslip_ready'), { ...base, employee: emp('emp_7') });
    expect(pay.text).toContain('Hi Pooja');
    expect(pay.text).toContain('Oct 2026');
    expect(pay.text).not.toMatch(/₹/);
    expect(renderTemplate(t('payslip_ready'), { ...base, employee: emp('emp_24') }).note).toMatch(/sample month/);
    const lv = renderTemplate(t('leave_approved'), { ...base, employee: emp('emp_6') });
    expect(lv.text).toContain('EL request');
    expect(lv.text).toContain('Rohit Chauhan');
    expect(lv.note).toMatch(/still pending/);
    const doc = renderTemplate(t('document_pending'), { ...base, employee: emp('emp_9') });
    expect(doc.note).toBeUndefined();
    expect(doc.text).toContain('Cancelled cheque');
    expect(renderTemplate(t('document_pending'), { ...base, employee: emp('emp_7') }).note).toMatch(/sample document/);
    expect(renderTemplate(t('policy_ack'), { ...base, employee: emp('emp_7') }).text).toMatch(/policy \(version/);
    for (const m of MSG_TEMPLATES) expect(renderTemplate(m, { ...base, employee: emp('emp_7') }).text).not.toMatch(/\{\w+\}/);
  });
});

// ═════════════════════════════ pure checks: policies and POSH ═════════════════════════════
test.describe('policy logic', () => {
  const policies = seedPolicies();
  const acks = seedAcks(policies, db.employees);

  test('the library has eight policies, each with an owner, a summary, ordered versions, and indicative legal tags', () => {
    expect(policies.map((p) => p.title)).toEqual(['Leave', 'Travel & expense', 'Code of conduct', 'POSH', 'IT & data use', 'Attendance', 'Incentive plan', 'Remote / field work']);
    for (const p of policies) {
      expect(p.owner.length).toBeGreaterThan(3);
      expect(p.summary.length).toBeGreaterThan(20);
      expect(p.versions.length).toBeGreaterThanOrEqual(2);
      const nums = p.versions.map((v) => v.version);
      expect(new Set(nums).size).toBe(nums.length);
      const eff = p.versions.map((v) => v.effectiveFrom);
      expect([...eff].sort()).toEqual(eff);
      for (const v of p.versions) expect(v.text.split('\n').length).toBeGreaterThan(6);
      for (const l of p.legal) expect(['reported', 'indicative']).toContain(l.confidence);
    }
    expect(policies.find((p) => p.id === 'pol_posh')!.legal.some((l) => l.confidence === 'reported' && /10 or more employees/.test(l.text))).toBe(true);
  });

  test('line diff: same, added, removed, changed, empty and reordered', () => {
    expect(lineDiff('a\nb', 'a\nb').every((l) => l.type === 'same')).toBe(true);
    expect(lineDiff('a\nb\nc', 'a\nc\nd').map((l) => `${l.type}:${l.text}`)).toEqual(['same:a', 'del:b', 'same:c', 'add:d']);
    expect(lineDiff('a\nb', 'a\nB').map((l) => l.type)).toEqual(['same', 'del', 'add']);
    expect(lineDiff('', 'x').map((l) => l.type)).toEqual(['del', 'add']); // an empty string is one empty line
    expect(diffStats(lineDiff('a\nb\nc', 'a\nc\nd'))).toEqual({ added: 1, removed: 1, unchanged: 2 });
    // rebuilding either side from the diff gives the original text back
    const a = 'one\ntwo\nthree\nfour'; const b = 'one\n2\nthree\nfour\nfive';
    const d = lineDiff(a, b);
    expect(d.filter((l) => l.type !== 'add').map((l) => l.text).join('\n')).toBe(a);
    expect(d.filter((l) => l.type !== 'del').map((l) => l.text).join('\n')).toBe(b);
  });

  test('the seeded versions really differ: Leave v2.0 to v2.1 is two lines out, two lines in', () => {
    const leave = policies.find((p) => p.id === 'pol_leave')!;
    const d = lineDiff(leave.versions[1]!.text, leave.versions[2]!.text);
    expect(diffStats(d)).toMatchObject({ added: 2, removed: 2 });
    expect(d.find((l) => l.type === 'add')!.text).toContain('Sick leave: 8 days');
    for (const p of policies) for (let i = 1; i < p.versions.length; i++) expect(diffStats(lineDiff(p.versions[i - 1]!.text, p.versions[i]!.text)).added, `${p.id} v${p.versions[i]!.version}`).toBeGreaterThan(0);
  });

  test('publishing: validation, next version number, the old versions stay, and nothing is mutated', () => {
    const leave = policies.find((p) => p.id === 'pol_leave')!;
    expect(nextVersionLabel(leave, 'minor')).toBe('2.2');
    expect(nextVersionLabel(leave, 'major')).toBe('3.0');
    const cur = currentVersion(leave);
    const ok = { changeSummary: 'Casual leave raised to 9 days.', effectiveFrom: PREVIEW_TODAY, requiresAck: true, text: `${cur.text}\n- Extra line for the test, long enough.`, bump: 'minor' as const };
    expect(validatePublish(leave, ok, PREVIEW_TODAY)).toEqual({});
    expect(Object.keys(validatePublish(leave, { ...ok, changeSummary: 'short' }, PREVIEW_TODAY))).toEqual(['changeSummary']);
    expect(validatePublish(leave, { ...ok, effectiveFrom: '2026-11-06' }, PREVIEW_TODAY).effectiveFrom).toMatch(/past/);
    expect(validatePublish(leave, { ...ok, text: cur.text }, PREVIEW_TODAY).text).toMatch(/same as the current version/);
    expect(validatePublish(leave, { ...ok, text: 'tiny' }, PREVIEW_TODAY).text).toMatch(/too short/);
    const next = withNewVersion(leave, ok, 'Someone', PREVIEW_TODAY);
    expect(next.versions).toHaveLength(4);
    expect(leave.versions).toHaveLength(3);
    expect(currentVersion(next)).toMatchObject({ version: '2.2', publishedOn: PREVIEW_TODAY, publishedBy: 'Someone', requiresAck: true });
    expect(next.versions.slice(0, 3)).toEqual(leave.versions);
  });

  test('acknowledgement: who it applies to, pending days, rates, and a new version resets everyone', () => {
    const travel = policies.find((p) => p.id === 'pol_travel')!;
    const aud = audienceOf(db, travel);
    expect(aud).toHaveLength(22);
    expect(aud.some((e) => e.status === 'exited' || e.status === 'onboarding')).toBe(false);
    const rows = ackRows(db, travel, acks, [], PREVIEW_TODAY);
    const s = ackSummary(rows);
    expect(s.acknowledged + s.pending).toBe(22);
    expect(s.rate).toBeCloseTo((s.acknowledged / 22) * 100, 5);
    const v = currentVersion(travel);
    for (const r of rows.filter((x) => x.status === 'pending')) {
      const from = r.employee.joinDate > v.publishedOn ? r.employee.joinDate : v.publishedOn;
      expect(r.daysPending).toBe(Math.round((Date.parse(`${PREVIEW_TODAY}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000));
    }
    // sales-only policy
    const inc = policies.find((p) => p.id === 'pol_incentive')!;
    expect(audienceOf(db, inc).every((e) => e.departmentId === 'dep_sales')).toBe(true);
    // a version that does not need acknowledgement
    const remote = policies.find((p) => p.id === 'pol_remote')!;
    expect(ackSummary(ackRows(db, remote, acks, [], PREVIEW_TODAY)).rate).toBeNull();
    // publishing resets: nobody has acknowledged the new current version
    const next = withNewVersion(travel, { changeSummary: 'A change to the policy.', effectiveFrom: PREVIEW_TODAY, requiresAck: true, text: `${v.text}\n- One more rule here.`, bump: 'minor' }, 'x', PREVIEW_TODAY);
    const after = ackSummary(ackRows(db, next, acks, [], PREVIEW_TODAY));
    expect(after.acknowledged).toBe(0);
    expect(after.pending).toBe(22);
    expect(after.avgDaysPending).toBe(0);
    // ...and people keep the record of the older version they did acknowledge
    expect(ackRows(db, next, acks, [], PREVIEW_TODAY).filter((r) => r.previouslyAcknowledged).length).toBeGreaterThan(5);
    // no acknowledgement can be dated before the person joined
    for (const a of acks) expect(a.at >= emp(a.employeeId).joinDate, `${a.policyId} ${a.employeeId}`).toBe(true);
  });

  test('a person who joined after publication is counted from their join date, and the per-person view lists every policy that applies', () => {
    const travel = policies.find((p) => p.id === 'pol_travel')!;
    const meenal = emp('emp_21'); // joined 24 Nov 2025, before v2.1 (14 Oct 2026): counted from publication
    const row = ackRows(db, travel, [], [], PREVIEW_TODAY).find((r) => r.employee.id === meenal.id)!;
    expect(row.daysPending).toBe(24);
    const late = structuredClone(db);
    late.employees.find((e) => e.id === 'emp_21')!.joinDate = '2026-11-01';
    expect(ackRows(late, travel, [], [], PREVIEW_TODAY).find((r) => r.employee.id === 'emp_21')!.daysPending).toBe(6);
    const view = personView(db, policies, acks, [], 'emp_7', PREVIEW_TODAY);
    expect(view.map((x) => x.policy.id)).toContain('pol_incentive');
    expect(view).toHaveLength(8);
    expect(personView(db, policies, acks, [], 'emp_24', PREVIEW_TODAY)).toHaveLength(0); // a joiner is not asked yet
  });
});

test.describe('POSH logic', () => {
  const posh = seedPosh();

  test('the Internal Committee passes its checks, and fails them when the people change', () => {
    const ok = icChecks(db, posh.committee, PREVIEW_TODAY);
    expect(ok.every((c) => c.ok)).toBe(true);
    expect(ok.map((c) => c.id)).toEqual(['presiding', 'members', 'external', 'women', 'tenure', 'present']);
    const gone = structuredClone(db);
    gone.employees.find((e) => e.id === 'emp_10')!.status = 'exited';
    expect(icChecks(gone, posh.committee, PREVIEW_TODAY).find((c) => c.id === 'present')).toMatchObject({ ok: false, detail: '1 to replace' });
    const male = structuredClone(db);
    male.employees.find((e) => e.id === 'emp_1')!.gender = 'male';
    expect(icChecks(male, posh.committee, PREVIEW_TODAY).find((c) => c.id === 'presiding')!.ok).toBe(false);
    const noExt = { ...posh.committee, members: posh.committee.members.filter((m) => m.role !== 'external') };
    expect(icChecks(db, noExt, PREVIEW_TODAY).find((c) => c.id === 'external')!.ok).toBe(false);
    expect(icChecks(db, { ...posh.committee, tenureEnds: '2026-10-31' }, PREVIEW_TODAY).find((c) => c.id === 'tenure')!.ok).toBe(false);
    expect(icChecks(db, { ...posh.committee, tenureEnds: '2029-04-30' }, PREVIEW_TODAY).find((c) => c.id === 'tenure')!.ok).toBe(false);
    const fewWomen = { ...posh.committee, members: posh.committee.members.map((m) => (m.employeeId === 'emp_3' || m.employeeId === 'emp_16' ? { ...m, employeeId: 'emp_6' } : m)) };
    expect(icChecks(db, fewWomen, PREVIEW_TODAY).find((c) => c.id === 'women')!.ok).toBe(false);
  });

  test('the register holds only IDs, categories, dates and stages: no names and no details', () => {
    for (const c of posh.cases) {
      expect(Object.keys(c).sort().every((k) => ['id', 'receivedOn', 'nature', 'status', 'closedOn', 'outcome'].includes(k)), c.id).toBe(true);
      expect(c.id).toMatch(/^POSH-2026-\d{3}$/);
    }
    expect(posh.cases.map((c) => c.id)).toEqual(['POSH-2026-001', 'POSH-2026-002', 'POSH-2026-003', 'POSH-2026-004']);
    expect(nextCaseId(posh.cases, 2026)).toBe('POSH-2026-005');
    expect(nextCaseId([], 2027)).toBe('POSH-2027-001');
  });

  test('annual report numbers come from the register and the sessions', () => {
    const r = annualReport(posh.cases, posh.sessions, 2026, PREVIEW_TODAY);
    expect(r).toMatchObject({ filed: 4, disposed: 2, pendingAtYearEnd: 2, sessions: 2 });
    expect(r.pendingOver90).toBe(0);
    expect(annualReport(posh.cases, posh.sessions, 2026, '2027-01-01').pendingOver90).toBe(1); // 003 is 136 days old, 004 only 64
    expect(annualReport(posh.cases, posh.sessions, 2026, '2027-03-01').pendingOver90).toBe(2);
    expect(annualReport(posh.cases, posh.sessions, 2025, PREVIEW_TODAY)).toMatchObject({ filed: 0, disposed: 0, sessions: 0 });
    expect(annualReport(posh.cases, posh.sessions, 2027, PREVIEW_TODAY).pendingAtYearEnd).toBe(2); // still open the year after
  });

  test('training coverage counts people who attended a session this year, and lists who is pending', () => {
    const c = trainingCoverage(db, posh.sessions, 2026);
    expect(c.total).toBe(22);
    expect(c.trained).toBe(18);
    expect(c.pending.map((e) => e.id)).toEqual(['emp_19', 'emp_20', 'emp_21', 'emp_22']);
    expect(c.pct).toBeCloseTo((18 / 22) * 100, 5);
    const more = trainingCoverage(db, [...posh.sessions, { id: 'x', date: '2026-11-01', title: 't', mode: 'online', attendees: ['emp_19', 'emp_20', 'emp_21', 'emp_22'] }], 2026);
    expect(more.pending).toHaveLength(0);
    expect(trainingCoverage(db, posh.sessions, 2025).trained).toBe(0);
  });
});

// ═════════════════════════════ pure checks: org chart ═════════════════════════════
test.describe('org chart logic', () => {
  const vac = seedVacancies();
  const person = (id: string, reportingToId?: string, status: Employee['status'] = 'active'): Employee => ({ ...structuredClone(emp('emp_1')), id, firstName: id, lastName: 'T', code: id, reportingToId, status });

  test('the tree comes from reportingToId: sales reports under Rohit, who is recorded as his own manager', () => {
    const t = buildTree(db.employees, vac, { showExited: false });
    expect(t.issues).toHaveLength(1);
    expect(t.issues[0]).toMatchObject({ employeeId: 'emp_4', kind: 'self' });
    expect(t.roots.map((r) => r.emp.id)).toEqual(['emp_4', 'emp_2']);
    const rohit = t.byId.get('emp_4')!;
    expect(rohit.children.map((c) => c.emp.id).sort()).toEqual(['emp_19', 'emp_20', 'emp_22', 'emp_6', 'emp_7', 'emp_8', 'emp_9']);
    expect(rohit.vacancies).toHaveLength(2);
    expect(t.visible).toBe(24);
    expect(t.unplaced).toHaveLength(15);
    expect(t.unplaced.map((e) => e.id)).not.toContain('emp_2'); // an open role under Arvind keeps him in the chart
    expect(t.byId.has('emp_23')).toBe(false); // Deepa left
  });

  test('exited people are hidden by default and shown on request; their reports move up', () => {
    expect(buildTree(db.employees, [], { showExited: true }).byId.has('emp_23')).toBe(true);
    const chain = [person('boss'), person('mid', 'boss', 'exited'), person('low', 'mid')];
    const hidden = buildTree(chain, [], { showExited: false });
    expect(hidden.byId.has('mid')).toBe(false);
    expect(hidden.byId.get('boss')!.children.map((c) => c.emp.id)).toEqual(['low']);
    const shown = buildTree(chain, [], { showExited: true });
    expect(shown.byId.get('mid')!.children.map((c) => c.emp.id)).toEqual(['low']);
  });

  test('a loop in the data is broken and reported, never drawn forever', () => {
    const t = buildTree([person('a', 'c'), person('b', 'a'), person('c', 'b'), person('d', 'c')], [], { showExited: false });
    expect(t.issues.map((i) => i.kind)).toEqual(['loop']);
    expect(t.visible).toBe(4);
    expect(t.roots.length + t.unplaced.length).toBe(1);
    const missing = buildTree([person('a', 'ghost')], [], { showExited: false });
    expect(missing.issues[0]!.kind).toBe('missing_manager');
  });

  test('cycles are prevented: not yourself, not anyone in your own subtree, not someone who left', () => {
    const e = db.employees;
    expect(canReportTo(e, 'emp_7', 'emp_7')).toEqual({ ok: false, reason: 'A person cannot report to themselves.' });
    expect(canReportTo(e, 'emp_7', undefined).ok).toBe(true);
    expect(canReportTo(e, 'emp_7', 'emp_2').ok).toBe(true);
    const down = canReportTo(e, 'emp_4', 'emp_7');
    expect(down.ok).toBe(false);
    expect(down.reason).toMatch(/already reports to Rohit Chauhan/);
    expect(canReportTo(e, 'emp_7', 'emp_23')).toMatchObject({ ok: false, reason: 'Deepa Pillai has left the company.' });
    expect(canReportTo(e, 'emp_7', 'nobody').ok).toBe(false);
    // a longer chain: a > b > c > d. d may not become a's manager, c may not, but an outsider may.
    const chain = [person('a'), person('b', 'a'), person('c', 'b'), person('d', 'c'), person('z')];
    for (const m of ['b', 'c', 'd', 'a']) expect(canReportTo(chain, 'a', m).ok, `a -> ${m}`).toBe(false);
    expect(canReportTo(chain, 'a', 'z').ok).toBe(true);
    expect(canReportTo(chain, 'c', 'a').ok).toBe(true);
    expect([...subtreeIds(chain, 'a')].sort()).toEqual(['b', 'c', 'd']);
    expect([...subtreeIds(e, 'emp_4')]).not.toContain('emp_4'); // the self-reference is ignored
  });

  test('the manager picker lists exactly the people who are allowed', () => {
    const ids = validManagers(db.employees, 'emp_4').map((x) => x.id);
    for (const sub of ['emp_6', 'emp_7', 'emp_8', 'emp_9', 'emp_19', 'emp_20', 'emp_22']) expect(ids).not.toContain(sub);
    expect(ids).not.toContain('emp_4');
    expect(ids).not.toContain('emp_23');
    expect(ids).toContain('emp_2');
    expect(ids).toHaveLength(db.employees.length - 1 - 7 - 1);
    for (const x of db.employees) for (const m of validManagers(db.employees, x.id)) expect(canReportTo(db.employees, x.id, m.id).ok).toBe(true);
  });

  test('stats: span of control, levels, and who has no manager', () => {
    const s = orgStats(buildTree(db.employees, vac, { showExited: false }));
    expect(s).toMatchObject({ people: 24, managers: 1, avgSpan: 7, levels: 2, noManager: 17, vacancies: 3 });
    expect(s.maxSpan).toEqual({ name: 'Rohit Chauhan', n: 7 });
    const moved = structuredClone(db.employees);
    moved.find((x) => x.id === 'emp_4')!.reportingToId = 'emp_2';
    const s2 = orgStats(buildTree(moved, vac, { showExited: false }));
    expect(s2).toMatchObject({ managers: 2, levels: 3, noManager: 16 });
    expect(s2.avgSpan).toBe(4);
    expect(orgStats(buildTree([], [], { showExited: false })).levels).toBe(0);
  });

  test('search finds by name, code or designation, and the path to a person is known', () => {
    const t = buildTree(db.employees, vac, { showExited: false });
    expect(searchIds(t, db, 'pooja')).toEqual(['emp_7']);
    expect(searchIds(t, db, 'MER-1007')).toEqual(['emp_7']);
    expect(searchIds(t, db, 'field executive').length).toBe(4);
    expect(searchIds(t, db, '  ')).toEqual([]);
    expect(ancestorsOf(t, 'emp_7')).toEqual(['emp_4']);
    expect(ancestorsOf(t, 'emp_4')).toEqual([]);
    const moved = structuredClone(db.employees);
    moved.find((x) => x.id === 'emp_4')!.reportingToId = 'emp_2';
    expect(ancestorsOf(buildTree(moved, [], { showExited: false }), 'emp_7')).toEqual(['emp_2', 'emp_4']);
  });

  test('layout: no overlaps, parents centred over their team, big teams in a grid, collapsed teams hidden', () => {
    const t = buildTree(db.employees, vac, { showExited: false });
    const l = layoutTree(t.roots, new Set());
    expect(l.boxes.length).toBe(1 + 9 + 1 + 1); // Rohit, 7 reports, 2 roles; Arvind, 1 role
    for (let i = 0; i < l.boxes.length; i++) for (let j = i + 1; j < l.boxes.length; j++) {
      const a = l.boxes[i]!; const b = l.boxes[j]!;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `${a.key} overlaps ${b.key}`).toBe(false);
    }
    const rohit = l.boxes.find((b) => b.key === 'p:emp_4')!;
    const kidKeys = new Set([...t.byId.get('emp_4')!.children.map((c) => `p:${c.emp.id}`), 'v:vac_1', 'v:vac_2']);
    const kids = l.boxes.filter((b) => kidKeys.has(b.key));
    expect(kids).toHaveLength(9);
    const left = Math.min(...kids.map((k) => k.x)); const right = Math.max(...kids.map((k) => k.x + k.w));
    expect(rohit.x + rohit.w / 2).toBeCloseTo((left + right) / 2, 0);
    expect(new Set(kids.map((k) => k.x)).size).toBe(gridColumns(9)); // three columns
    expect(l.width).toBeGreaterThan(BOX.w * 3);
    expect(l.boxes.every((b) => b.x >= 0 && b.y >= 0)).toBe(true);
    const collapsed = layoutTree(t.roots, new Set(['emp_4']));
    expect(collapsed.boxes.map((b) => b.key).sort()).toEqual(['p:emp_2', 'p:emp_4', 'v:vac_3']);
    expect(new Set(l.edges.map((e) => e.key)).size).toBe(l.edges.length);
    // a manager with three reports gets the plain row, with the manager centred above
    const row = layoutTree(buildTree([person('m'), person('x', 'm'), person('y', 'm'), person('z', 'm')], [], { showExited: false }).roots, new Set());
    const m = row.boxes.find((b) => b.key === 'p:m')!;
    expect(row.boxes.filter((b) => b.key !== 'p:m').every((b) => b.y === BOX.h + BOX.gapY)).toBe(true);
    expect(m.x).toBe(row.boxes.find((b) => b.key === 'p:y')!.x);
  });

  test('the CSV has one row per person shown, with the manager name and level', () => {
    const t = buildTree(db.employees, vac, { showExited: false });
    const rows = orgRows(db, t);
    expect(CSV_HEADER).toEqual(['Employee ID', 'Name', 'Designation', 'Department', 'Location', 'Reports to', 'Status', 'Level', 'Direct reports', 'Joined']);
    expect(rows).toHaveLength(24);
    const pooja = rows.find((r) => r[1] === 'Pooja Verma')!;
    expect(pooja[5]).toBe('Rohit Chauhan');
    expect(pooja[7]).toBe(2);
    expect(rows.find((r) => r[1] === 'Rohit Chauhan')![8]).toBe(7);
    expect(rows.every((r) => r.length === CSV_HEADER.length)).toBe(true);
  });
});

// ═════════════════════════════ browser: HR assistant ═════════════════════════════
async function openAssistant(page: Page, path = '/dashboard/hrms/assistant') {
  await openHrms(page, path);
  await expect(page.getByRole('heading', { name: 'HR assistant', level: 1 })).toBeVisible(slow);
}
async function send(page: Page, text: string) {
  const before = await page.getByTestId('msg-bot').count();
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('msg-bot')).toHaveCount(before + 1);
  return page.getByTestId('msg-bot').last();
}

test.describe('assistant page', () => {
  test('renders with the simulation banner, the seeded chat and the three tabs, without errors', async ({ page }) => {
    const errors = watchErrors(page);
    await openAssistant(page);
    await expect(page.getByTestId('assistant-simulation')).toContainText('simulation');
    await expect(page.getByTestId('assistant-simulation')).toContainText('no AI model');
    for (const name of ['WhatsApp', 'Voice (Indian languages)', 'Ask Kinematic (MCP)']) await expect(page.getByRole('tab', { name })).toBeVisible();
    await expect(page.getByTestId('chat-persona')).toHaveValue('emp_7');
    await expect(page.getByTestId('msg-user').first()).toContainText('Mera leave balance kitna hai?');
    await expect(page.getByTestId('msg-bot').last()).toContainText('Casual Leave (CL)');
    await expect(page.getByTestId('audit-line').first()).toContainText('Pooja Verma (employee)');
    await expect(page.getByTestId('chat-status')).toContainText('Simulation');
    expect(errors).toEqual([]);
  });

  test('asking in Hinglish shows a typing indicator, then the answer, the records it read and an audit line', async ({ page }) => {
    await openAssistant(page);
    const audits = await page.getByTestId('audit-line').count();
    await page.getByTestId('chat-input').fill('meri salary kitni aayi');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('typing')).toBeVisible();
    await expect(page.getByTestId('typing')).toBeHidden();
    const { slip } = releasedSlips(db, 'emp_7')[0]!;
    await expect(page.getByTestId('msg-bot').last()).toContainText(`Net pay: ${inr(slip.net)}`);
    await expect(page.getByTestId('used-data')).toContainText('Payslip summary');
    await expect(page.getByTestId('used-chip').first()).toBeVisible();
    await expect(page.getByTestId('audit-line')).toHaveCount(audits + 1);
    await expect(page.getByTestId('audit-line').first()).toContainText('Payslip summary · answered · read 3 records');
  });

  test('apply leave end to end: prefill, Confirm records a pending request, the manager then sees it, and it survives a reload', async ({ page }) => {
    await openAssistant(page);
    const reply = await send(page, 'Apply leave on 12 Nov');
    await expect(reply).toContainText('Here is the request I prepared');
    await expect(reply).toContainText('Thu 12 Nov 2026');
    await page.getByTestId('action-confirm_leave').click();
    await expect(page.getByTestId('msg-bot').last()).toContainText('I recorded your Casual Leave request');
    await expect(page.getByTestId('action-confirm_leave')).toHaveCount(0);
    const store = await readStore<{ leaveRequests: AssistLeaveRequest[] }>(page, AREA('assist'));
    const mine = store.leaveRequests.filter((r) => r.employeeId === 'emp_7');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ from: '2026-11-12', to: '2026-11-12', days: 1, status: 'pending', leaveCode: 'CL', via: 'whatsapp' });
    // core balances are untouched
    const core = await readDb(page);
    expect(core.employees.find((e) => e.id === 'emp_7')!.history.some((h) => h.field.includes('Leave'))).toBe(false);
    // the manager sees it, and the balance answer shows it as pending
    await page.getByTestId('chat-persona').selectOption('emp_4');
    const team = await send(page, 'Who is on leave in my team?');
    await expect(team).toContainText('Pooja Verma: CL, Thu 12 Nov 2026 (1 day, pending)');
    await page.getByTestId('chat-persona').selectOption('emp_7');
    const bal = await send(page, 'casual leave balance');
    await expect(bal).toContainText('1 day pending approval');
    await page.reload();
    await expect(page.getByTestId('chat-persona')).toHaveValue('emp_7');
    await expect(page.getByTestId('msg-bot').filter({ hasText: 'I recorded your Casual Leave request' })).toHaveCount(1);
    const after = await readStore<{ leaveRequests: AssistLeaveRequest[] }>(page, AREA('assist'));
    expect(after.leaveRequests.filter((r) => r.employeeId === 'emp_7')).toHaveLength(1);
  });

  test('quick replies continue the conversation, and "Not now" dismisses a prepared request', async ({ page }) => {
    await openAssistant(page);
    await page.getByTestId('quick-replies').getByRole('button', { name: 'Apply leave on 12 Nov' }).click();
    await expect(page.getByTestId('msg-bot').last()).toContainText('Here is the request I prepared');
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByTestId('action-confirm_leave')).toHaveCount(0);
    const none = await readStore<{ leaveRequests: AssistLeaveRequest[] }>(page, AREA('assist'));
    expect(none.leaveRequests.some((r) => r.employeeId === 'emp_7')).toBe(false);
    // no dates: it asks, and the next short reply is read as the dates
    await send(page, 'apply leave');
    await expect(page.getByTestId('msg-bot').last()).toContainText('Which day or days');
    const cont = await send(page, 'Monday');
    await expect(cont).toContainText('Mon 9 Nov 2026');
  });

  test('roles are enforced in the chat: a manager is refused another person\'s salary, with the reason', async ({ page }) => {
    await openAssistant(page);
    await page.getByTestId('chat-persona').selectOption('emp_4');
    await expect(page.getByText('Manager: your own data, plus leave and attendance of your direct reports. Never their pay.')).toBeVisible();
    const r = await send(page, 'Pooja ki salary kitni hai');
    await expect(r).toContainText('Salary of other people is not shared with managers.');
    await expect(page.getByText('Outside your role')).toBeVisible();
    await expect(page.getByTestId('used-data')).toContainText('Refused');
    await expect(page.getByTestId('used-data')).toContainText('Why it was refused');
    const ok = await send(page, 'Pooja ka leave balance');
    await expect(ok).toContainText('Pooja Verma\'s leave balance');
    await page.getByTestId('chat-persona').selectOption('emp_7');
    const emp7 = await send(page, 'Rohit ka leave balance');
    await expect(emp7).toContainText('You can only ask about your own HR data.');
  });

  test('HR can read a payslip, and the read is written to the access log', async ({ page }) => {
    await openAssistant(page);
    await page.getByTestId('chat-persona').selectOption('emp_18');
    const r = await send(page, 'Pooja ka last payslip');
    const { slip } = releasedSlips(db, 'emp_7')[0]!;
    await expect(r).toContainText(`Net pay: ${inr(slip.net)}`);
    const core = await readDb(page);
    expect(core.accessLog.some((a) => a.employeeId === 'emp_7' && a.field === 'Payslip summary')).toBe(true);
  });

  test('unknown questions get an honest answer, and Download payslip gives a plain-text file', async ({ page }) => {
    await openAssistant(page);
    const r = await send(page, 'what is the meaning of life');
    await expect(r).toContainText("I don't know that yet");
    await expect(page.getByTestId('used-data')).toContainText('No records were read');
    await send(page, 'download my payslip');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download payslip (text)' }).click()]);
    expect(dl.suggestedFilename()).toBe('payslip-2026-10-pooja-verma.txt');
    await expect(page.getByRole('link', { name: 'Open payslip page' })).toBeVisible();
  });

  test('message templates are filled for the selected person and can be previewed in the chat', async ({ page }) => {
    await openAssistant(page);
    await expect(page.getByTestId('template-payslip_ready')).toContainText('Hi Pooja');
    await expect(page.getByTestId('template-leave_approved')).toBeVisible();
    await expect(page.getByTestId('template-document_pending')).toBeVisible();
    await page.getByTestId('chat-persona').selectOption('emp_4');
    await expect(page.getByTestId('template-payslip_ready')).toContainText('Hi Rohit');
    await page.getByTestId('template-payslip_ready').getByRole('button', { name: 'Preview in chat' }).click();
    await expect(page.getByText('Template sample, not sent:')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Template sample, not sent:')).toBeVisible();
  });

  test('conversations are kept per person, and Clear starts again with a typing indicator and a greeting', async ({ page }) => {
    await openAssistant(page);
    await send(page, 'thanks');
    await page.getByTestId('chat-persona').selectOption('emp_4');
    await expect(page.getByTestId('msg-user').first()).toContainText('Who is on leave in my team?');
    await expect(page.getByTestId('msg-user').filter({ hasText: 'thanks' })).toHaveCount(0);
    await page.getByTestId('chat-persona').selectOption('emp_7');
    await expect(page.getByTestId('msg-user').filter({ hasText: 'thanks' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear this chat' }).click();
    await expect(page.getByTestId('typing')).toBeVisible();
    await expect(page.getByTestId('msg-bot')).toHaveCount(1);
    await expect(page.getByTestId('msg-bot').first()).toContainText('I am the Kinematic HR assistant');
    await expect(page.getByTestId('msg-user')).toHaveCount(0);
  });

  test('voice tab: six languages, a simulation label, Play sample runs the engine, and the result survives a reload', async ({ page }) => {
    await openAssistant(page, '/dashboard/hrms/assistant?tab=voice');
    await expect(page.getByTestId('voice-simulation')).toContainText('No microphone is used');
    await expect(page.getByTestId('voice-simulation')).toContainText('Nothing is recorded');
    for (const l of VOICE_LANGUAGES) await expect(page.getByTestId(`voice-card-${l.id}`)).toContainText(l.utterances[0]!.script);
    await expect(page.getByTestId('voice-card-hi')).toContainText('Meri kitni chhuttiyan bachi hain?');
    await expect(page.getByTestId('voice-card-hi')).toContainText('How many leaves do I have left?');
    await expect(page.getByRole('button', { name: /^Play sample/ })).toHaveCount(18);
    await expect(page.getByTestId('voice-result')).toHaveCount(0);
    await page.getByTestId('play-ta-1').click();
    await expect(page.getByTestId('voice-result')).toContainText('என் சம்பளம் எப்போது வரும்?');
    await expect(page.getByTestId('voice-intent')).toContainText('Salary date');
    await expect(page.getByTestId('voice-answer')).toContainText('30 Oct 2026');
    await page.reload();
    await expect(page.getByTestId('voice-intent')).toContainText('Salary date');
    await page.getByTestId('play-hi-0').click();
    await expect(page.getByTestId('voice-answer')).toContainText('Casual Leave (CL)');
    await expect(page.getByRole('row', { name: /Sample only/ })).toHaveCount(6);
    await expect(page.getByText('Not yet reviewed by a native speaker').first()).toBeVisible();
  });

  test('MCP tab: labelled as a design preview, tools with schemas and working copy buttons, scopes, never-exposed list', async ({ page }) => {
    await openAssistant(page, '/dashboard/hrms/assistant?tab=mcp');
    await expect(page.getByTestId('mcp-preview')).toContainText('not a live MCP server');
    for (const t of MCP_TOOLS) await expect(page.getByTestId(`mcp-tool-${t.name}`)).toContainText(t.name);
    await expect(page.getByTestId('mcp-tool-get_leave_balance')).toContainText('"employee_id"');
    const copy = page.getByRole('button', { name: 'Copy the input schema of get_policy' });
    await copy.click();
    await expect(copy).toHaveText('Copied');
    await expect(page.getByTestId('mcp-scopes')).toContainText('leave:read:reports');
    await expect(page.getByTestId('mcp-scopes').getByText('Not allowed')).toHaveCount(1);
    await expect(page.getByTestId('mcp-never')).toContainText('Full Aadhaar');
    await expect(page.getByTestId('mcp-never')).toContainText("Other people's pay");
    await expect(page.getByTestId('mcp-log').getByRole('row')).toHaveCount(1 + seedMcpLog().length);
  });

  test('MCP tab: Try a tool runs the engine locally, shows the JSON, and logs the call, including denials', async ({ page }) => {
    await openAssistant(page, '/dashboard/hrms/assistant?tab=mcp');
    const rows = () => page.getByTestId('mcp-log').getByRole('row');
    await page.getByTestId('mcp-run').click();
    await expect(page.getByTestId('mcp-result')).toContainText('"isError": false');
    await expect(page.getByTestId('mcp-result')).toContainText('Casual Leave (CL)');
    await expect(rows()).toHaveCount(2 + seedMcpLog().length);
    // another person's pay is denied, and the denial is logged: for an employee, then for HR (who cannot read it over MCP either)
    await page.getByTestId('mcp-tool').selectOption('get_payslip_summary');
    await page.getByTestId('mcp-args').fill('{"employee_id":"emp_4"}');
    await page.getByTestId('mcp-run').click();
    await expect(page.getByTestId('mcp-result')).toContainText('"isError": true');
    await expect(page.getByTestId('mcp-result')).toContainText('You can only ask about your own HR data.');
    await expect(rows().nth(1)).toContainText('Denied');
    await page.getByLabel('On behalf of').selectOption('emp_18');
    await page.getByTestId('mcp-args').fill('{"employee_id":"emp_4"}');
    await page.getByTestId('mcp-run').click();
    await expect(page.getByTestId('mcp-result')).toContainText('never exposed through MCP');
    await expect(rows().nth(1)).toContainText('Tanvi Kapoor (hr)');
    await page.getByLabel('On behalf of').selectOption('emp_7');
    // bad JSON and bad arguments are explained, not thrown
    await page.getByTestId('mcp-args').fill('{"employee_id":');
    await page.getByTestId('mcp-run').click();
    await expect(page.getByText('The arguments are not valid JSON')).toBeVisible();
    await page.getByTestId('mcp-args').fill('{"month":"october"}');
    await page.getByTestId('mcp-run').click();
    await expect(page.getByTestId('mcp-result')).toContainText('invalid_params');
    // a role without the scope
    await page.getByTestId('mcp-tool').selectOption('list_team_leave');
    await page.getByTestId('mcp-run').click();
    await expect(page.getByTestId('mcp-result')).toContainText('needs the manager or HR scope');
    await page.reload();
    await expect(rows().first()).toBeVisible();
    const store = await readStore<{ mcpLog: unknown[] }>(page, AREA('assist'));
    expect(store.mcpLog.length).toBe(seedMcpLog().length + 5);
  });

  test('no sideways scroll at phone width on any tab', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAssistant(page);
    await expect(page.getByTestId('phone')).toBeVisible();
    await noSideScroll(page, 'assistant whatsapp');
    await page.getByTestId('chat-input').fill('apply leave on 12 nov');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('action-confirm_leave')).toBeVisible();
    await noSideScroll(page, 'assistant whatsapp with a request');
    await page.getByRole('tab', { name: 'Voice (Indian languages)' }).click();
    await page.getByTestId('play-bn-0').click();
    await expect(page.getByTestId('voice-result')).toBeVisible();
    await noSideScroll(page, 'assistant voice');
    await page.getByRole('tab', { name: 'Ask Kinematic (MCP)' }).click();
    await page.getByTestId('mcp-run').click();
    await noSideScroll(page, 'assistant mcp');
  });
});

// ═════════════════════════════ browser: policies and POSH ═════════════════════════════
async function openPolicies(page: Page, path = '/dashboard/hrms/policies') {
  await openHrms(page, path);
  await expect(page.getByRole('heading', { name: 'Policies & POSH', level: 1 })).toBeVisible(slow);
}
const seedPolicyList = seedPolicies();
const seedAckList = seedAcks(seedPolicyList, db.employees);
const pendingTotal = (acks = seedAckList, policies = seedPolicyList) => policies.reduce((n, p) => n + ackSummary(ackRows(db, p, acks, [], PREVIEW_TODAY)).pending, 0);

test.describe('policies page', () => {
  test('the library shows eight policies with versions, text and rate bars, without errors', async ({ page }) => {
    const errors = watchErrors(page);
    await openPolicies(page);
    await expect(page.getByTestId('stat-policies')).toHaveText('8');
    await expect(page.getByTestId('stat-pending')).toHaveText(String(pendingTotal()));
    for (const p of seedPolicyList) await expect(page.getByTestId(`policy-card-${p.id}`)).toContainText(p.title);
    await expect(page.getByTestId('policy-detail')).toContainText('Leave');
    await expect(page.getByTestId('policy-version')).toHaveText('Current v2.1');
    await expect(page.getByTestId('policy-text')).toContainText('Casual leave: 8 days a year');
    await expect(page.getByTestId('version-history').getByRole('listitem')).toHaveCount(3);
    await page.getByTestId('policy-card-pol_posh').click();
    await expect(page.getByTestId('policy-detail')).toContainText('Prevention of sexual harassment') ;
    await expect(page.getByRole('region', { name: 'Legal references' })).toContainText('10 or more employees');
    await expect(page.getByRole('region', { name: 'Legal references' }).getByText('Reported, confirm')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Legal references' })).toContainText('Confirm them with your advisor');
    // old text can be viewed
    await page.getByTestId('version-1.0').getByRole('button', { name: 'View this text' }).click();
    await expect(page.getByTestId('policy-text')).toContainText('Write to the Internal Committee (IC) or tell any IC member');
    expect(errors).toEqual([]);
  });

  test('a policy can be opened from a link: ?policy=pol_travel', async ({ page }) => {
    await openPolicies(page, '/dashboard/hrms/policies?policy=pol_travel');
    await expect(page.getByTestId('policy-detail').getByRole('heading', { name: 'Travel & expense', level: 2 })).toBeVisible();
    await expect(page.getByTestId('policy-version')).toHaveText('Current v2.1');
  });

  test('publishing a new version: validation first, then a new version that resets acknowledgements, and it survives a reload', async ({ page }) => {
    await openPolicies(page);
    await page.getByTestId('policy-card-pol_travel').click();
    await page.getByTestId('publish-open').click();
    const dialog = page.getByRole('dialog', { name: 'Publish a new version of Travel & expense' });
    await expect(dialog).toBeVisible();
    await page.getByTestId('publish-confirm').click();
    await expect(dialog.getByText('Say what changed')).toBeVisible();
    await expect(dialog.getByText('The text is the same as the current version')).toBeVisible();
    await expect(dialog).toBeVisible();
    await page.getByTestId('pub-summary').fill('Meals limit raised to cover dinner.');
    const text = page.getByTestId('pub-text');
    await text.fill(`${await text.inputValue()}\n- Dinner is covered up to the daily limit when you stay overnight.`);
    await expect(dialog).toContainText('1 added');
    await dialog.getByRole('button', { name: 'Show the changes' }).click();
    await expect(page.getByTestId('publish-diff')).toContainText('Dinner is covered');
    await page.getByTestId('publish-confirm').click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('policy-version')).toHaveText('Current v2.2');
    await expect(page.getByTestId('policy-text')).toContainText('Dinner is covered');
    await expect(page.getByTestId('version-history').getByRole('listitem')).toHaveCount(4);
    await expect(page.getByTestId('policy-card-pol_travel')).toContainText('v2.2');
    await expect(page.getByTestId('policy-card-pol_travel')).toContainText('0%');
    const travelBefore = ackSummary(ackRows(db, seedPolicyList[1]!, seedAckList, [], PREVIEW_TODAY)).pending;
    await expect(page.getByTestId('stat-pending')).toHaveText(String(pendingTotal() - travelBefore + 22));
    await page.reload();
    await expect(page.getByTestId('policy-card-pol_travel')).toContainText('v2.2');
    await expect(page.getByTestId('policy-card-pol_travel')).toContainText('0%');
    await expect(page.getByTestId('stat-pending')).toHaveText(String(pendingTotal() - travelBefore + 22));
  });

  test('a version that needs no acknowledgement leaves earlier acknowledgements alone', async ({ page }) => {
    await openPolicies(page);
    await page.getByTestId('policy-card-pol_leave').click();
    await page.getByTestId('publish-open').click();
    await page.getByTestId('pub-summary').fill('Typo fixed in the casual leave line.');
    await page.getByTestId('pub-ack').uncheck();
    const text = page.getByTestId('pub-text');
    await text.fill((await text.inputValue()).replace('It does not carry forward.', 'It does not carry forward to the next year.'));
    await page.getByTestId('publish-confirm').click();
    await expect(page.getByTestId('policy-version')).toHaveText('Current v2.2');
    await expect(page.getByTestId('policy-card-pol_leave')).toContainText('No acknowledgement needed');
    await expect(page.getByTestId('stat-pending')).toHaveText(String(pendingTotal() - 1));
  });

  test('acknowledgements: rate per policy, reminders are logged and not sent, and "Mark as read" lowers the pending count', async ({ page }) => {
    await openPolicies(page, '/dashboard/hrms/policies?tab=acknowledgements');
    await expect(page.getByTestId('ack-tab')).toBeVisible();
    for (const p of seedPolicyList) await expect(page.getByRole('row', { name: new RegExp(`^${p.title.replace(/[/&]/g, '.')}`) }).first()).toBeVisible();
    const travel = seedPolicyList[1]!;
    const sum = ackSummary(ackRows(db, travel, seedAckList, [], PREVIEW_TODAY));
    await expect(page.getByRole('row', { name: /^Travel & expense/ })).toContainText(`${sum.acknowledged}/${sum.acknowledged + sum.pending}`);
    await expect(page.getByRole('row', { name: /^Remote \/ field work/ })).toContainText('Not required');
    await expect(page.getByTestId('remind-all-pol_remote')).toBeDisabled();
    await expect(page.getByTestId('remind-all-pol_conduct')).toBeDisabled();
    // remind everyone pending on travel
    await expect(page.getByTestId('reminder-log').getByRole('listitem')).toHaveCount(3);
    await page.getByTestId('remind-all-pol_travel').click();
    await expect(page.getByTestId('reminder-log').getByRole('listitem')).toHaveCount(6);
    await expect(page.getByTestId('reminder-log').getByRole('listitem').first()).toContainText('logged, not sent');
    let store = await readStore<{ reminders: unknown[] }>(page, AREA('policies'));
    expect(store.reminders).toHaveLength(3 + sum.pending);
    // mark one person as having read it
    await page.getByLabel('Policy', { exact: true }).selectOption('pol_travel');
    const pendingRow = ackRows(db, travel, seedAckList, [], PREVIEW_TODAY).find((r) => r.status === 'pending')!;
    await expect(page.getByTestId('ack-people')).toContainText(pendingRow.employee.firstName);
    await page.getByTestId(`ack-${pendingRow.employee.id}`).click();
    await expect(page.getByTestId(`ack-${pendingRow.employee.id}`)).toHaveCount(0);
    await expect(page.getByRole('row', { name: /^Travel & expense/ })).toContainText(`${sum.acknowledged + 1}/${sum.acknowledged + sum.pending}`);
    await expect(page.getByTestId('stat-pending')).toHaveText(String(pendingTotal() - 1));
    await page.reload();
    await expect(page.getByRole('row', { name: /^Travel & expense/ })).toContainText(`${sum.acknowledged + 1}/${sum.acknowledged + sum.pending}`);
    store = await readStore<{ reminders: unknown[] }>(page, AREA('policies'));
    expect(store.reminders).toHaveLength(3 + sum.pending);
  });

  test('acknowledgements by person: every policy that applies, and a single reminder', async ({ page }) => {
    await openPolicies(page, '/dashboard/hrms/policies?tab=acknowledgements');
    await page.getByRole('tab', { name: 'By person' }).click();
    await page.getByLabel('Person', { exact: true }).selectOption('emp_7');
    const view = page.getByTestId('ack-person-view');
    await expect(view.getByRole('row')).toHaveCount(1 + personView(db, seedPolicyList, seedAckList, [], 'emp_7', PREVIEW_TODAY).length);
    await expect(view).toContainText('Incentive plan');
    const pending = personView(db, seedPolicyList, seedAckList, [], 'emp_7', PREVIEW_TODAY).find((x) => x.row.status === 'pending')!;
    await expect(view.getByRole('row', { name: new RegExp(pending.policy.title.replace(/[/&]/g, '.')) })).toContainText('Pending');
    await view.getByRole('button', { name: `Send a reminder for ${pending.policy.title}` }).click();
    await expect(page.getByTestId('reminder-log').getByRole('listitem').first()).toContainText('Pooja Verma');
    await expect(page.getByTestId('reminder-log').getByRole('listitem').first()).toContainText(`${pending.policy.title} v${pending.version.version}`);
    // marking it read takes it off her pending list
    await view.getByRole('button', { name: `Record acknowledgement of ${pending.policy.title}` }).click();
    await expect(view.getByRole('row', { name: new RegExp(pending.policy.title.replace(/[/&]/g, '.')) })).toContainText('Acknowledged');
  });

  test('compare versions: a line diff with added and removed lines, a changed-only toggle, and a link from the history', async ({ page }) => {
    await openPolicies(page, '/dashboard/hrms/policies?tab=diff');
    await expect(page.getByTestId('diff-added')).toHaveText('2');
    await expect(page.getByTestId('diff-removed')).toHaveText('2');
    const view = page.getByTestId('diff-view');
    await expect(view.locator('[data-diff="add"]')).toHaveCount(2);
    await expect(view.locator('[data-diff="del"]')).toHaveCount(2);
    await expect(view.locator('[data-diff="del"]').first()).toContainText('Sick leave: 6 days a year');
    await expect(view.locator('[data-diff="add"]').first()).toContainText('Sick leave: 8 days a year');
    await expect(view.locator('[data-diff="same"]').first()).toBeVisible();
    await page.getByLabel('Show changed lines only').check();
    await expect(view.locator('[data-diff="same"]')).toHaveCount(0);
    await page.getByLabel('From version').selectOption('1.0');
    await expect(page.getByTestId('diff-added')).not.toHaveText('2');
    await page.getByLabel('To version').selectOption('1.0');
    await expect(page.getByText('Pick two different versions')).toBeVisible();
    // from the library history
    await page.getByRole('tab', { name: 'Library' }).click();
    await page.getByTestId('policy-card-pol_it').click();
    await page.getByRole('button', { name: 'Compare v1.2 with v2.0' }).click();
    await expect(page.getByRole('tab', { name: 'Compare versions', selected: true })).toBeVisible();
    await expect(page.getByLabel('Policy', { exact: true })).toHaveValue('pol_it');
    await expect(view.locator('[data-diff="add"]').first()).toContainText('public AI tools');
    await expect(page.getByText('No customer or employee data in public AI tools')).toBeVisible();
  });

  test('POSH: committee checks, anonymised register with every confidential field withheld, and the annual report numbers', async ({ page }) => {
    await openPolicies(page, '/dashboard/hrms/policies?tab=posh');
    await expect(page.getByTestId('ic-requirement')).toContainText('10 or more employees');
    await expect(page.getByTestId('ic-requirement')).toContainText('Meridian has 22');
    await expect(page.getByTestId('ic-members')).toContainText('Presiding officer');
    await expect(page.getByTestId('ic-members')).toContainText('Ritu Malhotra');
    await expect(page.getByTestId('ic-members')).toContainText('External member');
    await expect(page.getByTestId('ic-checks').getByText('OK')).toHaveCount(6);
    await expect(page.getByText('Reported, confirm').first()).toBeVisible();
    await expect(page.getByText('Advisor note')).toBeVisible();
    const reg = page.getByTestId('posh-register');
    for (const id of ['POSH-2026-001', 'POSH-2026-002', 'POSH-2026-003', 'POSH-2026-004']) await expect(reg).toContainText(id);
    await expect(reg.getByText('Withheld')).toHaveCount(4);
    const regText = (await reg.innerText());
    for (const e of db.employees) expect(regText, `register must not mention ${e.firstName}`).not.toContain(e.firstName);
    await expect(page.getByText('visible only to Internal Committee members').first()).toBeVisible();
    await expect(page.getByTestId('posh-count-received')).toHaveText('1');
    await expect(page.getByTestId('posh-count-inquiry')).toHaveText('1');
    await expect(page.getByTestId('posh-count-closed')).toHaveText('2');
    await expect(page.getByTestId('posh-report-filed')).toHaveText('4');
    await expect(page.getByTestId('posh-report-disposed')).toHaveText('2');
    await expect(page.getByTestId('posh-report-pending')).toHaveText('2');
    await expect(page.getByTestId('posh-report-sessions')).toHaveText('2');
    await expect(page.getByTestId('posh-trained')).toHaveText('18');
    await expect(page.getByTestId('posh-pending')).toContainText('Gaurav Saxena');
    await expect(page.getByTestId('posh-pending').getByRole('listitem')).toHaveCount(4);
  });

  test('POSH: log a case (category only), move it on, record a session; everything survives a reload', async ({ page }) => {
    await openPolicies(page, '/dashboard/hrms/policies?tab=posh');
    await page.getByTestId('posh-log-open').click();
    await expect(page.getByRole('dialog', { name: 'Log a case in the register' })).toContainText('Only the category and the date are recorded');
    await page.getByLabel('Nature of the complaint').selectOption('physical');
    await page.getByTestId('posh-log-save').click();
    const reg = page.getByTestId('posh-register');
    await expect(reg).toContainText('POSH-2026-005');
    await expect(reg.getByRole('row', { name: /POSH-2026-005/ })).toContainText('Physical conduct');
    await expect(page.getByTestId('posh-count-received')).toHaveText('2');
    await expect(page.getByTestId('posh-report-filed')).toHaveText('5');
    await page.getByRole('button', { name: 'Move POSH-2026-005 to the next stage' }).click();
    await expect(reg.getByRole('row', { name: /POSH-2026-005/ })).toContainText('Under inquiry');
    await expect(page.getByTestId('posh-count-received')).toHaveText('1');
    // record the missing awareness session
    await page.getByTestId('posh-session-open').click();
    const dialog = page.getByRole('dialog', { name: 'Record an awareness session' });
    await expect(dialog).toContainText('4 picked');
    await dialog.getByLabel('Gaurav Saxena').uncheck();
    await expect(dialog).toContainText('3 picked');
    await page.getByTestId('posh-session-save').click();
    await expect(page.getByTestId('posh-trained')).toHaveText('21');
    await expect(page.getByTestId('posh-pending').getByRole('listitem')).toHaveCount(1);
    await expect(page.getByTestId('posh-report-sessions')).toHaveText('3');
    await page.reload();
    await expect(page.getByTestId('posh-register')).toContainText('POSH-2026-005');
    await expect(page.getByTestId('posh-trained')).toHaveText('21');
    await expect(page.getByTestId('posh-report-sessions')).toHaveText('3');
  });

  test('no sideways scroll at phone width on any tab', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const tab of ['library', 'acknowledgements', 'diff', 'posh']) {
      await openPolicies(page, `/dashboard/hrms/policies?tab=${tab}`);
      await expect(page.getByRole('tabpanel')).toBeVisible();
      await noSideScroll(page, `policies ${tab}`);
    }
    await openPolicies(page, '/dashboard/hrms/policies?tab=library');
    await page.getByTestId('publish-open').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const box = await page.getByRole('dialog').boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
  });
});

// ═════════════════════════════ browser: org chart ═════════════════════════════
async function openOrg(page: Page) {
  await openHrms(page, '/dashboard/hrms/org-chart');
  await expect(page.getByRole('heading', { name: 'Org chart', level: 1 })).toBeVisible(slow);
  await expect(page.getByTestId('org-node-emp_4')).toBeVisible(slow);
}
const transform = (page: Page) => page.getByTestId('org-canvas').evaluate((el) => (el as HTMLElement).style.transform);

test.describe('org chart page', () => {
  test('renders the chart from the employee records with stats, legend, open roles and unplaced people, without errors', async ({ page }) => {
    const errors = watchErrors(page);
    await openOrg(page);
    await expect(page.getByTestId('stat-people')).toHaveText('24');
    await expect(page.getByTestId('stat-managers')).toHaveText('1');
    await expect(page.getByTestId('stat-span')).toHaveText('7');
    await expect(page.getByTestId('stat-maxspan')).toHaveText('7');
    await expect(page.getByTestId('stat-levels')).toHaveText('2');
    await expect(page.getByTestId('stat-nomanager')).toHaveText('17');
    await expect(page.getByTestId('org-node-emp_7')).toContainText('Pooja Verma');
    await expect(page.getByTestId('org-node-emp_7')).toContainText('Field Executive');
    await expect(page.getByTestId('org-node-emp_7')).toContainText('New Delhi');
    await expect(page.getByTestId('org-node-emp_22')).toHaveAttribute('data-status', 'on_notice');
    await expect(page.getByTestId('org-node-emp_22')).toContainText('On notice');
    await expect(page.locator('[data-testid^="org-vacancy-"]')).toHaveCount(3);
    await expect(page.getByTestId('org-legend')).toContainText('Sales & Field');
    await expect(page.getByTestId('org-unplaced').getByRole('listitem')).toHaveCount(15);
    await expect(page.getByTestId('org-issues')).toContainText('Rohit Chauhan is recorded as reporting to themselves');
    await expect(page.getByTestId('org-node-emp_23')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('expand and collapse a team, and the state survives a reload', async ({ page }) => {
    await openOrg(page);
    const toggle = page.getByTestId('org-toggle-emp_4');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAccessibleName("Collapse Rohit Chauhan's team (7 people, 2 open)");
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('org-node-emp_7')).toHaveCount(0);
    await expect(page.locator('[data-testid^="org-vacancy-"]')).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId('org-node-emp_4')).toBeVisible(slow);
    await expect(page.getByTestId('org-node-emp_7')).toHaveCount(0);
    await page.getByTestId('org-expand-all').click();
    await expect(page.getByTestId('org-node-emp_7')).toBeVisible();
    await page.getByTestId('org-collapse-all').click();
    await expect(page.getByTestId('org-node-emp_7')).toHaveCount(0);
  });

  test('search highlights a person, opens the path to them, and finds people who are not in the chart yet', async ({ page }) => {
    await openOrg(page);
    await page.getByTestId('org-toggle-emp_4').click();
    await expect(page.getByTestId('org-node-emp_7')).toHaveCount(0);
    const box = page.getByRole('searchbox', { name: 'Search a person or role' });
    await box.fill('pooja');
    await expect(page.getByTestId('org-match-count')).toHaveText('1');
    await expect(page.getByTestId('org-node-emp_7')).toBeVisible(); // the path was opened
    await expect(page.getByTestId('org-node-emp_7')).toHaveAttribute('data-match', 'true');
    await expect(page.getByTestId('org-toggle-emp_4')).toHaveAttribute('aria-expanded', 'true');
    await box.fill('anita');
    await expect(page.getByTestId('org-match-count')).toHaveText('1');
    await expect(page.getByTestId('org-unplaced').locator('[data-match="true"]')).toContainText('Anita Desai');
    await box.fill('zzzz');
    await expect(page.getByTestId('org-match-count')).toHaveText('0');
  });

  test('zoom and pan with buttons and the keyboard', async ({ page }) => {
    await openOrg(page);
    await page.getByTestId('org-reset').click();
    await expect(page.getByTestId('org-zoom')).toHaveText('100%');
    const t0 = await transform(page);
    await page.getByTestId('org-zoom-in').click();
    await expect(page.getByTestId('org-zoom')).toHaveText('120%');
    await page.getByTestId('org-zoom-out').click();
    await page.getByTestId('org-zoom-out').click();
    await expect(page.getByTestId('org-zoom')).toHaveText('83%');
    await page.getByTestId('org-pan-right').click();
    expect(await transform(page)).not.toBe(t0);
    await page.getByTestId('org-fit').click();
    const fit = await page.getByTestId('org-zoom').innerText();
    expect(parseInt(fit, 10)).toBeGreaterThanOrEqual(55);
    // keyboard: focus the chart, then plus, minus, arrows and zero
    const vp = page.getByTestId('org-viewport');
    await vp.focus();
    await page.keyboard.press('0');
    const fitted = await transform(page);
    await page.keyboard.press('ArrowLeft');
    expect(await transform(page)).not.toBe(fitted);
    await page.getByTestId('org-reset').click();
    await vp.focus();
    await page.keyboard.press('=');
    await expect(page.getByTestId('org-zoom')).toHaveText('120%');
    await page.keyboard.press('-');
    await expect(page.getByTestId('org-zoom')).toHaveText('100%');
    for (const name of ['Zoom in', 'Zoom out', 'Fit the chart in view', 'Move the chart left', 'Move the chart up']) await expect(page.getByRole('button', { name })).toBeVisible();
    await expect(vp).toHaveAccessibleName(/arrow keys/);
  });

  test('Change manager: choose, confirm with before and after, the core record and change log are updated, the chart redraws', async ({ page }) => {
    await openOrg(page);
    await page.getByRole('button', { name: 'Fix the reporting line for Rohit Chauhan' }).click();
    const dialog = page.getByRole('dialog', { name: 'Change manager: Rohit Chauhan' });
    await expect(dialog).toContainText('reporting to themselves');
    await expect(page.getByTestId('mgr-continue')).toBeDisabled();
    await page.getByTestId('mgr-pick').selectOption('emp_2');
    await page.getByTestId('mgr-continue').click();
    await expect(page.getByRole('dialog', { name: 'Confirm the change' })).toBeVisible();
    await expect(page.getByTestId('mgr-before')).toContainText('reports to themselves (data mistake)');
    await expect(page.getByTestId('mgr-after')).toContainText('Rohit Chauhan reports to Arvind Nair');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByTestId('mgr-pick')).toHaveValue('emp_2');
    await page.getByTestId('mgr-continue').click();
    await page.getByTestId('mgr-confirm').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('org-issues')).toHaveCount(0);
    await expect(page.getByTestId('stat-levels')).toHaveText('3');
    await expect(page.getByTestId('stat-managers')).toHaveText('2');
    await expect(page.getByTestId('stat-nomanager')).toHaveText('16');
    await expect(page.getByTestId('org-detail')).toContainText('Arvind Nair');
    const core = await readDb(page);
    const rohit = core.employees.find((e) => e.id === 'emp_4') as Employee;
    expect(rohit.reportingToId).toBe('emp_2');
    expect(rohit.history[0]).toMatchObject({ field: 'Reports to', from: 'emp_4', to: 'emp_2' });
    // the Employees page shows it, by name
    await page.goto('/dashboard/hrms/employees/emp_4?tab=history');
    await expect(page.getByRole('row', { name: /Reports to/ })).toContainText('Arvind Nair');
    await page.goto('/dashboard/hrms/org-chart');
    await expect(page.getByTestId('org-node-emp_4')).toBeVisible(slow);
    await expect(page.getByTestId('stat-levels')).toHaveText('3');
  });

  test('cycles cannot be created: people below you are not offered, and the picker only lists valid managers', async ({ page }) => {
    await openOrg(page);
    await page.getByTestId('org-node-emp_4').click();
    await page.getByTestId('org-change-manager').click();
    const all = await page.getByTestId('mgr-pick').locator('option').allInnerTexts();
    expect(all[0]).toBe('Choose a manager'); // Rohit is recorded as his own manager, so nothing is pre-selected
    const options = all.slice(1);
    expect(options[0]).toBe('No manager (top of the chart)');
    for (const name of ['Pooja Verma', 'Imran Sheikh', 'Yash Rathore', 'Rohit Chauhan', 'Deepa Pillai']) expect(options.join('|'), name).not.toContain(name);
    expect(options.join('|')).toContain('Arvind Nair');
    await expect(page.getByRole('dialog')).toContainText('people who report to Rohit, directly or through others, are not listed');
    expect(options).toHaveLength(1 + validManagers(db.employees, 'emp_4').length);
    await page.getByTestId('mgr-pick').selectOption('emp_2');
    await page.getByTestId('mgr-continue').click();
    await page.getByTestId('mgr-confirm').click();
    // now Arvind sits above Rohit: Arvind cannot be placed under Rohit or anyone below him
    await page.getByTestId('org-node-emp_2').click();
    await page.getByTestId('org-change-manager').click();
    const arvind = (await page.getByTestId('mgr-pick').locator('option').allInnerTexts()).join('|');
    for (const name of ['Rohit Chauhan', 'Pooja Verma', 'Farhan Ali', 'Arvind Nair']) expect(arvind, name).not.toContain(name);
    expect(arvind).toContain('Ritu Malhotra');
    await page.getByRole('button', { name: 'Cancel' }).click();
    const core = await readDb(page);
    expect(core.employees.find((e) => e.id === 'emp_2')!.reportingToId).toBeUndefined();
  });

  test('someone with no manager can be placed from the list under the chart, and they join the chart', async ({ page }) => {
    await openOrg(page);
    await page.getByTestId('org-set-emp_11').click();
    await page.getByTestId('mgr-pick').selectOption('emp_2');
    await page.getByTestId('mgr-continue').click();
    await expect(page.getByTestId('mgr-before')).toContainText('No manager (top of the chart)');
    await page.getByTestId('mgr-confirm').click();
    await expect(page.getByTestId('org-unplaced').getByRole('listitem')).toHaveCount(14);
    await expect(page.getByTestId('org-node-emp_11')).toBeVisible();
    await expect(page.getByTestId('stat-managers')).toHaveText('2');
    await expect(page.getByTestId('stat-nomanager')).toHaveText('16');
    await page.reload();
    await expect(page.getByTestId('org-node-emp_11')).toBeVisible(slow);
    const core = await readDb(page);
    expect(core.employees.find((e) => e.id === 'emp_11')!.reportingToId).toBe('emp_2');
  });

  test('open roles: add one under a manager, it is drawn dashed, remove it, and it all survives a reload', async ({ page }) => {
    await openOrg(page);
    await page.getByTestId('vac-open').click();
    await page.getByTestId('vac-save').click();
    await expect(page.getByText('Give the role a title')).toBeVisible();
    await page.getByTestId('vac-title').fill('Store Manager');
    await page.getByLabel('Reports to').selectOption('emp_2');
    await page.getByTestId('vac-save').click();
    await expect(page.locator('[data-testid^="org-vacancy-"]')).toHaveCount(4);
    await expect(page.getByTestId('org-canvas').getByText('Store Manager')).toBeVisible();
    await expect(page.getByTestId('stat-nomanager')).toHaveText('17');
    await page.reload();
    await expect(page.locator('[data-testid^="org-vacancy-"]')).toHaveCount(4);
    await page.getByRole('button', { name: 'Remove open role Store Manager' }).click();
    await expect(page.locator('[data-testid^="org-vacancy-"]')).toHaveCount(3);
    await page.getByRole('button', { name: 'Remove open role Territory Manager' }).click();
    await expect(page.locator('[data-testid^="org-vacancy-"]')).toHaveCount(2);
    await page.reload();
    await expect(page.locator('[data-testid^="org-vacancy-"]')).toHaveCount(2);
    // Arvind has no team and no open role now: he drops out of the chart into the list
    await expect(page.getByTestId('org-node-emp_2')).toHaveCount(0);
    await expect(page.getByTestId('org-unplaced')).toContainText('Arvind Nair');
  });

  test('people who left are hidden until asked for, and come back with a muted style', async ({ page }) => {
    await openOrg(page);
    await expect(page.getByText('Show people who left (1)')).toBeVisible();
    await page.getByTestId('org-show-exited').check();
    await expect(page.getByTestId('stat-people')).toHaveText('25');
    await expect(page.getByTestId('org-unplaced')).toContainText('Deepa Pillai');
    await page.getByTestId('org-show-exited').uncheck();
    await expect(page.getByTestId('stat-people')).toHaveText('24');
    await expect(page.getByTestId('org-unplaced')).not.toContainText('Deepa Pillai');
  });

  test('list view groups by department or location, offers Change manager, and the CSV download has one row per person', async ({ page }) => {
    await openOrg(page);
    await page.getByRole('tab', { name: 'List' }).click();
    const list = page.getByTestId('org-list');
    for (const dept of ['Sales & Field', 'Operations', 'Finance', 'People', 'Warehouse', 'Technology']) await expect(list.getByRole('heading', { name: dept })).toBeVisible();
    await expect(list.getByRole('row', { name: /Pooja Verma/ })).toContainText('Rohit Chauhan');
    await page.getByRole('tab', { name: 'Location' }).click();
    for (const loc of ['Delhi HQ', 'Bengaluru Office', 'Bhiwandi Warehouse']) await expect(list.getByRole('heading', { name: loc })).toBeVisible();
    await list.getByRole('button', { name: 'Change manager for Pooja Verma' }).click();
    await expect(page.getByRole('dialog', { name: 'Change manager: Pooja Verma' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('org-csv').click()]);
    expect(dl.suggestedFilename()).toBe('org-chart.csv');
    const path = await dl.path();
    const csv = (await import('fs')).readFileSync(path!, 'utf8').split('\n');
    expect(csv[0]).toBe(CSV_HEADER.join(','));
    expect(csv).toHaveLength(1 + 24);
    expect(csv.find((l) => l.includes('Pooja Verma'))).toContain('Rohit Chauhan');
    await page.reload();
    await expect(page.getByTestId('org-list')).toBeVisible(slow); // the view is remembered
    await expect(page.getByRole('tab', { name: 'Location', selected: true })).toBeVisible();
  });

  test('no sideways scroll at phone width, in the chart and in the list', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOrg(page);
    await noSideScroll(page, 'org chart');
    await page.getByTestId('org-node-emp_7').scrollIntoViewIfNeeded();
    await page.getByTestId('org-zoom-in').click();
    await noSideScroll(page, 'org chart zoomed');
    await page.getByRole('tab', { name: 'List' }).click();
    await expect(page.getByTestId('org-list')).toBeVisible();
    await noSideScroll(page, 'org list');
    const wide = await page.evaluate(() => Array.from(document.querySelectorAll('table')).map((t) => t.parentElement!.scrollWidth - t.parentElement!.clientWidth));
    expect(wide.some((w) => w > 0)).toBe(true); // wide tables scroll inside their own box
  });
});

// keep unused imports honest: these are used by the pure checks above
void [addDays, orgRows, parse];
