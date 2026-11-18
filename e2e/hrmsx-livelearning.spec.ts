import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession } from './utils';
import { MASTER_USER } from './hrms-utils';
import {
  assignBody, assignmentFromWire, certificateFromWire, courseFromWire, learningBootstrapFromWire, lessonBody, quizAnswerFromWire, quizBody, rulesBody,
} from '../src/lib/hrms/people/live/learningWire';

/**
 * HRMS live mode, phase 10: the Learning slice on the server. The server is a stateful miniature of the learning contract
 * behind page.route: the catalogue (with a standard library to load), assignments, the quiz marked on the server,
 * certificates numbered there, reminders and refreshers. It records every call. Its "today" is fixed (Wednesday 18 Nov
 * 2026), which the page uses for due / overdue in live mode. Nothing here talks to a real backend or database; all data
 * is fake.
 */

test.describe.configure({ timeout: 240_000 });
test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

const SOURCE_KEY = 'kinematic_hrms_source';
const PAGE = '/dashboard/hrms/learning';

const ENT = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';
const DEP = '33333333-3333-4333-8333-333333333333';
const DES = '44444444-4444-4444-8444-444444444444';
const ASHA = '55555555-5555-4555-8555-555555555555';
const DEV = '66666666-6666-4666-8666-666666666666';
const C_POSH = 'c0000000-0000-4000-8000-000000000001';
const C_EXCEL = 'c0000000-0000-4000-8000-000000000002';

const TODAY = '2026-11-18';
const SENTINEL = 'LiveOnly Course SENTINEL-551100';

type Row = Record<string, unknown>;
interface Call { method: string; path: string; body: Row | undefined; n: number }
interface Failure { when: (c: Call) => boolean; status: number; error: string; code?: string }

const lessons = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Lesson ${i + 1}`, body: `Body ${i + 1}` }));
const quiz = [
  { q: 'Where do you raise a concern?', options: ['The Internal Committee', 'Nowhere'], answer: 0 },
  { q: 'Is retaliation allowed?', options: ['Yes', 'No'], answer: 1 },
  { q: 'Intent decides everything.', options: ['True', 'False'], answer: 1 },
];
const course = (id: string, code: string, title: string, extra: Row = {}): Row => ({
  id, code, title, category: 'compliance', mode: 'self_paced', duration_min: 30, summary: `${title} summary`, mandatory: true,
  audience: { departmentIds: [], designationIds: [], locationIds: [] }, refresher_months: 12, due_days: 30, owner: 'People team', lessons: lessons(2), quiz, ...extra,
});

class FakeLearning {
  calls: Call[] = [];
  employees: Row[] = [];
  courses: Row[] = [];
  assignments: Row[] = [];
  certificates: Row[] = [];
  reminders: Row[] = [];
  log: Row[] = [];
  failures: Failure[] = [];
  mode: 'ok' | 'not_ready' | 'error' = 'ok';
  private seq = 0;
  private certSeq = 0;
  private idSeq = 0;

  seedPeople(): this {
    const mk = (id: string, code: string, first: string, last: string) => ({
      id, code, first_name: first, last_name: last, email: `${first.toLowerCase()}@example.com`, mobile: '9876500001', gender: 'female', dob: '1992-05-05',
      entity_id: ENT, location_id: LOC, department_id: DEP, designation_id: DES, reporting_to_id: null, employment_type: 'permanent', status: 'active', join_date: '2024-04-01',
      probation_months: 6, notice_days: 30, aadhaar_verified: false, uan_status: 'none', pf_member: true, pf_on_actual_wage: false, pt_applicable: true, lwf_applicable: false,
      tax_regime: 'new', pay_mode: 'bank', annual_ctc: '600000', documents: [], history: [],
    });
    this.employees = [mk(ASHA, 'EMP-0001', 'Asha', 'Rao'), mk(DEV, 'EMP-0002', 'Dev', 'Nair')];
    return this;
  }
  /** A catalogue with an overdue mandatory assignment for Asha. */
  seedLearning(): this {
    this.courses = [course(C_POSH, 'POSH', 'POSH awareness', { summary: SENTINEL }), course(C_EXCEL, 'EXCEL', 'Excel for finance', { category: 'skill', mandatory: false, refresher_months: 0 })];
    this.assignments = [this.asg(ASHA, C_POSH, '2026-10-01', '2026-10-31', 'rule')];
    return this;
  }
  full(): this { return this.seedPeople().seedLearning(); }

  private asg(emp: string, courseId: string, assignedOn: string, dueOn: string, source: string): Row {
    this.idSeq += 1;
    return { id: `a0000000-0000-4000-8000-${String(this.idSeq).padStart(12, '0')}`, employee_id: emp, course_id: courseId, assigned_on: assignedOn, due_on: dueOn, source, steps_done: 0, attempts: 0, completed_on: null, score: null, certificate_id: null };
  }
  callsTo(method: string, pattern: RegExp): Call[] { return this.calls.filter((c) => c.method === method && pattern.test(c.path)); }
  private ok(route: Route, data: unknown, status = 200) { return route.fulfill({ status, json: { success: true, data } }); }
  private err(route: Route, status: number, error: string, code = 'VALIDATION') { return route.fulfill({ status, json: { success: false, error, code } }); }
  private addLog(action: string, detail: string) { this.log.unshift({ id: crypto.randomUUID(), at: `${TODAY}T09:00:00Z`, by: 'Master Admin', action, detail }); }

  async handle(route: Route, url: string, method: string): Promise<boolean> {
    const u = new URL(url);
    const m = u.pathname.match(/^\/api\/v1\/hrms(\/.*)?$/);
    if (!m) return false;
    const path = m[1] ?? '';
    const raw = method === 'GET' || method === 'DELETE' ? undefined : route.request().postData() ?? undefined;
    const body = raw ? (JSON.parse(raw) as Row) : undefined;
    const call: Call = { method, path, body, n: this.seq++ };
    this.calls.push(call);
    const fi = this.failures.findIndex((f) => f.when(call));
    if (fi >= 0) { const f = this.failures.splice(fi, 1)[0]!; await this.err(route, f.status, f.error, f.code ?? 'VALIDATION'); return true; }

    if (method === 'GET' && path === '/bootstrap') {
      await this.ok(route, {
        entities: [{ id: ENT, name: 'Acme Retail Pvt Ltd', pan: null, tan: null, cin: null, gstin: null, address: { line1: '1 Main Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' }, registrations: [], signatory: null }],
        locations: [{ id: LOC, entity_id: ENT, name: 'Bengaluru Office', state: 'Karnataka', city: 'Bengaluru', address: null, metro: true, holiday_list_id: null }],
        departments: [{ id: DEP, name: 'Operations', head_id: null }], designations: [{ id: DES, name: 'Consultant', grade: 'E1' }],
        employees: this.employees, settings: { employee_code_prefix: 'EMP-' }, server_time: '2026-11-18T09:00:00Z',
      });
      return true;
    }
    if (!path.startsWith('/learning')) return false;
    const p = path.slice('/learning'.length);

    if (method === 'GET' && p === '/bootstrap') {
      if (this.mode === 'not_ready') { await this.err(route, 503, 'HRMS storage is not set up yet', 'HRMS_NOT_READY'); return true; }
      if (this.mode === 'error') { await this.err(route, 500, 'Internal server error', 'INTERNAL_ERROR'); return true; }
      await this.ok(route, { courses: this.courses, assignments: this.assignments, certificates: this.certificates, reminders: this.reminders, log: this.log, today: TODAY, server_time: '2026-11-18T09:00:00Z' });
      return true;
    }
    if (method === 'POST' && p === '/library') {
      const had = this.courses.length;
      if (!this.courses.some((c) => c.code === 'POSH')) this.courses.push(course(C_POSH, 'POSH', 'POSH awareness'));
      if (!this.courses.some((c) => c.code === 'EXCEL')) this.courses.push(course(C_EXCEL, 'EXCEL', 'Excel for finance', { category: 'skill', mandatory: false, refresher_months: 0 }));
      this.addLog('Standard courses added', `${this.courses.length - had} courses`);
      await this.ok(route, { added: this.courses.length - had, courses: this.courses });
      return true;
    }
    const rules = p.match(/^\/courses\/([^/]+)\/rules$/);
    if (method === 'PUT' && rules) {
      const c = this.courses.find((x) => x.id === rules[1]);
      if (!c) { await this.err(route, 404, 'That course is not in the catalogue.', 'NOT_FOUND'); return true; }
      Object.assign(c, { mandatory: body?.mandatory, audience: body?.audience, refresher_months: body?.refresher_months });
      await this.ok(route, c);
      return true;
    }
    const asg = p.match(/^\/courses\/([^/]+)\/assign$/);
    if (method === 'POST' && asg) {
      const ids = (body?.employee_ids as string[]) ?? [];
      const made: Row[] = [];
      let skipped = 0;
      for (const id of ids) {
        if (this.assignments.some((a) => a.employee_id === id && a.course_id === asg[1] && !a.completed_on)) { skipped += 1; continue; }
        const a = this.asg(id, asg[1]!, TODAY, String(body?.due_on ?? '2026-12-18'), 'manual');
        this.assignments.push(a); made.push(a);
      }
      await this.ok(route, { created: made.length, skipped, assignments: made });
      return true;
    }
    if (method === 'POST' && p === '/rules/apply') {
      const made: Row[] = [];
      for (const c of this.courses.filter((x) => x.mandatory)) {
        for (const e of this.employees) {
          if (this.assignments.some((a) => a.employee_id === e.id && a.course_id === c.id)) continue;
          const a = this.asg(String(e.id), String(c.id), TODAY, '2026-12-18', 'rule');
          this.assignments.push(a); made.push(a);
        }
      }
      await this.ok(route, { created: made.length, assignments: made });
      return true;
    }
    const step = p.match(/^\/assignments\/([^/]+)\/(lesson|quiz|remind)$/);
    if (method === 'POST' && step) {
      const a = this.assignments.find((x) => x.id === step[1]);
      if (!a) { await this.err(route, 404, 'That assignment is not on record.', 'NOT_FOUND'); return true; }
      const c = this.courses.find((x) => x.id === a.course_id)!;
      if (step[2] === 'lesson') {
        if (body?.steps_done !== undefined && body.steps_done !== a.steps_done) { await this.ok(route, a); return true; }
        a.steps_done = Number(a.steps_done) + 1;
        await this.ok(route, a);
        return true;
      }
      if (step[2] === 'quiz') {
        const answers = (body?.answers as (number | null)[]) ?? [];
        const key = (c.quiz as Row[]).map((q) => q.answer);
        const correct = key.reduce((t: number, k, i) => t + (answers[i] === k ? 1 : 0), 0);
        const score = Math.round((correct / key.length) * 100);
        const passed = score >= 70;
        a.attempts = Number(a.attempts) + 1;
        let cert: Row | null = null;
        if (passed) {
          this.certSeq += 1;
          cert = { id: `CERT-2026-${String(this.certSeq).padStart(4, '0')}`, assignment_id: a.id, employee_id: a.employee_id, course_id: a.course_id, issued_on: TODAY, expires_on: '2027-11-18', score };
          this.certificates.push(cert);
          Object.assign(a, { completed_on: TODAY, score, certificate_id: cert.id });
        }
        await this.ok(route, { result: { correct, total: key.length, score, passed }, assignment: a, certificate: cert });
        return true;
      }
      const rem = { id: crypto.randomUUID(), on: TODAY, by: 'Master Admin', employee_id: a.employee_id, course_id: a.course_id, assignment_id: a.id };
      this.reminders.unshift(rem);
      await this.ok(route, rem);
      return true;
    }
    await this.err(route, 404, `Unhandled ${method} ${path}`, 'NOT_FOUND');
    return true;
  }
}

// ───────────────────────────── helpers ─────────────────────────────
async function open(page: Page, fake: FakeLearning, path = PAGE, source: 'live' | 'sample' | null = 'live'): Promise<void> {
  await seedSession(page, MASTER_USER);
  if (source) await page.addInitScript(([k, v]) => { try { if (window.localStorage.getItem(k!) === null) window.localStorage.setItem(k!, v!); } catch { /* blocked */ } }, [SOURCE_KEY, source]);
  await mockApi(page, { me: { success: true, data: MASTER_USER }, onRequest: (route, url, method) => fake.handle(route, url, method) });
  await page.goto(path);
  await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
}
const slow = { timeout: 60_000 };
const toasts = (page: Page) => page.locator('[data-sonner-toast]');
async function waitLoaded(page: Page) {
  await expect(page.getByTestId('hrms-live-loading')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('learning-ready')).toBeVisible(slow);
}
const tab = (page: Page, name: RegExp) => page.getByRole('tab', { name }).click();
const dumpStorage = (page: Page): Promise<string> => page.evaluate(() => { const o: Record<string, string | null> = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; o[k] = localStorage.getItem(k); } return JSON.stringify(o); });

// ═════════════════════════════ wire mapping (no browser) ═════════════════════════════
test.describe('live learning: wire mapping (no browser)', () => {
  test('a course, an assignment, a certificate and a marked quiz map to the dashboard shapes', () => {
    const c = courseFromWire(course(C_POSH, 'POSH', 'POSH awareness', { duration_min: '45', audience: { departmentIds: [DEP, DEP], designationIds: [], locationIds: [LOC] } }));
    expect(c).toMatchObject({ id: C_POSH, code: 'POSH', durationMin: 45, mandatory: true, refresherMonths: 12, dueDays: 30, audience: { departmentIds: [DEP], designationIds: [], locationIds: [LOC] } });
    expect(c.lessons).toHaveLength(2);
    expect(c.quiz[1]).toEqual({ q: 'Is retaliation allowed?', options: ['Yes', 'No'], answer: 1 });
    expect(assignmentFromWire({ id: 'a', employee_id: ASHA, course_id: C_POSH, assigned_on: '2026-11-01', due_on: '2026-12-01', source: 'refresher', steps_done: 2, attempts: 1, completed_on: null, score: null, certificate_id: null }))
      .toEqual({ id: 'a', employeeId: ASHA, courseId: C_POSH, assignedOn: '2026-11-01', dueOn: '2026-12-01', source: 'refresher', stepsDone: 2, attempts: 1 });
    expect(certificateFromWire({ id: 'CERT-2026-0003', assignment_id: 'a', employee_id: ASHA, course_id: C_POSH, issued_on: TODAY, expires_on: null, score: 100 }))
      .toEqual({ id: 'CERT-2026-0003', assignmentId: 'a', employeeId: ASHA, courseId: C_POSH, issuedOn: TODAY, score: 100 });
    const q = quizAnswerFromWire({ result: { correct: 3, total: 3, score: 100, passed: true }, assignment: { id: 'a', completed_on: TODAY, certificate_id: 'CERT-2026-0003' }, certificate: { id: 'CERT-2026-0003' } });
    expect(q.result.passed).toBe(true);
    expect(q.assignment.certificateId).toBe('CERT-2026-0003');
    expect(learningBootstrapFromWire({ today: TODAY }).courses).toEqual([]);
  });

  test('bodies are snake_case and carry only what the server needs', () => {
    expect(rulesBody({ mandatory: true, audience: { departmentIds: [DEP, DEP], designationIds: [], locationIds: [] }, refresherMonths: 6 }))
      .toEqual({ mandatory: true, audience: { departmentIds: [DEP], designationIds: [], locationIds: [] }, refresher_months: 6 });
    expect(assignBody([ASHA, ASHA, DEV], '2026-12-01')).toEqual({ employee_ids: [ASHA, DEV], due_on: '2026-12-01' });
    expect(assignBody([ASHA])).toEqual({ employee_ids: [ASHA] });
    expect(lessonBody(2)).toEqual({ steps_done: 2 });
    expect(quizBody([0, undefined, 1])).toEqual({ answers: [0, null, 1] });
  });
});

// ═════════════════════════════ sample mode is untouched ═════════════════════════════
test.describe('sample learning is unchanged', () => {
  test('the page makes no HRMS call and shows the Preview badge and the sample courses', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/hrms')) hits.push(`${r.method()} ${r.url()}`); });
    await open(page, new FakeLearning().full(), PAGE, 'sample');
    await expect(page.getByRole('heading', { name: 'Learning', level: 1 })).toBeVisible(slow);
    await expect(page.getByText('Preview', { exact: true })).toBeVisible();
    await expect(page.getByTestId('course-c_posh')).toBeVisible();
    expect(hits).toEqual([]);
  });
});

// ═════════════════════════════ live ═════════════════════════════
test.describe('live learning: loading', () => {
  test('reads GET /learning/bootstrap; overdue is worked out against the server\'s today; nothing lands in browser storage', async ({ page }) => {
    const fake = new FakeLearning().full();
    await open(page, fake);
    await waitLoaded(page);
    await expect(page.getByTestId('hrms-local-note')).toHaveCount(0);
    await expect(page.getByText(/Saved on the server\./)).toBeVisible();
    expect(fake.callsTo('GET', /^\/learning\/bootstrap$/).length).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId(`course-${C_POSH}`)).toContainText('POSH awareness');
    await tab(page, /Assignments/);
    const row = page.getByTestId('assignments-table').getByRole('row', { name: /Asha Rao/ });
    await expect(row).toContainText('Overdue');        // due 31 Oct, and the server says it is 18 Nov
    await expect(row).toContainText('18 days overdue');
    expect(await dumpStorage(page)).not.toContain(SENTINEL);
  });

  test('a 503 shows the not-ready state; a 500 the error with its reason', async ({ page }) => {
    const fake = new FakeLearning().full();
    fake.mode = 'not_ready';
    await open(page, fake);
    await expect(page.getByTestId('learning-not-ready')).toBeVisible(slow);
    fake.mode = 'error';
    await page.getByTestId('learning-not-ready').getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('learning-error-message')).toContainText('Internal server error', slow);
  });
});

test.describe('live learning: setting up', () => {
  test('an empty catalogue offers the standard courses, which load from the server', async ({ page }) => {
    const fake = new FakeLearning().seedPeople();
    await open(page, fake);
    await waitLoaded(page);
    await expect(page.getByTestId('learning-empty')).toContainText('No courses yet');
    await page.getByTestId('learning-load-library').click();
    await expect(page.getByTestId(`course-${C_POSH}`)).toBeVisible(slow);
    await expect(page.getByTestId(`course-${C_EXCEL}`)).toBeVisible();
    expect(fake.callsTo('POST', /^\/learning\/library$/)).toHaveLength(1);
    await expect(toasts(page).filter({ hasText: '2 courses added' })).toBeVisible();
  });

  test('Apply rules asks the server, and the missing note clears', async ({ page }) => {
    const fake = new FakeLearning().full();
    await open(page, fake);
    await waitLoaded(page);
    await expect(page.getByTestId('missing-note')).toContainText('1 assignment is missing');   // Dev has no POSH yet
    await page.getByRole('button', { name: 'Apply rules' }).click();
    await expect(page.getByTestId('missing-note')).toContainText('Every mandatory rule is applied', slow);
    expect(fake.callsTo('POST', /^\/learning\/rules\/apply$/)).toHaveLength(1);
  });

  test('assigning by hand sends the people and the due date; the new row appears', async ({ page }) => {
    const fake = new FakeLearning().full();
    await open(page, fake);
    await waitLoaded(page);
    await page.getByTestId(`course-${C_EXCEL}`).getByRole('button', { name: 'Assign' }).click();
    const dlg = page.getByRole('dialog', { name: 'Assign: Excel for finance' });
    await dlg.getByRole('checkbox', { name: /Dev Nair/ }).check();
    await dlg.getByLabel('Due date').fill('2026-12-05');
    await dlg.getByRole('button', { name: 'Assign to 1 person' }).click();
    await expect(dlg).toHaveCount(0, slow);
    const posts = fake.callsTo('POST', new RegExp(`^/learning/courses/${C_EXCEL}/assign$`));
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body).toEqual({ employee_ids: [DEV], due_on: '2026-12-05' });
    await tab(page, /Assignments/);
    await expect(page.getByTestId('assignments-table').getByRole('row', { name: /Dev Nair.*Excel for finance/ })).toContainText('Assigned by hand');
  });

  test('saving who a course is for goes to the server; a refusal keeps the form open with the reason', async ({ page }) => {
    const fake = new FakeLearning().full();
    fake.failures.push({ when: (c) => c.method === 'PUT' && /\/rules$/.test(c.path), status: 400, error: 'Choose departments, designations and locations from this company.' });
    await open(page, fake);
    await waitLoaded(page);
    await page.getByTestId(`course-${C_EXCEL}`).getByRole('button', { name: 'Edit who it is for' }).click();
    const dlg = page.getByRole('dialog', { name: /Who it is for: Excel for finance/ });
    await dlg.getByRole('checkbox', { name: /Mandatory/ }).check();
    await dlg.getByRole('checkbox', { name: 'Operations', exact: true }).check();
    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect(dlg).toContainText('Choose departments, designations and locations from this company.', slow);
    await dlg.getByRole('button', { name: 'Save' }).click();   // the second try goes through
    await expect(dlg).toHaveCount(0, slow);
    const puts = fake.callsTo('PUT', new RegExp(`^/learning/courses/${C_EXCEL}/rules$`));
    expect(puts).toHaveLength(2);
    expect(puts[1]!.body).toEqual({ mandatory: true, audience: { departmentIds: [DEP], designationIds: [], locationIds: [] }, refresher_months: 0 });
    await expect(page.getByTestId(`course-${C_EXCEL}`)).toContainText('Mandatory');
  });
});

test.describe('live learning: taking a course', () => {
  test('lessons and the quiz go to the server, which marks it and issues the certificate number', async ({ page }) => {
    const fake = new FakeLearning().full();
    await open(page, fake, `${PAGE}?tab=assignments`);
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Continue POSH awareness for Asha Rao' }).click();
    const dlg = page.getByRole('dialog', { name: 'POSH awareness' });
    await expect(dlg.getByText('Acting for the learner')).toBeVisible();
    await dlg.getByRole('button', { name: 'Mark lesson done, next' }).click();
    await expect(dlg.getByTestId('lesson-title')).toHaveText('Lesson 2', slow);
    await dlg.getByRole('button', { name: 'Mark lesson done, go to the quiz' }).click();
    const lessonsPosted = fake.callsTo('POST', /\/lesson$/);
    expect(lessonsPosted.map((c) => c.body)).toEqual([{ steps_done: 0 }, { steps_done: 1 }]);

    // a wrong set first: the server marks it as not passed
    await dlg.getByRole('radio', { name: 'Nowhere', exact: true }).check();
    await dlg.getByRole('radio', { name: 'Yes', exact: true }).check();
    await dlg.getByRole('radio', { name: 'True', exact: true }).check();
    await dlg.getByRole('button', { name: 'Submit answers' }).click();
    await expect(dlg).toContainText('You scored 0%', slow);
    // then the right one
    await dlg.getByRole('button', { name: 'Clear answers' }).click();
    await dlg.getByRole('radio', { name: 'The Internal Committee', exact: true }).check();
    await dlg.getByRole('radio', { name: 'No', exact: true }).check();
    await dlg.getByRole('radio', { name: 'False', exact: true }).check();
    await dlg.getByRole('button', { name: 'Submit answers' }).click();
    await expect(dlg).toContainText('Certificate CERT-2026-0001 was issued', slow);
    expect(fake.callsTo('POST', /\/quiz$/).map((c) => c.body)).toEqual([{ answers: [1, 0, 0] }, { answers: [0, 1, 1] }]);
    await dlg.getByRole('button', { name: 'View certificate' }).click();
    await expect(page.getByTestId('certificate-id')).toHaveText('CERT-2026-0001');
    await expect(page.getByTestId('certificate-card')).toContainText('Issued by Acme Retail Pvt Ltd');
  });

  test('a refused answer is shown, and the quiz stays open', async ({ page }) => {
    const fake = new FakeLearning().full();
    fake.assignments[0]!.steps_done = 2;
    fake.failures.push({ when: (c) => /\/quiz$/.test(c.path), status: 400, error: 'Someone else just changed this assignment. Open it again to see where it stands.' });
    await open(page, fake, `${PAGE}?tab=assignments`);
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Continue POSH awareness for Asha Rao' }).click();
    const dlg = page.getByRole('dialog', { name: 'POSH awareness' });
    await dlg.getByRole('radio', { name: 'The Internal Committee', exact: true }).check();
    await dlg.getByRole('radio', { name: 'No', exact: true }).check();
    await dlg.getByRole('radio', { name: 'False', exact: true }).check();
    await dlg.getByRole('button', { name: 'Submit answers' }).click();
    await expect(toasts(page).filter({ hasText: 'Someone else just changed this assignment' })).toBeVisible(slow);
    await expect(dlg.getByRole('button', { name: 'Submit answers' })).toBeEnabled();
  });

  test('a reminder for an overdue person is logged on the server', async ({ page }) => {
    const fake = new FakeLearning().full();
    await open(page, fake, `${PAGE}?tab=assignments`);
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Send reminder to Asha Rao for POSH awareness' }).click();
    await expect(toasts(page).filter({ hasText: 'No message is sent yet' })).toBeVisible(slow);
    expect(fake.callsTo('POST', /\/remind$/)).toHaveLength(1);
  });
});

test.describe('live learning: phone width', () => {
  test('the empty catalogue and the loaded one fit a 390px screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const fake = new FakeLearning().seedPeople();
    await open(page, fake);
    await waitLoaded(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await expect(page.getByTestId('learning-empty')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.getByTestId('learning-load-library').click();
    await expect(page.getByTestId(`course-${C_POSH}`)).toBeVisible(slow);
    expect(await overflow()).toBeLessThanOrEqual(1);
  });
});
