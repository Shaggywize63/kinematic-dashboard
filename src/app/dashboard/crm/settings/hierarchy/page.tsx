'use client';

// Phase 3 of the per-client org-hierarchy rollout. Defines the
// management levels (Director / RSM / ASM / Sales Executive / etc.) for
// the active client and lets an admin assign each user to a level +
// pick their direct supervisor. The page only loads anything when the
// /hierarchy/enabled probe returns true — Tata Tiscon's settings index
// hides this card entirely, and direct URL visits show a friendly
// "not enabled for this client" state instead of the editor.

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../../lib/api';

interface Level {
  id: string;
  org_id: string;
  client_id: string | null;
  name: string;
  level_order: number;
  parent_level_id: string | null;
  capabilities: Record<string, unknown>;
}

interface Member {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  supervisor_id: string | null;
  hierarchy_level_id: string | null;
  client_id: string | null;
}

const C = {
  s2: 'var(--s2)',
  s3: 'var(--s3)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--text-dim)',
  primary: 'var(--primary)',
};

const input: React.CSSProperties = {
  background: C.s3,
  border: `1px solid ${C.border}`,
  color: C.text,
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 13,
};

const btnPrimary: React.CSSProperties = {
  background: 'var(--primary)',
  border: 'none',
  color: '#fff',
  padding: '8px 16px',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
};

const btnGhost: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${C.border}`,
  color: C.text,
  padding: '6px 12px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
};

export default function HierarchyPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLevelName, setNewLevelName] = useState('');
  const [savingMember, setSavingMember] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<any>('/api/v1/crm/hierarchy/enabled');
        const isOn = (r?.data?.enabled ?? r?.enabled) === true;
        setEnabled(isOn);
        if (!isOn) {
          setLoading(false);
          return;
        }
        await reload();
      } catch (e: any) {
        setEnabled(false);
        setLoading(false);
        toast.error(e?.message || 'Failed to load hierarchy');
      }
    })();
  }, []);

  const reload = async () => {
    setLoading(true);
    try {
      const [ls, ms] = await Promise.all([
        api.get<any>('/api/v1/crm/hierarchy/levels'),
        api.get<any>('/api/v1/crm/hierarchy/members'),
      ]);
      setLevels((ls?.data ?? []) as Level[]);
      setMembers((ms?.data ?? []) as Member[]);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load hierarchy');
    } finally {
      setLoading(false);
    }
  };

  const addLevel = async () => {
    const name = newLevelName.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }
    const nextOrder = (levels.reduce((m, l) => Math.max(m, l.level_order), 0) || 0) + 1;
    try {
      await api.post('/api/v1/crm/hierarchy/levels', { name, level_order: nextOrder });
      setNewLevelName('');
      toast.success('Level added');
      await reload();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add level');
    }
  };

  const renameLevel = async (id: string, name: string) => {
    try {
      await api.patch(`/api/v1/crm/hierarchy/levels/${id}`, { name });
      setLevels((cur) => cur.map((l) => (l.id === id ? { ...l, name } : l)));
    } catch (e: any) {
      toast.error(e?.message || 'Rename failed');
      reload();
    }
  };

  const moveLevel = async (id: string, dir: -1 | 1) => {
    const sorted = [...levels].sort((a, b) => a.level_order - b.level_order);
    const idx = sorted.findIndex((l) => l.id === id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    try {
      await Promise.all([
        api.patch(`/api/v1/crm/hierarchy/levels/${id}`, { level_order: swap.level_order }),
        api.patch(`/api/v1/crm/hierarchy/levels/${swap.id}`, { level_order: sorted[idx].level_order }),
      ]);
      await reload();
    } catch (e: any) {
      toast.error(e?.message || 'Reorder failed');
    }
  };

  const deleteLevel = async (id: string) => {
    if (!window.confirm('Delete this level? Users on it must be reassigned first.')) return;
    try {
      await api.delete(`/api/v1/crm/hierarchy/levels/${id}`);
      toast.success('Level deleted');
      await reload();
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    }
  };

  const setMemberField = async (memberId: string, patch: Partial<Member>) => {
    setSavingMember(memberId);
    try {
      const body: Record<string, unknown> = {};
      if (patch.hierarchy_level_id !== undefined) body.hierarchy_level_id = patch.hierarchy_level_id;
      if (patch.supervisor_id !== undefined) body.supervisor_id = patch.supervisor_id;
      await api.patch(`/api/v1/crm/hierarchy/members/${memberId}`, body);
      setMembers((cur) => cur.map((m) => (m.id === memberId ? { ...m, ...patch } : m)));
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
      reload();
    } finally {
      setSavingMember(null);
    }
  };

  // Group members by hierarchy_level_id so each level card lists its
  // current occupants. Unassigned users land in a synthetic bucket.
  const grouped = useMemo(() => {
    const buckets = new Map<string | null, Member[]>();
    members.forEach((m) => {
      const k = m.hierarchy_level_id;
      const arr = buckets.get(k) ?? [];
      arr.push(m);
      buckets.set(k, arr);
    });
    return buckets;
  }, [members]);

  const sortedLevels = useMemo(
    () => [...levels].sort((a, b) => a.level_order - b.level_order),
    [levels],
  );

  if (enabled === null || loading) {
    return <div style={{ padding: 24, color: C.dim }}>Loading hierarchy…</div>;
  }

  if (!enabled) {
    return (
      <div
        style={{
          background: C.s2,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 24,
        }}
      >
        <h2 style={{ margin: '0 0 8px', color: C.text, fontSize: 18 }}>Org Hierarchy</h2>
        <p style={{ margin: 0, color: C.dim, fontSize: 13, lineHeight: 1.6 }}>
          Hierarchy-based RBAC isn&apos;t enabled for this client yet. Existing role-based
          user management (city manager / supervisor / sub-admin) is in effect — and the
          existing flow remains the source of truth until an admin explicitly opts in.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          background: C.s2,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 18,
        }}
      >
        <h2 style={{ margin: 0, color: C.text, fontSize: 18 }}>Org Hierarchy</h2>
        <p style={{ margin: '4px 0 0', color: C.dim, fontSize: 12, lineHeight: 1.6 }}>
          Define your management levels (e.g. Director → RSM → ASM → Sales Executive) and
          assign each user to a level plus their direct supervisor. Reads in the CRM
          (leads, contacts, accounts, deals, activities) are scoped to the caller&apos;s
          subtree — i.e. themselves plus everyone reporting to them transitively.
        </p>
      </div>

      <div
        style={{
          background: C.s2,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 18,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          Levels
        </div>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>
          Listed top → bottom. Reorder with ↑/↓. Renaming saves on blur.
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 90px auto',
            gap: 8,
            alignItems: 'end',
            marginBottom: 12,
            padding: 10,
            background: C.s3,
            borderRadius: 8,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontSize: 10,
                color: C.dim,
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              New level name
            </span>
            <input
              value={newLevelName}
              onChange={(e) => setNewLevelName(e.target.value)}
              placeholder="e.g. Regional Sales Manager"
              style={input}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addLevel();
              }}
            />
          </label>
          <span style={{ fontSize: 11, color: C.dim }}>
            Next order: {(sortedLevels.at(-1)?.level_order ?? 0) + 1}
          </span>
          <button type="button" onClick={addLevel} style={{ ...btnPrimary, padding: '8px 14px' }}>
            + Add level
          </button>
        </div>

        {sortedLevels.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: C.dim,
              textAlign: 'center',
              padding: 16,
              background: C.s3,
              borderRadius: 8,
            }}
          >
            No levels defined yet. Add the top-of-org level above to start.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedLevels.map((lvl, i) => (
              <div
                key={lvl.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr 60px 60px 90px',
                  gap: 8,
                  alignItems: 'center',
                  padding: 8,
                  background: C.s3,
                  borderRadius: 8,
                }}
              >
                <div style={{ fontSize: 11, color: C.dim, textAlign: 'center', fontFamily: 'monospace' }}>
                  L{lvl.level_order}
                </div>
                <input
                  defaultValue={lvl.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== lvl.name) renameLevel(lvl.id, v);
                  }}
                  style={{ ...input, padding: '6px 8px' }}
                />
                <button
                  type="button"
                  onClick={() => moveLevel(lvl.id, -1)}
                  disabled={i === 0}
                  style={{ ...btnGhost, opacity: i === 0 ? 0.4 : 1 }}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveLevel(lvl.id, 1)}
                  disabled={i === sortedLevels.length - 1}
                  style={{ ...btnGhost, opacity: i === sortedLevels.length - 1 ? 0.4 : 1 }}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => deleteLevel(lvl.id)}
                  style={{ ...btnGhost, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                  title="Delete"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          background: C.s2,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 18,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          Members ({members.length})
        </div>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>
          Pick a level and a direct supervisor for each user. The supervisor selector
          rejects choices that would create a cycle (you can&apos;t report to your own
          report).
        </div>

        {sortedLevels.map((lvl) => (
          <MemberGroup
            key={lvl.id}
            heading={`${lvl.name} (L${lvl.level_order})`}
            members={grouped.get(lvl.id) ?? []}
            levels={sortedLevels}
            allMembers={members}
            saving={savingMember}
            onChange={setMemberField}
          />
        ))}
        <MemberGroup
          heading="Unassigned"
          members={grouped.get(null) ?? []}
          levels={sortedLevels}
          allMembers={members}
          saving={savingMember}
          onChange={setMemberField}
        />
      </div>
    </div>
  );
}

function MemberGroup({
  heading,
  members,
  levels,
  allMembers,
  saving,
  onChange,
}: {
  heading: string;
  members: Member[];
  levels: Level[];
  allMembers: Member[];
  saving: string | null;
  onChange: (id: string, patch: Partial<Member>) => void;
}) {
  if (members.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          fontWeight: 700,
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {heading} · {members.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {members.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr 1fr',
              gap: 8,
              alignItems: 'center',
              padding: 8,
              background: 'var(--s3)',
              borderRadius: 8,
              opacity: saving === m.id ? 0.6 : 1,
            }}
          >
            <span style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text)',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.name || m.email || 'Unnamed user'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                {m.email}
                {m.role ? ` · ${m.role}` : ''}
              </div>
            </span>
            <select
              value={m.hierarchy_level_id ?? ''}
              onChange={(e) => onChange(m.id, { hierarchy_level_id: e.target.value || null })}
              disabled={saving === m.id}
              style={input}
              title="Hierarchy level"
            >
              <option value="">— No level —</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  L{l.level_order} · {l.name}
                </option>
              ))}
            </select>
            <select
              value={m.supervisor_id ?? ''}
              onChange={(e) => onChange(m.id, { supervisor_id: e.target.value || null })}
              disabled={saving === m.id}
              style={input}
              title="Direct supervisor (the person this user reports to)"
            >
              <option value="">— No supervisor —</option>
              {allMembers
                .filter((other) => other.id !== m.id)
                .map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.name || other.email || other.id.slice(0, 8)}
                  </option>
                ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
