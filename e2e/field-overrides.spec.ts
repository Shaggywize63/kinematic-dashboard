import { test, expect, type Page } from '@playwright/test';
import { seedSession, mockApi } from './utils';

/**
 * The built-in field-override contract, asserted END-TO-END through the real
 * lead-create form — not just the resolver unit.
 *
 * The invariant every CLAUDE.md hammers on: when an admin hides a built-in
 * field on CRM Settings (persisted in `crm_settings.config.field_overrides`),
 * that field must DISAPPEAR from the form; when they relabel it, the new label
 * must render. We've repeatedly shipped bugs where ONE render site was missed
 * (the City/LocationPicker, B2B Company, Status/Source). This spec is the gate
 * that makes a missed Create-form render site fail CI.
 *
 * The form reads overrides from GET /api/v1/crm/settings and gates each
 * built-in row through `fields.isHidden(key)` / `fields.labelFor(key, …)`
 * (src/lib/crmFieldOverrides.ts), rendering inputs as `#lead-field-<key>`.
 *
 * GATED_CREATE_FIELDS is the enumerated contract: every built-in Create-form
 * field that renders by default on the `both` business type. When a new
 * built-in field is added to the create form, add its key here — the loop then
 * forces it to prove it honours the hide override. Fields rendered only under
 * a conditional (address_line1 / visit_at) or without a stable id (owner_id,
 * the consent checkboxes) are covered by the targeted tests instead.
 *
 * Edit modal (LeadEditModal) and the lead Detail B2C profile card are the next
 * increments of this gate — they render by label rather than `#lead-field-*`
 * and need a mocked lead, so they land in a follow-up spec.
 */

const settingsWith = (overrides: Record<string, unknown>) => ({
  success: true,
  data: { business_type: 'both', config: { field_overrides: overrides } },
});

const NEW_LEAD = '/dashboard/crm/leads/new';

// A built-in field that is never hidden in a given test, used as the "form has
// hydrated" readiness signal. first_name and phone are both core, so whichever
// one a test is NOT hiding is a safe anchor.
const anchorFor = (hiddenKey: string) => (hiddenKey === 'first_name' ? '#lead-field-phone' : '#lead-field-first_name');

const GATED_CREATE_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'company',
  'city',
  'status',
  'source_id',
] as const;

test.describe('Built-in field overrides — lead create form', () => {
  test('control: with no overrides, every gated field renders', async ({ page }) => {
    await seedSession(page);
    await mockApi(page, { settings: settingsWith({}) });
    await page.goto(NEW_LEAD);

    await expect(page.locator('#lead-field-first_name')).toBeVisible();
    for (const key of GATED_CREATE_FIELDS) {
      await expect(page.locator(`#lead-field-${key}`), `${key} should render when not overridden`).toHaveCount(1);
    }
  });

  // The enumerated gate: hide each built-in field in turn and prove the render
  // site honours it. A missed `isHidden` gate on any one of these fails here.
  for (const key of GATED_CREATE_FIELDS) {
    test(`"${key}" disappears when the admin hides it`, async ({ page }) => {
      await seedSession(page);
      await mockApi(page, { settings: settingsWith({ [`lead.${key}`]: { hidden: true } }) });
      await page.goto(NEW_LEAD);

      await expect(page.locator(anchorFor(key))).toBeVisible();
      // Gone entirely, not just visually hidden.
      await expect(page.locator(`#lead-field-${key}`), `${key} should be removed when hidden`).toHaveCount(0);
    });
  }

  test('a non-overridden field is unaffected when a sibling is hidden', async ({ page }) => {
    await seedSession(page);
    await mockApi(page, {
      settings: settingsWith({ 'lead.city': { hidden: true }, 'lead.industry': { hidden: true } }),
    });
    await page.goto(NEW_LEAD);

    await expect(page.locator('#lead-field-first_name')).toBeVisible();
    await expect(page.locator('#lead-field-city')).toHaveCount(0);
    await expect(page.locator('#lead-field-phone')).toHaveCount(1);
    await expect(page.locator('#lead-field-company')).toHaveCount(1);
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

  // Relabels: the label a tenant sets must render at the field's own site, so
  // the admin can rename without code. Covers both a text field and a select.
  const relabels: Array<{ key: string; label: string }> = [
    { key: 'first_name', label: 'Given Name' },
    { key: 'status', label: 'Pipeline Stage' },
  ];
  for (const { key, label } of relabels) {
    test(`an admin relabel of "${key}" renders the custom label`, async ({ page }) => {
      await seedSession(page);
      await mockApi(page, { settings: settingsWith({ [`lead.${key}`]: { label } }) });
      await page.goto(NEW_LEAD);

      await expect(page.locator(`#lead-field-${key}`)).toHaveCount(1);
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    });
  }
});
