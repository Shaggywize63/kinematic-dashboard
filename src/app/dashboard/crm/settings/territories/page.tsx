'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmTerritories } from '../../../../../lib/crmApi';
import type { Territory } from '../../../../../types/crm';

export default function TerritoriesPage() {
  const [items, setItems] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const r = await crmTerritories.list();
      setItems(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Load failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!name.trim()) return toast.error('Name is required');
    setCreating(true);
    try {
      await crmTerritories.create({ name: name.trim(), description: description.trim() || null, parent_id: parentId || null } as any);
      toast.success('Territory added');
      setName(''); setDescription(''); setParentId('');
      reload();
    } catch (e: any) { toast.error(e.message || 'Create failed'); }
    finally { setCreating(false); }
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return toast.error('Name is required');
    try {
      await crmTerritories.update(id, { name: editName.trim() } as any);
      toast.success('Updated');
      setEditingId(null);
      reload();
    } catch (e: any) { toast.error(e.message || 'Update failed'); }
  };

  const remove = async (t: Territory) => {
    if (!window.confirm(`Delete territory "${t.name}"? Sub-territories using this as parent will be orphaned.`)) return;
    setBusy((b) => ({ ...b, [t.id]: true }));
    try {
      await crmTerritories.remove(t.id);
      toast.success('Deleted');
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy((b) => ({ ...b, [t.id]: false })); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Add Territory</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. North Region)" style={input} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" style={input} />
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} style={input}>
            <option value="">— Top-level —</option>
            {items.map((t) => <option key={t.id} value={t.id}>Under: {t.name}</option>)}
          </select>
        </div>
        <button onClick={create} disabled={creating} style={btnPrimary}>{creating ? 'Adding...' : '+ Add Territory'}</button>
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Territories ({items.length})</div>
        {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> : items.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No territories yet. Add one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((t) => {
              const parent = t.parent_id ? items.find((x) => x.id === t.parent_id) : null;
              const isEditing = editingId === t.id;
              return (
                <div key={t.id} style={{ padding: 10, background: 'var(--s3)', borderRadius: 8, color: 'var(--text)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isEditing ? (
                    <>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...input, flex: 1 }} />
                      <button onClick={() => saveEdit(t.id)} style={btnSmallPrimary}>Save</button>
                      <button onClick={() => setEditingId(null)} style={btnSmallGhost}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600 }}>{t.name}</span>
                        {parent && <span style={{ color: 'var(--text-dim)', marginLeft: 8, fontSize: 11 }}>under {parent.name}</span>}
                        {t.description && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{t.description}</div>}
                      </div>
                      <button onClick={() => { setEditingId(t.id); setEditName(t.name); }} style={btnSmallGhost}>Edit</button>
                      <button onClick={() => remove(t)} disabled={!!busy[t.id]} style={{ ...btnSmallDanger, opacity: busy[t.id] ? 0.5 : 1 }}>{busy[t.id] ? '...' : 'Delete'}</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnSmallPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 11 };
const btnSmallGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const btnSmallDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
