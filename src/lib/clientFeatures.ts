/**
 * Client-specific feature gates.
 *
 * The dashboard is a single SaaS shipped to many tenants, but a handful
 * of behaviours are bespoke for a particular client. Rather than
 * sprinkle hardcoded UUIDs through every component, gates live here so
 * the comparison + falsy-default logic is in one place.
 *
 *   isTataTiscon(user)        → true for users on TATA Tiscon's tenant.
 *   isConsumerChampion(user)  → true when the user's designation /
 *                               org_role.name is "Consumer Champion".
 *                               TATA's frontline FE designation; gates
 *                               score / boost / analytics surfaces.
 */

export const TATA_TISCON_CLIENT_ID = 'a1f67468-526e-4734-be3a-2cb132cc2804';

/** BMW — the second steel-dealer-style tenant. Shares Tata's bespoke
 * behaviours (tonne/kg deal pricing, product-basket at convert, the SRS
 * lead-report CSV export) but keeps its own navigation. */
export const BMW_CLIENT_ID = '2ee5e03a-3a56-41c9-aaa0-16468920f871';

/** The parent Kinematic tenant. Used to trim CRM surfaces Kinematic
 * doesn't use (Pipeline, Products, People Directory, leads-on-map). */
export const KINEMATIC_CLIENT_ID = '7ecd47d7-9268-4ea2-a8ce-384978c13667';

/** Tenants that run the steel-dealer feature set (weight-based deal
 * pricing, product-basket capture at convert, SRS lead report). Tata
 * Tiscon was the original; BMW is folded in as the second one. Gate
 * every steel-dealer-specific surface on membership in this set rather
 * than a bare `=== TATA_TISCON_CLIENT_ID` so both tenants stay in sync. */
const STEEL_DEALER_CLIENT_IDS = [TATA_TISCON_CLIENT_ID, BMW_CLIENT_ID];

type AnyUser = {
  client_id?: string | null;
  org_role?: { name?: string | null } | null;
  org_role_name?: string | null;
} | null | undefined;

export function isTataTiscon(user: AnyUser): boolean {
  return STEEL_DEALER_CLIENT_IDS.includes(user?.client_id ?? '');
}

/**
 * Match the user's org_role.name (or the flat `org_role_name` field
 * the API also exposes) against the Consumer Champion designation.
 * Case-insensitive + tolerant of surrounding whitespace so admin-edited
 * role names like " Consumer Champion " still match.
 */
export function isConsumerChampion(user: AnyUser): boolean {
  const name = (user?.org_role?.name ?? user?.org_role_name ?? '').toString().trim().toLowerCase();
  return name.includes('consumer champion');
}

/**
 * Read the active tenant id the user is operating against — falls back
 * to the user's bound client_id, then to the super-admin client picker
 * value in localStorage. Returns null when none of these resolve.
 */
export function activeClientId(user: AnyUser): string | null {
  if (user?.client_id) return user.client_id;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('kinematic_selected_client');
    if (raw && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return raw;
  } catch { /* ignore */ }
  return null;
}

export function isTataTiscanActive(user: AnyUser): boolean {
  return STEEL_DEALER_CLIENT_IDS.includes(activeClientId(user) ?? '');
}

/**
 * The SRS / Tata field report (Reports → "SRS Lead Report") is an
 * operational export for exactly two org roles: the Area Sales Officer
 * (sees only their own leads) and the CRM Admin (sees the whole tenant,
 * i.e. Hema). The backend enforces the same role gate and 403s anyone
 * else — this helper only decides whether to render the tile / page, so
 * the two must stay in sync with SRS_REPORT_ROLES in the backend's
 * crm.routes.ts.
 */
export const SRS_REPORT_ROLES = ['area sales officer', 'crm admin'];

// BMW is included as the second steel-dealer tenant: isTataTiscanActive now
// matches BMW's client id too, and BMW's admin carries the "CRM Admin"
// org_role (in SRS_REPORT_ROLES), so this gate lets BMW download the report.
export function canDownloadSrsReport(user: AnyUser): boolean {
  if (!isTataTiscanActive(user)) return false;
  const role = (user?.org_role?.name ?? user?.org_role_name ?? '').toString().trim().toLowerCase();
  return SRS_REPORT_ROLES.includes(role);
}

/** True when the active tenant is BMW. */
export function isBmwActive(user: AnyUser): boolean {
  return activeClientId(user) === BMW_CLIENT_ID;
}

/**
 * Client-aware label for the field lead report. The CSV format is shared,
 * but BMW should see it named for their own tenant ("BMW Lead Report")
 * rather than the SRS wording. Every render site (Reports tile + the report
 * page heading) routes its title through this so the two stay in sync.
 */
export function leadReportLabel(user: AnyUser): string {
  return isBmwActive(user) ? 'BMW Lead Report' : 'SRS Lead Report';
}

/** True when the active tenant (bound client_id or super-admin picker) is
 * the parent Kinematic tenant. */
export function isKinematicActive(user: AnyUser): boolean {
  return activeClientId(user) === KINEMATIC_CLIENT_ID;
}
