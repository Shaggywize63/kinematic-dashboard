'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmDeals, crmSettings, crmPipelines, crmAccounts, crmContacts } from '../../lib/crmApi';
import type { Deal, Stage, Pipeline, Account, Contact } from '../../types/crm';
import CustomFieldsSection from './CustomFieldsSection';
import ProductLinesSection from './ProductLinesSection';
import Modal from './shared/Modal';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../lib/crmFieldOverrides';
import { useAuth } from '../../hooks/useAuth';
import { isHorizonOrg } from '../../lib/crmFeatureGates';
import { isTataTiscanActive } from '../../lib/clientFeatures';

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
  const [form, setForm] = useState(() => seed(deal));
  // Admin-defined custom fields (entity=deal) — seeded from the deal's
  // existing custom_fields so reps can edit values after creation. The
  // whole map (including bespoke keys like closed_quantities) rides along;
  // the backend PATCH merges custom_fields server-side so this is safe.
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(() => seedCustomFields(deal));
  const [busy, setBusy] = useState(false);
  // Built-in field overrides (hide / relabel / require) for deal columns,
  // configured under Settings → Custom Fields. Deals aren't B2B/B2C-scoped.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  const fields = useMemo(() => buildFieldHelpers(fieldOverrides, 'deal'), [fieldOverrides]);

  const { user } = useAuth();
  // Account + primary-contact pickers are Horizon-only — parity with the deal
  // CREATE form, which only exposes them for that org. Other tenants keep the
  // legacy unlinked deal flow.
  const showLinks = isHorizonOrg(user?.org_id);
  // Steel-dealer tenants (Tata/SRS + BMW) build the deal from a multi-product
  // basket. On save the backend re-sizes the deal `amount` from the basket
  // total (custom_fields.estimated_amount) — the rep never types the amount.
  const steelDealer = isTataTiscanActive(user as never);
  // Products are locked once the deal is CLOSED (the backend strips
  // custom_fields.product_lines from won/lost PATCHes), so the basket editor
  // only renders while the deal is still open.
  const dealClosed = deal.status === 'won' || deal.status === 'lost';
  // Pipeline options + the Horizon account/contact lists. Loaded when the
  // modal opens so the Stage options can follow the selected pipeline.
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    if (open) {
      setForm(seed(deal));
      setCustomFields(seedCustomFields(deal));
    }
  }, [open, deal]);

  // Load the override map once the modal opens. Kept separate from the
  // seed effect so re-opening for a different deal doesn't refetch.
  useEffect(() => {
    if (!open) return;
    crmSettings.get()
      .then((s) => setFieldOverrides(extractFieldOverrides(s.data)))
      .catch(() => { /* keep defaults — every field renders */ });
  }, [open]);

  // Load all pipelines when the modal opens so the rep can move the deal
  // between pipelines; the Stage dropdown re-derives its options from the
  // chosen pipeline (each pipeline carries its stages nested in the list).
  useEffect(() => {
    if (!open) return;
    crmPipelines.list()
      .then((r) => setPipelines(r.data || []))
      .catch(() => setPipelines([]));
  }, [open]);

  // Horizon-only: accounts for the Account picker.
  useEffect(() => {
    if (!open || !showLinks) { setAccounts([]); return; }
    crmAccounts.list({ limit: 500 })
      .then((r) => setAccounts(r.data || []))
      .catch(() => setAccounts([]));
  }, [open, showLinks]);

  // Contacts follow the chosen account (server-side account_id filter) —
  // mirrors the create form so the primary-contact list stays scoped.
  useEffect(() => {
    if (!open || !showLinks || !form.account_id) { setContacts([]); return; }
    crmContacts.list({ account_id: form.account_id, limit: 500 })
      .then((r) => setContacts(r.data || []))
      .catch(() => setContacts([]));
  }, [open, showLinks, form.account_id]);

  // Stage options follow the selected pipeline once the pipeline list has
  // loaded; until then fall back to the `stages` prop (the deal's current
  // pipeline) so the dropdown is never empty. This also fixes the deals-list
  // case where the prop is empty under the "All pipelines" filter.
  const currentPipeline = pipelines.find((p) => p.id === form.pipeline_id);
  const stageOptions: Stage[] = currentPipeline?.stages ?? stages;
  const singlePipeline = pipelines.length === 1;

  // Switching pipeline resets the stage to the new pipeline's first OPEN
  // stage (falling back to its first stage) — the same landing rule the
  // "Move pipeline" modal uses.
  const onPipelineChange = (pid: string) => {
    const p = pipelines.find((x) => x.id === pid);
    const ordered = (p?.stages ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const firstOpen = ordered.find((s) => (s as { stage_type?: string }).stage_type === 'open');
    setForm((f) => ({ ...f, pipeline_id: pid, stage_id: firstOpen?.id ?? ordered[0]?.id ?? '' }));
  };

  const submit = async () => {
    if (fields.requiredFor('name', true) && !form.name.trim()) { toast.error('Deal name is required'); return; }
    setBusy(true);
    try {
      // Follow-up → deal.custom_fields { next_action_type, next_action_at }.
      // The backend spawns a planned reminder when this changes. Send nulls
      // when cleared so the rep can remove a follow-up.
      const followUp: Record<string, unknown> = (form.nextActionType && form.nextActionAt)
        ? { next_action_type: form.nextActionType, next_action_at: form.nextActionAt }
        : { next_action_type: null, next_action_at: null };
      // Price lock: the top-level `amount` is NOT sent — a deal's value is
      // never typed directly (the backend strips top-level amount from every
      // PATCH). For an OPEN steel deal the value instead follows the products
      // basket: the backend re-sizes amount from custom_fields.estimated_amount
      // when product_lines change. For a CLOSED deal the backend strips
      // product_lines/volume_kg, so the basket editor isn't shown above.
      const r = await crmDeals.update(deal.id, {
        name: form.name,
        // Pipeline + stage travel together so the deal lands on a stage that
        // belongs to the chosen pipeline.
        pipeline_id: form.pipeline_id || undefined,
        stage_id: form.stage_id || undefined,
        probability: form.probability ? Number(form.probability) / 100 : null,
        expected_close_date: form.expected_close_date || null,
        // Account / primary contact — Horizon only. `null` clears the link
        // (the schema is uuid-or-null); other tenants omit them entirely.
        account_id: showLinks ? (form.account_id || null) : undefined,
        primary_contact_id: showLinks ? (form.primary_contact_id || null) : undefined,
        // Follow-up keys win over any stale copies in the edited map so
        // clearing a follow-up still sends the nulls. The products basket
        // (product_lines) rides in this same custom_fields map.
        custom_fields: { ...customFields, ...followUp },
      } as unknown as Partial<Deal>);
      toast.success('Deal updated'); onSaved(r.data); onClose();
    } catch (e: any) { toast.error(e.message || 'Update failed'); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Deal"
      footer={<><button type="button" onClick={onClose} style={btn.secondary}>Cancel</button><button type="button" disabled={busy} onClick={submit} style={btn.primary(busy)}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
      <Grid>
        {!fields.isHidden('name') && <F label={fields.labelFor('name', 'Name') + (fields.requiredFor('name', true) ? ' *' : '')} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />}
        {/* Amount is never typed directly. On a closed deal it's fixed at
            creation; on an open steel deal it follows the products basket
            below (the backend re-sizes it from the basket total on save). */}
        {!fields.isHidden('amount') && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={lbl}>{fields.labelFor('amount', 'Amount (₹)')}{steelDealer && !dealClosed ? ' — follows the products basket' : ' — fixed at creation'}</span>
            <input type="text" value={form.amount ? `₹${Number(form.amount).toLocaleString('en-IN')}` : '—'} readOnly disabled style={{ ...inp, opacity: 0.65, cursor: 'not-allowed' }} />
          </label>
        )}
        {/* Pipeline — changing it re-derives the Stage options and lands the
            deal on the new pipeline's first open stage. Rendered once the
            pipeline list has loaded (single-pipeline clients see a static
            label, matching the create form). */}
        {!fields.isHidden('pipeline_id') && pipelines.length > 0 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={lbl}>{fields.labelFor('pipeline_id', 'Pipeline')}</span>
            {singlePipeline ? (
              <div style={{ ...inp, display: 'flex', alignItems: 'center', gap: 6 }}>
                {currentPipeline?.name || 'Default pipeline'}
                <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600 }}>· default</span>
              </div>
            ) : (
              <select value={form.pipeline_id} onChange={(e) => onPipelineChange(e.target.value)} style={inp}>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (default)' : ''}</option>)}
              </select>
            )}
          </label>
        )}
        {!fields.isHidden('stage_id') && <SF label={fields.labelFor('stage_id', 'Stage')} value={form.stage_id} options={[{ value: '', label: '—' }, ...stageOptions.map((s) => ({ value: s.id, label: s.name }))]} onChange={(v) => setForm({ ...form, stage_id: v })} />}
        {!fields.isHidden('probability') && <F label={fields.labelFor('probability', 'Probability (%)')} type="number" value={form.probability} onChange={(v) => setForm({ ...form, probability: v })} />}
        {!fields.isHidden('expected_close_date') && <F label={fields.labelFor('expected_close_date', 'Expected Close')} type="date" value={form.expected_close_date} onChange={(v) => setForm({ ...form, expected_close_date: v })} />}
        {/* Account + primary contact — Horizon only, gated identically to the
            create form. Contacts are scoped to the chosen account. */}
        {showLinks && !fields.isHidden('account_id') && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={lbl}>{fields.labelFor('account_id', 'Account')}</span>
            <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value, primary_contact_id: '' })} style={inp}>
              <option value="">— No account —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}
        {showLinks && !fields.isHidden('primary_contact_id') && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={lbl}>{fields.labelFor('primary_contact_id', 'Primary Contact')}</span>
            <select value={form.primary_contact_id} onChange={(e) => setForm({ ...form, primary_contact_id: e.target.value })} style={inp} disabled={!form.account_id}>
              <option value="">{form.account_id ? '— No primary contact —' : 'Pick account first'}</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unnamed'}</option>)}
            </select>
          </label>
        )}
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

      {/* Steel-dealer multi-product basket — parity with the create form.
          Writes product_lines (+ the legacy single-field mirrors + basket
          total on estimated_amount) into the same customFields map the PATCH
          persists. On an OPEN deal the backend re-sizes the deal amount from
          that total; hidden once the deal is closed (products are then
          locked and stripped server-side). */}
      {steelDealer && !dealClosed && (
        <div style={{ marginTop: 14 }}>
          <ProductLinesSection values={customFields} onChange={setCustomFields} />
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

function seed(d: Deal) {
  const cf = ((d as Deal & { custom_fields?: Record<string, unknown> | null }).custom_fields ?? {}) as Record<string, unknown>;
  const naType = typeof cf.next_action_type === 'string' ? cf.next_action_type : '';
  const naAt = typeof cf.next_action_at === 'string' ? cf.next_action_at.slice(0, 10) : '';
  return {
    name: d.name || '',
    amount: d.amount ? String(d.amount) : '',
    pipeline_id: d.pipeline_id || '',
    stage_id: d.stage_id || '',
    account_id: d.account_id || '',
    primary_contact_id: d.primary_contact_id || '',
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
