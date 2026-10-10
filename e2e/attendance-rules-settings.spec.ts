import { test, expect, type Page } from '@playwright/test';
import { demoLogin, mockApi, seedSession, SEED_USER } from './utils';

/**
 * Settings → Operational rules → "Attendance & shift rules" (per-client rules: shift window, late grace, weekly
 * offs, offline check-in, selfie required, check-in/out on every form). Backed by GET/PATCH
 * /api/v1/org-settings/attendance-rules.
 *
 * Everything runs against an intercepted API (a tiny stateful fake of that endpoint) and asserts on what the
 * page shows and what it SENDS: load, the not-configured state, a save round-trip incl. the PATCH body, the
 * saved / failed toasts, the form being inert while saving, and the "Select a client first" guidance.
 */

// What the server resolves for a client that configured nothing: the original five rules plus the two newer ones.
const DEFAULTS = {
  shift_start: '09:30', shift_end: '18:00', grace_minutes: 15, weekly_off: [0], allow_offline_checkin: false,
  selfie_required: true, form_checkin_required: false,
};

const BOUNDS = { grace_minutes: { min: 0, max: 120 } };

interface Seen { method: string; path: string; body: any }
interface Fake {
  configured: boolean;
  rules: Partial<typeof DEFAULTS>;
  /** What `defaults` carries; an old server has no selfie / form check-in rules at all. */
  defaults?: Partial<typeof DEFAULTS>;
  /** Awaited before the PATCH is answered, so a test can look at the page mid-save. */
  patchGate?: Promise<void>;
  patchFail?: { status: number; error: string };
  getFail?: { status: number; error: string };
  gets: number;
}

async function setup(page: Page, init: Partial<Fake> = {}) {
  const seen: Seen[] = [];
  const fake: Fake = { configured: false, rules: { ...DEFAULTS }, gets: 0, ...init };
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
      if (path !== '/api/v1/org-settings/attendance-rules') return false;
      let body: any = null;
      try { body = route.request().postDataJSON(); } catch { /* not json */ }
      if (method !== 'GET') seen.push({ method, path, body });
      const payload = () => ({ success: true, data: { configured: fake.configured, rules: fake.rules, defaults: fake.defaults ?? DEFAULTS, bounds: BOUNDS } });

      if (method === 'GET') {
        fake.gets++;
        if (fake.getFail) { await route.fulfill({ status: fake.getFail.status, json: { success: false, error: fake.getFail.error } }); return true; }
        await route.fulfill({ json: payload() });
        return true;
      }
      if (method === 'PATCH') {
        if (fake.patchGate) await fake.patchGate;
        if (fake.patchFail) { await route.fulfill({ status: fake.patchFail.status, json: { success: false, error: fake.patchFail.error } }); return true; }
        fake.rules = { ...fake.rules, ...body };
        fake.configured = true;
        await route.fulfill({ json: payload() });
        return true;
      }
      return false;
    },
  });
  return { seen, fake };
}

async function openRules(page: Page) {
  await page.goto('/dashboard/settings');
  await page.getByRole('tab', { name: 'Operational rules' }).click();
}

const saveBtn = (page: Page) => page.getByRole('button', { name: /Save attendance rules|Saving…/ });
const offlineSwitch = (page: Page) => page.getByRole('switch', { name: 'Allow offline check-in' });
const selfieSwitch = (page: Page) => page.getByRole('switch', { name: 'Selfie required for check-in / check-out' });
const formSwitch = (page: Page) => page.getByRole('switch', { name: 'Check-in and check-out on every form' });

test.describe('Attendance & shift rules (Settings)', () => {
  test('a client with no rules sees the defaults and the "not configured yet" state', async ({ page }) => {
    await setup(page);
    await openRules(page);

    await expect(page.getByText('Attendance & shift rules')).toBeVisible();
    await expect(page.getByText('Not configured yet — using defaults')).toBeVisible();
    await expect(page.getByText('Using defaults', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Shift start')).toHaveValue('09:30');
    await expect(page.getByLabel('Shift end')).toHaveValue('18:00');
    await expect(page.getByLabel('Late grace (minutes)')).toHaveValue('15');
    await expect(page.getByRole('button', { name: 'Sunday' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Saturday' })).toHaveAttribute('aria-pressed', 'false');
    await expect(offlineSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('Reps can check in without network; the time of the tap is used')).toBeVisible();
    // Selfie is required unless a client turns it off; form check-in/out is off unless a client turns it on.
    await expect(selfieSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(formSwitch(page)).toHaveAttribute('aria-checked', 'false');
    // Nothing decorative is left in this card: the old unsaved sliders are gone.
    await expect(page.getByText('Auto checkout threshold')).toHaveCount(0);
    await expect(page.getByText('Late grace period')).toHaveCount(0);
  });

  test('edit, save, and the PATCH body carries every rule; a reload reads them back', async ({ page }) => {
    const { seen } = await setup(page);
    await openRules(page);
    await expect(page.getByLabel('Shift start')).toHaveValue('09:30');

    await page.getByLabel('Shift start').fill('10:00');
    await page.getByLabel('Shift end').fill('19:00');
    await page.getByLabel('Late grace (minutes)').fill('20');
    await page.getByRole('button', { name: 'Saturday' }).click();
    await offlineSwitch(page).click();
    await expect(offlineSwitch(page)).toHaveAttribute('aria-checked', 'true');

    await saveBtn(page).click();

    await expect(page.getByText('Attendance rules saved').first()).toBeVisible();
    const patches = seen.filter((r) => r.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({
      shift_start: '10:00', shift_end: '19:00', grace_minutes: 20, weekly_off: [0, 6], allow_offline_checkin: true,
    });
    // The form now reflects a configured client.
    await expect(page.getByText('Not configured yet — using defaults')).toHaveCount(0);
    await expect(page.getByText('Configured', { exact: true })).toBeVisible();
    await expect(saveBtn(page)).toBeDisabled(); // nothing left to save

    // Reload: the values come from the server, not from page state.
    await page.reload();
    await page.getByRole('tab', { name: 'Operational rules' }).click();
    await expect(page.getByLabel('Shift start')).toHaveValue('10:00');
    await expect(page.getByLabel('Late grace (minutes)')).toHaveValue('20');
    await expect(page.getByRole('button', { name: 'Saturday' })).toHaveAttribute('aria-pressed', 'true');
    await expect(offlineSwitch(page)).toHaveAttribute('aria-checked', 'true');
  });

  test('a client with no rules has nothing to save until something changes: a displayed default is not a change', async ({ page }) => {
    const { seen } = await setup(page);
    await openRules(page);
    await expect(page.getByText('Not configured yet — using defaults')).toBeVisible();
    await expect(saveBtn(page)).toBeDisabled();
    await page.getByLabel('Late grace (minutes)').fill('15'); // typed, but it is the value already shown
    await expect(saveBtn(page)).toBeDisabled();
    expect(seen.filter((r) => r.method === 'PATCH')).toHaveLength(0);
  });

  test('editing only the shift start sends only that key', async ({ page }) => {
    const { seen } = await setup(page, { configured: true });
    await openRules(page);
    await page.getByLabel('Shift start').fill('10:00');
    await saveBtn(page).click();
    await expect(page.getByText('Attendance rules saved').first()).toBeVisible();
    const patches = seen.filter((r) => r.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ shift_start: '10:00' });
  });

  test('on a client with no rules, editing the shift start writes only that key (the rest keep resolving to defaults)', async ({ page }) => {
    const { seen } = await setup(page);
    await openRules(page);
    await page.getByLabel('Shift start').fill('10:00');
    await saveBtn(page).click();
    await expect(page.getByText('Attendance rules saved').first()).toBeVisible();
    expect(seen.filter((r) => r.method === 'PATCH')[0].body).toEqual({ shift_start: '10:00' });
  });

  test('toggling only the selfie switch sends exactly {"selfie_required": false}', async ({ page }) => {
    const { seen } = await setup(page, { configured: true });
    await openRules(page);
    await selfieSwitch(page).click();
    await saveBtn(page).click();
    await expect(page.getByText('Attendance rules saved').first()).toBeVisible();
    const patches = seen.filter((r) => r.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ selfie_required: false });
  });

  test('the selfie and form check-in switches save exactly what changed, and a reload reads them back', async ({ page }) => {
    const { seen } = await setup(page, { configured: true });
    await openRules(page);
    await expect(selfieSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(formSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await expect(saveBtn(page)).toBeDisabled();

    await selfieSwitch(page).click();
    await formSwitch(page).click();
    await expect(selfieSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await expect(formSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await saveBtn(page).click();

    await expect(page.getByText('Attendance rules saved').first()).toBeVisible();
    const patches = seen.filter((r) => r.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ selfie_required: false, form_checkin_required: true });
    await expect(saveBtn(page)).toBeDisabled(); // nothing left to save

    await page.reload();
    await page.getByRole('tab', { name: 'Operational rules' }).click();
    await expect(selfieSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await expect(formSwitch(page)).toHaveAttribute('aria-checked', 'true');
  });

  test('turning the selfie off for a client with no rules writes ONLY that rule (no shift window, so no late marking)', async ({ page }) => {
    const { seen } = await setup(page); // not configured
    await openRules(page);
    await selfieSwitch(page).click();
    await saveBtn(page).click();
    await expect(page.getByText('Attendance rules saved').first()).toBeVisible();
    const patches = seen.filter((r) => r.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ selfie_required: false });
  });

  test('switching a flag back before saving leaves nothing to save', async ({ page }) => {
    const { seen } = await setup(page, { configured: true });
    await openRules(page);
    await formSwitch(page).click();
    await expect(saveBtn(page)).toBeEnabled();
    await formSwitch(page).click();
    await expect(saveBtn(page)).toBeDisabled();
    expect(seen.filter((r) => r.method === 'PATCH')).toHaveLength(0);
  });

  test('a server that predates the two rules shows no such switches and never sends them', async ({ page }) => {
    const OLD = { shift_start: '09:30', shift_end: '18:00', grace_minutes: 15, weekly_off: [0], allow_offline_checkin: false };
    const { seen } = await setup(page, { configured: true, rules: { ...OLD }, defaults: OLD });
    await openRules(page);
    await expect(offlineSwitch(page)).toBeVisible();
    await expect(selfieSwitch(page)).toHaveCount(0);
    await expect(formSwitch(page)).toHaveCount(0);

    await page.getByLabel('Late grace (minutes)').fill('30');
    await saveBtn(page).click();
    await expect(page.getByText('Attendance rules saved').first()).toBeVisible();
    expect(seen.filter((r) => r.method === 'PATCH')[0].body).toEqual({ grace_minutes: 30 });
  });

  test('the form is inert while a save is in flight', async ({ page }) => {
    let release!: () => void;
    const patchGate = new Promise<void>((r) => { release = r; });
    await setup(page, { configured: true, patchGate });
    await openRules(page);
    await page.getByLabel('Late grace (minutes)').fill('30');

    await saveBtn(page).click();
    await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await expect(page.getByLabel('Shift start')).toBeDisabled();
    await expect(page.getByLabel('Late grace (minutes)')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Saturday' })).toBeDisabled();
    await expect(offlineSwitch(page)).toBeDisabled();
    await expect(selfieSwitch(page)).toBeDisabled();
    await expect(formSwitch(page)).toBeDisabled();

    release();
    await expect(page.getByText('Attendance rules saved').first()).toBeVisible();
    await expect(page.getByLabel('Shift start')).toBeEnabled();
  });

  test('a rejected save says so, keeps the edits, and can be retried', async ({ page }) => {
    const { seen, fake } = await setup(page, { configured: true });
    fake.patchFail = { status: 400, error: 'weekly_off must be a list of days 0-6' };
    await openRules(page);

    await page.getByLabel('Late grace (minutes)').fill('45');
    await saveBtn(page).click();

    await expect(page.getByText('Attendance rules were not saved').first()).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'weekly_off must be a list of days 0-6' })).toBeVisible();
    await expect(page.getByLabel('Late grace (minutes)')).toHaveValue('45'); // edits survive
    await expect(page.getByText('Attendance rules saved')).toHaveCount(0);

    fake.patchFail = undefined; // the server recovers; a second click goes through
    await saveBtn(page).click();
    await expect(page.getByText('Attendance rules saved').first()).toBeVisible();
    expect(seen.filter((r) => r.method === 'PATCH')).toHaveLength(2);
    await expect(page.getByRole('alert').filter({ hasText: 'Not saved' })).toHaveCount(0);
  });

  test('an out-of-range grace is caught before anything is sent', async ({ page }) => {
    const { seen } = await setup(page, { configured: true });
    await openRules(page);
    await page.getByLabel('Late grace (minutes)').fill('500');
    await expect(page.getByText('Enter a whole number from 0 to 120.')).toBeVisible();
    await expect(saveBtn(page)).toBeDisabled();
    expect(seen.filter((r) => r.method === 'PATCH')).toHaveLength(0);
  });

  test('with no client in scope the API says 400 and the card asks for a client instead of a form', async ({ page }) => {
    await setup(page, { getFail: { status: 400, error: 'Select a client first' } });
    await openRules(page);
    await expect(page.getByText('Select a client first')).toBeVisible();
    await expect(page.getByText(/Attendance rules are set per client/)).toBeVisible();
    await expect(page.getByLabel('Shift start')).toHaveCount(0);
    await expect(saveBtn(page)).toHaveCount(0);
  });

  test('a load failure is reported with a Retry that works', async ({ page }) => {
    const { fake } = await setup(page, { configured: true, getFail: { status: 500, error: 'rules unavailable' } });
    await openRules(page);
    await expect(page.getByRole('alert').filter({ hasText: 'rules unavailable' })).toBeVisible();
    await expect(page.getByLabel('Shift start')).toHaveCount(0);

    fake.getFail = undefined;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByLabel('Shift start')).toHaveValue('09:30');
  });

  test('demo mode renders the card from its canned data (no network, no sign-out)', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/settings');
    await page.getByRole('tab', { name: 'Operational rules' }).click();
    await expect(page.getByLabel('Shift start')).toHaveValue('09:30');
    await expect(page.getByText('Not configured yet — using defaults')).toBeVisible();
    await expect(selfieSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(formSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await expect(saveBtn(page)).toBeDisabled(); // the displayed defaults are not a change
    await selfieSwitch(page).click();
    await saveBtn(page).click();
    await expect(page.getByText('Attendance rules saved').first()).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/settings/);
  });
});
