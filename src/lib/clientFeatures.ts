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

/** The parent Kinematic tenant. Used to trim CRM surfaces Kinematic
 * doesn't use (Pipeline, Products, People Directory, leads-on-map). */
export const KINEMATIC_CLIENT_ID = '7ecd47d7-9268-4ea2-a8ce-384978c13667';

type AnyUser = {
  client_id?: string | null;
  org_role?: { name?: string | null } | null;
  org_role_name?: string | null;
} | null | undefined;

export function isTataTiscon(user: AnyUser): boolean {
  return (user?.client_id ?? null) === TATA_TISCON_CLIENT_ID;
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
  return activeClientId(user) === TATA_TISCON_CLIENT_ID;
}

/** True when the active tenant (bound client_id or super-admin picker) is
 * the parent Kinematic tenant. */
export function isKinematicActive(user: AnyUser): boolean {
  return activeClientId(user) === KINEMATIC_CLIENT_ID;
}
