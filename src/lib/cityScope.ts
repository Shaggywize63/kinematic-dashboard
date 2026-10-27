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
 * Whether the picked city may be auto-attached to a GET of `path`. A prefix
 * matches the exact path, a sub-path (`${prefix}/…`) or a query form
 * (`${prefix}?…`) — never a different endpoint that merely starts with the
 * same letters (e.g. `/api/v1/crm/leads-import` must NOT match `/leads`).
 */
export function isCityAwareCrmPath(path: string): boolean {
  const matches = (p: string) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`);
  if (NEVER_CITY_SCOPED.some(matches)) return false;
  return CITY_AWARE_CRM_PREFIXES.some(matches);
}
