'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmDeals, crmLeads } from '../../lib/crmApi';
import type { Deal, Stage } from '../../types/crm';
import { useAuth } from '../../hooks/useAuth';
import { isTataTiscanActive } from '../../lib/clientFeatures';
import ProductLinesSection, { PRODUCT_LINE_KEYS } from './ProductLinesSection';
import CustomFieldsSection from './CustomFieldsSection';
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
  // Products of Interest is bespoke to the steel-dealer tenants (Tata / BMW),
  // captured on the lead + carried onto the deal at convert. The editor now
  // edits the DEAL's OWN basket, so it renders even for deals with no linked
  // lead (e.g. an additional deal created straight from the deal form).
  const showProducts = isTataTiscanActive(user as any);

  const [form, setForm] = useState(() => seed(deal));
  // Admin-defined custom fields (entity=deal) — seeded from the deal's
  // existing custom_fields so reps can edit values after creation. The
  // whole map (including bespoke keys like closed_quantities) rides along;
  // the backend PATCH merges custom_fields server-side so this is safe.
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(() => seedCustomFields(deal));
  const [busy, setBusy] = useState(false);
  // The deal's OWN basket (custom_fields.product_lines + the legacy mirror
  // keys) — what the Products editor binds to. Kept separate from
  // `customFields` so a lead-seeded fallback (below) can't leak into the
  // PATCH unless the rep actually edits the rows.
  const [linesCf, setLinesCf] = useState<Record<string, unknown>>(() => seedBasket(deal.custom_fields));
  const [linesDirty, setLinesDirty] = useState(false);
  // The linked lead's custom_fields — still fetched so the edited basket can
  // be mirrored back onto the lead (the SRS report + deal-detail Products
  // card read the lead's basket) and so legacy deals that predate the
  // deal-side copy can seed the editor from the lead.
  const [leadCf, setLeadCf] = useState<Record<string, unknown>>({});
  const [leadLoading, setLeadLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(seed(deal));
      setCustomFields(seedCustomFields(deal));
      setLinesCf(seedBasket(deal.custom_fields));
      setLinesDirty(false);
    }
  }, [open, deal]);

  // Load the linked lead's basket when the modal opens for a linked deal.
  useEffect(() => {
    if (!open || !showProducts || !deal.lead_id) return;
    let cancelled = false;
    setLeadLoading(true);
    crmLeads.get(deal.lead_id)
      .then((r) => {
        if (cancelled) return;
        const cf = ((r.data as { custom_fields?: Record<string, unknown> | null })?.custom_fields ?? {}) as Record<string, unknown>;
        setLeadCf({ ...cf });
        // Legacy fallback: deals converted before product_lines were stamped
        // on the deal row have an empty deal basket — seed the editor from
        // the lead's basket (not marked dirty) so the rep still sees the
        // captured products instead of a blank row.
        setLinesCf((cur) => (hasBasket(cur) ? cur : seedBasket(cf)));
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
      // Edited basket → the deal's OWN custom_fields: product_lines (+ the
      // legacy mirror keys the section maintains) plus the recomputed
      // volume_kg cache. Only rides along when the rep touched the rows so
      // an unrelated edit can't clobber a stamped volume_kg. Note: the deal
      // `amount` is deliberately NOT derived from these lines — it stays
      // whatever the rep typed in the Amount field.
      const basket: Record<string, unknown> = (showProducts && linesDirty)
        ? { ...linesCf, volume_kg: computeVolumeKg(linesCf.product_lines) }
        : {};
      const r = await crmDeals.update(deal.id, {
        name: form.name,
        amount: form.amount ? Number(form.amount) : 0,
        stage_id: form.stage_id,
        probability: form.probability ? Number(form.probability) / 100 : null,
        expected_close_date: form.expected_close_date || null,
        // Basket + follow-up keys win over any stale copies in the edited
        // map so clearing a follow-up still sends the nulls.
        custom_fields: { ...customFields, ...basket, ...followUp },
      } as unknown as Partial<Deal>);
      // Mirror the corrected basket back onto the linked lead (only if the
      // rep actually touched it) so the deal-detail Products card + SRS
      // report pick it up on reload. Skipped for lead-less deals.
      if (showProducts && linesDirty && deal.lead_id) {
        await crmLeads.update(deal.lead_id, { custom_fields: { ...leadCf, ...linesCf } } as never);
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

      {/* Admin-defined custom fields (e.g. dealer, site type) render
          type-aware — same pattern as LeadEditModal. Was previously absent
          from the deal edit modal entirely so reps couldn't change
          custom-field values after creation. */}
      <div style={{ marginTop: 14 }}>
        <Grid>
          <CustomFieldsSection
            entity="deal"
            values={customFields}
            onChange={setCustomFields}
          />
        </Grid>
      </div>

      {/* Products of Interest — steel-dealer tenants only. Edits the DEAL's
          own basket (custom_fields.product_lines); on save the same lines
          are mirrored back to the linked lead, when one exists. */}
      {showProducts && (
        <div style={{ marginTop: 16 }}>
          {leadLoading
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading products…</div>
            : <ProductLinesSection values={linesCf} onChange={(cf) => { setLinesCf(cf); setLinesDirty(true); }} />}
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

// Copy of the deal's custom_fields map (exclude nothing) so edits don't
// mutate the prop object. Backend merge semantics make partials safe.
function seedCustomFields(d: Deal): Record<string, unknown> {
  return (d.custom_fields && typeof d.custom_fields === 'object')
    ? { ...(d.custom_fields as Record<string, unknown>) }
    : {};
}

// The keys ProductLinesSection reads/writes: the product_lines array plus
// the four legacy single-field mirrors it keeps in sync for old readers.
const BASKET_KEYS = ['product_lines', ...PRODUCT_LINE_KEYS] as const;

// Just the basket slice of a custom_fields map — what the Products editor
// binds to, so the rest of the deal's cf can't be touched by row edits.
function seedBasket(cf: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const src = (cf && typeof cf === 'object') ? cf : {};
  const out: Record<string, unknown> = {};
  for (const k of BASKET_KEYS) {
    if (src[k] !== undefined) out[k] = src[k];
  }
  return out;
}

// True when the map already carries a usable basket — a non-empty
// product_lines array or the legacy single-product keys.
function hasBasket(cf: Record<string, unknown>): boolean {
  const lines = cf.product_lines;
  if (Array.isArray(lines) && lines.some((l) => !!(l as { product_id?: unknown })?.product_id)) return true;
  return cf.product_interested != null || cf.quantity != null;
}

// Cached tonnage for the deal row: sum(quantity × unit factor) across the
// lines, where tonne → 1000 kg and anything else counts as kg. Rounded to
// 2dp — same convention the convert flow and the detail-page hero use.
function computeVolumeKg(lines: unknown): number {
  if (!Array.isArray(lines)) return 0;
  let kg = 0;
  for (const l of lines as Array<Record<string, unknown>>) {
    const qty = typeof l?.quantity === 'number' ? l.quantity : Number(l?.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const unit = String(l?.measuring_unit ?? '').trim().toLowerCase();
    kg += qty * (unit === 'tonne' ? 1000 : 1);
  }
  return Math.round(kg * 100) / 100;
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
