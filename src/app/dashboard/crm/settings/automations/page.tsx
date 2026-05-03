'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAutomations } from '../../../../../lib/crmApi';
import type { Automation } from '../../../../../types/crm';

export default function AutomationsPage() {
  const [items, setItems] = useState<Automation[]>([]);
  useEffect(() => { crmAutomations.list().then((r) => setItems(r.data || [])).catch((e) => toast.error(e.message)); }, []);
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      {items.length === 0 ? <div style={{ color: 'var(--text-dim)' }}>No automations configured. Use the API to define triggers and actions.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((a) => (
            <div key={a.id} style={{ padding: 10, background: 'var(--s3)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>{a.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Trigger: {a.trigger} · {a.is_active ? 'Active' : 'Paused'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
