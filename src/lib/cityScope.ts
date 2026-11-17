/**
 * CRM city-scope routing contract.
 *
 * A global city picker (CityScopePicker → localStorage `kinematic_selected_city`)
 * auto-appends `?city=` to CRM GET requests in api.ts. It may only be attached
 * to endpoints whose backend handler actually filters by `city`. Attaching it
 * anywhere else makes the backend's generic list helper run `.eq('city', …)`
 * against a table with no `city` column, which 500s — and the UI then renders
 * an empty dropdown ("only Unspecified"). This is a recurring "half-wired"
 * failure, so the whitelist lives in one place with a test that pins it.
 */

// CRM endpoints whose backend handler actually filters by city. Anything
// not on this list (lead-sources, assignment-rules, products, settings,
// stages, hierarchy, …) goes through the generic list helper, which would
// blindly `.eq('city', …)` and 500 on tables with no city column.
export const CITY_AWARE_CRM_PREFIXES = [
  '/api/v1/crm/search',
  '/api/v1/crm/leads',
  '/api/v1/crm/contacts',
  '/api/v1/crm/accounts',
  '/api/v1/crm/deals',
  '/api/v1/crm/activities',
  '/api/v1/crm/tasks',
  '/api/v1/crm/notes',
  '/api/v1/crm/reports',
  '/api/v1/crm/dashboard',
  '/api/v1/crm/analytics',
  '/api/v1/crm/lead-analytics',
];

// Never city-scoped, whatever the list above grows into: the Sales / Collection
// rupee targets (types, progress, entries, the typed boards) belong to a
// person, not a city, and the backend does not read `city` on them — a stray
// `?city=` would only fragment the response cache.
export const NEVER_CITY_SCOPED = ['/api/v1/crm/targets'];

/**
 * Structural reads under /crm/accounts that must NEVER be narrowed by the global
 * city picker. Two shapes:
 *
 *  1. The children query (`/crm/accounts?parent_account_id=…`) — "which plants
 *     belong to this company" is a structural relationship, not a territory.
 *     `crm_accounts.city` is a legacy column the UI never populates, so
 *     `.eq('city', picked)` matches nothing: the plant list, and the whole
 *     account tree built from it, came back empty whenever a city was picked.
 *  2. A single account and its sub-resources (`/crm/accounts/:id`,
 *     `/crm/accounts/:id/leads|contacts|deals|activities`) — the account 360 is
 *     already scoped to one account, so narrowing its own roll-up by the picked
 *     city hid most of it (an account with 11 leads rendered 3).
 *
 * The top-level `/crm/accounts` LIST stays city-aware, so no other tenant's
 * Accounts page changes behaviour.
 *
 * This is not a permission boundary. The backend scopes accounts by org +
 * client (`strictClient`) and owner visibility, and still caps lead reads by the
 * user's `assigned_city_names`, so dropping `?city=` here cannot widen what a
 * user is allowed to see — it only stops the picker from hiding rows that
 * belong to the account being viewed.
 */
export function isStructuralAccountRead(path: string): boolean {
  const ACCOUNTS = '/api/v1/crm/accounts';
  // A single account and everything hanging off it.
  if (path.startsWith(`${ACCOUNTS}/`)) return true;
  // The list form, but only when it is asking for one parent's children.
  if (path === ACCOUNTS || path.startsWith(`${ACCOUNTS}?`)) {
    return /[?&]parent_account_id=/.test(path);
  }
  return false;
}

/**
 * Whether the picked city may be auto-attached to a GET of `path`. A prefix
 * matches the exact path, a sub-path (`${prefix}/…`) or a query form
 * (`${prefix}?…`) — never a different endpoint that merely starts with the
 * same letters (e.g. `/api/v1/crm/leads-import` must NOT match `/leads`).
 */
export function isCityAwareCrmPath(path: string): boolean {
  const matches = (p: string) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`);
  if (NEVER_CITY_SCOPED.some(matches)) return false;
  if (isStructuralAccountRead(path)) return false;
  return CITY_AWARE_CRM_PREFIXES.some(matches);
}
