import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Client Management → Edit client → App Customization → "Features" → "Ask users to rate the app on Google Play"
 * (`app_ui.features.rate_prompt`, read by the Android app from /auth/me `app_ui_config`).
 *
 * Unlike every other control in that panel (hide-only: absent = shown) this one is OPT-IN: it is off unless the stored
 * value is exactly `true`, saving writes `features: { rate_prompt: true }` only when on, and turning it off deletes the
 * key (and `features` itself once empty) rather than storing `false` — so a legacy client's stored config does not change
 * unless an admin touches it.
 *
 * Everything runs against an intercepted API: a tiny stateful fake of GET /api/v1/clients and PATCH /api/v1/clients/:id
 * that, like the real backend, REPLACES `app_ui` wholesale with whatever the dashboard sends. The tests assert on what
 * the panel shows and on the exact `app_ui` it sends.
 */

const SWITCH_NAME = 'Ask users to rate the app on Google Play';

// A client that already has hide-only customization + a rename, so "alongside the untouched existing sections" is real.
const EXISTING_UI = {
  menu: { profile: false, broadcast: false },
  tabs: { new_form: false },
  home: { open_volume: false },
  labels: { menu: { profile: 'My Profile' } },
};

type AppUi = Record<string, unknown>;
type Body = { name?: string; app_ui?: AppUi } & Record<string, unknown>;

/** Mount Client Management with a single client whose stored app_ui is `appUi`; returns the PATCH bodies seen. */
async function open(page: Page, appUi: AppUi) {
  const patches: Body[] = [];
  // No org_id on purpose: a row with one gets an extra "Envs" action button, which these tests don't need.
  const client = { id: 'cl-e2e-1', name: 'Rate Test Client', is_active: true, modules: [] as string[], created_at: '2026-01-01T00:00:00Z', app_ui: appUi };

  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const path = new URL(url).pathname;
      if (method === 'GET' && path === '/api/v1/clients') {
        await route.fulfill({ json: { success: true, data: [client] } });
        return true;
      }
      if (method === 'PATCH' && path === `/api/v1/clients/${client.id}`) {
        const body = route.request().postDataJSON() as Body;
        patches.push(body);
        // The backend replaces app_ui wholesale with what it is sent.
        if (body.app_ui !== undefined) client.app_ui = body.app_ui;
        await route.fulfill({ json: { success: true, data: { ...client, app_ui: client.app_ui } } });
        return true;
      }
      return false;
    },
  });
  await page.goto('/dashboard/clients');
  await openEditor(page);
  return { patches };
}

async function openEditor(page: Page) {
  await page.getByTitle('Edit client').click();
  await expect(page.getByText('Update configurations for Rate Test Client')).toBeVisible();
}

const rateSwitch = (page: Page) => page.getByRole('switch', { name: SWITCH_NAME });

async function save(page: Page, patches: Body[], expectedCount: number) {
  await page.getByRole('button', { name: 'Update Client' }).click();
  await expect.poll(() => patches.length).toBe(expectedCount);
  // The modal closes once the PATCH resolves.
  await expect(page.getByText('Update configurations for Rate Test Client')).toBeHidden();
}

test.describe('Client Management — App Customization → Features → rate_prompt', () => {
  test('is off for a client with no features, and says what it does', async ({ page }) => {
    await open(page, EXISTING_UI);

    await expect(page.getByText('Features', { exact: true })).toBeVisible();
    const sw = rateSwitch(page);
    await expect(sw).toBeVisible();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('Shown after a few days of use, at most 3 times.', { exact: false })).toBeVisible();

    // Features is not one of the hide-only sections: it gets no Show all / Hide all of its own (5 sections only).
    await expect(page.getByRole('button', { name: 'Show all' })).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Hide all' })).toHaveCount(5);
  });

  test('is off for a client with no app customization at all', async ({ page }) => {
    await open(page, {});
    await expect(rateSwitch(page)).toHaveAttribute('aria-checked', 'false');
  });

  test('turning it on sends app_ui with exactly features.rate_prompt=true, next to the untouched sections', async ({ page }) => {
    const { patches } = await open(page, EXISTING_UI);

    await rateSwitch(page).click();
    await expect(rateSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await save(page, patches, 1);

    expect(patches[0].app_ui).toEqual({ ...EXISTING_UI, features: { rate_prompt: true } });
    expect(Object.keys((patches[0].app_ui as { features: object }).features)).toEqual(['rate_prompt']);
    expect((patches[0].app_ui as { features: { rate_prompt: unknown } }).features.rate_prompt).toBe(true);

    // It persisted: reopening the editor shows it on.
    await openEditor(page);
    await expect(rateSwitch(page)).toHaveAttribute('aria-checked', 'true');
  });

  test('turning it on for a client with no app customization sends only features.rate_prompt=true', async ({ page }) => {
    const { patches } = await open(page, {});
    await rateSwitch(page).click();
    await save(page, patches, 1);
    expect(patches[0].app_ui).toEqual({ features: { rate_prompt: true } });
  });

  test('a client that already has features.rate_prompt=true renders it on', async ({ page }) => {
    await open(page, { ...EXISTING_UI, features: { rate_prompt: true } });
    await expect(rateSwitch(page)).toHaveAttribute('aria-checked', 'true');
  });

  test('turning it off removes the key (and features) instead of storing false', async ({ page }) => {
    const { patches } = await open(page, { ...EXISTING_UI, features: { rate_prompt: true } });

    await rateSwitch(page).click();
    await expect(rateSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await save(page, patches, 1);

    expect(patches[0].app_ui).toEqual(EXISTING_UI);
    expect(patches[0].app_ui).not.toHaveProperty('features');
    expect(JSON.stringify(patches[0].app_ui)).not.toContain('rate_prompt');

    // It persisted: reopening the editor shows it off.
    await openEditor(page);
    await expect(rateSwitch(page)).toHaveAttribute('aria-checked', 'false');
  });

  test('turning it off keeps any other feature key and only drops rate_prompt', async ({ page }) => {
    const { patches } = await open(page, { ...EXISTING_UI, features: { rate_prompt: true, some_other_flag: true } });

    await rateSwitch(page).click();
    await save(page, patches, 1);

    expect(patches[0].app_ui).toEqual({ ...EXISTING_UI, features: { some_other_flag: true } });
  });

  test('on then off again before saving leaves a client with no features exactly as it was', async ({ page }) => {
    const { patches } = await open(page, EXISTING_UI);

    await rateSwitch(page).click();
    await rateSwitch(page).click();
    await expect(rateSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await save(page, patches, 1);

    expect(patches[0].app_ui).toEqual(EXISTING_UI);
    expect(patches[0].app_ui).not.toHaveProperty('features');
  });

  test('saving without touching Features does not change a legacy client\'s stored config', async ({ page }) => {
    // A stored `false` (or no key) is "off"; an untouched save must send it back exactly as loaded.
    const legacy = { ...EXISTING_UI, features: { rate_prompt: false } };
    const { patches } = await open(page, legacy);
    await expect(rateSwitch(page)).toHaveAttribute('aria-checked', 'false');

    await save(page, patches, 1);
    expect(patches[0].app_ui).toEqual(legacy);
  });

  test('editing a hide-only item does not invent a features key on a client without one', async ({ page }) => {
    const { patches } = await open(page, EXISTING_UI);
    await page.getByRole('button', { name: 'Attendance', exact: true }).click();
    await save(page, patches, 1);
    expect(patches[0].app_ui).toEqual({ ...EXISTING_UI, tabs: { new_form: false, attendance: false } });
    expect(patches[0].app_ui).not.toHaveProperty('features');
  });

  test('editing a hide-only item keeps features.rate_prompt=true on a client that has it', async ({ page }) => {
    const { patches } = await open(page, { ...EXISTING_UI, features: { rate_prompt: true } });
    await page.getByRole('button', { name: 'Attendance', exact: true }).click();
    await save(page, patches, 1);
    expect(patches[0].app_ui).toEqual({ ...EXISTING_UI, tabs: { new_form: false, attendance: false }, features: { rate_prompt: true } });
  });

  // Opt-in means EXACTLY true: anything else stored is off (and is left alone until an admin touches it).
  for (const [label, stored] of [['false', false], ['the string "true"', 'true'], ['the number 1', 1], ['null', null]] as const) {
    test(`a stored rate_prompt of ${label} renders off`, async ({ page }) => {
      await open(page, { ...EXISTING_UI, features: { rate_prompt: stored } });
      await expect(rateSwitch(page)).toHaveAttribute('aria-checked', 'false');
    });
  }
});
