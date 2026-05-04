'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmContacts } from '../../../../../lib/crmApi';

export default function NewContactPage() {
  const router = useRouter();
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', title: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { const r = await crmContacts.create(form); toast.success('Contact created'); router.push(`/dashboard/crm/contacts/${r.data.id}`); }
    catch (err: any) { toast.error(err.message || 'Create failed'); setBusy(false); }
  };

  const fld = (k: keyof typeof form, label: string, type = 'text') => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      <input type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }} />
    </label>
  );

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 720 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>New Contact</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {fld('first_name', 'First Name')}{fld('last_name', 'Last Name')}{fld('email', 'Email', 'email')}{fld('phone', 'Phone')}{fld('title', 'Title')}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
        <button type="submit" disabled={busy} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Saving...' : 'Create'}</button>
      </div>
    </form>
  );
}
