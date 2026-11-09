// Engagement seed: four closed monthly pulses and one open of anonymous responses (team only, nothing else), a values list, a recognition
// feed and four completed exit interviews (one short of the five needed to show themes). Deterministic.

import { makeRng } from '../areaStore';
import type { CompanyValue, EngagementState, ExitInterview, Kudos, Survey, SurveyQuestion, SurveyResponse } from './types';

export const PULSE_QUESTIONS: SurveyQuestion[] = [
  { id: 'q_goals', type: 'rating', text: 'I understand how my work helps the company reach its goals.' },
  { id: 'q_support', type: 'rating', text: 'I get the support I need from my team lead or manager.' },
  { id: 'q_load', type: 'rating', text: 'My workload is manageable most weeks.' },
  { id: 'q_recommend', type: 'yesno', text: 'I would recommend Meridian as a place to work.' },
  { id: 'q_change', type: 'text', text: 'What is one thing we should change or keep?' },
];

export const VALUES: CompanyValue[] = [
  { id: 'v_customer', name: 'Customer first', blurb: 'We start from what the customer needs.' },
  { id: 'v_owner', name: 'Own it', blurb: 'We follow a problem through to the end.' },
  { id: 'v_safe', name: 'Safety always', blurb: 'Nothing is urgent enough to be unsafe.' },
  { id: 'v_simple', name: 'Keep it simple', blurb: 'We cut steps that do not help anyone.' },
  { id: 'v_help', name: 'Help each other', blurb: 'We share what we know and cover for each other.' },
];

const SURVEYS: Survey[] = [
  { id: 'sv_jul', title: 'July pulse', sentOn: '2026-07-13', closesOn: '2026-07-27', status: 'closed', questions: PULSE_QUESTIONS },
  { id: 'sv_aug', title: 'August pulse', sentOn: '2026-08-10', closesOn: '2026-08-24', status: 'closed', questions: PULSE_QUESTIONS },
  { id: 'sv_sep', title: 'September pulse', sentOn: '2026-09-14', closesOn: '2026-09-28', status: 'closed', questions: PULSE_QUESTIONS },
  { id: 'sv_oct', title: 'October pulse', sentOn: '2026-10-12', closesOn: '2026-10-26', status: 'closed', questions: PULSE_QUESTIONS },
  // Still open, with a few answers in: the "take the survey" demo can push a team over the minimum of five.
  { id: 'sv_nov', title: 'November pulse', sentOn: '2026-11-02', closesOn: '2026-11-16', status: 'open', questions: PULSE_QUESTIONS },
];

// Responses per team per pulse (Jul, Aug, Sep, Oct). Finance & People and Technology stay under five on purpose.
const COUNTS: Record<string, number[]> = { team_sales: [7, 8, 7, 8, 4], team_ops: [5, 6, 6, 6, 3], team_corp: [4, 3, 4, 4, 2], team_tech: [2, 2, 2, 2, 1] };
// Target averages per pulse for each rating question.
const MEANS: Record<string, Record<string, number[]>> = {
  team_sales: { q_goals: [3.9, 4.0, 4.0, 4.2, 4.2], q_support: [3.6, 3.7, 3.6, 3.9, 3.9], q_load: [3.4, 3.3, 3.2, 2.9, 3.0] },
  team_ops: { q_goals: [3.4, 3.5, 3.4, 3.7, 3.7], q_support: [3.2, 3.3, 3.2, 3.7, 3.7], q_load: [3.3, 3.4, 3.3, 3.3, 3.3] },
  team_corp: { q_goals: [4.1, 4.0, 4.1, 4.1, 4.1], q_support: [3.9, 3.8, 3.9, 3.9, 3.9], q_load: [3.5, 3.5, 3.4, 3.5, 3.5] },
  team_tech: { q_goals: [4.0, 4.0, 4.0, 4.0, 4.0], q_support: [3.7, 3.7, 3.7, 3.7, 3.7], q_load: [3.4, 3.4, 3.4, 3.4, 3.4] },
};
const YES: Record<string, number[]> = { team_sales: [0.68, 0.7, 0.66, 0.75, 0.75], team_ops: [0.55, 0.58, 0.55, 0.62, 0.67], team_corp: [0.8, 0.8, 0.8, 0.8, 1], team_tech: [0.75, 0.75, 0.75, 0.75, 1] };

const COMMENTS: Record<string, string[]> = {
  team_sales: [
    'Clearer monthly targets would help me plan my beats.', 'Travel claims take too long to be paid.', 'Good support from my lead. Please keep the weekly huddle.',
    'The new app is faster. Keep improving offline mode.', 'Training sessions should be in working hours, not after.', 'I would like a clear path to the next role.',
    'Month-end collection pressure is high; a shared plan would help.', 'Thank you for explaining the incentive plan in plain words.',
  ],
  team_ops: [
    'More notice before shift changes please.', 'The dock lighting on the night shift could be better.', 'Safety huddles are useful, keep them short.',
    'We need a second person on the dispatch desk at month end.', 'Keep the clear daily plan from the shift lead.', 'Protective gear sizes run out too quickly.',
  ],
  team_corp: ['Keep the monthly close calendar; it helps.', 'Statutory deadlines bunch up around the 15th.', 'Hybrid days work well for us.', 'More cross-team coffee chats would be nice.'],
  team_tech: ['Release planning is clearer than before.', 'Reviews take long when only one person is free.'],
};

/** n whole-number ratings whose mean is the target (to the nearest 1/n), with some spread, in a shuffled order. */
function ratings(rng: () => number, n: number, mean: number): number[] {
  const target = Math.round(mean * n);
  const base = Math.floor(target / n);
  const extra = target - base * n;
  const vals = Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
  for (let k = 0; k < n; k++) {
    const i = Math.floor(rng() * n); const j = Math.floor(rng() * n);
    if (i !== j && vals[i]! < 5 && vals[j]! > 1) { vals[i]! += 1; vals[j]! -= 1; }
  }
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [vals[i], vals[j]] = [vals[j]!, vals[i]!]; }
  return vals.map((v) => Math.max(1, Math.min(5, v)));
}

function makeResponses(): SurveyResponse[] {
  const rng = makeRng(777);
  const out: SurveyResponse[] = [];
  let n = 0;
  SURVEYS.forEach((s, si) => {
    for (const teamId of Object.keys(COUNTS)) {
      const count = COUNTS[teamId]![si]!;
      const byQ: Record<string, number[]> = {};
      for (const qid of ['q_goals', 'q_support', 'q_load']) byQ[qid] = ratings(rng, count, MEANS[teamId]![qid]![si]!);
      const yesCount = Math.round(YES[teamId]![si]! * count);
      const pool = COMMENTS[teamId]!;
      let nextComment = si % pool.length; // walk the pool so a pulse does not repeat one comment
      for (let k = 0; k < count; k++) {
        const answers: SurveyResponse['answers'] = {};
        for (const qid of ['q_goals', 'q_support', 'q_load']) answers[qid] = byQ[qid]![k]!;
        answers.q_recommend = k < yesCount;
        if (rng() < 0.6) { answers.q_change = pool[nextComment % pool.length]!; nextComment += 1; }
        n += 1;
        out.push({ id: `r_${n}`, surveyId: s.id, teamId, answers });
      }
    }
  });
  return out;
}

const kudos = (id: string, fromName: string, toId: string, valueId: string, message: string, on: string): Kudos => ({ id, fromName, toId, valueId, message, on });
const KUDOS: Kudos[] = [
  kudos('k_1', 'Rohit Chauhan', 'emp_19', 'v_customer', 'Went back to the Karol Bagh dealer on Saturday to sort a wrong invoice. The dealer has reordered.', '2026-11-04'),
  kudos('k_2', 'Anita Desai', 'emp_13', 'v_safe', 'Spotted a loose rack beam during the night walk and cordoned it off before the shift started.', '2026-11-03'),
  kudos('k_3', 'Divya Menon', 'emp_17', 'v_help', 'Pair-debugged the sync issue with me for two hours so the release could go out.', '2026-10-30'),
  kudos('k_4', 'Tanvi Kapoor', 'emp_3', 'v_owner', 'Chased the PF challan mismatch until it was fixed and explained to everyone.', '2026-10-28'),
  kudos('k_5', 'Santosh Gaikwad', 'emp_12', 'v_simple', 'Cut the outbound checklist from 14 steps to 9 without losing a single check.', '2026-10-22'),
  kudos('k_6', 'Arvind Nair', 'emp_8', 'v_customer', 'Stayed on a call with a distributor until the stock transfer was confirmed.', '2026-10-17'),
  kudos('k_7', 'Ritu Malhotra', 'emp_18', 'v_owner', 'Ran the POSH refresher end to end, including the follow-up with everyone who missed it.', '2026-10-09'),
  kudos('k_8', 'Neha Bansal', 'emp_16', 'v_help', 'Covered the close while I was out and left clean notes.', '2026-09-26'),
  kudos('k_9', 'Vikram Joshi', 'emp_11', 'v_simple', 'Rewrote the dispatch roster so the night team gets its plan a day earlier.', '2026-09-18'),
  kudos('k_10', 'Rohit Chauhan', 'emp_7', 'v_help', 'Took a new field executive on her first week of visits and shared her own beat notes.', '2026-09-12'),
  kudos('k_11', 'Anita Desai', 'emp_14', 'v_safe', 'Held the line on PPE during a rush shift.', '2026-08-29'),
  kudos('k_12', 'Harish Reddy', 'emp_5', 'v_owner', 'Took the 2 am alert and wrote up what happened for the whole team.', '2026-08-14'),
];

const interview = (id: string, employeeId: string | undefined, label: string, completedOn: string, reasons: string[], wouldReturn: ExitInterview['wouldReturn'], text: string): ExitInterview =>
  ({ id, employeeId, label, completedOn, reasons, wouldReturn, text, by: 'Tanvi Kapoor' });
const INTERVIEWS: ExitInterview[] = [
  interview('ei_1', 'emp_23', 'Operations Associate, Bengaluru', '2026-09-26', ['Career growth', 'Better pay elsewhere'], 'yes', 'I liked the team and the shift lead. I needed a bigger role than Operations could offer in Bengaluru right now.'),
  interview('ei_2', undefined, 'Area Sales Executive, left March 2026', '2026-03-24', ['Workload or hours', 'Manager relationship'], 'maybe', 'Targets moved mid-month twice. I would have liked a steadier plan and more feedback in one-to-ones.'),
  interview('ei_3', undefined, 'Warehouse Associate, left January 2026', '2026-01-20', ['Relocation'], 'yes', 'Moved back to my home town. Good place to work and I would consider coming back.'),
  interview('ei_4', undefined, 'Field Executive, left November 2025', '2025-11-21', ['Better pay elsewhere', 'Career growth'], 'maybe', 'The offer elsewhere was higher. I would like to know what the next step in the field team would have been.'),
];

export function makeEngagementSeed(): EngagementState {
  return { surveys: structuredClone(SURVEYS), responses: makeResponses(), values: structuredClone(VALUES), kudos: structuredClone(KUDOS), exitInterviews: structuredClone(INTERVIEWS), log: [] };
}
