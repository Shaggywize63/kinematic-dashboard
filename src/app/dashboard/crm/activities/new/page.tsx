'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmActivities } from '../../../../../lib/crmApi';

export default function NewActivityPage() {
  const router = useRouter();
  const [form, setForm] = useState({ type: 'call' as 'call' | 'email' | 'meeting' | 'task' | 'note', subject: '', body: '', due_at: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await crmActivities.create(form); toast.success('Activity logged'); router.push('/dashboard/crm/activities'); }
    catch (err: any) { toast.error(err.message || 'Failed'); setBusy(false); }
  };

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 640 }}>
      <h2 style={{ marginTop: 0, color: 'var(--text)' }}>Log Activity</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Type"><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })} style={input}><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="task">Task</option><option value="note">Note</option></select></Field>
        <Field label="Subject"><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required style={input} /></Field>
        <Field label="Notes"><textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} style={{ ...input, fontFamily: 'inherit' }} /></Field>
        <Field label="Due At"><input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} style={input} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={btnGhost}>Cancel</button>
        <button type="submit" disabled={busy} style={btnPrimary}>{busy ? '...' : 'Save'}</button>
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
