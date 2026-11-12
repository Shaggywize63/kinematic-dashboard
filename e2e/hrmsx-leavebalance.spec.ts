import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession } from './utils';
import { MASTER_USER, openHrms } from './hrms-utils';
import { diffServer } from '../src/lib/hrms/live/diff';
import { leaveBalanceBody, leaveBalanceKey } from '../src/lib/hrms/live/timeWire';
import type { LeaveBalance } from '../src/lib/hrms/types';

/**
 * Leave-balance editing on the employee Leave tab, and its server sync.
 *
 * Sample mode: the editor opens from a balance row, changes the five numbers, shows the derived "available" live, writes
 * through setLeaveBalance (actions.ts) and survives a reload (the browser store). Live mode: the same edit flows through the
 * SAME mutate()/diff path as the other Time & Leave records, so saving a balance fires PUT /time/balances/:emp/:type. The
 * Privacy readiness checklist's "Access logs" count reads the server log in live mode, not the empty local collection.
 */

test.describe.configure({ timeout: 240_000 });
test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

const SOURCE_KEY = 'kinematic_hrms_source';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sample seed: Ritu Malhotra (emp_1), an active employee with CL / SL / EL balances; Compensatory Off (CO) has none.
const EMP1 = 'emp_1';
const EMP1_LEAVE = `/dashboard/hrms/employees/${EMP1}?tab=leave`;

const ENT = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';
const DEP = '33333333-3333-4333-8333-333333333333';
const DES = '44444444-4444-4444-8444-444444444444';
const ASHA = '55555555-5555-4555-8555-555555555555';
const LV_CL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LV_EL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BAL1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AL1 = '12121212-1212-4121-8121-121212121212';
const AL2 = '13131313-1313-4131-8131-131313131313';

const slow = { timeout: 60_000 };

// ═════════════════════════════ pure logic: the sync the action relies on (no browser) ═════════════════════════════
test.describe('leave balance: the diff body setLeaveBalance feeds the server (no browser)', () => {
  const people = { entities: [], locations: [], departments: [], designations: [], employees: [] };
  const bal: LeaveBalance = { employeeId: EMP1, leaveTypeId: LV_CL, opening: 8, accrued: 0, taken: 2, encashed: 0, lapsed: 0 };

  test('adding a balance diffs to one create op carrying all five numbers on PUT /time/balances/:emp/:type', () => {
    const before = { ...people, leaveBalances: [] as LeaveBalance[] };
    const after = { ...people, leaveBalances: [bal] };
    const ops = diffServer(before as never, after as never);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      kind: 'leaveBalance', verb: 'create', employeeId: EMP1, leaveTypeId: LV_CL, rowId: `${EMP1}:${LV_CL}`,
      body: { opening: 8, accrued: 0, taken: 2, encashed: 0, lapsed: 0 },
    });
    expect(leaveBalanceKey(bal)).toBe(`${EMP1}:${LV_CL}`);
  });

  test('editing one field diffs to one update op carrying only the changed field', () => {
    const before = { ...people, leaveBalances: [bal] };
    const after = { ...people, leaveBalances: [{ ...bal, taken: 4 }] };
    const ops = diffServer(before as never, after as never);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'leaveBalance', verb: 'update', employeeId: EMP1, leaveTypeId: LV_CL, body: { taken: 4 } });
    // no change diffs to nothing
    expect(diffServer(before as never, before as never)).toHaveLength(0);
    // the raw body helper: full on create, delta on update
    expect(leaveBalanceBody(bal).body).toEqual({ opening: 8, accrued: 0, taken: 2, encashed: 0, lapsed: 0 });
    expect(leaveBalanceBody({ ...bal, taken: 4 }, bal)).toEqual({ body: { taken: 4 }, keys: ['taken'] });
  });
});

// ═════════════════════════════ sample mode: the editor on the employee Leave tab ═════════════════════════════
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return errors;
}
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });

test.describe('leave balance: sample mode editor', () => {
  test('the Leave tab shows the seeded balances and an Edit affordance per row', async ({ page }) => {
    await openHrms(page, EMP1_LEAVE);
    await expect(page.getByTestId('balance-CL')).toHaveText('8', slow);
    await expect(page.getByTestId('balance-EL')).toHaveText('16');
    await expect(page.getByTestId('edit-balance-CL')).toBeVisible();
    await expect(page.getByTestId('add-balance')).toBeEnabled();   // CO / LWP / ML have no balance yet
  });

  test('editing a balance updates the table and the derived available, and survives a reload', async ({ page }) => {
    await openHrms(page, EMP1_LEAVE);
    await expect(page.getByTestId('balance-CL')).toHaveText('8', slow);
    await page.getByTestId('edit-balance-CL').click();
    const d = dialog(page, 'Edit Casual Leave balance');
    await d.getByLabel('Taken').fill('3');
    await expect(d.getByTestId('balance-available')).toContainText('5');   // 8 + 0 - 3 - 0 - 0
    await d.getByRole('button', { name: 'Save balance' }).click();
    await expect(dialog(page, 'Edit Casual Leave balance')).toHaveCount(0);
    await expect(page.getByTestId('balance-CL')).toHaveText('5', slow);

    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
    await expect(page.getByTestId('balance-CL')).toHaveText('5', slow);     // persisted through the store
  });

  test('adding a balance for a leave type that has none yet shows a new row, which survives a reload', async ({ page }) => {
    await openHrms(page, EMP1_LEAVE);
    await expect(page.getByTestId('balance-CL')).toBeVisible(slow);
    await expect(page.getByTestId('balance-CO')).toHaveCount(0);            // no Comp-off balance yet
    await page.getByTestId('add-balance-CO').click();
    const d = dialog(page, 'Add Compensatory Off balance');
    await d.getByLabel('Opening').fill('5');
    await expect(d.getByTestId('balance-available')).toContainText('5');
    await d.getByRole('button', { name: 'Add balance' }).click();
    await expect(page.getByTestId('balance-CO')).toHaveText('5', slow);

    await page.reload();
    await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
    await expect(page.getByTestId('balance-CO')).toHaveText('5', slow);
  });

  test('the header "Add balance" opens a picker of leave types without a balance', async ({ page }) => {
    await openHrms(page, EMP1_LEAVE);
    await page.getByTestId('add-balance').click();
    const d = dialog(page, 'Add leave balance');
    await expect(d.getByLabel('Leave type')).toBeVisible(slow);
    await d.getByLabel('Leave type').selectOption({ label: 'Leave Without Pay (LWP)' });
    await d.getByLabel('Opening').fill('2');
    await d.getByLabel('Taken').fill('1');
    await expect(d.getByTestId('balance-available')).toContainText('1');
    await d.getByRole('button', { name: 'Add balance' }).click();
    await expect(page.getByTestId('balance-LWP')).toHaveText('1', slow);
  });

  test('a negative value is refused: the error shows, Save is disabled and the table does not change', async ({ page }) => {
    await openHrms(page, EMP1_LEAVE);
    await expect(page.getByTestId('balance-CL')).toHaveText('8', slow);
    await page.getByTestId('edit-balance-CL').click();
    const d = dialog(page, 'Edit Casual Leave balance');
    await d.getByLabel('Opening').fill('-1');
    await expect(d.getByText('Days cannot be negative')).toBeVisible();
    await expect(d.getByRole('button', { name: 'Save balance' })).toBeDisabled();
    // fixing the value re-enables Save
    await d.getByLabel('Opening').fill('9');
    await expect(d.getByRole('button', { name: 'Save balance' })).toBeEnabled();
    await d.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('balance-CL')).toHaveText('8');           // unchanged after Cancel
  });

  test('the derived available updates live as the fields change', async ({ page }) => {
    await openHrms(page, EMP1_LEAVE);
    await page.getByTestId('edit-balance-EL').click();
    const d = dialog(page, 'Edit Earned Leave balance');
    await expect(d.getByTestId('balance-available')).toContainText('16');   // 6 + 10
    await d.getByLabel('Encashed').fill('4');
    await expect(d.getByTestId('balance-available')).toContainText('12');
    await d.getByLabel('Taken').fill('2');
    await expect(d.getByTestId('balance-available')).toContainText('10');
  });

  test('the whole edit flow logs no console or page errors', async ({ page }) => {
    const errors = watchErrors(page);
    await openHrms(page, EMP1_LEAVE);
    await expect(page.getByTestId('balance-CL')).toHaveText('8', slow);
    await page.getByTestId('edit-balance-CL').click();
    const d = dialog(page, 'Edit Casual Leave balance');
    await d.getByLabel('Accrued').fill('2');
    await d.getByRole('button', { name: 'Save balance' }).click();
    await expect(page.getByTestId('balance-CL')).toHaveText('10', slow);    // 8 + 2
    expect(errors).toEqual([]);
  });

  test.describe('390px', () => {
    test.use({ viewport: { width: 390, height: 800 } });
    test('the Leave tab and the open editor have no sideways scroll', async ({ page }) => {
      await openHrms(page, EMP1_LEAVE);
      await expect(page.getByTestId('balance-CL')).toBeVisible(slow);
      await page.waitForTimeout(300);
      let w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(w.sw).toBeLessThanOrEqual(w.iw + 1);
      await page.getByTestId('edit-balance-CL').click();
      await expect(dialog(page, 'Edit Casual Leave balance')).toBeVisible(slow);
      await page.waitForTimeout(300);
      w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(w.sw).toBeLessThanOrEqual(w.iw + 1);
    });
  });
});

// ───────────────────────────── a tiny stateful server for live-mode tests ─────────────────────────────
type Row = Record<string, unknown>;
interface Call { method: string; path: string; body: Row | undefined; n: number }

class FakeServer {
  calls: Call[] = [];
  entities: Row[] = [{ id: ENT, name: 'Acme Retail Pvt Ltd', pan: 'AABCA1234C', tan: null, cin: null, gstin: null, address: { city: 'Bengaluru', state: 'Karnataka' }, registrations: [], signatory: null }];
  locations: Row[] = [{ id: LOC, entity_id: ENT, name: 'Bengaluru Office', state: 'Karnataka', city: 'Bengaluru', address: null, metro: true, holiday_list_id: null }];
  departments: Row[] = [{ id: DEP, name: 'Operations', head_id: null }];
  designations: Row[] = [{ id: DES, name: 'Operations Associate', grade: 'E1' }];
  employees: Row[] = [];
  leaveTypes: Row[] = [];
  leaveBalances: Row[] = [];
  consents: Row[] = [];
  retention: Row[] = [];
  compliance: Row[] = [];
  accessLog: Row[] = [];
  /** When set, the next balance PUT answers 500 so the optimistic edit rolls back. */
  failBalance = false;
  private seq = 0;

  seedPeople(): this {
    this.employees = [{
      id: ASHA, code: 'EMP-0001', first_name: 'Asha', last_name: 'Rao', email: 'asha@example.com', mobile: '9876500001', gender: 'female', dob: '1995-05-05',
      father_name: null, marital_status: null, blood_group: null, address: { city: 'Bengaluru', state: 'Karnataka' }, emergency_contact: null,
      entity_id: ENT, location_id: LOC, department_id: DEP, designation_id: DES, reporting_to_id: null, employment_type: 'permanent', status: 'active', join_date: '2024-04-01',
      confirmation_date: null, probation_months: 6, notice_days: 30, last_working_date: null, shift_id: null, cost_centre: null, contract_end_date: null,
      pan: null, aadhaar_last4: '1234', aadhaar_verified: false, uan: null, uan_status: 'none', pf_member: true, pf_on_actual_wage: false, pf_join_date: null, esic_ip: null,
      pt_applicable: true, lwf_applicable: false, tax_regime: 'new', declaration: { sec80C: 0, sec80D: 0, nps80CCD1B: 0, homeLoanInterest: 0, rentPaidAnnual: 0, other: 0, status: 'not_submitted' },
      pay_mode: 'bank', structure_id: null, annual_ctc: null, structure_overrides: null, documents: [], history: [], created_at: '2024-04-01T09:00:00Z', updated_at: '2024-04-01T09:00:00Z',
    }];
    return this;
  }

  seedTime(): this {
    const mkType = (id: string, name: string, code: string) => ({
      id, name, code, paid: true, audience: 'all', accrual: { mode: 'yearly', days: 8, afterMonths: 0 },
      carry_forward: { allowed: false, maxDays: 0, expiryMonths: 0 }, encashment: { allowed: false, maxDays: 0, onExit: false },
      max_consecutive_days: null, document_after_days: null, probation_eligible: true, include_weekly_offs: false, description: null,
    });
    this.leaveTypes = [mkType(LV_CL, 'Casual Leave', 'CL'), mkType(LV_EL, 'Earned Leave', 'EL')];
    this.leaveBalances = [{ id: BAL1, employee_id: ASHA, leave_type_id: LV_CL, opening: 8, accrued: 0, taken: 2, encashed: 0, lapsed: 0 }];
    return this;
  }

  seedAccessLog(): this {
    this.accessLog = [
      { id: AL1, at: '2026-11-06T10:12:00.000Z', by_name: 'Tanvi Kapoor (HR)', employee_id: ASHA, field: 'Bank account', reason: 'Fix IFSC before payroll' },
      { id: AL2, at: '2026-11-05T15:40:00.000Z', by_name: 'Neha Bansal (Finance)', employee_id: ASHA, field: 'Aadhaar last four', reason: 'Verification' },
    ];
    return this;
  }

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
    this.calls.push({ method, path, body, n: this.seq++ });

    if (method === 'GET' && path === '/bootstrap') { await this.ok(route, { entities: this.entities, locations: this.locations, departments: this.departments, designations: this.designations, employees: this.employees, settings: { employee_code_prefix: 'EMP-' }, server_time: '2026-11-10T09:00:00Z' }); return true; }
    if (method === 'GET' && path === '/payroll/bootstrap') { await this.ok(route, { structures: [], attendance: [], adjustments: [], loans: [], runs: [], fnf_cases: [], settings: { payroll: {} }, server_time: '2026-11-10T09:00:00Z' }); return true; }
    if (method === 'GET' && path === '/time/bootstrap') { await this.ok(route, { shifts: [], roster: [], leave_types: this.leaveTypes, holiday_lists: [], leave_balances: this.leaveBalances, server_time: '2026-11-10T09:00:00Z' }); return true; }
    if (method === 'GET' && path === '/lifecycle/bootstrap') { await this.ok(route, { onboarding_cases: [], exit_cases: [], letter_templates: [], issued_letters: [], server_time: '2026-11-10T09:00:00Z' }); return true; }
    if (method === 'GET' && path === '/privacy/bootstrap') { await this.ok(route, { compliance_tasks: this.compliance, consents: this.consents, retention_rules: this.retention, server_time: '2026-11-10T09:00:00Z' }); return true; }
    if (method === 'GET' && path === '/access-log') { await this.ok(route, this.accessLog); return true; }

    const bal = path.match(/^\/time\/balances\/([^/]+)\/([^/]+)$/);
    if (bal && method === 'PUT') { await this.putBalance(route, bal[1]!, bal[2]!, body ?? {}); return true; }

    await this.err(route, 404, `Unhandled ${method} ${path}`, 'NOT_FOUND');
    return true;
  }

  private async putBalance(route: Route, employeeId: string, leaveTypeId: string, b: Row): Promise<void> {
    if (this.failBalance) { await this.err(route, 500, 'Internal error', 'INTERNAL_ERROR'); return; }
    if (!this.employees.some((e) => e.id === employeeId)) { await this.err(route, 404, 'Employee not found', 'NOT_FOUND'); return; }
    if (!this.leaveTypes.some((l) => l.id === leaveTypeId)) { await this.err(route, 404, 'Leave type not found', 'NOT_FOUND'); return; }
    for (const k of ['opening', 'accrued', 'taken', 'encashed', 'lapsed']) if (b[k] != null && !(Number(b[k]) >= 0)) { await this.err(route, 400, `${k}: Balances cannot be negative.`, 'VALIDATION'); return; }
    let row = this.leaveBalances.find((x) => x.employee_id === employeeId && x.leave_type_id === leaveTypeId);
    if (!row) { row = { id: crypto.randomUUID(), employee_id: employeeId, leave_type_id: leaveTypeId, opening: 0, accrued: 0, taken: 0, encashed: 0, lapsed: 0 }; this.leaveBalances.push(row); }
    Object.assign(row, b);
    await this.ok(route, row);
  }
}

async function openLive(page: Page, fake: FakeServer, path: string): Promise<void> {
  await seedSession(page, MASTER_USER);
  await page.addInitScript(([k, v]) => { try { if (window.localStorage.getItem(k!) === null) window.localStorage.setItem(k!, v!); } catch { /* blocked */ } }, [SOURCE_KEY, 'live']);
  await mockApi(page, { me: { success: true, data: MASTER_USER }, onRequest: (route, url, method) => fake.handle(route, url, method) });
  await page.goto(path);
  await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
  await expect(page.getByTestId('hrms-live-loading')).toHaveCount(0, { timeout: 30_000 });
}

// ═════════════════════════════ live mode: the edit syncs through the same PUT ═════════════════════════════
test.describe('leave balance: live mode sync', () => {
  test('editing a balance fires PUT /time/balances/:emp/:type with only the changed field', async ({ page }) => {
    const errors = watchErrors(page);
    const fake = new FakeServer().seedPeople().seedTime();
    await openLive(page, fake, `/dashboard/hrms/employees/${ASHA}?tab=leave`);
    await expect(page.getByTestId('balance-CL')).toHaveText('6', slow);     // 8 + 0 - 2
    await page.getByTestId('edit-balance-CL').click();
    const d = dialog(page, 'Edit Casual Leave balance');
    await d.getByLabel('Taken').fill('4');
    await d.getByRole('button', { name: 'Save balance' }).click();
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/time/balances/${ASHA}/${LV_CL}$`)).length, { timeout: 30_000 }).toBe(1);
    expect(fake.callsTo('PUT', new RegExp(`^/time/balances/${ASHA}/${LV_CL}$`))[0]!.body).toMatchObject({ taken: 4 });
    expect(fake.leaveBalances.find((b) => b.id === BAL1)!.taken).toBe(4);
    await expect(page.getByTestId('balance-CL')).toHaveText('4', slow);     // 8 + 0 - 4
    expect(errors).toEqual([]);
  });

  test('adding a balance for a leave type with none yet PUTs all five numbers', async ({ page }) => {
    const fake = new FakeServer().seedPeople().seedTime();   // Asha has CL but no EL balance
    await openLive(page, fake, `/dashboard/hrms/employees/${ASHA}?tab=leave`);
    await expect(page.getByTestId('balance-CL')).toBeVisible(slow);
    await page.getByTestId('add-balance-EL').click();
    const d = dialog(page, 'Add Earned Leave balance');
    await d.getByLabel('Opening').fill('6');
    await d.getByLabel('Accrued').fill('10');
    await d.getByRole('button', { name: 'Add balance' }).click();
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/time/balances/${ASHA}/${LV_EL}$`)).length, { timeout: 30_000 }).toBe(1);
    const put = fake.callsTo('PUT', new RegExp(`^/time/balances/${ASHA}/${LV_EL}$`))[0]!;
    expect(put.body).toMatchObject({ opening: 6, accrued: 10, taken: 0, encashed: 0, lapsed: 0 });
    expect(fake.leaveBalances.some((b) => b.employee_id === ASHA && b.leave_type_id === LV_EL)).toBe(true);
    await expect(page.getByTestId('balance-EL')).toHaveText('16', slow);    // 6 + 10
  });

  test('a balance the server refuses rolls the change back on screen', async ({ page }) => {
    const fake = new FakeServer().seedPeople().seedTime();
    await openLive(page, fake, `/dashboard/hrms/employees/${ASHA}?tab=leave`);
    await expect(page.getByTestId('balance-CL')).toHaveText('6', slow);
    fake.failBalance = true;                                               // the next balance PUT is refused
    await page.getByTestId('edit-balance-CL').click();
    const d = dialog(page, 'Edit Casual Leave balance');
    await d.getByLabel('Taken').fill('7');
    await d.getByRole('button', { name: 'Save balance' }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Could not save leave balance' })).toBeVisible(slow);
    await expect(page.getByTestId('balance-CL')).toHaveText('6', slow);     // reverted to 8 - 2
    expect(fake.leaveBalances.find((b) => b.id === BAL1)!.taken).toBe(2);   // the server was never changed
  });
});

// ═════════════════════════════ live mode: the DPDP checklist "Access logs" count ═════════════════════════════
test.describe('leave balance: DPDP checklist access count', () => {
  test('sample mode keeps the local count (In place) on the readiness checklist', async ({ page }) => {
    await openHrms(page, '/dashboard/hrms/privacy');
    await expect(page.getByTestId('ready-access')).toContainText('In place', slow);   // the sample seed has access-log rows
  });

  test('live mode reflects the server access log, not the empty local collection', async ({ page }) => {
    const fake = new FakeServer().seedPeople().seedTime().seedAccessLog();
    await openLive(page, fake, '/dashboard/hrms/privacy');
    await expect.poll(() => fake.callsTo('GET', /^\/access-log$/).length, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('ready-access')).toContainText('2 entries', slow);   // not "0 entries"
    await expect(page.getByTestId('ready-access')).toContainText('In place');
  });

  test('live mode with an empty server access log shows 0 entries (Partly), not a crash', async ({ page }) => {
    const errors = watchErrors(page);
    const fake = new FakeServer().seedPeople().seedTime();   // no access-log rows
    await openLive(page, fake, '/dashboard/hrms/privacy');
    await expect.poll(() => fake.callsTo('GET', /^\/access-log$/).length, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('ready-access')).toContainText('0 entries', slow);
    await expect(page.getByTestId('ready-access')).toContainText('Partly');
    expect(errors).toEqual([]);
  });
});
