'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmEmailTemplates } from '../../../../../../lib/crmApi';
import type { EmailTemplate } from '../../../../../../types/crm';

export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [t, setT] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    crmEmailTemplates.get(id).then((r) => setT(r.data)).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    if (!t) return;
    setBusy(true);
    try { await crmEmailTemplates.update(t.id, { name: t.name, subject: t.subject, body_html: t.body_html, category: t.category }); toast.success('Saved'); }
    catch (e: any) { toast.error(e.message || 'Save failed'); } finally { setBusy(false); }
  };

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;
  if (!t) return <div style={{ color: 'var(--text-dim)' }}>Template not found.</div>;
  const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 760 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} style={input} />
        <input value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} style={input} />
        <textarea rows={14} value={t.body_html} onChange={(e) => setT({ ...t, body_html: e.target.value })} style={{ ...input, fontFamily: 'monospace' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button onClick={save} disabled={busy} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>{busy ? '...' : 'Save'}</button>
      </div>
    </div>
  );
}
