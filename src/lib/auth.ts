
import { AuthSession, AuthUser } from '../types';

const TOKEN_KEY = 'kinematic_token';
const USER_KEY  = 'kinematic_user';
const EXPIRY_KEY = 'kinematic_expiry';

export function saveSession(session: AuthSession) {
  localStorage.setItem(TOKEN_KEY, session.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  localStorage.setItem(EXPIRY_KEY, String(session.expires_at));
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

export function isSessionValid(): boolean {
  const expiry = localStorage.getItem(EXPIRY_KEY);
  if (!expiry) return false;
  return Date.now() < Number(expiry) * 1000;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
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
  const perms = (user as AuthUser & { permissions?: string[] }).permissions ?? [];
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
