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
};
