'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../lib/api';
import { rolesApi, type OrgRole, type OrgRoleNode, type OrgRoleUser } from '../../../../lib/rolesApi';
import { getStoredUser, canAccess } from '../../../../lib/auth';
import { useClient } from '@/context/ClientContext';

const PRESET_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

export default function RolesPage() {
  const [tree, setTree] = useState<OrgRoleNode[]>([]);
  const [flat, setFlat] = useState<OrgRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string | null; // null = new role
    name: string;
    description: string;
    parent_id: string | null;
    color: string;
  } | null>(null);
  const [users, setUsers] = useState<OrgRoleUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  // Multi-tenant: refetch when the global client picker changes so the tree
  // reflects the active client's scope.
  const { selectedClientId } = useClient();
  const [clientName, setClientName] = useState<string>('');
  const storedUser = getStoredUser();
  const isClientLevel = !!(storedUser as any)?.client_id;

  const reload = async () => {
    setLoading(true);
    try {
      const [t, l] = await Promise.allSettled([rolesApi.tree(), rolesApi.list()]);
      if (t.status === 'fulfilled') setTree((t.value as any) ?? []);
      if (l.status === 'fulfilled') setFlat((l.value as any) ?? []);
    } catch (e: any) { toast.error(e.message || 'Failed to load roles'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const u = getStoredUser();
    if (!u || !canAccess(u.role, ['sub_admin'])) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }
    reload();
    // Reset side-panel state on client switch so we don't show stale selection
    setSelectedId(null);
    setEditing(null);
  }, [selectedClientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Look up the active client's display name for the scope banner.
  useEffect(() => {
    const targetId = isClientLevel ? (storedUser as any)?.client_id : selectedClientId;
    if (!targetId) { setClientName(''); return; }
    api.get<{ data?: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>>('/api/v1/misc/clients')
      .then((res: any) => {
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        const match = list.find((c: any) => c.id === targetId);
        setClientName(match?.name || '');
      })
      .catch(() => setClientName(''));
  }, [selectedClientId, isClientLevel, storedUser]);

  useEffect(() => {
    if (!selectedId) { setUsers([]); return; }
    setLoadingUsers(true);
    rolesApi.users(selectedId)
      .then((r) => setUsers((r as any) ?? []))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [selectedId]);

  const totalRoles = flat.length;
  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    const filterNode = (n: OrgRoleNode): OrgRoleNode | null => {
      const kids = n.children.map(filterNode).filter(Boolean) as OrgRoleNode[];
      const hit = n.name.toLowerCase().includes(q) || (n.description || '').toLowerCase().includes(q);
      if (hit || kids.length > 0) return { ...n, children: kids };
      return null;
    };
    return tree.map(filterNode).filter(Boolean) as OrgRoleNode[];
  }, [tree, search]);

  const startCreate = (parent_id: string | null) => {
    setEditing({ id: null, name: '', description: '', parent_id, color: PRESET_COLORS[0] });
  };
  const startEdit = (role: OrgRole) => {
    setEditing({
      id: role.id,
      name: role.name,
      description: role.description ?? '',
      parent_id: role.parent_id,
      color: role.color ?? PRESET_COLORS[0],
    });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error('Role name is required');
    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        description: editing.description.trim() || null,
        parent_id: editing.parent_id,
        color: editing.color,
      };
      if (editing.id) {
        await rolesApi.update(editing.id, payload);
        toast.success('Role updated');
      } else {
        await rolesApi.create(payload);
        toast.success('Role created');
      }
      setEditing(null);
      reload();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async (role: OrgRole) => {
    if (!window.confirm(`Delete role "${role.name}"? Any direct children will be moved up to "${role.parent_id ? flat.find((r) => r.id === role.parent_id)?.name || 'parent' : 'top level'}".`)) return;
    try {
      await rolesApi.remove(role.id);
      toast.success('Role deleted');
      if (selectedId === role.id) setSelectedId(null);
      if (editing?.id === role.id) setEditing(null);
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };

  if (accessDenied) {
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Admin access required</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>The role hierarchy is configurable by sub-admins and above.</div>
      </div>
    );
  }

  const selected = selectedId ? flat.find((r) => r.id === selectedId) : null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--text)' }}>Role Hierarchy</h1>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '4px 0 0', maxWidth: 640 }}>
            Build your reporting structure as a tree. Each client can have its own hierarchy on top of the org-level defaults.
            Hover a card to add a child role; click any role to edit it or see who's assigned.
          </p>
        </div>
        <button
          onClick={() => startCreate(null)}
          style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
        >+ Add Top-Level Role</button>
      </div>

      {/* Multi-tenant scope banner */}
      <ScopeBanner
        isClientLevel={isClientLevel}
        clientName={clientName}
        selectedClientId={isClientLevel ? ((storedUser as any)?.client_id ?? '') : selectedClientId}
      />

      {/* Stats + search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={chip('var(--primary)')}>📋 {totalRoles} role{totalRoles === 1 ? '' : 's'}</div>
        <div style={chip('#10b981')}>👥 {users.length > 0 ? users.length : flat.reduce((s, r) => s + (r.user_count || 0), 0)} member{flat.reduce((s, r) => s + (r.user_count || 0), 0) === 1 ? '' : 's'}</div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search roles…"
          style={{ marginLeft: 'auto', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 220 }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: editing || selected ? '1fr 360px' : '1fr', gap: 14 }}>
        {/* Tree */}
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, minHeight: 320 }}>
          {loading ? (
            <div style={{ color: 'var(--text-dim)' }}>Loading…</div>
          ) : flat.length === 0 ? (
            <EmptyState onCreate={() => startCreate(null)} />
          ) : filteredTree.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center' }}>No roles match "{search}".</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredTree.map((node) => (
                <RoleNode
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onAddChild={(pid) => startCreate(pid)}
                  onEdit={startEdit}
                  onDelete={remove}
                />
              ))}
            </div>
          )}
        </div>

        {/* Side panel */}
        {(editing || selected) && (
          <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, position: 'sticky', top: 14, alignSelf: 'flex-start' }}>
            {editing ? (
              <EditPanel
                editing={editing}
                setEditing={setEditing}
                flat={flat}
                onSave={save}
                onCancel={() => setEditing(null)}
                saving={saving}
              />
            ) : selected ? (
              <DetailPanel
                role={selected}
                users={users}
                loadingUsers={loadingUsers}
                onEdit={() => startEdit(selected)}
                onClose={() => setSelectedId(null)}
                onAddChild={() => startCreate(selected.id)}
                onDelete={() => remove(selected)}
                allRoles={flat}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- subcomponents -----------------------------------------------------

function RoleNode({
  node, depth, selectedId, onSelect, onAddChild, onEdit, onDelete,
}: {
  node: OrgRoleNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (role: OrgRole) => void;
  onDelete: (role: OrgRole) => void;
}) {
  const [hover, setHover] = useState(false);
  const isSelected = node.id === selectedId;
  const indent = depth * 28;
  const color = node.color || '#6366f1';

  return (
    <div>
      <div
        style={{ marginLeft: indent, position: 'relative' }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {depth > 0 && (
          <div style={{
            position: 'absolute', left: -20, top: 0, bottom: 0, width: 1,
            background: 'var(--border)',
          }} />
        )}
        {depth > 0 && (
          <div style={{
            position: 'absolute', left: -20, top: 22, width: 18, height: 1,
            background: 'var(--border)',
          }} />
        )}
        <div
          onClick={() => onSelect(node.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: isSelected ? `${color}15` : 'var(--s3)',
            border: `1px solid ${isSelected ? color : 'var(--border)'}`,
            borderLeft: `4px solid ${color}`,
            borderRadius: 10,
            padding: '10px 14px',
            cursor: 'pointer',
            transition: 'all 120ms ease',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{node.name}</span>
              {(node.user_count ?? 0) > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981', background: '#10b98115', padding: '2px 8px', borderRadius: 4 }}>
                  {node.user_count} member{node.user_count === 1 ? '' : 's'}
                </span>
              )}
              {node.children.length > 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>· {node.children.length} direct repor{node.children.length === 1 ? 't' : 'ts'}</span>
              )}
            </div>
            {node.description && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {node.description}
              </div>
            )}
          </div>
          {hover && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
                title="Add child role"
                style={iconBtn('#10b981')}
              >＋</button>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(node); }}
                title="Edit role"
                style={iconBtn('var(--primary)')}
              >✎</button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(node); }}
                title="Delete role"
                style={iconBtn('#ef4444')}
              >🗑</button>
            </div>
          )}
        </div>
      </div>

      {node.children.length > 0 && (
        <div style={{ marginTop: 8, marginLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {node.children.map((c) => (
            <RoleNode
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EditPanel({
  editing, setEditing, flat, onSave, onCancel, saving,
}: {
  editing: { id: string | null; name: string; description: string; parent_id: string | null; color: string };
  setEditing: (e: any) => void;
  flat: OrgRole[];
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  // Exclude self + descendants from the parent dropdown to prevent cycles.
  const validParents = useMemo(() => {
    if (!editing.id) return flat;
    const descendants = new Set<string>([editing.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of flat) {
        if (r.parent_id && descendants.has(r.parent_id) && !descendants.has(r.id)) {
          descendants.add(r.id);
          changed = true;
        }
      }
    }
    return flat.filter((r) => !descendants.has(r.id));
  }, [flat, editing.id]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
          {editing.id ? 'Edit role' : 'New role'}
        </div>
        <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
      </div>

      <Field label="Name *">
        <input
          autoFocus
          value={editing.name}
          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          placeholder="e.g. VP of Sales"
          style={input}
        />
      </Field>

      <Field label="Description">
        <textarea
          value={editing.description}
          onChange={(e) => setEditing({ ...editing, description: e.target.value })}
          rows={3}
          placeholder="What does this role do? (optional)"
          style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </Field>

      <Field label="Reports to">
        <select
          value={editing.parent_id ?? ''}
          onChange={(e) => setEditing({ ...editing, parent_id: e.target.value || null })}
          style={input}
        >
          <option value="">— Top of hierarchy —</option>
          {validParents.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>

      <Field label="Colour">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setEditing({ ...editing, color: c })}
              style={{
                width: 28, height: 28, borderRadius: 8, background: c, padding: 0,
                border: editing.color === c ? '3px solid var(--text)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button onClick={onSave} disabled={saving} style={{ flex: 1, background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
          {saving ? 'Saving…' : (editing.id ? 'Save' : 'Create')}
        </button>
        <button onClick={onCancel} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
      </div>
    </div>
  );
}

function DetailPanel({
  role, users, loadingUsers, onEdit, onClose, onAddChild, onDelete, allRoles,
}: {
  role: OrgRole;
  users: OrgRoleUser[];
  loadingUsers: boolean;
  onEdit: () => void;
  onClose: () => void;
  onAddChild: () => void;
  onDelete: () => void;
  allRoles: OrgRole[];
}) {
  const parent = role.parent_id ? allRoles.find((r) => r.id === role.parent_id) : null;
  const directReports = allRoles.filter((r) => r.parent_id === role.id);
  const color = role.color || '#6366f1';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>Role</div>
          <div style={{ fontSize: 18, fontWeight: 800, color, marginBottom: 4 }}>{role.name}</div>
          {parent && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>↑ Reports to <strong style={{ color: 'var(--text)' }}>{parent.name}</strong></div>
          )}
          {!parent && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>↑ Top of hierarchy</div>
          )}
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
      </div>

      {role.description && (
        <div style={{ background: 'var(--s3)', borderRadius: 8, padding: 10, fontSize: 12, color: 'var(--text)', marginBottom: 12, lineHeight: 1.5 }}>
          {role.description}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={onEdit} style={pillBtn('var(--primary)')}>✎ Edit</button>
        <button onClick={onAddChild} style={pillBtn('#10b981')}>＋ Add child</button>
        <button onClick={onDelete} style={pillBtn('#ef4444')}>🗑 Delete</button>
      </div>

      {directReports.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Direct reports ({directReports.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {directReports.map((r) => (
              <div key={r.id} style={{ background: 'var(--s3)', padding: '6px 10px', borderRadius: 6, fontSize: 12, color: 'var(--text)' }}>
                {r.name} {(r.user_count ?? 0) > 0 && <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>· {r.user_count}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
          Members ({loadingUsers ? '…' : users.length})
        </div>
        {loadingUsers ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>
        ) : users.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No team members assigned to this role yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {users.map((u) => (
              <div key={u.id} style={{ background: 'var(--s3)', padding: '6px 10px', borderRadius: 6, fontSize: 12, color: 'var(--text)' }}>
                {u.name || u.email || 'User'}
                {u.role && <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>· {u.role}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px' }}>
      <div style={{ fontSize: 38, marginBottom: 10 }}>🏗️</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Build your role hierarchy</div>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 18, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
        Start at the top — usually a CEO or Owner — and add the roles that report to them. You can always reorganise later by editing any role's "Reports to".
      </div>
      <button onClick={onCreate} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
        + Create Top-Level Role
      </button>
    </div>
  );
}

function ScopeBanner({
  isClientLevel, clientName, selectedClientId,
}: {
  isClientLevel: boolean;
  clientName: string;
  selectedClientId: string;
}) {
  if (isClientLevel) {
    return (
      <div style={{ ...bannerBase('#10b981'), marginBottom: 14 }}>
        <span>🔒</span>
        <span>Your client: <strong>{clientName || 'Loading…'}</strong></span>
        <span style={{ marginLeft: 'auto', opacity: 0.7, fontWeight: 500 }}>You can only manage your own client's hierarchy.</span>
      </div>
    );
  }
  if (!selectedClientId) {
    return (
      <div style={{ ...bannerBase('#6366f1'), marginBottom: 14 }}>
        <span>🌐</span>
        <span>Org-level view <span style={{ opacity: 0.75, fontWeight: 500, marginLeft: 6 }}>· roles created here are defaults visible to all clients</span></span>
      </div>
    );
  }
  return (
    <div style={{ ...bannerBase('#3E9EFF'), marginBottom: 14 }}>
      <span>🔵</span>
      <span>Configuring for: <strong>{clientName || selectedClientId.slice(0, 8) + '…'}</strong></span>
      <span style={{ marginLeft: 'auto', opacity: 0.75, fontWeight: 500 }}>You see this client's roles + org-level defaults; new roles get stamped to this client.</span>
    </div>
  );
}

function bannerBase(color: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
    background: `${color}15`, color, border: `1px solid ${color}40`,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = {
  width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 12px', borderRadius: 8, fontSize: 13, boxSizing: 'border-box',
};
const iconBtn = (color: string): React.CSSProperties => ({
  width: 28, height: 28, borderRadius: 6, fontSize: 13,
  background: 'transparent', border: `1px solid ${color}`, color, cursor: 'pointer',
  padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
});
const pillBtn = (color: string): React.CSSProperties => ({
  background: 'transparent', border: `1px solid ${color}`, color, padding: '6px 12px',
  borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
});
const chip = (color: string): React.CSSProperties => ({
  background: `${color}15`, color, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
});
