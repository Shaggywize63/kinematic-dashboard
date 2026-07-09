'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmDeals, crmLeads } from '../../lib/crmApi';
import type { Deal, Stage } from '../../types/crm';
import { useAuth } from '../../hooks/useAuth';
import { isTataTiscanActive } from '../../lib/clientFeatures';
import ProductLinesSection from './ProductLinesSection';
import Modal from './shared/Modal';

interface Props { deal: Deal; stages: Stage[]; open: boolean; onClose: () => void; onSaved: (updated: Deal) => void; }

// Fixed follow-up action set (same slugs the iOS / Android deal-edit pickers
// use and the backend maps to a friendly subject). Picking one + a due date
// spawns a planned crm_activities reminder tied to the deal — replacing the
// old free-text "Next Action" field, which never persisted (no column) and
// wasn't actionable.
const NEXT_ACTIONS: Array<{ slug: string; label: string }> = [
  { slug: 'call', label: 'Call' },
  { slug: 'whatsapp', label: 'WhatsApp' },
  { slug: 'meeting', label: 'Meeting' },
  { slug: 'site_visit', label: 'Site Visit' },
  { slug: 'email', label: 'Email' },
  { slug: 'follow_up', label: 'Follow-up' },
];

export default function DealEditModal({ deal, stages, open, onClose, onSaved }: Props) {
  const { user } = useAuth();
  // Products of Interest is bespoke to the Tata / Kaiyo tenant, captured on
  // the lead + carried into the deal at convert. Only that tenant sees the
  // basket editor here (to fix a mis-entered product post-conversion).
  const showProducts = isTataTiscanActive(user as any) && !!deal.lead_id;

  const [form, setForm] = useState(() => seed(deal));
  const [busy, setBusy] = useState(false);
  // The linked lead's custom_fields — the source of truth the deal-detail
  // Products card, deal sizing, and the SRS report all read. We edit it here
  // so a correction propagates everywhere without a second write path.
  const [leadCf, setLeadCf] = useState<Record<string, unknown>>({});
  const [leadDirty, setLeadDirty] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);

  useEffect(() => { if (open) { setForm(seed(deal)); setLeadDirty(false); } }, [open, deal]);

  // Load the linked lead's basket when the modal opens for a Tata deal.
  useEffect(() => {
    if (!open || !showProducts || !deal.lead_id) return;
    let cancelled = false;
    setLeadLoading(true);
    crmLeads.get(deal.lead_id)
      .then((r) => {
        if (cancelled) return;
        const cf = ((r.data as { custom_fields?: Record<string, unknown> | null })?.custom_fields ?? {}) as Record<string, unknown>;
        setLeadCf({ ...cf });
      })
      .catch(() => { if (!cancelled) toast.error('Could not load the linked lead’s products'); })
      .finally(() => { if (!cancelled) setLeadLoading(false); });
    return () => { cancelled = true; };
  }, [open, showProducts, deal.lead_id]);

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Deal name is required'); return; }
    setBusy(true);
    try {
      // Follow-up → deal.custom_fields { next_action_type, next_action_at }.
      // The backend spawns a planned reminder when this changes. Send nulls
      // when cleared so the rep can remove a follow-up.
      const followUp: Record<string, unknown> = (form.nextActionType && form.nextActionAt)
        ? { next_action_type: form.nextActionType, next_action_at: form.nextActionAt }
        : { next_action_type: null, next_action_at: null };
      const r = await crmDeals.update(deal.id, {
        name: form.name,
        amount: form.amount ? Number(form.amount) : 0,
        stage_id: form.stage_id,
        probability: form.probability ? Number(form.probability) / 100 : null,
        expected_close_date: form.expected_close_date || null,
        custom_fields: followUp,
      } as unknown as Partial<Deal>);
      // Persist the corrected basket back onto the linked lead (only if the
      // rep actually touched it) so the deal-detail Products card + report
      // pick it up on reload.
      if (showProducts && leadDirty && deal.lead_id) {
        await crmLeads.update(deal.lead_id, { custom_fields: leadCf } as never);
      }
      toast.success('Deal updated'); onSaved(r.data); onClose();
    } catch (e: any) { toast.error(e.message || 'Update failed'); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Deal"
      footer={<><button type="button" onClick={onClose} style={btn.secondary}>Cancel</button><button type="button" disabled={busy} onClick={submit} style={btn.primary(busy)}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
      <Grid>
        <F label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <F label="Amount (₹)" type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
        <SF label="Stage" value={form.stage_id} options={[{ value: '', label: '—' }, ...stages.map((s) => ({ value: s.id, label: s.name }))]} onChange={(v) => setForm({ ...form, stage_id: v })} />
        <F label="Probability (%)" type="number" value={form.probability} onChange={(v) => setForm({ ...form, probability: v })} />
        <F label="Expected Close" type="date" value={form.expected_close_date} onChange={(v) => setForm({ ...form, expected_close_date: v })} />
      </Grid>

      {/* Products of Interest — Tata/Kaiyo only. Edits the linked lead's
          basket so a mis-entered product can be corrected after the deal
          was created. */}
      {showProducts && (
        <div style={{ marginTop: 16 }}>
          {leadLoading
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading products…</div>
            : <ProductLinesSection values={leadCf} onChange={(cf) => { setLeadCf(cf); setLeadDirty(true); }} />}
        </div>
      )}

      {/* Next Action → scheduled follow-up (action type + due date). On save
          the backend creates a planned activity so it becomes an actionable
          reminder, not a note that goes nowhere. */}
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={lbl}>Next Action</span>
          <select value={form.nextActionType} onChange={(e) => setForm({ ...form, nextActionType: e.target.value })} style={inp}>
            <option value="">— None —</option>
            {NEXT_ACTIONS.map((a) => <option key={a.slug} value={a.slug}>{a.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={lbl}>Due date</span>
          <input
            type="date"
            value={form.nextActionAt}
            onChange={(e) => setForm({ ...form, nextActionAt: e.target.value })}
            disabled={!form.nextActionType}
            style={{ ...inp, opacity: form.nextActionType ? 1 : 0.5 }}
          />
        </label>
      </div>
      {form.nextActionType && !form.nextActionAt && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>Pick a due date to schedule this follow-up as a reminder.</div>
      )}
    </Modal>
  );
}

function seed(d: Deal) {
  const cf = ((d as Deal & { custom_fields?: Record<string, unknown> | null }).custom_fields ?? {}) as Record<string, unknown>;
  const naType = typeof cf.next_action_type === 'string' ? cf.next_action_type : '';
  const naAt = typeof cf.next_action_at === 'string' ? cf.next_action_at.slice(0, 10) : '';
  return {
    name: d.name || '',
    amount: d.amount ? String(d.amount) : '',
    stage_id: d.stage_id || '',
    probability: d.probability != null ? String(Math.round(d.probability * 100)) : '',
    expected_close_date: d.expected_close_date ? d.expected_close_date.slice(0, 10) : '',
    nextActionType: naType,
    nextActionAt: naAt,
  };
}
function Grid({ children }: { children: React.ReactNode }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{children}</div>; }
function F(p: { label: string; value: string; onChange: (v: string) => void; type?: string }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lbl}>{p.label}</span><input type={p.type || 'text'} value={p.value} onChange={(e) => p.onChange(e.target.value)} style={inp} /></label>; }
function SF(p: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lbl}>{p.label}</span><select value={p.value} onChange={(e) => p.onChange(e.target.value)} style={inp}>{p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const inp: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btn = {
  secondary: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  primary: (busy: boolean): React.CSSProperties => ({ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13, opacity: busy ? 0.7 : 1 }),
};
