'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmEmailTemplates } from '../../../../../lib/crmApi';
import type { EmailTemplate } from '../../../../../types/crm';

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    crmEmailTemplates.list().then((r) => setTemplates(r.data || [])).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ color: 'var(--text)' }}>Email Templates</h3>
        <Link href="/dashboard/crm/emails/templates/new" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ New Template</Link>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {templates.map((t) => (
            <Link key={t.id} href={`/dashboard/crm/emails/templates/${t.id}`} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{t.subject}</div>
              {t.category && <div style={{ marginTop: 8, fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', fontWeight: 700 }}>{t.category}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
