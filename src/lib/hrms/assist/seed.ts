// Sample data for the policies, POSH, org chart and assistant pages. Deterministic: no Math.random, no clock.
// The people are the 25 in the core seed (emp_1 .. emp_25). Legal references are tagged with how far to trust them.

import { makeRng } from '../areaStore';
import { addDays, diffDays } from '../format';
import { PREVIEW_TODAY } from '../seed';
import type {
  AssistLeaveRequest, McpLogEntry, Policy, PolicyAck, PolicyVersion, PoshState, Vacancy,
} from './types';

const sub = (text: string, pairs: [string, string][]): string => pairs.reduce((t, [a, b]) => { if (!t.includes(a)) throw new Error(`seed text: "${a}" not found`); return t.replace(a, b); }, text);
const ver = (version: string, effectiveFrom: string, publishedOn: string, publishedBy: string, changeSummary: string, text: string, requiresAck = true): PolicyVersion => (
  { version, effectiveFrom, publishedOn, publishedBy, changeSummary, requiresAck, text }
);

// ───────────────────────────── policy texts (newest version written out, older ones derived) ─────────────────────────────
const LEAVE = `Leave policy

Who it covers: all employees of Meridian Retail and Meridian Logistics.

Leave types
- Casual leave: 8 days a year, up to 3 days at a time. It does not carry forward.
- Sick leave: 8 days a year. A medical note is needed after 2 days. Up to 8 days carry forward.
- Earned leave: 1.25 days a month after 6 months of service. Up to 30 days carry forward.
- Compensatory off: for work on a weekly off or a holiday. Use it within 60 days.
- Maternity leave: as the Maternity Benefit Act provides. Talk to People before you apply.

How to apply
- Apply in the app at least 2 working days ahead for planned leave.
- For sudden illness, tell your manager the same day and apply when you are back.
- Your manager approves or declines within 2 working days.

Rules
- Sundays and public holidays inside a leave period are not counted for casual and earned leave.
- Leave without pay applies when your balance is used up.
- Unused earned leave can be encashed when you leave, up to the cap above.`;
const LEAVE_V2 = sub(LEAVE, [['Sick leave: 8 days a year.', 'Sick leave: 6 days a year.'], ['Up to 8 days carry forward.', 'Up to 6 days carry forward.'], ['Your manager approves or declines within 2 working days.', 'Your manager approves or declines within 3 working days.']]);
const LEAVE_V1 = sub(LEAVE_V2, [['Casual leave: 8 days a year, up to 3 days at a time.', 'Casual leave: 6 days a year, up to 2 days at a time.'], ['at least 2 working days ahead', 'at least 3 working days ahead'], ['Compensatory off: for work on a weekly off or a holiday. Use it within 60 days.', 'Compensatory off: for work on a weekly off. Use it within 30 days.']]);

const TRAVEL = `Travel and expense policy

Who it covers: everyone who travels or spends for work. Field staff also follow the field rate card.

Before you travel
- Get your manager's approval for any trip that needs a flight or an overnight stay.
- Book through the company travel desk where there is one.

What the company pays
- Local travel for client visits: the actual fare by auto, metro or cab, or the per-kilometre rate for your own two-wheeler.
- Hotel: up to the city cap on the rate card. Metro cities have a higher cap.
- Meals while travelling: up to the daily limit on the rate card. No alcohol.

How to claim
- Submit within 30 days of the expense, with the bill or ticket.
- Claims above ₹5,000 need a second approver (the finance lead).
- Approved claims are paid with the next salary run.

Not paid
- Fines, personal items, and expenses without a bill.
- If a bill is truly not available, your manager can sign a no-bill note, once a month at most.`;
const TRAVEL_V2 = sub(TRAVEL, [['Submit within 30 days', 'Submit within 45 days'], ['above ₹5,000 need a second approver', 'above ₹10,000 need a second approver'], ['once a month at most', 'with no monthly limit']]);
const TRAVEL_V1 = sub(TRAVEL_V2, [['Book through the company travel desk where there is one.', 'Book your own tickets and keep the receipts.'], ['Meals while travelling: up to the daily limit on the rate card. No alcohol.', 'Meals while travelling: up to the daily limit on the rate card.']]);

const CONDUCT = `Code of conduct

- Treat colleagues, customers and partners with respect. No bullying, shouting or discrimination.
- Be honest in records, reports and claims.
- Tell your manager and the People team in writing about any conflict of interest.
- Gifts from vendors or customers worth more than ₹2,000 must be declared.
- Keep company and customer information confidential, during and after your employment.
- Do not use the company name or assets for personal business.
- Raise a concern with your manager, the People team or ethics@meridian.example. Nobody is punished for raising a concern in good faith.
- Breaches are handled fairly: you hear the concern and can reply before any decision. Serious breaches can lead to disciplinary action.`;
const CONDUCT_V1 = sub(CONDUCT, [['worth more than ₹2,000', 'worth more than ₹5,000'], ['Raise a concern with your manager, the People team or ethics@meridian.example.', 'Raise a concern with your manager or the People team.']]);

const POSH = `Prevention of sexual harassment (POSH) policy

Our promise: everyone has the right to a workplace free of sexual harassment.

What counts
- Unwelcome physical contact or advances, requests for sexual favours, sexually coloured remarks, showing sexual material, or any other unwelcome conduct of a sexual nature, in person or online.

How to complain
- Write to the Internal Committee (IC) at ic@meridian.example, or tell any IC member.
- Your complaint is handled in confidence. Names and details are shared only with the IC members who need them.
- The IC will explain the steps and the expected timeline at the start.

What happens next
- The IC holds an inquiry, hears both sides and gives a written report.
- Action is decided on the report. Both people are told the outcome.
- Retaliation against anyone who complains or helps an inquiry is a breach of this policy.

Awareness
- Every employee completes awareness training once a year.
- IC members get extra training.`;
const POSH_V1 = sub(POSH, [['Write to the Internal Committee (IC) at ic@meridian.example, or tell any IC member.', 'Write to the Internal Committee (IC) or tell any IC member.'], ['- IC members get extra training.', '- IC members get extra training when they join the committee.'], ['Both people are told the outcome.', 'The people involved are told the outcome.']]);

const IT = `IT and data use policy

- Use company laptops, phones and accounts for work first. Light personal use is fine if it does not put data at risk.
- Use a strong password and multi-factor sign-in on every company account. Never share your password.
- Do not keep customer or employee data on personal devices, personal email or personal cloud drives.
- Do not paste customer or employee data into public AI tools or websites.
- Report a lost device or a suspected breach to IT within 24 hours. Do not wait to be sure.
- Aadhaar numbers are never stored in full. Keep only the last four digits.
- Software is installed by IT. Ask IT if you need something new.
- When you leave, return all devices. Your access is closed on your last working day.`;
const IT_V12 = sub(IT, [['- Do not paste customer or employee data into public AI tools or websites.\n', ''], ['within 24 hours', 'within 48 hours']]);
const IT_V1 = sub(IT_V12, [['Use a strong password and multi-factor sign-in on every company account.', 'Use a strong password on every company account.']]);

const ATTENDANCE = `Attendance policy

- Office staff work to their shift. The General shift is 9:30 to 18:30 with a one-hour break. Warehouse and retail shifts follow the roster.
- A grace of 15 minutes applies to the General shift, and 10 minutes on other shifts.
- Three late marks in a month count as a half-day of casual leave, unless your manager excuses them for a good reason.
- Field staff mark attendance with a verified visit or a punch in the app. Location is used to check the visit, never to follow you after work.
- If you miss a punch, ask for a correction within 3 working days. Your manager decides, and you can reply before any effect on pay.
- Overtime is approved before it is worked and needs your consent. It is paid at twice the ordinary rate.`;
const ATTENDANCE_V2 = sub(ATTENDANCE, [['A grace of 15 minutes applies to the General shift, and 10 minutes on other shifts.', 'A grace of 10 minutes applies to every shift.'], ['Three late marks', 'Two late marks'], ['within 3 working days', 'within 2 working days'], ['Overtime is approved before it is worked and needs your consent. It is paid at twice the ordinary rate.', 'Overtime is approved before it is worked. It is paid at twice the ordinary rate.']]);

const INCENTIVE = `Sales incentive plan

Who it covers: Sales and Field team members who have a quarterly target.

- Incentive is paid every quarter on the target set in your target letter.
- Below 70% of target: no incentive. From 70% to 100%: paid in proportion. Above 100%: the extra is paid at 1.2 times, up to 150% of the target incentive.
- Only verified visits and confirmed orders count toward the target.
- If you disagree with your statement, raise it within 15 days. A manager and the People team review it together, and you can add your side.
- The company can change the plan from the next quarter with 30 days' notice.
- Payment if you leave before the payout date follows your target letter.`;
const INCENTIVE_V1 = sub(INCENTIVE, [['Below 70% of target: no incentive. From 70% to 100%: paid in proportion. Above 100%: the extra is paid at 1.2 times, up to 150% of the target incentive.', 'Below 80% of target: no incentive. From 80% to 100%: paid in proportion. Above 100%: the extra is paid at 1.2 times, up to 150% of the target incentive.'], ['Only verified visits and confirmed orders count toward the target.', 'Confirmed orders count toward the target.'], ['within 15 days', 'within 30 days']]);

const REMOTE = `Remote and field work policy

- Field roles work from their beats and territory, and the app records visits. Office roles may work from home up to 2 days a week with manager approval.
- Warehouse and retail roles work on site.
- Be reachable during your shift hours. Camera-on calls are for meetings, not for monitoring.
- Use a private place for work calls that involve customer data. Use the company VPN on public Wi-Fi.
- Field staff: share your plan for the day with your manager each morning, and tell them when the route changes.
- Safety first: do not ride or drive while using the phone. Report any incident the same day.
- The company pays field allowance and travel as per the Travel and expense policy. Home-office costs are not reimbursed unless approved.`;
const REMOTE_V1 = sub(REMOTE, [['up to 2 days a week', 'up to 1 day a week'], ['Use the company VPN on public Wi-Fi.', 'Use the company VPN on public Wi-Fi and never on shared computers.']]);

// ───────────────────────────── policies ─────────────────────────────
const P = 'Ritu Malhotra';
export function seedPolicies(): Policy[] {
  return [
    {
      id: 'pol_leave', title: 'Leave', category: 'Time and leave', owner: 'Ritu Malhotra, People', summary: 'Casual, sick and earned leave, how to apply, and who approves.',
      audience: { kind: 'all' }, keywords: ['leave', 'leaves', 'casual', 'sick', 'earned', 'maternity', 'comp off', 'compensatory', 'encash', 'chhutti', 'vacation', 'time off'],
      legal: [{ text: 'State Shops and Establishments Acts set minimum leave for many workplaces. The rules differ by state.', confidence: 'indicative' }, { text: 'Maternity leave follows the Maternity Benefit Act.', confidence: 'reported' }],
      versions: [
        ver('1.0', '2024-04-01', '2024-03-20', P, 'First version.', LEAVE_V1),
        ver('2.0', '2026-04-01', '2026-03-18', P, 'Casual leave raised to 8 days. Comp off window widened to 60 days. Planned leave needs 2 working days notice.', LEAVE_V2),
        ver('2.1', '2026-07-01', '2026-06-22', P, 'Sick leave raised to 8 days with carry forward. Managers now decide within 2 working days.', LEAVE),
      ],
    },
    {
      id: 'pol_travel', title: 'Travel & expense', category: 'Finance', owner: 'Neha Bansal, Finance', summary: 'What the company pays for travel, hotels and meals, and how to claim.',
      audience: { kind: 'all' }, keywords: ['travel', 'expense', 'expenses', 'reimbursement', 'reimburse', 'claim', 'hotel', 'flight', 'cab', 'meal', 'per km', 'mileage', 'bill', 'bills', 'kharcha'],
      legal: [],
      versions: [
        ver('1.0', '2025-04-01', '2025-03-24', 'Neha Bansal', 'First version.', TRAVEL_V1),
        ver('2.0', '2026-04-01', '2026-03-25', 'Neha Bansal', 'Travel desk added. Meal rule now says no alcohol.', TRAVEL_V2),
        ver('2.1', '2026-10-20', '2026-10-14', 'Neha Bansal', 'Claim window cut to 30 days. A second approver is needed above ₹5,000. No-bill notes limited to once a month.', TRAVEL),
      ],
    },
    {
      id: 'pol_conduct', title: 'Code of conduct', category: 'Ethics', owner: 'Ritu Malhotra, People', summary: 'Respect, honesty, conflicts of interest, gifts and how to raise a concern.',
      audience: { kind: 'all' }, keywords: ['conduct', 'ethics', 'ethical', 'behaviour', 'behavior', 'gift', 'gifts', 'conflict', 'bullying', 'discipline', 'disciplinary', 'confidential'],
      legal: [],
      versions: [
        ver('1.0', '2023-04-01', '2023-03-27', P, 'First version.', CONDUCT_V1),
        ver('1.1', '2025-06-01', '2025-05-20', P, 'Gift limit lowered to ₹2,000. An ethics email address added.', CONDUCT),
      ],
    },
    {
      id: 'pol_posh', title: 'POSH', category: 'Safety and compliance', owner: 'Ritu Malhotra, People', summary: 'How to raise a sexual harassment complaint with the Internal Committee, and what happens next.',
      audience: { kind: 'all' }, keywords: ['posh', 'harassment', 'sexual', 'internal committee', 'complaint', 'complain', 'molest', 'safety at work'],
      legal: [
        { text: 'The Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013 requires an Internal Committee where an office has 10 or more employees.', confidence: 'reported' },
        { text: 'The Act sets time limits for the inquiry and for action on the report. Check the current limits with your legal advisor before you rely on them.', confidence: 'indicative' },
      ],
      versions: [
        ver('1.0', '2023-04-01', '2023-03-27', P, 'First version.', POSH_V1),
        ver('1.1', '2025-09-01', '2025-08-22', P, 'IC email address added. Both people are told the outcome. Annual training stated.', POSH),
      ],
    },
    {
      id: 'pol_it', title: 'IT & data use', category: 'Technology', owner: 'Divya Menon, Technology', summary: 'Passwords, devices, customer data, public AI tools and what to do after a loss or breach.',
      audience: { kind: 'all' }, keywords: ['it policy', 'laptop', 'device', 'phone', 'password', 'data', 'privacy', 'ai tool', 'chatgpt', 'breach', 'software', 'aadhaar', 'security', 'vpn'],
      legal: [{ text: 'India\'s Digital Personal Data Protection Act, 2023 and its rules govern personal data. Check which rules are in force with your advisor.', confidence: 'reported' }],
      versions: [
        ver('1.0', '2024-01-01', '2023-12-20', 'Divya Menon', 'First version.', IT_V1),
        ver('1.2', '2026-02-01', '2026-01-22', 'Divya Menon', 'Multi-factor sign-in required on company accounts. Aadhaar kept as last four digits only.', IT_V12),
        ver('2.0', '2026-09-15', '2026-09-08', 'Divya Menon', 'No customer or employee data in public AI tools. Breach reports due within 24 hours.', IT),
      ],
    },
    {
      id: 'pol_attendance', title: 'Attendance', category: 'Time and leave', owner: 'Tanvi Kapoor, People', summary: 'Shifts, grace time, late marks, missed punches and overtime.',
      audience: { kind: 'all' }, keywords: ['attendance', 'late', 'punch', 'shift', 'grace', 'overtime', 'half day', 'half-day', 'regularise', 'regularize', 'timing', 'timings'],
      legal: [{ text: 'Overtime at twice the ordinary rate follows the Labour Codes as reported. Confirm with your advisor.', confidence: 'reported' }],
      versions: [
        ver('2.0', '2025-04-01', '2025-03-24', 'Tanvi Kapoor', 'First version in this system.', ATTENDANCE_V2),
        ver('3.0', '2026-11-01', '2026-10-26', 'Tanvi Kapoor', 'Grace time set by shift. Three late marks, not two. Missed punches can be corrected within 3 days. Overtime needs consent.', ATTENDANCE),
      ],
    },
    {
      id: 'pol_incentive', title: 'Incentive plan', category: 'Sales', owner: 'Arvind Nair, Sales', summary: 'How the quarterly sales incentive is earned, counted and disputed.',
      audience: { kind: 'departments', ids: ['dep_sales'] }, keywords: ['incentive', 'target', 'commission', 'payout', 'quota', 'sales plan'],
      legal: [],
      versions: [
        ver('1.0', '2025-04-01', '2025-03-24', 'Arvind Nair', 'First version.', INCENTIVE_V1),
        ver('1.1', '2026-04-01', '2026-03-25', 'Arvind Nair', 'Threshold lowered to 70%. Only verified visits count. Dispute window cut to 15 days.', INCENTIVE),
      ],
    },
    {
      id: 'pol_remote', title: 'Remote / field work', category: 'Ways of working', owner: 'Ritu Malhotra, People', summary: 'Working from home, working in the field, safety and what the company pays for.',
      audience: { kind: 'all' }, keywords: ['remote', 'wfh', 'work from home', 'field', 'home office', 'vpn', 'beat', 'route', 'safety'],
      legal: [],
      versions: [
        ver('1.0', '2024-07-01', '2024-06-24', P, 'First version.', REMOTE_V1),
        ver('1.1', '2026-04-01', '2026-03-25', P, 'Office roles may work from home up to 2 days a week. Home-office costs clarified.', REMOTE, false),
      ],
    },
  ];
}

/** The share of each policy's audience that has acknowledged its current version in the sample data. */
const ACK_RATE: Record<string, number> = { pol_leave: 0.95, pol_travel: 0.36, pol_conduct: 1, pol_posh: 1, pol_it: 0.55, pol_attendance: 0.2, pol_incentive: 0.9, pol_remote: 0.8 };

/** Acknowledgements for the sample people. `people` are the core employees, so dates never come before a person joined. */
export function seedAcks(policies: Policy[], people: { id: string; departmentId: string; joinDate: string; status: string }[]): PolicyAck[] {
  const out: PolicyAck[] = [];
  const rng = makeRng(20261107);
  const live = people.filter((e) => e.status === 'active' || e.status === 'on_notice');
  const later = (a: string, b: string) => (a > b ? a : b);
  for (const p of policies) {
    const cur = p.versions[p.versions.length - 1]!;
    const prev = p.versions.length > 1 ? p.versions[p.versions.length - 2]! : null;
    const aud = p.audience.kind === 'all' ? live : live.filter((e) => p.audience.kind === 'departments' && p.audience.ids.includes(e.departmentId));
    for (const e of aud) {
      const from = later(cur.publishedOn, e.joinDate);
      const span = Math.max(1, diffDays(from, PREVIEW_TODAY));
      const did = rng() < (ACK_RATE[p.id] ?? 0.8);
      if (did) out.push({ policyId: p.id, version: cur.version, employeeId: e.id, at: addDays(from, Math.min(span, Math.floor(rng() * Math.min(span, 14)) + 1)) });
      else if (prev && e.joinDate <= prev.publishedOn) out.push({ policyId: p.id, version: prev.version, employeeId: e.id, at: addDays(prev.publishedOn, Math.floor(rng() * 10) + 1) });
    }
  }
  return out;
}

// ───────────────────────────── POSH ─────────────────────────────
export function seedPosh(): PoshState {
  return {
    committee: {
      constitutedOn: '2025-04-01', tenureEnds: '2028-03-31',
      members: [
        { id: 'ic_1', role: 'presiding', employeeId: 'emp_1' },
        { id: 'ic_2', role: 'member', employeeId: 'emp_3' },
        { id: 'ic_3', role: 'member', employeeId: 'emp_16' },
        { id: 'ic_4', role: 'member', employeeId: 'emp_10' },
        { id: 'ic_5', role: 'external', name: 'Meera Kulkarni (sample name)', org: "Women's rights NGO (sample)", gender: 'female' },
      ],
    },
    cases: [
      { id: 'POSH-2026-001', receivedOn: '2026-02-12', nature: 'verbal', status: 'closed', closedOn: '2026-04-20', outcome: 'action_taken' },
      { id: 'POSH-2026-002', receivedOn: '2026-05-06', nature: 'written_online', status: 'closed', closedOn: '2026-07-10', outcome: 'no_action' },
      { id: 'POSH-2026-003', receivedOn: '2026-08-18', nature: 'verbal', status: 'inquiry' },
      { id: 'POSH-2026-004', receivedOn: '2026-10-29', nature: 'other', status: 'received' },
    ],
    sessions: [
      { id: 'ps_1', date: '2026-03-14', title: 'Awareness session for office staff', mode: 'online', attendees: ['emp_1', 'emp_2', 'emp_3', 'emp_4', 'emp_5', 'emp_6', 'emp_7', 'emp_8', 'emp_9', 'emp_10'] },
      { id: 'ps_2', date: '2026-06-20', title: 'Awareness session, warehouse and Bengaluru', mode: 'in_person', attendees: ['emp_11', 'emp_12', 'emp_13', 'emp_14', 'emp_15', 'emp_16', 'emp_17', 'emp_18'] },
    ],
  };
}

// ───────────────────────────── org chart ─────────────────────────────
export function seedVacancies(): Vacancy[] {
  return [
    { id: 'vac_1', title: 'Field Executive', managerId: 'emp_4', departmentId: 'dep_sales', locationId: 'loc_del', targetMonth: '2026-12', note: 'Backfill for the notice period on 30 Nov.' },
    { id: 'vac_2', title: 'Area Sales Executive', managerId: 'emp_4', departmentId: 'dep_sales', locationId: 'loc_del', targetMonth: '2027-01' },
    { id: 'vac_3', title: 'Territory Manager', managerId: 'emp_2', departmentId: 'dep_sales', locationId: 'loc_blr', targetMonth: '2027-01', note: 'Planned for the Bengaluru expansion.' },
  ];
}

// ───────────────────────────── assistant ─────────────────────────────
export function seedLeaveRequests(): AssistLeaveRequest[] {
  const mk = (id: string, employeeId: string, code: string, typeId: string, from: string, to: string, days: number, status: AssistLeaveRequest['status'], createdAt: string): AssistLeaveRequest => (
    { id, employeeId, leaveTypeId: typeId, leaveCode: code, from, to, days, half: false, reason: 'Requested in the HR assistant', status, createdAt, via: 'seed' }
  );
  return [
    mk('lr_seed_1', 'emp_20', 'CL', 'lv_cl', '2026-11-10', '2026-11-11', 2, 'pending', '2026-11-05T08:40:00.000Z'),
    mk('lr_seed_2', 'emp_6', 'EL', 'lv_el', '2026-11-12', '2026-11-13', 2, 'pending', '2026-11-04T11:05:00.000Z'),
    mk('lr_seed_3', 'emp_8', 'SL', 'lv_sl', '2026-11-09', '2026-11-09', 1, 'approved', '2026-11-06T07:30:00.000Z'),
  ];
}

export function seedMcpLog(): McpLogEntry[] {
  const e = (n: number, at: string, employeeId: string, role: McpLogEntry['role'], tool: string, args: string, outcome: McpLogEntry['outcome'], records: number, note?: string): McpLogEntry => (
    { id: `mcp_seed_${n}`, at, client: 'AI assistant (sample)', employeeId, role, tool, args, outcome, records, note }
  );
  return [
    e(1, '2026-11-06T09:12:00.000Z', 'emp_7', 'employee', 'get_leave_balance', '{}', 'ok', 3),
    e(2, '2026-11-06T09:13:30.000Z', 'emp_7', 'employee', 'get_payslip_summary', '{"month":"2026-10"}', 'ok', 1),
    e(3, '2026-11-06T10:02:10.000Z', 'emp_4', 'manager', 'list_team_leave', '{"window_days":7}', 'ok', 7),
    e(4, '2026-11-06T10:03:44.000Z', 'emp_4', 'manager', 'get_payslip_summary', '{"employee_id":"emp_7"}', 'denied', 0, 'Salary of other people is not shared with managers.'),
    e(5, '2026-11-06T11:20:05.000Z', 'emp_18', 'hr', 'get_leave_balance', '{"employee_id":"emp_20"}', 'ok', 3),
    e(6, '2026-11-06T11:21:40.000Z', 'emp_18', 'hr', 'get_payslip_summary', '{"employee_id":"emp_20"}', 'denied', 0, "Other people's pay is never exposed through MCP. Use the Payroll module."),
    e(7, '2026-11-06T15:48:22.000Z', 'emp_7', 'employee', 'apply_leave_draft', '{"from":"2026-11-16","to":"2026-11-16"}', 'ok', 1, 'Draft only. Nothing was submitted.'),
    e(8, '2026-11-06T15:50:02.000Z', 'emp_7', 'employee', 'get_policy', '{"topic":"travel"}', 'ok', 1),
  ];
}
