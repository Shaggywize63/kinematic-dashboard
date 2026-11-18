import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession } from './utils';
import { MASTER_USER } from './hrms-utils';
import {
  configFromWire, decideBody, linesBody, policyBody, projectCreateBody, projectFromWire, sheetFromWire, timesheetsBootstrapFromWire, trackedBody,
} from '../src/lib/hrms/people/live/timesheetsWire';

/**
 * HRMS live mode, phase 9: the Timesheets slice on the server. The server is a stateful miniature of the timesheets
 * contract behind page.route: projects, one week per person (lines, status, trail), the limits and who tracks time; it
 * re-checks a locked week and the return comment, answers with the week, and records every call. Its "today" is fixed
 * (Wednesday 18 Nov 2026), which the page uses for the current week in live mode. Nothing here talks to a real backend or
 * database; all data is fake.
 */

test.describe.configure({ timeout: 240_000 });
test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

const SOURCE_KEY = 'kinematic_hrms_source';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = '/dashboard/hrms/work-logs';

const ENT = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';
const DEP = '33333333-3333-4333-8333-333333333333';
const DES = '44444444-4444-4444-8444-444444444444';
const ASHA = '55555555-5555-4555-8555-555555555555';
const DEV = '66666666-6666-4666-8666-666666666666';
const P1 = 'a0000000-0000-4000-8000-000000000001';
const P2 = 'a0000000-0000-4000-8000-000000000002';

const TODAY = '2026-11-18';        // a Wednesday
const THIS_WEEK = '2026-11-16';
const LAST_WEEK = '2026-11-09';
const SENTINEL = 'LiveOnly Client SENTINEL-771100';

type Row = Record<string, unknown>;
interface Call { method: string; path: string; body: Row | undefined; n: number }
interface Failure { when: (c: Call) => boolean; status: number; error: string; code?: string }

class FakeTimesheets {
  calls: Call[] = [];
  employees: Row[] = [];
  projects: Row[] = [];
  sheets: Row[] = [];
  policy: Row = { max_per_day: 12, weekly_cap: 60, standard_week: 40 };
  tracked: string[] = [];
  failures: Failure[] = [];
  mode: 'ok' | 'not_ready' | 'error' = 'ok';
  private seq = 0;

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
  seedTs(): this {
    this.projects = [
      { id: P2, name: 'Internal: admin', client: 'Internal', kind: 'internal', billable: false, budget_hours: 200, prior_hours: 0, rate: 0, archived: false },
      { id: P1, name: 'Northwind: fulfilment', client: SENTINEL, kind: 'client', billable: true, budget_hours: 400, prior_hours: 40, rate: 500, archived: false },
    ];
    this.tracked = [ASHA];
    this.sheets = [
      { id: 'b0000000-0000-4000-8000-000000000001', employee_id: ASHA, week_start: THIS_WEEK, lines: [{ projectId: P1, hours: [8, 0, 0, 0, 0, 0, 0] }], status: 'draft', submitted_on: null, decided_on: null, decided_by: null, comment: null, trail: [] },
      { id: 'b0000000-0000-4000-8000-000000000002', employee_id: ASHA, week_start: LAST_WEEK, lines: [{ projectId: P1, hours: [8, 8, 8, 8, 8, 0, 0] }], status: 'submitted', submitted_on: '2026-11-14', decided_on: null, decided_by: null, comment: null, trail: [{ at: '2026-11-14', by: 'Asha Rao', action: 'Submitted' }] },
    ];
    return this;
  }
  full(): this { return this.seedPeople().seedTs(); }

  callsTo(method: string, pattern: RegExp): Call[] { return this.calls.filter((c) => c.method === method && pattern.test(c.path)); }
  sheet(emp: string, week: string): Row | undefined { return this.sheets.find((s) => s.employee_id === emp && s.week_start === week); }
  private ok(route: Route, data: unknown, status = 200) { return route.fulfill({ status, json: { success: true, data } }); }
  private err(route: Route, status: number, error: string, code = 'VALIDATION') { return route.fulfill({ status, json: { success: false, error, code } }); }
  private config() { return { policy: this.policy, tracked_ids: this.tracked }; }

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
    if (!path.startsWith('/timesheets')) return false;
    const p = path.slice('/timesheets'.length);

    if (method === 'GET' && p === '/bootstrap') {
      if (this.mode === 'not_ready') { await this.err(route, 503, 'HRMS storage is not set up yet', 'HRMS_NOT_READY'); return true; }
      if (this.mode === 'error') { await this.err(route, 500, 'Internal server error', 'INTERNAL_ERROR'); return true; }
      await this.ok(route, { ...this.config(), projects: this.projects, sheets: this.sheets, today: TODAY, server_time: '2026-11-18T09:00:00Z' });
      return true;
    }
    if (method === 'POST' && p === '/projects') {
      const row = { id: (body?.id as string) ?? crypto.randomUUID(), archived: false, ...body };
      this.projects.push(row);
      await this.ok(route, row, 201);
      return true;
    }
    const prj = p.match(/^\/projects\/([^/]+)$/);
    if (method === 'PUT' && prj) {
      const row = this.projects.find((x) => x.id === prj[1]);
      if (!row) { await this.err(route, 404, 'That project is not in the list.', 'NOT_FOUND'); return true; }
      Object.assign(row, body);
      await this.ok(route, row);
      return true;
    }
    if (method === 'PUT' && p === '/policy') { Object.assign(this.policy, body); await this.ok(route, this.config()); return true; }
    if (method === 'PUT' && p === '/tracked') { this.tracked = [...new Set((body?.employee_ids as string[]) ?? [])]; await this.ok(route, this.config()); return true; }

    const sh = p.match(/^\/sheets\/([^/]+)\/(\d{4}-\d{2}-\d{2})(\/submit|\/decide)?$/);
    if (sh) {
      const [, emp, week, cmd] = sh;
      let s = this.sheet(emp!, week!);
      if (method === 'PUT' && !cmd) {
        if (!this.tracked.includes(emp!)) { await this.err(route, 400, 'This person does not track time.'); return true; }
        if (s && !['draft', 'returned'].includes(String(s.status))) { await this.err(route, 400, 'This week is locked.'); return true; }
        if (!s) { s = { id: crypto.randomUUID(), employee_id: emp, week_start: week, status: 'draft', submitted_on: null, decided_on: null, decided_by: null, comment: null, trail: [] }; this.sheets.push(s); }
        s.lines = body?.lines;
        await this.ok(route, s);
        return true;
      }
      if (method === 'POST' && cmd === '/submit') {
        if (!s) { await this.err(route, 400, 'Enter some hours before submitting.'); return true; }
        if (!['draft', 'returned'].includes(String(s.status))) { await this.err(route, 400, 'This week is already with the approver.'); return true; }
        Object.assign(s, { status: 'submitted', submitted_on: TODAY, trail: [...(s.trail as Row[]), { at: TODAY, by: 'Asha Rao', action: 'Submitted' }] });
        await this.ok(route, s);
        return true;
      }
      if (method === 'POST' && cmd === '/decide') {
        if (!s || s.status !== 'submitted') { await this.err(route, 400, 'Only a submitted week can be approved or returned.'); return true; }
        const comment = String(body?.comment ?? '').trim();
        if (body?.decision === 'returned' && comment.length < 5) { await this.err(route, 400, 'Say what to fix when returning a week (at least 5 characters).'); return true; }
        Object.assign(s, { status: body?.decision, decided_on: TODAY, decided_by: 'Master Admin', comment: comment || null, trail: [...(s.trail as Row[]), { at: TODAY, by: 'Master Admin', action: body?.decision === 'approved' ? 'Approved' : 'Returned', ...(comment ? { comment } : {}) }] });
        await this.ok(route, s);
        return true;
      }
    }
    await this.err(route, 404, `Unhandled ${method} ${path}`, 'NOT_FOUND');
    return true;
  }
}

// ───────────────────────────── helpers ─────────────────────────────
async function open(page: Page, fake: FakeTimesheets, path = PAGE, source: 'live' | 'sample' | null = 'live'): Promise<void> {
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
  await expect(page.getByTestId('timesheets-ready')).toBeVisible(slow);
}
const dumpStorage = (page: Page): Promise<string> => page.evaluate(() => { const o: Record<string, string | null> = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; o[k] = localStorage.getItem(k); } return JSON.stringify(o); });

// ═════════════════════════════ wire mapping (no browser) ═════════════════════════════
test.describe('live timesheets: wire mapping (no browser)', () => {
  test('a project, a week and the settings map to the dashboard shapes', () => {
    expect(projectFromWire({ id: P1, name: 'N', client: 'C', kind: 'client', billable: true, budget_hours: '400', prior_hours: 40, rate: 500, archived: false }))
      .toEqual({ id: P1, name: 'N', client: 'C', kind: 'client', billable: true, budgetHours: 400, priorHours: 40, sampleRate: 500 });
    expect(projectFromWire({ id: P2, name: 'I', kind: 'internal', billable: false, archived: true }).archived).toBe(true);
    const s = sheetFromWire({ id: 'x', employee_id: ASHA, week_start: THIS_WEEK, lines: [{ projectId: P1, hours: [8, '2.5'] }], status: 'returned', submitted_on: '2026-11-17', decided_on: '2026-11-18', decided_by: 'HR', comment: 'Fix Tue', trail: [{ at: '2026-11-18', by: 'HR', action: 'Returned', comment: 'Fix Tue' }] });
    expect(s).toEqual({ id: `${ASHA}|${THIS_WEEK}`, employeeId: ASHA, weekStart: THIS_WEEK, lines: [{ projectId: P1, hours: [8, 2.5, 0, 0, 0, 0, 0] }], status: 'returned', submittedOn: '2026-11-17', decidedOn: '2026-11-18', decidedBy: 'HR', comment: 'Fix Tue', trail: [{ at: '2026-11-18', by: 'HR', action: 'Returned', comment: 'Fix Tue' }] });
    expect(configFromWire({ policy: { max_per_day: 10, weekly_cap: 50, standard_week: 40 }, tracked_ids: [ASHA] })).toEqual({ policy: { maxPerDay: 10, weeklyCap: 50, standardWeek: 40 }, trackedIds: [ASHA] });
    const boot = timesheetsBootstrapFromWire({ policy: {}, tracked_ids: [], projects: [], sheets: [], today: TODAY });
    expect(boot.today).toBe(TODAY);
    expect(boot.policy).toEqual({ maxPerDay: 12, weeklyCap: 60, standardWeek: 40 });
  });

  test('bodies are snake_case and carry only what the server needs', () => {
    expect(projectCreateBody({ name: ' Helio ', client: ' Helio Retail ', kind: 'client', billable: false, budgetHours: 10, priorHours: 0, rate: 900 }, P1))
      .toEqual({ id: P1, name: 'Helio', client: 'Helio Retail', kind: 'client', billable: false, budget_hours: 10, prior_hours: 0, rate: 0 });
    expect(policyBody({ maxPerDay: 10, weeklyCap: 50, standardWeek: 40 })).toEqual({ max_per_day: 10, weekly_cap: 50, standard_week: 40 });
    expect(trackedBody([ASHA, ASHA, DEV])).toEqual({ employee_ids: [ASHA, DEV] });
    expect(linesBody([{ projectId: P1, hours: [1, 2] }])).toEqual({ lines: [{ projectId: P1, hours: [1, 2, 0, 0, 0, 0, 0] }] });
    expect(decideBody('returned', '  Fix Tuesday  ')).toEqual({ decision: 'returned', comment: 'Fix Tuesday' });
  });
});

// ═════════════════════════════ sample mode is untouched ═════════════════════════════
test.describe('sample timesheets are unchanged', () => {
  test('the page makes no HRMS call and shows the Preview badge and the sample week', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/hrms')) hits.push(`${r.method()} ${r.url()}`); });
    await open(page, new FakeTimesheets().full(), PAGE, 'sample');
    await expect(page.getByRole('heading', { name: 'Timesheets', level: 1 })).toBeVisible(slow);
    await expect(page.getByText('Preview', { exact: true })).toBeVisible();
    await expect(page.getByTestId('week-label')).toHaveText('2 Nov to 8 Nov 2026');
    expect(hits).toEqual([]);
  });
});

// ═════════════════════════════ live bootstrap ═════════════════════════════
test.describe('live timesheets: bootstrap', () => {
  test('reads GET /timesheets/bootstrap; the current week is the server\'s; no browser-only note', async ({ page }) => {
    const fake = new FakeTimesheets().full();
    await open(page, fake);
    await waitLoaded(page);
    await expect(page.getByTestId('hrms-local-note')).toHaveCount(0);
    await expect(page.getByText(/Saved on the server\./)).toBeVisible();
    expect(fake.callsTo('GET', /^\/timesheets\/bootstrap$/).length).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('week-label')).toHaveText('16 Nov to 22 Nov 2026');
    await expect(page.getByTestId(`h-${P1}-0`)).toHaveValue('8');
    await expect(page.getByTestId(`h-${P1}-2`)).toBeEnabled();     // Wednesday 18 Nov is today on the server
    await expect(page.getByTestId(`h-${P1}-3`)).toBeDisabled();    // Thursday has not happened yet
  });

  test('a 503 shows the not-ready state; a 500 the error with its reason', async ({ page }) => {
    const fake = new FakeTimesheets().full();
    fake.mode = 'not_ready';
    await open(page, fake);
    await expect(page.getByTestId('timesheets-not-ready')).toBeVisible(slow);
    fake.mode = 'error';
    await page.getByTestId('timesheets-not-ready').getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('timesheets-error-message')).toContainText('Internal server error', slow);
  });
});

// ═════════════════════════════ setup: who tracks time, projects ═════════════════════════════
test.describe('live timesheets: setting up', () => {
  test('a fresh org chooses who tracks time and adds a project on the server', async ({ page }) => {
    const fake = new FakeTimesheets().seedPeople();
    await open(page, fake);
    await waitLoaded(page);
    await expect(page.getByTestId('no-tracked')).toBeVisible();
    await page.getByRole('button', { name: 'Choose who tracks time' }).click();
    const d = page.getByRole('dialog', { name: 'Who tracks time' });
    await d.getByTestId(`track-${DEV}`).check();
    await d.getByRole('button', { name: /^Save/ }).click();
    await expect(d).toHaveCount(0, slow);
    expect(fake.callsTo('PUT', /^\/timesheets\/tracked$/)[0]!.body).toEqual({ employee_ids: [DEV] });
    await expect(page.getByLabel('Person')).toHaveValue(DEV);

    await page.getByRole('tab', { name: /Projects/ }).click();
    await expect(page.getByTestId('no-projects')).toBeVisible();
    await page.getByRole('button', { name: 'Add project' }).click();
    const pd = page.getByRole('dialog', { name: 'Add a project' });
    await pd.getByLabel('Project name').fill('Helio Retail: portal');
    await pd.getByLabel('Client', { exact: true }).fill('Helio Retail');
    await pd.getByLabel('Hourly rate (₹)').fill('2200');
    await pd.getByRole('button', { name: 'Add project' }).click();
    await expect(pd).toHaveCount(0, slow);
    const body = fake.callsTo('POST', /^\/timesheets\/projects$/)[0]!.body!;
    expect(body).toMatchObject({ name: 'Helio Retail: portal', client: 'Helio Retail', kind: 'client', billable: true, rate: 2200 });
    expect(body.id).toMatch(UUID);
    await expect(page.getByTestId(`proj-${body.id}`)).toContainText('₹2,200/h');
  });
});

// ═════════════════════════════ a week ═════════════════════════════
test.describe('live timesheets: entering hours', () => {
  test('typing saves the whole week once after a pause, not once per keystroke', async ({ page }) => {
    const fake = new FakeTimesheets().full();
    await open(page, fake);
    await waitLoaded(page);
    const cell = page.getByTestId(`h-${P1}-1`);
    await cell.click();
    await cell.pressSequentially('7.25', { delay: 40 });
    await expect(page.getByTestId('week-total')).toHaveText('15.25');
    await expect.poll(() => fake.callsTo('PUT', new RegExp(`^/timesheets/sheets/${ASHA}/${THIS_WEEK}$`)).length, { timeout: 20_000 }).toBe(1);
    await page.waitForTimeout(1200);
    const puts = fake.callsTo('PUT', new RegExp(`^/timesheets/sheets/${ASHA}/${THIS_WEEK}$`));
    expect(puts).toHaveLength(1);
    expect(puts[0]!.body).toEqual({ lines: [{ projectId: P1, hours: [8, 7.25, 0, 0, 0, 0, 0] }] });
  });

  test('adding a row saves at once; a refused save puts the week back and says why', async ({ page }) => {
    const fake = new FakeTimesheets().full();
    await open(page, fake);
    await waitLoaded(page);
    await page.getByLabel('Add a project').selectOption({ label: 'Internal: admin' });
    await page.getByRole('button', { name: 'Add row' }).click();
    await expect(page.getByTestId(`row-${P2}`)).toBeVisible();
    await expect.poll(() => fake.callsTo('PUT', /^\/timesheets\/sheets\//).length, { timeout: 20_000 }).toBe(1);
    expect((fake.sheet(ASHA, THIS_WEEK)!.lines as Row[]).map((l) => l.projectId)).toEqual([P1, P2]);

    fake.failures.push({ when: (c) => c.method === 'PUT' && c.path.startsWith('/timesheets/sheets/'), status: 400, error: 'This week is locked.' });
    await page.getByTestId(`h-${P2}-0`).fill('2');
    await expect(toasts(page).filter({ hasText: 'This week is locked.' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(`h-${P2}-0`)).toHaveValue('');       // back to the server's copy
    await expect(page.getByTestId('week-total')).toHaveText('8');
  });

  test('submit saves any pending edit first, then submits; the week locks', async ({ page }) => {
    const fake = new FakeTimesheets().full();
    await open(page, fake);
    await waitLoaded(page);
    await page.getByTestId(`h-${P1}-1`).fill('6');
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(page.getByTestId('sheet-status')).toContainText('With the approver', slow);
    const put = fake.callsTo('PUT', new RegExp(`^/timesheets/sheets/${ASHA}/${THIS_WEEK}$`));
    const sub = fake.callsTo('POST', new RegExp(`^/timesheets/sheets/${ASHA}/${THIS_WEEK}/submit$`));
    expect(put).toHaveLength(1);
    expect(sub).toHaveLength(1);
    expect(put[0]!.n).toBeLessThan(sub[0]!.n);
    expect(fake.sheet(ASHA, THIS_WEEK)!.status).toBe('submitted');
    await expect(page.getByTestId(`h-${P1}-0`)).toBeDisabled();
    await expect(page.getByTestId('sheet-trail')).toContainText('Submitted by Asha Rao');
  });
});

test.describe('live timesheets: approvals and limits', () => {
  test('a return needs a comment (the server\'s words); approve locks the week', async ({ page }) => {
    const fake = new FakeTimesheets().full();
    await open(page, fake, `${PAGE}?tab=approvals`);
    await waitLoaded(page);
    await page.getByRole('button', { name: `Review Asha Rao, week of ${LAST_WEEK}` }).click();
    const d = page.getByRole('dialog', { name: /Review: Asha Rao/ });
    await d.getByLabel('Comment').fill('no');
    await d.getByRole('button', { name: 'Return with comment' }).click();
    await expect(d.getByRole('alert')).toContainText('at least 5 characters');
    expect(fake.callsTo('POST', /\/decide$/)).toHaveLength(0);   // checked before any call
    await d.getByRole('button', { name: 'Approve and lock' }).click();
    await expect(d).toHaveCount(0, slow);
    expect(fake.callsTo('POST', /\/decide$/)[0]!.body).toEqual({ decision: 'approved', comment: 'no' });
    expect(fake.sheet(ASHA, LAST_WEEK)!.status).toBe('approved');
  });

  test('the limits save on the server; an out-of-range one is refused before any call', async ({ page }) => {
    const fake = new FakeTimesheets().full();
    await open(page, fake);
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Edit limits' }).click();
    const dlg = page.getByRole('dialog', { name: 'Timesheet limits' });
    await dlg.getByLabel('Weekly cap that raises a flag').fill('5');
    await dlg.getByRole('button', { name: 'Save limits' }).click();
    await expect(dlg.getByRole('alert')).toContainText('weekly cap must be between');
    expect(fake.callsTo('PUT', /^\/timesheets\/policy$/)).toHaveLength(0);
    await dlg.getByLabel('Weekly cap that raises a flag').fill('50');
    await dlg.getByRole('button', { name: 'Save limits' }).click();
    await expect(dlg).toHaveCount(0, slow);
    expect(fake.callsTo('PUT', /^\/timesheets\/policy$/)[0]!.body).toEqual({ max_per_day: 12, weekly_cap: 50, standard_week: 40 });
    await expect(page.getByText(/a flag above 50 hours in a week/)).toBeVisible();
  });
});

test.describe('live timesheets: the data is never persisted', () => {
  test('nothing from the live timesheets reaches browser storage', async ({ page }) => {
    const fake = new FakeTimesheets().full();
    await open(page, fake, `${PAGE}?tab=projects`);
    await waitLoaded(page);
    await expect(page.getByTestId(`proj-${P1}`)).toContainText(SENTINEL);
    expect(await dumpStorage(page)).not.toContain(SENTINEL);
  });
});
