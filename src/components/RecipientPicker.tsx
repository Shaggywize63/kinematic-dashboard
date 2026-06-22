'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';

// Recipient picker for the notifications composer. Three tabs let the
// admin scan users by city, by org-hierarchy level, or pick a previously
// saved group. Selection is a flat set of user UUIDs the parent sends
// through to /api/v1/notifications/send as `targeting.user_ids`.

interface User {
  id: string;
  name: string;
  role?: string;
  city?: string | null;
  hierarchy_level_id?: string | null;
}

interface HierarchyLevel {
  id: string;
  name: string;
  level_order?: number;
  parent_level_id?: string | null;
}

export interface NotificationGroup {
  id: string;
  name: string;
  description?: string | null;
  user_ids: string[];
}

type Tab = 'city' | 'hierarchy' | 'groups';

const C = {
  red: '#E01E2C',
  gray: 'var(--textSec)',
  border: 'var(--border)',
  s2: 'var(--s2)',
  s3: 'var(--s3)',
  text: 'var(--text)',
};

interface Props {
  users: User[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
}

export default function RecipientPicker({ users, selectedIds, onChange }: Props) {
  const [tab, setTab] = useState<Tab>('city');
  const [levels, setLevels] = useState<HierarchyLevel[]>([]);
  const [groups, setGroups] = useState<NotificationGroup[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Group / level + group lists are best-effort; failures leave the
  // tab empty rather than crashing the page.
  useEffect(() => {
    api.get<{ data?: HierarchyLevel[] }>('/api/v1/crm/hierarchy/levels')
      .then((r) => setLevels(r?.data ?? []))
      .catch(() => { /* non-fatal */ });
    api.get<{ data?: NotificationGroup[] }>('/api/v1/notifications/groups')
      .then((r) => setGroups(r?.data ?? []))
      .catch(() => { /* non-fatal */ });
  }, []);

  // Group users by city / level for the tree view. Users without a
  // city or level land in a "Unassigned" bucket so they're still
  // selectable; otherwise reps without geo metadata are unreachable.
  const byCity = useMemo(() => {
    const m = new Map<string, User[]>();
    for (const u of users) {
      const k = (u.city || '').trim() || 'Unassigned';
      const arr = m.get(k) ?? [];
      arr.push(u);
      m.set(k, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [users]);

  const byLevel = useMemo(() => {
    const m = new Map<string, User[]>();
    for (const u of users) {
      const k = u.hierarchy_level_id || 'unassigned';
      const arr = m.get(k) ?? [];
      arr.push(u);
      m.set(k, arr);
    }
    const ordered: Array<{ id: string; label: string; users: User[] }> = [];
    for (const lv of levels) {
      const us = m.get(lv.id);
      if (us && us.length) ordered.push({ id: lv.id, label: lv.name, users: us });
    }
    const orphan = m.get('unassigned');
    if (orphan && orphan.length) ordered.push({ id: 'unassigned', label: 'Unassigned', users: orphan });
    return ordered;
  }, [users, levels]);

  const visibleUserMatches = (u: User) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (u.name || '').toLowerCase().includes(q) || (u.city || '').toLowerCase().includes(q);
  };

  const toggleUser = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };

  const toggleBucket = (us: User[], on: boolean) => {
    const next = new Set(selectedIds);
    for (const u of us) { if (on) next.add(u.id); else next.delete(u.id); }
    onChange(next);
  };

  const toggleExpand = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpanded(next);
  };

  // ── Save current selection as a new group ────────────────────────
  async function saveAsGroup() {
    if (selectedIds.size === 0) { alert('Pick at least one user first.'); return; }
    const name = prompt('Name this group (e.g. "Dhanbad CCs", "Bihar managers"):');
    if (!name) return;
    try {
      const r = await api.post<{ data?: NotificationGroup }>('/api/v1/notifications/groups', {
        name: name.trim(),
        user_ids: Array.from(selectedIds),
      });
      const created = r?.data;
      if (created) setGroups([created, ...groups]);
      alert('Saved.');
    } catch (e: any) {
      alert(e?.message || 'Failed to save group');
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm('Delete this group?')) return;
    try {
      await api.delete(`/api/v1/notifications/groups/${id}`);
      setGroups(groups.filter((g) => g.id !== id));
    } catch (e: any) { alert(e?.message || 'Failed to delete'); }
  }

  // ── Render ───────────────────────────────────────────────────────

  const tabBtn = (k: Tab, label: string) => (
    <button
      key={k}
      onClick={() => setTab(k)}
      style={{
        flex: 1,
        padding: '10px 14px',
        background: tab === k ? C.red : 'transparent',
        color: tab === k ? '#fff' : C.gray,
        border: `1px solid ${tab === k ? C.red : C.border}`,
        borderRadius: 8,
        fontWeight: 700,
        fontSize: 12,
        cursor: 'pointer',
      }}
    >{label}</button>
  );

  const userRow = (u: User) => (
    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer', color: C.text }}>
      <input
        type="checkbox"
        checked={selectedIds.has(u.id)}
        onChange={() => toggleUser(u.id)}
        style={{ width: 16, height: 16, accentColor: C.red, cursor: 'pointer' }}
      />
      <span style={{ fontSize: 13 }}>{u.name}</span>
      {u.role && <span style={{ fontSize: 11, color: C.gray }}>· {u.role.replace(/_/g, ' ')}</span>}
    </label>
  );

  const bucket = (key: string, label: string, us: User[]) => {
    const filtered = us.filter(visibleUserMatches);
    if (filtered.length === 0 && search.trim()) return null;
    const allOn = filtered.length > 0 && filtered.every((u) => selectedIds.has(u.id));
    const isOpen = expanded.has(key) || !!search.trim();
    return (
      <div key={key} style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={allOn}
            onChange={(e) => toggleBucket(filtered, e.target.checked)}
            style={{ width: 16, height: 16, accentColor: C.red, cursor: 'pointer' }}
          />
          <button
            onClick={() => toggleExpand(key)}
            style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', color: C.text, fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}
          >
            {isOpen ? '▾' : '▸'} {label} <span style={{ color: C.gray, fontWeight: 400 }}>({filtered.length})</span>
          </button>
        </div>
        {isOpen && (
          <div style={{ marginLeft: 26 }}>
            {filtered.map(userRow)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {tabBtn('city', 'By City')}
        {tabBtn('hierarchy', 'By Hierarchy')}
        {tabBtn('groups', 'Saved Groups')}
      </div>

      {tab !== 'groups' && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users…"
          style={{ width: '100%', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', color: C.text, fontSize: 13, outline: 'none' }}
        />
      )}

      <div style={{ maxHeight: 360, overflowY: 'auto', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '4px 14px' }}>
        {tab === 'city' && byCity.map(([city, us]) => bucket(`city:${city}`, city, us))}
        {tab === 'hierarchy' && byLevel.map(({ id, label, users: us }) => bucket(`lvl:${id}`, label, us))}
        {tab === 'groups' && (
          groups.length === 0
            ? <div style={{ padding: 16, color: C.gray, fontSize: 13 }}>No saved groups yet. Pick users via the By City / By Hierarchy tabs and tap "Save as group" below.</div>
            : groups.map((g) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                  <input
                    type="checkbox"
                    checked={g.user_ids.every((id) => selectedIds.has(id))}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      if (e.target.checked) g.user_ids.forEach((id) => next.add(id));
                      else g.user_ids.forEach((id) => next.delete(id));
                      onChange(next);
                    }}
                    style={{ width: 16, height: 16, accentColor: C.red, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: C.gray }}>{g.user_ids.length} user{g.user_ids.length === 1 ? '' : 's'}{g.description ? ` · ${g.description}` : ''}</div>
                  </div>
                  <button
                    onClick={() => deleteGroup(g.id)}
                    style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.gray, borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
                  >Delete</button>
                </div>
              ))
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: C.gray }}>
        <div>{selectedIds.size} selected</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onChange(new Set())}
            style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.gray, borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
          >Clear</button>
          <button
            onClick={saveAsGroup}
            style={{ background: C.red, border: 'none', color: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >Save as group</button>
        </div>
      </div>
    </div>
  );
}
