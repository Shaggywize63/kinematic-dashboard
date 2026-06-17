'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../../lib/api';

// Settings → Blocks (talukas) — admin curates the per-district block
// list that the lead form's "Block" lookup field pulls from. Reps
// are filtered to their assigned districts on the lookup-search route,
// so a Dhanbad Champion only sees Dhanbad rows when picking a block.

interface Block {
  id: string;
  state: string | null;
  district: string;
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

export default function BlocksSettingsPage() {
  const [rows, setRows] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [districtFilter, setDistrictFilter] = useState<string>('');
  const [newDistrict, setNewDistrict] = useState('');
  const [newName, setNewName] = useState('');
  const [newState, setNewState] = useState('Jharkhand');
  const [savingNew, setSavingNew] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ success?: boolean; data?: Block[] }>(
        '/api/v1/crm/blocks?limit=1000',
      );
      setRows((r?.data ?? []) as Block[]);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load blocks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // District list comes from the rows themselves so the filter
  // dropdown stays in lockstep with the data — no separate fetch.
  const districts = useMemo(() => {
    const set = new Set(rows.map((r) => r.district).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  const visible = districtFilter ? rows.filter((r) => r.district === districtFilter) : rows;

  const handleAdd = async () => {
    const name = newName.trim();
    const district = newDistrict.trim();
    if (!name || !district) {
      toast.error('District + Block name are both required');
      return;
    }
    setSavingNew(true);
    try {
      await api.post('/api/v1/crm/blocks', {
        district, name, state: newState.trim() || null,
      });
      setNewName('');
      await load();
      toast.success('Block added');
    } catch (e: any) {
      toast.error(e.message || 'Failed to add block');
    } finally {
      setSavingNew(false);
    }
  };

  const handleRename = async (id: string) => {
    const next = editing[id]?.trim();
    if (!next) return;
    try {
      await api.patch(`/api/v1/crm/blocks/${id}`, { name: next });
      setEditing((prev) => {
        const out = { ...prev };
        delete out[id];
        return out;
      });
      await load();
      toast.success('Block renamed');
    } catch (e: any) {
      toast.error(e.message || 'Failed to rename');
    }
  };

  const toggleActive = async (row: Block) => {
    try {
      await api.patch(`/api/v1/crm/blocks/${row.id}`, {
        is_active: row.is_active === false ? true : false,
      });
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to toggle');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this block? It will disappear from the picker.')) return;
    try {
      await api.delete(`/api/v1/crm/blocks/${id}`);
      await load();
      toast.success('Block removed');
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text)' }}>Blocks (Talukas)</h1>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {loading ? 'Loading…' : `${rows.length} blocks across ${districts.length} districts`}
        </span>
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 18 }}>
        Blocks group under their parent district. The lead form&apos;s Block picker is automatically
        scoped to the rep&apos;s assigned districts — a Dhanbad Champion sees Dhanbad blocks only.
      </p>

      {/* Add new */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
          <input placeholder="District (e.g. Dhanbad)" value={newDistrict} onChange={(e) => setNewDistrict(e.target.value)} list="districts-known" style={inputStyle} />
          <datalist id="districts-known">
            {districts.map((d) => <option key={d} value={d} />)}
          </datalist>
          <input placeholder="Block / taluka name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }} style={inputStyle} />
          <input placeholder="State" value={newState} onChange={(e) => setNewState(e.target.value)} style={inputStyle} />
          <button onClick={handleAdd} disabled={savingNew || !newName.trim() || !newDistrict.trim()} style={btn}>
            {savingNew ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>District:</span>
        <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} style={{ ...inputStyle, width: 220 }}>
          <option value="">All districts</option>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{visible.length} shown</span>
      </div>

      {/* List */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--s3)', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px' }}>District</th>
              <th style={{ padding: '10px 12px' }}>Block</th>
              <th style={{ padding: '10px 12px' }}>State</th>
              <th style={{ padding: '10px 12px' }}>Status</th>
              <th style={{ padding: '10px 12px', width: 240 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
                No blocks {districtFilter ? `in ${districtFilter}` : ''} yet — add one above.
              </td></tr>
            )}
            {visible.map((row) => {
              const isEditing = editing[row.id] !== undefined;
              return (
                <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-dim)' }}>{row.district}</td>
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
                  <td style={{ padding: '8px 12px', color: 'var(--text-dim)' }}>{row.state || '—'}</td>
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
