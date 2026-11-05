// Who may change the owner of an account or deal (and the primary assignee of an activity) from the edit
// screens. Mirrors the backend rule (OWNER_ASSIGN_ROLES in crm.routes.ts: for everyone else a client-supplied
// owner_id is dropped), so the control is only offered to people whose change will actually be saved. A person
// whose org-role data scope is 'own' is left out as well: reassigning would hide the record from them.
// Deliberately NOT tied to the per-client lead_form.owner_assignment switch — that governs lead owners only.

/** Roles the backend lets assign a record to an arbitrary owner. Keep in sync with OWNER_ASSIGN_ROLES (Kinematic). */
export const RECORD_OWNER_ROLES = [
  'super_admin', 'admin', 'main_admin', 'sub_admin', 'city_manager', 'supervisor', 'client',
] as const;

export interface RecordOwnerUser {
  role?: string | null;
  org_role_data_scope?: string | null;
  org_role?: { data_scope?: string | null } | null;
}

export function canChangeRecordOwner(user: RecordOwnerUser | null | undefined): boolean {
  if (!user) return false;
  const role = String(user.role ?? '').toLowerCase().trim().replace(/-/g, '_');
  if (!(RECORD_OWNER_ROLES as readonly string[]).includes(role)) return false;
  const scope = user.org_role_data_scope ?? user.org_role?.data_scope ?? null;
  return scope !== 'own';
}

/** The owner id to send on a save: only when the person actually changed it (undefined = leave untouched). */
export function ownerPatch(
  canChange: boolean, current: string | null | undefined, picked: string,
): { owner_id?: string | null } {
  if (!canChange) return {};
  const before = current ?? '';
  if (picked === before) return {};
  return { owner_id: picked || null };
}
