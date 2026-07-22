
import { AuthSession, AuthUser } from '../types';

const TOKEN_KEY = 'kinematic_token';
const REFRESH_KEY = 'kinematic_refresh_token';
const USER_KEY  = 'kinematic_user';
const EXPIRY_KEY = 'kinematic_expiry';
// Deliberately NOT cleared by clearSession() (logout) — this key exists
// specifically to survive across logout/login so the NEXT login (possibly a
// different account) can be compared against the LAST one that used this
// browser. See detectIdentitySwitch().
const LAST_IDENTITY_KEY = 'kinematic_last_identity';

interface LastIdentity {
  email: string;
  orgId: string;
  clientId: string | null;
  project: string;
}

type IdentityLike = Pick<AuthUser, 'email' | 'org_id'> & { client_id?: string | null };

/**
 * Compares the account that just logged in against whichever account last
 * logged in on THIS browser, and returns a human-readable warning if they
 * differ (null if this is the first login ever, or a re-login as the same
 * account). Call recordLoginIdentity() right after — regardless of the
 * result — so the next login has something to compare against.
 *
 * Exists to catch a recurring class of mistake in this multi-project setup:
 * believing you're acting as one account/org while the browser is actually
 * authenticated as a different, similarly-named one (e.g. s@kinematicapp.com
 * vs s@kinematic.com) — anything created under the wrong identity silently
 * lands in the wrong org/project and the mistake isn't noticed until later.
 */
export function detectIdentitySwitch(user: IdentityLike, project: string): string | null {
  if (typeof window === 'undefined') return null;
  let prev: LastIdentity | null = null;
  try {
    const raw = localStorage.getItem(LAST_IDENTITY_KEY);
    prev = raw ? JSON.parse(raw) : null;
  } catch { prev = null; }
  if (!prev) return null;

  const email = (user.email || '').toLowerCase().trim();
  const orgId = user.org_id || '';
  const clientId = user.client_id ?? null;
  const switched = prev.email !== email || prev.orgId !== orgId || prev.clientId !== clientId || prev.project !== project;
  if (!switched) return null;

  return `Switched sessions: now signed in as ${email || 'a different account'} — this browser was last signed in as ${prev.email}. If that wasn't intentional: sign out now and log back in with ${prev.email}, so anything you create lands in the right org.`;
}

/** Persist the account that just logged in, for the next detectIdentitySwitch() call. */
export function recordLoginIdentity(user: IdentityLike, project: string) {
  if (typeof window === 'undefined') return;
  try {
    const identity: LastIdentity = {
      email: (user.email || '').toLowerCase().trim(),
      orgId: user.org_id || '',
      clientId: user.client_id ?? null,
      project,
    };
    localStorage.setItem(LAST_IDENTITY_KEY, JSON.stringify(identity));
  } catch { /* ignore */ }
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(TOKEN_KEY, session.access_token);
  if (session.refresh_token) {
    localStorage.setItem(REFRESH_KEY, session.refresh_token);
  }
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  localStorage.setItem(EXPIRY_KEY, String(session.expires_at));
}

/** Used by the API client after a silent /auth/refresh round-trip. */
export function saveRefreshedTokens(accessToken: string, refreshToken?: string | null, expiresAt?: number | null) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  if (expiresAt) localStorage.setItem(EXPIRY_KEY, String(expiresAt));
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Module-permission check for the freshest user payload we have locally.
 * Mirrors the dashboard layout's `hasModule()` gate so per-page conditional
 * UI (e.g. inline "Edit stages" deep-links into /crm/settings) stays in sync
 * with the sidebar visibility instead of being hard-coded per-page.
 *
 * Platform admins (no client_id, admin-ish role) always return true — they
 * are not governed by org_role permissions. For everyone else: the module
 * must be in the client's entitlements AND in the user's role permissions
 * (or the user has no explicit permission set at all, which means they're a
 * legacy account that hadn't been migrated to org_roles yet).
 */
export function userHasModule(user: AuthUser | null | undefined, moduleId: string): boolean {
  if (!user) return false;
  const role = normalizeRole((user as any).role || '');
  const isPlatformAdmin = !(user as any).client_id && (
    ['super_admin', 'admin', 'main_admin', 'master_admin', 'sub_admin'].includes(role) || role.includes('admin')
  );
  // A scoped read-only viewer (non-super_admin) does NOT get the blanket
  // platform-admin bypass — its module access is governed by the org_role
  // entitlement/permission check below, same as the sidebar gate in the layout.
  const isReadOnlyViewer = !!(user as any).is_read_only && role !== 'super_admin';
  if (isPlatformAdmin && !isReadOnlyViewer) return true;
  const entitled: string[] = Array.isArray((user as any).enabled_modules) ? (user as any).enabled_modules : [];
  if (entitled.length > 0 && !entitled.includes(moduleId)) return false;
  const perms: string[] = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
  if (perms.length > 0) return perms.includes(moduleId);
  return true;
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

/**
 * The user is considered "logged in" as long as we have an access token
 * locally — even if the JWT exp has passed. The API client will silently
 * swap it for a fresh one on the first 401 using the refresh_token. Only
 * an explicit Sign Out (or a failed refresh) actually ends the session.
 */
export function isSessionValid(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(TOKEN_KEY);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  // Drop the resolved Supabase project so the next login re-resolves it from
  // the entered email (a different user may belong to a different project).
  localStorage.removeItem('kinematic_supabase_project');
  // Wipe the GET response cache too — otherwise a stale empty payload from
  // the previous user/session leaks into the next login (e.g. an empty leads
  // list cached during a 401 storm reappears after re-login).
  if (typeof window !== 'undefined') {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('kapi:'))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
  }
}

/** Wipe the GET response cache without logging the user out. Useful after a
 *  recovery from a 401 storm or a backend deploy that may have invalidated
 *  cached payloads. */
export function clearApiCache() {
  if (typeof window === 'undefined') return;
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('kapi:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    main_admin: 'Main Admin',
    sub_admin: 'Sub-Admin',
    hr: 'HR Manager',
    program_manager: 'Program Manager',
    city_manager: 'City Manager',
    supervisor: 'Supervisor',
    field_executive: 'Field Executive',
    client: 'Client',
  };
  return labels[role] || role;
}

/**
 * Resolve a user's display designation — the label admins actually want to
 * see (e.g. "Consumer Champion", "Consumer Champion Manager", "Area Sales
 * Officer"). Source of truth is `org_role.name` from the org_roles join
 * (also exposed as a flat `org_role_name` on some endpoints). Falls back
 * to the platform-admin label only for genuinely platform-level system
 * roles (super_admin / admin / main_admin / master_admin); never falls
 * back to the legacy preset like "Sub-Admin" — admins consider that an
 * implementation detail. Returns a dash when no designation is set so
 * the UI never invents a generic descriptor like "Team Member".
 */
export function getDesignationLabel(user: {
  org_role?: { name?: string | null } | null;
  org_role_name?: string | null;
  role?: string | null;
} | null | undefined): string {
  const joined = user?.org_role?.name?.trim();
  if (joined) return joined;
  const flat = (user as { org_role_name?: string | null } | null | undefined)?.org_role_name?.trim();
  if (flat) return flat;
  const sys = (user?.role || '').toLowerCase().trim().replace(/-/g, '_');
  if (sys === 'super_admin') return 'Super Admin';
  if (sys === 'admin' || sys === 'main_admin' || sys === 'master_admin') return 'Admin';
  return '—';
}

function normalizeRole(role: string): string {
  return (role || '').toLowerCase().trim().replace(/-/g, '_');
}

// Power hierarchy (low → high). Higher roles inherit access to lower-role content.
// 'client' sits at sub-admin parity by design — client tenant admins are
// expected to manage their own users, role hierarchy, and CRM configuration
// inside their scope (the multi-tenant client_id keeps them isolated from
// other tenants regardless). Placed right after sub_admin so canAccess
// returns true for any check >= sub_admin level.
const ROLE_HIERARCHY = [
  'field_executive',
  'supervisor',
  'city_manager',
  'program_manager',
  'hr',
  'sub_admin',
  'client',
  'main_admin',
  'admin',
  'super_admin',
];

export function canAccess(userRole: string, requiredRoles: string[]): boolean {
  const role = normalizeRole(userRole);
  const required = requiredRoles.map(normalizeRole);
  if (required.includes(role)) return true;

  const userLevel = ROLE_HIERARCHY.indexOf(role);
  if (userLevel === -1) return false;

  return required.some(r => {
    const reqLevel = ROLE_HIERARCHY.indexOf(r);
    return reqLevel !== -1 && userLevel >= reqLevel;
  });
}

/**
 * Pick the best landing route for a user given their role + module
 * permissions. Avoids dropping a client-level user onto the legacy
 * analytics dashboard that they're not authorised to load (the
 * /dashboard-init endpoint correctly returns 403 for them).
 *
 * Order of preference: analytics → CRM → distribution → first granted module.
 * Falls back to /dashboard for super-admins / unknown shapes.
 */
export function landingRouteFor(user?: AuthUser | null): string {
  if (!user) return '/dashboard';
  const role = normalizeRole(user.role || '');
  // The platform super admin (no bound client) owns the field-force overview
  // and reaches every tenant via the client picker.
  if (role === 'super_admin') return '/dashboard';

  // CRM-only check runs BEFORE the client-admin shortcut. A client-admin of a
  // CRM-only tenant (e.g. BMW) must NOT land on the field-force overview — its
  // /analytics/* calls 403 for them and render a broken field-force shell with
  // an error. Detect it off the client's packages OR the user's own
  // permissions: CRM granted, field force not.
  const pkgs: string[] = Array.isArray((user as any).enabled_packages) ? (user as any).enabled_packages : [];
  const perms = (user as AuthUser & { permissions?: string[] }).permissions ?? [];
  const pkgCrmOnly = pkgs.length > 0 && pkgs.includes('crm') && !pkgs.includes('field_force') && !pkgs.includes('distribution');
  const permCrmOnly = perms.includes('crm') && !perms.includes('field_force') && !perms.includes('analytics');
  if (pkgCrmOnly || permCrmOnly) return '/dashboard/crm/dashboard';

  // Other client-admins (full field-force / mixed clients) keep the overview.
  if (role === 'admin' || role === 'main_admin' || role === 'platform_admin') {
    return '/dashboard';
  }
  if (perms.includes('analytics')) return '/dashboard';
  if (perms.includes('crm')) return '/dashboard/crm/dashboard';
  if (perms.includes('distribution')) return '/dashboard/distribution';
  if (perms.includes('attendance')) return '/dashboard/attendance-overview';
  if (perms.includes('planograms')) return '/dashboard/planograms';
  if (perms.includes('warehouse') || perms.includes('inventory')) return '/dashboard/warehouse';
  // Last-resort: legacy dashboard. The page now redirects again if
  // analytics access is missing, so we won't loop.
  return '/dashboard';
}
