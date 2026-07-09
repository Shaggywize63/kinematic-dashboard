'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../lib/api';
import { rolesApi, type OrgRole, type OrgRoleNode, type OrgRoleUser } from '../../../../lib/rolesApi';
import { crmSettings } from '../../../../lib/crmApi';
import { getStoredUser, canAccess } from '../../../../lib/auth';
import { useClient } from '@/context/ClientContext';
import { ALL_MODULES, MODULE_GROUPS, MODULE_GROUP_LABELS } from '../../../../lib/modules';

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
    permissions: string[];        // modules with READ access
    permissions_write: string[];  // modules with WRITE access (must be a subset of permissions)
    assigned_cities: string[];
  } | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  // The role chosen as the org/client default in CRM Settings — rendered as a
  // ★ badge so admins can see at a glance which role new users will land in.
  const [defaultRoleId, setDefaultRoleId] = useState<string | null>(null);
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

  // Pick up the configured default role from crm_settings.config so we can
  // render ★ next to that node in the tree. Refetches when the client picker
  // changes since the value is per-client.
  useEffect(() => {
    crmSettings.get()
      .then((r: any) => {
        const cfg = (r?.data?.config as Record<string, unknown>) || {};
        const id = typeof cfg.default_role_id === 'string' ? cfg.default_role_id : null;
        setDefaultRoleId(id);
      })
      .catch(() => setDefaultRoleId(null));
  }, [selectedClientId]);

  // Load city names so the EditPanel can render the city-access checklist.
  // `own_only=true` excludes the 868 India seed rows so hierarchy roles
  // can only constrain to cities the active client has explicitly added —
  // matching the user-assignment picker on the Team Members page. Reloads
  // when the picker changes since each tenant has its own city list.
  //
  // IMPORTANT: dependency array must contain only stable primitives.
  // `storedUser` is a fresh object from JSON.parse(localStorage…) on every
  // render — including it here triggers an infinite render loop that
  // freezes the page when the edit panel opens.
  const ownClientId: string | null = isClientLevel ? ((storedUser as any)?.client_id ?? null) : null;
  useEffect(() => {
    const sel = ownClientId ?? selectedClientId;
    const suffix = sel ? `&client_id=${encodeURIComponent(sel)}` : '';
    api.get<{ data?: Array<{ name?: string; is_active?: boolean }> } | Array<{ name?: string; is_active?: boolean }>>(`/api/v1/cities?limit=500&own_only=true${suffix}`)
      .then((res: any) => {
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setCities(list.filter((c: any) => c?.is_active !== false).map((c: any) => c.name).filter(Boolean));
      })
      .catch(() => setCities([]));
  }, [selectedClientId, ownClientId]);

  // The module catalogue in the role editor is filtered to what THIS client is
  // entitled to, so an admin can't grant a role access to a module the client
  // never bought — e.g. a Field-Force-only client (BMW) shouldn't see CRM /
  // Distribution modules in the picker. `null` = show everything (super-admin
  // at org level, or unknown entitlement → fail open so nobody gets locked out).
  const [clientModuleIds, setClientModuleIds] = useState<string[] | null>(null);
  useEffect(() => {
    // Client-level admin: their own resolved entitlement (client_modules +
    // universal) already rides on the stored user — no fetch needed.
    if (ownClientId) {
      const em = (storedUser as any)?.enabled_modules;
      setClientModuleIds(Array.isArray(em) && em.length > 0 ? em : null);
      return;
    }
    // Super-admin: filter to the picked client's assigned modules. No client
    // picked (viewing the org's own roles) → show the full catalogue.
    if (!selectedClientId) { setClientModuleIds(null); return; }
    let cancelled = false;
    api.get<any>('/api/v1/clients', { noCache: true } as RequestInit)
      .then((res: any) => {
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        const c = list.find((x: any) => x.id === selectedClientId || x.client_id === selectedClientId);
        const mods = c?.modules;
        if (!cancelled) setClientModuleIds(Array.isArray(mods) && mods.length > 0 ? mods : null);
      })
      .catch(() => { if (!cancelled) setClientModuleIds(null); });
    return () => { cancelled = true; };
  }, [ownClientId, selectedClientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Universal modules (Business / System / People) are always available to
  // every client, so they stay in the picker regardless of the entitlement.
  const visibleModules = useMemo(
    () => (clientModuleIds == null
      ? ALL_MODULES
      : ALL_MODULES.filter((m) => m.universal || clientModuleIds.includes(m.id))),
    [clientModuleIds],
  );

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
    setEditing({ id: null, name: '', description: '', parent_id, color: PRESET_COLORS[0], permissions: [], permissions_write: [], assigned_cities: [] });
  };
  const startEdit = (role: OrgRole) => {
    setEditing({
      id: role.id,
      name: role.name,
      description: role.description ?? '',
      parent_id: role.parent_id,
      color: role.color ?? PRESET_COLORS[0],
      permissions: role.permissions ?? [],
      permissions_write: role.permissions_write ?? [],
      assigned_cities: role.assigned_cities ?? [],
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
        permissions: editing.permissions,
        // Write access is gated to modules that already have read access — if you
        // can't see it you can't edit it.
        permissions_write: editing.permissions_write.filter((m) => editing.permissions.includes(m)),
        assigned_cities: editing.assigned_cities,
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
                  defaultRoleId={defaultRoleId}
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
                cities={cities}
                modules={visibleModules}
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
  node, depth, selectedId, defaultRoleId, onSelect, onAddChild, onEdit, onDelete,
}: {
  node: OrgRoleNode;
  depth: number;
  selectedId: string | null;
  defaultRoleId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (role: OrgRole) => void;
  onDelete: (role: OrgRole) => void;
}) {
  const [hover, setHover] = useState(false);
  const isDefault = defaultRoleId === node.id;
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
              {isDefault && (
                <span title="Default role for new users (configured in CRM Settings)" style={{ fontSize: 10, fontWeight: 800, color: '#F7B538', background: '#F7B53815', padding: '2px 8px', borderRadius: 4, border: '1px solid #F7B53855', letterSpacing: 0.4 }}>
                  ★ Default
                </span>
              )}
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
              defaultRoleId={defaultRoleId}
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
  editing, setEditing, flat, cities, modules, onSave, onCancel, saving,
}: {
  editing: { id: string | null; name: string; description: string; parent_id: string | null; color: string; permissions: string[]; permissions_write: string[]; assigned_cities: string[] };
  setEditing: (e: any) => void;
  flat: OrgRole[];
  cities: string[];
  // Module catalogue to offer — already filtered to the active client's
  // entitlement by the parent (universal modules always included).
  modules: typeof ALL_MODULES;
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

      {/* Module access — Read column gates visibility, Write column gates
          editing. Write implies Read; toggling Write on auto-grants Read. */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>Module access</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setEditing({ ...editing, permissions: modules.map((m) => m.id), permissions_write: modules.map((m) => m.id) })} style={tinyBtn}>All R/W</button>
            <button type="button" onClick={() => setEditing({ ...editing, permissions: modules.map((m) => m.id), permissions_write: [] })} style={tinyBtn}>All Read</button>
            <button type="button" onClick={() => setEditing({ ...editing, permissions: [], permissions_write: [] })} style={tinyBtn}>Clear</button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
          {editing.permissions.length} read · {editing.permissions_write.length} write.
        </div>
        <div style={{ maxHeight: 240, overflowY: 'auto', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          {/* Sticky column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 36px 36px', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, paddingBottom: 6, borderBottom: '1px solid var(--border)', marginBottom: 6 }}>
            <span>Module</span>
            <span style={{ textAlign: 'center' }}>R</span>
            <span style={{ textAlign: 'center' }}>W</span>
          </div>
          {MODULE_GROUPS.map((group) => {
            const items = modules.filter((m) => m.group === group);
            // A group with no entitled modules for this client is hidden
            // entirely (e.g. CRM / Distribution for a Field-Force-only client).
            if (items.length === 0) return null;
            const allRead = items.every((m) => editing.permissions.includes(m.id));
            const allWrite = items.every((m) => editing.permissions_write.includes(m.id));
            return (
              <div key={group} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{MODULE_GROUP_LABELS[group]}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const ids = items.map((m) => m.id);
                        const nextRead = allRead
                          ? editing.permissions.filter((p: string) => !ids.includes(p))
                          : Array.from(new Set([...editing.permissions, ...ids]));
                        setEditing({
                          ...editing,
                          permissions: nextRead,
                          // Removing read also removes write for those ids.
                          permissions_write: editing.permissions_write.filter((p: string) => nextRead.includes(p)),
                        });
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}
                    >{allRead ? 'no read' : 'all read'}</button>
                    <button
                      type="button"
                      onClick={() => {
                        const ids = items.map((m) => m.id);
                        if (allWrite) {
                          setEditing({ ...editing, permissions_write: editing.permissions_write.filter((p: string) => !ids.includes(p)) });
                        } else {
                          setEditing({
                            ...editing,
                            permissions: Array.from(new Set([...editing.permissions, ...ids])),
                            permissions_write: Array.from(new Set([...editing.permissions_write, ...ids])),
                          });
                        }
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}
                    >{allWrite ? 'no write' : 'all write'}</button>
                  </div>
                </div>
                {items.map((m) => {
                  const r = editing.permissions.includes(m.id);
                  const w = editing.permissions_write.includes(m.id);
                  return (
                    <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr 36px 36px', alignItems: 'center', gap: 4, fontSize: 11, color: r ? 'var(--text)' : 'var(--text-dim)', padding: '3px 0' }}>
                      <span>{m.l}</span>
                      <input type="checkbox" checked={r} onChange={() => {
                        const nextRead = r ? editing.permissions.filter((p: string) => p !== m.id) : [...editing.permissions, m.id];
                        // Drop write when read is dropped.
                        const nextWrite = r ? editing.permissions_write.filter((p: string) => p !== m.id) : editing.permissions_write;
                        setEditing({ ...editing, permissions: nextRead, permissions_write: nextWrite });
                      }} style={{ justifySelf: 'center', accentColor: '#3b82f6' }} title="Read" />
                      <input type="checkbox" checked={w} onChange={() => {
                        if (w) {
                          setEditing({ ...editing, permissions_write: editing.permissions_write.filter((p: string) => p !== m.id) });
                        } else {
                          // Granting write auto-grants read.
                          setEditing({
                            ...editing,
                            permissions: Array.from(new Set([...editing.permissions, m.id])),
                            permissions_write: [...editing.permissions_write, m.id],
                          });
                        }
                      }} style={{ justifySelf: 'center', accentColor: '#10b981' }} title="Write" />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* City access — geographic scope for role-bound users. */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>City access</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setEditing({ ...editing, assigned_cities: cities })} style={tinyBtn}>All</button>
            <button type="button" onClick={() => setEditing({ ...editing, assigned_cities: [] })} style={tinyBtn}>Clear</button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
          {editing.assigned_cities.length} of {cities.length} cities selected. Empty = no city restriction.
        </div>
        {cities.length === 0 ? (
          <div style={{ background: 'var(--s3)', border: '1px dashed var(--border)', borderRadius: 8, padding: 12, fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>No cities configured. Add cities in System → Cities first.</div>
        ) : (
          <div style={{ maxHeight: 180, overflowY: 'auto', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {cities.map((city) => {
              const on = editing.assigned_cities.includes(city);
              return (
                <label key={city} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: on ? 'var(--text)' : 'var(--text-dim)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => {
                    const next = on ? editing.assigned_cities.filter((c: string) => c !== city) : [...editing.assigned_cities, city];
                    setEditing({ ...editing, assigned_cities: next });
                  }} />
                  {city}
                </label>
              );
            })}
          </div>
        )}
      </div>

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
const tinyBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)',
  padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
};
const chip = (color: string): React.CSSProperties => ({
  background: `${color}15`, color, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
});
