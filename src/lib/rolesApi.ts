import api from './api';

export interface OrgRole {
  id: string;
  org_id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  parent_id: string | null;
  position: number;
  color: string | null;
  permissions: string[];
  permissions_write: string[];
  assigned_cities: string[];
  created_at: string;
  updated_at: string;
  user_count?: number;
}

export interface OrgRoleNode extends OrgRole {
  children: OrgRoleNode[];
}

export interface OrgRoleUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
}

/** A user row from the directory (GET /api/v1/users), used to populate the
 *  "assign a user to this role" picker. The backend returns either a bare
 *  array or `{ data: [...] }`, and may nest the joined role under `org_role`. */
export interface AssignableUser {
  id: string;
  name: string | null;
  email: string | null;
  role?: string | null;
  /** The user's CURRENT hierarchy role. A user holds exactly ONE (single
   *  `users.org_role_id` column) — assigning them to another role replaces it.
   *  Many-to-many (a person holding several roles) is NOT supported without a
   *  backend/schema change. */
  org_role_id?: string | null;
}

const BASE = '/api/v1/roles';
type Wrapped<T> = T;

export const rolesApi = {
  list: () => api.get<Wrapped<OrgRole[]>>(BASE),
  tree: () => api.get<Wrapped<OrgRoleNode[]>>(`${BASE}/tree`),
  get: (id: string) => api.get<Wrapped<OrgRole>>(`${BASE}/${id}`),
  create: (body: Partial<OrgRole>) => api.post<Wrapped<OrgRole>>(BASE, body),
  update: (id: string, body: Partial<OrgRole>) => api.patch<Wrapped<OrgRole>>(`${BASE}/${id}`, body),
  remove: (id: string) => api.delete<Wrapped<{ success: true }>>(`${BASE}/${id}`),
  reorder: (parent_id: string | null, ids: string[]) =>
    api.post<Wrapped<{ ok: true }>>(`${BASE}/reorder`, { parent_id, ids }),
  users: (id: string) => api.get<Wrapped<OrgRoleUser[]>>(`${BASE}/${id}/users`),

  // ── User ⇄ role assignment ────────────────────────────────────────────────
  // There is no dedicated /roles/:id/users WRITE endpoint — a user's hierarchy
  // role lives in the single `users.org_role_id` column, so assignment is done
  // by patching the user (the same path the Team Members screen already uses).
  // The active client scope rides along as the X-Client-Id header (api.ts).
  /** All directory users (for the assignment picker). */
  assignableUsers: () => api.get<AssignableUser[] | { data: AssignableUser[] }>('/api/v1/users?limit=500'),
  /** Assign a user to a role (roleId) or clear their role (null). SINGLE role
   *  per user — this replaces whatever role they were in. */
  setUserRole: (userId: string, roleId: string | null) =>
    api.patch<Wrapped<unknown>>(`/api/v1/users/${userId}`, { org_role_id: roleId }),
};
