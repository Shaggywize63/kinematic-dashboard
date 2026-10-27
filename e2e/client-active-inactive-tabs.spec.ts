import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Client Management → Active / Inactive tabs.
 *
 * The client list is split into an Active tab (the default) and an Inactive
 * tab. Flipping a client's status with the per-row toggle drops it out of the
 * current tab and into the other — "if a client becomes inactive it moves to
 * the Inactive tab". Runs against an intercepted API.
 */

const ACTIVE = { id: 'cl-active-1', name: 'Acme Live', is_active: true, modules: ['crm_leads'], created_at: '2026-01-01T00:00:00Z' };
const INACTIVE = { id: 'cl-inactive-1', name: 'Zeta Dormant', is_active: false, modules: ['crm_leads'], created_at: '2026-01-01T00:00:00Z' };

async function open(page: Page) {
  // Mutable copies so a PATCH { is_active } flips the served state too.
  const clients = [{ ...ACTIVE }, { ...INACTIVE }];
  const patches: Array<Record<string, unknown>> = [];
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const path = new URL(url).pathname;
      if (method === 'GET' && path === '/api/v1/clients') {
        await route.fulfill({ json: { success: true, data: clients } });
        return true;
      }
      const m = path.match(/^\/api\/v1\/clients\/([^/]+)$/);
      if (method === 'PATCH' && m) {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        patches.push(body);
        const c = clients.find(x => x.id === m[1]);
        if (c && typeof body.is_active === 'boolean') c.is_active = body.is_active;
        await route.fulfill({ json: { success: true, data: c ?? {} } });
        return true;
      }
      return false;
    },
  });
  await page.goto('/dashboard/clients');
  return { patches };
}

const tab = (page: Page, name: 'Active' | 'Inactive') => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const row = (page: Page, name: string) => page.getByText(name, { exact: true });

test.describe('Client Management — Active / Inactive tabs', () => {
  test('defaults to the Active tab and hides inactive clients', async ({ page }) => {
    await open(page);
    await expect(tab(page, 'Active')).toHaveAttribute('aria-selected', 'true');
    await expect(row(page, 'Acme Live')).toBeVisible();
    await expect(row(page, 'Zeta Dormant')).toHaveCount(0);
  });

  test('the Inactive tab shows only inactive clients', async ({ page }) => {
    await open(page);
    await tab(page, 'Inactive').click();
    await expect(tab(page, 'Inactive')).toHaveAttribute('aria-selected', 'true');
    await expect(row(page, 'Zeta Dormant')).toBeVisible();
    await expect(row(page, 'Acme Live')).toHaveCount(0);
  });

  test('deactivating a client moves it from the Active tab to the Inactive tab', async ({ page }) => {
    const { patches } = await open(page);
    // On the Active tab, flip "Acme Live" inactive via its row status toggle.
    await page.getByTitle(/click to deactivate/).click();
    // It drops out of the Active list immediately, and a PATCH persists is_active:false.
    await expect(row(page, 'Acme Live')).toHaveCount(0);
    await expect.poll(() => patches.some(p => p.is_active === false)).toBe(true);
    // It now lives under the Inactive tab.
    await tab(page, 'Inactive').click();
    await expect(row(page, 'Acme Live')).toBeVisible();
  });
});
