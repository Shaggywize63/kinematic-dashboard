
import { AuthSession, AuthUser } from '../types';

const TOKEN_KEY = 'kinematic_token';
const REFRESH_KEY = 'kinematic_refresh_token';
const USER_KEY  = 'kinematic_user';
const EXPIRY_KEY = 'kinematic_expiry';

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
  if (role === 'super_admin' || role === 'admin' || role === 'main_admin' || role === 'platform_admin') {
    return '/dashboard';
  }

  // Package-level check takes precedence over the permissions array: if the client's
  // enabled_packages includes crm but NOT field_force, this user is on a CRM-only
  // client and should land on the lead management dashboard regardless of what
  // 'analytics' appears in their permissions (some roles carry it redundantly).
  const pkgs: string[] = Array.isArray((user as any).enabled_packages) ? (user as any).enabled_packages : [];
  if (pkgs.length > 0 && pkgs.includes('crm') && !pkgs.includes('field_force')) {
    return '/dashboard/crm/dashboard';
  }

  const perms = (user as AuthUser & { permissions?: string[] }).permissions ?? [];
  // User-permission-level CRM-only check: user has crm permission but not field_force
  // or analytics. Handles reps on a mixed-module client whose personal role is CRM-only.
  if (perms.includes('crm') && !perms.includes('field_force') && !perms.includes('analytics')) {
    return '/dashboard/crm/dashboard';
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
