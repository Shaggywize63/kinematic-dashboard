'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmTerritories } from '../../../../../lib/crmApi';
import type { Territory } from '../../../../../types/crm';

export default function TerritoriesPage() {
  const [items, setItems] = useState<Territory[]>([]);
  useEffect(() => { crmTerritories.list().then((r) => setItems(r.data || [])).catch((e) => toast.error(e.message)); }, []);
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      {items.length === 0 ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No territories yet.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((t) => <div key={t.id} style={{ padding: 8, background: 'var(--s3)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>{t.name}{t.parent_id && <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>(child)</span>}</div>)}
        </div>
      )}
    </div>
  );
}
