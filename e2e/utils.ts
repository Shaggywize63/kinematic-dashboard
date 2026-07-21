import type { Page, Route } from '@playwright/test';

/**
 * Shared helpers for the Kinematic dashboard E2E suite.
 *
 * Two auth strategies are used across the specs:
 *
 *  1. DEMO MODE (offline) — logging in as `demo@kinematic.com` short-circuits
 *     the whole API client on the client side and serves canned fixtures from
 *     src/lib/demoMocks.ts. No backend, no interception. Used for read /
 *     navigation flows.
 *
 *  2. SEEDED SESSION + ROUTE INTERCEPTION — for write assertions we seed a
 *     NON-demo session into localStorage (so the client actually issues
 *     fetches) and intercept every `**​/api/v1/**` request with page.route().
 */

export const DEMO_EMAIL = 'demo@kinematic.com';
export const DEMO_PASSWORD = 'demo1234';

/**
 * A non-demo super-admin user matching the /auth/me payload shape. Seeded into
 * localStorage so the dashboard guard (getStoredUser() + isSessionValid())
 * passes without a real backend. `client_id: null` + super_admin means the
 * lead form treats us as a platform admin: not Tata, not Kinematic-tenant, so
 * geolocation capture runs and the B2B/B2C toggle behaves normally.
 */
export const SEED_USER = {
  id: 'e2e-user-1',
  org_id: 'e2e-org-1',
  client_id: null,
  name: 'E2E Admin',
  email: 'e2e@example.com',
  role: 'super_admin',
  permissions: [] as string[],
  enabled_modules: ['crm', 'analytics', 'distribution', 'people', 'reports'],
  enabled_packages: ['crm', 'field_force', 'distribution', 'business', 'system', 'people'],
  is_active: true,
};

/** UI login as the offline demo account; lands on /dashboard. */
export async function demoLogin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('you@company.com').fill(DEMO_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(DEMO_PASSWORD);
  const signIn = page.getByRole('button', { name: /Sign In/ });
  await signIn.click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
}

/**
 * Seed a NON-demo session into localStorage before the first navigation, so
 * the dashboard shell renders without a UI login. Pair with mockApi() so the
 * layout's own /auth/me + ui-flags calls resolve.
 */
export async function seedSession(page: Page, user: Record<string, unknown> = SEED_USER): Promise<void> {
  await page.addInitScript(
    ([u]) => {
      const w = window as unknown as { localStorage: Storage };
      w.localStorage.setItem('kinematic_token', 'e2e-token');
      w.localStorage.setItem('kinematic_user', JSON.stringify(u));
      w.localStorage.setItem('kinematic_expiry', String(Math.floor(Date.now() / 1000) + 86_400));
    },
    [user],
  );
}

type MockOverrides = {
  /** Called for every intercepted request; return true if it was handled. */
  onRequest?: (route: Route, url: string, method: string) => Promise<boolean> | boolean;
  /** Response for GET /api/v1/crm/settings (drives field overrides + b2c/b2b). */
  settings?: unknown;
  /** Response for GET /api/v1/auth/me. */
  me?: unknown;
};

/**
 * Intercept every backend call. Custom handlers get first crack via
 * `onRequest`; otherwise we return sensible defaults so no request ever
 * reaches the (absent) real backend and hangs the page:
 *   - GET  -> { success: true, data: [] }
 *   - else -> { success: true, data: {} }
 * External assets (Google Maps, fonts) are left untouched, except Maps JS
 * which we abort so the address autocomplete never blocks on it.
 */
export async function mockApi(page: Page, overrides: MockOverrides = {}): Promise<void> {
  // Google Maps script would otherwise try to reach the network; abort it so
  // GoogleAddressAutocomplete falls back to a plain input immediately.
  await page.route(/https:\/\/maps\.googleapis\.com\/.*/, (route) => route.abort());

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    if (overrides.onRequest) {
      const handled = await overrides.onRequest(route, url, method);
      if (handled) return;
    }

    const path = url.split('?')[0];

    if (method === 'GET' && path.endsWith('/crm/settings')) {
      return route.fulfill({
        json: overrides.settings ?? { success: true, data: { business_type: 'both', config: {} } },
      });
    }
    if (method === 'GET' && path.endsWith('/auth/me')) {
      return route.fulfill({ json: overrides.me ?? { success: true, data: SEED_USER } });
    }

    if (method === 'GET') {
      return route.fulfill({ json: { success: true, data: [] } });
    }
    return route.fulfill({ json: { success: true, data: {} } });
  });
}
