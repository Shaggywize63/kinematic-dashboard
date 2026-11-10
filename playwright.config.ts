import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'fs';

/**
 * Playwright E2E config for the Kinematic dashboard (Next.js App Router).
 *
 * Browser: this environment ships a PRE-INSTALLED Chromium under
 * /opt/pw-browsers. The pinned @playwright/test build expects a different
 * revision folder, so instead of relying on revision matching we point
 * `launchOptions.executablePath` straight at the bundled chrome binary.
 * Run with:
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
 *   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx playwright test
 *
 * Never run `playwright install` here (it will try to download behind the
 * proxy and fail).
 */

// Resolve the Chromium binary shipped in this environment. Prefer an explicit
// override, then the known pre-installed path, then fall back to Playwright's
// own resolution (executablePath left undefined).
function resolveChromiumPath(): string | undefined {
  const candidates = [
    process.env.PW_CHROMIUM_EXECUTABLE,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return undefined;
}

const executablePath = resolveChromiumPath();

// PW_PORT lets several runs share one machine, each on its own port (the CI run and a default run use 3000).
const PORT = process.env.PW_PORT || '3000';

export default defineConfig({
  testDir: './e2e',
  // The HRMS module has its own job in CI (it adds a few hundred specs, which on top of the rest of the serial suite
  // outgrew the 25-minute cap). PW_SKIP_HRMS=1 leaves those files out of the main run; `playwright test hrms-` runs only them.
  // `hrms-*` is the core module, `hrmsx-*` the field-force, compliance, talent and workplace modules built on top of it
  // (their own job too). `playwright test hrmsx-` runs only those.
  // The report and widget specs for Lead Management and Field Force (about 400 specs) have their own job as well:
  // PW_SKIP_PLUS=1 leaves them out of the main run; `playwright test "(crm|ffm)-(reports|widgets)-plus"` runs only them.
  testIgnore: [
    ...(process.env.PW_SKIP_HRMS ? [/e2e\/hrmsx?-.*\.spec\.ts$/] : []),
    ...(process.env.PW_SKIP_PLUS ? [/e2e\/(crm|ffm)-(reports|widgets)-plus\.spec\.ts$/] : []),
  ],
  // First-time `next dev` route compiles can be slow; keep generous timeouts.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Reliability over speed: a single dev server + serial tests avoids
  // cross-test interference and first-compile stampedes.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: `http://localhost:${PORT}`,
    // The dashboard registers a Web-Push service worker that would otherwise
    // sit in front of the network and swallow requests before page.route()
    // sees them (breaking route interception). Block SW registration so every
    // fetch is a normal, interceptable page request.
    serviceWorkers: 'block',
    // Lead-create geo-tagging: the form auto-requests the device location on
    // mount and keeps the submit button disabled until lat/lng are set, so we
    // grant + pre-seed a fixed position for every test context.
    geolocation: { latitude: 12.9716, longitude: 77.5946 },
    permissions: ['geolocation'],
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: Number(process.env.PW_SERVER_TIMEOUT || 120_000),
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      PORT,
      // Pin the API base host. The app's Content-Security-Policy `connect-src`
      // is built from NEXT_PUBLIC_API_URL (see next.config.mjs), so setting it
      // both fixes the API origin AND allowlists it — otherwise browser CSP
      // blocks the cross-origin fetch before Playwright's page.route() can
      // intercept it. Route-intercepted specs mock everything under this host;
      // demo-mode specs never hit the network at all.
      NEXT_PUBLIC_API_URL: 'http://localhost:4000',
    },
  },
});
