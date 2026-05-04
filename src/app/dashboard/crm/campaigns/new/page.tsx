'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmCampaigns } from '../../../../../lib/crmApi';

export default function NewCampaignPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', type: '', budget: '', start_date: '', end_date: '', target_audience: '' });
  const [busy, setBusy] = useState(false);
  const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await crmCampaigns.create({ name: form.name, type: form.type || null, budget: form.budget ? Number(form.budget) : null, start_date: form.start_date || null, end_date: form.end_date || null, target_audience: form.target_audience || null, status: 'draft' as const });
      toast.success('Campaign created');
      router.push(`/dashboard/crm/campaigns/${r.data.id}`);
    } catch (err: any) { toast.error(err.message || 'Failed'); setBusy(false); }
  };
  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 720 }}>
      <h2 style={{ marginTop: 0, color: 'var(--text)' }}>New Campaign</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <input placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={input} />
        <input placeholder="Type (e.g. webinar, ads)" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={input} />
        <input placeholder="Budget" type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} style={input} />
        <input placeholder="Target audience" value={form.target_audience} onChange={(e) => setForm({ ...form, target_audience: e.target.value })} style={input} />
        <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={input} />
        <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={input} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
        <button type="submit" disabled={busy} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>{busy ? '...' : 'Create'}</button>
      </div>
    </form>
  );
}
