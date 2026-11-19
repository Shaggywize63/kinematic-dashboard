import { getStoredUser } from './auth';
import { isB2bClientActive } from './b2bClient';

// Roles that count as "admin" for completing activities — the tenant-admin tier
// (tenant admins + sub-admins like a client sub-admin), mirroring the backend
// TENANT_ADMIN_ROLES used by the PATCH /crm/activities/:id guard.
const COMPLETE_ADMIN_ROLES = ['super_admin', 'admin', 'main_admin', 'sub_admin', 'org_admin', 'client', 'city_manager'];

/**
 * Who may mark an activity complete. On the connected-B2B (Spark & Ray)
 * workspace only admins may close an activity; every other tenant is unchanged
 * (any assignee can complete). This hides the complete control; the backend
 * enforces the same rule so it can't be bypassed.
 */
export function canCompleteActivities(): boolean {
  if (!isB2bClientActive()) return true;
  const role = (getStoredUser()?.role ?? '').toLowerCase();
  return COMPLETE_ADMIN_ROLES.includes(role);
}
