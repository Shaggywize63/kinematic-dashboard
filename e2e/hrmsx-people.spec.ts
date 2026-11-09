import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { openHrms } from './hrms-utils';
import { makeSeed, PREVIEW_TODAY } from '../src/lib/hrms/seed';
import { makePeopleSeed } from '../src/lib/hrms/people/seed';
import { peopleStore } from '../src/lib/hrms/people/store';
import {
  PASS_MARK, addMonthsISO, certificateId, coverageBy, currentAssignments, expiringCertificates, gradeQuiz, inAudience, missingAssignments, overdueItems, requiredFor, statusOf,
} from '../src/lib/hrms/people/learningEngine';
import {
  benchStrength, gapsFor, levelOf, nineBoxReview, nineBoxSummary, validateRating, vacancyFacts, whoHas,
} from '../src/lib/hrms/people/talentEngine';
import {
  MIN_INTERVIEWS, MIN_RESPONSES, NOT_ENOUGH, engagementIndex, exitThemes, highlights, questionResult, redactComment, responsesIn, trendSeries, validateSurvey,
} from '../src/lib/hrms/people/engagementEngine';
import { TEAMS, teamMembers } from '../src/lib/hrms/people/teams';
import {
  EXPORT_HEADER, approvedExportRows, billableHours, billableSplit, sheetId, sheetTotal, submitCheck, teamUtilisation, utilisationPct, validateSheet, weekDates, weekStartOf,
} from '../src/lib/hrms/people/timesheetEngine';
import { SEED_WEEKS } from '../src/lib/hrms/people/seedTimesheets';
import { decideSheet, setHours, setPolicy, submitSheet } from '../src/lib/hrms/people/timesheetActions';
import { assignRefresher, completeLesson, submitQuiz } from '../src/lib/hrms/people/learningActions';
import { completeExitInterview, sendPulse, submitResponse } from '../src/lib/hrms/people/engagementActions';
import { addSuccessor, removeSuccessor, setRating } from '../src/lib/hrms/people/talentActions';

/**
 * People area: Learning, Talent and succession, Engagement, Timesheets. Two kinds of test:
 *  - pure checks of the engines and actions (no browser), including the anonymity rules, and
 *  - browser flows on the seeded sample data, with persistence checked by reloading.
 * Expected figures are worked out here from the same seed and engines, not typed in.
 */

const seed = makeSeed();
const people = makePeopleSeed();
const learners = seed.employees.filter((e) => e.status === 'active' || e.status === 'on_notice');
const nameOf = (id: string) => { const e = seed.employees.find((x) => x.id === id)!; return `${e.firstName} ${e.lastName}`; };
const nav = { timeout: 60_000 };

test.setTimeout(150_000);

/** Fail on any uncaught page error or console error (React render errors and hydration problems surface here). */
function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}
const tab = (page: Page, name: RegExp | string) => page.getByRole('tab', { name }).click();

// ═══════════════════════════════════ pure logic: learning ═══════════════════════════════════
test.describe('learning engine', () => {
  const st = people.learning;
  const today = PREVIEW_TODAY;
  const course = (id: string) => st.courses.find((c) => c.id === id)!;

  test('month arithmetic keeps the day where it exists and clamps at month end', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsISO('2026-11-07', 12)).toBe('2027-11-07');
    expect(addMonthsISO('2026-11-07', -12)).toBe('2025-11-07');
    expect(addMonthsISO('2026-12-15', 6)).toBe('2027-06-15');
    expect(addMonthsISO('2027-02-10', -3)).toBe('2026-11-10');
  });

  test('"mandatory for" works per dimension: an empty list means everyone, filled lists must all match', () => {
    const e = learners.find((x) => x.id === 'emp_12')!; // warehouse associate, Bhiwandi
    expect(inAudience({ departmentIds: [], designationIds: [], locationIds: [] }, e)).toBe(true);
    expect(inAudience({ departmentIds: ['dep_wh'], designationIds: [], locationIds: [] }, e)).toBe(true);
    expect(inAudience({ departmentIds: ['dep_wh'], designationIds: [], locationIds: ['loc_del'] }, e)).toBe(false);
    expect(inAudience({ departmentIds: [], designationIds: ['des_wh'], locationIds: ['loc_mum'] }, e)).toBe(true);
    expect(inAudience({ departmentIds: ['dep_sales'], designationIds: [], locationIds: [] }, e)).toBe(false);
  });

  test('warehouse safety is required for exactly the Bhiwandi staff and is overdue for the shift on purpose', () => {
    const req = requiredFor(course('c_safe_wh'), seed.employees).map((e) => e.id).sort();
    expect(req).toEqual(learners.filter((e) => e.locationId === 'loc_mum').map((e) => e.id).sort());
    const od = overdueItems(st.courses, seed.employees, st.assignments, today).filter((o) => o.course.id === 'c_safe_wh').map((o) => o.employee.id).sort();
    expect(od).toEqual(['emp_12', 'emp_13', 'emp_14']);
    for (const o of overdueItems(st.courses, seed.employees, st.assignments, today)) expect(o.daysOverdue).toBeGreaterThan(0);
  });

  test('status comes from the due date against today, completion beats everything', () => {
    const base = { id: 'a', employeeId: 'emp_1', courseId: 'c_posh', assignedOn: '2026-10-01', dueOn: '2026-11-07', source: 'rule' as const, stepsDone: 0, attempts: 0 };
    expect(statusOf(base, today)).toBe('not_started');
    expect(statusOf({ ...base, stepsDone: 1 }, today)).toBe('in_progress');
    expect(statusOf({ ...base, attempts: 1 }, today)).toBe('in_progress');
    expect(statusOf({ ...base, dueOn: '2026-11-06' }, today)).toBe('overdue');
    expect(statusOf({ ...base, dueOn: '2026-11-06', completedOn: '2026-11-01' }, today)).toBe('completed');
  });

  test('coverage counts a pair only when it is completed with a certificate that has not lapsed', () => {
    const name = (id: string) => id;
    const all = coverageBy('location', st.courses, seed.employees, st.assignments, st.certificates, today, name);
    expect(all.reduce((t, r) => t + r.required, 0)).toBe(st.courses.filter((c) => c.mandatory).reduce((t, c) => t + requiredFor(c, seed.employees).length, 0));
    // Lapse every certificate: nothing with a refresher stays covered.
    const lapsed = st.certificates.map((c) => ({ ...c, expiresOn: c.expiresOn ? '2026-01-01' : undefined }));
    const after = coverageBy('location', st.courses, seed.employees, st.assignments, lapsed, today, name);
    expect(after.reduce((t, r) => t + r.covered, 0)).toBeLessThan(all.reduce((t, r) => t + r.covered, 0));
    for (const r of all) expect(r.pct).toBe(Math.round((r.covered / r.required) * 100));
  });

  test('quiz pass mark is 70%: two of three fails, three of three passes', () => {
    const c = course('c_posh');
    expect(PASS_MARK).toBe(70);
    const right = c.quiz.map((q) => q.answer);
    expect(gradeQuiz(c, right)).toMatchObject({ correct: 3, total: 3, score: 100, passed: true });
    const two = [...right]; two[0] = (right[0]! + 1) % c.quiz[0]!.options.length;
    expect(gradeQuiz(c, two)).toMatchObject({ correct: 2, score: 67, passed: false });
    expect(gradeQuiz(c, [])).toMatchObject({ correct: 0, score: 0, passed: false });
    for (const k of st.courses) expect(k.quiz).toHaveLength(3);
  });

  test('missing assignments are the pairs a rule covers that nobody assigned; applying them closes the gap', () => {
    const missing = missingAssignments(st.courses, seed.employees, st.assignments);
    expect(missing).toEqual([{ employeeId: 'emp_21', courseId: 'c_dpdp' }, { employeeId: 'emp_21', courseId: 'c_coc' }]);
    const filled = [...st.assignments, ...missing.map((m, i) => ({ id: `n${i}`, ...m, assignedOn: today, dueOn: today, source: 'rule' as const, stepsDone: 0, attempts: 0 }))];
    expect(missingAssignments(st.courses, seed.employees, filled)).toEqual([]);
  });

  test('certificates lapsing within 60 days are listed (including one already lapsed); a refresher in progress is flagged', () => {
    const list = expiringCertificates(st.courses, seed.employees, st.assignments, st.certificates, today);
    expect(list.length).toBeGreaterThan(2);
    for (const x of list) expect(x.daysLeft).toBeLessThanOrEqual(60);
    expect(list.some((x) => x.employee.id === 'emp_20' && x.course.id === 'c_posh' && x.daysLeft === -3)).toBe(true);
    expect(list.map((x) => x.daysLeft)).toEqual([...list.map((x) => x.daysLeft)].sort((a, b) => a - b));
    const first = list[0]!;
    const withRefresher = [...st.assignments, { id: 'r1', employeeId: first.employee.id, courseId: first.course.id, assignedOn: today, dueOn: today, source: 'refresher' as const, stepsDone: 0, attempts: 0 }];
    const again = expiringCertificates(st.courses, seed.employees, withRefresher, st.certificates, today);
    expect(again.find((x) => x.cert.id === first.cert.id)!.refresherAssigned).toBe(true);
  });

  test('certificate numbers are year plus a running number, and the seed is deterministic', () => {
    expect(certificateId(7, '2026-11-07')).toBe('CERT-2026-0007');
    expect(new Set(st.certificates.map((c) => c.id)).size).toBe(st.certificates.length);
    expect(st.certSeq).toBe(st.certificates.length);
    expect(makePeopleSeed().learning).toEqual(people.learning);
  });

  test('actions: lessons, a failed quiz, a pass with a certificate, and a refresher', () => {
    peopleStore.reset();
    const l = () => peopleStore.get().learning;
    const a = l().assignments.find((x) => x.employeeId === 'emp_15' && x.courseId === 'c_safe_wh')!; // Dinesh, one lesson done
    expect(submitQuiz(a.id, [0, 1, 1])).toBeNull();                       // quiz not open before the last lesson
    completeLesson(a.id); completeLesson(a.id);
    const fail = submitQuiz(a.id, [1, 0, 0])!;
    expect(fail.result.passed).toBe(false);
    expect(l().assignments.find((x) => x.id === a.id)!.completedOn).toBeUndefined();
    expect(l().assignments.find((x) => x.id === a.id)!.attempts).toBe(1);
    const pass = submitQuiz(a.id, [0, 1, 1])!;
    expect(pass.result.score).toBe(100);
    expect(pass.certificateId).toBe(certificateId(people.learning.certSeq + 1, PREVIEW_TODAY));
    expect(l().assignments.find((x) => x.id === a.id)!.completedOn).toBe(PREVIEW_TODAY);
    expect(l().certificates.find((c) => c.id === pass.certificateId)!.expiresOn).toBe(addMonthsISO(PREVIEW_TODAY, 6));
    expect(submitQuiz(a.id, [0, 1, 1])).toBeNull();                       // done: cannot be marked twice
    // A refresher for a lapsed certificate creates a new assignment due in 14 days, once.
    const lapsed = l().certificates.find((c) => c.employeeId === 'emp_20' && c.courseId === 'c_posh')!;
    expect(assignRefresher(lapsed.id)).toBe(true);
    expect(assignRefresher(lapsed.id)).toBe(false);
    const asg = currentAssignments(l().assignments).find((x) => x.employeeId === 'emp_20' && x.courseId === 'c_posh')!;
    expect(asg.source).toBe('refresher');
    expect(asg.dueOn).toBe('2026-11-21');
    peopleStore.reset();
  });
});

// ═══════════════════════════════════ pure logic: talent ═══════════════════════════════════
test.describe('talent engine', () => {
  const t = people.talent;

  test('gaps are the skills a role needs at a level the person has not reached', () => {
    for (const e of learners) {
      const need = t.requirements[e.designationId] ?? {};
      for (const g of gapsFor(e, t.ratings, t.requirements)) {
        expect(need[g.skillId]).toBe(g.required);
        expect(levelOf(t.ratings, e.id, g.skillId)).toBe(g.actual);
        expect(g.short).toBe(g.required - g.actual);
        expect(g.short).toBeGreaterThan(0);
      }
    }
    const e = learners[0]!;
    const ratings = { ...t.ratings };
    for (const k of Object.keys(t.requirements[e.designationId] ?? {})) ratings[`${e.id}|${k}`] = { level: 4, note: 'x', by: 'y', on: '2026-01-01' };
    expect(gapsFor(e, ratings, t.requirements)).toEqual([]);
  });

  test('"who has skill X at level 3 or above" returns only those people, highest level first', () => {
    for (const s of t.skills) {
      const found = whoHas(learners, t.ratings, s.id, 3);
      for (const h of found) expect(h.level).toBeGreaterThanOrEqual(3);
      expect(found.map((h) => h.level)).toEqual([...found.map((h) => h.level)].sort((a, b) => b - a));
      expect(found.length).toBe(learners.filter((e) => levelOf(t.ratings, e.id, s.id) >= 3).length);
    }
  });

  test('a level of 3 or 4 needs an evidence note, lower levels do not', () => {
    expect(validateRating(3, '')).toMatch(/evidence/i);
    expect(validateRating(4, 'short')).toMatch(/evidence/i);
    expect(validateRating(3, 'Led the visit review on three beats')).toBeNull();
    expect(validateRating(2, '')).toBeNull();
    expect(validateRating(5, 'x'.repeat(20))).toMatch(/0 to 4/);
    for (const [k, r] of Object.entries(t.ratings)) if (r.level >= 3) expect(r.note.length, k).toBeGreaterThanOrEqual(8);
  });

  test('bench strength is read from the data: no successor is red, nobody ready is amber, anyone ready is green', () => {
    expect(benchStrength({ successors: [] }).status).toBe('red');
    expect(benchStrength({ successors: [{ employeeId: 'a', readiness: '1-2y', actions: [], addedOn: '' }] }).status).toBe('amber');
    expect(benchStrength({ successors: [{ employeeId: 'a', readiness: '3y+', actions: [], addedOn: '' }, { employeeId: 'b', readiness: 'now', actions: [], addedOn: '' }] })).toMatchObject({ status: 'green', readyNow: 1, total: 2 });
    const byId = Object.fromEntries(t.roles.map((r) => [r.id, benchStrength(r).status]));
    expect(byId.role_head_people).toBe('red');
    expect(byId.role_wh_lead).toBe('green');
    expect(byId.role_rm_south).toBe('amber');
    expect(t.roles).toHaveLength(6);
  });

  test('vacancy facts are plain facts: notice, time in role, retirement age, no prediction or sentiment', () => {
    const role = t.roles.find((r) => r.id === 'role_rm_south')!;
    const inc = seed.employees.find((e) => e.id === role.incumbentId)!;
    const facts = vacancyFacts(role, inc, PREVIEW_TODAY);
    expect(facts.join(' ')).toContain('Notice period is 90 days.');
    expect(facts.join(' ')).toMatch(/In this role for 8 years 4 months/);
    expect(facts.join(' ')).toMatch(/company retirement age of 60/);
    for (const r of t.roles) {
      const f = vacancyFacts(r, seed.employees.find((e) => e.id === r.incumbentId), PREVIEW_TODAY).join(' ');
      expect(f).not.toMatch(/likely|flight|probab|score|sentiment|unhappy|disengag|will leave/i);
    }
    const onNotice = { ...inc, status: 'on_notice' as const, lastWorkingDate: '2026-12-31' };
    expect(vacancyFacts(role, onNotice, PREVIEW_TODAY).join(' ')).toContain('Serving notice. Last working day 31 Dec 2026.');
  });

  test('9-box summary has counts and never a name; the review view has the names; groups under five are flagged', () => {
    const big = learners;
    const sum = nineBoxSummary(big, t.placements);
    expect(Object.keys(sum)).toEqual(['groupSize', 'placed', 'smallGroup', 'counts']);
    expect(JSON.stringify(sum)).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+/);
    expect(Object.values(sum.counts).reduce((a, b) => a + b, 0)).toBe(sum.placed);
    expect(sum.smallGroup).toBe(false);
    for (const team of TEAMS) {
      const g = teamMembers(team, seed.employees);
      expect(nineBoxSummary(g, t.placements).smallGroup).toBe(g.length < 5);
    }
    const rev = nineBoxReview(big, t.placements);
    expect(rev.cells['3-3']!.map((e) => e.id).sort()).toEqual(['emp_4', 'emp_5']);
    expect(rev.unplaced.length + sum.placed).toBe(big.length);
  });

  test('actions: a rating needs its evidence, a successor needs a reason, and every change is logged', () => {
    peopleStore.reset();
    expect(setRating('emp_9', 'sk_field', 4, '')).toMatchObject({ ok: false });
    expect(setRating('emp_9', 'sk_field', 4, 'Ran the Karol Bagh beat review end to end')).toEqual({ ok: true });
    expect(peopleStore.get().talent.ratings['emp_9|sk_field']!.level).toBe(4);
    expect(peopleStore.get().talent.log[0]!.action).toBe('Skill level changed');
    expect(setRating('emp_9', 'sk_field', 0, '')).toEqual({ ok: true });
    expect(peopleStore.get().talent.ratings['emp_9|sk_field']).toBeUndefined();

    expect(addSuccessor('role_head_people', 'emp_18', '1-2y', ['Own the POSH calendar'], 'no')).toMatchObject({ ok: false });
    expect(addSuccessor('role_head_people', 'emp_1', '1-2y', [], 'Trying to add the holder')).toMatchObject({ ok: false });
    expect(addSuccessor('role_head_people', 'emp_18', '1-2y', ['Own the POSH calendar'], 'Runs the POSH refresher well')).toEqual({ ok: true });
    expect(addSuccessor('role_head_people', 'emp_18', 'now', [], 'Added twice by mistake')).toMatchObject({ ok: false });
    const role = () => peopleStore.get().talent.roles.find((r) => r.id === 'role_head_people')!;
    expect(benchStrength(role()).status).toBe('amber');
    expect(role().history[0]).toMatchObject({ kind: 'added', employeeId: 'emp_18', reason: 'Runs the POSH refresher well' });
    expect(removeSuccessor('role_head_people', 'emp_18', 'Moved to another team')).toEqual({ ok: true });
    expect(benchStrength(role()).status).toBe('red');
    peopleStore.reset();
  });
});

// ═══════════════════════════════════ pure logic: engagement ═══════════════════════════════════
test.describe('engagement engine: the anonymity rules', () => {
  const e = people.engagement;
  const ratingQ = e.surveys[0]!.questions.find((q) => q.type === 'rating')!;
  const textQ = e.surveys[0]!.questions.find((q) => q.type === 'text')!;
  const resp = (n: number, withText = true) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, surveyId: 's', teamId: 't', answers: { [ratingQ.id]: 4, [textQ.id]: withText ? `Comment number ${i} about the roster` : '' } }));

  test('a group under five answers shows nothing: no average, no distribution', () => {
    for (const n of [0, 1, 4]) {
      const r = questionResult(ratingQ, resp(n));
      expect(r.shown).toBe(false);
      expect((r as { avg?: number }).avg).toBeUndefined();
    }
    const five = questionResult(ratingQ, resp(MIN_RESPONSES));
    expect(five).toMatchObject({ shown: true, avg: 4 });
    expect(MIN_RESPONSES).toBe(5);
    expect(NOT_ENOUGH).toBe('Not enough responses to show');
  });

  test('comments are held back for a group under five and shown above it', () => {
    expect(questionResult(textQ, resp(4))).toMatchObject({ shown: false, comments: [] });
    const r = questionResult(textQ, resp(6));
    expect(r.type === 'text' && r.shown && r.comments.length).toBe(6);
  });

  test('comments lose names, phone numbers, e-mail addresses and places, and the order is not the order people answered in', () => {
    const terms = ['Rohit', 'Chauhan', 'Rohit Chauhan', 'Bhiwandi'];
    expect(redactComment('Ask Rohit Chauhan on 98100 12345 or rohit@meridian.example', terms)).toBe('Ask [removed] on [removed] or [removed]');
    expect(redactComment('The night dock at Bhiwandi is dark', terms)).toBe('The night dock at [removed] is dark');
    expect(redactComment('Plain comment with nothing to hide', terms)).toBe('Plain comment with nothing to hide');
    const forward = resp(7);
    const a = questionResult(textQ, forward);
    const b = questionResult(textQ, [...forward].reverse());
    expect(a.type === 'text' && b.type === 'text' && a.comments).toEqual(b.type === 'text' ? b.comments : []);
    const inOrder = forward.map((r) => r.answers[textQ.id] as string);
    expect(a.type === 'text' && a.comments).not.toEqual(inOrder);
    // The seeded comments carry none of the sample people's first or full names.
    const names = seed.employees.flatMap((x) => [x.firstName, `${x.firstName} ${x.lastName}`]);
    for (const r of e.responses) { const t = r.answers[textQ.id]; if (typeof t === 'string') for (const n of names) expect(t).not.toContain(n); }
  });

  test('a response carries only the team: no person, no time, no extra attribute', () => {
    for (const r of e.responses) expect(Object.keys(r).sort()).toEqual(['answers', 'id', 'surveyId', 'teamId']);
    peopleStore.reset();
    const open = e.surveys.find((s) => s.status === 'open')!;
    const before = peopleStore.get().engagement.responses.length;
    expect(submitResponse(open.id, 'team_sales', { q_goals: 9, q_support: 4, q_recommend: true, q_change: '  Keep the huddle  ' })).toEqual({ ok: true });
    const added = peopleStore.get().engagement.responses.at(-1)!;
    expect(peopleStore.get().engagement.responses.length).toBe(before + 1);
    expect(Object.keys(added).sort()).toEqual(['answers', 'id', 'surveyId', 'teamId']);
    expect(added.answers).toEqual({ q_support: 4, q_recommend: true, q_change: 'Keep the huddle' });   // 9 is not a rating, so it is dropped
    expect(submitResponse(open.id, 'team_sales', {})).toMatchObject({ ok: false });
    expect(submitResponse('sv_oct', 'team_sales', { q_goals: 3 })).toMatchObject({ ok: false });       // closed pulse
    peopleStore.reset();
  });

  test('the engagement index is hidden under five responses; small teams stay out of the trend', () => {
    const oct = e.surveys.find((s) => s.id === 'sv_oct')!;
    expect(engagementIndex(oct, responsesIn(e.responses, oct.id, 'team_sales')).index).not.toBeNull();
    expect(engagementIndex(oct, responsesIn(e.responses, oct.id, 'team_tech')).index).toBeNull();
    expect(engagementIndex(oct, responsesIn(e.responses, oct.id, 'team_corp')).index).toBeNull();
    const closed = e.surveys.filter((s) => s.status === 'closed');
    const series = trendSeries(closed, e.responses, TEAMS, 4);
    expect(series.map((s) => s.name)).toEqual(['Whole company', ...TEAMS.map((t) => t.name)]);
    expect(series[0]!.points).toHaveLength(4);
    expect(series.find((s) => s.id === 'team_tech')!.points.every((p) => p.index === null)).toBe(true);
    expect(series.find((s) => s.id === 'team_sales')!.points.every((p) => p.index !== null)).toBe(true);
  });

  test('highlights come only from groups shown in both pulses and carry the number of responses', () => {
    const closed = e.surveys.filter((s) => s.status === 'closed');
    const hl = highlights(closed, e.responses, TEAMS);
    expect(hl.length).toBeGreaterThan(0);
    for (const h of hl) {
      expect(h.nNow).toBeGreaterThanOrEqual(5);
      expect(h.nBefore).toBeGreaterThanOrEqual(5);
      expect(Math.abs(h.delta)).toBeGreaterThanOrEqual(0.2);
      expect(['Finance & People', 'Technology']).not.toContain(h.scope);
    }
    expect(highlights([closed[0]!], e.responses, TEAMS)).toEqual([]);
  });

  test('exit themes need five completed interviews; below that nothing is aggregated', () => {
    const four = e.exitInterviews.slice(0, 4);
    expect(MIN_INTERVIEWS).toBe(5);
    expect(exitThemes(four)).toMatchObject({ completed: 4, shown: false, reasons: [] });
    const fifth = { ...four[0]!, id: 'ei_x', reasons: ['Career growth'], wouldReturn: 'no' as const };
    const five = exitThemes([...four, fifth]);
    expect(five.shown).toBe(true);
    expect(five.reasons.find((r) => r.reason === 'Career growth')).toMatchObject({ count: 3, pct: 60 });
    expect(five.wouldReturn).toEqual({ yes: 2, maybe: 2, no: 1 });
  });

  test('a pulse has at most five questions and needs a name; completing an interview marks it done in the exit record', () => {
    expect(validateSurvey('', [{ text: 'A question', type: 'rating' }])).toContain('Give the pulse a name.');
    expect(validateSurvey('Pulse', [])).toContain('Add at least one question.');
    expect(validateSurvey('Pulse', Array.from({ length: 6 }, () => ({ text: 'A question', type: 'rating' })))).toContain('A pulse has at most 5 questions.');
    expect(validateSurvey('Pulse', [{ text: 'ab', type: 'text' }])).toContain('Question 1 needs some text.');
    peopleStore.reset();
    expect(sendPulse('', [{ text: 'A question', type: 'rating' }])).toMatchObject({ ok: false });
    expect(completeExitInterview({ exitId: 'exit_1', employeeId: 'emp_22', label: 'x', reasons: [], wouldReturn: 'yes', text: '' })).toMatchObject({ ok: false });
    expect(completeExitInterview({ exitId: 'exit_1', employeeId: 'emp_22', label: 'x', reasons: ['Relocation'], wouldReturn: '', text: '' })).toMatchObject({ ok: false });
    peopleStore.reset();
  });
});

// ═══════════════════════════════════ pure logic: timesheets ═══════════════════════════════════
test.describe('timesheet engine', () => {
  const ts = people.timesheets;
  const sheet = (id: string, week: string) => ts.sheets.find((s) => s.id === sheetId(id, week))!;

  test('weeks run Monday to Sunday', () => {
    expect(weekStartOf('2026-11-07')).toBe('2026-11-02');
    expect(weekStartOf('2026-11-08')).toBe('2026-11-02');
    expect(weekStartOf('2026-11-02')).toBe('2026-11-02');
    expect(weekDates('2026-11-02')).toHaveLength(7);
    expect(weekDates('2026-11-02')[6]).toBe('2026-11-08');
  });

  test('validation: 16 hours a day is the limit, over 48 a week is a flag not an error, future days are refused', () => {
    const line = (hours: number[]) => ({ weekStart: '2026-11-02', lines: [{ projectId: 'p_helio', hours }] });
    const ok = validateSheet(line([8, 8, 8, 8, 8, 0, 0]), ts.policy, PREVIEW_TODAY);
    expect(ok).toEqual([]);
    const long = validateSheet(line([17, 0, 0, 0, 0, 0, 0]), ts.policy, PREVIEW_TODAY);
    expect(long.some((i) => i.level === 'error' && i.day === 0 && /16 hour daily limit/.test(i.message))).toBe(true);
    const cap = validateSheet(line([10, 10, 10, 10, 10, 0, 0]), ts.policy, PREVIEW_TODAY);
    expect(cap.every((i) => i.level === 'warn')).toBe(true);
    expect(cap.some((i) => /weekly cap of 48/.test(i.message))).toBe(true);
    expect(validateSheet(line([0, 0, 0, 0, 0, 0, 4]), ts.policy, PREVIEW_TODAY).some((i) => i.level === 'error' && /not happened yet/.test(i.message))).toBe(true);
    expect(validateSheet(line([0.3, 0, 0, 0, 0, 0, 0]), ts.policy, PREVIEW_TODAY).some((i) => /0.25/.test(i.message))).toBe(true);
    expect(validateSheet(line([-1, 0, 0, 0, 0, 0, 0]), ts.policy, PREVIEW_TODAY).some((i) => i.level === 'error')).toBe(true);
  });

  test('submit is allowed for a clean draft or returned week only', () => {
    const draft = sheet('emp_5', '2026-11-02');
    expect(submitCheck(draft, ts.policy, PREVIEW_TODAY).ok).toBe(true);
    expect(submitCheck({ ...draft, status: 'approved' }, ts.policy, PREVIEW_TODAY).reasons[0]).toMatch(/locked/);
    expect(submitCheck({ ...draft, status: 'submitted' }, ts.policy, PREVIEW_TODAY).reasons[0]).toMatch(/approver/);
    expect(submitCheck({ ...draft, lines: [] }, ts.policy, PREVIEW_TODAY).reasons[0]).toMatch(/hours/);
    expect(submitCheck({ ...sheet('emp_21', '2026-10-26') }, ts.policy, PREVIEW_TODAY).ok).toBe(true);   // returned week can be resubmitted
  });

  test('the sample has eight people and four weeks, the late weeks are waiting, returned or over the cap on purpose', () => {
    expect(ts.trackedIds).toHaveLength(8);
    expect(ts.sheets).toHaveLength(32);
    expect(SEED_WEEKS).toEqual(['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']);
    expect(sheet('emp_17', '2026-10-26')).toMatchObject({ status: 'submitted' });
    expect(sheetTotal(sheet('emp_17', '2026-10-26'))).toBeGreaterThan(ts.policy.weeklyCap);
    expect(sheet('emp_21', '2026-10-26')).toMatchObject({ status: 'returned' });
    expect(sheet('emp_21', '2026-10-26').comment).toMatch(/split/i);
    expect(ts.sheets.filter((s) => s.weekStart === '2026-11-02').every((s) => s.status === 'draft')).toBe(true);
    for (const s of ts.sheets) for (const l of s.lines) for (const h of l.hours) expect(h).toBeLessThanOrEqual(ts.policy.maxPerDay);
    expect(ts.sheets.filter((s) => s.status === 'approved' && sheetTotal(s) > ts.policy.weeklyCap)).toEqual([]);
  });

  test('billable and non-billable add up to the hours logged, week by week', () => {
    const split = billableSplit(ts.sheets, ts.projects, SEED_WEEKS, 'all');
    for (const w of split) {
      const week = ts.sheets.filter((s) => s.weekStart === w.weekStart);
      expect(w.billable + w.nonBillable).toBeCloseTo(week.reduce((t, s) => t + sheetTotal(s), 0), 2);
      expect(w.billable).toBeCloseTo(week.reduce((t, s) => t + billableHours(s, ts.projects), 0), 2);
    }
    const approvedOnly = billableSplit(ts.sheets, ts.projects, SEED_WEEKS, 'approved');
    expect(approvedOnly[3]).toMatchObject({ billable: 0, nonBillable: 0 });   // the current week is all draft
  });

  test('utilisation is billable hours over the standard week, per team, and the export has approved weeks only', () => {
    expect(utilisationPct(32, 1, 1, ts.policy)).toBe(80);
    expect(utilisationPct(0, 4, 2, ts.policy)).toBe(0);
    const teams = teamUtilisation(ts.sheets, seed.employees, ts.trackedIds, TEAMS, ts.projects, ts.policy, SEED_WEEKS, 'all');
    expect(teams.map((t) => t.team.id).sort()).toEqual(['team_ops', 'team_tech']);
    expect(teams.find((t) => t.team.id === 'team_tech')!.people).toBe(2);
    expect(teams.find((t) => t.team.id === 'team_ops')!.people).toBe(6);
    for (const t of teams) expect(t.pct).toBe(Math.round((t.billable / (ts.policy.standardWeek * 4 * t.people)) * 100));
    const rows = approvedExportRows(ts.sheets, seed.employees, ts.projects);
    expect(rows.length).toBeGreaterThan(40);
    for (const r of rows) { expect(r).toHaveLength(EXPORT_HEADER.length); expect(r[0]).not.toBe('2026-11-02'); expect(r[r.length - 2]).not.toBe(''); }
  });

  test('actions: a locked week cannot be edited, a return needs a comment, approving locks, limits are validated', () => {
    peopleStore.reset();
    const get = (id: string, week: string) => peopleStore.get().timesheets.sheets.find((s) => s.id === sheetId(id, week))!;
    // approved week: edit refused and unchanged
    const approved = get('emp_5', '2026-10-12');
    const before = JSON.stringify(approved.lines);
    expect(setHours('emp_5', '2026-10-12', 'p_helio', 0, 7)).toMatchObject({ ok: false });
    expect(JSON.stringify(get('emp_5', '2026-10-12').lines)).toBe(before);
    // submitted week: also locked
    expect(setHours('emp_10', '2026-10-26', 'p_northwind', 0, 3)).toMatchObject({ ok: false });
    // draft week: edit works, and submit locks it
    expect(setHours('emp_5', '2026-11-02', 'p_helio', 5, 2)).toEqual({ ok: true });
    expect(get('emp_5', '2026-11-02').lines.find((l) => l.projectId === 'p_helio')!.hours[5]).toBe(2);
    expect(submitSheet('emp_5', '2026-11-02')).toEqual({ ok: true });
    expect(get('emp_5', '2026-11-02').status).toBe('submitted');
    expect(setHours('emp_5', '2026-11-02', 'p_helio', 0, 9)).toMatchObject({ ok: false });
    // decisions
    const id = sheetId('emp_5', '2026-11-02');
    expect(decideSheet(id, 'returned', '')).toMatchObject({ ok: false });
    expect(decideSheet(id, 'approved', '')).toEqual({ ok: true });
    expect(get('emp_5', '2026-11-02')).toMatchObject({ status: 'approved' });
    expect(decideSheet(id, 'approved', '')).toMatchObject({ ok: false });   // already decided
    // a returned week is editable again and can be resubmitted
    expect(setHours('emp_21', '2026-10-26', 'p_admin', 3, 1)).toEqual({ ok: true });
    expect(submitSheet('emp_21', '2026-10-26')).toEqual({ ok: true });
    expect(get('emp_21', '2026-10-26').comment).toBeUndefined();
    // an over-cap week can be submitted (it is flagged, not blocked) but a 17 hour day cannot
    expect(setHours('emp_13', '2026-11-02', 'p_northwind', 0, 17)).toEqual({ ok: true });
    expect(submitSheet('emp_13', '2026-11-02')).toMatchObject({ ok: false });
    expect(setPolicy({ maxPerDay: 4 })).toMatchObject({ ok: false });
    expect(setPolicy({ weeklyCap: 40 })).toEqual({ ok: true });
    expect(peopleStore.get().timesheets.policy.weeklyCap).toBe(40);
    peopleStore.reset();
  });
});

// ═══════════════════════════════════ learning: browser ═══════════════════════════════════
test.describe('learning page', () => {
  test('renders the catalogue with its courses and the mandatory rules, and nothing errors', async ({ page }) => {
    const errors = watch(page);
    await openHrms(page, '/dashboard/hrms/learning');
    await expect(page.getByRole('heading', { name: 'Learning', level: 1 })).toBeVisible(nav);
    for (const c of people.learning.courses) await expect(page.getByTestId(`course-${c.id}`)).toBeVisible();
    await expect(page.getByTestId('course-c_safe_wh')).toContainText('Bhiwandi Warehouse');
    await expect(page.getByTestId('course-c_safe_wh')).toContainText('Every 6 months');
    await expect(page.getByTestId('course-c_excel')).toContainText('Recommended');
    await expect(page.getByTestId('course-c_posh')).toContainText('Mandatory for');
    await expect(page.getByTestId('course-c_posh')).toContainText('Everyone');
    await page.getByRole('tab', { name: 'Role skills' }).click();
    await expect(page.locator('[data-testid^="course-"]')).toHaveCount(people.learning.courses.filter((c) => c.category === 'skill').length);
    expect(errors).toEqual([]);
  });

  test('applying the rules creates the missing assignments and the note clears', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/learning');
    await expect(page.getByTestId('missing-note')).toContainText('2 assignments are missing', nav);
    await page.getByRole('button', { name: 'Apply rules' }).click();
    await expect(page.getByTestId('missing-note')).toContainText('Every mandatory rule is applied');
    await page.reload();
    await expect(page.getByTestId('missing-note')).toContainText('Every mandatory rule is applied', nav);
    await tab(page, /Assignments/);
    await page.getByRole('searchbox', { name: 'Search people' }).fill('Meenal');
    await expect(page.getByTestId('assignments-table').getByRole('row', { name: /Data protection basics/ })).toBeVisible();
    await expect(page.getByTestId('assignments-table').getByRole('row', { name: /Code of conduct/ })).toBeVisible();
  });

  test('editing who a course is for shows who is newly covered, and applying the rules assigns them', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/learning');
    await page.getByTestId('course-c_excel').getByRole('button', { name: 'Edit who it is for' }).click();
    const dlg = page.getByRole('dialog', { name: /Who it is for: Excel for finance/ });
    await dlg.getByRole('checkbox', { name: /Mandatory/ }).check();
    await dlg.getByRole('checkbox', { name: 'Operations', exact: true }).check();
    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByTestId('course-c_excel')).toContainText('Mandatory');
    // Finance (2 learners) already have it by hand; Operations has 3 learners with none, plus the 2 from before.
    await expect(page.getByTestId('missing-note')).toContainText('5 assignments are missing');
    await page.reload();
    await expect(page.getByTestId('missing-note')).toContainText('5 assignments are missing', nav);
  });

  test('assigning by hand: pick people and a date, people who already have it open are skipped', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/learning');
    await page.getByTestId('course-c_excel').getByRole('button', { name: 'Assign' }).click();
    const dlg = page.getByRole('dialog', { name: 'Assign: Excel for finance' });
    await expect(dlg.getByRole('button', { name: /^Assign to/ })).toBeDisabled();           // nobody picked yet
    await dlg.getByRole('checkbox', { name: /Vikram Joshi/ }).check();
    await expect(dlg.getByRole('button', { name: 'Assign to 1 person' })).toBeEnabled();
    await dlg.getByRole('button', { name: 'Assign to 1 person' }).click();
    await expect(dlg).toHaveCount(0);
    await tab(page, /Assignments/);
    await page.getByLabel('Course', { exact: true }).selectOption({ label: 'Excel for finance' });
    const row = page.getByTestId('assignments-table').getByRole('row', { name: /Vikram Joshi/ });
    await expect(row).toContainText('Assigned by hand');
    await expect(row).toContainText('Not started');
    await page.reload();
    await tab(page, /Assignments/);
    await page.getByLabel('Course', { exact: true }).selectOption({ label: 'Excel for finance' });
    await expect(page.getByTestId('assignments-table').getByRole('row', { name: /Vikram Joshi/ })).toBeVisible(nav);
  });

  test('continue: lessons, a failed quiz, a pass, a certificate with a number, and it all survives a reload', async ({ page }) => {
    const errors = watch(page);
    await openHrms(page, '/dashboard/hrms/learning?tab=assignments');
    await page.getByRole('searchbox', { name: 'Search people' }).fill('Dinesh');
    const cont = page.getByRole('button', { name: 'Continue Warehouse safety for Dinesh Kamble' });
    await cont.click();
    const dlg = page.getByRole('dialog', { name: 'Warehouse safety' });
    await expect(dlg.getByTestId('lesson-title')).toHaveText('Protective equipment');           // one lesson was already done
    await expect(dlg.getByTestId('lesson-progress')).toHaveText('25%');
    await dlg.getByRole('button', { name: 'Mark lesson done, next' }).click();
    await expect(dlg.getByTestId('lesson-title')).toHaveText('Emergency drills and reporting');
    await dlg.getByRole('button', { name: 'Mark lesson done, go to the quiz' }).click();
    await expect(dlg.getByRole('button', { name: 'Submit answers' })).toBeDisabled();           // all three must be answered
    const c = people.learning.courses.find((x) => x.id === 'c_safe_wh')!;
    // Wrong on purpose.
    for (let i = 0; i < 3; i++) await dlg.getByRole('group').nth(i).getByRole('radio').nth((c.quiz[i]!.answer + 1) % c.quiz[i]!.options.length).check();
    await dlg.getByRole('button', { name: 'Submit answers' }).click();
    await expect(dlg).toContainText('You scored 0%');
    await expect(dlg).toContainText(`The pass mark is ${PASS_MARK}%`);
    await dlg.getByRole('button', { name: 'Clear answers' }).click();
    for (let i = 0; i < 3; i++) await dlg.getByRole('group').nth(i).getByRole('radio').nth(c.quiz[i]!.answer).check();
    await dlg.getByRole('button', { name: 'Submit answers' }).click();
    const certId = certificateId(people.learning.certSeq + 1, PREVIEW_TODAY);
    await expect(dlg).toContainText(`Certificate ${certId} was issued`);
    await dlg.getByRole('button', { name: 'View certificate' }).click();
    const cert = page.getByRole('dialog', { name: 'Certificate' });
    await expect(cert.getByTestId('certificate-id')).toHaveText(certId);
    await expect(cert.getByTestId('certificate-card')).toContainText('Dinesh Kamble');
    await expect(cert.getByTestId('certificate-card')).toContainText('Warehouse safety');
    await expect(cert.getByTestId('certificate-card')).toContainText('Mock certificate');
    await expect(cert.getByRole('button', { name: 'Print' })).toBeEnabled();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // The row is completed with a score, a certificate button, and no Continue.
    const row = page.getByTestId('assignments-table').getByRole('row', { name: /Dinesh Kamble.*Warehouse safety/ });
    await expect(row).toContainText('Completed');
    await expect(row).toContainText('100%');
    await page.reload();
    await page.getByRole('searchbox', { name: 'Search people' }).fill('Dinesh');
    await expect(page.getByTestId('assignments-table').getByRole('row', { name: /Dinesh Kamble.*Warehouse safety/ })).toContainText('Completed', nav);
    await tab(page, /Certificates/);
    await page.getByRole('searchbox').fill(certId);
    await expect(page.getByTestId('certificates-table').getByRole('row', { name: new RegExp(certId) })).toContainText('Dinesh Kamble');
    expect(errors).toEqual([]);
  });

  test('assignments can be filtered, and status comes from the due date', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/learning?tab=assignments');
    await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Overdue' });
    const rows = page.getByTestId('assignments-table').locator('tbody tr');
    const expected = currentAssignments(people.learning.assignments).filter((a) => { const e = seed.employees.find((x) => x.id === a.employeeId)!; return (e.status === 'active' || e.status === 'on_notice') && statusOf(a, PREVIEW_TODAY) === 'overdue'; }).length;
    await expect(rows).toHaveCount(expected, nav);
    await expect(rows.first()).toContainText('days overdue');
    await page.getByLabel('Department', { exact: true }).selectOption({ label: 'Warehouse' });
    for (const r of await rows.all()) await expect(r).toContainText(/Manoj|Santosh|Rekha|Dinesh/);
    await page.getByRole('searchbox', { name: 'Search people' }).fill('zzzz');
    await expect(page.getByTestId('assignments-table')).toContainText('No assignments match these filters.');
  });

  test('compliance: coverage by department and location match the engine, and the warehouse is overdue on purpose', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/learning?tab=compliance');
    const st = people.learning;
    const loc = coverageBy('location', st.courses, seed.employees, st.assignments, st.certificates, PREVIEW_TODAY, (id) => id);
    const dep = coverageBy('department', st.courses, seed.employees, st.assignments, st.certificates, PREVIEW_TODAY, (id) => id);
    for (const r of loc) await expect(page.getByTestId(`cov-${r.key}`)).toContainText(`${r.pct}%`, nav);
    for (const r of dep) await expect(page.getByTestId(`cov-${r.key}`)).toContainText(`${r.covered} of ${r.required}`);
    const overdue = page.getByTestId('overdue-table');
    for (const n of ['Manoj Patil', 'Santosh Gaikwad', 'Rekha More']) await expect(overdue.getByRole('row', { name: new RegExp(`${n}.*Warehouse safety`) })).toBeVisible();
    await expect(page.getByTestId('cov-loc_mum')).toContainText('overdue');
  });

  test('send reminder is logged and shown, never sent', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/learning?tab=compliance');
    await expect(page.getByText('Reminders are logged, not sent')).toBeVisible(nav);
    await page.getByRole('button', { name: 'Send reminder to Manoj Patil for Warehouse safety' }).click();
    const row = page.getByTestId('overdue-table').getByRole('row', { name: /Manoj Patil.*Warehouse safety/ });
    await expect(row).toContainText('Reminded 7 Nov 2026');
    await expect(row).toContainText('Remind again');
    await expect(page.getByTestId('reminder-log')).toContainText('Manoj');
    await page.reload();
    await expect(page.getByTestId('overdue-table').getByRole('row', { name: /Manoj Patil.*Warehouse safety/ })).toContainText('Reminded 7 Nov 2026', nav);
    await expect(page.getByTestId('learning-log')).toContainText('Reminder logged (not sent): Manoj Patil');
  });

  test('certificates lapsing in 60 days are listed with the lapsed one first, and a refresher can be assigned once', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/learning?tab=compliance');
    const exp = page.getByTestId('expiring-table');
    const first = exp.locator('tbody tr').first();
    await expect(first).toContainText('Farhan Ali', nav);
    await expect(first).toContainText('lapsed 3 days ago');
    const list = expiringCertificates(people.learning.courses, seed.employees, people.learning.assignments, people.learning.certificates, PREVIEW_TODAY);
    await expect(exp.locator('tbody tr')).toHaveCount(list.length);
    await page.getByRole('button', { name: 'Assign refresher to Farhan Ali for POSH awareness' }).click();
    await expect(first).toContainText('Refresher assigned');
    await page.reload();
    await expect(page.getByTestId('expiring-table').locator('tbody tr').first()).toContainText('Refresher assigned', nav);
    await tab(page, /Assignments/);
    await page.getByRole('searchbox', { name: 'Search people' }).fill('Farhan');
    await expect(page.getByTestId('assignments-table').getByRole('row', { name: /POSH awareness/ })).toContainText('Refresher');
  });

  test('the certificate register lists every certificate and opens a printable card', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/learning?tab=certificates');
    await expect(page.getByTestId('certificates-table').locator('tbody tr')).toHaveCount(people.learning.certificates.length, nav);
    await page.getByRole('searchbox').fill('Farhan');
    const row = page.getByTestId('certificates-table').getByRole('row', { name: /POSH awareness/ });
    await expect(row).toContainText('Lapsed');
    await row.getByRole('button', { name: /View certificate/ }).click();
    await expect(page.getByTestId('certificate-card')).toContainText('Farhan Ali');
    await expect(page.getByTestId('certificate-card')).toContainText('Valid until');
  });

  test.describe('at 390px', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    for (const t of ['catalogue', 'assignments', 'compliance', 'certificates']) {
      test(`no sideways page scroll: ${t}`, async ({ page }) => {
        await openHrms(page, `/dashboard/hrms/learning?tab=${t}`);
        await expect(page.getByRole('tab', { name: new RegExp(t, 'i'), selected: true })).toBeVisible(nav);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `${t} overflows by ${over}px`).toBeLessThanOrEqual(1);
      });
    }
  });
});

// ═══════════════════════════════════ talent: browser ═══════════════════════════════════
test.describe('talent page', () => {
  test('the skills matrix shows everyone against twelve skills, with gaps marked, and filters by department', async ({ page }) => {
    const errors = watch(page);
    await openHrms(page, '/dashboard/hrms/talent');
    await expect(page.getByRole('heading', { name: 'Talent & succession', level: 1 })).toBeVisible(nav);
    const m = page.getByTestId('skills-matrix');
    await expect(m.locator('tbody tr')).toHaveCount(learners.length);
    await expect(m.locator('thead th[scope="col"]')).toHaveCount(people.talent.skills.length + 1);
    // A cell below the role's level shows "actual /needed" and a red outline.
    const gapCell = people.talent.skills.flatMap((s) => learners.map((e) => ({ e, s }))).find(({ e, s }) => (people.talent.requirements[e.designationId]?.[s.id] ?? 0) > levelOf(people.talent.ratings, e.id, s.id))!;
    const need = people.talent.requirements[gapCell.e.designationId]![gapCell.s.id]!;
    await expect(page.getByTestId(`cell-${gapCell.e.id}-${gapCell.s.id}`)).toContainText(`/${need}`);
    await page.getByLabel('Mark gaps against the role').uncheck();
    await expect(page.getByTestId(`cell-${gapCell.e.id}-${gapCell.s.id}`)).not.toContainText(`/${need}`);
    await page.getByLabel('Department', { exact: true }).selectOption({ label: 'Technology' });
    await expect(m.locator('tbody tr')).toHaveCount(learners.filter((e) => e.departmentId === 'dep_tech').length);
    expect(errors).toEqual([]);
  });

  test('editing a level needs evidence for 3 and 4, saves, is logged and survives a reload', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/talent');
    const cell = page.getByTestId('cell-emp_9-sk_field');
    await cell.click();
    const dlg = page.getByRole('dialog', { name: /Field selling: Sana Qureshi/ });
    await dlg.getByLabel('Level', { exact: true }).selectOption('4');
    await dlg.getByLabel('Evidence').fill('');
    await dlg.getByRole('button', { name: 'Save level' }).click();
    await expect(dlg.getByRole('alert')).toContainText('Level 3 and 4 need an evidence note');
    await dlg.getByLabel('Evidence').fill('Ran three beats alone and recorded every visit.');
    await dlg.getByLabel('Assessed by').fill('Arvind Nair');
    await dlg.getByRole('button', { name: 'Save level' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(cell).toContainText('4');
    await expect(page.getByTestId('skill-log')).toContainText('Sana Qureshi: Field selling');
    await expect(page.getByTestId('skill-log')).toContainText('Expert');
    await page.reload();
    await expect(page.getByTestId('cell-emp_9-sk_field')).toContainText('4', nav);
    await page.getByTestId('cell-emp_9-sk_field').click();
    await expect(page.getByRole('dialog').getByText(/assessed by Arvind Nair/)).toBeVisible();
  });

  test('"who has skill X at level 3 or above" lists exactly those people, and the gaps view lists people with gaps', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/talent');
    await page.getByRole('tab', { name: 'Who has skill X' }).click();
    await page.getByLabel('Skill', { exact: true }).selectOption({ label: 'Stakeholder communication' });
    await page.getByLabel('Minimum level').selectOption('3');
    const expected = whoHas(learners, people.talent.ratings, 'sk_comm', 3);
    await expect(page.getByTestId('skill-search-count')).toContainText(`${expected.length} ${expected.length === 1 ? 'person has' : 'people have'} Stakeholder communication at level 3 or above`, nav);
    for (const h of expected) await expect(page.getByRole('row', { name: new RegExp(`${nameOf(h.employee.id)}`) }).first()).toBeVisible();
    await page.getByLabel('Minimum level').selectOption('4');
    const four = whoHas(learners, people.talent.ratings, 'sk_comm', 4).length;
    await expect(page.getByTestId('skill-search-count')).toContainText(`${four} `);

    await page.getByRole('tab', { name: 'Gaps against role' }).click();
    const withGaps = learners.filter((e) => gapsFor(e, people.talent.ratings, people.talent.requirements).length > 0);
    await expect(page.locator('[data-testid^="gap-"]').first()).toBeVisible();
    await expect(page.getByRole('tabpanel').locator('tbody tr')).toHaveCount(withGaps.length);
    // A gap chip opens that cell's editor.
    const e0 = withGaps[0]!;
    const g0 = gapsFor(e0, people.talent.ratings, people.talent.requirements)[0]!;
    await page.getByTestId(`gap-${e0.id}-${g0.skillId}`).click();
    await expect(page.getByRole('dialog')).toContainText(nameOf(e0.id));
  });

  test('succession: six critical roles with a bench status from the data, and facts about timing', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/talent?tab=succession');
    await expect(page.locator('[data-testid^="role-"]')).toHaveCount(6, nav);
    await expect(page.getByTestId('bench-role_head_people')).toHaveAttribute('data-status', 'red');
    await expect(page.getByTestId('bench-role_head_people')).toContainText('No successor named');
    await expect(page.getByTestId('bench-role_wh_lead')).toHaveAttribute('data-status', 'green');
    await expect(page.getByTestId('bench-role_rm_south')).toHaveAttribute('data-status', 'amber');
    await expect(page.getByTestId('role-role_rm_south')).toContainText('Notice period is 90 days.');
    await expect(page.getByTestId('role-role_rm_south')).toContainText('company retirement age of 60');
    await expect(page.getByTestId('successor-role_wh_lead-emp_13')).toContainText('Ready now');
    await expect(page.getByText(/There is no prediction about any person's intentions/)).toBeVisible();
  });

  test('succession: add, change and remove a successor, each with a reason that is kept; the bench status follows', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/talent?tab=succession');
    const role = page.getByTestId('role-role_head_people');
    const bench = page.getByTestId('bench-role_head_people');
    await page.getByRole('button', { name: 'Add a successor for Head of People' }).click();
    const add = page.getByRole('dialog', { name: /Add a successor: Head of People/ });
    await add.getByLabel('Person').selectOption({ label: 'Tanvi Kapoor · HR Executive' });
    await add.getByLabel('Reason').fill('no');
    await add.getByRole('button', { name: 'Add to bench' }).click();
    await expect(add.getByRole('alert')).toContainText('Give a short reason');
    await add.getByLabel('Development actions').fill('Own the POSH calendar\nLead the next payroll sign-off');
    await add.getByLabel('Reason').fill('Runs the POSH refresher and the statutory calendar well.');
    await add.getByRole('button', { name: 'Add to bench' }).click();
    await expect(add).toHaveCount(0);
    await expect(bench).toHaveAttribute('data-status', 'amber');
    await expect(role.getByTestId('successor-role_head_people-emp_18')).toContainText('Ready in 1 to 2 years');
    await expect(role.getByTestId('successor-role_head_people-emp_18')).toContainText('Lead the next payroll sign-off');

    await page.getByRole('button', { name: 'Change readiness of Tanvi Kapoor for Head of People' }).click();
    const ch = page.getByRole('dialog', { name: /Change readiness: Tanvi Kapoor/ });
    await ch.getByLabel('Readiness').selectOption('now');
    await ch.getByLabel('Reason').fill('Covered the head for three weeks with no issues.');
    await ch.getByRole('button', { name: 'Save change' }).click();
    await expect(bench).toHaveAttribute('data-status', 'green');
    await page.reload();
    await expect(page.getByTestId('bench-role_head_people')).toHaveAttribute('data-status', 'green', nav);
    await page.getByTestId('role-role_head_people').getByText(/History/).click();
    await expect(page.getByTestId('history-role_head_people')).toContainText('Covered the head for three weeks with no issues.');
    await expect(page.getByTestId('history-role_head_people')).toContainText('Runs the POSH refresher and the statutory calendar well.');

    await page.getByRole('button', { name: 'Remove Tanvi Kapoor from the bench for Head of People' }).click();
    const rm = page.getByRole('dialog', { name: /Remove from the bench: Tanvi Kapoor/ });
    await rm.getByRole('button', { name: 'Remove' }).click();
    await expect(rm.getByRole('alert')).toContainText('Give a short reason');
    await rm.getByLabel('Reason').fill('Moving to the payroll team.');
    await rm.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('bench-role_head_people')).toHaveAttribute('data-status', 'red');
  });

  test('9-box: the summary shows counts and no names; small groups are flagged; the review shows names', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/talent?tab=ninebox');
    const box = page.getByTestId('nine-box');
    await expect(page.getByText(/It does not drive pay/)).toBeVisible(nav);
    await expect(page.getByText(/not a score/)).toBeVisible();
    const sum = nineBoxSummary(learners, people.talent.placements);
    await expect(page.getByTestId('count-3-3')).toHaveText(String(sum.counts['3-3']));
    await expect(page.getByTestId('count-3-2')).toHaveText(String(sum.counts['3-2']));
    const text = await box.innerText();
    for (const e of learners) expect(text).not.toContain(e.firstName);
    // A group under five people: counts stay, the small-group note appears, still no names.
    await page.getByLabel('Group').selectOption({ label: 'Technology' });
    await expect(page.getByText(/fewer than 5 people/)).toBeVisible();
    expect(await box.innerText()).not.toContain('Divya');
    // The review view shows who is where.
    await page.getByLabel('Group').selectOption('all');
    await page.getByRole('tab', { name: 'Talent review (HR only)' }).click();
    await expect(page.getByTestId('box-3-3')).toContainText('Rohit Chauhan');
    await expect(page.getByTestId('box-3-3')).toContainText('Divya Menon');
    await expect(page.getByText('Opening it is recorded in the talent log.')).toBeVisible();
    await expect(page.getByTestId('unplaced')).toContainText('Meenal Shah');
    await page.getByText('Talent log (who looked, who changed what)').click();
    await expect(page.getByTestId('talent-log')).toContainText('Talent review (names) opened: Everyone');
  });

  test('9-box: place and move a person with a rationale; the counts update and it survives a reload', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/talent?tab=ninebox');
    await page.getByRole('tab', { name: 'Talent review (HR only)' }).click();
    await page.getByRole('button', { name: 'Place Meenal Shah' }).click();
    const dlg = page.getByRole('dialog', { name: /9-box placement: Meenal Shah/ });
    await dlg.getByLabel('Rationale').fill('short');
    await dlg.getByRole('button', { name: 'Save placement' }).click();
    await expect(dlg.getByRole('alert')).toContainText('at least 10 characters');
    await dlg.getByLabel('Performance in the current role').selectOption('3');
    await dlg.getByLabel('Potential', { exact: true }).selectOption('2');
    await dlg.getByLabel('Rationale').fill('Picked up the induction desk alone within two months.');
    await dlg.getByRole('button', { name: 'Save placement' }).click();
    await expect(page.getByTestId('box-3-2')).toContainText('Meenal Shah');
    await expect(page.getByTestId('unplaced')).not.toContainText('Meenal Shah');
    await page.reload();
    const before = nineBoxSummary(learners, people.talent.placements).counts['3-2']!;
    await expect(page.getByTestId('count-3-2')).toHaveText(String(before + 1), nav);
    await page.getByRole('tab', { name: 'Talent review (HR only)' }).click();
    await page.getByTestId('box-3-2').getByRole('button', { name: 'Meenal Shah' }).click();
    await expect(page.getByRole('dialog').getByLabel('Rationale')).toHaveValue('Picked up the induction desk alone within two months.');
    await page.getByRole('button', { name: 'Remove this placement' }).click();
    await expect(page.getByTestId('unplaced')).toContainText('Meenal Shah');
  });

  test.describe('at 390px', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    for (const t of ['skills', 'succession', 'ninebox']) {
      test(`no sideways page scroll: ${t}`, async ({ page }) => {
        await openHrms(page, `/dashboard/hrms/talent?tab=${t}`);
        await expect(page.getByRole('tabpanel')).toBeVisible(nav);
        if (t === 'ninebox') { await page.getByRole('tab', { name: 'Talent review (HR only)' }).click(); await expect(page.getByTestId('box-3-3')).toContainText('Rohit Chauhan'); }
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `${t} overflows by ${over}px`).toBeLessThanOrEqual(1);
        if (t === 'skills') {
          const inner = await page.evaluate(() => { const m = document.querySelector('[data-testid="skills-matrix"]')!; return m.scrollWidth - m.clientWidth; });
          expect(inner).toBeGreaterThan(0);   // the wide matrix scrolls inside its own box
        }
      });
    }
  });
});

// ═══════════════════════════════════ engagement: browser ═══════════════════════════════════
test.describe('engagement page', () => {
  const eng = people.engagement;
  const oct = eng.surveys.find((s) => s.id === 'sv_oct')!;

  test('renders results by team, shows the rules, hides small teams and nothing errors', async ({ page }) => {
    const errors = watch(page);
    await openHrms(page, '/dashboard/hrms/engagement');
    await expect(page.getByRole('heading', { name: 'Engagement', level: 1 })).toBeVisible(nav);
    await expect(page.getByTestId('principles-box')).toContainText('Why we aggregate');
    await expect(page.getByTestId('principles-box')).toContainText('What we never do');
    await expect(page.getByTestId('principles-box')).toContainText('Rank managers');
    const sales = engagementIndex(oct, responsesIn(eng.responses, oct.id, 'team_sales')).index!;
    await expect(page.getByTestId('team-card-team_sales')).toContainText(sales.toFixed(1), nav);
    await expect(page.getByTestId('team-card-team_sales')).toContainText('8 responses');
    for (const id of ['team_corp', 'team_tech']) await expect(page.getByTestId(`team-card-${id}`)).toContainText(NOT_ENOUGH);
    await expect(page.getByTestId('res-q_goals-team_tech')).toContainText('Not shown');
    await expect(page.getByTestId('res-q_goals-team_sales')).toContainText('of 5');
    await expect(page.getByTestId('res-q_recommend-team_ops')).toContainText('% yes');
    expect(errors).toEqual([]);
  });

  test('comments are anonymous: company and large teams show them, a small team shows the not-enough message', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/engagement');
    await expect(page.getByTestId('comments')).toBeVisible(nav);
    const all = await page.getByTestId('comments').locator('li').allInnerTexts();
    expect(all.length).toBeGreaterThan(5);
    for (const t of all) for (const e of seed.employees) expect(t).not.toContain(e.firstName);
    await page.getByLabel('Comments for').selectOption({ label: 'Technology' });
    await expect(page.getByTestId('comments-hidden')).toHaveText(NOT_ENOUGH);
    await expect(page.getByTestId('comments')).toHaveCount(0);
    await page.getByLabel('Comments for').selectOption({ label: 'Sales & Field' });
    await expect(page.getByTestId('comments')).toBeVisible();
    await expect(page.getByText(/Comments carry no team, time, role or place/)).toBeVisible();
  });

  test('taking the survey (demo) pushes a team over five and its results appear; a comment is cleaned of names and places', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/engagement');
    await page.getByRole('combobox', { name: 'Pulse' }).selectOption({ label: 'November pulse (open)' });
    const sales = page.getByTestId('team-card-team_sales');
    await expect(sales).toContainText(NOT_ENOUGH, nav);
    await expect(sales).toContainText('4 responses (5 needed)');
    await page.getByRole('button', { name: 'Take the survey (demo)' }).click();
    const dlg = page.getByRole('dialog', { name: /Take the survey: November pulse/ });
    await expect(dlg.getByRole('button', { name: 'Submit anonymously' })).toBeVisible();
    await dlg.getByRole('radio', { name: 'I understand how my work helps the company reach its goals. rating 5' }).check();
    await dlg.getByRole('radio', { name: 'My workload is manageable most weeks. rating 2' }).check();
    await dlg.getByRole('radio', { name: 'I would recommend Meridian as a place to work. Yes' }).check();
    await dlg.getByRole('textbox', { name: 'What is one thing we should change or keep?' }).fill('Ask Rohit Chauhan, call 98100 12345 or write rohit@meridian.example. Bhiwandi is dark at night.');
    await dlg.getByRole('button', { name: 'Submit anonymously' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(sales).toContainText('5 responses');
    await expect(sales).not.toContainText(NOT_ENOUGH);
    await expect(page.getByTestId('team-card-team_tech')).toContainText(NOT_ENOUGH);
    await page.getByLabel('Comments for').selectOption({ label: 'Sales & Field' });
    const comments = page.getByTestId('comments');
    await expect(comments).toContainText('[removed]');
    const text = await comments.innerText();
    for (const bad of ['Rohit', 'Chauhan', '98100', 'meridian.example', 'Bhiwandi']) expect(text).not.toContain(bad);
    await page.reload();
    await page.getByRole('combobox', { name: 'Pulse' }).selectOption({ label: 'November pulse (open)' });
    await expect(page.getByTestId('team-card-team_sales')).toContainText('5 responses', nav);
  });

  test('a new pulse: the builder allows five questions at most, sends (simulation), and a team needs five answers before it shows', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/engagement');
    await page.getByRole('button', { name: 'New pulse' }).click();
    const dlg = page.getByRole('dialog', { name: 'New pulse' });
    await expect(dlg.getByText('Simulation').first()).toBeVisible();
    await dlg.getByRole('button', { name: 'Send pulse' }).click();
    await expect(dlg.getByRole('alert')).toContainText('Give the pulse a name.');
    await expect(dlg.getByRole('button', { name: 'Add question' })).toBeDisabled();           // five copied from the last pulse
    await expect(dlg).toContainText('A pulse has at most 5 questions.');
    for (const i of [5, 4, 3]) await dlg.getByRole('button', { name: `Remove question ${i}` }).click();
    await expect(dlg.getByRole('button', { name: 'Add question' })).toBeEnabled();
    await dlg.getByLabel('Question 2 type').selectOption('yesno');
    await dlg.getByLabel('Question 1 text').fill('How clear was this week\'s plan?');
    await dlg.getByLabel('Name').fill('December pulse');
    await dlg.getByRole('button', { name: 'Send pulse' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByTestId('team-card-company')).toContainText(NOT_ENOUGH);
    await expect(page.getByTestId('team-card-company')).toContainText('0 responses (5 needed)');
    await expect(page.getByTestId('pulse-log')).toContainText('Pulse sent (simulation, nothing was emailed): December pulse');

    const answer = async () => {
      await page.getByRole('button', { name: 'Take the survey (demo)' }).click();
      const d = page.getByRole('dialog', { name: /Take the survey: December pulse/ });
      await d.getByRole('radio', { name: /rating 3$/ }).check();
      await d.getByRole('button', { name: 'Submit anonymously' }).click();
      await expect(d).toHaveCount(0);
    };
    for (let i = 0; i < 4; i++) await answer();
    await expect(page.getByTestId('team-card-team_sales')).toContainText(NOT_ENOUGH);
    await expect(page.getByTestId('team-card-team_sales')).toContainText('4 responses');
    await answer();
    await expect(page.getByTestId('team-card-team_sales')).not.toContainText(NOT_ENOUGH);
    await expect(page.getByTestId('team-card-team_sales')).toContainText('3.0');
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Pulse' }).locator('option', { hasText: 'December pulse' })).toHaveCount(1, nav);
  });

  test('trends: the chart shows teams with enough responses over four pulses, small teams are named as hidden, highlights give counts', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/engagement?tab=trends');
    const chart = page.getByTestId('trend-chart');
    await expect(chart.locator('svg[role="img"]').last()).toBeVisible(nav);
    await expect(chart.getByRole('list', { name: 'Legend' })).toContainText('Whole company');
    await expect(chart.getByRole('list', { name: 'Legend' })).toContainText('Sales & Field');
    await expect(chart.getByRole('list', { name: 'Legend' })).toContainText('Operations & Warehouse');
    await expect(chart.getByRole('list', { name: 'Legend' })).not.toContainText('Technology');
    await expect(page.getByText(`Technology: ${NOT_ENOUGH}`)).toBeVisible();
    await expect(page.getByText(`Finance & People: ${NOT_ENOUGH}`)).toBeVisible();
    await expect(chart.locator('svg[role="img"] circle')).toHaveCount(4 * 3);
    await page.getByText('Table view').click();
    await expect(page.getByTestId('trend-table').locator('tbody tr')).toHaveCount(4);
    await expect(page.getByTestId('trend-table')).toContainText(NOT_ENOUGH);
    const hl = page.getByTestId('highlights');
    await expect(hl).toContainText('Improved');
    await expect(hl).toContainText('Declined');
    await expect(hl).toContainText(/Based on \d+ responses, \d+ in the pulse before/);
    await expect(page.getByText(/There is no ranking of managers or teams\./)).toBeVisible();
    for (const e of seed.employees) await expect(hl).not.toContainText(e.firstName);
  });

  test('recognition: give thanks with a value, it joins the public feed and the month count, and it survives a reload', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/engagement?tab=recognition');
    await expect(page.getByTestId('kudos-feed').getByTestId('kudos-item')).toHaveCount(eng.kudos.length, nav);
    await expect(page.getByTestId('values-legend')).toContainText('Customer first');
    await expect(page.getByTestId('values-legend')).toContainText('Safety always');
    await expect(page.getByText('There is no leaderboard.')).toBeVisible();
    const novTotal = page.getByTestId('kudos-month-2026-11');
    await expect(novTotal).toContainText('Nov 2026');
    await page.getByRole('button', { name: 'Give recognition' }).click();
    const dlg = page.getByRole('dialog', { name: 'Give recognition' });
    await dlg.getByRole('button', { name: 'Post to the wall' }).click();
    await expect(dlg.getByRole('alert')).toContainText('Pick who you are thanking');
    await dlg.getByLabel('Who are you thanking?').selectOption({ label: 'Gaurav Saxena' });
    await dlg.getByLabel('Which value does it show?').selectOption({ label: 'Own it' });
    await dlg.getByLabel('What did they do?').fill('short');
    await dlg.getByRole('button', { name: 'Post to the wall' }).click();
    await expect(dlg.getByRole('alert')).toContainText('at least 10 characters');
    await dlg.getByLabel('What did they do?').fill('Closed the open invoices before the month end review.');
    await dlg.getByRole('button', { name: 'Post to the wall' }).click();
    await expect(dlg).toHaveCount(0);
    const first = page.getByTestId('kudos-item').first();
    await expect(first).toContainText('Gaurav Saxena');
    await expect(first).toContainText('Own it');
    await expect(first).toContainText('Closed the open invoices');
    await expect(first).toContainText('7 Nov 2026');
    // November: 2 sample thanks plus this one. Sales & Field is the first team column.
    const cells = await novTotal.locator('td').allInnerTexts();
    expect(cells[cells.length - 1]!.trim()).toBe('3');
    expect(cells[0]!.trim()).toBe('2');
    await page.reload();
    await expect(page.getByTestId('kudos-item').first()).toContainText('Closed the open invoices', nav);
    await page.getByLabel('Filter by value').selectOption({ label: 'Safety always' });
    await expect(page.getByTestId('kudos-item')).toHaveCount(eng.kudos.filter((k) => k.valueId === 'v_safe').length);
  });

  test('recognition has no leaderboard: teams are in a fixed order and nothing is ranked', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/engagement?tab=recognition');
    const heads = await page.getByTestId('kudos-counts').locator('thead th').allInnerTexts();
    expect(heads.map((h) => h.trim().toLowerCase())).toEqual(['month', ...TEAMS.map((t) => t.name.toLowerCase()), 'all']);
    await expect(page.getByText(/leaderboard|top recognised|most recognised/i)).toHaveCount(1);   // only the sentence that says there is none
  });

  test('exit interviews: themes are locked below five, the form validates, and finishing the fifth unlocks the themes', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/engagement?tab=exit');
    await expect(page.getByTestId('themes-locked')).toContainText('at least 5 interviews', nav);
    await expect(page.getByText('4 of 5 interviews complete')).toBeVisible();
    await expect(page.getByTestId('pending-interviews')).toContainText('Yash Rathore');
    // Individual answers stay closed until HR opens one.
    await expect(page.getByTestId('answers-ei_1')).toHaveCount(0);
    await page.getByRole('button', { name: 'Record exit interview for Yash Rathore' }).click();
    const dlg = page.getByRole('dialog', { name: /Exit interview: Yash Rathore/ });
    await dlg.getByRole('button', { name: 'Save interview' }).click();
    await expect(dlg.getByRole('alert')).toContainText('Pick at least one reason');
    await dlg.getByRole('checkbox', { name: 'Career growth' }).check();
    await dlg.getByRole('checkbox', { name: 'Better pay elsewhere' }).check();
    await dlg.getByRole('checkbox', { name: 'Relocation' }).check();
    await expect(dlg.getByRole('checkbox', { name: 'Other' })).toBeDisabled();                // three is the limit
    await dlg.getByRole('button', { name: 'Save interview' }).click();
    await expect(dlg.getByRole('alert')).toContainText('whether they would consider returning');
    await dlg.getByRole('radio', { name: 'Would not return' }).check();
    await dlg.getByLabel('In their own words').fill('Offer elsewhere was better and I am moving cities.');
    await dlg.getByRole('button', { name: 'Save interview' }).click();
    await expect(dlg).toHaveCount(0);

    const done = [...eng.exitInterviews, { id: 'x', label: '', completedOn: '', reasons: ['Career growth', 'Better pay elsewhere', 'Relocation'], wouldReturn: 'no' as const, text: '', by: '' }];
    const themes = exitThemes(done);
    await expect(page.getByTestId('themes')).toBeVisible();
    await expect(page.getByText('5 of 5 interviews complete')).toBeVisible();
    for (const r of themes.reasons) await expect(page.getByTestId(`theme-${r.reason}`)).toContainText(`${r.pct}% (${r.count} of 5)`);
    await expect(page.getByTestId('pending-interviews')).toHaveCount(0);
    // The core exit record knows the interview is done.
    const interviewDone = await page.evaluate(() => (JSON.parse(localStorage.getItem('kinematic_hrms_preview_v3')!) as { exits: { interviewDone: boolean }[] }).exits[0]!.interviewDone);
    expect(interviewDone).toBe(true);
    await page.reload();
    await expect(page.getByTestId('themes')).toBeVisible(nav);
    // Opening an individual record shows the answers and writes the access log.
    await page.getByRole('button', { name: /Show answers for Deepa Pillai/ }).click();
    await expect(page.getByTestId('answers-ei_1')).toContainText('Career growth');
    const logged = await page.evaluate(() => (JSON.parse(localStorage.getItem('kinematic_hrms_preview_v3')!) as { accessLog: { employeeId: string; field: string }[] }).accessLog.some((a) => a.employeeId === 'emp_23' && a.field === 'Exit interview answers'));
    expect(logged).toBe(true);
  });

  test.describe('at 390px', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    for (const t of ['pulse', 'trends', 'recognition', 'exit']) {
      test(`no sideways page scroll: ${t}`, async ({ page }) => {
        await openHrms(page, `/dashboard/hrms/engagement?tab=${t}`);
        await expect(page.getByRole('tabpanel')).toBeVisible(nav);
        await page.waitForTimeout(300);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `${t} overflows by ${over}px`).toBeLessThanOrEqual(1);
      });
    }
  });
});

// ═══════════════════════════════════ timesheets: browser ═══════════════════════════════════
test.describe('timesheets page', () => {
  const ts = people.timesheets;
  const divyaNow = ts.sheets.find((s) => s.id === sheetId('emp_5', '2026-11-02'))!;
  const cell = (page: Page, project: string, day: number) => page.getByTestId(`h-${project}-${day}`);

  test('the current week opens for the first person with the seeded hours, the limits and the status', async ({ page }) => {
    const errors = watch(page);
    await openHrms(page, '/dashboard/hrms/work-logs');
    await expect(page.getByRole('heading', { name: 'Timesheets', level: 1 })).toBeVisible(nav);
    await expect(page.getByTestId('week-label')).toHaveText('2 Nov to 8 Nov 2026');
    await expect(page.getByTestId('sheet-status')).toContainText('Draft');
    await expect(page.getByTestId('week-total')).toHaveText(String(sheetTotal(divyaNow)));
    await expect(page.getByText(/up to 16 hours in a day, a flag above 48 hours in a week/)).toBeVisible();
    await expect(page.getByText(/Overtime pay and consent rules live in/)).toBeVisible();
    await expect(page.getByTestId('overtime-link')).toHaveAttribute('href', /hrms\/time/);
    const bill = billableHours(divyaNow, ts.projects);
    await expect(page.getByTestId('my-util')).toHaveText(`${utilisationPct(bill, 1, 1, ts.policy)}%`);
    await expect(page.getByText(/visible to the person and their manager only/).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('entering hours updates the daily and weekly totals and survives a reload; days that have not happened are closed', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/work-logs');
    await expect(cell(page, 'p_helio', 6)).toBeDisabled(nav);                                 // Sunday 8 Nov, after today
    await expect(cell(page, 'p_helio', 5)).toBeEnabled();                                     // Saturday 7 Nov is today
    const before = sheetTotal(divyaNow);
    await cell(page, 'p_helio', 5).fill('2.5');
    await expect(page.getByTestId('daytotal-5')).toHaveText('2.5');
    await expect(page.getByTestId('week-total')).toHaveText(String(before + 2.5));
    await page.reload();
    await expect(cell(page, 'p_helio', 5)).toHaveValue('2.5', nav);
    await expect(page.getByTestId('week-total')).toHaveText(String(before + 2.5));
  });

  test('more than 16 hours in a day is an error that blocks submitting, with the reason shown', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/work-logs');
    await cell(page, 'p_helio', 0).fill('20');
    await expect(page.getByTestId('sheet-issues')).toContainText('above the 16 hour daily limit');
    await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
    await expect(page.getByTestId('submit-reason')).toContainText('16 hour daily limit');
    await cell(page, 'p_helio', 0).fill('3.5');
    await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeEnabled();
    await expect(page.getByTestId('sheet-issues')).toHaveCount(0);
  });

  test('over the weekly cap is a flag, not a block, and the cap follows the configured limit', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/work-logs');
    for (let d = 0; d < 5; d++) await cell(page, 'p_helio', d).fill('10');
    await expect(page.getByTestId('sheet-issues')).toContainText('over the weekly cap of 48');
    await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeEnabled();
    // Limits are editable, validated and logged; the page reflects them.
    await page.getByRole('button', { name: 'Edit limits' }).click();
    const dlg = page.getByRole('dialog', { name: 'Timesheet limits' });
    await dlg.getByLabel('Weekly cap that raises a flag').fill('5');
    await dlg.getByRole('button', { name: 'Save limits' }).click();
    await expect(dlg.getByRole('alert')).toContainText('weekly cap must be between');
    await dlg.getByLabel('Weekly cap that raises a flag').fill('70');
    await dlg.getByRole('button', { name: 'Save limits' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByText(/a flag above 70 hours in a week/)).toBeVisible();
    await expect(page.getByTestId('sheet-issues')).toHaveCount(0);       // 68 hours is under the new cap
    await page.reload();
    await expect(page.getByText(/a flag above 70 hours in a week/)).toBeVisible(nav);
  });

  test('submitting locks the week and it appears in the approvals queue', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/work-logs');
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(page.getByTestId('sheet-status')).toContainText('With the approver', nav);
    await expect(cell(page, 'p_helio', 0)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Add row' })).toHaveCount(0);
    await expect(page.getByTestId('sheet-trail')).toContainText('Submitted by Divya Menon');
    await page.reload();
    await expect(page.getByTestId('sheet-status')).toContainText('With the approver', nav);
    await tab(page, /Approvals/);
    await expect(page.getByTestId('approvals-waiting').getByRole('row', { name: /Divya Menon/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Approvals/ })).toContainText('3');
  });

  test('project rows: add one, remove it only when its hours are zero', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/work-logs');
    await page.getByLabel('Add a project').selectOption({ label: 'Orbit Pharma: cold-chain pilot' });
    await page.getByRole('button', { name: 'Add row' }).click();
    await expect(page.getByTestId('row-p_orbit')).toBeVisible();
    await cell(page, 'p_orbit', 1).fill('2');
    await page.getByRole('button', { name: 'Remove Orbit Pharma: cold-chain pilot' }).click();
    await expect(page.getByTestId('row-error')).toContainText('Set the hours on this row to 0');
    await cell(page, 'p_orbit', 1).fill('0');
    await page.getByRole('button', { name: 'Remove Orbit Pharma: cold-chain pilot' }).click();
    await expect(page.getByTestId('row-p_orbit')).toHaveCount(0);
  });

  test('an approved week is locked: every hour cell is disabled and there is nothing to submit', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/work-logs');
    await page.getByRole('button', { name: 'Previous week' }).click();
    await page.getByRole('button', { name: 'Previous week' }).click();
    await page.getByRole('button', { name: 'Previous week' }).click();
    await expect(page.getByTestId('week-label')).toHaveText('12 Oct to 18 Oct 2026');
    await expect(page.getByRole('button', { name: 'Previous week' })).toBeDisabled();
    await expect(page.getByTestId('sheet-status')).toContainText('Approved and locked');
    await expect(page.getByText(/Approved by Sanjay Kulkarni on .* This week is locked/)).toBeVisible();
    const inputs = page.getByTestId('sheet-grid').locator('input');
    expect(await inputs.count()).toBeGreaterThan(10);
    for (const i of await inputs.all()) await expect(i).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
    await expect(page.getByTestId('submit-reason')).toHaveCount(0);   // reasons are shown for weeks that can be edited
    await expect(page.getByRole('button', { name: 'Add row' })).toHaveCount(0);
  });

  test('approvals: the over-cap week is flagged; returning needs a comment; the person sees it and can fix it', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/work-logs?tab=approvals');
    const waiting = page.getByTestId('approvals-waiting');
    const harish = waiting.getByRole('row', { name: /Harish Reddy/ });
    await expect(harish).toContainText('Over the 48 h cap', nav);
    await expect(waiting.getByRole('row', { name: /Vikram Joshi/ })).toContainText('None');
    await page.getByRole('button', { name: /Review Harish Reddy, week of 2026-10-26/ }).click();
    const dlg = page.getByRole('dialog', { name: /Review: Harish Reddy/ });
    await expect(dlg).toContainText('over the weekly cap of 48');
    for (const i of await dlg.getByTestId('sheet-grid').locator('input').all()) await expect(i).toBeDisabled();   // the reviewer cannot change hours
    await dlg.getByRole('button', { name: 'Return with comment' }).click();
    await expect(dlg.getByRole('alert')).toContainText('Say what to fix');
    await dlg.getByLabel('Comment').fill('Please check Saturday: was that the Helio release night?');
    await dlg.getByRole('button', { name: 'Return with comment' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(waiting.getByRole('row', { name: /Harish Reddy/ })).toHaveCount(0);
    await expect(page.getByTestId('approvals-done').getByRole('row', { name: /Harish Reddy.*26 Oct/ })).toContainText('Please check Saturday');
    await expect(page.getByTestId('timesheet-log')).toContainText('Timesheet returned: Harish Reddy');
    // The person's own week shows the comment and is editable again.
    await tab(page, /Weekly timesheet/);
    await page.getByLabel('Person').selectOption({ label: 'Harish Reddy' });
    await page.getByRole('button', { name: 'Previous week' }).click();
    await expect(page.getByText(/Returned by .* Please check Saturday/)).toBeVisible();
    await expect(cell(page, 'p_helio', 5)).toBeEnabled();
    await cell(page, 'p_helio', 5).fill('0');
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(page.getByTestId('sheet-status')).toContainText('With the approver');
    await page.reload();
    await tab(page, /Approvals/);
    await expect(page.getByTestId('approvals-waiting').getByRole('row', { name: /Harish Reddy.*26 Oct/ })).toContainText('None', nav);   // resubmitted at 48 hours: no flag now
  });

  test('approving locks the week and adds it to the approved export; the CSV holds approved weeks only', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/work-logs?tab=approvals');
    const approvedBefore = ts.sheets.filter((s) => s.status === 'approved').length;
    await expect(page.getByRole('button', { name: new RegExp(`Export approved \\(CSV, ${approvedBefore} weeks\\)`) })).toBeVisible(nav);
    await page.getByRole('button', { name: /Review Vikram Joshi, week of 2026-10-26/ }).click();
    const dlg = page.getByRole('dialog', { name: /Review: Vikram Joshi/ });
    await dlg.getByRole('button', { name: 'Approve and lock' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByTestId('approvals-done').getByRole('row', { name: /Vikram Joshi.*26 Oct/ })).toContainText('Approved and locked');
    await expect(page.getByRole('button', { name: new RegExp(`Export approved \\(CSV, ${approvedBefore + 1} weeks\\)`) })).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export approved/ }).click()]);
    expect(dl.suggestedFilename()).toBe(`approved-timesheets-${PREVIEW_TODAY}.csv`);
    const csv = readFileSync((await dl.path())!, 'utf8').trim().split('\n');
    expect(csv[0]).toBe(EXPORT_HEADER.join(','));
    const after = ts.sheets.map((s) => (s.id === sheetId('emp_10', '2026-10-26') ? { ...s, status: 'approved' as const, decidedBy: 'x', decidedOn: 'y' } : s));
    expect(csv.length - 1).toBe(approvedExportRows(after, seed.employees, ts.projects).length);
    for (const line of csv.slice(1)) { expect(line.startsWith('2026-11-02')).toBe(false); expect(line.split(',').slice(-2).join('')).not.toBe(''); }
    expect(csv.some((l) => l.includes('MER-1010') && l.startsWith('2026-10-26'))).toBe(true);
    // Locked for good: the person's week is read-only now.
    await tab(page, /Weekly timesheet/);
    await page.getByLabel('Person').selectOption({ label: 'Vikram Joshi' });
    await page.getByRole('button', { name: 'Previous week' }).click();
    await expect(page.getByTestId('sheet-status')).toContainText('Approved and locked');
    await expect(cell(page, 'p_northwind', 0)).toBeDisabled();
  });

  test('projects: hours, budget against logged, sample rates, billable split and team utilisation match the engine', async ({ page }) => {
    const errors = watch(page);
    await openHrms(page, '/dashboard/hrms/work-logs?tab=projects');
    const helio = ts.projects.find((p) => p.id === 'p_helio')!;
    const logged = ts.sheets.flatMap((s) => s.lines.filter((l) => l.projectId === 'p_helio')).reduce((t, l) => t + l.hours.reduce((a, b) => a + b, 0), 0);
    const toDate = helio.priorHours + logged;
    await expect(page.getByTestId('proj-p_helio')).toContainText(`${toDate} of ${helio.budgetHours} h`, nav);
    await expect(page.getByTestId('proj-p_helio')).toContainText(`${Math.round((toDate / helio.budgetHours) * 100)}%`);
    await expect(page.getByTestId('proj-p_helio')).toContainText('₹2,200/h');
    await expect(page.getByTestId('proj-p_hrms')).toContainText('Non-billable');
    await expect(page.getByText('Sample, confirm').first()).toBeVisible();
    await expect(page.getByText(/not a rate card/)).toBeVisible();
    // Team utilisation (aggregate only) and the statement about individuals.
    const util = teamUtilisation(ts.sheets, seed.employees, ts.trackedIds, TEAMS, ts.projects, ts.policy, SEED_WEEKS, 'all');
    for (const u of util) await expect(page.getByTestId(`util-${u.team.id}`)).toContainText(`${u.pct}%`);
    await expect(page.getByText(/visible to them and their manager only/)).toBeVisible();
    await expect(page.getByTestId('team-util')).not.toContainText('Divya');
    // The split chart is there with a legend and a table view.
    await expect(page.getByTestId('split-chart').locator('svg[role="img"]')).toBeVisible();
    await expect(page.getByTestId('split-chart')).toContainText('Non-billable');
    await page.getByTestId('split-chart').getByText('Table view').click();
    await expect(page.getByTestId('split-chart').locator('li')).toHaveCount(4);
    expect(errors).toEqual([]);
  });

  test('projects: the period and the approved-only filter change the figures; hours by person add up', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/work-logs?tab=projects');
    const northwindAll = page.getByTestId('proj-p_northwind').locator('td').nth(1);
    const all = Number((await northwindAll.innerText()).trim());
    await page.getByLabel('Period').selectOption('2026-10-12');
    const oneWeek = Number((await page.getByTestId('proj-p_northwind').locator('td').nth(1).innerText()).trim());
    expect(oneWeek).toBeLessThan(all);
    expect(oneWeek).toBeGreaterThan(0);
    await page.getByLabel('Period').selectOption('2026-11-02');
    await page.getByLabel('Hours to include').selectOption('approved');
    await expect(page.getByTestId('proj-p_northwind').locator('td').nth(1)).toHaveText('0');   // the current week is all draft
    await page.getByLabel('Period').selectOption('all');
    // Row totals in "hours by project and person" equal the sum of that person's cells.
    await page.getByLabel('Hours to include').selectOption('all');
    const table = page.getByTestId('person-hours');
    for (const r of await table.locator('tbody tr').all()) {
      const cells = (await r.locator('td').allInnerTexts()).map((t) => (t.trim() === '–' ? 0 : Number(t.trim())));
      const total = cells.pop()!;
      expect(cells.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 2);
    }
    expect(await table.locator('tbody tr').count()).toBe(8);
  });

  test.describe('at 390px', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    for (const t of ['week', 'approvals', 'projects']) {
      test(`no sideways page scroll: ${t}`, async ({ page }) => {
        await openHrms(page, `/dashboard/hrms/work-logs?tab=${t}`);
        await expect(page.getByRole('tabpanel')).toBeVisible(nav);
        await page.waitForTimeout(300);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `${t} overflows by ${over}px`).toBeLessThanOrEqual(1);
        if (t === 'week') {
          const inner = await page.evaluate(() => { const g = document.querySelector('[data-testid="sheet-grid"]')!; return g.scrollWidth - g.clientWidth; });
          expect(inner).toBeGreaterThan(0);   // the timesheet grid scrolls inside its own box
        }
      });
    }
  });
});

