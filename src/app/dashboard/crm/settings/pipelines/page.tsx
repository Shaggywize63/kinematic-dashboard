'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmPipelines } from '../../../../../lib/crmApi';
import type { Pipeline } from '../../../../../types/crm';

export default function PipelinesSettings() {
  const [items, setItems] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const reload = async () => { try { const r = await crmPipelines.list(); setItems(r.data || []); } catch (e: any) { toast.error(e.message); } finally { setLoading(false); } };
  useEffect(() => { reload(); }, []);
  const create = async () => { if (!name.trim()) return; try { await crmPipelines.create({ name, is_default: false } as any); setName(''); reload(); toast.success('Created'); } catch (e: any) { toast.error(e.message); } };
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input placeholder="New pipeline name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }} />
        <button onClick={create} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Add</button>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((p) => (
            <div key={p.id} style={{ padding: 10, background: 'var(--s3)', borderRadius: 8, fontSize: 13, color: 'var(--text)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{p.name}{p.is_default && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--green)', textTransform: 'uppercase', fontWeight: 700 }}>Default</span>}</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{(p.stages?.length || 0)} stages</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
