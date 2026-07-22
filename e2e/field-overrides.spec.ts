import { test, expect } from '@playwright/test';
import { seedSession, mockApi } from './utils';

/**
 * The built-in field-override contract, asserted END-TO-END through the real
 * lead-create form — not just the resolver unit.
 *
 * The invariant every CLAUDE.md hammers on: when an admin hides a built-in
 * field on CRM Settings (persisted in `crm_settings.config.field_overrides`),
 * that field must DISAPPEAR from the form; when they relabel it, the new label
 * must render. Here we drive `/dashboard/crm/leads/new` with a mocked
 * `/crm/settings` response and assert the rendered DOM honours the override.
 *
 * The form reads overrides from GET /api/v1/crm/settings and gates each
 * built-in row through `fields.isHidden(key)` / `fields.labelFor(key, …)`
 * (src/lib/crmFieldOverrides.ts), rendering inputs as `#lead-field-<key>`.
 */

const settingsWith = (overrides: Record<string, unknown>) => ({
  success: true,
  data: { business_type: 'both', config: { field_overrides: overrides } },
});

const NEW_LEAD = '/dashboard/crm/leads/new';

test.describe('Built-in field overrides — lead create form', () => {
  test('control: with no overrides, City and Company render', async ({ page }) => {
    await seedSession(page);
    await mockApi(page, { settings: settingsWith({}) });
    await page.goto(NEW_LEAD);

    // First name is the readiness signal — the form has hydrated.
    await expect(page.locator('#lead-field-first_name')).toBeVisible();
    // Not hidden by default → the City picker wrapper and Company input are present.
    await expect(page.locator('#lead-field-city')).toHaveCount(1);
    await expect(page.locator('#lead-field-company')).toHaveCount(1);
  });

  test('an admin-hidden field disappears from the form', async ({ page }) => {
    await seedSession(page);
    // Hide City and Industry universally — the exact thing Tata Tiscon does.
    await mockApi(page, {
      settings: settingsWith({
        'lead.city': { hidden: true },
        'lead.industry': { hidden: true },
      }),
    });
    await page.goto(NEW_LEAD);

    await expect(page.locator('#lead-field-first_name')).toBeVisible();
    // The gated rows are gone entirely, not just visually hidden.
    await expect(page.locator('#lead-field-city')).toHaveCount(0);
    await expect(page.locator('#lead-field-industry')).toHaveCount(0);
    // A non-overridden field is unaffected.
    await expect(page.locator('#lead-field-phone')).toHaveCount(1);
  });

  test('a hidden field re-appears once the override is cleared', async ({ page }) => {
    await seedSession(page);
    await mockApi(page, { settings: settingsWith({ 'lead.city': { hidden: true } }) });
    await page.goto(NEW_LEAD);
    await expect(page.locator('#lead-field-first_name')).toBeVisible();
    await expect(page.locator('#lead-field-city')).toHaveCount(0);

    // Re-navigate with the override removed — the field returns. Proves the
    // gate tracks the setting rather than being coincidentally absent.
    await mockApi(page, { settings: settingsWith({}) });
    await page.goto(NEW_LEAD);
    await expect(page.locator('#lead-field-first_name')).toBeVisible();
    await expect(page.locator('#lead-field-city')).toHaveCount(1);
  });

  test('an admin relabel renders the custom label', async ({ page }) => {
    await seedSession(page);
    await mockApi(page, {
      settings: settingsWith({ 'lead.first_name': { label: 'Given Name' } }),
    });
    await page.goto(NEW_LEAD);

    await expect(page.locator('#lead-field-first_name')).toBeVisible();
    // The custom label is shown instead of the built-in "First Name".
    await expect(page.getByText('Given Name', { exact: false }).first()).toBeVisible();
  });
});
