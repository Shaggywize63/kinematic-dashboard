
import { AuthSession, AuthUser } from '@/types';

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
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    hr: 'HR Manager',
    program_manager: 'Program Manager',
    city_manager: 'City Manager',
    supervisor: 'Supervisor',
    field_executive: 'Field Executive',
    client: 'Client',
  };
  return labels[role] || role;
}

export function canAccess(userRole: string, requiredRoles: string[]): boolean {
  const hierarchy = ['field_executive','supervisor','city_manager','program_manager','hr','admin','super_admin','client'];
  return requiredRoles.some(r => r === userRole);
}
