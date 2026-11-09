// Learning seed: ten courses and the assignments the "mandatory for" rules produce for the 25 sample people,
// in a believable mix of done, in progress, not started and overdue. Deterministic (makeRng), no clock.

import type { Employee } from '../types';
import { addDays, diffDays } from '../format';
import { makeRng } from '../areaStore';
import { PREVIEW_TODAY } from '../seed';
import type { Assignment, Certificate, Course, LearningState, QuizQuestion } from './types';
import { addMonthsISO, certificateId, eligibleFor, isLearner, requiredFor } from './learningEngine';

const noAud = { departmentIds: [], designationIds: [], locationIds: [] };
const q = (text: string, options: string[], answer: number): QuizQuestion => ({ q: text, options, answer });
const TF = ['True', 'False'];

export const COURSES: Course[] = [
  {
    id: 'c_posh', code: 'POSH', title: 'POSH awareness', category: 'compliance', mode: 'self_paced', durationMin: 45, mandatory: true, audience: noAud,
    refresherMonths: 12, dueDays: 30, owner: 'Tanvi Kapoor (People)',
    summary: 'What sexual harassment at work looks like, how to raise a concern and what the Internal Committee does.',
    lessons: [
      { title: 'What counts as harassment at work', body: 'Unwelcome words, messages, touch or behaviour of a sexual nature can be harassment, whatever the intent. The impact on the person matters.' },
      { title: 'How to raise a concern', body: 'You can go to the Internal Committee or the People team. You can ask for support at any step, and your concern is handled in confidence.' },
      { title: 'What the Internal Committee does', body: 'The committee listens to both sides, looks at the evidence and recommends action. Raising a concern in good faith is never held against you.' },
    ],
    quiz: [
      q('Under our policy, where can you raise a concern?', ['The Internal Committee, or the People team', 'Only on social media', 'Nowhere, it waits for the yearly review'], 0),
      q('Is it allowed to punish someone for raising a concern in good faith?', ['Yes, if the concern is minor', 'No, never', 'Only if a manager agrees'], 1),
      q('Behaviour can be a concern even if it was not meant to upset anyone.', TF, 0),
    ],
  },
  {
    id: 'c_dpdp', code: 'DATA', title: 'Data protection basics', category: 'compliance', mode: 'self_paced', durationMin: 30, mandatory: true, audience: noAud,
    refresherMonths: 12, dueDays: 30, owner: 'Harish Reddy (Technology)',
    summary: 'Handling personal data of employees, customers and candidates, and what to do if something goes wrong.',
    lessons: [
      { title: 'Personal data in our work', body: 'Names, phone numbers, bank and ID details are personal data. We keep only what a task needs and only for as long as it is needed.' },
      { title: 'Collect less, share less', body: 'Never keep a full Aadhaar number. Keep the last four digits. Share files with the people who need them, not with whole groups.' },
      { title: 'Reporting a data incident', body: 'If data goes to the wrong person or a device is lost, tell the People team or IT the same day. Reporting early limits the harm.' },
    ],
    quiz: [
      q('Which Aadhaar detail may we keep on an employee record?', ['The full number', 'The last four digits only', 'A photo of the card on a shared drive'], 1),
      q('You sent a payslip to the wrong colleague. What do you do first?', ['Say nothing', 'Report it to the People team the same day', 'Delete the mail and hope'], 1),
      q('Tracking a person\'s location outside duty hours is fine.', TF, 1),
    ],
  },
  {
    id: 'c_coc', code: 'CODE', title: 'Code of conduct', category: 'compliance', mode: 'self_paced', durationMin: 25, mandatory: true, audience: noAud,
    refresherMonths: 12, dueDays: 30, owner: 'Ritu Malhotra (People)',
    summary: 'Our values at work, gifts and conflicts of interest, and how to speak up.',
    lessons: [
      { title: 'Our values at work', body: 'We deal honestly with customers, suppliers and each other. We treat people with respect, whatever their role.' },
      { title: 'Gifts and conflicts of interest', body: 'Decline gifts that could influence a decision, or declare them to your manager. Tell us early if a personal interest overlaps with your work.' },
      { title: 'Speaking up', body: 'Raise a concern with your manager or the People team. We do not allow retaliation against anyone who speaks up in good faith.' },
    ],
    quiz: [
      q('A supplier offers you an expensive gift. What do you do?', ['Accept it quietly', 'Decline it, or declare it to your manager', 'Keep it and return the favour'], 1),
      q('Where can you raise a concern about a breach of the code?', ['Your manager or the People team', 'Nowhere', 'Only outside the company'], 0),
      q('Using company data for a side business is fine after hours.', TF, 1),
    ],
  },
  {
    id: 'c_safe_office', code: 'SAFE-O', title: 'Workplace safety (office)', category: 'compliance', mode: 'classroom', durationMin: 60, mandatory: true,
    audience: { departmentIds: [], designationIds: [], locationIds: ['loc_del', 'loc_blr'] },
    refresherMonths: 12, dueDays: 45, owner: 'Vikram Joshi (Operations)',
    summary: 'Fire exits, first aid and reporting an incident or near miss in the Delhi and Bengaluru offices.',
    lessons: [
      { title: 'Fire exits and assembly points', body: 'Know your two nearest exits and the assembly point. Never use the lift in a fire alarm.' },
      { title: 'First aid basics', body: 'Find the first aid box on your floor. For anything serious, call the emergency number first, then the floor safety contact.' },
      { title: 'Reporting an incident or near miss', body: 'Tell the floor safety contact about injuries and near misses. A near miss is a free lesson.' },
    ],
    quiz: [
      q('A fire alarm sounds. What do you do?', ['Finish your work first', 'Leave by the nearest exit and go to the assembly point', 'Take the lift'], 1),
      q('A near miss, where nobody was hurt, should still be reported.', TF, 0),
      q('You see a blocked fire exit. Who do you tell?', ['Nobody', 'The floor safety contact or Operations', 'Wait for the audit'], 1),
    ],
  },
  {
    id: 'c_safe_wh', code: 'SAFE-W', title: 'Warehouse safety', category: 'compliance', mode: 'classroom', durationMin: 90, mandatory: true,
    audience: { departmentIds: [], designationIds: [], locationIds: ['loc_mum'] },
    refresherMonths: 6, dueDays: 30, owner: 'Anita Desai (Operations)',
    summary: 'Walkways, racking, loading bays, protective gear and emergency drills at the Bhiwandi warehouse.',
    lessons: [
      { title: 'Walkways, racking and loading bays', body: 'Keep walkways clear. Stack only to the marked rack height. Chock the wheels of any truck at the loading bay.' },
      { title: 'Protective equipment', body: 'Safety shoes and a high-visibility vest are needed on the floor. Gloves and helmets apply to the tasks listed at the gate.' },
      { title: 'Emergency drills and reporting', body: 'Know the assembly point and the night-shift contact. Report every injury and near miss before the end of your shift.' },
    ],
    quiz: [
      q('Which protective gear is required on the warehouse floor?', ['Safety shoes and a high-visibility vest', 'Open sandals', 'None for a short visit'], 0),
      q('A forklift is reversing near you. You should', ['Cross behind it quickly', 'Stay clear and make eye contact with the driver', 'Wave and walk past'], 1),
      q('You may block an emergency exit with stock for an hour.', TF, 1),
    ],
  },
  {
    id: 'c_handling', code: 'HANDLE', title: 'Manual handling and forklift awareness', category: 'compliance', mode: 'classroom', durationMin: 60, mandatory: true,
    audience: { departmentIds: ['dep_wh'], designationIds: [], locationIds: [] },
    refresherMonths: 12, dueDays: 45, owner: 'Manoj Patil (Warehouse)',
    summary: 'Lifting without injury and working safely around forklifts and loads.',
    lessons: [
      { title: 'Lifting without injury', body: 'Bend your knees, keep the load close and do not twist. Use a trolley or ask for help when a load is awkward.' },
      { title: 'Working around forklifts', body: 'Only trained and authorised people drive a forklift. Pedestrians keep to marked paths.' },
      { title: 'Load limits', body: 'Check the load limit on the rack and the vehicle. Overloading is a reason to stop and ask.' },
    ],
    quiz: [
      q('Safe lifting starts with', ['Bending the back', 'Bending the knees and keeping the load close', 'Twisting as you lift'], 1),
      q('Only trained and authorised people may drive a forklift.', TF, 0),
      q('A load looks too heavy. You', ['Try anyway', 'Ask for help or a lifting aid', 'Drag it'], 1),
    ],
  },
  {
    id: 'c_field', code: 'FIELD', title: 'Field selling essentials', category: 'skill', mode: 'classroom', durationMin: 180, mandatory: true,
    audience: { departmentIds: [], designationIds: ['des_fe', 'des_ase', 'des_tl'], locationIds: [] },
    refresherMonths: 0, dueDays: 60, owner: 'Rohit Chauhan (Sales)',
    summary: 'Planning a beat, opening a visit, asking good questions and recording the visit.',
    lessons: [
      { title: 'Planning a beat', body: 'Look at last visit notes and open orders before you leave. Group visits by area to save travel time.' },
      { title: 'Opening a visit and asking questions', body: 'Start with the retailer\'s stock and what sells fastest. Listen first, then offer.' },
      { title: 'Closing and recording', body: 'Agree the next step before you leave. Record every visit in the app with a photo.' },
    ],
    quiz: [
      q('Before a visit you should', ['Check the last visit notes and any open order', 'Walk in cold', 'Skip planning'], 0),
      q('A good first question to a retailer is about', ['Your sales target', 'Their current stock and what sells fastest', 'Your commission'], 1),
      q('After the visit, record it in the app', ['Only if you made a sale', 'Every time, with a photo', 'At month end'], 1),
    ],
  },
  {
    id: 'c_excel', code: 'EXCEL', title: 'Excel for finance', category: 'skill', mode: 'self_paced', durationMin: 120, mandatory: false,
    audience: { departmentIds: ['dep_fin'], designationIds: [], locationIds: [] },
    refresherMonths: 0, dueDays: 60, owner: 'Neha Bansal (Finance)',
    summary: 'Clean tables, lookups, pivot tables and the checks that catch errors before a report goes out.',
    lessons: [
      { title: 'Clean data and tables', body: 'One header row, one fact per column, no merged cells. A clean table makes every later step easier.' },
      { title: 'Lookups and pivot tables', body: 'Use a lookup to bring a value from another table. Use a pivot table to total rows by category.' },
      { title: 'Checks that catch errors', body: 'Tie your totals to the ledger. Trace and explain any difference before you share the file.' },
    ],
    quiz: [
      q('Which function brings a value from another table?', ['SUMIF', 'XLOOKUP (or VLOOKUP)', 'CONCAT'], 1),
      q('A pivot table is best for', ['Summarising rows by category', 'Drawing shapes', 'Spell checking'], 0),
      q('A total that does not match the ledger should be', ['Hidden', 'Traced and explained before sharing', 'Rounded to match'], 1),
    ],
  },
  {
    id: 'c_people', code: 'PEOPLE', title: 'People management', category: 'skill', mode: 'classroom', durationMin: 240, mandatory: true,
    audience: { departmentIds: [], designationIds: ['des_tl', 'des_mgr'], locationIds: [] },
    refresherMonths: 0, dueDays: 90, owner: 'Ritu Malhotra (People)',
    summary: 'One-to-ones that help, giving feedback, and making fair decisions you can explain.',
    lessons: [
      { title: 'One-to-ones that help', body: 'Use the time for the person\'s work, growth and blockers. Keep the slot even when you are busy.' },
      { title: 'Giving feedback', body: 'Be specific, be timely, and give it in private. Describe what you saw and what it caused.' },
      { title: 'Fair decisions and records', body: 'Before a decision that affects pay or a job, share the evidence and let the person reply. Keep notes you could show them.' },
    ],
    quiz: [
      q('A good one-to-one is mainly', ['A status report to you', 'A conversation about the person\'s work, growth and blockers', 'Skipped when busy'], 1),
      q('Feedback works best when it is', ['Specific and timely', 'Vague and saved for the review', 'Given in front of the team'], 0),
      q('Before a decision that affects pay or a job, the person should', ['Hear about it afterwards', 'See the evidence and get a chance to reply', 'Not be told'], 1),
    ],
  },
  {
    id: 'c_seccode', code: 'SECURE', title: 'Secure coding basics', category: 'skill', mode: 'self_paced', durationMin: 90, mandatory: false,
    audience: { departmentIds: ['dep_tech'], designationIds: [], locationIds: [] },
    refresherMonths: 0, dueDays: 60, owner: 'Divya Menon (Technology)',
    summary: 'Validating input, keeping secrets out of code and reviewing changes for risk.',
    lessons: [
      { title: 'Never trust input', body: 'Validate and escape anything that comes from a user or another system before you use it.' },
      { title: 'Secrets and keys', body: 'Keys and passwords live in a secrets store, never in the repository or a chat message.' },
      { title: 'Reviewing code for risk', body: 'Changes that touch payments, personal data or access need a second reviewer.' },
    ],
    quiz: [
      q('Where do API keys belong?', ['In the code repository', 'In a secrets store, not in code', 'In a chat message'], 1),
      q('User input should be', ['Trusted', 'Validated and escaped', 'Ignored'], 1),
      q('A pull request that touches payments needs', ['No review', 'A second reviewer', 'Only a quick glance'], 1),
    ],
  },
];

/** When the current round of each mandatory course was handed out. Due dates follow from the course's own allowance. */
const CYCLE_START: Record<string, string> = {
  c_posh: '2026-10-15', c_dpdp: '2026-10-20', c_coc: '2026-10-22', c_safe_office: '2026-10-05', c_safe_wh: '2026-10-12',
  c_handling: '2026-10-10', c_field: '2026-09-15', c_people: '2026-08-31',
};

/** A few hand-set outcomes so the story is the same on every load. */
type Fixed = { kind: 'done'; on: string } | { kind: 'overdue'; steps: number; assignedOn: string } | { kind: 'progress'; steps: number } | { kind: 'expired'; days: number } | { kind: 'skip' };
const FIXED: Record<string, Record<string, Fixed>> = {
  // The Bhiwandi warehouse safety round is overdue for most of the shift on purpose.
  c_safe_wh: {
    emp_11: { kind: 'done', on: '2026-10-16' },
    emp_12: { kind: 'overdue', steps: 1, assignedOn: '2026-09-14' },
    emp_13: { kind: 'overdue', steps: 0, assignedOn: '2026-09-14' },
    emp_14: { kind: 'overdue', steps: 2, assignedOn: '2026-09-14' },
    emp_15: { kind: 'progress', steps: 1 },
  },
  // Two people the rules cover but nobody has assigned yet (a rule added after they joined).
  c_dpdp: { emp_21: { kind: 'skip' } },
  c_coc: { emp_21: { kind: 'skip' } },
  c_posh: { emp_20: { kind: 'expired', days: 3 } },
};

export function makeLearningSeed(employees: Employee[]): LearningState {
  const rng = makeRng(2026);
  const today = PREVIEW_TODAY;
  const assignments: Assignment[] = [];
  const certificates: Certificate[] = [];
  let seq = 0;
  let certSeq = 0;
  const issue = (a: Assignment, course: Course, issuedOn: string, score: number) => {
    certSeq += 1;
    const cert: Certificate = {
      id: certificateId(certSeq, issuedOn), assignmentId: a.id, employeeId: a.employeeId, courseId: a.courseId, issuedOn,
      expiresOn: course.refresherMonths ? addMonthsISO(issuedOn, course.refresherMonths) : undefined, score,
    };
    a.certificateId = cert.id;
    certificates.push(cert);
  };
  const base = (e: Employee, course: Course, assignedOn: string, source: Assignment['source'] = 'rule'): Assignment => {
    seq += 1;
    return { id: `asg_${seq}`, employeeId: e.id, courseId: course.id, assignedOn, dueOn: addDays(assignedOn, course.dueDays), source, stepsDone: 0, attempts: 0 };
  };
  const finish = (a: Assignment, course: Course, on: string) => {
    a.stepsDone = course.lessons.length;
    a.attempts = rng() < 0.2 ? 2 : 1;
    a.completedOn = on;
    a.score = 70 + Math.floor(rng() * 7) * 5;
    issue(a, course, on, a.score);
  };

  for (const course of COURSES) {
    const start = CYCLE_START[course.id];
    // Recommended courses (not mandatory) get a few manual assignments so the catalogue shows them in use.
    const people = course.mandatory ? requiredFor(course, employees) : eligibleFor(course, employees).slice(0, 3);
    for (const e of people) {
      if (!isLearner(e)) continue;
      const fixed = FIXED[course.id]?.[e.id];
      if (fixed?.kind === 'skip') continue;
      const roll = rng();
      const source: Assignment['source'] = course.mandatory ? 'rule' : 'manual';
      const from = start ?? '2026-10-12';

      if (fixed?.kind === 'done') {
        const a = base(e, course, from, source); finish(a, course, fixed.on); assignments.push(a); continue;
      }
      if (fixed?.kind === 'overdue') {
        const a = base(e, course, fixed.assignedOn, source); a.stepsDone = fixed.steps; assignments.push(a); continue;
      }
      if (fixed?.kind === 'progress') {
        const a = base(e, course, from, source); a.stepsDone = fixed.steps; assignments.push(a); continue;
      }
      if (fixed?.kind === 'expired') {
        const issuedOn = addMonthsISO(addDays(today, -fixed.days), -course.refresherMonths);
        const a = base(e, course, addDays(issuedOn, -10), source); finish(a, course, issuedOn); assignments.push(a); continue;
      }

      const joinedAfterStart = e.joinDate > (start ?? '2026-10-12');
      if (roll < 0.64 || (!course.mandatory && roll < 0.76)) {
        // Done in the current round.
        const a = base(e, course, joinedAfterStart ? e.joinDate : from, source);
        const span = Math.max(0, Math.min(25, diffDays(a.assignedOn, today) - 1));
        finish(a, course, addDays(a.assignedOn, Math.floor(rng() * (span + 1))));
        assignments.push(a);
      } else if (roll < 0.76 && course.refresherMonths > 0) {
        // Done last round and the certificate lapses soon: this is what fills "expiring in 60 days".
        const expires = addDays(today, 8 + Math.floor(rng() * 50));
        const issuedOn = addMonthsISO(expires, -course.refresherMonths);
        const a = base(e, course, addDays(issuedOn, -9), source);
        finish(a, course, issuedOn);
        assignments.push(a);
      } else if (roll < 0.87) {
        const a = base(e, course, from, source);
        a.stepsDone = 1 + Math.floor(rng() * course.lessons.length);
        if (a.stepsDone === course.lessons.length) a.attempts = 1;
        assignments.push(a);
      } else if (roll < 0.95) {
        assignments.push(base(e, course, from, source));
      } else {
        const a = base(e, course, addDays(from, -(course.dueDays + 12)), source);
        a.stepsDone = Math.floor(rng() * course.lessons.length);
        assignments.push(a);
      }
    }
  }

  return { courses: structuredClone(COURSES), assignments, certificates, reminders: [], certSeq, log: [] };
}
