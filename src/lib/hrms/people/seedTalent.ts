// Talent seed: a 12-skill taxonomy, what each role needs, ratings with evidence, six critical roles with benches,
// and 9-box placements with rationale. Deterministic.

import type { Employee } from '../types';
import { makeRng } from '../areaStore';
import { PREVIEW_TODAY } from '../seed';
import { isLearner } from './learningEngine';
import type { CriticalRole, Placement, Rating, Skill, SkillLevel, TalentState } from './types';

export const SKILLS: Skill[] = [
  { id: 'sk_field', name: 'Field selling', group: 'Sales', blurb: 'Plans a beat, runs a visit, closes and records it.' },
  { id: 'sk_negot', name: 'Negotiation', group: 'Sales', blurb: 'Agrees price and terms without giving away more than needed.' },
  { id: 'sk_excel', name: 'Excel and reporting', group: 'Finance', blurb: 'Builds tables, lookups, pivots and checks its own totals.' },
  { id: 'sk_close', name: 'Month-end close', group: 'Finance', blurb: 'Reconciles accounts and closes the month on time.' },
  { id: 'sk_wh', name: 'Warehouse operations', group: 'Operations', blurb: 'Runs inbound, storage and outbound flows.' },
  { id: 'sk_inv', name: 'Inventory control', group: 'Operations', blurb: 'Keeps stock records and physical stock in agreement.' },
  { id: 'sk_safety', name: 'Safety practice', group: 'Operations', blurb: 'Follows and promotes safe working on the floor.' },
  { id: 'sk_coach', name: 'Coaching and feedback', group: 'People', blurb: 'Holds useful one-to-ones and gives specific feedback.' },
  { id: 'sk_comm', name: 'Stakeholder communication', group: 'Core', blurb: 'Keeps clients and colleagues clearly informed.' },
  { id: 'sk_data', name: 'Data analysis', group: 'Technology', blurb: 'Turns data into a clear answer.' },
  { id: 'sk_design', name: 'Software design', group: 'Technology', blurb: 'Designs services that others can build on.' },
  { id: 'sk_plan', name: 'Project planning', group: 'Core', blurb: 'Breaks work into steps and delivers on the date agreed.' },
];

const SKILL_GROUP_BY_DEPT: Record<string, string> = { dep_sales: 'Sales', dep_fin: 'Finance', dep_ops: 'Operations', dep_wh: 'Operations', dep_hr: 'People', dep_tech: 'Technology' };

/** Level each role needs, by designation. */
export const REQUIREMENTS: Record<string, Record<string, number>> = {
  des_mgr: { sk_coach: 3, sk_comm: 3, sk_negot: 3, sk_field: 3 },
  des_tl: { sk_field: 3, sk_coach: 2, sk_comm: 3, sk_negot: 2 },
  des_ase: { sk_field: 3, sk_negot: 2, sk_comm: 2 },
  des_fe: { sk_field: 2, sk_comm: 2 },
  des_acc: { sk_excel: 3, sk_close: 3, sk_comm: 2 },
  des_hr: { sk_comm: 3, sk_coach: 2, sk_excel: 2 },
  des_ops: { sk_excel: 2, sk_inv: 2, sk_comm: 2 },
  des_wh: { sk_wh: 2, sk_safety: 3, sk_inv: 2 },
  des_dev: { sk_design: 3, sk_data: 2, sk_plan: 2 },
};

const EVIDENCE: Record<string, string> = {
  sk_field: 'Ride-along on three beats: plans the day by outlet value and records every visit with a photo.',
  sk_negot: 'Held the agreed price on two distributor renewals without a discount.',
  sk_excel: 'Built the monthly reconciliation workbook the team now uses.',
  sk_close: 'Month-end close finished on time in each of the last two quarters.',
  sk_wh: 'Runs the inbound shift without supervision and plans dock slots.',
  sk_inv: 'Cycle counts within 0.5% of system stock for three months running.',
  sk_safety: 'Leads the shift safety huddle. No unreported near misses in the last audit.',
  sk_coach: 'Holds regular one-to-ones. Two people from the team were promoted in the last year.',
  sk_comm: 'Writes clear client updates and handled a delivery escalation calmly.',
  sk_data: 'Built a weekly report that the sales team now uses.',
  sk_design: 'Designed the visit-sync service and walked the team through it.',
  sk_plan: 'Planned and shipped the last release on the agreed date.',
};
const BASIC_NOTE = 'Assessed in the 2026 skills review. Works with guidance on this.';

const ASSESSOR: Record<string, string> = {
  dep_sales: 'Arvind Nair', dep_ops: 'Vikram Joshi', dep_wh: 'Manoj Patil', dep_fin: 'Neha Bansal', dep_hr: 'Ritu Malhotra', dep_tech: 'Divya Menon',
};

const clamp = (n: number): SkillLevel => Math.max(0, Math.min(4, Math.round(n))) as SkillLevel;

export function makeTalentSeed(employees: Employee[]): TalentState {
  const rng = makeRng(4242);
  const ratings: Record<string, Rating> = {};
  const fullName = (e: Employee) => `${e.firstName} ${e.lastName}`;
  const learners = employees.filter(isLearner);

  for (const e of learners) {
    const need = REQUIREMENTS[e.designationId] ?? {};
    const years = (Date.parse(`${PREVIEW_TODAY}T00:00:00Z`) - Date.parse(`${e.joinDate}T00:00:00Z`)) / (365.25 * 86400000);
    const group = SKILL_GROUP_BY_DEPT[e.departmentId];
    for (const s of SKILLS) {
      let level: number;
      if (need[s.id] != null) {
        const delta = [-2, -1, -1, 0, 0, 0, 1, 1][Math.floor(rng() * 8)]!;
        level = need[s.id]! + delta + (years > 4 && delta >= 0 ? 0.6 : 0);
      } else if (s.group === group) {
        level = 1 + rng() * 2;
      } else if (s.group === 'Core') {
        level = 1 + rng() * 1.5;
      } else {
        level = rng() < 0.55 ? 0 : 1;
      }
      const lvl = clamp(level);
      if (lvl === 0) continue;
      let assessor = ASSESSOR[e.departmentId] ?? 'Ritu Malhotra';
      if (assessor === fullName(e)) assessor = e.departmentId === 'dep_hr' ? 'Sanjay Kulkarni' : 'Ritu Malhotra';
      const month = 5 + Math.floor(rng() * 6); // May to October 2026
      const day = 3 + Math.floor(rng() * 24);
      ratings[`${e.id}|${s.id}`] = {
        level: lvl,
        note: lvl >= 3 ? EVIDENCE[s.id]! : BASIC_NOTE,
        by: assessor,
        on: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      };
    }
  }

  const roles: CriticalRole[] = [
    {
      id: 'role_rm_south', title: 'Regional Manager, Sales (South)', departmentId: 'dep_sales', locationId: 'loc_blr', incumbentId: 'emp_2', roleSince: '2018-07-02', retirementAge: 60,
      why: 'Owns the Karnataka sales number and the largest distributor relationships.',
      successors: [
        { employeeId: 'emp_4', readiness: '1-2y', actions: ['Cover the South region for two weeks in Q1', 'Finish People management'], addedOn: '2026-04-15' },
        { employeeId: 'emp_8', readiness: '3y+', actions: ['Lead Bengaluru beat planning', 'Coach two new field executives'], addedOn: '2026-04-15' },
      ],
      history: [
        { id: 'sc_1', on: '2026-04-15', by: 'Talent review panel', kind: 'added', employeeId: 'emp_4', to: '1-2y', reason: 'Led the Delhi team through the Q4 push with good results; needs a region to run.' },
        { id: 'sc_2', on: '2026-04-15', by: 'Talent review panel', kind: 'added', employeeId: 'emp_8', to: '3y+', reason: 'Strong on the beat, has not managed people yet.' },
      ],
    },
    {
      id: 'role_fin_head', title: 'Head of Finance', departmentId: 'dep_fin', locationId: 'loc_del', incumbentId: 'emp_3', roleSince: '2025-11-01', retirementAge: 60,
      why: 'Signs off payroll funding, statutory deposits and the month-end close.',
      successors: [
        { employeeId: 'emp_16', readiness: '1-2y', actions: ['Own the statutory deposit calendar', 'Finish Excel for finance'], addedOn: '2026-05-10' },
      ],
      history: [{ id: 'sc_3', on: '2026-05-10', by: 'Talent review panel', kind: 'added', employeeId: 'emp_16', to: '1-2y', reason: 'Steady close record; has not yet presented to the leadership team.' }],
    },
    {
      id: 'role_wh_lead', title: 'Warehouse Lead, Bhiwandi', departmentId: 'dep_wh', locationId: 'loc_mum', incumbentId: 'emp_12', roleSince: '2023-04-01', retirementAge: 60,
      why: 'Runs inbound, outbound and the night handover for the client fulfilment contracts.',
      successors: [
        { employeeId: 'emp_13', readiness: 'now', actions: ['Join the next client audit as second lead'], addedOn: '2026-06-02' },
        { employeeId: 'emp_11', readiness: '1-2y', actions: ['Shadow dock scheduling for one quarter'], addedOn: '2026-06-02' },
      ],
      history: [
        { id: 'sc_4', on: '2026-06-02', by: 'Talent review panel', kind: 'added', employeeId: 'emp_13', to: 'now', reason: 'Has covered the lead on leave twice with no issues raised.' },
        { id: 'sc_5', on: '2026-06-02', by: 'Talent review panel', kind: 'added', employeeId: 'emp_11', to: '1-2y', reason: 'Strong planning; limited time on the floor.' },
      ],
    },
    {
      id: 'role_sales_tl', title: 'Sales Team Lead, Delhi', departmentId: 'dep_sales', locationId: 'loc_del', incumbentId: 'emp_4', roleSince: '2022-01-01', retirementAge: 60,
      why: 'Leads the Delhi field team of eight and owns the monthly beat plan.',
      successors: [
        { employeeId: 'emp_19', readiness: 'now', actions: ['Run the weekly beat review for a month'], addedOn: '2026-04-15' },
        { employeeId: 'emp_6', readiness: '3y+', actions: ['Finish Field selling essentials refresher', 'Mentor a new field executive'], addedOn: '2026-04-15' },
      ],
      history: [
        { id: 'sc_6', on: '2026-04-15', by: 'Talent review panel', kind: 'added', employeeId: 'emp_19', to: 'now', reason: 'Already plans the team\'s beats when the lead is away.' },
        { id: 'sc_7', on: '2026-04-15', by: 'Talent review panel', kind: 'added', employeeId: 'emp_6', to: '3y+', reason: 'Good field results, early in his career.' },
      ],
    },
    {
      id: 'role_eng_lead', title: 'Engineering Lead', departmentId: 'dep_tech', locationId: 'loc_blr', incumbentId: 'emp_5', roleSince: '2024-04-01', retirementAge: 60,
      why: 'Owns the architecture of the field app and the HRMS build.',
      successors: [
        { employeeId: 'emp_17', readiness: '1-2y', actions: ['Lead the next release plan', 'Finish Secure coding basics'], addedOn: '2026-05-20' },
      ],
      history: [{ id: 'sc_8', on: '2026-05-20', by: 'Talent review panel', kind: 'added', employeeId: 'emp_17', to: '1-2y', reason: 'Designs well; has not yet run a release.' }],
    },
    {
      id: 'role_head_people', title: 'Head of People', departmentId: 'dep_hr', locationId: 'loc_del', incumbentId: 'emp_1', roleSince: '2017-04-10', retirementAge: 60,
      why: 'Owns people compliance, the Internal Committee and payroll sign-off.',
      successors: [],
      history: [],
    },
  ];

  const P = (employeeId: string, performance: 1 | 2 | 3, potential: 1 | 2 | 3, rationale: string): Placement =>
    ({ employeeId, performance, potential, rationale, by: 'Talent review panel', on: '2026-10-20' });
  const placements: Record<string, Placement> = {};
  for (const p of [
    P('emp_4', 3, 3, 'Met the Delhi target in four of four quarters and is already covering regional questions.'),
    P('emp_2', 3, 2, 'Hit the regional number three quarters out of four. Strong where he is; a wider role is a conversation for next year.'),
    P('emp_6', 2, 2, 'Meets targets steadily. Interest in team lead work still to be explored.'),
    P('emp_7', 2, 3, 'Joined in May 2024 and has taken on every stretch task offered.'),
    P('emp_8', 2, 3, 'Reliable on the beat, asks for harder accounts.'),
    P('emp_9', 1, 2, 'Joined in January 2025. First-year targets not yet met; coaching plan agreed.'),
    P('emp_19', 3, 2, 'Top of the team on collections and visit quality for two quarters.'),
    P('emp_20', 2, 2, 'On track for the first full year.'),
    P('emp_10', 2, 2, 'Handles the Delhi dispatch desk well.'),
    P('emp_11', 3, 2, 'Plans the shift roster and the safety drills. Strong planner.'),
    P('emp_12', 3, 2, 'Runs the warehouse to plan. A career conversation about a wider role has not happened yet.'),
    P('emp_13', 2, 3, 'Has covered the lead twice with good results.'),
    P('emp_14', 2, 1, 'Dependable on the night shift.'),
    P('emp_5', 3, 3, 'Delivered the field app on time and mentors the team.'),
    P('emp_17', 2, 3, 'Good designs; still building delivery experience.'),
    P('emp_3', 3, 2, 'Closes on time; acting head of finance since November 2025.'),
    P('emp_16', 2, 2, 'Steady close record and accurate work.'),
    P('emp_1', 3, 2, 'Leads people compliance well; a wider remit is for the leadership discussion.'),
  ]) placements[p.employeeId] = p;

  return { skills: structuredClone(SKILLS), requirements: structuredClone(REQUIREMENTS), ratings, roles, placements, cycle: 'FY 2026-27, first half', log: [] };
}
