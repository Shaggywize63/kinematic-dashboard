import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Client Management → Edit client → App Layout → live phone preview. The phone redraws on every edit, screens in it can be
 * clicked to rename / move / hide, dragged between the bar and the side menu, and the whole editor opens full screen.
 * Runs against an intercepted API.
 */

type Body = { app_ui?: Record<string, any> } & Record<string, unknown>;

const FF = ['attendance', 'orders', 'activities', 'form_builder', 'leave', 'broadcast', 'timeline', 'notifications', 'settings'];

async function open(page: Page, opts: { modules?: string[]; appUi?: Record<string, unknown> } = {}) {
  const patches: Body[] = [];
  const client = { id: 'cl-preview-1', name: 'Preview Client', is_active: true, modules: opts.modules ?? FF, created_at: '2026-01-01T00:00:00Z', app_ui: opts.appUi ?? {} };
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const path = new URL(url).pathname;
      if (method === 'GET' && path === '/api/v1/clients') { await route.fulfill({ json: { success: true, data: [client] } }); return true; }
      if (method === 'PATCH' && path === `/api/v1/clients/${client.id}`) {
        patches.push(route.request().postDataJSON() as Body);
        await route.fulfill({ json: { success: true, data: client } });
        return true;
      }
      return false;
    },
  });
  await page.goto('/dashboard/clients');
  await page.getByTitle('Edit client').click();
  await expect(page.getByText('Update configurations for Preview Client')).toBeVisible();
  return { patches };
}

const phone = (page: Page) => page.getByRole('group', { name: 'App preview' });
const zone = (page: Page, name: string) => page.getByRole('list', { name, exact: true });
const editPanel = (page: Page) => page.getByRole('group', { name: 'Edit selected screen' });
const barLabels = async (page: Page) =>
  (await zone(page, 'Bottom bar').getByRole('listitem').allInnerTexts()).map((t) => t.split('\n')[0].replace(/\s*tab only\s*$/i, '').trim());
const save = async (page: Page, patches: Body[]) => {
  await page.getByRole('button', { name: 'Update Client' }).click();
  await expect.poll(() => patches.length).toBe(1);
};

test.describe('Client Management — live app preview', () => {
  test('the phone shows the client\'s bottom bar and updates the moment the layout changes', async ({ page }) => {
    await open(page);
    // Home + the four default tabs.
    for (const l of ['Attendance', 'Route Plan', 'Activity', 'New Form']) await expect(phone(page).getByRole('button', { name: `Preview ${l}` })).toBeVisible();
    await expect(phone(page).getByRole('button', { name: 'Preview Leave' })).toHaveCount(0);

    // Hide New Form and put Leave in its place — the phone follows with no save.
    await page.getByLabel('Move New Form to').selectOption('hidden');
    await expect(phone(page).getByRole('button', { name: 'Preview New Form' })).toHaveCount(0);
    await page.getByLabel('Move Leave to').selectOption('bar');
    await expect(phone(page).getByRole('button', { name: 'Preview Leave' })).toBeVisible();
  });

  test('screens a client has no module for never appear in the phone', async ({ page }) => {
    await open(page, { modules: FF.filter((m) => m !== 'leave') });
    await page.getByRole('tab', { name: 'Side menu' }).click();
    await expect(phone(page).getByRole('button', { name: 'Preview Broadcast Messages' })).toBeVisible();
    await expect(phone(page).getByRole('button', { name: 'Preview Leave' })).toHaveCount(0);
    await expect(phone(page).getByRole('button', { name: 'Preview Learning Hub' })).toHaveCount(0);
  });

  test('click a screen in the phone and rename it: the phone and the saved config both change', async ({ page }) => {
    const { patches } = await open(page);
    await page.getByRole('tab', { name: 'Side menu' }).click();
    await phone(page).getByRole('button', { name: 'Preview Leave' }).click();
    await expect(editPanel(page).getByLabel('Selected screen placement')).toHaveValue('menu');

    await editPanel(page).getByLabel('Screen name').fill('Time off');
    await expect(phone(page).getByRole('button', { name: 'Preview Time off' })).toBeVisible();
    await expect(phone(page).getByRole('button', { name: 'Preview Leave' })).toHaveCount(0);
    // The row in the list on the left shows the new name too.
    await expect(zone(page, 'Side menu').getByRole('listitem').filter({ hasText: 'Time off' })).toBeVisible();

    await save(page, patches);
    expect(patches[0].app_ui!.labels).toEqual({ menu: { leave: 'Time off' } });
  });

  test('clearing the name or "Reset" goes back to the app\'s own name and stores nothing', async ({ page }) => {
    const { patches } = await open(page, { appUi: { labels: { menu: { leave: 'Time off' } } } });
    await page.getByRole('tab', { name: 'Side menu' }).click();
    await phone(page).getByRole('button', { name: 'Preview Time off' }).click();
    await page.getByRole('button', { name: /Reset to/ }).click();
    await expect(phone(page).getByRole('button', { name: 'Preview Leave' })).toBeVisible();
    await expect(editPanel(page).getByLabel('Screen name')).toHaveValue('Leave');
    await save(page, patches);
    expect(patches[0].app_ui!.labels).toBeUndefined();
  });

  test('"Hide from app" in the quick editor removes it from the phone, "Show in app" brings it back', async ({ page }) => {
    const { patches } = await open(page);
    await page.getByRole('tab', { name: 'Side menu' }).click();
    await phone(page).getByRole('button', { name: 'Preview Timeline' }).click();
    await editPanel(page).getByRole('button', { name: 'Hide from app' }).click();
    await expect(phone(page).getByRole('button', { name: 'Preview Timeline' })).toHaveCount(0);
    await expect(zone(page, 'Hidden').getByRole('listitem').filter({ hasText: 'Timeline' })).toBeVisible();

    // Hidden screens can be picked from the list on the left and shown again.
    await zone(page, 'Hidden').getByRole('listitem').filter({ hasText: 'Timeline' }).click();
    await editPanel(page).getByRole('button', { name: 'Show in app' }).click();
    await expect(phone(page).getByRole('button', { name: 'Preview Timeline' })).toBeVisible();
    await save(page, patches);
    expect(patches[0].app_ui!.menu?.timeline).toBeUndefined();
  });

  test('the placement menu moves a screen between bar and side menu', async ({ page }) => {
    const { patches } = await open(page);
    await page.getByLabel('Move New Form to').selectOption('hidden'); // make room in the bar
    await page.getByRole('tab', { name: 'Side menu' }).click();
    await phone(page).getByRole('button', { name: 'Preview Broadcast Messages' }).click();
    await editPanel(page).getByLabel('Selected screen placement').selectOption('bar');
    await expect(zone(page, 'Bottom bar').getByRole('listitem').filter({ hasText: 'Broadcast Messages' })).toBeVisible();
    await save(page, patches);
    expect(patches[0].app_ui!.layout.tabs).toEqual(['attendance', 'route_plan', 'activity', 'broadcast']);
  });

  test('drag a screen inside the phone: reorder the bar, and move one from the side menu into it', async ({ page }) => {
    const { patches } = await open(page);
    // Reorder: Activity dropped on the left half of Attendance.
    const att = phone(page).getByRole('button', { name: 'Preview Attendance' });
    const box = (await att.boundingBox())!;
    await phone(page).getByRole('button', { name: 'Preview Activity' }).dragTo(att, { targetPosition: { x: Math.max(2, box.width / 5), y: box.height / 2 } });
    await expect.poll(async () => (await barLabels(page))[0]).toBe('Activity');

    // The bar is full: dragging a menu screen into it is refused with the reason, nothing moves.
    await page.getByRole('tab', { name: 'Side menu' }).click();
    await phone(page).getByRole('button', { name: 'Preview Leave' }).dragTo(att);
    await expect(page.getByRole('alert').filter({ hasText: 'holds Home plus 4' })).toBeVisible();

    // Free a slot, then the same drag lands in the bar.
    await page.getByLabel('Move New Form to').selectOption('hidden');
    await phone(page).getByRole('button', { name: 'Preview Leave' }).dragTo(phone(page).getByRole('button', { name: 'Preview Attendance' }));
    await expect(zone(page, 'Bottom bar').getByRole('listitem').filter({ hasText: 'Leave' })).toBeVisible();
    await save(page, patches);
    expect(patches[0].app_ui!.layout.tabs).toContain('leave');
    expect(patches[0].app_ui!.layout.tabs[0]).toBe('activity');
  });

  test('Settings, CRM More and Home screens show their own rows, reordered and hidden live', async ({ page }) => {
    await open(page, { modules: [...FF, 'crm_leads', 'crm_deals', 'crm_pipeline', 'crm_accounts', 'crm_dashboard', 'stores'] });
    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(phone(page).getByRole('button', { name: 'Preview Appearance' })).toBeVisible();
    await page.getByLabel('Hide App Lock (biometric)').click();
    await expect(phone(page).getByRole('button', { name: /Preview App Lock/ })).toHaveCount(0);
    await page.getByLabel('Move About (version / build) up').click();

    await page.getByRole('tab', { name: 'CRM More' }).click();
    await expect(phone(page).getByRole('button', { name: 'Preview Pipeline' })).toBeVisible();
    await expect(phone(page).getByText('Leads', { exact: true })).toBeVisible(); // the CRM shell's own bar

    await page.getByRole('tab', { name: 'Home' }).click();
    await expect(phone(page).getByRole('button', { name: /Preview My Stores|Preview Stores/ })).toBeVisible();
  });

  test('Android / iPhone and zoom change the phone only', async ({ page }) => {
    const { patches } = await open(page);
    const frame = phone(page);
    const w0 = (await frame.boundingBox())!.width;
    await page.getByRole('button', { name: 'iPhone' }).click();
    await expect(page.getByRole('button', { name: 'iPhone' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('90%', { exact: true })).toBeVisible(); // opens at 90%
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByText('100%', { exact: true })).toBeVisible();
    expect((await frame.boundingBox())!.width).toBeGreaterThan(w0);
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(page.getByText('80%', { exact: true })).toBeVisible();
    expect((await frame.boundingBox())!.width).toBeLessThan(w0);
    await save(page, patches);
    expect(patches[0].app_ui).toEqual({});
  });

  test('full-screen designer: same editor and phone, edits carry through, Escape closes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { patches } = await open(page);
    await page.getByRole('button', { name: 'Open full-screen designer' }).click();
    const dlg = page.getByRole('dialog', { name: 'App layout designer' });
    await expect(dlg).toBeVisible();
    // One copy of the editor only (the form behind shows a placeholder).
    await expect(page.getByRole('list', { name: 'Bottom bar', exact: true })).toHaveCount(1);
    await expect(dlg.getByText('Live preview')).toBeVisible();
    const ph = (await dlg.getByRole('group', { name: 'App preview' }).boundingBox())!;
    expect(ph.y + ph.height).toBeLessThanOrEqual(900); // opens at a zoom that fits the window
    expect(ph.width).toBeGreaterThanOrEqual(300);

    await dlg.getByLabel('Move Leave to').selectOption('hidden');
    await dlg.getByRole('tab', { name: 'Side menu' }).click();
    await expect(dlg.getByRole('group', { name: 'App preview' }).getByRole('button', { name: 'Preview Leave' })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open full-screen designer' })).toBeFocused();
    await expect(zone(page, 'Hidden').getByRole('listitem').filter({ hasText: 'Leave' })).toBeVisible();
    await save(page, patches);
    expect(patches[0].app_ui!.menu.leave).toBe(false);
  });

  test('the modal is wide enough for the editor and the phone side by side', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    const list = (await zone(page, 'Bottom bar').boundingBox())!;
    const ph = (await phone(page).boundingBox())!;
    expect(ph.x).toBeGreaterThan(list.x + list.width); // phone sits to the right of the lists, not below
  });
});
