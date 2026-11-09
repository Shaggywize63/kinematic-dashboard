// Deterministic sample data for Recruitment, Workforce planning and Performance. Same people as the core seed
// (emp_1..emp_25, Meridian Retail and Meridian Logistics). Nothing here uses Math.random, Date.now or new Date().

import { makeRng } from '../areaStore';
import { addDays } from '../format';
import { PREVIEW_TODAY } from '../seed';
import { getFieldEvidence } from '../field/evidence';
import type {
  ActionItem, ApprovalEntry, Candidate, CompetencyRating, Cycle, FeedbackRequest, Goal, HiringPlan, HiringState, KeyResult, KrUnit,
  OneNote, OneThread, Opening, PlanLine, RejectCode, Review, ReviewForm, Scenario, Scorecard, Source, Stage, StageMove,
} from './types';
import { PERF_COMPETENCIES } from './types';

const D = { sales: 'dep_sales', ops: 'dep_ops', fin: 'dep_fin', hr: 'dep_hr', wh: 'dep_wh', tech: 'dep_tech' };
const L = { del: 'loc_del', blr: 'loc_blr', mum: 'loc_mum' };
const FY_MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];

// ═════════════════════════════ openings ═════════════════════════════
const ap = (n: number, decision: ApprovalEntry['decision'], by: string, on: string, note?: string): ApprovalEntry => ({ id: `ap_${n}_${decision}_${on}`, decision, by, on, note });

function openings(): Opening[] {
  return [
    {
      id: 'open_ase_del', title: 'Area Sales Executive', departmentId: D.sales, locationId: L.del, designationId: 'des_ase', headcount: 2, filled: 0,
      bandMin: 480000, bandMax: 660000, hiringManagerId: 'emp_4', status: 'open', createdOn: '2026-09-21', openedOn: '2026-09-28',
      approvals: [ap(1, 'submitted', 'Rohit Chauhan', '2026-09-21', 'Two seats for Delhi: one backfill, one new beat.'), ap(1, 'approved', 'Ritu Malhotra', '2026-09-28', 'Within the plan for Delhi sales.')],
    },
    {
      id: 'open_fe_blr', title: 'Field Executive', departmentId: D.sales, locationId: L.blr, designationId: 'des_fe', headcount: 1, filled: 0,
      bandMin: 280000, bandMax: 360000, hiringManagerId: 'emp_2', status: 'open', createdOn: '2026-10-14', openedOn: '2026-10-19',
      approvals: [ap(2, 'submitted', 'Arvind Nair', '2026-10-14'), ap(2, 'approved', 'Ritu Malhotra', '2026-10-19', 'Planned for Bengaluru East.')],
    },
    {
      id: 'open_swe_blr', title: 'Software Engineer', departmentId: D.tech, locationId: L.blr, designationId: 'des_dev', headcount: 2, filled: 1,
      bandMin: 1200000, bandMax: 1800000, hiringManagerId: 'emp_5', status: 'open', createdOn: '2026-08-18', openedOn: '2026-08-25',
      approvals: [ap(3, 'submitted', 'Divya Menon', '2026-08-18'), ap(3, 'approved', 'Ritu Malhotra', '2026-08-25', 'Two seats approved; the second can wait for the first to settle.')],
    },
    {
      id: 'open_ops_del', title: 'Operations Associate', departmentId: D.ops, locationId: L.del, designationId: 'des_ops', headcount: 1, filled: 0,
      bandMin: 300000, bandMax: 400000, hiringManagerId: 'emp_10', status: 'on_hold', createdOn: '2026-07-13', openedOn: '2026-07-20',
      holdReason: 'Waiting for the Q4 volume forecast. Review again on 30 Nov.',
      approvals: [ap(4, 'submitted', 'Vikram Joshi', '2026-07-13'), ap(4, 'approved', 'Ritu Malhotra', '2026-07-20'), ap(4, 'held', 'Ritu Malhotra', '2026-10-27', 'Volumes may drop after Diwali. Hold until the forecast is in.')],
    },
    {
      id: 'open_acc_del', title: 'Accounts Executive', departmentId: D.fin, locationId: L.del, designationId: 'des_acc', headcount: 1, filled: 1,
      bandMin: 600000, bandMax: 800000, hiringManagerId: 'emp_3', status: 'filled', createdOn: '2026-08-25', openedOn: '2026-09-01', closedOn: '2026-10-20',
      approvals: [ap(5, 'submitted', 'Neha Bansal', '2026-08-25'), ap(5, 'approved', 'Ritu Malhotra', '2026-09-01'), ap(5, 'filled', 'Tanvi Kapoor', '2026-10-20', 'Offer accepted.')],
    },
    {
      id: 'open_hr_del', title: 'HR Executive, Talent', departmentId: D.hr, locationId: L.del, designationId: 'des_hr', headcount: 1, filled: 0,
      bandMin: 480000, bandMax: 600000, hiringManagerId: 'emp_1', status: 'draft', createdOn: '2026-11-05', approvals: [],
    },
    {
      id: 'open_wh_mum', title: 'Warehouse Associate', departmentId: D.wh, locationId: L.mum, designationId: 'des_wh', headcount: 3, filled: 0,
      bandMin: 200000, bandMax: 260000, hiringManagerId: 'emp_12', status: 'pending_approval', createdOn: '2026-11-04',
      approvals: [ap(7, 'submitted', 'Manoj Patil', '2026-11-04', 'Festive volumes. Three more pickers for the night and early shifts.')],
    },
  ];
}

// ═════════════════════════════ candidates ═════════════════════════════
const sc = (id: string, round: string, interviewerId: string, on: string, pairs: [string, number, string?][], summary?: string): Scorecard => ({
  id, round, interviewerId, on, summary,
  ratings: pairs.map(([competency, rating, comment]): CompetencyRating => ({ competency, rating, comment })),
});
const RK = 'Role knowledge', PS = 'Problem solving', CM = 'Communication', OW = 'Ownership', TW = 'Teamwork', LA = 'Learning agility';

interface CSpec {
  id: string; name: string; opening: string; source: Source; exp: number; ctc: number; notice: number; applied: string;
  path: Stage[]; gaps: number[]; reason?: RejectCode; notes?: string; cards?: Scorecard[]; offer?: Candidate['offer']; emp?: string;
}

function history(c: CSpec): StageMove[] {
  const out: StageMove[] = [{ from: null, to: 'applied', on: c.applied, by: c.source === 'agency' ? 'Agency' : c.source === 'referral' ? 'Referral form' : 'Application' }];
  let d = c.applied;
  let prev: Stage = 'applied';
  c.path.forEach((s, i) => {
    d = addDays(d, c.gaps[i] ?? 3);
    if (d > PREVIEW_TODAY) d = PREVIEW_TODAY;
    out.push({ from: prev, to: s, on: d, by: 'Tanvi Kapoor', reason: s === 'rejected' ? c.reason : undefined });
    prev = s;
  });
  return out;
}

function candidates(): Candidate[] {
  const specs: CSpec[] = [
    // Area Sales Executive, Delhi
    { id: 'cand_01', name: 'Nikhil Arora', opening: 'open_ase_del', source: 'referral', exp: 4, ctc: 600000, notice: 30, applied: '2026-10-02', path: ['screen', 'interview', 'offer'], gaps: [3, 6, 8],
      notes: 'Strong on dealer visits in West Delhi. Can join earlier if the notice is bought out.',
      cards: [
        sc('sc_01_1', 'Phone screen', 'emp_18', '2026-10-05', [[RK, 4], [CM, 4], [PS, 3], [OW, 4]], 'Clear about his territory and numbers.'),
        sc('sc_01_2', 'Role / technical round', 'emp_4', '2026-10-11', [[RK, 4, 'Walked through a dealer onboarding end to end.'], [PS, 4], [CM, 3], [TW, 4], [OW, 4]]),
        sc('sc_01_3', 'Manager round', 'emp_2', '2026-10-19', [[RK, 4], [CM, 4], [OW, 5, 'Gave two examples of following up after a lost deal.'], [LA, 4]]),
      ],
      offer: { ctc: 600000, joiningDate: '2026-12-07', structureId: 'str_field', status: 'extended', extendedOn: '2026-10-22' } },
    { id: 'cand_02', name: 'Kavita Rao', opening: 'open_ase_del', source: 'job_board', exp: 5, ctc: 640000, notice: 60, applied: '2026-10-06', path: ['screen', 'interview'], gaps: [2, 7],
      cards: [sc('sc_02_1', 'Phone screen', 'emp_18', '2026-10-08', [[RK, 3], [CM, 4], [PS, 3], [OW, 3]]), sc('sc_02_2', 'Role / technical round', 'emp_4', '2026-10-15', [[RK, 3], [PS, 4], [CM, 3], [TW, 3]], 'Good with numbers, less sure on pricing objections.')] },
    { id: 'cand_03', name: 'Siddharth Malik', opening: 'open_ase_del', source: 'linkedin', exp: 3, ctc: 520000, notice: 30, applied: '2026-10-20', path: ['screen'], gaps: [4] },
    { id: 'cand_04', name: 'Priyanka Chawla', opening: 'open_ase_del', source: 'agency', exp: 6, ctc: 750000, notice: 90, applied: '2026-10-03', path: ['screen', 'interview', 'rejected'], gaps: [2, 6, 3], reason: 'compensation',
      notes: 'Expected pay is above the band top and the notice is 90 days.',
      cards: [sc('sc_04_1', 'Phone screen', 'emp_18', '2026-10-05', [[RK, 4], [CM, 5], [PS, 4], [OW, 4]]), sc('sc_04_2', 'Role / technical round', 'emp_4', '2026-10-11', [[RK, 3], [PS, 3], [CM, 4], [TW, 3]])] },
    { id: 'cand_05', name: 'Amit Tyagi', opening: 'open_ase_del', source: 'job_board', exp: 2, ctc: 450000, notice: 15, applied: '2026-11-04', path: [], gaps: [] },
    { id: 'cand_06', name: 'Rashmi Kulkarni', opening: 'open_ase_del', source: 'referral', exp: 4, ctc: 580000, notice: 30, applied: '2026-10-08', path: ['screen', 'rejected'], gaps: [3, 2], reason: 'skills_gap',
      cards: [sc('sc_06_1', 'Phone screen', 'emp_18', '2026-10-11', [[RK, 2, 'Mostly inside sales, little field experience.'], [CM, 4], [PS, 3], [OW, 3]])] },
    { id: 'cand_21', name: 'Ishita Sethi', opening: 'open_ase_del', source: 'linkedin', exp: 3, ctc: 540000, notice: 45, applied: '2026-11-02', path: [], gaps: [] },
    { id: 'cand_22', name: 'Gurpreet Singh', opening: 'open_ase_del', source: 'referral', exp: 5, ctc: 620000, notice: 30, applied: '2026-10-12', path: ['screen', 'interview'], gaps: [2, 5],
      cards: [sc('sc_22_1', 'Phone screen', 'emp_18', '2026-10-14', [[RK, 4], [CM, 4], [PS, 4], [OW, 4]]), sc('sc_22_2', 'Role / technical round', 'emp_4', '2026-10-19', [[RK, 4], [PS, 3], [CM, 4], [TW, 4], [OW, 3]])] },
    // Field Executive, Bengaluru
    { id: 'cand_07', name: 'Mohammed Irfan', opening: 'open_fe_blr', source: 'job_board', exp: 2, ctc: 320000, notice: 15, applied: '2026-10-24', path: ['screen', 'interview'], gaps: [2, 5],
      cards: [sc('sc_07_1', 'Phone screen', 'emp_18', '2026-10-26', [[RK, 3], [CM, 4], [PS, 3], [OW, 3]])] },
    { id: 'cand_08', name: 'Lavanya Gowda', opening: 'open_fe_blr', source: 'campus', exp: 0, ctc: 280000, notice: 0, applied: '2026-10-28', path: ['screen'], gaps: [3] },
    { id: 'cand_09', name: 'Prakash Hegde', opening: 'open_fe_blr', source: 'job_board', exp: 3, ctc: 360000, notice: 30, applied: '2026-11-03', path: [], gaps: [] },
    { id: 'cand_10', name: 'Deepti Nambiar', opening: 'open_fe_blr', source: 'linkedin', exp: 4, ctc: 400000, notice: 45, applied: '2026-10-25', path: ['screen', 'rejected'], gaps: [3, 2], reason: 'compensation' },
    { id: 'cand_23', name: 'Faizal Ansari', opening: 'open_fe_blr', source: 'referral', exp: 2, ctc: 330000, notice: 30, applied: '2026-10-27', path: ['screen', 'interview'], gaps: [2, 6],
      cards: [sc('sc_23_1', 'Phone screen', 'emp_18', '2026-10-29', [[RK, 3], [CM, 4], [PS, 4], [OW, 3]])] },
    // Software Engineer, Bengaluru
    { id: 'cand_11', name: 'Aditya Bhat', opening: 'open_swe_blr', source: 'referral', exp: 3, ctc: 1500000, notice: 45, applied: '2026-08-28', path: ['screen', 'interview', 'offer', 'hired'], gaps: [4, 12, 10, 12], emp: 'emp_24',
      cards: [
        sc('sc_11_1', 'Phone screen', 'emp_18', '2026-09-01', [[RK, 4], [CM, 4], [PS, 4], [LA, 4]]),
        sc('sc_11_2', 'Role / technical round', 'emp_5', '2026-09-13', [[RK, 4], [PS, 5], [CM, 4], [TW, 4], [OW, 4]]),
        sc('sc_11_3', 'Manager round', 'emp_1', '2026-09-23', [[RK, 4], [OW, 4], [CM, 4], [LA, 5]]),
      ],
      offer: { ctc: 1500000, joiningDate: '2026-11-16', structureId: 'str_std', status: 'accepted', extendedOn: '2026-09-24', decidedOn: '2026-10-05' } },
    { id: 'cand_12', name: 'Meghna Pillai', opening: 'open_swe_blr', source: 'linkedin', exp: 5, ctc: 1700000, notice: 60, applied: '2026-10-05', path: ['screen', 'interview'], gaps: [3, 8],
      cards: [sc('sc_12_1', 'Phone screen', 'emp_18', '2026-10-08', [[RK, 4], [CM, 5], [PS, 4], [LA, 4]]), sc('sc_12_2', 'Role / technical round', 'emp_5', '2026-10-16', [[RK, 5], [PS, 4], [CM, 3], [TW, 4], [OW, 4]], 'Very strong on design; needs to explain trade-offs more simply.')] },
    { id: 'cand_13', name: 'Rahul Deshmukh', opening: 'open_swe_blr', source: 'agency', exp: 4, ctc: 1450000, notice: 30, applied: '2026-09-22', path: ['screen', 'interview', 'rejected'], gaps: [4, 9, 3], reason: 'skills_gap',
      cards: [sc('sc_13_1', 'Phone screen', 'emp_18', '2026-09-26', [[RK, 3], [CM, 3], [PS, 3], [LA, 3]]), sc('sc_13_2', 'Role / technical round', 'emp_5', '2026-10-05', [[RK, 2, 'Could not work through the data model exercise.'], [PS, 3], [CM, 3], [TW, 3], [OW, 3]])] },
    { id: 'cand_14', name: 'Sneha Kulshreshtha', opening: 'open_swe_blr', source: 'job_board', exp: 6, ctc: 1800000, notice: 90, applied: '2026-10-30', path: ['screen'], gaps: [3] },
    { id: 'cand_15', name: 'Varun Bajaj', opening: 'open_swe_blr', source: 'referral', exp: 3, ctc: 1300000, notice: 30, applied: '2026-11-05', path: [], gaps: [] },
    { id: 'cand_24', name: 'Naveen Kumar', opening: 'open_swe_blr', source: 'campus', exp: 1, ctc: 1200000, notice: 0, applied: '2026-10-10', path: ['screen', 'rejected'], gaps: [4, 10], reason: 'no_response' },
    { id: 'cand_25', name: 'Aarti Joshi', opening: 'open_swe_blr', source: 'referral', exp: 4, ctc: 1500000, notice: 45, applied: '2026-10-27', path: ['screen'], gaps: [4] },
    // Accounts Executive, Delhi (filled)
    { id: 'cand_16', name: 'Shreya Banerjee', opening: 'open_acc_del', source: 'job_board', exp: 4, ctc: 700000, notice: 30, applied: '2026-09-03', path: ['screen', 'interview', 'offer', 'hired'], gaps: [5, 14, 10, 18], emp: 'emp_25',
      cards: [
        sc('sc_16_1', 'Phone screen', 'emp_18', '2026-09-08', [[RK, 4], [CM, 4], [PS, 4], [OW, 4]]),
        sc('sc_16_2', 'Role / technical round', 'emp_3', '2026-09-22', [[RK, 4], [PS, 4], [CM, 4], [TW, 5], [OW, 4]]),
      ],
      offer: { ctc: 700000, joiningDate: '2026-11-23', structureId: 'str_std', status: 'accepted', extendedOn: '2026-10-02', decidedOn: '2026-10-20' } },
    { id: 'cand_17', name: 'Harpreet Gill', opening: 'open_acc_del', source: 'agency', exp: 5, ctc: 780000, notice: 60, applied: '2026-09-10', path: ['screen', 'interview', 'offer', 'rejected'], gaps: [3, 8, 10, 8], reason: 'withdrew',
      notes: 'Declined the offer after a counter-offer from the current employer.',
      cards: [sc('sc_17_1', 'Phone screen', 'emp_18', '2026-09-13', [[RK, 4], [CM, 4], [PS, 3], [OW, 4]]), sc('sc_17_2', 'Role / technical round', 'emp_3', '2026-09-21', [[RK, 4], [PS, 4], [CM, 4], [TW, 4], [OW, 4]])],
      offer: { ctc: 760000, joiningDate: '2026-11-02', structureId: 'str_std', status: 'declined', extendedOn: '2026-10-01', decidedOn: '2026-10-09' } },
    { id: 'cand_18', name: 'Tarun Mehra', opening: 'open_acc_del', source: 'job_board', exp: 3, ctc: 650000, notice: 30, applied: '2026-09-05', path: ['screen', 'rejected'], gaps: [3, 4], reason: 'skills_gap' },
    // Operations Associate, Delhi (on hold)
    { id: 'cand_19', name: 'Zoya Khan', opening: 'open_ops_del', source: 'job_board', exp: 2, ctc: 340000, notice: 15, applied: '2026-07-28', path: ['screen'], gaps: [4], notes: 'Parked while the opening is on hold.' },
    { id: 'cand_20', name: 'Rakesh Yadav', opening: 'open_ops_del', source: 'campus', exp: 1, ctc: 310000, notice: 0, applied: '2026-08-02', path: ['screen', 'interview'], gaps: [3, 9], notes: 'Parked while the opening is on hold.',
      cards: [sc('sc_20_1', 'Phone screen', 'emp_18', '2026-08-05', [[RK, 3], [CM, 3], [PS, 3], [OW, 4]])] },
  ];
  return specs.map((c, i): Candidate => ({
    id: c.id, openingId: c.opening, name: c.name, email: `${c.name.toLowerCase().replace(/[^a-z]+/g, '.')}@mail.example`,
    mobile: `${['98', '97', '99', '90', '88', '70'][i % 6]}${String(10_000_000 + ((i + 3) * 7_919_321) % 89_999_999).slice(0, 8)}`,
    source: c.source, appliedOn: c.applied, experienceYears: c.exp, expectedCtc: c.ctc, noticeDays: c.notice,
    stage: c.path.length ? c.path[c.path.length - 1]! : 'applied', notes: c.notes ?? '', history: history(c),
    scorecards: c.cards ?? [], offer: c.offer, rejectReason: c.reason, convertedEmployeeId: c.emp,
  }));
}

// ═════════════════════════════ plan, scenarios ═════════════════════════════
const line = (dep: string, loc: string, arr: number[]): PlanLine => ({ id: `${dep}|${loc}`, departmentId: dep, locationId: loc, months: Object.fromEntries(FY_MONTHS.map((m, i) => [m, arr[i]!])) });
function plan(): HiringPlan {
  return {
    lines: [
      line(D.sales, L.del, [6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9]),
      line(D.sales, L.blr, [3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4]),
      line(D.ops, L.del, [2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3]),
      line(D.ops, L.mum, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
      line(D.ops, L.blr, [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]),
      line(D.fin, L.del, [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3]),
      line(D.fin, L.blr, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
      line(D.hr, L.del, [2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3]),
      line(D.wh, L.mum, [4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5]),
      line(D.tech, L.blr, [2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 5, 5]),
    ],
    avgCtc: { [D.sales]: 670000, [D.ops]: 345000, [D.fin]: 700000, [D.hr]: 1400000, [D.wh]: 235000, [D.tech]: 1650000 },
  };
}
const scenarios = (): Scenario[] => [
  { id: 'scn_base', name: 'Base', builtIn: true, hiresPerMonth: 1, attritionPct: 8, avgCtc: 710000, note: 'About one hire a month, attrition near what the last twelve months showed.' },
  { id: 'scn_freeze', name: 'Hire freeze', builtIn: true, hiresPerMonth: 0, attritionPct: 8, avgCtc: 710000, note: 'No new hires. People who leave are not replaced.' },
  { id: 'scn_growth', name: 'Aggressive growth', builtIn: true, hiresPerMonth: 2, attritionPct: 10, avgCtc: 760000, note: 'Two hires a month, with more people leaving as the team grows.' },
];

// ═════════════════════════════ performance: cycle, reviews ═════════════════════════════
function cycle(): Cycle {
  return {
    id: 'cyc_h1_fy27', name: 'H1 FY27 review', periodFrom: '2026-04-01', periodTo: '2026-09-30',
    stages: [
      { key: 'goals', label: 'Goal setting', start: '2026-04-01', end: '2026-05-15', blurb: 'Objectives and key results agreed for the year.' },
      { key: 'self', label: 'Self review', start: '2026-10-12', end: '2026-10-30', blurb: 'Each person rates themselves against five competencies.' },
      { key: 'manager', label: 'Manager review', start: '2026-11-02', end: '2026-11-20', blurb: 'Managers write their view. The employee sees it only after submit.' },
      { key: 'calibration', label: 'Calibration', start: '2026-11-23', end: '2026-11-30', blurb: 'HR and managers check ratings are applied consistently.' },
      { key: 'results', label: 'Results', start: '2026-12-07', end: '2026-12-11', blurb: 'Conversations with each person. Pay decisions are separate.' },
    ],
    reminders: [{ on: '2026-10-28', by: 'Tanvi Kapoor' }],
  };
}

/** [employee, manager, self state, self overall, manager state, manager overall] */
type RSpec = [string, string, 'sub' | 'draft' | 'none', number, 'sub' | 'draft' | 'none', number];
const REVIEW_SPECS: RSpec[] = [
  ['emp_2', 'emp_1', 'sub', 4, 'sub', 4], ['emp_3', 'emp_1', 'sub', 4, 'sub', 4], ['emp_4', 'emp_2', 'sub', 4, 'sub', 4], ['emp_5', 'emp_1', 'sub', 4, 'sub', 5],
  ['emp_6', 'emp_4', 'sub', 4, 'sub', 3], ['emp_7', 'emp_4', 'sub', 3, 'sub', 2], ['emp_8', 'emp_2', 'sub', 4, 'sub', 3], ['emp_9', 'emp_2', 'sub', 4, 'sub', 4],
  ['emp_10', 'emp_1', 'sub', 3, 'sub', 3], ['emp_11', 'emp_10', 'sub', 4, 'sub', 4], ['emp_12', 'emp_1', 'sub', 3, 'sub', 3], ['emp_13', 'emp_12', 'sub', 3, 'draft', 3],
  ['emp_14', 'emp_12', 'sub', 4, 'none', 0], ['emp_15', 'emp_12', 'draft', 3, 'none', 0], ['emp_16', 'emp_3', 'sub', 4, 'sub', 3], ['emp_17', 'emp_5', 'sub', 4, 'sub', 4],
  ['emp_18', 'emp_1', 'sub', 4, 'sub', 4], ['emp_19', 'emp_4', 'sub', 5, 'sub', 5], ['emp_20', 'emp_4', 'sub', 3, 'draft', 3], ['emp_21', 'emp_10', 'none', 0, 'none', 0],
];
const STRENGTHS = [
  'Reliable on delivery and flags problems early.', 'Builds good relationships with customers and the team.', 'Careful, accurate work that others rely on.',
  'Picks up new tools quickly and teaches others.', 'Takes ownership when something goes wrong and fixes the cause.', 'Clear communicator, keeps stakeholders informed.',
];
const DEVELOP = [
  'Plan the week ahead so urgent work does not crowd out follow-ups.', 'Delegate more and write down how the work is done.', 'Share progress earlier, before the deadline is close.',
  'Build depth in one area, such as pricing or reporting.', 'Ask for help sooner when blocked.', 'Present work to a wider group to build confidence.',
];

function form(rng: () => number, state: 'sub' | 'draft' | 'none', overall: number, submittedOn: string, idx: number): ReviewForm {
  if (state === 'none') return { ratings: {}, strengths: '', development: '' };
  const ratings: Record<string, number> = {};
  PERF_COMPETENCIES.forEach((c) => {
    const x = rng();
    ratings[c] = Math.max(1, Math.min(5, overall + (x < 0.22 ? -1 : x > 0.82 ? 1 : 0)));
  });
  if (state === 'draft') {
    const keep = Object.keys(ratings).slice(0, 3);
    return { ratings: Object.fromEntries(keep.map((k) => [k, ratings[k]!])), strengths: STRENGTHS[idx % STRENGTHS.length]!, development: '' };
  }
  return { ratings, strengths: STRENGTHS[idx % STRENGTHS.length]!, development: DEVELOP[(idx + 2) % DEVELOP.length]!, overall, submittedOn };
}

function reviews(): Review[] {
  const rng = makeRng(77_301);
  return REVIEW_SPECS.map(([emp, mgr, ss, so, ms, mo], i): Review => ({
    id: `rev_${emp}`, employeeId: emp, managerId: mgr,
    self: form(rng, ss, so, addDays('2026-10-14', i % 12), i),
    manager: form(rng, ms, mo, addDays('2026-11-02', i % 5), i + 1),
    feedback: feedbackFor(emp), moves: [],
  }));
}

function feedbackFor(emp: string): FeedbackRequest[] {
  const fb = (id: string, reviewerId: string, ratings: number[] | null, comment?: string): FeedbackRequest => ({
    id, reviewerId, requestedOn: '2026-10-20', status: ratings ? 'submitted' : 'requested',
    ratings: ratings ? Object.fromEntries(PERF_COMPETENCIES.map((c, i) => [c, ratings[i]!])) : undefined, comment, submittedOn: ratings ? '2026-10-27' : undefined,
  });
  if (emp === 'emp_5') {
    return [
      fb('fb_5_1', 'emp_17', [5, 4, 4, 5, 4], 'Always explains the why behind a decision. Reviews are fast and kind.'),
      fb('fb_5_2', 'emp_3', [4, 5, 4, 4, 4], 'Dependable when finance needs a report changed at short notice.'),
      fb('fb_5_3', 'emp_10', [4, 4, 5, 4, 3], 'Sometimes takes on too much herself. Could hand more to the team.'),
      fb('fb_5_4', 'emp_18', null),
    ];
  }
  if (emp === 'emp_6') {
    return [
      fb('fb_6_1', 'emp_7', [4, 3, 4, 4, 3], 'Generous with leads and tips from the field.'),
      fb('fb_6_2', 'emp_19', [3, 4, 4, 3, 4]),
      fb('fb_6_3', 'emp_20', null),
      fb('fb_6_4', 'emp_8', null),
    ];
  }
  return [];
}

// ═════════════════════════════ goals ═════════════════════════════
let krSeq = 0;
const kr = (goal: string, title: string, unit: KrUnit, start: number, target: number, current: number, weight: number): KeyResult => ({ id: `kr_${goal}_${++krSeq}`, title, unit, start, target, current, weight });

function goals(): Goal[] {
  krSeq = 0;
  const ev = getFieldEvidence();
  const out: Goal[] = [];
  const Q3 = { startDate: '2026-10-01', dueDate: '2026-12-31' };
  const FY = { startDate: '2026-04-01', dueDate: '2027-03-31' };

  // Field team: the numbers come from the field incentive plan (evidence.ts), read-only. Target = 3 x the monthly target.
  for (const emp of ['emp_4', 'emp_6', 'emp_7', 'emp_8', 'emp_9', 'emp_19', 'emp_20']) {
    const t = ev.targets.find((x) => x.employeeId === emp && x.month === '2026-10')!;
    const won = ev.deals.filter((d) => d.employeeId === emp && d.status === 'won' && d.closedOn >= '2026-10-01' && d.closedOn <= ev.to);
    const booked = won.reduce((s, d) => s + d.value, 0);
    const collected = won.reduce((s, d) => s + (d.value * d.collectedPct) / 100, 0);
    const collectedPct = booked ? Math.round((collected / booked) * 100) : 0;
    const verified = ev.visits.filter((v) => v.employeeId === emp && v.date >= '2026-10-01' && v.date <= ev.to && v.verified).length;
    const g1 = `g_${emp}_1`;
    out.push({
      id: g1, employeeId: emp, title: 'Reach the Q3 revenue target', weight: 70, ...Q3, updates: [],
      note: `Target is three times the monthly target in the field incentive plan (${new Intl.NumberFormat('en-IN').format(t.revenue)} a month).`,
      keyResults: [
        kr(g1, 'Revenue booked, Q3', '₹', 0, t.revenue * 3, booked, 70),
        kr(g1, 'Verified field visits, Q3', 'count', 0, t.visits * 3, verified, 30),
      ],
    });
    const g2 = `g_${emp}_2`;
    out.push({
      id: g2, employeeId: emp, title: 'Collect what we bill', weight: 30, ...Q3, updates: [],
      note: `The incentive plan pays only on deals collected at least ${ev.plan.minCollectionPct}%.`,
      keyResults: [kr(g2, 'Share of booked revenue collected', '%', 0, ev.plan.minCollectionPct, collectedPct, 100)],
    });
  }

  const g = (emp: string, n: number, title: string, weight: number, krs: KeyResult[], note?: string): Goal => ({ id: `g_${emp}_${n}`, employeeId: emp, title, weight, ...FY, keyResults: krs, updates: [], note });
  out.push(
    g('emp_3', 1, 'Close the books faster', 60, [kr('g_emp_3_1', 'Working days to close the month', 'days', 12, 7, 9, 100)]),
    g('emp_3', 2, 'Fewer vendor payment errors', 40, [kr('g_emp_3_2', 'Payment errors a month', 'count', 6, 1, 4, 100)]),
    g('emp_5', 1, 'Ship the mobile app, version 1', 70, [kr('g_emp_5_1', 'Screens built and reviewed', 'count', 0, 24, 17, 60), kr('g_emp_5_1', 'Crash-free sessions in the pilot', '%', 90, 99, 96, 40)]),
    g('emp_5', 2, 'Grow the team\'s review habits', 30, [kr('g_emp_5_2', 'Pull requests reviewed within one day', '%', 50, 90, 58, 100)]),
    g('emp_17', 1, 'Make the API faster', 100, [kr('g_emp_17_1', 'Slowest 5% of requests, in milliseconds', 'count', 800, 300, 520, 70), kr('g_emp_17_1', 'Endpoints with tests', '%', 40, 85, 68, 30)]),
    g('emp_10', 1, 'Cut order dispatch delay', 70, [kr('g_emp_10_1', 'Average days from order to dispatch', 'days', 2.5, 1, 1.6, 100)]),
    g('emp_10', 2, 'Cross-train the team', 30, [kr('g_emp_10_2', 'Associates trained on a second task', 'count', 0, 2, 1, 100)]),
    g('emp_12', 1, 'Stock accuracy', 60, [kr('g_emp_12_1', 'Pick accuracy', '%', 96, 99.5, 98.2, 100)]),
    g('emp_12', 2, 'Safety training for the whole shift', 40, [kr('g_emp_12_2', 'Team members trained', '%', 0, 100, 65, 100)]),
    g('emp_18', 1, 'Fill the approved openings', 70, [kr('g_emp_18_1', 'Offers accepted this year', 'count', 0, 6, 2, 60), kr('g_emp_18_1', 'Average days from application to hire', 'days', 75, 45, 43, 40)]),
    g('emp_18', 2, 'Onboarding with no gaps', 30, [kr('g_emp_18_2', 'New joiners with all documents by day one', '%', 50, 100, 80, 100)]),
  );

  // A few progress updates so the history is not empty.
  const upd = (goalId: string, krIndex: number, on: string, value: number, comment: string, by: string) => {
    const goal = out.find((x) => x.id === goalId)!;
    const k = goal.keyResults[krIndex]!;
    goal.updates.push({ id: `up_${goalId}_${goal.updates.length + 1}`, krId: k.id, on, value, comment, by });
  };
  upd('g_emp_5_1', 0, '2026-10-24', 14, 'Checkout and attendance screens are in review.', 'Divya Menon');
  upd('g_emp_5_1', 0, '2026-11-03', 17, 'Leave screens done. Reports screens next.', 'Divya Menon');
  upd('g_emp_3_1', 0, '2026-11-02', 9, 'October closed in 9 days. Bank reconciliation is the slow step.', 'Neha Bansal');
  upd('g_emp_12_2', 0, '2026-10-30', 65, 'Two of three shifts trained. Night shift is scheduled for 12 Nov.', 'Manoj Patil');
  upd('g_emp_17_1', 0, '2026-10-21', 520, 'Added a cache in front of the list endpoints.', 'Harish Reddy');
  upd('g_emp_18_1', 0, '2026-10-20', 2, 'Both accepted offers have joining dates in November.', 'Tanvi Kapoor');
  return out;
}

// ═════════════════════════════ 1:1s ═════════════════════════════
const note = (id: string, on: string, authorRole: OneNote['authorRole'], text: string, priv = false): OneNote => ({ id, on, authorRole, text, private: priv });
const act = (id: string, text: string, owner: ActionItem['owner'], status: ActionItem['status'], due?: string, createdOn = '2026-10-27'): ActionItem => ({ id, text, owner, status, due, createdOn });

function threads(): OneThread[] {
  return [
    {
      id: 'oo_4_6', managerId: 'emp_4', reportId: 'emp_6', cadence: 'weekly', nextOn: '2026-11-10',
      notes: [
        note('n1', '2026-11-03', 'manager', 'Walked through the South Delhi pipeline. Three dealers are close to a repeat order. Agreed to focus on collections this fortnight.'),
        note('n2', '2026-11-03', 'manager', 'Rating discussion later this month. Keep it factual: delivery was good, visit mix is uneven.', true),
        note('n3', '2026-11-03', 'report', 'Asked about the parking claim process. I would like a Bengaluru trip to learn from the east team.', true),
        note('n4', '2026-10-27', 'manager', 'Diwali stock for the South beat. Imran will draft the dealer message.'),
      ],
      actions: [act('a1', 'Send the dealer message for Diwali stock', 'report', 'in_progress', '2026-11-09'), act('a2', 'Share the collections tracker', 'manager', 'open', '2026-11-10'), act('a3', 'Raise the parking claim form with finance', 'manager', 'done', '2026-11-05')],
    },
    {
      id: 'oo_4_7', managerId: 'emp_4', reportId: 'emp_7', cadence: 'fortnightly', nextOn: '2026-11-12',
      notes: [
        note('n1', '2026-10-29', 'manager', 'Pooja is new to Nehru Place. Pair with Imran on two visits to see how he opens a conversation.'),
        note('n2', '2026-10-29', 'report', 'I would like more time with the product team before the next visit.'),
      ],
      actions: [act('a1', 'Two joint visits with Imran', 'manager', 'open', '2026-11-12'), act('a2', 'Product walk-through with the Technology team', 'report', 'open', '2026-11-14')],
    },
    {
      id: 'oo_2_4', managerId: 'emp_2', reportId: 'emp_4', cadence: 'fortnightly', nextOn: '2026-11-14',
      notes: [note('n1', '2026-10-31', 'manager', 'Team lead load is high. Two new hires should ease it; agree who runs the interviews.'), note('n2', '2026-10-31', 'manager', 'Rohit is ready for a regional role in a year if the team numbers hold.', true)],
      actions: [act('a1', 'Shortlist for the two Delhi openings', 'report', 'in_progress', '2026-11-12'), act('a2', 'Review beat overlap with the north territory', 'manager', 'open', '2026-11-20')],
    },
    {
      id: 'oo_5_17', managerId: 'emp_5', reportId: 'emp_17', cadence: 'weekly', nextOn: '2026-11-09',
      notes: [note('n1', '2026-11-02', 'manager', 'API latency work is on track. Add tests before the next release.'), note('n2', '2026-11-02', 'report', 'Would like to try on-call once with a buddy.')],
      actions: [act('a1', 'Add tests for the list endpoints', 'report', 'in_progress', '2026-11-13'), act('a2', 'Set up a buddy for the first on-call week', 'manager', 'open', '2026-11-16')],
    },
    {
      id: 'oo_12_13', managerId: 'emp_12', reportId: 'emp_13', cadence: 'monthly', nextOn: '2026-11-20',
      notes: [note('n1', '2026-10-20', 'manager', 'Pick accuracy is up. Night shift handover notes need to be written down.')],
      actions: [act('a1', 'Write the handover checklist', 'report', 'open', '2026-11-18', '2026-10-20'), act('a2', 'Book the safety refresher', 'manager', 'done', '2026-10-30', '2026-10-20')],
    },
    {
      id: 'oo_10_11', managerId: 'emp_10', reportId: 'emp_11', cadence: 'fortnightly', nextOn: '2026-11-11',
      notes: [note('n1', '2026-10-28', 'manager', 'Anita is handling the Bhiwandi dispatch queue well. Discuss the second task she could learn.'), note('n2', '2026-10-28', 'report', 'Interested in learning inventory reports.', true)],
      actions: [act('a1', 'Shadow the inventory report run', 'report', 'open', '2026-11-12', '2026-10-28')],
    },
  ];
}

// ═════════════════════════════ assemble ═════════════════════════════
export function makeHiringSeed(): HiringState {
  return {
    version: 1,
    openings: openings(), candidates: candidates(),
    plan: plan(), openStartMonth: '2027-01', scenarios: scenarios(),
    cycle: cycle(), goals: goals(), reviews: reviews(), threads: threads(),
  };
}

/** Who reports to whom for the review cycle (also used by goal roll-ups). */
export const REVIEW_MANAGERS: Record<string, string> = Object.fromEntries(REVIEW_SPECS.map(([e, m]) => [e, m]));
