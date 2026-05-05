'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmLeadSources } from '../../../../../lib/crmApi';
import type { LeadSource } from '../../../../../types/crm';

export default function SourcesSettings() {
  const [items, setItems] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const r = await crmLeadSources.list();
      setItems(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Load failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!name.trim()) return toast.error('Name is required');
    setCreating(true);
    try {
      await crmLeadSources.create({ name: name.trim(), description: description.trim() || null, is_active: true } as any);
      toast.success(`"${name.trim()}" added`);
      setName(''); setDescription('');
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Create failed — check your API connection');
    } finally { setCreating(false); }
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return toast.error('Name is required');
    try {
      await crmLeadSources.update(id, { name: editName.trim() } as any);
      toast.success('Updated');
      setEditingId(null);
      reload();
    } catch (e: any) { toast.error(e.message || 'Update failed'); }
  };

  const toggleActive = async (s: LeadSource) => {
    setBusy((b) => ({ ...b, [s.id + '_t']: true }));
    try {
      await crmLeadSources.update(s.id, { is_active: !s.is_active } as any);
      toast.success(s.is_active ? 'Deactivated' : 'Activated');
      reload();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setBusy((b) => ({ ...b, [s.id + '_t']: false })); }
  };

  const remove = async (s: LeadSource) => {
    if (!window.confirm(`Delete source "${s.name}"? Existing leads tagged with this source will keep the value but you won't be able to assign new ones.`)) return;
    setBusy((b) => ({ ...b, [s.id + '_d']: true }));
    try {
      await crmLeadSources.remove(s.id);
      toast.success('Deleted');
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy((b) => ({ ...b, [s.id + '_d']: false })); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Add Lead Source</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Track where your leads come from (e.g. Website, Referral, Cold Call). Used by reports and assignment rules.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="Source name (e.g. Website)" style={input} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="Description (optional)" style={input} />
          <button onClick={create} disabled={creating} style={btnPrimary}>{creating ? 'Adding...' : '+ Add'}</button>
        </div>
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Lead Sources ({items.length})</div>
        {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> : items.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No sources yet. Add one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((s) => {
              const isEditing = editingId === s.id;
              return (
                <div key={s.id} style={{ padding: 10, background: 'var(--s3)', borderRadius: 8, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isEditing ? (
                    <>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...input, flex: 1 }} />
                      <button onClick={() => saveEdit(s.id)} style={btnSmallPrimary}>Save</button>
                      <button onClick={() => setEditingId(null)} style={btnSmallGhost}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                        {!s.is_active && <span style={{ marginLeft: 8, fontSize: 10, background: 'var(--s2)', color: 'var(--text-dim)', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>INACTIVE</span>}
                        {s.description && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{s.description}</div>}
                      </div>
                      <button onClick={() => { setEditingId(s.id); setEditName(s.name); }} style={btnSmallGhost}>Edit</button>
                      <button onClick={() => toggleActive(s)} disabled={!!busy[s.id + '_t']} style={btnSmallGhost}>{s.is_active ? 'Deactivate' : 'Activate'}</button>
                      <button onClick={() => remove(s)} disabled={!!busy[s.id + '_d']} style={{ ...btnSmallDanger, opacity: busy[s.id + '_d'] ? 0.5 : 1 }}>{busy[s.id + '_d'] ? '...' : 'Delete'}</button>
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
