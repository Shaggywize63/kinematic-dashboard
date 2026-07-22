# E2E tests (Playwright)

End-to-end tests for the Kinematic dashboard, driven by Playwright against a
local `next dev` server.

## Running

The Chromium browser is **pre-installed** in this environment under
`/opt/pw-browsers`. Do **not** run `playwright install` (it tries to download a
browser and fails behind the proxy). Always export these two vars so Playwright
uses the bundled browser:

```bash
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
npx playwright test --reporter=list
```

Or via npm scripts (same env vars still required):

```bash
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm run test:e2e
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm run test:e2e:ui
```

`playwright.config.ts` points `launchOptions.executablePath` at the bundled
Chromium binary (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) because
the pinned `@playwright/test` build expects a different revision folder. Override
the binary with `PW_CHROMIUM_EXECUTABLE=/path/to/chrome` if needed.

The `webServer` block boots `npm run dev` on port 3000 (reusing an already
running server if one is up). No env vars are required for the app itself — the
login page is a pure client component and the demo mode never touches a backend.

## Two testing strategies

### 1. Demo mode (offline, no backend)
Logging in as `demo@kinematic.com` with any password ≥ 4 chars short-circuits
the API client on the client side and serves canned fixtures from
`src/lib/demoMocks.ts` / `src/lib/demo/seedData.ts`. Used for all read /
navigation flows (`auth`, `leads`, `navigation`, `settings` specs) via the
`demoLogin()` helper in `utils.ts`.

### 2. Seeded session + route interception
For write assertions we seed a **non-demo** session into `localStorage`
(`seedSession()`), which makes the client issue real fetches, then intercept
every `**/api/v1/**` request with `mockApi()`. This lets us capture the
`POST /crm/leads` body and assert the create flow end-to-end
(`lead-create.spec.ts`).

## Files

- `utils.ts` — shared helpers (`demoLogin`, `seedSession`, `mockApi`, fixtures).
- `auth.spec.ts` — redirects, login render, submit-gating, demo login, guard.
- `leads.spec.ts` — leads table, total pill, search, row + New-Lead nav.
- `lead-create.spec.ts` — intercepted create success + validation.
- `navigation.spec.ts` — smoke-nav across CRM routes.
- `settings.spec.ts` — CRM settings / field-overrides hub renders.
