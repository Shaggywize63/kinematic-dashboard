'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../../lib/api';

// Settings → Activity Subjects — admins curate the dropdown reps see
// on /crm/activities/new (above the free-text subject input). Backend
// orders by `position` so the row at position=0 lands first on the
// picker (seed value: "Meeting"). Free-text remains for one-offs.

interface ActivitySubject {
  id: string;
  name: string;
  position: number;
  is_active: boolean | null;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%',
};
const btn: React.CSSProperties = {
  background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px',
  borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnSec: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' };

export default function ActivitySubjectsSettingsPage() {
  const [rows, setRows] = useState<ActivitySubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({}); // id → name being edited

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ success?: boolean; data?: ActivitySubject[] }>(
        '/api/v1/crm/activity-subjects',
      );
      setRows((r?.data ?? []) as ActivitySubject[]);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load activity subjects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setSavingNew(true);
    try {
      await api.post('/api/v1/crm/activity-subjects', { name });
      setNewName('');
      await load();
      toast.success('Subject added');
    } catch (e: any) {
      toast.error(e.message || 'Failed to add subject');
    } finally {
      setSavingNew(false);
    }
  };

  const handleRename = async (id: string) => {
    const next = editing[id]?.trim();
    if (!next) return;
    try {
      await api.patch(`/api/v1/crm/activity-subjects/${id}`, { name: next });
      setEditing((prev) => {
        const out = { ...prev };
        delete out[id];
        return out;
      });
      await load();
      toast.success('Subject renamed');
    } catch (e: any) {
      toast.error(e.message || 'Failed to rename');
    }
  };

  const toggleActive = async (row: ActivitySubject) => {
    try {
      await api.patch(`/api/v1/crm/activity-subjects/${row.id}`, {
        is_active: row.is_active === false ? true : false,
      });
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to toggle');
    }
  };

  const move = async (row: ActivitySubject, direction: 'up' | 'down') => {
    const ordered = [...rows].sort((a, b) => a.position - b.position);
    const idx = ordered.findIndex((r) => r.id === row.id);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= ordered.length) return;
    const swap = ordered[targetIdx];
    try {
      await Promise.all([
        api.patch(`/api/v1/crm/activity-subjects/${row.id}`, { position: swap.position }),
        api.patch(`/api/v1/crm/activity-subjects/${swap.id}`, { position: row.position }),
      ]);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to reorder');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this subject? It will disappear from the dropdown.')) return;
    try {
      await api.delete(`/api/v1/crm/activity-subjects/${id}`);
      await load();
      toast.success('Subject removed');
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
    }
  };

  const sorted = [...rows].sort((a, b) => a.position - b.position);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text)' }}>Activity Subjects</h1>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {loading ? 'Loading…' : `${sorted.length} subject${sorted.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 18 }}>
        These are the subject presets reps see on the activity compose screen. The first row
        (lowest position) is the default — keep &quot;Meeting&quot; at the top.
      </p>

      {/* Add new */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="New subject (e.g. Follow-up call)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            style={inputStyle}
          />
          <button onClick={handleAdd} disabled={savingNew || !newName.trim()} style={btn}>
            {savingNew ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--s3)', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px' }}>#</th>
              <th style={{ padding: '10px 12px' }}>Subject</th>
              <th style={{ padding: '10px 12px' }}>Status</th>
              <th style={{ padding: '10px 12px', width: 200 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && !loading && (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
                No subjects yet — add one above.
              </td></tr>
            )}
            {sorted.map((row, idx) => {
              const isEditing = editing[row.id] !== undefined;
              return (
                <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-dim)' }}>{idx + 1}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {isEditing ? (
                      <input
                        value={editing[row.id]}
                        onChange={(e) => setEditing((p) => ({ ...p, [row.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(row.id);
                          if (e.key === 'Escape') setEditing((p) => { const o = { ...p }; delete o[row.id]; return o; });
                        }}
                        style={inputStyle}
                        autoFocus
                      />
                    ) : (
                      <span style={{ color: row.is_active === false ? 'var(--text-dim)' : 'var(--text)' }}>
                        {row.name}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 700,
                      background: row.is_active === false ? '#9ca3af33' : '#10b98133',
                      color: row.is_active === false ? '#9ca3af' : '#10b981',
                    }}>
                      {row.is_active === false ? 'Hidden' : 'Active'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {isEditing ? (
                      <>
                        <button style={btn} onClick={() => handleRename(row.id)}>Save</button>
                        <button style={btnSec} onClick={() => setEditing((p) => { const o = { ...p }; delete o[row.id]; return o; })}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button style={btnSec} onClick={() => setEditing((p) => ({ ...p, [row.id]: row.name }))}>Rename</button>
                        <button style={btnSec} onClick={() => move(row, 'up')} disabled={idx === 0}>↑</button>
                        <button style={btnSec} onClick={() => move(row, 'down')} disabled={idx === sorted.length - 1}>↓</button>
                        <button style={btnSec} onClick={() => toggleActive(row)}>
                          {row.is_active === false ? 'Show' : 'Hide'}
                        </button>
                        <button style={{ ...btnSec, color: '#ef4444', borderColor: '#ef4444' }} onClick={() => remove(row.id)}>Delete</button>
                      </>
                    )}
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
