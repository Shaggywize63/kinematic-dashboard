import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession } from './utils';
import { MASTER_USER } from './hrms-utils';
import { PREVIEW_TODAY } from '../src/lib/hrms/seed';
import { inr } from '../src/lib/hrms/format';
import { DEFAULT_GUIDELINES } from '../src/lib/hrms/rewards/seed';
import {
  appliedBody, bandFromWire, bandSaveBody, compensationBootstrapFromWire, cycleFromWire, cycleUpdateBody, decideBody, guidelineBody,
  perfMapFromWire, perfNotesFromWire, perfResultFromWire, proposalBody, seedResultFromWire,
} from '../src/lib/hrms/rewards/live/compensationWire';

/**
 * HRMS live mode, phase 8: the Compensation slice on the server. The server is a stateful miniature of the compensation
 * contract behind page.route: it keeps the pay bands (keyed by grade), the per-person performance rows (band, evidence,
 * reply) and the merit-cycle singleton; it runs the cycle's status machine with the server's own refusal words, records an
 * issued increment once per person, and records every call. The increment flow also writes to the core people + letters
 * endpoints, which the fake answers too. Nothing here talks to a real backend or database; all data is fake.
 */

test.describe.configure({ timeout: 240_000 });
test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

const SOURCE_KEY = 'kinematic_hrms_source';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPENSATION = '/dashboard/hrms/compensation';

const ENT = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';
const DEP = '33333333-3333-4333-8333-333333333333';
const DES_E1 = '44444444-4444-4444-8444-444444444441';
const DES_E2 = '44444444-4444-4444-8444-444444444442';
const ASHA = '55555555-5555-4555-8555-555555555555';   // E1, ₹3,50,000 (compa 1.00)
const DEV = '66666666-6666-4666-8666-666666666666';    // E1, ₹3,30,000
const MEERA = '77777777-7777-4777-8777-777777777777';  // E2, ₹6,00,000
const CYCLE = 'c0000000-0000-4000-8000-000000000008';
const TPL_INC = 'd0000000-0000-4000-8000-000000000001';

// Values that live only on the SERVER in live mode and never in the sample seed: they must never turn up in browser storage.
const SENTINEL_EVIDENCE = 'LiveOnly evidence SENTINEL-662211';
const SENTINEL_CYCLE = 'LiveOnly merit cycle SENTINEL-443322';

type Row = Record<string, unknown>;
interface Call { method: string; path: string; body: Row | undefined; n: number }
interface Failure { when: (c: Call) => boolean; status: number; error: string; code?: string }

const STANDARD_BANDS: Row[] = [
  { grade: 'W1', min: 210000, mid: 250000, max: 290000, market: 262000, published: true },
  { grade: 'E1', min: 300000, mid: 350000, max: 400000, market: 345000, published: true },
  { grade: 'E2', min: 480000, mid: 600000, max: 700000, market: 615000, published: true },
  { grade: 'E3', min: 1200000, mid: 1600000, max: 2000000, market: 1650000, published: true },
  { grade: 'M1', min: 800000, mid: 1000000, max: 1200000, market: 1020000, published: true },
  { grade: 'M3', min: 1800000, mid: 2400000, max: 3000000, market: 2350000, published: false },
];

// ───────────────────────────── a stateful compensation server (wire shape) ─────────────────────────────
class FakeComp {
  calls: Call[] = [];
  employees: Row[] = [];
  bands: Row[] = [];
  perf: Record<string, Row> = {};   // employee_id -> { band, evidence, reply }
  cycle: Row = FakeComp.emptyCycle();
  letterTemplates: Row[] = [{ id: TPL_INC, type: 'increment', name: 'Increment letter', body: 'Dear {{employee_name}},\n\nYour annual CTC is revised to {{ctc}} with effect from {{effective_date}}.' }];
  letters: Row[] = [];
  failures: Failure[] = [];
  /** 'ok'; 'not_ready' answers 503 HRMS_NOT_READY on /compensation/bootstrap; 'error' answers 500 there. */
  mode: 'ok' | 'not_ready' | 'error' = 'ok';
  private seq = 0;

  static emptyCycle(): Row {
    return { id: null, name: 'Merit cycle', effective_on: PREVIEW_TODAY, budget_pct: 0, status: 'draft', decision: null, guidelines: DEFAULT_GUIDELINES(), proposals: {}, applied: {} };
  }

  seedPeople(): this {
    const mk = (id: string, code: string, first: string, last: string, des: string, ctc: string, gender: string) => ({
      id, code, first_name: first, last_name: last, email: `${first.toLowerCase()}@example.com`, mobile: '9876500001', gender, dob: '1992-05-05',
      entity_id: ENT, location_id: LOC, department_id: DEP, designation_id: des, reporting_to_id: null, employment_type: 'permanent', status: 'active', join_date: '2024-04-01',
      probation_months: 6, notice_days: 30, aadhaar_verified: false, uan_status: 'none', pf_member: true, pf_on_actual_wage: false, pt_applicable: true, lwf_applicable: false,
      tax_regime: 'new', pay_mode: 'bank', annual_ctc: ctc, documents: [], history: [],
    });
    this.employees = [
      mk(ASHA, 'EMP-0001', 'Asha', 'Rao', DES_E1, '350000', 'female'),
      mk(DEV, 'EMP-0002', 'Dev', 'Nair', DES_E1, '330000', 'male'),
      mk(MEERA, 'EMP-0003', 'Meera', 'Das', DES_E2, '600000', 'female'),
    ];
    return this;
  }
  seedComp(): this {
    this.bands = STANDARD_BANDS.filter((b) => b.grade === 'E1' || b.grade === 'E2').map((b) => ({ ...b, published: b.grade === 'E1' }));
    this.perf = { [MEERA]: { band: 'exceeds', evidence: SENTINEL_EVIDENCE, reply: null } };
    this.cycle = { ...FakeComp.emptyCycle(), id: CYCLE, name: SENTINEL_CYCLE, effective_on: '2027-01-01', budget_pct: 6 };
    return this;
  }
  full(): this { return this.seedPeople().seedComp(); }

  callsTo(method: string, pattern: RegExp): Call[] { return this.calls.filter((c) => c.method === method && pattern.test(c.path)); }
  lastBody(method: string, pattern: RegExp): Row | undefined { const c = this.callsTo(method, pattern); return c.length ? c[c.length - 1]!.body : undefined; }
  band(grade: string): Row | undefined { return this.bands.find((b) => b.grade === grade); }
  private ok(route: Route, data: unknown, status = 200) { return route.fulfill({ status, json: { success: true, data } }); }
  private err(route: Route, status: number, error: string, code = 'VALIDATION') { return route.fulfill({ status, json: { success: false, error, code } }); }
  private open(): boolean { return this.cycle.status === 'draft' || this.cycle.status === 'returned'; }
  private perfOut(id: string): Row { const r = this.perf[id] ?? {}; return { employee_id: id, band: r.band ?? null, evidence: r.evidence ?? null, reply: r.reply ?? null }; }
  private sortedBands(): Row[] { return [...this.bands].sort((a, b) => String(a.grade).localeCompare(String(b.grade))); }
  private perfMaps(): { perf: Row; perf_notes: Row } {
    const perf: Row = {}; const notes: Row = {};
    for (const [id, r] of Object.entries(this.perf)) {
      if (r.band) perf[id] = r.band;
      if (r.evidence || r.reply) notes[id] = { evidence: r.evidence || 'No evidence recorded.', ...(r.reply ? { reply: r.reply } : {}) };
    }
    return { perf, perf_notes: notes };
  }

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

    // ── core people + lifecycle (payroll / time / privacy fall through to mockApi's empty default) ──
    if (method === 'GET' && path === '/bootstrap') {
      await this.ok(route, {
        entities: [{ id: ENT, name: 'Acme Retail Pvt Ltd', pan: null, tan: null, cin: null, gstin: null, address: { line1: '1 Main Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' }, registrations: [], signatory: null }],
        locations: [{ id: LOC, entity_id: ENT, name: 'Bengaluru Office', state: 'Karnataka', city: 'Bengaluru', address: null, metro: true, holiday_list_id: null }],
        departments: [{ id: DEP, name: 'Operations', head_id: null }],
        designations: [{ id: DES_E1, name: 'Operations Associate', grade: 'E1' }, { id: DES_E2, name: 'Operations Lead', grade: 'E2' }],
        employees: this.employees, settings: { employee_code_prefix: 'EMP-' }, server_time: '2026-11-07T09:00:00Z',
      });
      return true;
    }
    const emp = path.match(/^\/employees\/([^/]+)$/);
    if (emp && method === 'PUT') {
      const row = this.employees.find((e) => e.id === emp[1]);
      if (!row) { await this.err(route, 404, 'Employee not found', 'NOT_FOUND'); return true; }
      Object.assign(row, body);
      await this.ok(route, row);
      return true;
    }
    if (method === 'GET' && path === '/lifecycle/bootstrap') {
      await this.ok(route, { onboarding_cases: [], exit_cases: [], letter_templates: this.letterTemplates, issued_letters: this.letters, server_time: '2026-11-07T09:00:00Z' });
      return true;
    }
    if (method === 'POST' && path === '/lifecycle/letters') {
      const row: Row = { ...body, created_at: '2026-11-07T09:00:00Z', updated_at: '2026-11-07T09:00:00Z' };
      this.letters.push(row);
      await this.ok(route, row, 201);
      return true;
    }

    if (!path.startsWith('/compensation')) return false;   // other sections: let the default mock answer empty success
    const p = path.slice('/compensation'.length);

    if (method === 'GET' && p === '/bootstrap') {
      if (this.mode === 'not_ready') { await this.err(route, 503, 'HRMS storage is not set up yet', 'HRMS_NOT_READY'); return true; }
      if (this.mode === 'error') { await this.err(route, 500, 'Internal server error', 'INTERNAL_ERROR'); return true; }
      await this.ok(route, { bands: this.sortedBands(), ...this.perfMaps(), cycle: this.cycle, server_time: '2026-11-07T09:00:00Z' });
      return true;
    }
    if (method === 'POST' && p === '/bands/seed') {
      let created = 0;
      for (const b of STANDARD_BANDS) if (!this.band(String(b.grade))) { this.bands.push({ ...b }); created += 1; }
      await this.ok(route, { bands: this.sortedBands(), created });
      return true;
    }
    const pub = p.match(/^\/bands\/([^/]+)\/published$/);
    if (method === 'PUT' && pub) {
      const b = this.band(decodeURIComponent(pub[1]!));
      if (!b) { await this.err(route, 404, 'There is no pay band for that grade.', 'NOT_FOUND'); return true; }
      b.published = body?.published === true;
      await this.ok(route, b);
      return true;
    }
    const band = p.match(/^\/bands\/([^/]+)$/);
    if (method === 'PUT' && band) {
      const b = this.band(decodeURIComponent(band[1]!));
      if (!b) { await this.err(route, 404, 'There is no pay band for that grade.', 'NOT_FOUND'); return true; }
      const n = (k: string) => Number(body?.[k]);
      if (!(n('min') < n('mid') && n('mid') < n('max'))) { await this.err(route, 400, 'The minimum must be below the midpoint, and the midpoint below the maximum.'); return true; }
      Object.assign(b, { min: n('min'), mid: n('mid'), max: n('max'), market: n('market') });
      await this.ok(route, b);
      return true;
    }
    const reply = p.match(/^\/perf\/([^/]+)\/reply$/);
    if (method === 'PUT' && reply) {
      const id = reply[1]!;
      this.perf[id] = { ...(this.perf[id] ?? {}), reply: String(body?.reply ?? '').trim() || null };
      await this.ok(route, this.perfOut(id));
      return true;
    }
    const perf = p.match(/^\/perf\/([^/]+)$/);
    if (method === 'PUT' && perf) {
      const id = perf[1]!;
      this.perf[id] = { ...(this.perf[id] ?? {}), band: body?.band };
      await this.ok(route, this.perfOut(id));
      return true;
    }
    if (method === 'PUT' && p === '/cycle') {
      if (!this.open()) { await this.err(route, 400, 'The cycle is locked. Return it to managers or reopen it first.'); return true; }
      if (body?.budget_pct !== undefined) {
        const pct = Number(body.budget_pct);
        if (!(pct >= 0 && pct <= 30)) { await this.err(route, 400, 'Use a budget from 0 to 30 percent.'); return true; }
        this.cycle.budget_pct = pct;
      }
      if (body?.effective_on !== undefined) {
        if (String(body.effective_on) < PREVIEW_TODAY) { await this.err(route, 400, 'Choose a date that is today or later.'); return true; }
        this.cycle.effective_on = body.effective_on;
      }
      if (body?.name !== undefined) this.cycle.name = body.name;
      await this.ok(route, this.cycle);
      return true;
    }
    if (method === 'PUT' && p === '/cycle/guidelines') {
      if (!this.open()) { await this.err(route, 400, 'The cycle is locked.'); return true; }
      const g = this.cycle.guidelines as Record<string, Record<string, Row>>;
      g[String(body?.perf)]![String(body?.zone)] = { min: Number(body?.min), max: Number(body?.max) };
      await this.ok(route, this.cycle);
      return true;
    }
    const prop = p.match(/^\/cycle\/proposals\/([^/]+)$/);
    if (method === 'PUT' && prop) {
      if (!this.open()) { await this.err(route, 400, 'Proposals are locked while the cycle is with HR or approved.'); return true; }
      const proposals = { ...(this.cycle.proposals as Row) };
      if (body?.pct == null) delete proposals[prop[1]!];
      else proposals[prop[1]!] = { pct: Number(body.pct), ...(body.reason ? { reason: body.reason } : {}), by: 'Master Admin', on: PREVIEW_TODAY };
      this.cycle.proposals = proposals;
      await this.ok(route, this.cycle);
      return true;
    }
    if (method === 'POST' && p === '/cycle/submit') {
      if (!this.open()) { await this.err(route, 400, 'The cycle is already with HR or approved.'); return true; }
      if (!Object.keys(this.cycle.proposals as Row).length) { await this.err(route, 400, 'Enter at least one proposed increment.'); return true; }
      Object.assign(this.cycle, { status: 'submitted', decision: null });
      await this.ok(route, this.cycle);
      return true;
    }
    if (method === 'POST' && p === '/cycle/decide') {
      if (this.cycle.status !== 'submitted') { await this.err(route, 400, 'Only a submitted cycle can be decided.'); return true; }
      const note = typeof body?.note === 'string' ? body.note : null;
      if (body?.decision === 'return' && !note) { await this.err(route, 400, 'Tell the managers what to change.'); return true; }
      Object.assign(this.cycle, { status: body?.decision === 'approve' ? 'approved' : 'returned', decision: { by: 'Master Admin', on: PREVIEW_TODAY, ...(note ? { note } : {}) } });
      await this.ok(route, this.cycle);
      return true;
    }
    if (method === 'POST' && p === '/cycle/reopen') {
      if (this.cycle.status !== 'approved') { await this.err(route, 400, 'Only an approved cycle can be reopened.'); return true; }
      if (Object.keys(this.cycle.applied as Row).length) { await this.err(route, 400, 'Some increments are already issued, so the cycle cannot be reopened.'); return true; }
      Object.assign(this.cycle, { status: 'draft', decision: null });
      await this.ok(route, this.cycle);
      return true;
    }
    const applied = p.match(/^\/cycle\/applied\/([^/]+)$/);
    if (method === 'POST' && applied) {
      if (this.cycle.status !== 'approved') { await this.err(route, 400, 'HR has not approved the cycle yet.'); return true; }
      const map = { ...(this.cycle.applied as Row) };
      if (map[applied[1]!]) { await this.err(route, 400, 'An increment was already issued to this person in this cycle.'); return true; }
      map[applied[1]!] = { on: PREVIEW_TODAY, from: body?.from, to: body?.to, letterId: body?.letter_id, by: 'Master Admin' };
      this.cycle.applied = map;
      await this.ok(route, this.cycle);
      return true;
    }
    await this.err(route, 404, `Unhandled ${method} ${path}`, 'NOT_FOUND');
    return true;
  }
}

// ───────────────────────────── helpers ─────────────────────────────
async function open(page: Page, fake: FakeComp, path = COMPENSATION, source: 'live' | 'sample' | null = 'live'): Promise<void> {
  await seedSession(page, MASTER_USER);
  if (source) await page.addInitScript(([k, v]) => { try { if (window.localStorage.getItem(k!) === null) window.localStorage.setItem(k!, v!); } catch { /* blocked */ } }, [SOURCE_KEY, source]);
  await mockApi(page, { me: { success: true, data: MASTER_USER }, onRequest: (route, url, method) => fake.handle(route, url, method) });
  await page.goto(path);
  await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
}
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const toasts = (page: Page) => page.locator('[data-sonner-toast]');
const slow = { timeout: 60_000 };

async function waitCompLoaded(page: Page) {
  await expect(page.getByTestId('hrms-live-loading')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('compensation-ready')).toBeVisible(slow);
}
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return errors;
}
const dumpStorage = (page: Page): Promise<string> => page.evaluate(() => { const o: Record<string, string | null> = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; o[k] = localStorage.getItem(k); } return JSON.stringify(o); });
async function setPct(page: Page, id: string, value: string) {
  const input = page.getByTestId(`pct-${id}`);
  await input.fill(value);
  await input.press('Enter');
}
/** Asha: rated Meets (guidance 4 to 7% in the middle zone), 5% proposed, submitted and approved — all on the server. */
async function proposeAndApprove(page: Page, fake: FakeComp) {
  await page.getByLabel('Performance band for Asha Rao').selectOption('meets');
  await expect.poll(() => fake.perf[ASHA]?.band, { timeout: 20_000 }).toBe('meets');
  await setPct(page, ASHA, '5');
  await expect.poll(() => (fake.cycle.proposals as Row)[ASHA], { timeout: 20_000 }).toBeTruthy();
  await expect(page.getByTestId(`pct-${ASHA}`)).toHaveValue('5');
  await page.getByRole('button', { name: 'Submit to HR for approval' }).click();
  await expect(page.getByTestId('cycle-status')).toHaveText('With HR for approval', slow);
  await page.getByRole('button', { name: 'Approve as HR' }).click();
  await dialog(page, 'Approve the merit cycle').getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByTestId('cycle-status')).toHaveText('Approved', slow);
}

// ═════════════════════════════ pure logic: wire mapping (no browser) ═════════════════════════════
test.describe('live compensation: wire mapping (no browser)', () => {
  test('a band maps min/mid/max/market and published; the bootstrap sorts bands by grade', () => {
    expect(bandFromWire({ grade: 'E1', min: '300000', mid: 350000, max: 400000, market: 345000, published: true, created_at: 'x' }))
      .toEqual({ grade: 'E1', min: 300000, mid: 350000, max: 400000, market: 345000, published: true });
    expect(bandFromWire({ grade: 'M3', min: 1, mid: 2, max: 3, market: 2, published: null }).published).toBe(false);
    const boot = compensationBootstrapFromWire({
      bands: [{ grade: 'M1', min: 1, mid: 2, max: 3, market: 2, published: false }, { grade: 'E1', min: 1, mid: 2, max: 3, market: 2, published: true }],
      perf: { [ASHA]: 'meets', [DEV]: 'bogus' }, perf_notes: { [ASHA]: { evidence: 'Hit target', reply: 'Agreed' } },
      cycle: { id: CYCLE, name: 'FY27', effective_on: '2027-01-01', budget_pct: '8', status: 'draft', decision: null, guidelines: {}, proposals: {}, applied: {} },
      server_time: '2026-11-07T09:00:00Z',
    });
    expect(boot.bands.map((b) => b.grade)).toEqual(['E1', 'M1']);
    expect(boot.perf).toEqual({ [ASHA]: 'meets' });   // an unknown band is dropped
    expect(boot.perfNotes).toEqual({ [ASHA]: { evidence: 'Hit target', reply: 'Agreed' } });
    expect(boot.cycle).toMatchObject({ id: CYCLE, name: 'FY27', effectiveOn: '2027-01-01', budgetPct: 8, status: 'draft', proposals: {}, applied: {} });
    expect(boot.cycle).not.toHaveProperty('decision');
    expect(boot.serverTime).toBe('2026-11-07T09:00:00Z');
  });

  test('the cycle fills missing guideline cells from the defaults and maps decision / proposals / applied', () => {
    const c = cycleFromWire({
      id: null, name: '', effective_on: '2027-01-01', budget_pct: 6, status: 'approved',
      decision: { by: 'HR', on: '2026-11-07', note: 'ok' },
      guidelines: { meets: { mid: { min: 5, max: 9 } }, exceeds: 'nonsense' },
      proposals: { [ASHA]: { pct: 5, by: 'HR', on: '2026-11-07' }, [DEV]: { pct: 12, reason: 'Promotion', by: 'HR', on: '2026-11-07' }, bad: { reason: 'no pct' } },
      applied: { [ASHA]: { on: '2026-11-07', from: 350000, to: 367500, letterId: TPL_INC, by: 'HR' } },
    });
    expect(c.id).toBe('');                          // never saved yet
    expect(c.name).toBe('Merit cycle');
    expect(c.guidelines.meets.mid).toEqual({ min: 5, max: 9 });
    expect(c.guidelines.exceeds).toEqual(DEFAULT_GUIDELINES().exceeds);
    expect(c.guidelines.unrated).toEqual(DEFAULT_GUIDELINES().unrated);
    expect(c.decision).toEqual({ by: 'HR', on: '2026-11-07', note: 'ok' });
    expect(c.proposals).toEqual({ [ASHA]: { pct: 5, by: 'HR', on: '2026-11-07' }, [DEV]: { pct: 12, reason: 'Promotion', by: 'HR', on: '2026-11-07' } });
    expect(c.applied[ASHA]).toEqual({ on: '2026-11-07', from: 350000, to: 367500, letterId: TPL_INC, by: 'HR' });
  });

  test('perf maps and results keep only what the server sent', () => {
    expect(perfMapFromWire({ [ASHA]: 'exceeds', [DEV]: 7 })).toEqual({ [ASHA]: 'exceeds' });
    expect(perfNotesFromWire({ [ASHA]: { evidence: '' }, [DEV]: 'x' })).toEqual({ [ASHA]: { evidence: 'No evidence recorded.' } });
    expect(perfResultFromWire({ employee_id: ASHA, band: 'meets', evidence: null, reply: null })).toEqual({ employeeId: ASHA, band: 'meets' });
    expect(perfResultFromWire({ employee_id: ASHA, band: null, evidence: null, reply: 'On leave in August' })).toEqual({ employeeId: ASHA, note: { evidence: 'No evidence recorded.', reply: 'On leave in August' } });
    expect(seedResultFromWire({ bands: [{ grade: 'W1', min: 1, mid: 2, max: 3, market: 2, published: true }], created: 1 })).toMatchObject({ created: 1, bands: [{ grade: 'W1' }] });
  });

  test('bodies are snake_case and carry only what the server needs', () => {
    expect(bandSaveBody({ min: 300000.4, mid: 350000, max: 400000.6, market: 345000 })).toEqual({ min: 300000, mid: 350000, max: 400001, market: 345000 });
    expect(cycleUpdateBody({ budgetPct: 8.456 })).toEqual({ budget_pct: 8.46 });
    expect(cycleUpdateBody({ effectiveOn: '2027-01-01' })).toEqual({ effective_on: '2027-01-01' });
    expect(guidelineBody('meets', 'mid', 4, 7)).toEqual({ perf: 'meets', zone: 'mid', min: 4, max: 7 });
    expect(proposalBody(5, '  ')).toEqual({ pct: 5, reason: null });
    expect(proposalBody(12, ' Promotion ')).toEqual({ pct: 12, reason: 'Promotion' });
    expect(proposalBody(null, 'ignored')).toEqual({ pct: null, reason: null });
    expect(decideBody('return', ' Fix the outliers ', false)).toEqual({ decision: 'return', note: 'Fix the outliers', over_budget: false });
    expect(decideBody('approve', '', true)).toEqual({ decision: 'approve', note: null, over_budget: true });
    expect(appliedBody({ from: 350000, to: 367500, letterId: TPL_INC })).toEqual({ from: 350000, to: 367500, letter_id: TPL_INC });
  });
});

// ═════════════════════════════ sample mode is untouched ═════════════════════════════
test.describe('sample compensation is unchanged', () => {
  test('the compensation page makes no HRMS call, shows the Preview badge, the local log and the sample bands', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/hrms')) hits.push(`${r.method()} ${r.url()}`); });
    await open(page, new FakeComp().full(), `${COMPENSATION}?tab=merit`, 'sample');
    await expect(page.getByTestId('hrms-preview-banner')).toHaveAttribute('data-source', 'sample');
    await expect(page.getByRole('heading', { name: 'Compensation', exact: true })).toBeVisible(slow);
    await expect(page.getByText('Preview', { exact: true })).toBeVisible();
    await expect(page.getByText(/Sample data, kept in this browser/)).toBeVisible();
    await expect(page.getByTestId('activity-log')).toBeVisible();            // the local activity log is shown in sample mode
    await expect(page.getByTestId('compensation-empty')).toHaveCount(0);    // the sample seed has its bands
    expect(hits).toEqual([]);
  });
});

// ═════════════════════════════ live bootstrap and degraded states ═════════════════════════════
test.describe('live compensation: bootstrap', () => {
  test('the data is read from GET /compensation/bootstrap, with the Live badge and no browser-only note', async ({ page }) => {
    const fake = new FakeComp().full();
    const errors = watchErrors(page);
    await open(page, fake);
    await waitCompLoaded(page);
    await expect(page.getByTestId('hrms-preview-banner')).toHaveAttribute('data-source', 'live');
    await expect(page.getByText(/Saved on the server\./)).toBeVisible();
    await expect(page.getByTestId('hrms-local-note')).toHaveCount(0);
    expect(fake.callsTo('GET', /^\/compensation\/bootstrap$/)).toHaveLength(1);
    // the server's two bands, and the three people placed in them
    await expect(page.getByTestId('range-E1')).toBeVisible();
    await expect(page.getByTestId('range-E2')).toBeVisible();
    await expect(page.getByTestId('range-W1')).toHaveCount(0);
    await expect(page.getByTestId('stat-people-in-bands')).toHaveText('3');
    // the merit tab shows the server's cycle, and no local activity log in live mode
    await page.getByRole('tab', { name: /Merit cycle/ }).click();
    await expect(page.getByText(SENTINEL_CYCLE)).toBeVisible();
    await expect(page.getByTestId('budget-pct')).toHaveValue('6');
    await expect(page.getByTestId('activity-log')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a 503 shows the not-ready state on its own; Try again loads once the server is ready', async ({ page }) => {
    const fake = new FakeComp().full();
    fake.mode = 'not_ready';
    await open(page, fake);
    await expect(page.getByTestId('compensation-not-ready')).toBeVisible(slow);
    await expect(page.getByTestId('compensation-not-ready')).toContainText('HRMS storage is not set up yet');
    await expect(page.getByTestId('compensation-ready')).toHaveCount(0);
    fake.mode = 'ok';
    await page.getByTestId('compensation-not-ready').getByRole('button', { name: 'Try again' }).click();
    await waitCompLoaded(page);
    expect(fake.callsTo('GET', /^\/compensation\/bootstrap$/)).toHaveLength(2);
  });

  test('a 500 shows the error state with the reason', async ({ page }) => {
    const fake = new FakeComp().full();
    fake.mode = 'error';
    await open(page, fake);
    await expect(page.getByTestId('compensation-error')).toBeVisible(slow);
    await expect(page.getByTestId('compensation-error-message')).toContainText('Internal server error');
  });
});

// ═════════════════════════════ empty state: add the standard bands ═════════════════════════════
test.describe('live compensation: the empty state seeds the standard pay bands on the server', () => {
  test('a fresh org offers "Add the standard pay bands", which POSTs /bands/seed and opens the page', async ({ page }) => {
    const fake = new FakeComp().seedPeople();   // people, no bands, a never-saved cycle
    await open(page, fake);
    await expect(page.getByTestId('hrms-live-loading')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('compensation-empty')).toBeVisible(slow);
    await page.getByTestId('add-standard-pay-bands').click();
    await expect.poll(() => fake.callsTo('POST', /^\/compensation\/bands\/seed$/).length, { timeout: 20_000 }).toBe(1);
    await waitCompLoaded(page);
    await expect(page.getByTestId('compensation-empty')).toHaveCount(0);
    for (const g of ['W1', 'E1', 'E2', 'E3', 'M1', 'M3']) await expect(page.getByTestId(`range-${g}`)).toBeVisible();
    await expect(page.getByTestId('stat-people-in-bands')).toHaveText('3');
  });
});

// ═════════════════════════════ bands and publishing (simple records) ═════════════════════════════
test.describe('live compensation: pay bands save and publish on the server', () => {
  test('editing a band PUTs /bands/E1 and the page shows the server\'s answer', async ({ page }) => {
    const fake = new FakeComp().full();
    await open(page, fake);
    await waitCompLoaded(page);
    await page.getByRole('button', { name: 'Edit band E1' }).click();
    const d = dialog(page, 'Edit band E1');
    await d.getByLabel('Maximum CTC (₹ a year)').fill('420000');
    await d.getByRole('button', { name: 'Save band' }).click();
    await expect(d).toHaveCount(0, slow);
    expect(fake.lastBody('PUT', /^\/compensation\/bands\/E1$/)).toEqual({ min: 300000, mid: 350000, max: 420000, market: 345000 });
    expect(fake.band('E1')!.max).toBe(420000);
    await expect(page.getByTestId('band-E1')).toContainText(inr(420000));
  });

  test('a server refusal on a band keeps the editor open with the reason, and nothing changes', async ({ page }) => {
    const fake = new FakeComp().full();
    fake.failures.push({ when: (c) => c.method === 'PUT' && c.path === '/compensation/bands/E1', status: 400, error: 'The band overlaps a grade that HR has frozen.' });
    await open(page, fake);
    await waitCompLoaded(page);
    await page.getByRole('button', { name: 'Edit band E1' }).click();
    const d = dialog(page, 'Edit band E1');
    await d.getByLabel('Maximum CTC (₹ a year)').fill('420000');
    await d.getByRole('button', { name: 'Save band' }).click();
    await expect(toasts(page).filter({ hasText: 'The band overlaps a grade that HR has frozen.' })).toBeVisible({ timeout: 20_000 });
    await expect(d).toBeVisible();
    expect(fake.band('E1')!.max).toBe(400000);
  });

  test('publishing a grade PUTs /bands/E2/published and the badge follows the server', async ({ page }) => {
    const fake = new FakeComp().full();
    await open(page, fake, `${COMPENSATION}?tab=transparency`);
    await waitCompLoaded(page);
    await expect(page.getByText('1 of 2 grades published')).toBeVisible();
    await page.getByTestId('publish-E2').check();
    await expect.poll(() => fake.band('E2')!.published, { timeout: 20_000 }).toBe(true);
    expect(fake.lastBody('PUT', /^\/compensation\/bands\/E2\/published$/)).toEqual({ published: true });
    await expect(page.getByText('2 of 2 grades published')).toBeVisible();
  });
});

// ═════════════════════════════ the merit cycle (commands) ═════════════════════════════
test.describe('live compensation: the merit cycle runs on the server', () => {
  test('perf band, reply, budget and proposal are server calls; submit and approve follow the server\'s status', async ({ page }) => {
    const fake = new FakeComp().full();
    await open(page, fake, `${COMPENSATION}?tab=merit`);
    await waitCompLoaded(page);

    // budget: PUT /cycle with only the field that changed
    const budget = page.getByTestId('budget-pct');
    await budget.fill('8');
    await budget.press('Enter');
    await expect.poll(() => fake.cycle.budget_pct, { timeout: 20_000 }).toBe(8);
    expect(fake.lastBody('PUT', /^\/compensation\/cycle$/)).toEqual({ budget_pct: 8 });
    await expect(budget).toHaveValue('8');

    // the employee's reply: PUT /perf/:id/reply, and the server's evidence is shown
    await page.getByRole('button', { name: 'Rating details for Meera Das' }).click();
    const pm = dialog(page, 'Rating details: Meera Das');
    await expect(pm).toContainText(SENTINEL_EVIDENCE);
    await expect(pm.getByText('Entered here', { exact: true })).toBeVisible();
    await pm.getByLabel("Employee's reply").fill('I led the Diwali rollout.');
    await pm.getByRole('button', { name: 'Save reply' }).click();
    await expect(pm).toHaveCount(0, slow);
    expect(fake.perf[MEERA]).toMatchObject({ band: 'exceeds', evidence: SENTINEL_EVIDENCE, reply: 'I led the Diwali rollout.' });

    await proposeAndApprove(page, fake);
    expect(fake.lastBody('PUT', new RegExp(`^/compensation/perf/${ASHA}$`))).toEqual({ band: 'meets' });
    expect(fake.lastBody('PUT', new RegExp(`^/compensation/cycle/proposals/${ASHA}$`))).toEqual({ pct: 5, reason: null });
    expect(fake.callsTo('POST', /^\/compensation\/cycle\/submit$/)).toHaveLength(1);
    expect(fake.lastBody('POST', /^\/compensation\/cycle\/decide$/)).toEqual({ decision: 'approve', note: null, over_budget: false });
    await expect(page.getByTestId('cycle-decision')).toContainText('Approved by Master Admin on 7 Nov 2026');
    // proposals are locked once approved
    await expect(page.getByTestId(`pct-${ASHA}`)).toBeDisabled();
  });

  test('a server refusal on a proposal shows the reason and the field keeps the server\'s value', async ({ page }) => {
    const fake = new FakeComp().full();
    fake.failures.push({ when: (c) => c.method === 'PUT' && c.path === `/compensation/cycle/proposals/${ASHA}`, status: 400, error: 'Proposals are locked while the cycle is with HR or approved.' });
    await open(page, fake, `${COMPENSATION}?tab=merit`);
    await waitCompLoaded(page);
    await setPct(page, ASHA, '5');
    await expect(toasts(page).filter({ hasText: 'Proposals are locked while the cycle is with HR or approved.' })).toBeVisible({ timeout: 20_000 });
    expect((fake.cycle.proposals as Row)[ASHA]).toBeUndefined();
    await expect(page.getByTestId(`pct-${ASHA}`)).toHaveValue('');
  });

  test('a return needs a note: the server\'s words stay in the dialog until one is written', async ({ page }) => {
    const fake = new FakeComp().full();
    await open(page, fake, `${COMPENSATION}?tab=merit`);
    await waitCompLoaded(page);
    await setPct(page, ASHA, '3');
    await expect.poll(() => (fake.cycle.proposals as Row)[ASHA], { timeout: 20_000 }).toBeTruthy();
    await page.getByRole('button', { name: 'Submit to HR for approval' }).click();
    await expect(page.getByTestId('cycle-status')).toHaveText('With HR for approval', slow);
    await page.getByRole('button', { name: 'Return to managers' }).click();
    const d = dialog(page, 'Return to managers');
    await d.getByRole('button', { name: 'Return', exact: true }).click();
    await expect(d.getByText('Tell the managers what to change.')).toBeVisible({ timeout: 20_000 });
    expect(fake.cycle.status).toBe('submitted');
    await d.getByLabel('What should managers change').fill('Check Dev Nair again.');
    await d.getByRole('button', { name: 'Return', exact: true }).click();
    await expect(d).toHaveCount(0, slow);
    expect(fake.cycle.status).toBe('returned');
    await expect(page.getByTestId('cycle-status')).toHaveText('Returned to managers');
    await expect(page.getByTestId('cycle-decision')).toContainText('Check Dev Nair again.');
  });
});

// ═════════════════════════════ issuing an increment (core writes + the cycle record) ═════════════════════════════
test.describe('live compensation: issuing an increment', () => {
  test('saves the letter, then the new CTC, on the server before recording the increment with the letter\'s id', async ({ page }) => {
    const fake = new FakeComp().full();
    const errors = watchErrors(page);
    await open(page, fake, `${COMPENSATION}?tab=merit`);
    await waitCompLoaded(page);
    await proposeAndApprove(page, fake);

    await page.getByRole('button', { name: 'Issue increment to Asha Rao' }).click();
    const d = dialog(page, 'Issue increment to Asha Rao');
    await expect(d.getByTestId('issue-preview')).toContainText(inr(350000));
    await expect(d.getByTestId('issue-preview')).toContainText(inr(367500));
    await expect(d.getByTestId('issue-preview')).toContainText('1 Jan 2027');
    await d.getByRole('button', { name: 'Issue increment' }).click();
    await expect(d).toHaveCount(0, slow);

    // the core writes reached the server ...
    const emp = fake.callsTo('PUT', new RegExp(`^/employees/${ASHA}$`));
    expect(emp).toHaveLength(1);
    expect(Number(emp[0]!.body!.annual_ctc)).toBe(367500);
    const letter = fake.callsTo('POST', /^\/lifecycle\/letters$/);
    expect(letter).toHaveLength(1);
    expect(letter[0]!.body!.id).toMatch(UUID);
    expect(String(letter[0]!.body!.body)).toContain(inr(367500));
    // ... letter first, then the CTC, then the cycle record, which carries the same letter id
    const rec = fake.callsTo('POST', new RegExp(`^/compensation/cycle/applied/${ASHA}$`));
    expect(rec).toHaveLength(1);
    expect(letter[0]!.n).toBeLessThan(emp[0]!.n);
    expect(emp[0]!.n).toBeLessThan(rec[0]!.n);
    expect(rec[0]!.body).toEqual({ from: 350000, to: 367500, letter_id: letter[0]!.body!.id });
    expect((fake.cycle.applied as Row)[ASHA]).toMatchObject({ from: 350000, to: 367500, letterId: letter[0]!.body!.id });

    await expect(page.getByTestId('issued-banner')).toContainText(`CTC ${inr(350000)} to ${inr(367500)}`);
    await expect(page.getByRole('row', { name: /Asha Rao/ })).toContainText('Issued 7 Nov 2026');
    await expect(page.getByRole('button', { name: 'Issue increment to Asha Rao' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reopen for changes' })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('if the letter cannot be saved, nothing else is written: no CTC change and no cycle record', async ({ page }) => {
    const fake = new FakeComp().full();
    await open(page, fake, `${COMPENSATION}?tab=merit`);
    await waitCompLoaded(page);
    await proposeAndApprove(page, fake);
    fake.failures.push({ when: (c) => c.method === 'POST' && c.path === '/lifecycle/letters', status: 500, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    await page.getByRole('button', { name: 'Issue increment to Asha Rao' }).click();
    await dialog(page, 'Issue increment to Asha Rao').getByRole('button', { name: 'Issue increment' }).click();
    await expect(toasts(page).filter({ hasText: 'The increment letter could not be saved on the server, so nothing was changed.' })).toBeVisible({ timeout: 30_000 });
    expect(fake.callsTo('PUT', new RegExp(`^/employees/${ASHA}$`))).toHaveLength(0);
    expect(fake.callsTo('POST', /^\/compensation\/cycle\/applied\//)).toHaveLength(0);
    expect(fake.employees.find((e) => e.id === ASHA)!.annual_ctc).toBe('350000');
  });

  test('if the cycle record fails, trying again repeats only that step: the CTC is not raised twice', async ({ page }) => {
    const fake = new FakeComp().full();
    await open(page, fake, `${COMPENSATION}?tab=merit`);
    await waitCompLoaded(page);
    await proposeAndApprove(page, fake);
    fake.failures.push({ when: (c) => c.method === 'POST' && c.path === `/compensation/cycle/applied/${ASHA}`, status: 500, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    await page.getByRole('button', { name: 'Issue increment to Asha Rao' }).click();
    let d = dialog(page, 'Issue increment to Asha Rao');
    await d.getByRole('button', { name: 'Issue increment' }).click();
    await expect(toasts(page).filter({ hasText: 'the cycle did not record the increment' })).toBeVisible({ timeout: 30_000 });
    expect(fake.callsTo('POST', /^\/lifecycle\/letters$/)).toHaveLength(1);
    expect(fake.callsTo('PUT', new RegExp(`^/employees/${ASHA}$`))).toHaveLength(1);
    expect((fake.cycle.applied as Row)[ASHA]).toBeUndefined();

    // Try again: the preview still shows the original figures (not 5% on top of the new CTC), and only the record is sent.
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
    await page.getByRole('button', { name: 'Issue increment to Asha Rao' }).click();
    d = dialog(page, 'Issue increment to Asha Rao');
    await expect(d.getByTestId('issue-preview')).toContainText(inr(350000));
    await expect(d.getByTestId('issue-preview')).toContainText(inr(367500));
    await d.getByRole('button', { name: 'Issue increment' }).click();
    await expect(d).toHaveCount(0, slow);
    expect(fake.callsTo('POST', /^\/lifecycle\/letters$/)).toHaveLength(1);                  // no second letter
    expect(fake.callsTo('PUT', new RegExp(`^/employees/${ASHA}$`))).toHaveLength(1);         // no second CTC change
    const letterId = fake.letters[0]!.id;
    expect(fake.lastBody('POST', new RegExp(`^/compensation/cycle/applied/${ASHA}$`))).toEqual({ from: 350000, to: 367500, letter_id: letterId });
    expect(Number(fake.employees.find((e) => e.id === ASHA)!.annual_ctc)).toBe(367500);
    await expect(page.getByRole('row', { name: /Asha Rao/ })).toContainText('Issued 7 Nov 2026');
  });
});

// ═════════════════════════════ storage ═════════════════════════════
test.describe('live compensation: the data is never persisted', () => {
  test('nothing from the live compensation data reaches browser storage', async ({ page }) => {
    const fake = new FakeComp().full();
    await open(page, fake, `${COMPENSATION}?tab=merit`);
    await waitCompLoaded(page);
    await expect(page.getByText(SENTINEL_CYCLE)).toBeVisible();
    await page.getByRole('button', { name: 'Rating details for Meera Das' }).click();
    await expect(dialog(page, 'Rating details: Meera Das')).toContainText(SENTINEL_EVIDENCE);
    await page.keyboard.press('Escape');
    await setPct(page, ASHA, '5');
    await expect.poll(() => (fake.cycle.proposals as Row)[ASHA], { timeout: 20_000 }).toBeTruthy();

    const storage = await dumpStorage(page);
    expect(storage).not.toContain(SENTINEL_CYCLE);
    expect(storage).not.toContain(SENTINEL_EVIDENCE);
  });
});
