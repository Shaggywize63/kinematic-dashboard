'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import api from '../../../../../lib/api';
import { rolesApi, type OrgRole } from '../../../../../lib/rolesApi';
import { ALL_MODULES, MODULE_GROUPS } from '../../../../../lib/modules';

// CRM-scoped user management. Mirrors the org-level Settings → User Directory
// surface but lives inside CRM so client tenants (Tata Tiscon, etc.) who only
// have the `crm` module granted can still create + manage their team.
// Users created here go through the same /api/v1/users endpoint super admins
// use, and inherit X-Client-Id from the active client picker so they're
// stamped to the right tenant. They show up in super admin's full directory
// alongside everyone else.

// Subset of preset roles that's appropriate for CRM-side user creation. Full
// admin/super_admin assignment stays org-level under /dashboard/settings.
const PRESET_ROLES: Array<{ value: string; label: string }> = [
  { value: 'sub_admin',   label: 'Sub-Admin' },
  { value: 'city_manager',label: 'City Manager' },
  { value: 'hr',          label: 'HR' },
  { value: 'mis',         label: 'MIS' },
  { value: 'client',      label: 'Client User' },
];

// CRM-relevant module defaults per preset role. Anything not in this map
// falls back to the role's existing org-side defaults.
const ROLE_DEFAULT_MODULES: Record<string, string[]> = {
  sub_admin:    ['crm', 'crm_dashboard', 'crm_leads', 'crm_contacts', 'crm_accounts', 'crm_deals', 'crm_pipeline', 'crm_products', 'crm_activities', 'crm_tasks', 'crm_whatsapp', 'crm_reports', 'crm_settings', 'analytics', 'reports'],
  city_manager: ['crm', 'crm_dashboard', 'crm_leads', 'crm_deals', 'crm_pipeline', 'crm_activities', 'crm_tasks'],
  hr:           ['crm', 'crm_dashboard'],
  mis:          ['crm', 'crm_dashboard', 'crm_reports', 'analytics', 'reports'],
  client:       ['crm', 'crm_dashboard', 'crm_leads', 'crm_contacts', 'crm_deals', 'crm_pipeline', 'crm_products', 'crm_activities', 'crm_tasks', 'crm_whatsapp', 'crm_reports', 'crm_settings'],
};

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  role: string | null;
  org_role_id?: string | null;
  client_id?: string | null;
  is_active?: boolean;
  permissions?: string[] | null;
}

export default function CrmUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const blank = {
    name: '', email: '', mobile: '', employee_id: '',
    role: 'sub_admin' as string,
    org_role_id: '' as string,
    password: '',
    permissions: ROLE_DEFAULT_MODULES.sub_admin,
  };
  const [form, setForm] = useState(blank);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.allSettled([
        api.get<any>('/api/v1/users?limit=500'),
        rolesApi.list(),
      ]);
      if (u.status === 'fulfilled') {
        const list = (u.value.data?.data || u.value.data?.users || u.value.data || []) as UserRow[];
        // Show every user the API returns; the backend already scopes by org/
        // client based on the JWT + X-Client-Id, so no extra filtering here.
        setUsers(Array.isArray(list) ? list : []);
      }
      if (r.status === 'fulfilled') setRoles(((r.value as any) ?? []) as OrgRole[]);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load users');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [u.name, u.email, u.mobile, u.role].some((v) => (v || '').toLowerCase().includes(q));
  });

  const onRoleChange = (next: string) => {
    setForm((f) => ({
      ...f,
      role: next,
      permissions: ROLE_DEFAULT_MODULES[next] ?? f.permissions,
    }));
  };

  const togglePerm = (m: string) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(m) ? f.permissions.filter((x) => x !== m) : [...f.permissions, m],
    }));
  };

  const startCreate = () => { setEditId(null); setForm(blank); setShowAdd(true); };
  const startEdit = (u: UserRow) => {
    setEditId(u.id);
    setForm({
      name: u.name || '',
      email: u.email || '',
      mobile: u.mobile || '',
      employee_id: '',
      role: u.role || 'sub_admin',
      org_role_id: u.org_role_id || '',
      password: '',
      permissions: u.permissions || ROLE_DEFAULT_MODULES[u.role || 'sub_admin'] || [],
    });
    setShowAdd(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.mobile.trim()) {
      toast.error('Name and mobile are required'); return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email || `${form.mobile.trim()}@kinematic.app`,
        role: form.role,
        mobile: form.mobile.trim(),
        permissions: form.permissions,
        org_role_id: form.org_role_id || null,
        is_active: true,
      };
      if (editId) {
        // Only send password on edit if explicitly typed.
        if (form.password) payload.app_password = form.password;
        await api.patch(`/api/v1/users/${editId}`, payload);
        toast.success('User updated');
      } else {
        if (form.password) payload.password = form.password;
        await api.post('/api/v1/users', payload);
        toast.success('User created');
      }
      setShowAdd(false); setEditId(null); setForm(blank);
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const toggleActive = async (u: UserRow) => {
    try {
      await api.patch(`/api/v1/users/${u.id}`, { is_active: !(u.is_active !== false) });
      reload();
    } catch (e: any) { toast.error(e.message || 'Update failed'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Team Members</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-dim)', maxWidth: 720 }}>
            Manage the people who can sign in and use the CRM. Pick a preset role for permissions, plus optionally a custom role from your <Link href="/dashboard/settings/roles" style={{ color: 'var(--primary)' }}>Role Hierarchy</Link> to slot the user into your reporting structure.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/dashboard/crm/settings" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>← Back to Settings</Link>
          <button onClick={startCreate} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Add User</button>
        </div>
      </div>

      {showAdd && (
        <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{editId ? 'Edit User' : 'New User'}</div>
            <button onClick={() => { setShowAdd(false); setEditId(null); setForm(blank); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Field label="Full Name *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rahul Sharma" style={input} /></Field>
            <Field label="Mobile (primary) *"><input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="10-digit mobile" maxLength={15} style={input} /></Field>
            <Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="auto-generated if blank" style={input} /></Field>
            <Field label="Preset Role">
              <select value={form.role} onChange={(e) => onRoleChange(e.target.value)} style={input}>
                {PRESET_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Hierarchy Role (optional)">
              <select value={form.org_role_id} onChange={(e) => setForm({ ...form, org_role_id: e.target.value })} style={input}>
                <option value="">— None —</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label={editId ? 'New Password (optional)' : 'Password'}>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editId ? 'Leave blank to keep' : 'Minimum 8 characters'} style={input} />
            </Field>
          </div>

          {/* Module permissions — pre-filled from the preset role; admins can
              override by group or per-module. Stored on users.permissions. */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>Module Permissions</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{form.permissions.length} of {ALL_MODULES.length} selected</div>
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto', background: 'var(--s4)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              {MODULE_GROUPS.map((group) => {
                const items = ALL_MODULES.filter((m) => m.group === group);
                const allOn = items.every((m) => form.permissions.includes(m.id));
                return (
                  <div key={group} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{group}</div>
                      <button type="button" onClick={() => {
                        const ids = items.map((m) => m.id);
                        setForm((f) => ({
                          ...f,
                          permissions: allOn ? f.permissions.filter((p) => !ids.includes(p)) : Array.from(new Set([...f.permissions, ...ids])),
                        }));
                      }} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}>
                        {allOn ? 'unselect group' : 'select group'}
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 4 }}>
                      {items.map((m) => {
                        const on = form.permissions.includes(m.id);
                        return (
                          <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: on ? 'var(--text)' : 'var(--text-dim)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={on} onChange={() => togglePerm(m.id)} />
                            {m.l}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button onClick={() => { setShowAdd(false); setEditId(null); setForm(blank); }} disabled={saving} style={btnGhost}>Cancel</button>
            <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : (editId ? 'Save Changes' : 'Create User')}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, mobile, role…" style={{ ...input, minWidth: 280 }} />
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{filtered.length} of {users.length} users</span>
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Email</th>
              <th style={th}>Mobile</th>
              <th style={th}>Preset</th>
              <th style={th}>Hierarchy</th>
              <th style={th}>Status</th>
              <th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading users…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No users yet — click <strong style={{ color: 'var(--text)' }}>+ Add User</strong> to create one.</td></tr>}
            {filtered.map((u) => {
              const hRoleName = u.org_role_id ? (roles.find((r) => r.id === u.org_role_id)?.name ?? '—') : '—';
              return (
                <tr key={u.id}>
                  <td style={td}><strong style={{ color: 'var(--text)' }}>{u.name || '—'}</strong></td>
                  <td style={td}>{u.email || '—'}</td>
                  <td style={td}>{u.mobile || '—'}</td>
                  <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'capitalize' }}>{(u.role || '').replace(/_/g, ' ')}</span></td>
                  <td style={td}><span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{hRoleName}</span></td>
                  <td style={td}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: u.is_active === false ? 'rgba(224,30,44,0.15)' : 'rgba(0,217,126,0.15)', color: u.is_active === false ? '#E01E2C' : '#10b981', fontSize: 10, fontWeight: 800, letterSpacing: 0.4 }}>
                      {u.is_active === false ? 'INACTIVE' : 'ACTIVE'}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(u)} style={btnSmall}>Edit</button>{' '}
                    <button onClick={() => toggleActive(u)} style={btnSmall}>{u.is_active === false ? 'Reactivate' : 'Deactivate'}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = { background: 'var(--s4)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%' };
const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnSmall: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' };
