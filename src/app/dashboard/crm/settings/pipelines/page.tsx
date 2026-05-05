'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmPipelines } from '../../../../../lib/crmApi';
import type { Pipeline } from '../../../../../types/crm';

export default function PipelinesSettings() {
  const [items, setItems] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const reload = async () => {
    try { const r = await crmPipelines.list(); setItems(r.data || []); }
    catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    try { await crmPipelines.create({ name, is_default: false } as any); setName(''); reload(); toast.success('Created'); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (p: Pipeline) => {
    if (p.is_default) return toast.error('Cannot delete the default pipeline');
    if (!window.confirm(`Delete pipeline "${p.name}"? This action cannot be undone.`)) return;
    setBusy((b) => ({ ...b, [p.id + '_del']: true }));
    try {
      await crmPipelines.remove(p.id);
      toast.success('Pipeline deleted');
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    } finally {
      setBusy((b) => ({ ...b, [p.id + '_del']: false }));
    }
  };

  const handleDeactivate = async (p: Pipeline) => {
    if (!window.confirm(`Deactivate pipeline "${p.name}"? It will be hidden from the pipeline switcher.`)) return;
    setBusy((b) => ({ ...b, [p.id + '_deact']: true }));
    try {
      await crmPipelines.update(p.id, { is_active: false } as any);
      toast.success('Pipeline deactivated');
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Deactivate failed');
    } finally {
      setBusy((b) => ({ ...b, [p.id + '_deact']: false }));
    }
  };

  const handleSetDefault = async (p: Pipeline) => {
    if (p.is_default) return;
    try {
      await crmPipelines.update(p.id, { is_default: true } as any);
      toast.success(`"${p.name}" set as default`);
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    }
  };

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          placeholder="New pipeline name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          style={{ flex: 1, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}
        />
        <button onClick={create} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Add</button>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No pipelines yet.</div>}
          {items.map((p) => (
            <div key={p.id} style={{ padding: '10px 12px', background: 'var(--s3)', borderRadius: 8, fontSize: 13, color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                {p.is_default && <span style={{ fontSize: 10, color: '#10b981', textTransform: 'uppercase', fontWeight: 700, background: 'rgba(16,185,129,0.12)', padding: '2px 7px', borderRadius: 4 }}>Default</span>}
                {(p as any).is_active === false && <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, background: 'var(--s2)', padding: '2px 7px', borderRadius: 4 }}>Inactive</span>}
                <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>{(p.stages?.length || 0)} stages</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {!p.is_default && (
                  <button
                    onClick={() => handleSetDefault(p)}
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
                  >
                    Set default
                  </button>
                )}
                <button
                  onClick={() => handleDeactivate(p)}
                  disabled={!!busy[p.id + '_deact']}
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', opacity: busy[p.id + '_deact'] ? 0.6 : 1 }}
                >
                  {busy[p.id + '_deact'] ? '...' : 'Deactivate'}
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  disabled={!!busy[p.id + '_del'] || p.is_default}
                  style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: p.is_default ? 'not-allowed' : 'pointer', opacity: (busy[p.id + '_del'] || p.is_default) ? 0.4 : 1 }}
                >
                  {busy[p.id + '_del'] ? '...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
