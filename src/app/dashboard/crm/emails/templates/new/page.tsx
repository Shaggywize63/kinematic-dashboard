'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmEmailTemplates } from '../../../../../../lib/crmApi';

export default function NewTemplatePage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', subject: '', body_html: '', category: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { const r = await crmEmailTemplates.create(form); toast.success('Template saved'); router.push(`/dashboard/crm/emails/templates/${r.data.id}`); }
    catch (err: any) { toast.error(err.message || 'Failed'); setBusy(false); }
  };
  const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 760 }}>
      <h2 style={{ marginTop: 0, color: 'var(--text)' }}>New Template</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input placeholder="Template name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={input} />
        <input placeholder="Category (optional)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={input} />
        <input placeholder="Subject" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} style={input} />
        <textarea placeholder="Body HTML" required rows={12} value={form.body_html} onChange={(e) => setForm({ ...form, body_html: e.target.value })} style={{ ...input, fontFamily: 'monospace' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
        <button type="submit" disabled={busy} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>{busy ? '...' : 'Save'}</button>
      </div>
    </form>
  );
}
