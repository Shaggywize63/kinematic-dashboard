import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession } from './utils';
import { MASTER_USER } from './hrms-utils';
import {
  assetFromWire, assetEventFromWire, assetsBootstrapFromWire, commandResultFromWire, assetCreateBody,
  issueBody, returnBody, transferBody, repairBackBody, noteBody,
} from '../src/lib/hrms/rewards/live/assetsWire';
import type { NewAssetInput } from '../src/lib/hrms/rewards/store';

/**
 * HRMS live mode, phase 6: the asset register on the server. The server is a stateful miniature of the assets contract behind
 * page.route: it keeps the catalogue and its append-only event history, assigns tags, enforces the same transitions and the
 * same plain refusal messages as the dashboard, and records every call. Benefits and compensation stay local (and keep their
 * "saved in this browser only" note). Nothing here talks to a real backend or database; all data is fake.
 */

test.describe.configure({ timeout: 240_000 });
test.beforeEach(({ page }) => { page.setDefaultNavigationTimeout(60_000); });

const SOURCE_KEY = 'kinematic_hrms_source';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASSETS = '/dashboard/hrms/assets';
const COMPENSATION = '/dashboard/hrms/compensation';

const ENT = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';
const DEP = '33333333-3333-4333-8333-333333333333';
const DES = '44444444-4444-4444-8444-444444444444';
const ASHA = '55555555-5555-4555-8555-555555555555';
const DEV = '66666666-6666-4666-8666-666666666666';
const MEERA = '77777777-7777-4777-8777-777777777777';
const LAP = 'a0000000-0000-4000-8000-000000000001';   // AST-LAP-001, issued to Asha
const PHN = 'a0000000-0000-4000-8000-000000000002';   // AST-PHN-001, in stock
const TLS = 'a0000000-0000-4000-8000-000000000003';   // AST-TLS-001, in stock (the sentinel)

// A value that is in the LIVE register only and never in the sample seed: it must never turn up in browser storage.
const SENTINEL_SERIAL = 'ZZ-LIVE-ONLY-SENTINEL-918273';
const SENTINEL_MAKE = 'LiveOnlyMake';

type Row = Record<string, unknown>;
interface Call { method: string; path: string; query: string; body: Row | undefined; n: number }
interface Failure { when: (c: Call) => boolean; status: number; error: string; code?: string; once?: boolean }

const PREFIX: Record<string, string> = { laptop: 'LAP', phone: 'PHN', sim: 'SIM', vehicle: 'VEH', id_card: 'IDC', uniform: 'UNI', tool: 'TLS' };

// ───────────────────────────── a stateful assets server (wire shape) ─────────────────────────────
class FakeAssets {
  calls: Call[] = [];
  entities: Row[] = [];
  locations: Row[] = [];
  departments: Row[] = [];
  designations: Row[] = [];
  employees: Row[] = [];
  assets: Row[] = [];
  events: Row[] = [];
  failures: Failure[] = [];
  /** 'ok'; 'not_ready' answers 503 HRMS_NOT_READY on /assets/bootstrap only. */
  mode: 'ok' | 'not_ready' = 'ok';
  private seq = 0;
  private evSeq = 0;

  seedOrg(): this {
    this.entities = [{ id: ENT, name: 'Acme Retail Pvt Ltd', pan: null, tan: null, cin: null, gstin: null, address: { line1: '1 Main Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' }, registrations: [], signatory: null }];
    this.locations = [{ id: LOC, entity_id: ENT, name: 'Bengaluru Office', state: 'Karnataka', city: 'Bengaluru', address: null, metro: true, holiday_list_id: null }];
    this.departments = [{ id: DEP, name: 'Operations', head_id: null }];
    this.designations = [{ id: DES, name: 'Operations Associate', grade: 'E1' }];
    return this;
  }
  seedPeople(): this {
    const mk = (id: string, code: string, first: string, last: string) => ({
      id, code, first_name: first, last_name: last, email: `${first.toLowerCase()}@example.com`, mobile: '9876500001', gender: 'female', dob: '1995-05-05',
      entity_id: ENT, location_id: LOC, department_id: DEP, designation_id: DES, reporting_to_id: null, employment_type: 'permanent', status: 'active', join_date: '2026-04-01',
      probation_months: 6, notice_days: 30, aadhaar_verified: false, uan_status: 'none', pf_member: true, pf_on_actual_wage: false, pt_applicable: true, lwf_applicable: false,
      tax_regime: 'new', pay_mode: 'bank', annual_ctc: '600000', documents: [], history: [],
    });
    this.employees = [mk(ASHA, 'EMP-0001', 'Asha', 'Rao'), mk(DEV, 'EMP-0002', 'Dev', 'Nair'), mk(MEERA, 'EMP-0003', 'Meera', 'Das')];
    return this;
  }
  /** One laptop issued to Asha, one phone in stock, and one tool in stock carrying the sentinel. */
  seedRegister(): this {
    const asset = (id: string, tag: string, type: string, make: string, model: string, serial: string, status: string, holder: string | null, condition = 'good'): Row =>
      ({ id, tag, type, make, model, serial, purchase_date: '2025-06-01', cost: 60000, warranty_end: '2028-06-01', condition, status, holder_id: holder, created_at: '2025-06-01T09:00:00Z', updated_at: '2025-06-01T09:00:00Z' });
    this.assets = [
      asset(LAP, 'AST-LAP-001', 'laptop', 'Apple', 'MacBook Air', 'MBA-0001', 'issued', ASHA),
      asset(PHN, 'AST-PHN-001', 'phone', 'Samsung', 'Galaxy', 'SG-0001', 'in_stock', null),
      asset(TLS, 'AST-TLS-001', 'tool', SENTINEL_MAKE, 'Scanner X', SENTINEL_SERIAL, 'in_stock', null),
    ];
    this.events = [
      this.ev(LAP, 'purchased', 'in_stock', { condition: 'good', note: 'Added to the register.' }),
      this.ev(LAP, 'issued', 'issued', { to_id: ASHA, condition: 'good', ack: true }),
      this.ev(PHN, 'purchased', 'in_stock', { condition: 'good', note: 'Added to the register.' }),
      this.ev(TLS, 'purchased', 'in_stock', { condition: 'good', note: 'Added to the register.' }),
    ];
    return this;
  }
  full(): this { return this.seedOrg().seedPeople().seedRegister(); }

  private ev(assetId: string, kind: string, status: string, o: Partial<Row> = {}): Row {
    return { id: `e0000000-0000-4000-8000-${String(++this.evSeq).padStart(12, '0')}`, asset_id: assetId, on: '2026-11-10', kind, status, from_id: null, to_id: null, condition: null, ack: null, note: null, by: 'Master Admin', ...o };
  }
  callsTo(method: string, pattern: RegExp): Call[] { return this.calls.filter((c) => c.method === method && pattern.test(c.path)); }
  asset(id: string): Row { return this.assets.find((a) => a.id === id)!; }
  byTag(tag: string): Row { return this.assets.find((a) => a.tag === tag)!; }
  eventsOf(id: string): Row[] { return this.events.filter((e) => e.asset_id === id); }
  private isEmp(id: unknown): boolean { return this.employees.some((e) => e.id === id); }
  private nextTag(type: string): string {
    const p = PREFIX[type] ?? 'AST';
    const max = this.assets.filter((a) => a.type === type).reduce((m, a) => Math.max(m, Number(String(a.tag).split('-').pop()) || 0), 0);
    return `AST-${p}-${String(max + 1).padStart(3, '0')}`;
  }
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
    if (fi >= 0) { const f = this.failures[fi]!; if (f.once !== false) this.failures.splice(fi, 1); await this.err(route, f.status, f.error, f.code ?? 'ASSET_STATE'); return true; }

    // core people bootstrap (payroll/time/lifecycle/privacy fall through to mockApi's empty default)
    if (method === 'GET' && path === '/bootstrap') {
      await this.ok(route, { entities: this.entities, locations: this.locations, departments: this.departments, designations: this.designations, employees: this.employees, settings: { employee_code_prefix: 'EMP-' }, server_time: '2026-11-10T09:00:00Z' });
      return true;
    }
    if (!path.startsWith('/assets')) return false;   // other sections: let the default mock answer empty success
    const p = path.slice('/assets'.length);

    if (method === 'GET' && p === '/bootstrap') {
      if (this.mode === 'not_ready') { await this.err(route, 503, 'HRMS storage is not set up yet', 'HRMS_NOT_READY'); return true; }
      await this.ok(route, { assets: this.assets, events: this.events, server_time: '2026-11-10T09:00:00Z' });
      return true;
    }
    if (method === 'POST' && p === '') { await this.create(route, body ?? {}); return true; }
    const cmd = p.match(/^\/([^/]+)\/([a-z-]+)$/);
    if (method === 'POST' && cmd) { await this.command(route, cmd[1]!, cmd[2]!, body ?? {}); return true; }
    await this.err(route, 404, `Unhandled ${method} ${path}`, 'NOT_FOUND');
    return true;
  }

  private async create(route: Route, b: Row): Promise<void> {
    if (b.id && this.assets.some((a) => a.id === b.id)) { const a = this.asset(String(b.id)); await this.ok(route, { asset: a, event: this.eventsOf(a.id as string).find((e) => e.kind === 'purchased') }); return; }   // idempotent
    const serial = String(b.serial ?? '').trim();
    if (this.assets.some((a) => String(a.serial).toLowerCase() === serial.toLowerCase())) { await this.err(route, 400, 'This serial number is already in the register.', 'VALIDATION'); return; }
    const type = String(b.type ?? 'laptop');
    const asset: Row = {
      id: (b.id as string) ?? crypto.randomUUID(), tag: b.tag ? String(b.tag) : this.nextTag(type), type, make: String(b.make ?? ''), model: String(b.model ?? ''), serial,
      purchase_date: String(b.purchase_date ?? '2026-11-10'), cost: Number(b.cost ?? 0), warranty_end: (b.warranty_end as string) ?? null, condition: String(b.condition ?? 'new'),
      status: 'in_stock', holder_id: null, created_at: '2026-11-10T09:00:00Z', updated_at: '2026-11-10T09:00:00Z',
    };
    this.assets.push(asset);
    const event = this.ev(asset.id as string, 'purchased', 'in_stock', { condition: asset.condition, on: asset.purchase_date, note: 'Added to the register.' });
    this.events.push(event);
    await this.ok(route, { asset, event }, 201);
  }

  private async command(route: Route, id: string, cmd: string, b: Row): Promise<void> {
    const a = this.assets.find((x) => x.id === id);
    if (!a) { await this.err(route, 404, 'That asset is not in the register.', 'NOT_FOUND'); return; }
    const status = String(a.status);
    const tag = String(a.tag);
    const refuse = (msg: string) => this.err(route, 409, msg, 'ASSET_STATE');
    const bad = (msg: string) => this.err(route, 400, msg, 'VALIDATION');
    const ev = (kind: string, next: string, o: Partial<Row>) => { const e = this.ev(id, kind, next, o); this.events.push(e); a.status = next; a.updated_at = '2026-11-10T10:00:00Z'; return e; };

    if (cmd === 'issue') {
      if (status !== 'in_stock') { await refuse(`${tag} is ${status.replace('_', ' ')}, so it cannot be issued.`); return; }
      if (!this.isEmp(b.person_id)) { await bad('Choose who it is for.'); return; }
      if (!b.ack) { await bad('The receiver has to acknowledge receipt before it is issued.'); return; }
      a.holder_id = b.person_id; a.condition = b.condition ?? a.condition;
      const e = ev('issued', 'issued', { to_id: b.person_id, condition: a.condition, ack: true, note: b.note ?? null });
      await this.ok(route, { asset: a, event: e }); return;
    }
    if (cmd === 'return') {
      if (status !== 'issued') { await refuse('Only an issued asset can be returned.'); return; }
      const from = a.holder_id; const next = String(b.next ?? 'in_stock');
      a.holder_id = null; a.condition = b.condition ?? a.condition;
      const e = ev('returned', next, { from_id: from, condition: a.condition, note: b.note ?? null });
      await this.ok(route, { asset: a, event: e }); return;
    }
    if (cmd === 'transfer') {
      if (status !== 'issued') { await refuse('Only an issued asset can be transferred.'); return; }
      if (a.holder_id === b.to_id) { await refuse('It is already with this person.'); return; }
      if (!this.isEmp(b.to_id)) { await bad('Choose who receives it.'); return; }
      if (!b.ack) { await bad('The new holder has to acknowledge receipt before it is transferred.'); return; }
      const from = a.holder_id; a.holder_id = b.to_id; a.condition = b.condition ?? a.condition;
      const e = ev('transferred', 'issued', { from_id: from, to_id: b.to_id, condition: a.condition, ack: true, note: b.note ?? null });
      await this.ok(route, { asset: a, event: e }); return;
    }
    if (cmd === 'repair-out') {
      if (status !== 'in_stock' && status !== 'issued') { await refuse('Only an asset in stock or issued can go for repair.'); return; }
      const from = a.holder_id; a.holder_id = null;
      const e = ev('repair_out', 'in_repair', { from_id: from, note: b.note ?? null });
      await this.ok(route, { asset: a, event: e }); return;
    }
    if (cmd === 'repair-back') {
      if (status !== 'in_repair') { await refuse('Only an asset in repair can come back from repair.'); return; }
      a.condition = b.condition ?? a.condition;
      const e = ev('repair_back', 'in_stock', { condition: a.condition, note: b.note ?? null });
      await this.ok(route, { asset: a, event: e }); return;
    }
    if (cmd === 'lost') {
      if (status !== 'in_stock' && status !== 'issued') { await refuse('Only an asset in stock or issued can be marked lost.'); return; }
      const from = a.holder_id; a.holder_id = null;
      const e = ev('lost', 'lost', { from_id: from, note: b.note ?? null });
      await this.ok(route, { asset: a, event: e }); return;
    }
    if (cmd === 'retire') {
      if (status !== 'in_stock' && status !== 'in_repair') { await refuse('Only an asset in stock or in repair can be retired.'); return; }
      const e = ev('retired', 'retired', { note: b.note ?? null });
      await this.ok(route, { asset: a, event: e }); return;
    }
    await this.err(route, 404, `Unhandled command ${cmd}`, 'NOT_FOUND');
  }
}

// ───────────────────────────── helpers ─────────────────────────────
async function open(page: Page, fake: FakeAssets, path = ASSETS, source: 'live' | 'sample' | null = 'live'): Promise<void> {
  await seedSession(page, MASTER_USER);
  if (source) await page.addInitScript(([k, v]) => { try { if (window.localStorage.getItem(k!) === null) window.localStorage.setItem(k!, v!); } catch { /* blocked */ } }, [SOURCE_KEY, source]);
  await mockApi(page, { me: { success: true, data: MASTER_USER }, onRequest: (route, url, method) => fake.handle(route, url, method) });
  await page.goto(path);
  await page.getByTestId('hrms-preview-banner').waitFor({ timeout: 45_000 });
}
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const toasts = (page: Page) => page.locator('[data-sonner-toast]');
const slow = { timeout: 60_000 };

async function waitAssetsLoaded(page: Page) {
  await expect(page.getByTestId('hrms-live-loading')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('assets-stats')).toBeVisible(slow);
}
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return errors;
}
const dumpStorage = (page: Page): Promise<string> => page.evaluate(() => { const o: Record<string, string | null> = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; o[k] = localStorage.getItem(k); } return JSON.stringify(o); });
async function openDetail(page: Page, tag: string) { await page.getByRole('button', { name: `Open ${tag}` }).click(); await expect(dialog(page, new RegExp(tag))).toBeVisible(slow); }
async function closeModals(page: Page) {
  for (let i = 0; i < 4 && await page.getByRole('dialog').count() > 0; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

// ═════════════════════════════ pure logic: wire mapping (no browser) ═════════════════════════════
test.describe('live assets: wire mapping (no browser)', () => {
  test('an asset maps to the dashboard shape: snake to camel, null holder becomes nothing', () => {
    const a = assetFromWire({ id: LAP, tag: 'AST-LAP-001', type: 'laptop', make: 'Apple', model: 'MacBook Air', serial: 'MBA-0001', purchase_date: '2025-06-01', cost: '60000', warranty_end: '2028-06-01', condition: 'good', status: 'issued', holder_id: ASHA, created_at: 'x', updated_at: 'y' });
    expect(a).toEqual({ id: LAP, tag: 'AST-LAP-001', type: 'laptop', make: 'Apple', model: 'MacBook Air', serial: 'MBA-0001', purchaseDate: '2025-06-01', cost: 60000, warrantyEnd: '2028-06-01', condition: 'good', status: 'issued', holderId: ASHA });
    const stock = assetFromWire({ id: PHN, tag: 'AST-PHN-001', type: 'phone', make: 'S', model: 'G', serial: 'SG', purchase_date: '2025-06-01', cost: 9000, warranty_end: null, condition: 'new', status: 'in_stock', holder_id: null });
    expect(stock.holderId).toBeUndefined();
    expect(stock.warrantyEnd).toBeNull();
  });

  test('an event keeps only the fields the server sent, append-only shape', () => {
    const issued = assetEventFromWire({ id: 'e1', asset_id: LAP, on: '2026-11-10', kind: 'issued', status: 'issued', from_id: null, to_id: ASHA, condition: 'good', ack: true, note: null, by: 'Master Admin' });
    expect(issued).toEqual({ id: 'e1', assetId: LAP, on: '2026-11-10', kind: 'issued', status: 'issued', toId: ASHA, condition: 'good', ack: true, by: 'Master Admin' });
    expect(issued).not.toHaveProperty('fromId');
    expect(issued).not.toHaveProperty('note');
    const purchased = assetEventFromWire({ id: 'e0', asset_id: LAP, on: '2026-11-10', kind: 'purchased', status: 'in_stock', condition: 'new', note: 'Added to the register.', by: 'Master Admin' });
    expect(purchased).toMatchObject({ kind: 'purchased', condition: 'new', note: 'Added to the register.' });
    expect(purchased.ack).toBeUndefined();
  });

  test('bootstrap and command results map their collections', () => {
    const boot = assetsBootstrapFromWire({ assets: [{ id: LAP, tag: 'AST-LAP-001', type: 'laptop', status: 'issued', holder_id: ASHA, purchase_date: '2025-06-01', cost: 1, condition: 'good' }], events: [{ id: 'e1', asset_id: LAP, kind: 'issued', status: 'issued', on: '2026-11-10', by: 'x' }], server_time: '2026-11-10T09:00:00Z' });
    expect(boot.assets).toHaveLength(1);
    expect(boot.assets[0]!.holderId).toBe(ASHA);
    expect(boot.events[0]!.kind).toBe('issued');
    expect(boot.serverTime).toBe('2026-11-10T09:00:00Z');
    const res = commandResultFromWire({ asset: { id: PHN, tag: 'AST-PHN-001', type: 'phone', status: 'in_repair', holder_id: null, purchase_date: '2025-06-01', cost: 1, condition: 'fair' }, event: { id: 'e9', asset_id: PHN, kind: 'repair_out', status: 'in_repair', on: '2026-11-10', by: 'x' } });
    expect(res.asset.status).toBe('in_repair');
    expect(res.event.kind).toBe('repair_out');
  });

  test('bodies are snake_case: create computes the warranty end date and carries a UUID id; commands send only what is needed', () => {
    const input: NewAssetInput = { type: 'laptop', make: ' Acer ', model: ' Aspire ', serial: ' ACER-1 ', purchaseDate: '2026-01-01', cost: 45000.4, warrantyMonths: 12, condition: 'new' };
    const body = assetCreateBody(input, LAP);
    expect(body).toEqual({ id: LAP, type: 'laptop', make: 'Acer', model: 'Aspire', serial: 'ACER-1', purchase_date: '2026-01-01', cost: 45000, warranty_end: '2027-01-01', condition: 'new' });
    expect(Object.keys(body).some((k) => /[A-Z]/.test(k))).toBe(false);
    expect(assetCreateBody({ ...input, warrantyMonths: 0 }).warranty_end).toBeNull();
    expect(assetCreateBody(input, 'not-a-uuid')).not.toHaveProperty('id');
    expect(issueBody({ personId: ASHA, condition: 'good', ack: true, note: ' took it ' })).toEqual({ person_id: ASHA, condition: 'good', ack: true, note: 'took it' });
    expect(returnBody({ condition: 'fair', next: 'in_repair' })).toEqual({ condition: 'fair', next: 'in_repair', note: null });
    expect(transferBody({ toId: DEV, condition: 'good', ack: true })).toEqual({ to_id: DEV, condition: 'good', ack: true, note: null });
    expect(repairBackBody({ condition: 'good' })).toEqual({ condition: 'good', note: null });
    expect(noteBody('  lost at site ')).toEqual({ note: 'lost at site' });
    expect(noteBody('')).toEqual({ note: null });
  });
});

// ═════════════════════════════ sample mode is untouched ═════════════════════════════
test.describe('sample assets is unchanged', () => {
  test('the assets page makes no HRMS call, shows the Preview badge and renders the sample register', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/hrms')) hits.push(`${r.method()} ${r.url()}`); });
    const fake = new FakeAssets().full();
    await open(page, fake, ASSETS, 'sample');
    await expect(page.getByTestId('hrms-preview-banner')).toHaveAttribute('data-source', 'sample');
    await expect(page.getByRole('heading', { name: 'Assets', exact: true })).toBeVisible(slow);
    await expect(page.getByText('Preview', { exact: true })).toBeVisible();
    await expect(page.getByTestId('asset-count')).toContainText('assets', slow);
    await expect(page.getByTestId('activity-log')).toBeVisible();   // the local activity log is shown in sample mode
    expect(hits).toEqual([]);                                       // no HRMS calls at all, assets or otherwise
  });
});

// ═════════════════════════════ live bootstrap ═════════════════════════════
test.describe('live assets: bootstrap', () => {
  test('the register is read from GET /assets/bootstrap, with the server-backed banner and no browser-only note', async ({ page }) => {
    const fake = new FakeAssets().full();
    const errors = watchErrors(page);
    await open(page, fake, ASSETS);
    await waitAssetsLoaded(page);
    await expect(page.getByTestId('hrms-preview-banner')).toHaveAttribute('data-source', 'live');
    await expect(page.getByText(/Saved on the server\./)).toBeVisible();        // the page's own live description
    await expect(page.getByTestId('hrms-local-note')).toHaveCount(0);           // assets is server-backed, not "this browser only"
    expect(fake.callsTo('GET', /^\/assets\/bootstrap$/)).toHaveLength(1);
    // the seeded register, with the holder's name from the core people data
    await expect(page.getByTestId('asset-count')).toContainText('3 of 3 assets', slow);
    const stats = page.getByTestId('assets-stats');
    await expect(stats).toContainText('3');       // usable
    const lapRow = page.getByRole('row', { name: /AST-LAP-001/ });
    await expect(lapRow).toContainText('Asha Rao');
    await expect(lapRow).toContainText('Issued');
    await expect(page.getByRole('row', { name: /AST-PHN-001/ })).toContainText('In stock');
    expect(errors).toEqual([]);
  });

  test('a 503 degrades the Assets page on its own; compensation keeps working with the browser-only note', async ({ page }) => {
    const fake = new FakeAssets().full();
    fake.mode = 'not_ready';
    await open(page, fake, ASSETS);
    await expect(page.getByTestId('assets-not-ready')).toBeVisible(slow);
    await expect(page.getByTestId('assets-not-ready')).toContainText('HRMS storage is not set up yet');
    await expect(page.getByTestId('assets-stats')).toHaveCount(0);
    // compensation (local) still works and still says it is saved in this browser only (benefits is server-backed since phase 7)
    await page.goto(COMPENSATION);
    await expect(page.getByRole('heading', { name: 'Compensation', exact: true })).toBeVisible(slow);
    await expect(page.getByTestId('hrms-local-note')).toBeVisible();
  });
});

// ═════════════════════════════ the eight commands on the server ═════════════════════════════
test.describe('live assets: commands route to the server and reflect its answer', () => {
  test('add: POST /assets, the server assigns the tag, and the row appears from the answer', async ({ page }) => {
    const fake = new FakeAssets().full();
    await open(page, fake, ASSETS);
    await waitAssetsLoaded(page);
    await page.getByRole('button', { name: 'Add asset' }).click();
    const d = dialog(page, 'Add asset');
    await d.getByLabel('Make').fill('Acer');
    await d.getByLabel('Model').fill('Aspire 5');
    await d.getByLabel('Serial number').fill('ACER-NEW-1');
    await d.getByLabel('Cost (₹)').fill('45000');
    await d.getByRole('button', { name: 'Add to register' }).click();
    await expect(d).toHaveCount(0, slow);
    await expect.poll(() => fake.callsTo('POST', /^\/assets$/).length, { timeout: 20_000 }).toBe(1);
    const post = fake.callsTo('POST', /^\/assets$/)[0]!;
    expect(post.body!.id).toMatch(UUID);
    expect(post.body).toMatchObject({ type: 'laptop', make: 'Acer', model: 'Aspire 5', serial: 'ACER-NEW-1', cost: 45000, purchase_date: '2026-11-07', warranty_end: '2027-11-07' });
    expect(Object.keys(post.body!).some((k) => /[A-Z]/.test(k))).toBe(false);
    // the server assigned AST-LAP-002 (continuing the laptop sequence), and the row shows it
    expect(fake.assets.some((a) => a.tag === 'AST-LAP-002' && a.serial === 'ACER-NEW-1')).toBe(true);
    await page.getByRole('searchbox', { name: /Search tag/ }).fill('ACER-NEW-1');
    await expect(page.getByRole('row', { name: /AST-LAP-002/ })).toContainText('In stock', slow);
  });

  test('issue: POST /assets/:id/issue; the asset and its event come from the server', async ({ page }) => {
    const fake = new FakeAssets().full();
    await open(page, fake, ASSETS);
    await waitAssetsLoaded(page);
    await openDetail(page, 'AST-PHN-001');
    await page.getByRole('button', { name: 'Issue', exact: true }).click();
    const d = dialog(page, 'Issue asset');
    await d.getByLabel('Issue to').selectOption(DEV);
    await d.getByTestId('ack-check').check();
    await d.getByRole('button', { name: 'Issue asset' }).click();
    await expect(d).toHaveCount(0, slow);
    await expect.poll(() => fake.callsTo('POST', new RegExp(`^/assets/${PHN}/issue$`)).length, { timeout: 20_000 }).toBe(1);
    expect(fake.callsTo('POST', new RegExp(`^/assets/${PHN}/issue$`))[0]!.body).toMatchObject({ person_id: DEV, ack: true });
    expect(fake.asset(PHN)).toMatchObject({ status: 'issued', holder_id: DEV });
    // reflected in the still-open detail view from the server's answer, then in the table
    await expect(dialog(page, /AST-PHN-001/)).toContainText('Dev Nair');
    await closeModals(page);
    await expect(page.getByRole('row', { name: /AST-PHN-001/ })).toContainText('Dev Nair', slow);
    await expect(page.getByRole('row', { name: /AST-PHN-001/ })).toContainText('Issued');
  });

  test('return, transfer, repair-out, repair-back, lost, retire each hit their endpoint; history stays append-only', async ({ page }) => {
    const fake = new FakeAssets().full();
    await open(page, fake, ASSETS);
    await waitAssetsLoaded(page);

    // return Asha's laptop (issued -> in_stock)
    await openDetail(page, 'AST-LAP-001');
    await page.getByRole('button', { name: 'Record return' }).click();
    let d = dialog(page, 'Record return');
    await d.getByLabel('Condition on return').selectOption('good');
    await d.getByLabel('Where does it go next').selectOption('in_stock');
    await d.getByRole('button', { name: 'Record return' }).click();
    await expect.poll(() => fake.callsTo('POST', new RegExp(`^/assets/${LAP}/return$`)).length, { timeout: 20_000 }).toBe(1);
    expect(fake.asset(LAP)).toMatchObject({ status: 'in_stock', holder_id: null });
    await closeModals(page);

    // transfer the phone requires it to be issued first; issue it then transfer
    await openDetail(page, 'AST-PHN-001');
    await page.getByRole('button', { name: 'Issue', exact: true }).click();
    d = dialog(page, 'Issue asset');
    await d.getByLabel('Issue to').selectOption(ASHA);
    await d.getByTestId('ack-check').check();
    await d.getByRole('button', { name: 'Issue asset' }).click();
    await expect(d).toHaveCount(0, slow);
    await page.getByRole('button', { name: 'Transfer', exact: true }).click();
    d = dialog(page, 'Transfer asset');
    await d.getByLabel('Transfer to').selectOption(DEV);
    await d.getByTestId('ack-check').check();
    await d.getByRole('button', { name: 'Transfer asset' }).click();
    await expect.poll(() => fake.callsTo('POST', new RegExp(`^/assets/${PHN}/transfer$`)).length, { timeout: 20_000 }).toBe(1);
    expect(fake.asset(PHN)).toMatchObject({ status: 'issued', holder_id: DEV });
    await closeModals(page);

    // repair-out then repair-back on the laptop (now in_stock)
    await openDetail(page, 'AST-LAP-001');
    await page.getByRole('button', { name: 'Send for repair' }).click();
    await dialog(page, 'Send for repair').getByRole('button', { name: 'Send for repair' }).click();
    await expect.poll(() => fake.callsTo('POST', new RegExp(`^/assets/${LAP}/repair-out$`)).length, { timeout: 20_000 }).toBe(1);
    expect(fake.asset(LAP).status).toBe('in_repair');
    await page.getByRole('button', { name: 'Back from repair' }).click();
    d = dialog(page, 'Back from repair');
    await d.getByLabel('Condition now').selectOption('good');
    await d.getByRole('button', { name: 'Back from repair' }).click();
    await expect.poll(() => fake.callsTo('POST', new RegExp(`^/assets/${LAP}/repair-back$`)).length, { timeout: 20_000 }).toBe(1);
    expect(fake.asset(LAP).status).toBe('in_stock');
    await closeModals(page);

    // retire the sentinel tool (in_stock -> retired)
    await openDetail(page, 'AST-TLS-001');
    await page.getByRole('button', { name: 'Retire' }).click();
    await dialog(page, 'Retire asset').getByRole('button', { name: 'Retire asset' }).click();
    await expect.poll(() => fake.callsTo('POST', new RegExp(`^/assets/${TLS}/retire$`)).length, { timeout: 20_000 }).toBe(1);
    expect(fake.asset(TLS).status).toBe('retired');

    // the history is append-only: the laptop kept its two seed events and gained return, repair-out, repair-back
    const kinds = fake.eventsOf(LAP).map((e) => e.kind);
    expect(kinds.slice(0, 2)).toEqual(['purchased', 'issued']);
    expect(kinds).toEqual(['purchased', 'issued', 'returned', 'repair_out', 'repair_back']);
  });

  test('mark lost: the asset leaves the usable list from the server\'s answer', async ({ page }) => {
    const fake = new FakeAssets().full();
    await open(page, fake, ASSETS);
    await waitAssetsLoaded(page);
    await openDetail(page, 'AST-PHN-001');
    await page.getByRole('button', { name: 'Mark lost' }).click();
    const d = dialog(page, 'Mark as lost');
    await d.getByLabel('What happened').fill('Left in a taxi.');
    await d.getByRole('button', { name: 'Mark as lost' }).click();
    await expect.poll(() => fake.callsTo('POST', new RegExp(`^/assets/${PHN}/lost$`)).length, { timeout: 20_000 }).toBe(1);
    expect(fake.asset(PHN).status).toBe('lost');
    await closeModals(page);
    await expect(page.getByRole('row', { name: /AST-PHN-001/ })).toContainText('Lost', slow);   // still listed, but no longer "usable"
    await expect(page.getByTestId('assets-stats')).toContainText('2');                           // usable dropped from 3 to 2
  });
});

// ═════════════════════════════ refusals ═════════════════════════════
test.describe('live assets: an illegal transition shows the server\'s plain reason and changes nothing', () => {
  test('a refused issue keeps the asset in stock and surfaces the reason', async ({ page }) => {
    const fake = new FakeAssets().full();
    fake.failures.push({ when: (c) => c.method === 'POST' && new RegExp(`^/assets/${PHN}/issue$`).test(c.path), status: 409, error: 'AST-PHN-001 is issued, so it cannot be issued.', code: 'ASSET_STATE' });
    await open(page, fake, ASSETS);
    await waitAssetsLoaded(page);
    await openDetail(page, 'AST-PHN-001');
    await page.getByRole('button', { name: 'Issue', exact: true }).click();
    const d = dialog(page, 'Issue asset');
    await d.getByLabel('Issue to').selectOption(DEV);
    await d.getByTestId('ack-check').check();
    await d.getByRole('button', { name: 'Issue asset' }).click();
    await expect(toasts(page).filter({ hasText: 'AST-PHN-001 is issued, so it cannot be issued.' })).toBeVisible({ timeout: 20_000 });
    expect(fake.asset(PHN).status).toBe('in_stock');     // the server never changed it
    await closeModals(page);
    await expect(page.getByRole('row', { name: /AST-PHN-001/ })).toContainText('In stock');   // unchanged locally
  });
});

// ═════════════════════════════ storage + local Rewards slices ═════════════════════════════
test.describe('live assets: the register is never persisted; benefits and compensation stay local', () => {
  test('nothing from the live register reaches browser storage, while benefits/compensation remain the local seed', async ({ page }) => {
    const fake = new FakeAssets().full();
    await open(page, fake, ASSETS);
    await waitAssetsLoaded(page);
    // do a server command so there is live asset state in memory
    await openDetail(page, 'AST-PHN-001');
    await page.getByRole('button', { name: 'Issue', exact: true }).click();
    const d = dialog(page, 'Issue asset');
    await d.getByLabel('Issue to').selectOption(DEV);
    await d.getByTestId('ack-check').check();
    await d.getByRole('button', { name: 'Issue asset' }).click();
    await expect(dialog(page, /AST-PHN-001/)).toContainText('Dev Nair');
    await closeModals(page);

    // The live register (its sentinel asset among them) is held in memory only: it is never written to any storage key.
    const storage = await dumpStorage(page);
    expect(storage).not.toContain(SENTINEL_SERIAL);
    expect(storage).not.toContain(SENTINEL_MAKE);

    // compensation is local: visiting it keeps the rewards area store's compensation (the browser-only note stays).
    // (benefits is server-backed since phase 7, so it no longer carries the browser-only note.)
    await page.goto(COMPENSATION);
    await expect(page.getByRole('heading', { name: 'Compensation', exact: true })).toBeVisible(slow);
    await expect(page.getByTestId('hrms-local-note')).toBeVisible();
    const after = await dumpStorage(page);
    const area = JSON.parse(JSON.parse(after)['kinematic_hrms_area_rewards_v1'] as string) as { benefits: unknown; comp: unknown };
    expect(area.benefits).toBeTruthy();          // the rewards area store still holds its local seed
    expect(area.comp).toBeTruthy();
    expect(after).not.toContain(SENTINEL_SERIAL); // still no live register data in storage
    expect(after).not.toContain(SENTINEL_MAKE);
  });
});
