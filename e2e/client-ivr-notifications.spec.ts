import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Client Management → Edit client:
 *  - "IVR Calling" is a dedicated switch bound to the `ivr_call` module (and no longer an item in the module grid).
 *  - "Notifications" lists the backend catalogue for this client (nothing on by default) and saves with its own PUT.
 * Everything runs against an intercepted API.
 */

type Entry = { kind: string; label: string; group: string; description: string; recommended: boolean; enabled: boolean };
const entry = (kind: string, label: string, group: string, enabled = false, recommended = false): Entry =>
  ({ kind, label, group, description: `${label} description`, recommended, enabled });

const CATALOG = (on: string[]): Entry[] => [
  entry('lead_assigned', 'Lead assigned to me', 'CRM', on.includes('lead_assigned')),
  entry('deal_won', 'Deal won', 'CRM', on.includes('deal_won')),
  entry('sos', 'SOS / panic alert', 'FieldForce', on.includes('sos'), true),
  entry('low_stock', 'Low stock', 'Distribution', on.includes('low_stock')),
  entry('security_alert', 'Security alerts', 'System', on.includes('security_alert'), true),
];

async function open(page: Page, opts: { modules?: string[]; notifOn?: string[]; projectDisabled?: boolean } = {}) {
  const patches: Array<Record<string, unknown>> = [];
  const puts: Array<{ enabled_kinds: string[] }> = [];
  let on = opts.notifOn ?? [];
  const client = { id: 'cl-e2e-1', name: 'Switch Test Client', is_active: true, modules: opts.modules ?? ['crm_leads'], created_at: '2026-01-01T00:00:00Z' };
  const view = () => ({ project_disabled: !!opts.projectDisabled, all: false, enabled_kinds: on, catalog: CATALOG(on) });

  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const path = new URL(url).pathname;
      if (method === 'GET' && path === '/api/v1/clients') { await route.fulfill({ json: { success: true, data: [client] } }); return true; }
      if (method === 'PATCH' && path === `/api/v1/clients/${client.id}`) {
        patches.push(route.request().postDataJSON());
        await route.fulfill({ json: { success: true, data: client } });
        return true;
      }
      if (path === `/api/v1/clients/${client.id}/notifications`) {
        if (method === 'PUT') {
          const body = route.request().postDataJSON() as { enabled_kinds: string[] };
          puts.push(body);
          on = body.enabled_kinds;
        }
        await route.fulfill({ json: { success: true, data: view() } });
        return true;
      }
      return false;
    },
  });
  await page.goto('/dashboard/clients');
  await page.getByTitle('Edit client').click();
  await expect(page.getByText('Update configurations for Switch Test Client')).toBeVisible();
  return { patches, puts };
}

const ivr = (page: Page) => page.getByRole('switch', { name: 'Show IVR Call to this client' });

test.describe('Client Management — IVR Calling switch', () => {
  test('is off for a client without ivr_call and is not part of the module grid', async ({ page }) => {
    await open(page);
    await expect(ivr(page)).toBeVisible();
    await expect(ivr(page)).toHaveAttribute('aria-checked', 'false');
    // The generic grid no longer carries it (it would be a second, easy-to-miss switch).
    await expect(page.getByText('IVR Call', { exact: true })).toHaveCount(0);
  });

  test('turning it on sends ivr_call with the other modules; turning it off removes only it', async ({ page }) => {
    const { patches } = await open(page, { modules: ['crm_leads', 'ivr_call'] });
    await expect(ivr(page)).toHaveAttribute('aria-checked', 'true');

    await ivr(page).click();
    await expect(ivr(page)).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('button', { name: 'Update Client' }).click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0].modules).toContain('crm_leads');
    expect(patches[0].modules).not.toContain('ivr_call');
  });

  test('a module-grid "Select all" does not switch IVR on', async ({ page }) => {
    const { patches } = await open(page, { modules: [] });
    await page.getByText('Select all', { exact: true }).first().click();
    await expect(ivr(page)).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('button', { name: 'Update Client' }).click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0].modules).not.toContain('ivr_call');
  });
});

test.describe('Client Management — Notifications', () => {
  test('shows the catalogue with nothing on for a client with no setting', async ({ page }) => {
    await open(page);
    await expect(page.getByText('0 of 5 on')).toBeVisible();
    for (const label of ['Lead assigned to me', 'Deal won', 'SOS / panic alert', 'Low stock', 'Security alerts']) {
      await expect(page.getByRole('checkbox', { name: new RegExp(label) })).not.toBeChecked();
    }
    await expect(page.getByText('Recommended')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Save notifications' })).toBeDisabled();
  });

  test('saves exactly the kinds ticked, with its own request, and shows the stored state', async ({ page }) => {
    const { puts, patches } = await open(page);
    await page.getByRole('checkbox', { name: /SOS \/ panic alert/ }).check();
    await page.getByRole('checkbox', { name: /Deal won/ }).check();
    await expect(page.getByText('2 of 5 on')).toBeVisible();
    await expect(page.getByText('Unsaved changes')).toBeVisible();

    await page.getByRole('button', { name: 'Save notifications' }).click();
    await expect.poll(() => puts.length).toBe(1);
    expect([...puts[0].enabled_kinds].sort()).toEqual(['deal_won', 'sos']);
    await expect(page.getByText('Saved. Takes effect within a minute.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save notifications' })).toBeDisabled();
    // It did not ride along with (or trigger) the client form's own save.
    expect(patches).toHaveLength(0);
  });

  test('group Select all / Turn all off / safety alerts shortcuts', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Turn on safety alerts' }).click();
    await expect(page.getByRole('checkbox', { name: /SOS/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /Security alerts/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /Low stock/ })).not.toBeChecked();

    await page.getByRole('button', { name: 'Turn all on' }).click();
    await expect(page.getByText('5 of 5 on')).toBeVisible();
    await page.getByRole('button', { name: 'Turn all off' }).click();
    await expect(page.getByText('0 of 5 on')).toBeVisible();

    await page.getByRole('button', { name: 'Select all Lead management (CRM)' }).click();
    await expect(page.getByText('2 of 5 on')).toBeVisible();
  });

  test('says so when the whole project has notifications switched off', async ({ page }) => {
    await open(page, { projectDisabled: true });
    await expect(page.getByRole('status').filter({ hasText: 'switched off for this client' })).toBeVisible();
  });
});
