'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmDeals } from '../../lib/crmApi';
import type { Deal, Stage } from '../../types/crm';
import Modal from './shared/Modal';

interface Props {
  deal: Deal;
  stages: Stage[];
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Deal) => void;
}

export default function DealEditModal({ deal, stages, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState(() => seed(deal));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm(seed(deal)); }, [open, deal]);

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Deal name is required'); return; }
    setBusy(true);
    try {
      const r = await crmDeals.update(deal.id, {
        name: form.name,
        amount: form.amount ? Number(form.amount) : 0,
        stage_id: form.stage_id,
        probability: form.probability ? Number(form.probability) / 100 : null,
        expected_close_date: form.expected_close_date || null,
        next_action: form.next_action || null,
      });
      toast.success('Deal updated');
      onSaved(r.data);
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Deal"
      footer={<>
        <button type="button" onClick={onClose} style={btn.secondary}>Cancel</button>
        <button type="button" disabled={busy} onClick={submit} style={btn.primary(busy)}>{busy ? 'Saving…' : 'Save changes'}</button>
      </>}
    >
      <Grid>
        <Field label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="Amount (₹)" type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
        <SelectField label="Stage" value={form.stage_id}
          options={[{ value: '', label: '—' }, ...stages.map((s) => ({ value: s.id, label: s.name }))]}
          onChange={(v) => setForm({ ...form, stage_id: v })} />
        <Field label="Probability (%)" type="number" value={form.probability} onChange={(v) => setForm({ ...form, probability: v })} />
        <Field label="Expected Close" type="date" value={form.expected_close_date} onChange={(v) => setForm({ ...form, expected_close_date: v })} />
      </Grid>
      <div style={{ marginTop: 14 }}>
        <span style={lbl}>Next Action</span>
        <input value={form.next_action} onChange={(e) => setForm({ ...form, next_action: e.target.value })}
          style={{ ...input, width: '100%', marginTop: 4 }} />
      </div>
    </Modal>
  );
}

function seed(d: Deal) {
  return {
    name: d.name || '',
    amount: d.amount ? String(d.amount) : '',
    stage_id: d.stage_id || '',
    probability: d.probability != null ? String(Math.round(d.probability * 100)) : '',
    expected_close_date: d.expected_close_date ? d.expected_close_date.slice(0, 10) : '',
    next_action: d.next_action || '',
  };
}

function Grid({ children }: { children: React.ReactNode }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{children}</div>; }
function Field(p: { label: string; value: string; onChange: (v: string) => void; type?: string }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lbl}>{p.label}</span><input type={p.type || 'text'} value={p.value} onChange={(e) => p.onChange(e.target.value)} style={input} /></label>; }
function SelectField(p: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lbl}>{p.label}</span><select value={p.value} onChange={(e) => p.onChange(e.target.value)} style={input}>{p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btn = {
  secondary: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  primary: (busy: boolean): React.CSSProperties => ({ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13, opacity: busy ? 0.7 : 1 }),
};
