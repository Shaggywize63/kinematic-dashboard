// The HR assistant's intent engine. A SIMULATION with fixed rules: no language model, no network, nothing random.
// ask(db, who, text) works out what was asked by keyword and pattern scoring (English and common Hinglish), checks
// the asker's role, reads only the records it needs, and returns a plain answer plus the list of records it read.
// The MCP preview calls execute() with structured arguments, so chat, voice and MCP share one set of answers.

import type { Employee, HrmsDb, Id, ISODate, Month, PayRun, Payslip } from '../types';
import { addDays, diffDays, financialYear, fmtDate, fmtMonth, fullName, inr } from '../format';
import { PREVIEW_TODAY } from '../seed';
import { monthEnd } from '../rules';
import { leaveDays, taxComparison } from '../../../components/hrms/payroll/logic';
import { dayLabel, findPeople, normalise, parseDates, parseMonth, addMonthsTo, weekdayOf } from './nlp';
import { seedPolicies } from './seed';
import { policyRefs } from './policies';
import type {
  AssistOptions, ChatAction, EngineResult, IntentId, LeaveDraft, PolicyRef, Role, Slots, Subject, Who,
} from './types';

// ───────────────────────────── scoring ─────────────────────────────
const CHUTTI = 'chh?utt?(?:i|y|iyan|iyaan|iyon)';
const LEAVE = `(?:leaves?|${CHUTTI}|bimari)`;
const lv = (s: string) => s.replace(/LEAVE/g, LEAVE).replace(/CHUTTI/g, CHUTTI);
type Rule = [RegExp, number];
const R = (src: string, w: number): Rule => [new RegExp(lv(src)), w];
const sum = (n: string, rules: Rule[]) => rules.reduce((t, [re, w]) => t + (re.test(n) ? w : 0), 0);

export const POLICY_ASK = /\b(policy|policies|niti|rules?|guidelines?|handbook|allowed|permitted|entitled|entitlement|eligible|eligibility|can i|kya main|kya mai|limit|cap|how many days)\b/;
const PAYSLIP_WORD = /\b(payslip|payslips|pay slip|salary slip|salaryslip|pay-slip|salary-slip|slip)\b/;
export const THRESHOLD = 3;

type Scorer = (n: string, ctx: { policies: PolicyRef[]; today: ISODate }) => number;
const SCORERS: Record<Exclude<IntentId, 'unknown'>, Scorer> = {
  greeting: (n) => (/^(hi+|hello+|hey+|hola|namaste|namaskar|good (morning|afternoon|evening)|hey there|yo)\b/.test(n) ? 6 : 0),
  help: (n) => sum(n, [R('\\bhelp\\b', 3), R('\\b(menu|options|what can you do|what do you do|kya kar sakte|kya kar sakta|aap kya kar|commands|features|how does this work|kaise kaam)\\b', 7)]),
  thanks: (n) => (n.split(' ').length <= 5 ? sum(n, [R('\\b(thanks|thank you|thankyou|thx|shukriya|dhanyavad|dhanyawad|great|got it|theek hai|thik hai|ok)\\b', 6)]) : 0),
  leave_balance: (n) => sum(n, [
    R('\\bLEAVE\\b.*\\b(balance|bachi|bachhi|bache|bacha|baki|baaki|remaining|left|available|kitni|kitne|kitna|pending|shesh)\\b', 5),
    R('\\b(balance|bachi|bachhi|bache|baki|baaki|kitni|kitne|remaining|left|available)\\b.*\\bLEAVE\\b', 5),
    R('how many (leaves?|days off|casual|sick|earned|days of leave)', 5),
    R('\\b(leaves?|leave) balance\\b|\\bbalance (of )?(leaves?|leave)\\b', 4),
    R('\\bLEAVE\\b', 3), R('\\b(balance|bachi|bachhi|baki|baaki|remaining|left)\\b', 1),
  ]),
  apply_leave: (n, { today }) => {
    if (!new RegExp(lv(`\\b(LEAVE|day off|days off|off)\\b`)).test(n) && !/\b(not coming|nahi aaunga|nahi aaungi|nahi aa paunga|nahi aa sakta|nahi aa sakti|(i will|i ll|i am|im) be (out|away)|(i am|im) (out|away))\b/.test(n)) return 0;
    return sum(n, [
      R('\\b(apply|applying|request|book|raise|put|submit|mark|take|taking|need|want|wanna|chahiye|chahie|chaiye|leni|lena|lunga|lungi|le sakta|le sakti|le loon|le lu|karna|kar do|kardo)\\b', 4),
      R('\\b(LEAVE|off) (for|on|from|tomorrow|today|kal|aaj|parso)\\b', 2),
      R('\\b(i will be|i ll be|i am|im|main|mai) (out|away|off)\\b', 4),
      R('\\b(not coming|nahi aaunga|nahi aaungi|nahi aa paunga|nahi aa sakta|nahi aa sakti)\\b', 4),
      R('\\b(day off|days off|off chahiye|off lena|off leni)\\b', 3),
    ]) + (parseDates(n, today).from ? 2 : 0);
  },
  team_leave: (n) => sum(n, [
    R('\\b(who|kaun|kaun kaun|kis kis|kitne log)\\b.*\\b(LEAVE|off|absent|away|out)\\b', 6),
    R('\\b(team|reportees?|reports?|staff|everyone|sabhi|sab)\\b.*\\b(LEAVE|leaves)\\b', 6),
    R('\\b(on leave|leave pe|chhutti pe|chutti pe|leave par|chhutti par)\\b', 5),
    R('\\bwho is (off|out|away|absent)\\b', 6),
  ]),
  attendance: (n) => sum(n, [R('\\b(attendance|present|absent|haazri|hazri|lop|loss of pay|late marks?|punch|punches|aaya|aaye)\\b', 5), R('\\battendance\\b', 1)]),
  payslip_summary: (n) => sum(n, [
    R('\\b(payslip|payslips|pay slip|salary slip|salaryslip|pay-slip|salary-slip|slip)\\b', 5),
    R('\\b(salary|tankhwah|tankhah|tankha|vetan|pagar|wages?|paycheck|paycheque|earnings?)\\b', 3), R('\\bpay\\b', 1),
    R('\\b(gross|net|take home|takehome|in hand|inhand|deductions?|kata|kate|kat gaya|cut)\\b', 3),
    R('\\b(kitni|kitna|how much|amount|aayi|aaya|aaye|mili|mila|received|credited|got|get)\\b', 2),
    R('\\b(summary|dikhao|dikha|show|batao|bata)\\b', 1),
  ]),
  payslip_download: (n) => (PAYSLIP_WORD.test(n) ? sum(n, [
    R('\\b(download|pdf|email|mail|send|bhej|bhejo|bhej do|dedo|de do|share|copy|print|nikal|nikalo|chahiye|chaiye|chahie|forward|file)\\b', 8),
    R('\\b(payslip|payslips|pay slip|salary slip|salaryslip|pay-slip|salary-slip|slip)\\b', 4),
  ]) : 0),
  salary_date: (n) => sum(n, [
    R('\\b(salary|tankhwah|tankha|vetan|pagar|payday|pay day|paycheck|payment|pay)\\b.*\\b(kab|when|date|credit|credited|milegi|aayegi|ayegi|aaegi|hogi|ayega|aayega|come|arrive|due)\\b', 7),
    R('\\b(kab|when)\\b.*\\b(salary|tankhwah|tankha|vetan|pagar|payday|credit|credited|milegi|payslip)\\b', 7),
    R('\\b(payday|pay day|salary date|pay date)\\b', 6),
  ]),
  pf_uan: (n) => sum(n, [R('\\b(pf|epf|uan|provident|epfo|passbook|pension|eps)\\b', 6), R('\\b(pf|uan) (number|status|kya|kitna)\\b', 2)]),
  tax_tds: (n) => sum(n, [R('\\b(tds|tax|taxes|regime|income tax|form 16|form 130|itr|80c|investment declaration|declaration|form 124|form 12bb)\\b', 6), R('\\btax\\b.*\\b(kata|kate|cut|deducted|paid)\\b', 2)]),
  holidays: (n) => sum(n, [
    R('\\b(holidays?|tyohar|tyohaar|tyauhar|festival|festivals|public holiday|bank holiday)\\b', 6),
    R('\\b(diwali|deepawali|holi|dussehra|dusshera|christmas|republic day|independence day|gandhi jayanti|eid|rajyotsava|guru nanak|labour day|maharashtra day)\\b', 4),
    R('\\b(agli|agla|next|upcoming|aane wali|aane wala)\\b.*\\b(CHUTTI|holiday|off|tyohar)\\b', 6),
    R('\\b(CHUTTI|off)\\b.*\\b(hai kya|hai ya|hogi kya|milegi kya|hai na)\\b', 5),
  ]),
  who_manager: (n) => sum(n, [R('\\b(manager|boss|supervisor|reporting manager|reporting to|report to|reports to|reporting head|line manager|team lead)\\b', 6), R('\\bkisko report\\b|\\bkisko reporting\\b', 6)]),
  my_team: (n) => (/\b(leave|chhutti|chutti|attendance|salary|payslip)\b/.test(n) ? 0
    : sum(n, [R('\\b(my team|team members|team ke log|meri team|mere team|direct reports?|reportees?|my reports|mere reports|team list|teammates?|colleagues)\\b', 7)])),
  shift_today: (n) => sum(n, [R('\\b(shift|duty|timing|timings|roster|rota|kitne baje|what time|kab aana|office time)\\b', 5), R('\\b(today|aaj)\\b', 1)]),
  policy: (n, { policies }) => {
    if (!POLICY_ASK.test(n)) return 0;
    const hits = Math.max(0, ...policies.map((p) => topicHits(n, p)));
    return 4 + Math.min(hits, 2) * 3;
  },
};

/** How many of a policy's topic words appear in the text. */
export function topicHits(norm: string, p: PolicyRef): number {
  let hits = 0;
  for (const k of p.keywords) {
    const kw = k.toLowerCase();
    if (kw.length < 2) continue;
    if (new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(norm)) hits += 1;
  }
  return hits;
}

/** Order used to break ties: the more specific intent first. */
const PRIORITY: IntentId[] = ['payslip_download', 'salary_date', 'apply_leave', 'team_leave', 'leave_balance', 'pf_uan', 'tax_tds', 'payslip_summary', 'holidays', 'who_manager', 'my_team', 'shift_today', 'attendance', 'policy', 'help', 'greeting', 'thanks'];

const DEFAULT_POLICIES: PolicyRef[] = policyRefs(seedPolicies());

// ───────────────────────────── slots ─────────────────────────────
function leaveCodeIn(n: string): string | undefined {
  if (/\b(sick|sl|bimar|bimari|bukhar|fever|unwell|doctor|medical|ill)\b/.test(n)) return 'SL';
  if (/\b(casual|cl)\b/.test(n)) return 'CL';
  if (/\b(earned|el|pl|privilege|annual)\b/.test(n)) return 'EL';
  if (/\b(comp off|comp-off|compensatory)\b/.test(n)) return 'CO';
  if (/\b(lwp|unpaid|without pay)\b/.test(n)) return 'LWP';
  return undefined;
}

function detectSubject(db: HrmsDb, who: Who, n: string): { subject: Subject; ambiguous?: string[] } {
  const people = findPeople(db, n);
  const others = people.matched.filter((e) => e.id !== who.employeeId);
  if (others.length === 1) return { subject: { kind: 'person', id: others[0]!.id } };
  if (others.length > 1) return { subject: { kind: 'self' }, ambiguous: others.map((e) => e.firstName) };
  if (people.ambiguous.length) return { subject: { kind: 'self' }, ambiguous: people.ambiguous.map((t) => t.replace(/^./, (c) => c.toUpperCase())) };
  if (people.matched.length === 1) return { subject: { kind: 'self' } };
  if (/\bteam(?! lead)\b|\b(reportees?|direct reports?|mere reports|my reports)\b/.test(n)) return { subject: { kind: 'team' } };
  if (/\b(everyone|everybody|all employees|all staff|sabhi|sab log|saare|sabka|sabki|company wide|whole company|all people|anyone)\b/.test(n)) return { subject: { kind: 'all' } };
  return { subject: { kind: 'self' } };
}

export interface Parsed {
  intent: IntentId;
  scores: Partial<Record<IntentId, number>>;
  confidence: number;
  slots: Slots;
  norm: string;
}

export function parse(db: HrmsDb, who: Who, text: string, opts: AssistOptions = {}): Parsed {
  const today = opts.today ?? PREVIEW_TODAY;
  const policies = opts.policies ?? DEFAULT_POLICIES;
  const n = normalise(text);
  const scores: Partial<Record<IntentId, number>> = {};
  for (const [id, fn] of Object.entries(SCORERS) as [Exclude<IntentId, 'unknown'>, Scorer][]) {
    const s = fn(n, { policies, today });
    if (s > 0) scores[id] = s;
  }
  const ranked = (Object.entries(scores) as [IntentId, number][]).sort((a, b) => b[1] - a[1] || PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]));
  const [topId, topScore] = ranked[0] ?? ['unknown' as IntentId, 0];
  const second = ranked[1]?.[1] ?? 0;

  const sub = detectSubject(db, who, n);
  const dates = parseDates(n, today);
  const slots: Slots = { subject: sub.subject };
  if (sub.ambiguous) slots.ambiguous = sub.ambiguous;
  const code = leaveCodeIn(n);
  if (code) slots.leaveCode = code;
  if (dates.from) slots.from = dates.from;
  if (dates.to) slots.to = dates.to;
  if (dates.days) slots.days = dates.days;
  if (dates.half) slots.half = true;
  const wantsNext = /\b(next|agli|agla|upcoming|aane wali|aane wala|coming)\b/.test(n);
  const month = parseMonth(n, today, topId === 'holidays' ? 'future' : 'past');
  if (month && !(dates.dates.length && !/\b(payslip|salary|slip|month|mahine|holidays?)\b/.test(n))) slots.month = month;
  if (topId === 'holidays' && wantsNext && !slots.month) slots.holidayNext = true;

  // A short reply like "tomorrow" or "casual leave" continues the leave request the assistant was waiting on.
  const looksLikeAnswer = !!(dates.from || dates.days || dates.half || code);
  if (opts.prev?.intent === 'apply_leave' && looksLikeAnswer && topScore < 5) {
    return { intent: 'apply_leave', scores, confidence: 0.7, slots: mergePrev(opts.prev.slots, slots), norm: n };
  }
  if (topScore < THRESHOLD) {
    // A topic word with no question word ("travel claim") still points at a policy, as a last resort.
    const hits = Math.max(0, ...policies.map((p) => topicHits(n, p)));
    if (hits >= 1 && n.split(' ').length >= 2) { scores.policy = 2; return { intent: 'policy', scores, confidence: 0.35, slots, norm: n }; }
    return { intent: 'unknown', scores, confidence: 0, slots, norm: n };
  }
  const confidence = Math.min(0.98, topScore / (topScore + 4)) * (second >= topScore - 1 && second > 0 ? 0.8 : 1);
  return { intent: topId, scores, confidence: Math.round(confidence * 100) / 100, slots, norm: n };
}

function mergePrev(prev: Slots, now: Slots): Slots {
  return { ...prev, ...now, subject: { kind: 'self' }, from: now.from ?? prev.from, to: now.to ?? (now.from ? undefined : prev.to), days: now.days ?? prev.days, half: now.half ?? prev.half, leaveCode: now.leaveCode ?? prev.leaveCode };
}

// ───────────────────────────── access ─────────────────────────────
export type Category = 'general' | 'pay';
export interface Access { ok: boolean; reason?: string; targets: Employee[]; scope: 'self' | 'person' | 'team' | 'all'; needsName?: boolean }

export function directReports(db: HrmsDb, managerId: Id): Employee[] {
  return db.employees.filter((e) => e.reportingToId === managerId && e.id !== managerId && e.status !== 'exited');
}
const byId = (db: HrmsDb, id: Id) => db.employees.find((e) => e.id === id);

const verbFor = (noun: string) => (/details$/.test(noun) ? 'are' : 'is');

/** What a person in this role may see. The one place where roles are decided; every intent goes through it. */
export function accessFor(db: HrmsDb, who: Who, subject: Subject, category: Category, payNoun = 'Salary', channel: AssistOptions['channel'] = 'chat'): Access {
  const me = byId(db, who.employeeId);
  if (!me) return { ok: false, reason: 'I could not find you in the records.', targets: [], scope: 'self' };
  const none = (reason: string, scope: Access['scope']): Access => ({ ok: false, reason, targets: [], scope });
  if (subject.kind === 'self' || (subject.kind === 'person' && subject.id === me.id)) return { ok: true, targets: [me], scope: 'self' };
  // Over MCP even HR cannot read other people's pay. Employees and managers get their own, more specific, refusal below.
  const mcpPay = channel === 'mcp' && category === 'pay' && who.role === 'hr';
  if (mcpPay) return none("Other people's pay is never exposed through MCP. Use the Payroll module.", subject.kind === 'person' ? 'person' : subject.kind);

  if (subject.kind === 'person') {
    const t = byId(db, subject.id);
    if (!t) return none('I could not find that person in the records.', 'person');
    if (who.role === 'hr') return { ok: true, targets: [t], scope: 'person' };
    if (who.role === 'employee') return none('You can only ask about your own HR data.', 'person');
    if (category === 'pay') return none(`${payNoun} of other people ${verbFor(payNoun)} not shared with managers.`, 'person');
    if (t.reportingToId === me.id && t.id !== me.id) return { ok: true, targets: [t], scope: 'person' };
    return none(`${fullName(t)} does not report to you. Managers can ask about their own direct reports only.`, 'person');
  }
  if (subject.kind === 'team') {
    if (who.role === 'employee') return none('Team questions are for managers and HR. You can ask about your own data.', 'team');
    if (category === 'pay') return who.role === 'manager' ? none(`${payNoun} of other people ${verbFor(payNoun)} not shared with managers.`, 'team') : { ok: true, targets: [], scope: 'team', needsName: true };
    return { ok: true, targets: who.role === 'manager' ? directReports(db, me.id) : db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice'), scope: who.role === 'manager' ? 'team' : 'all' };
  }
  // everyone
  if (who.role === 'employee') return none('Company-wide questions are for HR. You can ask about your own data.', 'all');
  if (who.role === 'manager') return none(category === 'pay' ? `${payNoun} of other people ${verbFor(payNoun)} not shared with managers.` : 'Managers can ask about their own team only, not the whole company.', 'all');
  if (category === 'pay') return { ok: true, targets: [], scope: 'all', needsName: true };
  return { ok: true, targets: db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice'), scope: 'all' };
}

// ───────────────────────────── helpers ─────────────────────────────
const fmtN = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));
const dayWord = (n: number) => `${fmtN(n)} ${n === 1 ? 'day' : 'days'}`;
const first = (e: Employee) => e.firstName;
const L = (...lines: (string | undefined | false)[]) => lines.filter((l) => l !== undefined && l !== false).join('\n');

export function suggestionsFor(role: Role): string[] {
  const base = ['Leave balance', 'My last payslip', 'Next holiday', 'Who is my manager?'];
  if (role === 'manager') return [...base, 'Who is on leave in my team?', 'Team attendance'];
  if (role === 'hr') return [...base, 'Pooja ka leave balance', 'Who is on leave this week?'];
  return [...base, 'Apply leave on 12 Nov'];
}

export function releasedRuns(db: HrmsDb): PayRun[] {
  return db.payRuns.filter((r) => r.status === 'frozen' || r.status === 'paid');
}
export function releasedSlips(db: HrmsDb, employeeId: Id): { run: PayRun; slip: Payslip }[] {
  return releasedRuns(db)
    .flatMap((run) => run.payslips.filter((s) => s.employeeId === employeeId).map((slip) => ({ run, slip })))
    .sort((a, b) => b.slip.month.localeCompare(a.slip.month) || a.run.createdAt.localeCompare(b.run.createdAt));
}
const entityName = (db: HrmsDb, id: Id) => db.entities.find((e) => e.id === id)?.name ?? '';

export function leaveRows(db: HrmsDb, emp: Employee, requests: AssistOptions['leaveRequests'] = []) {
  return db.leaveBalances.filter((b) => b.employeeId === emp.id).map((b) => {
    const type = db.leaveTypes.find((t) => t.id === b.leaveTypeId);
    const balance = b.opening + b.accrued - b.taken - b.encashed - b.lapsed;
    const pending = requests.filter((r) => r.employeeId === emp.id && r.leaveTypeId === b.leaveTypeId && r.status === 'pending').reduce((s, r) => s + r.days, 0);
    return { typeId: b.leaveTypeId, name: type?.name ?? b.leaveTypeId, code: type?.code ?? '', balance, pending, available: balance - pending };
  });
}

function base(intent: IntentId, slots: Slots, partial: Partial<EngineResult> & Pick<EngineResult, 'answer'>, who: Who): EngineResult {
  return {
    intent, confidence: 1, outcome: 'answered', usedData: [], suggestions: suggestionsFor(who.role), slots, ...partial,
  };
}

function refuse(intent: IntentId, slots: Slots, reason: string, who: Who, confidence = 1): EngineResult {
  return base(intent, slots, {
    outcome: 'refused', refused: reason, confidence,
    answer: `I can't share that. ${reason}`,
    usedData: ['Your role (' + who.role + ')'],
  }, who);
}

function needsInfo(intent: IntentId, slots: Slots, answer: string, who: Who, suggestions: string[], usedData: string[] = []): EngineResult {
  return base(intent, slots, { outcome: 'needs_info', answer, suggestions, usedData }, who);
}

// ───────────────────────────── execute ─────────────────────────────
export function execute(db: HrmsDb, who: Who, intent: IntentId, slots: Slots, opts: AssistOptions = {}, confidence = 1): EngineResult {
  const out = run(db, who, intent, slots, opts);
  return { ...out, confidence: out.outcome === 'unknown' ? 0 : confidence };
}

function run(db: HrmsDb, who: Who, intent: IntentId, slots: Slots, opts: AssistOptions): EngineResult {
  const today = opts.today ?? PREVIEW_TODAY;
  const channel = opts.channel ?? 'chat';
  const me = byId(db, who.employeeId);
  if (!me) return base('unknown', slots, { outcome: 'unknown', answer: 'I could not find you in the records, so I cannot answer.', suggestions: [] }, who);
  const policies = opts.policies ?? DEFAULT_POLICIES;
  const requests = opts.leaveRequests ?? [];

  switch (intent) {
    case 'greeting':
    case 'help': {
      const scope = who.role === 'employee' ? 'your own HR data' : who.role === 'manager' ? 'your own data and your direct reports\' leave and attendance (never their pay)' : 'anyone\'s HR data';
      return base(intent, slots, {
        answer: L(
          `${intent === 'greeting' ? `Hi ${first(me)}! ` : ''}I am the Kinematic HR assistant. I run on fixed rules, not an AI model, so I only answer what I can read from the records.`,
          `You are signed in as ${who.role === 'hr' ? 'HR' : who.role}, so I can answer about ${scope}.`,
          'I can help with: leave balance, applying for leave, payslips, salary date, PF and UAN, tax, holidays, your manager and team, today\'s shift, attendance and policies.',
          'I understand English and common Hinglish.',
        ),
        usedData: ['Your role'], suggestions: suggestionsFor(who.role),
      }, who);
    }
    case 'thanks':
      return base(intent, slots, { answer: 'You are welcome. Ask me anything else about your HR data.', usedData: [] }, who);

    case 'leave_balance': return leaveBalance(db, who, me, slots, requests, today);
    case 'apply_leave': return applyLeave(db, who, me, slots, requests, today);
    case 'team_leave': return teamLeave(db, who, me, slots, requests, today);
    case 'attendance': return attendance(db, who, me, slots, today);
    case 'payslip_summary':
    case 'payslip_download': return payslip(db, who, me, intent, slots, today, channel);
    case 'salary_date': return salaryDate(db, who, me, slots, today);
    case 'pf_uan': return pfUan(db, who, me, slots, today, channel);
    case 'tax_tds': return taxTds(db, who, me, slots, today, channel);
    case 'holidays': return holidays(db, who, me, slots, today);
    case 'who_manager': return whoManager(db, who, me, slots);
    case 'my_team': return myTeam(db, who, me, slots);
    case 'shift_today': return shiftToday(db, who, me, slots, today);
    case 'policy': return policyAnswer(who, slots, policies);
    default: return unknown(who, slots);
  }
}

// ───────────────────────────── intents ─────────────────────────────
function leaveBalance(db: HrmsDb, who: Who, me: Employee, slots: Slots, requests: NonNullable<AssistOptions['leaveRequests']>, today: ISODate): EngineResult {
  const acc = accessFor(db, who, slots.subject, 'general');
  if (!acc.ok) return refuse('leave_balance', slots, acc.reason!, who);
  const used = ['Leave balances', 'Leave types', 'Leave requests (assistant)'];
  if (acc.scope === 'team' || acc.scope === 'all') {
    if (acc.scope === 'all') return needsInfo('leave_balance', slots, 'Whose balance? Name one person, for example "Pooja ka leave balance".', who, ['Pooja ka leave balance'], ['Your role']);
    if (!acc.targets.length) return base('leave_balance', slots, { answer: 'You have no direct reports in the records, so there are no team balances to show.', usedData: ['Reporting lines'] }, who);
    const lines = acc.targets.map((t) => {
      const rows = leaveRows(db, t, requests);
      return `- ${fullName(t)}: ${rows.length ? rows.map((r) => `${r.code} ${fmtN(r.available)}`).join(', ') : 'no balance on file'}`;
    });
    return base('leave_balance', slots, {
      answer: L(`Leave left for your direct reports (after pending requests), as of ${fmtDate(today)}:`, ...lines),
      usedData: [...used, `Reporting lines (${acc.targets.length} people)`],
    }, who);
  }
  const t = acc.targets[0]!;
  const mine = acc.scope === 'self';
  const rows = leaveRows(db, t, requests);
  if (!rows.length) {
    return base('leave_balance', slots, { answer: `No leave balance is on file for ${mine ? 'you' : fullName(t)} (status: ${t.status.replace('_', ' ')}).`, usedData: ['Leave balances'], subjectId: t.id }, who);
  }
  const wanted = slots.leaveCode ? rows.filter((r) => r.code === slots.leaveCode) : rows;
  if (slots.leaveCode && !wanted.length) {
    return base('leave_balance', slots, { answer: `There is no ${slots.leaveCode} balance on file for ${mine ? 'you' : fullName(t)}. Balances I can see: ${rows.map((r) => r.code).join(', ')}.`, usedData: used, subjectId: t.id }, who);
  }
  const pend = wanted.reduce((s, r) => s + r.pending, 0);
  const head = mine ? `${first(t)}, your leave balance as of ${fmtDate(today)}:` : `${fullName(t)}'s leave balance as of ${fmtDate(today)}:`;
  return base('leave_balance', slots, {
    answer: L(head, ...wanted.map((r) => `- ${r.name} (${r.code}): ${dayWord(r.balance)}${r.pending ? `, ${dayWord(r.pending)} pending approval` : ''}`),
      pend ? `Pending requests are not taken off the balance until a manager approves them.` : undefined),
    usedData: used, subjectId: t.id,
    suggestions: mine ? ['Apply leave on 12 Nov', 'Next holiday', 'Leave policy'] : suggestionsFor(who.role),
  }, who);
}

function applyLeave(db: HrmsDb, who: Who, me: Employee, slots: Slots, requests: NonNullable<AssistOptions['leaveRequests']>, today: ISODate): EngineResult {
  if (slots.subject.kind !== 'self') return refuse('apply_leave', slots, 'Leave can only be requested by the person it is for. Ask them to message me.', who);
  const used = ['Leave balances', 'Leave types', 'Holiday list', 'Reporting lines'];
  const pickDates = ['Monday', '10 Nov to 11 Nov', 'Half day on Monday'];
  if (!slots.from) return needsInfo('apply_leave', slots, 'Which day or days do you need leave for? For example "tomorrow", "12 Nov" or "12 Nov to 14 Nov".', who, pickDates, ['Leave types']);
  let from = slots.from; let to = slots.to ?? slots.from;
  if (to < from) [from, to] = [to, from];
  if (from < today) return base('apply_leave', slots, { answer: `${dayLabel(from)} is already in the past. Leave for past dates has to be corrected by HR. Tell me a date from today onwards.`, usedData: ['Today\'s date'], suggestions: pickDates }, who);

  const rows = leaveRows(db, me, requests);
  const types = db.leaveTypes;
  const half = !!slots.half && from === to;
  const loc = db.locations.find((l) => l.id === me.locationId);
  const holidayList = db.holidayLists.find((h) => h.id === loc?.holidayListId);
  const holidayOn = (d: ISODate) => holidayList?.holidays.find((h) => h.date === d && !h.optional);

  const choose = (code?: string) => types.find((t) => t.code === code) ?? types.find((t) => t.code === 'CL')!;
  const inProbation = !!me.confirmationDate && me.confirmationDate > today;
  const days = slots.days && !slots.to ? walkDays(db, me, choose(slots.leaveCode ?? 'CL'), from, slots.days) : null;
  if (days) to = days;
  let type = choose(slots.leaveCode);
  let nDays = leaveDays(db, me, type, from, to, half);

  // No type named: casual leave for short breaks, earned leave when the break is longer than casual leave allows.
  if (!slots.leaveCode && type.maxConsecutiveDays && nDays > type.maxConsecutiveDays) { const el = types.find((t) => t.code === 'EL'); if (el) { type = el; nDays = leaveDays(db, me, type, from, to, half); } }

  if (nDays === 0) {
    const h = holidayOn(from);
    const why = weekdayOf(from) === 0 && h ? `a Sunday and ${h.name}` : weekdayOf(from) === 0 ? 'a Sunday' : h ? h.name : 'a day off';
    return base('apply_leave', slots, { answer: `${dayLabel(from)}${to !== from ? ` to ${dayLabel(to)}` : ''} is ${why}${to !== from ? ' (all of it)' : ''}, so you do not need leave for it. Pick a working day.`, usedData: used, suggestions: pickDates }, who);
  }

  const row = rows.find((r) => r.typeId === type.id);
  const available = row ? row.available : 0;
  const dupe = requests.find((r) => r.employeeId === me.id && (r.status === 'pending' || r.status === 'approved') && r.from <= to && r.to >= from);
  if (dupe) return base('apply_leave', slots, { answer: `You already have a ${dupe.status} ${dupe.leaveCode} request for ${dayLabel(dupe.from)}${dupe.to !== dupe.from ? ` to ${dayLabel(dupe.to)}` : ''}, which overlaps these dates.`, usedData: [...used, 'Leave requests (assistant)'], suggestions: pickDates }, who);
  if (inProbation && !type.probationEligible) return base('apply_leave', slots, { answer: `${type.name} is not available during probation. You can ask for casual leave or leave without pay instead.`, usedData: used, suggestions: ['Apply casual leave'] }, who);
  if (type.maxConsecutiveDays && nDays > type.maxConsecutiveDays) {
    return base('apply_leave', slots, {
      answer: `${type.name} can be taken for ${type.maxConsecutiveDays} days at a time, and this request is ${dayWord(nDays)}. Earned leave can cover a longer break.`,
      usedData: used, suggestions: [`Apply earned leave from ${shortDate(from)} to ${shortDate(to)}`],
    }, who);
  }
  if (nDays > available) {
    const alt = types.find((t) => t.code === (type.code === 'CL' ? 'EL' : 'CL'));
    const altRow = rows.find((r) => r.typeId === alt?.id);
    return base('apply_leave', slots, {
      answer: L(`You have ${dayWord(Math.max(0, available))} of ${type.name} available and this request is ${dayWord(nDays)}, so I cannot prepare it.`,
        alt && altRow && altRow.available >= nDays ? `${alt.name} has ${dayWord(altRow.available)} available.` : 'Ask your manager about leave without pay for the extra days.'),
      usedData: used, suggestions: alt && altRow && altRow.available >= nDays ? [`Apply ${alt.name.toLowerCase()} from ${shortDate(from)} to ${shortDate(to)}`] : ['Leave balance'],
    }, who);
  }
  const approver = me.reportingToId && me.reportingToId !== me.id ? byId(db, me.reportingToId) : undefined;
  const draft: LeaveDraft = {
    employeeId: me.id, leaveTypeId: type.id, leaveCode: type.code, leaveName: type.name, from, to, days: nDays, half,
    reason: 'Requested in the HR assistant', approverId: approver?.id,
  };
  const assumed = !slots.leaveCode;
  const actions: ChatAction[] = [{ kind: 'confirm_leave', label: 'Confirm', draft }, { kind: 'dismiss', label: 'Not now' }];
  return base('apply_leave', slots, {
    answer: L(
      'Here is the request I prepared. Nothing is sent until you confirm.',
      `- Type: ${type.name} (${type.code})${assumed ? ', chosen for you' : ''}`,
      `- Dates: ${dayLabel(from)}${to !== from ? ` to ${dayLabel(to)}` : ''}${half ? ' (half day)' : ''}`,
      `- Days counted: ${fmtN(nDays)}${type.includeWeeklyOffs ? '' : ' (Sundays and public holidays are not counted)'}`,
      `- Balance after approval: ${fmtN(available - nDays)}`,
      `- Goes to: ${approver ? `${fullName(approver)}, your manager` : 'HR (no manager is recorded for you)'}`,
      type.documentAfterDays && nDays > type.documentAfterDays ? `A medical note is needed for more than ${type.documentAfterDays} days.` : undefined,
    ),
    usedData: used, actions, subjectId: me.id, suggestions: ['Make it a half day', 'Leave balance'],
  }, who);
}

function shortDate(d: ISODate): string {
  const [, m, day] = d.split('-').map(Number) as [number, number, number];
  return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`;
}

/** The last date of a request for `n` leave days that start on `from`, skipping days the type does not count. */
function walkDays(db: HrmsDb, e: Employee, type: Parameters<typeof leaveDays>[2], from: ISODate, n: number): ISODate {
  let to = from; let guard = 0;
  while (leaveDays(db, e, type, from, to, false) < n && guard++ < 60) to = addDays(to, 1);
  return to;
}

function teamLeave(db: HrmsDb, who: Who, me: Employee, slots: Slots, requests: NonNullable<AssistOptions['leaveRequests']>, today: ISODate): EngineResult {
  const subject: Subject = slots.subject.kind === 'self' ? (who.role === 'manager' ? { kind: 'team' } : who.role === 'hr' ? { kind: 'all' } : slots.subject) : slots.subject;
  const acc = accessFor(db, who, subject, 'general');
  if (!acc.ok) return refuse('team_leave', slots, who.role === 'employee' && slots.subject.kind === 'self' ? 'Team leave is for managers and HR. You can ask about your own leave.' : acc.reason!, who);
  const win = slots.days && slots.days >= 1 && slots.days <= 62 ? slots.days : 7;
  const end = addDays(today, win);
  const ids = new Set(acc.targets.map((t) => t.id));
  const hits = requests.filter((r) => ids.has(r.employeeId) && (r.status === 'pending' || r.status === 'approved') && r.to >= today && r.from <= end)
    .sort((a, b) => a.from.localeCompare(b.from));
  const who2 = acc.scope === 'self' ? 'you' : acc.scope === 'person' ? fullName(acc.targets[0]!) : acc.scope === 'team' ? 'your direct reports' : 'the company';
  const used = ['Leave requests (assistant)', acc.scope === 'all' ? 'Employee list' : 'Reporting lines'];
  if (acc.scope === 'team' && !acc.targets.length) return base('team_leave', slots, { answer: 'You have no direct reports in the records.', usedData: ['Reporting lines'] }, who);
  const note = 'This shows requests made through the assistant. Leave booked in other tools is not in this preview.';
  if (!hits.length) return base('team_leave', slots, { answer: L(`No leave is booked for ${who2} from ${fmtDate(today)} to ${fmtDate(end)}.`, note), usedData: used }, who);
  return base('team_leave', slots, {
    answer: L(`Leave booked for ${who2}, ${fmtDate(today)} to ${fmtDate(end)}:`,
      ...hits.map((r) => `- ${fullName(byId(db, r.employeeId)!)}: ${r.leaveCode}, ${dayLabel(r.from)}${r.to !== r.from ? ` to ${dayLabel(r.to)}` : ''} (${dayWord(r.days)}, ${r.status})`), note),
    usedData: [...used, `${hits.length} request${hits.length === 1 ? '' : 's'}`],
  }, who);
}

function attendance(db: HrmsDb, who: Who, me: Employee, slots: Slots, today: ISODate): EngineResult {
  const acc = accessFor(db, who, slots.subject, 'general');
  if (!acc.ok) return refuse('attendance', slots, acc.reason!, who);
  const cur = today.slice(0, 7); const prev = addMonthsTo(cur, -1);
  const line = (e: Employee) => {
    const a = db.attendance.find((x) => x.employeeId === e.id && x.month === cur);
    const p = db.attendance.find((x) => x.employeeId === e.id && x.month === prev);
    const parts = [a ? `${fmtMonth(cur)} so far: ${a.presentDays} present, ${a.lopDays} loss of pay` : undefined, p ? `${fmtMonth(prev)}: ${p.presentDays} present, ${p.paidLeaveDays} paid leave, ${p.lopDays} loss of pay` : undefined].filter(Boolean);
    return parts.length ? parts.join(' | ') : 'no attendance on file';
  };
  const used = ['Attendance summaries', 'Reporting lines'];
  if (acc.scope === 'all') return needsInfo('attendance', slots, 'Whose attendance? Name one person, or ask about "my team".', who, ['Team attendance'], ['Your role']);
  if (acc.scope === 'team') {
    if (!acc.targets.length) return base('attendance', slots, { answer: 'You have no direct reports in the records.', usedData: ['Reporting lines'] }, who);
    return base('attendance', slots, { answer: L(`Attendance for your direct reports (monthly summaries):`, ...acc.targets.map((t) => `- ${fullName(t)}: ${line(t)}`)), usedData: [...used, `${acc.targets.length} people`] }, who);
  }
  const t = acc.targets[0]!;
  return base('attendance', slots, {
    answer: L(acc.scope === 'self' ? `${first(t)}, your attendance:` : `${fullName(t)}'s attendance:`, `- ${line(t)}`, 'These are monthly summaries. Day-by-day punches are on the Time & Leave page.'),
    usedData: used, subjectId: t.id,
  }, who);
}

function pickMonth(db: HrmsDb, empId: Id, month?: Month) {
  const slips = releasedSlips(db, empId);
  return { slips, hit: month ? slips.find((s) => s.slip.month === month) : slips[0] };
}

function payslip(db: HrmsDb, who: Who, me: Employee, intent: 'payslip_summary' | 'payslip_download', slots: Slots, today: ISODate, channel: AssistOptions['channel']): EngineResult {
  const acc = accessFor(db, who, slots.subject, 'pay', 'Salary', channel);
  if (!acc.ok) return refuse(intent, slots, acc.reason!, who);
  if (acc.scope === 'team' || acc.scope === 'all') return needsInfo(intent, slots, 'Name one person, for example "Pooja ka last payslip".', who, [], ['Your role']);
  const t = acc.targets[0]!;
  const mine = acc.scope === 'self';
  const { slips, hit } = pickMonth(db, t.id, slots.month);
  const used = ['Pay runs (frozen or paid)', `Payslip for ${fullName(t)}`];
  const sensitive = mine ? undefined : { employeeId: t.id, field: 'Payslip summary' };
  if (!slips.length) return base(intent, slots, { answer: `${mine ? 'You have' : `${fullName(t)} has`} no released payslip yet.`, usedData: ['Pay runs (frozen or paid)'], subjectId: t.id }, who);
  if (!hit) {
    const cur = today.slice(0, 7);
    const why = slots.month === cur ? `The ${fmtMonth(cur)} payslip is not released yet because the pay run has not been frozen.` : `I have no released payslip for ${fmtMonth(slots.month!)}.`;
    return base(intent, slots, { answer: L(why, `Payslips on file: ${slips.map((s) => fmtMonth(s.slip.month)).join(', ')}.`), usedData: ['Pay runs (frozen or paid)'], subjectId: t.id, suggestions: [`Payslip ${fmtMonth(slips[0]!.slip.month)}`] }, who);
  }
  const { slip, run } = hit;
  const reimb = slip.reimbursements.reduce((s, l) => s + l.amount, 0);
  const paid = run.paidAt ? `Paid on ${fmtDate(run.paidAt.slice(0, 10))}` : `Run ${run.status}, not paid yet`;
  const parts = slip.deductions.map((d) => `${d.name.replace(/ \(.*\)$/, '')} ${inr(d.amount)}`);
  const text = L(
    `${mine ? 'Your' : `${fullName(t)}'s`} payslip for ${fmtMonth(slip.month)}:`,
    `- Gross: ${inr(slip.gross)}`,
    `- Deductions: ${inr(slip.totalDeductions)}${parts.length ? ` (${parts.join(', ')})` : ''}`,
    reimb ? `- Reimbursements: ${inr(reimb)}` : undefined,
    `- Net pay: ${inr(slip.net)}`,
    `- Paid days: ${fmtN(slip.paidDays)} of ${slip.daysInMonth}${slip.lopDays ? `, loss of pay ${fmtN(slip.lopDays)}` : ''}`,
    `- ${paid}`,
  );
  const actions: ChatAction[] = [
    { kind: 'download_payslip', label: 'Download payslip (text)', employeeId: t.id, month: slip.month },
    { kind: 'open_page', label: 'Open payslip page', href: `/dashboard/hrms/payslips/${slip.id}` },
  ];
  if (intent === 'payslip_download') {
    return base(intent, slots, {
      answer: `${mine ? 'Your' : `${fullName(t)}'s`} ${fmtMonth(slip.month)} payslip is ready. In the live product I would send the PDF to the phone. In this preview you can download a plain-text copy or open the payslip page.`,
      usedData: used, actions, subjectId: t.id, sensitive, suggestions: ['Payslip summary', 'When is salary credited?'],
    }, who);
  }
  return base(intent, slots, { answer: text, usedData: [...used, entityName(db, run.entityId)].filter(Boolean), actions, subjectId: t.id, sensitive, suggestions: mine ? ['Download payslip', 'When is salary credited?', 'PF and UAN status'] : suggestionsFor(who.role) }, who);
}

function salaryDate(db: HrmsDb, who: Who, me: Employee, slots: Slots, today: ISODate): EngineResult {
  const target = slots.subject.kind === 'person' ? byId(db, slots.subject.id) ?? me : me;
  const mine = target.id === me.id;
  const runs = db.payRuns.filter((r) => r.entityId === target.entityId && r.type === 'regular').sort((a, b) => b.month.localeCompare(a.month));
  const paid = runs.filter((r) => r.paidAt);
  const cur = today.slice(0, 7);
  const curRun = runs.find((r) => r.month === cur);
  const expected = monthEnd(cur);
  const bankMissing = mine && target.payMode === 'bank' && !target.bank;
  return base('salary_date', slots, {
    answer: L(
      paid.length
        ? `Salary has been paid on the last working days of the month: ${paid.slice(0, 2).map((r) => `${fmtMonth(r.month)} on ${fmtDate(r.paidAt!.slice(0, 10))}`).join(', ')}.`
        : 'No pay run has been paid yet.',
      curRun ? `The ${fmtMonth(cur)} run is ${curRun.status}.` : `The ${fmtMonth(cur)} run has not been started. On the same pattern it would be paid around ${fmtDate(expected)}. That is a pattern from past runs, not a promise.`,
      bankMissing ? 'Your bank account is not on file. Add it, or payment cannot be made to you.' : undefined,
      !mine ? 'Pay dates are the same for everyone in the legal entity. I do not look at anyone else\'s pay.' : undefined,
    ),
    usedData: ['Pay runs', entityName(db, target.entityId), ...(mine ? ['Your bank details (present or missing)'] : [])].filter(Boolean),
    subjectId: me.id, suggestions: ['My last payslip', 'Download payslip'],
  }, who);
}

function pfUan(db: HrmsDb, who: Who, me: Employee, slots: Slots, today: ISODate, channel: AssistOptions['channel']): EngineResult {
  const acc = accessFor(db, who, slots.subject, 'pay', 'PF and tax details', channel);
  if (!acc.ok) return refuse('pf_uan', slots, acc.reason!, who);
  if (acc.scope === 'team' || acc.scope === 'all') return needsInfo('pf_uan', slots, 'Name one person, for example "Pooja ka UAN status".', who, [], ['Your role']);
  const t = acc.targets[0]!;
  const mine = acc.scope === 'self';
  const fy = financialYear(today.slice(0, 7));
  const slips = releasedSlips(db, t.id).filter((s) => s.slip.month >= fy.start);
  const pf = slips.reduce((s, x) => s + (x.slip.deductions.find((d) => d.code === 'PF')?.amount ?? 0), 0);
  const uanState = { none: 'not generated', generated: 'generated, not activated', activated: 'activated', aadhaar_seeded: 'activated and linked to Aadhaar' }[t.uanStatus];
  const lines = [
    mine ? `${first(t)}, your PF and UAN status:` : `${fullName(t)}'s PF and UAN status:`,
    `- PF member: ${t.pfMember ? `Yes${t.pfJoinDate ? `, since ${fmtDate(t.pfJoinDate)}` : ''}` : 'No'}`,
    `- UAN: ${t.uan ? `ending ${t.uan.slice(-4)} (${uanState})` : `not on file (${uanState})`}`,
    t.pfMember ? `- Employee PF deducted in ${fy.label} so far: ${inr(pf)} across ${slips.length} payslip${slips.length === 1 ? '' : 's'} in this preview` : undefined,
    t.pfMember && (!t.uan || t.uanStatus !== 'aadhaar_seeded') ? (mine ? 'HR cannot file your PF return until the UAN is added and linked to Aadhaar. If you had a PF account at an earlier job, share that UAN with HR. Otherwise HR can create a new one.' : 'The PF return cannot be filed for this person until the UAN is added and linked to Aadhaar.') : undefined,
    `I show only the last four digits of the UAN. For ${mine ? 'your' : 'the'} PF passbook balance, use the EPFO member portal.`,
  ];
  return base('pf_uan', slots, {
    answer: L(...lines), usedData: ['Employee statutory details', 'Payslips (PF line)'], subjectId: t.id,
    sensitive: mine ? undefined : { employeeId: t.id, field: 'PF and UAN status' },
    suggestions: mine ? ['Tax regime and TDS', 'My last payslip'] : suggestionsFor(who.role),
  }, who);
}

function taxTds(db: HrmsDb, who: Who, me: Employee, slots: Slots, today: ISODate, channel: AssistOptions['channel']): EngineResult {
  const acc = accessFor(db, who, slots.subject, 'pay', 'PF and tax details', channel);
  if (!acc.ok) return refuse('tax_tds', slots, acc.reason!, who);
  if (acc.scope === 'team' || acc.scope === 'all') return needsInfo('tax_tds', slots, 'Name one person, for example "Pooja ka TDS".', who, [], ['Your role']);
  const t = acc.targets[0]!;
  const mine = acc.scope === 'self';
  const fy = financialYear(today.slice(0, 7));
  const slips = releasedSlips(db, t.id).filter((s) => s.slip.month >= fy.start);
  const tds = slips.reduce((s, x) => s + (x.slip.deductions.find((d) => d.code === 'TDS')?.amount ?? 0), 0);
  const cmp = taxComparison(db, t, t.declaration, today.slice(0, 7));
  const est = cmp ? (t.taxRegime === 'old' ? cmp.oldR : cmp.newR) : null;
  const status = { not_submitted: 'not submitted', submitted: 'submitted, waiting for HR', verified: 'verified by HR' }[t.declaration.status];
  const months = slips.length ? `${fmtMonth(slips[slips.length - 1]!.slip.month)} to ${fmtMonth(slips[0]!.slip.month)}` : '';
  return base('tax_tds', slots, {
    answer: L(
      mine ? `${first(t)}, your tax details:` : `${fullName(t)}'s tax details:`,
      `- Tax regime on file: ${t.taxRegime === 'old' ? 'Old' : 'New'}`,
      `- Tax deducted (TDS) so far in ${fy.label}: ${inr(tds)} across ${slips.length} payslip${slips.length === 1 ? '' : 's'}${months ? ` (${months})` : ''}. Earlier months are not loaded in this preview, so this is not a full year to date.`,
      t.taxRegime === 'old' ? `- Investment declaration (Form 124): ${status}` : undefined,
      est ? (est.total === 0 ? `- Estimated tax for the full year at the current salary: none under the ${t.taxRegime} regime, after the standard deduction and rebate` : `- Estimated tax for the full year at the current salary: ${inr(est.total)} (about ${inr(Math.round(est.total / 12))} a month)`) : "- I cannot estimate the year's tax because no salary structure is on file.",
      'Tax rates in this preview are marked "reported", not confirmed. Check with your tax advisor. The comparison of both regimes is under My HR, Tax.',
    ),
    usedData: ['Employee tax regime', 'Payslips (TDS line)', 'Salary structure', 'Tax slabs (Statutory rules)'], subjectId: t.id,
    sensitive: mine ? undefined : { employeeId: t.id, field: 'Tax details' },
    actions: mine ? [{ kind: 'open_page', label: 'Open My HR', href: '/dashboard/hrms/my' }] : undefined,
    suggestions: mine ? ['PF and UAN status', 'My last payslip'] : suggestionsFor(who.role),
  }, who);
}

function holidays(db: HrmsDb, who: Who, me: Employee, slots: Slots, today: ISODate): EngineResult {
  const loc = db.locations.find((l) => l.id === me.locationId);
  const list = db.holidayLists.find((h) => h.id === loc?.holidayListId);
  if (!list) return base('holidays', slots, { answer: 'No holiday list is set for your location yet. Ask HR to assign one.', usedData: ['Locations'] }, who);
  const fmtH = (h: { date: ISODate; name: string; optional: boolean }) => {
    const rel = h.date < today ? 'passed' : h.date === today ? 'today' : diffDays(today, h.date) === 1 ? 'tomorrow' : `in ${diffDays(today, h.date)} days`;
    return `- ${dayLabel(h.date).replace(/ 20\d\d$/, '')}: ${h.name}${h.optional ? ' (optional)' : ''} (${rel})`;
  };
  const used = [`Holiday list: ${list.name}`, `Location: ${loc?.name ?? ''}`];
  const sorted = [...list.holidays].sort((a, b) => a.date.localeCompare(b.date));
  const mine = `${list.name} list for ${loc?.name}`;
  if (slots.holidayNext) {
    const nxt = sorted.find((h) => h.date >= today && !h.optional) ?? sorted.find((h) => h.date >= today);
    return base('holidays', slots, { answer: nxt ? L(`The next holiday on your list (${mine}):`, fmtH(nxt)) : `There is no holiday left on the ${list.name} list after ${fmtDate(today)}.`, usedData: used, suggestions: ['Holidays this month', 'Leave balance'] }, who);
  }
  const cur = today.slice(0, 7);
  const months = slots.month ? [slots.month] : [cur, addMonthsTo(cur, 1)];
  const blocks = months.map((m, i) => {
    const items = sorted.filter((h) => h.date.startsWith(m));
    const label = !slots.month ? (i === 0 ? 'This month, ' : 'Next month, ') : '';
    return L(`${label}${fmtMonth(m)}:`, ...(items.length ? items.map(fmtH) : ['- No holidays on the list']));
  });
  return base('holidays', slots, { answer: L(`Holidays (${mine}):`, ...blocks), usedData: used, suggestions: ['Next holiday', 'Apply leave on 12 Nov'] }, who);
}

function whoManager(db: HrmsDb, who: Who, me: Employee, slots: Slots): EngineResult {
  const acc = accessFor(db, who, slots.subject, 'general');
  if (!acc.ok) return refuse('who_manager', slots, acc.reason!, who);
  if (acc.scope === 'team' || acc.scope === 'all') return needsInfo('who_manager', slots, 'Whose manager? Name one person.', who, [], ['Your role']);
  const t = acc.targets[0]!;
  const mine = acc.scope === 'self';
  const m = t.reportingToId && t.reportingToId !== t.id ? byId(db, t.reportingToId) : undefined;
  const des = (e: Employee) => db.designations.find((d) => d.id === e.designationId)?.name ?? '';
  const dep = (e: Employee) => db.departments.find((d) => d.id === e.departmentId)?.name ?? '';
  const bad = t.reportingToId === t.id;
  return base('who_manager', slots, {
    answer: m
      ? `${mine ? 'Your' : `${fullName(t)}'s`} reporting manager is ${fullName(m)}, ${des(m)} in ${dep(m)}.`
      : bad ? `${mine ? 'You are' : `${fullName(t)} is`} recorded as reporting to ${mine ? 'yourself' : 'themselves'}, which looks like a data mistake. Ask HR to fix the reporting line.`
        : `No reporting manager is recorded for ${mine ? 'you' : fullName(t)}.`,
    usedData: ['Reporting lines', 'Designations'], subjectId: t.id, suggestions: ['My team', 'Leave balance'],
  }, who);
}

function myTeam(db: HrmsDb, who: Who, me: Employee, slots: Slots): EngineResult {
  const subj: Subject = slots.subject.kind === 'person' ? slots.subject : { kind: 'self' };
  const acc = accessFor(db, who, subj, 'general');
  if (!acc.ok) return refuse('my_team', slots, acc.reason!, who);
  const t = acc.targets[0]!;
  const reports = directReports(db, t.id);
  const mine = acc.scope === 'self';
  const des = (e: Employee) => db.designations.find((d) => d.id === e.designationId)?.name ?? '';
  if (reports.length) {
    return base('my_team', slots, { answer: L(`${mine ? 'Your' : `${fullName(t)}'s`} direct reports (${reports.length}):`, ...reports.map((e) => `- ${fullName(e)}, ${des(e)}${e.status === 'on_notice' ? ' (on notice)' : ''}`)), usedData: ['Reporting lines', 'Designations'], subjectId: t.id }, who);
  }
  const m = t.reportingToId && t.reportingToId !== t.id ? byId(db, t.reportingToId) : undefined;
  const peers = m ? directReports(db, m.id).filter((e) => e.id !== t.id) : [];
  return base('my_team', slots, {
    answer: m
      ? L(`${mine ? 'You have' : `${fullName(t)} has`} no direct reports. ${mine ? 'Your' : 'Their'} manager is ${fullName(m)}, who also manages ${peers.length} other ${peers.length === 1 ? 'person' : 'people'}:`, ...peers.slice(0, 8).map((e) => `- ${fullName(e)}, ${des(e)}`), peers.length > 8 ? `- and ${peers.length - 8} more` : undefined)
      : `No team is recorded for ${mine ? 'you' : fullName(t)}: no reporting manager and no direct reports.`,
    usedData: ['Reporting lines', 'Designations'], subjectId: t.id,
  }, who);
}

function shiftToday(db: HrmsDb, who: Who, me: Employee, slots: Slots, today: ISODate): EngineResult {
  const acc = accessFor(db, who, slots.subject, 'general');
  if (!acc.ok) return refuse('shift_today', slots, acc.reason!, who);
  if (acc.scope === 'team' || acc.scope === 'all') return needsInfo('shift_today', slots, 'Whose shift? Name one person.', who, [], ['Your role']);
  const t = acc.targets[0]!;
  const mine = acc.scope === 'self';
  const wd = (weekdayOf(today) + 6) % 7; // Monday = 0
  const row = db.roster.find((r) => r.employeeId === t.id && diffDays(r.weekStart, today) >= 0 && diffDays(r.weekStart, today) < 7);
  const cell = row?.days[wd];
  const shift = db.shifts.find((s) => s.id === (cell && cell !== 'off' ? cell : t.shiftId));
  const loc = db.locations.find((l) => l.id === t.locationId);
  const hol = db.holidayLists.find((h) => h.id === loc?.holidayListId)?.holidays.find((h) => h.date === today && !h.optional);
  const who2 = mine ? 'Your' : `${fullName(t)}'s`;
  if (cell === 'off') return base('shift_today', slots, { answer: `${who2} shift today (${dayLabel(today)}): weekly off, according to this week's roster.`, usedData: ['Roster'], subjectId: t.id }, who);
  if (hol) return base('shift_today', slots, { answer: `Today (${dayLabel(today)}) is ${hol.name}, a public holiday on the ${loc?.name} list. ${who2} usual shift is ${shift ? `${shift.name}, ${shift.start} to ${shift.end}` : 'not set'}.`, usedData: ['Holiday list', 'Shifts'], subjectId: t.id }, who);
  if (!shift) return base('shift_today', slots, { answer: `No shift is set for ${mine ? 'you' : fullName(t)}. Ask HR to assign one.`, usedData: ['Shifts'], subjectId: t.id }, who);
  return base('shift_today', slots, {
    answer: `${who2} shift today (${dayLabel(today)}): ${shift.name}, ${shift.start} to ${shift.end}${shift.isNight ? ' (night shift)' : ''}. ${row ? "From this week's roster." : 'From the default shift on the employee record, as there is no roster row for this week.'}`,
    usedData: [row ? 'Roster' : 'Employee record', 'Shifts'], subjectId: t.id,
  }, who);
}

function policyAnswer(who: Who, slots: Slots, policies: PolicyRef[]): EngineResult {
  const p = slots.policyId ? policies.find((x) => x.id === slots.policyId) : undefined;
  if (p) {
    return base('policy', slots, {
      answer: policyText(p), usedData: [`Policy: ${p.title} v${p.version}`],
      actions: [{ kind: 'open_page', label: `Open ${p.title}`, href: `/dashboard/hrms/policies?policy=${p.id}` }], suggestions: ['Leave policy', 'Travel policy'],
    }, who);
  }
  return base('policy', slots, {
    answer: L('These are the policies on file:', ...policies.map((x) => `- ${x.title} (v${x.version})`), 'Ask about one, for example "travel policy", or open the Policies page for the full text.'),
    usedData: ['Policy titles'], actions: [{ kind: 'open_page', label: 'Open the Policies page', href: '/dashboard/hrms/policies' }],
    suggestions: ['Leave policy', 'Travel policy', 'Can I work from home?'],
  }, who);
}
const policyText = (p: PolicyRef) => L(`${p.title} policy, version ${p.version}, in force from ${fmtDate(p.effectiveFrom)}:`, p.summary, 'I only quote the summary. The full text, the version history and the acknowledgement are on the Policies page.');

function unknown(who: Who, slots: Slots, nearest: string[] = []): EngineResult {
  const can = who.role === 'manager' ? "leave balance, applying leave, payslips, holidays, your team's leave and attendance, policies"
    : who.role === 'hr' ? "leave balance, applying leave, payslips, holidays, anyone's leave and attendance, policies"
      : 'leave balance, applying leave, payslips, salary date, PF and UAN, tax, holidays, your manager, shift, policies';
  return base('unknown', slots, {
    outcome: 'unknown', confidence: 0,
    answer: L("I don't know that yet. I did not understand it well enough to answer, and I will not guess.", `Here is what I can do: ${can}.`, nearest.length ? `The closest things I can do: ${nearest.join(', ')}.` : undefined),
    usedData: [], suggestions: suggestionsFor(who.role),
  }, who);
}

export const INTENT_LABEL: Record<IntentId, string> = {
  greeting: 'Greeting', help: 'Help', thanks: 'Thanks', leave_balance: 'Leave balance', apply_leave: 'Apply leave', team_leave: 'Team leave', attendance: 'Attendance',
  payslip_summary: 'Payslip summary', payslip_download: 'Payslip download', salary_date: 'Salary date', pf_uan: 'PF and UAN', tax_tds: 'Tax and TDS', holidays: 'Holidays',
  who_manager: 'My manager', my_team: 'My team', shift_today: 'Shift today', policy: 'Policy', unknown: 'Not understood',
};

/** The policy whose topic words best match the text. */
export function findPolicy(text: string, policies: PolicyRef[] = DEFAULT_POLICIES): PolicyRef | undefined {
  const n = normalise(text);
  const best = policies.map((p) => ({ p, hits: topicHits(n, p) })).sort((a, b) => b.hits - a.hits)[0];
  return best && best.hits > 0 ? best.p : undefined;
}

// ───────────────────────────── the full path: text in, answer out ─────────────────────────────
export function ask(db: HrmsDb, who: Who, text: string, opts: AssistOptions = {}): EngineResult {
  const policies = opts.policies ?? DEFAULT_POLICIES;
  const p = parse(db, who, text, opts);
  if (p.intent === 'unknown') {
    const near = (Object.entries(p.scores) as [IntentId, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => INTENT_LABEL[id]);
    return unknown(who, p.slots, near);
  }
  const personal = !['help', 'greeting', 'thanks', 'policy', 'holidays', 'salary_date'].includes(p.intent);
  if (p.slots.ambiguous?.length && personal) {
    return base(p.intent, p.slots, {
      outcome: 'needs_info', confidence: p.confidence,
      answer: `I found more than one person for ${p.slots.ambiguous.join(' and ')}. Please ask about one person at a time, with the full name.`,
      usedData: ['Employee names'],
    }, who);
  }
  const slots: Slots = p.intent === 'policy' ? { ...p.slots, policyId: findPolicy(text, policies)?.id } : p.slots;
  return execute(db, who, p.intent, slots, opts, p.confidence);
}

/** A plain-text copy of one payslip, for the "download" action in the preview. Masks nothing it does not include: no PAN, Aadhaar or bank number. */
export function payslipAsText(db: HrmsDb, employeeId: Id, month: Month): { filename: string; text: string } | null {
  const e = byId(db, employeeId);
  const hit = e ? releasedSlips(db, employeeId).find((s) => s.slip.month === month) : undefined;
  if (!e || !hit) return null;
  const { slip, run } = hit;
  const row = (l: { name: string; amount: number }) => `  ${l.name.padEnd(34)} ${inr(l.amount).padStart(12)}`;
  const text = L(
    entityName(db, run.entityId), `Payslip for ${fmtMonth(slip.month)}`, '',
    `Employee: ${fullName(e)} (${e.code})`, `Paid days: ${fmtN(slip.paidDays)} of ${slip.daysInMonth}${slip.lopDays ? `, loss of pay ${fmtN(slip.lopDays)}` : ''}`, '',
    'Earnings', ...slip.earnings.map(row), `  ${'Gross'.padEnd(34)} ${inr(slip.gross).padStart(12)}`, '',
    'Deductions', ...slip.deductions.map(row), `  ${'Total deductions'.padEnd(34)} ${inr(slip.totalDeductions).padStart(12)}`, '',
    ...(slip.reimbursements.length ? ['Reimbursements', ...slip.reimbursements.map(row), ''] : []),
    `Net pay: ${inr(slip.net)}`, '', 'Sample data from the HRMS preview. Not a legal document.',
  );
  return { filename: `payslip-${slip.month}-${e.firstName.toLowerCase()}-${e.lastName.toLowerCase()}.txt`, text };
}
