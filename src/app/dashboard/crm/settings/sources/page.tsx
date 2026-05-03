'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmLeadSources } from '../../../../../lib/crmApi';
import type { LeadSource } from '../../../../../types/crm';

export default function SourcesSettings() {
  const [items, setItems] = useState<LeadSource[]>([]);
  const [name, setName] = useState('');
  const reload = () => crmLeadSources.list().then((r) => setItems(r.data || []));
  useEffect(() => { reload(); }, []);
  const create = async () => { if (!name) return; try { await crmLeadSources.create({ name, is_active: true } as any); setName(''); reload(); toast.success('Added'); } catch (e: any) { toast.error(e.message); } };
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New source name" style={{ flex: 1, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }} />
        <button onClick={create} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Add</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((s) => <div key={s.id} style={{ padding: 8, background: 'var(--s3)', borderRadius: 8, fontSize: 13, color: 'var(--text)' }}>{s.name}</div>)}
      </div>
    </div>
  );
}
