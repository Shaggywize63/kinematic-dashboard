'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmEmails, crmEmailTemplates } from '../../../../../lib/crmApi';
import type { EmailTemplate } from '../../../../../types/crm';

export default function ComposeEmailPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [form, setForm] = useState({ to_email: '', subject: '', body_html: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { crmEmailTemplates.list().then((r) => setTemplates(r.data || [])).catch(() => {}); }, []);

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (t) setForm({ ...form, subject: t.subject, body_html: t.body_html });
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await crmEmails.create(form); toast.success('Email queued'); router.push('/dashboard/crm/emails'); }
    catch (err: any) { toast.error(err.message || 'Send failed'); setBusy(false); }
  };

  return (
    <form onSubmit={send} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 760 }}>
      <h2 style={{ marginTop: 0, color: 'var(--text)' }}>Compose Email</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Template"><select onChange={(e) => applyTemplate(e.target.value)} style={input}><option value="">(none)</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="To"><input type="email" required value={form.to_email} onChange={(e) => setForm({ ...form, to_email: e.target.value })} style={input} /></Field>
        <Field label="Subject"><input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} style={input} /></Field>
        <Field label="Body (HTML)"><textarea required rows={10} value={form.body_html} onChange={(e) => setForm({ ...form, body_html: e.target.value })} style={{ ...input, fontFamily: 'monospace' }} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={btnGhost}>Cancel</button>
        <button type="submit" disabled={busy} style={btnPrimary}>{busy ? 'Sending...' : 'Send'}</button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>{children}</label>;
}
const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
