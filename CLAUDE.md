# Kinematic Dashboard — Agent Guide

Next.js (App Router) + React + TypeScript web dashboard for the Kinematic CRM /
field-force product. It talks to the Express/Supabase backend (repo: `Kinematic`)
over `/api/v1/...`.

Key conventions:
- **Multi-tenant.** Requests auto-attach `X-Org-Id` and `X-Client-Id` in
  `src/lib/api.ts`. A global **city scope** (`CityScopeContext` →
  `kinematic_selected_city`) auto-appends `?city=` to CRM GET requests.
- **Inline styles** (no CSS modules) — responsiveness comes from a `narrow` /
  `isCompact` viewport flag, **not** CSS media queries.
- API client lives in `src/lib/crmApi.ts` and `src/lib/api.ts`.

## Golden rule: wire BOTH ends for every new module / feature

A green typecheck does **not** mean a feature works. Almost every bug here has
been "half-wired": the backend was fine but the UI never sent the param, never
refetched when a filter changed, rendered a dropdown with no options, or didn't
sort by the field it persisted. Before calling anything done, verify the whole
chain end-to-end:

1. **DB** — table/columns exist **and are populated** (check real data, not just
   the schema).
2. **Backend** — route mounted + service implemented; query params actually
   applied to the **right** columns; tenant/client scoping correct; `tsc` clean.
3. **API client** — a typed method points at the real route and the request
   carries the params/headers it needs (`X-Client-Id`, `?city=`, `owner_id`, …).
4. **Frontend** — the control is present **and its options are loaded**; its
   state is sent to the API; the data-fetch `useEffect` lists it in its
   dependency array so changing it **refetches**; global store/context filters
   (e.g. the city scope) are actually **subscribed to** by the page.
5. **Render** — lists sort/group by the field you persisted (e.g. `position`),
   so a change is visible and survives reload.
6. **Parity** — CSV/export paths share the list's filters; the same wiring
   exists on iOS/Android where the feature should appear.
7. **Verify against real data** and state explicitly what you could not verify
   (missing key, sparse data, etc.).

## Built-in field overrides — the contract

Every render site for a built-in lead / contact / deal / account field
(those persisted as columns on the row, not custom-field jsonb) MUST
be gated through the field-override helpers. There is no exception
and no "I'll add the gate later". If a new field is added to the
form, it ships gated on day one.

- Resolver: `kinematic-dashboard/src/lib/crmFieldOverrides.ts` —
  `extractFieldOverrides(settingsData)` + `buildFieldHelpers(map,
  entity, scope)` returns `{ isHidden, labelFor, requiredFor }`.
- Web lead forms use a `show(key, <Field />)` helper or a direct
  `!fields.isHidden(key)` wrap.
- The lead-form admin (Settings → Custom Fields) writes the override
  as `${entity}.${key}` (and optionally `@b2c` / `@b2b` for a scoped
  variant). Tata Tiscon currently hides DOB / Gender / Preferred
  Channel / City / State / Country / Company / Title / Industry /
  Date of Birth / Email.

If you add a new built-in field anywhere on a lead / contact / deal /
account form, the PR MUST include three things:
1. `isHidden(key)` wrap at every render site (Create + Edit + Detail).
2. `labelFor(key, default)` for the label so admins can relabel it.
3. `requiredFor(key, defaultRequired)` for required-marker support.

## Build / check
- `npx tsc --noEmit` — a pre-existing `baseUrl` deprecation warning is expected;
  treat only other errors as failures.
