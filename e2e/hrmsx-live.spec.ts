import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession } from './utils';
import { MASTER_USER, openHrms } from './hrms-utils';
import { makeSeed } from '../src/lib/hrms/seed';
import { buildBankFile } from '../src/lib/hrms/engine';
import { checkAccount, checkPan, completeness } from '../src/lib/hrms/validators';
import { looksMaskedAccount, looksMaskedPan } from '../src/lib/hrms/live/masking';
import { diffServer } from '../src/lib/hrms/live/diff';
import {
  bootstrapFromWire, documentCreateBody, employeeCreateBody, employeeFromWire, employeePatch, entityCreateBody, entityPatch, importRowBody, same,
} from '../src/lib/hrms/live/wire';
import type { Employee, HrmsDb } from '../src/lib/hrms/types';

/**
 * HRMS live mode: the Sample | Live switch, hydration from /bootstrap, the diff-sync of people and organisation, masked PAN and
 * bank, the CSV import through the server, and the guards (payroll, reset). The server is a small in-memory fake behind
 * page.route, in the API's own wire shape (snake_case, masks, 409 reasons), and every request it sees is recorded.
 * Nothing here talks to a real backend or database.
 */

test.describe.configure({ timeout: 180_000 });
test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

const SOURCE_KEY = 'kinematic_hrms_source';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPLOYEES = '/dashboard/hrms/employees';
const ORG = '/dashboard/hrms/organization';

const ENT = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';
const DEP = '33333333-3333-4333-8333-333333333333';
const DES = '44444444-4444-4444-8444-444444444444';
const ASHA = '55555555-5555-4555-8555-555555555555';

type Row = Record<string, unknown>;
interface Call { method: string; path: string; body: Row | undefined; n: number }
interface Failure { when: (c: Call) => boolean; status: number; error: string; code?: string; once?: boolean }

const maskPan = (p: string) => 'X'.repeat(p.length - 4) + p.slice(-4);
const maskAcct = (a: string) => '•'.repeat(a.length - 4) + a.slice(-4);
const MASKISH = /X{4,}|•|\*{2,}/;

// ───────────────────────────── an in-memory HRMS server (wire shape) ─────────────────────────────
class FakeHrms {
  calls: Call[] = [];
  entities: Row[] = [];
  locations: Row[] = [];
  departments: Row[] = [];
  designations: Row[] = [];
  employees: Row[] = [];
  secrets = new Map<string, { pan?: string; bank?: Row }>();
  failures: Failure[] = [];
  delays: Array<{ when: (c: Call) => boolean; ms: number }> = [];
  /** 'ok' answers /bootstrap; 'not_ready' answers 503 HRMS_NOT_READY; 'error' answers 500; 'offline' aborts the request. */
  mode: 'ok' | 'not_ready' | 'error' | 'offline' = 'ok';
  bootstrapDelay = 0;
  /** Request bodies that carried something that looks like a mask: a write must never send one. */
  maskedBodies: Call[] = [];
  private seq = 0;
  private counter = 0;

  seedOrg(): this {
    this.entities = [{ id: ENT, name: 'Acme Retail Pvt Ltd', pan: 'AABCA1234C', tan: 'DELA12345B', cin: null, gstin: null, address: { line1: '1 Main Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' }, registrations: [], signatory: null }];
    this.locations = [{ id: LOC, entity_id: ENT, name: 'Bengaluru Office', state: 'Karnataka', city: 'Bengaluru', address: null, metro: true, holiday_list_id: null }];
    this.departments = [{ id: DEP, name: 'Operations', head_id: null }];
    this.designations = [{ id: DES, name: 'Operations Associate', grade: 'E1' }];
    return this;
  }

  seedAsha(over: Row = {}, secrets: { pan?: string; bank?: Row } = { pan: 'ABCPA1234F', bank: { accountHolder: 'Asha Rao', accountNumber: '501000123456', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', accountType: 'savings' } }): this {
    this.counter = Math.max(this.counter, 1);
    this.secrets.set(ASHA, secrets);
    this.employees.push(this.row({
      id: ASHA, code: 'EMP-0001', first_name: 'Asha', last_name: 'Rao', email: 'asha.rao@example.com', mobile: '9876500001', gender: 'female', dob: '1996-02-02',
      entity_id: ENT, location_id: LOC, department_id: DEP, designation_id: DES, join_date: '2026-04-01', aadhaar_last4: '1234', uan: '100200300400', uan_status: 'aadhaar_seeded',
      structure_id: 'str_std', annual_ctc: '600000.00', pf_join_date: '2026-04-01', ...over,
    }, secrets));
    return this;
  }

  /** A complete employee in the API's shape: masked PAN and bank, documents, history. */
  private row(o: Row, secrets: { pan?: string; bank?: Row } = {}): Row {
    const id = String(o.id);
    return {
      father_name: null, marital_status: null, blood_group: null, address: { line1: '12 Lake View', city: 'Bengaluru', state: 'Karnataka', pincode: '560034' }, emergency_contact: null,
      reporting_to_id: null, employment_type: 'permanent', status: 'active', confirmation_date: null, probation_months: 6, notice_days: 30, last_working_date: null,
      shift_id: null, cost_centre: null, contract_end_date: null, aadhaar_last4: null, aadhaar_verified: false, uan: null, uan_status: 'none', pf_member: true,
      pf_on_actual_wage: false, pf_join_date: null, esic_ip: null, pt_applicable: true, lwf_applicable: false, tax_regime: 'new',
      declaration: { sec80C: 0, sec80D: 0, nps80CCD1B: 0, homeLoanInterest: 0, rentPaidAnnual: 0, other: 0, status: 'not_submitted' }, pay_mode: 'bank',
      structure_id: null, annual_ctc: null, structure_overrides: null, created_at: '2026-04-01T09:00:00Z', updated_at: '2026-04-01T09:00:00Z',
      pan: secrets.pan ? maskPan(secrets.pan) : null,
      bank: secrets.bank ? { ...secrets.bank, accountNumber: maskAcct(String(secrets.bank.accountNumber)) } : null,
      documents: [{ id: `d0000000-0000-4000-8000-${id.slice(-12)}`, employee_id: id, type: 'pan_card', name: 'PAN card', uploaded_on: '2026-04-01', status: 'pending', mandatory: true, file_name: null }],
      history: [{ id: `e0000000-0000-4000-8000-${id.slice(-12)}`, employee_id: id, at: '2026-04-01T09:00:00Z', by_user_id: null, by_name: 'Master Admin', field: 'Employee', from_value: null, to_value: 'Created' }],
      ...o,
    };
  }

  private ok(route: Route, data: unknown, status = 200) { return route.fulfill({ status, json: { success: true, data } }); }
  private err(route: Route, status: number, error: string, code?: string) { return route.fulfill({ status, json: { success: false, error, ...(code ? { code } : {}) } }); }

  employee(id: string): Row | undefined { return this.employees.find((e) => e.id === id); }
  callsTo(method: string, pattern: RegExp): Call[] { return this.calls.filter((c) => c.method === method && pattern.test(c.path)); }
  get hrmsCalls(): number { return this.calls.length; }

  async handle(route: Route, url: string, method: string): Promise<boolean> {
    const m = new URL(url).pathname.match(/^\/api\/v1\/hrms(\/.*)?$/);
    if (!m) return false;
    const path = m[1] ?? '';
    const raw = method === 'GET' || method === 'DELETE' ? undefined : route.request().postData() ?? undefined;
    const body = raw ? (JSON.parse(raw) as Row) : undefined;
    const call: Call = { method, path, body, n: this.seq++ };
    this.calls.push(call);
    if (raw && MASKISH.test(raw)) this.maskedBodies.push(call);

    const delay = this.delays.find((d) => d.when(call));
    if (delay) await new Promise((r) => setTimeout(r, delay.ms));
    const fi = this.failures.findIndex((f) => f.when(call));
    if (fi >= 0) {
      const f = this.failures[fi]!;
      if (f.once !== false) this.failures.splice(fi, 1);
      await this.err(route, f.status, f.error, f.code);
      return true;
    }

    if (method === 'GET' && path === '/bootstrap') {
      if (this.bootstrapDelay) await new Promise((r) => setTimeout(r, this.bootstrapDelay));
      if (this.mode === 'offline') { await route.abort('failed'); return true; }
      if (this.mode === 'not_ready') { await this.err(route, 503, 'HRMS storage is not set up yet', 'HRMS_NOT_READY'); return true; }
      if (this.mode === 'error') { await this.err(route, 500, 'Internal server error', 'INTERNAL_ERROR'); return true; }
      await this.ok(route, {
        entities: this.entities, locations: this.locations, departments: this.departments, designations: this.designations, employees: this.employees,
        settings: { employee_code_prefix: 'EMP-' }, server_time: '2026-11-10T09:00:00Z',
      });
      return true;
    }

    const kinds: Record<string, Row[]> = { entities: this.entities, locations: this.locations, departments: this.departments, designations: this.designations };
    const mk = path.match(/^\/(entities|locations|departments|designations)(?:\/([^/]+))?$/);
    if (mk) {
      const list = kinds[mk[1]!]!;
      const id = mk[2];
      if (method === 'POST') {
        const row: Row = { ...body!, id: (body!.id as string) ?? crypto.randomUUID() };
        if (mk[1] === 'entities') Object.assign(row, { pan: null, tan: null, cin: null, gstin: null, address: {}, registrations: [], signatory: null, ...body });
        if (mk[1] === 'locations') {
          if (!this.entities.some((e) => e.id === row.entity_id)) { await this.err(route, 400, 'entity_id: Unknown legal entity', 'VALIDATION'); return true; }
          Object.assign(row, { address: null, metro: false, holiday_list_id: null, ...body });
        }
        list.push(row);
        await this.ok(route, row, 201);
        return true;
      }
      const i = list.findIndex((r) => r.id === id);
      if (i < 0) { await this.err(route, 404, 'Not found', 'NOT_FOUND'); return true; }
      if (method === 'PUT') { list[i] = { ...list[i], ...body }; await this.ok(route, list[i]); return true; }
      if (method === 'DELETE') {
        const used = (rows: Row[], key: string) => rows.filter((r) => r[key] === id).length;
        const n = mk[1] === 'entities' ? used(this.locations, 'entity_id') : 0;
        if (n) { await this.err(route, 409, `This legal entity still has ${n} ${n === 1 ? 'location' : 'locations'}. Move or delete them first.`, 'IN_USE'); return true; }
        list.splice(i, 1);
        await this.ok(route, { id });
        return true;
      }
    }

    if (method === 'POST' && path === '/employees') {
      const row = this.create(body!);
      await this.ok(route, row, 201);
      return true;
    }
    if (method === 'POST' && path === '/employees/import') {
      const rows = (body!.rows as Row[]) ?? [];
      const errors: Array<{ row: number; error: string }> = [];
      const created: Row[] = [];
      rows.forEach((r, i) => {
        if (String(r.email).startsWith('reject')) { errors.push({ row: i + 1, error: 'email: Already used by another employee' }); return; }
        created.push(this.create(r, true));
      });
      await this.ok(route, { dry_run: false, total: rows.length, valid: created.length, created: created.length, existing: 0, failed: errors.length, errors, employees: created }, created.length ? 201 : 200);
      return true;
    }
    const me = path.match(/^\/employees\/([^/]+)(?:\/(reveal|documents)(?:\/([^/]+))?)?$/);
    if (me) {
      const emp = this.employee(me[1]!);
      if (!emp) { await this.err(route, 404, 'Employee not found', 'NOT_FOUND'); return true; }
      const sub = me[2];
      if (!sub && method === 'PUT') { this.apply(emp, body!); await this.ok(route, emp); return true; }
      if (!sub && method === 'DELETE') { this.employees.splice(this.employees.indexOf(emp), 1); await this.ok(route, { id: emp.id }); return true; }
      if (sub === 'reveal' && method === 'POST') {
        const reason = String(body!.reason ?? '').trim();
        if (reason.length < 5) { await this.err(route, 400, 'reason: Give a reason of at least 5 characters', 'VALIDATION'); return true; }
        const s = this.secrets.get(String(emp.id)) ?? {};
        const field = String(body!.field);
        const value = field === 'pan' ? s.pan : field === 'bank' ? s.bank : emp.aadhaar_last4;
        if (!value) { await this.err(route, 404, 'Nothing on file', 'NOT_FOUND'); return true; }
        await this.ok(route, { field, value });
        return true;
      }
      if (sub === 'documents') {
        const docs = emp.documents as Row[];
        if (method === 'POST') { const d = { ...body!, id: (body!.id as string) ?? crypto.randomUUID(), employee_id: emp.id, file_name: body!.file_name ?? null }; docs.push(d); await this.ok(route, d, 201); return true; }
        const di = docs.findIndex((d) => d.id === me[3]);
        if (di < 0) { await this.err(route, 404, 'Document not found', 'NOT_FOUND'); return true; }
        if (method === 'PUT') { docs[di] = { ...docs[di], ...body }; await this.ok(route, docs[di]); return true; }
        if (method === 'DELETE') { docs.splice(di, 1); await this.ok(route, { id: me[3] }); return true; }
      }
    }
    await this.err(route, 404, `Unhandled ${method} ${path}`, 'NOT_FOUND');
    return true;
  }

  private create(body: Row, imported = false): Row {
    const id = (body.id as string) ?? crypto.randomUUID();
    const secrets: { pan?: string; bank?: Row } = {};
    if (typeof body.pan === 'string' && !MASKISH.test(body.pan)) secrets.pan = body.pan;
    if (body.bank && typeof (body.bank as Row).accountNumber === 'string') secrets.bank = body.bank as Row;
    this.secrets.set(id, secrets);
    const { pan: _pan, bank: _bank, documents, ...plain } = body;
    void _pan; void _bank;
    const row = this.row({ ...plain, id, code: `EMP-${String(++this.counter).padStart(4, '0')}` }, secrets);
    if (!imported && Array.isArray(documents)) row.documents = (documents as Row[]).map((d) => ({ ...d, id: d.id ?? crypto.randomUUID(), employee_id: id, file_name: d.file_name ?? null }));
    if (imported) row.documents = [];
    this.employees.push(row);
    return row;
  }

  private apply(emp: Row, body: Row) {
    const id = String(emp.id);
    const secrets = this.secrets.get(id) ?? {};
    for (const [k, v] of Object.entries(body)) {
      if (k === 'pan') {
        if (v === null) { delete secrets.pan; emp.pan = null; } else if (typeof v === 'string' && !MASKISH.test(v)) { secrets.pan = v; emp.pan = maskPan(v); }
      } else if (k === 'bank') {
        if (v === null) { delete secrets.bank; emp.bank = null; } else {
          const b = v as Row;
          const keep = secrets.bank?.accountNumber;
          const number = typeof b.accountNumber === 'string' && !MASKISH.test(b.accountNumber) ? b.accountNumber : keep;
          secrets.bank = { ...b, accountNumber: number };
          emp.bank = { ...b, accountNumber: number ? maskAcct(String(number)) : '' };
        }
      } else emp[k] = v;
    }
    this.secrets.set(id, secrets);
    (emp.history as Row[]).unshift({ id: crypto.randomUUID(), employee_id: id, at: '2026-11-10T10:00:00Z', by_user_id: null, by_name: 'Master Admin', field: 'Updated', from_value: null, to_value: Object.keys(body).join(', ') });
    emp.updated_at = '2026-11-10T10:00:00Z';
  }
}

// ───────────────────────────── helpers ─────────────────────────────
/** Open an HRMS page with the fake server behind it. `source` is what the browser remembers; null means it has never been chosen (the default). */
async function open(page: Page, fake: FakeHrms, path = EMPLOYEES, source: 'live' | 'sample' | null = 'live'): Promise<void> {
  await seedSession(page, MASTER_USER);
  if (source) {
    // Only when nothing is stored yet, so a reload keeps whatever the person chose in the page.
    await page.addInitScript(([k, v]) => { try { if (window.localStorage.getItem(k!) === null) window.localStorage.setItem(k!, v!); } catch { /* blocked */ } }, [SOURCE_KEY, source]);
  }
  await mockApi(page, { me: { success: true, data: MASTER_USER }, onRequest: (route, url, method) => fake.handle(route, url, method) });
  await page.goto(path);
  await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
}

const live = (page: Page) => page.getByTestId('hrms-source-live');
const sample = (page: Page) => page.getByTestId('hrms-source-sample');
const banner = (page: Page) => page.getByTestId('hrms-preview-banner');
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const toasts = (page: Page) => page.locator('[data-sonner-toast]');

async function waitLoaded(page: Page) {
  await banner(page).waitFor({ timeout: 45_000 });         // the live state is applied in the same step that shows the banner
  await expect(page.getByTestId('hrms-live-loading')).toHaveCount(0, { timeout: 30_000 });
}

/** Console and page errors that are not the deliberate failures a test provokes. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return errors;
}

const sampleDb = makeSeed();

/** A server-shaped employee for the pure tests. */
function wireAsha(over: Row = {}): Row {
  return {
    id: ASHA, code: 'EMP-0001', first_name: 'Asha', last_name: 'Rao', email: 'asha.rao@example.com', mobile: '9876500001', gender: 'female', dob: '1996-02-02',
    father_name: null, marital_status: null, blood_group: null, address: { line1: '12 Lake View', line2: null, city: 'Bengaluru', state: 'Karnataka', pincode: '560034' }, emergency_contact: null,
    entity_id: ENT, location_id: LOC, department_id: DEP, designation_id: DES, reporting_to_id: null, employment_type: 'permanent', status: 'active', join_date: '2026-04-01',
    confirmation_date: null, probation_months: 6, notice_days: 30, last_working_date: null, shift_id: null, cost_centre: null, contract_end_date: null,
    aadhaar_last4: '1234', aadhaar_verified: false, uan: '100200300400', uan_status: 'aadhaar_seeded', pf_member: true, pf_on_actual_wage: false, pf_join_date: '2026-04-01', esic_ip: null,
    pt_applicable: true, lwf_applicable: false, tax_regime: 'new', declaration: { sec80C: 0, sec80D: 0, nps80CCD1B: 0, homeLoanInterest: 0, rentPaidAnnual: 0, other: 0, status: 'not_submitted' },
    pay_mode: 'bank', structure_id: 'str_std', annual_ctc: '600000.00', structure_overrides: null, pan: 'XXXXXX234F',
    bank: { accountHolder: 'Asha Rao', accountNumber: '••••••3456', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', accountType: 'savings' },
    documents: [{ id: 'd0000000-0000-4000-8000-000000000001', employee_id: ASHA, type: 'pan_card', name: 'PAN card', uploaded_on: '2026-04-01', status: 'verified', mandatory: true, file_name: null }],
    history: [{ id: 'e0000000-0000-4000-8000-000000000001', employee_id: ASHA, at: '2026-04-01T09:00:00Z', by_user_id: null, by_name: 'Master Admin', field: 'Employee', from_value: null, to_value: 'Created' }],
    ...over,
  };
}
const asha = (over: Row = {}): Employee => employeeFromWire(wireAsha(over));
const clone = <T,>(v: T): T => structuredClone(v);

// ═════════════════════════════ pure logic: no browser ═════════════════════════════
test.describe('live mode: wire mapping and diff-sync (no browser)', () => {
  test('a mask is recognised, and a real PAN that happens to contain X is not one', () => {
    for (const m of ['XXXXXX234F', 'XXXXXXXXXX', 'AB••••••4F', 'ABCDE****F']) expect(looksMaskedPan(m)).toBe(true);
    for (const real of ['ABCPE1234F', 'AXXPX1234F', 'XABPX1234F']) expect(looksMaskedPan(real)).toBe(false);
    expect(looksMaskedAccount('••••••3456')).toBe(true);
    expect(looksMaskedAccount('XXXXXX3456')).toBe(true);
    expect(looksMaskedAccount('501000123456')).toBe(false);
  });

  test('a bank file never carries a masked account number: those people are skipped with the reason (Reports and Payroll both use this)', () => {
    const db = makeSeed();
    const run = db.payRuns[0]!;
    const withBank = run.payslips.map((s) => db.employees.find((x) => x.id === s.employeeId)!).filter((e) => e.payMode === 'bank' && e.bank && run.payslips.find((s) => s.employeeId === e.id)!.net > 0);
    expect(withBank.length).toBeGreaterThan(2);
    const before = buildBankFile(db, run);
    const target = withBank[0]!;
    target.bank!.accountNumber = '••••••' + target.bank!.accountNumber.slice(-4);
    const after = buildBankFile(db, run);
    expect(after.rows).toHaveLength(before.rows.length - 1);
    expect(after.rows.some((r) => r[0] === target.code)).toBe(false);
    expect(after.rows.every((r) => !/[•*xX]/.test(r[2]!))).toBe(true);
    expect(after.skipped.find((k) => k.employeeId === target.id)?.reason).toMatch(/masked/i);
  });

  test('a masked PAN and account count as "on file" in the validators and in completeness, not as invalid', () => {
    expect(checkPan('XXXXXX234F').ok).toBe(true);
    expect(checkAccount('••••••3456').ok).toBe(true);
    expect(checkPan('ABCDE12345').ok).toBe(false);          // sample behaviour is unchanged
    expect(checkAccount('12345').ok).toBe(false);
    const e = asha();
    expect(completeness(e).missing).not.toContain('PAN');
    expect(completeness(e).missing).not.toContain('Bank account');
    expect(completeness({ ...e, pan: undefined, bank: undefined }).missing).toEqual(expect.arrayContaining(['PAN', 'Bank account']));
  });

  test('the server row maps to the dashboard shape: nulls become "none", numbers are numbers, history and documents come across', () => {
    const e = asha({ annual_ctc: '1200000.50', father_name: null, emergency_contact: { name: 'Ravi', relation: 'Brother', mobile: '9811111111' } });
    expect(e.annualCtc).toBe(1200000.5);
    expect(e.fatherName).toBeUndefined();
    expect(e.reportingToId).toBeUndefined();
    expect(e.address).toEqual({ line1: '12 Lake View', city: 'Bengaluru', state: 'Karnataka', pincode: '560034' });
    expect(e.emergencyContact).toEqual({ name: 'Ravi', relation: 'Brother', mobile: '9811111111' });
    expect(e.pan).toBe('XXXXXX234F');
    expect(e.bank).toEqual({ accountHolder: 'Asha Rao', accountNumber: '••••••3456', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', accountType: 'savings' });
    expect(e.history).toEqual([{ id: 'e0000000-0000-4000-8000-000000000001', at: '2026-04-01T09:00:00Z', by: 'Master Admin', field: 'Employee', from: undefined, to: 'Created' }]);
    expect(e.documents[0]).toMatchObject({ type: 'pan_card', uploadedOn: '2026-04-01', status: 'verified', mandatory: true });
    expect(e.declaration.status).toBe('not_submitted');
    const data = bootstrapFromWire({ entities: [], locations: [], departments: [], designations: [], employees: [wireAsha()], settings: { employee_code_prefix: 'EMP-' } });
    expect(data.employees).toHaveLength(1);
    expect(data.settings).toEqual({ employee_code_prefix: 'EMP-' });
  });

  test('a create body is snake_case, carries the client id, never the code, and no mask', () => {
    const e: Employee = { ...asha(), code: '…' };
    const body = employeeCreateBody(e);
    expect(body.id).toBe(ASHA);
    expect(body).not.toHaveProperty('code');
    expect(body).toMatchObject({ first_name: 'Asha', last_name: 'Rao', entity_id: ENT, location_id: LOC, join_date: '2026-04-01', employment_type: 'permanent', annual_ctc: 600000, pf_member: true });
    expect(body).not.toHaveProperty('pan');           // the PAN on this row is a mask
    expect(body).not.toHaveProperty('bank');          // so is the account number
    expect(JSON.stringify(body)).not.toMatch(MASKISH);
    const typed = employeeCreateBody({ ...e, pan: 'ABCPA1234F', bank: { accountHolder: 'Asha Rao', accountNumber: '501000123456', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', accountType: 'savings' } });
    expect(typed.pan).toBe('ABCPA1234F');
    expect(typed.bank).toEqual({ accountHolder: 'Asha Rao', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', accountType: 'savings', accountNumber: '501000123456' });
    expect(Array.isArray(body.documents)).toBe(true);
    const row = importRowBody(e);
    expect(row).not.toHaveProperty('documents');
  });

  test('an update body holds only what changed; clearing a field sends null; a single name sends an empty last name', () => {
    const before = asha({ father_name: 'Mohan', cost_centre: 'OPS' });
    expect(employeePatch(before, clone(before))).toEqual({ body: {}, keys: [] });
    const after = clone(before);
    after.mobile = '9876500002';
    after.fatherName = undefined;
    after.lastName = '';
    after.address = { ...after.address, city: 'Mysuru' };
    const { body, keys } = employeePatch(before, after);
    expect(body).toEqual({ mobile: '9876500002', father_name: null, last_name: '', address: { line1: '12 Lake View', city: 'Mysuru', state: 'Karnataka', pincode: '560034' } });
    expect(keys.sort()).toEqual(['address', 'fatherName', 'lastName', 'mobile']);
  });

  test('PAN and bank: a mask is never sent back; a typed value is; changing only the IFSC leaves the account number out', () => {
    const before = asha();
    expect(employeePatch(before, { ...clone(before), firstName: 'Asha K' }).body).toEqual({ first_name: 'Asha K' });
    const typed = { ...clone(before), pan: 'ABCPA1234F', bank: { ...before.bank!, accountNumber: '501000123456' } };
    expect(employeePatch(before, typed).body).toEqual({ pan: 'ABCPA1234F', bank: { accountHolder: 'Asha Rao', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', accountType: 'savings', accountNumber: '501000123456' } });
    const ifsc = employeePatch(before, { ...clone(before), bank: { ...before.bank!, ifsc: 'ICIC0000456' } }).body;
    expect(ifsc).toEqual({ bank: { accountHolder: 'Asha Rao', ifsc: 'ICIC0000456', bankName: 'HDFC Bank', accountType: 'savings' } });
    expect(employeePatch(before, { ...clone(before), pan: 'XXXXXXXXXX' }).body).toEqual({});   // a different mask is still just a mask
    expect(employeePatch(before, { ...clone(before), pan: undefined, bank: undefined }).body).toEqual({ pan: null, bank: null });
  });

  test('organisation bodies: only changed fields, blanks cleared with null', () => {
    const ent = { id: ENT, name: 'Acme', pan: 'AABCA1234C', tan: 'DELA12345B', cin: 'U52100DL2016PTC301234', address: { city: 'Bengaluru' }, registrations: [], signatory: { name: 'R', designation: 'Director' } };
    const body = entityCreateBody({ ...ent, cin: undefined });
    expect(body).toMatchObject({ id: ENT, name: 'Acme', pan: 'AABCA1234C' });
    expect(body).not.toHaveProperty('cin');
    expect(entityPatch(ent, { ...ent, cin: undefined, name: 'Acme Ltd' }).body).toEqual({ name: 'Acme Ltd', cin: null });
  });

  test('the diff orders calls so the server accepts them, and leaves history and documents out of the field patch', () => {
    const empty = { entities: [], locations: [], departments: [], designations: [], employees: [] } as unknown as Pick<HrmsDb, 'entities' | 'locations' | 'departments' | 'designations' | 'employees'>;
    const e = asha();
    const next = {
      entities: [{ id: ENT, name: 'Acme', pan: 'AABCA1234C', tan: 'DELA12345B', address: {}, registrations: [] }],
      locations: [{ id: LOC, name: 'Office', entityId: ENT, state: 'Karnataka', city: 'Bengaluru', metro: true }],
      departments: [{ id: DEP, name: 'Ops' }], designations: [{ id: DES, name: 'Associate' }], employees: [e],
    } as unknown as typeof empty;
    const adds = diffServer(empty, next).map((o) => `${o.verb}:${o.kind}`);
    expect(adds[0]).toBe('create:entity');
    expect(adds.indexOf('create:location')).toBeGreaterThan(adds.indexOf('create:entity'));
    expect(adds.indexOf('create:employee')).toBeGreaterThan(adds.indexOf('create:location'));
    expect(adds.indexOf('create:employee')).toBeGreaterThan(adds.indexOf('create:department'));
    expect(adds).not.toContain('create:document');   // the create body carries the documents

    const removed = diffServer(next, empty).map((o) => `${o.verb}:${o.kind}`);
    expect(removed[0]).toBe('delete:employee');
    expect(removed[removed.length - 1]).toBe('delete:entity');
    expect(removed.indexOf('delete:location')).toBeLessThan(removed.indexOf('delete:entity'));

    const changed = clone(next);
    const emp = changed.employees[0]!;
    emp.history = [{ id: 'local-1', at: 'x', by: 'You', field: 'Mobile', to: '1' }, ...emp.history];   // written locally: the server writes its own
    emp.documents[0]!.status = 'rejected';
    emp.documents.push({ id: 'f0000000-0000-4000-8000-000000000009', type: 'other', name: 'Offer', uploadedOn: '2026-05-01', status: 'pending', mandatory: false });
    const ops = diffServer(next, changed);
    expect(ops.map((o) => `${o.verb}:${o.kind}`)).toEqual(['update:document', 'create:document']);
    expect(ops[0]!.body).toEqual({ status: 'rejected' });
    expect(ops[1]!.body).toMatchObject({ id: 'f0000000-0000-4000-8000-000000000009', type: 'other', name: 'Offer', uploaded_on: '2026-05-01', mandatory: false });
    expect(documentCreateBody({ id: 'doc_abc', type: 'other', name: 'X', uploadedOn: '2026-05-01', status: 'pending' })).not.toHaveProperty('id');   // the API takes UUIDs only
  });

  test('comparison treats nothing, null and an empty string as the same', () => {
    expect(same(undefined, '')).toBe(true);
    expect(same({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(same({ a: 1 }, { a: 2 })).toBe(false);
  });
});

// ═════════════════════════════ sample mode is untouched ═════════════════════════════
test.describe('sample is the default', () => {
  test('the module makes no HRMS API call in sample mode, and the banner says so', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/hrms')) hits.push(`${r.method()} ${r.url()}`); });
    await openHrms(page, EMPLOYEES);
    await expect(banner(page)).toHaveAttribute('data-source', 'sample');
    await expect(banner(page)).toContainText('Preview');
    await expect(sample(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(live(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('employee-count')).toHaveText(`Showing ${sampleDb.employees.length} of ${sampleDb.employees.length}`);
    for (const path of [ORG, '/dashboard/hrms/payroll', '/dashboard/hrms/employees/emp_2', '/dashboard/hrms']) {
      await page.goto(path);
      await banner(page).waitFor({ timeout: 45_000 });
    }
    await expect(page.getByTestId('hrms-reset')).toBeEnabled();
    await expect(page.getByTestId('hrms-local-note')).toHaveCount(0);
    expect(hits).toEqual([]);
  });

  test('visiting in sample mode stores no source choice and calls nothing', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/hrms')) hits.push(r.url()); });
    await openHrms(page, EMPLOYEES);
    expect(await page.evaluate((k) => window.localStorage.getItem(k), SOURCE_KEY)).toBeNull();
    expect(hits).toEqual([]);
  });
});

// ═════════════════════════════ switching to live ═════════════════════════════
test.describe('switching to live', () => {
  test('asks first, explains what becomes real and what stays here, then loads from /bootstrap', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    const errors = watchErrors(page);
    await open(page, fake, EMPLOYEES, null);
    await expect(banner(page)).toHaveAttribute('data-source', 'sample');
    await live(page).click();
    const dlg = dialog(page, 'Switch to live data?');
    await expect(dlg).toContainText('What becomes real');
    await expect(dlg).toContainText('What stays in this browser');
    await expect(dlg).toContainText('Your sample data is not touched');

    // cancelling changes nothing and calls nothing
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(dlg).toBeHidden();
    await expect(banner(page)).toHaveAttribute('data-source', 'sample');
    expect(fake.hrmsCalls).toBe(0);

    await live(page).click();
    await dialog(page, 'Switch to live data?').getByRole('button', { name: 'Switch to live data' }).click();
    await expect(banner(page)).toHaveAttribute('data-source', 'live');
    await expect(page.getByTestId('employee-count')).toHaveText('Showing 1 of 1');
    await expect(page.getByText('Asha Rao').first()).toBeVisible();
    expect(fake.callsTo('GET', /^\/bootstrap$/)).toHaveLength(1);
    expect(await page.evaluate((k) => window.localStorage.getItem(k), SOURCE_KEY)).toBe('live');
    await expect(page.getByText('Ritu Malhotra')).toHaveCount(0);        // none of the sample people
    await expect(page.getByText('Live data from the server.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('shows a loading state while the server answers', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    fake.bootstrapDelay = 1500;
    await open(page, fake);
    await expect(page.getByTestId('hrms-live-loading')).toBeVisible();
    await expect(page.getByTestId('hrms-live-loading')).toContainText('Loading the HRMS data from the server');
    await expect(page.getByText('Asha Rao').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('hrms-live-loading')).toHaveCount(0);
  });

  test('503 HRMS_NOT_READY shows that storage is not set up, and works again once it is', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    fake.mode = 'not_ready';
    await open(page, fake);
    const state = page.getByTestId('hrms-live-not-ready');
    await expect(state).toBeVisible({ timeout: 30_000 });
    await expect(state).toContainText('HRMS storage is not set up yet on the server');
    await expect(state).toContainText('Sample data still works');
    fake.mode = 'ok';
    await state.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Asha Rao').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('hrms-live-not-ready')).toHaveCount(0);
  });

  test('"Use sample data" from the not-ready state goes back to the sample company', async ({ page }) => {
    const fake = new FakeHrms().seedOrg();
    fake.mode = 'not_ready';
    await open(page, fake);
    await expect(page.getByTestId('hrms-live-not-ready')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('hrms-live-not-ready').getByRole('button', { name: 'Use sample data' }).click();
    await expect(banner(page)).toHaveAttribute('data-source', 'sample');
    await expect(page.getByTestId('employee-count')).toHaveText(`Showing ${sampleDb.employees.length} of ${sampleDb.employees.length}`);
  });

  test('a network failure shows a plain error with a retry, and nothing is changed', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    fake.mode = 'offline';
    await open(page, fake);
    const state = page.getByTestId('hrms-live-error');
    await expect(state).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('hrms-live-error-message')).toContainText('Could not reach the server');
    fake.mode = 'ok';
    await state.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('Asha Rao').first()).toBeVisible({ timeout: 20_000 });
  });

  test('a server error shows its message and a retry', async ({ page }) => {
    const fake = new FakeHrms().seedOrg();
    fake.mode = 'error';
    await open(page, fake);
    await expect(page.getByTestId('hrms-live-error')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('hrms-live-error-message')).toContainText('Internal server error');
    await expect(page.getByTestId('hrms-live-error').getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('with nobody on the server yet it says so and offers Add employee and the CSV import', async ({ page }) => {
    const fake = new FakeHrms().seedOrg();
    await open(page, fake);
    const empty = page.getByTestId('employees-live-empty');
    await expect(empty).toBeVisible({ timeout: 30_000 });
    await expect(empty).toContainText('No employees on the server yet');
    await expect(page.getByRole('link', { name: 'Add employee' })).toBeVisible();
    await expect(empty.getByRole('link', { name: 'Add the first employee' })).toBeVisible();
    await empty.getByRole('button', { name: 'Import from a CSV file' }).click();
    await expect(dialog(page, 'Import employees from CSV')).toContainText('the server checks them again');
  });

  test('with no organisation yet, the empty state points at the Organisation page first', async ({ page }) => {
    const fake = new FakeHrms();
    await open(page, fake);
    const empty = page.getByTestId('employees-live-empty');
    await expect(empty).toContainText('Set up the organisation first', { timeout: 30_000 });
    await expect(empty.getByRole('link', { name: 'Set up the organisation' })).toBeVisible();
    await page.goto(`${EMPLOYEES}/new`);
    await expect(page.getByTestId('new-needs-org')).toContainText('Set up the organisation first', { timeout: 30_000 });
  });

  test('the choice survives a reload, and Refresh loads again', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    await open(page, fake);
    await expect(page.getByText('Asha Rao').first()).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await banner(page).waitFor({ timeout: 45_000 });
    await expect(banner(page)).toHaveAttribute('data-source', 'live');
    await expect(page.getByText('Asha Rao').first()).toBeVisible({ timeout: 30_000 });
    expect(fake.callsTo('GET', /^\/bootstrap$/)).toHaveLength(2);

    fake.seedAsha({ id: '66666666-6666-4666-8666-666666666666', code: 'EMP-0002', first_name: 'Dev', last_name: 'Nair', email: 'dev.nair@example.com' }, {});
    await page.getByTestId('hrms-refresh').click();
    await expect(page.getByTestId('employee-count')).toHaveText('Showing 2 of 2', { timeout: 20_000 });   // someone else added a person meanwhile
    expect(fake.callsTo('GET', /^\/bootstrap$/)).toHaveLength(3);
  });

  test('switching back to sample is allowed, shows the sample company untouched, and calls nothing', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    await open(page, fake);
    await expect(page.getByText('Asha Rao').first()).toBeVisible({ timeout: 30_000 });
    const before = fake.hrmsCalls;
    await sample(page).click();
    await expect(banner(page)).toHaveAttribute('data-source', 'sample');
    await expect(page.getByTestId('employee-count')).toHaveText(`Showing ${sampleDb.employees.length} of ${sampleDb.employees.length}`);
    await expect(page.getByText('Ritu Malhotra').first()).toBeVisible();
    await expect(page.getByText('Asha Rao')).toHaveCount(0);
    expect(fake.hrmsCalls).toBe(before);
    expect(await page.evaluate((k) => window.localStorage.getItem(k), SOURCE_KEY)).toBe('sample');
    await page.reload();
    await banner(page).waitFor({ timeout: 45_000 });
    await expect(banner(page)).toHaveAttribute('data-source', 'sample');
    expect(fake.hrmsCalls).toBe(before);
  });
});

// ═════════════════════════════ people ═════════════════════════════
test.describe('live: people', () => {
  async function fillNew(page: Page) {
    await page.locator('#new-firstName').fill('Tara');
    await page.locator('#new-lastName').fill('Nambiar');
    await page.locator('#new-email').fill('tara.nambiar@example.com');
    await page.locator('#new-mobile').fill('9812345678');
    await page.locator('#new-gender').selectOption('female');
    await page.locator('#new-dob').fill('1995-05-05');
    await page.locator('#new-location').selectOption(LOC);
    await page.locator('#new-dept').selectOption(DEP);
    await page.locator('#new-desig').selectOption(DES);
  }

  test('adding an employee sends one POST with a UUID id and a snake_case body, and the server-assigned code appears', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    const errors = watchErrors(page);
    await open(page, fake, `${EMPLOYEES}/new`);
    await expect(page.getByRole('heading', { name: 'Add employee' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Saves the employee on the server')).toBeVisible();
    await fillNew(page);
    await page.locator('#new-pan').fill('ABCPN1234F');
    await page.getByRole('button', { name: 'Create employee' }).click();
    await expect(page.getByTestId('employee-code')).toHaveText('EMP-0002', { timeout: 20_000 });

    const posts = fake.callsTo('POST', /^\/employees$/);
    expect(posts).toHaveLength(1);
    const b = posts[0]!.body!;
    expect(b.id).toMatch(UUID);
    expect(b).not.toHaveProperty('code');
    expect(b).toMatchObject({
      first_name: 'Tara', last_name: 'Nambiar', email: 'tara.nambiar@example.com', mobile: '9812345678', gender: 'female', dob: '1995-05-05',
      entity_id: ENT, location_id: LOC, department_id: DEP, designation_id: DES, employment_type: 'permanent', pan: 'ABCPN1234F', status: 'active',
    });
    expect(b.join_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(b).some((k) => /[A-Z]/.test(k))).toBe(false);                 // top-level keys are snake_case
    const docs = b.documents as Row[];
    expect(docs.length).toBeGreaterThan(0);
    for (const d of docs) expect(d.id).toMatch(UUID);
    expect(fake.employee(b.id as string)).toBeTruthy();
    expect(fake.calls.filter((c) => c.method !== 'GET')).toHaveLength(1);              // one call, not one per field
    expect(fake.maskedBodies).toEqual([]);
    // the profile shows the PAN as the server returned it: masked
    await page.getByRole('tab', { name: 'Statutory' }).click();
    await expect(page.getByTestId('pan-value')).toHaveText('XXXXXX234F');
    expect(errors).toEqual([]);
  });

  test('a refused create keeps the form, undoes the row, and says why', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    fake.failures.push({ when: (c) => c.method === 'POST' && c.path === '/employees', status: 409, error: 'Employee code EMP-0002 is already in use', code: 'CODE_TAKEN' });
    await open(page, fake, `${EMPLOYEES}/new`);
    await expect(page.getByRole('heading', { name: 'Add employee' })).toBeVisible({ timeout: 30_000 });
    await fillNew(page);
    await page.getByRole('button', { name: 'Create employee' }).click();
    await expect(toasts(page).filter({ hasText: 'Employee code EMP-0002 is already in use' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Add employee' })).toBeVisible();
    await expect(page.locator('#new-firstName')).toHaveValue('Tara');
    await expect(page.getByRole('button', { name: 'Create employee' })).toBeEnabled();
    await page.getByRole('link', { name: 'Back to employees' }).click();
    await expect(page.getByTestId('employee-count')).toHaveText('Showing 1 of 1', { timeout: 30_000 });
  });

  test('editing sends only the changed fields, and the change log comes back from the server', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    await open(page, fake, `${EMPLOYEES}/${ASHA}?tab=personal`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#pe-mobile').fill('9876500009');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/Saved\. 1 field changed/)).toBeVisible({ timeout: 20_000 });
    const puts = fake.callsTo('PUT', new RegExp(`^/employees/${ASHA}$`));
    expect(puts).toHaveLength(1);
    expect(puts[0]!.body).toEqual({ mobile: '9876500009' });
    expect(fake.calls.filter((c) => c.method !== 'GET')).toHaveLength(1);
    await page.getByRole('tab', { name: /History/ }).click();
    await expect(page.getByText('Updated').first()).toBeVisible();      // the server's own change-log row, not the local one
  });

  test('saving a form with no change sends nothing', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    await open(page, fake, `${EMPLOYEES}/${ASHA}?tab=personal`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Nothing changed.')).toBeVisible({ timeout: 20_000 });
    expect(fake.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  test('a refused save rolls back, keeps the form open with what was typed, and shows the server reason', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    fake.failures.push({ when: (c) => c.method === 'PUT' && c.path === `/employees/${ASHA}`, status: 400, error: 'mobile: Enter a valid mobile number', code: 'VALIDATION' });
    await open(page, fake, `${EMPLOYEES}/${ASHA}?tab=personal`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#pe-mobile').fill('9876500009');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(toasts(page).filter({ hasText: 'mobile: Enter a valid mobile number' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#pe-mobile')).toHaveValue('9876500009');          // the form is still open with the typed value
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByText('9876500001', { exact: true }).first()).toBeVisible();   // the old number is back on screen
    await expect(page.getByText('9876500009')).toHaveCount(0);
  });

  test('documents use their own endpoints: verify, attach a file name, add one', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    (fake.employee(ASHA)!.documents as Row[])[0]!.status = 'uploaded';
    await open(page, fake, `${EMPLOYEES}/${ASHA}?tab=documents`);
    await page.getByRole('button', { name: 'Verify PAN card' }).click();
    await expect.poll(() => fake.callsTo('PUT', /\/documents\//).length, { timeout: 20_000 }).toBe(1);
    const verify = fake.callsTo('PUT', /\/documents\//)[0]!;
    expect(verify.path).toMatch(new RegExp(`^/employees/${ASHA}/documents/[0-9a-f-]{36}$`));
    expect(verify.body).toEqual({ status: 'verified' });

    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Replace file for PAN card' }).or(page.getByRole('button', { name: 'Upload PAN card' })).click()]);
    await chooser.setFiles({ name: 'pan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') });
    await expect.poll(() => fake.callsTo('PUT', /\/documents\//).length, { timeout: 20_000 }).toBe(2);
    expect(fake.callsTo('PUT', /\/documents\//)[1]!.body).toMatchObject({ file_name: 'pan.pdf' });

    await page.getByRole('button', { name: 'Add document' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add a document' });
    await dlg.locator('#doc-name').fill('Offer letter');
    await dlg.getByRole('button', { name: 'Add document' }).click();
    await expect.poll(() => fake.callsTo('POST', /\/documents$/).length, { timeout: 20_000 }).toBe(1);
    const added = fake.callsTo('POST', /\/documents$/)[0]!;
    expect(added.path).toBe(`/employees/${ASHA}/documents`);
    expect(added.body!.id).toMatch(UUID);
    expect(added.body).toMatchObject({ name: 'Offer letter', status: 'pending' });
    expect(fake.callsTo('PUT', new RegExp(`^/employees/${ASHA}$`))).toHaveLength(0);       // never a field patch on the employee
  });
});

// ═════════════════════════════ masked PAN and bank ═════════════════════════════
test.describe('live: masked PAN and bank', () => {
  test('both show as masked, the profile does not call them invalid, and the edit form asks for a new value only', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    await open(page, fake, `${EMPLOYEES}/${ASHA}?tab=overview`);
    await expect(page.getByText('On file').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Not a valid PAN')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Statutory' }).click();
    await expect(page.getByTestId('pan-value')).toHaveText('XXXXXX234F');
    await expect(page.getByTestId('bank-value')).toHaveText(maskAcct('501000123456'));
    await page.getByRole('button', { name: 'Edit statutory details' }).click();
    await expect(page.locator('#se-pan')).toHaveValue('');
    await expect(page.getByLabel('Replace PAN')).toBeVisible();
    await expect(page.getByText('Leave blank to keep the PAN on file (XXXXXX234F)')).toBeVisible();
    await expect(page.locator('#se-bankAccount')).toHaveValue('');
    await expect(page.locator('#se-ifsc')).toHaveValue('HDFC0001234');
  });

  test('saving the statutory form without a new PAN or account number sends neither', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    await open(page, fake, `${EMPLOYEES}/${ASHA}?tab=statutory`);
    await page.getByRole('button', { name: 'Edit statutory details' }).click();
    await page.locator('#se-ifsc').fill('icic0000456');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/Saved\. 1 field changed/)).toBeVisible({ timeout: 20_000 });
    const put = fake.callsTo('PUT', new RegExp(`^/employees/${ASHA}$`));
    expect(put).toHaveLength(1);
    expect(put[0]!.body).toEqual({ bank: { accountHolder: 'Asha Rao', ifsc: 'ICIC0000456', bankName: 'HDFC Bank', accountType: 'savings' } });
    expect(fake.maskedBodies).toEqual([]);
    // the server kept the number on file
    expect(fake.secrets.get(ASHA)!.bank!.accountNumber).toBe('501000123456');
    expect(fake.secrets.get(ASHA)!.pan).toBe('ABCPA1234F');
  });

  test('a new PAN and account number the person typed are sent, and the page goes back to showing masks', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    await open(page, fake, `${EMPLOYEES}/${ASHA}?tab=statutory`);
    await page.getByRole('button', { name: 'Edit statutory details' }).click();
    await page.locator('#se-pan').fill('bcdpa5678k');
    await page.locator('#se-bankAccount').fill('777700001234');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/Saved\. 2 fields changed/)).toBeVisible({ timeout: 20_000 });
    const put = fake.callsTo('PUT', new RegExp(`^/employees/${ASHA}$`));
    expect(put).toHaveLength(1);
    expect(put[0]!.body).toEqual({ pan: 'BCDPA5678K', bank: { accountHolder: 'Asha Rao', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', accountType: 'savings', accountNumber: '777700001234' } });
    expect(fake.maskedBodies).toEqual([]);
    await expect(page.getByTestId('pan-value')).toHaveText('XXXXXX678K');       // masked again once the server answered
    await expect(page.getByTestId('bank-value')).toHaveText(maskAcct('777700001234'));
    expect(await page.evaluate(() => JSON.stringify(window.localStorage))).not.toContain('BCDPA5678K');
  });

  test('typing a mask into the PAN or account box is refused before anything is sent', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    await open(page, fake, `${EMPLOYEES}/${ASHA}?tab=statutory`);
    await page.getByRole('button', { name: 'Edit statutory details' }).click();
    await page.locator('#se-pan').fill('XXXXXX234F');
    await page.locator('#se-bankAccount').fill('••••••3456');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('That is a masked PAN').first()).toBeVisible();
    await expect(page.getByText('That is a masked account number').first()).toBeVisible();
    expect(fake.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  test('reveal needs a reason, goes through /reveal, shows the value for the reviewer only, and hides again', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    await open(page, fake, `${EMPLOYEES}/${ASHA}?tab=statutory`);
    await page.getByRole('button', { name: 'Reveal PAN' }).click();
    const dlg = dialog(page, 'Reveal PAN');
    await dlg.getByRole('button', { name: 'Reveal for one minute' }).click();
    await expect(dlg).toContainText('Enter a reason of at least 5 characters');
    expect(fake.callsTo('POST', /reveal$/)).toHaveLength(0);
    await dlg.getByLabel(/Reason/).fill('Check against the PAN card');
    await dlg.getByRole('button', { name: 'Reveal for one minute' }).click();
    await expect(page.getByTestId('pan-value')).toHaveText('ABCPA1234F', { timeout: 20_000 });
    const calls = fake.callsTo('POST', /reveal$/);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe(`/employees/${ASHA}/reveal`);
    expect(calls[0]!.body).toEqual({ field: 'pan', reason: 'Check against the PAN card' });
    // nothing was written back, and the value is not in browser storage
    expect(fake.calls.filter((c) => c.method !== 'GET' && !/reveal$/.test(c.path))).toHaveLength(0);
    expect(await page.evaluate(() => JSON.stringify(window.localStorage))).not.toContain('ABCPA1234F');
    await page.getByRole('button', { name: 'Hide PAN' }).click();
    await expect(page.getByTestId('pan-value')).toHaveText('XXXXXX234F');

    await page.getByRole('button', { name: 'Reveal full account number' }).click();
    const bank = dialog(page, 'Reveal bank account number');
    await bank.getByLabel(/Reason/).fill('Fix the IFSC before payroll');
    await bank.getByRole('button', { name: 'Reveal for one minute' }).click();
    await expect(page.getByTestId('bank-value')).toHaveText('501000123456', { timeout: 20_000 });
    expect(fake.callsTo('POST', /reveal$/)[1]!.body).toEqual({ field: 'bank', reason: 'Fix the IFSC before payroll' });
  });

  test('a refused reveal keeps the dialog open with the reason, and reveals nothing', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha({}, {});
    fake.failures.push({ when: (c) => /reveal$/.test(c.path), status: 429, error: 'Too many requests. Try again in a minute.' });
    await open(page, fake, `${EMPLOYEES}/${ASHA}?tab=statutory`);
    await page.getByRole('button', { name: 'Reveal Aadhaar last four digits' }).click();
    const dlg = dialog(page, 'Reveal Aadhaar last four digits');
    await dlg.getByLabel(/Reason/).fill('Verification of identity');
    await dlg.getByRole('button', { name: 'Reveal for one minute' }).click();
    await expect(dlg.getByTestId('reveal-error')).toContainText('Too many requests', { timeout: 20_000 });
    await expect(page.getByTestId('aadhaar-value')).toHaveText('XXXX XXXX ••••');
  });
});

// ═════════════════════════════ organisation ═════════════════════════════
test.describe('live: organisation', () => {
  async function addEntity(page: Page, name: string, pan: string, tan: string) {
    await page.getByRole('button', { name: 'Add legal entity' }).first().click();
    const d = dialog(page, 'Add legal entity');
    await d.getByLabel(/^Legal name/).fill(name);
    await d.getByLabel(/^PAN/).fill(pan);
    await d.getByLabel(/^TAN/).fill(tan);
    await d.getByLabel(/^Address line 1/).fill('5 MG Road');
    await d.getByLabel(/^City/).fill('Pune');
    await d.getByLabel(/^State/).selectOption('Maharashtra');
    await d.getByLabel(/^Pincode/).fill('411001');
    await d.getByRole('button', { name: 'Add entity' }).click();
    await expect(d).toBeHidden();
  }

  test('an entity, then a location that points at it, are sent in that order even when the first call is slow', async ({ page }) => {
    const fake = new FakeHrms();
    fake.delays.push({ when: (c) => c.method === 'POST' && c.path === '/entities', ms: 800 });
    await open(page, fake, ORG);
    await expect(page.getByText('No legal entities yet').first()).toBeVisible({ timeout: 30_000 });
    await addEntity(page, 'Acme Services LLP', 'AAHFA1111A', 'PUNA55555C');

    // straight away, before the entity call has finished
    await page.getByRole('tab', { name: /^Locations/ }).click();
    await page.getByRole('button', { name: 'Add location', exact: true }).click();
    const d = dialog(page, 'Add location');
    await d.getByLabel(/^Location name/).fill('Pune Hub');
    await d.getByLabel(/^State/).selectOption('Maharashtra');
    await d.getByLabel(/^City/).fill('Pune');
    await d.getByRole('button', { name: 'Add location' }).click();
    await expect(d).toBeHidden();

    await expect.poll(() => fake.locations.length, { timeout: 20_000 }).toBe(1);        // the fake refuses a location whose entity does not exist yet
    const order = fake.calls.filter((c) => c.method === 'POST').map((c) => c.path);
    expect(order).toEqual(['/entities', '/locations']);
    const ent = fake.callsTo('POST', /^\/entities$/)[0]!.body!;
    const loc = fake.callsTo('POST', /^\/locations$/)[0]!.body!;
    expect(ent.id).toMatch(UUID);
    expect(loc.id).toMatch(UUID);
    expect(loc.entity_id).toBe(ent.id);
    expect(loc).toMatchObject({ name: 'Pune Hub', state: 'Maharashtra', city: 'Pune' });
    expect(ent).toMatchObject({ name: 'Acme Services LLP', pan: 'AAHFA1111A', tan: 'PUNA55555C', address: { line1: '5 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' } });
    await expect(toasts(page).filter({ hasText: 'Pune Hub added' })).toBeVisible();
  });

  test('departments and designations are created with UUID ids and snake_case bodies', async ({ page }) => {
    const fake = new FakeHrms().seedOrg();
    await open(page, fake, ORG);
    await page.getByRole('tab', { name: /^Departments/ }).click();
    await page.getByRole('button', { name: 'Add department' }).click();
    await dialog(page, 'Add department').getByLabel(/Department name/).fill('Finance');
    await dialog(page, 'Add department').getByRole('button', { name: 'Add department' }).click();
    await page.getByRole('tab', { name: /^Designations/ }).click();
    await page.getByRole('button', { name: 'Add designation' }).click();
    await dialog(page, 'Add designation').getByLabel(/Designation name/).fill('Accountant');
    await dialog(page, 'Add designation').getByLabel('Grade').fill('E2');
    await dialog(page, 'Add designation').getByRole('button', { name: 'Add designation' }).click();
    await expect.poll(() => fake.designations.length, { timeout: 20_000 }).toBe(2);
    expect(fake.callsTo('POST', /^\/departments$/)[0]!.body).toMatchObject({ name: 'Finance' });
    expect(fake.callsTo('POST', /^\/departments$/)[0]!.body!.id).toMatch(UUID);
    expect(fake.callsTo('POST', /^\/designations$/)[0]!.body).toMatchObject({ name: 'Accountant', grade: 'E2' });
  });

  test('editing an entity sends only what changed', async ({ page }) => {
    const fake = new FakeHrms().seedOrg();
    await open(page, fake, ORG);
    await page.getByRole('button', { name: 'Edit Acme Retail Pvt Ltd' }).click();
    const d = dialog(page, 'Edit Acme Retail Pvt Ltd');
    await d.getByLabel(/^Legal name/).fill('Acme Retail Limited');
    await d.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => fake.callsTo('PUT', /^\/entities\//).length, { timeout: 20_000 }).toBe(1);
    expect(fake.callsTo('PUT', /^\/entities\//)[0]!.body).toEqual({ name: 'Acme Retail Limited' });
  });

  test('deleting an entity the server still has locations for shows the server\'s 409 reason and puts the entity back', async ({ page }) => {
    // This page does not know about the locations another admin added, so its own check lets the delete through; the server does not.
    const SPARE = '77777777-7777-4777-8777-777777777777';
    const fake = new FakeHrms().seedOrg();
    fake.entities.push({ ...fake.entities[0]!, id: SPARE, name: 'Acme Spare LLP', pan: 'AAHFA2222B' });
    fake.failures.push({ when: (c) => c.method === 'DELETE' && c.path === `/entities/${SPARE}`, status: 409, error: 'This legal entity still has 2 locations. Move or delete them first.', code: 'IN_USE' });
    await open(page, fake, ORG);
    await page.getByTestId(`entity-card-${SPARE}`).click();
    await page.getByRole('button', { name: 'Remove Acme Spare LLP' }).click();
    await dialog(page, 'Remove legal entity').getByRole('button', { name: 'Remove entity' }).click();
    await expect(toasts(page).filter({ hasText: 'Could not remove legal entity "Acme Spare LLP": This legal entity still has 2 locations. Move or delete them first.' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(`entity-card-${SPARE}`)).toBeVisible();                    // rolled back
    expect(fake.callsTo('DELETE', /^\/entities\//)).toHaveLength(1);
    await expect(toasts(page).filter({ hasText: 'removed' })).toHaveCount(0);                // no false "removed" message
  });

  test('deleting an entity that nothing uses removes it on the server', async ({ page }) => {
    const SPARE = '77777777-7777-4777-8777-777777777777';
    const fake = new FakeHrms().seedOrg();
    fake.entities.push({ ...fake.entities[0]!, id: SPARE, name: 'Acme Spare LLP', pan: 'AAHFA2222B' });
    await open(page, fake, ORG);
    await page.getByTestId(`entity-card-${SPARE}`).click();
    await page.getByRole('button', { name: 'Remove Acme Spare LLP' }).click();
    await dialog(page, 'Remove legal entity').getByRole('button', { name: 'Remove entity' }).click();
    await expect(toasts(page).filter({ hasText: 'Acme Spare LLP removed' })).toBeVisible({ timeout: 20_000 });
    expect(fake.entities.map((e) => e.id)).toEqual([ENT]);
  });

  test('a refused organisation save is undone and the reason is shown', async ({ page }) => {
    const fake = new FakeHrms().seedOrg();
    fake.failures.push({ when: (c) => c.method === 'POST' && c.path === '/departments', status: 400, error: 'name: Name is required', code: 'VALIDATION' });
    await open(page, fake, ORG);
    await page.getByRole('tab', { name: /^Departments/ }).click();
    await page.getByRole('button', { name: 'Add department' }).click();
    await dialog(page, 'Add department').getByLabel(/Department name/).fill('Legal');
    await dialog(page, 'Add department').getByRole('button', { name: 'Add department' }).click();
    await expect(toasts(page).filter({ hasText: 'Could not add department "Legal": name: Name is required' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('row').filter({ hasText: 'Legal' })).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: 'Operations' })).toBeVisible();
  });
});

// ═════════════════════════════ CSV import through the server ═════════════════════════════
test.describe('live: CSV import', () => {
  const header = 'First Name,Last Name,Email,Mobile,Gender,Date of Birth,Date of Joining,Department,Designation,Location,PAN';
  const rows = [
    'Kabir,Anand,kabir.anand@example.com,9876501234,male,1997-03-14,2026-11-02,Operations,Operations Associate,Bengaluru Office,ABCPK1234F',
    'Mira,Dsouza,reject.mira@example.com,9876501235,female,1995-08-15,2026-11-02,Operations,Operations Associate,Bengaluru Office,',
    'Bad,Local,bad.local@example.com,12345,male,1990-01-01,2026-11-02,Astrology,Operations Associate,Bengaluru Office,',
    'Neel,Iyer,neel.iyer@example.com,9876501237,male,1994-01-01,2026-11-02,Operations,Operations Associate,Bengaluru Office,',
  ];

  test('valid rows go to the server import endpoint; rows it refuses are listed by file line with its reason', async ({ page }) => {
    const fake = new FakeHrms().seedOrg();
    await open(page, fake);
    await expect(page.getByTestId('employees-live-empty')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Import CSV' }).click();
    const dlg = dialog(page, 'Import employees from CSV');
    await dlg.getByTestId('import-file').setInputFiles({ name: 'staff.csv', mimeType: 'text/csv', buffer: Buffer.from([header, ...rows].join('\r\n')) });
    await expect(dlg.getByTestId('import-valid')).toHaveText('3 valid');
    await expect(dlg.getByTestId('import-invalid')).toHaveText('1 with errors');       // the local checks still run first
    await dlg.getByRole('button', { name: 'Import 3 employees' }).click();
    await expect(dlg.getByText('Imported 2 employees.')).toBeVisible({ timeout: 20_000 });

    const calls = fake.callsTo('POST', /^\/employees\/import$/);
    expect(calls).toHaveLength(1);
    const sent = calls[0]!.body!.rows as Row[];
    expect(sent).toHaveLength(3);                                    // the locally invalid row never leaves the browser
    for (const r of sent) { expect(r.id).toMatch(UUID); expect(r).not.toHaveProperty('code'); expect(r).not.toHaveProperty('documents'); }
    expect(sent[0]).toMatchObject({ first_name: 'Kabir', last_name: 'Anand', email: 'kabir.anand@example.com', location_id: LOC, department_id: DEP, designation_id: DES, pan: 'ABCPK1234F' });
    expect(fake.maskedBodies).toEqual([]);

    // the server refused the second valid row; the dialog names its line in the file (line 3), not its position among the valid rows
    await expect(dlg.getByTestId('import-rejected-count')).toContainText('1 row was refused by the server');
    const bad = dlg.getByTestId('import-rejected-row');
    await expect(bad).toHaveCount(1);
    await expect(bad).toContainText('3');
    await expect(bad).toContainText('Mira Dsouza');
    await expect(bad).toContainText('email: Already used by another employee');
    await expect(dlg.getByText('EMP-0001')).toBeVisible();           // the codes are the server's
    await expect(dlg.getByText('EMP-0002')).toBeVisible();
    await dlg.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByTestId('employee-count')).toHaveText('Showing 2 of 2');
  });

  test('a failed import call shows the reason and keeps the file so it can be sent again', async ({ page }) => {
    const fake = new FakeHrms().seedOrg();
    fake.failures.push({ when: (c) => c.path === '/employees/import', status: 413, error: 'The request is larger than 1 MB', code: 'PAYLOAD_TOO_LARGE' });
    await open(page, fake);
    await expect(page.getByTestId('employees-live-empty')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Import CSV' }).click();
    const dlg = dialog(page, 'Import employees from CSV');
    await dlg.getByTestId('import-file').setInputFiles({ name: 'staff.csv', mimeType: 'text/csv', buffer: Buffer.from([header, rows[0]!].join('\r\n')) });
    await dlg.getByRole('button', { name: 'Import 1 employee' }).click();
    await expect(dlg.getByTestId('import-server-error')).toContainText('The request is larger than 1 MB', { timeout: 20_000 });
    await dlg.getByRole('button', { name: 'Import 1 employee' }).click();
    await expect(dlg.getByText('Imported 1 employee.')).toBeVisible({ timeout: 20_000 });
    const ids = fake.callsTo('POST', /^\/employees\/import$/).map((c) => (c.body!.rows as Row[])[0]!.id);
    expect(ids[0]).toBe(ids[1]);                                     // the same id on the retry, so nobody is created twice
  });
});

// ═════════════════════════════ lifecycle: a new joiner ═════════════════════════════
test.describe('live: new joiner', () => {
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

  test('creates an onboarding employee on the server, and the success message waits for the server', async ({ page }) => {
    const fake = new FakeHrms().seedOrg();
    fake.delays.push({ when: (c) => c.method === 'POST' && c.path === '/employees', ms: 700 });
    await open(page, fake, '/dashboard/hrms/lifecycle?tab=onboarding');
    const d = await fillJoiner(page);
    await d.getByRole('button', { name: 'Create joiner' }).click();
    await expect(toasts(page).filter({ hasText: 'Ira Menon added to onboarding with 8 tasks.' })).toBeVisible({ timeout: 20_000 });
    const post = fake.callsTo('POST', /^\/employees$/);
    expect(post).toHaveLength(1);
    expect(post[0]!.body).toMatchObject({ first_name: 'Ira', last_name: 'Menon', status: 'onboarding', email: 'ira.menon@example.com', department_id: DEP, designation_id: DES, location_id: LOC, entity_id: ENT });
    expect(post[0]!.body!.id).toMatch(UUID);
    expect(fake.employees).toHaveLength(1);
  });

  test('a refused joiner is taken out again, with the server\'s reason, and no success message', async ({ page }) => {
    const fake = new FakeHrms().seedOrg();
    fake.failures.push({ when: (c) => c.method === 'POST' && c.path === '/employees', status: 400, error: 'email: Enter a valid email address', code: 'VALIDATION' });
    await open(page, fake, '/dashboard/hrms/lifecycle?tab=onboarding');
    const d = await fillJoiner(page);
    await d.getByRole('button', { name: 'Create joiner' }).click();
    await expect(toasts(page).filter({ hasText: 'Could not add Ira Menon: email: Enter a valid email address' })).toBeVisible({ timeout: 20_000 });
    await expect(toasts(page).filter({ hasText: 'added to onboarding' })).toHaveCount(0);
    await expect(page.getByText('Ira Menon')).toHaveCount(0);          // neither the person nor the joining case is left behind
    expect(fake.employees).toHaveLength(0);
  });
});

// ═════════════════════════════ guards ═════════════════════════════
test.describe('live: guards', () => {
  test('pages that are not on the server yet say so; the server-backed ones do not', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    await open(page, fake, '/dashboard/hrms/payroll');
    await expect(page.getByTestId('hrms-local-note')).toContainText('Saved in this browser only: payroll is not on the server yet', { timeout: 30_000 });
    await page.goto('/dashboard/hrms/time');
    await expect(page.getByTestId('hrms-local-note')).toContainText('Saved in this browser only: this part of HRMS is not on the server yet', { timeout: 30_000 });
    for (const path of [EMPLOYEES, ORG, '/dashboard/hrms']) {
      await page.goto(path);
      await waitLoaded(page);
      await expect(page.getByTestId('hrms-local-note')).toHaveCount(0);
    }
  });

  test('Reset sample data is disabled in live mode, with the reason shown, and never touches the sample copy', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    page.on('dialog', (d) => { void d.dismiss(); });
    await open(page, fake);
    await waitLoaded(page);
    const reset = page.getByTestId('hrms-reset');
    await expect(reset).toBeDisabled();
    await expect(page.getByTestId('hrms-reset-reason')).toContainText('Reset is for sample data only. It never touches the server.');
    await reset.click({ force: true });
    expect(fake.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
    await sample(page).click();
    await expect(page.getByTestId('hrms-reset')).toBeEnabled();
    await expect(page.getByTestId('hrms-reset-reason')).toHaveCount(0);
  });

  test('bank-file generation refuses masked account numbers with a plain message', async ({ page }) => {
    test.setTimeout(300_000);
    const fake = new FakeHrms().seedOrg().seedAsha();
    await open(page, fake, '/dashboard/hrms/payroll');
    await page.getByRole('button', { name: 'Start run' }).click();
    await page.waitForURL(/\/payroll\/runs\//, { timeout: 90_000 });
    await expect(page.getByTestId('hrms-local-note')).toContainText('payroll is not on the server yet');
    await page.locator('[data-step="checks"]').click();
    const accept = page.getByRole('checkbox', { name: /I understand/ });
    if (await accept.isVisible().catch(() => false)) await accept.check();
    await page.getByRole('button', { name: 'Continue to compute' }).click();
    await page.getByRole('button', { name: 'Compute payslips' }).click();
    await expect(page.getByTestId('payslip-table')).toBeVisible({ timeout: 60_000 });
    await page.locator('[data-step="review"]').click();
    await page.getByRole('button', { name: 'Continue to freeze' }).click();
    await page.getByRole('button', { name: 'Freeze run' }).click();
    await page.getByRole('dialog', { name: 'Freeze this run?' }).getByRole('button', { name: 'Freeze run' }).click();
    await expect(page.getByTestId('step-pay')).toBeVisible({ timeout: 60_000 });
    const guard = page.getByTestId('bank-masked-guard');
    await expect(guard).toContainText('The bank file cannot be made: 1 account number is masked');
    await expect(page.getByRole('button', { name: /Download bank file/ })).toBeDisabled();
    expect(fake.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);          // payroll never reached the server
  });
});

// ═════════════════════════════ quality ═════════════════════════════
test.describe('live: no errors, narrow screens', () => {
  test('the happy path logs no console or page errors', async ({ page }) => {
    const fake = new FakeHrms().seedOrg().seedAsha();
    const errors = watchErrors(page);
    await open(page, fake, EMPLOYEES, null);
    await live(page).click();
    await dialog(page, 'Switch to live data?').getByRole('button', { name: 'Switch to live data' }).click();
    await expect(page.getByText('Asha Rao').first()).toBeVisible({ timeout: 30_000 });
    await page.goto(`${EMPLOYEES}/${ASHA}?tab=statutory`);
    await expect(page.getByTestId('pan-value')).toBeVisible({ timeout: 30_000 });
    await page.goto(ORG);
    await expect(page.getByText('Acme Retail Pvt Ltd').first()).toBeVisible({ timeout: 30_000 });
    await sample(page).click();
    await expect(banner(page)).toHaveAttribute('data-source', 'sample');
    expect(errors).toEqual([]);
  });

  test.describe('390px', () => {
    test.use({ viewport: { width: 390, height: 800 } });
    const noSidewaysScroll = async (page: Page) => {
      await page.waitForTimeout(500);
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(w.sw).toBeLessThanOrEqual(w.iw + 1);
    };

    test('sample banner', async ({ page }) => {
      await open(page, new FakeHrms(), EMPLOYEES, null);
      await noSidewaysScroll(page);
    });
    test('live loading, ready and empty states', async ({ page }) => {
      const fake = new FakeHrms().seedOrg();
      fake.bootstrapDelay = 1500;
      await open(page, fake);
      await expect(page.getByTestId('hrms-live-loading')).toBeVisible();
      await noSidewaysScroll(page);
      await expect(page.getByTestId('employees-live-empty')).toBeVisible({ timeout: 30_000 });
      await noSidewaysScroll(page);
    });
    test('live not-ready and error states', async ({ page }) => {
      const fake = new FakeHrms().seedOrg();
      fake.mode = 'not_ready';
      await open(page, fake);
      await expect(page.getByTestId('hrms-live-not-ready')).toBeVisible({ timeout: 30_000 });
      await noSidewaysScroll(page);
      fake.mode = 'error';
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByTestId('hrms-live-error')).toBeVisible({ timeout: 30_000 });
      await noSidewaysScroll(page);
    });
    test('live list with people, and the local-only note', async ({ page }) => {
      const fake = new FakeHrms().seedOrg().seedAsha();
      await open(page, fake);
      await expect(page.getByText('Asha Rao').first()).toBeVisible({ timeout: 30_000 });
      await noSidewaysScroll(page);
      await page.goto('/dashboard/hrms/time');
      await expect(page.getByTestId('hrms-local-note')).toBeVisible({ timeout: 30_000 });
      await noSidewaysScroll(page);
      // The payroll page has wide tables of its own (it scrolls sideways in sample mode too); the banner and the note must still fit.
      await page.goto('/dashboard/hrms/payroll');
      await expect(page.getByTestId('hrms-local-note')).toBeVisible({ timeout: 30_000 });
      for (const id of ['hrms-preview-banner', 'hrms-local-note']) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(391);
      }
    });
  });
});
