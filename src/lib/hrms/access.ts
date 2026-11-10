// Who may use HRMS. Today: the master admin only. The module runs on sample data kept in the browser and has no
// backend yet, so no customer and no other admin sees it. This is the one place that decides; the sidebar and the
// module's own layout both call it (the nav hides the entry, the layout enforces it for deep links and stale caches).
//
// The master admin is recognised by the REAL signed-in email (isMasterAdmin also looks through an impersonation).
// While the master admin is viewing AS a client or user, HRMS is hidden: that view should look like the client's own.

import { isMasterAdmin } from '../clientFeatures';

export function canUseHrms(user: unknown): boolean {
  if (!user) return false;
  const impersonating = !!(user as { impersonated_by?: unknown }).impersonated_by;
  return isMasterAdmin(user as Parameters<typeof isMasterAdmin>[0]) && !impersonating;
}
