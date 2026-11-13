import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession } from './utils';
import { MASTER_USER } from './hrms-utils';
import { PREVIEW_TODAY } from '../src/lib/hrms/seed';
import { addDays, inr } from '../src/lib/hrms/format';
import {
  benefitsBootstrapFromWire, claimCreateBody, claimFromWire, enrolmentBody, enrolmentFromWire, extendWindowBody,
  moveClaimBody, planCreateBody, planFromWire, remindersBody, sendToPayrollBody, windowFromWire,
} from '../src/lib/hrms/rewards/live/benefitsWire';
import type { EnrolInput, NewClaimInput } from '../src/lib/hrms/rewards/store';

/**
 * HRMS live mode, phase 7: the Benefits slice on the server. The server is a stateful miniature of the benefits contract
 * behind page.route: it keeps the plan catalogue, enrolments, claims (with their append-only status trail), the enrolment
 * window and the sent-to-payroll map; it assigns claim refs, runs the claim state machine, and records every call. Plans /
 * enrolments / window / reminders are simple records; claims and send-to-payroll are commands. Compensation stays local
 * (and keeps its "saved in this browser only" note). Nothing here talks to a real backend or database; all data is fake.
 */

test.describe.configure({ timeout: 240_000 });
test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

const SOURCE_KEY = 'kinematic_hrms_source';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BENEFITS = '/dashboard/hrms/benefits';
const COMPENSATION = '/dashboard/hrms/compensation';

const ENT = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';
const DEP = '33333333-3333-4333-8333-333333333333';
const DES = '44444444-4444-4444-8444-444444444444';
const ASHA = '55555555-5555-4555-8555-555555555555';   // enrolled (h5, one child)
const DEV = '66666666-6666-4666-8666-666666666666';    // eligible, not yet enrolled
const MEERA = '77777777-7777-4777-8777-777777777777';  // eligible, not yet enrolled

const PLAN_HEALTH = 'b0000000-0000-4000-8000-000000000001';
const PLAN_ACCIDENT = 'b0000000-0000-4000-8000-000000000002';
const PLAN_MEAL = 'b0000000-0000-4000-8000-000000000003';
const PLAN_NPS = 'b0000000-0000-4000-8000-000000000004';
const PLAN_FLEX = 'b0000000-0000-4000-8000-000000000005';
const CLAIM_1 = 'c0000000-0000-4000-8000-000000000001';

// Values that live only on the SERVER in live mode and never in the sample seed: they must never turn up in browser storage.
const SENTINEL_PROVIDER = 'LiveOnly Insurer SENTINEL-918273';
const SENTINEL_HOSPITAL = 'LiveOnly Hospital SENTINEL-554433';

type Row = Record<string, unknown>;
interface Call { method: string; path: string; query: string; body: Row | undefined; n: number }
interface Failure { when: (c: Call) => boolean; status: number; error: string; code?: string; once?: boolean }

const CLAIM_NEXT: Record<string, string[]> = {
  submitted: ['in_review', 'rejected'], in_review: ['query', 'approved', 'rejected'], query: ['in_review', 'rejected'],
  approved: ['settled'], settled: [], rejected: ['in_review'],
};

// ───────────────────────────── a stateful benefits server (wire shape) ─────────────────────────────
class FakeBenefits {
  calls: Call[] = [];
  entities: Row[] = [];
  locations: Row[] = [];
  departments: Row[] = [];
  designations: Row[] = [];
  employees: Row[] = [];
  plans: Row[] = [];
  enrolments: Row[] = [];
  claims: Row[] = [];
  window: Row = { opens_on: '2026-11-01', closes_on: '2026-11-21', extensions: [] };
  reminders: Record<string, string> = {};
  sent: Record<string, Row> = {};
  failures: Failure[] = [];
  /** 'ok'; 'not_ready' answers 503 HRMS_NOT_READY on /benefits/bootstrap only. */
  mode: 'ok' | 'not_ready' = 'ok';
  private seq = 0;
  private claimSeq = 0;
  private sentRows: Record<string, number> = {};

  seedOrg(): this {
    this.entities = [{ id: ENT, name: 'Acme Retail Pvt Ltd', pan: null, tan: null, cin: null, gstin: null, address: { line1: '1 Main Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' }, registrations: [], signatory: null }];
    this.locations = [{ id: LOC, entity_id: ENT, name: 'Bengaluru Office', state: 'Karnataka', city: 'Bengaluru', address: null, metro: true, holiday_list_id: null }];
    this.departments = [{ id: DEP, name: 'Operations', head_id: null }];
    this.designations = [{ id: DES, name: 'Operations Associate', grade: 'E1' }];
    return this;
  }
  seedPeople(): this {
    const mk = (id: string, code: string, first: string, last: string) => ({
      id, code, first_name: first, last_name: last, email: `${first.toLowerCase()}@example.com`, mobile: '9876500001', gender: 'female', dob: '1992-05-05',
      entity_id: ENT, location_id: LOC, department_id: DEP, designation_id: DES, reporting_to_id: null, employment_type: 'permanent', status: 'active', join_date: '2024-04-01',
      probation_months: 6, notice_days: 30, aadhaar_verified: false, uan_status: 'none', pf_member: true, pf_on_actual_wage: false, pt_applicable: true, lwf_applicable: false,
      tax_regime: 'new', pay_mode: 'bank', annual_ctc: '600000', documents: [], history: [],
    });
    this.employees = [mk(ASHA, 'EMP-0001', 'Asha', 'Rao'), mk(DEV, 'EMP-0002', 'Dev', 'Nair'), mk(MEERA, 'EMP-0003', 'Meera', 'Das')];
    return this;
  }
  seedBenefits(): this {
    this.plans = [
      {
        id: PLAN_HEALTH, kind: 'health', name: 'Group health insurance', summary: 'Family floater cover shared by you and your family.', provider: SENTINEL_PROVIDER, auto: false,
        tiers: [
          { id: 'h3', label: '₹3 lakh', sumInsured: 300000, annualPremium: { self: 5200, spouse: 5200, child: 2800, parent: 11500 } },
          { id: 'h5', label: '₹5 lakh', sumInsured: 500000, annualPremium: { self: 7400, spouse: 7400, child: 3600, parent: 16800 } },
          { id: 'h10', label: '₹10 lakh', sumInsured: 1000000, annualPremium: { self: 11900, spouse: 11900, child: 5200, parent: 26500 } },
        ],
        employer_share_pct: { self: 100, spouse: 50, child: 50, parent: 0 },
        dependants: { maxSpouse: 1, maxChildren: 2, childMaxAge: 25, maxParents: 2, parentMaxAge: 80 },
        flex_monthly: null, baskets: null, tax_note: 'Sample tax note. Confirm with your advisor.', cover_start: '2027-01-01', renews_on: '2026-12-31',
      },
      { id: PLAN_ACCIDENT, kind: 'accident', name: 'Group accident cover', summary: 'Automatic cover for everyone.', provider: 'Sample insurer', auto: true, tiers: [{ id: 'a10', label: '₹10 lakh', sumInsured: 1000000, annualPremium: { self: 900 } }], employer_share_pct: { self: 100 }, dependants: null, flex_monthly: null, baskets: null, tax_note: 'Sample tax note.', cover_start: '2026-04-01', renews_on: '2027-03-31' },
      { id: PLAN_MEAL, kind: 'meal', name: 'Meal coupons', summary: 'Prepaid coupons from your pay.', provider: 'Sample vendor', auto: false, tiers: [{ id: 'm0', label: 'None', monthlyAmount: 0 }, { id: 'm1', label: '₹1,100 a month', monthlyAmount: 1100 }, { id: 'm2', label: '₹2,200 a month', monthlyAmount: 2200 }], employer_share_pct: { self: 0 }, dependants: null, flex_monthly: null, baskets: null, tax_note: 'Sample tax note.', cover_start: '2027-01-01', renews_on: '2027-06-30' },
      { id: PLAN_NPS, kind: 'nps', name: 'NPS contribution', summary: 'Move basic into NPS.', provider: 'Sample fund', auto: false, tiers: [{ id: 'n0', label: 'None', pctOfBasic: 0 }, { id: 'n5', label: '5% of basic', pctOfBasic: 5 }, { id: 'n10', label: '10% of basic', pctOfBasic: 10 }], employer_share_pct: { self: 0 }, dependants: null, flex_monthly: null, baskets: null, tax_note: 'Sample tax note.', cover_start: '2027-01-01', renews_on: '2027-04-01' },
      { id: PLAN_FLEX, kind: 'flex', name: 'Flexible allowance', summary: 'A monthly budget on bills.', provider: 'Company', auto: false, tiers: [], employer_share_pct: { self: 100 }, dependants: null, flex_monthly: 2500, baskets: [{ id: 'learning', label: 'Books and learning' }, { id: 'wellness', label: 'Wellness and gym' }], tax_note: 'Sample tax note.', cover_start: '2027-01-01', renews_on: '2027-03-31' },
    ];
    this.enrolments = [
      { id: 'd0000000-0000-4000-8000-000000000001', employee_id: ASHA, status: 'enrolled', submitted_on: '2026-11-05', by: 'Master Admin', health_tier: 'h5', dependants: [{ id: 'dep_s1', name: 'Kid Rao', relation: 'child', dob: '2015-03-01' }], meal_tier: null, nps_tier: null, flex: {} },
    ];
    this.claims = [
      { id: CLAIM_1, ref: 'TPA-26-04261', employee_id: ASHA, patient: 'Self', relation: 'self', kind: 'cashless', hospital: 'City Care Hospital', claimed: 22500, approved: null, filed_on: '2026-11-05', closed_on: null, status: 'submitted', rejection_reason: null, trail: [{ on: '2026-11-05', status: 'submitted', note: 'Claim registered.', by: 'TPA desk' }] },
    ];
    this.window = { opens_on: '2026-11-01', closes_on: '2026-11-21', extensions: [] };
    return this;
  }
  full(): this { return this.seedOrg().seedPeople().seedBenefits(); }

  callsTo(method: string, pattern: RegExp): Call[] { return this.calls.filter((c) => c.method === method && pattern.test(c.path)); }
  lastBody(method: string, pattern: RegExp): Row | undefined { const c = this.callsTo(method, pattern); return c.length ? c[c.length - 1]!.body : undefined; }
  claim(id: string): Row { return this.claims.find((c) => c.id === id)!; }
  claimByRef(ref: string): Row { return this.claims.find((c) => c.ref === ref)!; }
  enrolment(id: string): Row | undefined { return this.enrolments.find((e) => e.employee_id === id); }
  private isEmp(id: unknown): boolean { return this.employees.some((e) => e.id === id); }
  private ok(route: Route, data: unknown, status = 200) { return route.fulfill({ status, json: { success: true, data } }); }
  private err(route: Route, status: number, error: string, code: string) { return route.fulfill({ status, json: { success: false, error, code } }); }

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
    if (fi >= 0) { const f = this.failures[fi]!; if (f.once !== false) this.failures.splice(fi, 1); await this.err(route, f.status, f.error, f.code ?? 'VALIDATION'); return true; }

    // core people bootstrap (payroll/time/lifecycle/privacy fall through to mockApi's empty default)
    if (method === 'GET' && path === '/bootstrap') {
      await this.ok(route, { entities: this.entities, locations: this.locations, departments: this.departments, designations: this.designations, employees: this.employees, settings: { employee_code_prefix: 'EMP-' }, server_time: '2026-11-07T09:00:00Z' });
      return true;
    }
    if (!path.startsWith('/benefits')) return false;   // other sections: let the default mock answer empty success
    const p = path.slice('/benefits'.length);

    if (method === 'GET' && p === '/bootstrap') {
      if (this.mode === 'not_ready') { await this.err(route, 503, 'HRMS storage is not set up yet', 'HRMS_NOT_READY'); return true; }
      await this.ok(route, { plans: this.plans, enrolments: this.enrolments, claims: this.claims, window: this.window, reminders: this.reminders, sent: this.sent, server_time: '2026-11-07T09:00:00Z' });
      return true;
    }
    if (method === 'POST' && p === '/plans') { await this.createPlan(route, body ?? {}); return true; }
    if (method === 'POST' && p === '/enrolments') { await this.submitEnrolment(route, body ?? {}); return true; }
    if (method === 'PUT' && p === '/window') { await this.setWindow(route, body ?? {}); return true; }
    if (method === 'POST' && p === '/window/extend') { await this.extendWindow(route, body ?? {}); return true; }
    if (method === 'POST' && p === '/reminders') { await this.logReminders(route, body ?? {}); return true; }
    if (method === 'POST' && p === '/claims') { await this.registerClaim(route, body ?? {}); return true; }
    const move = p.match(/^\/claims\/([^/]+)\/move$/);
    if (method === 'POST' && move) { await this.moveClaim(route, move[1]!, body ?? {}); return true; }
    if (method === 'POST' && p === '/send-to-payroll') { await this.sendToPayroll(route, body ?? {}); return true; }
    await this.err(route, 404, `Unhandled ${method} ${path}`, 'NOT_FOUND');
    return true;
  }

  private async createPlan(route: Route, b: Row): Promise<void> {
    if (b.id && this.plans.some((p) => p.id === b.id)) { await this.ok(route, this.plans.find((p) => p.id === b.id)); return; }   // idempotent
    const plan: Row = { id: (b.id as string) ?? crypto.randomUUID(), ...b, created_at: '2026-11-07T09:00:00Z', updated_at: '2026-11-07T09:00:00Z' };
    this.plans.push(plan);
    await this.ok(route, plan, 201);
  }

  private async submitEnrolment(route: Route, b: Row): Promise<void> {
    if (!this.isEmp(b.employee_id)) { await this.err(route, 400, 'Choose an employee.', 'VALIDATION'); return; }
    const en: Row = {
      id: this.enrolment(String(b.employee_id))?.id ?? crypto.randomUUID(), employee_id: b.employee_id, status: b.status,
      submitted_on: PREVIEW_TODAY, by: 'Master Admin', health_tier: b.health_tier ?? null, dependants: b.dependants ?? [],
      meal_tier: b.meal_tier ?? null, nps_tier: b.nps_tier ?? null, flex: b.flex ?? {},
    };
    const i = this.enrolments.findIndex((e) => e.employee_id === b.employee_id);
    if (i >= 0) this.enrolments[i] = en; else this.enrolments.push(en);
    delete this.reminders[String(b.employee_id)];
    await this.ok(route, en);
  }

  private async setWindow(route: Route, b: Row): Promise<void> {
    this.window = { opens_on: b.opens_on ?? this.window.opens_on, closes_on: b.closes_on ?? this.window.closes_on, extensions: (this.window.extensions as Row[]) ?? [] };
    await this.ok(route, this.window);
  }

  private async extendWindow(route: Route, b: Row): Promise<void> {
    const days = Number(b.days) || 0;
    const base = String(this.window.closes_on) > PREVIEW_TODAY ? String(this.window.closes_on) : PREVIEW_TODAY;
    this.window = { opens_on: this.window.opens_on, closes_on: addDays(base, days), extensions: [...((this.window.extensions as Row[]) ?? []), { on: PREVIEW_TODAY, days, reason: b.reason, by: 'Master Admin' }] };
    await this.ok(route, this.window);
  }

  private async logReminders(route: Route, b: Row): Promise<void> {
    for (const id of (b.employee_ids as string[]) ?? []) this.reminders[id] = PREVIEW_TODAY;
    await this.ok(route, { reminders: this.reminders });
  }

  private async registerClaim(route: Route, b: Row): Promise<void> {
    const ref = `TPA-LIVE-${++this.claimSeq}`;
    const claim: Row = {
      id: (b.id as string) ?? crypto.randomUUID(), ref, employee_id: b.employee_id, patient: b.patient ?? 'Self', relation: b.relation ?? 'self',
      kind: b.kind ?? 'cashless', hospital: b.hospital ?? '', claimed: Number(b.claimed) || 0, approved: null, filed_on: PREVIEW_TODAY, closed_on: null,
      status: 'submitted', rejection_reason: null, trail: [{ on: PREVIEW_TODAY, status: 'submitted', note: 'Claim registered.', by: 'Master Admin' }],
    };
    this.claims.push(claim);
    await this.ok(route, { claim }, 201);
  }

  private async moveClaim(route: Route, id: string, b: Row): Promise<void> {
    const c = this.claims.find((x) => x.id === id);
    if (!c) { await this.err(route, 404, 'That claim is not in the tracker.', 'NOT_FOUND'); return; }
    const from = String(c.status);
    const to = String(b.to);
    if (!(CLAIM_NEXT[from] ?? []).includes(to)) { await this.err(route, 409, `A claim that is ${from.replace('_', ' ')} cannot move to ${to.replace('_', ' ')}.`, 'CLAIM_STATE'); return; }
    if (to === 'approved' && !(b.approved != null && Number(b.approved) > 0 && Number(b.approved) <= Number(c.claimed))) { await this.err(route, 400, 'Enter an approved amount that is more than 0 and not more than the amount claimed.', 'VALIDATION'); return; }
    if (to === 'rejected' && !String(b.reason ?? '').trim()) { await this.err(route, 400, 'A rejection needs a reason, so the employee can reply.', 'VALIDATION'); return; }
    c.status = to;
    if (to === 'approved') c.approved = Math.round(Number(b.approved));
    if (to === 'settled' || to === 'rejected') c.closed_on = PREVIEW_TODAY;
    if (to === 'rejected') { c.rejection_reason = String(b.reason).trim(); c.approved = null; }
    (c.trail as Row[]).push({ on: PREVIEW_TODAY, status: to, note: (b.note as string) ?? null, by: 'Master Admin' });
    await this.ok(route, { claim: c });
  }

  private async sendToPayroll(route: Route, b: Row): Promise<void> {
    const month = String(b.month);
    const removed = this.sentRows[month] ?? 0;
    const added = this.enrolments.filter((e) => e.status === 'enrolled').length;
    const total = 150 * added;
    this.sentRows[month] = added;
    this.sent[month] = { on: PREVIEW_TODAY, rows: added, total, by: 'Master Admin' };
    await this.ok(route, { removed, added, total });
  }
}

// ───────────────────────────── helpers ─────────────────────────────
async function open(page: Page, fake: FakeBenefits, path = BENEFITS, source: 'live' | 'sample' | null = 'live'): Promise<void> {
  await seedSession(page, MASTER_USER);
  if (source) await page.addInitScript(([k, v]) => { try { if (window.localStorage.getItem(k!) === null) window.localStorage.setItem(k!, v!); } catch { /* blocked */ } }, [SOURCE_KEY, source]);
  await mockApi(page, { me: { success: true, data: MASTER_USER }, onRequest: (route, url, method) => fake.handle(route, url, method) });
  await page.goto(path);
  await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
}
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const toasts = (page: Page) => page.locator('[data-sonner-toast]');
const slow = { timeout: 60_000 };

async function waitBenefitsLoaded(page: Page) {
  await expect(page.getByTestId('hrms-live-loading')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('benefits-stats')).toBeVisible(slow);
}
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return errors;
}
const dumpStorage = (page: Page): Promise<string> => page.evaluate(() => { const o: Record<string, string | null> = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; o[k] = localStorage.getItem(k); } return JSON.stringify(o); });
async function closeModals(page: Page) {
  for (let i = 0; i < 4 && await page.getByRole('dialog').count() > 0; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

// ═════════════════════════════ pure logic: wire mapping (no browser) ═════════════════════════════
test.describe('live benefits: wire mapping (no browser)', () => {
  test('a plan maps to the dashboard shape: snake to camel, nested objects pass through, null means nothing', () => {
    const p = planFromWire({
      id: PLAN_HEALTH, kind: 'health', name: 'Group health', summary: 'cover', provider: 'Orchid', auto: false,
      tiers: [{ id: 'h5', label: '₹5 lakh', sumInsured: 500000, annualPremium: { self: 7400, child: 3600 } }],
      employer_share_pct: { self: 100, child: 50 }, dependants: { maxSpouse: 1, maxChildren: 2, childMaxAge: 25, maxParents: 2, parentMaxAge: 80 },
      flex_monthly: null, baskets: null, tax_note: 'note', cover_start: '2027-01-01', renews_on: '2026-12-31', created_at: 'x', updated_at: 'y',
    });
    expect(p).toMatchObject({ id: PLAN_HEALTH, kind: 'health', name: 'Group health', provider: 'Orchid', auto: false, taxNote: 'note', coverStart: '2027-01-01', renewsOn: '2026-12-31' });
    expect(p.tiers[0]).toEqual({ id: 'h5', label: '₹5 lakh', sumInsured: 500000, annualPremium: { self: 7400, child: 3600 } });
    expect(p.employerSharePct).toEqual({ self: 100, child: 50 });
    expect(p.dependants).toEqual({ maxSpouse: 1, maxChildren: 2, childMaxAge: 25, maxParents: 2, parentMaxAge: 80 });
    expect(p.flexMonthly).toBeUndefined();
    expect(p.baskets).toBeUndefined();
    const flex = planFromWire({ id: PLAN_FLEX, kind: 'flex', name: 'Flex', summary: '', provider: 'Co', auto: false, tiers: [], employer_share_pct: { self: 100 }, dependants: null, flex_monthly: 2500, baskets: [{ id: 'learning', label: 'Books' }], tax_note: '', cover_start: '2027-01-01', renews_on: '2027-03-31' });
    expect(flex.flexMonthly).toBe(2500);
    expect(flex.baskets).toEqual([{ id: 'learning', label: 'Books' }]);
  });

  test('an enrolment is keyed by employee and keeps only the fields the server sent', () => {
    const en = enrolmentFromWire({ id: 'x', employee_id: ASHA, status: 'enrolled', submitted_on: '2026-11-05', by: 'HR', health_tier: 'h5', dependants: [{ id: 'dep_s1', name: 'Kid', relation: 'child', dob: '2015-03-01' }], meal_tier: null, nps_tier: 'n5', flex: { learning: 1000 } });
    expect(en).toEqual({ employeeId: ASHA, status: 'enrolled', submittedOn: '2026-11-05', by: 'HR', healthTier: 'h5', dependants: [{ id: 'dep_s1', name: 'Kid', relation: 'child', dob: '2015-03-01' }], npsTier: 'n5', flex: { learning: 1000 } });
    expect(en).not.toHaveProperty('mealTier');
    const waived = enrolmentFromWire({ employee_id: DEV, status: 'waived', submitted_on: '2026-11-06', by: 'HR', health_tier: null, dependants: [], meal_tier: null, nps_tier: null, flex: {} });
    expect(waived).toEqual({ employeeId: DEV, status: 'waived', submittedOn: '2026-11-06', by: 'HR', dependants: [], flex: {} });
  });

  test('a claim maps its trail (append-only) and drops the fields the server left null', () => {
    const c = claimFromWire({ id: CLAIM_1, ref: 'TPA-26-04261', employee_id: ASHA, patient: 'Self', relation: 'self', kind: 'cashless', hospital: 'City Care', claimed: '22500', approved: null, filed_on: '2026-11-05', closed_on: null, status: 'submitted', rejection_reason: null, trail: [{ on: '2026-11-05', status: 'submitted', note: 'Claim registered.', by: 'TPA' }] });
    expect(c).toEqual({ id: CLAIM_1, ref: 'TPA-26-04261', employeeId: ASHA, patient: 'Self', relation: 'self', kind: 'cashless', hospital: 'City Care', claimed: 22500, filedOn: '2026-11-05', status: 'submitted', trail: [{ on: '2026-11-05', status: 'submitted', note: 'Claim registered.', by: 'TPA' }] });
    expect(c).not.toHaveProperty('approved');
    expect(c).not.toHaveProperty('closedOn');
    const settled = claimFromWire({ id: 'x', ref: 'R', employee_id: ASHA, patient: 'Self', relation: 'self', kind: 'cashless', hospital: 'H', claimed: 1000, approved: 900, filed_on: '2026-10-01', closed_on: '2026-10-05', status: 'settled', rejection_reason: null, trail: [] });
    expect(settled.approved).toBe(900);
    expect(settled.closedOn).toBe('2026-10-05');
  });

  test('the window maps opens/closes and its extensions; bootstrap maps every collection', () => {
    const w = windowFromWire({ opens_on: '2026-11-01', closes_on: '2026-11-21', extensions: [{ on: '2026-11-07', days: 7, reason: 'Diwali', by: 'HR' }] });
    expect(w).toEqual({ opensOn: '2026-11-01', closesOn: '2026-11-21', extensions: [{ on: '2026-11-07', days: 7, reason: 'Diwali', by: 'HR' }] });
    const boot = benefitsBootstrapFromWire({ plans: [{ id: PLAN_HEALTH, kind: 'health', name: 'H', summary: '', provider: '', auto: false, tiers: [], employer_share_pct: {}, tax_note: '', cover_start: '2027-01-01', renews_on: '2026-12-31' }], enrolments: [{ employee_id: ASHA, status: 'enrolled', submitted_on: '2026-11-05', by: 'HR', dependants: [], flex: {} }], claims: [], window: { opens_on: '2026-11-01', closes_on: '2026-11-21', extensions: [] }, reminders: { [DEV]: '2026-11-07' }, sent: { '2027-01': { on: '2026-11-07', rows: 2, total: 300, by: 'HR' } }, server_time: '2026-11-07T09:00:00Z' });
    expect(boot.plans).toHaveLength(1);
    expect(boot.enrolments[0]!.employeeId).toBe(ASHA);
    expect(boot.reminders).toEqual({ [DEV]: '2026-11-07' });
    expect(boot.sent['2027-01']).toEqual({ on: '2026-11-07', rows: 2, total: 300, by: 'HR' });
    expect(boot.serverTime).toBe('2026-11-07T09:00:00Z');
  });

  test('bodies are snake_case: a plan carries a UUID id; enrolment drops empty flex; claim defaults the patient; move/extend/send carry only what is needed', () => {
    const planBody = planCreateBody({ id: PLAN_MEAL, kind: 'meal', name: 'Meal', summary: 's', provider: 'v', auto: false, tiers: [{ id: 'm1', label: '₹1,100', monthlyAmount: 1100 }], employerSharePct: { self: 0 }, taxNote: 't', coverStart: '2027-01-01', renewsOn: '2027-06-30' }, PLAN_MEAL);
    expect(planBody).toMatchObject({ id: PLAN_MEAL, kind: 'meal', name: 'Meal', employer_share_pct: { self: 0 }, flex_monthly: null, baskets: null, tax_note: 't', cover_start: '2027-01-01', renews_on: '2027-06-30' });
    expect(Object.keys(planBody).some((k) => /[A-Z]/.test(k))).toBe(false);

    const enInput: EnrolInput = { employeeId: ASHA, status: 'enrolled', healthTier: 'h5', dependants: [{ id: 'dep_s1', name: ' Kid ', relation: 'child', dob: '2015-03-01' }], mealTier: 'm1', npsTier: 'n0', flex: { learning: 1000, wellness: 0 } };
    const enBody = enrolmentBody(enInput);
    expect(enBody).toEqual({ employee_id: ASHA, status: 'enrolled', health_tier: 'h5', dependants: [{ id: 'dep_s1', name: 'Kid', relation: 'child', dob: '2015-03-01' }], meal_tier: 'm1', nps_tier: 'n0', flex: { learning: 1000 } });
    const waived = enrolmentBody({ employeeId: DEV, status: 'waived', dependants: [], flex: {} });
    expect(waived).toEqual({ employee_id: DEV, status: 'waived', health_tier: null, dependants: [], meal_tier: null, nps_tier: null, flex: {} });

    const claimInput: NewClaimInput = { employeeId: ASHA, patient: '', relation: 'self', kind: 'cashless', hospital: ' City Care ', claimed: 22500.6 };
    const claimBody = claimCreateBody(claimInput, CLAIM_1);
    expect(claimBody).toEqual({ id: CLAIM_1, employee_id: ASHA, patient: 'Self', relation: 'self', kind: 'cashless', hospital: 'City Care', claimed: 22501 });

    expect(moveClaimBody('approved', { note: ' ok ', approved: 2000.4 })).toEqual({ to: 'approved', note: 'ok', approved: 2000 });
    expect(moveClaimBody('in_review', {})).toEqual({ to: 'in_review', note: null });
    expect(moveClaimBody('rejected', { reason: ' not covered ' })).toEqual({ to: 'rejected', note: null, reason: 'not covered' });
    expect(extendWindowBody(7, ' Diwali ')).toEqual({ days: 7, reason: 'Diwali' });
    expect(remindersBody([DEV, MEERA])).toEqual({ employee_ids: [DEV, MEERA] });
    expect(sendToPayrollBody('2027-01')).toEqual({ month: '2027-01' });
  });
});

// ═════════════════════════════ sample mode is untouched ═════════════════════════════
test.describe('sample benefits is unchanged', () => {
  test('the benefits page makes no HRMS call, shows the Preview badge and renders the sample data', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/hrms')) hits.push(`${r.method()} ${r.url()}`); });
    const fake = new FakeBenefits().full();
    await open(page, fake, BENEFITS, 'sample');
    await expect(page.getByTestId('hrms-preview-banner')).toHaveAttribute('data-source', 'sample');
    await expect(page.getByRole('heading', { name: 'Benefits', exact: true })).toBeVisible(slow);
    await expect(page.getByText('Preview', { exact: true })).toBeVisible();
    await expect(page.getByTestId('benefits-stats')).toContainText('57%', slow);   // the sample seed's 21-eligible company
    await expect(page.getByTestId('window-closes')).toHaveText('21 Nov 2026');
    await expect(page.getByTestId('activity-log')).toBeVisible();                  // the local activity log is shown in sample mode
    await expect(page.getByText(/Sample data, kept in this browser/)).toBeVisible();   // the page's own sample description
    expect(hits).toEqual([]);                                                      // no HRMS calls at all, benefits or otherwise
  });
});

// ═════════════════════════════ live bootstrap ═════════════════════════════
test.describe('live benefits: bootstrap', () => {
  test('the data is read from GET /benefits/bootstrap, with the server-backed banner and no browser-only note', async ({ page }) => {
    const fake = new FakeBenefits().full();
    const errors = watchErrors(page);
    await open(page, fake, BENEFITS);
    await waitBenefitsLoaded(page);
    await expect(page.getByTestId('hrms-preview-banner')).toHaveAttribute('data-source', 'live');
    await expect(page.getByText(/Saved on the server\./)).toBeVisible();      // the page's own live description
    await expect(page.getByTestId('hrms-local-note')).toHaveCount(0);         // benefits is server-backed now
    expect(fake.callsTo('GET', /^\/benefits\/bootstrap$/)).toHaveLength(1);
    // the seeded data: 1 of 3 eligible answered, the window is open, one open claim
    const stats = page.getByTestId('benefits-stats');
    await expect(stats).toContainText('1 of 3 eligible have answered');
    await expect(stats).toContainText('14 days left');
    await expect(page.getByTestId('window-closes')).toHaveText('21 Nov 2026');
    await expect(page.getByRole('row', { name: /Asha Rao/ })).toContainText('Enrolled, ₹5 lakh');
    await expect(page.getByRole('row', { name: /Dev Nair/ })).toContainText('Not yet');
    expect(errors).toEqual([]);
  });

  test('a 503 degrades the Benefits page on its own; compensation keeps working with the browser-only note', async ({ page }) => {
    const fake = new FakeBenefits().full();
    fake.mode = 'not_ready';
    await open(page, fake, BENEFITS);
    await expect(page.getByTestId('benefits-not-ready')).toBeVisible(slow);
    await expect(page.getByTestId('benefits-not-ready')).toContainText('HRMS storage is not set up yet');
    await expect(page.getByTestId('benefits-stats')).toHaveCount(0);
    // compensation (local) still works and still says it is saved in this browser only
    await page.goto(COMPENSATION);
    await expect(page.getByRole('heading', { name: 'Compensation', exact: true })).toBeVisible(slow);
    await expect(page.getByTestId('hrms-local-note')).toBeVisible();
  });
});

// ═════════════════════════════ empty state: add the standard plans ═════════════════════════════
test.describe('live benefits: the empty state seeds the standard plans on the server', () => {
  test('a fresh org offers "Add the standard benefit plans", which POSTs the catalogue and opens a window', async ({ page }) => {
    const fake = new FakeBenefits().seedOrg().seedPeople();   // people, but no plans/enrolments/claims
    fake.plans = []; fake.enrolments = []; fake.claims = []; fake.window = { opens_on: '', closes_on: '', extensions: [] };
    await open(page, fake, BENEFITS);
    await expect(page.getByTestId('hrms-live-loading')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('benefits-empty')).toBeVisible(slow);
    await page.getByTestId('add-standard-benefit-plans').click();
    await expect.poll(() => fake.callsTo('POST', /^\/benefits\/plans$/).length, { timeout: 20_000 }).toBe(5);
    // each plan create body is snake_case and carries a UUID id; the window is set
    const planBody = fake.callsTo('POST', /^\/benefits\/plans$/)[0]!.body!;
    expect(planBody.id).toMatch(UUID);
    expect(Object.keys(planBody).some((k) => /[A-Z]/.test(k))).toBe(false);
    expect(fake.callsTo('PUT', /^\/benefits\/window$/)).toHaveLength(1);
    expect(fake.plans.map((p) => p.kind).sort()).toEqual(['accident', 'flex', 'health', 'meal', 'nps']);
    // the page becomes usable from the server's answer
    await expect(page.getByTestId('benefits-stats')).toBeVisible(slow);
    await expect(page.getByTestId('benefits-empty')).toHaveCount(0);
    await expect(page.getByTestId('window-closes')).toHaveText('21 Nov 2026');   // opened today + 14 days (PREVIEW_TODAY)
  });
});

// ═════════════════════════════ enrolment (simple record) ═════════════════════════════
test.describe('live benefits: enrolment submit routes to the server', () => {
  test('enrolling a pending employee POSTs to /benefits/enrolments and reflects the server row', async ({ page }) => {
    const fake = new FakeBenefits().full();
    await open(page, fake, BENEFITS);
    await waitBenefitsLoaded(page);
    await page.getByRole('button', { name: 'Enrol Dev Nair' }).click();
    const d = dialog(page, 'Enrolment: Dev Nair');
    await d.getByLabel('Cover amount').selectOption('h5');
    await d.getByRole('button', { name: 'Save enrolment' }).click();
    await expect(d).toHaveCount(0, slow);
    await expect.poll(() => fake.callsTo('POST', /^\/benefits\/enrolments$/).length, { timeout: 20_000 }).toBe(1);
    const body = fake.lastBody('POST', /^\/benefits\/enrolments$/)!;
    expect(body).toMatchObject({ employee_id: DEV, status: 'enrolled', health_tier: 'h5' });
    expect(Object.keys(body).some((k) => /[A-Z]/.test(k))).toBe(false);
    expect(fake.enrolment(DEV)).toMatchObject({ status: 'enrolled', health_tier: 'h5' });
    await expect(page.getByRole('row', { name: /Dev Nair/ })).toContainText('Enrolled, ₹5 lakh', slow);
    await expect(page.getByTestId('benefits-stats')).toContainText('2 of 3 eligible have answered');
  });

  test('a server eligibility refusal surfaces its plain reason and changes nothing', async ({ page }) => {
    const fake = new FakeBenefits().full();
    fake.failures.push({ when: (c) => c.method === 'POST' && /^\/benefits\/enrolments$/.test(c.path), status: 400, error: 'This person leaves before the cover starts, so they cannot enrol.', code: 'VALIDATION' });
    await open(page, fake, BENEFITS);
    await waitBenefitsLoaded(page);
    await page.getByRole('button', { name: 'Enrol Dev Nair' }).click();
    const d = dialog(page, 'Enrolment: Dev Nair');
    await d.getByLabel('Cover amount').selectOption('h5');
    await d.getByRole('button', { name: 'Save enrolment' }).click();
    await expect(toasts(page).filter({ hasText: 'This person leaves before the cover starts, so they cannot enrol.' })).toBeVisible({ timeout: 20_000 });
    expect(fake.enrolment(DEV)).toBeUndefined();     // the server never recorded it
    await closeModals(page);
    await expect(page.getByRole('row', { name: /Dev Nair/ })).toContainText('Not yet');
    await expect(page.getByTestId('benefits-stats')).toContainText('1 of 3 eligible have answered');
  });
});

// ═════════════════════════════ the window (simple record) ═════════════════════════════
test.describe('live benefits: the enrolment window extends on the server', () => {
  test('Extend window POSTs to /benefits/window/extend and the new date comes from the server', async ({ page }) => {
    const fake = new FakeBenefits().full();
    await open(page, fake, BENEFITS);
    await waitBenefitsLoaded(page);
    await page.getByTestId('window-card').getByRole('button', { name: 'Extend window' }).click();
    const d = dialog(page, 'Extend the enrolment window');
    await d.getByLabel('Reason').fill('Many people were on Diwali leave');
    await d.getByRole('button', { name: 'Extend window' }).click();
    await expect.poll(() => fake.callsTo('POST', /^\/benefits\/window\/extend$/).length, { timeout: 20_000 }).toBe(1);
    expect(fake.lastBody('POST', /^\/benefits\/window\/extend$/)).toEqual({ days: 7, reason: 'Many people were on Diwali leave' });
    await expect(page.getByTestId('window-closes')).toHaveText('28 Nov 2026');   // 21 Nov + 7, from the server's answer
    await expect(page.getByTestId('window-card')).toContainText('Extended by 7 days on 7 Nov 2026: Many people were on Diwali leave');
    await expect(page.getByTestId('benefits-stats')).toContainText('21 days left');
  });
});

// ═════════════════════════════ claims (commands) ═════════════════════════════
test.describe('live benefits: claims register and move through the trail on the server', () => {
  test('register a claim, then move it submitted -> in review -> approved -> settled; the trail stays append-only', async ({ page }) => {
    const fake = new FakeBenefits().full();
    await open(page, fake, BENEFITS);
    await waitBenefitsLoaded(page);
    await page.getByRole('tab', { name: /Health claims/ }).click();

    // register a claim for the enrolled employee
    await page.getByRole('button', { name: 'Register a claim' }).click();
    let d = dialog(page, 'Register a claim');
    await d.getByLabel('Employee').selectOption(ASHA);
    await d.getByLabel('Hospital or clinic').fill(SENTINEL_HOSPITAL);
    await d.getByLabel('Amount claimed (₹)').fill('40000');
    await d.getByRole('button', { name: 'Register claim' }).click();
    await expect(d).toHaveCount(0, slow);
    await expect.poll(() => fake.callsTo('POST', /^\/benefits\/claims$/).length, { timeout: 20_000 }).toBe(1);
    const regBody = fake.lastBody('POST', /^\/benefits\/claims$/)!;
    expect(regBody).toMatchObject({ employee_id: ASHA, patient: 'Self', relation: 'self', kind: 'cashless', hospital: SENTINEL_HOSPITAL, claimed: 40000 });
    expect(regBody.id).toMatch(UUID);
    const claim = fake.claimByRef('TPA-LIVE-1');
    expect(claim.status).toBe('submitted');

    // open it and move it along; each move is a server command whose answer updates the trail
    await page.getByRole('button', { name: 'Open claim TPA-LIVE-1' }).click();
    d = dialog(page, 'Claim TPA-LIVE-1');
    await d.getByRole('button', { name: 'Move to review' }).click();
    await d.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(() => fake.claim(claim.id as string).status, { timeout: 20_000 }).toBe('in_review');
    await expect(d).toContainText('In review');

    await d.getByRole('button', { name: 'Approve' }).click();
    await d.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(() => fake.claim(claim.id as string).status).toBe('approved');
    expect(fake.claim(claim.id as string).approved).toBe(40000);

    await d.getByRole('button', { name: 'Mark settled' }).click();
    await d.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(() => fake.claim(claim.id as string).status).toBe('settled');
    await expect(d).toContainText('A settled claim is final.');

    // the trail is append-only: four entries in order, kept on the server
    expect((fake.claim(claim.id as string).trail as Row[]).map((t) => t.status)).toEqual(['submitted', 'in_review', 'approved', 'settled']);
    const trail = d.locator('ol li');
    await expect(trail).toHaveCount(4);
    await expect(trail.nth(0)).toContainText('Submitted');
    await expect(trail.nth(3)).toContainText('Settled');
  });

  test('an illegal move shows the server\'s plain reason and changes nothing', async ({ page }) => {
    const fake = new FakeBenefits().full();
    await open(page, fake, BENEFITS);
    await waitBenefitsLoaded(page);
    await page.getByRole('tab', { name: /Health claims/ }).click();
    // move the seeded claim to in review first (legal), then force the server to refuse the next move (a race)
    await page.getByRole('button', { name: 'Open claim TPA-26-04261' }).click();
    const d = dialog(page, 'Claim TPA-26-04261');
    await d.getByRole('button', { name: 'Move to review' }).click();
    await d.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(() => fake.claim(CLAIM_1).status, { timeout: 20_000 }).toBe('in_review');

    fake.failures.push({ when: (c) => c.method === 'POST' && new RegExp(`^/benefits/claims/${CLAIM_1}/move$`).test(c.path), status: 409, error: 'That claim has already been settled by the insurer, so it cannot be approved again.', code: 'CLAIM_STATE' });
    await d.getByRole('button', { name: 'Approve' }).click();
    await d.getByRole('button', { name: 'Confirm' }).click();
    await expect(d.getByText('That claim has already been settled by the insurer, so it cannot be approved again.')).toBeVisible({ timeout: 20_000 });
    expect(fake.claim(CLAIM_1).status).toBe('in_review');   // the server never changed it
    expect((fake.claim(CLAIM_1).trail as Row[]).map((t) => t.status)).toEqual(['submitted', 'in_review']);
  });
});

// ═════════════════════════════ send to payroll (command) ═════════════════════════════
test.describe('live benefits: send to payroll reflects the server\'s { removed, added, total }', () => {
  test('sending creates deductions; sending again replaces them, and the banner reflects the answer', async ({ page }) => {
    const fake = new FakeBenefits().full();
    await open(page, fake, BENEFITS);
    await waitBenefitsLoaded(page);
    await page.getByRole('tab', { name: 'Cost and payroll' }).click();

    const send = async () => {
      await page.getByRole('button', { name: 'Send to payroll', exact: true }).click();
      await dialog(page, 'Send to payroll').getByRole('button', { name: /Send to payroll|Sending/ }).click();
    };
    await send();
    await expect.poll(() => fake.callsTo('POST', /^\/benefits\/send-to-payroll$/).length, { timeout: 20_000 }).toBe(1);
    expect(fake.lastBody('POST', /^\/benefits\/send-to-payroll$/)).toEqual({ month: '2027-01' });
    await expect(page.getByTestId('sent-banner')).toContainText('1 deductions', slow);
    await expect(page.getByTestId('sent-banner')).toContainText(inr(150));

    // sending again replaces the earlier rows: the server answers removed=1, and the toast says so
    await send();
    await expect(toasts(page).filter({ hasText: 'replacing 1 earlier rows' })).toBeVisible({ timeout: 20_000 });
    expect(fake.callsTo('POST', /^\/benefits\/send-to-payroll$/)).toHaveLength(2);
  });

  test('a frozen run is refused with the server\'s plain reason and no banner appears', async ({ page }) => {
    const fake = new FakeBenefits().full();
    fake.failures.push({ when: (c) => c.method === 'POST' && /^\/benefits\/send-to-payroll$/.test(c.path), status: 409, error: 'The payroll run for 2027-01 is frozen or paid, so its adjustments are locked.', code: 'RUN_LOCKED' });
    await open(page, fake, BENEFITS);
    await waitBenefitsLoaded(page);
    await page.getByRole('tab', { name: 'Cost and payroll' }).click();
    await page.getByRole('button', { name: 'Send to payroll', exact: true }).click();
    await dialog(page, 'Send to payroll').getByRole('button', { name: /Send to payroll|Sending/ }).click();
    await expect(toasts(page).filter({ hasText: 'The payroll run for 2027-01 is frozen or paid, so its adjustments are locked.' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('sent-banner')).toHaveCount(0);
  });
});

// ═════════════════════════════ storage + local Rewards slices ═════════════════════════════
test.describe('live benefits: the data is never persisted; compensation stays local', () => {
  test('nothing from the live benefits data reaches browser storage, while compensation remains the local seed with its note', async ({ page }) => {
    const fake = new FakeBenefits().full();
    await open(page, fake, BENEFITS);
    await waitBenefitsLoaded(page);
    // do a server command so there is live benefits state in memory (a claim carrying the sentinel hospital)
    await page.getByRole('tab', { name: /Health claims/ }).click();
    await page.getByRole('button', { name: 'Register a claim' }).click();
    const d = dialog(page, 'Register a claim');
    await d.getByLabel('Employee').selectOption(ASHA);
    await d.getByLabel('Hospital or clinic').fill(SENTINEL_HOSPITAL);
    await d.getByLabel('Amount claimed (₹)').fill('40000');
    await d.getByRole('button', { name: 'Register claim' }).click();
    await expect(d).toHaveCount(0, slow);
    await expect(page.getByRole('button', { name: 'Open claim TPA-LIVE-1' })).toBeVisible(slow);

    // The live benefits data (the sentinel provider and hospital among it) is held in memory only.
    const storage = await dumpStorage(page);
    expect(storage).not.toContain(SENTINEL_PROVIDER);
    expect(storage).not.toContain(SENTINEL_HOSPITAL);

    // compensation is local: visiting it keeps the rewards area store's compensation (the browser-only note stays).
    await page.goto(COMPENSATION);
    await expect(page.getByRole('heading', { name: 'Compensation', exact: true })).toBeVisible(slow);
    await expect(page.getByTestId('hrms-local-note')).toBeVisible();
    const after = await dumpStorage(page);
    const area = JSON.parse(JSON.parse(after)['kinematic_hrms_area_rewards_v1'] as string) as { benefits: { plans: { provider: string }[] }; comp: unknown };
    expect(area.comp).toBeTruthy();                                                      // compensation is still the local seed
    expect(area.benefits.plans.some((p) => p.provider === SENTINEL_PROVIDER)).toBe(false); // the local benefits seed, not the server's
    expect(after).not.toContain(SENTINEL_PROVIDER);
    expect(after).not.toContain(SENTINEL_HOSPITAL);
  });
});
