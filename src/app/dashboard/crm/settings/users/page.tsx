'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import api from '../../../../../lib/api';
import { rolesApi, type OrgRole } from '../../../../../lib/rolesApi';

// CRM-scoped user management. Module permissions live on the role hierarchy
// (org_roles.permissions / .permissions_write) — not redefined per-user — so
// this form just picks a Hierarchy Role and the user inherits that role's
// access. The legacy preset role (sub_admin / city_manager / etc.) used to
// drive route-tier RBAC; we still need to send something the backend
// requireRole() middleware accepts, so every CRM-created user is stamped as
// 'sub_admin' under the hood. Tier checks fall through to the hierarchy.
const DEFAULT_PRESET_ROLE = 'sub_admin';

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

// Tiny CSV parser — purpose-built. Splits on newlines (LF or CRLF),
// fields on commas, supports double-quoted fields with embedded commas
// and escaped quotes. Sufficient for the simple template we ship.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; continue; }
      if (c === '"') { inQ = false; continue; }
      cur += c;
    } else {
      if (c === '"') { inQ = true; continue; }
      if (c === ',') { row.push(cur); cur = ''; continue; }
      if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some((v) => v.trim() !== '')) rows.push(row);
        row = [];
        continue;
      }
      cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some((v) => v.trim() !== '')) rows.push(row); }
  return rows;
}

const TEMPLATE_HEADER = 'name,mobile,email,hierarchy_role,password';
const TEMPLATE_SAMPLE = `${TEMPLATE_HEADER}
Rahul Sharma,9812345601,rahul@example.com,Regional Sales Lead,changeme123
Priya Iyer,9812345602,,Field Manager,changeme123`;

export default function CrmUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: Array<{ name: string; error: string }> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const blank = {
    name: '', email: '', mobile: '',
    org_role_id: '' as string,
    password: '',
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
    return [u.name, u.email, u.mobile].some((v) => (v || '').toLowerCase().includes(q));
  });

  const startCreate = () => { setEditId(null); setForm(blank); setShowAdd(true); };
  const startEdit = (u: UserRow) => {
    setEditId(u.id);
    setForm({
      name: u.name || '',
      email: u.email || '',
      mobile: u.mobile || '',
      org_role_id: u.org_role_id || '',
      password: '',
    });
    setShowAdd(true);
  };

  // Look up the picked hierarchy role's permissions so the user inherits its
  // module access without the form having to redefine it. Falls back to an
  // empty list if no hierarchy role is picked — the preset role still drives
  // route-level RBAC via canAccess().
  const permissionsForRole = (orgRoleId: string): string[] => {
    if (!orgRoleId) return [];
    const r = roles.find((x) => x.id === orgRoleId);
    return r?.permissions ?? [];
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
        // Always stamp the default preset role so backend route-tier RBAC
        // (requireRole, canAccess) keeps working. Real access comes from
        // the hierarchy role's permissions, copied below.
        role: DEFAULT_PRESET_ROLE,
        mobile: form.mobile.trim(),
        permissions: permissionsForRole(form.org_role_id),
        org_role_id: form.org_role_id || null,
        is_active: true,
      };
      if (editId) {
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

  // Bulk upload — accepts the template above. Each data row becomes a
  // sequential POST to /api/v1/users (we don't fan out so failures keep
  // their per-row context for the result table). Hierarchy role is
  // resolved by name (case-insensitive).
  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_SAMPLE + '\n'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'users-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const onBulkFile = async (file: File) => {
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) { toast.error('CSV is empty (header + at least one row required)'); setBulkBusy(false); return; }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const idx = (k: string) => header.indexOf(k);
      const iName = idx('name');
      const iMobile = idx('mobile');
      const iEmail = idx('email');
      const iHRole = idx('hierarchy_role');
      const iPwd = idx('password');
      if (iName < 0 || iMobile < 0) { toast.error('CSV must include at least `name` and `mobile` columns'); setBulkBusy(false); return; }

      const roleByName = new Map(roles.map((r) => [r.name.toLowerCase(), r]));
      const ok: number = 0; let okCount = 0;
      const failed: Array<{ name: string; error: string }> = [];

      for (const row of rows.slice(1)) {
        const name = (row[iName] || '').trim();
        const mobile = (row[iMobile] || '').trim();
        if (!name || !mobile) { failed.push({ name: name || '<no name>', error: 'name + mobile required' }); continue; }
        const email = iEmail >= 0 ? (row[iEmail] || '').trim() : '';
        const hierarchyName = iHRole >= 0 ? (row[iHRole] || '').trim().toLowerCase() : '';
        const password = iPwd >= 0 ? (row[iPwd] || '').trim() : '';
        const hRole = hierarchyName ? roleByName.get(hierarchyName) : undefined;

        const payload: Record<string, unknown> = {
          name, mobile,
          email: email || `${mobile}@kinematic.app`,
          // Preset role kept fixed; access is fully driven by the picked
          // hierarchy role's permissions array. Match the form behaviour.
          role: DEFAULT_PRESET_ROLE,
          permissions: hRole?.permissions ?? [],
          org_role_id: hRole?.id ?? null,
          is_active: true,
        };
        if (password) payload.password = password;

        try {
          await api.post('/api/v1/users', payload);
          okCount += 1;
        } catch (err: any) {
          failed.push({ name, error: err?.message || 'Create failed' });
        }
      }
      setBulkResult({ ok: okCount, failed });
      if (okCount > 0) reload();
      toast.success(`Imported ${okCount} of ${rows.length - 1} users${failed.length ? ` · ${failed.length} failed` : ''}`);
      void ok;
    } catch (e: any) {
      toast.error(e.message || 'Bulk import failed');
    } finally {
      setBulkBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Team Members</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-dim)', maxWidth: 720 }}>
            Add team members. Module access is inherited from the <Link href="/dashboard/settings/roles" style={{ color: 'var(--primary)' }}>Hierarchy Role</Link> you assign — define permissions once on the role, not per user.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/dashboard/crm/settings" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>← Back</Link>
          <button onClick={() => { setShowBulk((s) => !s); setBulkResult(null); }} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Bulk Upload</button>
          <button onClick={startCreate} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Add User</button>
        </div>
      </div>

      {showBulk && (
        <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Bulk Upload Users</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, maxWidth: 640 }}>
                CSV with header row. Required columns: <code style={{ background: 'var(--s4)', padding: '1px 4px', borderRadius: 3 }}>name</code>, <code style={{ background: 'var(--s4)', padding: '1px 4px', borderRadius: 3 }}>mobile</code>. Optional: <code style={{ background: 'var(--s4)', padding: '1px 4px', borderRadius: 3 }}>email</code>, <code style={{ background: 'var(--s4)', padding: '1px 4px', borderRadius: 3 }}>hierarchy_role</code> (matches role name from Role Hierarchy — drives module access), <code style={{ background: 'var(--s4)', padding: '1px 4px', borderRadius: 3 }}>password</code>.
              </div>
            </div>
            <button onClick={() => setShowBulk(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={downloadTemplate} style={btnGhost}>Download template</button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              disabled={bulkBusy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onBulkFile(f); }}
              style={{ ...input, padding: 6, width: 'auto' }}
            />
            {bulkBusy && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Importing…</span>}
          </div>
          {bulkResult && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--s4)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: bulkResult.failed.length ? 8 : 0 }}>
                <strong style={{ color: '#10b981' }}>{bulkResult.ok} imported</strong>
                {bulkResult.failed.length > 0 && <> · <strong style={{ color: '#E01E2C' }}>{bulkResult.failed.length} failed</strong></>}
              </div>
              {bulkResult.failed.length > 0 && (
                <div style={{ maxHeight: 140, overflowY: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
                  {bulkResult.failed.map((f, i) => (
                    <div key={i} style={{ padding: '2px 0' }}><strong style={{ color: 'var(--text)' }}>{f.name}</strong> — {f.error}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
            <Field label="Hierarchy Role">
              <select value={form.org_role_id} onChange={(e) => setForm({ ...form, org_role_id: e.target.value })} style={input}>
                <option value="">— None —</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name} ({(r.permissions || []).length} modules)</option>)}
              </select>
            </Field>
            <Field label={editId ? 'New Password (optional)' : 'Password'}>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editId ? 'Leave blank to keep' : 'Minimum 8 characters'} style={input} />
            </Field>
          </div>

          {/* Show what the user is inheriting from the picked hierarchy role
              so admins can spot-check before saving. */}
          {form.org_role_id && (
            <div style={{ marginTop: 12, padding: 10, background: 'var(--s4)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text-dim)' }}>
              Inheriting <strong style={{ color: 'var(--text)' }}>{permissionsForRole(form.org_role_id).length} module{permissionsForRole(form.org_role_id).length === 1 ? '' : 's'}</strong> from the selected hierarchy role. Edit per-module access under <Link href="/dashboard/settings/roles" style={{ color: 'var(--primary)' }}>Role Hierarchy</Link>.
            </div>
          )}
          {!form.org_role_id && (
            <div style={{ marginTop: 12, padding: 10, background: 'var(--s4)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text-dim)' }}>
              No hierarchy role picked — user will have no module access until you assign one. The preset role above only governs role-based middleware checks (e.g. "is this person at sub-admin level?").
            </div>
          )}

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
              <th style={th}>Hierarchy</th>
              <th style={th}>Status</th>
              <th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading users…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No users yet — click <strong style={{ color: 'var(--text)' }}>+ Add User</strong> or <strong style={{ color: 'var(--text)' }}>Bulk Upload</strong>.</td></tr>}
            {filtered.map((u) => {
              const hRoleName = u.org_role_id ? (roles.find((r) => r.id === u.org_role_id)?.name ?? '—') : '—';
              return (
                <tr key={u.id}>
                  <td style={td}><strong style={{ color: 'var(--text)' }}>{u.name || '—'}</strong></td>
                  <td style={td}>{u.email || '—'}</td>
                  <td style={td}>{u.mobile || '—'}</td>
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
