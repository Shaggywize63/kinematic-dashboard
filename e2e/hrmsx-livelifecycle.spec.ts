import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession } from './utils';
import { MASTER_USER } from './hrms-utils';
import { diffServer } from '../src/lib/hrms/live/diff';
import {
  exitCreateBody, exitFromWire, exitPatch, issuedLetterCreateBody, issuedLetterFromWire, issuedLetterPatch,
  letterTemplateCreateBody, letterTemplateFromWire, letterTemplatePatch, lifecycleFromWire, onboardingCreateBody, onboardingFromWire, onboardingPatch,
} from '../src/lib/hrms/live/lifecycleWire';
import type { ExitCase, IssuedLetter, LetterTemplate, OnboardingCase } from '../src/lib/hrms/types';

/**
 * HRMS live mode, phase 4: lifecycle and letters on the server. The server is a stateful miniature of the lifecycle contract
 * behind page.route: it keeps onboarding cases, exit cases, letter templates and issued letters (all ordinary {id} records),
 * enforces the close-exit blocker (clearance incomplete or F&F not paid), and records every call. The F&F cases come from the
 * payroll bootstrap (phase 2). Nothing talks to a real backend.
 */

test.describe.configure({ timeout: 240_000 });
test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

const SOURCE_KEY = 'kinematic_hrms_source';
const LOCAL_KEY = 'kinematic_hrms_live_local_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIFECYCLE = '/dashboard/hrms/lifecycle';

const ENT = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';
const DEP = '33333333-3333-4333-8333-333333333333';
const DES = '44444444-4444-4444-8444-444444444444';
const ASHA = '55555555-5555-4555-8555-555555555555';   // active, used for the seeded exit (close tests)
const DEV = '66666666-6666-4666-8666-666666666666';    // active, used for start-exit and letters
const NEO = '77777777-7777-4777-8777-777777777777';    // onboarding, linked to the seeded onboarding case
const ONB1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXIT1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TPL1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LET1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FNF1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

type Row = Record<string, unknown>;
interface Call { method: string; path: string; query: string; body: Row | undefined; n: number }
interface Failure { when: (c: Call) => boolean; status: number; error: string; code?: string; once?: boolean }

// ───────────────────────────── a stateful lifecycle server (wire shape) ─────────────────────────────
class FakeLifecycle {
  calls: Call[] = [];
  entities: Row[] = [];
  locations: Row[] = [];
  departments: Row[] = [];
  designations: Row[] = [];
  employees: Row[] = [];
  fnfCases: Row[] = [];
  onboarding: Row[] = [];
  exits: Row[] = [];
  letterTemplates: Row[] = [];
  letters: Row[] = [];
  failures: Failure[] = [];
  /** 'ok'; 'lc_not_ready' answers 503 HRMS_NOT_READY on /lifecycle/bootstrap; 'lc_error' answers 500 there. */
  mode: 'ok' | 'lc_not_ready' | 'lc_error' = 'ok';
  private seq = 0;

  seedOrg(): this {
    this.entities = [{ id: ENT, name: 'Acme Retail Pvt Ltd', pan: 'AABCA1234C', tan: null, cin: null, gstin: null, address: { city: 'Bengaluru', state: 'Karnataka' }, registrations: [], signatory: { name: 'Rhea Nair', designation: 'Director' } }];
    this.locations = [{ id: LOC, entity_id: ENT, name: 'Bengaluru Office', state: 'Karnataka', city: 'Bengaluru', address: null, metro: true, holiday_list_id: null }];
    this.departments = [{ id: DEP, name: 'Operations', head_id: null }];
    this.designations = [{ id: DES, name: 'Operations Associate', grade: 'E1' }];
    return this;
  }

  private mkEmp(id: string, code: string, first: string, status: string, over: Row = {}): Row {
    return {
      id, code, first_name: first, last_name: 'Rao', email: `${first.toLowerCase()}@example.com`, mobile: '9876500001', gender: 'female', dob: '1995-05-05',
      father_name: null, marital_status: null, blood_group: null, address: { city: 'Bengaluru', state: 'Karnataka' }, emergency_contact: null,
      entity_id: ENT, location_id: LOC, department_id: DEP, designation_id: DES, reporting_to_id: null, employment_type: 'permanent', status, join_date: '2024-04-01',
      confirmation_date: null, probation_months: 6, notice_days: 30, last_working_date: status === 'on_notice' ? '2026-11-30' : null, shift_id: null, cost_centre: null, contract_end_date: null,
      pan: null, aadhaar_last4: '1234', aadhaar_verified: false, uan: null, uan_status: 'none', pf_member: true, pf_on_actual_wage: false, pf_join_date: null, esic_ip: null,
      pt_applicable: true, lwf_applicable: false, tax_regime: 'new', declaration: { sec80C: 0, sec80D: 0, nps80CCD1B: 0, homeLoanInterest: 0, rentPaidAnnual: 0, other: 0, status: 'not_submitted' },
      pay_mode: 'bank', structure_id: null, annual_ctc: null, structure_overrides: null, documents: [], history: [], created_at: '2024-04-01T09:00:00Z', updated_at: '2024-04-01T09:00:00Z', ...over,
    };
  }

  seedPeople(): this {
    this.employees = [
      this.mkEmp(ASHA, 'EMP-0001', 'Asha', 'active'),
      this.mkEmp(DEV, 'EMP-0002', 'Dev', 'active', { annual_ctc: 900000 }),
      this.mkEmp(NEO, 'EMP-0003', 'Neo', 'onboarding'),
    ];
    return this;
  }

  /** A paid full-and-final case for Asha, so the exit's close blocker is only the clearance. */
  seedFnfPaid(): this {
    this.fnfCases = [{ id: FNF1, employee_id: ASHA, last_working_date: '2026-11-30', resignation_date: '2026-10-30', notice_days_served: 30, leave_encash_days: 0, other_recoveries: 0, other_payments: 0, status: 'paid', due_by: '2026-12-02' }];
    return this;
  }

  /** The seeded onboarding case for Neo, two tasks (one done). */
  seedOnboarding(): this {
    this.onboarding = [{
      id: ONB1, employee_id: NEO, name: 'Neo Rao', role: 'Operations Associate', join_date: '2026-11-20', stage: 'documents',
      tasks: [{ id: 't1', label: 'Collect documents', owner: 'HR', done: false }, { id: 't2', label: 'Issue laptop', owner: 'IT', done: true }],
      created_at: '2026-11-01T09:00:00Z', updated_at: '2026-11-01T09:00:00Z',
    }];
    return this;
  }

  /** The seeded exit for Asha. `allClear` makes every clearance done (for the injection test); otherwise HR is pending. */
  seedExit(allClear = false): this {
    const asha = this.employees.find((e) => e.id === ASHA);
    if (asha) { asha.status = 'on_notice'; asha.last_working_date = '2026-11-30'; }
    this.exits = [{
      id: EXIT1, employee_id: ASHA, reason: 'resignation', resignation_date: '2026-10-30', last_working_date: '2026-11-30', notice_waived: false, stage: 'clearance',
      clearance: [
        { id: 'c1', department: 'Reporting manager', owner: 'Rohit', done: true },
        { id: 'c2', department: 'IT', owner: 'IT desk', done: true },
        { id: 'c3', department: 'Finance', owner: 'Neha', done: true },
        { id: 'c4', department: 'HR', owner: 'Tanvi', done: allClear },
      ],
      assets: [{ id: 'a1', name: 'Laptop', returned: false }], interview_done: false,
      created_at: '2026-10-30T09:00:00Z', updated_at: '2026-10-30T09:00:00Z',
    }];
    return this;
  }

  seedTemplatesAndLetter(): this {
    this.letterTemplates = [{ id: TPL1, type: 'offer', name: 'Offer letter', body: 'Dear {{employee_name}},\n\nWelcome as {{designation}} at {{company}}.', created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T09:00:00Z' }];
    this.letters = [{ id: LET1, employee_id: DEV, template_id: TPL1, type: 'offer', issued_on: '2026-10-05', body: 'Dear Dev Rao,\n\nWelcome as Operations Associate at Acme Retail Pvt Ltd.', signed: false, created_at: '2026-10-05T09:00:00Z', updated_at: '2026-10-05T09:00:00Z' }];
    return this;
  }

  /** A single offer template, no issued letters (for the generate-letter test). */
  seedOfferTemplate(): this {
    this.letterTemplates = [{ id: TPL1, type: 'offer', name: 'Offer letter', body: 'Dear {{employee_name}},\n\nWe are pleased to offer you {{designation}} at {{company}} with an annual CTC of {{ctc}}, joining {{join_date}}.\n\nSincerely,\n{{signatory}}', created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T09:00:00Z' }];
    return this;
  }

  base(): this { return this.seedOrg().seedPeople(); }
  full(): this { return this.base().seedFnfPaid().seedOnboarding().seedExit().seedTemplatesAndLetter(); }

  writes(): Call[] { return this.calls.filter((c) => c.method !== 'GET'); }
  callsTo(method: string, pattern: RegExp): Call[] { return this.calls.filter((c) => c.method === method && pattern.test(c.path)); }

  private ok(route: Route, data: unknown, status = 200) { return route.fulfill({ status, json: { success: true, data } }); }
  private err(route: Route, status: number, error: string, code?: string) { return route.fulfill({ status, json: { success: false, error, ...(code ? { code } : {}) } }); }

  async handle(route: Route, url: string, method: string): Promise<boolean> {
    const u = new URL(url);
    const m = u.pathname.match(/^\/api\/v1\/hrms(\/.*)?$/);
    if (!m) return false;
    const path = m[1] ?? '';
    const raw = method === 'GET' || method === 'DELETE' ? undefined : route.request().postData() ?? undefined;
    const body = raw ? (JSON.parse(raw) as Row) : undefined;
    const call: Call = { method, path, query: u.search, body, n: this.seq++ };
    this.calls.push(call);

    const fi = this.failures.findIndex((f) => f.when(call));
    if (fi >= 0) {
      const f = this.failures[fi]!;
      if (f.once !== false) this.failures.splice(fi, 1);
      await this.err(route, f.status, f.error, f.code);
      return true;
    }

    // ── people + payroll + time (enough for the module to load; F&F comes from payroll) ──
    if (method === 'GET' && path === '/bootstrap') {
      await this.ok(route, { entities: this.entities, locations: this.locations, departments: this.departments, designations: this.designations, employees: this.employees, settings: { employee_code_prefix: 'EMP-' }, server_time: '2026-11-10T09:00:00Z' });
      return true;
    }
    if (method === 'GET' && path === '/payroll/bootstrap') {
      await this.ok(route, { structures: [], attendance: [], adjustments: [], loans: [], runs: [], fnf_cases: this.fnfCases, settings: { payroll: {} }, server_time: '2026-11-10T09:00:00Z' });
      return true;
    }
    if (method === 'GET' && path === '/time/bootstrap') {
      await this.ok(route, { shifts: [], roster: [], leave_types: [], holiday_lists: [], leave_balances: [], server_time: '2026-11-10T09:00:00Z' });
      return true;
    }

    // ── people writes the lifecycle flows compose (create a joiner, flip status) ──
    if (method === 'POST' && path === '/employees') { await this.createEmployee(route, body ?? {}); return true; }
    const emp = path.match(/^\/employees\/([^/]+)$/);
    if (emp && method === 'PUT') {
      const row = this.employees.find((e) => e.id === emp[1]);
      if (!row) { await this.err(route, 404, 'Employee not found', 'NOT_FOUND'); return true; }
      Object.assign(row, body, { updated_at: '2026-11-10T10:00:00Z' });
      await this.ok(route, row);
      return true;
    }

    // ── lifecycle and letters ──
    if (method === 'GET' && path === '/lifecycle/bootstrap') {
      if (this.mode === 'lc_not_ready') { await this.err(route, 503, 'HRMS storage is not set up yet', 'HRMS_NOT_READY'); return true; }
      if (this.mode === 'lc_error') { await this.err(route, 500, 'Internal server error', 'INTERNAL_ERROR'); return true; }
      await this.ok(route, { onboarding_cases: this.onboarding, exit_cases: this.exits, letter_templates: this.letterTemplates, issued_letters: this.letters, server_time: '2026-11-10T09:00:00Z' });
      return true;
    }
    const lc = path.match(/^\/lifecycle\/(onboarding|exits|letter-templates|letters)(?:\/([^/]+))?$/);
    if (lc) { await this.lifecycle(route, method, lc[1]!, lc[2], body); return true; }

    await this.err(route, 404, `Unhandled ${method} ${path}`, 'NOT_FOUND');
    return true;
  }

  private async createEmployee(route: Route, body: Row): Promise<void> {
    const id = (body.id as string) ?? crypto.randomUUID();
    const code = `EMP-${String(this.employees.length + 1).padStart(4, '0')}`;
    const { documents, ...rest } = body;
    const row = this.mkEmp(id, code, String(body.first_name ?? 'New'), String(body.status ?? 'onboarding'), { ...rest, id, code, documents: Array.isArray(documents) ? documents : [] });
    this.employees.push(row);
    await this.ok(route, row, 201);
  }

  private store(kind: string): Row[] {
    return kind === 'onboarding' ? this.onboarding : kind === 'exits' ? this.exits : kind === 'letter-templates' ? this.letterTemplates : this.letters;
  }

  /** The close-exit blocker, in the dashboard's own words (exitChecks): clearance pending, or F&F not paid. */
  private closeBlocker(exit: Row): string | null {
    const clearance = (exit.clearance as Row[]) ?? [];
    const pending = clearance.filter((i) => !i.done);
    if (pending.length) return `${pending.length} of ${clearance.length} clearances still pending: ${pending.map((i) => i.department).join(', ')}.`;
    const f = this.fnfCases.find((x) => x.employee_id === exit.employee_id);
    if (!f) return 'No full and final case exists yet. Create and pay it on the payroll page.';
    if (f.status !== 'paid') return `The full and final case is ${f.status}, and it must be paid before the exit can close.`;
    return null;
  }

  private async lifecycle(route: Route, method: string, kind: string, id: string | undefined, body: Row | undefined): Promise<void> {
    const list = this.store(kind);
    if (method === 'POST') {
      const b = body ?? {};
      if (list.some((r) => r.id === b.id)) { await this.ok(route, list.find((r) => r.id === b.id)); return; }
      if (kind === 'letter-templates' && !(typeof b.name === 'string' && b.name.trim())) { await this.err(route, 400, 'name: The template needs a name', 'VALIDATION'); return; }
      if ((kind === 'onboarding' || kind === 'exits' || kind === 'letters') && b.employee_id != null && !this.employees.some((e) => e.id === b.employee_id)) {
        await this.err(route, 400, 'employee_id: Unknown employee', 'VALIDATION'); return;
      }
      const row: Row = { created_at: '2026-11-10T09:00:00Z', updated_at: '2026-11-10T09:00:00Z', ...b };
      list.push(row);
      await this.ok(route, row, 201);
      return;
    }
    const row = list.find((r) => r.id === id);
    if (!row) { await this.err(route, 404, 'Not found', 'NOT_FOUND'); return; }
    if (method === 'PUT') {
      // Exits enforce the close blocker: moving stage to 'closed' is refused while clearance is incomplete or F&F is not paid.
      if (kind === 'exits' && body?.stage === 'closed') {
        const merged = { ...row, ...body } as Row;
        const blocker = this.closeBlocker(merged);
        if (blocker) { await this.err(route, 409, blocker, 'EXIT_BLOCKED'); return; }
      }
      Object.assign(row, body, { updated_at: '2026-11-10T10:00:00Z' });
      await this.ok(route, row);
      return;
    }
    if (method === 'DELETE') { list.splice(list.indexOf(row), 1); await this.ok(route, { id }); return; }
    await this.err(route, 405, 'Method not allowed', 'VALIDATION');
  }
}

// ───────────────────────────── helpers ─────────────────────────────
async function open(page: Page, fake: FakeLifecycle, path = LIFECYCLE, source: 'live' | 'sample' | null = 'live'): Promise<void> {
  await seedSession(page, MASTER_USER);
  if (source) await page.addInitScript(([k, v]) => { try { if (window.localStorage.getItem(k!) === null) window.localStorage.setItem(k!, v!); } catch { /* blocked */ } }, [SOURCE_KEY, source]);
  await mockApi(page, { me: { success: true, data: MASTER_USER }, onRequest: (route, url, method) => fake.handle(route, url, method) });
  await page.goto(path);
  await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
}

const banner = (page: Page) => page.getByTestId('hrms-preview-banner');
const toasts = (page: Page) => page.locator('[data-sonner-toast]');
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const slow = { timeout: 60_000 };

async function waitLoaded(page: Page) {
  await banner(page).waitFor({ timeout: 45_000 });
  await expect(page.getByTestId('hrms-live-loading')).toHaveCount(0, { timeout: 30_000 });
}
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (mesg) => { if (mesg.type() === 'error' && !/Failed to load resource/.test(mesg.text())) errors.push(`console: ${mesg.text()}`); });
  return errors;
}

// ═════════════════════════════ pure logic: no browser ═════════════════════════════
test.describe('live lifecycle: wire mapping and diff-sync (no browser)', () => {
  test('onboarding, exit, template and letter rows map both ways, snake_case bodies that carry only what changed', () => {
    const onbWire = { id: ONB1, employee_id: NEO, name: 'Neo Rao', role: 'Analyst', join_date: '2026-11-20', stage: 'documents', tasks: [{ id: 't1', label: 'Collect documents', owner: 'HR', done: false }] };
    const onb = onboardingFromWire(onbWire);
    expect(onb).toEqual({ id: ONB1, employeeId: NEO, name: 'Neo Rao', role: 'Analyst', joinDate: '2026-11-20', stage: 'documents', tasks: [{ id: 't1', label: 'Collect documents', owner: 'HR', done: false, dueOn: undefined }] });
    const onbCreate = onboardingCreateBody(onb);
    expect(onbCreate).toMatchObject({ id: ONB1, employee_id: NEO, name: 'Neo Rao', join_date: '2026-11-20', stage: 'documents' });
    expect(Object.keys(onbCreate).every((k) => !/[A-Z]/.test(k))).toBe(true);   // top-level keys are snake_case
    expect(onboardingPatch(onb, { ...onb }).keys).toEqual([]);
    const ticked = onboardingPatch(onb, { ...onb, tasks: [{ ...onb.tasks[0]!, done: true }] });
    expect(ticked.keys).toEqual(['tasks']);
    expect((ticked.body.tasks as Row[])[0]!.done).toBe(true);
    expect(onboardingPatch(onb, { ...onb, stage: 'assets' }).body).toEqual({ stage: 'assets' });

    const exitWire = { id: EXIT1, employee_id: ASHA, reason: 'resignation', resignation_date: '2026-10-30', last_working_date: '2026-11-30', notice_waived: false, stage: 'clearance', clearance: [{ id: 'c1', department: 'IT', owner: 'Desk', done: false }], assets: [{ id: 'a1', name: 'Laptop', returned: false }], interview_done: false };
    const exit = exitFromWire(exitWire);
    expect(exit).toMatchObject({ id: EXIT1, employeeId: ASHA, reason: 'resignation', resignationDate: '2026-10-30', lastWorkingDate: '2026-11-30', noticeWaived: false, stage: 'clearance', interviewDone: false });
    expect(exit.clearance).toEqual([{ id: 'c1', department: 'IT', owner: 'Desk', done: false, remarks: undefined }]);
    const closed = exitPatch(exit, { ...exit, stage: 'closed' });
    expect(closed.body).toEqual({ stage: 'closed' });
    const cleared = exitPatch(exit, { ...exit, clearance: [{ ...exit.clearance[0]!, done: true }] });
    expect((cleared.body.clearance as Row[])[0]!.done).toBe(true);

    const tpl = letterTemplateFromWire({ id: TPL1, type: 'offer', name: 'Offer', body: 'Dear {{employee_name}}' });
    expect(tpl).toEqual({ id: TPL1, type: 'offer', name: 'Offer', body: 'Dear {{employee_name}}' });
    expect(letterTemplateCreateBody(tpl)).toMatchObject({ id: TPL1, type: 'offer', name: 'Offer' });
    expect(letterTemplatePatch(tpl, { ...tpl, name: 'Offer v2' }).body).toEqual({ name: 'Offer v2' });

    const let1 = issuedLetterFromWire({ id: LET1, employee_id: DEV, template_id: TPL1, type: 'offer', issued_on: '2026-11-07', body: 'Dear Dev', signed: false });
    expect(let1).toEqual({ id: LET1, employeeId: DEV, templateId: TPL1, type: 'offer', issuedOn: '2026-11-07', body: 'Dear Dev', signed: false });
    expect(issuedLetterCreateBody(let1)).toMatchObject({ id: LET1, employee_id: DEV, template_id: TPL1, issued_on: '2026-11-07', signed: false });
    expect(issuedLetterPatch(let1, { ...let1, signed: true }).body).toEqual({ signed: true });
    // an ad-hoc letter with no template is stored as null
    const adhoc = issuedLetterFromWire({ id: LET1, employee_id: DEV, template_id: null, type: 'warning', issued_on: '2026-11-07', body: 'x', signed: false });
    expect(adhoc.templateId).toBe('');
  });

  test('the lifecycle bootstrap maps every collection', () => {
    const data = lifecycleFromWire({
      onboarding_cases: [{ id: ONB1, employee_id: NEO, name: 'Neo', role: 'A', join_date: '2026-11-20', stage: 'offer', tasks: [] }],
      exit_cases: [{ id: EXIT1, employee_id: ASHA, reason: 'resignation', resignation_date: '2026-10-30', last_working_date: '2026-11-30', notice_waived: false, stage: 'notice', clearance: [], assets: [], interview_done: false }],
      letter_templates: [{ id: TPL1, type: 'offer', name: 'Offer', body: 'x' }],
      issued_letters: [{ id: LET1, employee_id: DEV, template_id: TPL1, type: 'offer', issued_on: '2026-11-07', body: 'y', signed: false }],
      server_time: '2026-11-10T09:00:00Z',
    });
    expect(data.onboarding[0]!.name).toBe('Neo');
    expect(data.exits[0]!.employeeId).toBe(ASHA);
    expect(data.letterTemplates[0]!.type).toBe('offer');
    expect(data.letters[0]!.employeeId).toBe(DEV);
    expect(lifecycleFromWire({}).onboarding).toEqual([]);
  });

  test('the diff sends lifecycle rows after the people, templates before letters, and removals reversed', () => {
    const people = { entities: [], locations: [], departments: [], designations: [], employees: [] };
    const onb: OnboardingCase = { id: ONB1, employeeId: NEO, name: 'Neo', role: 'A', joinDate: '2026-11-20', stage: 'offer', tasks: [] };
    const exit: ExitCase = { id: EXIT1, employeeId: ASHA, reason: 'resignation', resignationDate: '2026-10-30', lastWorkingDate: '2026-11-30', noticeWaived: false, stage: 'notice', clearance: [], assets: [], interviewDone: false };
    const tpl: LetterTemplate = { id: TPL1, type: 'offer', name: 'Offer', body: 'x' };
    const let1: IssuedLetter = { id: LET1, employeeId: DEV, templateId: TPL1, type: 'offer', issuedOn: '2026-11-07', body: 'y', signed: false };
    const empty = { ...people, onboarding: [], exits: [], letterTemplates: [], letters: [] };
    const full = { ...people, onboarding: [onb], exits: [exit], letterTemplates: [tpl], letters: [let1] };
    const kinds = (ops: ReturnType<typeof diffServer>) => ops.map((o) => `${o.verb}:${o.kind}`);

    const adds = kinds(diffServer(empty as never, full as never));
    expect(adds.indexOf('create:letterTemplate')).toBeLessThan(adds.indexOf('create:letter'));   // a letter names a template id
    for (const k of ['create:onboarding', 'create:exit', 'create:letter']) expect(adds).toContain(k);

    const removes = kinds(diffServer(full as never, empty as never));
    expect(removes.indexOf('delete:letter')).toBeLessThan(removes.indexOf('delete:letterTemplate')); // a letter removed before the template it named
    expect(removes).toContain('delete:onboarding');
    expect(removes).toContain('delete:exit');

    // a single field change is one op
    const one = diffServer(full as never, { ...full, onboarding: [{ ...onb, stage: 'documents' }] } as never);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ kind: 'onboarding', verb: 'update', rowId: ONB1, body: { stage: 'documents' } });
    expect(kinds(diffServer(people as never, people as never))).toEqual([]);
  });
});

// ═════════════════════════════ sample mode is untouched ═════════════════════════════
test.describe('sample lifecycle is unchanged', () => {
  test('the Lifecycle page makes no HRMS call and shows the sample joiners, exits and templates', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/hrms')) hits.push(`${r.method()} ${r.url()}`); });
    await seedSession(page, MASTER_USER);
    await mockApi(page, { me: { success: true, data: MASTER_USER } });
    await page.goto(LIFECYCLE);
    await banner(page).waitFor({ timeout: 45_000 });
    await expect(banner(page)).toHaveAttribute('data-source', 'sample');
    await expect(page.getByRole('heading', { level: 1, name: 'Lifecycle' })).toBeVisible(slow);
    await expect(page.getByTestId('letters-live-empty')).toHaveCount(0);   // the empty offer is live-only
    await page.goto(`${LIFECYCLE}?tab=letters`);
    await expect(page.getByText('Offer letter').first()).toBeVisible(slow); // a sample template (ensureLetterTemplates seeds them)
    expect(hits).toEqual([]);
  });
});

// ═════════════════════════════ bootstrap ═════════════════════════════
test.describe('live lifecycle: bootstrap', () => {
  test('the server data populates the onboarding, exits and letters tabs, with no local note', async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, new FakeLifecycle().full());
    await waitLoaded(page);
    await expect(banner(page)).toHaveAttribute('data-source', 'live');
    await expect(page.getByTestId('hrms-local-note')).toHaveCount(0);        // lifecycle is on the server now
    await expect(page.getByText('Neo Rao').first()).toBeVisible(slow);       // the seeded onboarding case

    await page.goto(`${LIFECYCLE}?tab=exits`);
    await expect(page.getByText('Asha Rao').first()).toBeVisible(slow);      // the seeded exit
    await page.goto(`${LIFECYCLE}?tab=letters`);
    await expect(page.getByText('Offer letter').first()).toBeVisible(slow);  // the seeded template
    await expect(page.getByTestId('letters-live-empty')).toHaveCount(0);     // templates exist
    expect(errors).toEqual([]);
  });
});

// ═════════════════════════════ empty state: standard letter templates ═════════════════════════════
test.describe('live lifecycle: empty state', () => {
  test('a new org is offered "Add the standard letter templates", which creates them on the server with UUIDs', async ({ page }) => {
    const fake = new FakeLifecycle().base();   // no lifecycle rows
    await open(page, fake, `${LIFECYCLE}?tab=letters`);
    await waitLoaded(page);
    await expect(page.getByTestId('letters-live-empty')).toBeVisible(slow);
    await page.getByTestId('add-standard-letter-templates').click();
    await expect.poll(() => fake.callsTo('POST', /^\/lifecycle\/letter-templates$/).length, { timeout: 30_000 }).toBe(6);
    for (const c of fake.callsTo('POST', /^\/lifecycle\/letter-templates$/)) expect(c.body!.id).toMatch(UUID);
    await expect(page.getByTestId('letters-live-empty')).toHaveCount(0);
    await expect(page.getByText('Offer letter').first()).toBeVisible(slow);
    await expect(toasts(page).filter({ hasText: 'Standard letter templates added' })).toBeVisible(slow);
  });
});

// ═════════════════════════════ onboarding ═════════════════════════════
test.describe('live lifecycle: onboarding', () => {
  async function fillJoiner(page: Page) {
    await page.getByRole('button', { name: 'New joiner' }).first().click();
    const d = dialog(page, 'New joiner');
    await d.getByLabel('First name').fill('Ira');
    await d.getByLabel('Last name').fill('Menon');
    await d.getByLabel('Gender').selectOption('female');
    await d.getByLabel('Date of birth').fill('1999-03-03');
    await d.getByLabel('Work email').fill('ira.menon@example.com');
    await d.getByLabel('Mobile').fill('9811122233');
    await d.getByLabel('Designation').selectOption(DES);
    await d.getByLabel('Department').selectOption(DEP);
    await d.getByLabel('Location').selectOption(LOC);
    return d;
  }

  test('a new joiner creates the employee then the onboarding case on the server', async ({ page }) => {
    const fake = new FakeLifecycle().base();
    await open(page, fake, `${LIFECYCLE}?tab=onboarding`);
    await waitLoaded(page);
    const d = await fillJoiner(page);
    await d.getByRole('button', { name: 'Create joiner' }).click();
    await expect.poll(() => fake.callsTo('POST', /^\/lifecycle\/onboarding$/).length, { timeout: 30_000 }).toBe(1);
    const post = fake.callsTo('POST', /^\/lifecycle\/onboarding$/)[0]!;
    expect(post.body).toMatchObject({ name: 'Ira Menon', role: 'Operations Associate', stage: 'offer' });
    expect(post.body!.id).toMatch(UUID);
    expect((post.body!.tasks as unknown[]).length).toBe(8);
    // the employee was created first, and the onboarding case names it
    expect(fake.callsTo('POST', /^\/employees$/)).toHaveLength(1);
    const empId = fake.callsTo('POST', /^\/employees$/)[0]!.body!.id;
    expect(post.body!.employee_id).toBe(empId);
    await expect(toasts(page).filter({ hasText: 'Ira Menon added to onboarding with 8 tasks.' })).toBeVisible(slow);
  });

  test('a refused employee leaves no joiner and no onboarding case behind', async ({ page }) => {
    const fake = new FakeLifecycle().base();
    fake.failures.push({ when: (c) => c.method === 'POST' && c.path === '/employees', status: 400, error: 'email: Enter a valid email address', code: 'VALIDATION' });
    await open(page, fake, `${LIFECYCLE}?tab=onboarding`);
    await waitLoaded(page);
    const d = await fillJoiner(page);
    await d.getByRole('button', { name: 'Create joiner' }).click();
    await expect(toasts(page).filter({ hasText: 'Could not add Ira Menon: email: Enter a valid email address' })).toBeVisible(slow);
    await expect(toasts(page).filter({ hasText: 'added to onboarding' })).toHaveCount(0);
    await expect(page.getByText('Ira Menon')).toHaveCount(0);
    expect(fake.callsTo('POST', /^\/lifecycle\/onboarding$/)).toHaveLength(0);   // the case was never sent
    expect(fake.onboarding).toHaveLength(0);
  });

  test('ticking a task PUTs the whole case; a server refusal rolls the tick back', async ({ page }) => {
    const fake = new FakeLifecycle().base().seedOnboarding();
    await open(page, fake, `${LIFECYCLE}?tab=onboarding`);
    await waitLoaded(page);
    await page.getByRole('button', { name: /Neo Rao/ }).click();
    const d = dialog(page, /Onboarding: Neo Rao/);
    await d.getByRole('checkbox', { name: 'Collect documents' }).check();
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/lifecycle/onboarding/${ONB1}$`)).length, { timeout: 20_000 }).toBe(1);
    const put = fake.callsTo('PUT', new RegExp(`^/lifecycle/onboarding/${ONB1}$`))[0]!;
    expect((put.body!.tasks as Row[]).find((t) => t.label === 'Collect documents')!.done).toBe(true);
    expect((fake.onboarding[0]!.tasks as Row[]).find((t) => t.label === 'Collect documents')!.done).toBe(true);

    // now a refused tick rolls back (click, not uncheck: the optimistic change is reverted, so the final state is unchanged)
    fake.failures.push({ when: (c) => c.method === 'PUT' && new RegExp(`^/lifecycle/onboarding/${ONB1}$`).test(c.path), status: 500, error: 'Internal error', code: 'INTERNAL_ERROR' });
    await d.getByRole('checkbox', { name: 'Issue laptop' }).click();
    await expect(toasts(page).filter({ hasText: 'Could not save onboarding of Neo Rao' })).toBeVisible(slow);
    await expect(d.getByRole('checkbox', { name: 'Issue laptop' })).toBeChecked();   // reverted on screen
    expect((fake.onboarding[0]!.tasks as Row[]).find((t) => t.label === 'Issue laptop')!.done).toBe(true);
  });

  test('changing the stage PUTs the new stage', async ({ page }) => {
    const fake = new FakeLifecycle().base().seedOnboarding();
    await open(page, fake, `${LIFECYCLE}?tab=onboarding`);
    await waitLoaded(page);
    await page.getByRole('button', { name: /Neo Rao/ }).click();
    const d = dialog(page, /Onboarding: Neo Rao/);
    await d.getByLabel('Stage').selectOption('registration');
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/lifecycle/onboarding/${ONB1}$`)).length, { timeout: 20_000 }).toBe(1);
    expect(fake.callsTo('PUT', new RegExp(`^/lifecycle/onboarding/${ONB1}$`))[0]!.body).toMatchObject({ stage: 'registration' });
    expect(fake.onboarding[0]!.stage).toBe('registration');
  });
});

// ═════════════════════════════ exits ═════════════════════════════
test.describe('live lifecycle: exits', () => {
  test('starting an exit POSTs the case, then PUTs the employee on notice', async ({ page }) => {
    const fake = new FakeLifecycle().base();
    await open(page, fake, `${LIFECYCLE}?tab=exits`);
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Start exit' }).first().click();
    const d = dialog(page, 'Start exit');
    await d.getByRole('combobox', { name: 'Employee' }).selectOption(DEV);
    await d.getByRole('button', { name: 'Start exit' }).click();
    await expect.poll(() => fake.callsTo('POST', /^\/lifecycle\/exits$/).length, { timeout: 30_000 }).toBe(1);
    const post = fake.callsTo('POST', /^\/lifecycle\/exits$/)[0]!;
    expect(post.body).toMatchObject({ employee_id: DEV, stage: 'notice', notice_waived: false });
    expect(post.body!.id).toMatch(UUID);
    expect((post.body!.clearance as unknown[]).length).toBeGreaterThan(0);
    // the employee is put on notice once the case is saved
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/employees/${DEV}$`)).length, { timeout: 20_000 }).toBe(1);
    expect(fake.callsTo('PUT', new RegExp(`^/employees/${DEV}$`))[0]!.body).toMatchObject({ status: 'on_notice' });
    await expect(toasts(page).filter({ hasText: 'Exit started for Dev Rao' })).toBeVisible(slow);
  });

  test('clearance and asset edits PUT the whole exit; a refused edit rolls back', async ({ page }) => {
    const fake = new FakeLifecycle().base().seedFnfPaid().seedExit();
    await open(page, fake, `${LIFECYCLE}?tab=exits`);
    await waitLoaded(page);
    await page.getByRole('button', { name: /Asha Rao/ }).click();
    const d = dialog(page, /Exit: Asha Rao/);
    await d.getByRole('checkbox', { name: 'HR' }).check();
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/lifecycle/exits/${EXIT1}$`)).length, { timeout: 20_000 }).toBe(1);
    expect((fake.exits[0]!.clearance as Row[]).find((i) => i.department === 'HR')!.done).toBe(true);

    await d.getByRole('textbox', { name: 'New asset' }).fill('Company phone');
    await d.getByRole('button', { name: 'Add asset' }).click();
    await expect.poll(() => (fake.exits[0]!.assets as Row[]).some((a) => a.name === 'Company phone'), { timeout: 20_000 }).toBe(true);

    // a refused asset-return toggle rolls back (click, not check: the optimistic tick is reverted, so the final state is unchecked)
    fake.failures.push({ when: (c) => c.method === 'PUT' && new RegExp(`^/lifecycle/exits/${EXIT1}$`).test(c.path), status: 500, error: 'Internal error', code: 'INTERNAL_ERROR' });
    await d.getByRole('checkbox', { name: 'Laptop' }).click();
    await expect(toasts(page).filter({ hasText: 'Could not save exit of Asha Rao' })).toBeVisible(slow);
    await expect(d.getByRole('checkbox', { name: 'Laptop' })).not.toBeChecked();
    expect((fake.exits[0]!.assets as Row[]).find((a) => a.name === 'Laptop')!.returned).toBe(false);
  });

  test('close-exit is blocked while a clearance is pending, and succeeds once it is done and F&F is paid', async ({ page }) => {
    const fake = new FakeLifecycle().base().seedFnfPaid().seedExit();   // HR clearance pending
    await open(page, fake, `${LIFECYCLE}?tab=exits`);
    await waitLoaded(page);
    await page.getByRole('button', { name: /Asha Rao/ }).click();
    const d = dialog(page, /Exit: Asha Rao/);
    // the blocker is shown and the Close button is disabled
    await expect(d.getByText(/clearances still pending/)).toBeVisible(slow);
    await expect(d.getByRole('button', { name: 'Close exit' })).toBeDisabled();
    // finish the clearance (syncs), then close succeeds (the server re-checks clearance + the paid F&F)
    await d.getByRole('checkbox', { name: 'HR' }).check();
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/lifecycle/exits/${EXIT1}$`)).length, { timeout: 20_000 }).toBe(1);
    await expect(d.getByRole('button', { name: 'Close exit' })).toBeEnabled();
    await d.getByRole('button', { name: 'Close exit' }).click();
    await dialog(page, 'Close exit').getByRole('button', { name: 'Close exit' }).click();
    await expect.poll(() => fake.exits[0]!.stage, { timeout: 30_000 }).toBe('closed');
    await expect.poll(() => fake.employees.find((e) => e.id === ASHA)!.status, { timeout: 20_000 }).toBe('exited');
    await expect(toasts(page).filter({ hasText: 'Asha Rao is marked as exited' })).toBeVisible(slow);
  });

  test('close-exit shows the server blocker on refusal, then succeeds on retry', async ({ page }) => {
    const fake = new FakeLifecycle().base().seedFnfPaid().seedExit(true);   // all clearance done locally
    await open(page, fake, `${LIFECYCLE}?tab=exits`);
    await waitLoaded(page);
    await page.getByRole('button', { name: /Asha Rao/ }).click();
    const d = dialog(page, /Exit: Asha Rao/);
    await expect(d.getByRole('button', { name: 'Close exit' })).toBeEnabled();
    // the server refuses this one close with its plain reason (a race backstop)
    fake.failures.push({ when: (c) => c.method === 'PUT' && new RegExp(`^/lifecycle/exits/${EXIT1}$`).test(c.path) && c.body?.stage === 'closed', status: 409, error: '1 of 4 clearances still pending: HR.', code: 'EXIT_BLOCKED' });
    await d.getByRole('button', { name: 'Close exit' }).click();
    await dialog(page, 'Close exit').getByRole('button', { name: 'Close exit' }).click();
    await expect(toasts(page).filter({ hasText: '1 of 4 clearances still pending: HR.' })).toBeVisible(slow);
    expect(fake.exits[0]!.stage).toBe('clearance');                           // the server was never changed
    await expect.poll(() => fake.employees.find((e) => e.id === ASHA)!.status, { timeout: 10_000 }).toBe('on_notice');
    // retry: the failure was one-shot, so the close now goes through
    await d.getByRole('button', { name: 'Close exit' }).click();
    await dialog(page, 'Close exit').getByRole('button', { name: 'Close exit' }).click();
    await expect.poll(() => fake.exits[0]!.stage, { timeout: 30_000 }).toBe('closed');
    await expect(toasts(page).filter({ hasText: 'Asha Rao is marked as exited' })).toBeVisible(slow);
  });
});

// ═════════════════════════════ letters ═════════════════════════════
test.describe('live lifecycle: letters', () => {
  test('issuing a letter POSTs it, and marking it signed PUTs signed:true', async ({ page }) => {
    const fake = new FakeLifecycle().base().seedOfferTemplate();
    await open(page, fake, `${LIFECYCLE}?tab=letters`);
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Generate letter' }).first().click();
    const d = dialog(page, 'Generate letter');
    await d.getByLabel('Template').selectOption(TPL1);
    await d.getByLabel('Employee').selectOption(DEV);
    await d.getByRole('button', { name: 'Issue letter' }).click();
    await expect.poll(() => fake.callsTo('POST', /^\/lifecycle\/letters$/).length, { timeout: 30_000 }).toBe(1);
    const post = fake.callsTo('POST', /^\/lifecycle\/letters$/)[0]!;
    expect(post.body).toMatchObject({ employee_id: DEV, template_id: TPL1, type: 'offer', signed: false });
    expect(post.body!.id).toMatch(UUID);
    const letterId = post.body!.id as string;
    await expect(toasts(page).filter({ hasText: 'Offer letter issued to Dev Rao.' })).toBeVisible(slow);
    await page.getByRole('button', { name: 'Done' }).click();

    // mark it signed
    await page.getByRole('button', { name: /Mark .* letter for Dev Rao as signed/ }).click();
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/lifecycle/letters/${letterId}$`)).length, { timeout: 20_000 }).toBe(1);
    expect(fake.callsTo('PUT', new RegExp(`^/lifecycle/letters/${letterId}$`))[0]!.body).toMatchObject({ signed: true });
    expect(fake.letters.find((l) => l.id === letterId)!.signed).toBe(true);
    await expect(toasts(page).filter({ hasText: 'Marked as signed.' })).toBeVisible(slow);
  });
});

// ═════════════════════════════ storage, 503 and errors ═════════════════════════════
test.describe('live lifecycle: storage, not-ready, no errors', () => {
  test('nothing lifecycle-related is written to browser storage in live mode', async ({ page }) => {
    const fake = new FakeLifecycle().base();
    await open(page, fake, `${LIFECYCLE}?tab=letters`);
    await waitLoaded(page);
    // Add a uniquely-named template: it must reach the server and never any browser storage.
    await page.getByRole('button', { name: 'New template' }).click();
    const d = dialog(page, 'New template');
    await d.getByLabel('Template name').fill('ZZ Sentinel Template');
    await d.getByRole('button', { name: 'Save template' }).click();
    await expect.poll(() => fake.callsTo('POST', /^\/lifecycle\/letter-templates$/).length, { timeout: 30_000 }).toBe(1);

    const stored = await page.evaluate((keys) => {
      const out: Record<string, string | null> = {};
      try { for (const k of keys) out[k] = window.localStorage.getItem(k); } catch { /* blocked */ }
      let session = '';
      try { for (let i = 0; i < window.sessionStorage.length; i++) session += window.sessionStorage.getItem(window.sessionStorage.key(i)!) ?? ''; } catch { /* blocked */ }
      let all = '';
      try { for (let i = 0; i < window.localStorage.length; i++) all += window.localStorage.getItem(window.localStorage.key(i)!) ?? ''; } catch { /* blocked */ }
      return { local: out, session, all };
    }, [LOCAL_KEY]);

    expect(stored.all).not.toContain('ZZ Sentinel Template');                 // the template never touched any storage
    expect(stored.session).not.toContain('ZZ Sentinel Template');
    const raw = stored.local[LOCAL_KEY];
    if (raw) {
      expect(raw).not.toContain('ZZ Sentinel Template');
      const parsed = JSON.parse(raw) as { local?: Record<string, unknown> };
      for (const k of ['onboarding', 'exits', 'letterTemplates', 'letters']) expect(parsed.local ?? {}).not.toHaveProperty(k);
    }
  });

  test('the 503 not-ready state shows for the Lifecycle section and recovers on retry', async ({ page }) => {
    const fake = new FakeLifecycle().full();
    fake.mode = 'lc_not_ready';
    await open(page, fake);
    await expect(page.getByTestId('hrms-lifecycle-not-ready')).toBeVisible({ timeout: 30_000 });
    fake.mode = 'ok';
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Neo Rao').first()).toBeVisible(slow);
    await expect(page.getByTestId('hrms-lifecycle-not-ready')).toHaveCount(0);
  });

  test('a 500 on the lifecycle bootstrap shows the error state; people pages still work', async ({ page }) => {
    const fake = new FakeLifecycle().full();
    fake.mode = 'lc_error';
    await open(page, fake);
    await expect(page.getByTestId('hrms-lifecycle-error')).toBeVisible({ timeout: 30_000 });
    await page.goto('/dashboard/hrms/employees');
    await waitLoaded(page);
    await expect(page.getByText('Asha').first()).toBeVisible(slow);
  });

  test('the happy path logs no console or page errors', async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, new FakeLifecycle().full());
    await waitLoaded(page);
    await expect(page.getByText('Neo Rao').first()).toBeVisible(slow);
    await page.goto(`${LIFECYCLE}?tab=exits`);
    await expect(page.getByText('Asha Rao').first()).toBeVisible(slow);
    await page.goto(`${LIFECYCLE}?tab=letters`);
    await expect(page.getByText('Offer letter').first()).toBeVisible(slow);
    expect(errors).toEqual([]);
  });

  test.describe('390px', () => {
    test.use({ viewport: { width: 390, height: 800 } });
    test('the Lifecycle page and the empty state have no sideways scroll', async ({ page }) => {
      await open(page, new FakeLifecycle().base(), `${LIFECYCLE}?tab=letters`);
      await expect(page.getByTestId('letters-live-empty')).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(400);
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(w.sw).toBeLessThanOrEqual(w.iw + 1);
    });
  });
});
