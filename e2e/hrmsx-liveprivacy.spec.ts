import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession } from './utils';
import { MASTER_USER } from './hrms-utils';
import { diffServer } from '../src/lib/hrms/live/diff';
import {
  accessLogFromWire, complianceCreateBody, complianceFromWire, compliancePatch,
  consentCreateBody, consentFromWire, consentPatch, privacyFromWire, retentionCreateBody, retentionFromWire, retentionPatch,
} from '../src/lib/hrms/live/privacyWire';
import type { ComplianceTask, ConsentRecord, RetentionRule } from '../src/lib/hrms/types';

/**
 * HRMS live mode, phase 5: privacy and DPDP on the server. The server is a stateful miniature of the privacy contract behind
 * page.route: it keeps compliance tasks, consent records and retention rules (all ordinary {id} records), serves the existing
 * access log (GET /hrms/access-log, newest first), and records every call. ComplianceTask.status is DERIVED, so the wire row
 * carries no status. Nothing talks to a real backend.
 */

test.describe.configure({ timeout: 240_000 });
test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

const SOURCE_KEY = 'kinematic_hrms_source';
const LOCAL_KEY = 'kinematic_hrms_live_local_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVACY = '/dashboard/hrms/privacy';
const STATUTORY = '/dashboard/hrms/statutory';

const ENT = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';
const DEP = '33333333-3333-4333-8333-333333333333';
const DES = '44444444-4444-4444-8444-444444444444';
const ASHA = '55555555-5555-4555-8555-555555555555';
const DEV = '66666666-6666-4666-8666-666666666666';
const CMP1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CMP2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CON1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CON2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RET1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const RET2 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const AL1 = '12121212-1212-4121-8121-121212121212';
const AL2 = '13131313-1313-4131-8131-131313131313';

type Row = Record<string, unknown>;
interface Call { method: string; path: string; query: string; body: Row | undefined; n: number }
interface Failure { when: (c: Call) => boolean; status: number; error: string; code?: string; once?: boolean }

// ───────────────────────────── a stateful privacy server (wire shape) ─────────────────────────────
class FakePrivacy {
  calls: Call[] = [];
  entities: Row[] = [];
  locations: Row[] = [];
  departments: Row[] = [];
  designations: Row[] = [];
  employees: Row[] = [];
  compliance: Row[] = [];
  consents: Row[] = [];
  retention: Row[] = [];
  accessLog: Row[] = [];
  failures: Failure[] = [];
  /** 'ok'; 'pv_not_ready' answers 503 HRMS_NOT_READY on /privacy/bootstrap; 'pv_error' answers 500 there. */
  mode: 'ok' | 'pv_not_ready' | 'pv_error' = 'ok';
  private seq = 0;

  seedOrg(): this {
    this.entities = [{ id: ENT, name: 'Acme Retail Pvt Ltd', pan: 'AABCA1234C', tan: 'BLRA12345B', cin: null, gstin: null, address: { city: 'Bengaluru', state: 'Karnataka' }, registrations: [{ id: 'r1', type: 'pf', number: 'KA/BNG/123' }, { id: 'r2', type: 'esi', number: 'ESI123' }, { id: 'r3', type: 'pt', number: 'PT123', state: 'Karnataka' }], signatory: { name: 'Rhea Nair', designation: 'Director' } }];
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
      confirmation_date: null, probation_months: 6, notice_days: 30, last_working_date: null, shift_id: null, cost_centre: null, contract_end_date: null,
      pan: null, aadhaar_last4: '1234', aadhaar_verified: false, uan: null, uan_status: 'none', pf_member: true, pf_on_actual_wage: false, pf_join_date: null, esic_ip: null,
      pt_applicable: true, lwf_applicable: false, tax_regime: 'new', declaration: { sec80C: 0, sec80D: 0, nps80CCD1B: 0, homeLoanInterest: 0, rentPaidAnnual: 0, other: 0, status: 'not_submitted' },
      pay_mode: 'bank', structure_id: null, annual_ctc: null, structure_overrides: null, documents: [], history: [], created_at: '2024-04-01T09:00:00Z', updated_at: '2024-04-01T09:00:00Z', ...over,
    };
  }

  seedPeople(): this {
    this.employees = [this.mkEmp(ASHA, 'EMP-0001', 'Asha', 'active'), this.mkEmp(DEV, 'EMP-0002', 'Dev', 'active')];
    return this;
  }

  seedCompliance(): this {
    this.compliance = [
      { id: CMP1, name: 'TDS deposit for October', law: 'TDS', due_on: '2026-11-07', entity_id: ENT, state: null, filed_on: null, reference: null, created_at: '2026-11-01T09:00:00Z', updated_at: '2026-11-01T09:00:00Z' },
      { id: CMP2, name: 'PF contribution for October', law: 'PF', due_on: '2026-11-15', entity_id: ENT, state: null, filed_on: null, reference: null, created_at: '2026-11-01T09:00:00Z', updated_at: '2026-11-01T09:00:00Z' },
    ];
    return this;
  }

  seedConsents(): this {
    this.consents = [
      { id: CON1, employee_id: ASHA, purpose: 'Location during duty hours', notice_version: 'v2 (Apr 2026)', granted_at: '2026-04-01T09:00:00Z', withdrawn_at: null, created_at: '2026-04-01T09:00:00Z', updated_at: '2026-04-01T09:00:00Z' },
      { id: CON2, employee_id: DEV, purpose: 'Face match for attendance', notice_version: 'v1 (Jan 2026)', granted_at: '2026-01-15T09:00:00Z', withdrawn_at: null, created_at: '2026-01-15T09:00:00Z', updated_at: '2026-01-15T09:00:00Z' },
    ];
    return this;
  }

  seedRetention(): this {
    this.retention = [
      { id: RET1, dataset: 'Salary registers and payslips', keep_years: 8, basis: 'Income-tax record rules', action: 'anonymise', created_at: '2026-01-01T09:00:00Z', updated_at: '2026-01-01T09:00:00Z' },
      { id: RET2, dataset: 'Location trail', keep_years: 0.25, basis: 'Travel allowance disputes only; 90 days', action: 'delete', created_at: '2026-01-01T09:00:00Z', updated_at: '2026-01-01T09:00:00Z' },
    ];
    return this;
  }

  seedAccessLog(): this {
    this.accessLog = [
      { id: AL1, at: '2026-11-06T10:12:00.000Z', by_name: 'Tanvi Kapoor (HR)', employee_id: DEV, field: 'Bank account', reason: 'Fix IFSC before payroll' },
      { id: AL2, at: '2026-11-05T15:40:00.000Z', by_name: 'Neha Bansal (Finance)', employee_id: ASHA, field: 'Aadhaar last four', reason: 'Verification' },
    ];
    return this;
  }

  base(): this { return this.seedOrg().seedPeople(); }
  full(): this { return this.base().seedCompliance().seedConsents().seedRetention().seedAccessLog(); }

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

    // ── people + payroll + time + lifecycle (enough for the module to load) ──
    if (method === 'GET' && path === '/bootstrap') {
      await this.ok(route, { entities: this.entities, locations: this.locations, departments: this.departments, designations: this.designations, employees: this.employees, settings: { employee_code_prefix: 'EMP-' }, server_time: '2026-11-10T09:00:00Z' });
      return true;
    }
    if (method === 'GET' && path === '/payroll/bootstrap') {
      await this.ok(route, { structures: [], attendance: [], adjustments: [], loans: [], runs: [], fnf_cases: [], settings: { payroll: {} }, server_time: '2026-11-10T09:00:00Z' });
      return true;
    }
    if (method === 'GET' && path === '/time/bootstrap') {
      await this.ok(route, { shifts: [], roster: [], leave_types: [], holiday_lists: [], leave_balances: [], server_time: '2026-11-10T09:00:00Z' });
      return true;
    }
    if (method === 'GET' && path === '/lifecycle/bootstrap') {
      await this.ok(route, { onboarding_cases: [], exit_cases: [], letter_templates: [], issued_letters: [], server_time: '2026-11-10T09:00:00Z' });
      return true;
    }

    // ── the existing access log ──
    if (method === 'GET' && path === '/access-log') { await this.ok(route, this.accessLog); return true; }

    // ── privacy ──
    if (method === 'GET' && path === '/privacy/bootstrap') {
      if (this.mode === 'pv_not_ready') { await this.err(route, 503, 'HRMS storage is not set up yet', 'HRMS_NOT_READY'); return true; }
      if (this.mode === 'pv_error') { await this.err(route, 500, 'Internal server error', 'INTERNAL_ERROR'); return true; }
      await this.ok(route, { compliance_tasks: this.compliance, consents: this.consents, retention_rules: this.retention, server_time: '2026-11-10T09:00:00Z' });
      return true;
    }
    const pv = path.match(/^\/privacy\/(compliance|consents|retention)(?:\/([^/]+))?$/);
    if (pv) { await this.privacy(route, method, pv[1]!, pv[2], body); return true; }

    await this.err(route, 404, `Unhandled ${method} ${path}`, 'NOT_FOUND');
    return true;
  }

  private store(kind: string): Row[] {
    return kind === 'compliance' ? this.compliance : kind === 'consents' ? this.consents : this.retention;
  }

  private async privacy(route: Route, method: string, kind: string, id: string | undefined, body: Row | undefined): Promise<void> {
    const list = this.store(kind);
    if (method === 'POST') {
      const b = body ?? {};
      if (list.some((r) => r.id === b.id)) { await this.ok(route, list.find((r) => r.id === b.id)); return; }
      if (kind === 'consents' && b.employee_id != null && !this.employees.some((e) => e.id === b.employee_id)) {
        await this.err(route, 400, 'employee_id: Unknown employee', 'VALIDATION'); return;
      }
      if (kind === 'compliance' && b.entity_id != null && !this.entities.some((e) => e.id === b.entity_id)) {
        await this.err(route, 400, 'entity_id: Unknown entity', 'VALIDATION'); return;
      }
      const row: Row = { created_at: '2026-11-10T09:00:00Z', updated_at: '2026-11-10T09:00:00Z', ...b };
      list.push(row);
      await this.ok(route, row, 201);
      return;
    }
    const row = list.find((r) => r.id === id);
    if (!row) { await this.err(route, 404, 'Not found', 'NOT_FOUND'); return; }
    if (method === 'PUT') { Object.assign(row, body, { updated_at: '2026-11-10T10:00:00Z' }); await this.ok(route, row); return; }
    if (method === 'DELETE') { list.splice(list.indexOf(row), 1); await this.ok(route, { id }); return; }
    await this.err(route, 405, 'Method not allowed', 'VALIDATION');
  }
}

// ───────────────────────────── helpers ─────────────────────────────
async function open(page: Page, fake: FakePrivacy, path = PRIVACY, source: 'live' | 'sample' | null = 'live'): Promise<void> {
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
test.describe('live privacy: wire mapping and diff-sync (no browser)', () => {
  test('compliance, consent and retention rows map both ways; compliance never carries status on the wire', () => {
    const cmpWire = { id: CMP1, name: 'TDS deposit for October', law: 'TDS', due_on: '2026-11-07', entity_id: ENT, state: null, filed_on: null, reference: null };
    const cmp = complianceFromWire(cmpWire);
    expect(cmp).toEqual({ id: CMP1, name: 'TDS deposit for October', law: 'TDS', dueOn: '2026-11-07', entityId: ENT, state: undefined, status: 'upcoming', filedOn: undefined, reference: undefined });
    const cmpCreate = complianceCreateBody(cmp);
    expect(cmpCreate).toMatchObject({ id: CMP1, name: 'TDS deposit for October', law: 'TDS', due_on: '2026-11-07', entity_id: ENT });
    expect(cmpCreate).not.toHaveProperty('status');                                   // status is derived, never stored
    expect(Object.keys(cmpCreate).every((k) => !/[A-Z]/.test(k))).toBe(true);         // top-level keys are snake_case
    // marking filed: filed_on + reference travel, status is appended to the rollback keys only
    const filed = compliancePatch(cmp, { ...cmp, status: 'filed', filedOn: '2026-11-07', reference: 'CHL-1' });
    expect(filed.body).toEqual({ filed_on: '2026-11-07', reference: 'CHL-1' });
    expect(filed.body).not.toHaveProperty('status');
    expect(filed.keys).toContain('status');
    // a filed row from the server derives status='filed'
    expect(complianceFromWire({ ...cmpWire, filed_on: '2026-11-07', reference: 'CHL-1' }).status).toBe('filed');

    const conWire = { id: CON1, employee_id: ASHA, purpose: 'Location during duty hours', notice_version: 'v2', granted_at: '2026-04-01T09:00:00Z', withdrawn_at: null };
    const con = consentFromWire(conWire);
    expect(con).toEqual({ id: CON1, employeeId: ASHA, purpose: 'Location during duty hours', noticeVersion: 'v2', grantedAt: '2026-04-01T09:00:00Z', withdrawnAt: undefined });
    expect(consentCreateBody(con)).toMatchObject({ id: CON1, employee_id: ASHA, purpose: 'Location during duty hours', notice_version: 'v2', granted_at: '2026-04-01T09:00:00Z' });
    const withdrawn = consentPatch(con, { ...con, withdrawnAt: '2026-11-07T10:00:00Z' });
    expect(withdrawn.body).toEqual({ withdrawn_at: '2026-11-07T10:00:00Z' });

    const retWire = { id: RET1, dataset: 'Salary registers', keep_years: 8, basis: 'Tax rules', action: 'anonymise' };
    const ret = retentionFromWire(retWire);
    expect(ret).toEqual({ id: RET1, dataset: 'Salary registers', keepYears: 8, basis: 'Tax rules', action: 'anonymise' });
    expect(retentionCreateBody(ret)).toMatchObject({ id: RET1, dataset: 'Salary registers', keep_years: 8, basis: 'Tax rules', action: 'anonymise' });
    expect(retentionPatch(ret, { ...ret, keepYears: 5, action: 'delete' }).body).toEqual({ keep_years: 5, action: 'delete' });
  });

  test('the privacy bootstrap maps every collection, with missing keys as empty arrays', () => {
    const data = privacyFromWire({
      compliance_tasks: [{ id: CMP1, name: 'TDS', law: 'TDS', due_on: '2026-11-07', entity_id: ENT }],
      consents: [{ id: CON1, employee_id: ASHA, purpose: 'Location', notice_version: 'v2', granted_at: '2026-04-01T09:00:00Z' }],
      retention_rules: [{ id: RET1, dataset: 'Payslips', keep_years: 8, basis: 'Tax', action: 'anonymise' }],
      server_time: '2026-11-10T09:00:00Z',
    });
    expect(data.compliance[0]!.name).toBe('TDS');
    expect(data.consents[0]!.employeeId).toBe(ASHA);
    expect(data.retention[0]!.dataset).toBe('Payslips');
    expect(privacyFromWire({}).compliance).toEqual([]);
    expect(accessLogFromWire({ id: AL1, at: '2026-11-06T10:12:00Z', by_name: 'Tanvi (HR)', employee_id: DEV, field: 'Bank account', reason: 'Fix IFSC' }))
      .toEqual({ id: AL1, at: '2026-11-06T10:12:00Z', byUser: 'Tanvi (HR)', employeeId: DEV, field: 'Bank account', reason: 'Fix IFSC' });
  });

  test('the diff sends privacy rows after the entities and people, and removals reversed', () => {
    const people = { entities: [], locations: [], departments: [], designations: [], employees: [] };
    const cmp: ComplianceTask = { id: CMP1, name: 'TDS', law: 'TDS', dueOn: '2026-11-07', entityId: ENT, status: 'upcoming' };
    const con: ConsentRecord = { id: CON1, employeeId: ASHA, purpose: 'Location', noticeVersion: 'v2', grantedAt: '2026-04-01T09:00:00Z' };
    const ret: RetentionRule = { id: RET1, dataset: 'Payslips', keepYears: 8, basis: 'Tax', action: 'anonymise' };
    const empty = { ...people, compliance: [], consents: [], retention: [] };
    const full = { ...people, compliance: [cmp], consents: [con], retention: [ret] };
    const kinds = (ops: ReturnType<typeof diffServer>) => ops.map((o) => `${o.verb}:${o.kind}`);

    const adds = kinds(diffServer(empty as never, full as never));
    for (const k of ['create:compliance', 'create:consent', 'create:retention']) expect(adds).toContain(k);

    const removes = kinds(diffServer(full as never, empty as never));
    expect(removes).toContain('delete:compliance');
    expect(removes).toContain('delete:consent');
    expect(removes).toContain('delete:retention');

    // a single field change is one op
    const one = diffServer(full as never, { ...full, retention: [{ ...ret, keepYears: 5 }] } as never);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ kind: 'retention', verb: 'update', rowId: RET1, body: { keep_years: 5 } });
    expect(kinds(diffServer(full as never, full as never))).toEqual([]);
  });
});

// ═════════════════════════════ sample mode is untouched ═════════════════════════════
test.describe('sample privacy is unchanged', () => {
  test('the Privacy page makes no HRMS call and shows the sample consents and retention', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/hrms')) hits.push(`${r.method()} ${r.url()}`); });
    await seedSession(page, MASTER_USER);
    await mockApi(page, { me: { success: true, data: MASTER_USER } });
    await page.goto(PRIVACY);
    await banner(page).waitFor({ timeout: 45_000 });
    await expect(banner(page)).toHaveAttribute('data-source', 'sample');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy and data protection' })).toBeVisible(slow);
    await expect(page.getByTestId('retention-live-empty')).toHaveCount(0);   // the empty offer is live-only
    await page.goto(`${PRIVACY}?tab=retention`);
    await expect(page.getByText('Salary registers and payslips').first()).toBeVisible(slow);  // a sample retention rule
    expect(hits).toEqual([]);
  });
});

// ═════════════════════════════ bootstrap ═════════════════════════════
test.describe('live privacy: bootstrap', () => {
  test('the server data populates the consent and retention tabs and the readiness checklist, with no local note', async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, new FakePrivacy().full());
    await waitLoaded(page);
    await expect(banner(page)).toHaveAttribute('data-source', 'live');
    await expect(page.getByTestId('hrms-local-note')).toHaveCount(0);        // privacy is on the server now
    // the DPDP readiness reads the bootstrapped consents and retention
    await expect(page.getByTestId('ready-consent')).toContainText('2 records');
    await expect(page.getByTestId('ready-retention')).toContainText('2 rules');
    // consent tab (default)
    await expect(page.getByText('Location during duty hours').first()).toBeVisible(slow);
    // retention tab
    await page.goto(`${PRIVACY}?tab=retention`);
    await expect(page.getByText('Salary registers and payslips').first()).toBeVisible(slow);
    await expect(page.getByTestId('retention-live-empty')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

// ═════════════════════════════ empty states: standard sets ═════════════════════════════
test.describe('live privacy: empty states', () => {
  test('a new org is offered "Add the standard retention rules", created on the server with UUIDs', async ({ page }) => {
    const fake = new FakePrivacy().base();   // no privacy rows
    await open(page, fake, `${PRIVACY}?tab=retention`);
    await waitLoaded(page);
    await expect(page.getByTestId('retention-live-empty')).toBeVisible(slow);
    await page.getByTestId('add-standard-retention-rules').click();
    await expect.poll(() => fake.callsTo('POST', /^\/privacy\/retention$/).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const posts = fake.callsTo('POST', /^\/privacy\/retention$/);
    for (const c of posts) expect(c.body!.id).toMatch(UUID);
    expect(fake.retention.length).toBe(posts.length);
    await expect(page.getByTestId('retention-live-empty')).toHaveCount(0);
    await expect(toasts(page).filter({ hasText: 'Standard retention rules added' })).toBeVisible(slow);
  });

  test('a new org is offered "Add the standard compliance calendar" on the Statutory page, created with UUIDs', async ({ page }) => {
    const fake = new FakePrivacy().base();   // no compliance
    await open(page, fake, STATUTORY);
    await waitLoaded(page);
    await expect(page.getByTestId('compliance-live-empty')).toBeVisible(slow);
    await page.getByTestId('add-standard-compliance').click();
    await expect.poll(() => fake.callsTo('POST', /^\/privacy\/compliance$/).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const posts = fake.callsTo('POST', /^\/privacy\/compliance$/);
    for (const c of posts) { expect(c.body!.id).toMatch(UUID); expect(c.body).not.toHaveProperty('status'); expect(c.body!.entity_id).toBe(ENT); }
    expect(fake.compliance.length).toBe(posts.length);
    await expect(page.getByTestId('compliance-live-empty')).toHaveCount(0);
    await expect(toasts(page).filter({ hasText: 'Standard compliance calendar added' })).toBeVisible(slow);
  });
});

// ═════════════════════════════ compliance: mark filed + rollback ═════════════════════════════
test.describe('live privacy: compliance', () => {
  test('marking a task filed PUTs filed_on + reference; a refused filing rolls back', async ({ page }) => {
    const fake = new FakePrivacy().base().seedCompliance();
    await open(page, fake, STATUTORY);
    await waitLoaded(page);
    await expect(page.getByText('TDS deposit for October').first()).toBeVisible(slow);

    await page.getByRole('button', { name: 'Mark filed: TDS deposit for October, Acme Retail Pvt Ltd' }).click();
    const d = dialog(page, 'Mark as filed');
    await d.getByLabel('Reference').fill('CHL-TST01');
    await d.getByRole('button', { name: 'Save filing' }).click();
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/privacy/compliance/${CMP1}$`)).length, { timeout: 30_000 }).toBe(1);
    expect(fake.callsTo('PUT', new RegExp(`^/privacy/compliance/${CMP1}$`))[0]!.body).toMatchObject({ filed_on: '2026-11-07', reference: 'CHL-TST01' });
    expect(fake.compliance.find((c) => c.id === CMP1)!.filed_on).toBe('2026-11-07');

    // a refused filing on the second task rolls back: it stays unfiled and the server is unchanged
    fake.failures.push({ when: (c) => c.method === 'PUT' && new RegExp(`^/privacy/compliance/${CMP2}$`).test(c.path), status: 500, error: 'Internal error', code: 'INTERNAL_ERROR' });
    await page.getByRole('button', { name: 'Mark filed: PF contribution for October, Acme Retail Pvt Ltd' }).click();
    const d2 = dialog(page, 'Mark as filed');
    await d2.getByLabel('Reference').fill('CHL-TST02');
    await d2.getByRole('button', { name: 'Save filing' }).click();
    await expect(toasts(page).filter({ hasText: 'Could not save compliance task "PF contribution for October"' })).toBeVisible(slow);
    expect(fake.compliance.find((c) => c.id === CMP2)!.filed_on).toBeNull();
    // the task is back under its derived status (not filed), with a Mark filed button again
    await expect(page.getByRole('button', { name: 'Mark filed: PF contribution for October, Acme Retail Pvt Ltd' })).toBeVisible(slow);
  });
});

// ═════════════════════════════ consents: add + withdraw + rollback ═════════════════════════════
test.describe('live privacy: consents', () => {
  test('recording a consent POSTs it with a UUID', async ({ page }) => {
    const fake = new FakePrivacy().base().seedConsents();
    await open(page, fake, `${PRIVACY}?tab=consent`);
    await waitLoaded(page);
    await page.getByTestId('record-consent').click();
    const d = dialog(page, 'Record a consent');
    await d.getByLabel('Employee').selectOption(ASHA);
    await d.getByLabel('Purpose').fill('Payroll bank transfer');
    await d.getByLabel('Notice version').fill('v3 (Nov 2026)');
    await d.getByRole('button', { name: 'Record consent' }).click();
    await expect.poll(() => fake.callsTo('POST', /^\/privacy\/consents$/).length, { timeout: 30_000 }).toBe(1);
    const post = fake.callsTo('POST', /^\/privacy\/consents$/)[0]!;
    expect(post.body).toMatchObject({ employee_id: ASHA, purpose: 'Payroll bank transfer', notice_version: 'v3 (Nov 2026)' });
    expect(post.body!.id).toMatch(UUID);
    expect(typeof post.body!.granted_at).toBe('string');
    await expect(toasts(page).filter({ hasText: 'Consent recorded on the ledger' })).toBeVisible(slow);
  });

  test('withdrawing a consent PUTs withdrawn_at; a refused withdrawal rolls back', async ({ page }) => {
    const fake = new FakePrivacy().base().seedConsents();
    await open(page, fake, `${PRIVACY}?tab=consent`);
    await waitLoaded(page);
    await page.getByRole('button', { name: /Withdraw consent: Asha Rao, Location during duty hours/ }).click();
    await dialog(page, 'Withdraw this consent?').getByRole('button', { name: 'Withdraw consent' }).click();
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/privacy/consents/${CON1}$`)).length, { timeout: 30_000 }).toBe(1);
    expect(fake.callsTo('PUT', new RegExp(`^/privacy/consents/${CON1}$`))[0]!.body).toHaveProperty('withdrawn_at');
    expect(typeof fake.consents.find((c) => c.id === CON1)!.withdrawn_at).toBe('string');

    // a refused withdrawal rolls back: the other consent stays active and the server is unchanged
    fake.failures.push({ when: (c) => c.method === 'PUT' && new RegExp(`^/privacy/consents/${CON2}$`).test(c.path), status: 500, error: 'Internal error', code: 'INTERNAL_ERROR' });
    await page.getByRole('button', { name: /Withdraw consent: Dev Rao, Face match for attendance/ }).click();
    await dialog(page, 'Withdraw this consent?').getByRole('button', { name: 'Withdraw consent' }).click();
    await expect(toasts(page).filter({ hasText: 'Could not save consent of Dev Rao' })).toBeVisible(slow);
    expect(fake.consents.find((c) => c.id === CON2)!.withdrawn_at).toBeNull();
    await expect(page.getByRole('button', { name: /Withdraw consent: Dev Rao, Face match for attendance/ })).toBeVisible(slow);
  });
});

// ═════════════════════════════ retention: create, update, delete ═════════════════════════════
test.describe('live privacy: retention CRUD', () => {
  test('a new rule POSTs, an edit PUTs, and a delete DELETEs', async ({ page }) => {
    const fake = new FakePrivacy().base().seedRetention();
    await open(page, fake, `${PRIVACY}?tab=retention`);
    await waitLoaded(page);

    // create
    await page.getByTestId('new-retention-rule').click();
    const create = dialog(page, 'New retention rule');
    await create.getByLabel('Dataset').fill('Interview notes');
    await create.getByLabel('Keep for (years)').fill('2');
    await create.getByLabel('Basis').fill('Recruitment record');
    await create.getByRole('button', { name: 'Add rule' }).click();
    await expect.poll(() => fake.callsTo('POST', /^\/privacy\/retention$/).length, { timeout: 30_000 }).toBe(1);
    const post = fake.callsTo('POST', /^\/privacy\/retention$/)[0]!;
    expect(post.body).toMatchObject({ dataset: 'Interview notes', keep_years: 2, basis: 'Recruitment record', action: 'delete' });
    expect(post.body!.id).toMatch(UUID);

    // update an existing rule
    await page.getByRole('button', { name: 'Edit retention rule: Location trail' }).click();
    const edit = dialog(page, /Edit retention: Location trail/);
    await edit.getByLabel('Keep for (years)').fill('1');
    await edit.getByRole('button', { name: 'Save rule' }).click();
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/privacy/retention/${RET2}$`)).length, { timeout: 30_000 }).toBe(1);
    expect(fake.callsTo('PUT', new RegExp(`^/privacy/retention/${RET2}$`))[0]!.body).toMatchObject({ keep_years: 1 });

    // delete an existing rule
    await page.getByRole('button', { name: 'Delete retention rule: Salary registers and payslips' }).click();
    await dialog(page, 'Delete this retention rule?').getByRole('button', { name: 'Delete rule' }).click();
    await expect.poll(() => fake.callsTo('DELETE', new RegExp(`^/privacy/retention/${RET1}$`)).length, { timeout: 30_000 }).toBe(1);
    expect(fake.retention.some((r) => r.id === RET1)).toBe(false);
  });
});

// ═════════════════════════════ access log tab ═════════════════════════════
test.describe('live privacy: access log from the server', () => {
  test('the Access log tab shows the server rows, newest first', async ({ page }) => {
    const fake = new FakePrivacy().full();
    await open(page, fake, `${PRIVACY}?tab=access`);
    await waitLoaded(page);
    await expect.poll(() => fake.callsTo('GET', /^\/access-log$/).length, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByRole('cell', { name: 'Tanvi Kapoor (HR)' })).toBeVisible(slow);
    await expect(page.getByText('Fix IFSC before payroll').first()).toBeVisible(slow);
    await expect(page.getByTestId('access-count')).toContainText('2 of 2 entries');
  });

  test('an empty server access log shows a clear empty state', async ({ page }) => {
    const fake = new FakePrivacy().base();   // no access-log rows
    await open(page, fake, `${PRIVACY}?tab=access`);
    await waitLoaded(page);
    await expect.poll(() => fake.callsTo('GET', /^\/access-log$/).length, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByText('No sensitive field has been revealed yet.').first()).toBeVisible(slow);
    await expect(page.getByTestId('access-count')).toContainText('0 of 0 entries');
  });
});

// ═════════════════════════════ storage, requests/roles, 503 ═════════════════════════════
test.describe('live privacy: storage, local tabs, not-ready', () => {
  test('nothing privacy-persisted is written to browser storage in live mode', async ({ page }) => {
    const fake = new FakePrivacy().base();
    await open(page, fake, `${PRIVACY}?tab=retention`);
    await waitLoaded(page);
    // Add a uniquely-named rule: it must reach the server and never any browser storage.
    await page.getByTestId('new-retention-rule').click();
    const d = dialog(page, 'New retention rule');
    await d.getByLabel('Dataset').fill('ZZ Sentinel Dataset');
    await d.getByLabel('Keep for (years)').fill('3');
    await d.getByLabel('Basis').fill('Sentinel basis');
    await d.getByRole('button', { name: 'Add rule' }).click();
    await expect.poll(() => fake.callsTo('POST', /^\/privacy\/retention$/).length, { timeout: 30_000 }).toBe(1);

    const stored = await page.evaluate((keys) => {
      const out: Record<string, string | null> = {};
      try { for (const k of keys) out[k] = window.localStorage.getItem(k); } catch { /* blocked */ }
      let session = '';
      try { for (let i = 0; i < window.sessionStorage.length; i++) session += window.sessionStorage.getItem(window.sessionStorage.key(i)!) ?? ''; } catch { /* blocked */ }
      let all = '';
      try { for (let i = 0; i < window.localStorage.length; i++) all += window.localStorage.getItem(window.localStorage.key(i)!) ?? ''; } catch { /* blocked */ }
      return { local: out, session, all };
    }, [LOCAL_KEY]);

    expect(stored.all).not.toContain('ZZ Sentinel Dataset');                  // the rule never touched any storage
    expect(stored.session).not.toContain('ZZ Sentinel Dataset');
    const raw = stored.local[LOCAL_KEY];
    if (raw) {
      expect(raw).not.toContain('ZZ Sentinel Dataset');
      const parsed = JSON.parse(raw) as { local?: Record<string, unknown> };
      for (const k of ['compliance', 'consents', 'retention']) expect(parsed.local ?? {}).not.toHaveProperty(k);
    }
  });

  test('the Requests and Roles tabs still work locally in live mode', async ({ page }) => {
    const fake = new FakePrivacy().full();
    // Any write to the privacy API would be a bug: the Requests and Roles tabs are local. (The bootstrap GET on load is fine.)
    const writes: string[] = [];
    await open(page, fake, `${PRIVACY}?tab=roles`);
    page.on('request', (r) => { if (r.url().includes('/api/v1/hrms/privacy') && r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`); });
    await waitLoaded(page);
    await expect(page.getByTestId('roles-matrix')).toBeVisible(slow);   // the static role matrix renders

    // the Requests tab logs a request in-browser
    await page.goto(`${PRIVACY}?tab=requests`);
    await page.getByRole('button', { name: 'New request' }).click();
    const d = dialog(page, 'New data request');
    await d.getByLabel('Employee').selectOption(ASHA);
    await d.getByLabel('Details').fill('Asked for a copy of the personal data held about her.');
    await d.getByRole('button', { name: 'Log request' }).click();
    await expect(page.getByText('Asked for a copy of the personal data held about her.').first()).toBeVisible(slow);
    expect(writes).toEqual([]);   // logging a request never wrote to the privacy API
  });

  test('a 503 on the privacy bootstrap degrades the server-backed tabs; Requests and Roles keep working', async ({ page }) => {
    const fake = new FakePrivacy().full();
    fake.mode = 'pv_not_ready';
    await open(page, fake);
    await waitLoaded(page);
    await expect(page.getByTestId('hrms-privacy-not-ready').first()).toBeVisible({ timeout: 30_000 });
    // the Roles tab still works, with no unavailable card on it
    await page.goto(`${PRIVACY}?tab=roles`);
    await expect(page.getByTestId('roles-matrix')).toBeVisible(slow);
    await expect(page.getByTestId('hrms-privacy-not-ready')).toHaveCount(0);
    // the Retention tab shows the unavailable card; recover on retry
    await page.goto(`${PRIVACY}?tab=retention`);
    await expect(page.getByTestId('hrms-privacy-not-ready').first()).toBeVisible(slow);
    fake.mode = 'ok';
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Salary registers and payslips').first()).toBeVisible(slow);
    await expect(page.getByTestId('hrms-privacy-not-ready')).toHaveCount(0);
  });

  test('the happy path logs no console or page errors', async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, new FakePrivacy().full());
    await waitLoaded(page);
    await expect(page.getByText('Location during duty hours').first()).toBeVisible(slow);
    await page.goto(`${PRIVACY}?tab=retention`);
    await expect(page.getByText('Salary registers and payslips').first()).toBeVisible(slow);
    await page.goto(`${PRIVACY}?tab=access`);
    await expect(page.getByText('Fix IFSC before payroll').first()).toBeVisible(slow);
    expect(errors).toEqual([]);
  });

  test.describe('390px', () => {
    test.use({ viewport: { width: 390, height: 800 } });
    test('the Privacy page and the retention empty state have no sideways scroll', async ({ page }) => {
      await open(page, new FakePrivacy().base(), `${PRIVACY}?tab=retention`);
      await expect(page.getByTestId('retention-live-empty')).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(400);
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(w.sw).toBeLessThanOrEqual(w.iw + 1);
    });
  });
});
