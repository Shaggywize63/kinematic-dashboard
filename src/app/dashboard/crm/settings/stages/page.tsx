'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmStages } from '../../../../../lib/crmApi';
import type { Stage } from '../../../../../types/crm';

export default function StagesSettings() {
  const [items, setItems] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { crmStages.list().then((r) => setItems(r.data || [])).catch((e) => toast.error(e.message)).finally(() => setLoading(false)); }, []);
  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((s) => (
          <div key={s.id} style={{ padding: 10, background: 'var(--s3)', borderRadius: 8, fontSize: 13, color: 'var(--text)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{s.position}. {s.name}</span>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{Math.round(s.default_probability * 100)}% · {s.is_won ? 'won' : s.is_lost ? 'lost' : 'open'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
