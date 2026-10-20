import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Client Management → Edit client → App Layout. Drag screens between the bottom bar, the side menu and Hidden, reorder
 * them, and save: the PATCH carries `app_ui.layout` + the hide flags the apps read. Runs against an intercepted API.
 */

type Body = { app_ui?: Record<string, any>; modules?: string[] } & Record<string, unknown>;

// A field-force client with leave and broadcast, but no Learning Hub / Leaderboard / CRM.
const FF = ['attendance', 'orders', 'activities', 'form_builder', 'leave', 'broadcast', 'timeline', 'notifications', 'settings'];

async function open(page: Page, opts: { modules?: string[]; appUi?: Record<string, unknown> } = {}) {
  const patches: Body[] = [];
  const client = { id: 'cl-layout-1', name: 'Layout Client', is_active: true, modules: opts.modules ?? FF, created_at: '2026-01-01T00:00:00Z', app_ui: opts.appUi ?? {} };
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const path = new URL(url).pathname;
      if (method === 'GET' && path === '/api/v1/clients') { await route.fulfill({ json: { success: true, data: [client] } }); return true; }
      if (method === 'PATCH' && path === `/api/v1/clients/${client.id}`) {
        const body = route.request().postDataJSON() as Body;
        patches.push(body);
        await route.fulfill({ json: { success: true, data: client } });
        return true;
      }
      return false;
    },
  });
  await page.goto('/dashboard/clients');
  await page.getByTitle('Edit client').click();
  await expect(page.getByText('Update configurations for Layout Client')).toBeVisible();
  return { patches };
}

const zone = (page: Page, name: string) => page.getByRole('list', { name, exact: true });
const item = (page: Page, zoneName: string, label: string) => zone(page, zoneName).getByRole('listitem').filter({ hasText: label });
const labels = async (page: Page, zoneName: string) =>
  (await zone(page, zoneName).getByRole('listitem').allInnerTexts()).map((t) => t.split('\n')[0].replace(/\s*tab only\s*$/i, '').trim());

async function save(page: Page, patches: Body[]) {
  await page.getByRole('button', { name: 'Update Client' }).click();
  await expect.poll(() => patches.length).toBe(1);
}

test.describe('Client Management — App Layout', () => {
  test('shows the default bar and menu from the client\'s modules, and lists what is not available', async ({ page }) => {
    await open(page);
    expect(await labels(page, 'Bottom bar')).toEqual(['Attendance', 'Route Plan', 'Activity', 'New Form']);
    const menu = await labels(page, 'Side menu');
    expect(menu).toEqual(expect.arrayContaining(['Profile', 'Notifications', 'Broadcast Messages', 'Leave', 'Timeline']));
    expect(menu).not.toContain('Learning Hub');
    expect(await labels(page, 'Hidden')).toEqual([]);
    await page.getByText(/Not available — needs a module/).click();
    await expect(page.getByText('Learning Hub · needs Learning Hub')).toBeVisible();
    await expect(page.getByText('CRM · needs crm package')).toBeVisible();
  });

  test('a client without the Leave module cannot place it', async ({ page }) => {
    await open(page, { modules: FF.filter((m) => m !== 'leave') });
    expect(await labels(page, 'Side menu')).not.toContain('Leave');
    await page.getByText(/Not available — needs a module/).click();
    await expect(page.getByText('Leave · needs Leave')).toBeVisible();
  });

  test('"Move to" puts a menu screen in the bottom bar (after making room) and saves the layout', async ({ page }) => {
    const { patches } = await open(page);
    // The default bar is full (Home + 4): placing a fifth is refused with a reason.
    await page.getByLabel('Move Leave to').selectOption('bar');
    await expect(page.getByRole('alert').filter({ hasText: 'holds Home plus 4' })).toBeVisible();
    expect(await labels(page, 'Bottom bar')).toEqual(['Attendance', 'Route Plan', 'Activity', 'New Form']);

    // Hide New Form, then Leave fits.
    await page.getByLabel('Move New Form to').selectOption('hidden');
    await page.getByLabel('Move Leave to').selectOption('bar');
    expect(await labels(page, 'Bottom bar')).toEqual(['Attendance', 'Route Plan', 'Activity', 'Leave']);
    expect(await labels(page, 'Side menu')).not.toContain('Leave');
    expect(await labels(page, 'Hidden')).toEqual(['New Form']);

    await save(page, patches);
    const ui = patches[0].app_ui!;
    expect(ui.layout.tabs).toEqual(['attendance', 'route_plan', 'activity', 'leave']);
    expect(ui.tabs.new_form).toBe(false);
  });

  test('drag and drop: a menu screen dragged onto Hidden is hidden; dragged back it returns', async ({ page }) => {
    const { patches } = await open(page);
    await item(page, 'Side menu', 'Broadcast Messages').dragTo(zone(page, 'Hidden'));
    await expect(item(page, 'Hidden', 'Broadcast Messages')).toBeVisible();
    expect(await labels(page, 'Side menu')).not.toContain('Broadcast Messages');

    await item(page, 'Hidden', 'Broadcast Messages').dragTo(zone(page, 'Side menu'));
    await expect(item(page, 'Side menu', 'Broadcast Messages')).toBeVisible();
    expect(await labels(page, 'Hidden')).toEqual([]);

    await item(page, 'Side menu', 'Timeline').dragTo(zone(page, 'Hidden'));
    await save(page, patches);
    expect(patches[0].app_ui!.menu.timeline).toBe(false);
    expect(patches[0].app_ui!.menu.broadcast).toBeUndefined();
  });

  test('drag and drop reorders within the bar', async ({ page }) => {
    const { patches } = await open(page);
    // Drop Activity on the top edge of the bar's first item.
    const first = item(page, 'Bottom bar', 'Attendance');
    const box = (await first.boundingBox())!;
    await item(page, 'Bottom bar', 'Activity').dragTo(first, { targetPosition: { x: 40, y: Math.max(2, box.height / 4) } });
    expect((await labels(page, 'Bottom bar'))[0]).toBe('Activity');
    await save(page, patches);
    expect(patches[0].app_ui!.layout.tabs[0]).toBe('activity');
  });

  test('↑ ↓ reorder the side menu and write the full order', async ({ page }) => {
    const { patches } = await open(page);
    const before = await labels(page, 'Side menu');
    const i = before.indexOf('Timeline');
    await page.getByLabel('Move Timeline up').click();
    const after = await labels(page, 'Side menu');
    expect(after[i - 1]).toBe('Timeline');
    await save(page, patches);
    expect(patches[0].app_ui!.layout.menu.indexOf('timeline')).toBe(i - 1);
  });

  test('bar-only screens cannot go to the menu', async ({ page }) => {
    await open(page);
    const opt = page.getByLabel('Move Attendance to').locator('option[value="menu"]');
    await expect(opt).toBeDisabled();
  });

  test('Settings rows reorder and hide; Reset layout clears the arrangement', async ({ page }) => {
    const { patches } = await open(page);
    const rows = async () => (await zone(page, 'Settings screen rows').getByRole('listitem').allInnerTexts()).map((t) => t.split('\n')[0]);
    expect((await rows())[0]).toContain('Appearance');
    await page.getByLabel('Move About (version / build) up').click();
    await page.getByLabel('Hide App Lock (biometric)').click();
    await page.getByRole('button', { name: 'Reset layout' }).click();     // drops the order…
    expect((await rows())[0]).toContain('Appearance');
    await expect(page.getByLabel('Show App Lock (biometric)')).toBeVisible(); // …but the hide stays
    await save(page, patches);
    expect(patches[0].app_ui!.layout).toBeUndefined();
    expect(patches[0].app_ui!.settings.app_lock).toBe(false);
  });

  test('a stored layout is shown as saved and survives an untouched save', async ({ page }) => {
    const { patches } = await open(page, { appUi: { layout: { tabs: ['leave', 'attendance'] }, labels: { menu: { leave: 'Time off' } } } });
    expect(await labels(page, 'Bottom bar')).toEqual(['Time off', 'Attendance']);
    await save(page, patches);
    expect(patches[0].app_ui!.layout).toEqual({ tabs: ['leave', 'attendance'] });
    expect(patches[0].app_ui!.labels).toEqual({ menu: { leave: 'Time off' } });
  });
});
