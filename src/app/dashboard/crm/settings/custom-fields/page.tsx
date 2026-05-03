'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmCustomFields } from '../../../../../lib/crmApi';
import type { CustomField } from '../../../../../types/crm';

export default function CustomFieldsPage() {
  const [items, setItems] = useState<CustomField[]>([]);
  useEffect(() => { crmCustomFields.list().then((r) => setItems(r.data || [])).catch((e) => toast.error(e.message)); }, []);
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      {items.length === 0 ? <div style={{ color: 'var(--text-dim)' }}>No custom fields configured.</div> : (
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Entity</th><th style={th}>Key</th><th style={th}>Label</th><th style={th}>Type</th></tr></thead>
          <tbody>{items.map((c) => (<tr key={c.id}><td style={td}>{c.entity}</td><td style={td}>{c.field_key}</td><td style={td}>{c.label}</td><td style={td}>{c.field_type}</td></tr>))}</tbody>
        </table>
      )}
    </div>
  );
}
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)' };
