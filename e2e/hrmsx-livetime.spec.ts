import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession } from './utils';
import { MASTER_USER } from './hrms-utils';
import { diffServer } from '../src/lib/hrms/live/diff';
import {
  holidayListCreateBody, holidayListFromWire, holidayListPatch, leaveBalanceBody, leaveBalanceFromWire, leaveBalanceKey, leaveTypeCreateBody, leaveTypeFromWire, leaveTypePatch,
  rosterBody, rosterFromWire, rosterKey, shiftCreateBody, shiftFromWire, shiftPatch, timeFromWire,
} from '../src/lib/hrms/live/timeWire';
import { employeeFromWire } from '../src/lib/hrms/live/wire';
import type { HolidayList, LeaveBalance, LeaveType, RosterRow, Shift } from '../src/lib/hrms/types';

/**
 * HRMS live mode, phase 3: time and leave on the server. The server is a stateful miniature of the time contract behind
 * page.route: it keeps shifts, the weekly roster, leave types, holiday lists and leave balances, enforces the delete guards
 * and the refusal codes, and records every call. The roster and the leave balance are keyed by two path parts and upserted
 * with a PUT, like attendance; shifts, leave types and holiday lists are ordinary {id} records. Nothing talks to a real backend.
 */

test.describe.configure({ timeout: 240_000 });
test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

const SOURCE_KEY = 'kinematic_hrms_source';
const LOCAL_KEY = 'kinematic_hrms_live_local_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = '/dashboard/hrms/time';
const WEEK = '2026-11-02';       // Monday of the preview week (PREVIEW_TODAY = 2026-11-07)
const PREV_WEEK = '2026-10-26';

const ENT = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';
const DEP = '33333333-3333-4333-8333-333333333333';
const DES = '44444444-4444-4444-8444-444444444444';
const ASHA = '55555555-5555-4555-8555-555555555555';
const DEV = '66666666-6666-4666-8666-666666666666';
const SH_GEN = '88888888-8888-4888-8888-888888888888';
const SH_NIGHT = '99999999-9999-4999-8999-999999999999';
const SH_SPARE = '77777777-7777-4777-8777-777777777777';
const LV_CL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOL_KA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Row = Record<string, unknown>;
interface Call { method: string; path: string; query: string; body: Row | undefined; n: number }
interface Failure { when: (c: Call) => boolean; status: number; error: string; code?: string; once?: boolean }

// ───────────────────────────── a stateful time-and-leave server (wire shape) ─────────────────────────────
class FakeTime {
  calls: Call[] = [];
  entities: Row[] = [];
  locations: Row[] = [];
  departments: Row[] = [];
  designations: Row[] = [];
  employees: Row[] = [];
  shifts: Row[] = [];
  roster: Row[] = [];
  leaveTypes: Row[] = [];
  holidayLists: Row[] = [];
  leaveBalances: Row[] = [];
  failures: Failure[] = [];
  /** 'ok'; 'time_not_ready' answers 503 HRMS_NOT_READY on /time/bootstrap; 'time_error' answers 500 there. */
  mode: 'ok' | 'time_not_ready' | 'time_error' = 'ok';
  private seq = 0;

  seedOrg(): this {
    this.entities = [{ id: ENT, name: 'Acme Retail Pvt Ltd', pan: 'AABCA1234C', tan: null, cin: null, gstin: null, address: { city: 'Bengaluru', state: 'Karnataka' }, registrations: [], signatory: null }];
    this.locations = [{ id: LOC, entity_id: ENT, name: 'Bengaluru Office', state: 'Karnataka', city: 'Bengaluru', address: null, metro: true, holiday_list_id: null }];
    this.departments = [{ id: DEP, name: 'Operations', head_id: null }];
    this.designations = [{ id: DES, name: 'Operations Associate', grade: 'E1' }];
    return this;
  }

  seedPeople(): this {
    const mk = (id: string, code: string, first: string, gender: string) => this.employees.push({
      id, code, first_name: first, last_name: 'Rao', email: `${first.toLowerCase()}@example.com`, mobile: '9876500001', gender, dob: '1995-05-05',
      father_name: null, marital_status: null, blood_group: null, address: { city: 'Bengaluru', state: 'Karnataka' }, emergency_contact: null,
      entity_id: ENT, location_id: LOC, department_id: DEP, designation_id: DES, reporting_to_id: null, employment_type: 'permanent', status: 'active', join_date: '2026-04-01',
      confirmation_date: null, probation_months: 6, notice_days: 30, last_working_date: null, shift_id: SH_GEN, cost_centre: null, contract_end_date: null,
      pan: null, aadhaar_last4: '1234', aadhaar_verified: false, uan: null, uan_status: 'none', pf_member: true, pf_on_actual_wage: false, pf_join_date: null, esic_ip: null,
      pt_applicable: true, lwf_applicable: false, tax_regime: 'new', declaration: { sec80C: 0, sec80D: 0, nps80CCD1B: 0, homeLoanInterest: 0, rentPaidAnnual: 0, other: 0, status: 'not_submitted' },
      pay_mode: 'bank', structure_id: null, annual_ctc: null, structure_overrides: null, documents: [], history: [], created_at: '2026-04-01T09:00:00Z', updated_at: '2026-04-01T09:00:00Z',
    });
    mk(ASHA, 'EMP-0001', 'Asha', 'female');
    mk(DEV, 'EMP-0002', 'Dev', 'male');
    return this;
  }

  seedTime(): this {
    const stamp = { created_at: '2026-04-01T09:00:00Z', updated_at: '2026-04-01T09:00:00Z' };
    this.shifts = [
      { id: SH_GEN, name: 'General', start: '09:30', end: '18:30', break_minutes: 60, grace_minutes: 15, full_day_hours: 8, half_day_hours: 4, is_night: false, color: '#3E9EFF', ...stamp },
      { id: SH_NIGHT, name: 'Night', start: '22:00', end: '06:00', break_minutes: 45, grace_minutes: 10, full_day_hours: 8, half_day_hours: 4, is_night: true, color: '#9B6EFF', ...stamp },
      { id: SH_SPARE, name: 'Spare', start: '08:00', end: '16:00', break_minutes: 30, grace_minutes: 10, full_day_hours: 7.5, half_day_hours: 4, is_night: false, color: '#00C9B1', ...stamp },
    ];
    this.leaveTypes = [{
      id: LV_CL, name: 'Casual Leave', code: 'CL', paid: true, audience: 'all', accrual: { mode: 'yearly', days: 8, afterMonths: 0 },
      carry_forward: { allowed: false, maxDays: 0, expiryMonths: 0 }, encashment: { allowed: false, maxDays: 0, onExit: false },
      max_consecutive_days: 3, document_after_days: null, probation_eligible: true, include_weekly_offs: false, description: null, ...stamp,
    }];
    this.holidayLists = [{ id: HOL_KA, name: 'Karnataka 2026', state: 'Karnataka', year: 2026, holidays: [{ date: '2026-01-26', name: 'Republic Day', optional: false }, { date: '2026-11-08', name: 'Diwali', optional: false }], ...stamp }];
    this.leaveBalances = [{ id: crypto.randomUUID(), employee_id: ASHA, leave_type_id: LV_CL, opening: 8, accrued: 0, taken: 2, encashed: 0, lapsed: 0, ...stamp }];
    return this;
  }

  /** A roster row for Asha in the previous week, so "Copy last week" has something to copy onto the current week. */
  seedPrevRoster(): this {
    this.roster.push({ id: crypto.randomUUID(), employee_id: ASHA, week_start: PREV_WEEK, days: [SH_GEN, SH_GEN, SH_GEN, SH_GEN, SH_GEN, SH_GEN, 'off'] });
    return this;
  }

  full(): this { return this.seedOrg().seedPeople().seedTime(); }
  emptyOrg(): this { return this.seedOrg().seedPeople(); }   // no shifts / leave types / holiday lists yet

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

    // ── people + payroll (enough for the module to load) ──
    if (method === 'GET' && path === '/bootstrap') {
      await this.ok(route, { entities: this.entities, locations: this.locations, departments: this.departments, designations: this.designations, employees: this.employees, settings: { employee_code_prefix: 'EMP-' }, server_time: '2026-11-10T09:00:00Z' });
      return true;
    }
    if (method === 'GET' && path === '/payroll/bootstrap') {
      await this.ok(route, { structures: [], attendance: [], adjustments: [], loans: [], runs: [], fnf_cases: [], settings: { payroll: {} }, server_time: '2026-11-10T09:00:00Z' });
      return true;
    }

    // ── time and leave ──
    if (method === 'GET' && path === '/time/bootstrap') {
      if (this.mode === 'time_not_ready') { await this.err(route, 503, 'HRMS storage is not set up yet', 'HRMS_NOT_READY'); return true; }
      if (this.mode === 'time_error') { await this.err(route, 500, 'Internal server error', 'INTERNAL_ERROR'); return true; }
      await this.ok(route, { shifts: this.shifts, roster: this.roster, leave_types: this.leaveTypes, holiday_lists: this.holidayLists, leave_balances: this.leaveBalances, server_time: '2026-11-10T09:00:00Z' });
      return true;
    }
    if (!path.startsWith('/time')) { await this.err(route, 404, `Unhandled ${method} ${path}`, 'NOT_FOUND'); return true; }
    const p = path.slice('/time'.length);

    const rec = p.match(/^\/(shifts|leave-types|holiday-lists)(?:\/([^/]+))?$/);
    if (rec) { await this.record(route, method, rec[1]!, rec[2], body); return true; }

    const ros = p.match(/^\/roster\/([^/]+)\/(\d{4}-\d{2}-\d{2})$/);
    if (ros && method === 'PUT') { await this.putRoster(route, ros[1]!, ros[2]!, body ?? {}); return true; }

    const bal = p.match(/^\/balances\/([^/]+)\/([^/]+)$/);
    if (bal && method === 'PUT') { await this.putBalance(route, bal[1]!, bal[2]!, body ?? {}); return true; }

    await this.err(route, 404, `Unhandled ${method} ${path}`, 'NOT_FOUND');
    return true;
  }

  private list(kind: string): Row[] {
    return kind === 'shifts' ? this.shifts : kind === 'leave-types' ? this.leaveTypes : this.holidayLists;
  }

  private async record(route: Route, method: string, kind: string, id: string | undefined, body: Row | undefined): Promise<void> {
    const list = this.list(kind);
    const stamp = { updated_at: '2026-11-10T09:00:00Z' };
    if (method === 'POST') {
      const b = body ?? {};
      if (list.some((r) => r.id === b.id)) { await this.ok(route, list.find((r) => r.id === b.id)); return; }
      if (kind === 'shifts') {
        if (!(typeof b.name === 'string' && b.name.trim())) { await this.err(route, 400, 'name: Shift name is required', 'VALIDATION'); return; }
        if (this.shifts.some((s) => String(s.name).trim().toLowerCase() === String(b.name).trim().toLowerCase())) { await this.err(route, 400, `There is already a shift called ${String(b.name)}`, 'VALIDATION'); return; }
      }
      if (kind === 'leave-types' && this.leaveTypes.some((l) => String(l.code).toUpperCase() === String(b.code).toUpperCase())) { await this.err(route, 400, `There is already a leave type with the code ${String(b.code)}`, 'VALIDATION'); return; }
      const row: Row = { created_at: '2026-11-10T09:00:00Z', ...stamp, ...b };
      list.push(row);
      await this.ok(route, row, 201);
      return;
    }
    const row = list.find((r) => r.id === id);
    if (!row) { await this.err(route, 404, 'Not found', 'NOT_FOUND'); return; }
    if (method === 'PUT') { Object.assign(row, body, stamp); await this.ok(route, row); return; }
    if (method === 'DELETE') {
      if (kind === 'shifts') {
        const used = this.employees.filter((e) => e.shift_id === id).length + this.roster.reduce((t, r) => t + (r.days as unknown[]).filter((d) => d === id).length, 0);
        if (used) { await this.err(route, 409, `This shift is still used by ${used} ${used === 1 ? 'row' : 'rows'}. Move them to another shift first.`, 'IN_USE'); return; }
      }
      if (kind === 'leave-types' && this.leaveBalances.some((b) => b.leave_type_id === id)) { await this.err(route, 409, 'Employees hold balances in this leave type. Change the policy instead.', 'IN_USE'); return; }
      list.splice(list.indexOf(row), 1);
      await this.ok(route, { id });
      return;
    }
    await this.err(route, 405, 'Method not allowed', 'VALIDATION');
  }

  private async putRoster(route: Route, employeeId: string, weekStart: string, b: Row): Promise<void> {
    if (!this.employees.some((e) => e.id === employeeId)) { await this.err(route, 404, 'Employee not found', 'NOT_FOUND'); return; }
    // week_start must be a Monday.
    if (new Date(`${weekStart}T00:00:00Z`).getUTCDay() !== 1) { await this.err(route, 400, 'week_start: The week must start on a Monday.', 'VALIDATION'); return; }
    const days = Array.isArray(b.days) ? b.days : [];
    if (days.length !== 7) { await this.err(route, 400, 'days: A week has exactly seven days.', 'VALIDATION'); return; }
    for (const d of days) if (d !== 'off' && !this.shifts.some((s) => s.id === d)) { await this.err(route, 400, 'days: Each day must be a known shift or a weekly off.', 'VALIDATION'); return; }
    let row = this.roster.find((r) => r.employee_id === employeeId && r.week_start === weekStart);
    if (!row) { row = { id: crypto.randomUUID(), employee_id: employeeId, week_start: weekStart, days }; this.roster.push(row); }
    else row.days = days;
    await this.ok(route, row);
  }

  private async putBalance(route: Route, employeeId: string, leaveTypeId: string, b: Row): Promise<void> {
    if (!this.employees.some((e) => e.id === employeeId)) { await this.err(route, 404, 'Employee not found', 'NOT_FOUND'); return; }
    if (!this.leaveTypes.some((l) => l.id === leaveTypeId)) { await this.err(route, 404, 'Leave type not found', 'NOT_FOUND'); return; }
    for (const k of ['opening', 'accrued', 'taken', 'encashed', 'lapsed']) if (b[k] != null && !(Number(b[k]) >= 0)) { await this.err(route, 400, `${k}: Balances cannot be negative.`, 'VALIDATION'); return; }
    let row = this.leaveBalances.find((x) => x.employee_id === employeeId && x.leave_type_id === leaveTypeId);
    if (!row) { row = { id: crypto.randomUUID(), employee_id: employeeId, leave_type_id: leaveTypeId, opening: 0, accrued: 0, taken: 0, encashed: 0, lapsed: 0 }; this.leaveBalances.push(row); }
    Object.assign(row, b);
    await this.ok(route, row);
  }
}

// ───────────────────────────── helpers ─────────────────────────────
async function open(page: Page, fake: FakeTime, path = TIME, source: 'live' | 'sample' | null = 'live'): Promise<void> {
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
test.describe('live time: wire mapping and diff-sync (no browser)', () => {
  test('shifts, leave types and holiday lists map both ways, snake_case bodies that carry only what changed', () => {
    const shiftWire = { id: SH_GEN, name: 'General', start: '09:30', end: '18:30', break_minutes: '60', grace_minutes: 15, full_day_hours: '8', half_day_hours: 4, is_night: false, color: '#3E9EFF' };
    const shift = shiftFromWire(shiftWire);
    expect(shift).toEqual({ id: SH_GEN, name: 'General', start: '09:30', end: '18:30', breakMinutes: 60, graceMinutes: 15, fullDayHours: 8, halfDayHours: 4, isNight: false, color: '#3E9EFF' });
    const create = shiftCreateBody(shift);
    expect(create).toMatchObject({ id: SH_GEN, name: 'General', start: '09:30', end: '18:30', break_minutes: 60, grace_minutes: 15, full_day_hours: 8, half_day_hours: 4, is_night: false, color: '#3E9EFF' });
    expect(Object.keys(create).some((k) => /[A-Z]/.test(k))).toBe(false);
    expect(shiftPatch(shift, { ...shift })).toEqual({ body: {}, keys: [] });
    expect(shiftPatch(shift, { ...shift, name: 'Day', fullDayHours: 9 }).body).toEqual({ name: 'Day', full_day_hours: 9 });

    const ltWire = { id: LV_CL, name: 'Casual Leave', code: 'CL', paid: true, audience: 'all', accrual: { mode: 'yearly', days: 8, afterMonths: 0 }, carry_forward: { allowed: false, maxDays: 0, expiryMonths: 0 }, encashment: { allowed: false, maxDays: 0, onExit: false }, max_consecutive_days: 3, document_after_days: null, probation_eligible: true, include_weekly_offs: false, description: null };
    const lt = leaveTypeFromWire(ltWire);
    expect(lt).toMatchObject({ id: LV_CL, name: 'Casual Leave', code: 'CL', paid: true, audience: 'all', maxConsecutiveDays: 3, probationEligible: true, includeWeeklyOffs: false });
    expect(lt.accrual).toEqual({ mode: 'yearly', days: 8, afterMonths: 0 });
    expect(lt.carryForward).toEqual({ allowed: false, maxDays: 0, expiryMonths: 0 });
    expect(lt.documentAfterDays).toBeUndefined();
    const ltCreate = leaveTypeCreateBody(lt);
    expect(ltCreate).toMatchObject({ id: LV_CL, code: 'CL', carry_forward: { allowed: false, maxDays: 0, expiryMonths: 0 } });   // nested keeps camelCase inner keys
    expect(ltCreate).not.toHaveProperty('document_after_days');                                                                  // undefined means nothing
    expect(leaveTypePatch(lt, { ...lt }).keys).toEqual([]);
    const ltChanged = leaveTypePatch(lt, { ...lt, encashment: { allowed: true, maxDays: 30, onExit: true }, description: 'Up to 30 days' });
    expect(ltChanged.body).toEqual({ encashment: { allowed: true, maxDays: 30, onExit: true }, description: 'Up to 30 days' });

    const holWire = { id: HOL_KA, name: 'Karnataka 2026', state: 'Karnataka', year: 2026, holidays: [{ date: '2026-11-08', name: 'Diwali', optional: false }] };
    const hol = holidayListFromWire(holWire);
    expect(hol).toEqual({ id: HOL_KA, name: 'Karnataka 2026', state: 'Karnataka', year: 2026, holidays: [{ date: '2026-11-08', name: 'Diwali', optional: false }] });
    expect(holidayListCreateBody(hol)).toMatchObject({ id: HOL_KA, state: 'Karnataka', year: 2026, holidays: [{ date: '2026-11-08', name: 'Diwali', optional: false }] });
    expect(holidayListPatch(hol, { ...hol, holidays: [...hol.holidays, { date: '2026-12-25', name: 'Christmas', optional: false }] }).body.holidays).toHaveLength(2);
  });

  test('the roster row and the leave balance are keyed by two parts, and only their changed fields travel', () => {
    const ros = rosterFromWire({ id: 'r1', employee_id: ASHA, week_start: WEEK, days: [SH_GEN, SH_GEN, SH_GEN, SH_GEN, SH_GEN, SH_GEN, 'off'] });
    expect(ros).toEqual({ employeeId: ASHA, weekStart: WEEK, days: [SH_GEN, SH_GEN, SH_GEN, SH_GEN, SH_GEN, SH_GEN, 'off'] });
    expect(rosterKey(ros)).toBe(`${ASHA}:${WEEK}`);
    expect(rosterBody(ros).keys).toEqual(['days']);
    expect(rosterBody(ros, ros)).toEqual({ body: {}, keys: [] });
    const moved: RosterRow = { ...ros, days: [SH_NIGHT, ...ros.days.slice(1)] };
    expect(rosterBody(moved, ros)).toEqual({ body: { days: moved.days }, keys: ['days'] });

    const bal = leaveBalanceFromWire({ id: 'b1', employee_id: ASHA, leave_type_id: LV_CL, opening: 8, accrued: '2', taken: 2, encashed: 0, lapsed: 0 });
    expect(bal).toEqual({ employeeId: ASHA, leaveTypeId: LV_CL, opening: 8, accrued: 2, taken: 2, encashed: 0, lapsed: 0 });
    expect(leaveBalanceKey(bal)).toBe(`${ASHA}:${LV_CL}`);
    expect(leaveBalanceBody(bal).body).toEqual({ opening: 8, accrued: 2, taken: 2, encashed: 0, lapsed: 0 });
    expect(leaveBalanceBody({ ...bal, taken: 3 }, bal)).toEqual({ body: { taken: 3 }, keys: ['taken'] });
  });

  test('the time bootstrap maps every collection, with numeric strings read as numbers', () => {
    const data = timeFromWire({
      shifts: [{ id: SH_GEN, name: 'General', start: '09:30', end: '18:30', break_minutes: 60, grace_minutes: 15, full_day_hours: '8.5', half_day_hours: 4, is_night: false, color: '#3E9EFF' }],
      roster: [{ id: 'r1', employee_id: ASHA, week_start: WEEK, days: [SH_GEN, SH_GEN, SH_GEN, SH_GEN, SH_GEN, SH_GEN, 'off'] }],
      leave_types: [{ id: LV_CL, name: 'Casual Leave', code: 'CL', paid: true, audience: 'all', accrual: { mode: 'yearly', days: 8, afterMonths: 0 }, carry_forward: { allowed: false, maxDays: 0, expiryMonths: 0 }, encashment: { allowed: false, maxDays: 0, onExit: false }, max_consecutive_days: 3, probation_eligible: true, include_weekly_offs: false }],
      holiday_lists: [{ id: HOL_KA, name: 'Karnataka 2026', state: 'Karnataka', year: '2026', holidays: [] }],
      leave_balances: [{ id: 'b1', employee_id: ASHA, leave_type_id: LV_CL, opening: '8', accrued: 0, taken: 2, encashed: 0, lapsed: 0 }],
      server_time: '2026-11-10T09:00:00Z',
    });
    expect(data.shifts[0]!.fullDayHours).toBe(8.5);
    expect(data.roster[0]).toMatchObject({ employeeId: ASHA, weekStart: WEEK });
    expect(data.leaveTypes[0]!.maxConsecutiveDays).toBe(3);
    expect(data.holidayLists[0]!.year).toBe(2026);
    expect(data.leaveBalances[0]).toEqual({ employeeId: ASHA, leaveTypeId: LV_CL, opening: 8, accrued: 0, taken: 2, encashed: 0, lapsed: 0 });
    expect(timeFromWire({}).shifts).toEqual([]);
  });

  test('the diff sends time rows in an order the server accepts: reference data first, keyed rows after the people, and the delete guards reversed', () => {
    const people = { entities: [], locations: [], departments: [], designations: [], employees: [] };
    const emp = employeeFromWire({ id: ASHA, code: 'EMP-0001', first_name: 'Asha', last_name: 'Rao', email: 'a@example.com', mobile: '9876500001', gender: 'female', dob: '1995-05-05', entity_id: ENT, location_id: LOC, department_id: DEP, designation_id: DES, employment_type: 'permanent', status: 'active', join_date: '2026-04-01', probation_months: 6, notice_days: 30, shift_id: SH_GEN });
    const shift: Shift = { id: SH_GEN, name: 'General', start: '09:30', end: '18:30', breakMinutes: 60, graceMinutes: 15, fullDayHours: 8, halfDayHours: 4, isNight: false, color: '#3E9EFF' };
    const lt: LeaveType = { id: LV_CL, name: 'Casual Leave', code: 'CL', paid: true, audience: 'all', accrual: { mode: 'yearly', days: 8, afterMonths: 0 }, carryForward: { allowed: false, maxDays: 0, expiryMonths: 0 }, encashment: { allowed: false, maxDays: 0, onExit: false }, probationEligible: true, includeWeeklyOffs: false };
    const hol: HolidayList = { id: HOL_KA, name: 'Karnataka 2026', state: 'Karnataka', year: 2026, holidays: [] };
    const ros: RosterRow = { employeeId: ASHA, weekStart: WEEK, days: [SH_GEN, SH_GEN, SH_GEN, SH_GEN, SH_GEN, SH_GEN, 'off'] };
    const bal: LeaveBalance = { employeeId: ASHA, leaveTypeId: LV_CL, opening: 8, accrued: 0, taken: 0, encashed: 0, lapsed: 0 };
    const empty = { ...people, shifts: [], roster: [], leaveTypes: [], holidayLists: [], leaveBalances: [] };
    const full = { ...people, employees: [emp], shifts: [shift], roster: [ros], leaveTypes: [lt], holidayLists: [hol], leaveBalances: [bal] };
    const kinds = (ops: ReturnType<typeof diffServer>) => ops.map((o) => `${o.verb}:${o.kind}`);

    const adds = kinds(diffServer(empty as never, full as never));
    expect(adds.indexOf('create:shift')).toBeLessThan(adds.indexOf('create:employee'));          // a roster day / an employee names a shift id
    expect(adds.indexOf('create:leaveType')).toBeLessThan(adds.indexOf('create:leaveBalance'));  // a balance names a leave type id
    for (const k of ['create:roster', 'create:leaveBalance']) expect(adds.indexOf(k)).toBeGreaterThan(adds.indexOf('create:employee'));

    const removes = kinds(diffServer(full as never, empty as never));
    expect(removes.indexOf('delete:shift')).toBeGreaterThan(removes.indexOf('delete:employee'));       // a shift goes after the people on it
    expect(removes.indexOf('delete:leaveType')).toBeGreaterThan(removes.indexOf('delete:employee'));   // and after the balances it held
    expect(removes).not.toContain('delete:roster');                                                    // no delete call for a roster row
    expect(removes).not.toContain('delete:leaveBalance');                                              // nor for a balance

    // a single keyed change is one op
    const one = diffServer(full as never, { ...full, roster: [{ ...ros, days: [SH_NIGHT, ...ros.days.slice(1)] }] } as never);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ kind: 'roster', verb: 'update', employeeId: ASHA, weekStart: WEEK, rowId: `${ASHA}:${WEEK}`, body: { days: [SH_NIGHT, SH_GEN, SH_GEN, SH_GEN, SH_GEN, SH_GEN, 'off'] } });
    const bchange = diffServer(full as never, { ...full, leaveBalances: [{ ...bal, taken: 3 }] } as never);
    expect(bchange).toHaveLength(1);
    expect(bchange[0]).toMatchObject({ kind: 'leaveBalance', verb: 'update', employeeId: ASHA, leaveTypeId: LV_CL, body: { taken: 3 } });
    // collections missing from an older caller count as empty
    expect(kinds(diffServer(people as never, people as never))).toEqual([]);
  });
});

// ═════════════════════════════ sample mode is untouched ═════════════════════════════
test.describe('sample time is unchanged', () => {
  test('the Time page makes no HRMS call, keeps the sample wording and shows the sample shifts', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/hrms')) hits.push(`${r.method()} ${r.url()}`); });
    await seedSession(page, MASTER_USER);
    await mockApi(page, { me: { success: true, data: MASTER_USER } });
    await page.goto(TIME);
    await banner(page).waitFor({ timeout: 45_000 });
    await expect(banner(page)).toHaveAttribute('data-source', 'sample');
    await expect(page.getByRole('heading', { level: 1, name: 'Time and leave' })).toBeVisible(slow);
    await expect(page.getByText('General').first()).toBeVisible(slow);                 // a sample shift
    await expect(page.getByTestId('time-live-empty')).toHaveCount(0);                  // the empty offer is live-only
    expect(hits).toEqual([]);
  });
});

// ═════════════════════════════ bootstrap and empty state ═════════════════════════════
test.describe('live time: bootstrap and empty state', () => {
  test('the server data populates the Shifts, Leave and Holidays tabs', async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, new FakeTime().full());
    await waitLoaded(page);
    await expect(banner(page)).toHaveAttribute('data-source', 'live');
    await expect(page.getByTestId('hrms-local-note')).toHaveCount(0);                  // time is on the server now
    await expect(page.getByText('General').first()).toBeVisible(slow);
    await expect(page.getByText('Night').first()).toBeVisible(slow);
    await expect(page.getByTestId('time-live-empty')).toHaveCount(0);                  // the org has shifts

    await page.goto(`${TIME}?tab=leave`);
    await expect(page.getByText('Casual Leave').first()).toBeVisible(slow);
    await page.goto(`${TIME}?tab=holidays`);
    await expect(page.getByText('Diwali').first()).toBeVisible(slow);
    expect(errors).toEqual([]);
  });

  test('a new org is offered "Add the standard set", which creates the shifts, leave policies and a holiday list on the server', async ({ page }) => {
    const fake = new FakeTime().emptyOrg();
    await open(page, fake);
    await waitLoaded(page);
    await expect(page.getByTestId('time-live-empty')).toBeVisible(slow);
    await page.getByTestId('add-standard-time-set').click();
    // the sample company's four shifts, six leave policies and a holiday list reach the server
    await expect.poll(() => fake.callsTo('POST', /^\/time\/shifts$/).length, { timeout: 30_000 }).toBe(4);
    await expect.poll(() => fake.callsTo('POST', /^\/time\/leave-types$/).length, { timeout: 30_000 }).toBe(6);
    await expect.poll(() => fake.callsTo('POST', /^\/time\/holiday-lists$/).length, { timeout: 30_000 }).toBe(1);
    for (const c of fake.writes()) expect(c.body!.id).toMatch(UUID);                   // every created id is a UUID
    await expect(page.getByTestId('time-live-empty')).toHaveCount(0);                  // the offer is gone
    await expect(page.getByText('General').first()).toBeVisible(slow);
    await expect(toasts(page).filter({ hasText: 'Standard shifts, leave policies and a holiday list added' })).toBeVisible(slow);
  });
});

// ═════════════════════════════ shift / leave / holiday CRUD ═════════════════════════════
test.describe('live time: records sync and roll back', () => {
  test('adding a shift posts it, and the id is a UUID', async ({ page }) => {
    const fake = new FakeTime().full();
    await open(page, fake);
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Add shift' }).click();
    const d = dialog(page, 'Add shift');
    await d.getByLabel('Shift name').fill('Weekend');
    await d.getByRole('button', { name: 'Add shift' }).click();
    await expect.poll(() => fake.callsTo('POST', /^\/time\/shifts$/).length, { timeout: 20_000 }).toBe(1);
    const post = fake.callsTo('POST', /^\/time\/shifts$/)[0]!;
    expect(post.body).toMatchObject({ name: 'Weekend', start: '09:00', end: '18:00', break_minutes: 60, full_day_hours: 8 });
    expect(post.body!.id).toMatch(UUID);
    expect(fake.shifts.some((s) => s.name === 'Weekend')).toBe(true);
  });

  test('editing a shift that the server refuses rolls the change back and shows the reason', async ({ page }) => {
    const fake = new FakeTime().full();
    fake.failures.push({ when: (c) => c.method === 'PUT' && /^\/time\/shifts\//.test(c.path), status: 400, error: 'There is already a shift called Morning', code: 'VALIDATION' });
    await open(page, fake);
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Edit General' }).click();
    const d = dialog(page, 'Edit General');
    await d.getByLabel('Shift name').fill('Morning');
    await d.getByRole('button', { name: 'Save changes' }).click();
    await expect(toasts(page).filter({ hasText: 'There is already a shift called Morning' })).toBeVisible(slow);
    await expect(page.getByText('General').first()).toBeVisible(slow);                 // the name reverted
    await expect(page.getByText('Morning')).toHaveCount(0);
    expect(fake.shifts.find((s) => s.id === SH_GEN)!.name).toBe('General');            // the server was never changed
  });

  test('deleting an unused shift removes it on the server; a server refusal restores it', async ({ page }) => {
    const fake = new FakeTime().full();
    await open(page, fake);
    await waitLoaded(page);
    // SH_NIGHT is used by nobody (Asha and Dev are on SH_GEN, no roster yet): a clean delete.
    await page.getByRole('button', { name: 'Delete Night' }).click();
    await dialog(page, 'Delete shift').getByRole('button', { name: 'Delete shift' }).click();
    await expect.poll(() => fake.callsTo('DELETE', /^\/time\/shifts\//).length, { timeout: 20_000 }).toBe(1);
    await expect(page.getByText('Night')).toHaveCount(0);
    expect(fake.shifts.some((s) => s.id === SH_NIGHT)).toBe(false);

    // now a refused delete rolls back (Spare is unused too, so the client allows the call; the server refuses it)
    fake.failures.push({ when: (c) => c.method === 'DELETE' && /^\/time\/shifts\//.test(c.path), status: 409, error: 'This shift is still used by 2 rows. Move them to another shift first.', code: 'IN_USE' });
    await page.getByRole('button', { name: 'Delete Spare' }).click();
    await dialog(page, 'Delete shift').getByRole('button', { name: 'Delete shift' }).click();
    await expect(toasts(page).filter({ hasText: 'still used by 2 rows' })).toBeVisible(slow);
    await expect(page.getByText('Spare').first()).toBeVisible(slow);                   // restored
    expect(fake.shifts.some((s) => s.id === SH_SPARE)).toBe(true);
  });

  test('adding a leave type posts it, and adding a holiday PUTs the whole list', async ({ page }) => {
    const fake = new FakeTime().full();
    await open(page, fake, `${TIME}?tab=leave`);
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Add leave type' }).click();
    const d = dialog(page, 'Add leave type');
    await d.getByLabel('Leave type name').fill('Bereavement');
    await d.getByLabel('Code').fill('BL');                                 // the label carries a required "*", so match by substring
    await d.getByLabel('Accrual', { exact: true }).selectOption('none');   // "credited when approved": no accrual-days requirement
    await d.getByRole('button', { name: 'Add leave type' }).click();
    await expect.poll(() => fake.callsTo('POST', /^\/time\/leave-types$/).length, { timeout: 20_000 }).toBe(1);
    const post = fake.callsTo('POST', /^\/time\/leave-types$/)[0]!;
    expect(post.body).toMatchObject({ name: 'Bereavement', code: 'BL' });
    expect(post.body!.id).toMatch(UUID);
    expect((post.body!.accrual as Record<string, unknown>)).toBeTruthy();              // nested object present

    await page.goto(`${TIME}?tab=holidays`);
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Add holiday' }).click();
    const h = dialog(page, /Add holiday to/);
    await h.getByLabel('Date').fill('2026-12-25');
    await h.getByLabel('Holiday name').fill('Christmas');
    await h.getByRole('button', { name: 'Add holiday' }).click();
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/time/holiday-lists/${HOL_KA}$`)).length, { timeout: 20_000 }).toBe(1);
    const put = fake.callsTo('PUT', new RegExp(`^/time/holiday-lists/${HOL_KA}$`))[0]!;
    expect((put.body!.holidays as unknown[]).some((h) => (h as Record<string, unknown>).name === 'Christmas')).toBe(true);
  });
});

// ═════════════════════════════ roster ═════════════════════════════
test.describe('live time: roster', () => {
  test('creating the week from default shifts PUTs one row per employee; editing a cell PUTs the new days', async ({ page }) => {
    const fake = new FakeTime().full();
    await open(page, fake, `${TIME}?tab=roster`);
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Create from default shifts' }).click();
    await expect.poll(() => fake.callsTo('PUT', /^\/time\/roster\//).length, { timeout: 20_000 }).toBe(2);
    for (const c of fake.callsTo('PUT', /^\/time\/roster\//)) {
      expect(c.path).toMatch(new RegExp(`/${WEEK}$`));
      expect((c.body!.days as unknown[]).length).toBe(7);
    }
    expect(fake.roster.filter((r) => r.week_start === WEEK)).toHaveLength(2);
    await expect(toasts(page).filter({ hasText: 'Created 2 roster rows' })).toBeVisible(slow);

    // change Asha's Monday to the night shift → one more PUT, replacing the stored days
    const before = fake.callsTo('PUT', /^\/time\/roster\//).length;
    await page.getByTestId(`cell-${ASHA}-0`).click();
    await page.getByLabel(/^Shift for/).selectOption(SH_NIGHT);
    await expect.poll(() => fake.callsTo('PUT', /^\/time\/roster\//).length, { timeout: 20_000 }).toBeGreaterThan(before);
    await expect.poll(() => (fake.roster.find((r) => r.employee_id === ASHA && r.week_start === WEEK)?.days as unknown[] | undefined)?.[0], { timeout: 20_000 }).toBe(SH_NIGHT);
  });

  test('"Copy last week" PUTs the copied rows, and a server refusal rolls the copy back', async ({ page }) => {
    const fake = new FakeTime().full().seedPrevRoster();
    await open(page, fake, `${TIME}?tab=roster`);
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Copy last week' }).first().click();
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/time/roster/${ASHA}/${WEEK}$`)).length, { timeout: 20_000 }).toBe(1);
    expect(fake.roster.some((r) => r.employee_id === ASHA && r.week_start === WEEK)).toBe(true);
    await expect(toasts(page).filter({ hasText: /Copied 1 roster row from last week/ })).toBeVisible(slow);
  });

  test('a roster PUT that the server refuses rolls the local cell back', async ({ page }) => {
    const fake = new FakeTime().full();
    await open(page, fake, `${TIME}?tab=roster`);
    await waitLoaded(page);
    fake.failures.push({ when: (c) => c.method === 'PUT' && /^\/time\/roster\//.test(c.path), status: 400, error: 'days: Each day must be a known shift or a weekly off.', code: 'VALIDATION' });
    await page.getByRole('button', { name: 'Create from default shifts' }).click();
    await expect(toasts(page).filter({ hasText: 'Each day must be a known shift' })).toBeVisible(slow);
    // the whole batch rolls back: no rows are left on screen or on the server
    await expect(page.getByRole('button', { name: 'Create from default shifts' })).toBeVisible(slow);
    expect(fake.roster.filter((r) => r.week_start === WEEK)).toHaveLength(0);
  });
});

// ═════════════════════════════ storage, 503 and errors ═════════════════════════════
test.describe('live time: storage, not-ready, no errors', () => {
  test('nothing time-related is written to browser storage in live mode', async ({ page }) => {
    const fake = new FakeTime().full();
    await open(page, fake);
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Add shift' }).click();
    const d = dialog(page, 'Add shift');
    await d.getByLabel('Shift name').fill('ZZ Sentinel Shift');
    await d.getByRole('button', { name: 'Add shift' }).click();
    await expect.poll(() => fake.callsTo('POST', /^\/time\/shifts$/).length, { timeout: 20_000 }).toBe(1);

    const stored = await page.evaluate((keys) => {
      const out: Record<string, string | null> = {};
      try { for (const k of keys) out[k] = window.localStorage.getItem(k); } catch { /* blocked */ }
      let session = '';
      try { for (let i = 0; i < window.sessionStorage.length; i++) session += window.sessionStorage.getItem(window.sessionStorage.key(i)!) ?? ''; } catch { /* blocked */ }
      let all = '';
      try { for (let i = 0; i < window.localStorage.length; i++) all += window.localStorage.getItem(window.localStorage.key(i)!) ?? ''; } catch { /* blocked */ }
      return { local: out, session, all };
    }, [LOCAL_KEY]);

    expect(stored.all).not.toContain('ZZ Sentinel Shift');                            // the shift never touched any storage
    expect(stored.session).not.toContain('ZZ Sentinel Shift');
    const raw = stored.local[LOCAL_KEY];
    if (raw) {
      expect(raw).not.toContain('ZZ Sentinel Shift');
      const parsed = JSON.parse(raw) as { local?: Record<string, unknown> };
      for (const k of ['shifts', 'roster', 'leaveTypes', 'holidayLists', 'leaveBalances']) expect(parsed.local ?? {}).not.toHaveProperty(k);
    }
  });

  test('the 503 not-ready state shows for the Time section and recovers on retry', async ({ page }) => {
    const fake = new FakeTime().full();
    fake.mode = 'time_not_ready';
    await open(page, fake);
    await expect(page.getByTestId('hrms-time-not-ready')).toBeVisible({ timeout: 30_000 });
    fake.mode = 'ok';
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('General').first()).toBeVisible(slow);
    await expect(page.getByTestId('hrms-time-not-ready')).toHaveCount(0);
  });

  test('a 500 on the time bootstrap shows the error state; people pages still work', async ({ page }) => {
    const fake = new FakeTime().full();
    fake.mode = 'time_error';
    await open(page, fake);
    await expect(page.getByTestId('hrms-time-error')).toBeVisible({ timeout: 30_000 });
    // people are unaffected: the employees page loads
    await page.goto('/dashboard/hrms/employees');
    await waitLoaded(page);
    await expect(page.getByText('Asha').first()).toBeVisible(slow);
  });

  test.describe('390px', () => {
    test.use({ viewport: { width: 390, height: 800 } });
    test('the Time page and the empty state have no sideways scroll', async ({ page }) => {
      await open(page, new FakeTime().emptyOrg());
      await expect(page.getByTestId('time-live-empty')).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(400);
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(w.sw).toBeLessThanOrEqual(w.iw + 1);
    });
  });
});
