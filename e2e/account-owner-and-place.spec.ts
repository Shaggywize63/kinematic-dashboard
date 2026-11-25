import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok, USERS } from './spark';

/**
 * Two account-detail improvements:
 *  - The header Owner key-fact is a change-owner control for admins (parity with leads, whose header
 *    carries "Change owner"); a field rep sees it read-only.
 *  - The Edit Account modal has a Google place search that fills the Name AND the address from the
 *    picked place (backend Places proxy — no frontend Maps key needed).
 */

const ACCOUNT = {
  id: 'account-1', name: 'Nair Steel Traders', industry: 'Steel',
  owner_id: 'u-asha', owner_name: 'Asha Rao',
  address_line1: '', state: '', postal_code: '', country: 'India',
  created_by: SEED_USER.id, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

type Captured = { patches: Array<Record<string, unknown>> };

async function setup(page: Page, opts: { role?: string; places?: boolean } = {}): Promise<Captured> {
  const role = opts.role ?? 'super_admin';
  const user = { ...SEED_USER, role };
  const cap: Captured = { patches: [] };
  await seedSession(page, user);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'both', config: { field_overrides: {} } } },
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/users') return ok(route, USERS);
      if (method === 'GET' && p === `/api/v1/crm/accounts/${ACCOUNT.id}`) return ok(route, ACCOUNT);
      if (method === 'PATCH' && p === `/api/v1/crm/accounts/${ACCOUNT.id}`) {
        cap.patches.push(route.request().postDataJSON() as Record<string, unknown>);
        const body = route.request().postDataJSON() as Record<string, unknown>;
        // Echo back a stamped owner_name when the owner changed, like the server.
        const owner_name = body.owner_id === 'u-ravi' ? 'Ravi Kumar' : ACCOUNT.owner_name;
        return ok(route, { ...ACCOUNT, ...body, owner_name });
      }
      if (opts.places && method === 'GET' && p === '/api/v1/crm/places/autocomplete') {
        return ok(route, [{ place_id: 'p1', description: 'The Ramco Cements Limited, Kolaghat, West Bengal' }]);
      }
      if (opts.places && method === 'GET' && p === '/api/v1/crm/places/details') {
        return ok(route, { address_line1: 'Mecheda, Kolaghat, West Bengal 721134', city: 'Kolaghat', state: 'West Bengal', postal_code: '721134' });
      }
      return false;
    },
  });
  return cap;
}

test.describe('account header — change owner (admin parity with leads)', () => {
  test('an admin reassigns the account owner from the header and it is saved', async ({ page }) => {
    const cap = await setup(page);
    await page.goto('/dashboard/crm/accounts/account-1');
    const ownerField = page.getByTestId('account-owner-field');
    await expect(ownerField).toBeVisible({ timeout: 30_000 });
    // The owner shows as a clickable reassign control (not plain text).
    await ownerField.getByRole('button', { name: /Asha Rao/ }).click();
    // Pick a different owner from the popup.
    await page.getByText('Ravi Kumar', { exact: true }).click();
    await expect.poll(() => cap.patches.length).toBeGreaterThan(0);
    expect(cap.patches[0].owner_id).toBe('u-ravi');
    // The header reflects the new owner.
    await expect(ownerField).toContainText('Ravi Kumar');
  });

  test('a field rep sees the owner read-only (no reassign control)', async ({ page }) => {
    await setup(page, { role: 'executive' });
    await page.goto('/dashboard/crm/accounts/account-1');
    await expect(page.getByTestId('account-key-facts')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('account-owner-field')).toHaveCount(0);
    // The owner is still shown, just not editable.
    await expect(page.getByTestId('account-key-facts')).toContainText('Asha Rao');
  });
});

test.describe('Edit Account — Google name + address search', () => {
  test('picking a place fills the Name and the address', async ({ page }) => {
    await setup(page, { places: true });
    await page.goto('/dashboard/crm/accounts/account-1');
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Edit Account' });
    await expect(dialog).toBeVisible();

    const search = dialog.locator('#account-place-search');
    await expect(search).toBeVisible();
    await search.fill('The Ramco Cements');
    // Backend autocomplete result appears; pick it.
    const option = dialog.getByText('The Ramco Cements Limited, Kolaghat, West Bengal');
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();

    // Name is filled from the establishment name; address from the resolved place.
    await expect(dialog.locator('[data-field="name"] input')).toHaveValue('The Ramco Cements Limited');
    await expect(dialog.locator('[data-field="address_line1"] input')).toHaveValue('Mecheda, Kolaghat, West Bengal 721134');
  });
});
