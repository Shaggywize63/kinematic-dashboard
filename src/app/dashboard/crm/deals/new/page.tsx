'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmDeals, crmPipelines } from '../../../../../lib/crmApi';
import type { Pipeline } from '../../../../../types/crm';

export default function NewDealPage() {
  const router = useRouter();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [form, setForm] = useState({ name: '', amount: '', pipeline_id: '', stage_id: '', expected_close_date: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await crmPipelines.list();
        setPipelines(r.data || []);
        const def = (r.data || []).find((p) => p.is_default) || (r.data || [])[0];
        if (def) setForm((f) => ({ ...f, pipeline_id: def.id, stage_id: def.stages?.[0]?.id || '' }));
      } catch (e: any) { toast.error(e.message || 'Failed to load pipelines'); }
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await crmDeals.create({
        name: form.name,
        amount: form.amount ? Number(form.amount) : null,
        pipeline_id: form.pipeline_id,
        stage_id: form.stage_id,
        expected_close_date: form.expected_close_date || null,
      } as any);
      toast.success('Deal created');
      router.push(`/dashboard/crm/deals/${r.data.id}`);
    } catch (err: any) { toast.error(err.message || 'Create failed'); setBusy(false); }
  };

  const currentPipeline = pipelines.find((p) => p.id === form.pipeline_id);
  const stages = currentPipeline?.stages || [];

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 720 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>New Deal</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={input} /></Field>
        <Field label="Amount"><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={input} /></Field>
        <Field label="Pipeline"><select value={form.pipeline_id} onChange={(e) => { const p = pipelines.find((pp) => pp.id === e.target.value); setForm({ ...form, pipeline_id: e.target.value, stage_id: p?.stages?.[0]?.id || '' }); }} style={input}>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Stage"><select value={form.stage_id} onChange={(e) => setForm({ ...form, stage_id: e.target.value })} style={input}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Close Date"><input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} style={input} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={btnGhost}>Cancel</button>
        <button type="submit" disabled={busy} style={btnPrimary}>{busy ? 'Saving...' : 'Create'}</button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
