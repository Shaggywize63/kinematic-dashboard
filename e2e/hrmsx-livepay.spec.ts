import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'fs';
import { mockApi, seedSession } from './utils';
import { MASTER_USER } from './hrms-utils';
import { makeSeed } from '../src/lib/hrms/seed';
import { buildBankFile, buildEcr, computeFnf, computePayRunPayslips, preRunChecks } from '../src/lib/hrms/engine';
import { acknowledgedBlockers, previewBankFile, runIsStale } from '../src/components/hrms/payroll/logic';
import { diffServer } from '../src/lib/hrms/live/diff';
import { setAcks, clearAcks } from '../src/lib/hrms/live/acks';
import {
  attendanceFromWire, attendanceBody, adjustmentCreateBody, adjustmentFromWire, adjustmentPatch, bankFileFromWire, checksFromWire, ecrFromWire, fnfCreateBody, fnfFromWire,
  fnfPatch, loanCreateBody, loanFromWire, overtimeFromWire, payrollFromWire, payslipFromWire, runFlagFromWire, runFromWire, settingsBody, structureCreateBody,
  structureFromWire, structurePatch,
} from '../src/lib/hrms/live/payrollWire';
import {
  departmentFromWire, designationFromWire, employeeFromWire, entityFromWire, locationFromWire,
} from '../src/lib/hrms/live/wire';
import type { Adjustment, AttendanceSummary, FnfCase, HrmsDb, Loan, PayRun, SalaryStructure } from '../src/lib/hrms/types';

/**
 * HRMS live mode, phase 2: payroll on the server. The server is a stateful miniature of the payroll contract behind page.route:
 * it keeps structures, attendance, adjustments, loans, runs with payslips and settlements, enforces the same rules and refusal
 * codes, computes with the real engine (as the backend does), builds the bank file from the full account numbers it alone holds,
 * and records every call. Nothing here talks to a real backend or database.
 */

test.describe.configure({ timeout: 240_000 });
test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

const SOURCE_KEY = 'kinematic_hrms_source';
const LOCAL_KEY = 'kinematic_hrms_live_local_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYROLL = '/dashboard/hrms/payroll';
const MONTH = '2026-11';

const ENT = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';
const DEP = '33333333-3333-4333-8333-333333333333';
const DES = '44444444-4444-4444-8444-444444444444';
const ASHA = '55555555-5555-4555-8555-555555555555';
const DEV = '66666666-6666-4666-8666-666666666666';
const MEERA = '77777777-7777-4777-8777-777777777777';
const STR = '88888888-8888-4888-8888-888888888888';
const LOAN = '99999999-9999-4999-8999-999999999999';
const ADJ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// Fake, obviously made-up values. The account number is the "secret" that only the server holds in full.
const ASHA_ACCOUNT = '501000123456';
const DEV_ACCOUNT = '502000654321';
const SENTINEL_CTC = 543210;   // Dev's annual CTC: an unusual number that must never turn up in browser storage

type Row = Record<string, unknown>;
interface Call { method: string; path: string; query: string; body: Row | undefined; n: number }
interface Failure { when: (c: Call) => boolean; status: number; error: string; code?: string; once?: boolean }

const maskAcct = (a: string) => '•'.repeat(a.length - 4) + a.slice(-4);
const maskPan = (p: string) => 'X'.repeat(p.length - 4) + p.slice(-4);
const FNF_RESET = 'Case not found';

// ───────────────────────────── a stateful payroll server (wire shape) ─────────────────────────────
class FakePayroll {
  calls: Call[] = [];
  entities: Row[] = [];
  locations: Row[] = [];
  departments: Row[] = [];
  designations: Row[] = [];
  employees: Row[] = [];
  secrets = new Map<string, { pan?: string; bank?: Row }>();
  structures: Row[] = [];
  attendance: Row[] = [];
  adjustments: Row[] = [];
  loans: Row[] = [];
  runs: Row[] = [];
  fnf: Row[] = [];
  rule: Row = makeSeed().overtimeRules[0] as unknown as Row;
  accessLog: Row[] = [];
  failures: Failure[] = [];
  delays: Array<{ when: (c: Call) => boolean; ms: number }> = [];
  /** 'ok'; 'payroll_not_ready' answers 503 HRMS_NOT_READY on /payroll/bootstrap only; 'payroll_error' answers 500 there. */
  mode: 'ok' | 'payroll_not_ready' | 'payroll_error' = 'ok';
  /** Added to every computed gross and net: proves the screens show the server's payslips, not the engine run in the browser. */
  fudge = 0;
  /** A bootstrap that leaves the runs out, as for runs older than the months it covers. */
  omitRunsFromBootstrap = false;
  private seq = 0;

  // ── seeding ──
  seedOrg(): this {
    this.entities = [{
      id: ENT, name: 'Acme Retail Pvt Ltd', pan: 'AABCA1234C', tan: 'DELA12345B', cin: null, gstin: null,
      address: { line1: '1 Main Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
      registrations: [{ id: 'reg-pf', type: 'pf', number: 'FAKEPF0000001' }], signatory: null,
    }];
    this.locations = [{ id: LOC, entity_id: ENT, name: 'Bengaluru Office', state: 'Karnataka', city: 'Bengaluru', address: null, metro: true, holiday_list_id: null }];
    this.departments = [{ id: DEP, name: 'Operations', head_id: null }];
    this.designations = [{ id: DES, name: 'Operations Associate', grade: 'E1' }];
    return this;
  }

  /** The Office staff structure from the sample company, under a server id. */
  seedStructure(): this {
    const t = makeSeed().structures[0]!;
    this.structures = [{ id: STR, name: t.name, description: t.description ?? null, effective_from: t.effectiveFrom, components: t.components, created_at: '2026-04-01T09:00:00Z', updated_at: '2026-04-01T09:00:00Z' }];
    return this;
  }

  /** Asha (everything in order), Dev (UAN not seeded) and Meera (no bank account), all on the Office structure. */
  seedPeople(): this {
    const mk = (id: string, code: string, first: string, last: string, ctc: number, extra: Row, secrets: { pan?: string; bank?: Row }) => {
      this.secrets.set(id, secrets);
      this.employees.push({
        id, code, first_name: first, last_name: last, email: `${first.toLowerCase()}@example.com`, mobile: '9876500001', gender: 'female', dob: '1995-05-05',
        father_name: null, marital_status: null, blood_group: null, address: { line1: '12 Lake View', city: 'Bengaluru', state: 'Karnataka', pincode: '560034' }, emergency_contact: null,
        entity_id: ENT, location_id: LOC, department_id: DEP, designation_id: DES, reporting_to_id: null, employment_type: 'permanent', status: 'active', join_date: '2026-04-01',
        confirmation_date: null, probation_months: 6, notice_days: 30, last_working_date: null, shift_id: null, cost_centre: null, contract_end_date: null,
        aadhaar_last4: '1234', aadhaar_verified: false, uan: '100200300400', uan_status: 'aadhaar_seeded', pf_member: true, pf_on_actual_wage: false, pf_join_date: '2026-04-01', esic_ip: null,
        pt_applicable: true, lwf_applicable: false, tax_regime: 'new', declaration: { sec80C: 0, sec80D: 0, nps80CCD1B: 0, homeLoanInterest: 0, rentPaidAnnual: 0, other: 0, status: 'not_submitted' },
        pay_mode: 'bank', structure_id: STR, annual_ctc: String(ctc), structure_overrides: null, created_at: '2026-04-01T09:00:00Z', updated_at: '2026-04-01T09:00:00Z',
        pan: secrets.pan ? maskPan(secrets.pan) : null,
        bank: secrets.bank ? { ...secrets.bank, accountNumber: maskAcct(String(secrets.bank.accountNumber)) } : null,
        documents: [], history: [], ...extra,
      });
    };
    mk(ASHA, 'EMP-0001', 'Asha', 'Rao', 600000, {}, { pan: 'ABCPA1234F', bank: { accountHolder: 'Asha Rao', accountNumber: ASHA_ACCOUNT, ifsc: 'HDFC0001234', bankName: 'HDFC Bank', accountType: 'savings' } });
    mk(DEV, 'EMP-0002', 'Dev', 'Nair', SENTINEL_CTC, { gender: 'male', uan: '100200300401', uan_status: 'generated' }, { pan: 'ABCPN5678K', bank: { accountHolder: 'Dev Nair', accountNumber: DEV_ACCOUNT, ifsc: 'ICIC0000456', bankName: 'ICICI Bank', accountType: 'savings' } });
    mk(MEERA, 'EMP-0003', 'Meera', 'Das', 360000, {}, { pan: 'ABCPD9012L' });
    return this;
  }

  /** A loan being recovered for Asha (2,000 a month, 4,000 already recovered), and a bonus for Dev in November. */
  seedMoney(): this {
    this.loans = [{ id: LOAN, employee_id: ASHA, kind: 'loan', principal: 12000, emi: 2000, start_month: '2026-10', recovered: 4000, note: 'Laptop', created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T09:00:00Z' }];
    this.adjustments = [{ id: ADJ, employee_id: DEV, month: MONTH, kind: 'bonus', amount: 5000, taxable: true, note: 'Festival bonus', source: null, created_by: null, created_at: '2026-11-01T09:00:00Z', updated_at: '2026-11-01T09:00:00Z' }];
    return this;
  }

  full(): this { return this.seedOrg().seedStructure().seedPeople().seedMoney(); }

  // ── helpers ──
  callsTo(method: string, pattern: RegExp): Call[] { return this.calls.filter((c) => c.method === method && pattern.test(c.path)); }
  writes(): Call[] { return this.calls.filter((c) => c.method !== 'GET'); }
  run(month = MONTH): Row | undefined { return this.runs.find((r) => r.month === month && r.type === 'regular'); }
  employee(id: string): Row { return this.employees.find((e) => e.id === id)!; }
  loan(id: string): Row { return this.loans.find((l) => l.id === id)!; }
  /** Put a computed run on the server directly (as if computed earlier), without any call. */
  precompute(): Row {
    const run = this.newRun(MONTH, 'regular');
    this.doCompute(run);
    return run;
  }
  private ok(route: Route, data: unknown, status = 200) { return route.fulfill({ status, json: { success: true, data } }); }
  private err(route: Route, status: number, error: string, code?: string) { return route.fulfill({ status, json: { success: false, error, ...(code ? { code } : {}) } }); }

  // ── the engine's inputs, rebuilt from the server's rows (what the backend does) ──
  private engineDb(unmasked: boolean): HrmsDb {
    const seed = makeSeed();
    const employees = this.employees.map((r) => {
      const s = this.secrets.get(String(r.id)) ?? {};
      return employeeFromWire(unmasked ? { ...r, pan: s.pan ?? null, bank: s.bank ?? null } : r);
    });
    return {
      ...seed, company: { name: 'Acme', currency: 'INR', fyStartMonth: 4 },
      entities: this.entities.map(entityFromWire), locations: this.locations.map(locationFromWire), departments: this.departments.map(departmentFromWire),
      designations: this.designations.map(designationFromWire), employees,
      structures: this.structures.map(structureFromWire), attendance: this.attendance.map(attendanceFromWire), adjustments: this.adjustments.map(adjustmentFromWire),
      loans: this.loans.map(loanFromWire), overtimeRules: [overtimeFromWire(this.rule)!], fnfCases: this.fnf.map(fnfFromWire),
      payRuns: this.runs.map((r) => ({ ...runFromWire(r), payslips: [] })),
    } as HrmsDb;
  }

  private fingerprint(run: Row): string {
    const month = String(run.month);
    const people = this.employees.filter((e) => e.entity_id === run.entity_id).map((e) => {
      const { updated_at: _u, history: _h, documents: _d, ...rest } = e; void _u; void _h; void _d;
      return rest;
    });
    const att = this.attendance.filter((a) => a.month === month).map(({ locked: _l, id: _i, updated_at: _u, ...rest }) => { void _l; void _i; void _u; return rest; });
    const adj = this.adjustments.filter((a) => a.month === month).map(({ updated_at: _u, ...rest }) => { void _u; return rest; });
    const loans = this.loans.map(({ updated_at: _u, ...rest }) => { void _u; return rest; });
    const structures = this.structures.map(({ updated_at: _u, ...rest }) => { void _u; return rest; });
    return JSON.stringify([people, att, adj, loans, structures, this.rule]);
  }

  private wireRun(run: Row, withSlips: boolean): Row {
    const stale = run.status === 'computed' && this.fingerprint(run) !== run.input_fingerprint;
    const { input_fingerprint: _f, ...rest } = run; void _f;
    return { ...rest, stale, payslips: withSlips ? run.payslips : [], ...(withSlips ? {} : { payslip_count: (run.payslips as unknown[]).length }) };
  }

  private newRun(month: string, type: string): Row {
    const run: Row = {
      id: crypto.randomUUID(), entity_id: ENT, month, type, status: 'draft', law_version: null, created_at: '2026-11-10T08:00:00Z', computed_at: null, frozen_at: null,
      frozen_by: null, paid_at: null, loan_recoveries: {}, attendance_locked_for: [], audit: [{ at: '2026-11-10T08:00:00Z', by: 'Master Admin', action: 'Created' }],
      payslips: [], input_fingerprint: '',
    };
    this.runs.push(run);
    return run;
  }

  private doCompute(run: Row): void {
    const db = this.engineDb(true);
    const slips = computePayRunPayslips(db, String(run.month), String(run.entity_id), String(run.id))
      .map((p) => ({ ...p, id: crypto.randomUUID(), gross: p.gross + this.fudge, net: p.net + this.fudge }));
    run.payslips = slips;
    run.status = 'computed';
    run.law_version = 'IN-2026-11-test';
    run.computed_at = '2026-11-10T09:00:00Z';
    run.input_fingerprint = this.fingerprint(run);
    (run.audit as Row[]).push({ at: '2026-11-10T09:00:00Z', by: 'Master Admin', action: `Computed ${slips.length} payslips` });
  }

  /** A frozen or paid run of the month and entity: its inputs are closed. */
  private closedRun(month: string): Row | undefined { return this.runs.find((r) => r.month === month && (r.status === 'frozen' || r.status === 'paid')); }
  private monthName(month: string): string { return new Date(`${month}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }

  // ── the router ──
  async handle(route: Route, url: string, method: string): Promise<boolean> {
    const u = new URL(url);
    const m = u.pathname.match(/^\/api\/v1\/hrms(\/.*)?$/);
    if (!m) return false;
    const path = m[1] ?? '';
    const raw = method === 'GET' || method === 'DELETE' ? undefined : route.request().postData() ?? undefined;
    const body = raw ? (JSON.parse(raw) as Row) : undefined;
    const call: Call = { method, path, query: u.search, body, n: this.seq++ };
    this.calls.push(call);

    const delay = this.delays.find((d) => d.when(call));
    if (delay) await new Promise((r) => setTimeout(r, delay.ms));
    const fi = this.failures.findIndex((f) => f.when(call));
    if (fi >= 0) {
      const f = this.failures[fi]!;
      if (f.once !== false) this.failures.splice(fi, 1);
      await this.err(route, f.status, f.error, f.code);
      return true;
    }

    // ── people ──
    if (method === 'GET' && path === '/bootstrap') {
      await this.ok(route, {
        entities: this.entities, locations: this.locations, departments: this.departments, designations: this.designations, employees: this.employees,
        settings: { employee_code_prefix: 'EMP-' }, server_time: '2026-11-10T09:00:00Z',
      });
      return true;
    }
    // Time and leave (phase 3) is covered by hrmsx-livetime.spec.ts; here it answers an empty set so a live load has it ready.
    if (method === 'GET' && path === '/time/bootstrap') {
      await this.ok(route, { shifts: [], roster: [], leave_types: [], holiday_lists: [], leave_balances: [], server_time: '2026-11-10T09:00:00Z' });
      return true;
    }
    const emp = path.match(/^\/employees\/([^/]+)$/);
    if (emp && method === 'PUT') {
      const e = this.employees.find((x) => x.id === emp[1]);
      if (!e) { await this.err(route, 404, 'Employee not found', 'NOT_FOUND'); return true; }
      for (const [k, v] of Object.entries(body ?? {})) { if (k !== 'pan' && k !== 'bank') e[k] = v; }
      e.history = [];
      await this.ok(route, e);
      return true;
    }

    // ── payroll ──
    if (!path.startsWith('/payroll')) { await this.err(route, 404, `Unhandled ${method} ${path}`, 'NOT_FOUND'); return true; }
    const p = path.slice('/payroll'.length);

    if (method === 'GET' && p === '/bootstrap') {
      if (this.mode === 'payroll_not_ready') { await this.err(route, 503, 'HRMS storage is not set up yet', 'HRMS_NOT_READY'); return true; }
      if (this.mode === 'payroll_error') { await this.err(route, 500, 'Internal server error', 'INTERNAL_ERROR'); return true; }
      await this.ok(route, {
        structures: this.structures, attendance: this.attendance, adjustments: this.adjustments, loans: this.loans,
        runs: this.omitRunsFromBootstrap ? [] : this.runs.map((r) => this.wireRun(r, true)), fnf_cases: this.fnf, settings: { payroll: { overtime_rule: this.rule } }, server_time: '2026-11-10T09:00:00Z',
      });
      return true;
    }

    // simple records: structures, adjustments, loans, fnf
    const rec = p.match(/^\/(structures|adjustments|loans|fnf)(?:\/([^/]+))?$/);
    if (rec) { await this.record(route, method, rec[1]!, rec[2], body); return true; }

    const att = p.match(/^\/attendance\/([^/]+)\/(\d{4}-\d{2})$/);
    if (att && method === 'PUT') { await this.putAttendance(route, att[1]!, att[2]!, body ?? {}); return true; }
    if (method === 'PUT' && p === '/settings/payroll') {
      const rule = body?.overtime_rule as Row | undefined;
      if (!rule || typeof rule.rateMultiplier !== 'number' || rule.rateMultiplier < 1) { await this.err(route, 400, 'overtime_rule: The overtime rate must be at least 1', 'VALIDATION'); return true; }
      this.rule = rule;
      await this.ok(route, { payroll: { overtime_rule: this.rule } });
      return true;
    }

    // runs
    if (method === 'GET' && p === '/runs') { await this.ok(route, this.runs.map((r) => this.wireRun(r, false))); return true; }
    if (method === 'POST' && p === '/runs') {
      const entityId = String(body?.entity_id ?? ''); const month = String(body?.month ?? ''); const type = String(body?.type ?? 'regular');
      if (!this.entities.some((e) => e.id === entityId) || !/^\d{4}-\d{2}$/.test(month)) { await this.err(route, 400, 'entity_id: Unknown legal entity', 'VALIDATION'); return true; }
      const existing = this.runs.find((r) => r.month === month && r.entity_id === entityId && r.type === type);
      if (existing) { await this.ok(route, this.wireRun(existing, true)); return true; }
      await this.ok(route, this.wireRun(this.newRun(month, type), true), 201);
      return true;
    }
    const rn = p.match(/^\/runs\/([^/]+)(?:\/([a-z-]+))?$/);
    if (rn) {
      const run = this.runs.find((r) => r.id === rn[1]);
      if (!run) { await this.err(route, 404, 'Run not found', 'NOT_FOUND'); return true; }
      await this.runRoute(route, method, run, rn[2], body);
      return true;
    }

    const fn = p.match(/^\/fnf\/([^/]+)\/(approve|mark-paid|compute)$/);
    if (fn) {
      const c = this.fnf.find((x) => x.id === fn[1]);
      if (!c) { await this.err(route, 404, FNF_RESET, 'NOT_FOUND'); return true; }
      if (fn[2] === 'compute' && method === 'GET') {
        const result = computeFnf(this.engineDb(true), fnfFromWire(c));
        if (!result) { await this.err(route, 409, 'This settlement cannot be computed: the employee needs a salary structure, a CTC and a location.', 'FNF_STATE'); return true; }
        await this.ok(route, { ...result, net: result.net + this.fudge });
        return true;
      }
      if (fn[2] === 'approve' && method === 'POST') {
        if (c.status !== 'draft') { await this.err(route, 409, 'Only a draft settlement can be approved.', 'FNF_STATE'); return true; }
        c.status = 'approved';
      } else if (fn[2] === 'mark-paid' && method === 'POST') {
        if (c.status !== 'approved') { await this.err(route, 409, 'Approve the settlement before marking it paid.', 'FNF_STATE'); return true; }
        c.status = 'paid';
      }
      await this.ok(route, c);
      return true;
    }
    await this.err(route, 404, `Unhandled ${method} ${path}`, 'NOT_FOUND');
    return true;
  }

  private async record(route: Route, method: string, kind: string, id: string | undefined, body: Row | undefined): Promise<void> {
    const lists: Record<string, Row[]> = { structures: this.structures, adjustments: this.adjustments, loans: this.loans, fnf: this.fnf };
    const list = lists[kind]!;
    const stamp = { updated_at: '2026-11-10T09:00:00Z' };
    if (method === 'POST') {
      const b = body ?? {};
      if (list.some((r) => r.id === b.id)) { await this.ok(route, list.find((r) => r.id === b.id)); return; }
      if (kind === 'adjustments') {
        const closed = this.closedRun(String(b.month));
        if (closed) { await this.err(route, 409, `The ${this.monthName(String(b.month))} run is ${String(closed.status)}. Adjustments for it are closed.`, 'MONTH_LOCKED'); return; }
        if (!(Number(b.amount) > 0)) { await this.err(route, 400, 'amount: Amount must be more than zero', 'VALIDATION'); return; }
      }
      if (kind === 'structures' && !(typeof b.name === 'string' && b.name.trim())) { await this.err(route, 400, 'name: Name is required', 'VALIDATION'); return; }
      const row: Row = { ...(kind === 'loans' ? { recovered: 0 } : {}), ...(kind === 'fnf' ? { status: 'draft' } : {}), ...(kind === 'adjustments' ? { source: null, created_by: null } : {}), created_at: '2026-11-10T09:00:00Z', ...stamp, ...b };
      list.push(row);
      await this.ok(route, row, 201);
      return;
    }
    const row = list.find((r) => r.id === id);
    if (!row) { await this.err(route, 404, 'Not found', 'NOT_FOUND'); return; }
    if (method === 'PUT') {
      if (kind === 'adjustments') {
        const closed = this.closedRun(String(row.month));
        if (closed) { await this.err(route, 409, `This adjustment belongs to the ${this.monthName(String(row.month))} run, which is ${String(closed.status)}.`, 'MONTH_LOCKED'); return; }
      }
      if (kind === 'fnf' && row.status !== 'draft') { await this.err(route, 409, 'Only a draft settlement can be changed.', 'FNF_STATE'); return; }
      Object.assign(row, body, stamp);
      await this.ok(route, row);
      return;
    }
    if (method === 'DELETE') {
      if (kind === 'structures') {
        const used = this.employees.filter((e) => e.structure_id === id).length;
        if (used) { await this.err(route, 409, `${used} employee${used === 1 ? ' is' : 's are'} on this structure. Move them to another structure first.`, 'VALIDATION'); return; }
      }
      if (kind === 'loans' && Number(row.recovered) > 0) { await this.err(route, 409, 'Part of this loan has been recovered through payroll, so it cannot be deleted.', 'VALIDATION'); return; }
      if (kind === 'adjustments') {
        const closed = this.closedRun(String(row.month));
        if (closed) { await this.err(route, 409, `The ${this.monthName(String(row.month))} run is ${String(closed.status)}. This adjustment cannot be deleted.`, 'MONTH_LOCKED'); return; }
      }
      if (kind === 'fnf' && row.status !== 'draft') { await this.err(route, 409, 'Only a draft settlement can be deleted.', 'FNF_STATE'); return; }
      list.splice(list.indexOf(row), 1);
      await this.ok(route, { id });
      return;
    }
    await this.err(route, 405, 'Method not allowed', 'VALIDATION');
  }

  private async putAttendance(route: Route, employeeId: string, month: string, b: Row): Promise<void> {
    const emp = this.employees.find((e) => e.id === employeeId);
    if (!emp) { await this.err(route, 404, 'Employee not found', 'NOT_FOUND'); return; }
    const closed = this.closedRun(month);
    let row = this.attendance.find((a) => a.employee_id === employeeId && a.month === month);
    if (closed) { await this.err(route, 409, `The ${this.monthName(month)} run is ${String(closed.status)}. Its inputs are locked.`, 'MONTH_LOCKED'); return; }
    if (row?.locked) { await this.err(route, 409, "This month's attendance is locked. Unlock it in Attendance first.", 'MONTH_LOCKED'); return; }
    const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    if (b.lop_days != null && (!(Number(b.lop_days) >= 0) || Number(b.lop_days) > days)) { await this.err(route, 400, `lop_days: Loss of pay is 0 to ${days} days, in steps of half a day.`, 'VALIDATION'); return; }
    if (!row) {
      row = { id: crypto.randomUUID(), employee_id: employeeId, month, days_in_month: days, present_days: days, paid_leave_days: 0, weekly_offs: 0, holidays: 0, lop_days: 0, overtime_hours: 0, locked: false };
      this.attendance.push(row);
    }
    Object.assign(row, b);
    await this.ok(route, row);
  }

  private async runRoute(route: Route, method: string, run: Row, action: string | undefined, body: Row | undefined): Promise<void> {
    const status = String(run.status);
    const audit = run.audit as Row[];
    const at = '2026-11-10T10:00:00Z';
    if (!action && method === 'GET') { await this.ok(route, this.wireRun(run, true)); return; }
    if (method === 'GET' && action === 'checks') {
      await this.ok(route, { checks: preRunChecks(this.engineDb(false), String(run.month), String(run.entity_id)) });
      return;
    }
    if (method === 'GET' && action === 'ecr') {
      const ecr = buildEcr(this.engineDb(true), { month: run.month, payslips: run.payslips } as unknown as PayRun);
      await this.ok(route, ecr);
      return;
    }
    if (method === 'GET' && action === 'bank-file') {
      if (status !== 'frozen' && status !== 'paid') { await this.err(route, 409, 'The bank file is built from a frozen run. Freeze the run first.', 'RUN_NOT_FROZEN'); return; }
      const file = buildBankFile(this.engineDb(true), { month: run.month, payslips: run.payslips } as unknown as PayRun);
      const db = this.engineDb(true);
      this.accessLog.push({ at, field: 'bank_file', reason: `Bank file for Acme Retail Pvt Ltd ${String(run.month)}` });
      await this.ok(route, {
        header: file.header, rows: file.rows,
        skipped: file.skipped.map((s) => { const e = db.employees.find((x) => x.id === s.employeeId); return { employee_id: s.employeeId, code: e?.code, name: e ? `${e.firstName} ${e.lastName}` : undefined, reason: s.reason }; }),
      });
      return;
    }
    if (method !== 'POST') { await this.err(route, 405, 'Method not allowed', 'VALIDATION'); return; }

    if (action === 'compute') {
      if (status === 'frozen' || status === 'paid') { await this.err(route, 409, `This run is ${status}. Unfreeze it before computing again.`, 'RUN_FROZEN'); return; }
      this.doCompute(run);
      await this.ok(route, this.wireRun(run, true));
      return;
    }
    if (action === 'freeze') {
      if (status !== 'computed') { await this.err(route, 409, 'Only a computed run can be frozen.', 'RUN_NOT_COMPUTED'); return; }
      if (this.fingerprint(run) !== run.input_fingerprint) { await this.err(route, 409, 'Inputs changed after the last compute. Compute again before freezing, so the payslips match the inputs.', 'RUN_STALE'); return; }
      const ids = (run.payslips as Row[]).map((s) => String(s.employeeId));
      const locked: string[] = [];
      for (const a of this.attendance) if (a.month === run.month && ids.includes(String(a.employee_id)) && !a.locked) { a.locked = true; locked.push(String(a.employee_id)); }
      const rec: Record<string, number> = {};
      for (const s of run.payslips as Row[]) {
        for (const l of this.loans.filter((x) => x.employee_id === s.employeeId && String(x.start_month) <= String(run.month) && Number(x.recovered) < Number(x.principal))) {
          const emi = Math.min(Number(l.emi), Number(l.principal) - Number(l.recovered));
          if (emi <= 0) continue;
          l.recovered = Number(l.recovered) + emi;
          rec[String(l.id)] = (rec[String(l.id)] ?? 0) + emi;
        }
      }
      run.status = 'frozen'; run.frozen_at = at; run.frozen_by = 'Master Admin'; run.loan_recoveries = rec; run.attendance_locked_for = locked;
      audit.push({ at, by: 'Master Admin', action: 'Frozen. Payslips are locked.' });
      await this.ok(route, this.wireRun(run, true));
      return;
    }
    if (action === 'unfreeze') {
      const reason = String(body?.reason ?? '').trim();
      if (reason.length < 5) { await this.err(route, 400, 'Give a reason of at least a few words. It goes into the audit trail.', 'UNFREEZE_REASON'); return; }
      if (status !== 'frozen') { await this.err(route, 409, 'Only a frozen run can be unfrozen. A paid run is closed.', 'RUN_NOT_FROZEN'); return; }
      for (const [loanId, amt] of Object.entries(run.loan_recoveries as Record<string, number>)) { const l = this.loans.find((x) => x.id === loanId); if (l) l.recovered = Math.max(0, Number(l.recovered) - amt); }
      for (const empId of run.attendance_locked_for as string[]) { const a = this.attendance.find((x) => x.employee_id === empId && x.month === run.month); if (a) a.locked = false; }
      run.status = 'computed'; run.frozen_at = null; run.frozen_by = null; run.loan_recoveries = {}; run.attendance_locked_for = [];
      audit.push({ at, by: 'Master Admin', action: `Unfrozen: ${reason}` });
      await this.ok(route, this.wireRun(run, true));
      return;
    }
    if (action === 'mark-paid') {
      if (status !== 'frozen') { await this.err(route, 409, 'Only a frozen run can be marked as paid.', 'RUN_NOT_FROZEN'); return; }
      run.status = 'paid'; run.paid_at = at;
      audit.push({ at, by: 'Master Admin', action: 'Marked paid' });
      await this.ok(route, this.wireRun(run, true));
      return;
    }
    await this.err(route, 404, `Unhandled ${method} ${action}`, 'NOT_FOUND');
  }
}

// ───────────────────────────── helpers ─────────────────────────────
async function open(page: Page, fake: FakePayroll, path = PAYROLL, source: 'live' | 'sample' | null = 'live', stored?: Record<string, string>): Promise<void> {
  await seedSession(page, MASTER_USER);
  if (source) {
    await page.addInitScript(([k, v]) => { try { if (window.localStorage.getItem(k!) === null) window.localStorage.setItem(k!, v!); } catch { /* blocked */ } }, [SOURCE_KEY, source]);
  }
  if (stored) {
    await page.addInitScript((entries) => { try { for (const [k, v] of Object.entries(entries)) if (window.localStorage.getItem(k) === null) window.localStorage.setItem(k, v); } catch { /* blocked */ } }, stored);
  }
  await mockApi(page, { me: { success: true, data: MASTER_USER }, onRequest: (route, url, method) => fake.handle(route, url, method) });
  await page.goto(path);
  await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
}

const banner = (page: Page) => page.getByTestId('hrms-preview-banner');
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const toasts = (page: Page) => page.locator('[data-sonner-toast]');
const step = (page: Page, s: string) => page.locator(`[data-step="${s}"]`).click();
const slow = { timeout: 60_000 };

async function waitLoaded(page: Page) {
  await banner(page).waitFor({ timeout: 45_000 });
  await expect(page.getByTestId('hrms-live-loading')).toHaveCount(0, { timeout: 30_000 });
}

/** Console and page errors that are not the deliberate failures a test provokes. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return errors;
}

/** Start the November run from the Payroll page and accept the one blocker (Meera has no bank account). Leaves the page on Compute. */
async function startAndContinue(page: Page) {
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.waitForURL(/\/payroll\/runs\//, { timeout: 90_000 });
  await expect(page.getByRole('heading', { name: /Pay run, November 2026/ })).toBeVisible(slow);
  await step(page, 'checks');
  await expect(page.getByTestId('checks-blocker')).toContainText('No bank account', slow);
  await page.getByRole('checkbox', { name: /I understand/ }).check();
  await page.getByRole('button', { name: 'Continue to compute' }).click();
}
async function computeNow(page: Page) {
  await page.getByRole('button', { name: 'Compute payslips' }).click();
  await expect(page.getByTestId('payslip-table')).toBeVisible(slow);
}
async function freezeNow(page: Page) {
  await step(page, 'freeze');
  await page.getByRole('button', { name: 'Freeze run' }).click();
  await dialog(page, 'Freeze this run?').getByRole('button', { name: 'Freeze run' }).click();
  await expect(page.getByTestId('step-pay')).toBeVisible(slow);
}

const clone = <T,>(v: T): T => structuredClone(v);
const sampleDb = makeSeed();

// ═════════════════════════════ pure logic: no browser ═════════════════════════════
test.describe('live payroll: wire mapping and diff-sync (no browser)', () => {
  const payslipWire = {
    id: 'p0000000-0000-4000-8000-000000000001', runId: 'r0000000-0000-4000-8000-000000000001', employeeId: ASHA, month: MONTH, daysInMonth: 30, paidDays: 28, lopDays: 2, overtimeHours: 0,
    earnings: [{ code: 'BASIC', name: 'Basic', amount: 23333, taxable: true }], deductions: [{ code: 'PF', name: 'Provident Fund (employee)', amount: 1800 }], employer: [], reimbursements: [],
    gross: 46666, totalDeductions: 1800, net: '44866', employerCost: 50000, wages: { codeWages: 25000, pfWage: 15000, esiWage: 0, ptBase: 46666, taxableMonthly: 46000 }, warnings: ['x'],
  };

  test('a run maps to the dashboard shape: names for ids, nulls become nothing, the stale flag and the freeze records come across', () => {
    const run = runFromWire({
      id: 'r1', entity_id: ENT, month: MONTH, type: 'regular', status: 'frozen', law_version: null, created_at: '2026-11-01T00:00:00Z', computed_at: '2026-11-02T00:00:00Z', frozen_at: '2026-11-03T00:00:00Z',
      frozen_by: 'Master Admin', paid_at: null, loan_recoveries: { [LOAN]: 2000, x: 'bad' }, attendance_locked_for: [ASHA], audit: [{ at: 'a', by: 'b', action: 'Created' }], stale: true, payslips: [payslipWire],
    });
    expect(run).toMatchObject({
      id: 'r1', entityId: ENT, month: MONTH, type: 'regular', status: 'frozen', lawVersion: '', frozenBy: 'Master Admin', paidAt: undefined, stale: true,
      loanRecoveries: { [LOAN]: 2000 }, attendanceLockedFor: [ASHA], audit: [{ at: 'a', by: 'b', action: 'Created' }],
    });
    const slip = run.payslips[0]!;
    expect(slip).toMatchObject({ id: payslipWire.id, runId: payslipWire.runId, employeeId: ASHA, paidDays: 28, lopDays: 2, gross: 46666, net: 44866, warnings: ['x'] });
    expect(slip.earnings[0]).toEqual({ code: 'BASIC', name: 'Basic', amount: 23333, taxable: true });
    expect(slip.deductions[0]).toEqual({ code: 'PF', name: 'Provident Fund (employee)', amount: 1800 });   // no `taxable` key when the server sent none
    expect(runFromWire({ id: 'r2', entity_id: ENT, month: MONTH, status: 'draft' })).toMatchObject({ stale: false, payslips: [], audit: [], loanRecoveries: undefined, attendanceLockedFor: undefined, type: 'regular' });
    expect(payslipFromWire({ ...payslipWire, employeeId: undefined, employee_id: DEV, run_id: 'r9', runId: undefined })).toMatchObject({ employeeId: DEV, runId: 'r9' });
    expect(runFlagFromWire({ id: 'r1', status: 'computed', stale: true })).toEqual({ id: 'r1', status: 'computed', stale: true });
  });

  test('the payroll bootstrap maps every collection, with numeric strings read as numbers', () => {
    const data = payrollFromWire({
      structures: [{ id: STR, name: 'Office', description: null, effective_from: '2026-04-01', components: [{ id: 'c1', code: 'BASIC', name: 'Basic', kind: 'earning', calc: { type: 'pct_ctc', value: '50' }, isWage: true, taxable: true, pfApplicable: true, esiApplicable: true, prorate: true, showInPayslip: true }] }],
      attendance: [{ id: 'a1', employee_id: ASHA, month: MONTH, days_in_month: 30, present_days: 28, paid_leave_days: 0, weekly_offs: 4, holidays: 1, lop_days: '2', overtime_hours: '1.5', locked: false }],
      adjustments: [{ id: ADJ, employee_id: DEV, month: MONTH, kind: 'bonus', amount: '5000.00', taxable: true, note: null, source: 'incentive_push', created_by: null }],
      loans: [{ id: LOAN, employee_id: ASHA, kind: 'advance', principal: '12000', emi: 2000, start_month: '2026-10', recovered: '4000', note: null }],
      runs: [], fnf_cases: [{ id: 'f1', employee_id: DEV, last_working_date: '2026-11-30', resignation_date: null, notice_days_served: 30, leave_encash_days: 0, other_recoveries: 0, other_payments: '250', status: 'approved', due_by: '2026-12-02' }],
      settings: { payroll: { overtime_rule: { id: 'ot', name: 'Std', rateMultiplier: 2, quarterlyCapHours: 144, requiresConsent: true, minMinutes: 30, rateDivisor: 26, womenNightConsent: true, appliesTo: ['permanent'] } } },
    });
    expect(data.structures[0]).toMatchObject({ id: STR, name: 'Office', description: undefined, effectiveFrom: '2026-04-01' });
    expect(data.structures[0]!.components[0]).toMatchObject({ code: 'BASIC', calc: { type: 'pct_ctc', value: 50 }, isWage: true });
    expect(data.attendance[0]).toEqual({ employeeId: ASHA, month: MONTH, daysInMonth: 30, presentDays: 28, paidLeaveDays: 0, weeklyOffs: 4, holidays: 1, lopDays: 2, overtimeHours: 1.5, locked: false });
    expect(data.adjustments[0]).toEqual({ id: ADJ, employeeId: DEV, month: MONTH, kind: 'bonus', amount: 5000, taxable: true, note: undefined });
    expect(data.loans[0]).toMatchObject({ kind: 'advance', principal: 12000, recovered: 4000 });
    expect(data.fnfCases[0]).toMatchObject({ employeeId: DEV, status: 'approved', otherPayments: 250, dueBy: '2026-12-02' });
    expect(data.overtimeRule).toMatchObject({ id: 'ot', rateMultiplier: 2, rateDivisor: 26, appliesTo: ['permanent'] });
    expect(payrollFromWire({}).payRuns).toEqual([]);
  });

  test('bodies are snake_case, hold only what changed, carry the client id, and never carry what only the server may set', () => {
    const s: SalaryStructure = { id: STR, name: 'Office', description: '', effectiveFrom: '2026-04-01', components: [{ id: 'c1', code: 'BASIC', name: 'Basic', kind: 'earning', calc: { type: 'pct_ctc', value: 50 }, isWage: true, taxable: true, pfApplicable: true, esiApplicable: true, prorate: true, showInPayslip: true }] };
    const create = structureCreateBody(s);
    expect(create).toMatchObject({ id: STR, name: 'Office', effective_from: '2026-04-01' });
    expect(create).not.toHaveProperty('description');                                  // blank means nothing
    expect(Object.keys(create).some((k) => /[A-Z]/.test(k))).toBe(false);
    expect(structurePatch(s, clone(s))).toEqual({ body: {}, keys: [] });
    const renamed = { ...clone(s), name: 'Office staff', description: 'Standard' };
    expect(structurePatch(s, renamed).body).toEqual({ name: 'Office staff', description: 'Standard' });

    const a: AttendanceSummary = { employeeId: ASHA, month: MONTH, daysInMonth: 30, presentDays: 30, paidLeaveDays: 0, weeklyOffs: 0, holidays: 0, lopDays: 0, overtimeHours: 0, locked: false };
    expect(attendanceBody(a).body).toEqual({ days_in_month: 30, present_days: 30, paid_leave_days: 0, weekly_offs: 0, holidays: 0, lop_days: 0, overtime_hours: 0, locked: false });
    expect(attendanceBody({ ...a, lopDays: 2 }, a)).toEqual({ body: { lop_days: 2 }, keys: ['lopDays'] });
    expect(attendanceBody({ ...a, lopDays: 0 }, a).keys).toEqual([]);

    const adj: Adjustment = { id: ADJ, employeeId: DEV, month: MONTH, kind: 'bonus', amount: 5000, taxable: true };
    expect(adjustmentCreateBody(adj)).toEqual({ id: ADJ, employee_id: DEV, month: MONTH, kind: 'bonus', amount: 5000, taxable: true });
    expect(adjustmentPatch(adj, { ...adj, amount: 6000, note: 'Diwali' }).body).toEqual({ amount: 6000, note: 'Diwali' });
    expect(adjustmentPatch({ ...adj, note: 'x' }, adj).body).toEqual({ note: null });   // a cleared note is explicit

    const loan: Loan = { id: LOAN, employeeId: ASHA, kind: 'loan', principal: 12000, emi: 2000, startMonth: '2026-10', recovered: 4000 };
    const loanBody = loanCreateBody(loan);
    expect(loanBody).toEqual({ id: LOAN, employee_id: ASHA, kind: 'loan', principal: 12000, emi: 2000, start_month: '2026-10' });
    expect(loanBody).not.toHaveProperty('recovered');

    const c: FnfCase = { id: 'f1', employeeId: DEV, lastWorkingDate: '2026-11-30', noticeDaysServed: 30, leaveEncashDays: 0, otherRecoveries: 0, otherPayments: 0, status: 'draft', dueBy: '2026-12-02' };
    const fnfBody = fnfCreateBody(c);
    expect(fnfBody).toEqual({ id: 'f1', employee_id: DEV, last_working_date: '2026-11-30', notice_days_served: 30, leave_encash_days: 0, other_recoveries: 0, other_payments: 0, due_by: '2026-12-02' });
    expect(fnfBody).not.toHaveProperty('status');
    expect(fnfPatch(c, { ...c, status: 'approved', noticeDaysServed: 20 }).body).toEqual({ notice_days_served: 20 });   // a status change is a command, never a field
    expect(settingsBody(sampleDb.overtimeRules[0]!)).toEqual({ overtime_rule: sampleDb.overtimeRules[0] });
  });

  test('the diff sends payroll rows in an order the server accepts, never diffs pay runs, and leaves a missing attendance row alone', () => {
    const people = { entities: [], locations: [], departments: [], designations: [], employees: [] };
    const emp = employeeFromWire({
      id: ASHA, code: 'EMP-0001', first_name: 'Asha', last_name: 'Rao', email: 'a@example.com', mobile: '9876500001', gender: 'female', dob: '1995-05-05', entity_id: ENT, location_id: LOC, department_id: DEP,
      designation_id: DES, employment_type: 'permanent', status: 'active', join_date: '2026-04-01', probation_months: 6, notice_days: 30, structure_id: STR, annual_ctc: 600000,
    });
    const structure: SalaryStructure = { id: STR, name: 'Office', effectiveFrom: '2026-04-01', components: [] };
    const att: AttendanceSummary = { employeeId: ASHA, month: MONTH, daysInMonth: 30, presentDays: 30, paidLeaveDays: 0, weeklyOffs: 0, holidays: 0, lopDays: 0, overtimeHours: 0, locked: false };
    const adj: Adjustment = { id: ADJ, employeeId: ASHA, month: MONTH, kind: 'bonus', amount: 100, taxable: true };
    const loan: Loan = { id: LOAN, employeeId: ASHA, kind: 'loan', principal: 1000, emi: 100, startMonth: MONTH, recovered: 0 };
    const kase: FnfCase = { id: 'f1', employeeId: ASHA, lastWorkingDate: '2026-11-30', noticeDaysServed: 30, leaveEncashDays: 0, otherRecoveries: 0, otherPayments: 0, status: 'draft', dueBy: '2026-12-02' };
    const empty = { ...people, structures: [], attendance: [], adjustments: [], loans: [], fnfCases: [], payRuns: [], overtimeRules: [] };
    const full = { ...people, employees: [emp], structures: [structure], attendance: [att], adjustments: [adj], loans: [loan], fnfCases: [kase], payRuns: [], overtimeRules: [] };
    const kinds = (ops: ReturnType<typeof diffServer>) => ops.map((o) => `${o.verb}:${o.kind}`);

    const adds = kinds(diffServer(empty as never, full as never));
    expect(adds.indexOf('create:structure')).toBeLessThan(adds.indexOf('create:employee'));        // people point at structures
    for (const k of ['create:attendance', 'create:adjustment', 'create:loan', 'create:fnf']) expect(adds.indexOf(k)).toBeGreaterThan(adds.indexOf('create:employee'));
    const removes = kinds(diffServer(full as never, empty as never));
    expect(removes.indexOf('delete:structure')).toBeGreaterThan(removes.indexOf('delete:employee'));   // a structure goes after the people on it
    expect(removes.indexOf('delete:fnf')).toBeLessThan(removes.indexOf('delete:employee'));
    expect(removes).not.toContain('delete:attendance');

    const att2 = diffServer(full as never, { ...full, attendance: [{ ...att, lopDays: 2 }] } as never);
    expect(att2).toHaveLength(1);
    expect(att2[0]).toMatchObject({ kind: 'attendance', verb: 'update', employeeId: ASHA, month: MONTH, rowId: `${ASHA}:${MONTH}`, body: { lop_days: 2 } });
    expect(att2[0]!.label).toBe('attendance of Asha Rao for Nov 2026');

    const run: PayRun = { id: 'r1', month: MONTH, entityId: ENT, type: 'regular', status: 'draft', lawVersion: '', createdAt: '', payslips: [], audit: [] };
    expect(diffServer(full as never, { ...full, payRuns: [run] } as never)).toEqual([]);                  // a run changes only by its commands
    expect(diffServer(full as never, { ...full, loans: [{ ...loan, recovered: 100 }] } as never)).toEqual([]);   // recovered is the server's
    // collections missing from an older caller count as empty
    expect(kinds(diffServer(people as never, people as never))).toEqual([]);

    const rule = sampleDb.overtimeRules[0]!;
    const ot = diffServer({ ...full, overtimeRules: [rule] } as never, { ...full, overtimeRules: [{ ...rule, rateMultiplier: 2.5 }] } as never);
    expect(ot).toHaveLength(1);
    expect(ot[0]).toMatchObject({ kind: 'settings', verb: 'update' });
    expect((ot[0]!.body!.overtime_rule as { rateMultiplier: number }).rateMultiplier).toBe(2.5);
  });

  test('the bank file, ECR and checks from the server are read leniently: a header line, employee_id or employeeId, no row count', () => {
    const f = bankFileFromWire({ header: 'Employee code,Name,Account number,IFSC,Bank,Amount,Narration', rows: [['EMP-0001', 'Asha Rao', ASHA_ACCOUNT, 'HDFC0001234', 'HDFC Bank', '40000', 'Salary 2026-11']], skipped: [{ employee_id: MEERA, code: 'EMP-0003', name: 'Meera Das', reason: 'No bank account' }, { employeeId: DEV, reason: 'Paid by cash' }] });
    expect(f.header).toHaveLength(7);
    expect(f.rows[0]![2]).toBe(ASHA_ACCOUNT);
    expect(f.skipped).toEqual([{ employeeId: MEERA, code: 'EMP-0003', name: 'Meera Das', reason: 'No bank account' }, { employeeId: DEV, code: undefined, name: undefined, reason: 'Paid by cash' }]);
    expect(bankFileFromWire({ header: ['A'], rows: [[1, null]] }).rows).toEqual([['1', '']]);
    expect(ecrFromWire({ text: 'a\nb\n', blocked: [{ employee_id: DEV, reason: 'No UAN' }] })).toEqual({ text: 'a\nb\n', rows: 2, blocked: [{ employeeId: DEV, reason: 'No UAN' }] });
    const checks = checksFromWire({ checks: [{ severity: 'blocker', title: 'No bank account', detail: 'x', employeeId: MEERA, fixHref: '/h' }, { severity: 'weird', title: 'T', detail: 'd' }] });
    expect(checks[0]).toEqual({ id: `No bank account:${MEERA}`, severity: 'blocker', title: 'No bank account', detail: 'x', employeeId: MEERA, fixHref: '/h' });
    expect(checks[1]).toMatchObject({ id: 'T:all', severity: 'info' });
  });

  test('a computed run is stale when the server says so, and only then; a sample run still works it out in the browser', () => {
    const db = makeSeed();
    const live: PayRun = { id: 'x', month: MONTH, entityId: 'ent_retail', type: 'regular', status: 'computed', lawVersion: 'v', createdAt: '', payslips: [], audit: [], stale: false };
    expect(runIsStale(db, live)).toBe(false);                       // payslips are empty, the engine would disagree: the server's answer wins
    expect(runIsStale(db, { ...live, stale: true })).toBe(true);
    expect(runIsStale(db, { ...live, status: 'frozen', stale: true })).toBe(false);
    const { stale: _s, ...sampleRun } = live; void _s;
    expect(runIsStale(db, sampleRun)).toBe(true);                   // no flag: worked out from the data (empty payslips differ from a fresh compute)
  });

  test('blockers agreed to on live data are remembered in memory and count even though the server run has no such audit line', () => {
    const run: PayRun = { id: 'run-ack', month: MONTH, entityId: ENT, type: 'regular', status: 'draft', lawVersion: '', createdAt: '', payslips: [], audit: [{ at: 'a', by: 'b', action: 'Created' }] };
    clearAcks();
    expect(acknowledgedBlockers(run)).toBe(0);
    setAcks('run-ack', 2);
    expect(acknowledgedBlockers(run)).toBe(2);
    expect(acknowledgedBlockers({ ...run, audit: [...run.audit, { at: 'c', by: 'd', action: 'Continued past 3 blockers: x' }] })).toBe(3);   // the larger wins
    clearAcks();
  });

  test('the bank preview lists masked accounts as masks with the same skip rules, and never turns a mask into digits', () => {
    const db = makeSeed();
    const run = db.payRuns[0]!;
    const withBank = run.payslips.map((s) => db.employees.find((e) => e.id === s.employeeId)!).filter((e) => e.payMode === 'bank' && e.bank && run.payslips.find((s) => s.employeeId === e.id)!.net > 0);
    const real = buildBankFile(db, run);
    expect(previewBankFile(db, run)).toEqual(real);                 // nothing masked: the engine's own answer
    for (const e of withBank) e.bank!.accountNumber = '••••••' + e.bank!.accountNumber.slice(-4);
    const strict = buildBankFile(db, run);
    expect(strict.rows).toHaveLength(0);                            // the engine refuses masked numbers
    const preview = previewBankFile(db, run);
    expect(preview.rows).toHaveLength(real.rows.length);
    expect(preview.skipped).toEqual(real.skipped);                  // the same people are left out, for the same reasons
    expect(preview.rows.every((r) => /^•+\d{4}$/.test(r[2]!))).toBe(true);
    expect(preview.rows.map((r) => r[0])).toEqual(real.rows.map((r) => r[0]));
  });
});

// ═════════════════════════════ sample mode is untouched ═════════════════════════════
test.describe('sample payroll is unchanged', () => {
  test('the payroll pages make no HRMS call, keep the sample wording, and compute in the browser', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/hrms')) hits.push(`${r.method()} ${r.url()}`); });
    await seedSession(page, MASTER_USER);
    await mockApi(page, { me: { success: true, data: MASTER_USER } });
    await page.goto(PAYROLL);
    await banner(page).waitFor({ timeout: 45_000 });
    await expect(banner(page)).toHaveAttribute('data-source', 'sample');
    await expect(page.getByText('Preview on sample data.')).toBeVisible(slow);
    await expect(page.getByTestId('hrms-local-note')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start run' }).click();
    await page.waitForURL(/\/payroll\/runs\//, { timeout: 90_000 });
    await step(page, 'checks');
    await page.getByRole('checkbox', { name: /I understand/ }).check();
    await page.getByRole('button', { name: 'Continue to compute' }).click();
    await page.getByRole('button', { name: 'Compute payslips' }).click();
    await expect(page.getByTestId('payslip-table')).toBeVisible(slow);
    await page.goto(`${PAYROLL}?tab=structures`);
    await expect(page.getByTestId('structures-empty')).toHaveCount(0);       // sample has structures; the empty offer is for a new organisation
    expect(hits).toEqual([]);
  });
});

// ═════════════════════════════ bootstrap ═════════════════════════════
test.describe('live payroll: bootstrap', () => {
  test('the payroll pages are filled from /payroll/bootstrap, with no "saved in this browser" note and the new banner', async ({ page }) => {
    const fake = new FakePayroll().full();
    const errors = watchErrors(page);
    await open(page, fake, PAYROLL);
    await waitLoaded(page);
    await expect(page.getByTestId('hrms-banner-text')).toContainText('People, organisation and payroll are saved on the server');
    await expect(page.getByTestId('hrms-local-note')).toHaveCount(0);
    expect(fake.callsTo('GET', /^\/payroll\/bootstrap$/)).toHaveLength(1);
    expect(fake.callsTo('GET', /^\/payroll\/bootstrap$/)[0]!.query).toBe('?months=12');
    // the hub: no sample runs, the loan outstanding from the server (12,000 - 4,000 recovered)
    await expect(page.getByText('Every run is paid')).toBeVisible(slow);
    await expect(page.getByText('₹8,000', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('No pay run yet.')).toBeVisible();
    await page.goto(`${PAYROLL}?tab=structures`);
    await expect(page.getByRole('link', { name: 'Office staff' }).first()).toBeVisible(slow);
    await expect(page.getByTestId('structures-empty')).toHaveCount(0);
    await page.goto(`${PAYROLL}?tab=adjustments`);
    await expect(page.getByRole('row').filter({ hasText: 'Festival bonus' })).toContainText('₹5,000', slow);
    await page.goto(`${PAYROLL}?tab=loans`);
    const loanRow = page.getByRole('row').filter({ hasText: 'Asha Rao' });
    await expect(loanRow).toContainText('₹12,000', slow);
    await expect(loanRow).toContainText('₹8,000');
    expect(errors).toEqual([]);
  });

  test('a run the server already holds is listed with its totals, and its payslips are the server\'s', async ({ page }) => {
    const fake = new FakePayroll().full();
    fake.fudge = 7;
    const run = fake.precompute();
    const slips = run.payslips as Array<{ employeeId: string; net: number; gross: number; id: string }>;
    await open(page, fake, PAYROLL);
    await waitLoaded(page);
    const row = page.getByRole('row').filter({ hasText: 'Computed' });
    await expect(row).toContainText('Nov 2026', slow);
    await expect(row).toContainText('IN-2026-11-test');
    await page.goto(`${PAYROLL}/runs/${run.id as string}?tab=compute`);
    await expect(page.getByTestId('payslip-table')).toBeVisible(slow);
    await expect(page.getByTestId('payslip-row')).toHaveCount(3);
    const asha = slips.find((s) => s.employeeId === ASHA)!;
    await expect(page.getByTestId('payslip-row').filter({ hasText: 'Asha Rao' })).toContainText(`₹${asha.net.toLocaleString('en-IN')}`);
    // the server's figure carries the fudge, so a payslip computed in the browser would show something else
    const local = computePayRunPayslips(fake['engineDb'](true), MONTH, ENT, 'x').find((s) => s.employeeId === ASHA)!;
    expect(asha.net).toBe(local.net + 7);
    await expect(page.getByTestId('payslip-row').filter({ hasText: 'Asha Rao' })).not.toContainText(`₹${local.net.toLocaleString('en-IN')}`);
    await expect(page.getByText('Payslips match the current inputs.')).toBeVisible();
  });
});

test.describe('live payroll: a link to a run the bootstrap did not bring', () => {
  test('the run is fetched on its own (GET /runs/:id) and opens with its payslips; an unknown id says so', async ({ page }) => {
    const fake = new FakePayroll().full();
    const run = fake.precompute();
    fake.omitRunsFromBootstrap = true;
    await open(page, fake, `${PAYROLL}/runs/${run.id as string}?tab=compute`);
    await expect(page.getByTestId('payslip-table')).toBeVisible(slow);
    await expect(page.getByTestId('payslip-row')).toHaveCount(3);
    expect(fake.callsTo('GET', /^\/payroll\/runs\/[^/]+$/)).toHaveLength(1);
    await page.goto(`${PAYROLL}/runs/cccccccc-cccc-4ccc-8ccc-cccccccccccc`);
    await expect(page.getByRole('heading', { name: 'Pay run not found' })).toBeVisible(slow);
    await expect(page.getByText('not one of this organisation')).toBeVisible();
  });
});

// ═════════════════════════════ salary structures ═════════════════════════════
test.describe('live payroll: salary structures', () => {
  test('a new organisation has none: "Add the standard structures" creates the three templates on the server with fresh ids', async ({ page }) => {
    const fake = new FakePayroll().seedOrg().seedPeople();
    for (const e of fake.employees) e.structure_id = null;
    await open(page, fake, `${PAYROLL}?tab=structures`);
    const empty = page.getByTestId('structures-empty');
    await expect(empty).toContainText('No salary structures yet', slow);
    await empty.getByTestId('add-standard-structures').click();
    await expect.poll(() => fake.structures.length, { timeout: 30_000 }).toBe(3);
    expect(fake.structures.map((s) => s.name).sort()).toEqual(['Field sales', 'Office staff', 'Warehouse & contract']);
    const posts = fake.callsTo('POST', /^\/payroll\/structures$/);
    expect(posts).toHaveLength(3);
    const ids = new Set<string>();
    for (const c of posts) {
      const b = c.body!;
      expect(b.id).toMatch(UUID);
      ids.add(String(b.id));
      expect(b).toMatchObject({ effective_from: '2026-04-01' });
      expect(Object.keys(b).some((k) => /[A-Z]/.test(k))).toBe(false);
      const comps = b.components as Array<{ id: string; code: string }>;
      expect(comps.map((c2) => c2.code)).toContain('BASIC');
      for (const c2 of comps) expect(c2.id).toMatch(UUID);        // component ids are fresh as well
    }
    expect(ids.size).toBe(3);
    expect(['str_std', 'str_field', 'str_wh'].some((id) => ids.has(id))).toBe(false);   // not the sample ids
    await expect(page.getByRole('link', { name: 'Office staff' }).first()).toBeVisible(slow);
    await expect(page.getByTestId('structures-empty')).toHaveCount(0);
    await expect(toasts(page).filter({ hasText: 'Standard structures added' })).toBeVisible();
  });

  test('a refused create undoes the structure and shows the server\'s reason; the offer stays', async ({ page }) => {
    const fake = new FakePayroll().seedOrg().seedPeople();
    fake.failures.push({ when: (c) => c.method === 'POST' && c.path === '/payroll/structures', status: 400, error: 'components: A component code is repeated', code: 'VALIDATION' });
    await open(page, fake, `${PAYROLL}?tab=structures`);
    await page.getByTestId('add-standard-structures').click();
    await expect(toasts(page).filter({ hasText: 'components: A component code is repeated' }).first()).toBeVisible({ timeout: 30_000 });
    await expect(toasts(page).filter({ hasText: 'Standard structures added' })).toHaveCount(0);   // no success message for what was undone
  });

  test('assigning a structure to an employee sends the server structure id; the employee list and salary tab show it', async ({ page }) => {
    const fake = new FakePayroll().seedOrg().seedStructure().seedPeople();
    fake.employee(ASHA).structure_id = null;
    await open(page, fake, `/dashboard/hrms/employees/${ASHA}?tab=salary`);
    await expect(page.locator('#sal-structure')).toBeVisible(slow);
    await expect(page.locator('#sal-structure option')).toHaveCount(2);          // "No structure" + the server's one
    await page.locator('#sal-structure').selectOption(STR);
    await page.getByRole('button', { name: 'Save salary' }).click();
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/employees/${ASHA}$`)).length, { timeout: 20_000 }).toBe(1);
    expect(fake.callsTo('PUT', new RegExp(`^/employees/${ASHA}$`))[0]!.body).toMatchObject({ structure_id: STR });
    expect(fake.employee(ASHA).structure_id).toBe(STR);
  });

  test('creating a structure by hand and deleting it round-trips; deleting one that people are on shows the server\'s reason', async ({ page }) => {
    const fake = new FakePayroll().seedOrg().seedStructure().seedPeople();
    await open(page, fake, `${PAYROLL}?tab=structures`);
    await page.getByRole('button', { name: 'New structure' }).click();
    const dlg = dialog(page, 'New salary structure');
    await dlg.getByLabel(/Structure name/).fill('Sales managers');
    await dlg.getByRole('button', { name: 'Create structure' }).click();
    await page.waitForURL(/\/payroll\/structures\//, { timeout: 60_000 });
    const created = fake.callsTo('POST', /^\/payroll\/structures$/);
    expect(created).toHaveLength(1);
    expect(created[0]!.body!.id).toMatch(UUID);
    expect(created[0]!.body).toMatchObject({ name: 'Sales managers' });
    await expect.poll(() => fake.structures.length, { timeout: 20_000 }).toBe(2);
    await page.goto(`${PAYROLL}?tab=structures`);
    await page.getByRole('button', { name: 'Delete Sales managers' }).click();
    await dialog(page, 'Delete structure').getByRole('button', { name: 'Delete structure' }).click();
    await expect.poll(() => fake.structures.length, { timeout: 20_000 }).toBe(1);
    // Office staff has three people on it; the page disables the button, but another admin's change is only known to the server
    fake.structures.push({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Spare', description: null, effective_from: '2026-04-01', components: fake.structures[0]!.components });
    fake.employee(MEERA).structure_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await page.getByTestId('hrms-refresh').click();
    await expect(page.getByRole('button', { name: 'Delete Spare' })).toBeDisabled({ timeout: 20_000 });
  });
});

// ═════════════════════════════ attendance, adjustments, loans ═════════════════════════════
test.describe('live payroll: simple records sync and roll back', () => {
  async function startRunAndOpenInputs(page: Page, fake: FakePayroll) {
    await open(page, fake, PAYROLL);
    await page.getByRole('button', { name: 'Start run' }).click();
    await page.waitForURL(/\/payroll\/runs\//, { timeout: 90_000 });
    await expect(page.getByTestId('step-inputs')).toBeVisible(slow);
  }

  test('loss of pay and overtime are saved with PUT /attendance/:employee/:month and only the changed field', async ({ page }) => {
    const fake = new FakePayroll().full();
    await startRunAndOpenInputs(page, fake);
    const lop = page.getByLabel('Loss of pay days for Asha Rao');
    await lop.fill('3');
    await lop.press('Enter');
    await expect.poll(() => fake.callsTo('PUT', /^\/payroll\/attendance\//).length, { timeout: 20_000 }).toBe(1);
    const put = fake.callsTo('PUT', /^\/payroll\/attendance\//)[0]!;
    expect(put.path).toBe(`/payroll/attendance/${ASHA}/${MONTH}`);
    expect(put.body).toMatchObject({ lop_days: 3, days_in_month: 30, present_days: 30 });    // the first edit creates the month's row
    await expect(page.getByLabel('Paid days for Asha Rao')).toHaveValue('27');
    const ot = page.getByLabel('Overtime hours for Asha Rao');
    await ot.fill('4');
    await ot.press('Enter');
    await expect.poll(() => fake.callsTo('PUT', /^\/payroll\/attendance\//).length, { timeout: 20_000 }).toBe(2);
    expect(fake.callsTo('PUT', /^\/payroll\/attendance\//)[1]!.body).toEqual({ overtime_hours: 4 });
    expect(fake.attendance.find((a) => a.employee_id === ASHA)).toMatchObject({ lop_days: 3, overtime_hours: 4 });
    // a local validation error never reaches the server
    await lop.fill('45');
    await lop.press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: '0 to 30 days' })).toBeVisible();
    expect(fake.callsTo('PUT', /^\/payroll\/attendance\//)).toHaveLength(2);
  });

  test('a refused attendance edit puts the old value back and shows the server\'s reason', async ({ page }) => {
    const fake = new FakePayroll().full();
    fake.attendance = [{ id: crypto.randomUUID(), employee_id: ASHA, month: MONTH, days_in_month: 30, present_days: 30, paid_leave_days: 0, weekly_offs: 0, holidays: 0, lop_days: 1, overtime_hours: 0, locked: false }];
    fake.failures.push({ when: (c) => c.method === 'PUT' && c.path.startsWith('/payroll/attendance/'), status: 409, error: "This month's attendance is locked. Unlock it in Attendance first.", code: 'MONTH_LOCKED' });
    await startRunAndOpenInputs(page, fake);
    const lop = page.getByLabel('Loss of pay days for Asha Rao');
    await expect(lop).toHaveValue('1');
    await lop.fill('5');
    await lop.press('Enter');
    await expect(toasts(page).filter({ hasText: "Could not save attendance of Asha Rao for Nov 2026: This month's attendance is locked. Unlock it in Attendance first." })).toBeVisible({ timeout: 20_000 });
    await expect(lop).toHaveValue('1');                                         // rolled back
    expect(fake.attendance[0]!.lop_days).toBe(1);
  });

  test('an adjustment is added, edited and deleted on the server; the success message waits, and a refusal rolls it back', async ({ page }) => {
    const fake = new FakePayroll().full();
    fake.adjustments = [];
    await startRunAndOpenInputs(page, fake);
    fake.delays.push({ when: (c) => c.method === 'POST' && c.path === '/payroll/adjustments', ms: 700 });
    await page.getByRole('button', { name: 'Add adjustment' }).click();
    const dlg = dialog(page, 'Add adjustment');
    await dlg.getByLabel('Employee').selectOption(ASHA);
    await dlg.getByLabel(/Amount/).fill('2500');
    await dlg.getByLabel('Note').fill('Spot award');
    await dlg.getByRole('button', { name: 'Add adjustment' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText: 'Spot award' })).toContainText('₹2,500');       // optimistic: visible at once
    await expect(toasts(page).filter({ hasText: 'Adjustment added' })).toHaveCount(0);                      // ... but not announced until the server has it
    await expect(toasts(page).filter({ hasText: 'Adjustment added' })).toBeVisible({ timeout: 20_000 });
    const post = fake.callsTo('POST', /^\/payroll\/adjustments$/)[0]!;
    expect(post.body!.id).toMatch(UUID);
    expect(post.body).toMatchObject({ employee_id: ASHA, month: MONTH, kind: 'bonus', amount: 2500, taxable: true, note: 'Spot award' });
    expect(fake.adjustments).toHaveLength(1);

    // edit: only the changed fields
    await page.getByRole('row').filter({ hasText: 'Spot award' }).getByRole('button', { name: 'Edit adjustment' }).click();
    const edit = dialog(page, 'Edit adjustment');
    await edit.getByLabel(/Amount/).fill('3000');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => fake.callsTo('PUT', /^\/payroll\/adjustments\//).length, { timeout: 20_000 }).toBe(1);
    expect(fake.callsTo('PUT', /^\/payroll\/adjustments\//)[0]!.body).toEqual({ amount: 3000 });

    // a refused delete puts the row back
    fake.failures.push({ when: (c) => c.method === 'DELETE' && c.path.startsWith('/payroll/adjustments/'), status: 409, error: 'The November 2026 run is frozen. This adjustment cannot be deleted.', code: 'MONTH_LOCKED' });
    await page.getByRole('row').filter({ hasText: 'Spot award' }).getByRole('button', { name: 'Delete adjustment' }).click();
    await dialog(page, 'Delete adjustment').getByRole('button', { name: 'Delete adjustment' }).click();
    await expect(toasts(page).filter({ hasText: 'Could not remove adjustment for Asha Rao: The November 2026 run is frozen. This adjustment cannot be deleted.' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('row').filter({ hasText: 'Spot award' })).toContainText('₹3,000');
    await expect(toasts(page).filter({ hasText: 'Adjustment deleted' })).toHaveCount(0);
    expect(fake.adjustments).toHaveLength(1);
    // and a real delete goes through
    await page.getByRole('row').filter({ hasText: 'Spot award' }).getByRole('button', { name: 'Delete adjustment' }).click();
    await dialog(page, 'Delete adjustment').getByRole('button', { name: 'Delete adjustment' }).click();
    await expect.poll(() => fake.adjustments.length, { timeout: 20_000 }).toBe(0);
    await expect(page.getByRole('row').filter({ hasText: 'Spot award' })).toHaveCount(0);
  });

  test('a loan is added with a UUID and no recovered amount; deleting one that was recovered from shows the server\'s reason', async ({ page }) => {
    const fake = new FakePayroll().full();
    await open(page, fake, `${PAYROLL}?tab=loans`);
    await page.getByRole('button', { name: /Add loan or advance|Add loan/ }).first().click();
    const dlg = dialog(page, 'Add loan or advance');
    await dlg.getByLabel('Employee').selectOption(DEV);
    await dlg.getByLabel(/Amount lent/).fill('6000');
    await dlg.getByLabel(/Monthly EMI/).fill('1500');
    await dlg.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(() => fake.loans.length, { timeout: 20_000 }).toBe(2);
    const post = fake.callsTo('POST', /^\/payroll\/loans$/)[0]!;
    expect(post.body!.id).toMatch(UUID);
    expect(post.body).toMatchObject({ employee_id: DEV, kind: 'advance', principal: 6000, emi: 1500, start_month: MONTH });
    expect(post.body).not.toHaveProperty('recovered');
    await expect(toasts(page).filter({ hasText: 'Advance added' })).toBeVisible({ timeout: 20_000 });

    // the page lets a loan with nothing recovered be deleted; the server has the last word, and a refusal puts the row back
    fake.failures.push({ when: (c) => c.method === 'DELETE' && c.path.startsWith('/payroll/loans/'), status: 409, error: 'This loan has an EMI in a frozen run, so it cannot be deleted.', code: 'VALIDATION' });
    await page.getByRole('button', { name: 'Delete loan of Dev Nair' }).click();
    await dialog(page, 'Delete loan').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(toasts(page).filter({ hasText: 'Could not remove advance for Dev Nair: This loan has an EMI in a frozen run, so it cannot be deleted.' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Delete loan of Dev Nair' })).toBeVisible();
    await expect(toasts(page).filter({ hasText: 'Loan deleted' })).toHaveCount(0);
    expect(fake.loans).toHaveLength(2);
    await page.getByRole('button', { name: 'Delete loan of Dev Nair' }).click();
    await dialog(page, 'Delete loan').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => fake.loans.length, { timeout: 20_000 }).toBe(1);
    await expect(page.getByRole('button', { name: 'Delete loan of Dev Nair' })).toHaveCount(0);
  });
});

// ═════════════════════════════ the run, end to end, on the server ═════════════════════════════
test.describe('live payroll: the run lifecycle', () => {
  test('start, checks, compute, review, freeze, pay: every command is a server call and every figure the server\'s', async ({ page }) => {
    const fake = new FakePayroll().full();
    fake.fudge = 7;
    const errors = watchErrors(page);
    await open(page, fake, PAYROLL);
    await waitLoaded(page);
    await startAndContinue(page);

    // the run was created on the server, once, with the entity and month
    const created = fake.callsTo('POST', /^\/payroll\/runs$/);
    expect(created).toHaveLength(1);
    expect(created[0]!.body).toEqual({ entity_id: ENT, month: MONTH, type: 'regular' });
    // the checks are the server's (and were asked for), and the blocker confirmation is kept
    expect(fake.callsTo('GET', /^\/payroll\/runs\/[^/]+\/checks$/).length).toBeGreaterThan(0);
    await expect(page.getByTestId('step-compute')).toBeVisible();

    await computeNow(page);
    expect(fake.callsTo('POST', /\/compute$/)).toHaveLength(1);
    const run = fake.run()!;
    expect(run.status).toBe('computed');
    const slips = run.payslips as Array<{ employeeId: string; net: number; id: string }>;
    expect(slips).toHaveLength(3);
    for (const s of slips) {
      const who = s.employeeId === ASHA ? 'Asha Rao' : s.employeeId === DEV ? 'Dev Nair' : 'Meera Das';
      await expect(page.getByTestId('payslip-row').filter({ hasText: who })).toContainText(`₹${s.net.toLocaleString('en-IN')}`);
    }
    await expect(page.getByText('Payslips match the current inputs.')).toBeVisible();
    // the blocker agreement is not asked again for the Review step
    await step(page, 'review');
    await expect(page.getByTestId('readiness')).toContainText('Blockers from the checks');
    await expect(page.getByTestId('readiness')).toContainText('1 blocker confirmed as accepted');

    await freezeNow(page);
    expect(fake.callsTo('POST', /\/freeze$/)).toHaveLength(1);
    await expect(page.getByRole('heading', { name: /Pay run, November 2026/ })).toContainText('Frozen');
    expect(fake.run()!.status).toBe('frozen');
    // the freeze recovered Asha's EMI on the server; the loans screen shows the server's balance without another load
    expect(fake.loan(LOAN).recovered).toBe(6000);
    await step(page, 'inputs');
    await expect(page.getByTestId('run-loans').getByRole('row').filter({ hasText: 'Asha Rao' })).toContainText('₹4,000');   // balance after this EMI, from the server's recovered amount
    await step(page, 'pay');

    // the bank file is the server's, with the full account numbers, and nothing masked is refused
    await expect(page.getByTestId('step-pay')).toBeVisible(slow);
    await expect(page.getByTestId('bank-masked-guard')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Download bank file/ })).toBeEnabled();
    await expect(page.getByTestId('bank-skipped')).toContainText('No bank account');
    await expect(page.getByText(ASHA_ACCOUNT)).toHaveCount(0);                  // only masks on screen
    expect(fake.callsTo('GET', /\/bank-file$/)).toHaveLength(0);                // drawing the screen does not fetch (or log) the file
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download bank file/ }).click()]);
    expect(csv.suggestedFilename()).toContain('bank-advice-2026-11');
    const lines = readFileSync(await csv.path(), 'utf8').split('\n');
    expect(lines[0]).toBe('Employee code,Name,Account number,IFSC,Bank,Amount,Narration');
    expect(lines).toHaveLength(3);                                              // header + Asha + Dev (Meera has no account)
    expect(lines.find((l) => l.startsWith('EMP-0001'))).toContain(ASHA_ACCOUNT); // the full number, from the server
    expect(lines.join('\n')).not.toMatch(/[•X]{4}/);
    expect(fake.callsTo('GET', /\/bank-file$/)).toHaveLength(1);
    expect(fake.accessLog).toHaveLength(1);
    expect(fake.accessLog[0]).toMatchObject({ field: 'bank_file' });
    await expect(page.getByTestId('bank-server-result')).toContainText('2 payments');
    await expect(page.getByTestId('bank-server-result')).toContainText('Meera Das');

    // the ECR comes from the server too
    expect(fake.callsTo('GET', /\/ecr$/).length).toBeGreaterThan(0);
    const [ecr] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download ECR/ }).click()]);
    expect(readFileSync(await ecr.path(), 'utf8')).toBe(buildEcr(fake['engineDb'](true), { month: MONTH, payslips: run.payslips } as unknown as PayRun).text);

    // mark paid
    await page.getByRole('button', { name: 'Mark as paid' }).click();
    await dialog(page, 'Mark this run as paid?').getByRole('button', { name: 'Mark as paid' }).click();
    await expect(page.getByRole('heading', { name: /Pay run, November 2026/ })).toContainText('Paid', slow);
    expect(fake.callsTo('POST', /\/mark-paid$/)).toHaveLength(1);
    expect(fake.run()!.status).toBe('paid');
    // a payslip opens from the run (the server's id)
    await page.getByRole('link', { name: 'Open payslip of Asha Rao' }).click();
    await page.waitForURL(/\/payslips\//, { timeout: 90_000 });
    const ashaSlip = slips.find((s) => s.employeeId === ASHA)!;
    await expect(page.getByTestId('net-pay')).toHaveText(`₹${ashaSlip.net.toLocaleString('en-IN')}`, slow);
    expect(page.url()).toContain(ashaSlip.id);
    // not one call to the browser engine's outputs: the only payroll calls are the ones above
    expect(fake.calls.filter((c) => c.method === 'GET' && /\/payroll\/runs\/[^/]+$/.test(c.path))).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  test('a command waits for queued edits: a loss-of-pay edit made just before Compute reaches the server first', async ({ page }) => {
    const fake = new FakePayroll().full();
    await open(page, fake, PAYROLL);
    await page.getByRole('button', { name: 'Start run' }).click();
    await page.waitForURL(/\/payroll\/runs\//, { timeout: 90_000 });
    fake.delays.push({ when: (c) => c.method === 'PUT' && c.path.startsWith('/payroll/attendance/'), ms: 900 });
    const lop = page.getByLabel('Loss of pay days for Dev Nair');
    await lop.fill('2');
    await lop.press('Enter');
    await step(page, 'checks');
    await expect(page.getByTestId('checks-blocker')).toContainText('No bank account', slow);
    await page.getByRole('checkbox', { name: /I understand/ }).check();
    await page.getByRole('button', { name: 'Continue to compute' }).click();
    await page.getByRole('button', { name: 'Compute payslips' }).click();
    await expect(page.getByTestId('payslip-table')).toBeVisible(slow);
    const order = fake.calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path.replace(/[0-9a-f-]{36}/g, ':id')}`);
    expect(order).toEqual(['POST /payroll/runs', 'PUT /payroll/attendance/:id/2026-11', 'POST /payroll/runs/:id/compute']);
    const dev = (fake.run()!.payslips as Array<{ employeeId: string; lopDays: number; paidDays: number }>).find((s) => s.employeeId === DEV)!;
    expect(dev.lopDays).toBe(2);
    expect(dev.paidDays).toBe(28);
  });

  test('refusals show the server\'s plain reason and change nothing: compute, freeze, unfreeze and mark paid', async ({ page }) => {
    const fake = new FakePayroll().full();
    await open(page, fake, PAYROLL);
    await waitLoaded(page);
    await startAndContinue(page);

    fake.failures.push({ when: (c) => c.method === 'POST' && /\/compute$/.test(c.path), status: 409, error: 'This run is frozen. Unfreeze it before computing again.', code: 'RUN_FROZEN' });
    await page.getByRole('button', { name: 'Compute payslips' }).click();
    await expect(toasts(page).filter({ hasText: 'This run is frozen. Unfreeze it before computing again.' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('payslip-table')).toHaveCount(0);
    expect(fake.run()!.status).toBe('draft');
    await computeNow(page);

    // freeze refused as stale
    fake.failures.push({ when: (c) => c.method === 'POST' && /\/freeze$/.test(c.path), status: 409, error: 'Inputs changed after the last compute. Compute again before freezing, so the payslips match the inputs.', code: 'RUN_STALE' });
    await step(page, 'freeze');
    await page.getByRole('button', { name: 'Freeze run' }).click();
    await dialog(page, 'Freeze this run?').getByRole('button', { name: 'Freeze run' }).click();
    await expect(toasts(page).filter({ hasText: 'Inputs changed after the last compute. Compute again before freezing' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /Pay run, November 2026/ })).toContainText('Computed');
    await expect(dialog(page, 'Freeze this run?')).toBeVisible();                              // the dialog stays open so it can be tried again
    expect(fake.run()!.status).toBe('computed');
    expect(fake.loan(LOAN).recovered).toBe(4000);

    // freeze for real, then refuse the unfreeze and the payment
    await dialog(page, 'Freeze this run?').getByRole('button', { name: 'Freeze run' }).click();
    await expect(page.getByTestId('step-pay')).toBeVisible(slow);
    await step(page, 'freeze');
    fake.failures.push({ when: (c) => c.method === 'POST' && /\/unfreeze$/.test(c.path), status: 409, error: 'Only a frozen run can be unfrozen. A paid run is closed.', code: 'RUN_NOT_FROZEN' });
    await page.getByRole('button', { name: 'Unfreeze' }).click();
    const un = dialog(page, 'Unfreeze this run');
    await un.getByRole('button', { name: 'Unfreeze run' }).click();
    await expect(un.getByText('Give a reason of at least a few words')).toBeVisible();      // checked here first
    expect(fake.callsTo('POST', /\/unfreeze$/)).toHaveLength(0);
    await un.getByLabel('Reason').fill('An incentive was missed');
    await un.getByRole('button', { name: 'Unfreeze run' }).click();
    await expect(toasts(page).filter({ hasText: 'Only a frozen run can be unfrozen. A paid run is closed.' })).toBeVisible({ timeout: 20_000 });
    await expect(un).toBeVisible();                                                           // the dialog stays open with the reason
    await un.getByRole('button', { name: 'Cancel' }).click();
    expect(fake.run()!.status).toBe('frozen');

    await step(page, 'pay');
    fake.failures.push({ when: (c) => c.method === 'POST' && /\/mark-paid$/.test(c.path), status: 409, error: 'Only a frozen run can be marked as paid.', code: 'RUN_NOT_FROZEN' });
    await page.getByRole('button', { name: 'Mark as paid' }).click();
    await dialog(page, 'Mark this run as paid?').getByRole('button', { name: 'Mark as paid' }).click();
    await expect(toasts(page).filter({ hasText: 'Only a frozen run can be marked as paid.' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /Pay run, November 2026/ })).toContainText('Frozen');
    expect(fake.run()!.status).toBe('frozen');
  });

  test('the stale notice follows the server\'s flag: an input edited after Compute marks the run stale, and a recompute clears it', async ({ page }) => {
    const fake = new FakePayroll().full();
    await open(page, fake, PAYROLL);
    await waitLoaded(page);
    await startAndContinue(page);
    await computeNow(page);
    await expect(page.getByText('Payslips match the current inputs.')).toBeVisible();
    expect(fake.callsTo('GET', /^\/payroll\/runs$/)).toHaveLength(0);

    await step(page, 'inputs');
    const ot = page.getByLabel('Overtime hours for Asha Rao');
    await ot.fill('4');
    await ot.press('Enter');
    await expect.poll(() => fake.callsTo('GET', /^\/payroll\/runs$/).length, { timeout: 20_000 }).toBeGreaterThan(0);   // the flags are asked for once the edit is saved
    await step(page, 'compute');
    await expect(page.getByText('Inputs changed after the last compute')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Continue to review' })).toBeDisabled();
    await step(page, 'freeze');
    await expect(page.getByRole('button', { name: 'Freeze run' })).toBeDisabled();
    expect(fake.callsTo('POST', /\/freeze$/)).toHaveLength(0);                // the page never sent a freeze it knew would be refused

    await step(page, 'compute');
    await page.getByRole('button', { name: 'Recompute now' }).click();
    await expect(page.getByText('Payslips match the current inputs.')).toBeVisible({ timeout: 20_000 });
    expect(fake.callsTo('POST', /\/compute$/)).toHaveLength(2);
    // a change of the person's pay (CTC) is an input as well
    fake.employee(ASHA).annual_ctc = '660000';
    await page.getByTestId('hrms-refresh').click();
    await expect(page.getByTestId('hrms-refresh')).toBeEnabled();
    // (a refresh reads /payroll/bootstrap: the flag comes back from the server, stale because the fake's inputs moved)
    await expect(page.getByText('Inputs changed after the last compute')).toBeVisible({ timeout: 20_000 });
  });

  test('unfreeze gives the loan EMI back, freezing again recovers it once, and the inputs unlock and lock with the run', async ({ page }) => {
    const fake = new FakePayroll().full();
    await open(page, fake, PAYROLL);
    await waitLoaded(page);
    await startAndContinue(page);
    await computeNow(page);
    await freezeNow(page);
    expect(fake.loan(LOAN).recovered).toBe(6000);
    await step(page, 'inputs');
    await expect(page.getByLabel('Loss of pay days for Asha Rao')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Add adjustment' })).toBeDisabled();
    const balance = () => page.getByTestId('run-loans').getByRole('row').filter({ hasText: 'Asha Rao' });
    await expect(balance()).toContainText('₹4,000');

    await step(page, 'freeze');
    await page.getByRole('button', { name: 'Unfreeze' }).click();
    const un = dialog(page, 'Unfreeze this run');
    await un.getByLabel('Reason').fill('An incentive was missed for the team');
    await un.getByRole('button', { name: 'Unfreeze run' }).click();
    await expect(page.getByRole('heading', { name: /Pay run, November 2026/ })).toContainText('Computed', slow);
    expect(fake.callsTo('POST', /\/unfreeze$/)[0]!.body).toEqual({ reason: 'An incentive was missed for the team' });
    expect(fake.loan(LOAN).recovered).toBe(4000);
    await expect(page.getByRole('table').last()).toContainText('Unfrozen: An incentive was missed for the team');
    await expect(page.getByRole('table').last()).toContainText('Frozen. Payslips are locked.');
    await step(page, 'inputs');
    await expect(page.getByLabel('Loss of pay days for Asha Rao')).toBeEnabled();
    await expect(balance()).toContainText('₹6,000');                                                        // given back, without another load
    await freezeNow(page);
    expect(fake.loan(LOAN).recovered).toBe(6000);                                                           // once, not twice
    await step(page, 'inputs');
    await expect(balance()).toContainText('₹4,000');
  });
});

// ═════════════════════════════ full and final ═════════════════════════════
test.describe('live payroll: full and final', () => {
  test('a settlement is saved with a UUID and its due date, worked out by the server, approved and paid by commands, and a refusal is shown', async ({ page }) => {
    const fake = new FakePayroll().full();
    fake.fudge = 11;
    fake.employee(DEV).status = 'on_notice';
    fake.employee(DEV).last_working_date = '2026-11-30';
    await open(page, fake, `${PAYROLL}?tab=fnf`);
    await page.getByRole('button', { name: 'New settlement' }).click();
    const form = dialog(page, 'New settlement');
    await form.getByRole('button', { name: 'Create settlement' }).click();
    await expect.poll(() => fake.fnf.length, { timeout: 20_000 }).toBe(1);
    const post = fake.callsTo('POST', /^\/payroll\/fnf$/)[0]!;
    expect(post.body!.id).toMatch(UUID);
    expect(post.body).toMatchObject({ employee_id: DEV, last_working_date: '2026-11-30' });
    expect(post.body!.due_by).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(post.body).not.toHaveProperty('status');
    // the sheet opens on its own and shows the server's figure (the fudge makes it differ from the browser engine's)
    const sheet = page.getByTestId('fnf-sheet');
    await expect(sheet).toBeVisible(slow);
    await expect.poll(() => fake.callsTo('GET', /\/fnf\/[^/]+\/compute$/).length, { timeout: 20_000 }).toBeGreaterThan(0);
    const local = computeFnf(fake['engineDb'](true), fnfFromWire(fake.fnf[0]!))!;
    await expect(page.getByTestId('fnf-net')).toHaveText(`₹${(local.net + 11).toLocaleString('en-IN')}`, slow);

    // approve is refused once, then goes through; pay is a command as well
    fake.failures.push({ when: (c) => c.method === 'POST' && /\/approve$/.test(c.path), status: 409, error: 'Only a draft settlement can be approved.', code: 'FNF_STATE' });
    await sheet.getByRole('button', { name: 'Approve settlement' }).click();
    await dialog(page, 'Approve settlement').getByRole('button', { name: 'Approve' }).click();
    await expect(toasts(page).filter({ hasText: 'Only a draft settlement can be approved.' })).toBeVisible({ timeout: 20_000 });
    expect(fake.fnf[0]!.status).toBe('draft');
    await dialog(page, 'Approve settlement').getByRole('button', { name: 'Approve' }).click();
    await expect(sheet.getByRole('button', { name: 'Mark as paid' })).toBeVisible({ timeout: 20_000 });
    expect(fake.fnf[0]!.status).toBe('approved');
    await sheet.getByRole('button', { name: 'Mark as paid' }).click();
    await dialog(page, 'Mark settlement as paid').getByRole('button', { name: 'Mark as paid' }).click();
    await expect(toasts(page).filter({ hasText: 'Settlement marked paid' })).toBeVisible({ timeout: 20_000 });
    expect(fake.fnf[0]!.status).toBe('paid');
    expect(fake.callsTo('POST', /\/mark-paid$/)).toHaveLength(1);
  });
});

// ═════════════════════════════ reports ═════════════════════════════
test.describe('live payroll: reports and My HR read the server\'s runs', () => {
  test('Reports, bank advice: the table shows masks, Export CSV downloads the server\'s file with full numbers', async ({ page }) => {
    const fake = new FakePayroll().full();
    const run = fake.precompute();
    run.status = 'frozen'; run.frozen_at = '2026-11-10T10:00:00Z'; run.frozen_by = 'Master Admin';
    await open(page, fake, `/dashboard/hrms/reports/bank-advice?month=${MONTH}`);
    await waitLoaded(page);
    await expect(page.getByTestId('report-count')).toContainText('2 rows', slow);
    await expect(page.getByText(ASHA_ACCOUNT)).toHaveCount(0);
    await expect(page.getByText(maskAcct(ASHA_ACCOUNT)).first()).toBeVisible();
    await expect(page.getByText('Meera Das is left out: No bank account.')).toBeVisible();
    expect(fake.callsTo('GET', /\/bank-file$/)).toHaveLength(0);
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    const text = readFileSync(await csv.path(), 'utf8');
    expect(text.split('\n')[0]).toBe('Employee code,Name,Account number,IFSC,Bank,Amount,Narration');
    expect(text).toContain(ASHA_ACCOUNT);
    expect(text).toContain(DEV_ACCOUNT);
    expect(text).not.toMatch(/[•X]{4}/);
    expect(fake.callsTo('GET', /\/bank-file$/)).toHaveLength(1);
    expect(fake.accessLog).toHaveLength(1);
  });

  test('My HR lists the payslips of frozen runs from the server, and not those of a run that is only computed', async ({ page }) => {
    const fake = new FakePayroll().full();
    const run = fake.precompute();
    await open(page, fake, '/dashboard/hrms/my');
    await waitLoaded(page);
    await expect(page.getByText('No payslip has been released for this employee yet')).toBeVisible(slow);
    run.status = 'frozen'; run.frozen_at = '2026-11-10T10:00:00Z'; run.frozen_by = 'Master Admin';
    await page.getByTestId('hrms-refresh').click();
    await expect(page.getByRole('link', { name: 'Open the payslip for Nov 2026' })).toBeVisible({ timeout: 30_000 });
  });
});

// ═════════════════════════════ nothing salary-related in browser storage ═════════════════════════════
test.describe('live payroll: browser storage', () => {
  test('after a full run, nothing salary-related is in localStorage or sessionStorage', async ({ page }) => {
    const fake = new FakePayroll().full();
    await open(page, fake, PAYROLL);
    await waitLoaded(page);
    await startAndContinue(page);
    await computeNow(page);
    await freezeNow(page);
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download bank file/ }).click()]);
    expect(readFileSync(await csv.path(), 'utf8')).toContain(ASHA_ACCOUNT);
    await page.goto(`${PAYROLL}?tab=adjustments`);
    await page.goto(`${PAYROLL}?tab=loans`);
    await page.goto(`${PAYROLL}?tab=structures`);
    await expect(page.getByRole('link', { name: 'Office staff' }).first()).toBeVisible(slow);
    const dump = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (const store of [window.localStorage, window.sessionStorage]) {
        for (let i = 0; i < store.length; i++) { const k = store.key(i)!; out[`${store === window.localStorage ? 'local' : 'session'}:${k}`] = store.getItem(k) ?? ''; }
      }
      return out;
    });
    const all = JSON.stringify(dump);
    for (const secret of [ASHA_ACCOUNT, DEV_ACCOUNT, String(SENTINEL_CTC), 'ABCPA1234F', 'earnings', 'totalDeductions', 'employerCost', 'Laptop', 'Festival bonus', 'BASIC']) {
      expect(all, `browser storage holds "${secret}"`).not.toContain(secret);
    }
    expect(all).not.toMatch(/"(payslips|payRuns|annualCtc|annual_ctc)"\s*:/);
    // what is kept is the data source choice and the local-only reference data, none of it payroll
    const local = JSON.parse(dump[`local:${LOCAL_KEY}`] ?? '{"local":{}}') as { local: Record<string, unknown> };
    for (const k of ['payRuns', 'structures', 'attendance', 'adjustments', 'loans', 'fnfCases', 'overtimeRules']) expect(local.local).not.toHaveProperty(k);
    expect(dump['local:kinematic_hrms_preview_v3']).toBeUndefined();            // the sample company was never even written
    // and the shared GET cache did not mirror a payroll response
    expect(Object.entries(dump).filter(([k]) => /payroll|hrms\/bootstrap/i.test(k))).toEqual([]);
  });

  test('pay run data an earlier build saved in this browser is removed, and never overrides what the server says', async ({ page }) => {
    const fake = new FakePayroll().full();
    const old = JSON.stringify({
      seedVersion: sampleDb.version,
      local: { payRuns: [{ id: 'old-run', month: '2025-01', payslips: [{ net: 123456789 }] }], structures: [{ id: 'str_std', name: 'Old sample structure' }], loans: [{ id: 'old-loan', principal: 987654321 }], shifts: sampleDb.shifts, onboarding: [] },
    });
    await open(page, fake, `${PAYROLL}?tab=structures`, 'live', { [LOCAL_KEY]: old });
    await waitLoaded(page);
    await expect(page.getByRole('link', { name: 'Office staff' }).first()).toBeVisible(slow);
    await expect(page.getByText('Old sample structure')).toHaveCount(0);
    const stored = await page.evaluate((k) => window.localStorage.getItem(k) ?? '', LOCAL_KEY);
    expect(stored).not.toContain('123456789');
    expect(stored).not.toContain('987654321');
    expect(stored).not.toContain('payRuns');
    expect(stored).not.toContain('shifts');                                      // shifts moved to the server in phase 3: no longer kept in the browser
    expect(stored).not.toContain('letterTemplates');                             // letter templates moved to the server in phase 4: no longer kept in the browser
    expect(stored).not.toContain('onboarding');                                  // onboarding moved to the server in phase 4 too
    expect(stored).not.toContain('retention');                                   // compliance / consents / retention moved to the server in phase 5: no longer kept in the browser
    expect(stored).toContain('accessLog');                                       // the still-local access log collection is kept
  });
});

// ═════════════════════════════ not set up / errors ═════════════════════════════
test.describe('live payroll: when payroll cannot be loaded', () => {
  test('503 HRMS_NOT_READY on payroll: the payroll pages say so with a retry, the people pages keep working, and it recovers', async ({ page }) => {
    const fake = new FakePayroll().full();
    fake.mode = 'payroll_not_ready';
    await open(page, fake, PAYROLL);
    const state = page.getByTestId('hrms-payroll-not-ready');
    await expect(state).toBeVisible({ timeout: 45_000 });
    await expect(state).toContainText('Payroll storage is not set up yet on the server');
    await expect(state).toContainText('People and organisation still work');
    await expect(page.getByTestId('hrms-live-not-ready')).toHaveCount(0);       // the whole of HRMS is not blocked
    await page.goto('/dashboard/hrms/statutory');
    await expect(page.getByTestId('hrms-payroll-not-ready')).toBeVisible(slow);
    await page.goto('/dashboard/hrms/employees');
    await expect(page.getByText('Asha Rao').first()).toBeVisible(slow);
    await expect(page.getByTestId('hrms-payroll-not-ready')).toHaveCount(0);
    await page.goto('/dashboard/hrms/my');
    await expect(page.getByTestId('hrms-payroll-missing')).toContainText('Payroll could not be loaded from the server');
    // back on Payroll, still not set up; once the server has it, Try again loads it
    await page.goto(PAYROLL);
    await expect(page.getByTestId('hrms-payroll-not-ready')).toBeVisible(slow);
    fake.mode = 'ok';
    await page.getByTestId('hrms-payroll-not-ready').getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('button', { name: 'Start run' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('hrms-payroll-not-ready')).toHaveCount(0);
  });

  test('a payroll server error shows its message with a retry', async ({ page }) => {
    const fake = new FakePayroll().full();
    fake.mode = 'payroll_error';
    await open(page, fake, PAYROLL);
    await expect(page.getByTestId('hrms-payroll-error')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('hrms-payroll-error-message')).toContainText('Internal server error');
    fake.mode = 'ok';
    await page.getByTestId('hrms-payroll-error').getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('button', { name: 'Start run' })).toBeVisible({ timeout: 30_000 });
  });

  test('a run that cannot be started shows the server\'s reason and stays on the page', async ({ page }) => {
    const fake = new FakePayroll().full();
    fake.failures.push({ when: (c) => c.method === 'POST' && c.path === '/payroll/runs', status: 400, error: 'entity_id: Unknown legal entity', code: 'VALIDATION' });
    await open(page, fake, PAYROLL);
    await page.getByRole('button', { name: 'Start run' }).click();
    await expect(toasts(page).filter({ hasText: 'entity_id: Unknown legal entity' })).toBeVisible({ timeout: 20_000 });
    expect(page.url()).not.toContain('/runs/');
    await expect(page.getByRole('button', { name: 'Start run' })).toBeEnabled();
  });
});

// ═════════════════════════════ reload and narrow screens ═════════════════════════════
test.describe('live payroll: reload, narrow screens', () => {
  test('after a reload the runs come from the server again, not from the browser', async ({ page }) => {
    const fake = new FakePayroll().full();
    await open(page, fake, PAYROLL);
    await waitLoaded(page);
    await startAndContinue(page);
    await computeNow(page);
    const url = page.url();
    await page.reload();
    await banner(page).waitFor({ timeout: 45_000 });
    await expect(page.getByTestId('payslip-table')).toBeVisible(slow);
    expect(page.url()).toBe(url);
    expect(fake.callsTo('GET', /^\/payroll\/bootstrap$/)).toHaveLength(2);
    await expect(page.getByTestId('payslip-row')).toHaveCount(3);
  });

  test.describe('390px', () => {
    test.use({ viewport: { width: 390, height: 800 } });
    test('the live payroll page, its banner and the empty structures offer fit the screen', async ({ page }) => {
      const fake = new FakePayroll().seedOrg().seedPeople();
      await open(page, fake, `${PAYROLL}?tab=structures`);
      await expect(page.getByTestId('structures-empty')).toBeVisible(slow);
      for (const id of ['hrms-preview-banner', 'structures-empty']) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(391);
      }
    });
  });
});
